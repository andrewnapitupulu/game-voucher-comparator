'use strict';

const {
  shouldAttemptParserRecovery,
  tryParserRecovery
} = require(
  './parser-recovery'
);

const MULTI_STRATEGY_VERSION =
  '2026-08-12-multi-v3';

/*
 * ============================================================
 * ERROR PRIORITY
 * ============================================================
 *
 * Priority ini sengaja mengikuti flow yang sebelumnya
 * membuat SEAGM berhasil.
 *
 * Jangan menaikkan ACCESS_BLOCKED di atas PARSER_FAILED
 * pada patch ini karena perubahan tersebut sempat membuat
 * behaviour provider berubah.
 */
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

function errorPriority(
  error
) {
  return (
    ERROR_PRIORITY[
      String(
        error?.code ||
        ''
      )
        .toUpperCase()
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
    String(
      error?.code ||
      ''
    )
      .toUpperCase();

  /*
   * RATE LIMIT
   */
  if (
    code ===
    'RATE_LIMITED'
  ) {
    return true;
  }

  /*
   * Error selain ACCESS_BLOCKED
   * masih boleh lanjut.
   */
  if (
    code !==
    'ACCESS_BLOCKED'
  ) {
    return false;
  }

  /*
   * Public API boleh mempunyai policy sendiri.
   */
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

  /*
   * Dedicated adapter diblokir.
   */
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

/*
 * ============================================================
 * SOURCE NORMALIZATION
 * ============================================================
 *
 * Hasil:
 *
 * recovery-visible
 * recovery-serialized
 * recovery-catalog
 * dedicated-visible
 * dedicated-serialized
 *
 * semuanya berasal dari fetch toko sebenarnya.
 *
 * Frontend VoucherLens saat ini menganggap hanya
 * source === "live" sebagai Live.
 *
 * Karena itu sumber asli disimpan ke extractionSource,
 * sedangkan source dinormalisasi menjadi live.
 */
function normalizeOfferSource(
  offer,
  strategyId
) {
  const originalSource =
    String(
      offer?.source ||
      ''
    )
      .trim();

  const normalizedSource =
    originalSource
      .toLowerCase();

  const isDemoSource =
    normalizedSource ===
      'fallback' ||
    normalizedSource ===
      'demo';

  return {
    ...offer,

    source:
      isDemoSource
        ? 'fallback'
        : 'live',

    extractionSource:
      offer?.extractionSource ||
      originalSource ||
      strategyId,

    accessStrategy:
      offer?.accessStrategy ||
      strategyId,

    multiStrategyVersion:
      MULTI_STRATEGY_VERSION
  };
}

/*
 * ============================================================
 * OFFER VALIDATION
 * ============================================================
 *
 * Khusus SEAGM parser recovery:
 *
 * jangan tampilkan harga asing seperti:
 *
 * NZ$ 0.99
 * NZ$ 1.45
 *
 * sebagai:
 *
 * Rp1
 * Rp99
 *
 * Tetapi IMPORTANT:
 *
 * offer invalid hanya difilter dari hasil,
 * TIDAK menyebabkan strategy berubah menjadi
 * PARSER_FAILED.
 *
 * Inilah perbedaan penting dari patch sebelumnya.
 */
function isUsableOffer(
  offer,
  strategyId,
  store
) {
  if (
    !offer ||
    typeof offer !==
      'object'
  ) {
    return false;
  }

  if (
    store?.id ===
      'seagm' &&
    strategyId ===
      'parser-recovery'
  ) {
    const priceText =
      String(
        offer?.priceText ||
        ''
      );

    const price =
      Number(
        offer.finalPrice ??
        offer.productPrice
      );

    /*
     * Recovery SEAGM hanya ditampilkan jika ada
     * bukti eksplisit currency Rupiah.
     */
    if (
      !/(?:\bIDR\b|\bRp\s*\.?)/i
        .test(
          priceText
        )
    ) {
      return false;
    }

    /*
     * Hindari bogus Rp1 / Rp99.
     */
    if (
      !Number.isFinite(
        price
      ) ||
      price <
        100
    ) {
      return false;
    }
  }

  return true;
}

function mapOffersWithStrategy(
  offers,
  strategyId,
  store
) {
  if (
    !Array.isArray(
      offers
    )
  ) {
    return [];
  }

  return offers
    .filter(
      (offer) =>
        isUsableOffer(
          offer,
          strategyId,
          store
        )
    )
    .map(
      (offer) =>
        normalizeOfferSource(
          offer,
          strategyId
        )
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
        const strategy
        of strategies
      ) {
        const startedAt =
          Date.now();

        try {
          /*
           * ==================================================
           * NORMAL STRATEGY
           * ==================================================
           */
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

          /*
           * Penting:
           *
           * hasil filter boleh menjadi [].
           *
           * Jangan throw PARSER_FAILED di sini,
           * supaya SEAGM tidak regression lagi.
           */
          return mapOffersWithStrategy(
            offers,
            strategy.id,
            store
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
                  error
                    ?.parserReason ||
                  null,

                message:
                  error
                    ?.message ||
                  null,

                dedicatedDiagnostics:
                  error
                    ?.dedicatedDiagnostics ||
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
           */
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

              /*
               * Sama seperti normal strategy:
               *
               * jika seluruh offer SEAGM ternyata bukan IDR,
               * hasil boleh [] tanpa mengubah provider menjadi
               * PARSER_FAILED.
               */
              return mapOffersWithStrategy(
                recoveredOffers,
                'parser-recovery',
                store
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
            }
          }

          /*
           * ==================================================
           * STOP CHAIN
           * ==================================================
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
       * ======================================================
       * ALL STRATEGIES FAILED
       * ======================================================
       */
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

      finalError
        .accessDiagnostics =
        lastDiagnostics;

      throw finalError;
    }
  };
}

module.exports = {
  MULTI_STRATEGY_VERSION,

  createMultiStrategyAdapter,

  pickStrongerError,

  shouldStopChain
};
