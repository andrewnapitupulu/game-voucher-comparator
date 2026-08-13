'use strict';

const { fetchText } = require('../services/http');
const { decodeEntities } = require('../utils/html');

const PRODUCT_STATE_PROBE_VERSION =
  '2026-08-13-product-state-v2';

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function visibleTextFromHtml(html) {
  const stripped = String(html || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
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
      /<(?:br|hr)\b[^>]*>/gi,
      '\n'
    )
    .replace(
      /<\/(?:p|div|li|section|article|header|footer|main|aside|h1|h2|h3|h4|h5|h6|a|button|label|span)>/gi,
      '\n'
    )
    .replace(
      /<[^>]+>/g,
      ' '
    );

  return decodeEntities(stripped)
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

function gameIdentities(game) {
  return [
    game?.id,
    game?.name,
    game?.shortName,
    ...(game?.aliases || [])
  ]
    .map(normalizeText)
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
    ` ${normalizeText(text)} `;

  return gameIdentities(game)
    .some(
      (identity) =>
        normalized.includes(
          ` ${identity} `
        )
    );
}

function lineMentionsGame(
  line,
  game
) {
  const normalized =
    normalizeText(line);

  return gameIdentities(game)
    .some(
      (identity) =>
        normalized.includes(
          identity
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
        new URL(value)
          .pathname
      );

    const normalizedPath =
      normalizeText(
        pathname
      );

    return gameIdentities(game)
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

function isRelatedSectionMarker(
  line
) {
  return /^(?:game lainnya|other games|produk lainnya|other products|rekomendasi game|game rekomendasi|game populer|popular games|you may also like|related games|rekomendasi|recommendations)$/i
    .test(
      String(
        line || ''
      ).trim()
    );
}

/*
 * Mengambil section di sekitar nama game target.
 *
 * Harga dari:
 *
 * - Game Lainnya
 * - recommendations
 * - footer
 * - card game lain
 *
 * tidak ikut menjadi price evidence.
 */
function targetGameSection(
  visibleText,
  game
) {
  const lines =
    String(
      visibleText || ''
    )
      .split(
        /\r?\n/
      )
      .map(
        (line) =>
          line.trim()
      )
      .filter(Boolean);

  const anchor =
    lines.findIndex(
      (line) =>
        lineMentionsGame(
          line,
          game
        )
    );

  if (
    anchor < 0
  ) {
    return '';
  }

  const start =
    Math.max(
      0,
      anchor - 2
    );

  let end =
    Math.min(
      lines.length,
      anchor + 90
    );

  for (
    let index =
      anchor + 1;

    index < end;

    index += 1
  ) {
    if (
      isRelatedSectionMarker(
        lines[index]
      )
    ) {
      end =
        index;

      break;
    }
  }

  return lines
    .slice(
      start,
      end
    )
    .join('\n');
}

/*
 * Compatibility untuk caller lama.
 */
function primaryProductSection(
  visibleText
) {
  const lines =
    String(
      visibleText || ''
    )
      .split(
        /\r?\n/
      );

  const marker =
    lines.findIndex(
      isRelatedSectionMarker
    );

  return lines
    .slice(
      0,
      marker >= 0
        ? marker
        : lines.length
    )
    .join('\n')
    .trim();
}

function lineHasIdrPrice(
  value
) {
  return /(?:\bIDR\b|\bRp\s*\.?)\s*[1-9][0-9.,]*/i
    .test(
      String(
        value || ''
      )
    );
}

function isMarketingStartPrice(
  value
) {
  return /(?:mulai|start(?:ing)?\s+from|from)\s*(?:\bIDR\b|\bRp\s*\.?)/i
    .test(
      String(
        value || ''
      )
    );
}

/*
 * "Mulai Rp 15.000" tidak dianggap exact product price.
 */
function hasPositiveIdrPrice(
  text
) {
  return String(
    text || ''
  )
    .split(
      /\r?\n/
    )
    .some(
      (line) =>
        lineHasIdrPrice(
          line
        ) &&
        !isMarketingStartPrice(
          line
        )
    );
}

function lineHasGameUnit(
  line,
  game
) {
  const normalized =
    normalizeText(
      line
    );

  return (
    game?.unitAliases ||
    []
  )
    .map(
      normalizeText
    )
    .filter(
      (value) =>
        value &&
        value.length >= 2
    )
    .some(
      (unit) =>
        normalized.includes(
          unit
        )
    );
}

/*
 * Price evidence dianggap benar hanya jika:
 *
 * unit game
 *   ↓
 * maksimal beberapa line
 *   ↓
 * harga IDR
 *
 * Contoh valid:
 *
 * 60 Monochrome
 * Rp 16.224
 *
 * Contoh tidak valid:
 *
 * Zenless Zone Zero
 * ...
 * Game Lainnya
 * Aether Gazer
 * Mulai Rp 16.224
 */
function hasGameUnitPricePair(
  section,
  game
) {
  const lines =
    String(
      section || ''
    )
      .split(
        /\r?\n/
      )
      .map(
        (line) =>
          line.trim()
      )
      .filter(Boolean);

  for (
    let index = 0;
    index <
      lines.length;
    index += 1
  ) {
    if (
      !lineHasGameUnit(
        lines[index],
        game
      )
    ) {
      continue;
    }

    const end =
      Math.min(
        lines.length,
        index + 6
      );

    for (
      let cursor =
        index;

      cursor < end;

      cursor += 1
    ) {
      if (
        lineHasIdrPrice(
          lines[cursor]
        ) &&
        !isMarketingStartPrice(
          lines[cursor]
        )
      ) {
        return true;
      }
    }
  }

  return false;
}

function hasDynamicProductIntent(
  text
) {
  return /(?:pilih|select|choose).{0,100}(?:nominal|denomination|produk|product|jumlah|amount)|daftar nominal|user\s*id|\buid\b|zone\s*id|server\s*id|checkout|metode pembayaran|payment method|memuat produk|loading products?|top\s*up/i
    .test(
      String(
        text || ''
      )
    );
}

function isLikelyCatalogUrl(
  value
) {
  try {
    const url =
      new URL(
        value
      );

    const pathname =
      url.pathname
        .toLowerCase();

    return (
      /\/(?:products?|catalog|games?)\/?$/
        .test(
          pathname
        ) ||
      /\/(?:products?|catalog)(?:\/|$)/
        .test(
          pathname
        )
    );
  } catch {
    return false;
  }
}

function createDynamicStateError({
  store,
  game,
  reason,
  message,
  diagnostics
}) {
  const error =
    new Error(
      message ||
      'DYNAMIC PRICE · Game ditemukan, tetapi pasangan nominal-harga tidak tersedia sebagai server-rendered data yang dapat diverifikasi'
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

/*
 * Function ini dipanggil SETELAH dedicated/strict
 * extractor gagal.
 *
 * allowCatalogEvidence:
 *
 * Catalog boleh membuktikan game tersedia.
 * Harga yang ada di catalog tidak pernah dianggap
 * harga game target.
 *
 * trustVerifiedGameUrlWithoutPair:
 *
 * Jika final URL jelas URL game target tetapi
 * extractor tidak menemukan unit-price pair,
 * classify sebagai dynamic.
 */
async function probeDynamicProductState({
  store,
  game,
  options = {},
  urls = [],
  allowCatalogEvidence = false,
  trustVerifiedGameUrlWithoutPair = false
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
    10
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

      const targetSection =
        targetGameSection(
          visible,
          game
        );

      /*
       * Raw HTML hanya dipakai untuk membuktikan
       * bahwa game ada.
       *
       * Tidak pernah untuk mengambil harga.
       */
      const rawGameEvidence =
        pageMentionsGame(
          String(
            page.text ||
            ''
          ).slice(
            0,
            900000
          ),

          game
        );

      const visibleGameEvidence =
        pageMentionsGame(
          visible,
          game
        );

      const sectionGameEvidence =
        pageMentionsGame(
          targetSection,
          game
        );

      const urlGameEvidence =
        urlMatchesGame(
          finalUrl,
          game
        );

      const gameEvidence =
        rawGameEvidence ||
        visibleGameEvidence ||
        sectionGameEvidence ||
        urlGameEvidence;

      const catalogUrl =
        isLikelyCatalogUrl(
          finalUrl
        ) ||
        isLikelyCatalogUrl(
          requestedUrl
        );

      const verifiedUnitPricePair =
        hasGameUnitPricePair(
          targetSection,
          game
        );

      const hasSectionPrice =
        hasPositiveIdrPrice(
          targetSection
        );

      const hasDynamicIntent =
        hasDynamicProductIntent(
          targetSection
        ) ||
        hasDynamicProductIntent(
          visible
        );

      attempts.push({
        requestedUrl,
        finalUrl,

        rawGameEvidence,
        visibleGameEvidence,
        sectionGameEvidence,
        urlGameEvidence,

        catalogUrl,

        hasSectionPrice,
        verifiedUnitPricePair,
        hasDynamicIntent
      });

      /*
       * ======================================================
       * CATALOG CASE — BXYStore
       * ======================================================
       *
       * Game ditemukan di catalog.
       *
       * Harga game lain di halaman catalog sengaja
       * diabaikan.
       */
      if (
        allowCatalogEvidence &&
        catalogUrl &&
        gameEvidence
      ) {
        throw createDynamicStateError({
          store,
          game,

          reason:
            'CATALOG_PRODUCT_REQUIRES_DYNAMIC_DATA',

          message:
            `${store.name}: game ditemukan di katalog, tetapi product-price pair target tidak tersedia sebagai data server-rendered yang dapat diverifikasi`,

          diagnostics: {
            requestedUrl,
            finalUrl,
            attempts
          }
        });
      }

      /*
       * ======================================================
       * VERIFIED PRODUCT PAGE — CasaTopup / TopUpDeh
       * ======================================================
       */
      if (
        trustVerifiedGameUrlWithoutPair &&
        urlGameEvidence &&
        gameEvidence &&
        !verifiedUnitPricePair
      ) {
        throw createDynamicStateError({
          store,
          game,

          reason:
            'VERIFIED_PRODUCT_PAGE_REQUIRES_DYNAMIC_DATA',

          message:
            `${store.name}: halaman game target terverifikasi, tetapi pasangan nominal-harga tidak tersedia pada server-rendered product section`,

          diagnostics: {
            requestedUrl,
            finalUrl,
            attempts
          }
        });
      }

      /*
       * Generic dynamic page.
       */
      if (
        gameEvidence &&
        hasDynamicIntent &&
        !verifiedUnitPricePair
      ) {
        throw createDynamicStateError({
          store,
          game,

          reason:
            'DYNAMIC_PRODUCT_DATA',

          message:
            `${store.name}: game ditemukan, tetapi nominal/harga membutuhkan state atau data dinamis`,

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

  targetGameSection,

  pageMentionsGame,

  hasPositiveIdrPrice,

  hasGameUnitPricePair,

  probeDynamicProductState
};
