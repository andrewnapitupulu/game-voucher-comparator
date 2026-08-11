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
    .replace(
      /&#(\d+);/g,
      (_, number) => String.fromCodePoint(Number(number))
    )
    .replace(
      /&#x([0-9a-f]+);/gi,
      (_, number) => String.fromCodePoint(parseInt(number, 16))
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

/**
 * Menghitung berapa banyak nominal produk
 * yang muncul dalam satu teks.
 *
 * Contoh:
 *
 * "5 Diamonds"
 * -> 1
 *
 * "425 diamonds, 475 diamonds dan 495 diamonds"
 * -> 3
 *
 * "78 + 8 Diamonds"
 * -> 1
 */
function countProductAmounts(value) {
  const text = String(value || '');

  const matches = text.match(
    /\b\d[\d.,]*\s*(?:bonus\s*)?(?:diamond(?:s)?|uc|vp|point(?:s)?|genesis\s+crystal(?:s)?|crystal(?:s)?|token(?:s)?|voucher(?:s)?|shell(?:s)?|coin(?:s)?|credit(?:s)?|cp)\b/gi
  );

  return matches
    ? matches.length
    : 0;
}

/**
 * Mendeteksi kalimat artikel, deskripsi,
 * atau promosi yang kebetulan mengandung
 * nominal diamond/UC/dll.
 *
 * Contoh yang harus ditolak:
 *
 * "Untuk top up 50 ribuan kamu bisa mendapatkan
 * 425 diamonds, 475 diamonds dan 495 diamonds."
 *
 * Tetapi:
 *
 * "5 Diamond Termurah, Harga Rp 848"
 *
 * tetap boleh dianggap sebagai produk.
 */
function looksLikeMarketingSentence(value) {
  const text = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) {
    return false;
  }

  const wordCount =
    text
      .split(/\s+/)
      .filter(Boolean)
      .length;

  const productAmountCount =
    countProductAmounts(text);

  /*
   * Jika satu kalimat menyebut beberapa
   * nominal produk sekaligus, hampir pasti
   * itu artikel/deskripsi dan bukan satu SKU.
   */
  if (productAmountCount > 1) {
    return true;
  }

  /*
   * Kalimat sangat panjang yang mengandung
   * nominal produk kemungkinan besar merupakan
   * deskripsi.
   */
  if (
    wordCount > 18 &&
    productAmountCount >= 1
  ) {
    return true;
  }

  /*
   * Pola kalimat natural/promosi.
   *
   * Diberi batas minimal jumlah kata agar:
   *
   * "5 Diamond Termurah, Harga Rp 848"
   *
   * tidak ikut ditolak.
   */
  if (
    wordCount >= 8 &&
    /^(?:untuk\b|kamu\b|anda\b|dengan\b|jika\b|kalau\b|cukup\b|mulai\b|top\s*up\s+\d)/i.test(
      text
    )
  ) {
    return true;
  }

  if (
    wordCount >= 10 &&
    /\b(?:kamu|anda)\s+(?:bisa|dapat|akan)\b/i.test(
      text
    )
  ) {
    return true;
  }

  if (
    wordCount >= 10 &&
    /\b(?:bisa|dapat|dapatkan|mendapatkan|nikmati)\b.{0,50}\b(?:diamond(?:s)?|uc|vp|point(?:s)?|crystal(?:s)?|cp)\b/i.test(
      text
    )
  ) {
    return true;
  }

  return false;
}

function isProductName(line) {
  const value = String(line || '')
    .replace(/\s+/g, ' ')
    .trim();

  if (
    value.length < 2 ||
    value.length > 160
  ) {
    return false;
  }

  /*
   * Filter utama untuk bug VCGamers.
   */
  if (
    looksLikeMarketingSentence(value)
  ) {
    return false;
  }

  /*
   * Label UI / teks generik.
   */
  if (
    /^(?:image:|dari$|best seller$|promo$|diskon$|pilih$|harga$|nominal$|deskripsi$|detail$|lihat semua$)/i.test(
      value
    )
  ) {
    return false;
  }

  /*
   * Angka atau harga saja bukan produk.
   */
  if (
    /^(?:rp\.?\s*)?\d[\d.,]*$/i.test(
      value
    )
  ) {
    return false;
  }

  /*
   * Nama produk harus mengandung
   * nominal produk atau paket khusus.
   *
   * Contoh valid:
   *
   * 5 Diamonds
   * 86 Diamonds
   * 720 UC
   * 475 VP
   * 78 + 8 Diamonds
   * Mobile Legends 86 Diamonds
   * 5 Diamond Termurah, Harga Rp 848
   * Weekly Diamond Pass
   */
  return /(?:\d[\d.,]*\s*(?:bonus\s*)?(?:diamond(?:s)?|uc|vp|point(?:s)?|genesis\s+crystal(?:s)?|crystal(?:s)?|token(?:s)?|voucher(?:s)?|shell(?:s)?|coin(?:s)?|credit(?:s)?|cp)|weekly\s+diamond\s+pass|welkin|blessing|starlight|twilight|elite\s+bundle|epic\s+bundle|battle\s+pass|membership|monthly\s+pass|weekly\s+pass)/i.test(
    value
  );
}

function extractOffersFromLines(
  lines,
  options = {}
) {
  const {
    /*
     * Sebelumnya 8 baris.
     *
     * Itu terlalu jauh untuk parser universal
     * dan berisiko mengambil harga dari
     * card produk lain.
     */
    maxDistance = 4,

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
      cursor <= Math.min(
        index + maxDistance,
        lines.length - 1
      );
      cursor += 1
    ) {
      const line = lines[cursor];

      /*
       * Jangan pernah meminjam harga
       * dari produk berikutnya.
       *
       * Contoh:
       *
       * 5 Diamonds
       * 12 Diamonds
       * Rp 3.000
       *
       * 5 Diamonds tidak boleh
       * mendapatkan harga Rp3.000.
       */
      if (
        cursor > index &&
        isProductName(line)
      ) {
        break;
      }

      /*
       * Abaikan teks artikel/promosi
       * yang berada di antara elemen.
       */
      if (
        cursor > index &&
        looksLikeMarketingSentence(line)
      ) {
        continue;
      }

      /*
       * Harga dari HTML hanya diproses
       * jika mempunyai marker Rupiah.
       *
       * Contoh:
       *
       * "5 Diamonds Rp 1.000"
       *
       * -> Rp1.000
       *
       * bukan Rp5.
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
      id:
        `${storeId}-` +
        `${gameId}-` +
        `${offers.length + 1}`,

      storeId,
      storeName,
      gameId,

      originalName:
        name,

      productPrice:
        price,

      finalPrice:
        price,

      feeStatus:
        'unknown',

      priceText:
        priceLine,

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
  ].map(
    (match) => match[1]
  );

  const nameKeys = [
    'name',
    'product_name',
    'productName',
    'denomination',
    'title',
    'label'
  ];

  /*
   * "amount" sengaja TIDAK masuk.
   *
   * Karena banyak API menggunakan:
   *
   * amount: 5
   *
   * untuk berarti 5 Diamonds,
   * bukan harga Rp5.
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

  for (
    const script of scripts
  ) {
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

  return offers.filter(
    (offer) => {
      const key =
        `${String(
          offer.originalName
        )
          .toLowerCase()
          .replace(/\s+/g, ' ')}` +
        `|${offer.productPrice}`;

      if (
        seen.has(key)
      ) {
        return false;
      }

      seen.add(key);

      return true;
    }
  );
}

module.exports = {
  decodeEntities,
  htmlToLines,
  sliceLines,

  countProductAmounts,
  looksLikeMarketingSentence,

  isProductName,
  extractOffersFromLines,
  extractJsonScriptOffers,
  dedupeOffers
};
