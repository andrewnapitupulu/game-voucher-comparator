'use strict';

const codashopLegacy =
  require(
    './codashop'
  );

const unipinLegacy =
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

const {
  recoveryAdapters,

  createLegacyThenRecoveryAdapter,

  ADAPTER_VERSION:
    RECOVERY_STORE_ADAPTER_VERSION
} = require(
  './recovery-store-adapters'
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
  '2026-08-13-registry-stable-v1';

/*
 * ============================================================
 * OPTIONAL CUSTOM ADAPTERS
 * ============================================================
 *
 * Beberapa adapter berasal dari patch sebelumnya.
 *
 * Dibuat optional supaya index.js tidak membuat server crash
 * bila salah satu file belum tersedia pada branch tertentu.
 */
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
    if (
      error?.code ===
        'MODULE_NOT_FOUND' &&
      String(
        error?.message ||
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

const optionalCustomAdapters = {
  gigames:
    optionalAdapter(
      './gigames'
    ),

  'kios-game-indonesia':
    optionalAdapter(
      './kios-game-indonesia'
    ),

  casatopup:
    optionalAdapter(
      './casatopup'
    ),

  topupgamez:
    optionalAdapter(
      './topupgamez'
    ),

  bxystore:
    optionalAdapter(
      './bxystore'
    )
};

const existingCustom =
  Object.fromEntries(
    Object.entries(
      optionalCustomAdapters
    )
      .filter(
        (
          [
            ,
            adapter
          ]
        ) =>
          Boolean(
            adapter
          )
      )
  );

/*
 * ============================================================
 * DEDICATED REGISTRY
 * ============================================================
 *
 * Prinsip versi ini:
 *
 * 1. Lapakgaming dan Dunia Games tidak diubah.
 *
 * 2. Codashop / UniPin:
 *    legacy dahulu → strict recovery jika legacy tidak
 *    configured / parser failed.
 *
 * 3. Adapter custom yang sebelumnya berhasil tetap dijaga.
 *
 * 4. Sebelas toko yang sekarang bermasalah benar-benar
 *    diarahkan ke recovery-store-adapters.
 *
 * 5. Universal parser tetap menjadi fallback.
 */
const DEDICATED = {
  lapakgaming,

  duniagames,

  /*
   * Legacy + strict recovery.
   */
  codashop:
    createLegacyThenRecoveryAdapter(
      codashopLegacy,
      recoveryAdapters
        .codashop
    ),

  unipin:
    createLegacyThenRecoveryAdapter(
      unipinLegacy,
      recoveryAdapters
        .unipin
    ),

  /*
   * Pertahankan custom adapter lama yang tersedia.
   */
  ...existingCustom,

  /*
   * Recovery adapters diletakkan PALING AKHIR.
   *
   * Dengan begitu store-store di bawah tidak tertimpa
   * registry lama.
   */
  'gopay-games':
    recoveryAdapters[
      'gopay-games'
    ],

  'ggwp-topup':
    recoveryAdapters[
      'ggwp-topup'
    ],

  'oura-store':
    recoveryAdapters[
      'oura-store'
    ],

  topupgamestore:
    recoveryAdapters
      .topupgamestore,

  topupdeh:
    recoveryAdapters
      .topupdeh,

  seagm:
    recoveryAdapters
      .seagm,

  sontopup:
    recoveryAdapters
      .sontopup,

  yoggstore:
    recoveryAdapters
      .yoggstore,

  gamestorecan:
    recoveryAdapters
      .gamestorecan
};

function normalizeStrategyList(
  store,
  available
) {
  const requested =
    Array.isArray(
      store
        .accessStrategies
    )
      ? store
          .accessStrategies
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
          value ||
          ''
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
   * UNIVERSAL FALLBACK
   * ========================================================
   *
   * Sengaja tetap aktif.
   *
   * Kita TIDAK menerapkan strict-only secara global lagi
   * karena perubahan global sebelumnya membuat provider yang
   * sebenarnya sudah stabil ikut regression.
   */
  if (
    store
      .disableUniversal !==
    true
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
   * Compatibility guard.
   */
  if (
    !strategies.length &&
    store
      .disableUniversal !==
    true
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

  /*
   * Marker supaya kita bisa memastikan deployment
   * benar-benar sudah memakai registry ini.
   */
  adapter
    .adapterRegistryVersion =
    ADAPTER_REGISTRY_VERSION;

  adapter
    .recoveryStoreAdapterVersion =
    RECOVERY_STORE_ADAPTER_VERSION;

  return adapter;
}

function buildRegistryAdapters() {
  const enabled =
    String(
      process.env
        .ENABLE_PUBLIC_PAGE_ADAPTERS ||
      'true'
    )
      .toLowerCase() !==
    'false';

  if (
    !enabled
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

    limit =
      adapters.length,

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
    !options
      .storeIds
      ?.length;

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

  RECOVERY_STORE_ADAPTER_VERSION,

  getStoreAdapters,

  getStoreAdapterCount,

  buildRegistryAdapters,

  buildStoreAdapter
};
