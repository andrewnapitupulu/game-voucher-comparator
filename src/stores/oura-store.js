'use strict';

const {
  fetchDedicatedOffers
} = require(
  './dedicated-store-parser'
);

function candidatesFor(
  game
) {
  const slug =
    encodeURIComponent(
      game.id
    );

  return [
    {
      url:
        `https://www.ourastore.com/id-id/${slug}?from=undefined`,

      mode:
        'page'
    },

    {
      url:
        `https://www.ourastore.com/id-id/${slug}`,

      mode:
        'page'
    },

    {
      url:
        `https://ourastore.com/id-id/${slug}?from=undefined`,

      mode:
        'page'
    }
  ];
}

module.exports = {
  id:
    'oura-store',

  name:
    'Oura Store',

  async fetchOffers(
    game,
    options = {}
  ) {
    return fetchDedicatedOffers({
      storeId:
        'oura-store',

      storeName:
        'Oura Store',

      game,
      options,

      candidates:
        candidatesFor(
          game
        ),

      /*
       * Jika HTML biasa tidak membawa offers,
       * cari serialized state, JS bundle,
       * dan endpoint GET read-only yang ditemukan.
       */
      enableDynamicDiscovery:
        true,

      minOffers:
        game.id ===
        'mobile-legends'
          ? 2
          : 1
    });
  }
};
