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
  stateAwareRecoveryAdapters,

  createLegacyThenStateAwareRecoveryAdapter,

  STATE_AWARE_RECOVERY_VERSION
} = require(
  './recovery-store-state-aware'
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
  '2026-08-13-cumulative-registry-v1';

/*
 * ============================================================
 * OPTIONAL CUSTOM ADAPTER
 * ============================================================
 *
 * Beberapa adapter dibuat pada iterasi sebelumnya.
 *
 * Kita tidak ingin server crash hanya karena salah satu file
 * custom belum ada pada branch tertentu.
 *
 * Tetapi jika file tersebut tersedia, adapter tersebut harus
 * tetap dipakai.
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

/*
 * ============================================================
 * CUSTOM / DEDICATED ADAPTERS YANG SUDAH PERNAH DIBUAT
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
  optionalAdapter(
    './kios-game-indonesia'
  );

const casatopup =
  optionalAdapter(
    './casatopup'
  );

const bxystore =
  optionalAdapter(
    './bxystore'
  );

const topupdeh =
  optionalAdapter(
    './topupdeh'
  );

/*
 * Jika di masa depan file topupgamez.js tersedia,
 * registry otomatis dapat memakainya.
 *
 * Saat file belum ada, toko tetap menggunakan universal
 * seperti sebelumnya.
 */
const topupgamez =
  optionalAdapter(
    './topupgamez'
  );

/*
 * ============================================================
 * RECOVERABLE CUSTOM ADAPTER ERRORS
 * ============================================================
 *
 * Jika custom adapter gagal karena struktur/route, kita boleh
 * mencoba recovery adapter.
 *
 * Jangan fallback untuk:
 *
 * ACCESS_BLOCKED
 * RATE_LIMITED
 * NETWORK ERROR
 * TIMEOUT
 *
 * karena request tambahan justru dapat memperburuk kondisi.
 */
const CUSTOM_FALLBACK_CODES =
  new Set([
    'NOT_CONFIGURED',
    'PARSER_FAILED',
    'PAGE_NOT_VERIFIED',
    'PAGE_NOT_FOUND'
  ]);

function normalizeCode(
  error
) {
  return String(
    error?.code ||
    ''
  )
    .trim()
    .toUpperCase();
}

/*
 * ============================================================
 * PRIMARY CUSTOM → RECOVERY
 * ============================================================
 *
 * Digunakan untuk toko yang:
 *
 * 1. sudah memiliki parser dedicated khusus, DAN
 * 2. juga memiliki recovery adapter.
 *
 * Contoh:
 *
 * Oura Store
 * TopUpDeh
 * SEAGM
 *
 * Custom parser selalu dicoba dahulu.
 *
 * Recovery hanya dipakai jika custom parser mengalami error
 * yang aman untuk di-recover.
 */
function createPrimaryThenRecoveryAdapter(
  primaryAdapter,
  recoveryAdapter,
  {
    id,
    name
  }
) {
  if (
    !primaryAdapter
  ) {
    return recoveryAdapter ||
      null;
  }

  if (
    !recoveryAdapter
  ) {
    return primaryAdapter;
  }

  return {
    id,

    name,

    strategy:
      'dedicated-with-recovery',

    async fetchOffers(
      game,
      options = {}
    ) {
      let primaryError =
        null;

      try {
        const offers =
          await primaryAdapter
            .fetchOffers(
              game,
              options
            );

        /*
         * Empty array tidak dianggap final success.
         *
         * Kalau primary tidak menemukan apa pun,
         * recovery tetap diberi kesempatan.
         */
        if (
          Array.isArray(
            offers
          ) &&
          offers.length
        ) {
          return offers;
        }
      } catch (
        error
      ) {
        primaryError =
          error;

        /*
         * Terminal provider state dari custom adapter
         * harus dipertahankan.
         */
        if (
          [
            'REGION_UNAVAILABLE',
            'DYNAMIC_PRICE_REQUIRED',
            'PRODUCT_UNAVAILABLE',
            'MAINTENANCE'
          ].includes(
            normalizeCode(
              error
            )
          )
        ) {
          throw error;
        }

        /*
         * Infrastructure/access error juga tidak boleh
         * di-bypass dengan request recovery tambahan.
         */
        if (
          !CUSTOM_FALLBACK_CODES
            .has(
              normalizeCode(
                error
              )
            )
        ) {
          throw error;
        }
      }

      try {
        const recoveredOffers =
          await recoveryAdapter
            .fetchOffers(
              game,
              options
            );

        if (
          Array.isArray(
            recoveredOffers
          ) &&
          recoveredOffers.length
        ) {
          return recoveredOffers;
        }

        /*
         * Bila recovery mengembalikan [] tanpa exception,
         * buat PARSER_FAILED agar universal fallback masih
         * mendapat kesempatan.
         */
        const error =
          new Error(
            `${name} recovery tidak menghasilkan offer`
          );

        error.code =
          'PARSER_FAILED';

        error.parserReason =
          'RECOVERY_RETURNED_NO_OFFERS';

        if (
          primaryError
        ) {
          error.primaryAdapterError = {
            code:
              primaryError?.code ||
              null,

            parserReason:
              primaryError
                ?.parserReason ||
              null
          };
        }

        throw error;
      } catch (
        recoveryError
      ) {
        if (
          primaryError
        ) {
          recoveryError
            .primaryAdapterError = {
              code:
                primaryError?.code ||
                null,

              parserReason:
                primaryError
                  ?.parserReason ||
                null
            };
        }

        throw recoveryError;
      }
    }
  };
}

/*
 * ============================================================
 * FINAL CUMULATIVE DEDICATED REGISTRY
 * ============================================================
 *
 * PENTING:
 *
 * Registry ini bersifat kumulatif.
 *
 * Jangan mengganti registry ini dengan patch toko yang hanya
 * memuat 1-2 adapter, karena itu yang sebelumnya menyebabkan
 * banyak toko kembali PARSER_FAILED.
 */
const DEDICATED = {
  /*
   * ========================================================
   * LEGACY STABLE
   * ========================================================
   */
  lapakgaming,

  duniagames,

  /*
   * ========================================================
   * LEGACY → STATE-AWARE RECOVERY
   * ========================================================
   *
   * Codashop dan UniPin tetap menggunakan dedicated legacy
   * terlebih dahulu.
   *
   * Jika legacy gagal pada route/game tertentu, barulah
   * state-aware recovery dipakai.
   */
  codashop:
    createLegacyThenStateAwareRecoveryAdapter(
      codashopLegacy,
      'codashop'
    ),

  unipin:
    createLegacyThenStateAwareRecoveryAdapter(
      unipinLegacy,
      'unipin'
    ),

  /*
   * ========================================================
   * CUSTOM DEDICATED
   * ========================================================
   */
  gigames,

  'kios-game-indonesia':
    kiosGameIndonesia,

  casatopup,

  bxystore,

  topupgamez,

  /*
   * ========================================================
   * CUSTOM DEDICATED → RECOVERY
   * ========================================================
   */
  'oura-store':
    createPrimaryThenRecoveryAdapter(
      ouraStore,

      stateAwareRecoveryAdapters[
        'oura-store'
      ],

      {
        id:
          'oura-store',

        name:
          'Oura Store'
      }
    ),

  topupdeh:
    createPrimaryThenRecoveryAdapter(
      topupdeh,

      stateAwareRecoveryAdapters
        .topupdeh,

      {
        id:
          'topupdeh',

        name:
          'TopUpDeh'
      }
    ),

  seagm:
    createPrimaryThenRecoveryAdapter(
      seagm,

      stateAwareRecoveryAdapters
        .seagm,

      {
        id:
          'seagm',

        name:
          'SEAGM'
      }
    ),

  /*
   * ========================================================
   * RECOVERY / STATE-AWARE
   * ========================================================
   *
   * Store berikut sebelumnya kembali jatuh ke universal
   * parser karena tidak didaftarkan pada index.js.
   */
  'gopay-games':
    stateAwareRecoveryAdapters[
      'gopay-games'
    ],

  'ggwp-topup':
    stateAwareRecoveryAdapters[
      'ggwp-topup'
    ],

  topupgamestore:
    stateAwareRecoveryAdapters
      .topupgamestore,

  'topup-id':
    stateAwareRecoveryAdapters[
      'topup-id'
    ],

  sontopup:
    stateAwareRecoveryAdapters
      .sontopup,

  yoggstore:
    stateAwareRecoveryAdapters
      .yoggstore,

  gamestorecan:
    stateAwareRecoveryAdapters
      .gamestorecan
};

/*
 * ============================================================
 * STRATEGY NORMALIZATION
 * ============================================================
 */
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

  const normalized =
    requested
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
      );

  /*
   * Jika store mempunyai dedicated adapter tetapi konfigurasi
   * accessStrategies lama tidak mencantumkan "dedicated",
   * tambahkan dedicated sebelum universal.
   *
   * Ini membuat registry custom/recovery benar-benar digunakan.
   */
  if (
    available.dedicated &&
    !normalized.includes(
      'dedicated'
    )
  ) {
    const universalIndex =
      normalized.indexOf(
        'universal'
      );

    if (
      universalIndex >=
      0
    ) {
      normalized.splice(
        universalIndex,
        0,
        'dedicated'
      );
    } else {
      normalized.push(
        'dedicated'
      );
    }
  }

  return normalized
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

/*
 * ============================================================
 * BUILD STORE ADAPTER
 * ============================================================
 */
function buildStoreAdapter(
  store
) {
  const available =
    {};

  /*
   * PUBLIC API
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
   * DEDICATED
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
   * UNIVERSAL FALLBACK
   *
   * Tetap aktif agar toko tanpa dedicated/recovery masih
   * berjalan seperti sebelumnya.
   */
  if (
    store.disableUniversal !==
    true
  ) {
    available.universal =
      createUniversalAdapter(
        store
      );
  }

  const strategyIds =
    normalizeStrategyList(
      store,
      available
    );

  const strategies =
    strategyIds.map(
      (id) => ({
        id,

        adapter:
          available[
            id
          ]
      })
    );

  /*
   * Compatibility guard:
   *
   * Jangan membuat toko hilang hanya karena configuration
   * strategy tidak cocok.
   */
  if (
    !strategies.length &&
    store.disableUniversal !==
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
   * Deployment markers.
   */
  adapter
    .adapterRegistryVersion =
    ADAPTER_REGISTRY_VERSION;

  adapter
    .stateAwareRecoveryVersion =
    STATE_AWARE_RECOVERY_VERSION;

  return adapter;
}

/*
 * ============================================================
 * REGISTRY
 * ============================================================
 */
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

/*
 * ============================================================
 * SELECTION / PAGINATION
 * ============================================================
 */
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

/*
 * ============================================================
 * PUBLIC API
 * ============================================================
 */
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

  STATE_AWARE_RECOVERY_VERSION,

  getStoreAdapters,

  getStoreAdapterCount,

  buildRegistryAdapters,

  buildStoreAdapter
};
