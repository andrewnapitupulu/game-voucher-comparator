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
        'https://www.gigames.id/services',

      mode:
        'catalog'
    },

    {
      url:
        'https://gigames.id/en',

      mode:
        'catalog'
    },

    {
      url:
        `https://gigames.id/beli/${slug}`,

      mode:
        'page'
    },

    {
      url:
        `https://gigames.id/id/beli/${slug}`,

      mode:
        'page'
    },

    {
      url:
        `https://gigames.id/en/beli/${slug}`,

      mode:
        'page'
    }
  ];

  /*
   * Mobile Legends Gigames mempunyai
   * route khusus yang saat ini valid.
   */
  if (
    game.id ===
    'mobile-legends'
  ) {
    candidates.splice(
      2,
      0,
      {
        url:
          'https://gigames.id/beli/mobile-legends-global',

        mode:
          'page'
      }
    );
  }

  return candidates;
}

module.exports = {
  id:
    'gigames',

  name:
    'Gigames',

  async fetchOffers(
    game,
    options = {}
  ) {
    return fetchDedicatedOffers({
      storeId:
        'gigames',

      storeName:
        'Gigames',

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
