#!/usr/bin/env python3
"""
Post-scrape cleanup for data.json:
1. Fixes encoding issues (re-encodes mojibake text)
2. Deduplicates songs with matching normalized titles and similar stream counts
3. Computes popularity score (dailyStreams / totalStreams * 1,000,000)
"""

import json
import gzip
import re
import unicodedata

INPUT_FILE = "data.json"
OUTPUT_FILE = "data.json.gz"
STREAM_TOLERANCE = 0.02  # 2% tolerance for matching stream counts
MIN_TOTAL_STREAMS = 1_000_000  # exclude songs below this threshold


def fix_encoding(text):
    """Fix mojibake from ISO-8859-1 misinterpretation of UTF-8."""
    try:
        fixed = text.encode("latin-1").decode("utf-8")
        return fixed
    except (UnicodeDecodeError, UnicodeEncodeError):
        return text


def normalize_title(title):
    """Normalize a title for dedup comparison: strip feat/parens, lowercase, collapse whitespace."""
    t = title.lower().strip()
    # Remove (feat. ...), [feat. ...], (ft. ...), etc.
    t = re.sub(r'[\(\[]\s*(?:feat\.?|ft\.?|featuring)\s+[^\)\]]*[\)\]]', '', t)
    # Remove leading/trailing whitespace and collapse internal whitespace
    t = re.sub(r'\s+', ' ', t).strip()
    # Normalize unicode characters
    t = unicodedata.normalize("NFC", t)
    return t


def streams_match(a, b, tolerance=STREAM_TOLERANCE):
    """Check if two stream counts are within tolerance of each other."""
    if a == 0 and b == 0:
        return True
    if a == 0 or b == 0:
        return False
    ratio = min(a, b) / max(a, b)
    return ratio >= (1 - tolerance)


def shorter_title(a, b):
    """Return the cleaner (shorter) title."""
    return a if len(a) <= len(b) else b


def parse_artist_string(s):
    """
    Split a display artist string into (leads, features).

    Only used to backfill records produced before structured fields existed. It splits
    on commas and so cannot recover names that contain commas. New scrapes carry
    "leads"/"features" directly and never go through this.
    """
    match = re.match(r'^(.*?)(?:\s*\(feat\.\s*(.*)\))?$', s)
    if match:
        leads = [n.strip() for n in match.group(1).split(",") if n.strip()]
        feats = [n.strip() for n in match.group(2).split(",") if n.strip()] if match.group(2) else []
    else:
        leads = [s.strip()] if s.strip() else []
        feats = []
    return leads, feats


def dedupe_names(*lists):
    """Concatenate name lists, preserving order, dropping case-insensitive duplicates."""
    seen = set()
    out = []
    for lst in lists:
        for name in lst or []:
            key = name.lower()
            if key not in seen:
                seen.add(key)
                out.append(name)
    return out


# Two same-titled records within STREAM_TOLERANCE may be one recording listed twice, or
# two unrelated songs that happen to share a title. This decides which.
NEAR_IDENTICAL = 0.99   # totals this close mean "the same recording", see should_merge()


def shares_artist(a, b):
    """True when two records credit at least one artist in common."""
    def names(song):
        return {n.lower() for n in (song.get("leads") or []) + (song.get("features") or [])}
    return bool(names(a) & names(b))


def should_merge(a, b):
    """
    Whether two same-titled, similar-streamed records are really one song.

    A shared artist is the clearest signal. But it is NOT necessary, and assuming it was
    is what made the first attempt at this worse than no gate at all: kworb lists a
    collaboration under a separate track ID on each artist's page, and scrape.py credits
    each record only with the artists whose page carried that URL. So Starboy exists
    twice, as leads=["The Weeknd"] and as features=["Daft Punk"], with byte-identical
    stream counts and no name in common. Requiring a shared artist split 88 such pairs
    back into duplicate rows in the global top 1,000.

    Near-identical totals are the second signal, and they are what actually separates the
    two cases. One recording counted twice agrees to within a rounding error; two
    different songs do not. Sia's "The Greatest" and Billie Eilish's "THE GREATEST" sit
    1.765% apart, well outside NEAR_IDENTICAL, so they stay separate.
    """
    if shares_artist(a, b):
        return True
    lo, hi = sorted((a["totalStreams"], b["totalStreams"]))
    return bool(hi) and lo / hi >= NEAR_IDENTICAL


def merge_name_lists(leads_a, feats_a, leads_b, feats_b):
    """
    Merge two (leads, features) pairs. Exact dedup only, no substring absorption:
    every distinct artist must survive into the index, even one whose name is
    contained in a collaborator's.
    """
    leads = dedupe_names(leads_a, leads_b)
    lead_keys = {n.lower() for n in leads}
    feats = [n for n in dedupe_names(feats_a, feats_b) if n.lower() not in lead_keys]
    return leads, feats


def merge_artists(artist_a, artist_b):
    """Merge two artist strings, combining feat. sections and deduplicating names."""
    def parse_artist(s):
        match = re.match(r'^(.*?)(?:\s*\(feat\.\s*(.*)\))?$', s)
        if match:
            leads = [n.strip() for n in match.group(1).split(",")]
            feats = [n.strip() for n in match.group(2).split(",")] if match.group(2) else []
        else:
            leads = [s.strip()]
            feats = []
        return leads, feats

    leads_a, feats_a = parse_artist(artist_a)
    leads_b, feats_b = parse_artist(artist_b)

    # Combine leads and feats, preserving order, deduplicating
    # Also skip names that are substrings of already-added names (e.g. "Macklemore" in "Macklemore & Ryan Lewis")
    def add_deduped(name, lst):
        """Add name to list, replacing shorter substring matches with longer ones."""
        name_lower = name.lower()
        for i, existing in enumerate(lst):
            e_lower = existing.lower()
            if name_lower == e_lower:
                return  # exact dupe
            if name_lower in e_lower:
                return  # existing is more complete, skip
            if e_lower in name_lower:
                lst[i] = name  # new name is more complete, replace
                return
        lst.append(name)

    leads = []
    for name in leads_a + leads_b:
        if name:
            add_deduped(name, leads)

    # Clean up: remove entries that became substrings after replacements
    def remove_substrings(lst):
        cleaned = []
        for i, name in enumerate(lst):
            n_lower = name.lower()
            is_sub = any(
                n_lower in other.lower() and n_lower != other.lower()
                for j, other in enumerate(lst) if i != j
            )
            if not is_sub:
                cleaned.append(name)
        return cleaned

    leads = remove_substrings(leads)

    # For feats, also check against leads
    feats = []
    for name in feats_a + feats_b:
        if not name:
            continue
        name_lower = name.lower()
        if any(name_lower in l.lower() or l.lower() in name_lower for l in leads):
            continue
        add_deduped(name, feats)
    feats = remove_substrings(feats)

    if leads and feats:
        return ", ".join(leads) + " (feat. " + ", ".join(feats) + ")"
    elif leads:
        return ", ".join(leads)
    elif feats:
        return ", ".join(feats)
    return "Unknown"


def cleanup(songs):
    """Run all cleanup steps on the song list."""
    # Step 1: Fix encoding, and guarantee every record has structured artist fields
    for song in songs:
        song["title"] = fix_encoding(song["title"])
        song["artist"] = fix_encoding(song["artist"])
        leads = [fix_encoding(n) for n in song.get("leads") or []]
        feats = [fix_encoding(n) for n in song.get("features") or []]
        if not leads and not feats:
            leads, feats = parse_artist_string(song["artist"])
        song["leads"] = leads
        song["features"] = feats

    # Step 2: Deduplicate by normalized title + similar streams
    # Group by normalized title
    groups = {}
    for song in songs:
        key = normalize_title(song["title"])
        if key not in groups:
            groups[key] = []
        groups[key].append(song)

    deduped = []
    for key, group in groups.items():
        if len(group) == 1:
            deduped.append(group[0])
            continue

        # Within each title group, cluster by stream count similarity
        clusters = []
        used = [False] * len(group)
        for i in range(len(group)):
            if used[i]:
                continue
            cluster = [group[i]]
            used[i] = True
            for j in range(i + 1, len(group)):
                if used[j]:
                    continue
                if not streams_match(group[i]["totalStreams"], group[j]["totalStreams"]):
                    continue
                # Title plus stream proximity alone merged Sia's "The Greatest" into
                # Billie Eilish's "THE GREATEST". See should_merge().
                if not should_merge(group[i], group[j]):
                    continue
                cluster.append(group[j])
                used[j] = True
            clusters.append(cluster)

        for cluster in clusters:
            if len(cluster) == 1:
                deduped.append(cluster[0])
            else:
                # Merge: cleanest title, highest streams, combined artists
                best = cluster[0]
                for other in cluster[1:]:
                    leads, feats = merge_name_lists(
                        best["leads"], best["features"],
                        other["leads"], other["features"],
                    )
                    best = {
                        "title": shorter_title(best["title"], other["title"]),
                        # Display string keeps substring absorption ("Macklemore" folds
                        # into "Macklemore & Ryan Lewis"); the name lists deliberately
                        # do not, so search still finds both.
                        "artist": merge_artists(best["artist"], other["artist"]),
                        "leads": leads,
                        "features": feats,
                        "totalStreams": max(best["totalStreams"], other["totalStreams"]),
                        "dailyStreams": max(best["dailyStreams"], other["dailyStreams"]),
                        "url": best["url"],
                    }
                deduped.append(best)

    # Step 3: Compute popularity score
    for song in deduped:
        if song["totalStreams"] > 0:
            song["popularity"] = round(song["dailyStreams"] / song["totalStreams"] * 1_000_000, 1)
        else:
            song["popularity"] = 0

    # Step 4: Filter by minimum stream threshold
    deduped = [s for s in deduped if s["totalStreams"] >= MIN_TOTAL_STREAMS]

    # Sort by total streams descending
    deduped.sort(key=lambda s: s["totalStreams"], reverse=True)
    return deduped


def main():
    with open(INPUT_FILE, "r") as f:
        songs = json.load(f)
    print(f"Loaded {len(songs)} songs.")

    cleaned = cleanup(songs)

    removed = len(songs) - len(cleaned)
    print(f"Removed {removed} duplicates. Final count: {len(cleaned)} songs.")

    # Show some examples of merges
    encoding_fixes = sum(1 for s in cleaned if "ñ" in s["title"] or "ñ" in s["artist"])
    print(f"Songs with special characters (spot check): {encoding_fixes}")

    compressed = gzip.compress(json.dumps(cleaned).encode("utf-8"), compresslevel=9)
    with open(OUTPUT_FILE, "wb") as f:
        f.write(compressed)
    print(f"Written to {OUTPUT_FILE} ({len(compressed) / 1e6:.1f} MB gzipped)")


if __name__ == "__main__":
    main()
