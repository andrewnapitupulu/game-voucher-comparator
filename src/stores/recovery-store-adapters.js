'use strict';

const { fetchStrictStoreOffers } = require('./strict-store-parser');

const ADAPTER_VERSION = '2026-08-13-recovery-stores-v1';

const RECOVERABLE_LEGACY_CODES = new Set([
  'NOT_CONFIGURED',
  'PARSER_FAILED',
  'PAGE_NOT_VERIFIED',
  'PAGE_NOT_FOUND'
]);

const STORE_CONFIG = {
  codashop: {
    id: 'codashop',
    name: 'Codashop',
    homepage: 'https://www.codashop.com/id-id/',
    paths: ['{gameSlug}'],
    discovery: [''],
    requiredLocalePath: '/id-id/'
  },

  unipin: {
    id: 'unipin',
    name: 'UniPin',
    homepage: 'https://www.unipin.com/id/',
    paths: ['{gameSlug}'],
    discovery: ['']
  },

  'gopay-games': {
    id: 'gopay-games',
    name: 'GoPay Games',
    homepage: 'https://gopay.co.id/games/',
    paths: ['{gameSlug}'],
    discovery: ['']
  },

  'ggwp-topup': {
    id: 'ggwp-topup',
    name: 'GGWP Top Up',
    homepage: 'https://topup.ggwp.id/',
    paths: [
      'games/{gameSlug}',
      'game/{gameSlug}',
      '{gameSlug}'
    ],
    discovery: ['']
  },

  'oura-store': {
    id: 'oura-store',
    name: 'Oura Store',
    homepage: 'https://www.ourastore.com/',
    paths: [
      'id-id/{gameSlug}',
      'id/{gameSlug}',
      '{gameSlug}'
    ],
    discovery: [
      'id-id/',
      ''
    ]
  },

  topupgamestore: {
    id: 'topupgamestore',
    name: 'TopupGameStore',
    homepage: 'https://topupgamestore.id/',
    paths: [
      'fil/beli/{gameSlug}',
      'id/beli/{gameSlug}',
      'en/beli/{gameSlug}',
      'beli/{gameSlug}',
      '{gameSlug}',
      'games/{gameSlug}'
    ],
    discovery: [
      'fil/',
      'id/',
      ''
    ]
  },

  topupdeh: {
    id: 'topupdeh',
    name: 'TopUpDeh',
    homepage: 'https://topupdeh.id/',
    paths: [
      '{gameSlug}',
      'games/{gameSlug}',
      'game/{gameSlug}'
    ],
    discovery: [
      'games/',
      ''
    ]
  },

  seagm: {
    id: 'seagm',
    name: 'SEAGM',
    homepage: 'https://www.seagm.com/id-id/',
    paths: [
      '{gameSlug}',
      '{gameSlug}-top-up'
    ],

    specialPaths: {
      'mobile-legends': [
        'mlbb-diamonds-top-up-id',
        'mobile-legends-diamonds-top-up',
        'mobile-legends'
      ],

      'wuthering-waves': [
        'wuthering-waves-top-up',
        'wuthering-waves'
      ],

      'zenless-zone-zero': [
        'zenless-zone-zero',
        'zenless-zone-zero-top-up'
      ]
    },

    discovery: ['']
  },

  sontopup: {
    id: 'sontopup',
    name: 'Sontopup',
    homepage: 'https://sontopup.com/',
    paths: [
      'id-id/{gameSlug}',
      'en-id/{gameSlug}',
      'id/beli/{gameSlug}',
      'beli/{gameSlug}',
      '{gameSlug}'
    ],

    discovery: [
      'id-id/',
      'en-id/',
      ''
    ],

    /*
     * Price list hanya dipakai untuk unit yang relatif unik,
     * misalnya Monochrome / Lunite.
     *
     * Untuk Diamonds/Coins sengaja tidak dipakai agar
     * produk game lain tidak ikut terbaca.
     */
    uniqueUnitCatalogPaths: [
      'price-list',
      'en-id/price-list'
    ]
  },

  yoggstore: {
    id: 'yoggstore',
    name: 'Yoggstore',
    homepage: 'https://yoggstore.id/',
    paths: [
      'id/beli/{gameSlug}',
      'beli/{gameSlug}',
      'en/beli/{gameSlug}'
    ],

    discovery: [
      'id/',
      'en/',
      ''
    ]
  },

  gamestorecan: {
    id: 'gamestorecan',
    name: 'GameStoreCan',
    homepage: 'https://gamestorecan.id/',
    paths: [
      'beli/{gameSlug}',
      'beli/{gameSlug}-id',
      'beli/{gameSlug}-via-login',
      'beli/{gameSlug}-indonesia'
    ],

    specialPaths: {
      'mobile-legends': [
        'beli/mobile-legends-indonesia',
        'beli/mobile-legends'
      ],

      'genshin-impact': [
        'beli/genshin-impact-id',
        'beli/genshin-impact'
      ],

      'wuthering-waves': [
        'beli/wuthering-waves-via-login',
        'beli/wuthering-waves'
      ]
    },

    discovery: ['']
  }
};

function expandPath(
  config,
  value,
  game
) {
  if (
    value == null
  ) {
    return null;
  }

  const slug =
    encodeURIComponent(
      game?.id ||
      ''
    );

  const query =
    encodeURIComponent(
      game?.shortName ||
      game?.name ||
      game?.id ||
      ''
    );

  const path =
    String(value)
      .replaceAll(
        '{gameSlug}',
        slug
      )
      .replaceAll(
        '{gameQuery}',
        query
      );

  try {
    return new URL(
      path,
      config.homepage
    ).toString();
  } catch {
    return null;
  }
}

function uniqueUrls(
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

function hasAmbiguousUnit(
  game
) {
  /*
   * Unit-unit ini dipakai oleh terlalu banyak game.
   *
   * Untuk game dengan unit seperti ini kita tidak
   * mem-parse homepage/catalog generik, karena berisiko
   * mengambil harga milik game lain.
   */
  const ambiguous =
    new Set([
      'diamond',
      'diamonds',
      'coin',
      'coins',
      'crystal',
      'crystals',
      'point',
      'points',
      'cash',
      'gold'
    ]);

  return (
    game?.unitAliases ||
    []
  )
    .map(
      (value) =>
        String(value)
          .trim()
          .toLowerCase()
    )
    .some(
      (value) =>
        ambiguous.has(
          value
        )
    );
}

function candidateUrls(
  config,
  game
) {
  const special =
    config
      .specialPaths
      ?.[game?.id] ||
    [];

  const catalog =
    hasAmbiguousUnit(
      game
    )
      ? []
      : (
          config
            .uniqueUnitCatalogPaths ||
          []
        );

  return uniqueUrls(
    [
      ...special,
      ...(
        config.paths ||
        []
      ),
      ...catalog
    ]
      .map(
        (path) =>
          expandPath(
            config,
            path,
            game
          )
      )
  );
}

function discoveryUrls(
  config,
  game
) {
  /*
   * Homepage/catalog discovery dimatikan untuk
   * unit generik seperti Diamonds/Coins.
   *
   * Ini mencegah strict parser mengambil card
   * game lain yang kebetulan mempunyai unit sama.
   */
  if (
    hasAmbiguousUnit(
      game
    )
  ) {
    return [];
  }

  return uniqueUrls(
    (
      config.discovery ||
      []
    )
      .map(
        (path) =>
          expandPath(
            config,
            path,
            game
          )
      )
  );
}

function reclassifyRegionRedirect(
  error,
  config
) {
  if (
    !config
      .requiredLocalePath ||
    !error
      ?.strictParserDiagnostics
  ) {
    return error;
  }

  const attempts =
    (
      error
        .strictParserDiagnostics
        .attempts ||
      []
    )
      .filter(
        (attempt) =>
          attempt?.finalUrl
      );

  const expectedHost =
    new URL(
      config.homepage
    ).hostname;

  const redirected =
    attempts.some(
      (attempt) => {
        try {
          const finalUrl =
            new URL(
              attempt.finalUrl
            );

          return (
            finalUrl.hostname ===
              expectedHost &&
            !finalUrl.pathname
              .startsWith(
                config
                  .requiredLocalePath
              )
          );
        } catch {
          return false;
        }
      }
    );

  if (
    !redirected
  ) {
    return error;
  }

  /*
   * Contoh:
   *
   * /id-id/zenless-zone-zero
   *      ↓
   * /en-us/zenless-zone-zero
   *
   * Jangan pernah membaca $0.99 sebagai Rp1.
   */
  error.code =
    'PAGE_NOT_VERIFIED';

  error.parserReason =
    'REGION_REDIRECT';

  error.message =
    `${config.name} mengalihkan halaman dari locale Indonesia; ` +
    'harga non-IDR sengaja tidak digunakan';

  return error;
}

function createStrictRecoveryAdapter(
  config
) {
  const store = {
    id:
      config.id,

    name:
      config.name,

    homepage:
      config.homepage
  };

  return {
    id:
      config.id,

    name:
      config.name,

    recoveryStoreAdapterVersion:
      ADAPTER_VERSION,

    async fetchOffers(
      game,
      options = {}
    ) {
      try {
        const offers =
          await fetchStrictStoreOffers({
            store,
            game,
            options,

            candidates:
              candidateUrls(
                config,
                game
              ),

            discoveryPages:
              discoveryUrls(
                config,
                game
              ),

            /*
             * Mengaktifkan:
             *
             * - visible strict parser
             * - same JSON object parser
             * - script inspection
             * - read-only endpoint discovery
             */
            dynamic:
              true
          });

        return offers.map(
          (offer) => ({
            ...offer,

            source:
              'live',

            accessStrategy:
              offer.accessStrategy ||
              'dedicated-strict-recovery',

            recoveryStoreAdapterVersion:
              ADAPTER_VERSION
          })
        );
      } catch (
        error
      ) {
        error
          .recoveryStoreAdapterVersion =
          ADAPTER_VERSION;

        error
          .recoveryStoreConfig = {
            storeId:
              config.id,

            gameId:
              game?.id ||
              null,

            candidates:
              candidateUrls(
                config,
                game
              ),

            discoveryPages:
              discoveryUrls(
                config,
                game
              )
          };

        throw reclassifyRegionRedirect(
          error,
          config
        );
      }
    }
  };
}

/*
 * Codashop dan UniPin sudah punya dedicated adapter lama.
 *
 * Adapter lama tetap dicoba terlebih dahulu agar game-game
 * yang sebelumnya stabil tidak ikut regression.
 *
 * Recovery baru hanya mengambil alih pada kondisi seperti:
 *
 * NOT_CONFIGURED
 * PARSER_FAILED
 * PAGE_NOT_VERIFIED
 * PAGE_NOT_FOUND
 */
function createLegacyThenRecoveryAdapter(
  legacyAdapter,
  recoveryAdapter
) {
  if (
    !legacyAdapter
  ) {
    return recoveryAdapter;
  }

  return {
    id:
      recoveryAdapter.id,

    name:
      recoveryAdapter.name,

    recoveryStoreAdapterVersion:
      ADAPTER_VERSION,

    async fetchOffers(
      game,
      options = {}
    ) {
      let legacyError =
        null;

      try {
        const offers =
          await legacyAdapter
            .fetchOffers(
              game,
              options
            );

        if (
          Array.isArray(
            offers
          ) &&
          offers.length
        ) {
          return offers;
        }
      } catch (
        error
      ) {
        legacyError =
          error;

        const code =
          String(
            error?.code ||
            ''
          )
            .toUpperCase();

        /*
         * ACCESS_BLOCKED / RATE_LIMITED / network error
         * tidak di-bypass dengan request tambahan.
         */
        if (
          !RECOVERABLE_LEGACY_CODES
            .has(
              code
            )
        ) {
          throw error;
        }
      }

      try {
        return await recoveryAdapter
          .fetchOffers(
            game,
            options
          );
      } catch (
        recoveryError
      ) {
        if (
          legacyError
        ) {
          recoveryError
            .legacyDedicatedError = {
              code:
                legacyError
                  ?.code ||
                null,

              status:
                legacyError
                  ?.status ??
                null,

              parserReason:
                legacyError
                  ?.parserReason ||
                null
            };
        }

        throw recoveryError;
      }
    }
  };
}

const recoveryAdapters =
  Object.fromEntries(
    Object.entries(
      STORE_CONFIG
    )
      .map(
        (
          [
            id,
            config
          ]
        ) => [
          id,
          createStrictRecoveryAdapter(
            config
          )
        ]
      )
  );

module.exports = {
  ADAPTER_VERSION,

  STORE_CONFIG,

  recoveryAdapters,

  createStrictRecoveryAdapter,

  createLegacyThenRecoveryAdapter
};
