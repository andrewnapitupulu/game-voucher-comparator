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
    'gigames',

  name:
    'Gigames'
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

function candidatesFor(
  game
) {
  const slug =
    encodeURIComponent(
      game.id
    );

  const candidates =
    [];

  if (
    game.id ===
    'wuthering-waves'
  ) {
    candidates.push({
      url:
        'https://www.gigames.id/id/beli/wuthering-waves',

      mode:
        'page'
    });
  }

  if (
    game.id ===
    'mobile-legends'
  ) {
    candidates.push({
      url:
        'https://www.gigames.id/beli/mobile-legends-global',

      mode:
        'page'
    });
  }

  candidates.push(
    {
      url:
        `https://www.gigames.id/id/beli/${slug}`,

      mode:
        'page'
    },

    {
      url:
        `https://www.gigames.id/beli/${slug}`,

      mode:
        'page'
    },

    {
      url:
        `https://www.gigames.id/en/beli/${slug}`,

      mode:
        'page'
    },

    {
      url:
        'https://www.gigames.id/services',

      mode:
        'catalog'
    },

    {
      url:
        'https://www.gigames.id/fil/products',

      mode:
        'catalog'
    }
  );

  return candidates;
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
    const candidates =
      candidatesFor(
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

          candidates,

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

          pageUrls:
            candidates
              .filter(
                (item) =>
                  item.mode ===
                  'page'
              )
              .map(
                (item) =>
                  item.url
              )
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
