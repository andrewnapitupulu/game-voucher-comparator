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

const DEDICATED = {
  codashop,
  unipin,
  lapakgaming,
  duniagames
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
    .filter(Boolean)
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
   *
   * Hanya aktif jika store.publicApi
   * memang dikonfigurasi.
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
   * UNIVERSAL
   *
   * Tetap menjadi fallback kecuali
   * secara eksplisit dinonaktifkan.
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
   * Compatibility guard.
   *
   * Kalau accessStrategies typo atau
   * tidak cocok, jangan membuat toko
   * hilang seluruhnya.
   */
  if (
    !strategies.length
  ) {
    if (
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
  }

  return createMultiStrategyAdapter(
    store,
    strategies
  );
}

function buildRegistryAdapters() {
  const publicAdaptersEnabled =
    String(
      process.env.ENABLE_PUBLIC_PAGE_ADAPTERS ||
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
  getStoreAdapters,
  getStoreAdapterCount,
  buildRegistryAdapters,
  buildStoreAdapter
};
