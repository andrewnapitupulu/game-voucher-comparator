'use strict';

const {
  recoveryAdapters,
  createStrictRecoveryAdapter,
  createLegacyThenRecoveryAdapter,
  ADAPTER_VERSION:
    BASE_RECOVERY_VERSION
} = require(
  './recovery-store-adapters'
);

const {
  probeProviderState,
  PROVIDER_STATE_VERSION
} = require(
  './provider-state-recovery'
);

const STATE_AWARE_RECOVERY_VERSION =
  '2026-08-13-state-aware-v1';

/*
 * ============================================================
 * TOPUP.ID
 * ============================================================
 *
 * Tambahkan karena recovery-store-adapters.js yang sekarang
 * belum mempunyai entry "topup-id".
 */
const topupIdBase =
  createStrictRecoveryAdapter({
    id:
      'topup-id',

    name:
      'TOPUP.ID',

    homepage:
      'https://topup.id/',

    paths: [
      'games/{gameSlug}',
      '{gameSlug}'
    ],

    discovery: [
      ''
    ]
  });

const STATE_CONFIG = {
  codashop: {
    name:
      'Codashop',

    expectedLocalePath:
      '/id-id/',

    additionalProbeUrls:
      []
  },

  unipin: {
    name:
      'UniPin',

    additionalProbeUrls:
      []
  },

  'ggwp-topup': {
    name:
      'GGWP Top Up',

    additionalProbeUrls: [
      'https://topup.ggwp.id/'
    ],

    missingCatalogMeansUnavailable:
      true
  },

  'topup-id': {
    name:
      'TOPUP.ID',

    additionalProbeUrls: [
      'https://topup.id/'
    ]
  },

  topupdeh: {
    name:
      'TopUpDeh',

    additionalProbeUrls: [
      'https://topupdeh.id/'
    ]
  },

  seagm: {
    name:
      'SEAGM',

    additionalProbeUrls:
      []
  }
};

function extractCandidateUrls(
  error
) {
  return [
    ...(
      error
        ?.recoveryStoreConfig
        ?.candidates ||
      []
    ),

    ...(
      error
        ?.strictParserDiagnostics
        ?.attemptedUrls ||
      []
    ),

    ...(
      error
        ?.strictParserDiagnostics
        ?.attempts ||
      []
    )
      .flatMap(
        (attempt) => [
          attempt?.url,
          attempt?.finalUrl
        ]
      )
  ]
    .filter(
      Boolean
    );
}

function withStateAwareness(
  adapter,
  storeId
) {
  const config =
    STATE_CONFIG[
      storeId
    ];

  if (
    !adapter ||
    !config
  ) {
    return adapter;
  }

  return {
    ...adapter,

    stateAwareRecoveryVersion:
      STATE_AWARE_RECOVERY_VERSION,

    async fetchOffers(
      game,
      options = {}
    ) {
      try {
        return await adapter
          .fetchOffers(
            game,
            options
          );
      } catch (
        originalError
      ) {
        const originalCode =
          String(
            originalError
              ?.code ||
            ''
          )
            .toUpperCase();

        /*
         * Jangan melakukan request tambahan untuk
         * network/access/rate-limit error.
         */
        if (
          [
            'ACCESS_BLOCKED',
            'RATE_LIMITED',
            'NETWORK_DNS_ERROR',
            'NETWORK_TLS_ERROR',
            'NETWORK_CONNECTION_ERROR',
            'NETWORK_CONNECT_TIMEOUT',
            'NETWORK_FETCH_FAILED',
            'TIMEOUT'
          ].includes(
            originalCode
          )
        ) {
          throw originalError;
        }

        const urls = [
          ...extractCandidateUrls(
            originalError
          ),

          ...(
            config
              .additionalProbeUrls ||
            []
          )
        ];

        try {
          await probeProviderState({
            storeId,

            storeName:
              config.name,

            game,

            urls,

            timeoutMs:
              options.timeoutMs ||
              5000,

            expectedLocalePath:
              config
                .expectedLocalePath ||
              null,

            missingCatalogMeansUnavailable:
              Boolean(
                config
                  .missingCatalogMeansUnavailable
              )
          });
        } catch (
          stateError
        ) {
          stateError
            .previousRecoveryError = {
              code:
                originalError
                  ?.code ||
                null,

              parserReason:
                originalError
                  ?.parserReason ||
                null
            };

          throw stateError;
        }

        throw originalError;
      }
    }
  };
}

const baseAdapters = {
  ...recoveryAdapters,

  'topup-id':
    topupIdBase
};

const stateAwareRecoveryAdapters = {
  ...baseAdapters
};

for (
  const storeId of
  Object.keys(
    STATE_CONFIG
  )
) {
  if (
    baseAdapters[
      storeId
    ]
  ) {
    stateAwareRecoveryAdapters[
      storeId
    ] =
      withStateAwareness(
        baseAdapters[
          storeId
        ],
        storeId
      );
  }
}

function createLegacyThenStateAwareRecoveryAdapter(
  legacyAdapter,
  storeId
) {
  return createLegacyThenRecoveryAdapter(
    legacyAdapter,

    stateAwareRecoveryAdapters[
      storeId
    ]
  );
}

module.exports = {
  STATE_AWARE_RECOVERY_VERSION,

  BASE_RECOVERY_VERSION,

  PROVIDER_STATE_VERSION,

  stateAwareRecoveryAdapters,

  createLegacyThenStateAwareRecoveryAdapter
};
