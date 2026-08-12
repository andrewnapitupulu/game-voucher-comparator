'use strict';

const {
  fetchText
} = require(
  '../services/http'
);

const {
  htmlToLines,
  isProductName,
  extractOffersFromLines,
  extractJsonScriptOffers,
  dedupeOffers,
  decodeEntities
} = require(
  '../utils/html'
);

const {
  extractStructuredOffers,
  extractStructuredIdentityText,
  detectDynamicPageSignals
} = require(
  '../utils/structured-data'
);

const {
  extractLinks,
  linkScore,
  makeCandidateUrls,
  discoverSitemapUrls,
  gameIdentityCandidates,
  isStrongIdentity,
  containsPhrase
} = require(
  '../utils/url-discovery'
);

const {
  GAMES,
  normalizeText
} = require(
  '../config/games'
);

/*
 * Error yang membuktikan halaman
 * berhasil ditemukan harus mengalahkan
 * 404 dari URL tebakan.
 *
 * Contoh:
 *
 * candidate 1 → 404
 * candidate 2 → page valid, parser gagal
 *
 * hasil akhir:
 * PARSER_FAILED
 *
 * bukan PAGE_NOT_FOUND.
 */
const ERROR_PRIORITY = {
  PARSER_FAILED:
    100,

  PAGE_NOT_VERIFIED:
    90,

  ACCESS_BLOCKED:
    80,

  RATE_LIMITED:
    75,

  NETWORK_TLS_ERROR:
    70,

  NETWORK_CONNECTION_ERROR:
    68,

  NETWORK_DNS_ERROR:
    66,

  NETWORK_CONNECT_TIMEOUT:
    64,

  NETWORK_FETCH_FAILED:
    62,

  TIMEOUT:
    60,

  UPSTREAM_ERROR:
    50,

  HTTP_ERROR:
    40,

  PAGE_NOT_FOUND:
    10,

  NOT_CONFIGURED:
    5
};

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

function errorPriority(
  error
) {
  const code =
    String(
      error?.code ||
      ''
    )
      .toUpperCase();

  return (
    ERROR_PRIORITY[
      code
    ] ??
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

  const currentPriority =
    errorPriority(
      current
    );

  const candidatePriority =
    errorPriority(
      candidate
    );

  if (
    candidatePriority >
    currentPriority
  ) {
    return candidate;
  }

  if (
    candidatePriority <
    currentPriority
  ) {
    return current;
  }

  const currentStatus =
    Number(
      current?.status
    ) ||
    0;

  const candidateStatus =
    Number(
      candidate?.status
    ) ||
    0;

  if (
    !currentStatus &&
    candidateStatus
  ) {
    return candidate;
  }

  return current;
}

function stripTags(
  value
) {
  return decodeEntities(
    String(
      value ||
      ''
    )
      .replace(
        /<[^>]+>/g,
        ' '
      )
      .replace(
        /\s+/g,
        ' '
      )
      .trim()
  );
}

function uniqueNormalized(
  values
) {
  const seen =
    new Set();

  const result =
    [];

  for (
    const value of
    values
  ) {
    const normalized =
      normalizeText(
        value
      );

    if (
      !normalized ||
      seen.has(
        normalized
      )
    ) {
      continue;
    }

    seen.add(
      normalized
    );

    result.push(
      normalized
    );
  }

  return result;
}

function countPhrase(
  haystack,
  phrase
) {
  const normalizedHaystack =
    ` ${normalizeText(
      haystack
    )} `;

  const normalizedPhrase =
    normalizeText(
      phrase
    );

  if (!normalizedPhrase) {
    return 0;
  }

  const needle =
    ` ${normalizedPhrase} `;

  let count =
    0;

  let cursor =
    0;

  while (
    cursor <
    normalizedHaystack.length
  ) {
    const index =
      normalizedHaystack.indexOf(
        needle,
        cursor
      );

    if (
      index ===
      -1
    ) {
      break;
    }

    count +=
      1;

    cursor =
      index +
      needle.length;
  }

  return count;
}

function extractTagTexts(
  html,
  tagNames
) {
  const result =
    [];

  const tags =
    tagNames.join(
      '|'
    );

  const regex =
    new RegExp(
      `<(?:${tags})\\b[^>]*>([\\s\\S]*?)<\\/(?:${tags})>`,
      'gi'
    );

  for (
    const match of
    String(
      html ||
      ''
    ).matchAll(
      regex
    )
  ) {
    const text =
      stripTags(
        match[1]
      );

    if (text) {
      result.push(
        text
      );
    }
  }

  return result;
}

function extractMetaContent(
  html,
  names
) {
  const result =
    [];

  const wanted =
    new Set(
      names.map(
        (name) =>
          name.toLowerCase()
      )
    );

  const regex =
    /<meta\b([^>]+)>/gi;

  for (
    const match of
    String(
      html ||
      ''
    ).matchAll(
      regex
    )
  ) {
    const attributes =
      match[1];

    const keyMatch =
      attributes.match(
        /(?:name|property)\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i
      );

    const contentMatch =
      attributes.match(
        /content\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i
      );

    const key =
      String(
        keyMatch?.[1] ||
        keyMatch?.[2] ||
        keyMatch?.[3] ||
        ''
      )
        .toLowerCase();

    if (
      !wanted.has(
        key
      )
    ) {
      continue;
    }

    const content =
      decodeEntities(
        contentMatch?.[1] ||
        contentMatch?.[2] ||
        contentMatch?.[3] ||
        ''
      )
        .replace(
          /\s+/g,
          ' '
        )
        .trim();

    if (content) {
      result.push(
        content
      );
    }
  }

  return result;
}

function getPageSignals(
  html
) {
  const titles =
    extractTagTexts(
      html,
      [
        'title'
      ]
    );

  const headings =
    extractTagTexts(
      html,
      [
        'h1',
        'h2'
      ]
    );

  const meta =
    extractMetaContent(
      html,
      [
        'og:title',
        'twitter:title',
        'description',
        'og:description'
      ]
    );

  const structuredText =
    extractStructuredIdentityText(
      html
    );

  const lines =
    htmlToLines(
      html
    );

  return {
    titleText:
      titles.join(
        ' '
      ),

    headingText:
      headings.join(
        ' '
      ),

    metaText:
      meta.join(
        ' '
      ),

    structuredText,

    bodyText:
      lines
        .slice(
          0,
          1200
        )
        .join(
          ' '
        )
  };
}

function homepageLikeUrl(
  urlValue,
  homepage
) {
  try {
    const url =
      new URL(
        urlValue
      );

    const home =
      new URL(
        homepage
      );

    const cleanPath =
      (value) =>
        String(
          value ||
          ''
        )
          .replace(
            /\/+$/,
            ''
          )
          .replace(
            /^\/+/,
            ''
          );

    return (
      url.origin ===
        home.origin &&
      cleanPath(
        url.pathname
      ) ===
        cleanPath(
          home.pathname
        )
    );
  } catch {
    return false;
  }
}

function strongIdentityMatches(
  text,
  game
) {
  return gameIdentityCandidates(
    game
  )
    .filter(
      isStrongIdentity
    )
    .filter(
      (identity) =>
        containsPhrase(
          text,
          identity
        )
    );
}

function shortIdentityMatches(
  text,
  game
) {
  return gameIdentityCandidates(
    game
  )
    .filter(
      (identity) =>
        !isStrongIdentity(
          identity
        )
    )
    .filter(
      (identity) =>
        containsPhrase(
          text,
          identity
        )
    );
}

function pageHasTargetUnitEvidence(
  text,
  game
) {
  const unitAliases =
    uniqueNormalized(
      game?.unitAliases ||
      []
    );

  return unitAliases.some(
    (unit) =>
      containsPhrase(
        text,
        unit
      )
  );
}

function findCompetingStructuredGame(
  text,
  targetGame
) {
  let best =
    null;

  for (
    const otherGame of
    GAMES ||
    []
  ) {
    if (
      !otherGame ||
      otherGame.id ===
        targetGame.id
    ) {
      continue;
    }

    const matches =
      strongIdentityMatches(
        text,
        otherGame
      );

    if (
      !matches.length
    ) {
      continue;
    }

    const longest =
      matches
        .map(
          (match) =>
            match
              .replace(
                /\s+/g,
                ''
              )
              .length
        )
        .sort(
          (
            a,
            b
          ) =>
            b -
            a
        )[
          0
        ];

    if (
      !best ||
      longest >
        best.strength
    ) {
      best = {
        game:
          otherGame,

        strength:
          longest
      };
    }
  }

  return best;
}

function validatePageForGame(
  html,
  finalUrl,
  homepage,
  game
) {
  const signals =
    getPageSignals(
      html
    );

  const urlText =
    normalizeText(
      finalUrl
    );

  const titleMatches =
    strongIdentityMatches(
      signals.titleText,
      game
    );

  const headingMatches =
    strongIdentityMatches(
      signals.headingText,
      game
    );

  const metaMatches =
    strongIdentityMatches(
      signals.metaText,
      game
    );

  const structuredMatches =
    strongIdentityMatches(
      signals.structuredText,
      game
    );

  const urlMatches =
    strongIdentityMatches(
      urlText,
      game
    );

  const shortTitleMatches =
    shortIdentityMatches(
      signals.titleText,
      game
    );

  const shortHeadingMatches =
    shortIdentityMatches(
      signals.headingText,
      game
    );

  const canonicalIdentities =
    gameIdentityCandidates(
      game
    )
      .filter(
        isStrongIdentity
      );

  let bodyOccurrences =
    0;

  for (
    const identity of
    canonicalIdentities
  ) {
    bodyOccurrences =
      Math.max(
        bodyOccurrences,

        countPhrase(
          signals.bodyText,
          identity
        )
      );
  }

  const unitEvidence =
    pageHasTargetUnitEvidence(
      `${signals.headingText} ${signals.metaText} ${signals.structuredText} ${signals.bodyText}`,
      game
    );

  const competingTitle =
    findCompetingStructuredGame(
      `${signals.titleText} ${signals.headingText}`,
      game
    );

  let contentScore =
    0;

  let urlScore =
    0;

  if (
    titleMatches.length
  ) {
    contentScore +=
      120;
  }

  if (
    headingMatches.length
  ) {
    contentScore +=
      110;
  }

  if (
    metaMatches.length
  ) {
    contentScore +=
      75;
  }

  if (
    structuredMatches.length
  ) {
    contentScore +=
      70;
  }

  if (
    shortTitleMatches.length
  ) {
    contentScore +=
      35;
  }

  if (
    shortHeadingMatches.length
  ) {
    contentScore +=
      30;
  }

  if (
    bodyOccurrences >=
    3
  ) {
    contentScore +=
      70;
  } else if (
    bodyOccurrences ===
    2
  ) {
    contentScore +=
      55;
  } else if (
    bodyOccurrences ===
    1
  ) {
    contentScore +=
      25;
  }

  if (
    unitEvidence
  ) {
    contentScore +=
      20;
  }

  if (
    urlMatches.length
  ) {
    urlScore +=
      100;
  }

  /*
   * Page ternyata jelas merupakan
   * game lain.
   */
  if (
    competingTitle &&
    !titleMatches.length &&
    !headingMatches.length &&
    !structuredMatches.length
  ) {
    return {
      ok:
        false,

      score:
        contentScore +
        urlScore,

      reason:
        `halaman terdeteksi sebagai ${competingTitle.game.name}`,

      signals
    };
  }

  /*
   * Soft 404 / redirect ke homepage.
   */
  if (
    homepageLikeUrl(
      finalUrl,
      homepage
    ) &&
    !titleMatches.length &&
    !headingMatches.length &&
    !structuredMatches.length
  ) {
    return {
      ok:
        false,

      score:
        contentScore +
        urlScore,

      reason:
        'URL mengarah kembali ke homepage/katalog umum',

      signals
    };
  }

  const hasStructuredIdentity =
    titleMatches.length >
      0 ||
    headingMatches.length >
      0 ||
    metaMatches.length >
      0 ||
    structuredMatches.length >
      0;

  const hasRepeatedBodyIdentity =
    bodyOccurrences >=
      2 &&
    unitEvidence;

  const ok =
    hasStructuredIdentity ||
    hasRepeatedBodyIdentity;

  return {
    ok,

    score:
      contentScore +
      urlScore,

    reason:
      ok
        ? 'halaman cocok dengan game'
        : 'konten halaman tidak cukup membuktikan game yang dicari',

    signals
  };
}

function containsExplicitGameName(
  text,
  game
) {
  return gameIdentityCandidates(
    game
  )
    .filter(
      isStrongIdentity
    )
    .some(
      (identity) =>
        containsPhrase(
          text,
          identity
        )
    );
}

function containsOtherGameName(
  text,
  targetGame
) {
  for (
    const otherGame of
    GAMES ||
    []
  ) {
    if (
      !otherGame ||
      otherGame.id ===
        targetGame.id
    ) {
      continue;
    }

    if (
      containsExplicitGameName(
        text,
        otherGame
      )
    ) {
      return true;
    }
  }

  return false;
}

function namedPackageMatchesGame(
  name,
  game
) {
  const text =
    normalizeText(
      name
    );

  if (
    /\bwelkin\b|blessing of the welkin moon/.test(
      text
    )
  ) {
    return (
      game.id ===
      'genshin-impact'
    );
  }

  if (
    /weekly diamond pass|\bwdp\b|starlight|twilight pass/.test(
      text
    )
  ) {
    return (
      game.id ===
      'mobile-legends'
    );
  }

  if (
    /royale pass/.test(
      text
    )
  ) {
    return (
      game.id ===
      'pubg-mobile'
    );
  }

  if (
    /honor pass/.test(
      text
    )
  ) {
    return (
      game.id ===
      'honor-of-kings'
    );
  }

  if (
    /express supply pass/.test(
      text
    )
  ) {
    return (
      game.id ===
      'honkai-star-rail'
    );
  }

  if (
    /inter knot membership/.test(
      text
    )
  ) {
    return (
      game.id ===
      'zenless-zone-zero'
    );
  }

  if (
    /coronomicon monthly(?: package)?|^special data$|^zero data$/.test(
      text
    )
  ) {
    return (
      game.id ===
      'chaos-zero-nightmare'
    );
  }

  if (
    /lunite subscription/.test(
      text
    )
  ) {
    return (
      game.id ===
      'wuthering-waves'
    );
  }

  return /\b(?:weekly|monthly|membership|member|subscription|battle pass|coupon pass|elite bundle|epic bundle|card)\b/.test(
    text
  );
}

function offerMatchesGame(
  offer,
  game
) {
  const name =
    String(
      offer?.originalName ||
      ''
    )
      .trim();

  if (!name) {
    return false;
  }

  if (
    containsExplicitGameName(
      name,
      game
    )
  ) {
    return true;
  }

  if (
    containsOtherGameName(
      name,
      game
    )
  ) {
    return false;
  }

  const unitAliases =
    uniqueNormalized(
      game?.unitAliases ||
      []
    );

  if (
    unitAliases.some(
      (unit) =>
        containsPhrase(
          name,
          unit
        )
    )
  ) {
    return true;
  }

  if (
    namedPackageMatchesGame(
      name,
      game
    )
  ) {
    return true;
  }

  return (
    unitAliases.length ===
    0
  );
}

function buildParserDiagnostics({
  html,
  lines,
  lineOffers,
  jsonOffers,
  structured,
  filteredOffers
}) {
  const visibleProductCandidates =
    lines.filter(
      (line) =>
        isProductName(
          line
        )
    ).length;

  const visiblePriceCandidates =
    lines.filter(
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
    structured.offers.length
  ) {
    parserReason =
      filteredOffers.length ===
        0
        ? 'PRODUCTS_REJECTED_BY_GAME_VALIDATION'
        : 'PARTIAL_MATCH_ONLY';
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
    structured
      .diagnostics
      .documentCount >
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

    visibleLineCount:
      lines.length,

    visibleProductCandidates,
    visiblePriceCandidates,

    lineOfferCount:
      lineOffers.length,

    legacyJsonOfferCount:
      jsonOffers.length,

    structuredOfferCount:
      structured
        .offers
        .length,

    filteredOfferCount:
      filteredOffers.length,

    structured:
      structured.diagnostics,

    dynamic
  };
}

function parseOffers(
  html,
  finalUrl,
  store,
  game
) {
  const context = {
    purchaseUrl:
      finalUrl,

    storeId:
      store.id,

    storeName:
      store.name,

    gameId:
      game.id,

    source:
      'live'
  };

  const lines =
    htmlToLines(
      html
    );

  const lineOffers =
    extractOffersFromLines(
      lines,
      {
        ...context,

        maxDistance:
          4
      }
    );

  const jsonOffers =
    extractJsonScriptOffers(
      html,
      context
    );

  const structured =
    extractStructuredOffers(
      html,
      context
    );

  const rawOffers =
    dedupeOffers([
      ...lineOffers,
      ...jsonOffers,
      ...structured.offers
    ]);

  const offers =
    rawOffers
      .filter(
        (offer) =>
          offerMatchesGame(
            offer,
            game
          )
      )
      .slice(
        0,
        150
      );

  return {
    offers,

    diagnostics:
      buildParserDiagnostics({
        html,
        lines,
        lineOffers,
        jsonOffers,
        structured,

        filteredOffers:
          offers
      })
  };
}

function parserFailureMessage(
  reason
) {
  const messages = {
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

    PRODUCTS_REJECTED_BY_GAME_VALIDATION:
      'Produk berhasil dibaca, tetapi tidak lolos validasi game target',

    PARTIAL_MATCH_ONLY:
      'Sebagian data berhasil dibaca, tetapi belum menghasilkan offer yang dapat digunakan',

    UNSUPPORTED_STRUCTURE:
      'Struktur halaman belum didukung parser saat ini'
  };

  return (
    messages[
      reason
    ] ||
    messages
      .UNSUPPORTED_STRUCTURE
  );
}

function createUniversalAdapter(
  store
) {
  return {
    id:
      store.id,

    name:
      store.name,

    category:
      store.category,

    verification:
      store.verification,

    async fetchOffers(
      game,
      options = {}
    ) {
      if (
        !store.homepage
      ) {
        throw providerError(
          'NOT_CONFIGURED',
          'URL toko belum dikonfigurasi'
        );
      }

      const timeoutMs =
        Number(
          options.timeoutMs ||
          6500
        );

      /*
       * Sebelumnya hanya 2 candidate.
       *
       * Sekarang default 5.
       *
       * Maksimum hard limit tetap 7
       * agar request tidak liar.
       */
      const maxPages =
        Math.max(
          1,

          Math.min(
            7,

            Number(
              process.env
                .MAX_PAGE_PROBES_PER_STORE ||
              5
            )
          )
        );

      /*
       * Tiga candidate awal dicoba
       * sebelum sitemap discovery.
       */
      const initialProbeLimit =
        Math.max(
          1,

          Math.min(
            maxPages,

            Number(
              process.env
                .INITIAL_PAGE_PROBES_PER_STORE ||
              3
            )
          )
        );

      let homepageHtml =
        '';

      let homepageError =
        null;

      let strongestError =
        null;

      const attemptedUrls =
        [];

      const attemptedSet =
        new Set();

      let pageAttempts =
        0;

      /*
       * ==================================================
       * HOMEPAGE DISCOVERY
       * ==================================================
       */
      try {
        const homepage =
          await fetchText(
            store.homepage,
            {
              timeoutMs:
                Math.min(
                  timeoutMs,
                  3500
                ),

              retries:
                1
            }
          );

        homepageHtml =
          homepage.text;
      } catch (
        error
      ) {
        /*
         * Homepage gagal bukan berarti
         * game URL pasti gagal.
         *
         * Template candidate tetap
         * akan dicoba.
         */
        homepageError =
          error;
      }

      const initialCandidates =
        makeCandidateUrls(
          store,
          game,
          homepageHtml
        );

      /*
       * ==================================================
       * CANDIDATE PROBER
       * ==================================================
       */
      async function probeUrls(
        urls,
        limit = maxPages
      ) {
        for (
          const url of
          urls
        ) {
          if (
            pageAttempts >=
              maxPages ||
            pageAttempts >=
              limit
          ) {
            break;
          }

          if (
            !url ||
            attemptedSet.has(
              url
            )
          ) {
            continue;
          }

          attemptedSet.add(
            url
          );

          attemptedUrls.push(
            url
          );

          pageAttempts +=
            1;

          try {
            const page =
              await fetchText(
                url,
                {
                  timeoutMs,

                  retries:
                    1
                }
              );

            const finalUrl =
              page.finalUrl ||
              url;

            /*
             * ============================
             * VALIDATE TARGET GAME
             * ============================
             */
            const validation =
              validatePageForGame(
                page.text,
                finalUrl,
                store.homepage,
                game
              );

            if (
              !validation.ok
            ) {
              strongestError =
                pickStrongerError(
                  strongestError,

                  providerError(
                    'PAGE_NOT_VERIFIED',

                    `halaman tidak cocok: ${validation.reason}`,

                    {
                      finalUrl,

                      validationScore:
                        validation.score
                    }
                  )
                );

              continue;
            }

            /*
             * ============================
             * PARSE PRODUCT
             * ============================
             */
            const parsed =
              parseOffers(
                page.text,
                finalUrl,
                store,
                game
              );

            if (
              parsed
                .offers
                .length
            ) {
              /*
               * Begitu berhasil,
               * candidate berikutnya
               * tidak perlu dicoba.
               */
              return parsed.offers;
            }

            strongestError =
              pickStrongerError(
                strongestError,

                providerError(
                  'PARSER_FAILED',

                  parserFailureMessage(
                    parsed
                      .diagnostics
                      .parserReason
                  ),

                  {
                    parserReason:
                      parsed
                        .diagnostics
                        .parserReason,

                    parserDiagnostics:
                      parsed
                        .diagnostics,

                    finalUrl
                  }
                )
              );
          } catch (
            error
          ) {
            /*
             * 404 candidate pertama
             * tidak lagi otomatis
             * menjadi error final.
             */
            strongestError =
              pickStrongerError(
                strongestError,
                error
              );
          }
        }

        return null;
      }

      /*
       * ==================================================
       * PHASE 1
       * Direct URL + homepage discovery + tebakan awal
       * ==================================================
       */
      const firstResult =
        await probeUrls(
          initialCandidates.slice(
            0,
            initialProbeLimit
          ),

          initialProbeLimit
        );

      if (
        firstResult
      ) {
        return firstResult;
      }

      /*
       * ==================================================
       * PHASE 2
       * SITEMAP DISCOVERY
       * ==================================================
       *
       * Sitemap baru dicoba setelah
       * candidate awal gagal.
       */
      let sitemapDiscovery = {
        urls:
          [],

        checked:
          0,

        errors:
          []
      };

      if (
        pageAttempts <
        maxPages
      ) {
        sitemapDiscovery =
          await discoverSitemapUrls(
            store,
            game,
            {
              fetchText,

              timeoutMs:
                Math.min(
                  timeoutMs,
                  3000
                ),

              maxSitemaps:
                2,

              maxUrls:
                Math.max(
                  2,

                  maxPages -
                    pageAttempts
                )
            }
          );
      }

      /*
       * Sitemap URL diprioritaskan
       * sebelum sisa guessed URL.
       */
      const remainingCandidates = [
        ...sitemapDiscovery.urls,

        ...initialCandidates.slice(
          initialProbeLimit
        )
      ];

      const secondResult =
        await probeUrls(
          remainingCandidates,
          maxPages
        );

      if (
        secondResult
      ) {
        return secondResult;
      }

      /*
       * Homepage error hanya digunakan
       * jika tidak pernah ada error
       * candidate yang lebih spesifik.
       */
      if (
        !strongestError &&
        homepageError
      ) {
        strongestError =
          homepageError;
      }

      if (
        strongestError
      ) {
        /*
         * Detail ini tidak harus
         * ditampilkan ke user,
         * tetapi sangat membantu
         * debugging backend.
         */
        strongestError.discoveryDiagnostics = {
          attemptedUrls,
          pageAttempts,

          sitemapChecked:
            sitemapDiscovery.checked,

          sitemapErrors:
            sitemapDiscovery.errors
        };

        throw strongestError;
      }

      throw providerError(
        'PAGE_NOT_FOUND',

        'Tidak ada candidate URL game yang berhasil ditemukan',

        {
          discoveryDiagnostics: {
            attemptedUrls,
            pageAttempts,

            sitemapChecked:
              sitemapDiscovery.checked,

            sitemapErrors:
              sitemapDiscovery.errors
          }
        }
      );
    }
  };
}

module.exports = {
  createUniversalAdapter,
  extractLinks,
  linkScore,
  makeCandidateUrls,
  validatePageForGame,
  offerMatchesGame,
  parseOffers,
  buildParserDiagnostics,
  pickStrongerError
};
