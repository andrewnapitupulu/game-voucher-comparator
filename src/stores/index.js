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

function makeRegistryAdapter(
  store
) {
  const dedicated =
    DEDICATED[
      store.id
    ];

  const universal =
    createUniversalAdapter(
      store
    );

  /*
   * Jika toko tidak mempunyai
   * parser khusus, gunakan universal
   * parser seperti biasa.
   */
  if (!dedicated) {
    return universal;
  }

  return {
    id:
      store.id,

    name:
      store.name,

    category:
      store.category,

    verification:
      store.verification,

    async fetchOffers(
      game,
      options
    ) {
      /*
       * Jika game mempunyai URL khusus
       * untuk toko ini, gunakan parser
       * dedicated.
       *
       * Contoh:
       *
       * Mobile Legends + Codashop
       * Mobile Legends + Lapakgaming
       */
      if (
        game?.stores?.[
          store.id
        ]
      ) {
        return dedicated.fetchOffers(
          game,
          options
        );
      }

      /*
       * Untuk game baru yang belum
       * mempunyai URL dedicated di toko,
       * jangan langsung return kosong.
       *
       * Universal adapter akan:
       *
       * 1. membuka homepage toko
       * 2. mencari link game
       * 3. mencoba slug game umum
       * 4. parsing halaman produk
       */
      return universal.fetchOffers(
        game,
        options
      );
    }
  };
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
      makeRegistryAdapter
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
  /*
   * Jika user/API meminta toko tertentu.
   */
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
      Number(offset) ||
      0
    );

  /*
   * Maksimal 20 toko per API request
   * supaya serverless request tidak
   * terlalu berat.
   */
  const safeLimit =
    Math.max(
      1,

      Math.min(
        20,

        Number(limit) ||
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

  /*
   * Generic JSON feed hanya perlu
   * dipasang sekali pada batch awal.
   */
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
  getStoreAdapters,
  getStoreAdapterCount,
  buildRegistryAdapters
};
