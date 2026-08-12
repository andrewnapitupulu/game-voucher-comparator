'use strict';

const {
  shouldAttemptParserRecovery,
  tryParserRecovery
} = require('./parser-recovery');

const ERROR_PRIORITY = {
  PARSER_FAILED: 100,
  PAGE_NOT_VERIFIED: 95,
  ACCESS_BLOCKED: 90,
  RATE_LIMITED: 88,
  NETWORK_TLS_ERROR: 80,
  NETWORK_CONNECTION_ERROR: 78,
  NETWORK_DNS_ERROR: 76,
  NETWORK_CONNECT_TIMEOUT: 74,
  NETWORK_FETCH_FAILED: 72,
  TIMEOUT: 70,
  UPSTREAM_ERROR: 60,
  HTTP_ERROR: 50,
  DISCOVERY_BLOCKED: 40,
  CANDIDATE_BLOCKED: 35,
  PAGE_NOT_FOUND: 20,
  NOT_CONFIGURED: 10
};

function errorPriority(error) {
  return (
    ERROR_PRIORITY[
      String(error?.code || '')
        .toUpperCase()
    ] || 0
  );
}

function pickStrongerError(
  current,
  candidate
) {
  if (!candidate) return current;
  if (!current) return candidate;

  return (
    errorPriority(candidate) >
    errorPriority(current)
  )
    ? candidate
    : current;
}

function shouldStopChain(
  strategyId,
  error,
  store
) {
  const code = String(
    error?.code || ''
  ).toUpperCase();

  /*
   * Jika upstream meminta rate limit,
   * hentikan chain.
   */
  if (code === 'RATE_LIMITED') {
    return true;
  }

  if (code !== 'ACCESS_BLOCKED') {
    return false;
  }

  /*
   * Public API dapat mempunyai policy akses
   * yang berbeda dengan halaman web.
   */
  if (strategyId === 'public-api') {
    return Boolean(
      store?.publicApi?.blockStopsChain
    );
  }

  /*
   * Dedicated adapter diblokir:
   * default jangan bombardir origin yang sama.
   */
  if (strategyId === 'dedicated') {
    return (
      store?.continueAfterBlocked !== true
    );
  }

  /*
   * Universal merupakan strategi terakhir.
   */
  return true;
}

function mapOffersWithStrategy(
  offers,
  strategyId
) {
  return offers.map((offer) => ({
    ...offer,
    accessStrategy:
      offer.accessStrategy ||
      strategyId
  }));
}

function attemptLog(
  strategy,
  startedAt,
  details = {}
) {
  return {
    strategy,
    durationMs:
      Date.now() - startedAt,
    ...details
  };
}

function createMultiStrategyAdapter(
  store,
  strategies
) {
  let lastDiagnostics = null;

  return {
    id: store.id,
    name: store.name,
    category: store.category,
    verification: store.verification,
    strategy: 'multi',

    getLastDiagnostics() {
      return lastDiagnostics;
    },

    async fetchOffers(
      game,
      options = {}
    ) {
      const attempts = [];
      let strongestError = null;

      for (const strategy of strategies) {
        const startedAt = Date.now();

        try {
          const offers =
            await strategy.adapter.fetchOffers(
              game,
              options
            );

          attempts.push(
            attemptLog(
              strategy.id,
              startedAt,
              {
                ok: true,
                count: offers.length
              }
            )
          );

          lastDiagnostics = {
            selectedStrategy: strategy.id,
            attempts
          };

          return mapOffersWithStrategy(
            offers,
            strategy.id
          );
        } catch (error) {
          attempts.push(
            attemptLog(
              strategy.id,
              startedAt,
              {
                ok: false,
                code:
                  error?.code ||
                  'UNKNOWN_ERROR',

                status:
                  error?.status ?? null,

                parserReason:
                  error?.parserReason ||
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
           * ==================================================
           * PARSER RECOVERY
           * ==================================================
           *
           * Universal parser tidak lagi menjadi jalan buntu
           * untuk store yang mempunyai recovery profile.
           *
           * Recovery hanya aktif untuk:
           *
           * PARSER_FAILED
           * PAGE_NOT_VERIFIED
           * PAGE_NOT_FOUND
           *
           * ACCESS_BLOCKED dan RATE_LIMITED tidak dipaksa.
           */
          if (
            strategy.id === 'universal' &&
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
                    ok: true,
                    count:
                      recoveredOffers.length
                  }
                )
              );

              lastDiagnostics = {
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
                    ok: false,

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
        selectedStrategy: null,
        attempts
      };

      const finalError =
        strongestError ||
        new Error(
          'Tidak ada strategi akses toko yang berhasil'
        );

      if (!finalError.code) {
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
  createMultiStrategyAdapter,
  pickStrongerError,
  shouldStopChain
};
