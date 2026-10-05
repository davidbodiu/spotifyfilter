// Bucket definitions
const TOTAL_BUCKETS = [0, 10000, 50000, 100000, 500000, 1000000, 2000000, 5000000, 10000000, 50000000, 100000000, 500000000, 1000000000, 2000000000, 5000000000];
const DAILY_BUCKETS = [0, 1000, 5000, 10000, 50000, 100000, 500000, 1000000, 5000000];

// Page size is per-device, because the cost is one Spotify embed per row and a phone
// has orders of magnitude less memory for them than a desktop.
//
// SD-3 pinned this at 10 in March after embeds stopped playing at 40 constructed
// iframes. Raised to 50 in R23; the field test failed on mobile (R25): scrolling to the
// bottom loaded all 50 lazy embeds at once, exhausted the tab and made the browser
// discard and reload it. Desktop was unaffected. Both are now below the 40 that broke
// in March. The split is kept so mobile can be lowered further without touching desktop
// if phones still struggle at 30.
//
// The other half of SD-3 is untouched: iframe src is still blanked before removal.
const PAGE_SIZE_DESKTOP = 30;
const PAGE_SIZE_MOBILE = 30;

function pageSize() {
  return mobileQuery.matches ? PAGE_SIZE_MOBILE : PAGE_SIZE_DESKTOP;
}
const DEFAULT_ARTIST = 'Billie Eilish';

// Global chart. SD-6 keeps the app artist-first, so this is deliberately not an
// artist: it is a separate ranked surface, capped so it stays a chart rather than a
// 32,000-page list. The cap is applied AFTER sorting, so "top 1,000" means top by
// whichever sort is selected.
const GLOBAL_KEY = '__global__';
const GLOBAL_LABEL = 'Global chart (all artists)';
const GLOBAL_CAP = 1000;

// New releases (R33). Same pattern as the global chart: a sentinel key that cannot
// collide with an artist name and one precomputed file, data/new.json, holding every
// song whose releaseDate falls inside the window build_pages.py chose
// (NEW_RELEASE_DAYS, which the "7" in the label must match). The file ships the window
// itself so the results line can say what "new" means for this data vintage.
const NEW_KEY = '__new__';
const NEW_LABEL = 'New releases (last 7 days)';
// The 30-day page (R40): same shape, wider window. Keys, files and the days in the
// labels must match NEW_WINDOWS in build_pages.py.
const NEW30_KEY = '__new30__';
const NEW30_LABEL = 'New releases (last 30 days)';
const NEW_SURFACES = {
  [NEW_KEY]: 'data/new.json',
  [NEW30_KEY]: 'data/new30.json',
};
// Top 30 per sort (R39). Each file ships the union of the top 30 by total and by
// daily, so the cap must come AFTER sorting, exactly like GLOBAL_CAP.
const NEW_CAP = 30;
let newWindow = null;   // { since, until, days } of the surface last loaded

// Deep-link slugs for the non-artist surfaces.
const SURFACES = {
  global: { key: GLOBAL_KEY, label: GLOBAL_LABEL },
  new: { key: NEW_KEY, label: NEW_LABEL },
  'new-30': { key: NEW30_KEY, label: NEW30_LABEL },
};

// Related artists. Derived from the artist's own shard, which already contains exactly
// the songs they appear on, so it needs no extra file and no extra request. Verified
// to match build_pages.py's whole-dataset co-occurrence byte for byte.
const RELATED_CAP = 12;
const SHOW_STREAM_SLIDERS = false;

// Billie Eilish preload for instant display (sorted by total streams)
const PRELOAD = [{"title":"BIRDS OF A FEATHER","artist":"Billie Eilish","totalStreams":4020622722,"dailyStreams":1968059,"url":"https://open.spotify.com/track/6dOtVTDdiauQNBQEDOtlAB","popularity":489.5,"releaseDate":"2024-05-17","genre":"Alternative & Indie"},{"title":"lovely (with Khalid)","artist":"Billie Eilish (feat. Khalid)","totalStreams":3896891906,"dailyStreams":1017278,"url":"https://open.spotify.com/track/0u2P5u6lvoDfwTYjAADbn4","popularity":261.0,"releaseDate":"2018-04-19","genre":"Alternative & Indie"},{"title":"bad guy","artist":"Billie Eilish, Justin Bieber","totalStreams":2985233972,"dailyStreams":486566,"url":"https://open.spotify.com/track/2Fxmhks0bxGSBdJ92vM42m","popularity":163.0,"releaseDate":"2019-03-29","genre":"Alternative & Indie"},{"title":"when the party's over","artist":"Billie Eilish","totalStreams":2571182480,"dailyStreams":510305,"url":"https://open.spotify.com/track/43zdsphuZLzwA9k4DJhU0I","popularity":198.5,"releaseDate":"2019-03-29","genre":"Alternative & Indie"},{"title":"ocean eyes","artist":"Billie Eilish","totalStreams":2325500402,"dailyStreams":854751,"url":"https://open.spotify.com/track/2uIX8YMNjGMD7441kqyyNU","popularity":367.6,"releaseDate":"2016-11-18","genre":"Alternative & Indie"},{"title":"WILDFLOWER","artist":"Billie Eilish","totalStreams":2290438308,"dailyStreams":1648205,"url":"https://open.spotify.com/track/3QaPy1KgI7nu9FJEQUgn6h","popularity":719.6,"releaseDate":"2024-05-17","genre":"Alternative & Indie"},{"title":"everything i wanted","artist":"Billie Eilish","totalStreams":2179936093,"dailyStreams":426352,"url":"https://open.spotify.com/track/3ZCTVFBt2Brf31RLEnCkWJ","popularity":195.6,"releaseDate":"2019-11-13","genre":"Alternative & Indie"},{"title":"Happier Than Ever","artist":"Billie Eilish","totalStreams":1933130551,"dailyStreams":636856,"url":"https://open.spotify.com/track/4RVwu0g32PAqgUiJoXsdF8","popularity":329.4,"releaseDate":"2021-07-30","genre":"Alternative & Indie"},{"title":"What Was I Made For? [From The Motion Picture \"Barbie\"]","artist":"Billie Eilish","totalStreams":1688776873,"dailyStreams":512530,"url":"https://open.spotify.com/track/6wf7Yu7cxBSPrRlWeSeK0Q","popularity":303.5,"releaseDate":"2023-07-13","genre":"Alternative & Indie"},{"title":"i love you","artist":"Billie Eilish","totalStreams":1419039296,"dailyStreams":412576,"url":"https://open.spotify.com/track/6CcJMwBtXByIz4zQLzFkKc","popularity":290.7,"releaseDate":"2019-03-29","genre":"Alternative & Indie"}];

// State
let artistIndex = {};  // { "artist name lowercase": { name: "Display Name", count: N } }
let selectedArtist = DEFAULT_ARTIST;   // an artist name, or GLOBAL_KEY
let selectedLabel = DEFAULT_ARTIST;    // what the input and results line show
let filtered = [];
let currentPage = 1;
let sortKey = 'totalStreams';
let sortDir = 'desc';
let highlightedIdx = -1;
let lastRenderSignature = null;

// CSS shows the table above 768px and the cards below it. render() used to build both
// and let CSS hide one, so half of every page's Spotify embeds were constructed into a
// container nobody could see. Track the breakpoint and build one.
const mobileQuery = window.matchMedia('(max-width: 768px)');

// DOM refs
const artistInput = document.getElementById('artist-input');
const artistDropdown = document.getElementById('artist-dropdown');
const sortSelect = document.getElementById('sort-select');
const resultsCount = document.getElementById('results-count');
const resultsBody = document.getElementById('results-body');
const noResults = document.getElementById('no-results');
const pagination = document.getElementById('pagination');
const tableWrapper = document.querySelector('.table-wrapper');
const mobileCards = document.getElementById('mobile-cards');

// Format numbers
function abbreviate(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return n.toString();
}

function fullFormat(n) {
  return n.toLocaleString();
}

// "2019-05-17" -> "17 May 2019". Built from the ISO parts, not Date(), so a date never
// shifts by a day in a timezone west of UTC.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function formatDate(iso) {
  if (!iso) return '\u2013';
  const [y, m, d] = iso.split('-');
  return `${+d} ${MONTHS[+m - 1]} ${y}`;
}

// Slider logic. DEAD CODE, kept deliberately per SD-8. SHOW_STREAM_SLIDERS is never
// read and setting it true does nothing: the markup was removed from index.html and
// nothing branches on the flag. Restoring sliders means restoring the markup and
// rewiring the filter into applyFilters().
function bucketLabel(value) {
  if (value === 0) return '0';
  return abbreviate(value) + '+';
}

function updateSliderFill(minSlider, maxSlider, fill) {
  const max = parseInt(minSlider.max);
  const minVal = parseInt(minSlider.value);
  const maxVal = parseInt(maxSlider.value);
  fill.style.left = (minVal / max) * 100 + '%';
  fill.style.width = ((maxVal - minVal) / max) * 100 + '%';
}

function setupSlider(minSlider, maxSlider, fill, minLabel, maxLabel, buckets) {
  function update() {
    let minVal = parseInt(minSlider.value);
    let maxVal = parseInt(maxSlider.value);
    if (minVal > maxVal) { minSlider.value = maxVal; minVal = maxVal; }
    if (maxVal < minVal) { maxSlider.value = minVal; maxVal = minVal; }
    minLabel.textContent = bucketLabel(buckets[minVal]);
    maxLabel.textContent = abbreviate(buckets[maxVal]) + (maxVal === buckets.length - 1 ? '+' : '');
    updateSliderFill(minSlider, maxSlider, fill);
  }
  minSlider.addEventListener('input', update);
  maxSlider.addEventListener('input', update);
  update();
}

// Artist names for a song. Prefers the structured fields; falls back to parsing the
// display string. The fallback is PERMANENT: archived snapshots in snapshots/ predate
// leads/features, and reading them is the basis of any future time-window feature.
function artistNamesFor(song) {
  if (song.leads) return [...song.leads, ...(song.features || [])];
  return parseArtistNames(song.artist);
}

// Build the artist index from the small index file (~45 KB gzipped) rather than from
// the whole dataset. Songs are fetched per artist on demand, so the browser never
// downloads 19.6 MB to show ten rows.
function buildArtistIndex(entries) {
  artistIndex = {};
  for (const e of entries) {
    const key = e.n.toLowerCase();
    if (key === GLOBAL_KEY || key in NEW_SURFACES) {
      console.warn('An artist is named ' + key + '; a surface key collides.');
      continue;
    }
    artistIndex[key] = { name: e.n, slug: e.s, count: e.c };
  }
}

// Index built from PRELOAD alone, so the default artist resolves during first paint.
function buildPreloadIndex() {
  artistIndex = {};
  for (const song of PRELOAD) {
    for (const name of artistNamesFor(song)) {
      const key = name.toLowerCase();
      if (!artistIndex[key]) artistIndex[key] = { name: name, slug: null, count: 0 };
      artistIndex[key].count++;
    }
  }
}

// Legacy path: recover names from the display string. Lossy for names containing
// commas ("Tyler, The Creator" splits into two), which is why the scraper now emits
// leads/features directly.
function parseArtistNames(artistStr) {
  // "Drake (feat. WizKid, Kyla)" -> ["Drake", "WizKid", "Kyla"]
  const names = [];
  const featMatch = artistStr.match(/^(.*?)(?:\s*\(feat\.\s*(.*)\))?$/);
  if (featMatch) {
    const leads = featMatch[1].split(',').map(s => s.trim()).filter(Boolean);
    names.push(...leads);
    if (featMatch[2]) {
      const feats = featMatch[2].split(',').map(s => s.trim()).filter(Boolean);
      names.push(...feats);
    }
  } else {
    names.push(artistStr.trim());
  }
  return names;
}

// Songs for the current selection, fetched and cached per artist. Returns a copy,
// since callers sort in place.
const shardCache = new Map();

async function songsForArtist(artistName) {
  if (artistName === GLOBAL_KEY) {
    const glob = await fetchJson('data/global.json', 'global');
    return (glob[sortKey] || glob.totalStreams).slice();
  }
  if (artistName in NEW_SURFACES) {
    // Cache by file, not by a shared label: one key for both would serve the 7-day
    // list on the 30-day surface.
    const data = await fetchJson(NEW_SURFACES[artistName], NEW_SURFACES[artistName]);
    newWindow = { since: data.since, until: data.until, days: data.days };
    return data.songs.slice();
  }
  const entry = artistIndex[artistName.toLowerCase()];
  if (!entry) return [];
  // Before the index lands, PRELOAD is all we have and it has no shard.
  if (!entry.slug) return PRELOAD.filter(s =>
    artistNamesFor(s).some(n => n.toLowerCase() === artistName.toLowerCase()));
  return (await fetchJson(`data/artist/${entry.slug}.json`, entry.slug)).slice();
}

async function fetchJson(url, cacheKey) {
  if (shardCache.has(cacheKey)) return shardCache.get(cacheKey);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const data = await res.json();
  shardCache.set(cacheKey, data);
  return data;
}

function isGlobal() {
  return selectedArtist === GLOBAL_KEY;
}

function isNew() {
  return selectedArtist in NEW_SURFACES;
}

function sortLabel() {
  const opt = sortSelect.options[sortSelect.selectedIndex];
  return opt ? opt.textContent.toLowerCase() : 'total streams';
}

// Apply filters + sort on the current selection.
let applyToken = 0;

async function applyFilters() {
  const [key, dir] = sortSelect.value.split('-');
  sortKey = key;
  sortDir = dir;

  // Guard against a slow fetch for a previous selection landing after a newer one.
  const token = ++applyToken;
  let songs;
  try {
    songs = await songsForArtist(selectedArtist);
  } catch (e) {
    if (token !== applyToken) return;
    resultsCount.textContent = `Could not load songs for ${selectedLabel} (${e.message}).`;
    return;
  }
  if (token !== applyToken) return;
  filtered = songs;
  renderRelated(songs);

  sortFiltered();
  // Cap after sorting: the top 1,000 by total streams is a different set from the
  // top 1,000 by popularity.
  if (isGlobal() && filtered.length > GLOBAL_CAP) filtered = filtered.slice(0, GLOBAL_CAP);
  if (isNew() && filtered.length > NEW_CAP) filtered = filtered.slice(0, NEW_CAP);

  currentPage = 1;
  render();
}

function selectArtist(key, label) {
  selectedArtist = key;
  selectedLabel = label || key;
  artistInput.value = selectedLabel;
  closeDropdown();
  // Reflect the selection in the URL so artist pages can deep-link into the app and
  // the back button works.
  const entry = artistIndex[key.toLowerCase()];
  const surfaceSlug = Object.keys(SURFACES).find(k => SURFACES[k].key === key);
  const slug = surfaceSlug || (entry && entry.slug);
  if (slug && window.history && history.pushState) {
    history.pushState({ artist: slug }, '', `/?artist=${slug}`);
  }
  applyFilters();
}

// Sorting
function sortFiltered() {
  filtered.sort((a, b) => {
    let valA = a[sortKey];
    let valB = b[sortKey];
    if (typeof valA === 'string') {
      valA = valA.toLowerCase();
      valB = valB.toLowerCase();
      if (valA < valB) return sortDir === 'asc' ? -1 : 1;
      if (valA > valB) return sortDir === 'asc' ? 1 : -1;
      return 0;
    }
    return sortDir === 'asc' ? valA - valB : valB - valA;
  });
}


// Rendering
function render() {
  const totalResults = filtered.length;
  const size = pageSize();
  const totalPages = Math.max(1, Math.ceil(totalResults / size));

  if (currentPage > totalPages) currentPage = totalPages;

  const start = (currentPage - 1) * size;
  const end = Math.min(start + size, totalResults);
  const page = filtered.slice(start, end);

  // Chrome first, and unconditionally. The counts and empty state depend on
  // totalResults, which legitimately changes even when the visible rows do not (the
  // preload shows 10 of Billie Eilish's songs, the full dataset shows 10 of 78).
  if (totalResults === 0) {
    resultsCount.textContent = '';
    noResults.textContent = isNew()
      ? `No new releases from the last ${newWindow ? newWindow.days : 7} days are listed yet.`
      : 'No songs found for this artist';
    noResults.style.display = 'block';
    tableWrapper.style.display = 'none';
  } else {
    // textContent is already injection-safe; escaping here would double-encode "&"
    // in names like "Mumford & Sons".
    if (isGlobal()) {
      resultsCount.textContent = `Global chart: showing ${start + 1}\u2013${end} of the top ${totalResults.toLocaleString()} songs by ${sortLabel()}`;
    } else if (isNew()) {
      const window_ = newWindow ? ` released ${formatDate(newWindow.since)} to ${formatDate(newWindow.until)}` : '';
      resultsCount.textContent = `New releases: the top ${totalResults.toLocaleString()} songs${window_}, by ${sortLabel()}`;
    } else {
      resultsCount.textContent = `${selectedLabel}: showing ${start + 1}\u2013${end} of ${totalResults.toLocaleString()} songs`;
    }
    noResults.style.display = 'none';
    tableWrapper.style.display = '';
  }
  renderPagination(totalPages);

  // Now gate the expensive part. The row DOM and its ten Spotify iframes depend only
  // on WHICH songs are visible, not on how many exist in total. Skipping the rebuild
  // when those are unchanged is what removes the load flash, and it keeps playing
  // embeds alive because nothing detaches them.
  const rowSignature = selectedArtist + '|' + sortKey + '|' + sortDir + '|' + start + '|' +
    (mobileQuery.matches ? 'm|' : 'd|') +
    page.map(s => s.url + ':' + s.totalStreams + ':' + s.dailyStreams + ':' + (s.releaseDate || '') + ':' + (s.genre || '')).join(',');
  if (rowSignature === lastRenderSignature) return;
  lastRenderSignature = rowSignature;

  // Release Spotify embed resources before anything detaches their nodes. Blanking src
  // first is load-bearing (SD-3): removing a live iframe leaks the embed and playback
  // dies after a few page changes.
  resultsBody.querySelectorAll('iframe').forEach(f => { f.src = ''; f.remove(); });
  mobileCards.querySelectorAll('iframe').forEach(f => { f.src = ''; f.remove(); });
  if (totalResults === 0) mobileCards.innerHTML = '';

  // Table rows (desktop layout only)
  resultsBody.innerHTML = '';
  if (!mobileQuery.matches) page.forEach((song, i) => {
    const tr = document.createElement('tr');
    const embedUrl = song.url ? song.url.replace('open.spotify.com/track/', 'open.spotify.com/embed/track/') + '?utm_source=generator&theme=0' : '';
    tr.innerHTML = `
      <td>${start + i + 1}</td>
      <td>${truncate(song.title, 45)}</td>
      <td>${truncate(song.artist, 35)}${song.genre ? `<div class="genre-tag">${escapeHtml(song.genre)}</div>` : ''}</td>
      <td title="${fullFormat(song.totalStreams)}">${abbreviate(song.totalStreams)}</td>
      <td title="${fullFormat(song.dailyStreams)}">${abbreviate(song.dailyStreams)}</td>
      <td class="date-cell">${formatDate(song.releaseDate)}</td>
      <td class="embed-cell">${embedUrl ? `<iframe src="${embedUrl}" width="300" height="152" frameborder="0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>` : '<span class="no-preview">No preview</span>'}</td>
    `;
    resultsBody.appendChild(tr);
  });

  // Mobile cards (mobile layout only)
  mobileCards.innerHTML = '';
  if (mobileQuery.matches) page.forEach((song, j) => {
    const embedUrl = song.url ? song.url.replace('open.spotify.com/track/', 'open.spotify.com/embed/track/') + '?utm_source=generator&theme=0' : '';
    const card = document.createElement('div');
    card.className = 'song-card';
    card.innerHTML = `
      <div class="song-card-top">
        <span class="song-card-rank">${start + j + 1}</span>
        ${embedUrl
          ? `<div class="song-card-embed"><iframe src="${embedUrl}" height="152" frameborder="0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe></div>`
          : `<div class="song-card-meta"><div class="song-card-title">${truncate(song.title, 60)}</div><div class="song-card-artist">${truncate(song.artist, 50)}</div></div>`}
      </div>
      <div class="song-card-streams">
        <div><span>Total </span><strong>${abbreviate(song.totalStreams)}</strong></div>
        <div><span>Daily </span><strong>${abbreviate(song.dailyStreams)}</strong></div>
        <div><span>Released </span><strong>${formatDate(song.releaseDate)}</strong></div>
        ${song.genre ? `<div><span>Genre </span><strong>${escapeHtml(song.genre)}</strong></div>` : ''}
      </div>
    `;
    mobileCards.appendChild(card);
  });

}

function renderPagination(totalPages) {
  pagination.innerHTML = '';
  if (totalPages <= 1) return;

  // Prev button
  const prev = document.createElement('button');
  prev.textContent = '\u2039';
  prev.disabled = currentPage === 1;
  prev.addEventListener('click', () => { currentPage--; render(); scrollToResults(); });
  pagination.appendChild(prev);

  // Page numbers with ellipsis
  const pages = getPageNumbers(currentPage, totalPages);
  pages.forEach(p => {
    if (p === '...') {
      const span = document.createElement('span');
      span.className = 'page-ellipsis';
      span.textContent = '...';
      pagination.appendChild(span);
    } else {
      const btn = document.createElement('button');
      btn.textContent = p;
      if (p === currentPage) btn.className = 'active';
      btn.addEventListener('click', () => { currentPage = p; render(); scrollToResults(); });
      pagination.appendChild(btn);
    }
  });

  // Next button
  const next = document.createElement('button');
  next.textContent = '\u203A';
  next.disabled = currentPage === totalPages;
  next.addEventListener('click', () => { currentPage++; render(); scrollToResults(); });
  pagination.appendChild(next);
}

function getPageNumbers(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages = [];
  pages.push(1);

  if (current > 3) pages.push('...');

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let i = start; i <= end; i++) pages.push(i);

  if (current < total - 2) pages.push('...');

  pages.push(total);
  return pages;
}

function scrollToResults() {
  document.querySelector('.results').scrollIntoView({ behavior: 'smooth' });
}

// Escapes for BOTH text and attribute contexts. The DOM textContent/innerHTML trick
// alone does not escape quotes, which silently broke every title="..." built by
// truncate() for a value containing a double quote.
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function truncate(str, max) {
  if (str.length <= max) return escapeHtml(str);
  return `<span title="${escapeHtml(str)}">${escapeHtml(str.slice(0, max))}\u2026</span>`;
}

// Artist dropdown
function showDropdown(matches) {
  artistDropdown.innerHTML = '';
  highlightedIdx = -1;
  if (matches.length === 0) {
    closeDropdown();
    return;
  }
  matches.forEach((m, i) => {
    const div = document.createElement('div');
    div.className = 'artist-option';
    const countHtml = m.count == null ? ''
      : `<span class="artist-option-count">${m.count.toLocaleString()} songs</span>`;
    div.innerHTML = `<span class="artist-option-name">${escapeHtml(m.name)}</span>${countHtml}`;
    div.dataset.key = m.key;
    div.dataset.label = m.name;
    div.addEventListener('mousedown', (e) => {
      e.preventDefault(); // prevent blur from firing before click
      selectArtist(m.key, m.name);
    });
    artistDropdown.appendChild(div);
  });
  artistDropdown.classList.add('open');
}

function closeDropdown() {
  artistDropdown.classList.remove('open');
  highlightedIdx = -1;
}

function highlightOption(idx) {
  const options = artistDropdown.querySelectorAll('.artist-option');
  options.forEach(o => o.classList.remove('highlighted'));
  if (idx >= 0 && idx < options.length) {
    options[idx].classList.add('highlighted');
    options[idx].scrollIntoView({ block: 'nearest' });
  }
  highlightedIdx = idx;
}

artistInput.addEventListener('input', () => {
  const query = artistInput.value.toLowerCase().trim();
  if (query.length < 1) {
    closeDropdown();
    return;
  }

  // Search artist index
  const matches = [];
  for (const key in artistIndex) {
    if (key.includes(query)) {
      const entry = artistIndex[key];
      matches.push({ name: entry.name, key: entry.name, count: entry.count });
    }
  }
  // Sort: exact start match first, then by song count
  matches.sort((a, b) => {
    const aStarts = a.name.toLowerCase().startsWith(query) ? 0 : 1;
    const bStarts = b.name.toLowerCase().startsWith(query) ? 0 : 1;
    if (aStarts !== bStarts) return aStarts - bStarts;
    return b.count - a.count;
  });

  // The global chart rides at the top while the query is still short, or when it
  // plainly matches, so it is discoverable without polluting real artist searches.
  const wantsGlobal = query.length <= 2 ||
    'global chart all artists'.includes(query) || 'all'.startsWith(query);
  const wantsNew = query.length <= 2 ||
    'new releases last 7 days'.includes(query) || 'latest'.startsWith(query);
  const wantsNew30 = query.length <= 2 ||
    'new releases last 30 days'.includes(query) || 'month'.startsWith(query);
  const rows = matches.slice(0, 15);
  // No count on any surface row: the global chart is the top 1,000 PER SORT
  // (largely different sets), and the new-releases pools change size every week.
  if (wantsNew30) rows.unshift({ name: NEW30_LABEL, key: NEW30_KEY, count: null });
  if (wantsNew) rows.unshift({ name: NEW_LABEL, key: NEW_KEY, count: null });
  if (wantsGlobal) rows.unshift({ name: GLOBAL_LABEL, key: GLOBAL_KEY, count: null });

  showDropdown(rows);
});

artistInput.addEventListener('focus', () => {
  artistInput.select();
});

artistInput.addEventListener('blur', () => {
  closeDropdown();
  // Restore the selected label if the input was cleared or edited without selecting.
  artistInput.value = selectedLabel;
});

artistInput.addEventListener('keydown', (e) => {
  const options = artistDropdown.querySelectorAll('.artist-option');
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    highlightOption(Math.min(highlightedIdx + 1, options.length - 1));
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    highlightOption(Math.max(highlightedIdx - 1, 0));
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (highlightedIdx >= 0 && highlightedIdx < options.length) {
      const opt = options[highlightedIdx];
      selectArtist(opt.dataset.key, opt.dataset.label);
    }
  } else if (e.key === 'Escape') {
    closeDropdown();
    artistInput.blur();
  }
});

// Theme: System -> Light -> Dark -> System.
// "System" means no data-theme attribute, so the CSS prefers-color-scheme block
// applies and the device wins. The other two stamp an explicit override.
const THEME_KEY = 'chartrank-theme';
const THEME_STATES = [
  { value: 'system', icon: 'A', label: 'System' },
  { value: 'light',  icon: 'L', label: 'Light' },
  { value: 'dark',   icon: 'D', label: 'Dark' },
];

const themeToggle = document.getElementById('theme-toggle');
const themeIcon = document.getElementById('theme-toggle-icon');
const themeLabel = document.getElementById('theme-toggle-label');

function readStoredTheme() {
  // Safari throws on localStorage over file://, so every access is guarded.
  try {
    const stored = localStorage.getItem(THEME_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch (e) {
    return 'system';
  }
}

function applyTheme(value) {
  currentTheme = value;
  if (value === 'system') {
    document.documentElement.removeAttribute('data-theme');
    try { localStorage.removeItem(THEME_KEY); } catch (e) {}
  } else {
    document.documentElement.setAttribute('data-theme', value);
    try { localStorage.setItem(THEME_KEY, value); } catch (e) {}
  }
  const state = THEME_STATES.find(s => s.value === value) || THEME_STATES[0];
  themeIcon.textContent = state.icon;
  themeLabel.textContent = state.label;
  themeToggle.setAttribute('aria-label', `Colour theme: ${state.label}`);
  syncThemeColor(value);
}

// The two <meta name="theme-color"> tags are media-gated on the device preference, so
// an explicit override left the browser chrome contradicting the page.
function syncThemeColor(value) {
  const dark = value === 'dark' || (value === 'system' &&
    window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.remove());
  const meta = document.createElement('meta');
  meta.name = 'theme-color';
  meta.content = dark ? '#121212' : '#eef0f3';
  document.head.appendChild(meta);
}

// In-memory state is the source of truth; storage is best-effort persistence. Reading
// it back would jam the cycle wherever localStorage is unavailable, which includes the
// file:// path this app documents.
let currentTheme = readStoredTheme();

themeToggle.addEventListener('click', () => {
  const i = THEME_STATES.findIndex(s => s.value === currentTheme);
  applyTheme(THEME_STATES[(i + 1) % THEME_STATES.length].value);
});

applyTheme(currentTheme);

// Filters toggle
const filtersToggle = document.getElementById('filters-toggle');
const filterRow = document.getElementById('filter-row');

filtersToggle.addEventListener('click', (e) => {
  e.preventDefault();
  const open = filterRow.style.display !== 'none';
  filterRow.style.display = open ? 'none' : '';
  filtersToggle.classList.toggle('open', !open);
});

// Crossing the breakpoint swaps which layout CSS shows, and that layout was never
// built. Force a rebuild rather than leaving an empty container.
mobileQuery.addEventListener('change', () => {
  lastRenderSignature = null;
  render();
});

// Random artist. Uniform over every artist in the index, so it genuinely surfaces the
// long tail rather than reshuffling the famous names.
const relatedEl = document.getElementById('related');

// Everyone credited alongside `forName` on their own tracks, most frequent first.
function relatedArtists(songs, forName) {
  const self = forName.toLowerCase();
  const counts = new Map();
  for (const song of songs) {
    for (const name of artistNamesFor(song)) {
      if (name.toLowerCase() === self) continue;
      counts.set(name, (counts.get(name) || 0) + 1);
    }
  }
  return [...counts.entries()]
    // Only offer names the index can actually resolve, so no chip is a dead end.
    .filter(([name]) => artistIndex[name.toLowerCase()])
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, RELATED_CAP);
}

function renderRelated(songs) {
  relatedEl.innerHTML = '';
  const related = (isGlobal() || isNew()) ? [] : relatedArtists(songs, selectedArtist);
  if (!related.length) {
    relatedEl.hidden = true;
    return;
  }
  relatedEl.hidden = false;
  const label = document.createElement('span');
  label.className = 'related-label';
  label.textContent = 'Often appears with';
  relatedEl.appendChild(label);
  for (const [name, n] of related) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'related-chip';
    chip.textContent = name;
    chip.title = `${n} song${n === 1 ? '' : 's'} together`;
    chip.addEventListener('click', () => selectArtist(name, name));
    relatedEl.appendChild(chip);
  }
}

const randomBtn = document.getElementById('random-btn');

randomBtn.addEventListener('click', () => {
  const keys = Object.keys(artistIndex);
  if (!keys.length) return;
  const entry = artistIndex[keys[Math.floor(Math.random() * keys.length)]];
  selectArtist(entry.name, entry.name);
});

// Sort commits immediately. There was an Apply button, left over from when it also
// committed the stream-range sliders; with only a sort left it gated a single dropdown
// and let the results line describe a sort that had not been applied.
sortSelect.addEventListener('change', applyFilters);

// Init
async function init() {
  // Paint instantly from the inlined preload. buildPreloadIndex() is required, not an
  // optimisation: artist lookup goes through the index.
  buildPreloadIndex();
  const deepLink = new URLSearchParams(location.search).get('artist');
  artistInput.value = DEFAULT_ARTIST;
  await applyFilters();
  resultsCount.textContent = 'Loading artists...';

  let entries;
  try {
    entries = await fetchJson('data/artists.json', '__index__');
  } catch (e) {
    // fetch() is blocked on file:// by every modern browser (the origin is opaque),
    // so opening index.html straight off disk can only ever show PRELOAD.
    resultsCount.textContent = location.protocol === 'file:'
      ? `Sample data only (${PRELOAD.length} songs). Browsers block file access, so the full dataset needs a local server: run "python3 -m http.server" in the public folder, then open http://localhost:8000`
      : `Failed to load the artist index (${e.message}). Showing ${PRELOAD.length} sample songs.`;
    return;
  }

  buildArtistIndex(entries);

  // Deep link from a generated artist page, e.g. /?artist=tyler-the-creator
  if (deepLink) {
    const surface = SURFACES[deepLink];
    const hit = surface || entries.find(e => e.s === deepLink);
    if (hit) {
      selectedArtist = surface ? surface.key : hit.n;
      selectedLabel = surface ? surface.label : hit.n;
      artistInput.value = selectedLabel;
    }
  }

  await applyFilters();
}

window.addEventListener('popstate', () => {
  const slug = new URLSearchParams(location.search).get('artist');
  const entry = slug && Object.values(artistIndex).find(e => e.slug === slug);
  const surface = SURFACES[slug];
  if (surface) { selectedArtist = surface.key; selectedLabel = surface.label; }
  else if (entry) { selectedArtist = entry.name; selectedLabel = entry.name; }
  else { selectedArtist = DEFAULT_ARTIST; selectedLabel = DEFAULT_ARTIST; }
  artistInput.value = selectedLabel;
  applyFilters();
});

init();
