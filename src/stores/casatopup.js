'use strict';

const {
  fetchStrictStoreOffers
} = require(
  './strict-store-parser'
);

const STORE = {
  id:
    'casatopup',

  name:
    'CasaTopup'
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
      `https://casatopup.com/beli/${slug}`,
      `https://casatopup.com/id/beli/${slug}`,
      `https://casatopup.com/en/beli/${slug}`,
      `https://casatopup.com/${slug}`
    ],

    discoveryPages: [
      'https://casatopup.com/id',
      'https://casatopup.com/en',
      'https://casatopup.com/'
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
