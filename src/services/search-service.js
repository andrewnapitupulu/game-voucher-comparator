'use strict';

const {
  findLocalGame,
  GAME_BY_ID
} = require(
  '../config/games'
);

const {
  STORE_BY_ID
} = require(
  '../config/stores'
);

const {
  resolveGameWithAi
} = require(
  './ai-game-resolver'
);

const {
  groupOffers
} = require(
  './normalizer'
);

const {
  makeFallbackOffers
} = require(
  '../data/fallback-offers'
);

const {
  getStoreAdapters,
  getStoreAdapterCount
} = require(
  '../stores'
);

function envBoolean(
  name,
  fallback
) {
  const value =
    process.env[
      name
    ];

  if (
    value ===
    undefined
  ) {
    return fallback;
  }

  return (
    String(
      value
    ).toLowerCase() ===
    'true'
  );
}

function boundedNumber(
  value,
  fallback,
  min,
  max
) {
  const parsed =
    Number(
      value
    );

  const resolved =
    Number.isFinite(
      parsed
    )
      ? parsed
      : fallback;

  return Math.max(
    min,

    Math.min(
      max,
      resolved
    )
  );
}

/*
 * ======================================================
 * GAME RESOLVER
 * ======================================================
 */

async function resolveGame(
  query
) {
  const exactById =
    GAME_BY_ID[
      String(
        query ||
        ''
      )
        .toLowerCase()
    ];

  if (
    exactById
  ) {
    return {
      game:
        exactById,

      resolver:
        'id'
    };
  }

  const local =
    findLocalGame(
      query
    );

  if (
    local
  ) {
    return {
      game:
        local,

      resolver:
        'local'
    };
  }

  const ai =
    await resolveGameWithAi(
      query
    );

  if (
    ai
  ) {
    return {
      game:
        ai,

      resolver:
        'ai'
    };
  }

  return {
    game:
      null,

    resolver:
      'none'
  };
}

/*
 * ======================================================
 * CONCURRENCY CONTROL
 * ======================================================
 *
 * Sebelumnya semua toko dalam satu
 * batch menggunakan Promise.allSettled.
 *
 * Misalnya:
 *
 * 8 toko
 * × beberapa request per adapter
 * × beberapa batch frontend
 *
 * dapat menghasilkan burst request
 * yang cukup besar.
 *
 * Sekarang request per API invocation
 * dibatasi concurrency-nya.
 */

async function allSettledWithConcurrency(
  items,
  concurrency,
  task
) {
  const results =
    new Array(
      items.length
    );

  let cursor = 0;

  async function worker() {
    while (
      true
    ) {
      const index =
        cursor;

      cursor +=
        1;

      if (
        index >=
        items.length
      ) {
        return;
      }

      try {
        const value =
          await task(
            items[
              index
            ],
            index
          );

        results[
          index
        ] = {
          status:
            'fulfilled',

          value
        };
      } catch (
        reason
      ) {
        results[
          index
        ] = {
          status:
            'rejected',

          reason
        };
      }
    }
  }

  const workerCount =
    Math.min(
      Math.max(
        1,
        concurrency
      ),

      Math.max(
        1,
        items.length
      )
    );

  await Promise.all(
    Array.from(
      {
        length:
          workerCount
      },

      () =>
        worker()
    )
  );

  return results;
}

/*
 * ======================================================
 * PROVIDER ERROR CLASSIFICATION
 * ======================================================
 */

function classifyProviderFailure(
  error
) {
  const message =
    String(
      error?.message ||
      'Gagal mengambil harga'
    );

  const code =
    String(
      error?.code ||
      ''
    )
      .toUpperCase();

  /*
   * Untuk compatibility dengan adapter
   * lama yang hanya menghasilkan
   * string "HTTP 403".
   */
  const statusMatch =
    message.match(
      /HTTP\s+(\d{3})/i
    );

  const httpStatus =
    Number.isFinite(
      Number(
        error?.status
      )
    )
      ? Number(
          error.status
        )
      : (
          statusMatch
            ? Number(
                statusMatch[
                  1
                ]
              )
            : null
        );

  /*
   * ----------------------------------------------------
   * ACCESS BLOCKED
   * ----------------------------------------------------
   */

  if (
    code ===
      'ACCESS_BLOCKED' ||

    httpStatus ===
      401 ||

    httpStatus ===
      403 ||

    httpStatus ===
      451 ||

    /\bforbidden\b/i.test(
      message
    )
  ) {
    return {
      statusCode:
        'ACCESS_BLOCKED',

      httpStatus,

      retryable:
        false,

      message:
        `ACCESS BLOCKED · ${
          httpStatus
            ? `HTTP ${httpStatus} dari server toko`
            : 'server toko menolak request server-side'
        }`
    };
  }

  /*
   * ----------------------------------------------------
   * RATE LIMITED
   * ----------------------------------------------------
   */

  if (
    code ===
      'RATE_LIMITED' ||

    httpStatus ===
      429 ||

    /too many requests|rate.?limit/i.test(
      message
    )
  ) {
    return {
      statusCode:
        'RATE_LIMITED',

      httpStatus:
        httpStatus ||
        429,

      retryable:
        true,

      message:
        'RATE LIMITED · Server toko membatasi frekuensi request'
    };
  }

  /*
   * ----------------------------------------------------
   * TIMEOUT
   * ----------------------------------------------------
   */

  if (
    code ===
      'TIMEOUT' ||

    /timeout/i.test(
      message
    )
  ) {
    return {
      statusCode:
        'TIMEOUT',

      httpStatus,

      retryable:
        true,

      message:
        'TIMEOUT · Server toko tidak merespons dalam batas waktu'
    };
  }

  /*
   * ----------------------------------------------------
   * GAME PAGE NOT VERIFIED
   * ----------------------------------------------------
   *
   * PENTING:
   *
   * Ini harus dicek SEBELUM
   * generic "kandidat belum
   * menghasilkan harga".
   *
   * Universal adapter biasanya
   * membungkus error seperti:
   *
   * Kandidat toko belum menghasilkan harga
   * (halaman tidak cocok: ...)
   */

  if (
    code ===
      'PAGE_NOT_VERIFIED' ||

    /halaman tidak cocok|konten halaman tidak cukup membuktikan|homepage\/katalog umum|halaman terdeteksi sebagai/i.test(
      message
    )
  ) {
    return {
      statusCode:
        'PAGE_NOT_VERIFIED',

      httpStatus,

      retryable:
        false,

      message:
        'GAME PAGE NOT VERIFIED · Candidate ditemukan, tetapi halaman belum cukup membuktikan game target'
    };
  }

  /*
   * ----------------------------------------------------
   * PARSER FAILED
   * ----------------------------------------------------
   */

  if (
    code ===
      'PARSER_FAILED' ||

    /halaman game cocok, tetapi harga\/produk|harga tidak ditemukan pada halaman publik|harga\/produk tidak terbaca|feed tidak mengembalikan produk|belum menghasilkan harga/i.test(
      message
    )
  ) {
    return {
      statusCode:
        'PARSER_FAILED',

      httpStatus,

      retryable:
        false,

      message:
        'PARSER FAILED · Halaman ditemukan, tetapi produk/harga belum dapat diekstrak dari respons server'
    };
  }

  /*
   * ----------------------------------------------------
   * NOT CONFIGURED
   * ----------------------------------------------------
   */

  if (
    code ===
      'NOT_CONFIGURED' ||

    /url toko belum dikonfigurasi|url feed belum diatur/i.test(
      message
    )
  ) {
    return {
      statusCode:
        'NOT_CONFIGURED',

      httpStatus,

      retryable:
        false,

      message:
        'NOT CONFIGURED · Belum ada URL atau metode integrasi untuk game ini'
    };
  }

  /*
   * ----------------------------------------------------
   * PAGE NOT FOUND
   * ----------------------------------------------------
   */

  if (
    code ===
      'PAGE_NOT_FOUND' ||

    httpStatus ===
      404 ||

    httpStatus ===
      410
  ) {
    return {
      statusCode:
        'PAGE_NOT_FOUND',

      httpStatus,

      retryable:
        false,

      message:
        `PAGE NOT FOUND · HTTP ${
          httpStatus ||
          404
        } pada candidate URL`
    };
  }

  /*
   * ----------------------------------------------------
   * SERVER TOKO ERROR
   * ----------------------------------------------------
   */

  if (
    code ===
      'UPSTREAM_ERROR' ||

    (
      httpStatus !==
        null &&

      httpStatus >=
        500
    )
  ) {
    return {
      statusCode:
        'UPSTREAM_ERROR',

      httpStatus,

      retryable:
        true,

      message:
        `STORE ERROR · ${
          httpStatus
            ? `HTTP ${httpStatus}`
            : 'server toko sedang bermasalah'
        }`
    };
  }

  /*
   * ----------------------------------------------------
   * NETWORK ERROR
   * ----------------------------------------------------
   */

  if (
    code ===
      'NETWORK_ERROR' ||

    /fetch failed|network|econn|enotfound|getaddrinfo|socket/i.test(
      message
    )
  ) {
    return {
      statusCode:
        'NETWORK_ERROR',

      httpStatus,

      retryable:
        true,

      message:
        'NETWORK ERROR · Server aplikasi gagal menjangkau toko'
    };
  }

  /*
   * ----------------------------------------------------
   * UNKNOWN
   * ----------------------------------------------------
   */

  return {
    statusCode:
      'UNKNOWN_ERROR',

    httpStatus,

    retryable:
      false,

    message:
      `ERROR · ${message}`
  };
}

/*
 * API juga mengirim summary supaya
 * ke depan dashboard/debug panel
 * dapat menampilkan:
 *
 * LIVE: 20
 * ACCESS_BLOCKED: 5
 * PARSER_FAILED: 10
 * dst.
 */

function summarizeProviders(
  providerStatus
) {
  return providerStatus.reduce(
    (
      summary,
      provider
    ) => {
      const key =
        provider.statusCode ||
        (
          provider.ok
            ? 'LIVE'
            : 'UNKNOWN_ERROR'
        );

      summary[
        key
      ] =
        (
          summary[
            key
          ] ||
          0
        ) +
        1;

      return summary;
    },
    {}
  );
}

/*
 * ======================================================
 * SEARCH
 * ======================================================
 */

async function searchPrices(
  query,
  options = {}
) {
  const startedAt =
    Date.now();

  /*
   * Timeout per toko.
   */
  const timeoutMs =
    boundedNumber(
      process.env
        .STORE_TIMEOUT_MS,

      4200,

      1500,

      10000
    );

  /*
   * Default hanya 3 store adapter
   * aktif bersamaan dalam satu
   * invocation.
   *
   * Bisa diubah melalui:
   *
   * STORE_CONCURRENCY=2
   * STORE_CONCURRENCY=3
   * STORE_CONCURRENCY=4
   */
  const storeConcurrency =
    boundedNumber(
      process.env
        .STORE_CONCURRENCY,

      3,

      1,

      8
    );

  const allowFallback =
    envBoolean(
      'ALLOW_DEMO_FALLBACK',

      false
    );

  const offset =
    Math.max(
      0,

      Number(
        options.offset
      ) ||
      0
    );

  const limit =
    Math.max(
      1,

      Math.min(
        20,

        Number(
          options.limit
        ) ||
        8
      )
    );

  const storeIds =
    Array.isArray(
      options.storeIds
    )
      ? options.storeIds
      : [];

  const {
    game,
    resolver
  } =
    await resolveGame(
      query
    );

  if (
    !game
  ) {
    return {
      ok:
        false,

      code:
        'GAME_NOT_FOUND',

      message:
        'Game belum dikenali. Coba gunakan nama game yang tersedia pada autocomplete.'
    };
  }

  const totalStoreCount =
    getStoreAdapterCount();

  const adapters =
    getStoreAdapters({
      offset,
      limit,
      storeIds
    });

  /*
   * Sebelumnya:
   *
   * Promise.allSettled(
   *   adapters.map(...)
   * )
   *
   * Sekarang request dibatasi
   * concurrency-nya.
   */
  const results =
    await allSettledWithConcurrency(
      adapters,

      storeConcurrency,

      async (
        adapter
      ) => ({
        adapter,

        offers:
          await adapter.fetchOffers(
            game,

            {
              timeoutMs
            }
          )
      })
    );

  const liveOffers =
    [];

  const providerStatus =
    results.map(
      (
        result,
        index
      ) => {
        const adapter =
          adapters[
            index
          ];

        const registry =
          STORE_BY_ID[
            adapter.id
          ] ||
          {};

        const common = {
          id:
            adapter.id,

          name:
            adapter.name,

          category:
            adapter.category ||
            registry.category ||
            'partner',

          verification:
            adapter.verification ||
            registry.verification ||
            'feed'
        };

        /*
         * =================================================
         * SUCCESS
         * =================================================
         */

        if (
          result.status ===
          'fulfilled'
        ) {
          liveOffers.push(
            ...result.value.offers
          );

          return {
            ...common,

            ok:
              true,

            mode:
              'live',

            statusCode:
              'LIVE',

            httpStatus:
              200,

            retryable:
              false,

            count:
              result.value.offers.length,

            message:
              `${result.value.offers.length} harga live ditemukan`
          };
        }

        /*
         * =================================================
         * FAILED
         * =================================================
         */

        const failure =
          classifyProviderFailure(
            result.reason
          );

        return {
          ...common,

          ok:
            false,

          mode:
            'error',

          count:
            0,

          ...failure
        };
      }
    );

  /*
   * ======================================================
   * FALLBACK
   * ======================================================
   */

  let offers =
    liveOffers;

  let fallbackUsed =
    false;

  if (
    allowFallback
  ) {
    const fallbackCatalog =
      makeFallbackOffers(
        game
      );

    const selectedStoreIds =
      adapters.length
        ? new Set(
            adapters.map(
              (adapter) =>
                adapter.id
            )
          )
        : new Set(
            fallbackCatalog.map(
              (offer) =>
                offer.storeId
            )
          );

    const successfulStoreIds =
      new Set(
        liveOffers.map(
          (offer) =>
            offer.storeId
        )
      );

    const fallbackForFailedStores =
      fallbackCatalog.filter(
        (offer) =>
          selectedStoreIds.has(
            offer.storeId
          ) &&
          !successfulStoreIds.has(
            offer.storeId
          )
      );

    if (
      fallbackForFailedStores.length
    ) {
      offers = [
        ...liveOffers,
        ...fallbackForFailedStores
      ];

      fallbackUsed =
        true;
    }
  }

  /*
   * ======================================================
   * NORMALIZE
   * ======================================================
   */

  const groups =
    groupOffers(
      offers
    );

  const cheapestOverall =
    groups[
      0
    ] ||
    null;

  const nextOffset =
    storeIds.length
      ? null
      : offset +
        adapters.length;

  /*
   * ======================================================
   * RESPONSE
   * ======================================================
   */

  return {
    ok:
      true,

    query,
    resolver,

    game: {
      id:
        game.id,

      name:
        game.name,

      shortName:
        game.shortName,

      publisher:
        game.publisher,

      icon:
        game.icon
    },

    noDatabase:
      true,

    noCache:
      true,

    fetchedAt:
      new Date()
        .toISOString(),

    durationMs:
      Date.now() -
      startedAt,

    fallbackUsed,

    liveOfferCount:
      liveOffers.length,

    offerCount:
      offers.length,

    packageCount:
      groups.length,

    storeCount:
      new Set(
        offers.map(
          (offer) =>
            offer.storeId
        )
      ).size,

    checkedStoreCount:
      adapters.length,

    totalStoreCount,

    /*
     * Berguna untuk debugging.
     */
    storeConcurrency,

    batch: {
      offset,
      limit,
      nextOffset,

      hasMore:
        nextOffset !==
          null &&
        nextOffset <
          totalStoreCount
    },

    cheapestOverall,

    providerStatus,

    /*
     * Contoh:
     *
     * {
     *   LIVE: 4,
     *   ACCESS_BLOCKED: 2,
     *   PARSER_FAILED: 1,
     *   PAGE_NOT_VERIFIED: 1
     * }
     */
    providerSummary:
      summarizeProviders(
        providerStatus
      ),

    groups,

    notice:
      'Harga diambil real-time per batch tanpa database dan cache. Status toko membedakan akses diblokir, rate limit, timeout, page tidak terverifikasi, dan parser gagal. Biaya admin, promo bersyarat, dan harga checkout dapat berbeda.'
  };
}

module.exports = {
  searchPrices,
  resolveGame,
  classifyProviderFailure,
  allSettledWithConcurrency
};
