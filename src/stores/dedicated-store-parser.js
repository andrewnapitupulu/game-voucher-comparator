'use strict';

const { fetchText } = require('../services/http');
const { decodeEntities, dedupeOffers } = require('../utils/html');
const { parseRupiah } = require('../utils/money');
const { normalizeText } = require('../config/games');

const DEDICATED_ADAPTER_VERSION =
  '2026-08-12-dedicated-v1';

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

function escapeRegExp(value) {
  return String(value || '')
    .replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&'
    );
}

function parseLooseRupiah(value) {
  const text =
    String(value ?? '')
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

  const normal =
    parseRupiah(text);

  if (
    normal &&
    normal > 0
  ) {
    return normal;
  }

  const match =
    text.match(
      /(?:\bIDR\b|\bRp\b)\s*([0-9][0-9.,]*)/i
    );

  if (!match) {
    return null;
  }

  const token =
    match[1];

  if (
    /^\d{1,3}(?:\.\d{3})+(?:,\d{2})?$/
      .test(token)
  ) {
    return (
      Number(
        token
          .replace(
            /\./g,
            ''
          )
          .replace(
            /,\d{2}$/,
            ''
          )
      ) ||
      null
    );
  }

  if (
    /^\d{1,3}(?:,\d{3})+(?:\.\d{2})?$/
      .test(token)
  ) {
    return (
      Number(
        token
          .replace(
            /,/g,
            ''
          )
          .replace(
            /\.\d{2}$/,
            ''
          )
      ) ||
      null
    );
  }

  return (
    Number(
      token.replace(
        /\D/g,
        ''
      )
    ) ||
    null
  );
}

function firstPrice(value) {
  const tokens =
    String(value || '')
      .match(
        /(?:\bIDR\b|\bRp\s*\.?)\s*[:=\-]?\s*[0-9][0-9.,]*/gi
      ) ||
    [];

  for (
    const token of
    tokens
  ) {
    const price =
      parseLooseRupiah(
        token
      );

    if (
      price &&
      price > 0
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

function baseHost(value) {
  try {
    return new URL(
      value
    )
      .hostname
      .toLowerCase()
      .replace(
        /^www\./,
        ''
      );
  } catch {
    return '';
  }
}

function sameSite(
  left,
  right
) {
  try {
    const host =
      new URL(left)
        .hostname
        .toLowerCase()
        .replace(
          /^www\./,
          ''
        );

    const base =
      baseHost(
        right
      );

    return (
      host === base ||
      host.endsWith(
        `.${base}`
      )
    );
  } catch {
    return false;
  }
}

function absoluteUrl(
  value,
  baseUrl
) {
  try {
    return new URL(
      value,
      baseUrl
    ).toString();
  } catch {
    return null;
  }
}

function extractAttributeText(
  html
) {
  const values =
    [];

  const pattern =
    /\b(?:alt|title|aria-label|data-name|data-title|data-product-name|data-variant-name|data-price)\s*=\s*["']([^"']{1,240})["']/gi;

  for (
    const match of
    String(
      html ||
      ''
    ).matchAll(
      pattern
    )
  ) {
    values.push(
      match[1]
    );

    if (
      values.length >=
      1200
    ) {
      break;
    }
  }

  return values.join(
    '\n'
  );
}

function decodeFrameworkText(
  value
) {
  return decodeEntities(
    String(
      value ||
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
        /\\u002f/gi,
        '/'
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
  );
}

function htmlToLines(
  html
) {
  const attrs =
    extractAttributeText(
      html
    );

  const body =
    String(
      html ||
      ''
    )
      .replace(
        /<style\b[^>]*>[\s\S]*?<\/style>/gi,
        ' '
      )
      .replace(
        /<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi,
        ' '
      )
      .replace(
        /<svg\b[^>]*>[\s\S]*?<\/svg>/gi,
        ' '
      )
      .replace(
        /<script\b[^>]*>[\s\S]*?<\/script>/gi,
        ' '
      )
      .replace(
        /<(?:br|\/p|\/div|\/li|\/tr|\/td|\/th|\/h[1-6]|\/section|\/article|\/button)>/gi,
        '\n'
      )
      .replace(
        /<[^>]+>/g,
        ' '
      );

  return decodeEntities(
    `${body}\n${attrs}`
  )
    .split(
      /\r?\n/
    )
    .map(
      (line) =>
        line
          .replace(
            /\s+/g,
            ' '
          )
          .replace(
            /^Image\s*:?\s*/i,
            ''
          )
          .replace(
            /^Image(?=\d)/i,
            ''
          )
          .trim()
    )
    .filter(
      Boolean
    );
}

function gameIdentities(
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
        value.length >=
          4
    );
}

function gameMatches(
  value,
  game
) {
  const text =
    ` ${normalizeText(
      value
    )} `;

  return gameIdentities(
    game
  )
    .some(
      (identity) =>
        text.includes(
          ` ${identity} `
        )
    );
}

function unitPattern(
  game
) {
  const units =
    (
      game?.unitAliases ||
      []
    )
      .map(
        escapeRegExp
      )
      .filter(
        Boolean
      );

  return units.length
    ? `(?:${units.join('|')})`
    : null;
}

function namedPackagePattern(
  game
) {
  if (
    game?.id ===
    'mobile-legends'
  ) {
    return /(?:weekly diamond(?:s)? pass(?:\s*\d+x)?|weekly pass(?:\s*\d+x)?|weekly elite(?:\s*pack)?|monthly elite(?:\s*pack)?|starlight(?:\s*member)?|twilight pass)/i;
  }

  if (
    game?.id ===
    'genshin-impact'
  ) {
    return /(?:welkin|blessing of the welkin moon)/i;
  }

  if (
    game?.id ===
    'honkai-star-rail'
  ) {
    return /express supply pass/i;
  }

  if (
    game?.id ===
    'wuthering-waves'
  ) {
    return /lunite subscription/i;
  }

  return null;
}

function extractProductName(
  value,
  game
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
      .replace(
        /^Image\s*:?\s*/i,
        ''
      )
      .replace(
        /^Image(?=\d)/i,
        ''
      )
      .trim();

  if (
    !text ||
    text.length > 260
  ) {
    return null;
  }

  const unit =
    unitPattern(
      game
    );

  if (unit) {
    const pattern =
      new RegExp(
        `\\d[\\d.,]*(?:\\s*\\([^\\n)]{1,70}\\))?(?:\\s*\\+\\s*\\d[\\d.,]*)?\\s*(?:bonus\\s*)?${unit}\\b`,
        'i'
      );

    const match =
      text.match(
        pattern
      );

    if (match) {
      return match[0]
        .trim();
    }
  }

  const named =
    namedPackagePattern(
      game
    );

  if (named) {
    const match =
      text.match(
        named
      );

    if (match) {
      return match[0]
        .trim();
    }
  }

  /*
   * Kios Game kadang menggunakan:
   *
   * 100 (50 + 50 Bonus)
   *
   * tanpa kata Diamonds.
   */
  const bonusOnly =
    text.match(
      /^\d[\d.,]*\s*\(\s*\d[\d.,]*\s*\+\s*\d[\d.,]*\s*Bonus\s*\)$/i
    );

  return bonusOnly
    ? bonusOnly[0]
    : null;
}

function createOffer({
  storeId,
  storeName,
  game,
  name,
  price,
  priceText,
  purchaseUrl,
  source,
  index
}) {
  return {
    id:
      `${storeId}-${game.id}-${source}-${index}`,

    storeId,
    storeName,

    gameId:
      game.id,

    originalName:
      String(
        name ||
        ''
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

    accessStrategy:
      'dedicated',

    dedicatedAdapterVersion:
      DEDICATED_ADAPTER_VERSION,

    checkedAt:
      new Date()
        .toISOString()
  };
}

function extractLineOffers({
  html,
  url,
  storeId,
  storeName,
  game,
  mode = 'page'
}) {
  const lines =
    htmlToLines(
      html
    );

  const offers =
    [];

  let scopeUntil =
    -1;

  for (
    let index = 0;
    index <
      lines.length;
    index += 1
  ) {
    const line =
      lines[index];

    if (
      gameMatches(
        line,
        game
      )
    ) {
      scopeUntil =
        Math.max(
          scopeUntil,
          index + 12
        );
    }

    const name =
      extractProductName(
        line,
        game
      );

    if (!name) {
      continue;
    }

    if (
      mode ===
        'catalog' &&
      !gameMatches(
        line,
        game
      ) &&
      index >
        scopeUntil
    ) {
      continue;
    }

    let result =
      firstPrice(
        line
      );

    if (!result) {
      const end =
        Math.min(
          lines.length -
            1,
          index + 8
        );

      for (
        let cursor =
          index + 1;
        cursor <= end;
        cursor += 1
      ) {
        if (
          extractProductName(
            lines[cursor],
            game
          )
        ) {
          break;
        }

        result =
          firstPrice(
            lines[cursor]
          );

        if (result) {
          break;
        }
      }
    }

    if (!result) {
      continue;
    }

    offers.push(
      createOffer({
        storeId,
        storeName,
        game,
        name,

        price:
          result.price,

        priceText:
          result.priceText,

        purchaseUrl:
          url,

        source:
          'dedicated-visible',

        index:
          offers.length +
          1
      })
    );
  }

  return dedupeOffers(
    offers
  );
}

function extractSerializedOffers({
  html,
  url,
  storeId,
  storeName,
  game
}) {
  const text =
    decodeFrameworkText(
      `${String(
        html ||
        ''
      )}\n${extractAttributeText(
        html
      )}`
    );

  const candidates =
    [];

  const offers =
    [];

  const unit =
    unitPattern(
      game
    );

  if (unit) {
    const pattern =
      new RegExp(
        `\\d[\\d.,]*(?:\\s*\\([^\\n)]{1,70}\\))?(?:\\s*\\+\\s*\\d[\\d.,]*)?\\s*(?:bonus\\s*)?${unit}\\b`,
        'gi'
      );

    for (
      const match of
      text.matchAll(
        pattern
      )
    ) {
      candidates.push({
        name:
          match[0],

        index:
          match.index ||
          0
      });

      if (
        candidates.length >=
        800
      ) {
        break;
      }
    }
  }

  const named =
    namedPackagePattern(
      game
    );

  if (named) {
    const pattern =
      new RegExp(
        named.source,

        named.flags.includes(
          'g'
        )
          ? named.flags
          : `${named.flags}g`
      );

    for (
      const match of
      text.matchAll(
        pattern
      )
    ) {
      candidates.push({
        name:
          match[0],

        index:
          match.index ||
          0
      });
    }
  }

  const keyPattern =
    /["']?(?:productName|product_name|variantName|variant_name|itemName|item_name|denomination|title|label|name)["']?\s*[:=]\s*["']([^"'\\]{2,180})["']/gi;

  for (
    const match of
    text.matchAll(
      keyPattern
    )
  ) {
    const name =
      extractProductName(
        match[1],
        game
      );

    if (name) {
      candidates.push({
        name,

        index:
          match.index ||
          0
      });
    }

    if (
      candidates.length >=
      1000
    ) {
      break;
    }
  }

  const seen =
    new Set();

  for (
    const candidate of
    candidates
  ) {
    const key =
      `${normalizeText(
        candidate.name
      )}:${candidate.index}`;

    if (
      seen.has(
        key
      )
    ) {
      continue;
    }

    seen.add(
      key
    );

    /*
     * Harga sengaja dicari SETELAH product name.
     *
     * Ini mencegah product berikutnya mengambil
     * harga milik product sebelumnya.
     */
    const start =
      candidate.index +
      candidate.name.length;

    const windowText =
      text.slice(
        start,

        Math.min(
          text.length,
          start + 650
        )
      );

    const explicit =
      firstPrice(
        windowText
      );

    let price =
      explicit?.price ||
      null;

    let priceText =
      explicit
        ?.priceText ||
      null;

    if (!price) {
      const keyed =
        windowText.match(
          /["']?(?:sellingPrice|selling_price|sellPrice|sell_price|salePrice|sale_price|finalPrice|final_price|discountPrice|discount_price|productPrice|product_price|price)["']?\s*[:=]\s*["']?([0-9][0-9.,]*)["']?/i
        );

      if (keyed) {
        price =
          parseLooseRupiah(
            keyed[1]
          );

        priceText =
          keyed[0];
      }
    }

    if (
      !price ||
      price <= 0
    ) {
      continue;
    }

    offers.push(
      createOffer({
        storeId,
        storeName,
        game,

        name:
          candidate.name,

        price,
        priceText,

        purchaseUrl:
          url,

        source:
          'dedicated-serialized',

        index:
          offers.length +
          1
      })
    );

    if (
      offers.length >=
      250
    ) {
      break;
    }
  }

  return dedupeOffers(
    offers
  );
}

function parseDedicatedDocument(
  args
) {
  return dedupeOffers([
    ...extractLineOffers(
      args
    ),

    ...extractSerializedOffers(
      args
    )
  ]);
}

function extractScriptUrls(
  html,
  baseUrl
) {
  const urls =
    [];

  const seen =
    new Set();

  const pattern =
    /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;

  for (
    const match of
    String(
      html ||
      ''
    ).matchAll(
      pattern
    )
  ) {
    const url =
      absoluteUrl(
        match[1],
        baseUrl
      );

    if (
      !url ||
      seen.has(
        url
      ) ||
      !sameSite(
        url,
        baseUrl
      )
    ) {
      continue;
    }

    seen.add(
      url
    );

    urls.push(
      url
    );

    if (
      urls.length >=
      8
    ) {
      break;
    }
  }

  return urls;
}

function discoverReadOnlyDataUrls(
  text,
  baseUrl,
  game
) {
  const values =
    [];

  const seen =
    new Set();

  const patterns = [
    /["'](https?:\\?\/\\?\/[^"']{4,320})["']/gi,

    /["']((?:\\?\/)?(?:api|v1|v2|v3|graphql|products?|games?|catalog|services?|items?|denominations?|prices?)[^"']{0,280})["']/gi
  ];

  for (
    const pattern of
    patterns
  ) {
    for (
      const match of
      String(
        text ||
        ''
      ).matchAll(
        pattern
      )
    ) {
      const raw =
        String(
          match[1] ||
          ''
        )
          .replace(
            /\\\//g,
            '/'
          )
          .replace(
            /\\u002f/gi,
            '/'
          );

      if (
        !/(?:api|product|game|catalog|service|item|denomination|price|graphql)/i
          .test(raw)
      ) {
        continue;
      }

      /*
       * Hindari URL template yang belum mempunyai
       * parameter konkret.
       */
      if (
        /[{}$\[\]]/.test(
          raw
        ) ||
        /:\w+/.test(
          raw
        )
      ) {
        continue;
      }

      const url =
        absoluteUrl(
          raw,
          baseUrl
        );

      if (
        !url ||
        seen.has(
          url
        ) ||
        !sameSite(
          url,
          baseUrl
        )
      ) {
        continue;
      }

      seen.add(
        url
      );

      let score = 0;

      if (
        url.includes(
          game.id
        )
      ) {
        score +=
          50;
      }

      if (
        /product|denomination|price|item/i
          .test(url)
      ) {
        score +=
          30;
      }

      if (
        /api|graphql/i
          .test(url)
      ) {
        score +=
          20;
      }

      values.push({
        url,
        score
      });

      if (
        values.length >=
        40
      ) {
        break;
      }
    }
  }

  return values
    .sort(
      (a, b) =>
        b.score -
        a.score
    )
    .slice(
      0,
      8
    )
    .map(
      (entry) =>
        entry.url
    );
}

async function tryDynamicResources({
  html,
  pageUrl,
  storeId,
  storeName,
  game,
  timeoutMs
}) {
  const diagnostics = {
    scriptsTried:
      [],

    dataUrlsTried:
      []
  };

  const scripts =
    extractScriptUrls(
      html,
      pageUrl
    );

  let combined =
    String(
      html ||
      ''
    );

  /*
   * Maksimum 5 bundle JS per page.
   */
  for (
    const url of
    scripts.slice(
      0,
      5
    )
  ) {
    try {
      const result =
        await fetchText(
          url,
          {
            timeoutMs,

            retries:
              0,

            headers: {
              accept:
                'application/javascript,text/javascript,*/*;q=0.5'
            }
          }
        );

      diagnostics
        .scriptsTried
        .push({
          url,
          ok:
            true
        });

      combined +=
        `\n${result.text}`;

      const offers =
        extractSerializedOffers({
          html:
            result.text,

          url:
            pageUrl,

          storeId,
          storeName,
          game
        });

      if (
        offers.length
      ) {
        return {
          offers,
          diagnostics
        };
      }
    } catch (
      error
    ) {
      diagnostics
        .scriptsTried
        .push({
          url,

          ok:
            false,

          code:
            error?.code ||
            'UNKNOWN_ERROR',

          status:
            error?.status ??
            null
        });
    }
  }

  const dataUrls =
    discoverReadOnlyDataUrls(
      combined,
      pageUrl,
      game
    );

  /*
   * Hanya melakukan GET ke URL read-only yang memang
   * ditemukan pada page/bundle dan masih satu site.
   */
  for (
    const url of
    dataUrls.slice(
      0,
      6
    )
  ) {
    try {
      const result =
        await fetchText(
          url,
          {
            timeoutMs,

            retries:
              0,

            headers: {
              accept:
                'application/json,text/plain,*/*;q=0.5',

              referer:
                pageUrl
            }
          }
        );

      diagnostics
        .dataUrlsTried
        .push({
          url,

          ok:
            true,

          contentType:
            result.contentType
        });

      const offers =
        parseDedicatedDocument({
          html:
            result.text,

          url:
            pageUrl,

          storeId,
          storeName,
          game,

          mode:
            'page'
        });

      if (
        offers.length
      ) {
        return {
          offers,
          diagnostics
        };
      }
    } catch (
      error
    ) {
      diagnostics
        .dataUrlsTried
        .push({
          url,

          ok:
            false,

          code:
            error?.code ||
            'UNKNOWN_ERROR',

          status:
            error?.status ??
            null
        });
    }
  }

  return {
    offers: [],
    diagnostics
  };
}

async function fetchDedicatedOffers({
  storeId,
  storeName,
  game,
  options = {},
  candidates,
  enableDynamicDiscovery = false,
  minOffers = 1
}) {
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

  const attempts =
    [];

  let fetchedAny =
    false;

  let strongestError =
    null;

  for (
    const candidate of
    candidates
  ) {
    const url =
      typeof candidate ===
      'string'
        ? candidate
        : candidate.url;

    const mode =
      typeof candidate ===
      'string'
        ? 'page'
        : candidate.mode ||
          'page';

    if (!url) {
      continue;
    }

    try {
      const page =
        await fetchText(
          url,
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

      fetchedAny =
        true;

      const finalUrl =
        page.finalUrl ||
        url;

      const offers =
        parseDedicatedDocument({
          html:
            page.text,

          url:
            finalUrl,

          storeId,
          storeName,
          game,
          mode
        });

      attempts.push({
        url,
        finalUrl,
        mode,

        result:
          offers.length
            ? 'SUCCESS'
            : 'NO_OFFERS',

        offerCount:
          offers.length
      });

      if (
        offers.length >=
        minOffers
      ) {
        return offers;
      }

      if (
        enableDynamicDiscovery
      ) {
        const dynamic =
          await tryDynamicResources({
            html:
              page.text,

            pageUrl:
              finalUrl,

            storeId,
            storeName,
            game,
            timeoutMs
          });

        attempts.push({
          url:
            finalUrl,

          mode:
            'dynamic-discovery',

          result:
            dynamic.offers.length
              ? 'SUCCESS'
              : 'NO_OFFERS',

          offerCount:
            dynamic
              .offers
              .length,

          dynamic:
            dynamic.diagnostics
        });

        if (
          dynamic.offers.length >=
          minOffers
        ) {
          return dynamic.offers;
        }
      }
    } catch (
      error
    ) {
      attempts.push({
        url,
        mode,

        result:
          error?.code ||
          'UNKNOWN_ERROR',

        status:
          error?.status ??
          null
      });

      if (
        !strongestError
      ) {
        strongestError =
          error;
      } else if (
        [
          'ACCESS_BLOCKED',
          'RATE_LIMITED'
        ].includes(
          String(
            error?.code ||
            ''
          )
        ) &&
        ![
          'ACCESS_BLOCKED',
          'RATE_LIMITED'
        ].includes(
          String(
            strongestError
              ?.code ||
            ''
          )
        )
      ) {
        strongestError =
          error;
      }
    }
  }

  /*
   * Jika tidak satu pun page berhasil di-fetch dan
   * semuanya benar-benar blocked/rate limited,
   * tampilkan status sebenarnya.
   */
  if (
    !fetchedAny &&
    strongestError &&
    [
      'ACCESS_BLOCKED',
      'RATE_LIMITED'
    ].includes(
      String(
        strongestError.code ||
        ''
      )
    )
  ) {
    strongestError
      .dedicatedDiagnostics = {
        version:
          DEDICATED_ADAPTER_VERSION,

        storeId,

        gameId:
          game?.id ||
          null,

        attempts
      };

    throw strongestError;
  }

  throw providerError(
    'PARSER_FAILED',

    enableDynamicDiscovery
      ? 'Dedicated adapter belum menemukan product/price pada HTML, serialized state, script bundle, atau endpoint data read-only yang terdeteksi'
      : 'Dedicated adapter belum menemukan pasangan product dan harga pada halaman toko',

    {
      parserReason:
        enableDynamicDiscovery
          ? 'DYNAMIC_DATA_NOT_RESOLVED'
          : 'DEDICATED_STRUCTURE_NOT_MATCHED',

      dedicatedDiagnostics: {
        version:
          DEDICATED_ADAPTER_VERSION,

        storeId,

        gameId:
          game?.id ||
          null,

        attempts
      }
    }
  );
}

module.exports = {
  DEDICATED_ADAPTER_VERSION,
  fetchDedicatedOffers,
  parseDedicatedDocument,
  extractLineOffers,
  extractSerializedOffers,
  parseLooseRupiah
};
