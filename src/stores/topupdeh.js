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

const {
  probeDynamicProductState
} = require(
  './product-state-probe'
);

const STORE = {
  id:
    'topupdeh',

  name:
    'TopUpDeh'
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

function toLive(
  offers
) {
  return (
    Array.isArray(
      offers
    )
      ? offers
      : []
  )
    .map(
      (offer) => ({
        ...offer,

        extractionSource:
          offer?.extractionSource ||
          offer?.source ||
          'dedicated',

        source:
          'live',

        accessStrategy:
          offer?.accessStrategy ||
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

    let dedicatedError =
      null;

    let dynamicError =
      null;

    /*
     * 1. Dedicated parser.
     */
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
        Array.isArray(
          offers
        ) &&
        offers.length
      ) {
        return toLive(
          offers
        );
      }
    } catch (
      error
    ) {
      dedicatedError =
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
     * 2. Dynamic endpoint recovery.
     */
    try {
      const offers =
        await fetchDynamicOffers({
          store:
            STORE,

          game,
          options,

          pageUrls
        });

      if (
        Array.isArray(
          offers
        ) &&
        offers.length
      ) {
        return toLive(
          offers
        );
      }
    } catch (
      error
    ) {
      dynamicError =
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
     * 3. Provider/product state.
     *
     * Kalau URL game target valid tetapi exact product-price
     * pair tidak ada pada server-rendered content, jangan
     * classify sebagai PARSER_FAILED.
     */
    try {
      await probeDynamicProductState({
        store:
          STORE,

        game,
        options,

        urls:
          pageUrls,

        allowCatalogEvidence:
          false,

        trustVerifiedGameUrlWithoutPair:
          true
      });
    } catch (
      stateError
    ) {
      stateError.previousDedicatedError = {
        code:
          dedicatedError?.code ||
          null,

        parserReason:
          dedicatedError
            ?.parserReason ||
          null
      };

      stateError.previousDynamicError = {
        code:
          dynamicError?.code ||
          null,

        parserReason:
          dynamicError
            ?.parserReason ||
          null
      };

      throw stateError;
    }

    if (
      dynamicError
    ) {
      throw dynamicError;
    }

    if (
      dedicatedError
    ) {
      throw dedicatedError;
    }

    const error =
      new Error(
        'TopUpDeh tidak menghasilkan offer yang dapat diverifikasi'
      );

    error.code =
      'PARSER_FAILED';

    error.parserReason =
      'NO_VALID_OFFERS';

    throw error;
  }
};
