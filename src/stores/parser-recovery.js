'use strict';

const { fetchText } = require('../services/http');

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

const RECOVERY_VERSION =
  '2026-08-12-v3';

/*
 * ============================================================
 * PARSER RECOVERY
 * ============================================================
 *
 * Recovery hanya aktif untuk toko yang memang pernah
 * membutuhkan fallback tambahan.
 *
 * Store lainnya tetap memakai universal parser normal.
 */
const RECOVERY_CONFIG = {
  /*
   * ========================================================
   * GIGAMES
   * ========================================================
   */
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
     * Homepage Gigames juga dapat mempunyai card:
     *
     * Mobile Legends
     * 12 Diamond
     * Rp ...
     *
     * sehingga boleh digunakan sebagai catalog fallback.
     */
    catalogPaths: [
      '/en',
      '/id',
      '/services'
    ],

    discoveryPaths: [
      '/'
    ],

    maxProbes: 9,

    linkThreshold: 68
  },

  /*
   * ========================================================
   * OURA STORE
   * ========================================================
   */
  'oura-store': {
    paths: [
      '/id-id/{gameSlug}',
      '/id/{gameSlug}',
      '/{gameSlug}'
    ],

    specialPaths: {
      'mobile-legends': [
        '/id-id/mobile-legends',
        '/id-id/mobile-legends?from=undefined'
      ]
    },

    discoveryPaths: [
      '/id-id',
      '/'
    ],

    maxProbes: 7,

    linkThreshold: 72
  },

  /*
   * ========================================================
   * SEAGM
   * ========================================================
   */
  seagm: {
    paths: [
      '/id-id/{gameSlug}',
      '/id/{gameSlug}',
      '/{gameSlug}'
    ],

    specialPaths: {
      'mobile-legends': [
        '/id-id/mlbb-diamonds-top-up-id',
        '/id-id/mobile-legends-diamonds-top-up',
        '/id-id/mobile-legends'
      ]
    },

    discoveryPaths: [
      '/id-id/search?keywords={gameQuery}',
      '/id-id'
    ],

    maxProbes: 9,

    linkThreshold: 66
  },

  /*
   * ========================================================
   * KIOS GAME INDONESIA
   * ========================================================
   */
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

  /*
   * ========================================================
   * TOPUPDEH
   * ========================================================
   */
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
   * ========================================================
   * CASA TOPUP
   *
   * Profile lama dipertahankan agar tidak regression.
   * ========================================================
   */
  casatopup: {
    paths: [
      '/id/beli/{gameSlug}',
      '/en-id/beli/{gameSlug}',
      '/beli/{gameSlug}'
    ],

    discoveryPaths: [
      '/id',
      '/'
    ],

    maxProbes: 6,

    linkThreshold: 70
  },

  /*
   * ========================================================
   * TOPUPGAMEZ
   * ========================================================
   */
  topupgamez: {
    paths: [
      '/beli/{gameSlug}',
      '/id/beli/{gameSlug}',
      '/en-id/beli/{gameSlug}'
    ],

    discoveryPaths: [
      '/id',
      '/'
    ],

    maxProbes: 6,

    linkThreshold: 70
  },

  /*
   * ========================================================
   * BXY STORE
   * ========================================================
   */
  bxystore: {
    paths: [
      '/en-id/beli/{gameSlug}',
      '/id/beli/{gameSlug}',
      '/beli/{gameSlug}'
    ],

    discoveryPaths: [
      '/en-id',
      '/'
    ],

    maxProbes: 6,

    linkThreshold: 70
  },

  /*
   * ========================================================
   * SON TOPUP
   * ========================================================
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

  /*
   * ========================================================
   * YOGGSTORE
   * ========================================================
   */
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

const RECOVERABLE_CODES =
  new Set([
    'PARSER_FAILED',
    'PAGE_NOT_VERIFIED',
    'PAGE_NOT_FOUND'
  ]);

/*
 * Baris seperti ini boleh berada di antara
 * product name dengan price.
 */
const IGNORABLE_LINES = [
  /^promo$/i,
  /^termurah$/i,
  /^limited$/i,
  /^event$/i,
  /^best seller$/i,

  /^diskon\b/i,
  /^discount\b/i,

  /^khusus\b/i,

  /^\+?\d[\d.,]*\s*points?$/i,

  /^\d+\s*(?:item|items)$/i,

  /^\d[\d.,]*\s*\+\s*\d[\d.,]*\s*(?:bonus)?$/i,

  /^\d[\d.,]*\s*\+\s*\d[\d.,]*\s*bonus\b/i
];

/*
 * ============================================================
 * ERROR
 * ============================================================
 */
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

/*
 * ============================================================
 * URL HELPERS
 * ============================================================
 */
function safeOrigin(
  value
) {
  try {
    return new URL(
      value
    ).origin;
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

function gameQuery(
  game
) {
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
        path ||
        ''
      )
        .replaceAll(
          '{gameSlug}',
          String(
            game?.id ||
            ''
          )
        )
        .replaceAll(
          '{gameQuery}',
          gameQuery(
            game
          )
        );

    return new URL(
      value,
      origin
    ).toString();
  } catch {
    return null;
  }
}

function makeEntries(
  paths,
  store,
  game,
  mode
) {
  return (
    paths ||
    []
  )
    .map(
      (
        path
      ) => ({
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
      (
        entry
      ) =>
        Boolean(
          entry.url
        )
    );
}

function uniqueEntries(
  entries
) {
  const seen =
    new Set();

  return entries.filter(
    (
      entry
    ) => {
      if (
        !entry?.url ||
        seen.has(
          entry.url
        )
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

function makeInitialQueue(
  store,
  game,
  config
) {
  const specialPaths =
    config
      .specialPaths
      ?.[
        game?.id
      ] ||
    [];

  /*
   * Priority:
   *
   * 1. exact/special game page
   * 2. generic product page
   * 3. catalog page
   * 4. discovery page
   */
  return uniqueEntries([
    ...makeEntries(
      specialPaths,
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

/*
 * ============================================================
 * URL DISCOVERY
 * ============================================================
 */
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
      (
        link
      ) =>
        link?.href &&
        origin &&
        sameOrigin(
          link.href,
          origin
        )
    )
    .map(
      (
        link
      ) => ({
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
      (
        link
      ) =>
        link.score >=
        threshold
    )
    .sort(
      (
        left,
        right
      ) =>
        right.score -
        left.score
    )
    .slice(
      0,
      8
    )
    .map(
      (
        link
      ) =>
        link.href
    );
}

function enqueueDiscovered(
  queue,
  attempted,
  urls
) {
  const queued =
    new Set(
      queue.map(
        (
          entry
        ) =>
          entry.url
      )
    );

  const additions =
    urls
      .filter(
        (
          url
        ) =>
          !attempted.has(
            url
          ) &&
          !queued.has(
            url
          )
      )
      .map(
        (
          url
        ) => ({
          url,

          mode:
            'page'
        })
      );

  /*
   * Discovered game page diprioritaskan
   * dibanding seed berikutnya.
   */
  queue.unshift(
    ...additions
  );
}

/*
 * ============================================================
 * GAME MATCHING
 * ============================================================
 */
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
      (
        value
      ) =>
        value &&
        value.length >=
          4
    );
}

function normalizedUnits(
  game
) {
  return (
    game
      ?.unitAliases ||
    []
  )
    .map(
      normalizeText
    )
    .filter(
      Boolean
    );
}

function containsNormalizedPhrase(
  text,
  phrase
) {
  const haystack =
    ` ${normalizeText(
      text
    )} `;

  const needle =
    ` ${normalizeText(
      phrase
    )} `;

  return (
    needle
      .trim()
      .length >
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
      (
        identity
      ) =>
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
      (
        unit
      ) =>
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
    normalizeText(
      text
    );

  /*
   * Mobile Legends
   */
  if (
    game?.id ===
      'mobile-legends' &&
    /\b(?:weekly diamond(?:s)? pass|weekly pass|weekly elite|monthly elite|starlight|twilight pass)\b/i
      .test(
        value
      )
  ) {
    return true;
  }

  /*
   * Genshin
   */
  if (
    game?.id ===
      'genshin-impact' &&
    /\b(?:welkin|blessing of the welkin moon)\b/i
      .test(
        value
      )
  ) {
    return true;
  }

  /*
   * Honkai Star Rail
   */
  if (
    game?.id ===
      'honkai-star-rail' &&
    /\bexpress supply pass\b/i
      .test(
        value
      )
  ) {
    return true;
  }

  /*
   * Wuthering Waves
   */
  if (
    game?.id ===
      'wuthering-waves' &&
    /\blunite subscription\b/i
      .test(
        value
      )
  ) {
    return true;
  }

  return false;
}

function recoveryNameMatchesGame(
  name,
  game,
  {
    pageIsVerified =
      false,

    scopedToGame =
      false
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

  /*
   * "Diamonds" saja belum cukup karena dipakai
   * banyak game.
   *
   * Unit boleh dipakai hanya jika page sudah
   * terverifikasi atau catalog scope sudah terkunci.
   */
  if (
    unitMatch(
      name,
      game
    ) ||
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
  value,
  game
) {
  return (
    isProductName(
      value
    ) ||
    namedPackageMatchesGame(
      value,
      game
    )
  );
}

/*
 * ============================================================
 * PRICE PARSING
 * ============================================================
 */
function isIgnorableLine(
  value
) {
  const text =
    String(
      value ||
      ''
    )
      .replace(
        /\s+/g,
        ' '
      )
      .trim();

  return IGNORABLE_LINES
    .some(
      (
        pattern
      ) =>
        pattern.test(
          text
        )
    );
}

/*
 * Recovery melakukan normalisasi lokal.
 *
 * Ini membuat format berikut tetap terbaca:
 *
 * Rp 1.000
 * Rp. 1.000
 * Rp . 1.000
 * Rp: 1.000
 * IDR 1000
 * IDR: 1000
 *
 * sehingga tidak bergantung pada money.js
 * terbaru.
 */
function parseRecoveryRupiah(
  value
) {
  const normalized =
    String(
      value ??
      ''
    )
      .replace(
        /\u00a0/g,
        ' '
      )
      .replace(
        /[\u2007\u202f]/g,
        ' '
      )
      .replace(
        /\bRp\s*\.\s*/gi,
        'Rp '
      )
      .replace(
        /\bRp\s*:\s*/gi,
        'Rp '
      )
      .replace(
        /\bIDR\s*:\s*/gi,
        'IDR '
      )
      .trim();

  return parseRupiah(
    normalized
  );
}

function firstRupiahFromLine(
  line
) {
  const text =
    String(
      line ||
      ''
    );

  /*
   * Harga pertama dianggap selling/current price.
   *
   * Contoh Kios Game:
   *
   * Rp 1.099 Rp 1.209
   *
   * menghasilkan 1099.
   */
  const matches =
    text.match(
      /(?:\bIDR\b|\bRp\s*\.?)\s*[:=\-]?\s*[0-9][0-9.,]*/gi
    );

  if (
    !matches
      ?.length
  ) {
    return null;
  }

  for (
    const token
    of matches
  ) {
    const price =
      parseRecoveryRupiah(
        token
      );

    if (
      price &&
      price >
        0
    ) {
      return {
        price,

        priceText:
          token
      };
    }
  }

  return null;
}

/*
 * ============================================================
 * OFFER
 * ============================================================
 */
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
      String(
        name
      )
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
        .toISOString(),

    accessStrategy:
      'parser-recovery',

    recoveryVersion:
      RECOVERY_VERSION
  };
}

/*
 * ============================================================
 * VISIBLE DOM PARSER
 * ============================================================
 */
function findPriceAfter(
  lines,
  productIndex,
  maxDistance = 8
) {
  const end =
    Math.min(
      lines.length -
        1,

      productIndex +
        maxDistance
    );

  for (
    let cursor =
      productIndex;

    cursor <=
      end;

    cursor +=
      1
  ) {
    const line =
      lines[
        cursor
      ];

    /*
     * Promo / Bonus / Points tidak menghentikan
     * pencarian harga.
     */
    if (
      cursor >
        productIndex &&
      isIgnorableLine(
        line
      )
    ) {
      continue;
    }

    /*
     * Jangan mengambil harga dari product card
     * berikutnya.
     */
    if (
      cursor >
        productIndex &&
      isProductName(
        line
      )
    ) {
      break;
    }

    const result =
      firstRupiahFromLine(
        line
      );

    if (
      result
    ) {
      return result;
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
    pageIsVerified =
      false,

    scopedToGame =
      false,

    source =
      'recovery-visible'
  } = {}
) {
  const lines =
    htmlToLines(
      html
    );

  const offers =
    [];

  for (
    let index =
      0;

    index <
      lines.length;

    index +=
      1
  ) {
    const name =
      lines[
        index
      ];

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
            priceResult
              .price,

          priceText:
            priceResult
              .priceText,

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

/*
 * ============================================================
 * SERIALIZED / HYDRATION STATE
 * ============================================================
 */
function decodeSerializedText(
  html
) {
  /*
   * Tidak menjalankan JavaScript.
   *
   * Script/framework payload hanya dinormalisasi
   * menjadi plain text.
   */
  return decodeEntities(
    String(
      html ||
      ''
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
  const candidates =
    [];

  /*
   * Support berbagai naming convention:
   *
   * productName
   * product_name
   * variantName
   * itemName
   * denomination
   * title
   * label
   * name
   */
  const pattern =
    /["']?(?:productName|product_name|denomination|variantName|variant_name|itemName|item_name|title|label|name)["']?\s*[:=]\s*["']([^"'\\]{2,180})["']/gi;

  for (
    const match
    of text.matchAll(
      pattern
    )
  ) {
    candidates.push({
      name:
        match[
          1
        ],

      start:
        match.index ||
        0,

      end:
        (
          match.index ||
          0
        ) +
        match[
          0
        ].length
    });

    if (
      candidates.length >=
      500
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
  const candidates =
    [];

  const units =
    (
      game
        ?.unitAliases ||
      []
    )
      .map(
        (
          unit
        ) =>
          String(
            unit
          )
            .trim()
      )
      .filter(
        Boolean
      )
      .map(
        (
          unit
        ) =>
          unit.replace(
            /[.*+?^${}()|[\]\\]/g,
            '\\$&'
          )
      );

  /*
   * Contoh:
   *
   * 5 Diamonds
   * 12 Diamonds
   * 277 (250+27) Diamonds
   */
  if (
    units.length
  ) {
    const pattern =
      new RegExp(
        `\\b\\d[\\d.,]*(?:\\s*\\([^\\n]{0,60}\\))?(?:\\s*\\+\\s*\\d[\\d.,]*)?\\s*(?:${units.join(
          '|'
        )})\\b`,
        'gi'
      );

    for (
      const match
      of text.matchAll(
        pattern
      )
    ) {
      candidates.push({
        name:
          match[
            0
          ],

        start:
          match.index ||
          0,

        end:
          (
            match.index ||
            0
          ) +
          match[
            0
          ].length
      });

      if (
        candidates.length >=
        500
      ) {
        break;
      }
    }
  }

  /*
   * Mobile Legends mempunyai package yang
   * tidak selalu menggunakan kata Diamonds.
   */
  if (
    game?.id ===
    'mobile-legends'
  ) {
    const packages =
      /\b(?:\d+x\s+)?(?:weekly diamond(?:s)? pass|weekly pass|weekly elite(?: pack)?|monthly elite(?: pack)?|starlight(?: member)?|twilight pass)\b/gi;

    for (
      const match
      of text.matchAll(
        packages
      )
    ) {
      candidates.push({
        name:
          match[
            0
          ],

        start:
          match.index ||
          0,

        end:
          (
            match.index ||
            0
          ) +
          match[
            0
          ].length
      });
    }
  }

  return candidates;
}

function priceCandidatesInWindow(
  windowText
) {
  const candidates =
    [];

  /*
   * Explicit IDR adalah kandidat terbaik.
   */
  const explicit =
    /(?:\bIDR\b|\bRp\s*\.?)\s*[:=\-]?\s*[0-9][0-9.,]*/gi;

  for (
    const match
    of windowText.matchAll(
      explicit
    )
  ) {
    const price =
      parseRecoveryRupiah(
        match[
          0
        ]
      );

    if (
      price &&
      price >
        0
    ) {
      candidates.push({
        price,

        priceText:
          match[
            0
          ],

        offset:
          match.index ||
          0,

        confidence:
          3
      });
    }
  }

  /*
   * Framework state kadang menyimpan:
   *
   * price: 1099
   * sellingPrice: 1099
   * finalPrice: 1099
   */
  const keyedPrice =
    /["']?(?:sellingPrice|selling_price|sellPrice|sell_price|salePrice|sale_price|finalPrice|final_price|discountPrice|discount_price|productPrice|product_price|price)["']?\s*[:=]\s*["']?([0-9][0-9.,]*)["']?/gi;

  for (
    const match
    of windowText.matchAll(
      keyedPrice
    )
  ) {
    const price =
      parseRecoveryRupiah(
        match[
          1
        ]
      );

    if (
      price &&
      price >
        0
    ) {
      candidates.push({
        price,

        priceText:
          match[
            0
          ],

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
      /*
       * Explicit Rp / IDR lebih kuat daripada
       * generic JSON price key.
       */
      if (
        right.confidence !==
        left.confidence
      ) {
        return (
          right.confidence -
          left.confidence
        );
      }

      /*
       * Jika confidence sama, ambil yang paling
       * dekat dengan product name.
       */
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

  return prices[
    0
  ];
}

function parseSerializedOffers(
  html,
  finalUrl,
  store,
  game,
  {
    pageIsVerified =
      false,

    scopedToGame =
      false
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

  const seen =
    new Set();

  const offers =
    [];

  for (
    const candidate
    of candidates
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
      `${normalizeText(
        name
      )}:${candidate.start}`;

    if (
      !name ||
      seen.has(
        key
      )
    ) {
      continue;
    }

    seen.add(
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
      200
    ) {
      break;
    }
  }

  return dedupeOffers(
    offers
  );
}

/*
 * ============================================================
 * CATALOG PARSER
 * ============================================================
 */
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

  const offers =
    [];

  /*
   * Berapa line setelah nama game masih dianggap
   * bagian dari game tersebut.
   */
  let scopeUntil =
    -1;

  for (
    let index =
      0;

    index <
      lines.length;

    index +=
      1
  ) {
    const line =
      lines[
        index
      ];

    /*
     * Contoh:
     *
     * Mobile Legends
     * 12 Diamond
     * Rp 3.515
     */
    if (
      explicitGameMatch(
        line,
        game
      )
    ) {
      scopeUntil =
        Math.max(
          scopeUntil,
          index +
            8
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
        7
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
            priceResult
              .price,

          priceText:
            priceResult
              .priceText,

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
      200
    ) {
      break;
    }
  }

  /*
   * Catalog juga mungkin membawa structured /
   * hydration payload.
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

/*
 * ============================================================
 * SHOULD RECOVER
 * ============================================================
 */
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

/*
 * ============================================================
 * RECOVERY EXECUTOR
 * ============================================================
 */
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

  if (
    !config
  ) {
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
      /*
       * ======================================================
       * FETCH
       * ======================================================
       */
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

      /*
       * ======================================================
       * DISCOVER MORE PRODUCT URLS
       * ======================================================
       */
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
       * ======================================================
       * DISCOVERY ONLY
       * ======================================================
       */
      if (
        candidate.mode ===
        'discovery'
      ) {
        diagnostics.push({
          recoveryVersion:
            RECOVERY_VERSION,

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
       * ======================================================
       * CATALOG
       * ======================================================
       *
       * Catalog tidak memakai validatePageForGame karena
       * satu page dapat berisi banyak game.
       *
       * Sebagai gantinya parser melakukan scoped matching.
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
          recoveryVersion:
            RECOVERY_VERSION,

          url:
            candidateUrl,

          finalUrl,

          mode:
            candidate.mode,

          result:
            catalogOffers.length
              ? 'SUCCESS_CATALOG'
              : 'CATALOG_NO_MATCH',

          offerCount:
            catalogOffers.length,

          discoveredLinks:
            discovered.length
        });

        if (
          catalogOffers.length
        ) {
          return catalogOffers;
        }

        continue;
      }

      /*
       * ======================================================
       * VERIFY PRODUCT PAGE
       * ======================================================
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
          recoveryVersion:
            RECOVERY_VERSION,

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
       * ======================================================
       * PARSER #1
       *
       * Existing Universal Parser
       * ======================================================
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
        diagnostics.push({
          recoveryVersion:
            RECOVERY_VERSION,

          url:
            candidateUrl,

          finalUrl,

          mode:
            candidate.mode,

          result:
            'SUCCESS_UNIVERSAL',

          offerCount:
            parsed
              .offers
              .length
        });

        return parsed
          .offers
          .map(
            (
              offer
            ) => ({
              ...offer,

              accessStrategy:
                offer.accessStrategy ||
                'parser-recovery',

              recoveryVersion:
                RECOVERY_VERSION
            })
          );
      }

      /*
       * ======================================================
       * PARSER #2
       *
       * Tolerant Visible Parser
       * ======================================================
       *
       * Menangani:
       *
       * 3 Diamonds
       * 3 + 0 Bonus
       * Rp 1.099 Rp 1.209
       *
       * atau:
       *
       * Weekly Pass
       * Promo
       * Rp 27.900
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
          recoveryVersion:
            RECOVERY_VERSION,

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

        return visibleOffers;
      }

      /*
       * ======================================================
       * PARSER #3
       *
       * Serialized / Hydration Parser
       * ======================================================
       *
       * Digunakan jika product data ada pada:
       *
       * React state
       * Next data
       * Nuxt state
       * JSON-like script
       * hydration payload
       *
       * tetapi belum tampil sebagai DOM text biasa.
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
        recoveryVersion:
          RECOVERY_VERSION,

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
        return serializedOffers;
      }

      /*
       * ======================================================
       * NOTHING PARSED
       * ======================================================
       */
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
                parsed
                  .diagnostics,

              dynamicDiagnostics:
                dynamic
            }
          )
        );
    } catch (
      error
    ) {
      diagnostics.push({
        recoveryVersion:
          RECOVERY_VERSION,

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
          null,

        message:
          error?.message ||
          null
      });

      strongestError =
        pickStrongerError(
          strongestError,
          error
        );

      /*
       * Jika server secara eksplisit rate limit
       * atau memblokir request, jangan menambah probe.
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

  /*
   * ==========================================================
   * ALL RECOVERY FAILED
   * ==========================================================
   */
  const finalError =
    strongestError ||
    providerError(
      'PARSER_FAILED',
      'Parser recovery tidak menemukan offer yang dapat digunakan'
    );

  /*
   * Version marker sengaja dimasukkan.
   *
   * Kalau response masih tidak memiliki:
   *
   * recoveryVersion: "2026-08-12-v3"
   *
   * berarti deployment belum menggunakan file ini.
   */
  finalError
    .parserRecoveryDiagnostics = {
      recoveryVersion:
        RECOVERY_VERSION,

      storeId:
        store.id,

      gameId:
        game?.id ||
        null,

      maxProbes,

      attemptedUrls: [
        ...attempted
      ],

      attempts:
        diagnostics
    };

  throw finalError;
}

/*
 * ============================================================
 * EXPORT
 * ============================================================
 */
module.exports = {
  RECOVERY_VERSION,

  RECOVERY_CONFIG,

  shouldAttemptParserRecovery,

  tryParserRecovery,

  /*
   * Helper diexport untuk regression test.
   */
  parseTolerantVisibleOffers,

  parseSerializedOffers,

  parseScopedCatalogOffers
};
