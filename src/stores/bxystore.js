'use strict';

const {
  fetchStrictStoreOffers
} = require(
  './strict-store-parser'
);

const STORE = {
  id:
    'bxystore',

  name:
    'BXYStore'
};

function urlsFor(
  game
) {
  const slug =
    encodeURIComponent(
      game.id
    );

  return {
    candidates: [
      `https://bxystore.com/en-id/beli/${slug}`,
      `https://bxystore.com/id/beli/${slug}`,
      `https://bxystore.com/beli/${slug}`,
      `https://bxystore.com/my-id/beli/${slug}`,
      `https://bxystore.com/fil-id/beli/${slug}`
    ],

    /*
     * BXY memiliki beberapa locale prefix.
     *
     * Daripada memaksa satu route,
     * parser mencari link canonical dari
     * storefront locale.
     */
    discoveryPages: [
      'https://bxystore.com/my-id',
      'https://bxystore.com/fil-id',
      'https://bxystore.com/en-id',
      'https://bxystore.com/'
    ]
  };
}

module.exports = {
  id:
    STORE.id,

  name:
    STORE.name,

  async fetchOffers(
    game,
    options = {}
  ) {
    const urls =
      urlsFor(
        game
      );

    return fetchStrictStoreOffers({
      store:
        STORE,

      game,
      options,

      candidates:
        urls.candidates,

      discoveryPages:
        urls.discoveryPages,

      dynamic:
        true
    });
  }
};
