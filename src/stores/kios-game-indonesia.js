'use strict';

const {
  fetchStrictStoreOffers
} = require(
  './strict-store-parser'
);

const STORE = {
  id:
    'kios-game-indonesia',

  name:
    'Kios Game Indonesia'
};

function urlsFor(
  game
) {
  const slug =
    encodeURIComponent(
      game.id
    );

  const candidates = [
    `https://kiosgameindonesia.com/en/${slug}`,
    `https://kiosgameindonesia.com/${slug}`,
    `https://kiosgameindonesia.com/id/${slug}`
  ];

  /*
   * Route alternatif Mobile Legends.
   */
  if (
    game.id ===
    'mobile-legends'
  ) {
    candidates.push(
      'https://kiosgameindonesia.com/en/mobile-legends-ph'
    );
  }

  return {
    candidates,

    discoveryPages: [
      'https://kiosgameindonesia.com/en',
      'https://kiosgameindonesia.com/'
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
