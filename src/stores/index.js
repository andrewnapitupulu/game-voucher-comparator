'use strict';

const codashop =
  require(
    './codashop'
  );

const unipin =
  require(
    './unipin'
  );

const lapakgaming =
  require(
    './lapakgaming'
  );

const duniagames =
  require(
    './duniagames'
  );

function optionalAdapter(
  path
) {
  try {
    return require(
      path
    );
  } catch (
    error
  ) {
    /*
     * Adapter dari patch sebelumnya dibuat optional.
     *
     * Jadi kalau branch tertentu belum punya satu file
     * dedicated lama, server tidak langsung crash.
     */
    if (
      error?.code ===
        'MODULE_NOT_FOUND' &&
      String(
        error.message ||
        ''
      ).includes(
        `'${path}'`
      )
    ) {
      return null;
    }

    throw error;
  }
}

/*
 * ============================================================
 * ADAPTERS DARI PATCH SEBELUMNYA
 * ============================================================
 */
const gigames =
  optionalAdapter(
    './gigames'
  );

const ouraStore =
  optionalAdapter(
    './oura-store'
  );

const seagm =
  optionalAdapter(
    './seagm'
  );

const kiosGameIndonesia =
  require(
    './kios-game-indonesia'
  );

const topupdeh =
  optionalAdapter(
    './topupdeh'
  );

/*
 * ============================================================
 * STRICT ADAPTERS
 * ============================================================
 */
const casatopup =
  require(
    './casatopup'
  );

const topupgamez =
  require(
    './topupgamez'
  );

const bxystore =
  require(
    './bxystore'
  );

const {
  makeGenericAdapters
} = require(
  './generic-json'
);

const {
  createUniversalAdapter
} = require(
  './universal-page'
);

const {
  createPublicApiAdapter,
  isPublicApiConfigured
} = require(
  './public-api'
);

const {
  createMultiStrategyAdapter
} = require(
  './multi-strategy'
);

const {
  listStores
} = require(
  '../config/stores'
);

const ADAPTER_REGISTRY_VERSION =
  '2026-08-13-strict-v1';

/*
 * ============================================================
 * STRICT-ONLY STORE
 * ============================================================
 *
 * Store ini TIDAK BOLEH fallback ke universal parser.
 *
 * Alasannya:
 *
 * kalau strict parser gagal, lebih baik tampil:
 *
 * PARSER_FAILED
 *
 * daripada menampilkan harga salah seperti:
 *
 * Top Up Zenless Zone Zero Murah → Rp199
 *
 * atau:
 *
 * 300 Monochrome → Rp16.224
 */
const STRICT_ONLY_STORE_IDS =
  new Set([
    'casatopup',
    'topupgamez',
    'bxystore',
    'kios-game-indonesia'
  ]);

const DEDICATED = {
  codashop,
  unipin,
  lapakgaming,
  duniagames,

  gigames,

  'oura-store':
    ouraStore,

  seagm,

  'kios-game-indonesia':
    kiosGameIndonesia,

  topupdeh,

  casatopup,

  topupgamez,

  bxystore
};

function normalizeStrategyList(
  store,
  available
) {
  const requested =
    Array.isArray(
      store.accessStrategies
    )
      ? store.accessStrategies
      : [
          'public-api',
          'dedicated',
          'universal'
        ];

  const seen =
    new Set();

  return requested
    .map(
      (value) =>
        String(
          value || ''
        )
          .trim()
          .toLowerCase()
    )
    .filter(
      Boolean
    )
    .filter(
      (value) => {
        if (
          seen.has(
            value
          ) ||
          !available[
            value
          ]
        ) {
          return false;
        }

        seen.add(
          value
        );

        return true;
      }
    );
}

function buildStoreAdapter(
  store
) {
  const available =
    {};

  /*
   * ========================================================
   * PUBLIC API
   * ========================================================
   */
  if (
    isPublicApiConfigured(
      store
    )
  ) {
    available[
      'public-api'
    ] =
      createPublicApiAdapter(
        store
      );
  }

  /*
   * ========================================================
   * DEDICATED
   * ========================================================
   */
  if (
    DEDICATED[
      store.id
    ]
  ) {
    available.dedicated =
      DEDICATED[
        store.id
      ];
  }

  /*
   * ========================================================
   * UNIVERSAL
   * ========================================================
   *
   * STRICT_ONLY_STORE_IDS sengaja TIDAK mendapat
   * universal fallback.
   *
   * Tujuannya supaya false-positive tidak kembali
   * masuk setelah dedicated strict parser menolaknya.
   */
  if (
    store.disableUniversal !==
      true &&
    !STRICT_ONLY_STORE_IDS
      .has(
        store.id
      )
  ) {
    available.universal =
      createUniversalAdapter(
        store
      );
  }

  const strategies =
    normalizeStrategyList(
      store,
      available
    )
      .map(
        (id) => ({
          id,

          adapter:
            available[
              id
            ]
        })
      );

  /*
   * Compatibility fallback hanya untuk
   * non-strict stores.
   */
  if (
    !strategies.length &&
    store.disableUniversal !==
      true &&
    !STRICT_ONLY_STORE_IDS
      .has(
        store.id
      )
  ) {
    strategies.push({
      id:
        'universal',

      adapter:
        createUniversalAdapter(
          store
        )
    });
  }

  const adapter =
    createMultiStrategyAdapter(
      store,
      strategies
    );

  adapter
    .adapterRegistryVersion =
    ADAPTER_REGISTRY_VERSION;

  return adapter;
}

function buildRegistryAdapters() {
  const publicAdaptersEnabled =
    String(
      process.env
        .ENABLE_PUBLIC_PAGE_ADAPTERS ||
      'true'
    )
      .toLowerCase() !==
    'false';

  if (
    !publicAdaptersEnabled
  ) {
    return [];
  }

  return listStores()
    .map(
      buildStoreAdapter
    );
}

function selectAdapters(
  adapters,
  {
    offset = 0,
    limit = adapters.length,
    storeIds = []
  } = {}
) {
  if (
    storeIds.length
  ) {
    const selected =
      new Set(
        storeIds
      );

    return adapters.filter(
      (adapter) =>
        selected.has(
          adapter.id
        )
    );
  }

  const safeOffset =
    Math.max(
      0,

      Number(
        offset
      ) ||
      0
    );

  const safeLimit =
    Math.max(
      1,

      Math.min(
        20,

        Number(
          limit
        ) ||
        8
      )
    );

  return adapters.slice(
    safeOffset,

    safeOffset +
    safeLimit
  );
}

function getStoreAdapters(
  options = {}
) {
  const registryAdapters =
    buildRegistryAdapters();

  const selectedRegistry =
    selectAdapters(
      registryAdapters,
      options
    );

  const includeFeeds =
    !options.offset &&
    !options.storeIds?.length;

  return includeFeeds
    ? [
        ...selectedRegistry,

        ...makeGenericAdapters()
      ]
    : selectedRegistry;
}

function getStoreAdapterCount() {
  return buildRegistryAdapters()
    .length;
}

module.exports = {
  ADAPTER_REGISTRY_VERSION,

  getStoreAdapters,

  getStoreAdapterCount,

  buildRegistryAdapters,

  buildStoreAdapter
};
