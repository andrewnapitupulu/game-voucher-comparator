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
    'topupdeh',

  name:
    'TopUpDeh'
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

  return [
    `https://topupdeh.id/${slug}`,

    `https://topupdeh.id/games/${slug}`,

    `https://topupdeh.id/game/${slug}`
  ];
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
