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

  const candidates = [
    {
      url:
        `https://kiosgameindonesia.com/${slug}`,

      mode:
        'page'
    },

    {
      url:
        `https://kiosgameindonesia.com/en/${slug}`,

      mode:
        'page'
    },

    {
      url:
        `https://kiosgameindonesia.com/id/${slug}`,

      mode:
        'page'
    }
  ];

  if (
    game.id ===
    'mobile-legends'
  ) {
    candidates.push({
      url:
        'https://kiosgameindonesia.com/en/mobile-legends-ph',

      mode:
        'page'
    });
  }

  return candidates;
}

module.exports = {
  id:
    'kios-game-indonesia',

  name:
    'Kios Game Indonesia',

  async fetchOffers(
    game,
    options = {}
  ) {
    return fetchDedicatedOffers({
      storeId:
        'kios-game-indonesia',

      storeName:
        'Kios Game Indonesia',

      game,
      options,

      candidates:
        candidatesFor(
          game
        ),

      enableDynamicDiscovery:
        false,

      minOffers:
        game.id ===
        'mobile-legends'
          ? 2
          : 1
    });
  }
};
