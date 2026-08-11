'use strict';

const {
  fetchText
} = require(
  '../services/http'
);

const {
  htmlToLines,
  sliceLines,
  isProductName,
  extractOffersFromLines,
  extractJsonScriptOffers,
  dedupeOffers
} = require(
  '../utils/html'
);

const {
  extractStructuredOffers,
  detectDynamicPageSignals
} = require(
  '../utils/structured-data'
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

function buildParserDiagnostics({
  html,
  allLines,
  parsedLines,
  lineOffers,
  jsonOffers,
  structured
}) {
  const visibleProductCandidates =
    parsedLines.filter(
      (line) =>
        isProductName(
          line
        )
    ).length;

  const visiblePriceCandidates =
    parsedLines.filter(
      (line) =>
        /(?:\bIDR\b|\bRp\.?)/i.test(
          line
        )
    ).length;

  const dynamic =
    structured
      ?.diagnostics
      ?.dynamic ||
    detectDynamicPageSignals(
      html
    );

  let parserReason =
    'UNSUPPORTED_STRUCTURE';

  if (
    lineOffers.length ||
    jsonOffers.length ||
    structured
      ?.offers
      ?.length
  ) {
    parserReason =
      'PARTIAL_MATCH_ONLY';
  } else if (
    dynamic.likelyDynamic
  ) {
    parserReason =
      'JS_RENDERED_CONTENT';
  } else if (
    visibleProductCandidates >
      0 &&
    visiblePriceCandidates ===
      0
  ) {
    parserReason =
      'PRODUCT_FOUND_NO_PRICE';
  } else if (
    visibleProductCandidates ===
      0 &&
    visiblePriceCandidates >
      0
  ) {
    parserReason =
      'PRICE_FOUND_NO_PRODUCT';
  } else if (
    (
      structured
        ?.diagnostics
        ?.documentCount ||
      0
    ) >
    0
  ) {
    parserReason =
      'JSON_DATA_FOUND_NO_MATCH';
  } else if (
    visibleProductCandidates ===
    0
  ) {
    parserReason =
      'HTML_NO_PRODUCT';
  }

  return {
    parserReason,

    pageLineCount:
      allLines.length,

    parsedLineCount:
      parsedLines.length,

    visibleProductCandidates,
    visiblePriceCandidates,

    lineOfferCount:
      lineOffers.length,

    legacyJsonOfferCount:
      jsonOffers.length,

    structuredOfferCount:
      structured
        ?.offers
        ?.length ||
      0,

    structured:
      structured
        ?.diagnostics ||
      null,

    dynamic
  };
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
    game
      ?.stores
      ?.[
        storeId
      ];

  if (!purchaseUrl) {
    throw providerError(
      'NOT_CONFIGURED',
      'URL toko belum dikonfigurasi'
    );
  }

  const {
    text:
      html,

    finalUrl,

    contentType
  } =
    await fetchText(
      purchaseUrl,
      {
        timeoutMs
      }
    );

  const resolvedUrl =
    finalUrl ||
    purchaseUrl;

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

  const context = {
    purchaseUrl:
      resolvedUrl,

    storeId,
    storeName,

    gameId:
      game.id,

    source:
      'live'
  };

  /*
   * ======================================================
   * LAYER 1
   * HTML visible text parser
   * ======================================================
   */

  const lineOffers =
    extractOffersFromLines(
      lines,
      {
        ...context,
        maxDistance
      }
    );

  /*
   * ======================================================
   * LAYER 2
   * Legacy JSON object parser
   * ======================================================
   */

  const jsonOffers =
    extractJsonScriptOffers(
      html,
      context
    );

  /*
   * ======================================================
   * LAYER 3
   * Structured / embedded state parser
   *
   * Mendukung:
   *
   * JSON-LD
   * application/json
   * __NEXT_DATA__
   * __NUXT__
   * __INITIAL_STATE__
   * __PRELOADED_STATE__
   * __APOLLO_STATE__
   * ======================================================
   */

  const structured =
    extractStructuredOffers(
      html,
      context
    );

  const offers =
    dedupeOffers([
      ...lineOffers,
      ...jsonOffers,
      ...structured.offers
    ]);

  if (
    offers.length
  ) {
    return offers;
  }

  const diagnostics =
    buildParserDiagnostics({
      html,
      allLines,

      parsedLines:
        lines,

      lineOffers,
      jsonOffers,
      structured
    });

  const reasonMessages = {
    JS_RENDERED_CONTENT:
      'Konten produk kemungkinan dimuat melalui JavaScript/API setelah halaman dibuka',

    PRODUCT_FOUND_NO_PRICE:
      'Nama produk ditemukan, tetapi harga tidak ditemukan pada HTML server',

    PRICE_FOUND_NO_PRODUCT:
      'Harga ditemukan, tetapi nama produk tidak dapat dikenali',

    JSON_DATA_FOUND_NO_MATCH:
      'Data JSON ditemukan, tetapi struktur produk/harganya belum dikenali',

    HTML_NO_PRODUCT:
      'Tidak ada kandidat produk yang dapat dikenali pada HTML server',

    UNSUPPORTED_STRUCTURE:
      'Struktur halaman belum didukung parser saat ini'
  };

  throw providerError(
    'PARSER_FAILED',

    reasonMessages[
      diagnostics
        .parserReason
    ] ||
    reasonMessages
      .UNSUPPORTED_STRUCTURE,

    {
      parserReason:
        diagnostics
          .parserReason,

      parserDiagnostics:
        diagnostics,

      finalUrl:
        resolvedUrl,

      contentType
    }
  );
}

module.exports = {
  fetchPageOffers,
  providerError,
  buildParserDiagnostics
};
