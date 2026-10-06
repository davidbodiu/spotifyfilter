# Project structure

Three views of the same repository at increasing granularity. Level 1 to orient, level 2
to find a file, level 3 to change one.

Updated after every request. See the maintenance protocol in `CLAUDE.md`.

Last verified: 30 September 2026.

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
              | Cloudflare Worker |   spotifyfilter: assets, plus headcount's
              +-------------------+   wrapper on HTML paths (SD-27)
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
|   +-- scrape.py ............ kworb -> data.json          ~60 to 85 min, resumable
|   +-- release_dates.py ..... Spotify embed page -> release_dates.txt   3/s, resumable
|   +-- genres.py ............ Wikidata + Claude -> genres.json (SD-25)
|   +-- cleanup.py ........... data.json -> data.json.gz   dedup, encoding, popularity, date
|   +-- build_pages.py ....... data.json.gz -> public/*    pages, shards, sitemap
|   +-- make_preload.py ...... refreshes the inlined PRELOAD block in app.js
|
+-- SITE (public/, this is what deploys)
|   +-- SOURCE (committed, hand-written) ......... 11 files
|   |   +-- index.html (browse block rewritten per build), app.js, styles.css
|   |   +-- <indexnow key>.txt, indexnow-key.txt
|   |   +-- favicon.ico, icon.svg, icon-*.png, apple-touch-icon.png
|   |   +-- manifest.webmanifest, robots.txt, og-image.png
|   +-- GENERATED (never committed, SD-19) ....... 6,000 files
|       +-- artist/<slug>/index.html ............. 2,998 crawlable pages
|       +-- data/artists.json .................... index, 45 KB gzipped
|       +-- data/artist/<slug>.json .............. 2,998 shards, ~7 KB each
|       +-- data/global.json ..................... top 1,000 per sort
|       +-- data/new.json ........................ released in the last 7 days
|       +-- data/new30.json ...................... released in the last 30 days
|       +-- top/index.html ....................... crawlable global chart, top 100 as text
|       +-- new/index.html ....................... crawlable new-releases page, 7 days
|       +-- new-30/index.html .................... crawlable new-releases page, 30 days
|       +-- artists/index.html ................... A-Z hub
|       +-- sitemap.xml .......................... 3,000 URLs
|
+-- DEPLOY
|   +-- deploy.sh ............ build, gate on limits, wrangler deploy, IndexNow ping
|   +-- wrangler.jsonc ....... Worker "spotifyfilter": main = worker/entry.js,
|   |                          assets.directory = ./public, run_worker_first = HTML paths,
|   |                          service binding HEADCOUNT
|   +-- worker/entry.js ...... withHeadcount(ASSETS.fetch), 3 lines
|   +-- worker/headcount.js .. headcount's edge wrapper, copied byte for byte (R47)
|   +-- .github/workflows/refresh-data.yml ...... weekly cron, Mondays 04:10 UTC
|
+-- STATE
|   +-- slugs.json ........... append-only name -> slug registry (SD-21). COMMITTED.
|   +-- release_dates.txt .... append-only track id -> date registry (SD-24). COMMITTED.
|   +-- genres.json .......... artist id -> genre registry (SD-25). COMMITTED.
|   +-- snapshots/ ........... dated archives. Local disk only, not committed.
|   +-- data.json ............ scraper output, ~106 MB. Intermediate.
|   +-- data.json.gz ......... cleaned, ~21.7 MB. Intermediate, feeds build_pages.
|   +-- recent.json.gz ....... sub-1M new-release candidates, ~80 KB. Intermediate.
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
   |  release_dates.py
   |    load_registry() ................ release_dates.txt, "<id> <date>" lines
   |    queue = ids >= 1M streams not in registry, popularity DESC
   |    Pacer ........................... 3/s across 4 workers; 429 pauses all
   |    fetch_one() -> parse_date() ..... embed page __NEXT_DATA__ releaseDate
   |    append every 200; fail if parse rate < 80%
   v
release_dates.txt ............... append-only, committed (SD-24)
   |
   |  genres.py
   |    scrape_artists() ............... same list, IDs from the kworb links
   |    wikidata() ...................... P1902 join -> P136 labels + countries
   |    bucket() / primary() ........... 620 labels -> 20 GENRES, country decides markets
   |    classify_with_claude() ......... gaps only; count_tokens preflight; $2 cap
   |    shared names -> higher rank owns, other "shadowed"
   v
genres.json ..................... committed, one artist per line (SD-25)
   |
   |  cleanup.py
   |    fix_encoding() ................. latin-1 -> utf-8 round trip
   |    parse_artist_string() .......... backfill for pre-SD-13 input only
   |    normalize_title() + streams_match(0.02) -> clusters
   |    merge_name_lists() ............. EXACT dedup, no substring absorption
   |    merge_artists() ................ display string only, absorbs substrings
   |    popularity = daily/total * 1e6
   |    drop < MIN_TOTAL_STREAMS (1,000,000)
   |    releaseDate = min(registry[id] for id in cluster _urls), omitted if none
   |    genre = first credited artist with one in genres.json, omitted if none
   |    sub-1M with total <= 310 x daily and a date -> recent.json.gz (R39, R40)
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
   |    for each NEW_WINDOWS (7, 30 days):
   |    new_releases() ................. songs + recent.json.gz;
   |                                     releaseDate >= data date - NEW_RELEASE_DAYS,
   |                                     decay gate, NEW_EDITION_MARKERS,
   |                                     ship top-30 union by total and by daily
   |    new_page_html() ................ /new/ with datePublished JSON-LD
   |    top_page_html() ................ /top/, global top 100 as text (R46)
   |    write_browse_block() ........... rewrites the homepage link block (R46)
   |    sitemap <lastmod> = data date
   v
public/{artist,artists,new,new-30,data,sitemap.xml}
   |
   |  make_preload.py ................. rewrites PRELOAD in app.js so the render
   |                                    signature guard keeps matching (B-6)
   |  deploy.sh ....................... gate: 25 MiB/file, 20,000 files;
   |                                    IndexNow ping after a real deploy (R46)
   v
Cloudflare Worker "spotifyfilter"
   |  HTML paths: worker/entry.js -> headcount wrapper -> ASSETS.fetch -> + <script /_hc/s.js>
   |  everything else: served from assets directly
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
           |     |-- NEW_KEY    -> data/new.json     (window shipped as newWindow)
           |     |-- NEW30_KEY  -> data/new30.json   (same shape, 30 days)
           |     +-- artist     -> data/artist/<slug>.json  (cached in shardCache)
           |-- sortFiltered()
           +-- render()
                 |-- chrome ALWAYS: results count, empty state, pagination
                 |-- rowSignature = artist|sortKey|sortDir|start|rows(+releaseDate)
                 |     early-return if unchanged  <- kills the load flash
                 |-- iframe teardown: blank src BEFORE remove (SD-3, load-bearing)
                 +-- build 30 table rows OR 30 mobile cards, each with Released
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
SD-23  popularity chart floor 400k ..... build_pages.py POP_MIN_DAILY
SD-24  embed-page dates, 7-day window .. release_dates.py, build_pages.py NEW_RELEASE_DAYS
SD-25  artist genre, songs inherit ..... genres.py, cleanup.py step 6
SD-26  crawlable homepage, /top/, lastmod, IndexNow, no workers.dev
                                         build_pages.py, deploy.sh, wrangler.jsonc
SD-27  headcount wrapper on HTML paths .. wrangler.jsonc run_worker_first, worker/
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
