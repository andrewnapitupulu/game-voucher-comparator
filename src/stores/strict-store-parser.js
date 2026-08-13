'use strict';

const { fetchText } = require('../services/http');
const { decodeEntities } = require('../utils/html');
const { normalizeText } = require('../config/games');

const STRICT_STORE_PARSER_VERSION =
  '2026-08-13-strict-v1';

const NAME_KEYS = [
  'productName',
  'product_name',
  'variantName',
  'variant_name',
  'itemName',
  'item_name',
  'denomination',
  'denom',
  'title',
  'label',
  'name'
];

const PRICE_KEYS = [
  'finalPrice',
  'final_price',
  'sellingPrice',
  'selling_price',
  'sellPrice',
  'sell_price',
  'salePrice',
  'sale_price',
  'discountPrice',
  'discount_price',
  'productPrice',
  'product_price',
  'price'
];

const CURRENCY_KEYS = [
  'currency',
  'currencyCode',
  'currency_code',
  'priceCurrency',
  'price_currency'
];

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

function escapeRegExp(
  value
) {
  return String(
    value || ''
  ).replace(
    /[.*+?^${}()|[\]\\]/g,
    '\\$&'
  );
}

function cleanText(
  value
) {
  return decodeEntities(
    String(
      value || ''
    )
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
      /\s+/g,
      ' '
    )
    .trim();
}

function cleanProductText(
  value
) {
  return cleanText(
    value
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
}

function parseIdr(
  value
) {
  const text =
    cleanText(
      value
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
      );

  const match =
    text.match(
      /(?:\bIDR\b|\bRp\b)\s*([0-9][0-9.,]*)/i
    );

  if (!match) {
    return null;
  }

  let token =
    match[1];

  if (
    /^\d{1,3}(?:\.\d{3})+(?:,\d{2})?$/
      .test(token)
  ) {
    token =
      token
        .replace(
          /\./g,
          ''
        )
        .replace(
          /,\d{2}$/,
          ''
        );
  } else if (
    /^\d{1,3}(?:,\d{3})+(?:\.\d{2})?$/
      .test(token)
  ) {
    token =
      token
        .replace(
          /,/g,
          ''
        )
        .replace(
          /\.\d{2}$/,
          ''
        );
  } else {
    token =
      token.replace(
        /\D/g,
        ''
      );
  }

  const number =
    Number(token);

  return (
    Number.isFinite(
      number
    ) &&
    number >= 100
  )
    ? number
    : null;
}

function firstExplicitIdr(
  value
) {
  const matches =
    cleanText(
      value
    ).match(
      /(?:\bIDR\b|\bRp\s*\.?)\s*[:=\-]?\s*[0-9][0-9.,]*/gi
    ) || [];

  for (
    const match of
    matches
  ) {
    const price =
      parseIdr(
        match
      );

    if (price) {
      return {
        price,

        priceText:
          match
      };
    }
  }

  return null;
}

function gameUnitRegex(
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

function specialPackageRegex(
  game
) {
  switch (
    game?.id
  ) {
    case 'zenless-zone-zero':
      return /inter[-\s]*knot\s+membership(?:\s*[x×]\s*\d+)?/i;

    case 'mobile-legends':
      return /(?:weekly diamond(?:s)? pass|weekly pass|weekly elite(?: pack)?|monthly elite(?: pack)?|starlight(?: member)?|twilight pass)(?:\s*[x×]\s*\d+)?/i;

    case 'genshin-impact':
      return /(?:blessing of the welkin moon|welkin)(?:\s*[x×]\s*\d+)?/i;

    case 'honkai-star-rail':
      return /express supply pass(?:\s*[x×]\s*\d+)?/i;

    case 'wuthering-waves':
      return /lunite subscription(?:\s*[x×]\s*\d+)?/i;

    default:
      return null;
  }
}

function strictProductName(
  value,
  game
) {
  const text =
    cleanProductText(
      value
    );

  if (
    !text ||
    text.length > 180
  ) {
    return null;
  }

  /*
   * ========================================================
   * REJECT SEO / MARKETING TEXT
   * ========================================================
   *
   * Contoh yang TIDAK boleh dianggap produk:
   *
   * Top Up Zenless Zone Zero Murah
   * Top Up Game Termurah
   * Harga mulai Rp...
   */
  if (
    /\b(?:top\s*up|murah|termurah|terpercaya|cepat|resmi|harga\s+mulai|mulai\s+rp|beli\s+sekarang|promo\s+terbaik)\b/i
      .test(text)
  ) {
    return null;
  }

  const unit =
    gameUnitRegex(
      game
    );

  if (unit) {
    const patterns = [
      /*
       * 300 + 30 Monochrome
       */
      new RegExp(
        `\\b\\d[\\d.,]*\\s*\\+\\s*\\d[\\d.,]*\\s*${unit}\\b`,
        'i'
      ),

      /*
       * 330 (300 + 30 Bonus) Monochrome
       */
      new RegExp(
        `\\b\\d[\\d.,]*\\s*\\([^\\n)]{1,70}\\)\\s*${unit}\\b`,
        'i'
      ),

      /*
       * 330 Monochrome
       */
      new RegExp(
        `\\b\\d[\\d.,]*\\s*${unit}\\b`,
        'i'
      )
    ];

    for (
      const pattern of
      patterns
    ) {
      const match =
        text.match(
          pattern
        );

      if (match) {
        return match[0]
          .trim();
      }
    }
  }

  const special =
    specialPackageRegex(
      game
    );

  if (special) {
    const match =
      text.match(
        special
      );

    if (match) {
      return match[0]
        .trim();
    }
  }

  return null;
}

function tokenLines(
  html
) {
  const visible =
    String(
      html || ''
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

      /*
       * Penting:
       *
       * setiap tag menjadi boundary.
       *
       * Kita TIDAK menggabungkan semua teks
       * halaman menjadi satu string besar.
       */
      .replace(
        /<[^>]+>/g,
        '\n'
      );

  return decodeEntities(
    visible
  )
    .split(
      /\r?\n/
    )
    .map(
      cleanProductText
    )
    .filter(
      Boolean
    );
}

function createOffer({
  store,
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
      `${store.id}-${game.id}-${source}-${index}`,

    storeId:
      store.id,

    storeName:
      store.name,

    gameId:
      game.id,

    originalName:
      name,

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

    source:
      'live',

    extractionSource:
      source,

    accessStrategy:
      'dedicated-strict',

    strictParserVersion:
      STRICT_STORE_PARSER_VERSION,

    checkedAt:
      new Date()
        .toISOString()
  };
}

function dedupeStrict(
  offers
) {
  const seen =
    new Set();

  const result =
    [];

  for (
    const offer of
    offers || []
  ) {
    const key =
      `${normalizeText(
        offer.originalName
      )}|${offer.finalPrice}`;

    if (
      !offer.originalName ||
      !Number.isFinite(
        offer.finalPrice
      ) ||
      offer.finalPrice < 100 ||
      seen.has(
        key
      )
    ) {
      continue;
    }

    seen.add(
      key
    );

    result.push(
      offer
    );
  }

  return result;
}

function parseVisibleCards({
  text,
  url,
  store,
  game
}) {
  const lines =
    tokenLines(
      text
    );

  const productIndexes =
    [];

  for (
    let index = 0;
    index < lines.length;
    index += 1
  ) {
    const name =
      strictProductName(
        lines[index],
        game
      );

    if (name) {
      productIndexes.push({
        index,
        name
      });
    }
  }

  const offers =
    [];

  for (
    let productIndex = 0;
    productIndex <
      productIndexes.length;
    productIndex += 1
  ) {
    const current =
      productIndexes[
        productIndex
      ];

    const nextIndex =
      productIndexes[
        productIndex + 1
      ]?.index ??
      lines.length;

    /*
     * Harga hanya boleh dicari di block kecil
     * milik produk ini.
     *
     * Tidak boleh melewati produk berikutnya.
     */
    const hardEnd =
      Math.min(
        nextIndex,
        current.index + 10
      );

    let resolvedName =
      current.name;

    /*
     * Inter-Knot Membership
     * Package X2
     *
     * menjadi:
     *
     * Inter-Knot Membership x2
     */
    if (
      /membership|subscription|pass/i
        .test(
          resolvedName
        )
    ) {
      for (
        let cursor =
          current.index + 1;
        cursor < hardEnd;
        cursor += 1
      ) {
        const quantity =
          lines[cursor]
            .match(
              /^(?:package\s*)?[x×]?\s*(\d+)$/i
            ) ||
          lines[cursor]
            .match(
              /^package\s*[x×]?\s*(\d+)$/i
            );

        if (
          quantity &&
          Number(
            quantity[1]
          ) > 1
        ) {
          resolvedName =
            `${resolvedName} x${Number(
              quantity[1]
            )}`;

          break;
        }

        if (
          firstExplicitIdr(
            lines[cursor]
          )
        ) {
          break;
        }
      }
    }

    let priceResult =
      firstExplicitIdr(
        lines[
          current.index
        ]
      );

    if (!priceResult) {
      for (
        let cursor =
          current.index + 1;

        cursor < hardEnd;

        cursor += 1
      ) {
        priceResult =
          firstExplicitIdr(
            lines[cursor]
          );

        if (
          priceResult
        ) {
          break;
        }
      }
    }

    if (
      !priceResult
    ) {
      continue;
    }

    offers.push(
      createOffer({
        store,
        game,

        name:
          resolvedName,

        price:
          priceResult.price,

        priceText:
          priceResult.priceText,

        purchaseUrl:
          url,

        source:
          'strict-visible-card',

        index:
          offers.length + 1
      })
    );
  }

  return dedupeStrict(
    offers
  );
}

function attributeMap(
  tag
) {
  const result =
    {};

  const regex =
    /\b([a-zA-Z0-9_:-]+)\s*=\s*["']([^"']*)["']/g;

  for (
    const match of
    String(
      tag || ''
    ).matchAll(
      regex
    )
  ) {
    result[
      match[1]
        .toLowerCase()
    ] =
      cleanText(
        match[2]
      );
  }

  return result;
}

function parseSameTagAttributes({
  text,
  url,
  store,
  game
}) {
  const offers =
    [];

  const tagRegex =
    /<[^>]+>/g;

  for (
    const match of
    String(
      text || ''
    ).matchAll(
      tagRegex
    )
  ) {
    const attrs =
      attributeMap(
        match[0]
      );

    const nameValue =
      attrs[
        'data-product-name'
      ] ||
      attrs[
        'data-variant-name'
      ] ||
      attrs[
        'data-name'
      ] ||
      attrs[
        'aria-label'
      ] ||
      attrs.title;

    const name =
      strictProductName(
        nameValue,
        game
      );

    if (!name) {
      continue;
    }

    const priceValue =
      attrs[
        'data-price'
      ] ||
      attrs[
        'data-selling-price'
      ] ||
      attrs[
        'data-final-price'
      ];

    if (!priceValue) {
      continue;
    }

    const explicit =
      firstExplicitIdr(
        priceValue
      );

    if (!explicit) {
      continue;
    }

    offers.push(
      createOffer({
        store,
        game,
        name,

        price:
          explicit.price,

        priceText:
          explicit.priceText,

        purchaseUrl:
          url,

        source:
          'strict-same-tag',

        index:
          offers.length + 1
      })
    );
  }

  return dedupeStrict(
    offers
  );
}

function getObjectValue(
  object,
  keys
) {
  if (
    !object ||
    typeof object !==
      'object' ||
    Array.isArray(
      object
    )
  ) {
    return undefined;
  }

  for (
    const key of
    keys
  ) {
    if (
      Object.prototype
        .hasOwnProperty
        .call(
          object,
          key
        )
    ) {
      return object[
        key
      ];
    }
  }

  const lowerMap =
    new Map(
      Object.keys(
        object
      )
        .map(
          (key) => [
            key.toLowerCase(),
            key
          ]
        )
    );

  for (
    const key of
    keys
  ) {
    const real =
      lowerMap.get(
        key.toLowerCase()
      );

    if (real) {
      return object[
        real
      ];
    }
  }

  return undefined;
}

function currencyIsIdr(
  object
) {
  const currency =
    getObjectValue(
      object,
      CURRENCY_KEYS
    );

  if (
    currency == null
  ) {
    return false;
  }

  return /^(?:idr|rp|rupiah)$/i
    .test(
      cleanText(
        currency
      )
    );
}

function numericIdr(
  value
) {
  if (
    typeof value ===
    'number'
  ) {
    return (
      Number.isFinite(
        value
      ) &&
      value >= 100
    )
      ? Math.round(
          value
        )
      : null;
  }

  const text =
    cleanText(
      value
    );

  if (
    !/^\d[\d.,]*$/
      .test(text)
  ) {
    return null;
  }

  let token =
    text;

  if (
    /^\d{1,3}(?:\.\d{3})+$/
      .test(token)
  ) {
    token =
      token.replace(
        /\./g,
        ''
      );
  } else if (
    /^\d{1,3}(?:,\d{3})+$/
      .test(token)
  ) {
    token =
      token.replace(
        /,/g,
        ''
      );
  } else {
    token =
      token.replace(
        /[^0-9]/g,
        ''
      );
  }

  const number =
    Number(token);

  return (
    Number.isFinite(
      number
    ) &&
    number >= 100
  )
    ? number
    : null;
}

function objectProductName(
  object,
  game
) {
  const named =
    getObjectValue(
      object,
      NAME_KEYS
    );

  const strict =
    strictProductName(
      named,
      game
    );

  if (strict) {
    return strict;
  }

  const unitRaw =
    getObjectValue(
      object,
      [
        'unit',
        'unitName',
        'unit_name',
        'currencyName',
        'currency_name'
      ]
    );

  const nominal =
    getObjectValue(
      object,
      [
        'nominal',
        'denomination',
        'amount',
        'quantity',
        'qty'
      ]
    );

  const unit =
    cleanText(
      unitRaw
    );

  if (
    unit &&
    nominal != null
  ) {
    const combined =
      `${nominal} ${unit}`;

    return strictProductName(
      combined,
      game
    );
  }

  return null;
}

function objectPrice(
  object,
  pageHasIdr
) {
  for (
    const key of
    PRICE_KEYS
  ) {
    const value =
      getObjectValue(
        object,
        [key]
      );

    if (
      value == null
    ) {
      continue;
    }

    const explicit =
      firstExplicitIdr(
        value
      );

    if (explicit) {
      return explicit;
    }

    /*
     * Numeric price hanya boleh diterima jika:
     *
     * - object menyatakan IDR
     * atau
     * - response/page jelas memakai IDR
     */
    if (
      currencyIsIdr(
        object
      ) ||
      pageHasIdr
    ) {
      const price =
        numericIdr(
          value
        );

      if (price) {
        return {
          price,

          priceText:
            `${
              currencyIsIdr(
                object
              )
                ? 'IDR '
                : ''
            }${value}`
        };
      }
    }
  }

  return null;
}

function parseJsonRoot(
  root,
  args,
  pageHasIdr
) {
  const offers =
    [];

  const stack = [
    root
  ];

  let visited =
    0;

  while (
    stack.length &&
    visited < 30000
  ) {
    const current =
      stack.pop();

    visited += 1;

    if (
      !current ||
      typeof current !==
        'object'
    ) {
      continue;
    }

    if (
      Array.isArray(
        current
      )
    ) {
      for (
        let index =
          current.length - 1;

        index >= 0;

        index -= 1
      ) {
        stack.push(
          current[index]
        );
      }

      continue;
    }

    const name =
      objectProductName(
        current,
        args.game
      );

    if (name) {
      /*
       * Nama dan price HARUS dari object
       * JSON yang sama.
       */
      const priceResult =
        objectPrice(
          current,
          pageHasIdr
        );

      if (priceResult) {
        offers.push(
          createOffer({
            store:
              args.store,

            game:
              args.game,

            name,

            price:
              priceResult.price,

            priceText:
              priceResult.priceText,

            purchaseUrl:
              args.url,

            source:
              'strict-same-json-object',

            index:
              offers.length + 1
          })
        );
      }
    }

    for (
      const value of
      Object.values(
        current
      )
    ) {
      if (
        value &&
        typeof value ===
          'object'
      ) {
        stack.push(
          value
        );
      }
    }
  }

  return offers;
}

function containingObjectFragment(
  text,
  index,
  maxDistance = 2400
) {
  const startLimit =
    Math.max(
      0,
      index - maxDistance
    );

  const endLimit =
    Math.min(
      text.length,
      index + maxDistance
    );

  let start =
    -1;

  let depth =
    0;

  for (
    let cursor =
      index;

    cursor >=
      startLimit;

    cursor -= 1
  ) {
    const char =
      text[cursor];

    if (
      char === '}'
    ) {
      depth += 1;
    } else if (
      char === '{'
    ) {
      if (
        depth === 0
      ) {
        start =
          cursor;

        break;
      }

      depth -= 1;
    }
  }

  if (
    start < 0
  ) {
    return null;
  }

  let end =
    -1;

  depth =
    0;

  for (
    let cursor =
      index;

    cursor <
      endLimit;

    cursor += 1
  ) {
    const char =
      text[cursor];

    if (
      char === '{'
    ) {
      depth += 1;
    } else if (
      char === '}'
    ) {
      if (
        depth === 0
      ) {
        end =
          cursor + 1;

        break;
      }

      depth -= 1;
    }
  }

  if (
    end < 0 ||
    end - start >
      maxDistance * 2
  ) {
    return null;
  }

  return text.slice(
    start,
    end
  );
}

function parseObjectFragments({
  text,
  url,
  store,
  game
}) {
  const source =
    decodeEntities(
      String(
        text || ''
      )
    )
      .replace(
        /\\u0020/gi,
        ' '
      )
      .replace(
        /\\u002e/gi,
        '.'
      )
      .replace(
        /\\u002c/gi,
        ','
      )
      .replace(
        /\\u002f/gi,
        '/'
      )
      .replace(
        /\\"/g,
        '"'
      )
      .replace(
        /\\\//g,
        '/'
      );

  const unit =
    gameUnitRegex(
      game
    );

  const patterns =
    [];

  if (unit) {
    patterns.push(
      new RegExp(
        `\\b\\d[\\d.,]*\\s*\\+\\s*\\d[\\d.,]*\\s*${unit}\\b`,
        'gi'
      )
    );

    patterns.push(
      new RegExp(
        `\\b\\d[\\d.,]*\\s*${unit}\\b`,
        'gi'
      )
    );
  }

  const special =
    specialPackageRegex(
      game
    );

  if (special) {
    patterns.push(
      new RegExp(
        special.source,

        special.flags.includes(
          'g'
        )
          ? special.flags
          : `${special.flags}g`
      )
    );
  }

  const pageHasIdr =
    /(?:\bIDR\b|\bRp\s*\.?|\brupiah\b)/i
      .test(source);

  const offers =
    [];

  const seenAt =
    new Set();

  for (
    const pattern of
    patterns
  ) {
    for (
      const match of
      source.matchAll(
        pattern
      )
    ) {
      const index =
        match.index ||
        0;

      const token =
        `${index}:${normalizeText(
          match[0]
        )}`;

      if (
        seenAt.has(
          token
        )
      ) {
        continue;
      }

      seenAt.add(
        token
      );

      const name =
        strictProductName(
          match[0],
          game
        );

      if (!name) {
        continue;
      }

      /*
       * Cari object tempat product name itu
       * berada.
       *
       * Harga tidak boleh dicari di object lain.
       */
      const fragment =
        containingObjectFragment(
          source,
          index
        );

      if (!fragment) {
        continue;
      }

      const explicit =
        firstExplicitIdr(
          fragment
        );

      let priceResult =
        explicit;

      if (!priceResult) {
        const keyed =
          fragment.match(
            /["']?(?:finalPrice|final_price|sellingPrice|selling_price|sellPrice|sell_price|salePrice|sale_price|discountPrice|discount_price|productPrice|product_price|price)["']?\s*[:=]\s*["']?([0-9][0-9.,]*)["']?/i
          );

        const currency =
          fragment.match(
            /["']?(?:currency|currencyCode|currency_code|priceCurrency|price_currency)["']?\s*[:=]\s*["']([^"']+)["']/i
          );

        const idr =
          currency
            ? /^(?:idr|rp|rupiah)$/i
                .test(
                  cleanText(
                    currency[1]
                  )
                )
            : pageHasIdr;

        if (
          keyed &&
          idr
        ) {
          const price =
            numericIdr(
              keyed[1]
            );

          if (price) {
            priceResult = {
              price,

              priceText:
                currency
                  ? `IDR ${keyed[1]}`
                  : keyed[0]
            };
          }
        }
      }

      if (
        !priceResult
      ) {
        continue;
      }

      offers.push(
        createOffer({
          store,
          game,
          name,

          price:
            priceResult.price,

          priceText:
            priceResult.priceText,

          purchaseUrl:
            url,

          source:
            'strict-same-object-fragment',

          index:
            offers.length + 1
        })
      );
    }
  }

  return dedupeStrict(
    offers
  );
}

function parseJsonDocuments({
  text,
  url,
  store,
  game
}) {
  const roots =
    [];

  const source =
    String(
      text || ''
    );

  const pageHasIdr =
    /(?:\bIDR\b|\bRp\s*\.?|\brupiah\b)/i
      .test(
        source
      );

  const scriptRegex =
    /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;

  for (
    const match of
    source.matchAll(
      scriptRegex
    )
  ) {
    const attrs =
      match[1] ||
      '';

    const body =
      decodeEntities(
        match[2] ||
        ''
      )
        .trim();

    if (!body) {
      continue;
    }

    if (
      /type\s*=\s*["']application\/(?:ld\+json|json)["']/i
        .test(attrs) ||
      /id\s*=\s*["']__NEXT_DATA__["']/i
        .test(attrs)
    ) {
      try {
        roots.push(
          JSON.parse(
            body
          )
        );
      } catch {
        /*
         * Ignore invalid JSON.
         */
      }
    }
  }

  const trimmed =
    source.trim();

  if (
    trimmed.startsWith(
      '{'
    ) ||
    trimmed.startsWith(
      '['
    )
  ) {
    try {
      roots.push(
        JSON.parse(
          trimmed
        )
      );
    } catch {
      /*
       * Ignore invalid JSON response.
       */
    }
  }

  const offers =
    [];

  for (
    const root of
    roots
  ) {
    offers.push(
      ...parseJsonRoot(
        root,
        {
          text,
          url,
          store,
          game
        },
        pageHasIdr
      )
    );
  }

  return dedupeStrict(
    offers
  );
}

function parseStrictDocument(
  args
) {
  /*
   * ========================================================
   * PRIORITY
   * ========================================================
   *
   * 1. Visible card
   * 2. Same HTML tag
   * 3. Real JSON object
   * 4. Same object fragment
   *
   * TIDAK ADA nearest-price 650 character fallback.
   */
  const visible =
    parseVisibleCards(
      args
    );

  if (
    visible.length
  ) {
    return visible;
  }

  const sameTag =
    parseSameTagAttributes(
      args
    );

  if (
    sameTag.length
  ) {
    return sameTag;
  }

  const json =
    parseJsonDocuments(
      args
    );

  if (
    json.length
  ) {
    return json;
  }

  return parseObjectFragments(
    args
  );
}

function safeUrl(
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

function baseDomain(
  hostname
) {
  const parts =
    String(
      hostname || ''
    )
      .toLowerCase()
      .replace(
        /^www\./,
        ''
      )
      .split(
        '.'
      );

  return parts.length >= 2
    ? parts
        .slice(-2)
        .join('.')
    : parts.join('.');
}

function sameStoreDomain(
  left,
  right
) {
  try {
    return (
      baseDomain(
        new URL(
          left
        ).hostname
      ) ===
      baseDomain(
        new URL(
          right
        ).hostname
      )
    );
  } catch {
    return false;
  }
}

function extractCandidateLinks(
  html,
  pageUrl,
  game
) {
  const links =
    [];

  const seen =
    new Set();

  const identities = [
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
        value.length >= 3
    );

  const regex =
    /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  for (
    const match of
    String(
      html || ''
    ).matchAll(
      regex
    )
  ) {
    const url =
      safeUrl(
        match[1],
        pageUrl
      );

    if (
      !url ||
      !sameStoreDomain(
        url,
        pageUrl
      ) ||
      seen.has(
        url
      )
    ) {
      continue;
    }

    const text =
      normalizeText(
        `${
          match[1]
        } ${
          match[2]
            .replace(
              /<[^>]+>/g,
              ' '
            )
        }`
      );

    let score =
      0;

    for (
      const identity of
      identities
    ) {
      if (
        text.includes(
          identity
        )
      ) {
        score +=
          identity ===
            normalizeText(
              game.id
            )
            ? 50
            : 20;
      }
    }

    if (
      /\b(?:beli|buy|topup|top-up|game|product)\b/
        .test(text)
    ) {
      score +=
        10;
    }

    if (
      score < 20
    ) {
      continue;
    }

    seen.add(
      url
    );

    links.push({
      url,
      score
    });
  }

  return links
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
      6
    )
    .map(
      (entry) =>
        entry.url
    );
}

function extractScriptUrls(
  html,
  pageUrl
) {
  const urls =
    [];

  const seen =
    new Set();

  const regex =
    /<script\b[^>]*src\s*=\s*["']([^"']+)["'][^>]*>/gi;

  for (
    const match of
    String(
      html || ''
    ).matchAll(
      regex
    )
  ) {
    const url =
      safeUrl(
        match[1],
        pageUrl
      );

    if (
      !url ||
      seen.has(
        url
      )
    ) {
      continue;
    }

    if (
      !/(?:\.js(?:\?|$)|\/_next\/static\/|\/assets\/|\/build\/|\/static\/)/i
        .test(url)
    ) {
      continue;
    }

    if (
      /(?:googletagmanager|google-analytics|gtag|facebook|doubleclick|hotjar|clarity|sentry)/i
        .test(url)
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
      urls.length >= 8
    ) {
      break;
    }
  }

  return urls;
}

function extractLiteralDataUrls(
  text,
  pageUrl,
  game
) {
  const urls =
    [];

  const seen =
    new Set();

  const patterns = [
    /["'](https?:\\?\/\\?\/[^"']{5,350})["']/gi,

    /["']((?:\/|\.\/)?(?:api|v1|v2|v3)\/[^"']{2,320})["']/gi
  ];

  for (
    const pattern of
    patterns
  ) {
    for (
      const match of
      String(
        text || ''
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

      /*
       * Endpoint dengan runtime placeholder
       * tidak dipanggil.
       */
      if (
        /[{}$\[\]]/
          .test(raw) ||
        /:\w+/
          .test(raw)
      ) {
        continue;
      }

      if (
        !/(?:product|game|catalog|item|denom|price|topup|service)/i
          .test(raw)
      ) {
        continue;
      }

      /*
       * Hanya endpoint read-only.
       */
      if (
        /(?:order|checkout|payment|invoice|transaction|login|register|callback)/i
          .test(raw)
      ) {
        continue;
      }

      const url =
        safeUrl(
          raw,
          pageUrl
        );

      if (
        !url ||
        !sameStoreDomain(
          url,
          pageUrl
        ) ||
        seen.has(
          url
        )
      ) {
        continue;
      }

      const normalized =
        normalizeText(
          url
        );

      const gameHint =
        normalizeText(
          game?.id
        );

      if (
        gameHint &&
        normalized.includes(
          gameHint
        )
      ) {
        urls.unshift(
          url
        );
      } else {
        urls.push(
          url
        );
      }

      seen.add(
        url
      );

      if (
        urls.length >= 10
      ) {
        break;
      }
    }
  }

  return urls.slice(
    0,
    10
  );
}

async function fetchStrictStoreOffers({
  store,
  game,
  options = {},
  candidates = [],
  discoveryPages = [],
  dynamic = true
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

  const queue =
    [];

  const queued =
    new Set();

  const attempted =
    new Set();

  const diagnostics =
    [];

  function enqueue(
    url,
    type = 'candidate',
    front = false
  ) {
    if (
      !url ||
      queued.has(
        url
      ) ||
      attempted.has(
        url
      )
    ) {
      return;
    }

    queued.add(
      url
    );

    const entry = {
      url,
      type
    };

    if (front) {
      queue.unshift(
        entry
      );
    } else {
      queue.push(
        entry
      );
    }
  }

  for (
    const url of
    candidates
  ) {
    enqueue(
      url,
      'candidate'
    );
  }

  for (
    const url of
    discoveryPages
  ) {
    enqueue(
      url,
      'discovery'
    );
  }

  let strongestError =
    null;

  while (
    queue.length &&
    attempted.size < 12
  ) {
    const entry =
      queue.shift();

    queued.delete(
      entry.url
    );

    if (
      attempted.has(
        entry.url
      )
    ) {
      continue;
    }

    attempted.add(
      entry.url
    );

    try {
      const page =
        await fetchText(
          entry.url,
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
        entry.url;

      /*
       * ====================================================
       * STRICT PAGE PARSE
       * ====================================================
       */
      const offers =
        parseStrictDocument({
          text:
            page.text,

          url:
            finalUrl,

          store,
          game
        });

      diagnostics.push({
        url:
          entry.url,

        finalUrl,

        type:
          entry.type,

        result:
          offers.length
            ? 'SUCCESS'
            : 'NO_STRICT_OFFERS',

        offerCount:
          offers.length
      });

      if (
        offers.length
      ) {
        return offers;
      }

      /*
       * ====================================================
       * PRODUCT URL DISCOVERY
       * ====================================================
       */
      const links =
        extractCandidateLinks(
          page.text,
          finalUrl,
          game
        );

      for (
        const link of
        links.reverse()
      ) {
        enqueue(
          link,
          'discovered-product',
          true
        );
      }

      if (dynamic) {
        /*
         * ==================================================
         * SCRIPT DATA
         * ==================================================
         */
        const scripts =
          extractScriptUrls(
            page.text,
            finalUrl
          );

        let combined =
          String(
            page.text ||
            ''
          );

        for (
          const scriptUrl of
          scripts.slice(
            0,
            6
          )
        ) {
          try {
            const script =
              await fetchText(
                scriptUrl,
                {
                  timeoutMs,

                  retries:
                    0,

                  headers: {
                    accept:
                      'application/javascript,text/javascript,*/*;q=0.5',

                    referer:
                      finalUrl
                  }
                }
              );

            combined +=
              `\n${script.text}`;

            const embedded =
              parseStrictDocument({
                text:
                  script.text,

                url:
                  finalUrl,

                store,
                game
              });

            if (
              embedded.length
            ) {
              return embedded;
            }
          } catch (
            error
          ) {
            diagnostics.push({
              url:
                scriptUrl,

              type:
                'script',

              result:
                error?.code ||
                'SCRIPT_ERROR',

              status:
                error?.status ??
                null
            });
          }
        }

        /*
         * ==================================================
         * READ-ONLY DATA ENDPOINT
         * ==================================================
         */
        const endpoints =
          extractLiteralDataUrls(
            combined,
            finalUrl,
            game
          );

        for (
          const endpoint of
          endpoints.slice(
            0,
            6
          )
        ) {
          try {
            const data =
              await fetchText(
                endpoint,
                {
                  timeoutMs,

                  retries:
                    0,

                  headers: {
                    accept:
                      'application/json,text/plain,*/*;q=0.6',

                    referer:
                      finalUrl
                  }
                }
              );

            /*
             * Bahkan response API tetap harus
             * memenuhi SAME OBJECT pairing.
             */
            const apiOffers =
              parseStrictDocument({
                text:
                  data.text,

                url:
                  finalUrl,

                store,
                game
              });

            diagnostics.push({
              url:
                endpoint,

              type:
                'data-endpoint',

              result:
                apiOffers.length
                  ? 'SUCCESS'
                  : 'NO_STRICT_OFFERS',

              offerCount:
                apiOffers.length
            });

            if (
              apiOffers.length
            ) {
              return apiOffers;
            }
          } catch (
            error
          ) {
            diagnostics.push({
              url:
                endpoint,

              type:
                'data-endpoint',

              result:
                error?.code ||
                'ENDPOINT_ERROR',

              status:
                error?.status ??
                null
            });
          }
        }
      }
    } catch (
      error
    ) {
      diagnostics.push({
        url:
          entry.url,

        type:
          entry.type,

        result:
          error?.code ||
          'UNKNOWN_ERROR',

        status:
          error?.status ??
          null
      });

      strongestError =
        strongestError ||
        error;

      /*
       * Jangan terus memukul URL yang sama.
       *
       * Candidate route lain tetap boleh dicoba.
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
        continue;
      }
    }
  }

  const error =
    providerError(
      'PARSER_FAILED',

      'Strict store parser tidak menemukan pasangan produk dan harga yang tervalidasi',

      {
        parserReason:
          'STRICT_PRODUCT_PRICE_PAIR_NOT_FOUND',

        strictParserDiagnostics: {
          version:
            STRICT_STORE_PARSER_VERSION,

          storeId:
            store.id,

          gameId:
            game?.id ||
            null,

          attemptedUrls: [
            ...attempted
          ],

          attempts:
            diagnostics,

          previousError:
            strongestError
              ? {
                  code:
                    strongestError
                      .code ||
                    null,

                  status:
                    strongestError
                      .status ??
                    null
                }
              : null
        }
      }
    );

  throw error;
}

module.exports = {
  STRICT_STORE_PARSER_VERSION,

  strictProductName,

  parseVisibleCards,

  parseJsonDocuments,

  parseObjectFragments,

  parseStrictDocument,

  fetchStrictStoreOffers
};
