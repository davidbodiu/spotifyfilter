#!/usr/bin/env python3
"""
Regenerate the PRELOAD block in app.js from the current data.json.gz.

Run this after cleanup.py. PRELOAD is the handful of rows painted before the full
dataset arrives; render() skips its rebuild when the incoming rows are byte-identical
to what is already on screen, which is what stops the load flash. If PRELOAD drifts
from the shipped data by even one stream count, the signatures stop matching and the
flash comes back silently.

Reads DEFAULT_ARTIST and the preload length from app.js, so changing either there is
enough; this script follows.
"""

import gzip
import json
import re
import sys

APP_FILE = "app.js"
DATA_FILE = "data.json.gz"


def artist_names(song):
    """Names crediting a song. Mirrors artistNamesFor() in app.js."""
    if song.get("leads") is not None:
        return list(song["leads"]) + list(song.get("features") or [])
    # Legacy fallback for datasets predating the structured fields.
    match = re.match(r'^(.*?)(?:\s*\(feat\.\s*(.*)\))?$', song["artist"])
    names = [n.strip() for n in match.group(1).split(",") if n.strip()]
    if match.group(2):
        names += [n.strip() for n in match.group(2).split(",") if n.strip()]
    return names


def main():
    src = open(APP_FILE, encoding="utf-8").read()

    default_artist = re.search(r"const DEFAULT_ARTIST = '([^']+)'", src)
    if not default_artist:
        sys.exit("Could not find DEFAULT_ARTIST in app.js")
    artist = default_artist.group(1)

    preload_match = re.search(r'const PRELOAD = (\[.*?\]);', src, re.S)
    if not preload_match:
        sys.exit("Could not find the PRELOAD block in app.js")
    keep = len(json.loads(preload_match.group(1)))

    songs = json.load(gzip.open(DATA_FILE))
    wanted = artist.lower()
    matches = [s for s in songs if wanted in [n.lower() for n in artist_names(s)]]
    if not matches:
        sys.exit(f"No songs found for DEFAULT_ARTIST {artist!r}. "
                 f"Pick an artist that exists in {DATA_FILE}.")

    matches.sort(key=lambda s: s["totalStreams"], reverse=True)
    top = matches[:keep]

    # Keep only the fields render() and the signature actually read, so the inlined
    # block stays small. leads/features are not needed: the preload artist is known.
    fields = ("title", "artist", "totalStreams", "dailyStreams", "url", "popularity")
    trimmed = [{k: s[k] for k in fields if k in s} for s in top]

    block = json.dumps(trimmed, ensure_ascii=False, separators=(",", ":"))
    updated = src[:preload_match.start(1)] + block + src[preload_match.end(1):]
    open(APP_FILE, "w", encoding="utf-8").write(updated)

    print(f"PRELOAD regenerated: {len(top)} songs for {artist!r} "
          f"({len(matches)} in catalogue), {len(block):,} bytes inlined.")
    print(f"  top row: {top[0]['title']!r} at {top[0]['totalStreams']:,} streams")


if __name__ == "__main__":
    main()
