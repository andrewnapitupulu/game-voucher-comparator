'use strict';

const GAMES = [
  {
    id: 'mobile-legends',
    name: 'Mobile Legends: Bang Bang',
    publisher: 'Moonton',
    icon: 'ML',
    aliases: [
      'mobile legends',
      'mobile legend',
      'mlbb',
      'ml',
      'mole'
    ]
  },

  {
    id: 'free-fire',
    name: 'Free Fire',
    publisher: 'Garena',
    icon: 'FF',
    aliases: [
      'free fire',
      'freefire',
      'ff'
    ]
  },

  {
    id: 'pubg-mobile',
    name: 'PUBG Mobile',
    publisher: 'KRAFTON / Tencent',
    icon: 'PM',
    aliases: [
      'pubg mobile',
      'pubgm',
      'pubg',
      'uc'
    ]
  },

  {
    id: 'genshin-impact',
    name: 'Genshin Impact',
    publisher: 'HoYoverse',
    icon: 'GI',
    aliases: [
      'genshin impact',
      'genshin',
      'gi',
      'welkin'
    ]
  },

  {
    id: 'valorant',
    name: 'VALORANT',
    publisher: 'Riot Games',
    icon: 'VA',
    aliases: [
      'valorant',
      'valo',
      'vp'
    ]
  }
];

const elements = {
  form: document.querySelector('#searchForm'),
  input: document.querySelector('#searchInput'),

  searchButton:
    document.querySelector('#searchButton'),

  suggestions:
    document.querySelector('#suggestions'),

  initial:
    document.querySelector('#initialState'),

  loading:
    document.querySelector('#loadingState'),

  error:
    document.querySelector('#errorState'),

  results:
    document.querySelector('#resultsState'),

  errorTitle:
    document.querySelector('#errorTitle'),

  errorMessage:
    document.querySelector('#errorMessage'),

  retryButton:
    document.querySelector('#retryButton'),

  refreshButton:
    document.querySelector('#refreshButton'),

  themeButton:
    document.querySelector('#themeButton'),

  gameIcon:
    document.querySelector('#gameIcon'),

  gameName:
    document.querySelector('#gameName'),

  packageCount:
    document.querySelector('#packageCount'),

  storeCount:
    document.querySelector('#storeCount'),

  checkedTime:
    document.querySelector('#checkedTime'),

  startingPrice:
    document.querySelector('#startingPrice'),

  duration:
    document.querySelector('#duration'),

  fallbackNotice:
    document.querySelector('#fallbackNotice'),

  providerStatuses:
    document.querySelector('#providerStatuses'),

  toggleProviders:
    document.querySelector('#toggleProviders'),

  typeFilter:
    document.querySelector('#typeFilter'),

  storeFilter:
    document.querySelector('#storeFilter'),

  sortSelect:
    document.querySelector('#sortSelect'),

  packageList:
    document.querySelector('#packageList'),

  visibleCount:
    document.querySelector('#visibleCount'),

  emptyFilter:
    document.querySelector('#emptyFilterState'),

  resultNotice:
    document.querySelector('#resultNotice'),

  searchProgress:
    document.querySelector('#searchProgress'),

  progressText:
    document.querySelector('#progressText'),

  progressFill:
    document.querySelector('#progressFill'),

  template:
    document.querySelector('#packageTemplate')
};

const state = {
  query: '',
  response: null,
  providerPanelVisible: true,
  controller: null,
  searchStartedAt: 0
};

function rupiah(value) {
  return new Intl.NumberFormat(
    'id-ID',
    {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0
    }
  ).format(
    Number(value || 0)
  );
}

function relativeTime(iso) {
  const seconds =
    Math.max(
      0,
      Math.floor(
        (
          Date.now() -
          new Date(iso).getTime()
        ) / 1000
      )
    );

  if (seconds < 8) {
    return 'baru saja';
  }

  if (seconds < 60) {
    return `${seconds} detik lalu`;
  }

  const minutes =
    Math.floor(
      seconds / 60
    );

  return `${minutes} menit lalu`;
}

function initials(name) {
  const known = {
    codashop: 'C',
    unipin: 'U',
    lapakgaming: 'L',
    duniagames: 'DG'
  };

  const key =
    String(name || '')
      .toLowerCase()
      .replace(/\s+/g, '');

  if (known[key]) {
    return known[key];
  }

  return String(name || '?')
    .split(/\s+/)
    .map(
      (part) => part[0]
    )
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function showView(view) {
  elements.initial.hidden =
    view !== 'initial';

  elements.loading.hidden =
    view !== 'loading';

  elements.error.hidden =
    view !== 'error';

  elements.results.hidden =
    view !== 'results';
}

function setSearching(searching) {
  elements.searchButton.disabled =
    searching;

  elements.searchButton
    .querySelector('span')
    .textContent =
      searching
        ? 'Mencari...'
        : 'Cari Harga';
}

function showError(
  title,
  message
) {
  elements.errorTitle.textContent =
    title;

  elements.errorMessage.textContent =
    message;

  showView('error');
}

function recomputeGroup(group) {
  const offers =
    [...group.offers]
      .sort(
        (a, b) =>
          a.finalPrice -
            b.finalPrice ||
          a.storeName.localeCompare(
            b.storeName,
            'id'
          )
      );

  const cheapest =
    offers[0];

  const highest =
    offers[
      offers.length - 1
    ];

  return {
    ...group,

    offers,

    cheapestPrice:
      cheapest?.finalPrice || 0,

    cheapestStore:
      cheapest?.storeName || '—',

    highestPrice:
      highest?.finalPrice || 0,

    savings:
      cheapest && highest
        ? Math.max(
            0,
            highest.finalPrice -
              cheapest.finalPrice
          )
        : 0,

    storeCount:
      new Set(
        offers.map(
          (offer) =>
            offer.storeId
        )
      ).size,

    hasLivePrice:
      offers.some(
        (offer) =>
          offer.source === 'live'
      )
  };
}

function mergeBatch(
  current,
  batch
) {
  const aggregate =
    current || {
      ...batch,

      providerStatus: [],
      groups: [],
      checkedStoreCount: 0,
      durationMs: 0,
      fallbackUsed: false
    };

  aggregate.game =
    batch.game;

  aggregate.query =
    batch.query;

  aggregate.resolver =
    batch.resolver;

  aggregate.totalStoreCount =
    batch.totalStoreCount;

  aggregate.checkedStoreCount +=
    batch.checkedStoreCount;

  aggregate.fallbackUsed =
    aggregate.fallbackUsed ||
    batch.fallbackUsed;

  aggregate.fetchedAt =
    batch.fetchedAt;

  aggregate.notice =
    batch.notice;

  aggregate.durationMs =
    Date.now() -
    state.searchStartedAt;

  const providerMap =
    new Map(
      aggregate.providerStatus.map(
        (provider) => [
          provider.id,
          provider
        ]
      )
    );

  batch.providerStatus.forEach(
    (provider) =>
      providerMap.set(
        provider.id,
        provider
      )
  );

  aggregate.providerStatus =
    [...providerMap.values()];

  const groupMap =
    new Map(
      aggregate.groups.map(
        (group) => [
          group.id,
          {
            ...group,
            offers: [
              ...group.offers
            ]
          }
        ]
      )
    );

  for (
    const incoming of
    batch.groups
  ) {
    const target =
      groupMap.get(
        incoming.id
      ) || {
        ...incoming,
        offers: []
      };

    const seen =
      new Set(
        target.offers.map(
          (offer) =>
            `${offer.storeId}|${offer.originalName}|${offer.finalPrice}`
        )
      );

    for (
      const offer of
      incoming.offers
    ) {
      const key =
        `${offer.storeId}|${offer.originalName}|${offer.finalPrice}`;

      if (!seen.has(key)) {
        target.offers.push(
          offer
        );

        seen.add(key);
      }
    }

    groupMap.set(
      incoming.id,
      recomputeGroup(
        target
      )
    );
  }

  aggregate.groups =
    [...groupMap.values()]
      .sort(
        (a, b) =>
          a.cheapestPrice -
            b.cheapestPrice ||
          a.name.localeCompare(
            b.name,
            'id'
          )
      );

  aggregate.packageCount =
    aggregate.groups.length;

  aggregate.cheapestOverall =
    aggregate.groups[0] ||
    null;

  aggregate.offerCount =
    aggregate.groups.reduce(
      (sum, group) =>
        sum +
        group.offers.length,
      0
    );

  aggregate.liveOfferCount =
    aggregate.groups.reduce(
      (sum, group) =>
        sum +
        group.offers.filter(
          (offer) =>
            offer.source ===
            'live'
        ).length,
      0
    );

  aggregate.storeCount =
    new Set(
      aggregate.groups.flatMap(
        (group) =>
          group.offers.map(
            (offer) =>
              offer.storeId
          )
      )
    ).size;

  return aggregate;
}

function updateSearchProgress(
  data,
  complete = false
) {
  if (!data) {
    return;
  }

  const checked =
    Math.min(
      data.checkedStoreCount ||
        0,
      data.totalStoreCount ||
        99
    );

  const total =
    data.totalStoreCount ||
    99;

  const percent =
    Math.round(
      (checked / total) *
        100
    );

  elements.searchProgress.hidden =
    false;

  elements.progressText.textContent =
    complete
      ? `Selesai memeriksa ${checked} dari ${total} toko`
      : `Sedang memeriksa toko ${checked} dari ${total} · hasil diperbarui otomatis`;

  elements.progressFill.style.width =
    `${percent}%`;

  elements.searchProgress.classList.toggle(
    'complete',
    complete
  );
}

async function fetchBatch(
  query,
  offset,
  limit,
  signal
) {
  const response =
    await fetch(
      `/api/search?q=${encodeURIComponent(query)}&offset=${offset}&limit=${limit}&_=${Date.now()}`,
      {
        method: 'GET',

        cache:
          'no-store',

        headers: {
          accept:
            'application/json'
        },

        signal
      }
    );

  const payload =
    await response.json();

  if (
    !response.ok ||
    !payload.ok
  ) {
    throw new Error(
      payload.message ||
        'Harga tidak dapat ditemukan.'
    );
  }

  return payload;
}

async function search(query) {
  const cleanQuery =
    String(query || '')
      .trim();

  if (!cleanQuery) {
    elements.input.focus();
    return;
  }

  if (state.controller) {
    state.controller.abort();
  }

  state.controller =
    new AbortController();

  state.searchStartedAt =
    Date.now();

  state.query =
    cleanQuery;

  state.response =
    null;

  elements.input.value =
    cleanQuery;

  elements.suggestions.hidden =
    true;

  elements.searchProgress.hidden =
    true;

  elements.searchProgress
    .classList
    .remove('complete');

  elements.progressFill.style.width =
    '0%';

  setSearching(true);

  showView(
    'loading'
  );

  window.scrollTo({
    top:
      document
        .querySelector(
          '#contentShell'
        )
        .offsetTop - 95,

    behavior:
      'smooth'
  });

  const batchSize = 8;

  try {
    const first =
      await fetchBatch(
        cleanQuery,
        0,
        batchSize,
        state.controller.signal
      );

    state.response =
      mergeBatch(
        null,
        first
      );

    renderResults(
      state.response
    );

    updateSearchProgress(
      state.response,
      !first.batch.hasMore
    );

    showView(
      'results'
    );

    if (
      first.batch.hasMore
    ) {
      const offsets = [];

      for (
        let offset =
          first.batch.nextOffset;

        offset <
          first.totalStoreCount;

        offset +=
          batchSize
      ) {
        offsets.push(
          offset
        );
      }

      let cursor = 0;

      const workerCount =
        Math.min(
          3,
          offsets.length
        );

      async function worker() {
        while (
          cursor <
          offsets.length
        ) {
          const offset =
            offsets[
              cursor++
            ];

          try {
            const batch =
              await fetchBatch(
                first.game.id,
                offset,
                batchSize,
                state.controller.signal
              );

            state.response =
              mergeBatch(
                state.response,
                batch
              );

            renderResults(
              state.response
            );

            updateSearchProgress(
              state.response,
              state.response
                .checkedStoreCount >=
                state.response
                  .totalStoreCount
            );
          } catch (error) {
            if (
              error.name ===
              'AbortError'
            ) {
              throw error;
            }

            state.response
              .checkedStoreCount =
                Math.min(
                  state.response
                    .totalStoreCount,

                  state.response
                    .checkedStoreCount +
                    batchSize
                );

            state.response
              .durationMs =
                Date.now() -
                state.searchStartedAt;

            updateSearchProgress(
              state.response,

              state.response
                .checkedStoreCount >=
                state.response
                  .totalStoreCount
            );
          }
        }
      }

      await Promise.all(
        Array.from(
          {
            length:
              workerCount
          },

          () => worker()
        )
      );
    }

    state.response.durationMs =
      Date.now() -
      state.searchStartedAt;

    renderResults(
      state.response
    );

    updateSearchProgress(
      state.response,
      true
    );
  } catch (error) {
    if (
      error.name ===
      'AbortError'
    ) {
      return;
    }

    if (
      state.response
        ?.groups
        ?.length
    ) {
      state.response.durationMs =
        Date.now() -
        state.searchStartedAt;

      renderResults(
        state.response
      );

      updateSearchProgress(
        state.response,
        true
      );

      showView(
        'results'
      );
    } else {
      showError(
        'Pencarian belum berhasil',

        error.message ||
          'Coba ulangi pencarian beberapa saat lagi.'
      );
    }
  } finally {
    setSearching(false);
  }
}

function renderResults(data) {
  elements.gameIcon.textContent =
    data.game.icon;

  elements.gameName.textContent =
    data.game.name;

  elements.packageCount.textContent =
    data.packageCount;

  elements.storeCount.textContent =
    data.storeCount;

  elements.checkedTime.textContent =
    relativeTime(
      data.fetchedAt
    );

  elements.startingPrice.textContent =
    rupiah(
      data.cheapestOverall
        ?.cheapestPrice ||
        0
    );

  elements.duration.textContent =
    data.durationMs >= 1000
      ? `${(
          data.durationMs /
          1000
        ).toFixed(1)} dtk`
      : `${data.durationMs} ms`;

  elements.fallbackNotice.hidden =
    !data.fallbackUsed;

  elements.resultNotice.textContent =
    data.notice;

  renderProviders(data);

  populateStoreFilter(
    data
  );

  /**
   * Ini yang membuat Jenis Paket
   * berubah setiap hasil pencarian.
   */
  populateTypeFilter(
    data
  );

  renderPackages();
}

function renderProviders(data) {
  elements.providerStatuses.textContent =
    '';

  const sourceStores =
    new Set(
      data.groups.flatMap(
        (group) =>
          group.offers
            .filter(
              (offer) =>
                offer.source ===
                'fallback'
            )
            .map(
              (offer) =>
                offer.storeId
            )
      )
    );

  for (
    const provider of
    data.providerStatus
  ) {
    const isFallback =
      !provider.ok &&
      sourceStores.has(
        provider.id
      );

    const mode =
      provider.ok
        ? 'live'
        : isFallback
          ? 'fallback'
          : 'error';

    const verificationLabel =
      provider.verification ===
      'candidate'
        ? ' · kandidat'
        : '';

    const label =
      `${
        provider.ok
          ? provider.message
          : isFallback
            ? 'Data fallback demo'
            : provider.message
      }${verificationLabel}`;

    const card =
      document.createElement(
        'div'
      );

    card.className =
      'provider-card';

    const logo =
      document.createElement(
        'span'
      );

    logo.className =
      'provider-logo';

    logo.textContent =
      initials(
        provider.name
      );

    const info =
      document.createElement(
        'div'
      );

    const name =
      document.createElement(
        'strong'
      );

    name.textContent =
      provider.name;

    const line =
      document.createElement(
        'div'
      );

    line.className =
      'status-line';

    const dot =
      document.createElement(
        'span'
      );

    dot.className =
      `status-dot ${mode}`;

    const message =
      document.createElement(
        'p'
      );

    message.title =
      label;

    message.textContent =
      label;

    line.append(
      dot,
      message
    );

    info.append(
      name,
      line
    );

    card.append(
      logo,
      info
    );

    elements
      .providerStatuses
      .append(
        card
      );
  }
}

function populateStoreFilter(
  data
) {
  const current =
    elements
      .storeFilter
      .value;

  const stores =
    new Map();

  for (
    const group of
    data.groups
  ) {
    for (
      const offer of
      group.offers
    ) {
      stores.set(
        offer.storeId,
        offer.storeName
      );
    }
  }

  elements
    .storeFilter
    .replaceChildren(
      new Option(
        'Semua toko',
        'all'
      )
    );

  [...stores.entries()]
    .sort(
      (a, b) =>
        a[1].localeCompare(
          b[1],
          'id'
        )
    )
    .forEach(
      ([id, name]) => {
        elements
          .storeFilter
          .add(
            new Option(
              name,
              id
            )
          );
      }
    );

  if (
    [...stores.keys()]
      .includes(
        current
      )
  ) {
    elements
      .storeFilter
      .value =
        current;
  }
}

/**
 * Membuat key aman untuk value <option>.
 */
function normalizeFilterKey(
  value
) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(
      /[\u0300-\u036f]/g,
      ''
    )
    .replace(
      /[^a-z0-9]+/g,
      '-'
    )
    .replace(
      /^-+|-+$/g,
      ''
    );
}

/**
 * Mengubah data packageType backend
 * menjadi filter yang tampil ke user.
 *
 * Yang paling penting:
 *
 * packageType === "currency"
 *
 * tidak lagi selalu ditampilkan sebagai:
 *
 * "Currency / nominal"
 *
 * tetapi berdasarkan unit aktual.
 */
function getPackageFilterMeta(
  group
) {
  const type =
    String(
      group?.packageType ||
      'other'
    );

  if (
    type ===
    'currency'
  ) {
    const unit =
      String(
        group?.unit ||
        'Nominal'
      ).trim() ||
      'Nominal';

    const unitLabels = {
      Diamonds:
        'Diamonds',

      UC:
        'UC',

      VP:
        'Valorant Points (VP)',

      'Genesis Crystals':
        'Genesis Crystals',

      Crystals:
        'Crystals',

      Points:
        'Points',

      Coins:
        'Coins',

      Tokens:
        'Tokens',

      Voucher:
        'Voucher'
    };

    return {
      key:
        `currency:${
          normalizeFilterKey(
            unit
          ) ||
          'nominal'
        }`,

      label:
        unitLabels[
          unit
        ] ||
        unit,

      order:
        10
    };
  }

  const specialTypes = {
    'weekly-pass': {
      label:
        'Weekly Diamond Pass',

      order:
        20
    },

    starlight: {
      label:
        'Starlight Membership',

      order:
        30
    },

    membership: {
      label:
        'Membership',

      order:
        40
    },

    welkin: {
      label:
        'Welkin Moon',

      order:
        50
    },

    twilight: {
      label:
        'Twilight Pass',

      order:
        60
    },

    'elite-bundle': {
      label:
        'Weekly Elite Bundle',

      order:
        70
    },

    'epic-bundle': {
      label:
        'Monthly Epic Bundle',

      order:
        80
    },

    'battle-pass': {
      label:
        'Battle Pass',

      order:
        90
    },

    other: {
      label:
        'Lainnya',

      order:
        999
    }
  };

  const meta =
    specialTypes[
      type
    ];

  if (meta) {
    return {
      key:
        type,

      ...meta
    };
  }

  return {
    key:
      type,

    label:
      String(
        group?.name ||
        type
      )
        .replaceAll(
          '-',
          ' '
        ),

    order:
      500
  };
}

/**
 * INI FUNGSI UTAMA PERBAIKAN.
 *
 * Filter dihapus dan dibangun ulang
 * setiap data pencarian berubah.
 */
function populateTypeFilter(
  data
) {
  const current =
    elements
      .typeFilter
      .value;

  const filters =
    new Map();

  for (
    const group of
    data.groups
  ) {
    const meta =
      getPackageFilterMeta(
        group
      );

    if (
      !filters.has(
        meta.key
      )
    ) {
      filters.set(
        meta.key,
        {
          ...meta,
          count: 0
        }
      );
    }

    filters
      .get(
        meta.key
      )
      .count += 1;
  }

  const options =
    [...filters.values()]
      .sort(
        (a, b) =>
          a.order -
            b.order ||
          a.label.localeCompare(
            b.label,
            'id'
          )
      );

  /**
   * Selalu reset terlebih dahulu.
   */
  elements
    .typeFilter
    .replaceChildren(
      new Option(
        'Semua paket',
        'all'
      )
    );

  /**
   * Tambahkan hanya tipe paket
   * yang benar-benar ditemukan.
   */
  for (
    const option of
    options
  ) {
    elements
      .typeFilter
      .add(
        new Option(
          option.label,
          option.key
        )
      );
  }

  /**
   * Kalau pilihan lama masih tersedia,
   * pertahankan.
   *
   * Kalau tidak, reset ke Semua Paket.
   */
  if (
    current === 'all' ||
    filters.has(
      current
    )
  ) {
    elements
      .typeFilter
      .value =
        current;
  } else {
    elements
      .typeFilter
      .value =
        'all';
  }
}

function getVisibleGroups() {
  const data =
    state.response;

  if (!data) {
    return [];
  }

  const type =
    elements
      .typeFilter
      .value;

  const store =
    elements
      .storeFilter
      .value;

  const sort =
    elements
      .sortSelect
      .value;

  let groups =
    data.groups

      .map(
        (group) => ({
          ...group,

          offers:
            store ===
            'all'
              ? group.offers
              : group.offers.filter(
                  (offer) =>
                    offer.storeId ===
                    store
                )
        })
      )

      .filter(
        (group) =>
          group.offers.length >
          0
      )

      /**
       * Filter menggunakan key
       * yang sama dengan option dinamis.
       */
      .filter(
        (group) =>
          type === 'all' ||
          getPackageFilterMeta(
            group
          ).key ===
            type
      )

      .map(
        (group) => {
          const offers =
            [...group.offers]
              .sort(
                (a, b) =>
                  a.finalPrice -
                  b.finalPrice
              );

          return {
            ...group,

            offers,

            cheapestPrice:
              offers[0]
                .finalPrice,

            cheapestStore:
              offers[0]
                .storeName,

            highestPrice:
              offers[
                offers.length -
                  1
              ].finalPrice,

            savings:
              Math.max(
                0,

                offers[
                  offers.length -
                    1
                ].finalPrice -
                  offers[0]
                    .finalPrice
              ),

            storeCount:
              new Set(
                offers.map(
                  (offer) =>
                    offer.storeId
                )
              ).size,

            hasLivePrice:
              offers.some(
                (offer) =>
                  offer.source ===
                  'live'
              )
          };
        }
      );

  const sorters = {
    'price-asc':
      (a, b) =>
        a.cheapestPrice -
        b.cheapestPrice,

    'amount-asc':
      (a, b) =>
        (
          a.totalAmount ??
          Number.MAX_SAFE_INTEGER
        ) -
          (
            b.totalAmount ??
            Number.MAX_SAFE_INTEGER
          ) ||
        a.cheapestPrice -
          b.cheapestPrice,

    'stores-desc':
      (a, b) =>
        b.storeCount -
          a.storeCount ||
        a.cheapestPrice -
          b.cheapestPrice,

    'savings-desc':
      (a, b) =>
        b.savings -
          a.savings ||
        a.cheapestPrice -
          b.cheapestPrice
  };

  return groups.sort(
    sorters[sort] ||
    sorters[
      'price-asc'
    ]
  );
}

function renderPackages() {
  const groups =
    getVisibleGroups();

  elements.packageList.textContent =
    '';

  elements.visibleCount.textContent =
    `${groups.length} paket`;

  elements.emptyFilter.hidden =
    groups.length > 0;

  groups.forEach(
    (
      group,
      index
    ) => {
      const node =
        elements
          .template
          .content
          .cloneNode(
            true
          );

      const card =
        node.querySelector(
          '.package-card'
        );

      const summary =
        node.querySelector(
          '.package-summary'
        );

      const badge =
        node.querySelector(
          '.package-badge span'
        );

      const title =
        node.querySelector(
          'h4'
        );

      const liveBadge =
        node.querySelector(
          '.live-badge'
        );

      const subtitle =
        node.querySelector(
          '.package-subtitle'
        );

      const price =
        node.querySelector(
          '.package-price strong'
        );

      const store =
        node.querySelector(
          '.package-price small'
        );

      const saving =
        node.querySelector(
          '.package-saving strong'
        );

      const comparison =
        node.querySelector(
          '.offer-comparison'
        );

      const rows =
        node.querySelector(
          '.offer-rows'
        );

      badge.textContent =
        group.packageType ===
        'currency'
          ? String(
              group.totalAmount ||
                ''
            ).slice(
              0,
              4
            )
          : packageAbbreviation(
              group.name
            );

      title.textContent =
        group.name;

      liveBadge.textContent =
        group.hasLivePrice
          ? 'LIVE'
          : 'DEMO';

      liveBadge.classList.toggle(
        'fallback',
        !group.hasLivePrice
      );

      /**
       * Subtitle juga menggunakan
       * label filter dinamis.
       */
      subtitle.textContent =
        `${group.storeCount} toko tersedia · ${
          getPackageFilterMeta(
            group
          ).label
        }`;

      price.textContent =
        rupiah(
          group.cheapestPrice
        );

      store.textContent =
        `di ${group.cheapestStore}`;

      saving.textContent =
        group.savings > 0
          ? rupiah(
              group.savings
            )
          : '—';

      group.offers.forEach(
        (
          offer,
          offerIndex
        ) =>
          rows.append(
            renderOfferRow(
              offer,
              offerIndex ===
                0
            )
          )
      );

      summary.addEventListener(
        'click',
        () => {
          const open =
            card.classList.toggle(
              'open'
            );

          summary.setAttribute(
            'aria-expanded',
            String(open)
          );

          comparison.hidden =
            !open;
        }
      );

      if (index < 2) {
        card.classList.add(
          'open'
        );

        summary.setAttribute(
          'aria-expanded',
          'true'
        );

        comparison.hidden =
          false;
      }

      elements
        .packageList
        .append(
          node
        );
    }
  );
}

function packageAbbreviation(
  name
) {
  return String(name)
    .split(/\s+/)
    .filter(Boolean)
    .map(
      (part) => part[0]
    )
    .join('')
    .slice(0, 4)
    .toUpperCase();
}

function renderOfferRow(
  offer,
  isBest
) {
  const row =
    document.createElement(
      'div'
    );

  row.className =
    'offer-row';

  const store =
    document.createElement(
      'div'
    );

  store.className =
    'offer-store';

  const logo =
    document.createElement(
      'span'
    );

  logo.className =
    'offer-store-logo';

  logo.textContent =
    initials(
      offer.storeName
    );

  const storeName =
    document.createElement(
      'strong'
    );

  storeName.textContent =
    offer.storeName;

  store.append(
    logo,
    storeName
  );

  const name =
    document.createElement(
      'div'
    );

  name.className =
    'offer-name';

  name.title =
    offer.originalName;

  name.textContent =
    offer.originalName;

  const price =
    document.createElement(
      'div'
    );

  price.className =
    `offer-price${
      isBest
        ? ' best'
        : ''
    }`;

  price.textContent =
    rupiah(
      offer.finalPrice
    );

  const status =
    document.createElement(
      'span'
    );

  status.className =
    `offer-status ${offer.source}`;

  status.textContent =
    offer.source === 'live'
      ? (
          isBest
            ? 'Termurah · Live'
            : 'Live'
        )
      : (
          isBest
            ? 'Termurah · Demo'
            : 'Demo'
        );

  const link =
    document.createElement(
      'a'
    );

  link.className =
    'buy-link';

  link.href =
    offer.purchaseUrl;

  link.target =
    '_blank';

  link.rel =
    'noopener noreferrer nofollow';

  link.textContent =
    'Buka Toko';

  link.insertAdjacentHTML(
    'beforeend',

    '<svg viewBox="0 0 24 24" fill="none"><path d="M14 5h5v5M10 14 19 5M19 13v6H5V5h6"/></svg>'
  );

  row.append(
    store,
    name,
    price,
    status,
    link
  );

  return row;
}

function renderSuggestions(
  value
) {
  const query =
    String(value || '')
      .toLowerCase()
      .trim();

  if (!query) {
    elements.suggestions.hidden =
      true;

    return;
  }

  const matches =
    GAMES
      .filter(
        (game) =>
          [
            game.name,
            ...game.aliases
          ]
            .some(
              (item) =>
                item
                  .toLowerCase()
                  .includes(
                    query
                  )
            )
      )
      .slice(
        0,
        5
      );

  if (!matches.length) {
    elements.suggestions.hidden =
      true;

    return;
  }

  elements.suggestions.textContent =
    '';

  matches.forEach(
    (game) => {
      const button =
        document.createElement(
          'button'
        );

      button.type =
        'button';

      button.className =
        'suggestion-item';

      const icon =
        document.createElement(
          'span'
        );

      icon.className =
        'suggestion-icon';

      icon.textContent =
        game.icon;

      const text =
        document.createElement(
          'span'
        );

      const name =
        document.createElement(
          'strong'
        );

      name.textContent =
        game.name;

      const publisher =
        document.createElement(
          'small'
        );

      publisher.textContent =
        game.publisher;

      text.append(
        name,
        publisher
      );

      button.append(
        icon,
        text
      );

      button.addEventListener(
        'click',
        () =>
          search(
            game.name
          )
      );

      elements
        .suggestions
        .append(
          button
        );
    }
  );

  elements.suggestions.hidden =
    false;
}

function initTheme() {
  const saved =
    localStorage.getItem(
      'topup-scout-theme'
    );

  const darkPreferred =
    window
      .matchMedia(
        '(prefers-color-scheme: dark)'
      )
      .matches;

  document
    .documentElement
    .dataset
    .theme =
      saved ||
      (
        darkPreferred
          ? 'dark'
          : 'light'
      );
}

initTheme();

elements.form.addEventListener(
  'submit',
  (event) => {
    event.preventDefault();

    search(
      elements.input.value
    );
  }
);

elements.input.addEventListener(
  'input',
  (event) =>
    renderSuggestions(
      event.target.value
    )
);

elements.input.addEventListener(
  'focus',
  () =>
    renderSuggestions(
      elements.input.value
    )
);

document.addEventListener(
  'click',
  (event) => {
    if (
      !elements.form.contains(
        event.target
      )
    ) {
      elements.suggestions.hidden =
        true;
    }
  }
);

document
  .querySelectorAll(
    '[data-query]'
  )
  .forEach(
    (button) =>
      button.addEventListener(
        'click',
        () =>
          search(
            button.dataset.query
          )
      )
  );

elements.retryButton.addEventListener(
  'click',
  () =>
    search(
      state.query ||
      elements.input.value
    )
);

elements.refreshButton.addEventListener(
  'click',
  () =>
    search(
      state.query
    )
);

/**
 * Saat Jenis Paket berubah,
 * cukup render ulang hasil lokal.
 */
elements.typeFilter.addEventListener(
  'change',
  renderPackages
);

elements.storeFilter.addEventListener(
  'change',
  renderPackages
);

elements.sortSelect.addEventListener(
  'change',
  renderPackages
);

elements.toggleProviders.addEventListener(
  'click',
  () => {
    state.providerPanelVisible =
      !state.providerPanelVisible;

    elements.providerStatuses.hidden =
      !state.providerPanelVisible;

    elements.toggleProviders.textContent =
      state.providerPanelVisible
        ? 'Sembunyikan'
        : 'Tampilkan';
  }
);

elements.themeButton.addEventListener(
  'click',
  () => {
    const next =
      document
        .documentElement
        .dataset
        .theme ===
      'dark'
        ? 'light'
        : 'dark';

    document
      .documentElement
      .dataset
      .theme =
        next;

    localStorage.setItem(
      'topup-scout-theme',
      next
    );
  }
);
