// Bucket definitions
const TOTAL_BUCKETS = [0, 10000, 50000, 100000, 500000, 1000000, 2000000, 5000000, 10000000, 50000000, 100000000, 500000000, 1000000000, 2000000000, 5000000000];
const DEFAULT_TOTAL_MIN = 7; // 5M
const DAILY_BUCKETS = [0, 1000, 5000, 10000, 50000, 100000, 500000, 1000000, 5000000];

const PAGE_SIZE = 20;

// State
let allSongs = [];
let filtered = [];
let currentPage = 1;
let sortKey = 'popularity';
let sortDir = 'desc';

// DOM refs
const searchInput = document.getElementById('search-input');
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
const applyBtn = document.getElementById('apply-btn');
const resetBtn = document.getElementById('reset-btn');
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

// Filtering
function applyFilters() {
  const [key, dir] = sortSelect.value.split('-');
  sortKey = key;
  sortDir = dir;

  const query = searchInput.value.toLowerCase().trim();
  const totalMin = TOTAL_BUCKETS[parseInt(totalMinSlider.value)];
  const totalMaxIdx = parseInt(totalMaxSlider.value);
  const totalMax = totalMaxIdx === TOTAL_BUCKETS.length - 1 ? Infinity : TOTAL_BUCKETS[totalMaxIdx];
  const dailyMin = DAILY_BUCKETS[parseInt(dailyMinSlider.value)];
  const dailyMaxIdx = parseInt(dailyMaxSlider.value);
  const dailyMax = dailyMaxIdx === DAILY_BUCKETS.length - 1 ? Infinity : DAILY_BUCKETS[dailyMaxIdx];

  filtered = allSongs.filter(song => {
    if (query && !song.title.toLowerCase().includes(query) && !song.artist.toLowerCase().includes(query)) {
      return false;
    }
    if (song.totalStreams < totalMin || song.totalStreams > totalMax) return false;
    if (song.dailyStreams < dailyMin || song.dailyStreams > dailyMax) return false;
    return true;
  });

  sortFiltered();
  currentPage = 1;
  render();
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
    resultsCount.textContent = `Showing ${start + 1}\u2013${end} of ${totalResults.toLocaleString()} results`;
    noResults.style.display = 'none';
    tableWrapper.style.display = '';
  }

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
  page.forEach((song, i) => {
    const embedUrl = song.url ? song.url.replace('open.spotify.com/track/', 'open.spotify.com/embed/track/') + '?utm_source=generator&theme=0' : '';
    const card = document.createElement('div');
    card.className = 'song-card';
    card.innerHTML = `
      <div class="song-card-top">
        <span class="song-card-rank">${start + i + 1}</span>
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
  return `<span title="${escapeHtml(str)}">${escapeHtml(str.slice(0, max))}…</span>`;
}

// Reset
function resetFilters() {
  searchInput.value = '';
  sortSelect.value = 'popularity-desc';
  totalMinSlider.value = DEFAULT_TOTAL_MIN;
  totalMaxSlider.value = TOTAL_BUCKETS.length - 1;
  dailyMinSlider.value = 0;
  dailyMaxSlider.value = DAILY_BUCKETS.length - 1;

  // Trigger slider UI updates
  totalMinSlider.dispatchEvent(new Event('input'));
  totalMaxSlider.dispatchEvent(new Event('input'));
  dailyMinSlider.dispatchEvent(new Event('input'));
  dailyMaxSlider.dispatchEvent(new Event('input'));

  applyFilters();
}


// Button listeners
applyBtn.addEventListener('click', applyFilters);
resetBtn.addEventListener('click', resetFilters);

// Enter key triggers apply
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') applyFilters();
});

// Init
async function init() {
  try {
    const res = await fetch('data.json');
    allSongs = await res.json();
  } catch (e) {
    resultsCount.textContent = 'Failed to load data.json';
    return;
  }

  // Setup sliders
  setupSlider(totalMinSlider, totalMaxSlider, totalFill, totalMinLabel, totalMaxLabel, TOTAL_BUCKETS);
  setupSlider(dailyMinSlider, dailyMaxSlider, dailyFill, dailyMinLabel, dailyMaxLabel, DAILY_BUCKETS);

  // Initial render with all data
  applyFilters();
}

init();
