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
    'bxystore',

  name:
    'BXYStore'
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
      `https://bxystore.com/en-id/beli/${slug}`,
      `https://bxystore.com/id/beli/${slug}`,
      `https://bxystore.com/beli/${slug}`,
      `https://bxystore.com/my-id/beli/${slug}`,
      `https://bxystore.com/fil-id/beli/${slug}`,
      `https://bxystore.com/th-id/beli/${slug}`,
      `https://bxystore.com/ja-id/beli/${slug}`,
      `https://bxystore.com/vi-id/beli/${slug}`
    ],

    /*
     * Catalog pages hanya digunakan sebagai evidence
     * bahwa game tersedia.
     *
     * Catalog tidak digunakan sebagai sumber
     * product-price pairing.
     */
    discoveryPages: [
      'https://bxystore.com/en-id',
      'https://bxystore.com/en-id/products',

      'https://bxystore.com/my-id',
      'https://bxystore.com/my-id/products',

      'https://bxystore.com/fil-id',
      'https://bxystore.com/fil-id/products',

      'https://bxystore.com/th-id',
      'https://bxystore.com/th-id/products',

      'https://bxystore.com/ja-id/products',
      'https://bxystore.com/vi-id/products',

      'https://bxystore.com/'
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
     * 1. STRICT PRODUCT-PRICE PAIRING
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

      /*
       * Jangan request ulang untuk infrastructure failure.
       */
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
     * 2. PRODUCT STATE PROBE
     * ========================================================
     *
     * BXYStore boleh membuktikan keberadaan game melalui
     * catalog page.
     *
     * Tetapi harga catalog tidak dipakai untuk membuat offer.
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
          true
      });
    } catch (
      stateError
    ) {
      stateError.previousStrictError = {
        code:
          strictError
            ?.code ||
          null,

        parserReason:
          strictError
            ?.parserReason ||
          null
      };

      throw stateError;
    }

    /*
     * Kalau game/product state tidak dapat dibuktikan,
     * pertahankan genuine parser error.
     */
    if (
      strictError
    ) {
      throw strictError;
    }

    const error =
      new Error(
        'BXYStore tidak menghasilkan offer yang dapat diverifikasi'
      );

    error.code =
      'PARSER_FAILED';

    error.parserReason =
      'NO_VALID_OFFERS';

    throw error;
  }
};
