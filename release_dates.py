#!/usr/bin/env python3
"""
Fetch a release date for every song, keyed by Spotify track ID.

Source: the Spotify EMBED page (open.spotify.com/embed/track/<id>), the same document
every row of the app already loads as an iframe. It inlines a __NEXT_DATA__ JSON blob
whose entity carries releaseDate.isoString. Chosen over the Web API on 30 September
2026 (R33): the API's Development Mode now needs a Premium subscription, the batch
GET /tracks endpoint was removed in February 2026 and Client Credentials is being
retired for metadata, so the API costs one request per track anyway, plus a secret in
CI. The embed page is ~11 KB, needs no auth and no User-Agent, and took 40 concurrent
fetches with no 429 in testing. It is UNDOCUMENTED: parse_date() is the only place that
knows its shape, and the run fails loudly if the shape stops matching.

Rate limit, measured 30 September 2026: a burst of ~190 at 9/s drew 429s for about a
minute; 2/s sustained for 300 requests drew none. PACE bounds the rate across all
workers; a 429 pauses every worker for Retry-After (or 60 s) and the request retries.

kworb has no release date anywhere the scraper visits; its per-track page only has
chart-entry dates.

State lives in release_dates.txt, one "<id> <YYYY-MM-DD>" per line, APPEND-ONLY and
committed (same reasoning as slugs.json, SD-21): a date never changes, the cold backfill
is ~323k requests, and CI runners keep nothing between runs. "-" marks an ID whose
embed page has no date (deleted or region-locked track); it is recorded so it is not
refetched every week.

Fetch order is popularity (daily/total) DESCENDING, so a run cut short by MAX_FETCHES
still covers every plausible new release first: a song a few days old has a ratio no
back-catalogue track can reach. That makes the new-releases surface complete from the
first run, while the long tail backfills over later runs.

Input: data.json (raw scrape) when present, else data.json.gz. Records at or above
cleanup.py's MIN_TOTAL_STREAMS are fetched, plus sub-1M records young enough to be new
releases (NEW_CANDIDATE_RATIO); the rest of the sub-1M tail never ships.

Standalone. No CLI arguments. Environment overrides: RELEASE_DATES_MAX (fetch budget
per run; CI keeps the weekly run bounded, a local backfill lifts it) and
RELEASE_DATES_PACE (requests per second).
"""

import concurrent.futures
import gzip
import http.client
import json
import os
import re
import sys
import threading
import time
import urllib.error
import urllib.request

RAW_INPUT = "data.json"
CLEAN_INPUT = "data.json.gz"
REGISTRY = "release_dates.txt"
MIN_TOTAL_STREAMS = 1_000_000          # keep in step with cleanup.py
# Below the floor, only plausible new releases are dated (R39): the new-releases page
# draws on them to reach its top 30, while the rest of the site keeps the 1M floor
# (SD-5). A song can only pass build_pages.py's decay gate if total/daily is at most
# NEW_MAX_DECAY * (NEW_RELEASE_DAYS + 1) = 10 * 8, so nothing above that is fetched.
# ~1,300 candidates in a weekly scrape, ~7 minutes at PACE.
NEW_CANDIDATE_RATIO = 80
EMBED_URL = "https://open.spotify.com/embed/track/{}"

MAX_FETCHES = int(os.environ.get("RELEASE_DATES_MAX", "6000"))   # ~33 min at 3/s
PACE = float(os.environ.get("RELEASE_DATES_PACE", "3.0"))         # requests per second
WORKERS = 4                            # hides latency only; PACE bounds the rate
PAUSE_ON_429 = 60                      # seconds, when the response has no Retry-After
TIMEOUT = 20
MAX_RETRIES = 3
SAVE_EVERY = 200                       # lines flushed to the registry
MIN_PARSE_RATE = 0.8                   # below this, the page shape has changed: fail
MAX_CONSECUTIVE_ERRORS = 25            # network gone or IP blocked: stop, keep state

DATE_RE = re.compile(r'"releaseDate":\{"isoString":"(\d{4}-\d{2}-\d{2})')
TRACK_ID_RE = re.compile(r"/track/([A-Za-z0-9]{22})")


def track_id(url):
    m = TRACK_ID_RE.search(url or "")
    return m.group(1) if m else None


def load_registry():
    dates = {}
    if os.path.exists(REGISTRY):
        with open(REGISTRY, encoding="utf-8") as f:
            for line in f:
                parts = line.split()
                if len(parts) == 2:
                    dates[parts[0]] = parts[1]
    return dates


def load_songs():
    if os.path.exists(RAW_INPUT):
        with open(RAW_INPUT, encoding="utf-8") as f:
            return json.load(f), RAW_INPUT
    with gzip.open(CLEAN_INPUT, "rt", encoding="utf-8") as f:
        return json.load(f), CLEAN_INPUT


class Pacer:
    """Global request pacing shared by every worker, plus a shared pause on 429."""

    def __init__(self, per_second):
        self.interval = 1.0 / per_second
        self.lock = threading.Lock()
        self.next_at = 0.0
        self.paused_until = 0.0

    def wait(self):
        with self.lock:
            t = max(time.monotonic(), self.next_at, self.paused_until)
            self.next_at = t + self.interval
        delay = t - time.monotonic()
        if delay > 0:
            time.sleep(delay)

    def pause(self, seconds):
        with self.lock:
            self.paused_until = max(self.paused_until, time.monotonic() + seconds)


pacer = Pacer(PACE)


def parse_date(html):
    """The one place that knows the embed page's shape. Returns 'YYYY-MM-DD' or None."""
    m = DATE_RE.search(html)
    return m.group(1) if m else None


def fetch_one(tid):
    """Returns (id, date). date is 'YYYY-MM-DD', '-' for no date, or None for a transient
    failure, which is not recorded so the next run retries it."""
    req = urllib.request.Request(EMBED_URL.format(tid), headers={"Accept-Encoding": "gzip"})
    for attempt in range(MAX_RETRIES):
        pacer.wait()
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                body = resp.read()
                if resp.headers.get("Content-Encoding") == "gzip":
                    body = gzip.decompress(body)
                html = body.decode("utf-8", "replace")
            # A 200 with no date is what an unknown or delisted ID returns.
            return tid, parse_date(html) or "-"
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return tid, "-"
            if e.code != 429:
                time.sleep(2 * (2 ** attempt))
                continue
            wait = float(e.headers.get("Retry-After") or 0) or PAUSE_ON_429 * (attempt + 1)
            print(f"  HTTP 429 for {tid}; pausing all workers {wait:.0f}s", flush=True)
            pacer.pause(wait)
        except (urllib.error.URLError, http.client.HTTPException, TimeoutError, OSError):
            # http.client.IncompleteRead is an HTTPException, not an OSError; one of
            # them escaping a worker thread killed a 322k-ID backfill at 51k.
            time.sleep(2 * (2 ** attempt))
    return tid, None


def main():
    dates = load_registry()
    songs, source = load_songs()
    print(f"Registry: {len(dates):,} IDs. Loaded {len(songs):,} records from {source}.")

    todo = {}
    for s in songs:
        total, daily = s.get("totalStreams", 0), s.get("dailyStreams", 0)
        if total < MIN_TOTAL_STREAMS and not (daily > 0 and total <= NEW_CANDIDATE_RATIO * daily):
            continue
        tid = track_id(s.get("url"))
        if not tid or tid in dates or tid in todo:
            continue
        todo[tid] = s["dailyStreams"] / s["totalStreams"]
    queue = sorted(todo, key=lambda t: -todo[t])
    print(f"{len(queue):,} IDs need a date; fetching up to {MAX_FETCHES:,} this run "
          f"at {PACE:g}/s.")
    queue = queue[:MAX_FETCHES]
    if not queue:
        print("Nothing to do.")
        return

    done = parsed = 0
    consecutive_errors = 0
    pending = []
    t0 = time.time()

    def flush():
        nonlocal pending
        if pending:
            with open(REGISTRY, "a", encoding="utf-8") as f:
                f.writelines(f"{tid} {date}\n" for tid, date in pending)
            pending = []

    with concurrent.futures.ThreadPoolExecutor(WORKERS) as ex:
        for tid, date in ex.map(fetch_one, queue):
            done += 1
            if date is None:
                consecutive_errors += 1
                if consecutive_errors >= MAX_CONSECUTIVE_ERRORS:
                    flush()
                    sys.exit(f"FAIL: {MAX_CONSECUTIVE_ERRORS} consecutive fetch failures; "
                             f"stopping with {done:,} attempted. State is saved; rerun.")
                continue
            consecutive_errors = 0
            if date != "-":
                parsed += 1
            dates[tid] = date
            pending.append((tid, date))
            if len(pending) >= SAVE_EVERY:
                flush()
                rate = done / (time.time() - t0)
                print(f"  {done:,}/{len(queue):,}  {parsed:,} dated  "
                      f"{rate:.1f}/s  eta {(len(queue) - done) / max(rate, 0.1) / 60:.0f} min",
                      flush=True)
    flush()

    print(f"Fetched {done:,}: {parsed:,} dated, {done - parsed:,} without a date, "
          f"{time.time() - t0:.0f}s. Registry now {len(dates):,} IDs.")

    # The alarm. If the page shape changed, nearly every 200 comes back undated and the
    # new-releases surface would silently go empty on the next build. Genuine undated
    # IDs (delisted tracks) are rare, so a collapse in the parse rate is unambiguous.
    if done >= 50 and parsed / done < MIN_PARSE_RATE:
        sys.exit(f"FAIL: only {parsed}/{done} embed pages carried a date. "
                 "Spotify has changed the page; fix parse_date().")


if __name__ == "__main__":
    main()
