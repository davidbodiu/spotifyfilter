#!/usr/bin/env python3
"""
Assign one primary genre to every artist; every song inherits its lead artist's genre
(R43, options compared in R42).

Source order, as the user chose:

  1. Wikidata, matched exactly on the Spotify artist ID that kworb's artist links carry
     (property P1902). Its genres (P136) are fine-grained, about 620 distinct labels
     across the top 3,000 artists, so bucket() folds each label into one of GENRES and
     primary() picks one per artist. The artist's country (P27 citizenship, P495
     origin, or the country of P740 formation place) tells a market such as Latin or
     K-Pop apart from an incidental label: Justin Bieber's single reggaeton label does
     not make him Latin, Burna Boy's Afrobeat label does make him African. Public
     domain (CC0). One query per 300 artists, seconds in total.

  2. Claude, for artists Wikidata has no usable genre or market for (about a quarter,
     mostly the long tail and new acts). It classifies from the name, top song titles
     and collaborators into the same GENRES, or "Unknown". Needs Anthropic credentials
     (ANTHROPIC_API_KEY); without them the step is skipped and those artists stay
     unclassified. A free token count runs first and the run stops at CLAUDE_MAX_USD.

State lives in genres.json, keyed by Spotify artist ID and committed, like slugs.json:
the Claude rows cost money and CI runners keep nothing between runs. Wikidata rows are
recomputed every run, so improvements to Wikidata flow in; a Claude row is replaced
only if Wikidata later gains a genre for that artist. If the Wikidata query fails, last
week's rows stand.

Standalone, no CLI arguments. Reads data.json (raw scrape) when present, else
data.json.gz, only for song titles to give Claude context.
"""

import collections
import gzip
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import date

from scrape import scrape_artists  # the exact artist list and names the scraper uses

REGISTRY = "genres.json"
RAW_INPUT = "data.json"
CLEAN_INPUT = "data.json.gz"
WIKIDATA = "https://query.wikidata.org/sparql"
USER_AGENT = "ChartRank/1.0 (https://chartrank.app)"
WIKIDATA_CHUNK = 300

# The broad groups a song can carry. Order is display order only; tie-breaking uses TIE.
GENRES = [
    "Pop", "Hip-Hop & Rap", "R&B & Soul", "Rock & Metal", "Alternative & Indie",
    "Electronic & Dance", "Country", "Latin", "Regional Mexican", "Brazilian", "K-Pop",
    "J-Pop", "South Asian", "African", "Middle Eastern", "Reggae & Dancehall",
    "Christian & Gospel", "Folk & Acoustic", "Jazz & Blues", "Classical & Soundtrack",
]

# Groups defined by a market or language rather than a sound.
MARKET = ["K-Pop", "J-Pop", "South Asian", "Regional Mexican", "Brazilian", "Latin",
          "African", "Middle Eastern"]
# Markets an artist's country alone is enough for, even without a matching label: a
# Punjabi rapper tagged only "hip-hop" is still South Asian to a listener. Not Latin or
# Brazilian, whose countries also produce plenty of global dance music (Alok, a
# Brazilian DJ, is Electronic & Dance).
ORIGIN_DECIDES = {"K-Pop", "J-Pop", "South Asian", "African", "Middle Eastern"}
# Ties: markets first, then Pop, then the rest. Pop winning ties among sound-based
# groups is what keeps Ed Sheeran and Taylor Swift out of Hip-Hop and Country.
TIE = MARKET + ["Pop", "Hip-Hop & Rap", "R&B & Soul", "Country", "Electronic & Dance",
                "Rock & Metal", "Alternative & Indie", "Reggae & Dancehall",
                "Christian & Gospel", "Folk & Acoustic", "Jazz & Blues",
                "Classical & Soundtrack"]
PRIORITY = {g: i for i, g in enumerate(TIE)}

# Labels the keyword rules below would get wrong. None means "not a genre".
OVERRIDES = {
    "dance-pop": "Pop", "electropop": "Pop", "synth-pop": "Pop", "teen pop": "Pop",
    "europop": "Pop", "art pop": "Pop", "adult contemporary music": "Pop",
    "power pop": "Pop", "bubblegum pop": "Pop", "bubblegum music": "Pop",
    "ballad": "Pop", "ballade": "Pop", "easy listening": "Pop", "post-disco": "Pop",
    "traditional pop": "Jazz & Blues", "urban contemporary": "R&B & Soul",
    "disco": "R&B & Soul", "rapping": "Hip-Hop & Rap", "rage": "Hip-Hop & Rap",
    "hyphy": "Hip-Hop & Rap", "chopper": "Hip-Hop & Rap", "snap music": "Hip-Hop & Rap",
    "rap rock": "Rock & Metal", "rap metal": "Rock & Metal", "blues rock": "Rock & Metal",
    "electronic rock": "Rock & Metal", "industrial music": "Rock & Metal",
    "emo": "Rock & Metal", "surf music": "Rock & Metal", "beat music": "Rock & Metal",
    "new wave": "Alternative & Indie", "post-punk": "Alternative & Indie",
    "neo-psychedelia": "Alternative & Indie", "independent music": "Alternative & Indie",
    "lo-fi music": "Electronic & Dance", "ambient music": "Electronic & Dance",
    "trip hop": "Electronic & Dance", "nu-disco": "Electronic & Dance",
    "italo dance": "Electronic & Dance", "italo disco": "Electronic & Dance",
    "eurodisco": "Electronic & Dance", "rave music": "Electronic & Dance",
    "bassline": "Electronic & Dance", "big beat": "Electronic & Dance",
    "bhajan": "South Asian", "playback singer": "South Asian", "cuban rumba": "Latin",
    "new age music": "Classical & Soundtrack", "musical play": "Classical & Soundtrack",
    "musical comedy": "Classical & Soundtrack", "minimalist music": "Classical & Soundtrack",
    "hard bop": "Jazz & Blues", "post-bop": "Jazz & Blues",
    "protest song": "Folk & Acoustic", "world music": None,
    # Named after a country but describing a sound, not a market.
    "brazilian bass": "Electronic & Dance", "latin house": "Electronic & Dance",
    "hip-hop soul": "R&B & Soul",
}

# Keyword rules, first match wins: markets before sounds, generic Pop last. Word
# boundaries matter: "folk-pop" must not hit "k-pop", "dubstep" must not hit "dub".
RULES = [
    ("K-Pop", r"(?<![a-z])k-pop|korean|(?<![a-z])k-hip|(?<![a-z])k-r&b"),
    ("J-Pop", r"(?<![a-z])j-pop|(?<![a-z])j-rock|anime|japanese|city pop|vocaloid|visual kei|enka"),
    ("South Asian", r"indian|filmi|bollywood|punjabi|bhangra|tamil|telugu|kannada|malayalam|"
                    r"hindustani|carnatic|ghazal|qawwali|sufi|pakistani|bengali|marathi|haryanvi|desi"),
    ("Regional Mexican", r"regional mexican|corrido|banda|norteñ|mariachi|ranchera|grupera|"
                         r"sierreñ|duranguense|tejano|música mexicana|tribal guarachero"),
    ("Brazilian", r"brazil|funk carioca|funk ostenta|baile funk|sertanejo|pagode|mpb|forró|forro|"
                  r"axé|bossa nova|samba|brega|piseiro|arrocha|funk mandela|funk paulista"),
    ("Latin", r"reggaeton|latin|bachata|salsa|cumbia|merengue|vallenato|dembow|urbano|tango|"
              r"bolero|colombian|champeta|flamenco|spanish|cuarteto|guaracha|neoperreo"),
    ("African", r"afrobeat|afro-|afropop|amapiano|highlife|bongo flava|gqom|naija|nigerian|"
                r"ghanaian|south african|kwaito|zouk|kizomba|coupé-décalé|ndombolo|soukous|afrofusion"),
    ("Middle Eastern", r"arab|turkish|khaleeji|mahraganat|raï|rai music|persian|iranian|kurdish|"
                       r"arabesk|hebrew|israeli"),
    ("Christian & Gospel", r"christian|gospel|worship"),
    ("Rock & Metal", r"metal|deathcore|djent|grindcore"),
    ("Country", r"country|bluegrass|red dirt|honky|outlaw"),
    ("Reggae & Dancehall", r"reggae(?!ton)|dancehall|(?<![a-z])ska(?![a-z])|(?<![a-z])dub(?![a-z])|"
                           r"soca|calypso|rocksteady"),
    ("Hip-Hop & Rap", r"hip hop|hip-hop|rap|trap|drill|grime|boom bap|crunk|horrorcore|g-funk|"
                      r"dirty south|bounce|phonk|jersey club"),
    ("R&B & Soul", r"r&b|rhythm and blues|soul|funk|motown|new jack swing|quiet storm|doo-wop"),
    ("Electronic & Dance", r"house|techno|trance|edm|electronic|electronica|dance music|dubstep|"
                           r"drum and bass|electro|eurodance|hardstyle|big room|uk garage|"
                           r"breakbeat|downtempo|chillwave|synthwave|future bass|moombahton"),
    ("Jazz & Blues", r"jazz|blues|swing|bebop|big band|lounge"),
    ("Classical & Soundtrack", r"classical|opera|soundtrack|film score|orchestral|baroque music|"
                               r"romantic music|neoclassical|video game music|musical theatre|"
                               r"show tune|chamber music|operatic|symphon"),
    ("Folk & Acoustic", r"folk|singer-songwriter|acoustic|americana|celtic|chanson|cantautor"),
    ("Alternative & Indie", r"alternative|indie|shoegaze|dream pop|bedroom pop|post-rock|"
                            r"art rock|experimental|psychedelic"),
    ("Rock & Metal", r"rock|punk|grunge|hardcore|emo"),
    ("Pop", r"pop"),
]
_RULES = [(g, re.compile(p)) for g, p in RULES]

LATIN_AMERICA = {
    "Mexico", "Colombia", "Argentina", "Chile", "Peru", "Venezuela", "Puerto Rico", "Cuba",
    "Dominican Republic", "Ecuador", "Panama", "Uruguay", "Paraguay", "Bolivia", "Guatemala",
    "Honduras", "El Salvador", "Nicaragua", "Costa Rica",
}
AFRICA = {
    "Nigeria", "Ghana", "South Africa", "Kenya", "Tanzania", "Uganda", "Cameroon",
    "Ivory Coast", "Côte d'Ivoire", "Senegal", "Mali", "Democratic Republic of the Congo",
    "Republic of the Congo", "Angola", "Mozambique", "Zimbabwe", "Zambia", "Ethiopia",
    "Rwanda", "Benin", "Togo", "Burkina Faso", "Guinea", "Cape Verde", "Gabon", "Malawi",
    "Botswana", "Namibia", "Sierra Leone", "Liberia",
}
MIDDLE_EAST = {
    "Turkey", "Egypt", "Saudi Arabia", "United Arab Emirates", "Lebanon", "Morocco",
    "Algeria", "Tunisia", "Libya", "Iraq", "Syria", "Jordan", "Kuwait", "Qatar", "Bahrain",
    "Oman", "Yemen", "Iran", "Israel", "State of Palestine", "Palestine", "Sudan",
}
SOUTH_ASIA = {"India", "Pakistan", "Bangladesh", "Nepal", "Sri Lanka", "British Raj",
              "Dominion of India", "Dominion of Pakistan"}


def country_market(country):
    if country in LATIN_AMERICA:
        return "Latin"
    if country == "Brazil":
        return "Brazilian"
    if country == "South Korea":
        return "K-Pop"
    if country == "Japan":
        return "J-Pop"
    if country in SOUTH_ASIA:
        return "South Asian"
    if country in AFRICA:
        return "African"
    if country in MIDDLE_EAST:
        return "Middle Eastern"
    return None


def bucket(label):
    """One Wikidata genre label to one of GENRES, or None."""
    low = label.lower()
    if low in OVERRIDES:
        return OVERRIDES[low]
    for genre, rx in _RULES:
        if rx.search(low):
            return genre
    return None


def primary(labels, countries=()):
    """The artist's one genre, from Wikidata labels and countries, or None."""
    mapped = [b for b in map(bucket, labels) if b]
    origin = {m for m in map(country_market, countries) if m}
    markets = collections.Counter(b for b in mapped if b in MARKET)

    def compatible(m):
        # Regional Mexican is a Latin market; a Mexican corridos act is "Latin" by country.
        return m in origin or (m == "Regional Mexican" and "Latin" in origin)

    # 1. A market label that matches where the artist is from.
    matched = [m for m in markets if compatible(m)]
    if matched:
        return min(matched, key=lambda m: (-markets[m], PRIORITY[m]))
    # 2. Market labels that are at least half of everything Wikidata says about them.
    if markets and sum(markets.values()) * 2 >= len(mapped):
        return min(markets, key=lambda m: (-markets[m], PRIORITY[m]))
    # 3. A country that alone defines the market.
    strong = sorted(origin & ORIGIN_DECIDES, key=PRIORITY.get)
    if strong:
        return strong[0]
    # 4. Plain vote over sound-based groups; ties go to Pop, then TIE order.
    votes = collections.Counter(b for b in mapped if b not in MARKET)
    if not votes:
        return None
    return min(votes, key=lambda g: (-votes[g], PRIORITY[g]))


# ---------------------------------------------------------------- Wikidata

def wikidata(ids):
    """Spotify artist ID -> {"wd": [genre labels], "c": [countries]} for every match."""
    out = collections.defaultdict(lambda: {"wd": set(), "c": set()})
    for i in range(0, len(ids), WIKIDATA_CHUNK):
        values = " ".join(f'"{x}"' for x in ids[i:i + WIKIDATA_CHUNK])
        query = f"""SELECT ?sid ?gLabel ?cLabel WHERE {{
          VALUES ?sid {{ {values} }}
          ?item wdt:P1902 ?sid .
          OPTIONAL {{ ?item wdt:P136 ?g . }}
          OPTIONAL {{ {{ ?item wdt:P27 ?c }} UNION {{ ?item wdt:P495 ?c }}
                     UNION {{ ?item wdt:P740 ?loc . ?loc wdt:P17 ?c }} }}
          SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }} }}"""
        req = urllib.request.Request(
            WIKIDATA, data=urllib.parse.urlencode({"query": query}).encode(),
            headers={"User-Agent": USER_AGENT, "Accept": "application/sparql-results+json"})
        for attempt in range(3):
            try:
                rows = json.load(urllib.request.urlopen(req, timeout=120))["results"]["bindings"]
                break
            except (OSError, ValueError) as e:
                if attempt == 2:
                    raise
                print(f"  Wikidata retry {attempt + 1}: {e}")
                time.sleep(10 * (attempt + 1))
        for row in rows:
            entry = out[row["sid"]["value"]]
            for key, field in (("gLabel", "wd"), ("cLabel", "c")):
                value = row.get(key, {}).get("value", "")
                # An unlabelled item comes back as its bare QID; it is not a name.
                if value and not re.fullmatch(r"Q\d+", value):
                    entry[field].add(value)
        time.sleep(1)  # be gentle with the public endpoint
    return {k: {"wd": sorted(v["wd"]), "c": sorted(v["c"])} for k, v in out.items()}


# ---------------------------------------------------------------- Claude

CLAUDE_MODEL = "claude-opus-5-5"
CLAUDE_CHUNK = 50          # artists per request
CLAUDE_MAX_USD = 2.00      # hard stop per run; a normal week costs cents
PRICE_IN, PRICE_OUT = 4.00, 20.00   # USD per million tokens, claude-opus-5-5

CLAUDE_SYSTEM = (
    "You assign one primary music genre to each artist, for a site that ranks songs by "
    "Spotify streams. Use only the genres in the schema. Choose the genre a typical "
    "listener would file the artist under today, judging from what you know of the "
    "artist and from their most-streamed songs, collaborators and country. Market groups "
    "(Latin, Regional Mexican, Brazilian, K-Pop, J-Pop, South Asian, African, Middle "
    "Eastern) take precedence for artists whose music belongs to that market. Answer "
    "\"Unknown\" when you do not recognise the artist and the songs give no clear signal; "
    "a wrong genre is worse than none."
)


def claude_schema():
    return {
        "type": "object",
        "properties": {"artists": {"type": "array", "items": {
            "type": "object",
            "properties": {"id": {"type": "string"},
                           "genre": {"type": "string", "enum": GENRES + ["Unknown"]}},
            "required": ["id", "genre"], "additionalProperties": False}}},
        "required": ["artists"], "additionalProperties": False,
    }


def classify_with_claude(todo, describe):
    """Artist dicts -> {id: genre or None}. Empty when no credentials or SDK."""
    if not todo:
        return {}
    try:
        import anthropic
        client = anthropic.Anthropic()
        # Free call: proves the credentials work and prices the run before spending.
        sample = "\n".join(describe(a) for a in todo[:CLAUDE_CHUNK])
        tokens = client.messages.count_tokens(
            model=CLAUDE_MODEL, system=CLAUDE_SYSTEM,
            messages=[{"role": "user", "content": sample}]).input_tokens
    except Exception as e:  # missing SDK, missing credentials, or network
        print(f"Claude step skipped ({type(e).__name__}: {str(e)[:100]}). "
              f"{len(todo)} artists stay unclassified until it runs.")
        return {}
    chunks = (len(todo) + CLAUDE_CHUNK - 1) // CLAUDE_CHUNK
    print(f"Claude: {len(todo)} artists in {chunks} requests; ~{tokens:,} input tokens "
          f"per full request; budget ${CLAUDE_MAX_USD:.2f}.")

    results, spent = {}, 0.0
    for i in range(0, len(todo), CLAUDE_CHUNK):
        if spent >= CLAUDE_MAX_USD:
            print(f"  Budget reached at ${spent:.2f}; {len(todo) - i} artists left for next run.")
            break
        chunk = todo[i:i + CLAUDE_CHUNK]
        resp = client.beta.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=8000,
            # Refusals are unlikely for artist names, but if one happens the API retries
            # on Anthropic's recommended fallback model instead of returning nothing.
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            system=CLAUDE_SYSTEM,
            output_config={"effort": "low",
                           "format": {"type": "json_schema", "schema": claude_schema()}},
            messages=[{"role": "user", "content": "\n".join(describe(a) for a in chunk)}],
        )
        spent += (resp.usage.input_tokens * PRICE_IN
                  + resp.usage.output_tokens * PRICE_OUT) / 1e6
        if resp.stop_reason != "end_turn":
            print(f"  Request {i // CLAUDE_CHUNK + 1}: stop_reason {resp.stop_reason}; skipped.")
            continue
        text = next((b.text for b in resp.content if b.type == "text"), "")
        wanted = {a["id"] for a in chunk}
        for row in json.loads(text)["artists"]:
            if row["id"] in wanted:
                results[row["id"]] = None if row["genre"] == "Unknown" else row["genre"]
        print(f"  {min(i + CLAUDE_CHUNK, len(todo))}/{len(todo)} classified, ${spent:.2f} so far")
    print(f"Claude: {len(results)} answered, {sum(1 for g in results.values() if g)} with a "
          f"genre; ${spent:.2f} spent.")
    return results


# ---------------------------------------------------------------- main

def load_songs():
    if os.path.exists(RAW_INPUT):
        with open(RAW_INPUT, encoding="utf-8") as f:
            return json.load(f)
    if os.path.exists(CLEAN_INPUT):
        with gzip.open(CLEAN_INPUT, "rt", encoding="utf-8") as f:
            return json.load(f)
    return []


def describer(songs, registry):
    """Builds Claude's one-line context per artist: top songs, collaborators, country."""
    top, collab = collections.defaultdict(list), collections.defaultdict(collections.Counter)
    for s in sorted(songs, key=lambda s: -s.get("totalStreams", 0)):
        names = list(s.get("leads") or []) + list(s.get("features") or [])
        for n in s.get("leads") or []:
            key = n.lower()
            if len(top[key]) < 4:
                top[key].append(s["title"])
            collab[key].update(m for m in names if m.lower() != key)

    def describe(a):
        key = a["name"].lower()
        countries = ", ".join(registry.get(a["id"], {}).get("c", [])) or "unknown"
        return (f'{a["id"]} | {a["name"]} | top songs: {"; ".join(top[key]) or "none"} | '
                f'with: {", ".join(n for n, _ in collab[key].most_common(3)) or "none"} | '
                f'country: {countries}')
    return describe


def main():
    artists = [{"rank": r, "name": n, "id": m.group(1)}
               for r, n, url in scrape_artists()
               if (m := re.search(r"/artist/([A-Za-z0-9]{22})_songs", url))]
    registry = {}
    if os.path.exists(REGISTRY):
        with open(REGISTRY, encoding="utf-8") as f:
            registry = json.load(f)
    print(f"{len(artists)} artists; registry holds {len(registry)}.")

    try:
        wd = wikidata([a["id"] for a in artists])
        print(f"Wikidata matched {len(wd)} artists by Spotify ID.")
    except Exception as e:
        wd = None
        print(f"::warning::Wikidata query failed ({e}); keeping last run's rows.")

    for a in artists:
        entry = registry.setdefault(a["id"], {})
        entry["n"] = a["name"]  # names can change on kworb; the ID is the key
        if wd is None:
            continue
        info = wd.get(a["id"], {"wd": [], "c": []})
        entry["wd"], entry["c"] = info["wd"], info["c"]
        genre = primary(info["wd"], info["c"])
        if genre:
            entry.update(g=genre, src="wikidata")
        elif entry.get("src") == "wikidata":
            # Wikidata no longer supports the old genre: let Claude look again.
            entry.pop("g", None)
            entry.pop("src", None)

    # Without fresh Wikidata rows, the gap list would include artists Wikidata covers,
    # and Claude would be paid to classify them. Wait for next week instead.
    # Songs carry artist names, not IDs, so a name shared by two artists (LISA of
    # BLACKPINK and the Japanese singer LiSA) can map to one genre only. The higher-ranked
    # artist owns the name, the same rule the scraper uses to order credits; the other
    # entry is marked shadowed and skipped by cleanup.py's name lookup.
    owner = {}
    for a in artists:  # rank order
        owner.setdefault(a["name"].lower(), a["id"])
    for a in artists:
        entry = registry[a["id"]]
        if owner[a["name"].lower()] == a["id"]:
            entry.pop("shadowed", None)
        else:
            entry["shadowed"] = True

    todo = [] if wd is None else [a for a in artists if not registry[a["id"]].get("src")]
    answers = classify_with_claude(todo, describer(load_songs(), registry))
    today = date.today().isoformat()
    for aid, genre in answers.items():
        registry[aid].update(g=genre, src="claude", on=today)

    # One artist per line, sorted by ID, so a weekly commit diffs as a few changed lines.
    with open(REGISTRY, "w", encoding="utf-8") as f:
        f.write("{\n" + ",\n".join(
            f"{json.dumps(k)}:{json.dumps(v, ensure_ascii=False, separators=(',', ':'), sort_keys=True)}"
            for k, v in sorted(registry.items())) + "\n}\n")

    current = [registry[a["id"]] for a in artists]
    by_src = collections.Counter(e.get("src", "none") for e in current)
    with_g = sum(1 for e in current if e.get("g"))
    print(f"Genres for {with_g}/{len(artists)} artists "
          f"(wikidata {by_src['wikidata']}, claude {by_src['claude']}, "
          f"unclassified {len(artists) - with_g}).")
    print("By genre:", ", ".join(f"{g} {n}" for g, n in
                                 collections.Counter(e["g"] for e in current if e.get("g")).most_common()))


if __name__ == "__main__":
    sys.exit(main())
