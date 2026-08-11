'use strict';

const {
  parseRupiah
} = require(
  './money'
);

const ENTITY_MAP = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' '
};

function decodeEntities(value) {
  return String(
    value ||
    ''
  )
    .replace(
      /&#(\d+);/g,

      (
        _,
        number
      ) =>
        String.fromCodePoint(
          Number(number)
        )
    )

    .replace(
      /&#x([0-9a-f]+);/gi,

      (
        _,
        number
      ) =>
        String.fromCodePoint(
          parseInt(
            number,
            16
          )
        )
    )

    .replace(
      /&([a-z]+);/gi,

      (
        match,
        entity
      ) =>
        ENTITY_MAP[
          entity.toLowerCase()
        ] ??
        match
    );
}

function htmlToLines(
  html,
  {
    keepScripts = false
  } = {}
) {
  let value =
    String(
      html ||
      ''
    );

  if (!keepScripts) {
    value =
      value

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

      .replace(
        /<[^>]+>/g,
        ' '
      )
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
          .trim()
    )

    .filter(
      Boolean
    );
}

function sliceLines(
  lines,
  startPatterns = [],
  endPatterns = []
) {
  const starts =
    startPatterns.map(
      (pattern) =>
        pattern instanceof RegExp
          ? pattern
          : new RegExp(
              pattern,
              'i'
            )
    );

  const ends =
    endPatterns.map(
      (pattern) =>
        pattern instanceof RegExp
          ? pattern
          : new RegExp(
              pattern,
              'i'
            )
    );

  let start = 0;

  for (
    let index = 0;
    index <
    lines.length;
    index += 1
  ) {
    if (
      starts.some(
        (pattern) =>
          pattern.test(
            lines[index]
          )
      )
    ) {
      start =
        index +
        1;

      break;
    }
  }

  let end =
    lines.length;

  for (
    let index =
      start;

    index <
    lines.length;

    index += 1
  ) {
    if (
      ends.some(
        (pattern) =>
          pattern.test(
            lines[index]
          )
      )
    ) {
      end =
        index;

      break;
    }
  }

  return lines.slice(
    start,
    end
  );
}

const PRODUCT_UNIT_PATTERN =
  '(?:' +
  'lunar\\s+crystal(?:s)?|' +
  'genesis\\s+crystal(?:s)?|' +
  'oneiric\\s+shard(?:s)?|' +
  'rift\\s*crystal(?:s)?|' +
  'riftcrystal(?:s)?|' +
  'origeometry|' +
  'starstone(?:s)?|' +
  'monochrome|' +
  'lunite(?:s)?|' +
  'opal(?:s)?|' +
  'robux|' +
  'diamond(?:s)?|' +
  'uc|' +
  'vp|' +
  'point(?:s)?|' +
  'crystal(?:s)?|' +
  'token(?:s)?|' +
  'voucher(?:s)?|' +
  'shell(?:s)?|' +
  'coin(?:s)?|' +
  'credit(?:s)?|' +
  'cp' +
  ')';

function countProductAmounts(
  value
) {
  const text =
    String(
      value ||
      ''
    );

  const matches =
    text.match(
      new RegExp(
        `\\b\\d[\\d.,]*\\s*(?:bonus\\s*)?${PRODUCT_UNIT_PATTERN}\\b`,
        'gi'
      )
    );

  return matches
    ? matches.length
    : 0;
}

function isApproximatePriceText(
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

  if (!text) {
    return false;
  }

  return /(?:\bRp\.?|\bIDR\b)\s*\d[\d.,]*\s*(?:ribu(?:an)?|rb|k)\b/i.test(
    text
  );
}

function looksLikeUiInstruction(
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

  if (!text) {
    return false;
  }

  if (
    /^(?:pilih|pilihkan|select|choose|silakan pilih|silahkan pilih|tentukan|masukkan|masukan|isi|klik)\b/i.test(
      text
    )
  ) {
    return true;
  }

  if (
    /\b(?:diamond(?:s)?|membership|pass|voucher|uc|vp|cp|robux|opal(?:s)?|token(?:s)?|starstone(?:s)?|crystal(?:s)?|oneiric\s+shard(?:s)?|monochrome|lunite(?:s)?|origeometry)\b.{0,40}\batau\b.{0,40}\b(?:diamond(?:s)?|membership|pass|voucher|uc|vp|cp|robux|opal(?:s)?|token(?:s)?|starstone(?:s)?|crystal(?:s)?|oneiric\s+shard(?:s)?|monochrome|lunite(?:s)?|origeometry)\b/i.test(
      text
    )
  ) {
    return true;
  }

  if (
    /\b(?:choose|select)\b.{0,50}\b(?:diamond(?:s)?|membership|pass|voucher|uc|vp|cp|robux|opal(?:s)?|token(?:s)?|starstone(?:s)?|crystal(?:s)?|oneiric\s+shard(?:s)?|monochrome|lunite(?:s)?|origeometry)\b/i.test(
      text
    )
  ) {
    return true;
  }

  return false;
}

function looksLikeMarketingSentence(
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

  if (!text) {
    return false;
  }

  if (
    looksLikeUiInstruction(
      text
    )
  ) {
    return true;
  }

  if (
    isApproximatePriceText(
      text
    )
  ) {
    return true;
  }

  if (
    /^paket\b/i.test(
      text
    ) &&
    /:\s*/.test(
      text
    ) &&
    /\b(?:amankan|dapatkan|nikmati|stok|cuma|hanya|hemat|promo|termurah)\b/i.test(
      text
    )
  ) {
    return true;
  }

  const wordCount =
    text
      .split(
        /\s+/
      )
      .filter(
        Boolean
      )
      .length;

  const productAmountCount =
    countProductAmounts(
      text
    );

  if (
    productAmountCount >
    1
  ) {
    return true;
  }

  if (
    wordCount >
      18 &&
    productAmountCount >=
      1
  ) {
    return true;
  }

  if (
    wordCount >=
      8 &&
    /^(?:untuk\b|kamu\b|anda\b|dengan\b|jika\b|kalau\b|cukup\b|mulai\b|top\s*up\s+\d)/i.test(
      text
    )
  ) {
    return true;
  }

  if (
    wordCount >=
      10 &&
    /\b(?:kamu|anda)\s+(?:bisa|dapat|akan)\b/i.test(
      text
    )
  ) {
    return true;
  }

  if (
    wordCount >=
      10 &&
    /\b(?:bisa|dapat|dapatkan|mendapatkan|nikmati)\b.{0,50}\b(?:diamond(?:s)?|uc|vp|cp|robux|opal(?:s)?|token(?:s)?|starstone(?:s)?|crystal(?:s)?|oneiric\s+shard(?:s)?|monochrome|lunite(?:s)?|origeometry)\b/i.test(
      text
    )
  ) {
    return true;
  }

  return false;
}

function isNamedPackage(
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

  return /^(?:(?:mobile legends(?::\s*bang bang)?|mobile legend|mobilelegends?|mobilelegend|mlbb|free fire|pubg mobile|genshin impact|valorant|crystal of atlan|honor of kings|call of duty(?::\s*)?mobile|cod mobile|codm|rf online next|ragnarok(?::\s*)?the new world|duet night abyss|roblox|neverness to everness|arknights(?::\s*)?endfield|zenless zone zero|honkai(?::\s*)?star rail|chaos zero nightmare|wuthering waves)\s*[-–—:]?\s*)?(?:weekly diamond pass(?:\s*[2-9]\s*x)?|weekly pass|weekly card plus|weekly card|monthly pass|membership mingguan|weekly membership|monthly membership|starlight(?: membership)?|starlight member(?: plus)?|twilight pass|welkin(?: moon)?|blessing(?: of the welkin moon)?|elite bundle|epic bundle|battle pass|honor pass|royale pass|coupon pass|kafra monthly|express supply pass|inter[-\s]*knot membership|coronomicon monthly(?: package)?|special data|zero data|lunite subscription)(?:\s*\$?\s*\d+(?:[.,]\d+)?)?(?:\s*[-–—:]?\s*(?:mobile legends(?::\s*bang bang)?|mobile legend|mobilelegends?|mobilelegend|mlbb|free fire|pubg mobile|genshin impact|valorant|crystal of atlan|honor of kings|call of duty(?::\s*)?mobile|cod mobile|codm|rf online next|ragnarok(?::\s*)?the new world|duet night abyss|roblox|neverness to everness|arknights(?::\s*)?endfield|zenless zone zero|honkai(?::\s*)?star rail|chaos zero nightmare|wuthering waves))?$/i.test(
    text
  );
}

function hasNumericProduct(
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

  const amountPattern =
    new RegExp(
      `\\d[\\d.,]*(?:\\s*\\+\\s*\\d[\\d.,]*)?\\s*(?:bonus\\s*)?${PRODUCT_UNIT_PATTERN}\\b`,
      'i'
    );

  return amountPattern.test(
    text
  );
}

function isProductName(
  line
) {
  const value =
    String(
      line ||
      ''
    )
      .replace(
        /\s+/g,
        ' '
      )
      .trim();

  if (
    value.length <
      2 ||
    value.length >
      160
  ) {
    return false;
  }

  if (
    looksLikeUiInstruction(
      value
    )
  ) {
    return false;
  }

  if (
    looksLikeMarketingSentence(
      value
    )
  ) {
    return false;
  }

  if (
    /^(?:image:|dari$|best seller$|promo$|diskon$|pilih$|harga$|nominal$|deskripsi$|detail$|lihat semua$|pilih nominal$|pilih produk$|pilih diamond$)/i.test(
      value
    )
  ) {
    return false;
  }

  if (
    /^(?:rp\.?\s*)?\d[\d.,]*$/i.test(
      value
    )
  ) {
    return false;
  }

  if (
    hasNumericProduct(
      value
    )
  ) {
    return true;
  }

  if (
    isNamedPackage(
      value
    )
  ) {
    return true;
  }

  return false;
}

function extractOffersFromLines(
  lines,
  options = {}
) {
  const {
    maxDistance = 4,
    purchaseUrl,
    storeId,
    storeName,
    gameId,
    source = 'live'
  } = options;

  const offers =
    [];

  for (
    let index = 0;
    index <
    lines.length;
    index += 1
  ) {
    const name =
      lines[
        index
      ];

    if (
      !isProductName(
        name
      )
    ) {
      continue;
    }

    let price =
      null;

    let priceLine =
      null;

    const priceDistance =
      isNamedPackage(
        name
      )
        ? 1
        : maxDistance;

    for (
      let cursor =
        index;

      cursor <=
      Math.min(
        index +
          priceDistance,

        lines.length -
          1
      );

      cursor += 1
    ) {
      const line =
        lines[
          cursor
        ];

      if (
        cursor >
          index &&
        isProductName(
          line
        )
      ) {
        break;
      }

      if (
        cursor >
          index &&
        looksLikeUiInstruction(
          line
        )
      ) {
        continue;
      }

      if (
        cursor >
          index &&
        looksLikeMarketingSentence(
          line
        )
      ) {
        continue;
      }

      if (
        isApproximatePriceText(
          line
        )
      ) {
        continue;
      }

      if (
        /(?:\bIDR\b|\bRp\.?)/i.test(
          line
        )
      ) {
        const parsed =
          parseRupiah(
            line
          );

        if (
          parsed &&
          parsed >
            0
        ) {
          price =
            parsed;

          priceLine =
            line;

          break;
        }
      }
    }

    if (!price) {
      continue;
    }

    offers.push({
      id:
        `${storeId}-${gameId}-${offers.length + 1}`,

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
        new Date()
          .toISOString()
    });
  }

  return dedupeOffers(
    offers
  );
}

function extractJsonScriptOffers(
  html,
  context
) {
  const offers =
    [];

  const scripts = [
    ...String(
      html ||
      ''
    ).matchAll(
      /<script\b[^>]*>([\s\S]*?)<\/script>/gi
    )
  ].map(
    (match) =>
      match[1]
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
   * amount sengaja tidak dimasukkan.
   *
   * amount sering berarti jumlah
   * currency game, bukan harga.
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
    const script of
    scripts
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
      ) ||
      [];

    for (
      const objectText of
      objectMatches
    ) {
      let parsed;

      try {
        parsed =
          JSON.parse(
            objectText
          );
      } catch {
        continue;
      }

      const nameKey =
        nameKeys.find(
          (key) =>
            typeof parsed[
              key
            ] ===
            'string'
        );

      const priceKey =
        priceKeys.find(
          (key) =>
            parsed[
              key
            ] !==
            undefined
        );

      if (
        !nameKey ||
        !priceKey ||
        !isProductName(
          parsed[
            nameKey
          ]
        )
      ) {
        continue;
      }

      const price =
        parseRupiah(
          parsed[
            priceKey
          ]
        );

      if (
        !price ||
        price <=
          0
      ) {
        continue;
      }

      offers.push({
        id:
          `${context.storeId}-${context.gameId}-json-${offers.length + 1}`,

        storeId:
          context.storeId,

        storeName:
          context.storeName,

        gameId:
          context.gameId,

        originalName:
          parsed[
            nameKey
          ],

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
          new Date()
            .toISOString()
      });
    }
  }

  return dedupeOffers(
    offers
  );
}

function dedupeOffers(
  offers
) {
  const seen =
    new Set();

  return offers.filter(
    (offer) => {
      const key =
        `${String(
          offer.originalName
        )
          .toLowerCase()
          .replace(
            /\s+/g,
            ' '
          )}|${offer.productPrice}`;

      if (
        seen.has(
          key
        )
      ) {
        return false;
      }

      seen.add(
        key
      );

      return true;
    }
  );
}

module.exports = {
  decodeEntities,
  htmlToLines,
  sliceLines,
  countProductAmounts,
  isApproximatePriceText,
  looksLikeUiInstruction,
  looksLikeMarketingSentence,
  isNamedPackage,
  isProductName,
  extractOffersFromLines,
  extractJsonScriptOffers,
  dedupeOffers
};
