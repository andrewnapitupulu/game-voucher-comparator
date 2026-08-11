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
  GAMES,
  normalizeText
} = require(
  '../config/games'
);

const COMMON_TEMPLATES = [
  '{homepage}/{gameSlug}',
  '{homepage}/games/{gameSlug}',
  '{homepage}/topup/{gameSlug}',
  '{homepage}/top-up/{gameSlug}',
  '{homepage}/game/{gameSlug}',
  '{homepage}/product/{gameSlug}'
];

const BAD_LINK_PATTERN =
  /\b(?:login|register|daftar|masuk|berita|news|article|artikel|blog|promo|promosi|terms|privacy|affiliate|reseller|karir|career|contact|kontak|about|tentang)\b/i;

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

function absoluteUrl(
  value,
  baseUrl
) {
  try {
    const url =
      new URL(
        String(
          value ||
          ''
        ),
        baseUrl
      );

    return /^https?:$/.test(
      url.protocol
    )
      ? url.toString()
      : null;
  } catch {
    return null;
  }
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

function extractLinks(
  html,
  baseUrl
) {
  const links =
    [];

  const regex =
    /<a\b[^>]*href\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;

  for (
    const match of
    String(
      html ||
      ''
    ).matchAll(
      regex
    )
  ) {
    const href =
      absoluteUrl(
        match[1] ||
        match[2] ||
        match[3],

        baseUrl
      );

    if (!href) {
      continue;
    }

    links.push({
      href,

      text:
        stripTags(
          match[4]
        )
    });
  }

  return links;
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

function gameIdentityCandidates(
  game
) {
  return uniqueNormalized([
    String(
      game?.id ||
      ''
    )
      .replace(
        /-/g,
        ' '
      ),

    game?.name,
    game?.shortName,

    ...(
      game?.aliases ||
      []
    )
  ]);
}

function isStrongIdentity(
  value
) {
  const normalized =
    normalizeText(
      value
    );

  if (!normalized) {
    return false;
  }

  const compact =
    normalized.replace(
      /\s+/g,
      ''
    );

  const tokenCount =
    normalized
      .split(
        /\s+/
      )
      .filter(
        Boolean
      )
      .length;

  return (
    tokenCount >=
      2 ||
    compact.length >=
      4
  );
}

function containsPhrase(
  haystack,
  phrase
) {
  const normalizedHaystack =
    normalizeText(
      haystack
    );

  const normalizedPhrase =
    normalizeText(
      phrase
    );

  if (
    !normalizedHaystack ||
    !normalizedPhrase
  ) {
    return false;
  }

  return (
    ` ${normalizedHaystack} `
  ).includes(
    ` ${normalizedPhrase} `
  );
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

function linkScore(
  link,
  game,
  homepage
) {
  const text =
    normalizeText(
      link?.text ||
      ''
    );

  const href =
    normalizeText(
      link?.href ||
      ''
    );

  const identities =
    gameIdentityCandidates(
      game
    );

  let score =
    0;

  for (
    const identity of
    identities
  ) {
    const compact =
      identity.replace(
        /\s+/g,
        ''
      );

    const strong =
      isStrongIdentity(
        identity
      );

    if (
      containsPhrase(
        text,
        identity
      )
    ) {
      score =
        Math.max(
          score,

          strong
            ? 130 +
              compact.length
            : 72 +
              compact.length
        );
    }

    if (
      containsPhrase(
        href,
        identity
      )
    ) {
      score =
        Math.max(
          score,

          strong
            ? 112 +
              compact.length
            : 62 +
              compact.length
        );
    }

    if (strong) {
      const compactText =
        text.replace(
          /\s+/g,
          ''
        );

      const compactHref =
        href.replace(
          /\s+/g,
          ''
        );

      if (
        compactText.includes(
          compact
        )
      ) {
        score =
          Math.max(
            score,
            118 +
              compact.length
          );
      }

      if (
        compactHref.includes(
          compact
        )
      ) {
        score =
          Math.max(
            score,
            100 +
              compact.length
          );
      }
    }
  }

  if (
    BAD_LINK_PATTERN.test(
      `${text} ${href}`
    )
  ) {
    score -=
      100;
  }

  try {
    if (
      new URL(
        link.href
      ).origin !==
      new URL(
        homepage
      ).origin
    ) {
      score -=
        70;
    }
  } catch {
    score -=
      70;
  }

  return score;
}

function makeCandidateUrls(
  store,
  game,
  homepageHtml
) {
  const directUrls = [
    store
      .gameUrls
      ?.[
        game.id
      ],

    game
      .stores
      ?.[
        store.id
      ]
  ]
    .filter(
      Boolean
    );

  const discovered =
    homepageHtml
      ? extractLinks(
          homepageHtml,
          store.homepage
        )
          .map(
            (link) => ({
              ...link,

              score:
                linkScore(
                  link,
                  game,
                  store.homepage
                )
            })
          )
          .filter(
            (link) =>
              link.score >=
              85
          )
          .sort(
            (
              a,
              b
            ) =>
              b.score -
              a.score
          )
          .slice(
            0,
            4
          )
          .map(
            (link) =>
              link.href
          )

      : [];

  const fromTemplates = [
    ...(
      store.urlTemplates ||
      []
    ),

    ...COMMON_TEMPLATES
  ]
    .map(
      (template) =>
        String(
          template
        )
          .replaceAll(
            '{homepage}',

            String(
              store.homepage ||
              ''
            )
              .replace(
                /\/$/,
                ''
              )
          )
          .replaceAll(
            '{gameSlug}',
            game.id
          )
    )
    .map(
      (url) =>
        absoluteUrl(
          url,
          store.homepage
        )
    )
    .filter(
      Boolean
    );

  return [
    ...new Set(
      [
        ...directUrls,
        ...discovered,
        ...fromTemplates
      ]
        .map(
          (url) =>
            absoluteUrl(
              url,
              store.homepage
            )
        )
        .filter(
          Boolean
        )
    )
  ]
    .slice(
      0,
      10
    );
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

  /*
   * Penting untuk website modern.
   *
   * Nama game bisa tidak ada di DOM,
   * tetapi berada di:
   *
   * __NEXT_DATA__
   * JSON-LD
   * __INITIAL_STATE__
   */
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
      game
        ?.unitAliases ||
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
   * Page jelas menunjukkan game lain.
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
   * Soft 404 / redirect homepage.
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
      offer
        ?.originalName ||
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
      game
        ?.unitAliases ||
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
    lineOffers.length >
      0 ||
    jsonOffers.length >
      0 ||
    structured.offers.length >
      0
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

  /*
   * ======================================================
   * LAYER 1
   * Visible HTML
   * ======================================================
   */

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

  /*
   * ======================================================
   * LAYER 2
   * Legacy JSON parser
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
   * Structured / framework state
   * ======================================================
   */

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

  /*
   * Validasi game tetap dipertahankan
   * supaya produk game lain tidak
   * ikut masuk.
   */
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

      let homepageHtml =
        '';

      let homepageError =
        null;

      try {
        const homepage =
          await fetchText(
            store.homepage,
            {
              timeoutMs:
                Math.min(
                  timeoutMs,
                  3500
                )
            }
          );

        homepageHtml =
          homepage.text;
      } catch (
        error
      ) {
        homepageError =
          error;
      }

      const candidates =
        makeCandidateUrls(
          store,
          game,
          homepageHtml
        );

      const maxPages =
        Math.max(
          1,

          Math.min(
            3,

            Number(
              process.env
                .MAX_PAGE_PROBES_PER_STORE ||
              2
            )
          )
        );

      const errors =
        [];

      let strongestError =
        null;

      for (
        const url of
        candidates.slice(
          0,
          maxPages
        )
      ) {
        try {
          const page =
            await fetchText(
              url,
              {
                timeoutMs
              }
            );

          const finalUrl =
            page.finalUrl ||
            url;

          /*
           * =================================================
           * PAGE VALIDATION
           * =================================================
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
            const error =
              providerError(
                'PAGE_NOT_VERIFIED',

                `halaman tidak cocok: ${validation.reason}`,

                {
                  finalUrl,

                  validationScore:
                    validation.score
                }
              );

            errors.push(
              error.message
            );

            if (
              !strongestError
            ) {
              strongestError =
                error;
            }

            continue;
          }

          /*
           * =================================================
           * MULTI-LAYER PARSER
           * =================================================
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
            return parsed.offers;
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

                finalUrl
              }
            );

          errors.push(
            error.message
          );

          strongestError =
            error;
        } catch (
          error
        ) {
          errors.push(
            error.message
          );

          if (
            !strongestError ||
            [
              'ACCESS_BLOCKED',
              'RATE_LIMITED',
              'TIMEOUT',
              'NETWORK_ERROR'
            ].includes(
              String(
                error
                  ?.code ||
                ''
              )
                .toUpperCase()
            )
          ) {
            strongestError =
              error;
          }
        }
      }

      if (
        !candidates.length &&
        homepageError
      ) {
        throw homepageError;
      }

      if (
        strongestError
      ) {
        throw strongestError;
      }

      if (
        store.verification !==
        'verified'
      ) {
        throw providerError(
          'PARSER_FAILED',

          errors[
            0
          ] ||
          homepageError
            ?.message ||
          'Kandidat toko belum menghasilkan harga',

          {
            parserReason:
              'UNSUPPORTED_STRUCTURE'
          }
        );
      }

      throw providerError(
        'PARSER_FAILED',

        errors[
          0
        ] ||
        homepageError
          ?.message ||
        'Halaman game atau harga tidak ditemukan',

        {
          parserReason:
            'UNSUPPORTED_STRUCTURE'
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
  buildParserDiagnostics
};
