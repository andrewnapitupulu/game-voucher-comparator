'use strict';

const {
  decodeEntities
} = require(
  './html'
);

const {
  normalizeText
} = require(
  '../config/games'
);

const COMMON_TEMPLATES = [
  '{homepage}/{gameSlug}',
  '{homepage}/games/{gameSlug}',
  '{homepage}/game/{gameSlug}',
  '{homepage}/topup/{gameSlug}',
  '{homepage}/top-up/{gameSlug}',
  '{homepage}/top-up-game/{gameSlug}',
  '{homepage}/product/{gameSlug}',
  '{homepage}/products/{gameSlug}'
];

const BAD_LINK_PATTERN =
  /\b(?:login|register|daftar|masuk|berita|news|article|artikel|blog|promo|promosi|terms|privacy|affiliate|reseller|karir|career|contact|kontak|about|tentang)\b/i;

const PACKAGE_ALIAS_PATTERN =
  /\b(?:membership|subscription|pass|bundle|special data|zero data|welkin|starlight|voucher)\b/i;

function absoluteUrl(
  value,
  baseUrl
) {
  try {
    const url =
      new URL(
        String(
          value ||
          ''
        ),
        baseUrl
      );

    if (
      !/^https?:$/.test(
        url.protocol
      )
    ) {
      return null;
    }

    url.hash =
      '';

    return url.toString();
  } catch {
    return null;
  }
}

function stripTags(
  value
) {
  return decodeEntities(
    String(
      value ||
      ''
    )
      .replace(
        /<[^>]+>/g,
        ' '
      )
      .replace(
        /\s+/g,
        ' '
      )
      .trim()
  );
}

function extractLinks(
  html,
  baseUrl
) {
  const links =
    [];

  const regex =
    /<a\b[^>]*href\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;

  for (
    const match of
    String(
      html ||
      ''
    ).matchAll(
      regex
    )
  ) {
    const href =
      absoluteUrl(
        match[1] ||
        match[2] ||
        match[3],

        baseUrl
      );

    if (!href) {
      continue;
    }

    links.push({
      href,

      text:
        stripTags(
          match[4]
        )
    });
  }

  return links;
}

function slugify(
  value
) {
  return normalizeText(
    value
  )
    .replace(
      /\s+/g,
      '-'
    );
}

function uniqueNormalized(
  values
) {
  const seen =
    new Set();

  const result =
    [];

  for (
    const value of
    values
  ) {
    const normalized =
      normalizeText(
        value
      );

    if (
      !normalized ||
      seen.has(
        normalized
      )
    ) {
      continue;
    }

    seen.add(
      normalized
    );

    result.push(
      normalized
    );
  }

  return result;
}

/*
 * Identity game sengaja tidak
 * menggunakan currency sebagai bukti.
 *
 * Contoh:
 * Lunite bukan identity Wuthering Waves.
 * Diamonds bukan identity Mobile Legends.
 */
function gameIdentityCandidates(
  game
) {
  const unitSet =
    new Set(
      uniqueNormalized(
        game?.unitAliases ||
        []
      )
    );

  const aliases =
    (
      game?.aliases ||
      []
    )
      .filter(
        (alias) => {
          const normalized =
            normalizeText(
              alias
            );

          if (
            !normalized ||
            unitSet.has(
              normalized
            )
          ) {
            return false;
          }

          if (
            PACKAGE_ALIAS_PATTERN.test(
              normalized
            )
          ) {
            return false;
          }

          return true;
        }
      );

  return uniqueNormalized([
    String(
      game?.id ||
      ''
    )
      .replace(
        /-/g,
        ' '
      ),

    game?.name,
    game?.shortName,

    ...aliases
  ]);
}

function isStrongIdentity(
  value
) {
  const normalized =
    normalizeText(
      value
    );

  if (!normalized) {
    return false;
  }

  const compact =
    normalized.replace(
      /\s+/g,
      ''
    );

  const tokenCount =
    normalized
      .split(
        /\s+/
      )
      .filter(
        Boolean
      )
      .length;

  return (
    tokenCount >=
      2 ||
    compact.length >=
      4
  );
}

function containsPhrase(
  haystack,
  phrase
) {
  const normalizedHaystack =
    normalizeText(
      haystack
    );

  const normalizedPhrase =
    normalizeText(
      phrase
    );

  if (
    !normalizedHaystack ||
    !normalizedPhrase
  ) {
    return false;
  }

  return (
    ` ${normalizedHaystack} `
  ).includes(
    ` ${normalizedPhrase} `
  );
}

function linkScore(
  link,
  game,
  homepage
) {
  const text =
    normalizeText(
      link?.text ||
      ''
    );

  const href =
    normalizeText(
      link?.href ||
      ''
    );

  const identities =
    gameIdentityCandidates(
      game
    );

  let score =
    0;

  for (
    const identity of
    identities
  ) {
    const compact =
      identity.replace(
        /\s+/g,
        ''
      );

    const strong =
      isStrongIdentity(
        identity
      );

    if (
      containsPhrase(
        text,
        identity
      )
    ) {
      score =
        Math.max(
          score,

          strong
            ? 130 +
              compact.length
            : 72 +
              compact.length
        );
    }

    if (
      containsPhrase(
        href,
        identity
      )
    ) {
      score =
        Math.max(
          score,

          strong
            ? 112 +
              compact.length
            : 62 +
              compact.length
        );
    }

    if (strong) {
      const compactText =
        text.replace(
          /\s+/g,
          ''
        );

      const compactHref =
        href.replace(
          /\s+/g,
          ''
        );

      if (
        compactText.includes(
          compact
        )
      ) {
        score =
          Math.max(
            score,
            118 +
              compact.length
          );
      }

      if (
        compactHref.includes(
          compact
        )
      ) {
        score =
          Math.max(
            score,
            100 +
              compact.length
          );
      }
    }
  }

  if (
    BAD_LINK_PATTERN.test(
      `${text} ${href}`
    )
  ) {
    score -=
      100;
  }

  try {
    if (
      new URL(
        link.href
      ).origin !==
      new URL(
        homepage
      ).origin
    ) {
      score -=
        70;
    }
  } catch {
    score -=
      70;
  }

  return score;
}

/*
 * Membentuk variasi slug:
 *
 * wuthering-waves
 * wuwa
 *
 * honkai-star-rail
 * hsr
 *
 * dll.
 */
function alternateGameSlugs(
  game
) {
  const unitSet =
    new Set(
      uniqueNormalized(
        game?.unitAliases ||
        []
      )
    );

  const values = [
    game?.id,
    game?.name,
    game?.shortName,

    ...(
      game?.aliases ||
      []
    )
  ];

  const slugs =
    [];

  const seen =
    new Set();

  for (
    const value of
    values
  ) {
    const normalized =
      normalizeText(
        value
      );

    if (
      !normalized ||
      unitSet.has(
        normalized
      )
    ) {
      continue;
    }

    if (
      PACKAGE_ALIAS_PATTERN.test(
        normalized
      )
    ) {
      continue;
    }

    const compactLength =
      normalized
        .replace(
          /\s+/g,
          ''
        )
        .length;

    if (
      compactLength <
      3
    ) {
      continue;
    }

    const slug =
      slugify(
        normalized
      );

    if (
      !slug ||
      seen.has(
        slug
      )
    ) {
      continue;
    }

    seen.add(
      slug
    );

    slugs.push(
      slug
    );

    if (
      slugs.length >=
      5
    ) {
      break;
    }
  }

  if (
    !seen.has(
      game.id
    )
  ) {
    slugs.unshift(
      game.id
    );
  }

  return [
    ...new Set(
      slugs
    )
  ]
    .slice(
      0,
      5
    );
}

function makeCandidateUrls(
  store,
  game,
  homepageHtml = ''
) {
  const directUrls = [
    store?.gameUrls?.[
      game.id
    ],

    game?.stores?.[
      store.id
    ]
  ]
    .filter(
      Boolean
    );

  /*
   * Candidate hasil link nyata
   * dari homepage mendapat prioritas
   * lebih tinggi daripada tebakan.
   */
  const discovered =
    homepageHtml
      ? extractLinks(
          homepageHtml,
          store.homepage
        )
          .map(
            (link) => ({
              ...link,

              score:
                linkScore(
                  link,
                  game,
                  store.homepage
                )
            })
          )
          .filter(
            (link) =>
              link.score >=
              85
          )
          .sort(
            (
              a,
              b
            ) =>
              b.score -
              a.score
          )
          .slice(
            0,
            5
          )
          .map(
            (link) =>
              link.href
          )

      : [];

  const home =
    String(
      store.homepage ||
      ''
    )
      .replace(
        /\/$/,
        ''
      );

  const templates = [
    ...(
      store.urlTemplates ||
      []
    ),

    ...COMMON_TEMPLATES
  ];

  const generated =
    [];

  for (
    const slug of
    alternateGameSlugs(
      game
    )
  ) {
    for (
      const template of
      templates
    ) {
      const url =
        absoluteUrl(
          String(
            template
          )
            .replaceAll(
              '{homepage}',
              home
            )
            .replaceAll(
              '{gameSlug}',
              slug
            ),

          store.homepage
        );

      if (url) {
        generated.push(
          url
        );
      }
    }
  }

  return [
    ...new Set([
      ...directUrls
        .map(
          (url) =>
            absoluteUrl(
              url,
              store.homepage
            )
        )
        .filter(
          Boolean
        ),

      ...discovered,
      ...generated
    ])
  ]
    .slice(
      0,
      24
    );
}

function extractSitemapLocations(
  xml,
  baseUrl
) {
  const locations =
    [];

  const regex =
    /<loc\b[^>]*>([\s\S]*?)<\/loc>/gi;

  for (
    const match of
    String(
      xml ||
      ''
    ).matchAll(
      regex
    )
  ) {
    const raw =
      decodeEntities(
        stripTags(
          match[1]
        )
      );

    const url =
      absoluteUrl(
        raw,
        baseUrl
      );

    if (url) {
      locations.push(
        url
      );
    }
  }

  return [
    ...new Set(
      locations
    )
  ];
}

function scoreUrlForGame(
  url,
  game,
  homepage
) {
  return linkScore(
    {
      href:
        url,

      text:
        ''
    },

    game,
    homepage
  );
}

function sitemapRoots(
  homepage
) {
  try {
    const home =
      new URL(
        homepage
      );

    return [
      new URL(
        '/sitemap.xml',
        home.origin
      ).toString(),

      new URL(
        '/sitemap_index.xml',
        home.origin
      ).toString()
    ];
  } catch {
    return [];
  }
}

/*
 * Sitemap hanya dipakai sebagai
 * fallback setelah candidate awal gagal.
 *
 * Jadi tidak setiap toko otomatis
 * menambah request sitemap.
 */
async function discoverSitemapUrls(
  store,
  game,
  {
    fetchText,
    timeoutMs = 3000,
    maxSitemaps = 2,
    maxUrls = 6
  } = {}
) {
  if (
    typeof fetchText !==
      'function' ||
    !store?.homepage
  ) {
    return {
      urls:
        [],

      checked:
        0,

      errors:
        []
    };
  }

  const queue =
    sitemapRoots(
      store.homepage
    )
      .map(
        (url) => ({
          url,
          depth:
            0
        })
      );

  const seenSitemaps =
    new Set();

  const found =
    new Map();

  const errors =
    [];

  let checked =
    0;

  while (
    queue.length &&
    checked <
    maxSitemaps
  ) {
    const current =
      queue.shift();

    if (
      !current?.url ||
      seenSitemaps.has(
        current.url
      )
    ) {
      continue;
    }

    seenSitemaps.add(
      current.url
    );

    checked +=
      1;

    try {
      /*
       * Sitemap discovery tidak
       * melakukan retry tersendiri
       * agar tidak menghasilkan
       * terlalu banyak request.
       */
      const response =
        await fetchText(
          current.url,
          {
            timeoutMs,
            retries:
              0
          }
        );

      const locations =
        extractSitemapLocations(
          response.text,

          response.finalUrl ||
          current.url
        );

      /*
       * Langsung cari URL game
       * pada sitemap.
       */
      for (
        const location of
        locations
      ) {
        const score =
          scoreUrlForGame(
            location,
            game,
            store.homepage
          );

        if (
          score >=
          85
        ) {
          const previous =
            found.get(
              location
            ) ||
            0;

          found.set(
            location,
            Math.max(
              previous,
              score
            )
          );
        }
      }

      /*
       * Jika sitemap.xml merupakan
       * sitemap index, cek child
       * sitemap yang paling mungkin
       * berisi halaman game/product.
       */
      if (
        current.depth ===
        0
      ) {
        const nested =
          locations
            .filter(
              (url) =>
                /\.xml(?:\?|$)|sitemap/i.test(
                  url
                )
            )
            .sort(
              (
                a,
                b
              ) => {
                const preference =
                  (value) =>
                    /product|game|page|post/i.test(
                      value
                    )
                      ? 1
                      : 0;

                return (
                  preference(
                    b
                  ) -
                  preference(
                    a
                  )
                );
              }
            )
            .slice(
              0,

              Math.max(
                0,
                maxSitemaps -
                  checked
              )
            );

        /*
         * Child sitemap diprioritaskan
         * sebelum sitemap root kedua.
         */
        for (
          const url of
          nested.reverse()
        ) {
          if (
            !seenSitemaps.has(
              url
            )
          ) {
            queue.unshift({
              url,
              depth:
                1
            });
          }
        }
      }
    } catch (
      error
    ) {
      /*
       * Error sitemap tidak dianggap
       * sebagai error utama toko.
       *
       * Sitemap hanyalah discovery
       * tambahan.
       */
      errors.push({
        url:
          current.url,

        code:
          error?.code ||
          'UNKNOWN_ERROR',

        status:
          error?.status ??
          null
      });
    }
  }

  const urls =
    [
      ...found.entries()
    ]
      .sort(
        (
          a,
          b
        ) =>
          b[1] -
          a[1]
      )
      .slice(
        0,
        maxUrls
      )
      .map(
        ([url]) =>
          url
      );

  return {
    urls,
    checked,
    errors
  };
}

module.exports = {
  COMMON_TEMPLATES,
  absoluteUrl,
  extractLinks,
  gameIdentityCandidates,
  isStrongIdentity,
  containsPhrase,
  linkScore,
  makeCandidateUrls,
  extractSitemapLocations,
  discoverSitemapUrls
};
