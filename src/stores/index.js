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
  '2026-08-13-cumulative-wiring-v2';

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

const topupgamez =
  optionalAdapter(
    './topupgamez'
  );

const RECOVERABLE_CUSTOM_CODES =
  new Set([
    'NOT_CONFIGURED',
    'PARSER_FAILED',
    'PAGE_NOT_VERIFIED',
    'PAGE_NOT_FOUND'
  ]);

const TERMINAL_STATE_CODES =
  new Set([
    'REGION_UNAVAILABLE',
    'DYNAMIC_PRICE_REQUIRED',
    'PRODUCT_UNAVAILABLE',
    'MAINTENANCE'
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

        const code =
          normalizeCode(
            error
          );

        if (
          TERMINAL_STATE_CODES
            .has(
              code
            )
        ) {
          throw error;
        }

        if (
          !RECOVERABLE_CUSTOM_CODES
            .has(
              code
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
 * CUMULATIVE REGISTRY
 * ============================================================
 */
const DEDICATED = {
  lapakgaming,

  duniagames,

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

  gigames,

  'kios-game-indonesia':
    kiosGameIndonesia,

  casatopup,

  bxystore,

  topupgamez,

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
   * Pastikan dedicated benar-benar digunakan walaupun
   * accessStrategies lama belum mencantumkannya.
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

  const seen =
    new Set();

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

function buildStoreAdapter(
  store
) {
  const available =
    {};

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

  if (
    store.disableUniversal !==
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

  adapter.adapterRegistryVersion =
    ADAPTER_REGISTRY_VERSION;

  adapter.stateAwareRecoveryVersion =
    STATE_AWARE_RECOVERY_VERSION;

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
  STATE_AWARE_RECOVERY_VERSION,

  getStoreAdapters,
  getStoreAdapterCount,
  buildRegistryAdapters,
  buildStoreAdapter
};
