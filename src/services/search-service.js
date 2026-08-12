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
    String(value)
      .toLowerCase() ===
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
    Number(value);

  const resolved =
    Number.isFinite(parsed)
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
    findLocalGame(query);

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

async function allSettledWithConcurrency(
  items,
  concurrency,
  task
) {
  const results =
    new Array(
      items.length
    );

  let cursor =
    0;

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
        results[
          index
        ] = {
          status:
            'fulfilled',

          value:
            await task(
              items[index],
              index
            )
        };
      } catch (reason) {
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

function resolveHttpStatus(
  error,
  message
) {
  const direct =
    Number(
      error?.status
    );

  if (
    Number.isFinite(direct) &&
    direct > 0
  ) {
    return direct;
  }

  const match =
    String(
      message ||
      ''
    )
      .match(
        /HTTP\s+(\d{3})/i
      );

  return match
    ? Number(
        match[1]
      )
    : null;
}

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

  const httpStatus =
    resolveHttpStatus(
      error,
      message
    );

  /*
   * PENTING:
   *
   * CANDIDATE_BLOCKED dan
   * DISCOVERY_BLOCKED harus diperiksa
   * sebelum generic HTTP 403.
   */

  if (
    code ===
    'CANDIDATE_BLOCKED'
  ) {
    return {
      statusCode:
        'CANDIDATE_BLOCKED',

      detailCode:
        'CANDIDATE_BLOCKED',

      httpStatus:
        httpStatus ||
        403,

      retryable:
        false,

      message:
        'CANDIDATE BLOCKED · Hanya URL tebakan yang ditolak; ini belum membuktikan seluruh toko memblokir akses'
    };
  }

  if (
    code ===
    'DISCOVERY_BLOCKED'
  ) {
    return {
      statusCode:
        'DISCOVERY_BLOCKED',

      detailCode:
        'DISCOVERY_BLOCKED',

      httpStatus:
        httpStatus ||
        403,

      retryable:
        false,

      message:
        'DISCOVERY BLOCKED · Homepage/sumber discovery ditolak, tetapi belum membuktikan halaman produk ikut diblokir'
    };
  }

  if (
    code ===
      'ACCESS_BLOCKED' ||
    [
      401,
      403,
      451
    ]
      .includes(
        httpStatus
      ) ||
    /\bforbidden\b/i.test(
      message
    )
  ) {
    return {
      statusCode:
        'ACCESS_BLOCKED',

      detailCode:
        code ||
        `HTTP_${httpStatus}`,

      httpStatus,

      retryable:
        false,

      message:
        `ACCESS BLOCKED · URL game ber-confidence tinggi mengembalikan HTTP ${httpStatus || 403}`
    };
  }

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

      detailCode:
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

  if (
    code ===
      'NETWORK_DNS_ERROR' ||
    /getaddrinfo|\bdns\b|enotfound|eai_again/i.test(
      message
    )
  ) {
    return {
      statusCode:
        'NETWORK_ERROR',

      detailCode:
        'NETWORK_DNS_ERROR',

      httpStatus,

      retryable:
        true,

      message:
        'NETWORK ERROR · DNS/domain toko tidak dapat di-resolve dari server aplikasi'
    };
  }

  if (
    code ===
      'NETWORK_TLS_ERROR' ||
    /certificate|\btls\b|\bssl\b/i.test(
      message
    )
  ) {
    return {
      statusCode:
        'NETWORK_ERROR',

      detailCode:
        'NETWORK_TLS_ERROR',

      httpStatus,

      retryable:
        false,

      message:
        'NETWORK ERROR · Koneksi TLS/sertifikat gagal dari server aplikasi'
    };
  }

  if (
    code ===
      'NETWORK_CONNECTION_ERROR' ||
    /econnreset|econnrefused|connection reset|socket/i.test(
      message
    )
  ) {
    return {
      statusCode:
        'NETWORK_ERROR',

      detailCode:
        'NETWORK_CONNECTION_ERROR',

      httpStatus,

      retryable:
        true,

      message:
        'NETWORK ERROR · Koneksi ke server toko terputus atau ditolak saat request server-side'
    };
  }

  if (
    code ===
      'NETWORK_CONNECT_TIMEOUT' ||
    /connect timeout|etimedout|und_err_connect_timeout/i.test(
      message
    )
  ) {
    return {
      statusCode:
        'NETWORK_ERROR',

      detailCode:
        'NETWORK_CONNECT_TIMEOUT',

      httpStatus,

      retryable:
        true,

      message:
        'NETWORK ERROR · Koneksi ke server toko melewati batas waktu'
    };
  }

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

      detailCode:
        'TIMEOUT',

      httpStatus,

      retryable:
        true,

      message:
        'TIMEOUT · Server toko tidak merespons dalam batas waktu'
    };
  }

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

      detailCode:
        'PAGE_NOT_VERIFIED',

      httpStatus,

      retryable:
        false,

      message:
        'GAME PAGE NOT VERIFIED · Candidate ditemukan, tetapi halaman belum cukup membuktikan game target'
    };
  }

  if (
    code ===
      'PARSER_FAILED' ||
    /harga\/produk|harga tidak ditemukan|feed tidak mengembalikan produk|struktur halaman belum didukung|konten produk kemungkinan dimuat|produk berhasil dibaca/i.test(
      message
    )
  ) {
    const detailCode =
      String(
        error?.parserReason ||
        'UNSUPPORTED_STRUCTURE'
      )
        .toUpperCase();

    const detailMessages = {
      JS_RENDERED_CONTENT:
        'Konten produk kemungkinan dimuat melalui JavaScript/API setelah halaman dibuka',

      PRODUCT_FOUND_NO_PRICE:
        'Nama produk ditemukan, tetapi harga tidak tersedia pada HTML server',

      PRICE_FOUND_NO_PRODUCT:
        'Harga ditemukan, tetapi nama produk belum dapat dikenali',

      JSON_DATA_FOUND_NO_MATCH:
        'Data JSON ditemukan, tetapi struktur produk/harganya belum dikenali',

      HTML_NO_PRODUCT:
        'Tidak ada kandidat produk yang dikenali pada HTML server',

      PRODUCTS_REJECTED_BY_GAME_VALIDATION:
        'Produk berhasil dibaca, tetapi tidak lolos validasi game target',

      PARTIAL_MATCH_ONLY:
        'Sebagian data berhasil dibaca, tetapi belum menghasilkan offer yang dapat digunakan',

      UNSUPPORTED_STRUCTURE:
        'Struktur halaman belum didukung parser saat ini'
    };

    return {
      statusCode:
        'PARSER_FAILED',

      detailCode,

      httpStatus,

      retryable:
        false,

      message:
        `PARSER FAILED · ${
          detailMessages[
            detailCode
          ] ||
          detailMessages
            .UNSUPPORTED_STRUCTURE
        }`
    };
  }

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

      detailCode:
        'NOT_CONFIGURED',

      httpStatus,

      retryable:
        false,

      message:
        'NOT CONFIGURED · Belum ada URL atau metode integrasi untuk game ini'
    };
  }

  if (
    code ===
      'PAGE_NOT_FOUND' ||
    [
      404,
      410
    ]
      .includes(
        httpStatus
      )
  ) {
    return {
      statusCode:
        'PAGE_NOT_FOUND',

      detailCode:
        'PAGE_NOT_FOUND',

      httpStatus,

      retryable:
        false,

      message:
        `PAGE NOT FOUND · Candidate URL yang dicoba mengembalikan HTTP ${httpStatus || 404}`
    };
  }

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

      detailCode:
        code ||
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

  if (
    code ===
      'NETWORK_FETCH_FAILED' ||
    /fetch failed|network/i.test(
      message
    )
  ) {
    return {
      statusCode:
        'NETWORK_ERROR',

      detailCode:
        'NETWORK_FETCH_FAILED',

      httpStatus,

      retryable:
        true,

      message:
        'NETWORK ERROR · Request server-side ke toko gagal setelah retry yang diizinkan'
    };
  }

  return {
    statusCode:
      'UNKNOWN_ERROR',

    detailCode:
      code ||
      'UNKNOWN_ERROR',

    httpStatus,

    retryable:
      false,

    message:
      `ERROR · ${message}`
  };
}

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

async function searchPrices(
  query,
  options = {}
) {
  const startedAt =
    Date.now();

  const timeoutMs =
    boundedNumber(
      process.env
        .STORE_TIMEOUT_MS,

      4200,

      1500,

      10000
    );

  /*
   * Diturunkan dari 3 menjadi 2
   * untuk mengurangi burst request.
   */
  const storeConcurrency =
    boundedNumber(
      process.env
        .STORE_CONCURRENCY,

      2,

      1,

      6
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

  if (!game) {
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
          adapters[index];

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

        if (
          result.status ===
          'fulfilled'
        ) {
          liveOffers.push(
            ...result
              .value
              .offers
          );

          return {
            ...common,

            ok:
              true,

            mode:
              'live',

            statusCode:
              'LIVE',

            detailCode:
              'LIVE',

            httpStatus:
              200,

            retryable:
              false,

            count:
              result
                .value
                .offers
                .length,

            message:
              `${result.value.offers.length} harga live ditemukan`
          };
        }

        return {
          ...common,

          ok:
            false,

          mode:
            'error',

          count:
            0,

          ...classifyProviderFailure(
            result.reason
          )
        };
      }
    );

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

  const groups =
    groupOffers(
      offers
    );

  const nextOffset =
    storeIds.length
      ? null
      : offset +
        adapters.length;

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

    cheapestOverall:
      groups[0] ||
      null,

    providerStatus,

    providerSummary:
      summarizeProviders(
        providerStatus
      ),

    groups,

    notice:
      'Harga diambil real-time. Direct/discovered/sitemap URL diprioritaskan, guessed URL dibatasi, dan 403 dari URL tebakan tidak lagi dianggap otomatis sebagai ACCESS BLOCKED.'
  };
}

module.exports = {
  searchPrices,
  resolveGame,
  classifyProviderFailure,
  allSettledWithConcurrency
};
