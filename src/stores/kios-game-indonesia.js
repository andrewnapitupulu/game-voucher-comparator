'use strict';

const {
  fetchDedicatedOffers
} = require(
  './dedicated-store-parser'
);

const {
  fetchDynamicOffers
} = require(
  './dynamic-page-recovery'
);

const STORE = {
  id:
    'kios-game-indonesia',

  name:
    'Kios Game Indonesia'
};

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
        offer.accessStrategy ||
        'dedicated'
    })
  );
}

function pageUrlsFor(
  game
) {
  const slug =
    encodeURIComponent(
      game.id
    );

  const urls = [
    `https://kiosgameindonesia.com/${slug}`,

    `https://kiosgameindonesia.com/en/${slug}`,

    `https://kiosgameindonesia.com/id/${slug}`
  ];

  if (
    game.id ===
    'mobile-legends'
  ) {
    urls.push(
      'https://kiosgameindonesia.com/en/mobile-legends-ph'
    );
  }

  return urls;
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
    const pageUrls =
      pageUrlsFor(
        game
      );

    try {
      const offers =
        await fetchDedicatedOffers({
          storeId:
            STORE.id,

          storeName:
            STORE.name,

          game,
          options,

          candidates:
            pageUrls.map(
              (url) => ({
                url,

                mode:
                  'page'
              })
            ),

          /*
           * WAJIB true.
           *
           * Product list Kios dimuat setelah page load.
           */
          enableDynamicDiscovery:
            true,

          minOffers:
            1
        });

      if (
        offers.length
      ) {
        return toLive(
          offers
        );
      }
    } catch (
      firstError
    ) {
      try {
        return await fetchDynamicOffers({
          store:
            STORE,

          game,
          options,

          pageUrls
        });
      } catch (
        dynamicError
      ) {
        dynamicError
          .previousDedicatedError = {
            code:
              firstError?.code ||
              null,

            parserReason:
              firstError
                ?.parserReason ||
              null
          };

        throw dynamicError;
      }
    }

    return [];
  }
};
