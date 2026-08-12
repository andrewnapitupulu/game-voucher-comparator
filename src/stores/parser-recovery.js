'use strict';

const {
  fetchText
} = require('../services/http');

const {
  validatePageForGame,
  parseOffers,
  extractLinks,
  linkScore,
  pickStrongerError
} = require('./universal-page');

/*
 * Recovery ini sengaja dibatasi ke toko yang saat ini diketahui
 * mengembalikan PARSER_FAILED. Toko lain tetap memakai alur lama.
 */
const RECOVERY_CONFIG = {
  gigames: {
    paths: [
      '/beli/{gameSlug}',
      '/id/beli/{gameSlug}',
      '/en/beli/{gameSlug}'
    ],
    discoveryPaths: [
      '/en',
      '/id',
      '/'
    ],
    maxProbes: 6,
    linkThreshold: 72
  },

  'oura-store': {
    paths: [
      '/id-id/{gameSlug}',
      '/id/{gameSlug}',
      '/{gameSlug}'
    ],
    discoveryPaths: [
      '/id-id',
      '/'
    ],
    maxProbes: 5
  },

  seagm: {
    paths: [
      '/id-id/{gameSlug}',
      '/id/{gameSlug}',
      '/{gameSlug}'
    ],
    discoveryPaths: [
      '/id-id/{gameSlug}',
      '/id/{gameSlug}',
      '/id-id'
    ],
    maxProbes: 6,
    linkThreshold: 72
  },

  'kios-game-indonesia': {
    paths: [
      '/en/order/{gameSlug}',
      '/en/{gameSlug}',
      '/id/{gameSlug}'
    ],
    discoveryPaths: [
      '/en',
      '/id',
      '/'
    ],
    maxProbes: 6,
    linkThreshold: 72
  },

  topupdeh: {
    paths: [
      '/{gameSlug}',
      '/games/{gameSlug}',
      '/game/{gameSlug}'
    ],
    discoveryPaths: ['/'],
    maxProbes: 5
  },

  casatopup: {
    paths: [
      '/id/beli/{gameSlug}',
      '/en-id/beli/{gameSlug}',
      '/beli/{gameSlug}'
    ],
    discoveryPaths: [
      '/id',
      '/'
    ],
    maxProbes: 5
  },

  topupgamez: {
    paths: [
      '/beli/{gameSlug}',
      '/id/beli/{gameSlug}',
      '/en-id/beli/{gameSlug}'
    ],
    discoveryPaths: [
      '/id',
      '/'
    ],
    maxProbes: 5
  },

  bxystore: {
    paths: [
      '/en-id/beli/{gameSlug}',
      '/id/beli/{gameSlug}',
      '/beli/{gameSlug}'
    ],
    discoveryPaths: [
      '/en-id',
      '/'
    ],
    maxProbes: 5
  },

  sontopup: {
    paths: [
      '/id-id/{gameSlug}',
      '/en-id/{gameSlug}',
      '/{gameSlug}'
    ],
    discoveryPaths: [
      '/id-id',
      '/en-id',
      '/'
    ],
    maxProbes: 6,
    linkThreshold: 70
  },

  yoggstore: {
    paths: [
      '/id/beli/{gameSlug}',
      '/beli/{gameSlug}',
      '/en/beli/{gameSlug}'
    ],
    discoveryPaths: [
      '/id',
      '/en',
      '/'
    ],
    maxProbes: 6,
    linkThreshold: 70
  }
};

const RECOVERABLE_CODES = new Set([
  'PARSER_FAILED',
  'PAGE_NOT_VERIFIED',
  'PAGE_NOT_FOUND'
]);

function providerError(
  code,
  message,
  details = {}
) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

function safeOrigin(value) {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function sameOrigin(
  left,
  right
) {
  try {
    return (
      new URL(left).origin ===
      new URL(right).origin
    );
  } catch {
    return false;
  }
}

function expandPath(
  path,
  store,
  game
) {
  const origin = safeOrigin(store?.homepage);
  if (!origin) return null;

  try {
    return new URL(
      String(path || '')
        .replaceAll(
          '{gameSlug}',
          String(game?.id || '')
        ),
      origin
    ).toString();
  } catch {
    return null;
  }
}

function makeInitialQueue(
  store,
  game,
  config
) {
  const direct = (config.paths || [])
    .map((path) => ({
      url: expandPath(
        path,
        store,
        game
      ),
      discoveryOnly: false
    }));

  const discovery = (
    config.discoveryPaths || []
  )
    .map((path) => ({
      url: expandPath(
        path,
        store,
        game
      ),
      discoveryOnly: true
    }));

  const seen = new Set();

  return [
    ...direct,
    ...discovery
  ].filter((entry) => {
    if (
      !entry.url ||
      seen.has(entry.url)
    ) {
      return false;
    }

    seen.add(entry.url);
    return true;
  });
}

function discoveredLinks(
  html,
  baseUrl,
  store,
  game,
  threshold
) {
  const origin = safeOrigin(store?.homepage);

  return extractLinks(
    html,
    baseUrl
  )
    .filter((link) =>
      link?.href &&
      origin &&
      sameOrigin(link.href, origin)
    )
    .map((link) => ({
      ...link,
      score: linkScore(
        link,
        game,
        store.homepage
      )
    }))
    .filter((link) =>
      link.score >= threshold
    )
    .sort((a, b) =>
      b.score - a.score
    )
    .slice(0, 5)
    .map((link) => link.href);
}

function shouldAttemptParserRecovery(
  store,
  error
) {
  if (!RECOVERY_CONFIG[store?.id]) {
    return false;
  }

  return RECOVERABLE_CODES.has(
    String(error?.code || '')
      .toUpperCase()
  );
}

async function tryParserRecovery(
  store,
  game,
  options = {},
  originalError = null
) {
  const config = RECOVERY_CONFIG[store?.id];

  if (!config) {
    throw originalError || providerError(
      'PARSER_FAILED',
      'Parser recovery tidak dikonfigurasi untuk toko ini'
    );
  }

  const timeoutMs = Math.max(
    2500,
    Math.min(
      8000,
      Number(options.timeoutMs || 6500)
    )
  );

  const maxProbes = Math.max(
    2,
    Math.min(
      6,
      Number(config.maxProbes || 4)
    )
  );

  const linkThreshold = Number(
    config.linkThreshold || 80
  );

  const queue = makeInitialQueue(
    store,
    game,
    config
  );

  const attempted = new Set();
  const diagnostics = [];
  let strongestError = originalError;

  while (
    queue.length &&
    attempted.size < maxProbes
  ) {
    const candidate = queue.shift();
    const candidateUrl = candidate?.url;

    if (
      !candidateUrl ||
      attempted.has(candidateUrl)
    ) {
      continue;
    }

    attempted.add(candidateUrl);

    try {
      const page = await fetchText(
        candidateUrl,
        {
          timeoutMs,
          retries: 0,
          headers: {
            /*
             * Membantu situs multi-locale memilih Indonesia
             * tanpa menyamar sebagai browser pengguna.
             */
            'accept-language':
              'id-ID,id;q=0.9,en-US;q=0.7,en;q=0.6'
          }
        }
      );

      const finalUrl =
        page.finalUrl || candidateUrl;

      const validation = validatePageForGame(
        page.text,
        finalUrl,
        store.homepage,
        game
      );

      const discovered = discoveredLinks(
        page.text,
        finalUrl,
        store,
        game,
        linkThreshold
      );

      const newDiscovered = discovered
        .filter((url) =>
          !attempted.has(url) &&
          !queue.some(
            (entry) => entry.url === url
          )
        )
        .map((url) => ({
          url,
          discoveryOnly: false
        }));

      /*
       * Link produk hasil discovery diprioritaskan sebelum
       * seed discovery berikutnya agar budget probe tidak habis
       * hanya untuk membuka halaman katalog/locale.
       */
      queue.unshift(
        ...newDiscovered
      );

      if (candidate.discoveryOnly) {
        diagnostics.push({
          url: candidateUrl,
          finalUrl,
          result: 'DISCOVERY_ONLY',
          discoveredLinks: discovered.length
        });

        continue;
      }

      if (!validation.ok) {
        diagnostics.push({
          url: candidateUrl,
          finalUrl,
          result: 'PAGE_NOT_VERIFIED',
          validationReason: validation.reason,
          validationScore: validation.score,
          discoveredLinks: discovered.length
        });

        strongestError = pickStrongerError(
          strongestError,
          providerError(
            'PAGE_NOT_VERIFIED',
            `Recovery candidate tidak cocok: ${validation.reason}`,
            {
              finalUrl,
              validationScore: validation.score
            }
          )
        );

        continue;
      }

      const parsed = parseOffers(
        page.text,
        finalUrl,
        store,
        game
      );

      diagnostics.push({
        url: candidateUrl,
        finalUrl,
        result: parsed.offers.length
          ? 'SUCCESS'
          : 'PARSER_FAILED',
        offerCount: parsed.offers.length,
        parserReason:
          parsed.diagnostics?.parserReason || null,
        discoveredLinks: discovered.length
      });

      if (parsed.offers.length) {
        return parsed.offers.map((offer) => ({
          ...offer,
          accessStrategy:
            offer.accessStrategy ||
            'parser-recovery'
        }));
      }

      strongestError = pickStrongerError(
        strongestError,
        providerError(
          'PARSER_FAILED',
          'Recovery menemukan halaman game, tetapi belum menghasilkan offer',
          {
            finalUrl,
            parserReason:
              parsed.diagnostics?.parserReason ||
              'UNSUPPORTED_STRUCTURE',
            parserDiagnostics:
              parsed.diagnostics
          }
        )
      );
    } catch (error) {
      diagnostics.push({
        url: candidateUrl,
        result:
          error?.code || 'UNKNOWN_ERROR',
        status: error?.status ?? null
      });

      strongestError = pickStrongerError(
        strongestError,
        error
      );

      /*
       * Jangan menambah request jika origin meminta rate-limit
       * atau secara eksplisit memblokir akses.
       */
      if (
        ['RATE_LIMITED', 'ACCESS_BLOCKED']
          .includes(
            String(error?.code || '')
              .toUpperCase()
          )
      ) {
        break;
      }
    }
  }

  const finalError =
    strongestError ||
    providerError(
      'PARSER_FAILED',
      'Parser recovery tidak menemukan offer yang dapat digunakan'
    );

  finalError.parserRecoveryDiagnostics = {
    storeId: store.id,
    gameId: game?.id || null,
    maxProbes,
    attemptedUrls: [...attempted],
    attempts: diagnostics
  };

  throw finalError;
}

module.exports = {
  RECOVERY_CONFIG,
  shouldAttemptParserRecovery,
  tryParserRecovery
};
