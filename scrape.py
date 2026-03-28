#!/usr/bin/env python3
"""
Scrapes kworb.net for top Spotify artists and all their songs.
Outputs data.json compatible with the frontend.
"""

import requests
import json
import time
import os
import sys
from bs4 import BeautifulSoup
from urllib.parse import urljoin

BASE_URL = "https://kworb.net/spotify/"
ARTISTS_URL = BASE_URL + "artists.html"
PROGRESS_FILE = "scrape_progress.json"
OUTPUT_FILE = "data.json"
MAX_ARTISTS = 3000
REQUEST_DELAY = 0.75  # seconds between requests
MAX_RETRIES = 3
RETRY_BACKOFF = 2  # exponential backoff multiplier


def fetch(url):
    """Fetch a URL with retries and exponential backoff."""
    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.get(url, timeout=30, headers={
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
            })
            resp.raise_for_status()
            resp.encoding = "utf-8"
            return resp.text
        except requests.RequestException as e:
            if attempt < MAX_RETRIES - 1:
                wait = REQUEST_DELAY * (RETRY_BACKOFF ** attempt)
                print(f"  Retry {attempt + 1}/{MAX_RETRIES} for {url} ({e}), waiting {wait:.1f}s")
                time.sleep(wait)
            else:
                print(f"  FAILED after {MAX_RETRIES} attempts: {url} ({e})")
                return None


def scrape_artists():
    """Scrape the top 3000 artists list. Returns list of (rank, name, songs_url)."""
    print("Fetching artists list...")
    html = fetch(ARTISTS_URL)
    if not html:
        print("Failed to fetch artists page. Exiting.")
        sys.exit(1)

    soup = BeautifulSoup(html, "html.parser")
    table = soup.find("table")
    if not table:
        print("No table found on artists page. Exiting.")
        sys.exit(1)

    artists = []
    rows = table.find_all("tr")
    for row in rows:
        cells = row.find_all("td")
        if not cells:
            continue
        link = cells[0].find("a")
        if not link:
            continue
        name = link.get_text(strip=True)
        href = link.get("href", "")
        songs_url = urljoin(ARTISTS_URL, href)
        artists.append((len(artists), name, songs_url))
        if len(artists) >= MAX_ARTISTS:
            break

    print(f"Found {len(artists)} artists.")
    return artists


def parse_streams(text):
    """Parse a stream count string like '4,127,415,952' into an integer."""
    try:
        return int(text.strip().replace(",", ""))
    except (ValueError, AttributeError):
        return 0


def scrape_artist_songs(artist_name, artist_rank, songs_url):
    """Scrape all songs for one artist. Returns list of song dicts."""
    html = fetch(songs_url)
    if not html:
        return []

    soup = BeautifulSoup(html, "html.parser")
    tables = soup.find_all("table")
    # Songs are in the second table; first table is the summary
    if len(tables) < 2:
        return []
    table = tables[1]

    songs = []
    rows = table.find_all("tr")
    for row in rows:
        cells = row.find_all("td")
        if not cells:
            continue

        link = cells[0].find("a")
        if not link:
            continue

        title = link.get_text(strip=True)
        href = link.get("href", "")
        # The * feature marker is outside the <a>, in the parent <div> text
        parent_text = cells[0].get_text()
        is_feature = parent_text.strip().startswith("*")

        # Spotify URL is a full URL in the href
        spotify_url = href if href.startswith("http") else ""

        # Parse streams columns
        total_streams = parse_streams(cells[1].get_text()) if len(cells) > 1 else 0
        daily_streams = parse_streams(cells[2].get_text()) if len(cells) > 2 else 0

        songs.append({
            "title": title,
            "spotify_url": spotify_url,
            "total_streams": total_streams,
            "daily_streams": daily_streams,
            "artist_name": artist_name,
            "artist_rank": artist_rank,
            "is_feature": is_feature,
        })

    return songs


def load_progress():
    """Load progress from previous run if available."""
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE, "r") as f:
            return json.load(f)
    return {"completed_artists": [], "songs": {}}


def save_progress(progress):
    """Save progress incrementally."""
    with open(PROGRESS_FILE, "w") as f:
        json.dump(progress, f)


def build_output(songs_by_url):
    """
    Deduplicate songs by Spotify URL and combine artists.
    Format: "Lead Artist (feat. Feature1, Feature2)"
    Leads come first (non-* entries), features in parens.
    Ties broken by artist rank (lower = higher ranked).
    """
    output = []
    for url, entries in songs_by_url.items():
        if not url:
            continue

        # Use the highest stream counts available (they should be the same across entries)
        total_streams = max(e["total_streams"] for e in entries)
        daily_streams = max(e["daily_streams"] for e in entries)
        title = entries[0]["title"]

        # Split into leads and features, sort each by artist rank
        leads = sorted(
            [e for e in entries if not e["is_feature"]],
            key=lambda e: e["artist_rank"]
        )
        features = sorted(
            [e for e in entries if e["is_feature"]],
            key=lambda e: e["artist_rank"]
        )

        # Build artist string
        lead_names = list(dict.fromkeys(e["artist_name"] for e in leads))
        feature_names = list(dict.fromkeys(e["artist_name"] for e in features))
        # Remove any feature names that already appear as leads
        feature_names = [n for n in feature_names if n not in lead_names]

        if lead_names and feature_names:
            artist_str = ", ".join(lead_names) + " (feat. " + ", ".join(feature_names) + ")"
        elif lead_names:
            artist_str = ", ".join(lead_names)
        elif feature_names:
            # Edge case: song only appears as feature for all scraped artists
            artist_str = ", ".join(feature_names)
        else:
            artist_str = "Unknown"

        output.append({
            "title": title,
            "artist": artist_str,
            "totalStreams": total_streams,
            "dailyStreams": daily_streams,
            "url": url,
        })

    # Sort by total streams descending
    output.sort(key=lambda s: s["totalStreams"], reverse=True)
    return output


def main():
    artists = scrape_artists()
    progress = load_progress()

    completed = set(progress["completed_artists"])
    songs_by_url = progress["songs"]  # keyed by spotify URL

    remaining = [(rank, name, url) for rank, name, url in artists if name not in completed]
    print(f"Already completed: {len(completed)} artists. Remaining: {len(remaining)}.")

    start_offset = len(completed)
    for i, (rank, name, songs_url) in enumerate(remaining):
        print(f"[{start_offset + i + 1}/{len(artists)}] Scraping {name}...")
        songs = scrape_artist_songs(name, rank, songs_url)
        print(f"  Found {len(songs)} songs.")

        for song in songs:
            url = song["spotify_url"]
            if not url:
                continue
            if url not in songs_by_url:
                songs_by_url[url] = []
            songs_by_url[url].append(song)

        progress["completed_artists"].append(name)
        completed.add(name)

        # Save progress every 10 artists
        if (i + 1) % 10 == 0:
            save_progress(progress)
            print(f"  Progress saved. ({len(songs_by_url)} unique songs so far)")

        time.sleep(REQUEST_DELAY)

    # Final progress save
    save_progress(progress)

    # Build and write output
    print("Building deduplicated output...")
    output = build_output(songs_by_url)
    print(f"Total unique songs: {len(output)}")

    with open(OUTPUT_FILE, "w") as f:
        json.dump(output, f)
    print(f"Written to {OUTPUT_FILE}")

    # Clean up progress file
    os.remove(PROGRESS_FILE)
    print("Done! Progress file cleaned up.")


if __name__ == "__main__":
    main()
