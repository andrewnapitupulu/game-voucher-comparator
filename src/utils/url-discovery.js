'use strict';

const {
  decodeEntities
} = require('./html');

const {
  normalizeText
} = require('../config/games');

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
  if (!value) {
    return null;
  }

  try {
    const url =
      new URL(
        String(value),
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
    ).matchAll(regex)
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
      normalizeText(value);

    if (
      !normalized ||
      seen.has(normalized)
    ) {
      continue;
    }

    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

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
            normalizeText(alias);

          if (
            !normalized ||
            unitSet.has(normalized)
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
    normalizeText(value);

  if (!normalized) {
    return false;
  }

  return (
    normalized
      .split(/\s+/)
      .filter(Boolean)
      .length >= 2 ||
    normalized
      .replace(/\s+/g, '')
      .length >= 4
  );
}

function containsPhrase(
  haystack,
  phrase
) {
  const h =
    normalizeText(haystack);

  const p =
    normalizeText(phrase);

  if (!h || !p) {
    return false;
  }

  return (
    ` ${h} `
  ).includes(
    ` ${p} `
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

  let score =
    0;

  for (
    const identity of
    gameIdentityCandidates(game)
  ) {
    const compact =
      identity.replace(
        /\s+/g,
        ''
      );

    const strong =
      isStrongIdentity(identity);

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
            ? 130 + compact.length
            : 72 + compact.length
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
            ? 112 + compact.length
            : 62 + compact.length
        );
    }

    if (strong) {
      if (
        text
          .replace(/\s+/g, '')
          .includes(compact)
      ) {
        score =
          Math.max(
            score,
            118 + compact.length
          );
      }

      if (
        href
          .replace(/\s+/g, '')
          .includes(compact)
      ) {
        score =
          Math.max(
            score,
            100 + compact.length
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
      new URL(link.href).origin !==
      new URL(homepage).origin
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

function makeCandidateEntry(
  url,
  source,
  confidence,
  score = 0
) {
  return {
    url,
    source,
    confidence,
    score
  };
}

function dedupeCandidateEntries(
  entries
) {
  const rank = {
    direct:
      4,

    discovered:
      3,

    sitemap:
      2,

    guessed:
      1
  };

  const map =
    new Map();

  for (
    const entry of
    entries
  ) {
    if (
      !entry?.url
    ) {
      continue;
    }

    const previous =
      map.get(entry.url);

    if (
      !previous ||
      (
        rank[
          entry.source
        ] ||
        0
      ) >
      (
        rank[
          previous.source
        ] ||
        0
      ) ||
      Number(
        entry.score ||
        0
      ) >
      Number(
        previous.score ||
        0
      )
    ) {
      map.set(
        entry.url,
        entry
      );
    }
  }

  return [
    ...map.values()
  ];
}

function makeDirectCandidateEntries(
  store,
  game
) {
  return dedupeCandidateEntries(
    [
      store?.gameUrls?.[
        game.id
      ],

      game?.stores?.[
        store.id
      ]
    ]
      .filter(Boolean)
      .map(
        (value) =>
          absoluteUrl(
            value,
            store.homepage
          )
      )
      .filter(Boolean)
      .map(
        (url) =>
          makeCandidateEntry(
            url,
            'direct',
            'high',
            200
          )
      )
  );
}

function makeDiscoveredCandidateEntries(
  store,
  game,
  homepageHtml = ''
) {
  if (!homepageHtml) {
    return [];
  }

  return dedupeCandidateEntries(
    extractLinks(
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
        (a, b) =>
          b.score -
          a.score
      )
      .slice(
        0,
        4
      )
      .map(
        (link) =>
          makeCandidateEntry(
            link.href,
            'discovered',
            'high',
            link.score
          )
      )
  );
}

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

  const seen =
    new Set();

  const result =
    [];

  for (
    const value of
    [
      game?.id,
      game?.name,
      game?.shortName,
      ...(
        game?.aliases ||
        []
      )
    ]
  ) {
    const normalized =
      normalizeText(value);

    if (
      !normalized ||
      unitSet.has(normalized) ||
      PACKAGE_ALIAS_PATTERN.test(
        normalized
      )
    ) {
      continue;
    }

    if (
      normalized
        .replace(/\s+/g, '')
        .length < 3
    ) {
      continue;
    }

    const slug =
      normalized.replace(
        /\s+/g,
        '-'
      );

    if (
      !slug ||
      seen.has(slug)
    ) {
      continue;
    }

    seen.add(slug);
    result.push(slug);

    if (
      result.length >=
      4
    ) {
      break;
    }
  }

  if (
    game?.id &&
    !seen.has(game.id)
  ) {
    result.unshift(
      game.id
    );
  }

  return [
    ...new Set(result)
  ]
    .slice(
      0,
      4
    );
}

function makeGuessedCandidateEntries(
  store,
  game
) {
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
    alternateGameSlugs(game)
  ) {
    for (
      const template of
      templates
    ) {
      const url =
        absoluteUrl(
          String(template)
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
          makeCandidateEntry(
            url,
            'guessed',
            'low',
            10
          )
        );
      }
    }
  }

  return dedupeCandidateEntries(
    generated
  );
}

function makeCandidateEntries(
  store,
  game,
  homepageHtml = ''
) {
  return dedupeCandidateEntries([
    ...makeDirectCandidateEntries(
      store,
      game
    ),

    ...makeDiscoveredCandidateEntries(
      store,
      game,
      homepageHtml
    ),

    ...makeGuessedCandidateEntries(
      store,
      game
    )
  ]);
}

/*
 * Backward compatibility untuk
 * module/test lama yang masih
 * mengharapkan array URL string.
 */
function makeCandidateUrls(
  store,
  game,
  homepageHtml = ''
) {
  return makeCandidateEntries(
    store,
    game,
    homepageHtml
  )
    .map(
      (entry) =>
        entry.url
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
    ).matchAll(regex)
  ) {
    const url =
      absoluteUrl(
        decodeEntities(
          stripTags(
            match[1]
          )
        ),
        baseUrl
      );

    if (url) {
      locations.push(url);
    }
  }

  return [
    ...new Set(locations)
  ];
}

function sitemapRoots(
  homepage
) {
  try {
    const home =
      new URL(homepage);

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

async function discoverSitemapCandidates(
  store,
  game,
  {
    fetchText,
    timeoutMs = 2800,
    maxSitemaps = 2,
    maxUrls = 4
  } = {}
) {
  if (
    typeof fetchText !==
      'function' ||
    !store?.homepage
  ) {
    return {
      entries:
        [],

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
    checked < maxSitemaps
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
      const response =
        await fetchText(
          current.url,
          {
            timeoutMs,
            retries:
              0,

            headers: {
              accept:
                'application/xml,text/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5'
            }
          }
        );

      const locations =
        extractSitemapLocations(
          response.text,
          response.finalUrl ||
          current.url
        );

      for (
        const location of
        locations
      ) {
        const score =
          linkScore(
            {
              href:
                location,

              text:
                ''
            },
            game,
            store.homepage
          );

        if (
          score >=
          85
        ) {
          found.set(
            location,

            Math.max(
              found.get(
                location
              ) ||
              0,

              score
            )
          );
        }
      }

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
              (a, b) =>
                Number(
                  /product|game|page/i.test(
                    b
                  )
                ) -
                Number(
                  /product|game|page/i.test(
                    a
                  )
                )
            )
            .slice(
              0,
              Math.max(
                0,
                maxSitemaps -
                checked
              )
            );

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
    } catch (error) {
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

  const entries =
    [
      ...found.entries()
    ]
      .sort(
        (a, b) =>
          b[1] -
          a[1]
      )
      .slice(
        0,
        maxUrls
      )
      .map(
        ([url, score]) =>
          makeCandidateEntry(
            url,
            'sitemap',
            'high',
            score
          )
      );

  return {
    entries,

    urls:
      entries.map(
        (entry) =>
          entry.url
      ),

    checked,
    errors
  };
}

/*
 * Alias kompatibel dengan patch
 * sebelumnya.
 */
async function discoverSitemapUrls(
  store,
  game,
  options = {}
) {
  const result =
    await discoverSitemapCandidates(
      store,
      game,
      options
    );

  return {
    urls:
      result.urls,

    checked:
      result.checked,

    errors:
      result.errors
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
  makeCandidateEntries,
  makeCandidateUrls,
  makeDirectCandidateEntries,
  makeDiscoveredCandidateEntries,
  makeGuessedCandidateEntries,
  extractSitemapLocations,
  discoverSitemapCandidates,
  discoverSitemapUrls
};
