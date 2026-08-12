'use strict';

const ERROR_PRIORITY = {
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
      ? candidate
      : current
  );
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
   * Rate limit berarti domain sudah
   * meminta kita memperlambat request.
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
   * Public API dan halaman web dapat
   * mempunyai policy akses berbeda.
   *
   * Jadi 403 dari API masih boleh
   * fallback ke dedicated HTML,
   * kecuali di-config sebaliknya.
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
   * Dedicated page sudah diblokir.
   *
   * Jangan lanjut melakukan beberapa
   * request universal discovery ke
   * origin yang sama.
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
   * Universal merupakan strategi terakhir.
   */
  return true;
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

          attempts.push({
            strategy:
              strategy.id,

            ok:
              true,

            count:
              offers.length,

            durationMs:
              Date.now() -
              startedAt
          });

          lastDiagnostics = {
            selectedStrategy:
              strategy.id,

            attempts
          };

          return offers.map(
            (offer) => ({
              ...offer,

              accessStrategy:
                offer.accessStrategy ||
                strategy.id
            })
          );
        } catch (
          error
        ) {
          attempts.push({
            strategy:
              strategy.id,

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

            durationMs:
              Date.now() -
              startedAt
          });

          strongestError =
            pickStrongerError(
              strongestError,
              error
            );

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
  createMultiStrategyAdapter,
  pickStrongerError,
  shouldStopChain
};
