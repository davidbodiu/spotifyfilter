#!/usr/bin/env python3
"""
Generate the per-artist surface from data.json.gz.

data.json.gz is a BUILD INTERMEDIATE at the repo root, not a deployed asset. The
browser never downloads it: it fetches data/artists.json (~45 KB gzipped) and then one
artist shard (~7 KB) instead of the 19.6 MB monolith.

Outputs, all under public/:
  data/artists.json          artist index: name, slug, song count
  data/artist/<slug>.json    that artist's songs (the only payload a page needs)
  data/global.json           precomputed top-N for each sort, for the global chart
  artist/<slug>/index.html   crawlable page with real text
  artists/index.html         A-Z hub linking every artist
  sitemap.xml

Plus slugs.json at the repo root: an APPEND-ONLY registry mapping artist name to slug.

The registry is the load-bearing part. A slug that changes between refreshes destroys
its own URL, its backlinks and its rankings, so once a name has a slug that pairing is
never reassigned, even if the slugify rules later change.
"""

import gzip
import hashlib
import json
import os
import re
import shutil
import unicodedata

DATA = "data.json.gz"
OUT = "public"
REGISTRY = "slugs.json"
SITE = "https://chartrank.app"

SONGS_ON_PAGE = 50      # rendered as text for crawlers; the app fetches the full shard
GLOBAL_CAP = 1000       # must match GLOBAL_CAP in app.js
SORTS = ("totalStreams", "dailyStreams", "popularity")


def slugify(name):
    """URL slug for an artist name. May collide or come back empty; callers resolve."""
    s = unicodedata.normalize("NFKD", name)
    s = s.encode("ascii", "ignore").decode("ascii")     # drop accents and non-Latin
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return re.sub(r"-{2,}", "-", s)


def load_registry():
    if os.path.exists(REGISTRY):
        with open(REGISTRY, encoding="utf-8") as f:
            return json.load(f)
    return {}


def assign_slugs(names, registry):
    """Give every name a stable slug, never reassigning one already in the registry."""
    taken = set(registry.values())
    added = 0
    for name in sorted(names):
        if name in registry:
            continue
        base = slugify(name)
        if not base:
            # Names that transliterate to nothing (all-CJK, all-symbol) still need a
            # stable, unique URL.
            base = "a-" + hashlib.sha1(name.encode("utf-8")).hexdigest()[:10]
        slug, n = base, 2
        while slug in taken:
            slug = f"{base}-{n}"
            n += 1
        registry[name] = slug
        taken.add(slug)
        added += 1
    return added


def esc(s):
    return (str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            .replace('"', "&quot;"))


def artist_names(song):
    return list(song.get("leads") or []) + list(song.get("features") or [])


def page_html(name, slug, songs, collaborators):
    """One artist page. Real text, not a JS shell, so crawlers see content."""
    total = sum(s["totalStreams"] for s in songs)
    top = songs[:SONGS_ON_PAGE]
    rows = "\n".join(
        f'      <tr><td>{i}</td><td>{esc(s["title"])}</td>'
        f'<td>{esc(s["artist"])}</td>'
        f'<td>{s["totalStreams"]:,}</td><td>{s["dailyStreams"]:,}</td></tr>'
        for i, s in enumerate(top, 1))

    links = " ".join(
        f'<a href="../{cslug}/">{esc(cname)}</a>' for cname, cslug in collaborators)

    ld = {
        "@context": "https://schema.org",
        "@graph": [
            {"@type": "MusicGroup", "name": name, "url": f"{SITE}/artist/{slug}/"},
            {"@type": "BreadcrumbList", "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": "ChartRank", "item": SITE},
                {"@type": "ListItem", "position": 2, "name": "Artists",
                 "item": f"{SITE}/artists/"},
                {"@type": "ListItem", "position": 3, "name": name,
                 "item": f"{SITE}/artist/{slug}/"}]},
            {"@type": "ItemList", "name": f"Most streamed {name} songs",
             "numberOfItems": len(top), "itemListElement": [
                 {"@type": "ListItem", "position": i,
                  "item": {"@type": "MusicRecording", "name": s["title"],
                           "byArtist": {"@type": "MusicGroup", "name": name},
                           "url": s["url"]}}
                 for i, s in enumerate(top, 1)]},
        ],
    }

    desc = (f"All {len(songs)} {name} songs ranked by Spotify streams. "
            f"{total:,} total streams. Updated weekly.")

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{esc(name)}: Every Song Ranked by Spotify Streams | ChartRank</title>
<meta name="description" content="{esc(desc)}">
<link rel="canonical" href="{SITE}/artist/{slug}/">
<meta name="color-scheme" content="light dark">
<meta property="og:type" content="music.musician">
<meta property="og:url" content="{SITE}/artist/{slug}/">
<meta property="og:title" content="{esc(name)}: Every Song Ranked by Spotify Streams">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:image" content="{SITE}/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="stylesheet" href="../../styles.css">
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>
</head>
<body>
<div class="app">
  <header class="header">
    <div class="logo">
      <svg class="logo-mark" viewBox="0 0 24 24" width="32" height="32" aria-hidden="true">
        <rect x="3" y="13" width="4.5" height="8" rx="1.5"/>
        <rect x="9.75" y="8" width="4.5" height="13" rx="1.5"/>
        <rect x="16.5" y="3" width="4.5" height="18" rx="1.5"/>
      </svg>
      <h1>ChartRank</h1>
    </div>
  </header>

  <nav class="crumbs"><a href="/">Home</a> / <a href="/artists/">Artists</a> / {esc(name)}</nav>

  <h2 class="page-title">{esc(name)}: every song ranked by Spotify streams</h2>
  <p class="page-lede">{len(songs)} songs, {total:,} total streams.
     <a href="/?artist={slug}">Open in the interactive chart</a> to sort by daily plays
     or momentum and play previews.</p>

  <div class="table-wrapper">
    <table>
      <thead><tr><th>#</th><th>Title</th><th>Artist</th><th>Total streams</th><th>Daily streams</th></tr></thead>
      <tbody>
{rows}
      </tbody>
    </table>
  </div>
  {"<p class='page-lede'>Showing the top %d of %d. <a href='/?artist=%s'>See all</a>.</p>" % (SONGS_ON_PAGE, len(songs), slug) if len(songs) > SONGS_ON_PAGE else ""}

  {f'<p class="page-lede">Often appears with: {links}</p>' if links else ''}
</div>
</body>
</html>
"""


def main():
    songs = json.load(gzip.open(DATA))
    print(f"Loaded {len(songs):,} songs.")

    by_artist = {}
    for s in songs:
        for n in artist_names(s):
            by_artist.setdefault(n, []).append(s)
    print(f"{len(by_artist):,} artists.")

    registry = load_registry()
    added = assign_slugs(by_artist.keys(), registry)
    with open(REGISTRY, "w", encoding="utf-8") as f:
        json.dump(registry, f, ensure_ascii=False, indent=0, sort_keys=True)
    print(f"Slug registry: {len(registry):,} names ({added} new).")

    # Rebuild only the generated trees, never the hand-written files beside them.
    for sub in ("artist", "artists", "data"):
        shutil.rmtree(os.path.join(OUT, sub), ignore_errors=True)
    os.makedirs(f"{OUT}/data/artist", exist_ok=True)
    os.makedirs(f"{OUT}/artists", exist_ok=True)

    # Co-occurrence, for internal linking. Cheap and the highest-value SEO per line.
    co = {}
    for s in songs:
        names = artist_names(s)
        for a in names:
            for b in names:
                if a != b:
                    co.setdefault(a, {})
                    co[a][b] = co[a].get(b, 0) + 1

    index = []
    for name, items in by_artist.items():
        slug = registry[name]
        items = sorted(items, key=lambda s: -s["totalStreams"])

        with open(f"{OUT}/data/artist/{slug}.json", "w", encoding="utf-8") as f:
            json.dump(items, f, ensure_ascii=False, separators=(",", ":"))

        partners = sorted(co.get(name, {}).items(), key=lambda kv: -kv[1])[:12]
        collaborators = [(n, registry[n]) for n, _ in partners if n in registry]

        os.makedirs(f"{OUT}/artist/{slug}", exist_ok=True)
        with open(f"{OUT}/artist/{slug}/index.html", "w", encoding="utf-8") as f:
            f.write(page_html(name, slug, items, collaborators))

        index.append({"n": name, "s": slug, "c": len(items)})

    index.sort(key=lambda e: -e["c"])
    with open(f"{OUT}/data/artists.json", "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, separators=(",", ":"))

    # Global chart: the top N by each sort are different sets, so precompute all three.
    glob = {}
    for key in SORTS:
        glob[key] = sorted(songs, key=lambda s: -s.get(key, 0))[:GLOBAL_CAP]
    with open(f"{OUT}/data/global.json", "w", encoding="utf-8") as f:
        json.dump(glob, f, ensure_ascii=False, separators=(",", ":"))

    # A-Z hub, so every artist page has at least one internal link pointing at it.
    buckets = {}
    for e in sorted(index, key=lambda e: e["n"].lower()):
        first = e["n"][0].upper()
        buckets.setdefault(first if first.isalpha() else "#", []).append(e)
    sections = "\n".join(
        f'<h3 id="{k}">{k}</h3><p class="az">' +
        " ".join(f'<a href="/artist/{e["s"]}/">{esc(e["n"])}</a>' for e in v) + "</p>"
        for k, v in sorted(buckets.items()))
    with open(f"{OUT}/artists/index.html", "w", encoding="utf-8") as f:
        f.write(f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>All Artists | ChartRank</title>
<meta name="description" content="Every one of the {len(index):,} artists on ChartRank, A to Z, each with all their songs ranked by Spotify streams.">
<link rel="canonical" href="{SITE}/artists/">
<meta name="color-scheme" content="light dark">
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="stylesheet" href="../styles.css">
</head><body><div class="app">
<nav class="crumbs"><a href="/">Home</a> / Artists</nav>
<h2 class="page-title">All {len(index):,} artists</h2>
{sections}
</div></body></html>
""")

    urls = [f"{SITE}/", f"{SITE}/artists/"] + [f"{SITE}/artist/{e['s']}/" for e in index]
    with open(f"{OUT}/sitemap.xml", "w", encoding="utf-8") as f:
        f.write('<?xml version="1.0" encoding="UTF-8"?>\n'
                '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n')
        for u in urls:
            f.write(f"  <url><loc>{u}</loc></url>\n")
        f.write("</urlset>\n")
    print(f"sitemap.xml: {len(urls):,} URLs (limit is 50,000 per file).")

    with open(f"{OUT}/robots.txt", "w", encoding="utf-8") as f:
        f.write(f"User-agent: *\nAllow: /\n\nSitemap: {SITE}/sitemap.xml\n")

    print(f"Wrote {len(index):,} artist pages and shards.")


if __name__ == "__main__":
    main()
