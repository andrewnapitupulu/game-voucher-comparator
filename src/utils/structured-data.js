'use strict';

const {
  parseRupiah
} = require(
  './money'
);

const {
  decodeEntities,
  isProductName,
  dedupeOffers
} = require(
  './html'
);

const NAME_KEYS = [
  'name',
  'product_name',
  'productName',
  'denomination',
  'title',
  'label',
  'package_name',
  'packageName',
  'item_name',
  'itemName'
];

const PRICE_KEYS = [
  'price',
  'selling_price',
  'sellingPrice',
  'sell_price',
  'sellPrice',
  'sale_price',
  'salePrice',
  'nominal_price',
  'nominalPrice',
  'final_price',
  'finalPrice',
  'discount_price',
  'discountPrice',
  'total_price',
  'totalPrice',
  'lowPrice',
  'highPrice'
];

const URL_KEYS = [
  'url',
  'link',
  'href',
  'purchaseUrl',
  'purchase_url'
];

const IDENTITY_KEYS = [
  'name',
  'title',
  'gameName',
  'game_name',
  'productName',
  'product_name',
  'label'
];

function isPlainObject(
  value
) {
  return Boolean(
    value
  ) &&
    typeof value ===
      'object' &&
    !Array.isArray(
      value
    );
}

function parseStructuredPrice(
  value
) {
  if (
    typeof value ===
      'number' &&
    Number.isFinite(
      value
    ) &&
    value >
      0
  ) {
    return Math.round(
      value
    );
  }

  const text =
    String(
      value ??
      ''
    )
      .trim();

  if (!text) {
    return null;
  }

  const rupiah =
    parseRupiah(
      text
    );

  if (
    rupiah &&
    rupiah >
      0
  ) {
    return rupiah;
  }

  const normalized =
    text
      .replace(
        /\s+/g,
        ''
      )
      .replace(
        /[^0-9.,]/g,
        ''
      );

  if (!normalized) {
    return null;
  }

  let numericText =
    normalized;

  if (
    /^\d{1,3}(?:\.\d{3})+$/.test(
      numericText
    )
  ) {
    numericText =
      numericText.replace(
        /\./g,
        ''
      );
  } else if (
    /^\d{1,3}(?:,\d{3})+$/.test(
      numericText
    )
  ) {
    numericText =
      numericText.replace(
        /,/g,
        ''
      );
  } else if (
    /^\d+(?:[.,]\d{1,2})$/.test(
      numericText
    )
  ) {
    numericText =
      numericText.replace(
        ',',
        '.'
      );
  } else {
    numericText =
      numericText.replace(
        /[.,]/g,
        ''
      );
  }

  const number =
    Number(
      numericText
    );

  return (
    Number.isFinite(
      number
    ) &&
    number >
      0
      ? Math.round(
          number
        )
      : null
  );
}

function extractScriptBlocks(
  html
) {
  const blocks =
    [];

  const regex =
    /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;

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
      String(
        match[1] ||
        ''
      );

    const body =
      String(
        match[2] ||
        ''
      )
        .trim();

    const typeMatch =
      attributes.match(
        /\btype\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i
      );

    const idMatch =
      attributes.match(
        /\bid\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i
      );

    blocks.push({
      attributes,

      body,

      type:
        String(
          typeMatch?.[1] ||
          typeMatch?.[2] ||
          typeMatch?.[3] ||
          ''
        )
          .toLowerCase(),

      id:
        String(
          idMatch?.[1] ||
          idMatch?.[2] ||
          idMatch?.[3] ||
          ''
        )
    });
  }

  return blocks;
}

function safeJsonParse(
  value
) {
  const text =
    decodeEntities(
      String(
        value ||
        ''
      )
    )
      .replace(
        /^\uFEFF/,
        ''
      )
      .replace(
        /^\s*<!--/,
        ''
      )
      .replace(
        /-->\s*$/,
        ''
      )
      .trim();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(
      text
    );
  } catch {
    return null;
  }
}

function extractBalancedJson(
  text,
  startIndex
) {
  const source =
    String(
      text ||
      ''
    );

  const startChar =
    source[
      startIndex
    ];

  if (
    startChar !==
      '{' &&
    startChar !==
      '['
  ) {
    return null;
  }

  const stack = [
    startChar
  ];

  let quote =
    null;

  let escaped =
    false;

  for (
    let index =
      startIndex +
      1;

    index <
    source.length;

    index +=
      1
  ) {
    const char =
      source[
        index
      ];

    if (quote) {
      if (escaped) {
        escaped =
          false;

        continue;
      }

      if (
        char ===
        '\\'
      ) {
        escaped =
          true;

        continue;
      }

      if (
        char ===
        quote
      ) {
        quote =
          null;
      }

      continue;
    }

    if (
      char ===
        '"' ||
      char ===
        "'"
    ) {
      quote =
        char;

      continue;
    }

    if (
      char ===
        '{' ||
      char ===
        '['
    ) {
      stack.push(
        char
      );

      continue;
    }

    if (
      char ===
        '}' ||
      char ===
        ']'
    ) {
      const expected =
        char ===
        '}'
          ? '{'
          : '[';

      if (
        stack[
          stack.length -
          1
        ] !==
        expected
      ) {
        return null;
      }

      stack.pop();

      if (
        !stack.length
      ) {
        return source.slice(
          startIndex,
          index +
            1
        );
      }
    }
  }

  return null;
}

function extractAssignmentDocuments(
  script
) {
  const documents =
    [];

  const patterns = [
    /(?:window\.|self\.)?__INITIAL_STATE__\s*=\s*/g,
    /(?:window\.|self\.)?__PRELOADED_STATE__\s*=\s*/g,
    /(?:window\.|self\.)?__INITIAL_DATA__\s*=\s*/g,
    /(?:window\.|self\.)?__APOLLO_STATE__\s*=\s*/g,
    /(?:window\.|self\.)?__NUXT__\s*=\s*/g,
    /(?:window\.|self\.)?__NEXT_DATA__\s*=\s*/g
  ];

  for (
    const pattern of
    patterns
  ) {
    for (
      const match of
      String(
        script ||
        ''
      ).matchAll(
        pattern
      )
    ) {
      let cursor =
        match.index +
        match[0].length;

      while (
        /\s/.test(
          script[
            cursor
          ] ||
          ''
        )
      ) {
        cursor +=
          1;
      }

      const jsonText =
        extractBalancedJson(
          script,
          cursor
        );

      if (!jsonText) {
        continue;
      }

      const parsed =
        safeJsonParse(
          jsonText
        );

      if (
        parsed !==
        null
      ) {
        documents.push(
          parsed
        );
      }
    }
  }

  return documents;
}

function extractEmbeddedDocuments(
  html
) {
  const scripts =
    extractScriptBlocks(
      html
    );

  const documents =
    [];

  let parseErrors =
    0;

  for (
    const script of
    scripts
  ) {
    const isJsonScript =
      /application\/(?:ld\+json|json)/i.test(
        script.type
      ) ||
      /^__NEXT_DATA__$/i.test(
        script.id
      ) ||
      /^__NUXT_DATA__$/i.test(
        script.id
      );

    if (
      isJsonScript
    ) {
      const parsed =
        safeJsonParse(
          script.body
        );

      if (
        parsed !==
        null
      ) {
        documents.push(
          parsed
        );
      } else if (
        script.body
      ) {
        parseErrors +=
          1;
      }
    }

    const assigned =
      extractAssignmentDocuments(
        script.body
      );

    documents.push(
      ...assigned
    );
  }

  return {
    scripts,
    documents,
    parseErrors
  };
}

function firstString(
  object,
  keys
) {
  for (
    const key of
    keys
  ) {
    if (
      typeof object?.[
        key
      ] ===
        'string' &&
      object[
        key
      ].trim()
    ) {
      return object[
        key
      ]
        .trim();
    }
  }

  return null;
}

function directPrice(
  object
) {
  for (
    const key of
    PRICE_KEYS
  ) {
    if (
      object?.[
        key
      ] ===
        undefined ||
      object?.[
        key
      ] ===
        null
    ) {
      continue;
    }

    const price =
      parseStructuredPrice(
        object[
          key
        ]
      );

    if (price) {
      return price;
    }
  }

  return null;
}

function findNestedPrice(
  object,
  depth = 0
) {
  if (
    !object ||
    depth >
      3
  ) {
    return null;
  }

  const direct =
    directPrice(
      object
    );

  if (direct) {
    return direct;
  }

  const nestedKeys = [
    'offers',
    'offer',
    'priceSpecification',
    'price_specification',
    'pricing',
    'variant',
    'variants'
  ];

  for (
    const key of
    nestedKeys
  ) {
    const value =
      object[
        key
      ];

    if (!value) {
      continue;
    }

    if (
      Array.isArray(
        value
      )
    ) {
      for (
        const entry of
        value
      ) {
        const price =
          findNestedPrice(
            entry,
            depth +
              1
          );

        if (price) {
          return price;
        }
      }
    } else if (
      typeof value ===
      'object'
    ) {
      const price =
        findNestedPrice(
          value,
          depth +
            1
        );

      if (price) {
        return price;
      }
    }
  }

  return null;
}

function firstUrl(
  object,
  fallback
) {
  const direct =
    firstString(
      object,
      URL_KEYS
    );

  if (!direct) {
    return fallback;
  }

  try {
    return new URL(
      direct,
      fallback
    ).toString();
  } catch {
    return fallback;
  }
}

function extractOffersFromDocument(
  document,
  context,
  diagnostics
) {
  const offers =
    [];

  const visited =
    new WeakSet();

  function walk(
    value,
    inheritedName = null,
    depth = 0
  ) {
    if (
      depth >
        18 ||
      value ===
        null ||
      value ===
        undefined
    ) {
      return;
    }

    if (
      Array.isArray(
        value
      )
    ) {
      for (
        const entry of
        value
      ) {
        walk(
          entry,
          inheritedName,
          depth +
            1
        );
      }

      return;
    }

    if (
      !isPlainObject(
        value
      )
    ) {
      return;
    }

    if (
      visited.has(
        value
      )
    ) {
      return;
    }

    visited.add(
      value
    );

    diagnostics.objectCount +=
      1;

    const rawName =
      firstString(
        value,
        NAME_KEYS
      ) ||
      inheritedName;

    const productName =
      rawName &&
      isProductName(
        rawName
      )
        ? rawName
        : null;

    const price =
      findNestedPrice(
        value
      );

    if (
      rawName ||
      price
    ) {
      diagnostics.candidateObjectCount +=
        1;
    }

    if (
      productName
    ) {
      diagnostics.productObjectCount +=
        1;
    }

    if (
      productName &&
      price
    ) {
      offers.push({
        id:
          `${context.storeId}-${context.gameId}-structured-${offers.length + 1}`,

        storeId:
          context.storeId,

        storeName:
          context.storeName,

        gameId:
          context.gameId,

        originalName:
          productName,

        productPrice:
          price,

        finalPrice:
          price,

        feeStatus:
          'unknown',

        purchaseUrl:
          firstUrl(
            value,
            context.purchaseUrl
          ),

        source:
          context.source ||
          'live',

        checkedAt:
          new Date()
            .toISOString()
      });
    }

    const nextInheritedName =
      productName ||
      inheritedName;

    for (
      const child of
      Object.values(
        value
      )
    ) {
      if (
        child &&
        typeof child ===
          'object'
      ) {
        walk(
          child,
          nextInheritedName,
          depth +
            1
        );
      }
    }
  }

  walk(
    document
  );

  return offers;
}

function detectDynamicPageSignals(
  html
) {
  const text =
    String(
      html ||
      ''
    );

  const lower =
    text.toLowerCase();

  const frameworks =
    [];

  if (
    /__next_data__|\/_next\//i.test(
      text
    )
  ) {
    frameworks.push(
      'nextjs'
    );
  }

  if (
    /__nuxt__|__nuxt_data__|\/_nuxt\//i.test(
      text
    )
  ) {
    frameworks.push(
      'nuxt'
    );
  }

  if (
    /id=["']app["']|id=["']root["']/i.test(
      text
    )
  ) {
    frameworks.push(
      'spa-root'
    );
  }

  const apiHints =
    new Set();

  const patterns = [
    /["'`](\/api\/[a-z0-9_./?=&%-]{3,180})["'`]/gi,

    /["'`](\/graphql(?:\?[a-z0-9_=&%-]+)?)["'`]/gi,

    /["'`]((?:https?:\/\/[^"'`\s]+)?\/api\/v\d+\/[a-z0-9_./?=&%-]{2,180})["'`]/gi
  ];

  for (
    const pattern of
    patterns
  ) {
    for (
      const match of
      text.matchAll(
        pattern
      )
    ) {
      if (
        match[
          1
        ]
      ) {
        apiHints.add(
          match[
            1
          ]
        );
      }

      if (
        apiHints.size >=
        8
      ) {
        break;
      }
    }
  }

  const hasProductKeywords =
    /product|denomination|sellingPrice|selling_price|finalPrice|final_price|price/i.test(
      text
    );

  const hasEmptyAppShell =
    /<(?:div|main)[^>]+id=["'](?:app|root|__next)["'][^>]*>\s*<\/(?:div|main)>/i.test(
      text
    );

  const likelyDynamic =
    frameworks.length >
      0 &&
    (
      hasEmptyAppShell ||
      apiHints.size >
        0 ||
      hasProductKeywords
    );

  return {
    likelyDynamic,

    frameworks:
      [
        ...new Set(
          frameworks
        )
      ],

    apiHints:
      [
        ...apiHints
      ],

    hasProductKeywords,
    hasEmptyAppShell,

    htmlLength:
      text.length,

    scriptCount:
      (
        lower.match(
          /<script\b/g
        ) ||
        []
      ).length
  };
}

function extractStructuredIdentityText(
  html
) {
  const {
    documents
  } =
    extractEmbeddedDocuments(
      html
    );

  const values =
    new Set();

  const visited =
    new WeakSet();

  function walk(
    value,
    depth = 0
  ) {
    if (
      depth >
        12 ||
      value ===
        null ||
      value ===
        undefined
    ) {
      return;
    }

    if (
      Array.isArray(
        value
      )
    ) {
      for (
        const entry of
        value
      ) {
        walk(
          entry,
          depth +
            1
        );
      }

      return;
    }

    if (
      !isPlainObject(
        value
      )
    ) {
      return;
    }

    if (
      visited.has(
        value
      )
    ) {
      return;
    }

    visited.add(
      value
    );

    for (
      const key of
      IDENTITY_KEYS
    ) {
      const candidate =
        value[
          key
        ];

      if (
        typeof candidate ===
          'string' &&
        candidate
          .trim()
          .length <=
          180
      ) {
        values.add(
          candidate.trim()
        );

        if (
          values.size >=
          80
        ) {
          return;
        }
      }
    }

    for (
      const child of
      Object.values(
        value
      )
    ) {
      if (
        child &&
        typeof child ===
          'object'
      ) {
        walk(
          child,
          depth +
            1
        );
      }

      if (
        values.size >=
        80
      ) {
        return;
      }
    }
  }

  for (
    const document of
    documents
  ) {
    walk(
      document
    );

    if (
      values.size >=
      80
    ) {
      break;
    }
  }

  return [
    ...values
  ].join(
    ' '
  );
}

function extractStructuredOffers(
  html,
  context
) {
  const embedded =
    extractEmbeddedDocuments(
      html
    );

  const diagnostics = {
    scriptCount:
      embedded.scripts.length,

    documentCount:
      embedded.documents.length,

    parseErrors:
      embedded.parseErrors,

    objectCount:
      0,

    candidateObjectCount:
      0,

    productObjectCount:
      0,

    dynamic:
      detectDynamicPageSignals(
        html
      )
  };

  const offers =
    [];

  for (
    const document of
    embedded.documents
  ) {
    offers.push(
      ...extractOffersFromDocument(
        document,
        context,
        diagnostics
      )
    );
  }

  const deduped =
    dedupeOffers(
      offers
    );

  diagnostics.offerCount =
    deduped.length;

  return {
    offers:
      deduped,

    diagnostics
  };
}

module.exports = {
  extractStructuredOffers,
  extractStructuredIdentityText,
  detectDynamicPageSignals,
  extractEmbeddedDocuments,
  parseStructuredPrice
};
