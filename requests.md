# Request log

Every request made on this project, oldest first.

**Read this file before acting on a request that appears to clash with existing
behaviour.** Start with the Standing Decisions table below. If a new request contradicts
a recorded decision, name the earlier request explicitly and say what is being reversed
before proceeding.

This file is updated after every request. See the maintenance protocol in `CLAUDE.md`.

---

## Standing decisions

The fast conflict check. Each row is a deliberate choice that should not be reversed
silently.

| # | Decision | Set by | Why |
|---|---|---|---|
| SD-1 | Vanilla frontend. No frameworks, bundlers, or package managers. | R1.1 | Standing constraint from the first request, recorded as a convention. |
| SD-2 | Sliders are bucket-based, never continuous. | R1.3 | A linear 0 to 5B range is unusable. |
| SD-3 | `PAGE_SIZE` is 10, and iframes must have `src` blanked before removal. | R5.2 | Spotify embeds stop playing without this. Both halves are the fix. |
| SD-4 | Data ships gzipped; the browser decompresses with `DecompressionStream`. | R4.1, R4.2 | 97 MB raw is unshippable. Native API, no library, keeps SD-1. |
| SD-5 | Songs under 1M total streams are excluded. | R4.3 | Long tail is noise. |
| SD-6 | The app is artist-first. No global song search. | R6.1 | The 31 March pivot. This is the product. |
| SD-7 | Featured artists are indexed under their own name. | R6.3 | Searching a feature should find the track. |
| SD-8 | Stream range sliders are hidden but their code stays in the tree. | R7.2 | Removal was explicitly scoped to the UI, not the logic. |
| SD-9 | Sort options are descending only. | R3.3 | Six options was clutter. |
| SD-10 | Default artist is Billie Eilish and must match `PRELOAD`. | R6.5 | Empty state would otherwise render nothing. |
| SD-11 | `CLAUDE.md`, `requests.md`, `MISC.md`, `ascii-requests.md` and `ascii-structure.md` are updated after every request. | R10, extended R20 | Explicit instruction, 31 July 2026; two ASCII views added 1 August. |
| SD-12 | Significant technical decisions are presented as 2 to 4 compared options; the user chooses and reasons before any recommendation. | R11 | The user is using this project as a learning channel. |
| SD-13 | Artist names travel as structured `leads` / `features` arrays, never as a parsed display string. | R12 | Joining on `", "` is lossy for names containing commas. Chosen for robustness. |
| SD-14 | **Amends SD-6.** A capped Global chart (top 1,000 by the selected sort) exists alongside artist selection. Free-text song search stays removed. | R16 | Artist-first remains the product; an uncapped 318k list is not. |
| SD-15 | Light is the default theme. `prefers-color-scheme` wins by default; an explicit toggle choice overrides and persists. | R16 | User request. Three-state toggle resolves "device wins" vs "manual override". |
| SD-16 | `#1DB954` is a FILL only, never text. `--accent-text` carries the readable green. | R16 | The brand green is 2.50:1 on white, failing WCAG AA for text. |
| SD-17 | Spotify's wordmark is not used. Weekly refresh runs on GitHub Actions, not Cloudflare compute. | R16 | Trademark exposure; no CF product can hold a 40 to 75 minute job. |
| SD-18 | The `artistNamesFor()` legacy fallback is permanent, not transitional. | R16 | Archived snapshots predate `leads`/`features` and are the time-series anchor. |
| SD-19 | The generated surface (artist pages, shards, sitemap) and `data.json.gz` are **never committed**. Every deploy builds them first. | R19 | Measured 154 MB per build; committing weekly is ~8 GB/year and git never reclaims deleted blobs. |
| SD-20 | The Cloudflare **Workers Builds git integration must stay disabled**. Deploys come from `deploy.sh` or CI. | R19 | It only sees the repo, which by SD-19 has no data. It would publish a broken site on every push. |
| SD-21 | `slugs.json` is append-only. A name's slug is never reassigned. | R19 | A changed slug destroys its own URL, backlinks and rankings. |
| SD-22 | Spotify embeds are left exactly as they are, dark in both themes. | R19 | Verified: no light embed exists. User chose to leave it. |

---

# Part 1: Reconstructed history (28 to 31 March 2026)

**These are not verbatim prompts.** The original Claude Code transcripts were auto-deleted
by retention cleanup before they could be recovered. Everything below is inferred from
the 10 commits in `git log` and their diffs, a snapshot of the 28 March end state at
`../projects/spotify filter/spotify_filter_v1/`, and conventions frozen into `CLAUDE.md`.

Confidence is marked **high** (the diff shows a deliberate change only an explicit
instruction explains), **medium** (change is clear, phrasing or motivation is a guess), or
**low** (speculative).

Only the commit messages are genuinely the user's words.

## Session 1: Saturday 28 March, ~00:15
Commit `c1e63b2` "initial"

**R1.1 Build the frontend** (high on substance, medium on wording)
> Build a web app that lets me search and filter Spotify songs by stream count. Dark
> Spotify-style theme. Vanilla HTML/CSS/JS, no frameworks or build step. Load the data
> from data.json.

A complete working app lands in one commit: app.js 301 lines, index.html 91,
styles.css 463. Spotify wordmark SVG in `#1DB954`, Inter font, title "Spotify Stream
Filter". `data.json` is already present but `scrape.py` is not, so the scraper existed
untracked beforehand.

**R1.2 Range sliders, not text boxes** (high)
> Use dual-handle range sliders for the stream filters.

Paired `#total-min` / `#total-max` inputs over a `.slider-track` with `.slider-fill`,
roughly 100 of the 463 CSS lines. Nobody builds a dual-thumb slider by default.

**R1.3 Make the sliders bucketed** (high)
> The sliders should step through buckets, not be continuous. Going from 0 to 5 billion
> linearly is useless.

`TOTAL_BUCKETS` / `DAILY_BUCKETS` arrays with the range inputs indexing into them
(`min="0" max="11"`). Later codified in `CLAUDE.md` as a convention, which suggests a
correction rather than the original build.

**R1.4 Mobile layout** (medium)
> Make it work on mobile.

768px breakpoint swapping table for cards, with a separate `mobileCards` render path.

## Session 2: Saturday 28 March, morning to 13:33
Commit `af1d877` "deduplication script and new sort by options"

**R2.1 Write the scraper properly** (high)
> Write a scraper for kworb.net. Get the top 3000 artists, then every song for each
> artist. Make it resumable so I don't lose everything if it dies halfway.

`MAX_ARTISTS = 3000`, `scrape_progress.json` written between artists and deleted on
success. Resumability is not added unprompted.

**R2.2 Don't hammer the site** (high)
> Add a delay between requests and retry on failure.

`REQUEST_DELAY = 0.75`, `MAX_RETRIES = 3`, `RETRY_BACKOFF = 2` as named constants. The
oddly specific 0.75 reads like a chosen number.

**R2.3 Handle featured artists** (high)
> kworb marks features with an asterisk. Combine them so a song shows up once, as
> "Lead (feat. X, Y)", instead of once per artist page.

`CLAUDE.md` spelled out the exact rule including the `*` marker, a kworb implementation
detail.

**R2.4 There are still duplicates** (high)
> Same song is still showing up multiple times with slightly different stream counts.
> Write a cleanup pass.

The commit's headline. `cleanup.py` is a separate post-scrape script, which is what you
get when the problem surfaces after the scrape. `STREAM_TOLERANCE = 0.02` is a fuzzy
match: same normalized title, counts within 2 percent, treat as one.

**R2.5 Fix the mangled characters** (high)
> Some titles have garbled characters.

`fix_encoding()` plus `unicodedata`. The script spot-checks for "ñ", suggesting a
concrete pasted example.

**R2.6 Add a popularity metric** (high that it was asked, medium on framing)
> Add a way to find songs that are blowing up right now, not just ones with big lifetime
> totals.

`popularity = dailyStreams / totalStreams * 1,000,000`. A derived field nobody adds
unprompted.

**R2.7 Add sort options** (high)
> Let me sort by total streams, daily streams, or popularity, both directions.

`#sort-select` with six options, three keys times two directions.

**R2.8 Extend the slider range** (high)
> The top of the total streams slider is too low.

`TOTAL_BUCKETS` gains 2B and 5B; max index 11 to 13; label "1B+" to "5B+". Real data
arrived and the ceiling was wrong.

**R2.9 Document the project** (high)
> /init

`CLAUDE.md` enters the repo in standard `/init` shape.

## Session 3: Saturday 28 March, 13:33 to 16:15
Commit `70c0ca0` "cosmetic"

**R3.1 Long titles break the table** (high)
> Titles and artist names are too long, they're wrecking the layout.

New `truncate(str, max)` with hover-title overflow. 45 chars for title, 35 for artist.
Two different limits means someone was eyeballing the real table.

**R3.2 Default to popularity** (high)
> Default the sort to popularity, and hide the tiny songs by default.

`sortKey` to `'popularity'`, plus `DEFAULT_TOTAL_MIN = 7` (commented `// 5M`) so the min
slider starts at 5M. A new 2M bucket is inserted so index 7 lands cleanly on 5M.

**R3.3 Too many sort options** (high)
> Six options in that dropdown is clutter, I only need descending.

Six options collapse to three, all `-desc`.

## Session 4: Saturday 28 March, 16:15 to 16:42
Commit `1686686` "testing compression"

**R4.1 The data file is enormous** (high)
> data.json is 97MB, the page takes forever. Can we compress it?

96,959,673 bytes to 17,586,057 gzipped, an 82 percent reduction. `data.json` leaves the
repo; `cleanup.py` writes gzip directly.

**R4.2 Decompress in the browser** (high, implied by R4.1)

`res.json()` swapped for `DecompressionStream('gzip')` piped through `res.body`. Native
API, no library, consistent with SD-1.

**R4.3 Drop the long tail** (high)
> Cut anything under a million streams, it's noise.

`MIN_TOTAL_STREAMS = 1_000_000` as an explicit filter step.

## Session 5: Saturday 28 March, ~19:35 to 20:30
Commits `005ade7`, `de6f55e`, `5f900b9`

**R5.1 The page is blank while loading** (high)
> There's a long blank period on load. Show something immediately.

`PRELOAD` inlined into app.js, rendered instantly, then replaced by the real fetch.
Slider setup moves before the fetch so controls are live during loading. The preload was
a snapshot of the popularity sort at that moment, which is why it was almost entirely
BTS.

**R5.2 Songs won't play** (high, nearly quoted)
> The Spotify embeds glitch out, songs don't play when I page through.

The commit message says it: "reduced display number to help with spotify iframe glitch
song not playing". Two changes: `PAGE_SIZE` 20 to 10, and explicit iframe teardown
blanking `src` before `remove()`. That specific ordering is the fix for Spotify embeds
leaking audio contexts, so this took debugging rounds.

**R5.3 Name it and add meta tags** (high)
> It's called ChartRank, it'll live at chartrank.app. Add proper title, description,
> Open Graph and Twitter cards.

Canonical URL to a specific domain means the domain was yours.

**R5.4 Clarify the popularity label** (high)
> Make it clearer that popularity is a ratio.

A one-character commit: "Daily/Total Streams" becomes "Daily ÷ Total Streams".

## Gap: 29 to 30 March

`spotify_filter_v1` snapshot taken 29 March ~15:08, matching the 28 March end state.
Nothing committed for two days. Looks like a deliberate save point before the rewrite.

## Session 6: Tuesday 31 March, ~00:21
Commit `14a1558` "artist pivot"

**R6.1 Reframe the whole app around artists** (high on substance, medium on the "top 10"
framing)
> Change the angle. Instead of searching all songs, pick an artist and see every song
> they have, ranked. That's the actual use case, going past the top 10 Spotify shows you.

The largest commit after the initial build and a genuine pivot. `#search-input` over all
songs is replaced by `#artist-input` autocomplete. New state `artistIndex`,
`selectedArtist`, `highlightedIdx`; new functions `buildArtistIndex()`,
`parseArtistNames()`, `songsForArtist()`, `selectArtist()`. Results line changes from
"Showing 1-10 of N results" to lead with the artist name and say "songs". Your own commit
message calls it a pivot.

**R6.2 The artist dropdown** (high)
> Typeahead with song counts, keyboard navigable.

`#artist-dropdown`, ~85 lines of new CSS, `highlightedIdx` for arrow-key handling,
per-artist counts from `artistIndex`.

**R6.3 Features count as the artist** (high)
> If someone is featured on a track it should show up under their name too.

`parseArtistNames()` splits "Drake (feat. WizKid, Kyla)" into three names (that exact
example is the code comment) and indexes all of them.

**R6.4 Sort default back to totals** (medium)

`sortKey` reverts to `'totalStreams'`. Within one artist's catalogue, lifetime totals are
the natural ranking. May have been a consequence of the pivot rather than an instruction.

**R6.5 Default to a real artist** (medium)

`DEFAULT_ARTIST = 'Billie Eilish'`, `PRELOAD` regenerated as her top 10 by total streams.
An empty artist box would show nothing.

## Session 7: Tuesday 31 March, 00:41 and 02:33
Commits `4fe1dc4`, `61c15d8`

**R7.1 Rewrite the copy for the new angle** (high)
> The meta tags still describe the old version. Rewrite them.

6 insertions, 6 deletions, all in `<head>`. Twenty minutes after the pivot.

**R7.2 Hide the stream sliders** (high on the instruction, medium on "don't rip it out")
> The sliders don't make sense now that you're looking at one artist. Hide them, but
> don't rip the code out.

`SHOW_STREAM_SLIDERS = false` added as a flag, markup removed, but `setupSlider()` kept
under a comment naming the flag. If the ask had been "delete", the function would be
gone. Net 77 removed against 9 added.

**R7.3 Collapse the filters behind a toggle** (high)

`#filters-toggle` controlling a `#filter-row` that starts hidden. Sort is all that
remains inside.

---

# Part 2: Verbatim log (31 July 2026 onward)

Entries below are actual requests, recorded as made.

## 2026-07-31

**R8. "can you find the previous requests used to build this app?"**

Searched `~/.claude/projects/-Users-David-Desktop-spotify-filter/` (only today's
transcript), `.claude.json` project history (0 entries), `~/.claude/history.jsonl`,
`~/.claude/file-history/`, `~/.claude/backups/`, and Cursor and VS Code
`workspaceStorage`. Grepped all transcripts for `kworb` and `spotify_filter`.

**Outcome:** not recoverable. The app was built 28 to 31 March 2026 and Claude Code
retention purged those transcripts; `~/.claude/.last-cleanup` shows a run on 31 July at
14:27, and every surviving session across all 43 projects is from July. Offered to
reconstruct from git plus the v1 snapshot instead.

No code changed.

**R9. "Sure, let's call it requests.md"**

Reconstructed the March history into `requests.md` from commit diffs and the
`spotify_filter_v1` snapshot, with confidence tags and an explicit statement that the
prompts are inferred rather than verbatim.

No code changed.

**R10. "Create log of all requests that i've made, a comprehensive app summary (app
summary should be CLAUDE.md), and a misc file where you can store
recommendations/todos/bugs/gaps/insights and other misc. Requests log should be read when
a new request seems to clash with existing behaviours. These files should be updated
after each new request"**

Set up the three-file documentation system:

- Restructured `requests.md` into this log, adding the Standing Decisions table as the
  conflict-check surface and splitting reconstructed history from the verbatim log.
- Rewrote `CLAUDE.md` as a comprehensive app summary and added the maintenance protocol
  at the top. The old version was stale in several places: it described the pipeline as
  `scrape.py → data.json → frontend` with no `cleanup.py` or gzip step, put the dataset
  at "~15k+ songs" when it is 318,431, omitted `popularity` from the schema, and listed
  bucket sliders as a live convention when they have been hidden since 31 March.
- Created `MISC.md` and populated it by auditing the codebase, recording 4 confirmed
  bugs, 5 gaps, 6 recommendations, and several insights.

No application code changed. Established SD-11.

**R11. "Teach me using compare-alternatives mode. Whenever we reach an important
technical decision: 1. Identify two to four realistic options. 2. Show a small code
example for each. 3. Explain when each option is appropriate. 4. Explain its main
disadvantages. 5. Relate the choice to my current project. 6. Ask me to choose and
explain my reasoning before recommending an option. Do not compare insignificant syntax
differences. Focus on decisions involving architecture, libraries, data storage,
security, performance, maintainability or deployment."**

Standing working-style instruction, not a code change. Recorded as SD-12, added to the
maintenance protocol in `CLAUDE.md`, and saved to memory so it survives this session.

Tagged the open items in `MISC.md` that meet the bar as `DECISION`: B-1 (comma artist
fix approach), R-3 (per-artist data files), R-5 (large binary in git), T-2 (deployment).
The remaining items are one-way fixes with no real trade-off and should just be done.

No application code changed. Established SD-12.

**R12. "c is most robust"**

Answer to the B-1 comparison presented in R11. Option C selected: emit structured `leads`
and `features` arrays from `scrape.py`, index those directly in the frontend, and stop
parsing artist display strings.

Recorded as SD-13. Recommendation given after the choice, per SD-12: agreed with C, with
the caveat that it cannot ship without the T-1 rescrape, and a compatibility shim
(`artistNamesFor()`) added to the plan so the code and data need not deploy together.
R-1 folds into the same change.

**R13. "yes"** (implement steps 1 to 3 of the proposed sequencing)

Implemented SD-13 across the pipeline. First code change of this session.

- `scrape.py`: `build_output()` emits `leads` and `features` alongside the display
  `artist` string. Docstring now states that `artist` is display-only and lossy.
- `cleanup.py`: added `parse_artist_string()`, `dedupe_names()`, and
  `merge_name_lists()`. Step 1 guarantees every record has structured fields,
  backfilling from the display string for legacy input, and applies `fix_encoding()` to
  the name lists too. Cluster merging carries the lists through with exact dedup only.
- `app.js`: added `artistNamesFor()` with the legacy fallback. `buildArtistIndex()` now
  stores `songs: []` per artist (folding in R-1) and `songsForArtist()` is a dict lookup
  returning a copy. Dropped the redundant `count` field for `songs.length`. Added a
  `buildArtistIndex()` call to the preload path, which is now required for correctness
  since lookup depends on the index.

Verified: index build 60 to 110ms over the live 318,431 songs, 50 consecutive lookups
under 1ms, no duplicate songs per bucket, returned arrays safe to sort in place. Against
a faithful upgrade of the dataset, "Tyler, The Creator" resolves to 192 songs and
"Earth, Wind & Fire" to 108, with the fragments gone. `cleanup.py` backfills 4,000/4,000
legacy records and preserves comma names through dedup.

The rescrape (T-1) was left to the user; the bug is not fixed for end users until it
runs. `MISC.md` updated: B-1 to `IN PROGRESS`, R-1 to `FIXED`, B-3 to `PARTIALLY FIXED`,
R-4 to `MITIGATED`.

**R14. "Ok it's running now in the background."**

The user started `python3 scrape.py` at 20:21 (T-1). No instruction given, so the window
was used to de-risk the run rather than to start new work.

Verified the scraper's parsing assumptions still hold against live kworb HTML, four
months after the last successful scrape: artists page yields 3,000 rows, the `*` feature
marker is still detected (50 of 254 songs on the probe artist), stream columns still
parse. Then dry-ran the full R13 pipeline on real scraped rows:
`build_output()` to `cleanup.cleanup()` to `buildArtistIndex()`, confirming
"Tyler, The Creator" survives with its comma intact at every stage and the fragments
never appear.

Cost: 3 extra requests to kworb against the scrape's own 3,000.

One observation, not a defect: with only one artist scraped, a song where that artist is
a guest yields `leads=[]` and `features=['Tyler, The Creator']`, and the display string
falls back to rendering features as leads. That is the documented edge case in
`build_output()` and does not occur in a full scrape, where the lead artist is also
visited.

No code changed.

**R15. Eight-part request: light mode with device precedence, remove the Spotify logo,
remove all em dashes, no favicon and near-zero SEO, weekly self-update on Cloudflare and
its cost, monetisation, "All" as an artist plus last week/month/year filters, and a load
flash.**

Scouted locally, then fanned out 11 agents (6 research, 4 adversarial verify, 1
synthesis) over Cloudflare cost, SEO, monetisation, kworb time-window availability, the
flash, and theming. Verifiers overturned 15 claims from the researchers.

Flagged two clashes before acting: "All" contradicts SD-6 (artist-first, no global
song list), and time-window filters are blocked on data that does not exist, since the
schema holds only lifetime and single-day figures.

Key findings: the only indexable URL is the homepage, which caps SEO arithmetically;
`#1DB954` is 2.50:1 on white and fails AA for text; no Cloudflare compute product can
hold a 40 to 75 minute job; Spotify's terms forbid reselling this data.

Fixed while the research ran: all em dashes removed from source, and B-2 (ampersands
double-escaping in the results header).

Decisions D1 to D8 were framed with options and no recommendation, per SD-12.

**R16. "D1. c / D5. a / D7. a"**

Implemented the three choices plus the outstanding light-mode and favicon work.
Global chart capped at 1,000 with the cap applied AFTER sorting, verified as 0/1000
overlap between sort orders (SD-14). Spotify wordmark replaced with a three-bar mark and
a full favicon set (SD-17). GitHub Actions weekly refresh with a 25 MiB size gate and an
SD-13 invariant check. Light theme via semantic tokens (SD-15), with the accent split
into fill and text variants (SD-16). Established SD-18: the `artistNamesFor()` legacy
fallback is permanent, because archived snapshots predate `leads`/`features`.

Verification checked that every CSS variable was defined and that no hardcoded colours
remained. Both passed. **Neither can detect a defined-but-wrong token**, and the release
shipped with `body { background }` resolving to `#0a0a0a` in both themes.

**R17. "why does index only have 10 songs when i open up, also light theme is still
mostly dark... these are pretty basic things you seem to have messed up on"**

Both reports correct. The light theme was mine: a scripted find/replace mapped
`var(--black)` to `--on-accent` globally, right for the three "text on a green fill"
uses and wrong for the page background. Auditing every substitution against
`git show HEAD:styles.css` found three more regressions.

The 10 songs were not a regression: browsers treat `file://` as an opaque origin and
block `fetch()`, so opening `index.html` from disk has never loaded the dataset.
`CLAUDE.md` claimed "no server needed"; I carried that into the rewrite untested and
handed it to six agents in R15 as a hard constraint.

Ran an adversarial hunt (5 lenses, 20 agents), 13 confirmed findings. Two were serious:
the render signature guard **never fired**, because `totalResults` changes 10 to 78
across the transition it guards, and `escapeHtml()` never escaped quotes, breaking the
`title` attribute on 2,197 rows including the default first page. Also fixed the light
elevation ladder and a focus ring that made controls less visible than at rest.

**R18. "spotify cards/previews are still dark in light mode. also how do i deploy to
cloudflare to update?" then "sure deploy"**

Verified directly that all three Spotify embed variants ship `encore-dark-theme`: there
is no light embed, and the iframe is cross-origin so its interior cannot be styled.

Identified the deploy target with `wrangler deployments list`: a Worker named
`spotifyfilter`, not Pages, last published 31 March. Every deployment read
`Source: Upload`, from which I concluded no git integration existed. **That was an
inference from a repo idle since March, not a verified fact, and R19 proved it wrong.**

Fixed two hard blockers: `main` had no `wrangler.jsonc`, and `assets.directory: "."`
would have uploaded the 106 MB `data.json`. `.assetsignore` was tested in isolation and
does not filter on wrangler 4.118.

Deployed `edd0ef82`, first publish since 31 March. The initial verification read
`cf-cache-status: HIT` and showed the old build; cache-busting was needed.

**R19. Workers Builds failure screenshot, plus G-8 leave as is, R-5 can we not delete
the old data, R-3 let's split, D4 what is the decision, and implement everything else.**

The build failure was mine twice over. A Workers Builds git integration does exist; it
had simply never fired on an idle repo. It failed in 0s because I had pointed
`assets.directory` at `./public` and then gitignored `public/`.

R-5: the premise does not hold. Deleting a file in a later commit reclaims nothing,
because git keeps every blob ever committed. Measured the generated tree at 154 MB
across 6,011 files, so committing weekly is roughly 8 GB of history per year. Resolved
as SD-19 (nothing generated is committed) and SD-20 (the git integration stays
disabled).

R-3: built `build_pages.py`, generating 2,998 artist pages with real crawlable text and
JSON-LD, per-artist JSON shards, a global chart file, an A-Z hub and a 3,000-URL
sitemap, on an append-only slug registry (SD-21). Rewrote the frontend data layer to
fetch a 45 KB index plus one ~7 KB shard, so the 19.6 MB monolith is no longer
downloaded at all.

D4 explained rather than decided. G-8 recorded as SD-22, embeds left alone.

Also shipped: og-image with `summary_large_image`, sort-on-change replacing the
redundant Apply button, mobile card titles, corrected empty-state copy, an explicit
unsupported-browser message, form labels, opaque maskable icons, and a narrower
`init()` try block.

Deployed `2d4c83e4`: 6,011 files, and the old monolith now 404s.

**R20. "Create log of all requests, a comprehensive app/architecture summary (CLAUDE.md),
and a misc file. Requests log should be read when a new request clashes. Create an
ascii-requests.md with an ASCII implementation activity diagram per request. Create 3
ASCII project structure diagrams of increasing granularity. Update all after each
request."**

The first three already existed from R10 and were verified current rather than rebuilt:
`CLAUDE.md` 435 lines, `MISC.md` 569, 22 standing decisions, 37 tracked items.

Added `ascii-requests.md` (one activity diagram per request; March grouped by session
since those are reconstructed, R8 onward individually) and `ascii-structure.md` (three
levels: four boxes, directories and jobs, then call graph and data flow).

**Found and repaired a real gap in this file.** `requests.md` ended at R14: the R15
append had anchored on text that did not exist and silently no-opped, which broke the
anchor for R16, and so on through R19. The Standing Decisions table meanwhile cited R16
and R19, because those edits anchored on real table rows and did succeed. Entries R15 to
R19 above were reconstructed from this session. The cause is the same failure mode
recorded in R17: an edit that was never asserted to have applied. Every documentation
write in this request asserts its anchor first.

Protocol extended from three files to five; SD-11 updated.
