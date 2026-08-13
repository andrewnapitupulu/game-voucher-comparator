'use strict';

const {
  fetchStrictStoreOffers
} = require(
  './strict-store-parser'
);

const STORE = {
  id:
    'topupgamez',

  name:
    'Topupgamez'
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
      `https://topupgamez.id/beli/${slug}`,
      `https://topupgamez.id/id/beli/${slug}`,
      `https://topupgamez.id/id-id/beli/${slug}`,
      `https://topupgamez.id/${slug}`,
      `https://topupgamez.id/games/${slug}`
    ],

    /*
     * Jangan bergantung hanya pada tebakan route.
     *
     * Kalau route berubah, parser akan membaca
     * link game yang benar dari storefront.
     */
    discoveryPages: [
      'https://topupgamez.id/',
      'https://topupgamez.id/id',
      'https://topupgamez.id/id-id'
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
