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
     * Hanya sebagai availability evidence.
     *
     * Harga di halaman catalog tidak boleh dipakai
     * sebagai harga game target.
     */
    discoveryPages: [
      'https://bxystore.com/en-id/products',

      'https://bxystore.com/my-id/products',

      'https://bxystore.com/fil-id/products',

      'https://bxystore.com/th-id/products',

      'https://bxystore.com/ja-id/products',

      'https://bxystore.com/vi-id/products',

      'https://bxystore.com/en-id',

      'https://bxystore.com/my-id',

      'https://bxystore.com/fil-id',

      'https://bxystore.com/th-id',

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
     * Jika:
     *
     * - product URL valid, atau
     * - catalog membuktikan game tersedia
     *
     * tetapi strict product-price pair tidak ditemukan,
     * classify sebagai DYNAMIC_PRICE_REQUIRED.
     *
     * Harga produk lain di catalog tidak menjadi
     * price evidence.
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
          true,

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

    /*
     * Tidak ada evidence bahwa game/page target valid.
     * Kalau begitu tetap genuine parser failure.
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
