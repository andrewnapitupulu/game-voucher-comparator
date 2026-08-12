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
  makeDirectCandidateEntries,
  makeDiscoveredCandidateEntries,
  makeGuessedCandidateEntries,
  discoverSitemapCandidates,
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

const ERROR_PRIORITY = {
  PARSER_FAILED:
    100,

  PAGE_NOT_VERIFIED:
    90,

  ACCESS_BLOCKED:
    85,

  RATE_LIMITED:
    80,

  NETWORK_TLS_ERROR:
    72,

  NETWORK_CONNECTION_ERROR:
    70,

  NETWORK_DNS_ERROR:
    68,

  NETWORK_CONNECT_TIMEOUT:
    66,

  NETWORK_FETCH_FAILED:
    64,

  TIMEOUT:
    62,

  UPSTREAM_ERROR:
    55,

  HTTP_ERROR:
    45,

  DISCOVERY_BLOCKED:
    30,

  CANDIDATE_BLOCKED:
    25,

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
    new Error(message);

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
    errorPriority(candidate) >
    errorPriority(current)
      ? candidate
      : current
  );
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
      normalizeText(value);

    if (
      !normalized ||
      seen.has(normalized)
    ) {
      continue;
    }

    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function countPhrase(
  haystack,
  phrase
) {
  const h =
    ` ${normalizeText(haystack)} `;

  const p =
    normalizeText(phrase);

  if (!p) {
    return 0;
  }

  const needle =
    ` ${p} `;

  let count =
    0;

  let cursor =
    0;

  while (
    cursor <
    h.length
  ) {
    const index =
      h.indexOf(
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
    tagNames.join('|');

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
    ).matchAll(regex)
  ) {
    const text =
      stripTags(
        match[1]
      );

    if (text) {
      result.push(text);
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
    ).matchAll(regex)
  ) {
    const attrs =
      match[1];

    const keyMatch =
      attrs.match(
        /(?:name|property)\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i
      );

    const contentMatch =
      attrs.match(
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
      !wanted.has(key)
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
      result.push(content);
    }
  }

  return result;
}

function getPageSignals(
  html
) {
  return {
    titleText:
      extractTagTexts(
        html,
        [
          'title'
        ]
      )
        .join(' '),

    headingText:
      extractTagTexts(
        html,
        [
          'h1',
          'h2'
        ]
      )
        .join(' '),

    metaText:
      extractMetaContent(
        html,
        [
          'og:title',
          'twitter:title',
          'description',
          'og:description'
        ]
      )
        .join(' '),

    structuredText:
      extractStructuredIdentityText(
        html
      ),

    bodyText:
      htmlToLines(html)
        .slice(
          0,
          1200
        )
        .join(' ')
  };
}

function homepageLikeUrl(
  urlValue,
  homepage
) {
  try {
    const url =
      new URL(urlValue);

    const home =
      new URL(homepage);

    const clean =
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
            /^\/+/g,
            ''
          );

    return (
      url.origin ===
        home.origin &&
      clean(
        url.pathname
      ) ===
        clean(
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
  return gameIdentityCandidates(game)
    .filter(isStrongIdentity)
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
  return gameIdentityCandidates(game)
    .filter(
      (identity) =>
        !isStrongIdentity(identity)
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
  return uniqueNormalized(
    game?.unitAliases ||
    []
  )
    .some(
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

    const strength =
      Math.max(
        ...matches.map(
          (match) =>
            match
              .replace(
                /\s+/g,
                ''
              )
              .length
        )
      );

    if (
      !best ||
      strength >
        best.strength
    ) {
      best = {
        game:
          otherGame,

        strength
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
    getPageSignals(html);

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
      normalizeText(finalUrl),
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

  let bodyOccurrences =
    0;

  for (
    const identity of
    gameIdentityCandidates(game)
      .filter(isStrongIdentity)
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
  return gameIdentityCandidates(game)
    .filter(isStrongIdentity)
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
    normalizeText(name);

  if (
    /\bwelkin\b|blessing of the welkin moon/.test(text)
  ) {
    return (
      game.id ===
      'genshin-impact'
    );
  }

  if (
    /weekly diamond pass|\bwdp\b|starlight|twilight pass/.test(text)
  ) {
    return (
      game.id ===
      'mobile-legends'
    );
  }

  if (
    /royale pass/.test(text)
  ) {
    return (
      game.id ===
      'pubg-mobile'
    );
  }

  if (
    /honor pass/.test(text)
  ) {
    return (
      game.id ===
      'honor-of-kings'
    );
  }

  if (
    /express supply pass/.test(text)
  ) {
    return (
      game.id ===
      'honkai-star-rail'
    );
  }

  if (
    /inter knot membership/.test(text)
  ) {
    return (
      game.id ===
      'zenless-zone-zero'
    );
  }

  if (
    /coronomicon monthly(?: package)?|^special data$|^zero data$/.test(text)
  ) {
    return (
      game.id ===
      'chaos-zero-nightmare'
    );
  }

  if (
    /lunite subscription/.test(text)
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
        isProductName(line)
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
    detectDynamicPageSignals(html);

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
      structured.offers.length,

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
    htmlToLines(html);

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

function convertCandidateError(
  error,
  candidate
) {
  const code =
    String(
      error?.code ||
      ''
    )
      .toUpperCase();

  /*
   * Ini inti perbaikannya:
   *
   * 403 dari URL tebakan tidak boleh
   * dianggap sebagai ACCESS BLOCKED
   * untuk seluruh toko.
   */
  if (
    code ===
      'ACCESS_BLOCKED' &&
    candidate.source ===
      'guessed'
  ) {
    return providerError(
      'CANDIDATE_BLOCKED',

      `Candidate URL tebakan mengembalikan HTTP ${error.status || 403}`,

      {
        status:
          error.status ||
          403,

        finalUrl:
          error.finalUrl ||
          candidate.url,

        candidateSource:
          candidate.source,

        candidateConfidence:
          candidate.confidence
      }
    );
  }

  error.candidateSource =
    candidate.source;

  error.candidateConfidence =
    candidate.confidence;

  return error;
}

function convertDiscoveryError(
  error
) {
  if (
    String(
      error?.code ||
      ''
    )
      .toUpperCase() ===
    'ACCESS_BLOCKED'
  ) {
    return providerError(
      'DISCOVERY_BLOCKED',

      `Homepage discovery mengembalikan HTTP ${error.status || 403}`,

      {
        status:
          error.status ||
          403,

        finalUrl:
          error.finalUrl ||
          error.url ||
          null
      }
    );
  }

  return error;
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
       * Sebelumnya default 5.
       * Sekarang kembali konservatif: 3.
       */
      const maxPageProbes =
        Math.max(
          1,
          Math.min(
            5,
            Number(
              process.env
                .MAX_PAGE_PROBES_PER_STORE ||
              3
            )
          )
        );

      const maxDiscoveredProbes =
        Math.max(
          1,
          Math.min(
            2,
            Number(
              process.env
                .MAX_DISCOVERED_PROBES_PER_STORE ||
              1
            )
          )
        );

      const maxSitemapProbes =
        Math.max(
          1,
          Math.min(
            2,
            Number(
              process.env
                .MAX_SITEMAP_PROBES_PER_STORE ||
              1
            )
          )
        );

      /*
       * Guessed URL dibuat sangat terbatas.
       */
      const maxGuessedProbes =
        Math.max(
          0,
          Math.min(
            2,
            Number(
              process.env
                .MAX_GUESSED_PROBES_PER_STORE ||
              1
            )
          )
        );

      const attemptedUrls =
        [];

      const attemptedSet =
        new Set();

      let pageAttempts =
        0;

      let strongestError =
        null;

      let homepageError =
        null;

      let sitemapDiscovery = {
        entries:
          [],

        urls:
          [],

        checked:
          0,

        errors:
          []
      };

      async function probeCandidate(
        candidate
      ) {
        if (
          !candidate?.url ||
          pageAttempts >=
            maxPageProbes ||
          attemptedSet.has(
            candidate.url
          )
        ) {
          return {
            type:
              'skip'
          };
        }

        attemptedSet.add(
          candidate.url
        );

        attemptedUrls.push({
          url:
            candidate.url,

          source:
            candidate.source,

          confidence:
            candidate.confidence
        });

        pageAttempts +=
          1;

        try {
          const page =
            await fetchText(
              candidate.url,
              {
                timeoutMs,

                /*
                 * Retry hanya dilakukan
                 * pada direct/discovered/
                 * sitemap candidate.
                 *
                 * Guessed URL = 0 retry.
                 */
                retries:
                  candidate.confidence ===
                  'high'
                    ? 1
                    : 0
              }
            );

          const finalUrl =
            page.finalUrl ||
            candidate.url;

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
            const error =
              providerError(
                'PAGE_NOT_VERIFIED',

                `halaman tidak cocok: ${validation.reason}`,

                {
                  finalUrl,

                  candidateSource:
                    candidate.source,

                  candidateConfidence:
                    candidate.confidence,

                  validationScore:
                    validation.score
                }
              );

            strongestError =
              pickStrongerError(
                strongestError,
                error
              );

            return {
              type:
                'continue'
            };
          }

          const parsed =
            parseOffers(
              page.text,
              finalUrl,
              store,
              game
            );

          if (
            parsed.offers.length
          ) {
            return {
              type:
                'success',

              offers:
                parsed.offers
            };
          }

          const error =
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

                finalUrl,

                candidateSource:
                  candidate.source,

                candidateConfidence:
                  candidate.confidence
              }
            );

          strongestError =
            pickStrongerError(
              strongestError,
              error
            );

          /*
           * Halaman sudah terbukti page
           * game target. Tidak perlu
           * mencoba URL tambahan lagi.
           */
          return {
            type:
              'terminal-error',

            error
          };
        } catch (rawError) {
          const error =
            convertCandidateError(
              rawError,
              candidate
            );

          strongestError =
            pickStrongerError(
              strongestError,
              error
            );

          /*
           * 403 hanya dianggap block nyata
           * jika candidate ber-confidence
           * tinggi.
           *
           * Guessed URL sudah diubah menjadi
           * CANDIDATE_BLOCKED di atas.
           */
          if (
            String(
              error?.code ||
              ''
            )
              .toUpperCase() ===
              'ACCESS_BLOCKED' &&
            candidate.confidence ===
              'high'
          ) {
            return {
              type:
                'terminal-error',

              error
            };
          }

          return {
            type:
              'continue'
          };
        }
      }

      async function probeGroup(
        entries,
        limit
      ) {
        let probed =
          0;

        for (
          const candidate of
          entries
        ) {
          if (
            probed >=
              limit ||
            pageAttempts >=
              maxPageProbes
          ) {
            break;
          }

          if (
            attemptedSet.has(
              candidate.url
            )
          ) {
            continue;
          }

          probed +=
            1;

          const result =
            await probeCandidate(
              candidate
            );

          if (
            result.type ===
              'success' ||
            result.type ===
              'terminal-error'
          ) {
            return result;
          }
        }

        return {
          type:
            'continue'
        };
      }

      /*
       * ==================================================
       * PHASE 1
       * DIRECT URL
       * ==================================================
       *
       * Ini perubahan penting:
       * jika direct URL tersedia,
       * homepage dan sitemap belum
       * disentuh sama sekali.
       */
      const directEntries =
        makeDirectCandidateEntries(
          store,
          game
        );

      if (
        directEntries.length
      ) {
        const result =
          await probeGroup(
            directEntries,

            Math.min(
              directEntries.length,
              maxPageProbes
            )
          );

        if (
          result.type ===
          'success'
        ) {
          return result.offers;
        }

        if (
          result.type ===
          'terminal-error'
        ) {
          throw result.error;
        }
      }

      /*
       * ==================================================
       * PHASE 2
       * HOMEPAGE DISCOVERY
       * ==================================================
       *
       * Homepage hanya dipakai untuk
       * mencari URL, sehingga tidak
       * di-retry.
       */
      let homepageHtml =
        '';

      if (
        pageAttempts <
        maxPageProbes
      ) {
        try {
          const homepage =
            await fetchText(
              store.homepage,
              {
                timeoutMs:
                  Math.min(
                    timeoutMs,
                    3000
                  ),

                retries:
                  0
              }
            );

          homepageHtml =
            homepage.text;
        } catch (rawError) {
          homepageError =
            convertDiscoveryError(
              rawError
            );

          strongestError =
            pickStrongerError(
              strongestError,
              homepageError
            );
        }

        const discoveredEntries =
          makeDiscoveredCandidateEntries(
            store,
            game,
            homepageHtml
          );

        if (
          discoveredEntries.length
        ) {
          const result =
            await probeGroup(
              discoveredEntries,
              maxDiscoveredProbes
            );

          if (
            result.type ===
            'success'
          ) {
            return result.offers;
          }

          if (
            result.type ===
            'terminal-error'
          ) {
            throw result.error;
          }
        }
      }

      /*
       * ==================================================
       * PHASE 3
       * SITEMAP
       * ==================================================
       *
       * Sitemap hanya fallback.
       * Tidak di-retry.
       */
      if (
        pageAttempts <
        maxPageProbes
      ) {
        sitemapDiscovery =
          await discoverSitemapCandidates(
            store,
            game,
            {
              fetchText,

              timeoutMs:
                Math.min(
                  timeoutMs,
                  2800
                ),

              maxSitemaps:
                2,

              maxUrls:
                3
            }
          );

        if (
          sitemapDiscovery
            .entries
            .length
        ) {
          const result =
            await probeGroup(
              sitemapDiscovery.entries,
              maxSitemapProbes
            );

          if (
            result.type ===
            'success'
          ) {
            return result.offers;
          }

          if (
            result.type ===
            'terminal-error'
          ) {
            throw result.error;
          }
        }
      }

      /*
       * ==================================================
       * PHASE 4
       * GUESSED URL
       * ==================================================
       *
       * Fallback terakhir.
       *
       * Default:
       * maksimum 1 candidate
       * tanpa retry.
       */
      if (
        pageAttempts <
          maxPageProbes &&
        maxGuessedProbes >
          0
      ) {
        const guessedEntries =
          makeGuessedCandidateEntries(
            store,
            game
          );

        const result =
          await probeGroup(
            guessedEntries,
            maxGuessedProbes
          );

        if (
          result.type ===
          'success'
        ) {
          return result.offers;
        }

        if (
          result.type ===
          'terminal-error'
        ) {
          throw result.error;
        }
      }

      if (
        !strongestError &&
        homepageError
      ) {
        strongestError =
          homepageError;
      }

      const diagnostics = {
        attemptedUrls,
        pageAttempts,
        maxPageProbes,

        sitemapChecked:
          sitemapDiscovery.checked,

        sitemapErrors:
          sitemapDiscovery.errors
      };

      if (
        strongestError
      ) {
        strongestError
          .discoveryDiagnostics =
          diagnostics;

        throw strongestError;
      }

      throw providerError(
        'PAGE_NOT_FOUND',

        'Tidak ada URL game yang berhasil ditemukan dari direct URL, homepage, sitemap, maupun fallback candidate',

        {
          discoveryDiagnostics:
            diagnostics
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
