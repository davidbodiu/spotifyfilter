# ChartRank

Web app for browsing every song by any artist, ranked by Spotify stream counts. Data is
scraped from kworb.net. Vanilla frontend, no build step, no dependencies. Intended to
live at `https://chartrank.app`.

The pitch, per the meta description: go beyond the top 10 that Spotify shows you.

---

## Maintenance protocol (read this first)

Five files document this project. **All five must be updated after every request.**

| File | Purpose | Update rule |
|---|---|---|
| `CLAUDE.md` | This file. App and architecture summary. | Update whenever behaviour, architecture, constants, or conventions change. |
| `requests.md` | Log of every request, plus the Standing Decisions table. | Append a new entry for every request, including ones that changed no code. |
| `MISC.md` | Recommendations, todos, bugs, gaps, insights. | Add new findings; mark items resolved when fixed; do not silently delete. |
| `ascii-requests.md` | One ASCII activity diagram per request. | Append a diagram for every request, showing the path taken, decision points, and any defect found. |
| `ascii-structure.md` | Three ASCII structure diagrams, increasing granularity. | Update level 2 when files or directories move; level 3 when the call graph or data flow changes. |

**Before acting on a request that appears to clash with existing behaviour, read
`requests.md` first.** Check the Standing Decisions table at the top of that file. If the
new request contradicts a recorded decision, say so explicitly and name the earlier
request before proceeding. Do not silently reverse a deliberate past choice.

A "clash" includes: reintroducing something previously removed, changing a default that
was deliberately set, undoing a documented workaround, or asking for a feature that was
explicitly cut.

### Significant decisions: compare alternatives first

When work reaches a real technical decision (architecture, libraries, data storage,
security, performance, maintainability, deployment), do not lead with a recommendation.
Present two to four realistic options, each with a small code example, when it fits, its
main downsides, and how it bears on this project. Then ask the user to choose and explain
their reasoning, and only recommend after they have answered.

This does not apply to trivial syntax or style choices, or to decisions with no genuine
trade-off. Say so and proceed in those cases rather than staging a fake comparison.

Open items in `MISC.md` that warrant this treatment are tagged `DECISION`.

---

## Pipeline

```
scrape.py  →  data.json (~106 MB)  →  release_dates.py  →  release_dates.txt (committed)
                                             ↓                      ↓
                                        cleanup.py  ←───────────────┘
                                             ↓
                                      data.json.gz (~20 MB)
                                             ↓
                                      build_pages.py
                                             ↓
   public/data/artists.json (45 KB gz)  +  public/data/artist/<slug>.json (~7 KB each)
   public/data/global.json              +  public/artist/<slug>/index.html x 2,998
   public/data/new.json                 +  public/new/index.html
   public/sitemap.xml                   +  public/artists/index.html
```

**Nothing generated is committed** (SD-19). `data.json`, `data.json.gz` and the whole
generated surface are build artifacts; measured at 154 MB across 6,011 files, so
committing weekly would add ~8 GB of git history per year, and deleting the previous
copy reclaims nothing because git keeps every blob it has ever seen.

The browser never downloads the monolith. It fetches `data/artists.json` (45 KB gzipped)
and then one artist shard (~7 KB). `data.json.gz` exists only to feed `build_pages.py`.

Committed: the hand-written files in `public/`, the Python pipeline, `slugs.json`, and
`release_dates.txt` (the append-only track ID to release date registry, SD-24).

## Dataset facts

Current `data.json.gz` was generated **30 September 2026** (local; CI refreshes weekly). `leads`/`features` are live, and
B-1 is dead in the shipped artifact: "Tyler, The Creator" resolves to 195 songs with no
"Tyler" or "The Creator" fragments.

`snapshots/` holds the irreplaceable inputs:

| File | What it is | Why it must survive |
|---|---|---|
| `2026-03-28.json.gz` | previous cleaned artifact | first point of the stream time series; has NO `leads`/`features` |
| `2026-07-31-raw.json.gz` | raw `data.json` before cleanup | 507,226 records vs 321,878 shipped; the pre-merge URL universe |

`cleanup.py` discards 36.5% of the scraper's output: 175,256 records below
`MIN_TOTAL_STREAMS` and a further 10,092 absorbed by the fuzzy dedup merge. Those records
exist **only** in the raw snapshot. Future stream deltas must be computed against raw
pre-merge track IDs, because the 2% clustering can change which URL represents a song
between runs.

**The 25 MiB (26,214,400 bytes) per-file deploy cap no longer binds `data.json.gz`.**
It stopped being a deployed file at the shard split (SD-19); the largest deployed file
is `data/global.json` at ~700 KB. The CI size gate on it is kept as a runaway check
only. Measured 1 October 2026: 20.06 MB with 4% of rows dated, ~21.35 MB once every
row is (I-9).

| Metric | Value |
|---|---|
| Songs | 326,703 |
| Raw records before cleanup | 511,148 |
| Compressed size | 20,064,077 bytes (76.5% of the 25 MiB cap, which no longer binds it) |
| Uncompressed size | 112,375,446 bytes (`data.json`) |
| Minimum total streams | 1,000,000 |

The artist index only ever contains the 3,000 artists the scraper visited. Artist names
in the data come exclusively from that list, so there is nothing outside it to find.

## Data schema

Each record in `data.json.gz`:

```json
{
  "title": "EARFQUAKE",
  "artist": "Tyler, The Creator (feat. Playboi Carti)",
  "leads": ["Tyler, The Creator"],
  "features": ["Playboi Carti"],
  "totalStreams": 1843201955,
  "dailyStreams": 812004,
  "url": "https://open.spotify.com/track/5hVghJ4KaYES3BFUATCYn0",
  "popularity": 440.6,
  "releaseDate": "2019-05-17"
}
```

- **`artist` is for display only. Never parse it.** It is a combined string in the format
  `"Lead1, Lead2 (feat. Feature1, Feature2)"`, and the join is lossy: a name containing a
  comma cannot be recovered by splitting on commas. This is SD-13.
- `leads` and `features` are the structured, authoritative name lists. All indexing,
  searching, and matching uses these.
- `popularity` is `dailyStreams / totalStreams * 1,000,000`, rounded to 1 decimal. It is a
  momentum measure: high for new releases, low for back catalogue. Added by `cleanup.py`,
  not by the scraper.
- `releaseDate` is the date Spotify attaches to the track, which is the **album's**
  release date of the canonical version, as `YYYY-MM-DD`. A single folded into a later
  album carries the album's date, not its own. For a merged cluster it is the earliest
  date among the dated members. **Omitted, not
  null, when unknown**: the registry has not reached that ID yet, or Spotify has no
  date for it (recorded as `-` in `release_dates.txt`). Added by `cleanup.py` from the
  registry, never fetched at build time.

`leads` and `features` were added on 31 July 2026 and are live in the shipped artifact.
Archived snapshots taken before that date have only `artist`, which is why the frontend
fallback is permanent rather than transitional.

---

## `scrape.py`

Standalone. Python 3, `requests` + `beautifulsoup4`. Roughly 60 minutes for 3,000
artists, measured 31 July 2026 at 1.2 s/artist. (An older note said 37 minutes; that
understated it.)

- Fetches `https://kworb.net/spotify/artists.html`, takes the first `MAX_ARTISTS = 3000`
  rows, and follows each artist's songs page.
- On an artist page, songs are in the **second** `<table>`; the first is a summary.
- The `*` feature marker sits outside the `<a>`, in the parent cell text. `is_feature` is
  set by checking whether the cell text starts with `*`.
- Deduplicates by Spotify URL. `build_output()` groups every entry for a URL, sorts leads
  and features separately by artist rank (lower rank wins), removes feature names that
  already appear as leads, and joins them into the `artist` string.
- Stream counts are taken as `max()` across entries for the same URL, since kworb pages
  can disagree slightly.
- kworb's artist links carry each artist's **Spotify artist ID**
  (`/spotify/artist/<id>_songs.html`). The scraper keeps only the URL today. Wikidata
  (property P1902) and MusicBrainz key artists by that ID, which allows exact joins
  for artist metadata such as genre instead of name matching (R42).

**Resumability:** writes `scrape_progress.json` every 10 artists and deletes it on
success. Re-running after an interruption skips completed artists by name.

**Politeness:** `REQUEST_DELAY = 0.75s` between requests, `MAX_RETRIES = 3` with
exponential backoff (`RETRY_BACKOFF = 2`), desktop User-Agent header.

## `release_dates.py`

Sits between the scrape and the cleanup. For every raw record at or above
`MIN_TOTAL_STREAMS` whose track ID is not yet in `release_dates.txt`, it fetches the
Spotify **embed page** (`open.spotify.com/embed/track/<id>`, the same document every
row of the app loads as an iframe) and reads `releaseDate.isoString` out of its inlined
`__NEXT_DATA__` JSON. Appends `<id> <YYYY-MM-DD>` lines to the registry; `-` marks an
ID Spotify has no date for, so it is never refetched.

Why the embed page and not the Web API (R33, 30 September 2026): Development Mode now
requires a Premium subscription, the batch `GET /tracks` endpoint was removed in
February 2026 and the Client Credentials flow is being retired for metadata, so the API
would cost one request per track anyway plus a secret in CI. kworb has no release
date on any page the scraper visits; its per-track page only has chart-entry dates.

**The page is undocumented.** `parse_date()` is the only function that knows its
shape, and a run fails with a clear message if fewer than `MIN_PARSE_RATE` (80%) of the
pages carried a date. In CI that step is `continue-on-error`: a broken fetch must not
block the stream refresh, since `cleanup.py` still reads last week's registry.

**Rate limit, measured:** a burst at ~9/s drew 429s after ~190 requests and cleared
in about a minute; 2/s for 300 and 3/s for 400 requests drew none, and the 3/s local
backfill ran 250k requests over 22 hours with zero 429s. `PACE` (3.0/s) bounds the
rate across all workers and any 429 pauses every worker for `Retry-After` or 60 s.

**Fetch order is popularity descending** (daily/total), so a run cut short by
`MAX_FETCHES` (6,000 per CI run, ~33 min) still covers every plausible new release
first. A song a few days old has a ratio no back-catalogue track can reach. The cold
backfill of ~330k IDs runs locally with `RELEASE_DATES_MAX=400000` (about 26 hours at
3/s); CI's bounded runs continue whatever is left.

**Backfill complete** (2 October 2026, R38): 336,259 IDs, 156 undated, 11.4 MB. Covers
99.95% of the 30 September scrape's IDs at or above 1M streams; the 2 missing were
transient failures, which are not recorded and so are retried by the next run. From
here the weekly CI step only fetches new IDs (~1,650, about 10 minutes).

**The registry is append-only and committed**, for the same reason as `slugs.json`: a
date never changes, the backfill is ~330k requests, and CI runners keep nothing
between runs. Plain text rather than gzip so git stores each week's commit as a small
delta instead of a fresh binary blob.

## `cleanup.py`

Post-scrape pass. Reads `data.json` and `release_dates.txt`, writes `data.json.gz` at
compression level 9.

1. **Encoding fix.** `fix_encoding()` repairs mojibake by round-tripping `latin-1` to
   `utf-8`. Falls back to the original string on failure.
2. **Second dedup pass.** Groups by `normalize_title()` (lowercased, `(feat. ...)` and
   `[ft. ...]` stripped, whitespace collapsed, NFC normalized), then clusters within each
   group by stream counts within `STREAM_TOLERANCE = 0.02` (2 percent). Clusters merge to
   the shortest title, highest stream counts, and a combined artist string.
   `merge_artists()` does substring-aware deduping so "Macklemore" is absorbed into
   "Macklemore & Ryan Lewis".
3. **Popularity score.** As above.
4. **Threshold filter.** Drops anything below `MIN_TOTAL_STREAMS = 1_000_000`.
5. **Release date.** Looks up every member URL of a merged cluster (tracked in a
   transient `_urls` list during the merge) in the registry and keeps the earliest.
   Records with no hit get no field.

Output is sorted by `totalStreams` descending.

This exists as a separate script because URL-based dedup in the scraper was not enough:
the same song appears under multiple URLs (regional releases, re-releases, deluxe
editions) with near-identical counts.

---

## Frontend

`index.html` + `app.js` + `styles.css`. No modules, no bundler. `app.js` runs at the
bottom of `<body>` and calls `init()` immediately.

### Load sequence

1. `buildPreloadIndex()` then render, instantly, from the 10 Billie Eilish tracks
   inlined in `app.js`. This index build is required, not an optimisation: artist
   lookup goes through the index.
2. Show "Loading artists...".
3. Fetch `data/artists.json`, 2,998 entries of `{n: name, s: slug, c: count}`.
4. `buildArtistIndex(entries)`, honour any `?artist=<slug>` deep link, re-render.

Selecting an artist fetches `data/artist/<slug>.json` on demand and caches it in
`shardCache`. `applyFilters()` is therefore **async**, and carries an `applyToken` so a
slow fetch for a previous selection cannot overwrite a newer one.

### Artist selection

`buildArtistIndex()` walks all 318k songs and builds
`{ "lowercased name": { name, songs: [] } }`. Each artist's songs are stored at index
time, so `songsForArtist(name)` is async: it resolves the slug from the index, fetches that
artist's shard, and returns a copy because callers sort in place.

`artistNamesFor(song)` supplies the names. It prefers `song.leads` and `song.features`
and falls back to `parseArtistNames(song.artist)` when those are absent, which is what
lets new code run against the old dataset.

`parseArtistNames()` is the **legacy path**. It splits the display string on commas and
is therefore lossy for names like "Tyler, The Creator".

**Do not delete it.** An earlier version of this file said to remove it once the data was
refreshed. That was wrong: `snapshots/2026-03-28.json.gz` predates `leads`/`features`, and
the fallback is the only way to read it. That snapshot is the anchor of any future
time-window feature, so the fallback has to outlive the migration.

Every lead and every feature is indexed, so a featured artist is findable under their own
name.

The index is built twice: once over `PRELOAD` during first paint, and again over the full
dataset. The first build is required, not an optimization, because artist lookup now
depends on the index existing.

The dropdown shows up to 15 matches on substring match, sorted by prefix match first,
then song count descending. Mouse selection uses `mousedown` with `preventDefault()` so
blur does not fire first. Arrow keys and Enter work; Escape blurs. On blur the input text
is restored to `selectedArtist`, so a partial typed query never sticks.

### Global chart (SD-14)

`GLOBAL_KEY` (`'__global__'`) is a sentinel selection, deliberately not an artist name so
it can never collide with one. `songsForArtist()` returns all songs for it, and
`applyFilters()` caps to `GLOBAL_CAP = 1000` **after** sorting. The cap order matters:
the top 1,000 by total streams and by popularity share zero rows.

Measured on 321,878 songs: 8 ms by total streams (the data ships in that order), 106 ms
by daily, 198 ms by popularity. Roughly 3 to 4x that on mobile, paid once per Apply
rather than per render.

**The popularity sort is floored** (SD-23): only songs with >= 400k daily streams
(`POP_MIN_DAILY` in `build_pages.py`) enter the global popularity pool, because
daily/total explodes near the 1M total floor and the unfiltered chart ranked
just-crossed-the-threshold re-releases. Applies to the global chart only.

The dropdown carries a synthetic first row for it while the query is two characters or
fewer, or when the text plainly matches. The row shows **no song count** (R29): the
surface is the top 1,000 per sort, largely different sets per sort, so no single number
describes it. `selectedArtist` holds the key, `selectedLabel` holds the display text;
they diverge only for this surface.

### New releases (SD-24)

`NEW_KEY` (`'__new__'`) is the second sentinel surface, built exactly like the global
chart: a synthetic dropdown row, a deep link (`?artist=new`), one precomputed file.
**A 30-day twin** (R40) uses the same code path: `NEW_WINDOWS` in `build_pages.py`
lists `(slug, days, file)` for both, `NEW_SURFACES` in `app.js` maps `NEW_KEY` and
`NEW30_KEY` (`'__new30__'`) to `data/new.json` and `data/new30.json`, and the static
pages are `/new/` and `/new-30/`, each linking to the other. The 7-day page is strict
and shows however many qualify; the 30-day page fills its 30. `fetchJson` caches by
its second argument, so each file must use its own path as the key.
`build_pages.py` writes `data/new.json` as `{since, until, days, songs}`: every song
whose `releaseDate` falls within `NEW_RELEASE_DAYS = 7` of the data date, where the data
date is the mtime of `data.json.gz`, i.e. the scrape date. The refresh runs Mondays and
releases land on Fridays, so the window spans exactly one release day plus its weekend.
**Top 30, including sub-1M songs** (R39, SD-5 amended). `cleanup.py` sets aside dated
sub-1M records with total <= 310 x daily (`NEW_CANDIDATE_RATIO`) into `recent.json.gz`; `build_pages.py` merges them into these
pools and nowhere else. The ratio is 310 (10 x 31), the widest the gate passes in the
30-day window. `new.json` ships the union of the top `NEW_CAP = 30` by total
and by daily; `app.js` caps at 30 after sorting, like the global chart, so popularity
sorts within that union rather than surfacing yesterday's 5,000-stream songs. On the
30 September data 21 qualify, not 30: kworb lists new tracks about a week late (I-10),
so the 7-day window under-counts. G-19 holds the options.

**The plausibility gate is load-bearing** (`NEW_MAX_DECAY = 10`). Spotify's date is the
album date of the track's canonical version, and when a single is folded into an album
Spotify relinks the single's ID to the album version, so the single inherits the album
date. On the first dated build, 28 songs sat in the window and the top one by total
streams had 265M, five days after its "release". A song D days on sale cannot have
streamed more than D times its peak day, so the gate accepts only
`totalStreams <= 10 * D * dailyStreams`. Measured: genuine releases score 1 to 9,
pre-release singles absorbed into the album 10 to 18, older songs 35 to 68. It cut the
pool to 13. The earliest-across-cluster rule in `cleanup.py` only helps once the
backfill has dated the older URL, so the gate is what holds in the meantime and for
singles whose original ID never appears separately.

**Edition markers are excluded too** (`NEW_EDITION_MARKERS`, R35/R36). A new edition
of an old song (a "BONUS TRACK" remix, a "Reimagined" cut) gets a new ID and a new
date and streams exactly like a new release, so the decay gate cannot see it. Titles
containing remix, bonus, reimagined, deluxe, live, acoustic, sped up, slowed, version,
edit, remaster, instrumental or demo are dropped from the pool. The user accepted that
a genuinely new remix is hidden as a result.

The surface obeys the app-wide sort select like everything else. Measured on the
10 August data: the top 30 by total and by daily streams among freshly released songs
share 27 rows, because every song in a 7-day window has roughly the same number of
days on sale. `NEW_LABEL` hard-codes the "7"; keep it in step with `NEW_RELEASE_DAYS`.
`newWindow` holds the shipped window so the results line can name the dates.

A crawlable `public/new/index.html` mirrors the artist pages (top 50 as text, JSON-LD
with `datePublished`, in the sitemap).

Every row, on every surface, now shows a **Released** column (table) or line (mobile
card), an en dash when unknown. The render signature includes `releaseDate`, and
`make_preload.py` inlines it, otherwise the preload rows would never be rebuilt once
the shard arrived and the first ten Billie Eilish rows would show no date.

### Theming (SD-15, SD-16)

`styles.css` defines semantic tokens, not literal colours. The old `--black` / `--white`
names were a trap the moment the palette inverted.

Cascade, in order of increasing authority:

1. `:root` holds the **light** values, the default.
2. `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])` applies dark,
   so the **device wins** unless the user explicitly chose light.
3. `:root[data-theme="dark"]` applies dark unconditionally. An attribute selector
   outranks the bare `:root` in the media query, so an explicit choice always wins.

The toggle is three-state: System, Light, Dark. "System" removes the attribute and
clears `localStorage`. An inline script in `<head>`, above the stylesheet, stamps the
stored choice before first paint to avoid a flash of the wrong theme. Every
`localStorage` access is wrapped in try/catch because Safari throws `SecurityError` over
`file://`.

**`#1DB954` is a fill, never text.** It measures 2.50:1 on the light background, failing
AA. Use `--accent` for fills (with `--on-accent` text on top, 7.66:1) and `--accent-text`
for green text or icons. `--border` is decorative; interactive control boundaries use
`--border-control`, which clears the 3:1 requirement in both themes.

**The Spotify embed theme param is not touched.** There is no light embed variant, and
changing the `src` would recreate every iframe, which breaks SD-3.

### Sorting and filtering

`applyFilters()` reads `sortSelect.value`, splits it into `sortKey` and `sortDir`,
selects the artist's songs, sorts, resets to page 1, renders.

Despite the name, **it applies no filters beyond artist selection.** The stream range
filters were removed. `sortFiltered()` handles strings and numbers and both directions,
though only `-desc` options are exposed.

**Sort applies on change.** The Apply button was removed along with the sliders it
gated; `#sort-select` has a `change` listener that calls `applyFilters()`.

### Rendering

Renders the current page into two DOM trees, table rows and mobile cards, and lets CSS
decide which is visible at the 768px breakpoint.

**The table must fit its container from 1,024px up** (R41). Title and artist cells
wrap between words (`overflow-wrap: break-word`, never `anywhere`, which splits words),
stream headers may break onto two lines, and cell padding drops to 10px between 769
and 1,279px. Adding a column means re-measuring at 1,024 and 1,280px; strip iframe
`src` while testing or Spotify rate-limits the players (I-12).

Each row gets a Spotify embed iframe, built by rewriting `open.spotify.com/track/` to
`open.spotify.com/embed/track/` and appending `?utm_source=generator&theme=0` (dark).
Iframes are `loading="lazy"`.

**Iframe teardown is deliberate and load-bearing.** Before each render, existing iframes
have their `src` blanked and are then removed:

```js
resultsBody.querySelectorAll('iframe').forEach(f => { f.src = ''; f.remove(); });
```

Without blanking `src` first, Spotify embeds leak resources and tracks silently stop
playing after a few page changes. `PAGE_SIZE = 10` (down from 20) is part of the same
fix. Do not raise `PAGE_SIZE` or remove the teardown without testing playback across
several page changes.

Mobile cards render rank, embed, and the two stream figures. They do **not** render title
or artist text; the embed supplies that.

Pagination shows first, last, and a window around the current page with ellipses when
there are more than 7 pages. Page changes smooth-scroll to `.results`.

### Escaping

`escapeHtml()` sets `textContent` on a detached div and reads back `innerHTML`.
`truncate(str, max)` escapes and clips, wrapping overflow in a `<span title="...">` so the
full value is available on hover. Applied at 45 chars for title, 35 for artist.

---

## Key constants

| Constant | File | Value | Notes |
|---|---|---|---|
| `MAX_ARTISTS` | scrape.py | 3000 | Bounds the whole dataset |
| `REQUEST_DELAY` | scrape.py | 0.75 | Seconds between requests |
| `MAX_RETRIES` | scrape.py | 3 | With `RETRY_BACKOFF = 2` |
| `STREAM_TOLERANCE` | cleanup.py | 0.02 | Fuzzy match for dedup |
| `MIN_TOTAL_STREAMS` | cleanup.py | 1_000_000 | Long-tail cutoff |
| `PAGE_SIZE_DESKTOP` / `PAGE_SIZE_MOBILE` | app.js | 30 / 30 | 10 in March (SD-3), 50 broke mobile (R25), 30 since |
| `NEW_RELEASE_DAYS` | build_pages.py | 7 | Window for the new-releases surface (SD-24) |
| `NEW_MAX_DECAY` | build_pages.py | 10 | Plausibility gate: total <= 10 x days x daily, else the date is an album re-date |
| `NEW_EDITION_MARKERS` | build_pages.py | regex | Titles of new editions of old songs are excluded from the pool |
| `NEW_CAP` | build_pages.py, app.js | 30 | Top 30 per sort on the new-releases page (R39) |
| `NEW_CANDIDATE_RATIO` | release_dates.py, cleanup.py | 310 | Sub-1M songs with total <= 310 x daily are dated and kept for the new-releases pages |
| `NEW_WINDOWS` | build_pages.py | 7, 30 days | One entry per new-releases surface; mirror in `NEW_SURFACES` in app.js |
| `PACE` | release_dates.py | 3.0 | Embed fetches per second; 9/s drew 429s, 3/s never has |
| `MAX_FETCHES` | release_dates.py | 6000 | Per-run budget; env `RELEASE_DATES_MAX` overrides |
| `DEFAULT_ARTIST` | app.js | 'Billie Eilish' | Must match `PRELOAD` |
| `SHOW_STREAM_SLIDERS` | app.js | false | **Dead flag, see below** |

## Dead code

The stream range sliders were hidden on 31 March. The markup was removed from
`index.html` but the JS was intentionally kept:

- `SHOW_STREAM_SLIDERS` is declared and **never read**. Setting it to `true` does nothing.
- `setupSlider()`, `updateSliderFill()`, `bucketLabel()` are defined and never called.
- `TOTAL_BUCKETS` and `DAILY_BUCKETS` are declared and otherwise unused.

Keeping this code was deliberate, so do not delete it. But note the flag is a trap: it
looks like a working toggle and is not. Restoring sliders means restoring the markup and
wiring the filter logic back into `applyFilters()`.

---

## Conventions

- **No build tools, frameworks, or package managers for the frontend.** Vanilla only.
  Browser-native APIs over libraries (this is why `DecompressionStream` is used).
- **The app needs a local server. It does not work opened from disk.** Browsers treat
  `file://` as an opaque origin and block `fetch()`, so `data.json.gz` never loads and
  the page shows only the 10 inlined `PRELOAD` songs. This has been true since the app
  first used `fetch()`; an earlier version of this file wrongly claimed "no server
  needed", which cost real debugging time. There is no fix that preserves the current
  architecture: the alternative is a `<script>`-loaded data file, and uncompressed that
  is 111 MB. `init()` now detects `file://` and prints the server command.
- Sliders, where used, are bucket-based rather than continuous. A linear 0 to 5B range is
  useless.
- Mobile-responsive at a 768px breakpoint, table to card.
- `#1DB954` is the accent, as a fill only (SD-16). Light theme by default, dark
  available (SD-15). Inter from Google Fonts.
- Spotify's wordmark is not used anywhere (SD-17). The header mark is three ascending
  bars, inline SVG, filled by `--accent`.
- Python scripts are standalone, run directly, no CLI arguments.

## Deployment

**Confirmed 1 August 2026** via `wrangler deployments list --name spotifyfilter`:

- The site is a **Cloudflare Worker** named `spotifyfilter` serving static assets. It is
  **not** Pages (`wrangler pages project list` is empty).
- Every deployment is `Source: Upload`, i.e. a manual `wrangler deploy`. **There is no
  git integration: pushing to GitHub publishes nothing.**
- The live version dates from **31 March 2026**.

```bash
./deploy.sh              # build the generated surface, then publish public/
./deploy.sh --dry-run    # build and validate without publishing
./deploy.sh --force      # bypass the data-freshness guard
```

**Freshness guard:** CI refreshes the live data weekly on a runner, so the local
`data.json.gz` goes stale in between, and a naive local deploy would regress the live
site to older numbers (nearly happened in R29). `build_pages.py` stamps the data's file
mtime into `data/meta.json`; `deploy.sh` compares it against the live copy and aborts
if local is older. Fail-open when the live stamp is unreachable.

**The pipeline only runs what is committed.** CI executes `release_dates.py`,
`cleanup.py` and `build_pages.py` from the repo, not from anyone's working tree. Uncommitted fixes do
not exist as far as the weekly refresh is concerned; that is how the dedup fix and the
widget silently reverted in the 3 and 10 August runs (B-19). After changing pipeline
code, commit and push it, or the next scheduled run undoes the behaviour.

CI also uploads each week's `data.json.gz` as a GitHub Actions artifact (90-day
retention), because the runner-local `snapshots/` copy dies with the runner.

`deploy.sh` runs `build_pages.py` and `make_preload.py` first, because the generated
surface is not committed (SD-19), then gates on the 25 MiB per-file cap and the 20,000
free-plan file limit before calling `wrangler deploy`.

**A Workers Builds git integration is connected to this repo and must stay disabled**
(SD-20). It only sees the repository, which by SD-19 contains no `data.json.gz` and no
generated pages, so it would publish a site with no data on every push. An earlier note
in these docs claimed no integration existed; that was inferred from every historical
deployment reading `Source: Upload`, which was only true because the repo had been
push-idle since March. The first push after that fired it, and it failed.

Two earlier traps, both verified rather than assumed:

- `assets.directory: "."` uploads whatever is on disk, including the 106 MB
  `data.json`, over the per-file cap.
- `.assetsignore` does **not** filter on wrangler 4.118. Tested in isolation: adding it
  increased the reported file count. Do not rely on it.

Current deploy: 6,011 files, ~154 MB, largest single file 684 KB.

## Commands

```bash
# Full refresh and publish (~60 to 85 min, resumable)
python3 scrape.py        # writes data.json
python3 release_dates.py # appends new track IDs to release_dates.txt (commit it)
python3 cleanup.py       # writes data.json.gz (build intermediate, not deployed)
./deploy.sh              # builds the generated surface, gates on limits, publishes

# One-off local backfill of the whole catalogue (~26 h at 3/s, resumable, safe to
# interrupt; every 200 results are flushed to the registry)
RELEASE_DATES_MAX=400000 python3 release_dates.py

# Frontend: a local server is REQUIRED, and it must serve public/.
cd public && python3 -m http.server 8000
```

## Files

- `scrape.py`: kworb scraper
- `release_dates.py`: Spotify embed page scraper, one fetch per new track ID
- `release_dates.txt`: append-only track ID to release date registry (SD-24). Committed.
- `cleanup.py`: dedup, encoding fix, popularity, release date, compression; also writes
  `recent.json.gz`, the sub-1M new-release candidates (not committed)
- `build_pages.py`: generates artist pages, per-artist shards, the global chart, the
  7- and 30-day new-releases files and pages, the A-Z hub and the sitemap. Owns
  `slugs.json`.
- `slugs.json`: append-only artist name to URL slug registry (SD-21). Committed.
- `deploy.sh`: build, gate, publish
- `make_preload.py`: regenerates the inlined `PRELOAD` block from `data.json.gz`
- `.github/workflows/refresh-data.yml`: weekly refresh, Mondays 04:10 UTC (SD-17)
- `favicon.ico` / `icon.svg` / `apple-touch-icon.png` / `icon-192.png` / `icon-512.png`
  / `manifest.webmanifest`: icon set, all drawn from the same three-bar geometry as the
  inline header mark
- `robots.txt`: permissive; revisit when per-artist pages exist
- `snapshots/`: dated copies of past `data.json.gz`, for future time-window deltas
- `data.json.gz`: generated dataset, NOT committed (SD-19)
- `scrape_progress.json`: temporary resume file, auto-deleted on success
- `index.html` / `styles.css` / `app.js`: frontend
- `requests.md`: request log and standing decisions
- `MISC.md`: bugs, todos, gaps, insights
- `ascii-requests.md`: activity diagram per request
- `ascii-structure.md`: structure at three levels of detail
