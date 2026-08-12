'use strict';

const {
  shouldAttemptParserRecovery,
  tryParserRecovery
} = require(
  './parser-recovery'
);

/*
 * Marker untuk memastikan runtime menggunakan
 * multi-strategy terbaru.
 */
const MULTI_STRATEGY_VERSION =
  '2026-08-12-multi-v2';

/*
 * ============================================================
 * ERROR PRIORITY
 * ============================================================
 *
 * ACCESS_BLOCKED / RATE_LIMITED harus lebih kuat
 * daripada PARSER_FAILED.
 *
 * Kalau dedicated benar-benar menerima 403,
 * jangan menutupinya dengan PARSER_FAILED lama.
 */
const ERROR_PRIORITY = {
  RATE_LIMITED: 120,
  ACCESS_BLOCKED: 115,

  PARSER_FAILED: 100,
  PAGE_NOT_VERIFIED: 95,

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
   * Rate limit:
   * jangan tambah request lagi.
   */
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

  /*
   * Public API dapat mempunyai policy sendiri.
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
   *
   * Default hentikan request ke origin yang sama.
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
 * SEAGM IDR VALIDATION
 * ============================================================
 *
 * Mencegah numeric foreign currency seperti:
 *
 * 0.99
 * 1
 * 99
 *
 * berubah menjadi Rp1 / Rp99.
 */
function hasExplicitIdrEvidence(
  offer
) {
  const priceText =
    String(
      offer?.priceText ||
      ''
    );

  return (
    /(?:\bIDR\b|\bRp\s*\.?)/i
      .test(
        priceText
      )
  );
}

function shouldKeepOffer(
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

  const price =
    Number(
      offer.finalPrice ??
      offer.productPrice
    );

  if (
    !Number.isFinite(
      price
    ) ||
    price <=
      0
  ) {
    return false;
  }

  /*
   * Rule ini hanya berlaku pada SEAGM recovery.
   *
   * Store lain tidak terkena.
   */
  if (
    store?.id ===
      'seagm' &&
    strategyId ===
      'parser-recovery'
  ) {
    if (
      !hasExplicitIdrEvidence(
        offer
      )
    ) {
      return false;
    }

    /*
     * Harga di bawah Rp100 tidak realistis
     * untuk hasil recovery SEAGM dan biasanya
     * merupakan foreign-currency decimal.
     */
    if (
      price <
      100
    ) {
      return false;
    }
  }

  return true;
}

/*
 * ============================================================
 * LIVE / DEMO NORMALIZATION
 * ============================================================
 *
 * Hasil dedicated / universal / recovery adalah data
 * yang benar-benar di-fetch dari toko.
 *
 * Hanya fallback/demo source yang tetap dianggap Demo.
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

  const sourceKey =
    originalSource
      .toLowerCase();

  const isDemo =
    sourceKey ===
      'fallback' ||
    sourceKey ===
      'demo';

  return {
    ...offer,

    /*
     * Simpan sumber parser asli untuk debugging.
     */
    extractionSource:
      offer?.extractionSource ||
      originalSource ||
      strategyId,

    /*
     * Frontend saat ini menggunakan source === live.
     */
    source:
      isDemo
        ? 'fallback'
        : 'live',

    accessStrategy:
      offer?.accessStrategy ||
      strategyId,

    multiStrategyVersion:
      MULTI_STRATEGY_VERSION
  };
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
        shouldKeepOffer(
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

function createNoValidOffersError(
  store,
  strategyId,
  rawOffers
) {
  const error =
    new Error(
      store?.id ===
        'seagm' &&
      strategyId ===
        'parser-recovery'
        ? 'SEAGM recovery tidak mempunyai harga IDR yang tervalidasi'
        : 'Strategy tidak mengembalikan offer valid'
    );

  error.code =
    'PARSER_FAILED';

  error.parserReason =
    store?.id ===
      'seagm' &&
    strategyId ===
      'parser-recovery'
      ? 'CURRENCY_NOT_CONFIRMED_IDR'
      : 'NO_VALID_OFFERS';

  error
    .offerValidationDiagnostics = {
      multiStrategyVersion:
        MULTI_STRATEGY_VERSION,

      storeId:
        store?.id ||
        null,

      strategy:
        strategyId,

      rawCount:
        Array.isArray(
          rawOffers
        )
          ? rawOffers.length
          : 0
    };

  return error;
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
          const rawOffers =
            await strategy
              .adapter
              .fetchOffers(
                game,
                options
              );

          const offers =
            mapOffersWithStrategy(
              rawOffers,
              strategy.id,
              store
            );

          /*
           * Kalau adapter selesai tanpa exception tetapi
           * ternyata tidak mempunyai offer valid, anggap gagal
           * dan lanjutkan ke strategy berikutnya.
           */
          if (
            !offers.length
          ) {
            throw createNoValidOffersError(
              store,
              strategy.id,
              rawOffers
            );
          }

          attempts.push(
            attemptLog(
              strategy.id,
              startedAt,
              {
                ok:
                  true,

                rawCount:
                  Array.isArray(
                    rawOffers
                  )
                    ? rawOffers.length
                    : 0,

                count:
                  offers.length
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

          return offers;
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

                /*
                 * Dedicated parser diagnostics akan terlihat
                 * di sini jika dedicated adapter sudah benar-
                 * benar berjalan.
                 */
                dedicatedDiagnostics:
                  error
                    ?.dedicatedDiagnostics ||
                  null,

                offerValidationDiagnostics:
                  error
                    ?.offerValidationDiagnostics ||
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
           * Recovery tetap berjalan setelah universal gagal.
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
              const rawRecoveredOffers =
                await tryParserRecovery(
                  store,
                  game,
                  options,
                  error
                );

              const recoveredOffers =
                mapOffersWithStrategy(
                  rawRecoveredOffers,
                  'parser-recovery',
                  store
                );

              /*
               * Penting untuk SEAGM:
               * invalid foreign-currency price tidak boleh
               * dianggap sukses.
               */
              if (
                !recoveredOffers
                  .length
              ) {
                throw createNoValidOffersError(
                  store,
                  'parser-recovery',
                  rawRecoveredOffers
                );
              }

              attempts.push(
                attemptLog(
                  'parser-recovery',
                  recoveryStartedAt,
                  {
                    ok:
                      true,

                    rawCount:
                      Array.isArray(
                        rawRecoveredOffers
                      )
                        ? rawRecoveredOffers
                            .length
                        : 0,

                    count:
                      recoveredOffers
                        .length
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

              return recoveredOffers;
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

                    offerValidationDiagnostics:
                      recoveryError
                        ?.offerValidationDiagnostics ||
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
