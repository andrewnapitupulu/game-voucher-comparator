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
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ' ');
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
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function sliceLines(lines, startPatterns = [], endPatterns = []) {
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

  for (let index = 0; index < lines.length; index += 1) {
    if (starts.some((pattern) => pattern.test(lines[index]))) {
      start = index + 1;
      break;
    }
  }

  let end = lines.length;

  for (let index = start; index < lines.length; index += 1) {
    if (ends.some((pattern) => pattern.test(lines[index]))) {
      end = index;
      break;
    }
  }

  return lines.slice(start, end);
}

const PRODUCT_UNIT_PATTERN =
  '(?:diamond(?:s)?|uc|vp|point(?:s)?|genesis\\s+crystal(?:s)?|crystal(?:s)?|token(?:s)?|voucher(?:s)?|shell(?:s)?|coin(?:s)?|credit(?:s)?|cp)';

function countProductAmounts(value) {
  const text = String(value || '');

  const matches = text.match(
    new RegExp(
      `\\b\\d[\\d.,]*\\s*(?:bonus\\s*)?${PRODUCT_UNIT_PATTERN}\\b`,
      'gi'
    )
  );

  return matches ? matches.length : 0;
}

function looksLikeUiInstruction(value) {
  const text = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) {
    return false;
  }

  /*
   * Teks instruksi/CTA tidak boleh dianggap SKU.
   *
   * Contoh:
   *
   * Pilih Diamond
   * Pilih Diamond atau Membership Mingguan Free Fire
   * Select Package
   */
  if (
    /^(?:pilih|pilihkan|select|choose|silakan pilih|silahkan pilih|tentukan|masukkan|masukan|isi|klik)\b/i.test(
      text
    )
  ) {
    return true;
  }

  /*
   * Contoh bug VCGamers:
   *
   * "Pilih Diamond atau Membership Mingguan Free Fire"
   *
   * Kalimat seperti ini menjelaskan pilihan kategori,
   * bukan sebuah produk.
   */
  if (
    /\b(?:diamond(?:s)?|membership|pass|voucher|uc|vp)\b.{0,40}\batau\b.{0,40}\b(?:diamond(?:s)?|membership|pass|voucher|uc|vp)\b/i.test(
      text
    )
  ) {
    return true;
  }

  if (
    /\b(?:choose|select)\b.{0,50}\b(?:diamond(?:s)?|membership|pass|voucher|uc|vp)\b/i.test(
      text
    )
  ) {
    return true;
  }

  return false;
}

function looksLikeMarketingSentence(value) {
  const text = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) {
    return false;
  }

  if (looksLikeUiInstruction(text)) {
    return true;
  }

  const wordCount =
    text
      .split(/\s+/)
      .filter(Boolean)
      .length;

  const productAmountCount =
    countProductAmounts(text);

  /*
   * Jika satu kalimat menyebut beberapa nominal,
   * kemungkinan besar itu artikel/deskripsi.
   *
   * Contoh:
   *
   * "425 diamonds, 475 diamonds dan 495 diamonds"
   */
  if (productAmountCount > 1) {
    return true;
  }

  if (
    wordCount > 18 &&
    productAmountCount >= 1
  ) {
    return true;
  }

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

function isNamedPackage(value) {
  const text = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();

  /*
   * Paket tanpa angka harus cocok secara penuh.
   *
   * Jangan hanya menggunakan /membership/i,
   * karena akan salah menangkap teks seperti:
   *
   * "Pilih Diamond atau Membership Mingguan Free Fire"
   */
  return /^(?:(?:mobile legends(?::\s*bang bang)?|mlbb|free fire|pubg mobile|genshin impact|valorant)\s*[-–—:]?\s*)?(?:weekly diamond pass|weekly pass|monthly pass|membership mingguan|weekly membership|monthly membership|starlight(?: membership)?|twilight pass|welkin(?: moon)?|blessing(?: of the welkin moon)?|elite bundle|epic bundle|battle pass)(?:\s*[-–—:]?\s*(?:mobile legends(?::\s*bang bang)?|mlbb|free fire|pubg mobile|genshin impact|valorant))?$/i.test(
    text
  );
}

function hasNumericProduct(value) {
  const text = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();

  const amountPattern = new RegExp(
    `\\d[\\d.,]*(?:\\s*\\+\\s*\\d[\\d.,]*)?\\s*(?:bonus\\s*)?${PRODUCT_UNIT_PATTERN}\\b`,
    'i'
  );

  return amountPattern.test(text);
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
   * Filter paling awal:
   * teks instruksi UI tidak boleh masuk.
   */
  if (looksLikeUiInstruction(value)) {
    return false;
  }

  if (looksLikeMarketingSentence(value)) {
    return false;
  }

  /*
   * Label generik UI.
   */
  if (
    /^(?:image:|dari$|best seller$|promo$|diskon$|pilih$|harga$|nominal$|deskripsi$|detail$|lihat semua$|pilih nominal$|pilih produk$|pilih diamond$)/i.test(
      value
    )
  ) {
    return false;
  }

  /*
   * Angka/harga saja bukan nama produk.
   */
  if (
    /^(?:rp\.?\s*)?\d[\d.,]*$/i.test(
      value
    )
  ) {
    return false;
  }

  /*
   * SKU numerik.
   *
   * Contoh:
   *
   * 5 Diamonds
   * 86 Diamonds
   * 78 + 8 Diamonds
   * 720 UC
   * Mobile Legends 86 Diamonds
   * 5 Diamond Termurah, Harga Rp 848
   */
  if (hasNumericProduct(value)) {
    return true;
  }

  /*
   * Paket tanpa nominal angka hanya diterima
   * bila cocok dengan nama paket yang kita kenal.
   */
  if (isNamedPackage(value)) {
    return true;
  }

  return false;
}

function extractOffersFromLines(
  lines,
  options = {}
) {
  const {
    /*
     * Jarak dibuat pendek agar parser
     * tidak mengambil harga dari card lain.
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
       * Jangan meminjam harga
       * dari produk berikutnya.
       *
       * Contoh:
       *
       * 5 Diamonds
       * 12 Diamonds
       * Rp 3.000
       *
       * 5 Diamonds tidak boleh
       * mendapatkan Rp3.000.
       */
      if (
        cursor > index &&
        isProductName(line)
      ) {
        break;
      }

      /*
       * Lewati instruksi UI.
       */
      if (
        cursor > index &&
        looksLikeUiInstruction(line)
      ) {
        continue;
      }

      /*
       * Lewati artikel/deskripsi.
       */
      if (
        cursor > index &&
        looksLikeMarketingSentence(line)
      ) {
        continue;
      }

      /*
       * Harga HTML hanya diambil jika
       * mempunyai penanda mata uang.
       *
       * Contoh:
       *
       * 5 Diamonds Rp 1.000
       *
       * harus terbaca Rp1.000,
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
   * "amount" sengaja tidak dimasukkan.
   *
   * Banyak API menggunakan:
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

  return offers.filter(
    (offer) => {
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
    }
  );
}

module.exports = {
  decodeEntities,
  htmlToLines,
  sliceLines,

  countProductAmounts,
  looksLikeUiInstruction,
  looksLikeMarketingSentence,
  isNamedPackage,

  isProductName,
  extractOffersFromLines,
  extractJsonScriptOffers,
  dedupeOffers
};
