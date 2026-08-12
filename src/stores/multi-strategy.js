'use strict';

const {
  shouldAttemptParserRecovery,
  tryParserRecovery
} = require('./parser-recovery');

/*
 * Error yang benar-benar menunjukkan upstream membatasi
 * akses harus lebih kuat daripada PARSER_FAILED.
 *
 * Sebelumnya PARSER_FAILED = 100 dan ACCESS_BLOCKED = 90,
 * sehingga 403 pada recovery bisa tertutup oleh error parser
 * yang terjadi sebelumnya.
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

function errorPriority(error) {
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
  if (!candidate) {
    return current;
  }

  if (!current) {
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
   * RATE_LIMITED:
   * jangan lanjut melakukan request tambahan.
   */
  if (
    code ===
    'RATE_LIMITED'
  ) {
    return true;
  }

  /*
   * Error selain ACCESS_BLOCKED masih boleh
   * melanjutkan strategy chain.
   */
  if (
    code !==
    'ACCESS_BLOCKED'
  ) {
    return false;
  }

  /*
   * Public API terkadang mempunyai policy akses
   * berbeda dengan halaman website.
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
   * Secara default hentikan request berikutnya untuk
   * mencegah bombardir origin yang sama.
   *
   * Bisa dioverride melalui:
   *
   * continueAfterBlocked: true
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

  /*
   * Universal merupakan strategy terakhir.
   */
  return true;
}

/*
 * ============================================================
 * LIVE / DEMO NORMALIZATION
 * ============================================================
 *
 * Frontend VoucherLens saat ini menganggap:
 *
 * source === 'live'
 *
 * sebagai data live.
 *
 * Dedicated/recovery parser sebelumnya menggunakan source:
 *
 * dedicated-visible
 * recovery-visible
 * recovery-serialized
 * recovery-catalog
 *
 * Akibatnya data yang benar-benar diambil dari toko
 * ditampilkan sebagai Demo.
 *
 * Backend sekarang menormalisasi semua hasil fetch nyata
 * menjadi:
 *
 * source: 'live'
 *
 * dan provenance aslinya tetap disimpan pada:
 *
 * extractionSource
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

  const normalized =
    originalSource
      .toLowerCase();

  const isFallback =
    normalized ===
      'fallback' ||
    normalized ===
      'demo';

  return {
    ...offer,

    extractionSource:
      offer?.extractionSource ||
      originalSource ||
      strategyId,

    source:
      isFallback
        ? 'fallback'
        : 'live',

    accessStrategy:
      offer?.accessStrategy ||
      strategyId
  };
}

/*
 * ============================================================
 * SEAGM CURRENCY GUARD
 * ============================================================
 *
 * SEAGM dapat mengembalikan structured price menggunakan
 * currency berdasarkan region request.
 *
 * Contoh numeric payload:
 *
 * price: 0.99
 * price: 1
 * price: 99
 *
 * tidak boleh langsung dianggap sebagai Rupiah.
 *
 * Untuk hasil parser-recovery SEAGM, harga hanya diterima
 * jika priceText secara eksplisit membawa Rp / IDR.
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

function isValidFetchedOffer(
  offer,
  store,
  strategyId
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
   * Hanya aktif pada SEAGM + parser-recovery.
   *
   * Dedicated/public API/universal store lain
   * tidak terkena rule ini.
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
     * Guard tambahan untuk bogus Rp1/Rp99.
     *
     * Nominal harga < Rp100 pada recovery SEAGM
     * dianggap bukan IDR yang tervalidasi.
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
        isValidFetchedOffer(
          offer,
          store,
          strategyId
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

function invalidOffersError(
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

  error.offerValidationDiagnostics = {
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
           *
           * Urutan mengikuti konfigurasi:
           *
           * public-api
           * dedicated
           * universal
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
           * Jangan menganggap strategy sukses jika hasil
           * sebenarnya kosong setelah validation.
           */
          if (
            !offers.length
          ) {
            throw invalidOffersError(
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
           * Recovery hanya dijalankan ketika:
           *
           * 1. Strategy yang gagal adalah universal
           * 2. Store mempunyai recovery configuration
           * 3. Error termasuk recoverable error
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
               * Sangat penting untuk SEAGM:
               *
               * jika recovery hanya menemukan numeric price
               * tanpa bukti IDR, jangan return Rp1/Rp99.
               */
              if (
                !recoveredOffers
                  .length
              ) {
                throw invalidOffersError(
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
           * STOP CHAIN CHECK
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
  createMultiStrategyAdapter,
  pickStrongerError,
  shouldStopChain
};
