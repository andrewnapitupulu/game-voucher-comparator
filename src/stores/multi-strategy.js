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
      String(error?.code || '').toUpperCase()
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
   * RATE_LIMITED:
   * jangan lanjut melakukan request tambahan.
   */
  if (code === 'RATE_LIMITED') {
    return true;
  }

  /*
   * Error selain ACCESS_BLOCKED
   * masih boleh melanjutkan strategy chain.
   */
  if (code !== 'ACCESS_BLOCKED') {
    return false;
  }

  /*
   * Public API terkadang punya policy akses
   * yang berbeda dengan halaman website.
   */
  if (strategyId === 'public-api') {
    return Boolean(
      store?.publicApi?.blockStopsChain
    );
  }

  /*
   * Dedicated adapter diblokir.
   *
   * Secara default hentikan request berikutnya
   * untuk mencegah bombardir origin yang sama.
   *
   * Bisa dioverride melalui:
   *
   * continueAfterBlocked: true
   */
  if (strategyId === 'dedicated') {
    return (
      store?.continueAfterBlocked !== true
    );
  }

  /*
   * Universal merupakan strategy terakhir.
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
        const startedAt =
          Date.now();

        try {
          /*
           * ==================================================
           * NORMAL STRATEGY
           * ==================================================
           *
           * Urutan strategy tetap mengikuti konfigurasi
           * adapter yang sudah ada:
           *
           * public-api
           * dedicated
           * universal
           */
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

                count:
                  Array.isArray(offers)
                    ? offers.length
                    : 0
              }
            )
          );

          /*
           * Strategy dianggap sukses jika adapter
           * mengembalikan offers tanpa exception.
           */
          lastDiagnostics = {
            selectedStrategy:
              strategy.id,

            attempts
          };

          return mapOffersWithStrategy(
            offers,
            strategy.id
          );
        } catch (error) {
          /*
           * Simpan diagnostics dari strategy
           * yang baru saja gagal.
           */
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
                  error?.status ??
                  null,

                parserReason:
                  error?.parserReason ||
                  null,

                message:
                  error?.message ||
                  null
              }
            )
          );

          /*
           * Simpan error paling relevan
           * untuk dikembalikan jika semua
           * strategy gagal.
           */
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
           * Recovery hanya dijalankan ketika:
           *
           * 1. Strategy yang gagal adalah universal
           * 2. Store mempunyai recovery configuration
           * 3. Error termasuk recoverable error
           *
           * Recoverable error:
           *
           * PARSER_FAILED
           * PAGE_NOT_VERIFIED
           * PAGE_NOT_FOUND
           *
           * ACCESS_BLOCKED dan RATE_LIMITED
           * TIDAK dipaksa masuk recovery.
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
              /*
               * Parser recovery akan mencoba:
               *
               * - alternative route
               * - locale-specific route
               * - catalog/discovery page
               * - discovered product URL
               *
               * lalu tetap menggunakan parseOffers()
               * milik universal parser.
               */
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
                      Array.isArray(
                        recoveredOffers
                      )
                        ? recoveredOffers.length
                        : 0
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
              /*
               * Recovery juga gagal.
               *
               * Simpan semua diagnostics-nya,
               * termasuk URL candidate yang
               * sudah dicoba.
               */
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
            }
          }

          /*
           * ==================================================
           * STOP CHAIN CHECK
           * ==================================================
           *
           * Hentikan request tambahan jika:
           *
           * RATE_LIMITED
           *
           * atau
           *
           * ACCESS_BLOCKED berdasarkan
           * policy store.
           */
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

      /*
       * ==================================================
       * ALL STRATEGIES FAILED
       * ==================================================
       */
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

      /*
       * Diagnostics ini nantinya bisa digunakan
       * di API response / console / debug UI.
       */
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
