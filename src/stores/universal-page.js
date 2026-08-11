'use strict';

const {
  fetchText
} = require(
  '../services/http'
);

const {
  htmlToLines,
  extractOffersFromLines,
  extractJsonScriptOffers,
  dedupeOffers,
  decodeEntities
} = require(
  '../utils/html'
);

const {
  GAMES,
  normalizeText
} = require(
  '../config/games'
);

const COMMON_TEMPLATES = [
  '{homepage}/{gameSlug}',
  '{homepage}/games/{gameSlug}',
  '{homepage}/topup/{gameSlug}',
  '{homepage}/top-up/{gameSlug}',
  '{homepage}/game/{gameSlug}',
  '{homepage}/product/{gameSlug}'
];

const BAD_LINK_PATTERN =
  /\b(?:login|register|daftar|masuk|berita|news|article|artikel|blog|promo|promosi|terms|privacy|affiliate|reseller|karir|career|contact|kontak|about|tentang)\b/i;

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

    return /^https?:$/.test(
      url.protocol
    )
      ? url.toString()
      : null;
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

function gameIdentityCandidates(
  game
) {
  return uniqueNormalized([
    String(
      game?.id ||
      ''
    ).replace(
      /-/g,
      ' '
    ),

    game?.name,
    game?.shortName,

    ...(
      game?.aliases ||
      []
    )
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

function countPhrase(
  haystack,
  phrase
) {
  const normalizedHaystack =
    ` ${normalizeText(
      haystack
    )} `;

  const normalizedPhrase =
    normalizeText(
      phrase
    );

  if (!normalizedPhrase) {
    return 0;
  }

  const needle =
    ` ${normalizedPhrase} `;

  let count =
    0;

  let cursor =
    0;

  while (
    cursor <
    normalizedHaystack.length
  ) {
    const index =
      normalizedHaystack.indexOf(
        needle,
        cursor
      );

    if (
      index ===
      -1
    ) {
      break;
    }

    count +=
      1;

    cursor =
      index +
      needle.length;
  }

  return count;
}

function extractTagTexts(
  html,
  tagNames
) {
  const result =
    [];

  const tags =
    tagNames.join(
      '|'
    );

  const regex =
    new RegExp(
      `<(?:${tags})\\b[^>]*>([\\s\\S]*?)<\\/(?:${tags})>`,
      'gi'
    );

  for (
    const match of
    String(
      html ||
      ''
    ).matchAll(
      regex
    )
  ) {
    const text =
      stripTags(
        match[1]
      );

    if (text) {
      result.push(
        text
      );
    }
  }

  return result;
}

function extractMetaContent(
  html,
  names
) {
  const result =
    [];

  const wanted =
    new Set(
      names.map(
        (name) =>
          name.toLowerCase()
      )
    );

  const regex =
    /<meta\b([^>]+)>/gi;

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
      match[1];

    const keyMatch =
      attributes.match(
        /(?:name|property)\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i
      );

    const contentMatch =
      attributes.match(
        /content\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i
      );

    const key =
      String(
        keyMatch?.[1] ||
        keyMatch?.[2] ||
        keyMatch?.[3] ||
        ''
      )
        .toLowerCase();

    if (
      !wanted.has(
        key
      )
    ) {
      continue;
    }

    const content =
      decodeEntities(
        contentMatch?.[1] ||
        contentMatch?.[2] ||
        contentMatch?.[3] ||
        ''
      )
        .replace(
          /\s+/g,
          ' '
        )
        .trim();

    if (content) {
      result.push(
        content
      );
    }
  }

  return result;
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

function makeCandidateUrls(
  store,
  game,
  homepageHtml
) {
  const directUrls = [
    store.gameUrls?.[
      game.id
    ],

    game.stores?.[
      store.id
    ]
  ].filter(
    Boolean
  );

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
              link.href
          )

      : [];

  const fromTemplates = [
    ...(
      store.urlTemplates ||
      []
    ),

    ...COMMON_TEMPLATES
  ]

    .map(
      (template) =>
        String(
          template
        )

          .replaceAll(
            '{homepage}',

            String(
              store.homepage ||
              ''
            )
              .replace(
                /\/$/,
                ''
              )
          )

          .replaceAll(
            '{gameSlug}',
            game.id
          )
    )

    .map(
      (url) =>
        absoluteUrl(
          url,
          store.homepage
        )
    )

    .filter(
      Boolean
    );

  return [
    ...new Set(
      [
        ...directUrls,
        ...discovered,
        ...fromTemplates
      ]

        .map(
          (url) =>
            absoluteUrl(
              url,
              store.homepage
            )
        )

        .filter(
          Boolean
        )
    )
  ].slice(
    0,
    10
  );
}

function getPageSignals(
  html
) {
  const titles =
    extractTagTexts(
      html,
      [
        'title'
      ]
    );

  const headings =
    extractTagTexts(
      html,
      [
        'h1',
        'h2'
      ]
    );

  const meta =
    extractMetaContent(
      html,
      [
        'og:title',
        'twitter:title',
        'description',
        'og:description'
      ]
    );

  const lines =
    htmlToLines(
      html
    );

  return {
    titleText:
      titles.join(
        ' '
      ),

    headingText:
      headings.join(
        ' '
      ),

    metaText:
      meta.join(
        ' '
      ),

    bodyText:
      lines
        .slice(
          0,
          1200
        )
        .join(
          ' '
        )
  };
}

function homepageLikeUrl(
  urlValue,
  homepage
) {
  try {
    const url =
      new URL(
        urlValue
      );

    const home =
      new URL(
        homepage
      );

    const cleanPath =
      (value) =>
        String(
          value ||
          ''
        )
          .replace(
            /\/+$/,
            ''
          )
          .replace(
            /^\/+/,
            ''
          );

    return (
      url.origin ===
        home.origin &&
      cleanPath(
        url.pathname
      ) ===
        cleanPath(
          home.pathname
        )
    );
  } catch {
    return false;
  }
}

function strongIdentityMatches(
  text,
  game
) {
  return gameIdentityCandidates(
    game
  )

    .filter(
      isStrongIdentity
    )

    .filter(
      (identity) =>
        containsPhrase(
          text,
          identity
        )
    );
}

function shortIdentityMatches(
  text,
  game
) {
  return gameIdentityCandidates(
    game
  )

    .filter(
      (identity) =>
        !isStrongIdentity(
          identity
        )
    )

    .filter(
      (identity) =>
        containsPhrase(
          text,
          identity
        )
    );
}

function pageHasTargetUnitEvidence(
  text,
  game
) {
  const unitAliases =
    uniqueNormalized(
      game?.unitAliases ||
      []
    );

  return unitAliases.some(
    (unit) =>
      containsPhrase(
        text,
        unit
      )
  );
}

function findCompetingStructuredGame(
  text,
  targetGame
) {
  let best =
    null;

  for (
    const otherGame of
    GAMES ||
    []
  ) {
    if (
      !otherGame ||
      otherGame.id ===
        targetGame.id
    ) {
      continue;
    }

    const matches =
      strongIdentityMatches(
        text,
        otherGame
      );

    if (
      !matches.length
    ) {
      continue;
    }

    const longest =
      matches
        .map(
          (match) =>
            match
              .replace(
                /\s+/g,
                ''
              )
              .length
        )
        .sort(
          (a, b) =>
            b -
            a
        )[0];

    if (
      !best ||
      longest >
        best.strength
    ) {
      best = {
        game:
          otherGame,

        strength:
          longest
      };
    }
  }

  return best;
}

function validatePageForGame(
  html,
  finalUrl,
  homepage,
  game
) {
  const signals =
    getPageSignals(
      html
    );

  const urlText =
    normalizeText(
      finalUrl
    );

  const titleMatches =
    strongIdentityMatches(
      signals.titleText,
      game
    );

  const headingMatches =
    strongIdentityMatches(
      signals.headingText,
      game
    );

  const metaMatches =
    strongIdentityMatches(
      signals.metaText,
      game
    );

  const urlMatches =
    strongIdentityMatches(
      urlText,
      game
    );

  const shortTitleMatches =
    shortIdentityMatches(
      signals.titleText,
      game
    );

  const shortHeadingMatches =
    shortIdentityMatches(
      signals.headingText,
      game
    );

  const canonicalIdentities =
    gameIdentityCandidates(
      game
    )
      .filter(
        isStrongIdentity
      );

  let bodyOccurrences =
    0;

  for (
    const identity of
    canonicalIdentities
  ) {
    bodyOccurrences =
      Math.max(
        bodyOccurrences,

        countPhrase(
          signals.bodyText,
          identity
        )
      );
  }

  const unitEvidence =
    pageHasTargetUnitEvidence(
      `${signals.headingText} ${signals.metaText} ${signals.bodyText}`,
      game
    );

  const competingTitle =
    findCompetingStructuredGame(
      `${signals.titleText} ${signals.headingText}`,
      game
    );

  let contentScore =
    0;

  let urlScore =
    0;

  if (
    titleMatches.length
  ) {
    contentScore +=
      120;
  }

  if (
    headingMatches.length
  ) {
    contentScore +=
      110;
  }

  if (
    metaMatches.length
  ) {
    contentScore +=
      75;
  }

  if (
    shortTitleMatches.length
  ) {
    contentScore +=
      35;
  }

  if (
    shortHeadingMatches.length
  ) {
    contentScore +=
      30;
  }

  if (
    bodyOccurrences >=
    3
  ) {
    contentScore +=
      70;
  } else if (
    bodyOccurrences ===
    2
  ) {
    contentScore +=
      55;
  } else if (
    bodyOccurrences ===
    1
  ) {
    contentScore +=
      25;
  }

  if (
    unitEvidence
  ) {
    contentScore +=
      20;
  }

  if (
    urlMatches.length
  ) {
    urlScore +=
      100;
  }

  if (
    competingTitle &&
    !titleMatches.length &&
    !headingMatches.length
  ) {
    return {
      ok:
        false,

      score:
        contentScore +
        urlScore,

      reason:
        `halaman terdeteksi sebagai ${competingTitle.game.name}`,

      signals
    };
  }

  if (
    homepageLikeUrl(
      finalUrl,
      homepage
    ) &&
    !titleMatches.length &&
    !headingMatches.length
  ) {
    return {
      ok:
        false,

      score:
        contentScore +
        urlScore,

      reason:
        'URL mengarah kembali ke homepage/katalog umum',

      signals
    };
  }

  const hasStructuredIdentity =
    titleMatches.length >
      0 ||
    headingMatches.length >
      0 ||
    metaMatches.length >
      0;

  const hasRepeatedBodyIdentity =
    bodyOccurrences >=
      2 &&
    unitEvidence;

  const ok =
    hasStructuredIdentity ||
    hasRepeatedBodyIdentity;

  return {
    ok,

    score:
      contentScore +
      urlScore,

    reason:
      ok
        ? 'halaman cocok dengan game'
        : 'konten halaman tidak cukup membuktikan game yang dicari',

    signals
  };
}

function containsExplicitGameName(
  text,
  game
) {
  return gameIdentityCandidates(
    game
  )

    .filter(
      isStrongIdentity
    )

    .some(
      (identity) =>
        containsPhrase(
          text,
          identity
        )
    );
}

function containsOtherGameName(
  text,
  targetGame
) {
  for (
    const otherGame of
    GAMES ||
    []
  ) {
    if (
      !otherGame ||
      otherGame.id ===
        targetGame.id
    ) {
      continue;
    }

    if (
      containsExplicitGameName(
        text,
        otherGame
      )
    ) {
      return true;
    }
  }

  return false;
}

function namedPackageMatchesGame(
  name,
  game
) {
  const text =
    normalizeText(
      name
    );

  if (
    /\bwelkin\b|blessing of the welkin moon/.test(
      text
    )
  ) {
    return (
      game.id ===
      'genshin-impact'
    );
  }

  if (
    /weekly diamond pass|\bwdp\b|starlight|twilight pass/.test(
      text
    )
  ) {
    return (
      game.id ===
      'mobile-legends'
    );
  }

  if (
    /royale pass/.test(
      text
    )
  ) {
    return (
      game.id ===
      'pubg-mobile'
    );
  }

  if (
    /honor pass/.test(
      text
    )
  ) {
    return (
      game.id ===
      'honor-of-kings'
    );
  }

  if (
    /express supply pass/.test(
      text
    )
  ) {
    return (
      game.id ===
      'honkai-star-rail'
    );
  }

  if (
    /inter knot membership/.test(
      text
    )
  ) {
    return (
      game.id ===
      'zenless-zone-zero'
    );
  }

  if (
    /coronomicon monthly(?: package)?|^special data$|^zero data$/.test(
      text
    )
  ) {
    return (
      game.id ===
      'chaos-zero-nightmare'
    );
  }

  /*
   * Wuthering Waves
   *
   * $5 akan menjadi angka biasa
   * setelah normalizeText().
   */
  if (
    /lunite subscription/.test(
      text
    )
  ) {
    return (
      game.id ===
      'wuthering-waves'
    );
  }

  return /\b(?:weekly|monthly|membership|member|subscription|battle pass|coupon pass|elite bundle|epic bundle|card)\b/.test(
    text
  );
}

function offerMatchesGame(
  offer,
  game
) {
  const name =
    String(
      offer?.originalName ||
      ''
    )
      .trim();

  if (!name) {
    return false;
  }

  if (
    containsExplicitGameName(
      name,
      game
    )
  ) {
    return true;
  }

  if (
    containsOtherGameName(
      name,
      game
    )
  ) {
    return false;
  }

  const unitAliases =
    uniqueNormalized(
      game?.unitAliases ||
      []
    );

  if (
    unitAliases.some(
      (unit) =>
        containsPhrase(
          name,
          unit
        )
    )
  ) {
    return true;
  }

  if (
    namedPackageMatchesGame(
      name,
      game
    )
  ) {
    return true;
  }

  return (
    unitAliases.length ===
    0
  );
}

function parseOffers(
  html,
  finalUrl,
  store,
  game
) {
  const context = {
    purchaseUrl:
      finalUrl,

    storeId:
      store.id,

    storeName:
      store.name,

    gameId:
      game.id,

    source:
      'live'
  };

  const lineOffers =
    extractOffersFromLines(
      htmlToLines(
        html
      ),

      {
        ...context,

        maxDistance:
          4
      }
    );

  const jsonOffers =
    extractJsonScriptOffers(
      html,
      context
    );

  return dedupeOffers([
    ...lineOffers,
    ...jsonOffers
  ])

    .filter(
      (offer) =>
        offerMatchesGame(
          offer,
          game
        )
    )

    .slice(
      0,
      150
    );
}

function createUniversalAdapter(
  store
) {
  return {
    id:
      store.id,

    name:
      store.name,

    category:
      store.category,

    verification:
      store.verification,

    async fetchOffers(
      game,
      options = {}
    ) {
      if (
        !store.homepage
      ) {
        throw new Error(
          'URL toko belum dikonfigurasi'
        );
      }

      const timeoutMs =
        Number(
          options.timeoutMs ||
          6500
        );

      let homepageHtml =
        '';

      let homepageError =
        null;

      try {
        const homepage =
          await fetchText(
            store.homepage,

            {
              timeoutMs:
                Math.min(
                  timeoutMs,
                  3500
                )
            }
          );

        homepageHtml =
          homepage.text;
      } catch (
        error
      ) {
        homepageError =
          error;
      }

      const candidates =
        makeCandidateUrls(
          store,
          game,
          homepageHtml
        );

      const maxPages =
        Math.max(
          1,

          Math.min(
            3,

            Number(
              process.env
                .MAX_PAGE_PROBES_PER_STORE ||
              2
            )
          )
        );

      const errors =
        [];

      for (
        const url of
        candidates.slice(
          0,
          maxPages
        )
      ) {
        try {
          const page =
            await fetchText(
              url,

              {
                timeoutMs
              }
            );

          const finalUrl =
            page.finalUrl ||
            url;

          const validation =
            validatePageForGame(
              page.text,
              finalUrl,
              store.homepage,
              game
            );

          if (
            !validation.ok
          ) {
            errors.push(
              `halaman tidak cocok: ${validation.reason}`
            );

            continue;
          }

          const offers =
            parseOffers(
              page.text,
              finalUrl,
              store,
              game
            );

          if (
            offers.length
          ) {
            return offers;
          }

          errors.push(
            'halaman game cocok, tetapi harga/produk yang sesuai tidak ditemukan'
          );
        } catch (
          error
        ) {
          errors.push(
            error.message
          );
        }
      }

      if (
        !candidates.length &&
        homepageError
      ) {
        throw homepageError;
      }

      const reason =
        errors[0] ||
        homepageError?.message ||
        'halaman game tidak ditemukan';

      if (
        store.verification !==
        'verified'
      ) {
        throw new Error(
          `Kandidat toko belum menghasilkan harga (${reason})`
        );
      }

      throw new Error(
        reason
      );
    }
  };
}

module.exports = {
  createUniversalAdapter,
  extractLinks,
  linkScore,
  makeCandidateUrls,
  validatePageForGame,
  offerMatchesGame
};
