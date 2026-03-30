// Bucket definitions
const TOTAL_BUCKETS = [0, 10000, 50000, 100000, 500000, 1000000, 2000000, 5000000, 10000000, 50000000, 100000000, 500000000, 1000000000, 2000000000, 5000000000];
const DAILY_BUCKETS = [0, 1000, 5000, 10000, 50000, 100000, 500000, 1000000, 5000000];

const PAGE_SIZE = 10;
const DEFAULT_ARTIST = 'Billie Eilish';

// Billie Eilish preload for instant display (sorted by total streams)
const PRELOAD = [{"title":"lovely (with Khalid)","artist":"Billie Eilish (feat. Khalid)","totalStreams":3700286167,"dailyStreams":1127974,"url":"https://open.spotify.com/track/0u2P5u6lvoDfwTYjAADbn4","popularity":304.8},{"title":"BIRDS OF A FEATHER","artist":"Billie Eilish","totalStreams":3591941979,"dailyStreams":2455063,"url":"https://open.spotify.com/track/6dOtVTDdiauQNBQEDOtlAB","popularity":683.5},{"title":"bad guy","artist":"Billie Eilish, Justin Bieber","totalStreams":2894198114,"dailyStreams":489843,"url":"https://open.spotify.com/track/2Fxmhks0bxGSBdJ92vM42m","popularity":169.2},{"title":"when the party's over","artist":"Billie Eilish","totalStreams":2458161755,"dailyStreams":723958,"url":"https://open.spotify.com/track/43zdsphuZLzwA9k4DJhU0I","popularity":294.5},{"title":"ocean eyes","artist":"Billie Eilish","totalStreams":2146404624,"dailyStreams":1068260,"url":"https://open.spotify.com/track/2uIX8YMNjGMD7441kqyyNU","popularity":497.7},{"title":"everything i wanted","artist":"Billie Eilish","totalStreams":2085899148,"dailyStreams":613771,"url":"https://open.spotify.com/track/3ZCTVFBt2Brf31RLEnCkWJ","popularity":294.2},{"title":"WILDFLOWER","artist":"Billie Eilish","totalStreams":1969890866,"dailyStreams":1986809,"url":"https://open.spotify.com/track/3QaPy1KgI7nu9FJEQUgn6h","popularity":1008.6},{"title":"Happier Than Ever","artist":"Billie Eilish","totalStreams":1809941834,"dailyStreams":672676,"url":"https://open.spotify.com/track/4RVwu0g32PAqgUiJoXsdF8","popularity":371.7},{"title":"What Was I Made For? [From The Motion Picture \"Barbie\"]","artist":"Billie Eilish","totalStreams":1573453372,"dailyStreams":696600,"url":"https://open.spotify.com/track/6wf7Yu7cxBSPrRlWeSeK0Q","popularity":442.7},{"title":"idontwannabeyouanymore","artist":"Billie Eilish","totalStreams":1350643575,"dailyStreams":348429,"url":"https://open.spotify.com/track/40T5GIqQ1CegGm2PTEl8Bu","popularity":258.0}];

// State
let allSongs = [];
let artistIndex = {};  // { "artist name lowercase": { name: "Display Name", count: N } }
let selectedArtist = DEFAULT_ARTIST;
let filtered = [];
let currentPage = 1;
let sortKey = 'totalStreams';
let sortDir = 'desc';
let highlightedIdx = -1;

// DOM refs
const artistInput = document.getElementById('artist-input');
const artistDropdown = document.getElementById('artist-dropdown');
const totalMinSlider = document.getElementById('total-min');
const totalMaxSlider = document.getElementById('total-max');
const dailyMinSlider = document.getElementById('daily-min');
const dailyMaxSlider = document.getElementById('daily-max');
const totalMinLabel = document.getElementById('total-min-label');
const totalMaxLabel = document.getElementById('total-max-label');
const dailyMinLabel = document.getElementById('daily-min-label');
const dailyMaxLabel = document.getElementById('daily-max-label');
const totalFill = document.getElementById('total-fill');
const dailyFill = document.getElementById('daily-fill');
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

function bucketLabel(value) {
  if (value === 0) return '0';
  return abbreviate(value) + (value === TOTAL_BUCKETS[TOTAL_BUCKETS.length - 1] || value === DAILY_BUCKETS[DAILY_BUCKETS.length - 1] ? '+' : '');
}

// Slider logic
function updateSliderFill(minSlider, maxSlider, fill) {
  const max = parseInt(minSlider.max);
  const minVal = parseInt(minSlider.value);
  const maxVal = parseInt(maxSlider.value);
  const left = (minVal / max) * 100;
  const right = (maxVal / max) * 100;
  fill.style.left = left + '%';
  fill.style.width = (right - left) + '%';
}

function setupSlider(minSlider, maxSlider, fill, minLabel, maxLabel, buckets) {
  function update() {
    let minVal = parseInt(minSlider.value);
    let maxVal = parseInt(maxSlider.value);

    if (minVal > maxVal) {
      minSlider.value = maxVal;
      minVal = maxVal;
    }
    if (maxVal < minVal) {
      maxSlider.value = minVal;
      maxVal = minVal;
    }

    minLabel.textContent = bucketLabel(buckets[minVal]);
    const isMaxBucket = maxVal === buckets.length - 1;
    maxLabel.textContent = abbreviate(buckets[maxVal]) + (isMaxBucket ? '+' : '');

    updateSliderFill(minSlider, maxSlider, fill);
  }

  minSlider.addEventListener('input', update);
  maxSlider.addEventListener('input', update);
  update();
}

// Build artist index from all songs
function buildArtistIndex() {
  artistIndex = {};
  for (const song of allSongs) {
    const artistStr = song.artist;
    // Extract individual artist names
    const names = parseArtistNames(artistStr);
    for (const name of names) {
      const key = name.toLowerCase();
      if (!artistIndex[key]) {
        artistIndex[key] = { name: name, count: 0 };
      }
      artistIndex[key].count++;
    }
  }
}

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

// Filter songs by selected artist
function songsForArtist(artistName) {
  const lower = artistName.toLowerCase();
  return allSongs.filter(song => {
    const names = parseArtistNames(song.artist).map(n => n.toLowerCase());
    return names.includes(lower);
  });
}

// Apply filters + sort on current artist's songs
function applyFilters() {
  const [key, dir] = sortSelect.value.split('-');
  sortKey = key;
  sortDir = dir;

  const totalMin = TOTAL_BUCKETS[parseInt(totalMinSlider.value)];
  const totalMaxIdx = parseInt(totalMaxSlider.value);
  const totalMax = totalMaxIdx === TOTAL_BUCKETS.length - 1 ? Infinity : TOTAL_BUCKETS[totalMaxIdx];
  const dailyMin = DAILY_BUCKETS[parseInt(dailyMinSlider.value)];
  const dailyMaxIdx = parseInt(dailyMaxSlider.value);
  const dailyMax = dailyMaxIdx === DAILY_BUCKETS.length - 1 ? Infinity : DAILY_BUCKETS[dailyMaxIdx];

  const artistSongs = songsForArtist(selectedArtist);
  filtered = artistSongs.filter(song => {
    if (song.totalStreams < totalMin || song.totalStreams > totalMax) return false;
    if (song.dailyStreams < dailyMin || song.dailyStreams > dailyMax) return false;
    return true;
  });

  sortFiltered();
  currentPage = 1;
  render();
}

function selectArtist(name) {
  selectedArtist = name;
  artistInput.value = name;
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

  // Results count
  if (totalResults === 0) {
    resultsCount.textContent = '';
    noResults.style.display = 'block';
    tableWrapper.style.display = 'none';
    mobileCards.innerHTML = '';
  } else {
    resultsCount.textContent = `${escapeHtml(selectedArtist)} \u2014 Showing ${start + 1}\u2013${end} of ${totalResults.toLocaleString()} songs`;
    noResults.style.display = 'none';
    tableWrapper.style.display = '';
  }

  // Clear old iframes properly to release Spotify embed resources
  resultsBody.querySelectorAll('iframe').forEach(f => { f.src = ''; f.remove(); });
  mobileCards.querySelectorAll('iframe').forEach(f => { f.src = ''; f.remove(); });

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

  // Pagination
  renderPagination(totalPages);
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

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
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
    div.innerHTML = `<span class="artist-option-name">${escapeHtml(m.name)}</span><span class="artist-option-count">${m.count} songs</span>`;
    div.addEventListener('mousedown', (e) => {
      e.preventDefault(); // prevent blur from firing before click
      selectArtist(m.name);
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
      matches.push(artistIndex[key]);
    }
  }
  // Sort: exact start match first, then by song count
  matches.sort((a, b) => {
    const aStarts = a.name.toLowerCase().startsWith(query) ? 0 : 1;
    const bStarts = b.name.toLowerCase().startsWith(query) ? 0 : 1;
    if (aStarts !== bStarts) return aStarts - bStarts;
    return b.count - a.count;
  });

  showDropdown(matches.slice(0, 15));
});

artistInput.addEventListener('focus', () => {
  artistInput.select();
});

artistInput.addEventListener('blur', () => {
  closeDropdown();
  // Restore selected artist name if input was cleared/changed without selecting
  artistInput.value = selectedArtist;
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
      const name = options[highlightedIdx].querySelector('.artist-option-name').textContent;
      selectArtist(name);
    }
  } else if (e.key === 'Escape') {
    closeDropdown();
    artistInput.blur();
  }
});

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
  // Setup sliders
  setupSlider(totalMinSlider, totalMaxSlider, totalFill, totalMinLabel, totalMaxLabel, TOTAL_BUCKETS);
  setupSlider(dailyMinSlider, dailyMaxSlider, dailyFill, dailyMinLabel, dailyMaxLabel, DAILY_BUCKETS);

  // Show preloaded data instantly
  allSongs = PRELOAD;
  artistInput.value = DEFAULT_ARTIST;
  applyFilters();
  resultsCount.textContent = 'Loading full dataset...';

  // Load full dataset in background
  try {
    const res = await fetch('data.json.gz');
    const ds = new DecompressionStream('gzip');
    const decompressed = res.body.pipeThrough(ds);
    const text = await new Response(decompressed).text();
    allSongs = JSON.parse(text);
    buildArtistIndex();
    applyFilters();
  } catch (e) {
    resultsCount.textContent = 'Failed to load full dataset';
  }
}

init();
