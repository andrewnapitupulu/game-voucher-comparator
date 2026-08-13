'use strict';

const {
  fetchText
} = require('../services/http');

const {
  parseDedicatedDocument
} = require('./dedicated-store-parser');

const DYNAMIC_RECOVERY_VERSION =
  '2026-08-13-dynamic-v1';

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

function baseHost(
  value
) {
  try {
    return new URL(value)
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

function belongsToStore(
  value,
  pageUrl
) {
  try {
    const host =
      new URL(value)
        .hostname
        .toLowerCase()
        .replace(
          /^www\./,
          ''
        );

    const base =
      baseHost(
        pageUrl
      );

    return (
      Boolean(base) &&
      (
        host === base ||
        host.endsWith(
          `.${base}`
        )
      )
    );
  } catch {
    return false;
  }
}

function isAssetScript(
  url
) {
  return (
    /(?:\.js(?:\?|$)|\/_next\/static\/|\/assets\/|\/build\/|\/static\/)/i
      .test(url) &&
    !/(?:googletagmanager|google-analytics|gtag|facebook|doubleclick|hotjar|clarity|sentry)/i
      .test(url)
  );
}

function extractScriptUrls(
  html,
  pageUrl
) {
  const results =
    [];

  const seen =
    new Set();

  const regex =
    /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;

  for (
    const match
    of String(
      html ||
      ''
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
      seen.has(url) ||
      !isAssetScript(url)
    ) {
      continue;
    }

    seen.add(
      url
    );

    results.push(
      url
    );

    if (
      results.length >=
      10
    ) {
      break;
    }
  }

  return results;
}

function normalizeDiscoveredPath(
  value
) {
  return String(
    value ||
    ''
  )
    .replace(
      /\\\//g,
      '/'
    )
    .replace(
      /\\u002f/gi,
      '/'
    )
    .replace(
      /&amp;/gi,
      '&'
    )
    .trim();
}

function extractReadOnlyUrls(
  text,
  pageUrl,
  game
) {
  const results =
    [];

  const seen =
    new Set();

  const slug =
    encodeURIComponent(
      game.id
    );

  const patterns = [
    /["'](https?:\\?\/\\?\/[^"']{5,400})["']/gi,

    /["']((?:\.\.\/|\.\/|\/)?(?:api|v1|v2|v3|products?|product|games?|game|catalog|services?|items?|denominations?|prices?|topup)[^"']{0,320})["']/gi
  ];

  for (
    const pattern
    of patterns
  ) {
    for (
      const match
      of String(
        text ||
        ''
      ).matchAll(
        pattern
      )
    ) {
      let raw =
        normalizeDiscoveredPath(
          match[1]
        );

      if (!raw) {
        continue;
      }

      /*
       * Jangan menebak endpoint yang masih memiliki
       * runtime variable.
       */
      if (
        /\$\{|\{[^}]+\}|\[[^\]]+\]/
          .test(raw)
      ) {
        continue;
      }

      raw =
        raw
          .replace(
            /:gameSlug\b/gi,
            slug
          )
          .replace(
            /:slug\b/gi,
            slug
          );

      if (
        !/(?:api|product|game|catalog|service|item|denomination|price|topup)/i
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
        seen.has(url) ||
        !belongsToStore(
          url,
          pageUrl
        )
      ) {
        continue;
      }

      /*
       * Recovery hanya boleh membaca data.
       *
       * Jangan pernah memanggil endpoint transaksi.
       */
      if (
        /(?:order|checkout|payment|invoice|transaction|login|register|callback)/i
          .test(url)
      ) {
        continue;
      }

      seen.add(
        url
      );

      results.push(
        url
      );

      if (
        results.length >=
        12
      ) {
        break;
      }
    }

    if (
      results.length >=
      12
    ) {
      break;
    }
  }

  return results;
}

function buildProbeUrls(
  pageUrl,
  game
) {
  const origin =
    new URL(
      pageUrl
    ).origin;

  const slug =
    encodeURIComponent(
      game.id
    );

  return [
    `/api/products?slug=${slug}`,
    `/api/product?slug=${slug}`,

    `/api/games/${slug}`,
    `/api/game/${slug}`,

    `/api/products/${slug}`,
    `/api/product/${slug}`,

    `/api/games/${slug}/products`,
    `/api/game/${slug}/products`,

    `/api/catalog/${slug}`,

    `/api/services?game=${slug}`,

    `/api/products?game=${slug}`,

    `/api/topup?slug=${slug}`
  ]
    .map(
      (path) =>
        new URL(
          path,
          origin
        ).toString()
    );
}

function pageConfirmsIdr(
  text
) {
  return (
    /(?:\bIDR\b|\bRp\s*\.?|\brupiah\b)/i
      .test(
        String(
          text ||
          ''
        )
      )
  );
}

function sanitizeOffers(
  offers,
  idrContext
) {
  if (
    !Array.isArray(
      offers
    )
  ) {
    return [];
  }

  return offers.filter(
    (offer) => {
      const price =
        Number(
          offer.finalPrice ??
          offer.productPrice
        );

      /*
       * Mencegah kasus foreign currency
       * seperti 0.99 menjadi Rp1.
       */
      if (
        !Number.isFinite(
          price
        ) ||
        price <
          100
      ) {
        return false;
      }

      const priceText =
        String(
          offer.priceText ||
          ''
        );

      const explicitIdr =
        /(?:\bIDR\b|\bRp\s*\.?)/i
          .test(
            priceText
          );

      /*
       * Numeric JSON price hanya diterima jika
       * halaman induk memang jelas menggunakan IDR.
       */
      return (
        explicitIdr ||
        idrContext
      );
    }
  );
}

function parseOffers(
  text,
  pageUrl,
  store,
  game,
  idrContext
) {
  const offers =
    parseDedicatedDocument({
      html:
        text,

      url:
        pageUrl,

      storeId:
        store.id,

      storeName:
        store.name,

      game,

      mode:
        'page'
    });

  return sanitizeOffers(
    offers,
    idrContext
  );
}

function unique(
  values
) {
  return [
    ...new Set(
      values.filter(
        Boolean
      )
    )
  ];
}

function liveOffers(
  offers,
  extractionSource
) {
  return offers.map(
    (offer) => ({
      ...offer,

      extractionSource:
        offer.extractionSource ||
        offer.source ||
        extractionSource,

      source:
        'live',

      accessStrategy:
        'dedicated-dynamic',

      dynamicRecoveryVersion:
        DYNAMIC_RECOVERY_VERSION
    })
  );
}

async function fetchDynamicOffers({
  store,
  game,
  options = {},
  pageUrls = []
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

  const diagnostics = {
    version:
      DYNAMIC_RECOVERY_VERSION,

    storeId:
      store.id,

    gameId:
      game.id,

    pages: [],

    scripts: [],

    endpoints: []
  };

  let strongestError =
    null;

  const uniquePages =
    unique(
      pageUrls
    )
      .slice(
        0,
        4
      );

  for (
    const requestedUrl
    of uniquePages
  ) {
    try {
      /*
       * ====================================================
       * FETCH PRODUCT PAGE
       * ====================================================
       */
      const page =
        await fetchText(
          requestedUrl,
          {
            timeoutMs,

            retries:
              0,

            headers: {
              accept:
                'text/html,application/xhtml+xml,*/*;q=0.8',

              'accept-language':
                'id-ID,id;q=0.9,en-US;q=0.7,en;q=0.6'
            }
          }
        );

      const pageUrl =
        page.finalUrl ||
        requestedUrl;

      const idrContext =
        pageConfirmsIdr(
          page.text
        );

      /*
       * Beberapa SPA ternyata tetap membawa produk
       * di serialized HTML.
       */
      const directOffers =
        parseOffers(
          page.text,
          pageUrl,
          store,
          game,
          idrContext
        );

      diagnostics
        .pages
        .push({
          requestedUrl,

          pageUrl,

          idrContext,

          directOfferCount:
            directOffers.length
        });

      if (
        directOffers.length
      ) {
        return liveOffers(
          directOffers,
          'dynamic-page'
        );
      }

      /*
       * ====================================================
       * FETCH JS BUNDLES
       * ====================================================
       *
       * Berbeda dari recovery lama, script CDN juga boleh
       * dibaca jika URL tersebut memang berasal dari
       * <script src> halaman toko.
       */
      const scriptUrls =
        extractScriptUrls(
          page.text,
          pageUrl
        );

      let combined =
        String(
          page.text ||
          ''
        );

      for (
        const scriptUrl
        of scriptUrls.slice(
          0,
          8
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
                    pageUrl
                }
              }
            );

          combined +=
            `\n${script.text}`;

          diagnostics
            .scripts
            .push({
              url:
                scriptUrl,

              ok:
                true
            });

          /*
           * Kadang payload produk ikut dibundel
           * dalam JS initial state.
           */
          const embeddedOffers =
            parseOffers(
              script.text,
              pageUrl,
              store,
              game,
              idrContext
            );

          if (
            embeddedOffers.length
          ) {
            return liveOffers(
              embeddedOffers,
              'dynamic-script'
            );
          }
        } catch (
          error
        ) {
          diagnostics
            .scripts
            .push({
              url:
                scriptUrl,

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

      /*
       * ====================================================
       * DISCOVER DATA ENDPOINT
       * ====================================================
       */
      const discovered =
        extractReadOnlyUrls(
          combined,
          pageUrl,
          game
        );

      /*
       * Jika bundle menggunakan endpoint yang dibangun
       * secara dinamis, coba sejumlah route API umum.
       */
      const probes =
        buildProbeUrls(
          pageUrl,
          game
        );

      const endpointUrls =
        unique([
          ...discovered,
          ...probes
        ])
          .slice(
            0,
            14
          );

      for (
        const endpointUrl
        of endpointUrls
      ) {
        try {
          const result =
            await fetchText(
              endpointUrl,
              {
                timeoutMs,

                retries:
                  0,

                headers: {
                  accept:
                    'application/json,text/plain,*/*;q=0.6',

                  referer:
                    pageUrl,

                  'accept-language':
                    'id-ID,id;q=0.9,en;q=0.7'
                }
              }
            );

          const endpointIdrContext =
            pageConfirmsIdr(
              result.text
            ) ||
            idrContext;

          const offers =
            parseOffers(
              result.text,
              pageUrl,
              store,
              game,
              endpointIdrContext
            );

          diagnostics
            .endpoints
            .push({
              url:
                endpointUrl,

              ok:
                true,

              offerCount:
                offers.length
            });

          if (
            offers.length
          ) {
            return liveOffers(
              offers,
              'dynamic-endpoint'
            );
          }
        } catch (
          error
        ) {
          diagnostics
            .endpoints
            .push({
              url:
                endpointUrl,

              ok:
                false,

              code:
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
          }
        }
      }
    } catch (
      error
    ) {
      diagnostics
        .pages
        .push({
          requestedUrl,

          ok:
            false,

          code:
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
      }
    }
  }

  /*
   * Rate limit tetap dipertahankan sebagai status sebenarnya.
   */
  if (
    strongestError?.code ===
    'RATE_LIMITED'
  ) {
    strongestError
      .dynamicRecoveryDiagnostics =
      diagnostics;

    throw strongestError;
  }

  throw providerError(
    'PARSER_FAILED',

    'Dynamic recovery belum menemukan daftar produk dan harga yang dapat diverifikasi',

    {
      parserReason:
        'DYNAMIC_DATA_NOT_RESOLVED',

      dynamicRecoveryDiagnostics:
        diagnostics
    }
  );
}

module.exports = {
  DYNAMIC_RECOVERY_VERSION,
  fetchDynamicOffers
};
