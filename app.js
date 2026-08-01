// Bucket definitions
const TOTAL_BUCKETS = [0, 10000, 50000, 100000, 500000, 1000000, 2000000, 5000000, 10000000, 50000000, 100000000, 500000000, 1000000000, 2000000000, 5000000000];
const DAILY_BUCKETS = [0, 1000, 5000, 10000, 50000, 100000, 500000, 1000000, 5000000];

const PAGE_SIZE = 10;
const DEFAULT_ARTIST = 'Billie Eilish';

// Global chart. SD-6 keeps the app artist-first, so this is deliberately not an
// artist: it is a separate ranked surface, capped so it stays a chart rather than a
// 32,000-page list. The cap is applied AFTER sorting, so "top 1,000" means top by
// whichever sort is selected.
const GLOBAL_KEY = '__global__';
const GLOBAL_LABEL = 'Global chart (all artists)';
const GLOBAL_CAP = 1000;
const SHOW_STREAM_SLIDERS = false;

// Billie Eilish preload for instant display (sorted by total streams)
const PRELOAD = [{"title":"BIRDS OF A FEATHER","artist":"Billie Eilish","totalStreams":3882241596,"dailyStreams":2193342,"url":"https://open.spotify.com/track/6dOtVTDdiauQNBQEDOtlAB","popularity":565.0},{"title":"lovely (with Khalid)","artist":"Billie Eilish (feat. Khalid)","totalStreams":3832217282,"dailyStreams":1078676,"url":"https://open.spotify.com/track/0u2P5u6lvoDfwTYjAADbn4","popularity":281.5},{"title":"bad guy","artist":"Billie Eilish, Justin Bieber","totalStreams":2955590753,"dailyStreams":495257,"url":"https://open.spotify.com/track/2Fxmhks0bxGSBdJ92vM42m","popularity":167.6},{"title":"when the party's over","artist":"Billie Eilish","totalStreams":2536486145,"dailyStreams":544837,"url":"https://open.spotify.com/track/43zdsphuZLzwA9k4DJhU0I","popularity":214.8},{"title":"ocean eyes","artist":"Billie Eilish","totalStreams":2267307647,"dailyStreams":924187,"url":"https://open.spotify.com/track/2uIX8YMNjGMD7441kqyyNU","popularity":407.6},{"title":"WILDFLOWER","artist":"Billie Eilish","totalStreams":2185707218,"dailyStreams":1592665,"url":"https://open.spotify.com/track/3QaPy1KgI7nu9FJEQUgn6h","popularity":728.7},{"title":"everything i wanted","artist":"Billie Eilish","totalStreams":2151451091,"dailyStreams":468052,"url":"https://open.spotify.com/track/3ZCTVFBt2Brf31RLEnCkWJ","popularity":217.6},{"title":"Happier Than Ever","artist":"Billie Eilish","totalStreams":1892689610,"dailyStreams":635027,"url":"https://open.spotify.com/track/4RVwu0g32PAqgUiJoXsdF8","popularity":335.5},{"title":"What Was I Made For? [From The Motion Picture \"Barbie\"]","artist":"Billie Eilish","totalStreams":1652111685,"dailyStreams":555990,"url":"https://open.spotify.com/track/6wf7Yu7cxBSPrRlWeSeK0Q","popularity":336.5},{"title":"idontwannabeyouanymore","artist":"Billie Eilish","totalStreams":1392216167,"dailyStreams":325082,"url":"https://open.spotify.com/track/40T5GIqQ1CegGm2PTEl8Bu","popularity":233.5}];

// State
let allSongs = [];
let artistIndex = {};  // { "artist name lowercase": { name: "Display Name", count: N } }
let selectedArtist = DEFAULT_ARTIST;   // an artist name, or GLOBAL_KEY
let selectedLabel = DEFAULT_ARTIST;    // what the input and results line show
let filtered = [];
let currentPage = 1;
let sortKey = 'totalStreams';
let sortDir = 'desc';
let highlightedIdx = -1;
let lastRenderSignature = null;

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

// Slider logic (disabled when SHOW_STREAM_SLIDERS = false)
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

// Build artist index from all songs. Each entry holds that artist's songs, so lookups
// are a dict hit instead of a scan over the whole dataset.
function buildArtistIndex() {
  artistIndex = {};
  for (const song of allSongs) {
    for (const name of artistNamesFor(song)) {
      const key = name.toLowerCase();
      if (!artistIndex[key]) {
        artistIndex[key] = { name: name, songs: [] };
      }
      // Names for one song are processed consecutively, so checking the tail is enough
      // to stop a song landing twice under keys that differ only by case.
      const songs = artistIndex[key].songs;
      if (songs[songs.length - 1] !== song) songs.push(song);
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

// Songs for the current selection. Returns a copy, since callers sort in place.
function songsForArtist(artistName) {
  if (artistName === GLOBAL_KEY) return allSongs.slice();
  const entry = artistIndex[artistName.toLowerCase()];
  return entry ? entry.songs.slice() : [];
}

function isGlobal() {
  return selectedArtist === GLOBAL_KEY;
}

function sortLabel() {
  const opt = sortSelect.options[sortSelect.selectedIndex];
  return opt ? opt.textContent.toLowerCase() : 'total streams';
}

// Apply filters + sort on current artist's songs
function applyFilters() {
  const [key, dir] = sortSelect.value.split('-');
  sortKey = key;
  sortDir = dir;

  filtered = songsForArtist(selectedArtist);

  sortFiltered();
  // Cap after sorting: the top 1,000 by total streams is a different set from the
  // top 1,000 by popularity.
  if (isGlobal() && filtered.length > GLOBAL_CAP) filtered = filtered.slice(0, GLOBAL_CAP);

  currentPage = 1;
  render();
}

function selectArtist(key, label) {
  selectedArtist = key;
  selectedLabel = label || key;
  artistInput.value = selectedLabel;
  closeDropdown();
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
  const totalPages = Math.max(1, Math.ceil(totalResults / PAGE_SIZE));

  if (currentPage > totalPages) currentPage = totalPages;

  const start = (currentPage - 1) * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, totalResults);
  const page = filtered.slice(start, end);

  // Chrome first, and unconditionally. The counts and empty state depend on
  // totalResults, which legitimately changes even when the visible rows do not (the
  // preload shows 10 of Billie Eilish's songs, the full dataset shows 10 of 78).
  if (totalResults === 0) {
    resultsCount.textContent = '';
    noResults.style.display = 'block';
    tableWrapper.style.display = 'none';
  } else {
    // textContent is already injection-safe; escaping here would double-encode "&"
    // in names like "Mumford & Sons".
    resultsCount.textContent = isGlobal()
      ? `Global chart: showing ${start + 1}\u2013${end} of the top ${totalResults.toLocaleString()} songs by ${sortLabel()}`
      : `${selectedLabel}: showing ${start + 1}\u2013${end} of ${totalResults.toLocaleString()} songs`;
    noResults.style.display = 'none';
    tableWrapper.style.display = '';
  }
  renderPagination(totalPages);

  // Now gate the expensive part. The row DOM and its ten Spotify iframes depend only
  // on WHICH songs are visible, not on how many exist in total. Skipping the rebuild
  // when those are unchanged is what removes the load flash, and it keeps playing
  // embeds alive because nothing detaches them.
  const rowSignature = selectedArtist + '|' + sortKey + '|' + sortDir + '|' + start + '|' +
    page.map(s => s.url + ':' + s.totalStreams + ':' + s.dailyStreams).join(',');
  if (rowSignature === lastRenderSignature) return;
  lastRenderSignature = rowSignature;

  // Release Spotify embed resources before anything detaches their nodes. Blanking src
  // first is load-bearing (SD-3): removing a live iframe leaks the embed and playback
  // dies after a few page changes.
  resultsBody.querySelectorAll('iframe').forEach(f => { f.src = ''; f.remove(); });
  mobileCards.querySelectorAll('iframe').forEach(f => { f.src = ''; f.remove(); });
  if (totalResults === 0) mobileCards.innerHTML = '';

  // Table rows
  resultsBody.innerHTML = '';
  page.forEach((song, i) => {
    const tr = document.createElement('tr');
    const embedUrl = song.url ? song.url.replace('open.spotify.com/track/', 'open.spotify.com/embed/track/') + '?utm_source=generator&theme=0' : '';
    tr.innerHTML = `
      <td>${start + i + 1}</td>
      <td>${truncate(song.title, 45)}</td>
      <td>${truncate(song.artist, 35)}</td>
      <td title="${fullFormat(song.totalStreams)}">${abbreviate(song.totalStreams)}</td>
      <td title="${fullFormat(song.dailyStreams)}">${abbreviate(song.dailyStreams)}</td>
      <td class="embed-cell">${embedUrl ? `<iframe src="${embedUrl}" width="300" height="152" frameborder="0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>` : '<span class="no-preview">No preview</span>'}</td>
    `;
    resultsBody.appendChild(tr);
  });

  // Mobile cards
  mobileCards.innerHTML = '';
  page.forEach((song, j) => {
    const embedUrl = song.url ? song.url.replace('open.spotify.com/track/', 'open.spotify.com/embed/track/') + '?utm_source=generator&theme=0' : '';
    const card = document.createElement('div');
    card.className = 'song-card';
    card.innerHTML = `
      <div class="song-card-top">
        <span class="song-card-rank">${start + j + 1}</span>
        ${embedUrl ? `<div class="song-card-embed"><iframe src="${embedUrl}" height="152" frameborder="0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe></div>` : ''}
      </div>
      <div class="song-card-streams">
        <div><span>Total </span><strong>${abbreviate(song.totalStreams)}</strong></div>
        <div><span>Daily </span><strong>${abbreviate(song.dailyStreams)}</strong></div>
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
    div.innerHTML = `<span class="artist-option-name">${escapeHtml(m.name)}</span><span class="artist-option-count">${m.count.toLocaleString()} songs</span>`;
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
      matches.push({ name: entry.name, key: entry.name, count: entry.songs.length });
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
  const rows = matches.slice(0, 15);
  if (wantsGlobal) {
    rows.unshift({
      name: GLOBAL_LABEL,
      key: GLOBAL_KEY,
      count: Math.min(GLOBAL_CAP, allSongs.length),
    });
  }

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

// Apply button
document.getElementById('apply-btn').addEventListener('click', applyFilters);

// Init
async function init() {
  // Show preloaded data instantly. The index must be built here too, since artist
  // lookup is now an index hit rather than a scan over allSongs.
  allSongs = PRELOAD;
  buildArtistIndex();
  artistInput.value = DEFAULT_ARTIST;
  applyFilters();
  resultsCount.textContent = 'Loading full dataset...';

  // Load full dataset in background
  try {
    allSongs = await loadDataset();
    buildArtistIndex();
    applyFilters();
  } catch (e) {
    // fetch() is blocked on file:// by every modern browser (the origin is opaque),
    // so opening index.html straight off disk can only ever show PRELOAD. Say that
    // plainly instead of a generic failure the user cannot act on.
    resultsCount.textContent = location.protocol === 'file:'
      ? `Sample data only (${allSongs.length} songs). Browsers block file access, so the full dataset needs a local server: run "python3 -m http.server" in this folder, then open http://localhost:8000`
      : `Failed to load full dataset (${e.message}). Showing ${allSongs.length} sample songs.`;
  }
}

async function loadDataset() {
  const res = await fetch('data.json.gz');
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const bytes = new Uint8Array(await res.arrayBuffer());

  // Some hosts serve .gz with Content-Encoding: gzip, in which case the browser has
  // already decompressed it and these bytes are plain JSON. Sniff the gzip magic
  // number rather than assuming: guessing wrong throws deep inside DecompressionStream
  // with an error that looks nothing like a config problem.
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) {
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text());
}

init();
