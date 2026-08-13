'use strict';

const {
  fetchStrictStoreOffers
} = require(
  './strict-store-parser'
);

const {
  probeDynamicProductState
} = require(
  './product-state-probe'
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

    let strictError =
      null;

    try {
      const offers =
        await fetchStrictStoreOffers({
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

      if (
        Array.isArray(
          offers
        ) &&
        offers.length
      ) {
        return offers;
      }
    } catch (
      error
    ) {
      strictError =
        error;
    }

    /*
     * ========================================================
     * STATE FALLBACK
     * ========================================================
     *
     * Kalau canonical product page membuktikan game target
     * tetapi primary section tidak membawa harga IDR,
     * statusnya dynamic, bukan parser failed.
     */
    try {
      await probeDynamicProductState({
        store:
          STORE,

        game,
        options,

        urls: [
          ...urls.candidates,
          ...urls.discoveryPages
        ],

        allowCatalogEvidence:
          false
      });
    } catch (
      stateError
    ) {
      stateError.previousStrictError = {
        code:
          strictError?.code ||
          null,

        parserReason:
          strictError
            ?.parserReason ||
          null
      };

      throw stateError;
    }

    if (
      strictError
    ) {
      throw strictError;
    }

    const error =
      new Error(
        'CasaTopup tidak menghasilkan offer yang dapat diverifikasi'
      );

    error.code =
      'PARSER_FAILED';

    error.parserReason =
      'NO_VALID_OFFERS';

    throw error;
  }
};
