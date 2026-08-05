'use strict';

const GAMES = [
  { id: 'mobile-legends', name: 'Mobile Legends: Bang Bang', publisher: 'Moonton', icon: 'ML', aliases: ['mobile legends', 'mobile legend', 'mlbb', 'ml', 'mole'] },
  { id: 'free-fire', name: 'Free Fire', publisher: 'Garena', icon: 'FF', aliases: ['free fire', 'freefire', 'ff'] },
  { id: 'pubg-mobile', name: 'PUBG Mobile', publisher: 'KRAFTON / Tencent', icon: 'PM', aliases: ['pubg mobile', 'pubgm', 'pubg', 'uc'] },
  { id: 'genshin-impact', name: 'Genshin Impact', publisher: 'HoYoverse', icon: 'GI', aliases: ['genshin impact', 'genshin', 'gi', 'welkin'] },
  { id: 'valorant', name: 'VALORANT', publisher: 'Riot Games', icon: 'VA', aliases: ['valorant', 'valo', 'vp'] }
];

const elements = {
  form: document.querySelector('#searchForm'),
  input: document.querySelector('#searchInput'),
  searchButton: document.querySelector('#searchButton'),
  suggestions: document.querySelector('#suggestions'),
  initial: document.querySelector('#initialState'),
  loading: document.querySelector('#loadingState'),
  error: document.querySelector('#errorState'),
  results: document.querySelector('#resultsState'),
  errorTitle: document.querySelector('#errorTitle'),
  errorMessage: document.querySelector('#errorMessage'),
  retryButton: document.querySelector('#retryButton'),
  refreshButton: document.querySelector('#refreshButton'),
  themeButton: document.querySelector('#themeButton'),
  gameIcon: document.querySelector('#gameIcon'),
  gameName: document.querySelector('#gameName'),
  packageCount: document.querySelector('#packageCount'),
  storeCount: document.querySelector('#storeCount'),
  checkedTime: document.querySelector('#checkedTime'),
  startingPrice: document.querySelector('#startingPrice'),
  duration: document.querySelector('#duration'),
  fallbackNotice: document.querySelector('#fallbackNotice'),
  providerStatuses: document.querySelector('#providerStatuses'),
  toggleProviders: document.querySelector('#toggleProviders'),
  typeFilter: document.querySelector('#typeFilter'),
  storeFilter: document.querySelector('#storeFilter'),
  sortSelect: document.querySelector('#sortSelect'),
  packageList: document.querySelector('#packageList'),
  visibleCount: document.querySelector('#visibleCount'),
  emptyFilter: document.querySelector('#emptyFilterState'),
  resultNotice: document.querySelector('#resultNotice'),
  template: document.querySelector('#packageTemplate')
};

const state = {
  query: '',
  response: null,
  providerPanelVisible: true,
  controller: null
};

function rupiah(value) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function relativeTime(iso) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 8) return 'baru saja';
  if (seconds < 60) return `${seconds} detik lalu`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} menit lalu`;
}

function initials(name) {
  const known = { codashop: 'C', unipin: 'U', lapakgaming: 'L', duniagames: 'DG' };
  const key = String(name || '').toLowerCase().replace(/\s+/g, '');
  if (known[key]) return known[key];
  return String(name || '?').split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

function showView(view) {
  elements.initial.hidden = view !== 'initial';
  elements.loading.hidden = view !== 'loading';
  elements.error.hidden = view !== 'error';
  elements.results.hidden = view !== 'results';
}

function setSearching(searching) {
  elements.searchButton.disabled = searching;
  elements.searchButton.querySelector('span').textContent = searching ? 'Mencari...' : 'Cari Harga';
}

function showError(title, message) {
  elements.errorTitle.textContent = title;
  elements.errorMessage.textContent = message;
  showView('error');
}

async function search(query) {
  const cleanQuery = String(query || '').trim();
  if (!cleanQuery) {
    elements.input.focus();
    return;
  }

  if (state.controller) state.controller.abort();
  state.controller = new AbortController();
  state.query = cleanQuery;
  elements.input.value = cleanQuery;
  elements.suggestions.hidden = true;
  setSearching(true);
  showView('loading');
  window.scrollTo({ top: document.querySelector('#contentShell').offsetTop - 95, behavior: 'smooth' });

  try {
    const response = await fetch(`/api/search?q=${encodeURIComponent(cleanQuery)}&_=${Date.now()}`, {
      method: 'GET',
      cache: 'no-store',
      headers: { accept: 'application/json' },
      signal: state.controller.signal
    });
    const payload = await response.json();

    if (!response.ok || !payload.ok) {
      throw new Error(payload.message || 'Harga tidak dapat ditemukan.');
    }

    state.response = payload;
    renderResults(payload);
    showView('results');
  } catch (error) {
    if (error.name === 'AbortError') return;
    showError('Pencarian belum berhasil', error.message || 'Coba ulangi pencarian beberapa saat lagi.');
  } finally {
    setSearching(false);
  }
}

function renderResults(data) {
  elements.gameIcon.textContent = data.game.icon;
  elements.gameName.textContent = data.game.name;
  elements.packageCount.textContent = data.packageCount;
  elements.storeCount.textContent = data.storeCount;
  elements.checkedTime.textContent = relativeTime(data.fetchedAt);
  elements.startingPrice.textContent = rupiah(data.cheapestOverall?.cheapestPrice || 0);
  elements.duration.textContent = data.durationMs >= 1000 ? `${(data.durationMs / 1000).toFixed(1)} dtk` : `${data.durationMs} ms`;
  elements.fallbackNotice.hidden = !data.fallbackUsed;
  elements.resultNotice.textContent = data.notice;

  renderProviders(data);
  populateStoreFilter(data);
  populateTypeFilter(data);
  renderPackages();
}

function renderProviders(data) {
  elements.providerStatuses.textContent = '';
  const sourceStores = new Set(
    data.groups.flatMap((group) => group.offers.filter((offer) => offer.source === 'fallback').map((offer) => offer.storeId))
  );

  for (const provider of data.providerStatus) {
    const isFallback = !provider.ok && sourceStores.has(provider.id);
    const mode = provider.ok ? 'live' : isFallback ? 'fallback' : 'error';
    const label = provider.ok ? provider.message : isFallback ? 'Data fallback demo' : provider.message;

    const card = document.createElement('div');
    card.className = 'provider-card';

    const logo = document.createElement('span');
    logo.className = 'provider-logo';
    logo.textContent = initials(provider.name);

    const info = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = provider.name;
    const line = document.createElement('div');
    line.className = 'status-line';
    const dot = document.createElement('span');
    dot.className = `status-dot ${mode}`;
    const message = document.createElement('p');
    message.title = label;
    message.textContent = label;
    line.append(dot, message);
    info.append(name, line);
    card.append(logo, info);
    elements.providerStatuses.append(card);
  }
}

function populateStoreFilter(data) {
  const current = elements.storeFilter.value;
  const stores = new Map();
  for (const group of data.groups) {
    for (const offer of group.offers) stores.set(offer.storeId, offer.storeName);
  }

  elements.storeFilter.replaceChildren(new Option('Semua toko', 'all'));
  [...stores.entries()].sort((a, b) => a[1].localeCompare(b[1], 'id')).forEach(([id, name]) => {
    elements.storeFilter.add(new Option(name, id));
  });
  if ([...stores.keys()].includes(current)) elements.storeFilter.value = current;
}

function populateTypeFilter(data) {
  const current = elements.typeFilter.value;
  const typeLabels = {
    currency: 'Currency / nominal',
    'weekly-pass': 'Weekly Pass',
    welkin: 'Welkin',
    starlight: 'Starlight',
    twilight: 'Twilight Pass',
    'elite-bundle': 'Elite Bundle',
    'epic-bundle': 'Epic Bundle',
    'battle-pass': 'Battle Pass',
    membership: 'Membership',
    other: 'Lainnya'
  };
  const types = [...new Set(data.groups.map((group) => group.packageType))];
  elements.typeFilter.replaceChildren(new Option('Semua paket', 'all'));
  types.forEach((type) => elements.typeFilter.add(new Option(typeLabels[type] || type, type)));
  if (types.includes(current)) elements.typeFilter.value = current;
}

function getVisibleGroups() {
  const data = state.response;
  if (!data) return [];

  const type = elements.typeFilter.value;
  const store = elements.storeFilter.value;
  const sort = elements.sortSelect.value;

  let groups = data.groups
    .map((group) => ({
      ...group,
      offers: store === 'all' ? group.offers : group.offers.filter((offer) => offer.storeId === store)
    }))
    .filter((group) => group.offers.length > 0)
    .filter((group) => type === 'all' || group.packageType === type)
    .map((group) => {
      const offers = [...group.offers].sort((a, b) => a.finalPrice - b.finalPrice);
      return {
        ...group,
        offers,
        cheapestPrice: offers[0].finalPrice,
        cheapestStore: offers[0].storeName,
        highestPrice: offers[offers.length - 1].finalPrice,
        savings: Math.max(0, offers[offers.length - 1].finalPrice - offers[0].finalPrice),
        storeCount: new Set(offers.map((offer) => offer.storeId)).size,
        hasLivePrice: offers.some((offer) => offer.source === 'live')
      };
    });

  const sorters = {
    'price-asc': (a, b) => a.cheapestPrice - b.cheapestPrice,
    'amount-asc': (a, b) => (a.totalAmount ?? Number.MAX_SAFE_INTEGER) - (b.totalAmount ?? Number.MAX_SAFE_INTEGER) || a.cheapestPrice - b.cheapestPrice,
    'stores-desc': (a, b) => b.storeCount - a.storeCount || a.cheapestPrice - b.cheapestPrice,
    'savings-desc': (a, b) => b.savings - a.savings || a.cheapestPrice - b.cheapestPrice
  };

  return groups.sort(sorters[sort] || sorters['price-asc']);
}

function renderPackages() {
  const groups = getVisibleGroups();
  elements.packageList.textContent = '';
  elements.visibleCount.textContent = `${groups.length} paket`;
  elements.emptyFilter.hidden = groups.length > 0;

  groups.forEach((group, index) => {
    const node = elements.template.content.cloneNode(true);
    const card = node.querySelector('.package-card');
    const summary = node.querySelector('.package-summary');
    const badge = node.querySelector('.package-badge span');
    const title = node.querySelector('h4');
    const liveBadge = node.querySelector('.live-badge');
    const subtitle = node.querySelector('.package-subtitle');
    const price = node.querySelector('.package-price strong');
    const store = node.querySelector('.package-price small');
    const saving = node.querySelector('.package-saving strong');
    const comparison = node.querySelector('.offer-comparison');
    const rows = node.querySelector('.offer-rows');

    badge.textContent = group.packageType === 'currency' ? String(group.totalAmount || '').slice(0, 4) : packageAbbreviation(group.name);
    title.textContent = group.name;
    liveBadge.textContent = group.hasLivePrice ? 'LIVE' : 'DEMO';
    liveBadge.classList.toggle('fallback', !group.hasLivePrice);
    subtitle.textContent = `${group.storeCount} toko tersedia · ${group.packageType.replaceAll('-', ' ')}`;
    price.textContent = rupiah(group.cheapestPrice);
    store.textContent = `di ${group.cheapestStore}`;
    saving.textContent = group.savings > 0 ? rupiah(group.savings) : '—';

    group.offers.forEach((offer, offerIndex) => rows.append(renderOfferRow(offer, offerIndex === 0)));

    summary.addEventListener('click', () => {
      const open = card.classList.toggle('open');
      summary.setAttribute('aria-expanded', String(open));
      comparison.hidden = !open;
    });

    if (index < 2) {
      card.classList.add('open');
      summary.setAttribute('aria-expanded', 'true');
      comparison.hidden = false;
    }

    elements.packageList.append(node);
  });
}

function packageAbbreviation(name) {
  return String(name).split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 4).toUpperCase();
}

function renderOfferRow(offer, isBest) {
  const row = document.createElement('div');
  row.className = 'offer-row';

  const store = document.createElement('div');
  store.className = 'offer-store';
  const logo = document.createElement('span');
  logo.className = 'offer-store-logo';
  logo.textContent = initials(offer.storeName);
  const storeName = document.createElement('strong');
  storeName.textContent = offer.storeName;
  store.append(logo, storeName);

  const name = document.createElement('div');
  name.className = 'offer-name';
  name.title = offer.originalName;
  name.textContent = offer.originalName;

  const price = document.createElement('div');
  price.className = `offer-price${isBest ? ' best' : ''}`;
  price.textContent = rupiah(offer.finalPrice);

  const status = document.createElement('span');
  status.className = `offer-status ${offer.source}`;
  status.textContent = offer.source === 'live' ? (isBest ? 'Termurah · Live' : 'Live') : (isBest ? 'Termurah · Demo' : 'Demo');

  const link = document.createElement('a');
  link.className = 'buy-link';
  link.href = offer.purchaseUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer nofollow';
  link.textContent = 'Buka Toko';
  link.insertAdjacentHTML('beforeend', '<svg viewBox="0 0 24 24" fill="none"><path d="M14 5h5v5M10 14 19 5M19 13v6H5V5h6"/></svg>');

  row.append(store, name, price, status, link);
  return row;
}

function renderSuggestions(value) {
  const query = String(value || '').toLowerCase().trim();
  if (!query) {
    elements.suggestions.hidden = true;
    return;
  }

  const matches = GAMES.filter((game) => [game.name, ...game.aliases].some((item) => item.toLowerCase().includes(query))).slice(0, 5);
  if (!matches.length) {
    elements.suggestions.hidden = true;
    return;
  }

  elements.suggestions.textContent = '';
  matches.forEach((game) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'suggestion-item';
    const icon = document.createElement('span');
    icon.className = 'suggestion-icon';
    icon.textContent = game.icon;
    const text = document.createElement('span');
    const name = document.createElement('strong');
    name.textContent = game.name;
    const publisher = document.createElement('small');
    publisher.textContent = game.publisher;
    text.append(name, publisher);
    button.append(icon, text);
    button.addEventListener('click', () => search(game.name));
    elements.suggestions.append(button);
  });
  elements.suggestions.hidden = false;
}

function initTheme() {
  const saved = localStorage.getItem('topup-scout-theme');
  const darkPreferred = window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = saved || (darkPreferred ? 'dark' : 'light');
}

initTheme();

elements.form.addEventListener('submit', (event) => {
  event.preventDefault();
  search(elements.input.value);
});

elements.input.addEventListener('input', (event) => renderSuggestions(event.target.value));
elements.input.addEventListener('focus', () => renderSuggestions(elements.input.value));
document.addEventListener('click', (event) => {
  if (!elements.form.contains(event.target)) elements.suggestions.hidden = true;
});

document.querySelectorAll('[data-query]').forEach((button) => button.addEventListener('click', () => search(button.dataset.query)));
elements.retryButton.addEventListener('click', () => search(state.query || elements.input.value));
elements.refreshButton.addEventListener('click', () => search(state.query));
elements.typeFilter.addEventListener('change', renderPackages);
elements.storeFilter.addEventListener('change', renderPackages);
elements.sortSelect.addEventListener('change', renderPackages);

elements.toggleProviders.addEventListener('click', () => {
  state.providerPanelVisible = !state.providerPanelVisible;
  elements.providerStatuses.hidden = !state.providerPanelVisible;
  elements.toggleProviders.textContent = state.providerPanelVisible ? 'Sembunyikan' : 'Tampilkan';
});

elements.themeButton.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('topup-scout-theme', next);
});
