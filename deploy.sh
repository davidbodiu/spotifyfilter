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

# Freshness guard. CI refreshes the live data weekly on the runner, so the local
# data.json.gz goes stale in between; deploying it would silently regress the live
# site to older numbers. Compare data vintage (file mtime, stamped into
# data/meta.json by build_pages.py) against what is live. --force overrides.
FORCE=0
if [ "${1:-}" = "--force" ]; then FORCE=1; shift; fi
if [ "$FORCE" = "0" ]; then
  LIVE_EPOCH=$(curl -s --max-time 15 -A "Mozilla/5.0 (Macintosh) Chrome/131" \
    "https://chartrank.app/data/meta.json?cb=$RANDOM" \
    | python3 -c "import json,sys; print(json.load(sys.stdin).get('dataEpoch',0))" 2>/dev/null || echo 0)
  LOCAL_EPOCH=$(python3 -c "import os; print(int(os.path.getmtime('data.json.gz')))")
  if [ "$LIVE_EPOCH" -gt "$LOCAL_EPOCH" ]; then
    echo "ERROR: local data.json.gz ($(date -r "$LOCAL_EPOCH" '+%Y-%m-%d' 2>/dev/null || echo "$LOCAL_EPOCH")) is OLDER than the live data ($(date -r "$LIVE_EPOCH" '+%Y-%m-%d' 2>/dev/null || echo "$LIVE_EPOCH"))." >&2
    echo "Deploying would regress the live site. Rescrape, or ./deploy.sh --force to override." >&2
    exit 1
  fi
fi

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
