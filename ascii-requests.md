# ASCII implementation activity diagrams

One diagram per request in `requests.md`, showing what actually happened: the path taken,
the decision points, and where things went wrong.

Notation:

```
  [ ]  action        < >  decision        (( ))  terminal/outcome
  -->  flow          !!!  failure or defect        ***  standing decision recorded
```

The 28 to 31 March entries are grouped by session, because those requests are
reconstructed from commit diffs rather than logged verbatim (see `requests.md` Part 1).

Updated after every request. See the maintenance protocol in `CLAUDE.md`.

---

## Session 1 (R1.1 to R1.4), 28 March: initial build

```
  (( "build a Spotify stream filter, vanilla, no build step" ))
        |
        [ scaffold index.html + app.js + styles.css ]
        |
        [ dual-handle range sliders, hand-built ]
        |
        < linear 0 to 5B range usable? >
        |            |
       no           yes
        |            |
        [ bucket arrays ]  --> TOTAL_BUCKETS / DAILY_BUCKETS, inputs index into them
        |
        [ 768px breakpoint: table -> cards ]
        |
  (( commit c1e63b2 "initial", 856 lines ))   *** SD-1 vanilla, SD-2 bucketed
```

## Session 2 (R2.1 to R2.9), 28 March: scraper and dedup

```
  (( "scrape kworb, 3,000 artists, make it resumable" ))
        |
        [ scrape.py: fetch + retry + 0.75s delay ]
        |
        [ progress file every 10 artists ] --> resumable by artist name
        |
        < same song appearing more than once? >
        |
       yes --> [ dedup by Spotify URL in build_output() ]
        |
        < still duplicated? >
        |
       yes  !!! regional releases, deluxe editions, near-identical counts
        |
        [ cleanup.py as a SEPARATE post-pass ]
        |    +-- fix_encoding()      mojibake
        |    +-- normalize_title() + 2% stream tolerance -> clusters
        |    +-- popularity = daily/total * 1e6
        |
        [ /init -> CLAUDE.md ]
        |
  (( commit af1d877, +470 lines of Python ))
```

## Session 3 (R3.1 to R3.3), 28 March: cosmetic pass

```
  (( "long titles wreck the layout; too many sort options" ))
        |
        [ truncate(str,max) + hover title ] --> 45 chars title, 35 artist
        |
        [ default sort -> popularity, min slider -> 5M ]
        |
        [ 6 sort options -> 3, descending only ]      *** SD-9
        |
  (( commit 70c0ca0 ))
```

## Session 4 (R4.1 to R4.3), 28 March: compression

```
  (( "data.json is 97 MB, the page takes forever" ))
        |
        < ship raw JSON? >
        |            |
       no           yes --> rejected, unshippable
        |
        [ gzip level 9 in cleanup.py ]  --> 97 MB to 17.6 MB, 82% off
        |
        < decompress with a library? >
        |            |
       no (SD-1)    yes --> rejected
        |
        [ DecompressionStream, browser-native ]       *** SD-4
        |
        [ MIN_TOTAL_STREAMS = 1,000,000 ]             *** SD-5
        |
  (( commit 1686686 ))
```

## Session 5 (R5.1 to R5.4), 28 March: preload and the iframe bug

```
  (( "blank page while loading"  +  "songs won't play" ))
        |
        [ inline PRELOAD, paint instantly, fetch in background ]
        |
        < why does playback die after a few pages? >
        |
        [ iframes removed but embeds keep holding resources ]
        |
        !!! removing a live iframe leaks the Spotify embed
        |
        [ blank src BEFORE remove ] + [ PAGE_SIZE 20 -> 10 ]   *** SD-3
        |
        [ name it ChartRank, add OG + Twitter tags ]
        |
  (( commits 005ade7, de6f55e, 5f900b9 ))
```

## Session 6 (R6.1 to R6.5), 31 March: the artist pivot

```
  (( "change the angle: pick an artist, see every song" ))
        |
        [ delete free-text search over all songs ]     *** SD-6 artist-first
        |
        [ artistIndex + typeahead dropdown ]
        |
        [ parseArtistNames(): split leads AND features on comma ]
        |        |
        |        !!! lossy for "Tyler, The Creator" (surfaces 4 months later as B-1)
        |
        [ index features too ]                          *** SD-7
        |
        [ DEFAULT_ARTIST = Billie Eilish, PRELOAD to match ]  *** SD-10
        |
  (( commit 14a1558, +204/-84 in app.js ))
```

## Session 7 (R7.1 to R7.3), 31 March: copy and slider removal

```
  (( "meta tags describe the old version; sliders make no sense now" ))
        |
        [ rewrite title/description/OG for the artist angle ]
        |
        < delete the slider code? >
        |            |
       no           yes --> not asked for
        |
        [ remove markup, KEEP the JS ]                  *** SD-8
        |        |
        |        !!! SHOW_STREAM_SLIDERS added but never read (B-4)
        |
  (( commits 4fe1dc4, 61c15d8. Last deploy for 4 months. ))
```

---

## R8, 31 July: "can you find the previous requests used to build this app?"

```
  (( request ))
        |
        [ search ~/.claude/projects/<this project>/ ] --> only today's transcript
        |
        [ .claude.json project history ] --> 0 entries
        [ ~/.claude/history.jsonl ]      --> other projects only
        [ file-history, backups ]        --> unrelated session
        [ Cursor + VS Code workspaceStorage ] --> folder pointer only
        |
        < recoverable? >
        |
       NO  !!! retention purged March transcripts; .last-cleanup ran 31 Jul 14:27
        |
        [ offer reconstruction from git + v1 snapshot ]
        |
  (( no code changed ))
```

## R9, 31 July: "sure, let's call it requests.md"

```
  (( request ))
        |
        [ git log --stat, 10 commits ]
        [ diff v1 snapshot (29 Mar) against HEAD ]
        [ read each commit's actual diff ]
        |
        [ infer request per change, tag confidence high/medium/low ]
        |
        [ state explicitly that prompts are inferred, not verbatim ]
        |
  (( requests.md created, 422 lines ))
```

## R10, 31 July: three-file documentation protocol

```
  (( "log of requests + CLAUDE.md summary + misc file, updated every request" ))
        |
        [ restructure requests.md ]
        |    +-- Standing Decisions table at top = the conflict-check surface
        |    +-- Part 1 reconstructed / Part 2 verbatim
        |
        [ rewrite CLAUDE.md ] --> found 5 stale claims:
        |    !!! pipeline missing cleanup.py and the gzip step
        |    !!! "~15k+ songs" when it was 318,431
        |    !!! popularity absent from the schema
        |    !!! sliders listed as live
        |
        [ audit codebase -> MISC.md ] --> 4 bugs, 5 gaps, 6 recommendations
        |
  (( SD-11 recorded: all three updated every request ))
```

## R11, 31 July: compare-alternatives mode

```
  (( "present 2-4 options, let me choose and reason first" ))
        |
        [ record SD-12 ] + [ add to CLAUDE.md protocol ] + [ save to memory ]
        |
        [ tag MISC items that meet the bar as DECISION ]
        |
        [ demonstrate on B-1, the live comma-artist bug ]
        |
        < recommend now? >
        |
       NO --> SD-12 says hold the recommendation until the user answers
        |
  (( 3 options presented, no recommendation given ))
```

## R12, 31 July: "c is most robust"

```
  (( user picks structured leads[]/features[] ))
        |
        [ NOW recommend, per SD-12 ] --> agree, with one caveat
        |
        < can code and data ship together? >
        |
       no --> [ artistNamesFor() compatibility shim ]
        |          new data if present, legacy parse if not
        |
  (( SD-13 recorded ))
```

## R13, 31 July: "yes" (implement it)

```
  (( request ))
        |
        [ scrape.py: emit leads[] / features[] ]
        [ cleanup.py: merge_name_lists(), exact dedup only ]
        [ app.js: artistNamesFor() + fold in R-1 precompute ]
        |
        < does the preload still work? >
        |
       NO  !!! swapping a scan for an index moved the dependency from
        |       "data exists" to "index exists"; caught before shipping
        |
        [ buildArtistIndex() in the preload path too ]
        |
        [ verify: 113 ms index over 318,431 songs, 50 lookups < 1 ms ]
        |
  (( bug persists until the rescrape: the fix lives in the data ))
```

## R14, 31 July: "it's running now in the background"

```
  (( scrape started, 60 min ahead ))
        |
        < wait, or de-risk the run? >
        |
        [ verify kworb HTML still parses ] --> 3,000 rows, "*" marker intact
        |
        [ dry-run the WHOLE pipeline on one live artist ]
        |    build_output -> cleanup -> buildArtistIndex
        |    "Tyler, The Creator" survives every stage
        |
  (( 3 extra requests against the scrape's own 3,000 ))
```

## R15, 31 July: eight-part request (theme, logo, SEO, cost, money, filters, flash)

```
  (( 8 asks at once ))
        |
        [ scout locally ] --> then fan out 11 agents, 6 research + 4 verify + 1 synth
        |
        +-- Cloudflare cost ....... adversarially verified
        +-- SEO ................... 1 indexable URL is THE problem
        +-- monetisation .......... Spotify T&Cs forbid reselling this data
        +-- time windows .......... !!! no history exists; cannot be computed
        +-- load flash ............ preload -> full data re-render
        +-- theming ............... #1DB954 is 2.50:1 on white
        |
        [ verifiers overturn 15 claims from the researchers ]
        |
        < "All" as an artist? >
        |
        !!! clashes with SD-6 --> named explicitly, not silently reversed
        |
        [ fix em dashes + B-2 while research runs ]
        |
  (( decisions D1-D8 framed, none recommended, per SD-12 ))
```

## R16, 31 July: "D1.c / D5.a / D7.a"

```
  (( three decisions answered ))
        |
        [ global chart capped 1,000, cap applied AFTER sort ]   *** SD-14
        |        verified: 0/1000 overlap between sort orders
        [ Spotify wordmark -> three-bar mark, favicon set ]     *** SD-17
        [ GitHub Actions weekly refresh + size gate ]
        [ light theme: semantic tokens ]                        *** SD-15, SD-16
        |
        [ verify: all CSS vars defined? YES ]
        [ verify: no hardcoded colours left? YES ]
        |
        !!! NEITHER CHECK CAN SEE A WRONG-BUT-DEFINED TOKEN
        |
  (( shipped with body{background} = #0a0a0a in BOTH themes ))
```

## R17, 31 July: "light theme is still mostly dark... basic things"

```
  (( user reports two defects ))
        |
        +-- light theme
        |     [ body{background} mapped to --on-accent by find/replace ]
        |     [ fix -> --bg ]
        |     [ audit ALL substitutions vs git HEAD ] --> 3 more regressions
        |
        +-- only 10 songs
              < regression? >
              NO --> fetch() is blocked on file://, always has been
              !!! CLAUDE.md claimed "no server needed"; I had propagated it
                  untested, and fed it to 6 agents as a hard constraint
        |
        [ adversarial hunt: 5 lenses, 20 agents ] --> 13 confirmed
        |
        !!! the flash guard NEVER FIRED: totalResults 10 -> 78 in the signature
        !!! escapeHtml() never escaped quotes: 2,197 rows, incl. the default page
        !!! focus made controls LESS visible in light mode
        |
        [ split signature: chrome always, rows gated ]
        [ measure every surface in both themes, not just "is it defined" ]
        |
  (( root cause across R16 and R17: verifying a PROXY, not the thing ))
```

## R18, 31 July: Spotify embeds + how to deploy

```
  (( two questions ))
        |
        +-- embeds still dark
        |     [ fetch embed 3 ways: theme=0 / none / theme=1 ]
        |     --> all ship encore-dark-theme. No light embed exists.
        |
        +-- how to deploy
              [ wrangler deployments list ] --> Worker, not Pages
              [ every deployment Source: Upload ]
              --> concluded "no git integration"   !!! INFERENCE, not a fact
              |
              [ main has no wrangler.jsonc ] --> add it
              [ assets.directory "." would upload 106 MB data.json ]
              [ test .assetsignore in isolation ] --> DOES NOT FILTER
              [ deploy.sh stages an 11-file allowlist ]
        |
  (( deployed edd0ef82, first publish since 31 March ))
        |
        !!! first verification read cf-cache-status: HIT and showed the OLD build
```

## R19, 1 August: build failure + G-8/R-5/R-3/D4 + implement the rest

```
  (( screenshot: Workers Builds failed in 0s ))
        |
        < why? >
        |
        [ git ls-tree origin/main ] --> no public/ in the pushed tree
        |
        !!! a Workers Builds git integration DOES exist. R18's "no integration"
            was inferred from a repo idle since March, so it had never fired.
            My assets.directory ./public + gitignored public/ = instant failure.
        |
        +-- R-5 "can we not delete the old data?"
        |     [ explain: git keeps every blob; deleting reclaims nothing ]
        |     [ MEASURE: generated tree = 154 MB / 6,011 files ]
        |     --> ~8 GB of history per year          *** SD-19 commit nothing generated
        |                                            *** SD-20 disable Workers Builds
        +-- R-3 "let's split"
        |     [ build_pages.py ]
        |     [ slugs.json append-only ]             *** SD-21
        |     [ rewrite the frontend data layer: 45 KB index + 7 KB shard ]
        |     [ delete loadDataset() and the monolith fetch ]
        |
        +-- D4 --> explained, not decided: no history exists to filter on
        +-- G-8 --> leave embeds as-is               *** SD-22
        |
        [ og-image, sort-on-change, mobile card meta, empty-state copy,
          DecompressionStream message, dead-flag comment, form labels,
          opaque maskable icons, narrower init() try ]
        |
  (( deployed 2d4c83e4: 6,011 files, monolith now 404s ))
```

## R20, 1 August: ASCII diagrams

```
  (( "requests log + CLAUDE.md + misc, plus ascii-requests.md
      and 3 structure diagrams at increasing granularity" ))
        |
        < do the first three already exist? >
        |
       YES --> CLAUDE.md 431 lines, requests.md 408, MISC.md 567,
        |       22 standing decisions, 37 tracked items. Verified current.
        |
        [ ascii-requests.md: one activity diagram per request ]
        |      March grouped by session (reconstructed, not verbatim)
        |      R8-R20 individually
        |
        [ ascii-structure.md: 3 levels ]
        |      L1 four boxes, L2 directories and jobs, L3 call graph + data flow
        |
        [ extend the maintenance protocol from 3 files to 5 ]
        |
  (( no application code changed ))
```

## R21, 1 August: "does the repo grow?" / "why does splitting help storage?"

```
  (( two storage questions ))
        |
        [ measure, not theorise ]
        |    repo already 95 MB; 99.7% is dead data.json blobs from March
        |    weekly commit under SD-19: 0.5 KiB (4 simulated weeks)
        |    committing the sharded tree: 0.78 GB/yr; the monolith: 0.95 GB/yr
        |
        !!! my earlier "~8 GB/yr" ignored zlib; "~1.6 GB/yr" ignored deltas
        |
  (( answer: "commit or not" governs; "split or not" barely matters ))
```

## R22, 1 August: "so because it is compressed, that's the problem"

```
  (( user names the mechanism ))
        |
        [ confirm, bound the scope ]
        |    gzip defeats git delta compression: 1 changed byte -> whole new blob
        |    explains 0.95 vs 0.78 GB/yr, NOT why the repo is fine (SD-19 does)
        |
  (( I-8: never commit a pre-compressed artifact ))
```

## R23, 1 August: "can we see 50 songs per page?"

```
  (( request ))          !!! clashes with SD-3 (PAGE_SIZE 10, iframe fix)
        |
        [ name the clash, then implement ]
        |    render() built BOTH layouts: 100 iframes at 50/page
        [ build only the visible layout ] --> 50, layout in rowSignature
        |
  (( G-9: NEEDS FIELD TEST; March broke at 40 constructed iframes ))
```

## R24, 1 August: Sia/Billie chimera + rescrape + BMC + random artist

```
  (( "billie eilish does not feature in sia's the greatest?" ))
        |
        [ trace raw -> shipped ] --> two songs, titles fold case, totals 1.765% apart
        !!! merged into one record: Sia's total, BILLIE'S daily, both credited
        |
        [ shares_artist() gate ] + [ rescrape started ]
        [ "Surprise me" uniform random ] [ footer, BMC link gated on handle ]
        [ em dashes: 5 remain, all inside real song titles -> declined ]
        |
  (( fix verified on the reported case only... see R25 ))
```

## R25, 1 August: "related artists sounds like a great idea"

```
  (( request ))
        |
        [ derive from the artist's own shard ] --> byte-identical to build_pages
        [ chips capped 12, index-resolvable only, hidden for global/empty ]
        |
        [ adversarial review of the turn ]
        !!! R24's gate OVERTURNED: kworb lists collabs under a track ID per
        !!! artist page -> duplicates with ZERO shared names (Starboy x2)
        !!! my fix: 88 duplicate rows in the global top 1,000 vs 0 before
        |
        [ should_merge(): shared artist OR totals within 1% ]
        |
  (( 323,152 songs projected, 0 top-1000 dupes, both cases verified ))
```

## R26, 1 August: "30 on mobile" + BMC widget + "ok pushed"

```
  (( mobile crashed at the bottom of the page ))
        |
        !!! 50 lazy embeds all live by scroll-end; phone tab discarded
        [ pageSize(): 50 desktop / 30 mobile ]
        [ official BMC widget: main app + 2,998 artist pages (G-11) ]
        |
        [ scrape done: 507,254 raw -> 323,251 songs, 75.2% of cap ]
        [ four invariants verified ] --> deploy
        |
  (( push at 21:59 produced NO build deployment: disconnect held ))
```

## R27, 11 August: "did the site update yesterday?"

```
  (( verify the automation, not just the checkmark ))
        |
        [ bot commits Mon 03 + Mon 10 Aug, deploys minutes later ]
        [ all 200 of top-200 songs increased ] --> genuinely fresh
        [ invariants: Starboy one record, 0 dupes, slugs 0 reassigned ]
        |
        !!! G-12: 11 artists fell out of the top 3,000; their pages 404
        |    sitemap correctly drops them; slugs stay reserved
        |
  (( both weeks succeeded unattended ))
```

## R28, 11 August: "why is the global chart only 1k songs?"

```
  (( question about SD-14, the user's own D1(c) choice ))
        |
        [ answer with provenance, not re-litigation ]
        |    product: uncapped = 6,465 pages
        |    architecture: global.json is precomputed top-1000 PER SORT
        |    overlap totals/popularity 0/1000 -> 2,371 distinct songs surfaced
        |
        [ G-13: "(all artists)" label reads as "all songs"; relabel offered ]
        |
  (( no code changed ))
```

## R29, 11 August: dropdown count off + the stale-pipeline discovery

```
  (( "top 1k per sort (already true) + no song count on the global row" ))
        |
        [ check before deploying ] --> local data 1 Aug, live data 10 Aug
        !!! naive deploy would regress live by 9 days
        |
        [ inspect uncommitted diffs ]
        !!! cleanup.py should_merge and build_pages.py widget NEVER COMMITTED
        !!! CI ran the OLD pipeline on 3 + 10 Aug:
        !!!   chimera back live (Sia/Billie merged again), widget gone from pages
        |
        [ pull origin ] [ reconstruct 10-Aug data from live shards: 322,541 songs ]
        |    fidelity: PRELOAD byte-equal, index content-equal,
        |    global sorts equal but one tie at rank 1,000
        |
        [ dropdown: global row count -> null ]
        [ guards: deploy.sh freshness stamp; CI chimera invariant;
          90-day dataset artifacts (G-14) ]
        |
        [ deploy: widget restored, UI fixed, data unchanged ]
        |
  (( data heals on next scrape IF the pipeline fixes get committed (B-19) ))
```

## R30, 11 August: "minimum daily streams for global popularity? eg 400k?"

```
  (( proposal: floor the NUMERATOR ))
        |
        [ measure the actual top ] --> 703/1000 rows under 5M total
        !!! at the 1M floor, popularity == dailyStreams: the chart ranks
        !!!   "just crossed the threshold", not "hot"
        |
        [ test floors ] --> daily < 200k: top unchanged
        |                   daily 400k: 1,935 qualifiers, 55% = daily chart
        |                   total >= 20M: clean surging-hits top
        |                   damped daily/(total+K): smooth, needs client change
        |
        [ options + numbers presented, recommendation held ]   *** SD-12
        |
  (( awaiting choice, R-6 ))
```

## R31, 11 August: "let's implement A"

```
  (( choice made with the numbers on the table ))
        |
        [ held recommendation stated after the choice (B), then A built ]  *** SD-12
        |
        [ POP_MIN_DAILY = 400_000 in build_pages.py, popularity pool only ]
        |    client re-sort: same key, same pool -> server order preserved
        |
        [ rebuild ] --> min daily 400,051; other sorts byte-order unchanged
        [ deploy 16de7573 ] [ verify live ] [ commit + push ]   *** SD-23
        |
  (( global popularity now floors at 400k daily ))
```
