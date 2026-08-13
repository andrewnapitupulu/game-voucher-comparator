'use strict';

const {
  shouldAttemptParserRecovery,
  tryParserRecovery
} = require(
  './parser-recovery'
);

const MULTI_STRATEGY_VERSION =
  '2026-08-13-terminal-state-v2';

const TERMINAL_PROVIDER_STATE_CODES =
  new Set([
    'REGION_UNAVAILABLE',
    'DYNAMIC_PRICE_REQUIRED',
    'PRODUCT_UNAVAILABLE',
    'MAINTENANCE'
  ]);

const ERROR_PRIORITY = {
  REGION_UNAVAILABLE:
    150,

  MAINTENANCE:
    148,

  PRODUCT_UNAVAILABLE:
    146,

  DYNAMIC_PRICE_REQUIRED:
    144,

  PARSER_FAILED:
    100,

  PAGE_NOT_VERIFIED:
    95,

  ACCESS_BLOCKED:
    90,

  RATE_LIMITED:
    88,

  NETWORK_TLS_ERROR:
    80,

  NETWORK_CONNECTION_ERROR:
    78,

  NETWORK_DNS_ERROR:
    76,

  NETWORK_CONNECT_TIMEOUT:
    74,

  NETWORK_FETCH_FAILED:
    72,

  TIMEOUT:
    70,

  UPSTREAM_ERROR:
    60,

  HTTP_ERROR:
    50,

  DISCOVERY_BLOCKED:
    40,

  CANDIDATE_BLOCKED:
    35,

  PAGE_NOT_FOUND:
    20,

  NOT_CONFIGURED:
    10
};

function normalizeCode(
  error
) {
  return String(
    error?.code ||
    ''
  )
    .trim()
    .toUpperCase();
}

function isTerminalProviderState(
  error
) {
  return TERMINAL_PROVIDER_STATE_CODES
    .has(
      normalizeCode(
        error
      )
    );
}

function errorPriority(
  error
) {
  return (
    ERROR_PRIORITY[
      normalizeCode(
        error
      )
    ] ||
    0
  );
}

function pickStrongerError(
  current,
  candidate
) {
  if (
    !candidate
  ) {
    return current;
  }

  if (
    !current
  ) {
    return candidate;
  }

  return (
    errorPriority(
      candidate
    ) >
    errorPriority(
      current
    )
  )
    ? candidate
    : current;
}

function shouldStopChain(
  strategyId,
  error,
  store
) {
  const code =
    normalizeCode(
      error
    );

  /*
   * State provider yang sudah terbukti tidak boleh
   * diteruskan ke universal parser.
   */
  if (
    TERMINAL_PROVIDER_STATE_CODES
      .has(
        code
      )
  ) {
    return true;
  }

  if (
    code ===
    'RATE_LIMITED'
  ) {
    return true;
  }

  if (
    code !==
    'ACCESS_BLOCKED'
  ) {
    return false;
  }

  if (
    strategyId ===
    'public-api'
  ) {
    return Boolean(
      store
        ?.publicApi
        ?.blockStopsChain
    );
  }

  if (
    strategyId ===
    'dedicated'
  ) {
    return (
      store
        ?.continueAfterBlocked !==
      true
    );
  }

  return true;
}

function mapOffersWithStrategy(
  offers,
  strategyId
) {
  if (
    !Array.isArray(
      offers
    )
  ) {
    return [];
  }

  return offers.map(
    (offer) => ({
      ...offer,

      accessStrategy:
        offer?.accessStrategy ||
        strategyId,

      multiStrategyVersion:
        MULTI_STRATEGY_VERSION
    })
  );
}

function attemptLog(
  strategy,
  startedAt,
  details = {}
) {
  return {
    strategy,

    durationMs:
      Date.now() -
      startedAt,

    ...details
  };
}

function createMultiStrategyAdapter(
  store,
  strategies
) {
  let lastDiagnostics =
    null;

  return {
    id:
      store.id,

    name:
      store.name,

    category:
      store.category,

    verification:
      store.verification,

    strategy:
      'multi',

    multiStrategyVersion:
      MULTI_STRATEGY_VERSION,

    getLastDiagnostics() {
      return lastDiagnostics;
    },

    async fetchOffers(
      game,
      options = {}
    ) {
      const attempts =
        [];

      let strongestError =
        null;

      for (
        const strategy of
        strategies
      ) {
        const startedAt =
          Date.now();

        try {
          const offers =
            await strategy
              .adapter
              .fetchOffers(
                game,
                options
              );

          attempts.push(
            attemptLog(
              strategy.id,
              startedAt,
              {
                ok:
                  true,

                count:
                  Array.isArray(
                    offers
                  )
                    ? offers.length
                    : 0
              }
            )
          );

          lastDiagnostics = {
            multiStrategyVersion:
              MULTI_STRATEGY_VERSION,

            selectedStrategy:
              strategy.id,

            attempts
          };

          return mapOffersWithStrategy(
            offers,
            strategy.id
          );
        } catch (
          error
        ) {
          attempts.push(
            attemptLog(
              strategy.id,
              startedAt,
              {
                ok:
                  false,

                code:
                  error?.code ||
                  'UNKNOWN_ERROR',

                status:
                  error?.status ??
                  null,

                parserReason:
                  error?.parserReason ||
                  null,

                message:
                  error?.message ||
                  null,

                productStateDiagnostics:
                  error
                    ?.productStateDiagnostics ||
                  null,

                providerStateDiagnostics:
                  error
                    ?.providerStateDiagnostics ||
                  null
              }
            )
          );

          strongestError =
            pickStrongerError(
              strongestError,
              error
            );

          /*
           * Jangan lanjut ke universal jika state provider
           * sudah berhasil dibuktikan.
           */
          if (
            isTerminalProviderState(
              error
            )
          ) {
            break;
          }

          if (
            strategy.id ===
              'universal' &&
            shouldAttemptParserRecovery(
              store,
              error
            )
          ) {
            const recoveryStartedAt =
              Date.now();

            try {
              const recoveredOffers =
                await tryParserRecovery(
                  store,
                  game,
                  options,
                  error
                );

              attempts.push(
                attemptLog(
                  'parser-recovery',
                  recoveryStartedAt,
                  {
                    ok:
                      true,

                    count:
                      Array.isArray(
                        recoveredOffers
                      )
                        ? recoveredOffers
                            .length
                        : 0
                  }
                )
              );

              lastDiagnostics = {
                multiStrategyVersion:
                  MULTI_STRATEGY_VERSION,

                selectedStrategy:
                  'parser-recovery',

                attempts
              };

              return mapOffersWithStrategy(
                recoveredOffers,
                'parser-recovery'
              );
            } catch (
              recoveryError
            ) {
              attempts.push(
                attemptLog(
                  'parser-recovery',
                  recoveryStartedAt,
                  {
                    ok:
                      false,

                    code:
                      recoveryError
                        ?.code ||
                      'PARSER_FAILED',

                    status:
                      recoveryError
                        ?.status ??
                      null,

                    parserReason:
                      recoveryError
                        ?.parserReason ||
                      null,

                    message:
                      recoveryError
                        ?.message ||
                      null,

                    recoveryDiagnostics:
                      recoveryError
                        ?.parserRecoveryDiagnostics ||
                      null
                  }
                )
              );

              strongestError =
                pickStrongerError(
                  strongestError,
                  recoveryError
                );

              if (
                isTerminalProviderState(
                  recoveryError
                )
              ) {
                break;
              }
            }
          }

          if (
            shouldStopChain(
              strategy.id,
              error,
              store
            )
          ) {
            break;
          }
        }
      }

      lastDiagnostics = {
        multiStrategyVersion:
          MULTI_STRATEGY_VERSION,

        selectedStrategy:
          null,

        attempts
      };

      const finalError =
        strongestError ||
        new Error(
          'Tidak ada strategi akses toko yang berhasil'
        );

      if (
        !finalError.code
      ) {
        finalError.code =
          'UNKNOWN_ERROR';
      }

      finalError.accessDiagnostics =
        lastDiagnostics;

      throw finalError;
    }
  };
}

module.exports = {
  MULTI_STRATEGY_VERSION,
  TERMINAL_PROVIDER_STATE_CODES,
  ERROR_PRIORITY,

  createMultiStrategyAdapter,
  pickStrongerError,
  shouldStopChain,
  isTerminalProviderState
};
