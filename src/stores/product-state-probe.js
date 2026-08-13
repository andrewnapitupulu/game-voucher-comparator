'use strict';

const {
  fetchText
} = require('../services/http');

const {
  decodeEntities
} = require('../utils/html');

const PRODUCT_STATE_PROBE_VERSION =
  '2026-08-13-product-state-v1';

function normalizeText(
  value
) {
  return String(
    value || ''
  )
    .toLowerCase()
    .normalize('NFKD')
    .replace(
      /[\u0300-\u036f]/g,
      ''
    )
    .replace(
      /[^a-z0-9]+/g,
      ' '
    )
    .replace(
      /\s+/g,
      ' '
    )
    .trim();
}

function visibleTextFromHtml(
  html
) {
  const stripped =
    String(
      html || ''
    )
      .replace(
        /<!--[\s\S]*?-->/g,
        ' '
      )
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
      )
      .replace(
        /<template\b[^>]*>[\s\S]*?<\/template>/gi,
        ' '
      )
      .replace(
        /<br\s*\/?>/gi,
        '\n'
      )
      .replace(
        /<\/(?:p|div|li|section|article|h1|h2|h3|h4|h5|h6|a|button)>/gi,
        '\n'
      )
      .replace(
        /<[^>]+>/g,
        ' '
      );

  return decodeEntities(
    stripped
  )
    .replace(
      /\u00a0/g,
      ' '
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
    .filter(Boolean)
    .join('\n');
}

/*
 * ============================================================
 * PRIMARY PRODUCT SECTION
 * ============================================================
 *
 * Contoh TopUpDeh:
 *
 * Zenless Zone Zero
 * pilih nominal...
 *
 * Game Lainnya
 * Aether Gazer Mulai Rp 16.896
 *
 * Harga setelah "Game Lainnya" tidak boleh dianggap
 * sebagai harga Zenless Zone Zero.
 */
function primaryProductSection(
  visibleText
) {
  const text =
    String(
      visibleText || ''
    );

  const markers = [
    /\nGame Lainnya\b/i,
    /\nGame lainnya\b/i,
    /\nOther Games\b/i,
    /\nOther games\b/i,
    /\nProduk Lainnya\b/i,
    /\nProduk lainnya\b/i,
    /\nRekomendasi Game\b/i,
    /\nGame Rekomendasi\b/i,
    /\nGame Populer\b/i,
    /\nYou May Also Like\b/i,
    /\nRelated Games\b/i
  ];

  let end =
    text.length;

  for (
    const marker of
    markers
  ) {
    const match =
      marker.exec(
        text
      );

    if (
      match &&
      match.index >= 0
    ) {
      end =
        Math.min(
          end,
          match.index
        );
    }
  }

  return text
    .slice(
      0,
      end
    )
    .trim();
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
        value.length >= 3
    );
}

function pageMentionsGame(
  text,
  game
) {
  const normalized =
    ` ${normalizeText(
      text
    )} `;

  return gameIdentities(
    game
  )
    .some(
      (identity) =>
        normalized.includes(
          ` ${identity} `
        )
    );
}

function urlMatchesGame(
  value,
  game
) {
  try {
    const pathname =
      decodeURIComponent(
        new URL(
          value
        ).pathname
      );

    const normalizedPath =
      normalizeText(
        pathname
      );

    return gameIdentities(
      game
    )
      .some(
        (identity) =>
          normalizedPath.includes(
            identity
          )
      );
  } catch {
    return false;
  }
}

function hasPositiveIdrPrice(
  text
) {
  return /(?:\bIDR\b|\bRp\s*\.?)\s*[1-9][0-9.,]*/i
    .test(
      String(
        text || ''
      )
    );
}

function hasDynamicProductIntent(
  text
) {
  return /(?:pilih|select|choose).{0,80}(?:nominal|denomination|produk|product|jumlah|amount)|daftar nominal|user\s*id|\buid\b|zone\s*id|server\s*id|checkout|metode pembayaran|payment method|top\s*up/i
    .test(
      String(
        text || ''
      )
    );
}

function dynamicStateError({
  store,
  game,
  reason,
  message,
  diagnostics
}) {
  const error =
    new Error(
      message ||
      'DYNAMIC PRICE · Produk ditemukan, tetapi harga tidak tersedia pada primary product section'
    );

  error.code =
    'DYNAMIC_PRICE_REQUIRED';

  error.parserReason =
    reason ||
    'DYNAMIC_PRODUCT_DATA';

  error.productStateDiagnostics = {
    version:
      PRODUCT_STATE_PROBE_VERSION,

    storeId:
      store?.id ||
      null,

    storeName:
      store?.name ||
      null,

    gameId:
      game?.id ||
      null,

    ...diagnostics
  };

  return error;
}

async function probeDynamicProductState({
  store,
  game,
  options = {},
  urls = [],
  allowCatalogEvidence = false
}) {
  const timeoutMs =
    Math.max(
      2500,
      Math.min(
        8000,
        Number(
          options.timeoutMs ||
          5000
        )
      )
    );

  const attempts =
    [];

  const uniqueUrls = [
    ...new Set(
      (
        urls ||
        []
      ).filter(Boolean)
    )
  ].slice(
    0,
    7
  );

  for (
    const requestedUrl of
    uniqueUrls
  ) {
    try {
      const page =
        await fetchText(
          requestedUrl,
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
        requestedUrl;

      const visible =
        visibleTextFromHtml(
          page.text
        );

      const primary =
        primaryProductSection(
          visible
        );

      /*
       * Raw HTML hanya boleh digunakan sebagai bukti
       * bahwa game ada.
       *
       * Raw HTML TIDAK digunakan sebagai sumber harga.
       */
      const rawGameEvidence =
        pageMentionsGame(
          String(
            page.text ||
            ''
          ).slice(
            0,
            750000
          ),
          game
        );

      const visibleGameEvidence =
        pageMentionsGame(
          visible,
          game
        );

      const primaryGameEvidence =
        pageMentionsGame(
          primary,
          game
        );

      const urlGameEvidence =
        urlMatchesGame(
          finalUrl,
          game
        );

      const gameEvidence =
        primaryGameEvidence ||
        visibleGameEvidence ||
        rawGameEvidence ||
        urlGameEvidence;

      /*
       * Harga hanya boleh berasal dari primary visible section.
       */
      const hasPrimaryPrice =
        hasPositiveIdrPrice(
          primary
        );

      const hasDynamicIntent =
        hasDynamicProductIntent(
          primary
        ) ||
        hasDynamicProductIntent(
          visible
        );

      attempts.push({
        requestedUrl,
        finalUrl,

        primaryGameEvidence,
        visibleGameEvidence,
        rawGameEvidence,
        urlGameEvidence,

        hasPrimaryPrice,
        hasDynamicIntent
      });

      if (
        gameEvidence &&
        !hasPrimaryPrice &&
        (
          hasDynamicIntent ||
          urlGameEvidence ||
          (
            allowCatalogEvidence &&
            (
              visibleGameEvidence ||
              rawGameEvidence
            )
          )
        )
      ) {
        throw dynamicStateError({
          store,
          game,

          reason:
            allowCatalogEvidence &&
            !urlGameEvidence
              ? 'CATALOG_PRODUCT_REQUIRES_DYNAMIC_DATA'
              : 'DYNAMIC_PRODUCT_DATA',

          message:
            `${store.name}: game ditemukan, tetapi harga produk target tidak tersedia pada primary server-rendered product section`,

          diagnostics: {
            requestedUrl,
            finalUrl,
            attempts
          }
        });
      }
    } catch (
      error
    ) {
      if (
        String(
          error?.code ||
          ''
        )
          .toUpperCase() ===
        'DYNAMIC_PRICE_REQUIRED'
      ) {
        throw error;
      }

      attempts.push({
        requestedUrl,

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
    dynamic:
      false,

    diagnostics: {
      version:
        PRODUCT_STATE_PROBE_VERSION,

      storeId:
        store?.id ||
        null,

      gameId:
        game?.id ||
        null,

      attempts
    }
  };
}

module.exports = {
  PRODUCT_STATE_PROBE_VERSION,

  visibleTextFromHtml,

  primaryProductSection,

  pageMentionsGame,

  hasPositiveIdrPrice,

  probeDynamicProductState
};
