#!/usr/bin/env bash
# Build the generated surface, then deploy public/ to the Cloudflare Worker.
#
# The generated tree (artist pages, per-artist shards, sitemap) is ~154 MB and is NOT
# committed, so it must be built before every deploy. That also means the Cloudflare
# Workers Builds git integration cannot publish this site: it only sees the repo, which
# has no generated output and no data.json.gz. Deploy from here or from CI.
set -euo pipefail
cd "$(dirname "$0")"

CAP=26214400   # 25 MiB, Cloudflare's per-file asset limit

[ -f data.json.gz ] || {
  echo "ERROR: data.json.gz missing. Run: python3 scrape.py && python3 cleanup.py" >&2
  exit 1
}

echo "Building generated pages..."
python3 build_pages.py
python3 make_preload.py

OVERSIZE=$(find public -type f -size +${CAP}c)
if [ -n "$OVERSIZE" ]; then
  echo "ERROR: over the ${CAP}-byte per-file cap:" >&2
  echo "$OVERSIZE" | while read -r f; do echo "  $(wc -c < "$f") $f" >&2; done
  exit 1
fi

COUNT=$(find public -type f | wc -l | tr -d ' ')
if [ "$COUNT" -ge 20000 ]; then
  echo "ERROR: $COUNT files, at or over the 20,000 free-plan asset limit." >&2
  exit 1
fi

echo "Deploying $COUNT files, $(du -sh public | cut -f1):"
npx wrangler deploy ${1:+"$1"}
