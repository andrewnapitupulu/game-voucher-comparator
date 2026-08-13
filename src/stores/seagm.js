'use strict';

const {
  fetchDedicatedOffers
} = require(
  './dedicated-store-parser'
);

function toLive(
  offers
) {
  return offers.map(
    (offer) => ({
      ...offer,

      extractionSource:
        offer.extractionSource ||
        offer.source ||
        'dedicated',

      source:
        'live',

      accessStrategy:
        'dedicated'
    })
  );
}

function candidatesFor(
  game
) {
  const slug =
    encodeURIComponent(
      game.id
    );

  const candidates =
    [];

  /*
   * Wuthering Waves canonical SEAGM.
   */
  if (
    game.id ===
    'wuthering-waves'
  ) {
    candidates.push({
      url:
        'https://www.seagm.com/id-id/wuthering-waves-top-up',

      mode:
        'page'
    });
  }

  /*
   * Mobile Legends canonical SEAGM.
   */
  if (
    game.id ===
    'mobile-legends'
  ) {
    candidates.push({
      url:
        'https://www.seagm.com/id-id/mlbb-diamonds-top-up-id',

      mode:
        'page'
    });
  }

  candidates.push(
    {
      url:
        `https://www.seagm.com/id-id/${slug}-top-up`,

      mode:
        'page'
    },

    {
      url:
        `https://www.seagm.com/id-id/${slug}`,

      mode:
        'page'
    }
  );

  return candidates;
}

module.exports = {
  id:
    'seagm',

  name:
    'SEAGM',

  async fetchOffers(
    game,
    options = {}
  ) {
    const offers =
      await fetchDedicatedOffers({
        storeId:
          'seagm',

        storeName:
          'SEAGM',

        game,
        options,

        candidates:
          candidatesFor(
            game
          ),

        enableDynamicDiscovery:
          false,

        minOffers:
          1
      });

    return toLive(
      offers
    );
  }
};
