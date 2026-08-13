'use strict';

const {
  fetchText
} = require('../services/http');

const PROVIDER_STATE_VERSION =
  '2026-08-13-provider-state-v2';

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
    ` ${normalizeText(text)} `;

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

function pageMentionsGameUnit(
  text,
  game
) {
  const normalized =
    ` ${normalizeText(text)} `;

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
        value.length >= 3
    )
    .some(
      (unit) =>
        normalized.includes(
          ` ${unit} `
        )
    );
}

function classifyPageState({
  storeId,
  game,
  text,
  finalUrl,
  expectedLocalePath = null
}) {
  const raw =
    String(
      text || ''
    );

  const gameFound =
    pageMentionsGame(
      raw,
      game
    );

  /*
   * ========================================================
   * CODASHOP REGION REDIRECT
   * ========================================================
   *
   * /id-id/...
   *      ↓
   * /en-us/...
   *
   * Harga USD tidak boleh dibaca sebagai IDR.
   */
  if (
    storeId ===
      'codashop' &&
    expectedLocalePath &&
    finalUrl
  ) {
    try {
      const url =
        new URL(
          finalUrl
        );

      if (
        !url.pathname
          .startsWith(
            expectedLocalePath
          )
      ) {
        return {
          code:
            'REGION_UNAVAILABLE',

          reason:
            'REGION_REDIRECT',

          message:
            'REGION UNAVAILABLE · Halaman Indonesia dialihkan ke region lain; harga non-IDR sengaja tidak digunakan'
        };
      }
    } catch {
      // Ignore malformed URL.
    }
  }

  /*
   * ========================================================
   * MAINTENANCE
   * ========================================================
   */
  if (
    /produk sedang maintenance|sedang maintenance|product maintenance|under maintenance|temporarily under maintenance|sedang dalam perbaikan/i
      .test(raw)
  ) {
    return {
      code:
        'MAINTENANCE',

      reason:
        'PRODUCT_MAINTENANCE',

      message:
        'MAINTENANCE · Produk sedang dinonaktifkan sementara oleh toko'
    };
  }

  /*
   * ========================================================
   * EXPLICIT PRODUCT UNAVAILABLE
   * ========================================================
   */
  if (
    /produk tidak lagi tersedia|product is no longer available|product no longer available|produk tidak tersedia|product unavailable|this product is unavailable|item tidak tersedia/i
      .test(raw)
  ) {
    return {
      code:
        'PRODUCT_UNAVAILABLE',

      reason:
        'PRODUCT_UNAVAILABLE',

      message:
        'PRODUCT UNAVAILABLE · Produk/game sedang tidak tersedia di toko'
    };
  }

  /*
   * ========================================================
   * SEAGM DIRECT TOP-UP NOT AVAILABLE
   * ========================================================
   *
   * SEAGM dapat masih mempunyai landing page game,
   * tetapi hanya menampilkan Voucher Game generic tanpa
   * direct denomination untuk currency game target.
   */
  if (
    storeId ===
      'seagm' &&
    gameFound &&
    /(?:voucher game|game voucher)/i
      .test(raw) &&
    !pageMentionsGameUnit(
      raw,
      game
    ) &&
    !hasPositiveIdrPrice(
      raw
    )
  ) {
    return {
      code:
        'PRODUCT_UNAVAILABLE',

      reason:
        'DIRECT_TOPUP_NOT_AVAILABLE',

      message:
        'PRODUCT UNAVAILABLE · Halaman game tersedia, tetapi direct top-up untuk nominal game target tidak tersedia'
    };
  }

  /*
   * ========================================================
   * UNIPIN DYNAMIC PRICE
   * ========================================================
   */
  if (
    storeId ===
      'unipin' &&
    gameFound &&
    /tidak tersedia untuk jumlah ini|this amount is currently unavailable/i
      .test(raw)
  ) {
    return {
      code:
        'DYNAMIC_PRICE_REQUIRED',

      reason:
        'PAYMENT_STATE_REQUIRED',

      message:
        'DYNAMIC PRICE · Nominal ditemukan, tetapi harga baru tersedia setelah amount/payment state dipilih'
    };
  }

  /*
   * ========================================================
   * TOPUPDEH DYNAMIC PRODUCT DATA
   * ========================================================
   */
  if (
    storeId ===
      'topupdeh' &&
    gameFound &&
    /pilih nominal|select nominal|daftar nominal/i
      .test(raw) &&
    !hasPositiveIdrPrice(
      raw
    )
  ) {
    return {
      code:
        'DYNAMIC_PRICE_REQUIRED',

      reason:
        'DYNAMIC_PRODUCT_DATA',

      message:
        'DYNAMIC PRICE · Halaman game ditemukan, tetapi daftar nominal/harga dimuat melalui state/API halaman'
    };
  }

  /*
   * ========================================================
   * GENERIC DYNAMIC PAGE SIGNATURES
   * ========================================================
   */
  if (
    gameFound &&
    (
      /memuat produk|loading products|loading product/i
        .test(raw) ||

      (
        /(?:\bIDR\b|\bRp\s*\.?)\s*0(?:[.,]00)?\b/i
          .test(raw) &&
        /(?:pilih|select|choose).{0,50}(?:nominal|denomination|jumlah|amount|produk|product)/i
          .test(raw)
      ) ||

      (
        /(?:pilih|select|choose).{0,50}(?:nominal|denomination|produk|product)/i
          .test(raw) &&
        !hasPositiveIdrPrice(
          raw
        )
      )
    )
  ) {
    return {
      code:
        'DYNAMIC_PRICE_REQUIRED',

      reason:
        'DYNAMIC_PRICE_REQUIRED',

      message:
        'DYNAMIC PRICE · Produk ditemukan, tetapi harga baru tersedia setelah interaksi/state halaman'
    };
  }

  return null;
}

async function probeProviderState({
  storeId,
  storeName,
  game,
  urls,
  timeoutMs = 5000,
  expectedLocalePath = null,
  missingCatalogMeansUnavailable = false
}) {
  const attempts = [];

  let reachablePage =
    false;

  let gameSeen =
    false;

  const candidates = [
    ...new Set(
      (urls || [])
        .filter(Boolean)
    )
  ].slice(
    0,
    6
  );

  for (
    const requestedUrl of
    candidates
  ) {
    try {
      const page =
        await fetchText(
          requestedUrl,
          {
            timeoutMs:
              Math.max(
                2500,
                Math.min(
                  8000,
                  Number(
                    timeoutMs ||
                    5000
                  )
                )
              ),

            retries:
              0,

            headers: {
              'accept-language':
                'id-ID,id;q=0.9,en-US;q=0.7,en;q=0.6'
            }
          }
        );

      reachablePage =
        true;

      const finalUrl =
        page.finalUrl ||
        requestedUrl;

      const mentionsGame =
        pageMentionsGame(
          page.text,
          game
        );

      gameSeen =
        gameSeen ||
        mentionsGame;

      const state =
        classifyPageState({
          storeId,
          game,

          text:
            page.text,

          finalUrl,

          expectedLocalePath
        });

      attempts.push({
        requestedUrl,
        finalUrl,
        mentionsGame,

        state:
          state?.code ||
          null
      });

      if (state) {
        throw providerError(
          state.code,
          state.message,
          {
            parserReason:
              state.reason,

            providerStateDiagnostics: {
              version:
                PROVIDER_STATE_VERSION,

              storeId,
              storeName,

              gameId:
                game?.id ||
                null,

              requestedUrl,
              finalUrl,
              attempts
            }
          }
        );
      }
    } catch (
      error
    ) {
      const code =
        String(
          error?.code ||
          ''
        )
          .toUpperCase();

      if (
        [
          'REGION_UNAVAILABLE',
          'MAINTENANCE',
          'PRODUCT_UNAVAILABLE',
          'DYNAMIC_PRICE_REQUIRED'
        ].includes(
          code
        )
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

  if (
    missingCatalogMeansUnavailable &&
    reachablePage &&
    !gameSeen
  ) {
    throw providerError(
      'PRODUCT_UNAVAILABLE',

      'PRODUCT UNAVAILABLE · Game target tidak ditemukan pada katalog toko saat ini',

      {
        parserReason:
          'GAME_NOT_IN_CATALOG',

        providerStateDiagnostics: {
          version:
            PROVIDER_STATE_VERSION,

          storeId,
          storeName,

          gameId:
            game?.id ||
            null,

          attempts
        }
      }
    );
  }

  return {
    state:
      null,

    diagnostics: {
      version:
        PROVIDER_STATE_VERSION,

      storeId,
      storeName,

      gameId:
        game?.id ||
        null,

      attempts
    }
  };
}

module.exports = {
  PROVIDER_STATE_VERSION,

  classifyPageState,

  probeProviderState
};
