'use strict';

const {
  fetchText
} = require(
  '../services/http'
);

const {
  htmlToLines,
  sliceLines,
  extractOffersFromLines,
  extractJsonScriptOffers,
  dedupeOffers
} = require(
  '../utils/html'
);

function providerError(
  code,
  message,
  details = {}
) {
  const error =
    new Error(
      message
    );

  error.code =
    code;

  Object.assign(
    error,
    details
  );

  return error;
}

async function fetchPageOffers({
  game,
  storeId,
  storeName,
  timeoutMs,
  startPatterns,
  endPatterns,
  maxDistance = 8,
  lineTransform
}) {
  const purchaseUrl =
    game?.stores?.[
      storeId
    ];

  /*
   * Ini berbeda dengan parser gagal.
   *
   * Berarti memang belum ada
   * direct URL yang dikonfigurasi.
   */
  if (
    !purchaseUrl
  ) {
    throw providerError(
      'NOT_CONFIGURED',

      'URL toko belum dikonfigurasi'
    );
  }

  /*
   * fetchText dapat menghasilkan:
   *
   * ACCESS_BLOCKED
   * RATE_LIMITED
   * PAGE_NOT_FOUND
   * TIMEOUT
   * NETWORK_ERROR
   *
   * Error tersebut diteruskan apa adanya
   * ke search-service.
   */
  const {
    text:
      html,

    finalUrl,

    contentType
  } = await fetchText(
    purchaseUrl,

    {
      timeoutMs
    }
  );

  const allLines =
    htmlToLines(
      html
    );

  const sliced =
    sliceLines(
      allLines,
      startPatterns,
      endPatterns
    );

  const lines =
    typeof lineTransform ===
    'function'
      ? lineTransform(
          sliced
        )
      : sliced;

  const lineOffers =
    extractOffersFromLines(
      lines,

      {
        maxDistance,

        purchaseUrl:
          finalUrl ||
          purchaseUrl,

        storeId,
        storeName,

        gameId:
          game.id,

        source:
          'live'
      }
    );

  const jsonOffers =
    extractJsonScriptOffers(
      html,

      {
        purchaseUrl:
          finalUrl ||
          purchaseUrl,

        storeId,
        storeName,

        gameId:
          game.id
      }
    );

  const offers =
    dedupeOffers([
      ...lineOffers,
      ...jsonOffers
    ]);

  /*
   * PENTING:
   *
   * HTTP 200 + tidak ada offer
   * BUKAN berarti toko tidak punya
   * produk.
   *
   * Kemungkinan:
   *
   * - HTML berubah
   * - harga dirender melalui JS
   * - produk datang dari API internal
   * - selector/parser belum cocok
   *
   * Karena itu sekarang statusnya
   * PARSER_FAILED.
   */
  if (
    !offers.length
  ) {
    throw providerError(
      'PARSER_FAILED',

      'Halaman berhasil dibuka, tetapi harga/produk tidak terbaca dari HTML server',

      {
        finalUrl:
          finalUrl ||
          purchaseUrl,

        contentType,

        pageLineCount:
          allLines.length
      }
    );
  }

  return offers;
}

module.exports = {
  fetchPageOffers
};
