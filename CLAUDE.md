# Spotify Stream Filter

Web app for searching and filtering Spotify tracks by stream counts. Data is scraped from kworb.net.

## Architecture

```
scrape.py → data.json → index.html + app.js + styles.css
```

- **Scraper** (`scrape.py`): Python 3 + requests + BeautifulSoup4. Scrapes top 3000 artists from kworb.net, then each artist's songs page. Deduplicates by Spotify URL, combining artists as `"Lead (feat. Feature1, Feature2)"` using the `*` feature marker from kworb. Outputs `data.json`.
- **Frontend**: Vanilla HTML/CSS/JS, no build step. Loads `data.json` via fetch, filters/sorts/paginates client-side. Spotify-themed dark UI with embedded players.

## Key files

- `scrape.py` — standalone scraper, run with `python3 scrape.py`
- `data.json` — generated song data (large, ~15k+ songs)
- `scrape_progress.json` — temporary resume file, auto-deleted after scrape completes
- `index.html` / `styles.css` / `app.js` — frontend (no dependencies)

## Data schema

```json
{
  "title": "One Dance",
  "artist": "Drake (feat. WizKid, Kyla)",
  "totalStreams": 4127415952,
  "dailyStreams": 2025725,
  "url": "https://open.spotify.com/track/1zi7xx7UVEFkmKfv06H8x0"
}
```

## Commands

```bash
# Run scraper (~37 min for 3000 artists, resumable if interrupted)
python3 scrape.py

# Frontend — just open index.html in a browser (no server needed)
```

## Conventions

- No build tools, frameworks, or package managers for the frontend
- Scraper uses 0.75s delay between requests with exponential backoff retries
- Frontend uses bucket-based range sliders (not continuous) for stream filtering
- Mobile-responsive at 768px breakpoint (table → card layout)
