#!/usr/bin/env bash
# Stage the site into public/ and deploy that directory to Cloudflare.
#
# Why staging rather than deploying the repo root: wrangler's assets.directory used to
# be ".", which uploads EVERYTHING present on disk. That is now dangerous, because a
# refresh leaves a 106 MB data.json and a snapshots/ archive in the root. data.json
# alone is over the 25 MiB per-file cap, so the deploy would fail. .assetsignore was
# tried and verified NOT to filter in wrangler 4.118, so an explicit allowlist it is.
set -euo pipefail
cd "$(dirname "$0")"

SITE=(index.html app.js styles.css data.json.gz
      favicon.ico icon.svg apple-touch-icon.png icon-192.png icon-512.png
      manifest.webmanifest robots.txt)

CAP=26214400   # 25 MiB, Cloudflare's per-file asset limit

rm -rf public && mkdir public
for f in "${SITE[@]}"; do
  [ -f "$f" ] || { echo "ERROR: missing $f" >&2; exit 1; }
  SIZE=$(wc -c < "$f")
  if [ "$SIZE" -ge "$CAP" ]; then
    echo "ERROR: $f is $SIZE bytes, at or over the ${CAP}-byte per-file cap." >&2
    exit 1
  fi
  cp "$f" public/
done

echo "Staged $(ls public | wc -l | tr -d ' ') files, $(du -sh public | cut -f1) total:"
ls -la public | tail -n +2

if [ "${1:-}" = "--dry-run" ]; then
  npx wrangler deploy --dry-run
else
  npx wrangler deploy
fi
