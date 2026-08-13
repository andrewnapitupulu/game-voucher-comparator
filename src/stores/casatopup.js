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

const INFRASTRUCTURE_ERRORS =
  new Set([
    'ACCESS_BLOCKED',
    'RATE_LIMITED',
    'NETWORK_DNS_ERROR',
    'NETWORK_TLS_ERROR',
    'NETWORK_CONNECTION_ERROR',
    'NETWORK_CONNECT_TIMEOUT',
    'NETWORK_FETCH_FAILED',
    'TIMEOUT'
  ]);

function errorCode(
  error
) {
  return String(
    error?.code ||
    ''
  )
    .trim()
    .toUpperCase();
}

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

    /*
     * ========================================================
     * 1. STRICT EXTRACTION
     * ========================================================
     */
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

      if (
        INFRASTRUCTURE_ERRORS
          .has(
            errorCode(
              error
            )
          )
      ) {
        throw error;
      }
    }

    /*
     * ========================================================
     * 2. STATE PROBE
     * ========================================================
     *
     * Satu angka Rp acak tidak lagi dianggap sebagai
     * bukti harga produk.
     *
     * Evidence harga harus berupa:
     *
     * unit game + harga IDR berdekatan.
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
          false,

        trustVerifiedGameUrlWithoutPair:
          true
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
