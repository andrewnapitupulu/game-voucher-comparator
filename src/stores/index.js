'use strict';

const codashopLegacy = require('./codashop');
const unipinLegacy = require('./unipin');
const lapakgaming = require('./lapakgaming');
const duniagames = require('./duniagames');

const {
  stateAwareRecoveryAdapters,
  createLegacyThenStateAwareRecoveryAdapter,
  STATE_AWARE_RECOVERY_VERSION
} = require('./recovery-store-state-aware');

const {
  makeGenericAdapters
} = require('./generic-json');

const {
  createUniversalAdapter
} = require('./universal-page');

const {
  createPublicApiAdapter,
  isPublicApiConfigured
} = require('./public-api');

const {
  createMultiStrategyAdapter
} = require('./multi-strategy');

const {
  listStores
} = require('../config/stores');

const ADAPTER_REGISTRY_VERSION =
  '2026-08-13-final-four-v1';

function optionalAdapter(path) {
  try {
    return require(path);
  } catch (error) {
    if (
      error?.code === 'MODULE_NOT_FOUND' &&
      String(error?.message || '')
        .includes(`'${path}'`)
    ) {
      return null;
    }

    throw error;
  }
}

/*
 * ============================================================
 * CUSTOM ADAPTERS YANG SUDAH BERHASIL
 * ============================================================
 *
 * Jangan mengubah toko yang saat ini sudah berhasil.
 */
const customAdapters = {
  gigames:
    optionalAdapter('./gigames'),

  'kios-game-indonesia':
    optionalAdapter(
      './kios-game-indonesia'
    ),

  casatopup:
    optionalAdapter('./casatopup'),

  topupgamez:
    optionalAdapter('./topupgamez'),

  bxystore:
    optionalAdapter('./bxystore')
};

const existingCustom =
  Object.fromEntries(
    Object.entries(
      customAdapters
    ).filter(
      (
        [
          ,
          adapter
        ]
      ) =>
        Boolean(adapter)
    )
  );

/*
 * ============================================================
 * DEDICATED REGISTRY
 * ============================================================
 */
const DEDICATED = {
  /*
   * Existing stable adapters.
   */
  lapakgaming,
  duniagames,

  /*
   * Codashop dan UniPin:
   *
   * adapter lama tetap dicoba terlebih dahulu.
   * Jika tidak cocok dengan game/halaman,
   * state-aware recovery mengambil alih.
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
   * Existing custom parsers.
   */
  ...existingCustom,

  /*
   * Recovery adapters.
   */
  'gopay-games':
    stateAwareRecoveryAdapters[
      'gopay-games'
    ],

  'ggwp-topup':
    stateAwareRecoveryAdapters[
      'ggwp-topup'
    ],

  'oura-store':
    stateAwareRecoveryAdapters[
      'oura-store'
    ],

  topupgamestore:
    stateAwareRecoveryAdapters
      .topupgamestore,

  'topup-id':
    stateAwareRecoveryAdapters[
      'topup-id'
    ],

  topupdeh:
    stateAwareRecoveryAdapters
      .topupdeh,

  seagm:
    stateAwareRecoveryAdapters
      .seagm,

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
    .filter(Boolean)
    .filter(
      (value) => {
        if (
          seen.has(value) ||
          !available[value]
        ) {
          return false;
        }

        seen.add(value);

        return true;
      }
    );
}

function buildStoreAdapter(
  store
) {
  const available = {};

  /*
   * PUBLIC API
   */
  if (
    isPublicApiConfigured(
      store
    )
  ) {
    available['public-api'] =
      createPublicApiAdapter(
        store
      );
  }

  /*
   * DEDICATED / STATE-AWARE
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
   * UNIVERSAL
   *
   * Tetap tersedia untuk parser failure biasa.
   *
   * Tetapi terminal provider state akan dihentikan
   * oleh multi-strategy sebelum masuk universal:
   *
   * REGION_UNAVAILABLE
   * DYNAMIC_PRICE_REQUIRED
   * PRODUCT_UNAVAILABLE
   * MAINTENANCE
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

  const strategies =
    normalizeStrategyList(
      store,
      available
    ).map(
      (id) => ({
        id,

        adapter:
          available[id]
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

  if (!enabled) {
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
      Number(offset) || 0
    );

  const safeLimit =
    Math.max(
      1,
      Math.min(
        20,
        Number(limit) || 8
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
