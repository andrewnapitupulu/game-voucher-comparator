'use strict';

const {
  fetchText
} = require('../services/http');

const {
  parseRupiah
} = require('../utils/money');

const {
  normalizeText
} = require('../config/games');

const DEFAULT_NAME_FIELDS = [
  'name',
  'productName',
  'product_name',
  'title',
  'denomination',
  'label',
  'packageName',
  'package_name',
  'itemName',
  'item_name'
];

const DEFAULT_PRICE_FIELDS = [
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
  'price',
  'amount'
];

const DEFAULT_URL_FIELDS = [
  'purchaseUrl',
  'purchase_url',
  'url',
  'link',
  'href'
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

function getPath(
  value,
  path
) {
  if (
    !path ||
    value === null ||
    value === undefined
  ) {
    return value;
  }

  const parts =
    String(path)
      .replace(
        /\[(\d+)\]/g,
        '.$1'
      )
      .split('.')
      .map(
        (part) =>
          part.trim()
      )
      .filter(Boolean);

  let cursor =
    value;

  for (
    const part of
    parts
  ) {
    if (
      cursor === null ||
      cursor === undefined ||
      typeof cursor !==
        'object' ||
      !(part in cursor)
    ) {
      return undefined;
    }

    cursor =
      cursor[
        part
      ];
  }

  return cursor;
}

function applyTemplate(
  value,
  game
) {
  if (
    typeof value ===
    'string'
  ) {
    return value
      .replaceAll(
        '{gameSlug}',
        game.id
      )
      .replaceAll(
        '{gameId}',
        game.id
      )
      .replaceAll(
        '{gameName}',
        game.name ||
        game.id
      )
      .replaceAll(
        '{gameShortName}',
        game.shortName ||
        game.name ||
        game.id
      );
  }

  if (
    Array.isArray(
      value
    )
  ) {
    return value.map(
      (entry) =>
        applyTemplate(
          entry,
          game
        )
    );
  }

  if (
    value &&
    typeof value ===
      'object'
  ) {
    return Object.fromEntries(
      Object.entries(
        value
      )
        .map(
          (
            [
              key,
              entry
            ]
          ) => [
            key,

            applyTemplate(
              entry,
              game
            )
          ]
        )
    );
  }

  return value;
}

function firstDefined(
  row,
  fields
) {
  for (
    const field of
    fields
  ) {
    const value =
      getPath(
        row,
        field
      );

    if (
      value !==
        undefined &&
      value !==
        null &&
      String(value)
        .trim() !==
        ''
    ) {
      return value;
    }
  }

  return undefined;
}

function parseApiPrice(
  value,
  scale = 1
) {
  const price =
    parseRupiah(
      value
    );

  if (
    !price ||
    price <=
      0
  ) {
    return null;
  }

  const safeScale =
    Number(
      scale
    );

  if (
    Number.isFinite(
      safeScale
    ) &&
    safeScale >
      0 &&
    safeScale !==
      1
  ) {
    return Math.round(
      price *
      safeScale
    );
  }

  return price;
}

function candidateArrayScore(
  rows,
  nameFields,
  priceFields
) {
  if (
    !Array.isArray(
      rows
    ) ||
    !rows.length
  ) {
    return 0;
  }

  let score =
    0;

  for (
    const row of
    rows.slice(
      0,
      8
    )
  ) {
    if (
      !row ||
      typeof row !==
        'object' ||
      Array.isArray(
        row
      )
    ) {
      continue;
    }

    if (
      firstDefined(
        row,
        nameFields
      ) !==
      undefined
    ) {
      score +=
        3;
    }

    if (
      firstDefined(
        row,
        priceFields
      ) !==
      undefined
    ) {
      score +=
        3;
    }
  }

  return score;
}

function findBestProductArray(
  payload,
  nameFields,
  priceFields,
  maxDepth = 5
) {
  const queue = [
    {
      value:
        payload,

      depth:
        0
    }
  ];

  const visited =
    new Set();

  let best =
    null;

  while (
    queue.length
  ) {
    const current =
      queue.shift();

    const value =
      current.value;

    if (
      !value ||
      typeof value !==
        'object' ||
      current.depth >
        maxDepth
    ) {
      continue;
    }

    if (
      visited.has(
        value
      )
    ) {
      continue;
    }

    visited.add(
      value
    );

    if (
      Array.isArray(
        value
      )
    ) {
      const score =
        candidateArrayScore(
          value,
          nameFields,
          priceFields
        );

      if (
        score >
          0 &&
        (
          !best ||
          score >
            best.score
        )
      ) {
        best = {
          rows:
            value,

          score
        };
      }

      for (
        const entry of
        value.slice(
          0,
          30
        )
      ) {
        if (
          entry &&
          typeof entry ===
            'object'
        ) {
          queue.push({
            value:
              entry,

            depth:
              current.depth +
              1
          });
        }
      }

      continue;
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
        queue.push({
          value:
            child,

          depth:
            current.depth +
            1
        });
      }
    }
  }

  return (
    best?.rows ||
    []
  );
}

function rowMatchesGame(
  row,
  game,
  config
) {
  const gameFields =
    Array.isArray(
      config.gameFields
    )
      ? config.gameFields
      : [
          'game',
          'gameName',
          'game_name',
          'gameId',
          'game_id',
          'categoryName',
          'category_name'
        ];

  const values =
    gameFields
      .map(
        (field) =>
          getPath(
            row,
            field
          )
      )
      .filter(
        (value) =>
          typeof value ===
            'string' ||
          typeof value ===
            'number'
      )
      .map(
        (value) =>
          normalizeText(
            value
          )
      )
      .filter(Boolean);

  /*
   * Jika API tidak mengirim field game,
   * endpoint dianggap sudah game-specific.
   */
  if (
    !values.length
  ) {
    return true;
  }

  const identities = [
    game.id,
    game.name,
    game.shortName,

    ...(
      game.aliases ||
      []
    )
  ]
    .map(
      (value) =>
        normalizeText(
          value
        )
    )
    .filter(Boolean)
    .filter(
      (value) =>
        value.length >=
        3
    );

  return values.some(
    (value) =>
      identities.some(
        (identity) =>
          value ===
            identity ||
          value.includes(
            identity
          ) ||
          identity.includes(
            value
          )
      )
  );
}

function resolveRows(
  payload,
  config,
  nameFields,
  priceFields
) {
  if (
    config.resultPath
  ) {
    const selected =
      getPath(
        payload,
        config.resultPath
      );

    return Array.isArray(
      selected
    )
      ? selected
      : [];
  }

  if (
    Array.isArray(
      payload
    )
  ) {
    return payload;
  }

  for (
    const commonPath of
    [
      'products',
      'data.products',
      'data.items',
      'data',
      'items',
      'result.products',
      'result.items',
      'result'
    ]
  ) {
    const selected =
      getPath(
        payload,
        commonPath
      );

    if (
      Array.isArray(
        selected
      ) &&
      candidateArrayScore(
        selected,
        nameFields,
        priceFields
      ) >
        0
    ) {
      return selected;
    }
  }

  return findBestProductArray(
    payload,
    nameFields,
    priceFields
  );
}

function resolvePurchaseUrl(
  row,
  config,
  endpoint,
  game
) {
  const urlFields =
    Array.isArray(
      config.urlFields
    )
      ? config.urlFields
      : DEFAULT_URL_FIELDS;

  const direct =
    firstDefined(
      row,
      urlFields
    );

  const fallback =
    config.purchaseUrlTemplate
      ? applyTemplate(
          config.purchaseUrlTemplate,
          game
        )
      : endpoint;

  if (!direct) {
    return fallback;
  }

  try {
    return new URL(
      String(
        direct
      ),
      fallback
    )
      .toString();
  } catch {
    return fallback;
  }
}

function isPublicApiConfigured(
  store
) {
  const config =
    store?.publicApi;

  return Boolean(
    config &&
    typeof config ===
      'object' &&
    (
      config.endpoint ||
      config.url ||
      config.endpointTemplate ||
      config.urlTemplate
    )
  );
}

function createPublicApiAdapter(
  store
) {
  const config =
    store.publicApi ||
    {};

  return {
    id:
      store.id,

    name:
      store.name,

    category:
      store.category,

    verification:
      store.verification,

    strategy:
      'public-api',

    async fetchOffers(
      game,
      options = {}
    ) {
      const endpointTemplate =
        config.endpoint ||
        config.url ||
        config.endpointTemplate ||
        config.urlTemplate;

      if (
        !endpointTemplate
      ) {
        throw providerError(
          'NOT_CONFIGURED',
          'Public API endpoint belum dikonfigurasi'
        );
      }

      const endpoint =
        applyTemplate(
          String(
            endpointTemplate
          ),
          game
        );

      const method =
        String(
          config.method ||
          'GET'
        )
          .toUpperCase();

      if (
        ![
          'GET',
          'POST'
        ].includes(
          method
        )
      ) {
        throw providerError(
          'NOT_CONFIGURED',
          `Method public API ${method} belum didukung`
        );
      }

      const headers = {
        accept:
          'application/json',

        ...applyTemplate(
          config.headers ||
          {},
          game
        )
      };

      let body;

      if (
        method ===
          'POST' &&
        config.bodyTemplate !==
          undefined
      ) {
        const renderedBody =
          applyTemplate(
            config.bodyTemplate,
            game
          );

        if (
          typeof renderedBody ===
          'string'
        ) {
          body =
            renderedBody;
        } else {
          body =
            JSON.stringify(
              renderedBody
            );

          if (
            !Object.keys(
              headers
            )
              .some(
                (key) =>
                  key
                    .toLowerCase() ===
                  'content-type'
              )
          ) {
            headers[
              'content-type'
            ] =
              'application/json';
          }
        }
      }

      const response =
        await fetchText(
          endpoint,
          {
            timeoutMs:
              options.timeoutMs ||
              5000,

            retries:
              Number.isFinite(
                Number(
                  config.retries
                )
              )
                ? Number(
                    config.retries
                  )
                : 1,

            method,
            body,
            headers
          }
        );

      let payload;

      try {
        payload =
          JSON.parse(
            response.text
          );
      } catch {
        throw providerError(
          'PARSER_FAILED',
          'Public API dapat diakses tetapi respons bukan JSON valid',
          {
            parserReason:
              'API_RESPONSE_INVALID_JSON',

            finalUrl:
              response.finalUrl ||
              endpoint
          }
        );
      }

      const nameFields =
        Array.isArray(
          config.nameFields
        )
          ? config.nameFields
          : DEFAULT_NAME_FIELDS;

      const priceFields =
        Array.isArray(
          config.priceFields
        )
          ? config.priceFields
          : DEFAULT_PRICE_FIELDS;

      const rows =
        resolveRows(
          payload,
          config,
          nameFields,
          priceFields
        );

      if (
        !rows.length
      ) {
        throw providerError(
          'PARSER_FAILED',
          'Public API berhasil diakses tetapi array produk tidak ditemukan',
          {
            parserReason:
              'API_NO_PRODUCT_ARRAY',

            finalUrl:
              response.finalUrl ||
              endpoint
          }
        );
      }

      const checkedAt =
        new Date()
          .toISOString();

      const offers =
        rows
          .map(
            (
              row,
              index
            ) => {
              if (
                !row ||
                typeof row !==
                  'object' ||
                Array.isArray(
                  row
                ) ||
                !rowMatchesGame(
                  row,
                  game,
                  config
                )
              ) {
                return null;
              }

              const name =
                firstDefined(
                  row,
                  nameFields
                );

              const rawPrice =
                firstDefined(
                  row,
                  priceFields
                );

              const price =
                parseApiPrice(
                  rawPrice,
                  config.priceScale ||
                  1
                );

              if (
                !name ||
                !price ||
                price <=
                  0
              ) {
                return null;
              }

              return {
                id:
                  `${store.id}-${game.id}-api-${index + 1}`,

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
                    .trim(),

                productPrice:
                  price,

                finalPrice:
                  price,

                feeStatus:
                  String(
                    firstDefined(
                      row,

                      config.feeStatusFields ||
                      [
                        'feeStatus',
                        'fee_status'
                      ]
                    ) ||
                    'unknown'
                  ),

                purchaseUrl:
                  resolvePurchaseUrl(
                    row,
                    config,
                    response.finalUrl ||
                    endpoint,
                    game
                  ),

                source:
                  'live',

                accessStrategy:
                  'public-api',

                checkedAt
              };
            }
          )
          .filter(
            Boolean
          )
          .slice(
            0,

            Number(
              config.maxProducts
            ) ||
            200
          );

      if (
        !offers.length
      ) {
        throw providerError(
          'PARSER_FAILED',
          'Public API mengembalikan data tetapi tidak ada produk valid untuk game ini',
          {
            parserReason:
              'API_NO_VALID_PRODUCTS',

            finalUrl:
              response.finalUrl ||
              endpoint,

            apiRowCount:
              rows.length
          }
        );
      }

      return offers;
    }
  };
}

module.exports = {
  createPublicApiAdapter,
  isPublicApiConfigured,
  applyTemplate,
  getPath,
  resolveRows
};
