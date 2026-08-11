'use strict';

const { parseRupiah } = require('./money');

const ENTITY_MAP = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' '
};

function decodeEntities(value) {
  return String(value || '')
    .replace(/&#(\d+);/g, (_, number) =>
      String.fromCodePoint(Number(number))
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, number) =>
      String.fromCodePoint(parseInt(number, 16))
    )
    .replace(
      /&([a-z]+);/gi,
      (match, entity) =>
        ENTITY_MAP[entity.toLowerCase()] ?? match
    );
}

function htmlToLines(html, { keepScripts = false } = {}) {
  let value = String(html || '');

  if (!keepScripts) {
    value = value
      .replace(
        /<script\b[^>]*>[\s\S]*?<\/script>/gi,
        ' '
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
      );
  }

  return decodeEntities(
    value
      .replace(
        /<(?:br|\/p|\/div|\/li|\/tr|\/td|\/th|\/h[1-6]|\/section|\/article)>/gi,
        '\n'
      )
      .replace(/<[^>]+>/g, ' ')
  )
    .split(/\r?\n/)
    .map((line) =>
      line.replace(/\s+/g, ' ').trim()
    )
    .filter(Boolean);
}

function sliceLines(
  lines,
  startPatterns = [],
  endPatterns = []
) {
  const starts = startPatterns.map((pattern) =>
    pattern instanceof RegExp
      ? pattern
      : new RegExp(pattern, 'i')
  );

  const ends = endPatterns.map((pattern) =>
    pattern instanceof RegExp
      ? pattern
      : new RegExp(pattern, 'i')
  );

  let start = 0;

  for (
    let index = 0;
    index < lines.length;
    index += 1
  ) {
    if (
      starts.some((pattern) =>
        pattern.test(lines[index])
      )
    ) {
      start = index + 1;
      break;
    }
  }

  let end = lines.length;

  for (
    let index = start;
    index < lines.length;
    index += 1
  ) {
    if (
      ends.some((pattern) =>
        pattern.test(lines[index])
      )
    ) {
      end = index;
      break;
    }
  }

  return lines.slice(start, end);
}

function isProductName(line) {
  const value = String(line || '').trim();

  if (
    value.length < 2 ||
    value.length > 120
  ) {
    return false;
  }

  if (
    /^(image:|dari$|best seller|promo$|diskon|pilih|harga$|nominal$)/i.test(
      value
    )
  ) {
    return false;
  }

  if (
    /^(rp\.?\s*)?\d[\d.,]*$/i.test(
      value
    )
  ) {
    return false;
  }

  return /(?:\d[\d.,]*\s*(?:diamond(?:s)?|uc|vp|point(?:s)?|genesis crystal(?:s)?|crystal(?:s)?|token(?:s)?|voucher(?:s)?|shell(?:s)?|coin(?:s)?|credit(?:s)?|cp)|weekly diamond pass|welkin|blessing|starlight|twilight|elite bundle|epic bundle|battle pass|membership|monthly pass|weekly pass)/i.test(
    value
  );
}

function extractOffersFromLines(
  lines,
  options = {}
) {
  const {
    maxDistance = 8,
    purchaseUrl,
    storeId,
    storeName,
    gameId,
    source = 'live'
  } = options;

  const offers = [];

  for (
    let index = 0;
    index < lines.length;
    index += 1
  ) {
    const name = lines[index];

    if (!isProductName(name)) {
      continue;
    }

    let price = null;
    let priceLine = null;

    for (
      let cursor = index;
      cursor <=
      Math.min(
        index + maxDistance,
        lines.length - 1
      );
      cursor += 1
    ) {
      const line = lines[cursor];

      /*
       * Jangan mengambil harga milik
       * produk berikutnya.
       *
       * Contoh:
       *
       * 5 Diamonds
       * 12 Diamonds
       * Rp 3.000
       *
       * Rp 3.000 bukan harga
       * 5 Diamonds.
       */
      if (
        cursor > index &&
        isProductName(line)
      ) {
        break;
      }

      /*
       * Harga hanya boleh diparsing
       * jika baris memiliki konteks
       * mata uang.
       *
       * Ini mencegah:
       *
       * "5 Diamonds Rp 1.000"
       *
       * dibaca sebagai Rp 5.
       */
      if (
        /(?:\bIDR\b|\bRp\.?)/i.test(
          line
        )
      ) {
        const parsed =
          parseRupiah(line);

        if (
          parsed &&
          parsed > 0
        ) {
          price = parsed;
          priceLine = line;
          break;
        }
      }
    }

    if (!price) {
      continue;
    }

    offers.push({
      id: `${storeId}-${gameId}-${offers.length + 1}`,
      storeId,
      storeName,
      gameId,
      originalName: name,
      productPrice: price,
      finalPrice: price,
      feeStatus: 'unknown',
      priceText: priceLine,
      purchaseUrl,
      source,
      checkedAt:
        new Date().toISOString()
    });
  }

  return dedupeOffers(offers);
}

function extractJsonScriptOffers(
  html,
  context
) {
  const offers = [];

  const scripts = [
    ...String(html || '').matchAll(
      /<script\b[^>]*>([\s\S]*?)<\/script>/gi
    )
  ].map((match) => match[1]);

  const nameKeys = [
    'name',
    'product_name',
    'productName',
    'denomination',
    'title',
    'label'
  ];

  /*
   * Jangan masukkan "amount"
   * sebagai price key.
   *
   * Karena response seperti:
   *
   * {
   *   "name": "5 Diamonds",
   *   "amount": 5,
   *   "price": 1000
   * }
   *
   * amount berarti jumlah
   * diamond, bukan harga.
   */
  const priceKeys = [
    'price',
    'selling_price',
    'sellingPrice',
    'sell_price',
    'sellPrice',
    'sale_price',
    'salePrice',
    'nominal_price',
    'final_price',
    'finalPrice',
    'discount_price',
    'discountPrice',
    'total_price',
    'totalPrice'
  ];

  for (const script of scripts) {
    if (
      !/(price|sellingPrice|productName|denomination)/i.test(
        script
      )
    ) {
      continue;
    }

    const objectMatches =
      script.match(
        /\{[^{}]{0,900}\}/g
      ) || [];

    for (
      const objectText of objectMatches
    ) {
      let parsed;

      try {
        parsed =
          JSON.parse(objectText);
      } catch {
        continue;
      }

      const nameKey =
        nameKeys.find(
          (key) =>
            typeof parsed[key] ===
            'string'
        );

      const priceKey =
        priceKeys.find(
          (key) =>
            parsed[key] !== undefined
        );

      if (
        !nameKey ||
        !priceKey ||
        !isProductName(
          parsed[nameKey]
        )
      ) {
        continue;
      }

      const price =
        parseRupiah(
          parsed[priceKey]
        );

      if (
        !price ||
        price <= 0
      ) {
        continue;
      }

      offers.push({
        id:
          `${context.storeId}-` +
          `${context.gameId}-json-` +
          `${offers.length + 1}`,

        storeId:
          context.storeId,

        storeName:
          context.storeName,

        gameId:
          context.gameId,

        originalName:
          parsed[nameKey],

        productPrice:
          price,

        finalPrice:
          price,

        feeStatus:
          'unknown',

        purchaseUrl:
          parsed.url ||
          parsed.link ||
          context.purchaseUrl,

        source:
          'live',

        checkedAt:
          new Date().toISOString()
      });
    }
  }

  return dedupeOffers(offers);
}

function dedupeOffers(offers) {
  const seen = new Set();

  return offers.filter((offer) => {
    const key =
      `${String(
        offer.originalName
      )
        .toLowerCase()
        .replace(/\s+/g, ' ')}` +
      `|${offer.productPrice}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

module.exports = {
  decodeEntities,
  htmlToLines,
  sliceLines,
  isProductName,
  extractOffersFromLines,
  extractJsonScriptOffers,
  dedupeOffers
};
