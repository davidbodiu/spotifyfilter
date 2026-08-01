# Project structure

Three views of the same repository at increasing granularity. Level 1 to orient, level 2
to find a file, level 3 to change one.

Updated after every request. See the maintenance protocol in `CLAUDE.md`.

Last verified: 1 August 2026.

---

## Level 1: what this is

```
                    kworb.net
                        |
                        v
              +-------------------+
              |  Python pipeline  |   scrape -> clean -> generate
              +-------------------+
                        |
                        v
              +-------------------+
              |     public/       |   the deployable site
              +-------------------+
                        |
                        v
              +-------------------+
              | Cloudflare Worker |   spotifyfilter
              +-------------------+
                        |
                        v
                  chartrank.app
```

Four moving parts: a scraper, a cleaner, a page generator, and a static frontend.
No build tools, no frameworks, no package manager (SD-1).

---

## Level 2: directories and their jobs

```
spotify_filter/
|
+-- PIPELINE (Python, standalone, no CLI args)
|   +-- scrape.py ............ kworb -> data.json          ~60 min, resumable
|   +-- cleanup.py ........... data.json -> data.json.gz   dedup, encoding, popularity
|   +-- build_pages.py ....... data.json.gz -> public/*    pages, shards, sitemap
|   +-- make_preload.py ...... refreshes the inlined PRELOAD block in app.js
|
+-- SITE (public/, this is what deploys)
|   +-- SOURCE (committed, hand-written) ......... 11 files
|   |   +-- index.html, app.js, styles.css
|   |   +-- favicon.ico, icon.svg, icon-*.png, apple-touch-icon.png
|   |   +-- manifest.webmanifest, robots.txt, og-image.png
|   +-- GENERATED (never committed, SD-19) ....... 6,000 files
|       +-- artist/<slug>/index.html ............. 2,998 crawlable pages
|       +-- data/artists.json .................... index, 45 KB gzipped
|       +-- data/artist/<slug>.json .............. 2,998 shards, ~7 KB each
|       +-- data/global.json ..................... top 1,000 per sort
|       +-- artists/index.html ................... A-Z hub
|       +-- sitemap.xml .......................... 3,000 URLs
|
+-- DEPLOY
|   +-- deploy.sh ............ build, gate on limits, wrangler deploy
|   +-- wrangler.jsonc ....... Worker "spotifyfilter", assets.directory = ./public
|   +-- .github/workflows/refresh-data.yml ...... weekly cron, Mondays 04:10 UTC
|
+-- STATE
|   +-- slugs.json ........... append-only name -> slug registry (SD-21). COMMITTED.
|   +-- snapshots/ ........... dated archives. Local disk only, not committed.
|   +-- data.json ............ scraper output, ~106 MB. Intermediate.
|   +-- data.json.gz ......... cleaned, ~19.6 MB. Intermediate, feeds build_pages.
|
+-- DOCS (all five updated after every request)
    +-- CLAUDE.md ............ app and architecture summary
    +-- requests.md .......... request log + Standing Decisions table
    +-- MISC.md .............. bugs, gaps, recommendations, todos, insights
    +-- ascii-requests.md .... activity diagram per request
    +-- ascii-structure.md ... this file
```

**The committed/generated split is the load-bearing detail.** The generated tree is
154 MB across 6,011 files. Committing it weekly would add ~8 GB of git history a year,
and deleting the old copy reclaims nothing because git keeps every blob it has ever
seen. So it is rebuilt on every deploy, which is also why the Cloudflare Workers Builds
git integration cannot publish this site and must stay disabled (SD-20).

---

## Level 3: data flow and call graph

### Pipeline, stage by stage

```
kworb.net/spotify/artists.html
   |
   |  scrape.py
   |    fetch() ........................ retries, 0.75s delay, backoff
   |    scrape_artists() ............... first 3,000 rows
   |    scrape_artist_songs() .......... 2nd <table>; "*" in parent cell = feature
   |    save_progress() every 10 ....... scrape_progress.json, deleted on success
   |    build_output() ................. group by Spotify URL, max() streams,
   |                                     emit leads[] / features[] (SD-13)
   v
data.json ....................... 507,226 records, ~106 MB, gitignored
   |
   |  cleanup.py
   |    fix_encoding() ................. latin-1 -> utf-8 round trip
   |    parse_artist_string() .......... backfill for pre-SD-13 input only
   |    normalize_title() + streams_match(0.02) -> clusters
   |    merge_name_lists() ............. EXACT dedup, no substring absorption
   |    merge_artists() ................ display string only, absorbs substrings
   |    popularity = daily/total * 1e6
   |    drop < MIN_TOTAL_STREAMS (1,000,000)
   v
data.json.gz .................... 321,878 songs, 19.6 MB, gitignored
   |                              discards 36.5%: 175,256 sub-1M + 10,092 merged
   |
   |  build_pages.py
   |    load_registry() -> slugs.json ... append-only, never reassigns (SD-21)
   |    assign_slugs() ................. collision -> "-2"; empty -> "a-<sha1[:10]>"
   |    co-occurrence map .............. 12 collaborator links per page
   |    page_html() .................... 50 songs as text + MusicGroup/
   |                                     BreadcrumbList/ItemList JSON-LD
   v
public/{artist,artists,data,sitemap.xml}
   |
   |  make_preload.py ................. rewrites PRELOAD in app.js so the render
   |                                    signature guard keeps matching (B-6)
   |  deploy.sh ....................... gate: 25 MiB/file, 20,000 files
   v
Cloudflare Worker "spotifyfilter"
```

### Frontend runtime

```
index.html
   |
   +-- <head> inline script ...... stamps data-theme BEFORE first paint
   |                               (try/catch: Safari throws on file://)
   +-- styles.css ................ :root = light
   |                               @media dark + :root:not([data-theme=light])
   |                               :root[data-theme=dark] wins over both
   +-- app.js
         |
         init()
           |-- buildPreloadIndex() ...... 10 inlined tracks, instant paint
           |-- fetchJson(artists.json) .. 2,998 entries, 45 KB gz
           |-- buildArtistIndex(entries)
           |-- ?artist=<slug> deep link from a generated page
           v
         applyFilters()  [async, guarded by applyToken]
           |-- songsForArtist(sel)
           |     |-- GLOBAL_KEY -> data/global.json  (capped 1,000, per sort)
           |     +-- artist     -> data/artist/<slug>.json  (cached in shardCache)
           |-- sortFiltered()
           +-- render()
                 |-- chrome ALWAYS: results count, empty state, pagination
                 |-- rowSignature = artist|sortKey|sortDir|start|rows
                 |     early-return if unchanged  <- kills the load flash
                 |-- iframe teardown: blank src BEFORE remove (SD-3, load-bearing)
                 +-- build 10 table rows + 10 mobile cards
```

### Where the constraints live

```
SD-1   no frameworks/bundlers .......... whole frontend
SD-3   PAGE_SIZE 10 + src-blank-first .. app.js render()
SD-13  leads[]/features[], never parse .. scrape.py build_output, app.js artistNamesFor
SD-14  global chart capped 1,000 ....... app.js applyFilters (cap AFTER sort)
SD-15  light default, device wins ...... styles.css :root cascade
SD-16  #1DB954 is a FILL, never text ... styles.css --accent vs --accent-text
SD-19  nothing generated is committed .. .gitignore + deploy.sh
SD-20  Workers Builds stays disabled ... Cloudflare dashboard (external)
SD-21  slugs.json append-only .......... build_pages.py assign_slugs
```

### Known dead code (deliberate, SD-8)

```
app.js: SHOW_STREAM_SLIDERS ..... declared, NEVER read. Setting it true does nothing.
        setupSlider()             defined, never called
        updateSliderFill()        defined, called only by setupSlider
        bucketLabel()             defined, called only by setupSlider
        TOTAL_BUCKETS             declared, otherwise unused
        DAILY_BUCKETS             declared, otherwise unused
```
