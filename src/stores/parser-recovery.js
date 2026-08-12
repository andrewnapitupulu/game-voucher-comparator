'use strict';

const {
  fetchText
} = require('../services/http');

const {
  validatePageForGame,
  parseOffers,
  extractLinks,
  linkScore,
  pickStrongerError
} = require('./universal-page');

const {
  htmlToLines,
  isProductName,
  dedupeOffers,
  decodeEntities
} = require('../utils/html');

const {
  parseRupiah
} = require('../utils/money');

const {
  normalizeText
} = require('../config/games');

const {
  detectDynamicPageSignals
} = require('../utils/structured-data');

/*
 * Recovery hanya aktif untuk toko yang memang membutuhkan
 * fallback tambahan. Store lain tetap memakai flow normal.
 */
const RECOVERY_CONFIG = {
  gigames: {
    paths: [
      '/beli/{gameSlug}',
      '/id/beli/{gameSlug}',
      '/en/beli/{gameSlug}'
    ],

    specialPaths: {
      'mobile-legends': [
        '/beli/mobile-legends-global',
        '/id/beli/mobile-legends-brazil'
      ]
    },

    /*
     * /services merupakan fallback Gigames karena halaman ini
     * dapat menampilkan nama game + nominal + harga.
     */
    catalogPaths: [
      '/services'
    ],

    discoveryPaths: [
      '/en',
      '/id',
      '/'
    ],

    maxProbes: 9,
    linkThreshold: 68
  },

  'oura-store': {
    paths: [
      '/id-id/{gameSlug}',
      '/id/{gameSlug}',
      '/{gameSlug}'
    ],

    specialPaths: {
      'mobile-legends': [
        '/id-id/mobile-legends?from=undefined',
        '/id-id/mobile-legends'
      ]
    },

    discoveryPaths: [
      '/id-id',
      '/'
    ],

    maxProbes: 7,
    linkThreshold: 72
  },

  seagm: {
    paths: [
      '/id-id/{gameSlug}',
      '/id/{gameSlug}',
      '/{gameSlug}'
    ],

    specialPaths: {
      'mobile-legends': [
        '/id-id/mlbb-diamonds-top-up-id',
        '/id-id/mobile-legends-diamonds-top-up'
      ]
    },

    discoveryPaths: [
      '/id-id/search?keywords={gameQuery}',
      '/id-id'
    ],

    maxProbes: 9,
    linkThreshold: 66
  },

  'kios-game-indonesia': {
    paths: [
      '/{gameSlug}',
      '/en/{gameSlug}',
      '/id/{gameSlug}'
    ],

    specialPaths: {
      'mobile-legends': [
        '/mobile-legends',
        '/en/mobile-legends',
        '/id/mobile-legends-login'
      ]
    },

    discoveryPaths: [
      '/en',
      '/id',
      '/'
    ],

    maxProbes: 8,
    linkThreshold: 66
  },

  topupdeh: {
    paths: [
      '/{gameSlug}',
      '/games/{gameSlug}',
      '/game/{gameSlug}'
    ],

    discoveryPaths: [
      '/games',
      '/'
    ],

    maxProbes: 7,
    linkThreshold: 70
  },

  /*
   * Tetap dipertahankan karena dua toko ini pernah masuk
   * recovery profile.
   */
  sontopup: {
    paths: [
      '/id-id/{gameSlug}',
      '/en-id/{gameSlug}',
      '/{gameSlug}'
    ],

    catalogPaths: [
      '/price-list',
      '/en-id/price-list'
    ],

    discoveryPaths: [
      '/id-id',
      '/en-id',
      '/'
    ],

    maxProbes: 8,
    linkThreshold: 66
  },

  yoggstore: {
    paths: [
      '/id/beli/{gameSlug}',
      '/beli/{gameSlug}',
      '/en/beli/{gameSlug}'
    ],

    discoveryPaths: [
      '/id',
      '/en',
      '/'
    ],

    maxProbes: 8,
    linkThreshold: 66
  }
};

const RECOVERABLE_CODES = new Set([
  'PARSER_FAILED',
  'PAGE_NOT_VERIFIED',
  'PAGE_NOT_FOUND'
]);

const IGNORABLE_BETWEEN_PRODUCT_AND_PRICE = [
  /^promo$/i,
  /^termurah$/i,
  /^limited$/i,
  /^event$/i,
  /^best seller$/i,
  /^diskon\b/i,
  /^discount\b/i,
  /^\+?\d[\d.,]*\s*points?$/i,
  /^\d+\s*(?:item|items)$/i,
  /^\d[\d.,]*\s*\+\s*\d[\d.,]*\s*(?:bonus)?$/i,
  /^khusus\b/i
];

function providerError(
  code,
  message,
  details = {}
) {
  const error = new Error(message);

  error.code = code;

  Object.assign(
    error,
    details
  );

  return error;
}

function safeOrigin(value) {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function sameOrigin(
  left,
  right
) {
  try {
    return (
      new URL(left).origin ===
      new URL(right).origin
    );
  } catch {
    return false;
  }
}

function gameQuery(game) {
  return encodeURIComponent(
    String(
      game?.shortName ||
      game?.name ||
      game?.id ||
      ''
    )
  );
}

function expandPath(
  path,
  store,
  game
) {
  const origin =
    safeOrigin(
      store?.homepage
    );

  if (!origin) {
    return null;
  }

  try {
    const value =
      String(
        path || ''
      )
        .replaceAll(
          '{gameSlug}',
          String(
            game?.id || ''
          )
        )
        .replaceAll(
          '{gameQuery}',
          gameQuery(game)
        );

    return new URL(
      value,
      origin
    ).toString();
  } catch {
    return null;
  }
}

function uniqueEntries(entries) {
  const seen = new Set();

  return entries.filter(
    (entry) => {
      if (
        !entry?.url ||
        seen.has(entry.url)
      ) {
        return false;
      }

      seen.add(
        entry.url
      );

      return true;
    }
  );
}

function makeEntries(
  paths,
  store,
  game,
  mode
) {
  return (
    paths || []
  )
    .map(
      (path) => ({
        url:
          expandPath(
            path,
            store,
            game
          ),

        mode
      })
    )
    .filter(
      (entry) =>
        Boolean(
          entry.url
        )
    );
}

function makeInitialQueue(
  store,
  game,
  config
) {
  const special =
    config
      .specialPaths
      ?.[game?.id] ||
    [];

  /*
   * Priority:
   *
   * 1. URL khusus game
   * 2. URL product generic
   * 3. catalog scoped
   * 4. halaman discovery
   */
  return uniqueEntries([
    ...makeEntries(
      special,
      store,
      game,
      'page'
    ),

    ...makeEntries(
      config.paths,
      store,
      game,
      'page'
    ),

    ...makeEntries(
      config.catalogPaths,
      store,
      game,
      'catalog'
    ),

    ...makeEntries(
      config.discoveryPaths,
      store,
      game,
      'discovery'
    )
  ]);
}

function discoveredLinks(
  html,
  baseUrl,
  store,
  game,
  threshold
) {
  const origin =
    safeOrigin(
      store?.homepage
    );

  return extractLinks(
    html,
    baseUrl
  )
    .filter(
      (link) =>
        link?.href &&
        origin &&
        sameOrigin(
          link.href,
          origin
        )
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
        threshold
    )
    .sort(
      (a, b) =>
        b.score -
        a.score
    )
    .slice(
      0,
      6
    )
    .map(
      (link) =>
        link.href
    );
}

function normalizedGameIdentities(
  game
) {
  return [
    game?.id,
    game?.name,
    game?.shortName,
    ...(game?.aliases || [])
  ]
    .map(
      normalizeText
    )
    .filter(
      (value) =>
        value &&
        value.length >= 4
    );
}

function normalizedUnits(
  game
) {
  return (
    game?.unitAliases ||
    []
  )
    .map(
      normalizeText
    )
    .filter(Boolean);
}

function containsNormalizedPhrase(
  text,
  phrase
) {
  const haystack =
    ` ${normalizeText(text)} `;

  const needle =
    ` ${normalizeText(phrase)} `;

  return (
    needle.trim().length >
      1 &&
    haystack.includes(
      needle
    )
  );
}

function explicitGameMatch(
  text,
  game
) {
  return normalizedGameIdentities(
    game
  )
    .some(
      (identity) =>
        containsNormalizedPhrase(
          text,
          identity
        )
    );
}

function unitMatch(
  text,
  game
) {
  return normalizedUnits(
    game
  )
    .some(
      (unit) =>
        containsNormalizedPhrase(
          text,
          unit
        )
    );
}

function namedPackageMatchesGame(
  text,
  game
) {
  const value =
    normalizeText(text);

  if (
    game?.id ===
      'mobile-legends' &&
    /\b(?:weekly diamond(?:s)? pass|weekly pass|weekly elite|monthly elite|starlight|twilight pass)\b/i
      .test(value)
  ) {
    return true;
  }

  if (
    game?.id ===
      'genshin-impact' &&
    /\b(?:welkin|blessing of the welkin moon)\b/i
      .test(value)
  ) {
    return true;
  }

  if (
    game?.id ===
      'honkai-star-rail' &&
    /\bexpress supply pass\b/i
      .test(value)
  ) {
    return true;
  }

  if (
    game?.id ===
      'wuthering-waves' &&
    /\blunite subscription\b/i
      .test(value)
  ) {
    return true;
  }

  return false;
}

function recoveryNameMatchesGame(
  name,
  game,
  {
    pageIsVerified = false,
    scopedToGame = false
  } = {}
) {
  if (
    explicitGameMatch(
      name,
      game
    )
  ) {
    return true;
  }

  if (
    unitMatch(
      name,
      game
    )
  ) {
    /*
     * Unit seperti "Diamonds" dapat dipakai banyak game.
     * Karena itu hanya diterima jika halaman sudah
     * tervalidasi atau parser sedang berada dalam scope
     * game tertentu.
     */
    return (
      pageIsVerified ||
      scopedToGame
    );
  }

  if (
    namedPackageMatchesGame(
      name,
      game
    )
  ) {
    return (
      pageIsVerified ||
      scopedToGame
    );
  }

  return false;
}

function isRecoveryProductName(
  line,
  game
) {
  if (
    isProductName(line)
  ) {
    return true;
  }

  return namedPackageMatchesGame(
    line,
    game
  );
}

function isIgnorableLine(
  line
) {
  const value =
    String(
      line || ''
    )
      .replace(
        /\s+/g,
        ' '
      )
      .trim();

  return (
    IGNORABLE_BETWEEN_PRODUCT_AND_PRICE
      .some(
        (pattern) =>
          pattern.test(value)
      )
  );
}

function createOffer(
  store,
  game,
  {
    name,
    price,
    priceText,
    purchaseUrl,
    source,
    index
  }
) {
  return {
    id:
      `${store.id}-${game.id}-${source}-${index}`,

    storeId:
      store.id,

    storeName:
      store.name,

    gameId:
      game.id,

    originalName:
      String(name)
        .replace(
          /\s+/g,
          ' '
        )
        .trim(),

    productPrice:
      price,

    finalPrice:
      price,

    feeStatus:
      'unknown',

    priceText:
      priceText ||
      null,

    purchaseUrl,

    source,

    checkedAt:
      new Date()
        .toISOString()
  };
}

function findPriceAfter(
  lines,
  productIndex,
  maxDistance = 7
) {
  const end =
    Math.min(
      lines.length - 1,
      productIndex +
        maxDistance
    );

  for (
    let cursor =
      productIndex;
    cursor <= end;
    cursor += 1
  ) {
    const line =
      lines[cursor];

    if (
      cursor >
        productIndex &&
      isIgnorableLine(
        line
      )
    ) {
      continue;
    }

    if (
      cursor >
        productIndex &&
      isProductName(
        line
      )
    ) {
      /*
       * Jangan menyeberang ke product card berikutnya.
       */
      break;
    }

    if (
      /(?:\bIDR\b|\bRp\s*\.?)/i
        .test(line)
    ) {
      const price =
        parseRupiah(
          line
        );

      if (
        price &&
        price > 0
      ) {
        return {
          price,

          priceText:
            line
        };
      }
    }
  }

  return null;
}

function parseTolerantVisibleOffers(
  html,
  finalUrl,
  store,
  game,
  {
    pageIsVerified = false,
    scopedToGame = false,
    source =
      'recovery-visible'
  } = {}
) {
  const lines =
    htmlToLines(
      html
    );

  const offers = [];

  for (
    let index = 0;
    index <
      lines.length;
    index += 1
  ) {
    const name =
      lines[index];

    if (
      !isRecoveryProductName(
        name,
        game
      )
    ) {
      continue;
    }

    if (
      !recoveryNameMatchesGame(
        name,
        game,
        {
          pageIsVerified,
          scopedToGame
        }
      )
    ) {
      continue;
    }

    const priceResult =
      findPriceAfter(
        lines,
        index,
        8
      );

    if (
      !priceResult
    ) {
      continue;
    }

    offers.push(
      createOffer(
        store,
        game,
        {
          name,

          price:
            priceResult.price,

          priceText:
            priceResult.priceText,

          purchaseUrl:
            finalUrl,

          source,

          index:
            offers.length +
            1
        }
      )
    );
  }

  return dedupeOffers(
    offers
  );
}

function decodeSerializedText(
  html
) {
  /*
   * Tidak mengeksekusi JavaScript.
   *
   * Kita hanya mengubah serialized framework payload
   * menjadi teks yang lebih mudah diparsing.
   */
  return decodeEntities(
    String(
      html || ''
    )
      .replace(
        /\\u00a0/gi,
        ' '
      )
      .replace(
        /\\u0020/gi,
        ' '
      )
      .replace(
        /\\u0026/gi,
        '&'
      )
      .replace(
        /\\u003a/gi,
        ':'
      )
      .replace(
        /\\u002c/gi,
        ','
      )
      .replace(
        /\\u002e/gi,
        '.'
      )
      .replace(
        /\\x3c/gi,
        '<'
      )
      .replace(
        /\\x3e/gi,
        '>'
      )
      .replace(
        /\\x26/gi,
        '&'
      )
      .replace(
        /\\n|\\r|\\t/g,
        '\n'
      )
      .replace(
        /\\"/g,
        '"'
      )
      .replace(
        /\\\//g,
        '/'
      )
      .replace(
        /<br\s*\/?>/gi,
        '\n'
      )
      .replace(
        /<\/(?:div|p|li|span|section|article|button|h[1-6])>/gi,
        '\n'
      )
      .replace(
        /<[^>]+>/g,
        ' '
      )
  )
    .replace(
      /\r/g,
      '\n'
    );
}

function extractQuotedNameCandidates(
  text
) {
  const candidates = [];

  const keyPattern =
    /["']?(?:productName|product_name|denomination|variantName|variant_name|itemName|item_name|title|label|name)["']?\s*[:=]\s*["']([^"'\\]{2,180})["']/gi;

  for (
    const match of
    text.matchAll(
      keyPattern
    )
  ) {
    candidates.push({
      name:
        match[1],

      start:
        match.index ||
        0,

      end:
        (match.index || 0) +
        match[0].length
    });

    if (
      candidates.length >=
      400
    ) {
      break;
    }
  }

  return candidates;
}

function extractHumanProductCandidates(
  text,
  game
) {
  const candidates = [];

  const unitTokens =
    (
      game?.unitAliases ||
      []
    )
      .map(
        (unit) =>
          String(unit)
            .trim()
      )
      .filter(Boolean)
      .map(
        (unit) =>
          unit.replace(
            /[.*+?^${}()|[\]\\]/g,
            '\\$&'
          )
      );

  if (
    unitTokens.length
  ) {
    const unitPattern =
      unitTokens.join('|');

    const regex =
      new RegExp(
        `\\b\\d[\\d.,]*(?:\\s*\\([^\\n]{0,60}\\))?(?:\\s*\\+\\s*\\d[\\d.,]*)?\\s*(?:${unitPattern})\\b`,
        'gi'
      );

    for (
      const match of
      text.matchAll(
        regex
      )
    ) {
      candidates.push({
        name:
          match[0],

        start:
          match.index ||
          0,

        end:
          (match.index || 0) +
          match[0].length
      });

      if (
        candidates.length >=
          400
      ) {
        break;
      }
    }
  }

  if (
    game?.id ===
      'mobile-legends'
  ) {
    const packageRegex =
      /\b(?:\d+x\s+)?(?:weekly diamond(?:s)? pass|weekly pass|weekly elite(?: pack)?|monthly elite(?: pack)?|starlight(?: member)?|twilight pass)\b/gi;

    for (
      const match of
      text.matchAll(
        packageRegex
      )
    ) {
      candidates.push({
        name:
          match[0],

        start:
          match.index ||
          0,

        end:
          (match.index || 0) +
          match[0].length
      });
    }
  }

  return candidates;
}

function priceCandidatesInWindow(
  windowText
) {
  const candidates = [];

  /*
   * Explicit Rupiah/IDR adalah kandidat terkuat.
   */
  const rupiahRegex =
    /(?:\bIDR\b|\bRp\s*\.?)\s*[:=\-]?\s*[0-9][0-9.,]*/gi;

  for (
    const match of
    windowText.matchAll(
      rupiahRegex
    )
  ) {
    const price =
      parseRupiah(
        match[0]
      );

    if (
      price &&
      price > 0
    ) {
      candidates.push({
        price,

        priceText:
          match[0],

        offset:
          match.index ||
          0,

        confidence:
          3
      });
    }
  }

  /*
   * JSON/state sering menyimpan harga sebagai angka tanpa Rp.
   *
   * Hanya field yang namanya jelas berkaitan dengan harga.
   */
  const keyedPriceRegex =
    /["']?(?:sellingPrice|selling_price|sellPrice|sell_price|salePrice|sale_price|finalPrice|final_price|discountPrice|discount_price|productPrice|product_price|price)["']?\s*[:=]\s*["']?([0-9][0-9.,]*)["']?/gi;

  for (
    const match of
    windowText.matchAll(
      keyedPriceRegex
    )
  ) {
    const price =
      parseRupiah(
        match[1]
      );

    if (
      price &&
      price > 0
    ) {
      candidates.push({
        price,

        priceText:
          match[0],

        offset:
          match.index ||
          0,

        confidence:
          2
      });
    }
  }

  return candidates;
}

function nearestPrice(
  text,
  candidate
) {
  const before =
    Math.max(
      0,
      candidate.start -
        220
    );

  const after =
    Math.min(
      text.length,
      candidate.end +
        420
    );

  const windowText =
    text.slice(
      before,
      after
    );

  const nameCenter =
    candidate.start -
    before +
    (
      candidate.end -
      candidate.start
    ) /
      2;

  const prices =
    priceCandidatesInWindow(
      windowText
    );

  if (
    !prices.length
  ) {
    return null;
  }

  prices.sort(
    (
      left,
      right
    ) => {
      if (
        right.confidence !==
        left.confidence
      ) {
        return (
          right.confidence -
          left.confidence
        );
      }

      return (
        Math.abs(
          left.offset -
          nameCenter
        ) -
        Math.abs(
          right.offset -
          nameCenter
        )
      );
    }
  );

  return prices[0];
}

function parseSerializedOffers(
  html,
  finalUrl,
  store,
  game,
  {
    pageIsVerified = false,
    scopedToGame = false
  } = {}
) {
  const text =
    decodeSerializedText(
      html
    );

  const candidates = [
    ...extractQuotedNameCandidates(
      text
    ),

    ...extractHumanProductCandidates(
      text,
      game
    )
  ];

  const offers = [];

  const seenCandidates =
    new Set();

  for (
    const candidate of
    candidates
  ) {
    const name =
      String(
        candidate.name ||
        ''
      )
        .replace(
          /\s+/g,
          ' '
        )
        .trim();

    const key =
      `${normalizeText(name)}:${candidate.start}`;

    if (
      !name ||
      seenCandidates.has(
        key
      )
    ) {
      continue;
    }

    seenCandidates.add(
      key
    );

    if (
      !recoveryNameMatchesGame(
        name,
        game,
        {
          pageIsVerified,
          scopedToGame
        }
      )
    ) {
      continue;
    }

    const price =
      nearestPrice(
        text,
        candidate
      );

    if (
      !price
    ) {
      continue;
    }

    offers.push(
      createOffer(
        store,
        game,
        {
          name,

          price:
            price.price,

          priceText:
            price.priceText,

          purchaseUrl:
            finalUrl,

          source:
            'recovery-serialized',

          index:
            offers.length +
            1
        }
      )
    );

    if (
      offers.length >=
      150
    ) {
      break;
    }
  }

  return dedupeOffers(
    offers
  );
}

function parseScopedCatalogOffers(
  html,
  finalUrl,
  store,
  game
) {
  const lines =
    htmlToLines(
      html
    );

  const offers = [];

  let scopeUntil = -1;

  for (
    let index = 0;
    index <
      lines.length;
    index += 1
  ) {
    const line =
      lines[index];

    if (
      explicitGameMatch(
        line,
        game
      )
    ) {
      /*
       * Contoh pola:
       *
       * Mobile Legends
       * 3 Diamonds
       * Rp 1.099
       *
       * atau:
       *
       * Mobile Legends - 3 Diamonds
       * Rp 1.099
       */
      scopeUntil =
        Math.max(
          scopeUntil,
          index +
            7
        );
    }

    if (
      !isRecoveryProductName(
        line,
        game
      )
    ) {
      continue;
    }

    const explicit =
      explicitGameMatch(
        line,
        game
      );

    const insideScope =
      index <=
      scopeUntil;

    if (
      !explicit &&
      !insideScope
    ) {
      continue;
    }

    if (
      !recoveryNameMatchesGame(
        line,
        game,
        {
          scopedToGame:
            true
        }
      )
    ) {
      continue;
    }

    const priceResult =
      findPriceAfter(
        lines,
        index,
        6
      );

    if (
      !priceResult
    ) {
      continue;
    }

    offers.push(
      createOffer(
        store,
        game,
        {
          name:
            line,

          price:
            priceResult.price,

          priceText:
            priceResult.priceText,

          purchaseUrl:
            finalUrl,

          source:
            'recovery-catalog',

          index:
            offers.length +
            1
        }
      )
    );

    if (
      offers.length >=
      150
    ) {
      break;
    }
  }

  /*
   * Serialized fallback juga dicoba pada katalog.
   */
  return dedupeOffers([
    ...offers,

    ...parseSerializedOffers(
      html,
      finalUrl,
      store,
      game,
      {
        scopedToGame:
          true
      }
    )
  ]);
}

function shouldAttemptParserRecovery(
  store,
  error
) {
  if (
    !RECOVERY_CONFIG[
      store?.id
    ]
  ) {
    return false;
  }

  return RECOVERABLE_CODES.has(
    String(
      error?.code ||
      ''
    )
      .toUpperCase()
  );
}

function enqueueDiscovered(
  queue,
  attempted,
  discovered
) {
  const current =
    new Set(
      queue.map(
        (entry) =>
          entry.url
      )
    );

  const entries =
    discovered
      .filter(
        (url) =>
          !attempted.has(
            url
          ) &&
          !current.has(
            url
          )
      )
      .map(
        (url) => ({
          url,

          mode:
            'page'
        })
      );

  /*
   * Link hasil discovery diprioritaskan.
   */
  queue.unshift(
    ...entries
  );
}

async function tryParserRecovery(
  store,
  game,
  options = {},
  originalError = null
) {
  const config =
    RECOVERY_CONFIG[
      store?.id
    ];

  if (!config) {
    throw (
      originalError ||
      providerError(
        'PARSER_FAILED',
        'Parser recovery tidak dikonfigurasi untuk toko ini'
      )
    );
  }

  const timeoutMs =
    Math.max(
      2500,
      Math.min(
        9000,
        Number(
          options.timeoutMs ||
          6500
        )
      )
    );

  const maxProbes =
    Math.max(
      2,
      Math.min(
        10,
        Number(
          config.maxProbes ||
          6
        )
      )
    );

  const linkThreshold =
    Number(
      config.linkThreshold ||
      70
    );

  const queue =
    makeInitialQueue(
      store,
      game,
      config
    );

  const attempted =
    new Set();

  const diagnostics =
    [];

  let strongestError =
    originalError;

  while (
    queue.length &&
    attempted.size <
      maxProbes
  ) {
    const candidate =
      queue.shift();

    const candidateUrl =
      candidate?.url;

    if (
      !candidateUrl ||
      attempted.has(
        candidateUrl
      )
    ) {
      continue;
    }

    attempted.add(
      candidateUrl
    );

    try {
      const page =
        await fetchText(
          candidateUrl,
          {
            timeoutMs,

            retries:
              0,

            headers: {
              'accept-language':
                'id-ID,id;q=0.9,en-US;q=0.7,en;q=0.6'
            }
          }
        );

      const finalUrl =
        page.finalUrl ||
        candidateUrl;

      const discovered =
        discoveredLinks(
          page.text,
          finalUrl,
          store,
          game,
          linkThreshold
        );

      enqueueDiscovered(
        queue,
        attempted,
        discovered
      );

      /*
       * ==================================================
       * DISCOVERY MODE
       * ==================================================
       */
      if (
        candidate.mode ===
        'discovery'
      ) {
        diagnostics.push({
          url:
            candidateUrl,

          finalUrl,

          mode:
            candidate.mode,

          result:
            'DISCOVERY_ONLY',

          discoveredLinks:
            discovered.length
        });

        continue;
      }

      /*
       * ==================================================
       * CATALOG MODE
       * ==================================================
       *
       * Tidak menjalankan page-level validation karena
       * katalog dapat berisi banyak game.
       *
       * Parser mengunci scope pada game target.
       */
      if (
        candidate.mode ===
        'catalog'
      ) {
        const catalogOffers =
          parseScopedCatalogOffers(
            page.text,
            finalUrl,
            store,
            game
          );

        diagnostics.push({
          url:
            candidateUrl,

          finalUrl,

          mode:
            candidate.mode,

          result:
            catalogOffers.length
              ? 'SUCCESS'
              : 'CATALOG_NO_MATCH',

          offerCount:
            catalogOffers.length,

          discoveredLinks:
            discovered.length
        });

        if (
          catalogOffers.length
        ) {
          return catalogOffers.map(
            (offer) => ({
              ...offer,

              accessStrategy:
                'parser-recovery'
            })
          );
        }

        continue;
      }

      /*
       * ==================================================
       * PRODUCT PAGE MODE
       * ==================================================
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
        diagnostics.push({
          url:
            candidateUrl,

          finalUrl,

          mode:
            candidate.mode,

          result:
            'PAGE_NOT_VERIFIED',

          validationReason:
            validation.reason,

          validationScore:
            validation.score,

          discoveredLinks:
            discovered.length
        });

        strongestError =
          pickStrongerError(
            strongestError,

            providerError(
              'PAGE_NOT_VERIFIED',

              `Recovery candidate tidak cocok: ${validation.reason}`,

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
       * ==================================================
       * 1. UNIVERSAL PARSER EXISTING
       * ==================================================
       */
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
        diagnostics.push({
          url:
            candidateUrl,

          finalUrl,

          mode:
            candidate.mode,

          result:
            'SUCCESS_UNIVERSAL',

          offerCount:
            parsed.offers.length
        });

        return parsed.offers.map(
          (offer) => ({
            ...offer,

            accessStrategy:
              'parser-recovery'
          })
        );
      }

      /*
       * ==================================================
       * 2. TOLERANT VISIBLE PARSER
       * ==================================================
       *
       * Menangani pola seperti:
       *
       * 5 Diamonds
       * Diskon
       * Rp 1.900
       *
       * atau variasi text node lain.
       */
      const visibleOffers =
        parseTolerantVisibleOffers(
          page.text,
          finalUrl,
          store,
          game,
          {
            pageIsVerified:
              true
          }
        );

      if (
        visibleOffers.length
      ) {
        diagnostics.push({
          url:
            candidateUrl,

          finalUrl,

          mode:
            candidate.mode,

          result:
            'SUCCESS_VISIBLE_RECOVERY',

          offerCount:
            visibleOffers.length,

          originalParserReason:
            parsed
              .diagnostics
              ?.parserReason ||
            null
        });

        return visibleOffers.map(
          (offer) => ({
            ...offer,

            accessStrategy:
              'parser-recovery'
          })
        );
      }

      /*
       * ==================================================
       * 3. SERIALIZED / HYDRATION PARSER
       * ==================================================
       *
       * Menangani Next.js, React hydration, Nuxt,
       * JSON/script state, dan payload lain yang membawa
       * product + price tetapi belum muncul di visible DOM.
       */
      const serializedOffers =
        parseSerializedOffers(
          page.text,
          finalUrl,
          store,
          game,
          {
            pageIsVerified:
              true
          }
        );

      const dynamic =
        detectDynamicPageSignals(
          page.text
        );

      diagnostics.push({
        url:
          candidateUrl,

        finalUrl,

        mode:
          candidate.mode,

        result:
          serializedOffers.length
            ? 'SUCCESS_SERIALIZED_RECOVERY'
            : 'PARSER_FAILED',

        offerCount:
          serializedOffers.length,

        originalParserReason:
          parsed
            .diagnostics
            ?.parserReason ||
          null,

        frameworks:
          dynamic.frameworks,

        apiHints:
          dynamic.apiHints,

        likelyDynamic:
          dynamic.likelyDynamic,

        discoveredLinks:
          discovered.length
      });

      if (
        serializedOffers.length
      ) {
        return serializedOffers.map(
          (offer) => ({
            ...offer,

            accessStrategy:
              'parser-recovery'
          })
        );
      }

      strongestError =
        pickStrongerError(
          strongestError,

          providerError(
            'PARSER_FAILED',

            'Recovery menemukan halaman game, tetapi visible DOM dan serialized state belum menghasilkan offer',

            {
              finalUrl,

              parserReason:
                parsed
                  .diagnostics
                  ?.parserReason ||
                (
                  dynamic.likelyDynamic
                    ? 'JS_RENDERED_CONTENT'
                    : 'UNSUPPORTED_STRUCTURE'
                ),

              parserDiagnostics:
                parsed.diagnostics,

              dynamicDiagnostics:
                dynamic
            }
          )
        );
    } catch (error) {
      diagnostics.push({
        url:
          candidateUrl,

        mode:
          candidate?.mode ||
          null,

        result:
          error?.code ||
          'UNKNOWN_ERROR',

        status:
          error?.status ??
          null
      });

      strongestError =
        pickStrongerError(
          strongestError,
          error
        );

      /*
       * Jangan memaksa request tambahan ketika server
       * melakukan rate limit atau access block.
       */
      if (
        [
          'RATE_LIMITED',
          'ACCESS_BLOCKED'
        ].includes(
          String(
            error?.code ||
            ''
          )
            .toUpperCase()
        )
      ) {
        break;
      }
    }
  }

  const finalError =
    strongestError ||
    providerError(
      'PARSER_FAILED',
      'Parser recovery tidak menemukan offer yang dapat digunakan'
    );

  finalError
    .parserRecoveryDiagnostics = {
      storeId:
        store.id,

      gameId:
        game?.id ||
        null,

      maxProbes,

      attemptedUrls:
        [
          ...attempted
        ],

      attempts:
        diagnostics
    };

  throw finalError;
}

module.exports = {
  RECOVERY_CONFIG,
  shouldAttemptParserRecovery,
  tryParserRecovery,

  /*
   * Export helper agar dapat digunakan
   * oleh regression/unit test.
   */
  parseTolerantVisibleOffers,
  parseSerializedOffers,
  parseScopedCatalogOffers
};
