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
     * Catalog locale digunakan sebagai evidence
     * keberadaan game, bukan sebagai sumber harga.
     */
    discoveryPages: [
      'https://bxystore.com/en-id',
      'https://bxystore.com/en-id/products',
      'https://bxystore.com/my-id',
      'https://bxystore.com/my-id/products',
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
     * Kalau game ditemukan pada katalog BXY tetapi
     * product-price pair tidak tersedia sebagai server-
     * rendered data, treat sebagai dynamic data.
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
        'BXYStore tidak menghasilkan offer yang dapat diverifikasi'
      );

    error.code =
      'PARSER_FAILED';

    error.parserReason =
      'NO_VALID_OFFERS';

    throw error;
  }
};
