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
| SD-5 | Songs under 1M total streams are excluded. **Amended R39:** except dated sub-1M songs young enough to be new releases, which feed the new-releases page only (`recent.json.gz`), never shards, artist pages, the index or the global chart. | R4.3, R39 | Long tail is noise; a week-old song rarely has 1M streams yet. |
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
| SD-19 | The generated surface (artist pages, shards, sitemap) and `data.json.gz` are **never committed**. Every deploy builds them first. | R19 | Measured 0.78 GB/year if committed vs 0.5 KiB/week as-is; git never reclaims deleted blobs. See I-7. |
| SD-20 | The Cloudflare **Workers Builds git integration must stay disabled**. Deploys come from `deploy.sh` or CI. | R19 | It only sees the repo, which by SD-19 has no data. It would publish a broken site on every push. |
| SD-21 | `slugs.json` is append-only. A name's slug is never reassigned. | R19 | A changed slug destroys its own URL, backlinks and rankings. |
| SD-22 | Spotify embeds are left exactly as they are, dark in both themes. | R19 | Verified: no light embed exists. User chose to leave it. |
| SD-23 | The global **popularity** chart only ranks songs with >= 400k daily streams (`POP_MIN_DAILY`). Other sorts and per-artist views are unfiltered. | R31 | popularity = daily/total explodes near the 1M total floor; user chose a daily floor over a total floor or damped ratio. |
| SD-27 | The Worker runs `worker/entry.js`, headcount's edge wrapper, for HTML paths only (`run_worker_first`); everything else is served straight from assets. Two plain JS modules, no build step. | R47 | David's own analytics, requested through his headcount session: "yes please include my custom analytics." |
| SD-26 | The homepage carries a crawlable link block (`<!-- browse -->` markers, rewritten by `build_pages.py`), `/top/` exposes the global chart as text, the sitemap carries `lastmod`, every deploy pings IndexNow, and the workers.dev hostname is off. Page titles follow how people search ("[artist]: most streamed songs on Spotify"). | R46 | Only the homepage was indexed (G-20): nothing linked to the artist pages and the titles matched no query. |
| SD-25 | Genre is per **artist** and every song inherits its first credited artist's genre. Wikidata first (exact join on Spotify artist ID, labels folded into 20 groups, country used to tell markets apart), Claude for the gaps, stored in the committed `genres.json`. | R43 | User chose Wikidata with Claude filling the gaps "if it's not too costly" over Apple, Claude-only, or Wikidata-only (R42). |
| SD-24 | Release dates come from the Spotify **embed page**, one fetch per track ID, into `release_dates.txt`, which is append-only and committed. The new-releases surface is a 7-day window (`NEW_RELEASE_DAYS`) behind a plausibility gate (`NEW_MAX_DECAY`, since Spotify re-dates singles to their album) and an edition-marker exclusion (`NEW_EDITION_MARKERS`, R36), shows the top 30 per sort including sub-1M songs (R39), and obeys the app-wide sort. A second, 30-day surface (`/new-30/`, `?artist=new-30`) sits beside the 7-day one; the 7-day one stays strict and shows however many qualify (R40). | R33, R36, R39, R40 | The Web API now needs Premium, lost batch `GET /tracks` and is retiring Client Credentials for metadata; the embed page needs nothing. User delegated the choice to research (R33) after the options were laid out in R32. |

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

**R21. "does the size of the repo grow or is it fine?" then "why does splitting up mean
only growing by a fraction in storage?" then "i still don't understand why splitting is
better for yearly storage"**

Answered by measurement, and the answer is that **splitting is not why storage is fine**.
Two orthogonal decisions had been presented as one: sharding the data (R-3) and no longer
committing generated output (SD-19). Only the second governs repo growth.

Measured: weekly commit cost under SD-19 is 0.5 KiB, over four simulated weeks with
stream numbers moving as in a real refresh. Committing the sharded tree instead would
cost 0.78 GB/year; committing the old monolith, 0.95 GB/year.

The user's intuition had a real basis, which the first answer wrongly dismissed: sharding
IS about 18% cheaper when committed, because git delta-compresses plain text across
revisions but cannot delta a gzip stream, so any change to the monolith rewrites the whole
blob.

Also found: the repo is already 95 MB, of which **99.7% is dead `data.json` blobs**
committed three times in March and since deleted. Git never reclaims those.

Two of my own figures were corrected: "~8 GB/year" (a `du` figure times 52, ignoring
zlib) and "~1.6 GB/year" (ignoring delta compression). Recorded as I-7.

No code changed.

**R22. "ok i get it, so because it is compressed that's the problem"**

Confirmed, with the scope corrected: pre-compression defeats git's delta compression and
explains the 0.95 vs 0.78 GB/year gap between the two commit-it options. It does not
explain why the repo is fine, which is entirely that neither is committed (SD-19).

Generalised into I-8: never commit a pre-compressed artifact to git. Store the
uncompressed form and let git compress it, or keep it out of the repo entirely.

No code changed.

**R23. "Can we see 50 songs per page please?"**

Clashes with SD-3, which pinned `PAGE_SIZE` at 10 after Spotify embeds stopped playing
(R5.2). Flagged before changing anything, per the maintenance protocol, then implemented.

`PAGE_SIZE` is now 50. To keep the embed count from doubling with it, `render()` no
longer builds both layouts: it builds only the one matching the 768px breakpoint,
includes the layout in the render signature, and rebuilds when the breakpoint is crossed.
That takes a 50-song page from 100 iframes to 50.

SD-3's other half is untouched: `src` is still blanked before any iframe is detached.

Recorded as G-9, status `NEEDS FIELD TEST`. The original bug appeared at 40 constructed
iframes, so 50 is above the level that once broke playback, and `loading="lazy"` was
already in place then and did not help. Not deployed; awaiting a decision after testing.

**R24. "billie eilish does not feature in sia's song 'the greatest'... what's happening
here?" then "just rescrape again. also: add buy me a coffee widget, remove em dashes,
button for random artist, other discover options?"**

Diagnosed as B-15: two different songs merged because the dedup compared title and stream
counts but never artist. Fixed with `shares_artist()`, verified on the exact case, and
measured at 9,962 songs recovered. Rescrape started (resumable; the first attempt died
because it was backgrounded inside a wrapper the harness tore down).

Added a "Surprise me" random-artist button, uniform across the index so it reaches the
long tail rather than reshuffling famous names. Smoke-tested over 40 clicks.

Added a footer with attribution to kworb and a Buy Me a Coffee slot. The link is injected
by `app.js` only when `BUYMEACOFFEE_USER` is set, which is deliberately empty, so the
site cannot ship a dead donate link. Awaiting the handle.

**Em dashes: declined, with reason.** The only five left in the project are inside real
song titles rendered into generated pages: "We Contain Multitudes [em dash] piano reworks", "[em dash]star.",
"[em dash] [DASH]". Editing them would falsify the data rather than fix the
writing. The style rule applies to prose we author; every such instance is already gone.

Discovery options beyond the random button were proposed rather than built.

**R25. "related artists sounds like a great idea."**

Built it from the artist's own shard rather than a new data file: a shard contains exactly
the songs that artist appears on, which is precisely their co-occurrence universe.
Verified to match `build_pages.py`'s whole-dataset computation byte for byte, so it costs
no extra file and no extra request. Chips are capped at 12, filtered to names the index
can resolve so none is a dead end, hidden for the global chart and when empty.

An adversarial review of the same changes then **overturned the dedup fix from R24**.

My `shares_artist()` gate rested on a premise I stated in a code comment and never
tested: "every duplicate this pass exists to remove is the same song by the same artist".
False. kworb lists a collaboration under a separate track ID on each artist's page, and
`scrape.py` credits each record only with the artists whose page carried that URL. So
Starboy exists twice, as `leads=["The Weeknd"]` and as `features=["Daft Punk"]`, with
byte-identical stream counts and no name in common. The gate blocked exactly the merges
it most needed to allow.

Measured: my fix put **88 duplicate rows in the global top 1,000** where the original rule
had 0. It was worse than no fix.

Replaced with `should_merge()`: a shared artist **or** totals within 1%
(`NEAR_IDENTICAL`). Near-identical totals are what actually separates "one recording
counted twice" from "two songs sharing a title". Measured across candidate thresholds:

| rule | songs | top-1000 duplicates |
|---|---|---|
| original | 321,878 | 0 |
| shares_artist only | 331,840 | 88 |
| shares OR within 1% | 323,152 | 0 |

**R26. "make it 30 on mobile" + the Buy Me a Coffee widget script. Then "ok pushed".**

Mobile was crashing: `PAGE_SIZE` 50 meant 50 Spotify embeds, `loading="lazy"` meant they
all loaded by the time you reached the bottom, and a phone tab has orders of magnitude
less memory than a desktop one, so the browser discarded and reloaded the tab. Desktop
was unaffected throughout. `pageSize()` now returns 50 on desktop and 30 on mobile,
resolved at render time and already covered by the breakpoint listener. 30 is below the
40 that broke in March, but not proven safe; G-8's click-to-load embeds remain the
durable fix.

Swapped the hand-rolled footer link for BMC's official widget script, on the main app and
on all generated artist pages, and removed the now-dead `support-slot` markup and
`.support-link` styles. Recorded as G-11: this is the site's first third-party script.

Then ran the full pipeline on the fresh scrape: 507,254 raw records to **323,251 songs**,
19,708,233 bytes (75.2% of the 25 MiB cap). All four invariants verified before deploying:
Starboy is one record crediting "The Weeknd, Daft Punk"; Sia and Billie Eilish are
separate; the global top 1,000 has **0 duplicate rows**; comma artists intact with
"Tyler, The Creator" at 195 and the fragments at 0.

**R27. "it's tuesday, can you check if website updated successfully yesterday?"**

Yes, and the week before too. Verified rather than assumed:

- `github-actions[bot]` commits on Mon 3 Aug and Mon 10 Aug, each followed by a Cloudflare
  deployment minutes later (03 Aug 09:08 UTC, 10 Aug 07:11 UTC).
- Data is genuinely fresh: **all 200** of the top-200 songs increased since the 1 August
  build. Blinding Lights 5,523,399,926 to 5,537,576,513.
- Every invariant survived the unattended runs: Starboy is one record, the global top
  1,000 has 0 duplicates, "Tyler, The Creator" resolves to 195 with fragments at 0.
- SD-21 held: **0 slugs reassigned** across runs; the registry grew 2,998 to 3,009 by
  appending 11 new artists.
- The commit contains only `public/app.js` and `slugs.json`, per SD-19.

One new finding, logged as G-12: 11 artists dropped out of the top 3,000, so their pages
now 404. The sitemap correctly drops them, and their slugs stay reserved, but externally
linked or already-indexed URLs are dead.

**R28. "why is 'global chart (all artists)' only 1k songs?"**

Question about SD-14, the user's own D1(c) choice from R16; answered rather than
re-litigated. Two layers: product (uncapped means 6,465 pages at 50/page; the cap was
chosen precisely so the surface stays a chart) and architecture (since R19 the browser
never downloads the full dataset; the global surface is a precomputed `data/global.json`
holding the top 1,000 **per sort**, 681 KB raw, and "all songs" would mean re-shipping
the ~20 MB monolith the split deleted).

Measured for the answer: the three sorts overlap far less than intuition suggests
(totals vs popularity 0/1000, totals vs daily 584/1000), so the surface actually exposes
2,371 distinct songs. Offered: raise the cap (cost is linear, ~680 KB per extra 1,000
across the three sorts) or relabel the row so "(all artists)" stops reading as "all
songs" (logged as G-13). No code changed.

Also found and repaired a protocol gap: `ascii-requests.md` had no diagrams for R21 to
R27. Same failure class as the R15 to R19 gap in this file. Backfilled.

**R29. "Since we have 3 different sort options, lets just get the top 1k for each of
those sort options (and don't display like for the other artists how many songs there
are in the dropdown)."**

The top-1k-per-sort behaviour already existed (SD-14; the cap is applied after sorting,
so each sort ships its own set in `data/global.json`). The change was the dropdown: the
global row no longer shows a song count, since "1,000 songs" described no real quantity.
Artist rows keep their counts. G-13's count half is resolved; the label itself stays.

**The turn's real work was what the request tripped over.** Local `data.json.gz` was
from 1 August while CI had refreshed the live site on 10 August, so a naive
`./deploy.sh` would have regressed the live data by nine days. Investigating that
exposed worse: `cleanup.py` (the `should_merge()` dedup fix) and `build_pages.py` (the
BMC widget) were **never committed**, so the 3 and 10 August CI runs used the old
pipeline. Verified live: the Sia/Billie chimera is back (`6bLopGnirdrilrpdVB6Um1`
credited "Sia, Billie Eilish" at 568,800,190 total with Billie's 302,997 daily; her own
`6TGd66r0nlPaYm3KIoI7ET` gone), and artist pages lost the widget. B-19.

Recovery, in order:
1. Pulled origin (bot commits; local `slugs.json` verified a strict subset first, 0
   mismatches, then discarded for origin's superset).
2. **Reconstructed the 10 August dataset from the live shards themselves**: union of all
   2,998 per-artist JSON files by URL, 322,541 songs. Fidelity proven three ways:
   `make_preload.py` on the reconstruction reproduces the bot's PRELOAD byte for byte;
   the rebuilt artist index is content-identical to live; the three global sorts match
   as sets except one genuine tie at rank 1,000 (both songs at 604,377 daily). Also
   recovers the 10 August time-series point (the 3 August one is lost; runner archives
   died with the runner).
3. Deployed: dropdown fix + widget restored to all artist pages + `data/meta.json`
   vintage stamp. Data content unchanged (still carries the gate-less chimeras until a
   fresh scrape runs through the fixed cleanup).
4. Guards so neither failure recurs: `deploy.sh` now refuses to deploy local data older
   than live (`--force` overrides); the CI sanity step asserts both "The Greatest"
   track IDs survive as separate records, so a gate-less cleanup fails the run instead
   of deploying; CI now uploads `data.json.gz` as a 90-day artifact, since the
   runner-local snapshot archive was dying with the runner (G-14).

The data heals on the next scrape through the fixed `cleanup.py`, which requires the
pipeline fixes to be **committed and pushed** first.

**User authorized the commit.** Pushed as `a5ff344` (10 files, +724/-12): pipeline fixes,
guards, workflow changes, dropdown edit, and docs R21 to R29. B-19 unblocks; the data
heals on the next scheduled run (Monday 04:10 UTC) or a manual workflow dispatch.

**R30. "For the results from the popularity filter on the global artists, should we add
a minimum number of daily streams eg 400k? or what would be recommended?"**

Measured before opining. The noise is the denominator, not the numerator: at the SD-5
floor (1M total), popularity equals dailyStreams, so the global popularity chart is
dominated by whatever just crossed 1M total (703/1000 rows under 5M total; the top is
live-album re-releases with 180 to 300k daily). Consequently a daily floor below ~200k
does not change the top at all, and at the user's proposed 400k only 1,935 songs
qualify, making the chart 55% identical to the daily chart. Alternatives measured: a
total-streams floor (>= 20M: clean "surging new hits" top, Ariana Grande album tracks)
and a damped ratio daily/(total+K) (smooth, but the client re-sorts global rows by raw
popularity, so it needs an app.js change to respect server order). Options presented per
SD-12 with numbers and code; recommendation held until the user chooses. Logged as R-6.

**R31. "let's implement A"**

Implemented the user's choice: `POP_MIN_DAILY = 400_000` in `build_pages.py`, applied
only to the global popularity pool before sorting. Per SD-12 the held recommendation was
stated after the choice (B, for distinctness from the daily chart) in one line, then A
built as asked. No `app.js` change needed: the client re-sort uses the same key over the
same pool, so server order is preserved.

Verified rebuilt and live: 1,000 rows, minimum daily 400,051, ordered by popularity,
top = 'Te Estoy Correteando' / LATIN MAFIA; overlap with the daily chart 551/1000
exactly as measured in R30; totalStreams and dailyStreams charts byte-order unchanged.
Deployed as `16de7573`. Recorded as SD-23; committed and pushed so Monday's CI run
builds with the floor (the B-19 failure class).

**R32. "Just wondering if the release date is available to be scraped somehow for each
song?"**

Question only, no code changed. Checked at the source rather than from memory:

- kworb's artist songs page (the one `scrape.py` reads) has no date column: headers are
  Song Title, Streams, Daily. kworb's per-track chart-history page has dates, but they
  are chart-entry dates, not release dates; a 2019 song that re-charted in 2025 shows
  2025.
- Spotify's oEmbed endpoint returns title and thumbnail only.
- Spotify's embed page (`open.spotify.com/embed/track/<id>`, the same URL every row
  already loads as an iframe) embeds a `__NEXT_DATA__` JSON blob containing
  `releaseDate.isoString`. Verified on three tracks, 200 with no auth and no
  User-Agent, ~10 KB, 0.2 to 0.5 s each. Undocumented and unversioned.
- Spotify Web API `/v1/tracks?ids=` (50 per call) returns `album.release_date` with a
  precision field. Needs a free developer app and a client-credentials token.

Cost either way is one request per song, and the dataset is 323k songs (507k raw), so
a full backfill is ~3 hours at the API's batch size or ~40 to 70 hours at one embed
fetch per song; after that only new tracks need fetching each week. Presented as
options per SD-12, recommendation held. Logged as R-7 (`DECISION`) in MISC.md.

**R33. "Please do some research to find the best option and then apply it, keeping in
mind that the database is updated every week... Want to add a page that shows the most
popular that were released in the last week using either daily or total streams, or
something else you'd recommend."**

The user delegated the R32 choice to research rather than picking, which satisfies
SD-12: the options were on the table first. Research, all verified rather than
recalled:

- **Web API, closed in practice.** Spotify's February 2026 Development Mode changes
  (migration guide, TechCrunch): the app owner needs an active Premium subscription,
  one Client ID per developer, five users, and the batch `GET /tracks` endpoint is gone
  ("fetch items individually instead"). Spotify also says it is "moving away from the
  Client Credentials flow for metadata endpoints". So the API would be one request per
  track anyway, plus a secret in CI and a subscription dependency.
- **Embed page, chosen.** `open.spotify.com/embed/track/<id>` inlines `__NEXT_DATA__`
  with `entity.releaseDate.isoString`. No auth, no User-Agent, ~11 KB gzipped. Rate
  limit measured on the day: a burst at ~9/s drew 429s after ~190 requests and cleared
  within a minute; 2/s for 300 and 3/s for 400 requests drew none. Consistent with a
  ~200-per-minute bucket. Pace set to 3/s with a shared pause on 429.
- **The full track page** has an Open Graph `music:release_date` meta tag, so it is a
  documented-ish fallback, but it is 305 KB against 11 KB.
- **kworb** has nothing: the songs page is title/streams/daily, the track page is
  chart-entry dates.

**Built.** `release_dates.py` between scrape and cleanup, `release_dates.txt` registry
(append-only, committed, SD-24), `releaseDate` on every record (earliest across a
merged cluster), `data/new.json` plus a crawlable `/new/` page from `build_pages.py`, a
`__new__` surface in the app mirroring the global chart (dropdown row, `?artist=new`
deep link, results line naming the window), a **Released** column on every table row
and mobile card, and a CI step with `continue-on-error` so a broken fetch cannot block
the stream refresh. `make_preload.py` inlines the date and the render signature
includes it, so the preload rows rebuild once the dated shard lands.

**Fetch order is popularity descending**, which is the trick that makes a weekly
budget work: a song a few days old has a daily/total ratio no back-catalogue track can
reach, so the ~1,650 IDs new each week (measured: 32,079 new URLs over the 19 weeks
between the March and August snapshots) and every plausible new release are fetched
before anything else. CI's budget is 6,000 per run (~33 min); the ~332k cold backfill
runs locally, resumable, about 31 hours at 3/s.

**Ranking metric.** The user offered daily or total streams. Measured on the August
data among songs with total/daily under 10, a proxy for "released this week": the top
30 by total and by daily share 27 rows, and the top 10 share 9. Every song in a 7-day
window has had about the same number of days on sale, so the two orderings almost
coincide. The surface therefore obeys the app-wide sort like every other view, default
total streams, and daily is one change of the select away. A streams-per-day-since-
release metric was considered and parked (MISC R-8): it would only matter for a wider
window.

**Re-dated singles, found on the first dated build.** 28 songs sat in the window and
the top one by total streams was a Taylor Swift single with 265M streams, "released"
five days earlier: Spotify relinks a single's track ID to the album version when the
album drops, so the single inherits the album date. Measured `total / (daily * days)`
across the 28: genuine releases 1 to 9, pre-release singles absorbed into an album 10
to 18, older songs 35 to 68. `NEW_MAX_DECAY = 10` in `build_pages.py` gates on that
ratio and cut the pool to 13, dropping 15. The build logs the top five it drops.

**Window.** 7 days ending at the data date. The refresh runs Mondays and releases
land on Fridays, so the window holds exactly one release day plus its weekend. Wider
windows are a one-constant change.

Verified locally before the fresh scrape: cleanup and build run end to end, the table
shows the Released column and the card the Released line in headless Chrome at 1400px
and 400px, the `?artist=new` deep link renders with a surface-specific empty state.
**Closing note, 1 October 2026 00:15.** Fresh scrape: 511,148 raw records, 326,703
songs after cleanup, `data.json.gz` 20,064,077 bytes (76.5% of the cap, up from 75.0%
with the new field on 4% of rows; expect roughly +1 MB once every row is dated). Raw
archived as `snapshots/2026-09-30-raw.json.gz`, cleaned as `snapshots/2026-09-30.json.gz`.
Deployed as version `689c40f1`; verified live: `data/meta.json` carries the new
vintage, `/new/` returns the page, `data/new.json` holds 13 songs for 23 to 30
September, `app.js` has the surface, the sitemap lists `/new/`. The local backfill was
restarted against the fresh scrape and is running at 3/s with no 429s; the committed
registry is a snapshot of it. See T-4 in `MISC.md` for the one thing left to do when
it finishes.

Also corrected two stale statements in `CLAUDE.md` noticed while editing: page size is
30 per device, not 10, and sort applies on change, there is no Apply button.

**R34. "What are the cost implications of this now and in the future?"**

Question, answered with measurements (1 October 2026). Money: none, now or projected.
The repo is public, so Actions minutes and artifact storage are free; the Worker is on
the free plan and static asset requests are not metered. Measured costs are time and
bytes: CI gains ~10 min a week once the backfill is complete (1,650 IDs at 3/s), up to
33 min while it is not, on top of runs that already take 81 to 91 min (job timeout 180).
`release_dates.txt` is 10.9 MB of text when complete, ~6.4 MB in git, growing 56 KB a
week. `data.json.gz` goes from 20.06 MB to ~21.35 MB when every row is dated, which no
longer matters for deployment because it has not been a deployed file since the shard
split (SD-19): the largest deployed file is `global.json` at 696 KB. The embed fetches
cost ~3.5 GB of transfer once and ~18 MB a week. The only path to a monetary cost is
Spotify closing the embed page, where the fallback is the Web API behind a Premium
subscription.

Found while measuring: the local backfill had died at 51k of 322k IDs on an
`http.client.IncompleteRead` that the fetcher did not catch (`HTTPException` is not an
`OSError`). Fixed, restarted, committed as `2b38e75` and pushed. Also corrected the
`CLAUDE.md` claim that the 25 MiB cap applies to `data.json.gz`.

**R35. Screenshot of "ALL WHITE REMIX (feat. Conep, VEI HABACHE) - BONUS" at #13 in new
releases, dated 24 Sep 2026: "This song was released over a month ago, but now appears
in the new releases tab..."**

Diagnosed, no code changed. The track ID in the dataset is the "BONUS TRACK" edition,
and Spotify's embed page genuinely dates that ID 24 September: the song is a month old,
the edition is a week old. The ID is absent from every local snapshot (the original
never reached 1M streams, so it was never in the dataset), and its decay ratio is 7.0,
inside the band genuine album tracks occupy (1 to 9), so neither the plausibility gate
nor a history check can separate it. This is the residual class the R33 gate does not
cover: a new edition of an older song that accumulates streams exactly like a new
release. Options presented per SD-12 (tighten the gate, a title-marker exclusion, or
accept Spotify's definition); awaiting the user's choice. Recorded as G-18.

**R36. "sure let's do option 1"**

`NEW_EDITION_MARKERS` in `build_pages.py`: titles containing remix, bonus, reimagined,
deluxe, live, acoustic, sped up, slowed, version, edit, remaster, instrumental or demo
are dropped from the new-releases pool, alongside the decay gate. Rebuilt: 12 songs,
the bonus-track remix gone, nothing else affected. Deployed and verified live. SD-24
amended to mention the exclusion.

**R37. "Progress report?"** (new session, model switched to Opus 5.5)

Status only. The local backfill was at 250,402 of 285,270 IDs on 2 October at 09:46,
3.0/s, zero 429s in 22 hours (one grep hit for "429" was the digits of an ETA), about
3 hours remaining. Registry 301,391 lines, 128 of them undated. Every commit is
pushed; the only working-tree change is the growing registry, which T-4 commits when
the run ends. Corrected stale `CLAUDE.md` figures: `PACE` is 3.0 and `MAX_FETCHES`
6,000 in the code (the docs still said 2.0 and 5,000 from before the pace probe), and
the dataset facts table now reflects the 30 September scrape.

**R38. "progress report?"** (3 October)

The local backfill had finished on 2 October at 13:01: 285,270 IDs in 26.5 hours,
285,132 dated, 138 undated, zero 429s, no crash after the B-20 fix. Registry verified
(336,259 lines, no duplicates, no malformed lines) and measured at 99.95% coverage of
the 30 September scrape's IDs at or above 1M; the 2 missing were transient failures,
retried next run. Committed and pushed `release_dates.txt`, closing T-4 two days before
the Monday CI run. Not rebuilt or redeployed: Monday's run rebuilds from the committed
registry and fills the Released column site-wide, and a local rebuild today would move
the new-releases window (G-17) unless the data file's mtime were pinned.

**R39. "For new releases in the last 7 days should see top 30 please."**

**Clash flagged before acting: SD-5 (R4.3) excludes songs under 1M streams.** The page
showed 12 because only 12 qualifying songs released in the window had passed 1M.
Reaching 30 inside 7 days needs sub-1M songs, so SD-5 is amended for this page only;
the alternatives (wider window, looser filters) contradict the request or R33/R36.

Built: `release_dates.py` also dates sub-1M records with total <= 80 x daily (the
widest ratio the decay gate can pass in an 8-day window): 1,291 fetched in 7 minutes.
`cleanup.py` dates records before the threshold and writes those candidates to
`recent.json.gz` (1,287, 83 KB); `build_pages.py` merges them into the new-releases
pool only and ships the union of the top 30 by total and by daily; `app.js` caps at
`NEW_CAP = 30` after sorting, like the global chart. Copy no longer says "at least a
million streams".

**Result: 21 songs, not 30.** 11 above 1M, 10 below. Measured why: of the 1,290 young
sub-1M candidates only 10 were released in the window; 80 were 8 to 14 days old and
289 were 15 to 30. kworb adds new tracks to artist pages with a lag of about a week,
so a 7-day window sees only the fastest-listed songs. Pool sizes on the same data:
7 days 22 (simulated, 21 built), 10 days 25, 14 days 211; 7 days with the decay gate
at 20 instead of 10: 29, by readmitting pre-release singles R33 excluded on purpose.
Options for the gap presented per SD-12; awaiting the user's choice (MISC G-19).

Also, since the registry backfill is complete, this rebuild dates 99.96% of rows, so
the deploy filled the Released column site-wide two days before Monday's CI run.
`data.json.gz` rose to 21.7 MB (82.7% of the vestigial cap). Deployed as `c3d6ffe1`;
verified live: `new.json` 21 songs (10 below 1M), Billie Eilish shard 78 of 78 dated
with no sub-1M rows leaking in, `app.js` carries `NEW_CAP`, data vintage unchanged. Built with the data
file's mtime pinned to the 30 September vintage so the window did not move (G-17).

**R40. "Add a new page for 30 days also then"**

The user's answer to G-19: keep the 7-day page strict (it shows however many qualify,
21 this week) and add a 30-day page beside it. Not a clash: it adds a surface and
reverses nothing.

Built: `NEW_WINDOWS` in `build_pages.py` drives both surfaces through one code path
(`new_releases(songs, date, days)`, `new_page_html(...)` with canonical, deep link
and a cross-link to the sibling page). `data/new30.json`, `/new-30/`, in the sitemap.
`app.js`: `NEW30_KEY`, `NEW_SURFACES` maps each key to its file, a "New releases
(last 30 days)" dropdown row (also matched by "month"), `?artist=new-30`. A defect in
my own edit was caught before shipping: `fetchJson` caches by its second argument and
both files were given one label, so the 30-day view would have shown the 7-day list;
the cache key is now the file path. `NEW_CANDIDATE_RATIO` widened from 80 to 310
(10 x 31, the widest ratio the gate passes in a 30-day window) in `release_dates.py`
and `cleanup.py`: 3,556 more sub-1M candidates dated (the first run paused when the
Mac slept on battery with the lid closed; resumed with `caffeinate`), 4,792 set aside.

Result on the 30 September data: 7 days 21 songs (unchanged), 30 days 686 qualify, 30
shown. Every song in both 30-day top 30s has a decay ratio of 7.3 or less; the
borderline drops (10 to 20) look like the pre-release singles R33 measured at 10 to 18
(Kim Petras, Ellie Goulding, D-Block Europe), so the gate holds at 30 days.
Observation, no action: Brazilian "Ao Vivo" (live) titles pass the edition filter,
which matches only the English word, and they are mostly original songs released as
live recordings (I-11).

Deployed as `5d4b6bb4`; verified live: `new.json` 7 days, 21 songs; `new30.json` 30
days (31 August to 30 September), 39 shipped for the two top 30s; `/new/` and
`/new-30/` return 200; `app.js` carries `NEW30_KEY`; both pages are in the sitemap.

**R41. "I think the new column introduced a horizontal scroll bar on desktop, pls fix
so that it's no longer there."**

Confirmed by measurement: at a 1,280px window the table was 1,353px wide in a 1,225px
container (128px over); at 1,440px and up it just fit. Cause: title and artist cells
were `nowrap`, so each column was as wide as its longest truncated title, and fixed
minimums (140px per stream column) left no slack once the Released column (R33)
arrived. Fix, `styles.css` only: title and artist wrap between words (rows are already
169px tall from the embed, so no height change, verified), stream headers may break
onto two lines, minimums trimmed (title 140, artist 110, streams 80), and cell padding
drops to 10px between 769 and 1,279px, which covered a 28px overflow at 1,024px from
an unbreakable uppercase word. A first attempt used `overflow-wrap: anywhere` and
split "Neighbourhood" mid-word; replaced with `break-word`. Verified: no overflow on 8
views (Billie Eilish, global, both new-release pages, Taylor Swift, BTS, Bad Bunny,
The Weeknd) at 1,024, 1,280 and 1,440px. Below 1,024 (tablets above the 768px
breakpoint) the table still scrolls inside its wrapper, as before. Deployed as
`e0095e88`; the live `styles.css` is byte-identical to the committed one.

Side effect of testing, not a site defect: rendering ~450 embeds from this machine in
two minutes drew Spotify "429 Too Many Requests" in the players for about a minute.
Later checks suppressed the iframes (I-12).

**R42. "I guess the next thing is if we can somehow assign genre to each track? What are
our options?"**

Question; no code changed. Nothing in the log touches genre, so no clash. Measured
rather than recalled, on the real 3,000-artist list (1 October to 3 October 2026):

- **kworb's artist links carry the Spotify artist ID** (`/spotify/artist/<id>_songs.html`),
  so artist-level sources that store Spotify IDs can be joined exactly, not by name.
- **Wikidata** (P1902 Spotify artist ID, P136 genre), all 3,000 by SPARQL in seconds:
  83% matched, 74% with a genre (top 500: 93%, ranks 1,500 to 3,000: 65%); weighted, 83%
  of all streams, 95.3% of the global top 1,000, 69% of the 30-day new releases. 621
  distinct fine-grained labels, median 3 per artist. CC0.
- **MusicBrainz**, 60-artist sample via Spotify URL relations: 95% matched, 82% with a
  genre. Genres are supplementary data under CC BY-NC-SA (non-commercial).
- **Apple iTunes Search**, 20-artist sample: 20/20 exact name matches, all with a
  coarse `primaryGenreName`, including tail artists Wikidata lacks. Track level caught
  crossovers: "Love Story", "TEXAS HOLD 'EM", "I Had Some Help" all Country. About 20
  calls a minute; terms allow promotional use of store content only.
- **Deezer**, same tracks by plain search: 24/24 with the right artist, album genres,
  crossovers caught too. Terms: strictly non-commercial, explicitly including indirect
  revenue, which the donation widget is.
- **Last.fm**: not probed (needs a key); terms non-commercial, attribution, 100 MB cap.
- **Spotify**: the Web API still returns artist `genres` (the February 2026 guide
  removed `followers` and `popularity`, not `genres`), but only via per-artist calls
  under Premium-gated Development Mode, ruled out in R33. Embed and web pages carry no
  genre.
- **Claude classification**: not run (spends money). Estimated with `claude-opus-5-5`
  at $4/$20 per million tokens and the 50% Batches discount: about $1.50 to $11 for
  3,000 artists depending on packing, cents per week for the 2 to 15 new artists the
  weekly scrape adds (measured from slug registry commits).

Options presented per SD-12 (Wikidata; Apple; Claude; Wikidata plus Claude for gaps),
recommendation held; awaiting the user's choice (MISC R-9).

**R43. "I think wikidata with Claude filling in the gaps if it's not too costly?"**

The user chose option 4 of R42. Per SD-12 the held recommendation was stated after
the choice: the same option. Built:

- **`genres.py`** (new): fetches the scraper's artist list via `scrape_artists()`,
  queries Wikidata for genres and country by Spotify artist ID (3,000 artists in
  about 35 seconds), folds about 620 labels into 20 groups with `bucket()` and picks
  one per artist with `primary()`. Then Claude for the gaps, with a free token count
  first and a `CLAUDE_MAX_USD = 2.00` per-run cap. Writes `genres.json`, one artist
  per line, committed.
- **Mapping, iterated against spot checks.** First pass got Ed Sheeran as Hip-Hop,
  Taylor Swift as Country, Burna Boy as Reggae and Noah Kahan as K-Pop ("folk-pop"
  contains "k-pop"). Fixed with word-boundary regexes, Pop winning ties among
  sound-based groups, and the artist's country: a market label counts when it
  matches where the artist is from (Justin Bieber's lone reggaeton label no longer
  makes him Latin), and for Korea, Japan, South Asia, Africa and the Middle East the
  country alone decides (Sidhu Moose Wala is South Asian). "brazilian bass" and
  "hip-hop soul" are sounds, not markets (Alok, Mary J. Blige).
- **No Anthropic credentials exist on this machine** (no key, no CLI login, a free
  token count failed), so the API path could not run. The 752 gap artists were
  instead classified in this Claude Code session from the same context the script
  would send (top songs, collaborators, country), recorded as `src: "claude"`. No API
  cost. 729 got a genre; 23 stay blank on purpose: children's audio dramas,
  white-noise channels, credit-only lyricists.
- **Shared names.** Four names belong to two artists each (LISA and LiSA, Eve,
  SEVENTEEN, a duplicate Macklemore & Ryan Lewis ID). Songs carry names, not IDs, so
  the higher-ranked artist owns the name and the other entry is marked `shadowed`.
- **Pipeline:** `cleanup.py` gives each song its first credited artist's genre;
  `build_pages.py` shows it on artist pages and in their JSON-LD; `make_preload.py`
  inlines it; the CI workflow installs `anthropic`, runs `genres.py` with the
  `ANTHROPIC_API_KEY` secret (absent today, so new artists stay blank until it is
  added), and commits `genres.json`.
- **Display:** muted genre line under the artist name in the table, a Genre item on
  mobile cards (now wrapping), and in the render signature.

Result: 2,977 of 3,000 artists, 321,007 of 326,703 songs (98.3%). Verified in
headless Chrome: no overflow at 1,024 and 1,280px on four views, 30 genre lines per
page, and the phone card wraps cleanly at a true 375px. `data.json.gz` 22.4 MB.
Deployed as `098b75e3`; verified live: Billie Eilish shard 78/78 with a genre, global
top 1,000 at 997/1,000 (the three blanks are white-noise tracks, by design), Drake's
page lede and JSON-LD read Hip-Hop & Rap, `app.js` and `styles.css` carry the genre
line.

**R44. "added api key"**

`ANTHROPIC_API_KEY` confirmed in the repo's Actions secrets (added 21:27 UTC, 3 October;
not set locally). The Claude path had never run against the real API, so: hardened it
first (an API error inside the loop crashed `genres.py` before it wrote `genres.json`,
which would also have lost the week's Wikidata refresh; now it warns and keeps going),
mock-tested request shape, parsing and error handling, re-queued seven artists from the
in-session batch so the run must call the API, and triggered the workflow manually
(run 37155414233).

**Closing note, 4 October.** The run succeeded end to end (1 h 25 min). The genre step
called Claude for the seven re-queued artists in one request, $0.01, and all seven
answers matched the in-session ones, Unknown for Dakota included. Release dates fetched
2,042 new IDs; 98.3% of songs carry a genre; the bot committed and deployed
(`599d584f`).

**Regression caused by running on a Saturday:** the 7-day new-releases window is the
seven days before the data date. A Monday run catches the previous Friday; this
Saturday run's window started 26 September, missing the 25 September releases, and the
2 October releases were a day old, too new for kworb (I-10). The live 7-day page went
to 0 songs. Rolled back with `wrangler rollback` to `098b75e3` (the 3 October morning
deploy, 30 September data, 21 songs), verified live; Monday's scheduled run replaces it.
Recorded as G-23 with the open question of how thin a Monday window will be.

Also fixed B-21 (the CI commit step now rebases before pushing).

**R45. Screenshot of the r/InternetIsBeautiful post (245 upvotes, 31 comments, 119K
views, six months old): "The reddit post attached did very well but ever since not
getting any visitors. What can you do so that we increase chances of getting visitors?
Do you need any data?"**

Question; no code changed. Measured, 3 October 2026:

- **G-6 no longer reproduces.** Plain curl, Googlebot, Bingbot, a browser, and the
  Facebook, Twitter and Slack preview bots all get 200 on `/`, `/robots.txt`,
  `/sitemap.xml` and an artist page. Crawlers can reach the site.
- **Only the homepage is in search results.** A `site:chartrank.app` search returns
  the homepage alone: none of the 2,998 artist pages, the A-Z hub or the new-releases
  pages. No Google or Bing verification record exists (no DNS TXT, no meta tag), so the
  sitemap has almost certainly never been submitted.
- **The homepage links to nothing a crawler can follow.** Its only `href`s are icons and
  the manifest; artist pages are reachable from the sitemap alone.
- **No analytics on the site at all**, so traffic, referrers and top pages are unknown.
- **Titles miss the searches.** Search suggestions show "drake most streamed songs",
  "taylor swift songs ranked by streams", "most streamed songs of 2025", "most streamed
  hip hop songs on spotify", "how many streams does blinding lights have", "new music
  releases this week spotify". Artist pages say "Every Song Ranked"; no page targets
  years, genres or single songs.
- **A public duplicate at the workers.dev address** (canonical tags point to
  chartrank.app, which limits the damage).
- Found in passing: the CI commit step pushes without pulling, so any push to main
  during a run rejects the bot's push and skips the deploy (B-21). Commits from this
  request were held until run 37155414233 finished.

Presented: no-trade-off fixes ready to apply on request, SD-12 options for new search
pages (genre, year, song pages; per-artist share images), distribution only the user can
do, and the data needed (Search Console, analytics, goals). Awaiting the user's answer
(MISC G-20, G-21, R-10).

**R46. "Ok I've set up the search console, connected to bing and cloudflare web analytics
seems to be hooked up already."**

Verified first: a `google-site-verification` TXT record is on chartrank.app, so the
Search Console property is the domain one; Cloudflare Web Analytics is live, the edge
injects the beacon for browser user agents only (headless Chrome sees it, curl does
not, which is why R45 reported none). G-21 closed. Monday's scheduled run (5 October)
succeeded and the 7-day page came back with 7 songs, the thin case G-23 predicted.

Then the no-trade-off fixes from R45, built and verified locally:

- **Homepage link block** (`write_browse_block()` in `build_pages.py`, same
  marker-rewrite pattern as `make_preload.py`): four hubs plus the 48 most streamed
  artists by lead-artist total, as real `href`s to the static pages. `app.js`
  intercepts plain clicks to select in place and scroll to the results; modified
  clicks and the A to Z link navigate. Verified in headless Chrome at 1,280 and 375px:
  clicking Drake shows "Drake: showing 1–30 of 500 songs", sets `?artist=drake`, no
  overflow. CI now commits `public/index.html` so the block stays current.
- **`/top/`**: the global chart's top 100 by total streams as text, with JSON-LD, the
  one page for "most streamed songs on spotify", which the app alone could never rank
  for. Beyond the R45 list; flagged to the user.
- **Titles** rewritten to the measured phrasing (I-14): artist pages "Drake: Most
  Streamed Songs on Spotify, All 500 Ranked"; new-releases pages "New Music Releases
  This Week / This Month, Ranked by Spotify Streams"; H1s and descriptions to match.
  No possessive, which breaks on names ending in s.
- **Sitemap `<lastmod>`** = the data date on every URL, 3,003 URLs including `/top/`.
  The A to Z hub now links the other hubs too.
- **IndexNow** in `deploy.sh`: after a real deploy, every sitemap URL is POSTed to
  api.indexnow.org with the key in `public/<key>.txt` (`public/indexnow-key.txt` holds
  the same value for the script). Bing, Yandex and partners recrawl within hours;
  Google ignores IndexNow and reads the sitemap. Non-fatal; skipped on `--dry-run`.
- **`workers_dev: false`** in `wrangler.jsonc`: the duplicate hostname goes away on
  this deploy (G-22).

**Deploying required fresh data.** Local `data.json.gz` was the 30 September vintage
and the live site Monday's, so `deploy.sh` would refuse (correctly). The weekly CI
artifact holds only `data.json.gz`, not the sub-1M candidates the new-releases pages
need, so a fresh local scrape was started instead (Tuesday vintage: the 7-day window
then spans 29 September to 6 October and still contains Friday 2 October). Outcome in
the closing note.

**Cross-session coordination.** During this request another Claude Code session
(headcount, David's own analytics Worker) asked to wire its edge wrapper into this
Worker at David's request. Agreed by message: that session does not edit this tree; it
sent its two files; they are staged only when David confirms the go in either session,
because committing `"main"` would make the Monday CI run deploy it. Its wrapper was
read in full: service binding to the headcount Worker, one injected script tag, GPC/DNT
and opt-out honoured, fail-open. Two notes sent back: `/top` must join
`run_worker_first`, and the wrapper strips `etag`/`last-modified` from HTML. Recorded as
T-6.

**R47. David's go for the headcount wrapper, relayed by the headcount session: "yes
please include my custom analytics."**

Relayed, not typed here; this session had told David that either channel counts, so
it was acted on and is stated plainly in the reply. Staged: `worker/headcount.js`
(byte-identical copy, sha256 8f8a142d…, 10,889 bytes), `worker/entry.js` as supplied,
and in `wrangler.jsonc` `"main"`, the `ASSETS` binding, `run_worker_first` for the HTML
paths plus `/top` and `/top/*`, and the `HEADCOUNT` service binding. The homepage
footer links `/_hc/optout`. `wrangler deploy --dry-run` bundles 8.7 KiB and resolves
both bindings. Shipped in the R46 deploy; verification in that closing note.

The architecture statement changes with this: the Worker is no longer assets-only.
HTML requests to the listed paths run the wrapper, which calls the asset handler and
appends one script tag; data JSON, `app.js`, CSS and images never touch the script.
Wrangler's "Read 9,024 files" on deploy counts directories; there are 6,019 files.

**Closing note for R46 and R47, 6 October 13:35.** Fresh scrape: 508,282 raw, 325,462
songs, 412 new release dates, genres 98.3%. Deployed as `9603a4ed`, verified live: data
vintage 6 October; `/new/` 8 songs (29 September to 6 October), `/new-30/` 39; `/top/`,
`/_hc/s.js`, `/_hc/optout` and the IndexNow key file all 200; Drake's title reads
"Drake: Most Streamed Songs on Spotify, All 500 Ranked"; the homepage carries 48 artist
links; 3,003 sitemap entries with `lastmod`; the headcount tag is on `/`,
`/artist/drake/` and `/top/` for a browser user agent while `data/artists.json` still
returns an asset `etag`, so the Worker only runs for HTML; the workers.dev host returns
404. IndexNow answered 403 `SiteVerificationNotCompleted` on first use, its normal
reply for an unverified key; it verified within five minutes and the retry returned
HTTP 200 with all 3,003 URLs at 13:40. The
deploy script now prints IndexNow's response body. Noticed in passing: Cloudflare
returns 403 to the `Python-urllib` user agent and nothing else tested (curl, bingbot,
Googlebot, YandexBot, python-requests, Go, empty, headcount-health all 200); harmless
for crawlers, recorded under G-6.

**R25. Related artists; then the mobile crash report; then "make it 30 on desktop" plus
the Buy Me a Coffee widget script.**

**Related artists** built from the artist's own shard, which already contains exactly the
songs they appear on, so it needs no new file and no extra request. Verified byte-identical
to `build_pages.py`'s whole-dataset co-occurrence. Chips are capped at 12, filtered to
names the index can resolve, hidden for the global chart and when empty.

**The dedup fix from R24 was wrong and an adversarial review caught it before it
shipped.** Its stated premise, that duplicates always share an artist, is false: kworb
lists a collaboration under a separate track ID on each artist's page, and `scrape.py`
credits each record only with the artists whose page carried that URL. Starboy therefore
exists twice with byte-identical stream counts and disjoint names. Requiring a shared
artist put **88 duplicate rows into the global top 1,000**, where the original rule had
zero. Replaced with `should_merge()`: a shared artist **or** totals within 1%. Measured:
323,152 songs and 0 duplicate rows, versus 321,878 and 0 for the original.

**Mobile crash (B-16).** The user reported the live site reloading or erroring when
scrolling to the bottom, on phone only. Cause: `PAGE_SIZE` 50 put 50 Spotify embeds on a
page, each a full nested browsing context; `loading="lazy"` merely deferred them until
the scroll reached the bottom, at which point the tab exceeded its memory and the browser
discarded it. Exactly the SD-3 failure mode flagged as untested in R23. Fixed with a
per-device page size, now 30 on both, below the 40 that broke in March.

**`scrape.py` exit-code bug.** The 3,000-artist scrape completed and wrote `data.json`,
then exited 1 on an unguarded `os.remove(PROGRESS_FILE)` because a resumed run finds the
file already gone. That would have failed the weekly workflow on every resumed run.
Guarded.

**Buy Me a Coffee** switched from a hand-rolled footer link to the official widget script
supplied by the user. This is now the only third-party JavaScript on the site.

Refreshed artifact: 507,254 raw to **323,251 songs**, 19,708,233 bytes (75% of the cap).
All nine invariants pass: Starboy merged and credited to both artists, Billie Eilish's
"THE GREATEST" restored as its own record, comma names intact, zero duplicate rows in the
global top 1,000.
