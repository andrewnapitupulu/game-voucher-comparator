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

const gigames =
  require(
    './gigames'
  );

const ouraStore =
  require(
    './oura-store'
  );

const seagm =
  require(
    './seagm'
  );

const kiosGameIndonesia =
  require(
    './kios-game-indonesia'
  );

const topupdeh =
  require(
    './topupdeh'
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
  '2026-08-13-dedicated-v4';

const DEDICATED = {
  codashop,

  unipin,

  lapakgaming,

  duniagames,

  /*
   * Custom dedicated adapters.
   */
  gigames,

  'oura-store':
    ouraStore,

  seagm,

  'kios-game-indonesia':
    kiosGameIndonesia,

  topupdeh
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
