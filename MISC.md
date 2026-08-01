# MISC

Bugs, gaps, recommendations, todos, and insights. Updated after every request. See the
maintenance protocol in `CLAUDE.md`.

Status values: `OPEN`, `IN PROGRESS`, `FIXED`, `WONTFIX`, `UNVERIFIED`.
Items are not deleted when resolved, only marked.

`R<n>` and `SD-<n>` references point at `requests.md`: request entries and standing
decisions respectively. `B-`, `G-`, `R-`, `T-`, and `I-` references are local to this
file.

Items tagged `DECISION` involve a real trade-off and must be presented as compared
alternatives before being acted on, per SD-12. Untagged items are one-way fixes with no
meaningful alternative; just do them.

Last full audit: 31 July 2026 (R10). Research sweep 31 July 2026 (R15).

---

## Bugs

### B-1. Artists with commas in their name are unfindable `FIXED`

`parseArtistNames()` in [app.js:91-106](app.js#L91-L106) splits lead artists on commas.
Any artist whose own name contains a comma is shredded into fragments.

Verified against the live dataset:

| Real artist | Index key | Result |
|---|---|---|
| Tyler, The Creator | absent | indexed as "Tyler" (192 songs) and "The Creator" (192 songs) |
| Earth, Wind & Fire | absent | indexed as "Earth" (108) and "Wind & Fire" (108) |

Both fragments carry the full song count, so the dropdown offers two identical-looking
entries under wrong names, and searching the real name returns nothing.

20,096 of 318,431 artist strings contain a comma, so the blast radius is wider than these
two.

**Root cause is structural, not a typo.** `build_output()` in
[scrape.py:185-190](scrape.py#L185-L190) joins multiple leads with `", "`, and the
frontend splits on `,` to invert it. The join is lossy whenever a name contains the
delimiter. `merge_artists()` in `cleanup.py` has the same assumption.

**Fix options, cheapest first:**

1. Special-case a known list of comma-containing artists. Fast, fragile, does not scale.
2. Have `cleanup.py` emit explicit `leads: []` and `features: []` arrays alongside the
   display `artist` string, and index those in the frontend. Schema change, needs
   `data.json` which is no longer on disk (see I-4), so realistically pairs with a
   refresh.
3. Change `scrape.py` to carry structured artist lists end to end. Correct fix, requires
   a full rescrape.

**DECIDED 31 July 2026 (R12): option 3, structured artist fields.** The user chose it as
the most robust; agreed, because it deletes the failure mode rather than working around
it, and no lexical workaround can be complete against 20,096 comma strings.

**Code landed 31 July 2026 (R13); the bug persists until T-1 runs**, because the fix
lives in the data. `scrape.py` now emits `leads`/`features`, `cleanup.py` carries and
merges them (backfilling from the display string for legacy input), and the frontend
indexes them. Verified against a faithful upgrade of the live dataset: "Tyler, The
Creator" resolves to its 192 songs and the "Tyler" / "The Creator" fragments disappear.

Implementation carries a compatibility shim so the code and the data do not have to ship
together:

```js
function artistNamesFor(song) {
  if (song.leads) return [...song.leads, ...(song.features || [])];
  return parseArtistNames(song.artist);   // legacy path for pre-refresh data
}
```

**Closed 1 August 2026.** T-1 landed and the fix is live in production. Verified against
the deployed artifact at `spotifyfilter.bodiud.workers.dev`: "Tyler, The Creator" resolves
to 195 songs, "Earth, Wind & Fire" to 113, and the `Tyler` / `The Creator` / `Earth` /
`Wind & Fire` fragments all return 0.

`parseArtistNames()` and the `artistNamesFor()` fallback stay permanently (SD-18): the
archived snapshots predate `leads`/`features` and are the anchor for any future
time-window work.

### B-2. Ampersands double-escape in the results header `FIXED`

[app.js:172](app.js#L172):

```js
resultsCount.textContent = `${escapeHtml(selectedArtist)} \u2014 Showing ...`;
```

`escapeHtml()` returns HTML-encoded text, which is then assigned via `textContent`, which
does not decode. 60 artist index keys contain `&`, including Mumford & Sons, Simon &
Garfunkel, and Jorge & Mateus. They render as "Mumford &amp; Sons".

**Fix:** drop the `escapeHtml()` call. `textContent` is already injection-safe. One line.

**Fixed in R15**, alongside the em-dash removal in the same statement.

### B-3. Artist dropdown is empty until the full dataset lands `PARTIALLY FIXED` `LOW`

`buildArtistIndex()` is called only after the 17.6 MB fetch completes
([app.js:409](app.js#L409)). Until then `artistIndex` is `{}`, so typing in the artist box
during the preload window silently returns nothing. The input looks live, focuses, and
selects its text, which makes the emptiness read as "no such artist" rather than "not
ready".

This partially defeats R5.1, whose whole point was that the page is usable immediately.

**Fix:** call `buildArtistIndex()` after `allSongs = PRELOAD` as well (cheap, indexes 10
songs), and render a "loading artists..." row in the dropdown while the fetch is in
flight.

**Half done in R13.** The preload index build now happens, though as a correctness
requirement of R-1 rather than for this. The dropdown resolves the preloaded artists
during the load window instead of nothing at all. Still outstanding: the "loading
artists..." affordance, so an early search for an artist outside the preload still reads
as "no such artist".

### B-4. `SHOW_STREAM_SLIDERS` is a dead flag that looks live `OPEN` `LOW`

Declared at [app.js:7](app.js#L7) and never read. The comment at
[app.js:45](app.js#L45) says "disabled when SHOW_STREAM_SLIDERS = false", implying a
working toggle. Setting it to `true` does nothing, because the slider markup was removed
from `index.html` and nothing branches on the flag.

Per SD-8 the code stays. But the flag should either be wired up or its comment corrected
so the next person does not lose time on it.

### B-5. Iframe teardown ran after the mobile wipe in the zero-results branch `FIXED`

`render()` set `mobileCards.innerHTML = ''` in the `totalResults === 0` branch **before**
the teardown loop blanked each iframe's `src`. That is precisely the failure SD-3 exists
to prevent: detaching a live Spotify embed leaks it and playback dies. Hard to trigger,
since it needed an artist with zero songs, but a genuine violation sitting in the tree.

**Fixed in R15** by hoisting the teardown above the results-count block, so no code path
can detach an iframe before its `src` is blanked. Verified by asserting the teardown's
character offset precedes the wipe's.

### B-6. Load flash on first paint `FIXED` (second attempt)

**The first fix did not work.** The signature included `totalResults`, which legitimately
changes across the very transition it was meant to guard: the preload paints 10 of Billie
Eilish's songs, the full dataset paints 10 of 78. So the signature never matched, the
guard never fired, and the teardown plus rebuild still ran.

Worse, it was reported as verified. The test compared the preload's row payload to the
data's top-10 rows and found them identical, which is true but is not what the code
computes. **A proxy was tested instead of the real expression.**

Now split: chrome (results count, empty state, pagination) always updates, and only the
row rebuild plus iframe teardown is gated, on `selectedArtist|sortKey|sortDir|start|rows`.
Verified by reconstructing the actual `rowSignature` expression from source and asserting
the preload and full-data values are equal.

### B-6 (original entry) `SUPERSEDED`

Reported by the user: "the songs are loaded but then briefly flash seemingly to load
again". Root cause: `init()` paints `PRELOAD`, then the full dataset arrives and
`applyFilters()` triggers a second `render()` that tears down all ten Spotify iframes and
rebuilds identical rows.

**Fixed in R15** with a render signature guard. `render()` computes
`selectedArtist|totalResults|start|url:total:daily,...` and returns early when it matches
the previous render, skipping both the teardown and the rebuild. Surviving iframes are
never touched, which is strictly better for SD-3 than the old unconditional teardown.

**This regresses silently unless `PRELOAD` is regenerated after every data refresh.**
Verified: the current `PRELOAD` signature matches the live data exactly, byte for byte,
so the guard fires today. The moment stream counts change the signatures diverge and the
flash returns. `make_preload.py` exists to close that loop; see R-2.

### B-7. Light theme rendered near-black `FIXED` `CRITICAL`

Shipped broken in R16 and reported by the user. `body { background }` resolved to
`var(--on-accent)` = `#0a0a0a` in **both** themes, so "light mode" had a near-black
page.

Cause: the token migration was done with scripted find/replace, mapping
`var(--black)` to `var(--on-accent)` globally. That is correct for the three places
`--black` meant "text on a green fill" and catastrophically wrong for the one place it
meant "the page background".

**The verification is the real lesson.** The checks run at the time confirmed every CSS
variable was *defined* and no hardcoded colours remained. Both passed. Neither could
detect that a defined token was semantically *wrong*. Syntactic verification cannot
catch a semantic error.

Now verified by resolving each surface to a literal colour in both themes and asserting
the light page background is actually light (luminance 0.965) and the dark one dark
(0.006), and that no background resolves identically in both.

### B-8. Three further token-migration regressions `FIXED` `MINOR`

Found by diffing resolved dark-theme values against `git show HEAD:styles.css`:
placeholder text and `.no-preview` were `#666` and became `--text-muted` (`#b3b3b3`),
making them as loud as real content; `.slider-track` was `#404040` and became
`--border-strong`. Fixed with dedicated `--text-subtle` and `--track` tokens.

### B-9. The app never worked opened from disk `FIXED` (documentation)

Reported by the user as "index only has 10 songs when i open up". Browsers treat
`file://` as an opaque origin and block `fetch()`, so `data.json.gz` never loads and
only the 10 inlined `PRELOAD` songs render. This has been true since the app first used
`fetch()`, not a regression.

`CLAUDE.md` asserted "just open index.html in a browser (no server needed)" and that
claim was carried into the rewrite without testing, then propagated to six research
agents as a hard architectural constraint. Corrected everywhere.

`init()` now detects `file://` and prints the exact server command instead of a generic
"Failed to load full dataset".

### B-10. `Content-Encoding: gzip` would have broken the deployed site `FIXED`

If a host serves `data.json.gz` with `Content-Encoding: gzip`, the browser decompresses
it transparently and `DecompressionStream('gzip')` then throws on already-plain JSON.
`loadDataset()` now sniffs the gzip magic number and handles both. Verified against a
live server in both modes: 321,878 songs either way.

### B-11. `escapeHtml()` did not escape quotes `FIXED` `MAJOR`

`truncate()` builds `<span title="${escapeHtml(str)}">`, but `escapeHtml()` used the
`textContent` then `innerHTML` trick, which escapes `&`, `<` and `>` and **not** `"`.
Any title or artist over the truncation length containing a double quote terminated the
attribute early and emitted garbage attributes.

**2,197 titles and 62 artists affected, including the default first page**: Billie
Eilish's `What Was I Made For? [From The Motion Picture "Barbie"]` is 54 characters, so
it truncates, so it broke on every fresh load. Not an injection vector, since
`textContent` already neutralises tags, but visibly broken markup in the most-seen row.

Fixed by escaping `"` and `'` as well. Verified end to end through `truncate()`.

### B-12. Light theme had no elevation ladder `FIXED` `MAJOR`

Same class as B-7 and found by the same audit. The light page was `#fbfbfc`, so
`--surface-2` (`#ffffff`) was **1.03:1** against it. Every surface meant to sit above the
page was invisible: the sticky table header had no band and no bottom edge, the
pagination hover chip did not render, and the dropdown had no discernible boundary.

Root cause is conceptual, not clerical: dark `--card` (`#282828` on `#121212`, 1.27:1) is
elevated by being *lighter*. Mapping it to pure white on a near-white page preserves the
name and destroys the meaning.

Fixed by making the page genuinely grey: `--bg: #eef0f3`, `--surface: #f7f8fa`,
`--surface-2: #ffffff`, giving 1.14:1 for elevated surfaces against 1.27:1 in dark. Also
added a real `border-bottom` to `th` and a `box-shadow` to the dropdown so both survive
regardless of token drift.

### B-13. Focus made controls LESS visible in light mode `FIXED` `MAJOR`

`#artist-input` and `#sort-select` set `outline: none` and signalled focus only through
`border-color: var(--accent)`. `#1DB954` is 2.59:1, **below** the 3.32:1 of the resting
border, so focusing a control reduced its contrast. Keyboard users had no usable
indicator.

Fixed with a real `:focus-visible` ring using `--accent-text` (5.08:1 light, 7.24:1
dark), applied to both controls and the Apply button.

### B-14. Theme toggle jammed when localStorage was unavailable `FIXED` `MINOR`

The click handler read its current state back out of `localStorage`. Where storage
throws or is disabled, `readStoredTheme()` always returned `'system'`, so the cycle could
never advance past `Light`. That includes the `file://` path this project documents.
Fixed by holding the state in memory and treating storage as best-effort persistence.

Also: the two `<meta name="theme-color">` tags are media-gated on the device preference,
so an explicit override left the browser chrome contradicting the page. `applyTheme()`
now rewrites the tag.

---

## Gaps

### G-1. Sort requires clicking Apply `OPEN` `MEDIUM`

There is no `change` listener on `#sort-select`; only `#apply-btn` calls `applyFilters()`
([app.js:392](app.js#L392)). Every other control in the app is immediate. This is almost
certainly a leftover from when Apply also committed the slider ranges, which no longer
exist. Now the button gates a single dropdown.

Wiring `sortSelect` to `change` would let the Apply button go entirely.

### G-2. Mobile cards omit title and artist `OPEN` `MEDIUM`

[app.js:203-212](app.js#L203-L212) renders rank, embed, and the two stream figures. No
text identifies the song. When the embed carries the title this is merely redundant, but
when `song.url` is empty the card renders a rank and two numbers and nothing else.
Desktop has a "No preview" fallback for this case; mobile has no equivalent.

### G-3. Empty-state copy references filters that no longer exist `OPEN` `LOW`

[index.html:83](index.html#L83) reads "No songs match your filters". Since R7.2 there are
no filters, only artist selection. Should say something like "No songs found for this
artist".

### G-4. No `.gitignore`, and build artifacts are tracked `FIXED`

`git ls-files` shows `.DS_Store` and both `__pycache__/*.pyc` files committed. There is no
`.gitignore` at all. Should ignore `.DS_Store`, `__pycache__/`, `data.json`, and
`scrape_progress.json`.

**Fixed in R16.** `.gitignore` added; `.DS_Store` and both `.pyc` files untracked with
`git rm --cached` (staged, not committed). `snapshots/` is also ignored, which means
**those archives currently exist only on local disk** and need a durable home once D2/D3
are settled.

### G-6. chartrank.app returns HTTP 403 to every non-browser client `OPEN` `CRITICAL`

Confirmed by request: `https://chartrank.app/` and `https://chartrank.app/robots.txt`
both return **403** with a `cf-mitigated: challenge` header. A Cloudflare bot mitigation
(likely Bot Fight Mode or a managed challenge) is intercepting non-browser traffic.

This gates every SEO item on the list. Crawlers cannot fetch `robots.txt`, a sitemap, or
any page, and no CI health check can verify a deploy. Nothing downstream of SEO is even
measurable until it is resolved. Needs the Cloudflare dashboard: Security to Events,
identify the rule, disable Bot Fight Mode, add a WAF skip for verified bots and for
`/robots.txt` and `/sitemap.xml`.

Whether Googlebot specifically is being challenged is unconfirmed. `site:chartrank.app`
reportedly returns the homepage, so Google reached it at some point, possibly before the
challenge existed. Google Search Console URL Inspection is the only conclusive test.

### G-7. The deploy publishes the entire repository root `OPEN` `MEDIUM`

`wrangler.jsonc` on the unmerged `origin/cloudflare/workers-autoconfig` branch sets
`"assets": { "directory": "." }`, so every file in the repo root is served publicly:
`scrape.py`, `cleanup.py`, `CLAUDE.md`, `MISC.md`, `requests.md`, and now `snapshots/`.

The repo is public, so tracked files are already world-readable and the exposure is
mostly cosmetic. It still means every file added to the root is silently deployed. Fix
with `.assetsignore` or by moving the site into a `public/` directory.

Note `main` has no `wrangler.jsonc` at all, so the live configuration cannot be confirmed
from git. See T-2.

### G-5. No fallback when `DecompressionStream` is unavailable `OPEN` `LOW`

Older Safari lacks it. The `try/catch` at [app.js:411](app.js#L411) catches the failure
and writes "Failed to load full dataset", but the user is left sitting on the 10-song
Billie Eilish preload with no explanation of why every artist search returns nothing.

---

## Recommendations

### R-1. Precompute artist to songs, do not re-scan on every render `FIXED`

`songsForArtist()` ([app.js:109-115](app.js#L109-L115)) filters all 318,431 songs and runs
a regex match on each one, every time it is called. `applyFilters()` calls it on every
artist change and every sort change.

`buildArtistIndex()` already walks the same data and already computes the parsed names. It
should store the songs at the same time:

```js
artistIndex[key] = { name, count, songs: [] }
```

That turns a 318k-element regex sweep into a dict lookup, and it costs nothing extra
because the parse already happens during the index build.

**Done in R13**, folded into the B-1 work. `artistIndex[key].songs` now holds the songs;
`songsForArtist()` is a dict hit returning a copy. Measured on the live 318,431-song
dataset: index build 60 to 110ms, lookups too fast to measure (50 consecutive Drake
lookups in under 1ms). The redundant `count` field was dropped in favour of
`songs.length`.

### R-2. `PRELOAD` will go stale silently on the next refresh `OPEN`

`PRELOAD` is 10 hardcoded Billie Eilish tracks with stream counts frozen at 28 March.
Regenerating `data.json.gz` does not touch it, so first paint will show old numbers that
visibly jump when the real data lands.

Either add a `cleanup.py` step that regenerates the `PRELOAD` block, or drop stream
figures from the preload render so there is nothing to be wrong.

### R-3. Consider per-artist data files `OPEN` `ARCHITECTURAL` `DECISION`

The app loads 17.6 MB to display 10 rows for one artist. Splitting into
`data/<artist>.json` plus a small artist index file would cut the initial load to a few
tens of KB and make B-3, R-1, and R-2 all moot.

This keeps the app fully static, so it does not violate SD-1 or the "open index.html
directly" convention. It does mean thousands of small files in the repo.

Worth doing only if load time is a real complaint. Flagging as an option, not a
recommendation to act on now.

### R-4. `merge_artists()` substring absorption may over-merge `MITIGATED` `UNVERIFIED`

`add_deduped()` in [cleanup.py:73-85](cleanup.py#L73-L85) drops any name that is a
substring of an already-added name. Intended for "Macklemore" inside "Macklemore & Ryan
Lewis" (the code's own example). But the rule is purely lexical, so a genuinely distinct
artist whose name is contained in a collaborator's would be silently dropped.

Not verified, because the check needs `data.json`, which is no longer on disk (see I-4).
Worth testing during the next refresh.

**Mitigated in R13, not resolved.** The new `merge_name_lists()` uses exact
case-insensitive dedup only, so `leads`/`features` never drop a distinct artist and search
is unaffected. `merge_artists()` still runs on the display string and still absorbs
substrings, so a merged song can *display* "Macklemore & Ryan Lewis" while remaining
searchable under "Macklemore". That divergence is intentional. Confirmed by test: a
two-record merge yields `artist='Macklemore & Ryan Lewis'` with
`leads=['Macklemore & Ryan Lewis', 'Macklemore']`.

### R-5. `data.json.gz` in git will bloat the repo on every refresh `OPEN` `DECISION`

Each regeneration commits a fresh 17.6 MB binary that does not delta-compress. Three
refreshes and the repo is over 70 MB of history for a 40 KB app.

Consider Git LFS, or keeping the data out of git and publishing it as a release asset or
deploy-time artifact.

---

## Todos

### T-3. Nothing from this session is committed or pushed `OPEN` `HIGH`

`git log` still ends at `61c15d8 hide sliders` (31 March). 24 uncommitted changes, and 14
new files exist only on local disk, including `.github/workflows/refresh-data.yml`,
`deploy.sh`, `wrangler.jsonc`, `make_preload.py`, `MISC.md`, `requests.md` and the icon
set.

Consequences: the weekly refresh cannot run (the workflow is not on GitHub), and a
machine failure loses the session's work. The live Worker is fine, because it was
deployed from disk rather than from git.

Weekly automation needs three things, none of which have happened:
1. Commit and push, so the workflow exists on GitHub.
2. Add a `CLOUDFLARE_API_TOKEN` repo secret with "Edit Cloudflare Workers" permission.
3. Add `CLOUDFLARE_ACCOUNT_ID` = `c0c4d779fc335131d032626be2631379`.

Without step 2 the job warns and commits without publishing, by design.

### T-1. Refresh the dataset `DONE` `HIGH`

**Started 31 July 2026, 20:21 by the user (R14).** `python3 scrape.py` running in the
background. Pipeline verified end to end against live kworb HTML before completion: the
artists page still yields 3,000 rows, the `*` feature marker is still detected, and
`build_output()` to `cleanup.cleanup()` to `buildArtistIndex()` round-trips
"Tyler, The Creator" intact. Run `python3 cleanup.py` when the scrape finishes.


`data.json.gz` was generated 28 March 2026. It is now 31 July 2026, so the data is over
four months old. Total streams are understated across the board, and `dailyStreams` and
the derived `popularity` score are meaningless: popularity is explicitly a
now-versus-lifetime ratio, and the "now" half is from a different season.

The app's sort-by-popularity option is currently a sort by "what was hot in March".

Run `python3 scrape.py` then `python3 cleanup.py` (~37 min). Bundle B-1's schema change
and R-2's preload regeneration into the same pass.

### T-2. Deploy path identified `RESOLVED`

`index.html` sets a canonical URL of `https://chartrank.app` and full Open Graph and
Twitter card metadata, but there is no deploy config, no CI, and no hosting setup in the
repo. Either the site is deployed by hand from somewhere undocumented, or the metadata is
aspirational. Worth recording which.

**Resolved 1 August 2026.** A Cloudflare **Worker** named `spotifyfilter` (not Pages),
account `c0c4d779fc335131d032626be2631379`. Every deployment is `Source: Upload`, so it
is deployed by hand and **there is no git integration**. Live version dates from
**31 March 2026**, so the public site is four months stale and predates every fix in this
session.

`wrangler.jsonc` now exists on `main` (it was only on the unmerged
`origin/cloudflare/workers-autoconfig` branch, so `wrangler deploy` from `main` failed),
and `deploy.sh` stages an 11-file allowlist into `public/`.

Two findings worth keeping: `assets.directory: "."` would upload the 106 MB `data.json`
and blow the 25 MiB cap, and `.assetsignore` does **not** filter on wrangler 4.118,
verified with an isolated test where adding it increased the file count.

### G-8. Spotify embeds are dark-only, and there are two per row `OPEN` `DECISION`

The user reports the preview cards stay dark in light mode. Verified directly against
`open.spotify.com/embed/track/...`: all three variants (`theme=0`, no theme, `theme=1`)
ship `encore-dark-theme`. There is no light embed. `theme=0` gives a flat dark
background; omitting it uses an album-art tint (e.g. `rgba(8,32,64)` for BIRDS OF A
FEATHER), which is still dark but coloured per track.

Separately, `render()` builds **two** iframes per song, one for the desktop table and one
for the mobile card, and CSS hides one set at the 768px breakpoint. That is 20 Spotify
embeds constructed per page to show 10.

Both point at the same fix: replace the always-on iframe with a lightweight row that
loads the embed on click. That would resolve the light-mode appearance and halve or
better the embed cost. Tagged `DECISION` because it changes the interaction model.

---

## Insights

### I-1. The dataset is 20x larger than previously documented

318,431 songs, not the "~15k+" the old `CLAUDE.md` claimed. This changes the calculus on
anything that iterates the full array, which is why R-1 matters.

### I-2. The artist index is hard-capped by the scrape, at 2,999 keys

Every artist name in the data originates from the 3,000 artists `scrape.py` visited, so
the searchable set can never exceed that. Featured artists are findable only if they are
themselves in the top 3,000. Broadening coverage means raising `MAX_ARTISTS` and
re-scraping, nothing else.

The 2,999 versus 3,000 gap is comma-splitting and case-folding collisions, per B-1.

### I-3. `popularity` decays into noise as the data ages

`dailyStreams / totalStreams` is a momentum measure. It only means anything when the
daily figure is recent. It is the metric most damaged by T-1 going unaddressed, and it
was once the app's default sort (R3.2) before the pivot moved it to third.

### I-4. Raw scraper output is 36.5% larger than what ships `UPDATED`

Measured 31 July 2026: `scrape.py` produces 507,226 records; `cleanup.py` ships 321,878.
The 185,348 difference is 175,256 records under `MIN_TOTAL_STREAMS` plus 10,092 absorbed
by fuzzy dedup. Songs go down to 88,533 streams in the raw file.

Preserved at `snapshots/2026-07-31-raw.json.gz` (28,628,841 bytes). This matters because
future stream-delta work must key on raw pre-merge track IDs: the `STREAM_TOLERANCE`
clustering can flip which URL represents a song between runs, which would silently
poison every delta.

`data.json` itself is untracked and there is no `.gitignore` (G-4), so it is one stray
`rm` from being unrecoverable without a 60-minute rescrape.

The older v1 copy at `../projects/spotify filter/spotify_filter_v1/data.json` still
exists, 96,959,673 bytes, dated 28 March.

### I-6. Brand green cannot be used for text `NEW`

`#1DB954` measures **2.50:1 on the light background**, failing WCAG AA for text (4.5:1)
and even the 3:1 non-text minimum. It is fine as a fill with `#0a0a0a` on top (7.66:1).
The palette therefore splits it: `--accent` for fills in both themes, `--accent-text`
(`#0F7536` light at 5.61:1, `#1DB954` dark at 7.24:1) wherever green is text or an icon.
Recorded as SD-16, because the instinct to write `color: var(--accent)` will recur.

### I-5. The iframe teardown is non-obvious and easy to "clean up"

Blanking `src` before `remove()` ([app.js:178-179](app.js#L178-L179)) looks redundant.
Removing a node should be enough. It is not: Spotify embeds hold audio resources that
survive detachment, and playback dies after a few page turns. This is recorded as SD-3
precisely because it looks like dead code to anyone refactoring.
