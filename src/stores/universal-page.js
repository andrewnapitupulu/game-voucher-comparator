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

/*
 * Template URL umum yang akan dicoba
 * apabila toko tidak mempunyai URL
 * game yang sudah dikonfigurasi.
 */
const COMMON_TEMPLATES = [
  '{homepage}/{gameSlug}',
  '{homepage}/games/{gameSlug}',
  '{homepage}/topup/{gameSlug}',
  '{homepage}/top-up/{gameSlug}',
  '{homepage}/game/{gameSlug}',
  '{homepage}/product/{gameSlug}'
];

/*
 * Link seperti login, berita, promo,
 * privacy, dll tidak boleh dianggap
 * sebagai halaman game.
 */
const BAD_LINK_PATTERN =
  /\b(?:login|register|daftar|masuk|berita|news|article|artikel|blog|promo|promosi|terms|privacy|affiliate|reseller|karir|career|contact|kontak|about|tentang)\b/i;

/*
 * ============================================================
 * URL UTILITIES
 * ============================================================
 */

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

/*
 * ============================================================
 * LINK DISCOVERY
 * ============================================================
 */

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

/*
 * Menghapus kandidat duplikat
 * setelah dinormalisasi.
 */
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
 * Semua identitas yang bisa digunakan
 * untuk mengenali sebuah game.
 *
 * Contoh Mobile Legends:
 *
 * mobile legends
 * mobile legends bang bang
 * mlbb
 * dsb.
 */
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

/*
 * Alias dianggap strong apabila:
 *
 * - terdiri dari >= 2 kata
 * - atau panjang compact >= 4
 *
 * Ini penting supaya alias sangat
 * pendek seperti:
 *
 * ml
 * ff
 * gi
 *
 * tidak menyebabkan false positive.
 */
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

/*
 * Exact phrase matching berdasarkan
 * token boundary.
 *
 * Tidak sekadar:
 *
 * text.includes("ml")
 *
 * karena itu mudah salah match.
 */
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

  if (
    !normalizedPhrase
  ) {
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

/*
 * ============================================================
 * HTML SIGNAL EXTRACTION
 * ============================================================
 */

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

/*
 * ============================================================
 * LINK SCORING
 * ============================================================
 */

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

    /*
     * Link text lebih dipercaya
     * daripada URL.
     */
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

    /*
     * Match URL.
     */
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

    /*
     * Support slug compact seperti:
     *
     * mobilelegends
     * callofdutymobile
     *
     * tetapi hanya untuk identity
     * yang cukup kuat.
     */
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

  /*
   * Hindari halaman yang jelas-jelas
   * bukan halaman game.
   */
  if (
    BAD_LINK_PATTERN.test(
      `${text} ${href}`
    )
  ) {
    score -=
      100;
  }

  /*
   * Prioritaskan link dalam domain
   * toko yang sama.
   */
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
 * ============================================================
 * CANDIDATE URL BUILDER
 * ============================================================
 */

function makeCandidateUrls(
  store,
  game,
  homepageHtml
) {
  /*
   * URL explicit mempunyai
   * prioritas tertinggi.
   */
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

  /*
   * Cari link game dari homepage.
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

          /*
           * Threshold diperketat.
           */
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
            4
          )

          .map(
            (link) =>
              link.href
          )

      : [];

  /*
   * Tebakan URL berdasarkan template.
   *
   * Ini merupakan fallback terakhir,
   * bukan bukti bahwa page benar.
   */
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
            ).replace(
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

  /*
   * Urutan:
   *
   * 1. Explicit URL
   * 2. Discovered URL
   * 3. Guessed/template URL
   */
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

/*
 * ============================================================
 * PAGE VALIDATION
 * ============================================================
 */

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

    /*
     * Batasi agar tidak perlu
     * menganalisis HTML sangat besar.
     */
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

/*
 * Mengecek apakah final URL ternyata
 * kembali ke homepage.
 *
 * Banyak website memakai soft-404:
 *
 * /honor-of-kings
 *
 * HTTP 200
 *
 * tetapi ternyata homepage.
 */
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

/*
 * Cek apakah halaman memiliki
 * currency/unit yang sesuai game.
 *
 * Contoh:
 *
 * HOK      -> Tokens
 * Roblox   -> Robux
 * CODM     -> CP
 * CoA      -> Opals
 * Endfield -> Origeometry
 */
function pageHasTargetUnitEvidence(
  text,
  game
) {
  const unitAliases =
    uniqueNormalized(
      game?.unitAliases ||
      []
    );

  if (
    !unitAliases.length
  ) {
    return false;
  }

  return unitAliases.some(
    (unit) =>
      containsPhrase(
        text,
        unit
      )
  );
}

/*
 * Mendeteksi apakah title/H1
 * justru menunjukkan game lain.
 *
 * Contoh user mencari:
 *
 * Honor of Kings
 *
 * tetapi page title:
 *
 * "Mobile Legends Top Up Murah"
 *
 * Maka page langsung ditolak.
 */
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
          (
            a,
            b
          ) =>
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

/*
 * Ini merupakan validasi utama.
 *
 * Candidate URL TIDAK langsung
 * dipercaya hanya karena HTTP 200.
 *
 * Page harus membuktikan bahwa
 * memang page game yang dicari.
 */
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

  /*
   * Strong identity dari:
   *
   * title
   * H1/H2
   * meta
   * URL
   */
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

  /*
   * Alias pendek tidak dijadikan
   * bukti utama.
   */
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

  /*
   * Hitung berapa kali nama game
   * ditemukan di body.
   */
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

  /*
   * Cek title/H1 apakah justru
   * menunjukkan game lain.
   */
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

  /*
   * CASE:
   *
   * Search Honor of Kings
   *
   * URL:
   * /honor-of-kings
   *
   * tetapi title/H1:
   * Mobile Legends
   *
   * => reject.
   */
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

  /*
   * Kalau URL ternyata kembali
   * ke homepage/katalog umum,
   * jangan parse produknya.
   */
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

  /*
   * URL yang terlihat benar saja
   * TIDAK CUKUP.
   *
   * Ini inti perbaikan bug.
   *
   * Banyak toko memiliki:
   *
   * /honor-of-kings
   *
   * tetapi mengembalikan homepage
   * dengan HTTP 200.
   *
   * Maka kita tetap membutuhkan
   * bukti dari CONTENT.
   */
  const hasStructuredIdentity =
    titleMatches.length >
      0 ||
    headingMatches.length >
      0 ||
    metaMatches.length >
      0;

  /*
   * Untuk website yang title-nya
   * generik, masih boleh lolos jika:
   *
   * nama game muncul >= 2 kali
   * DAN
   * unit/currency game ditemukan.
   */
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

/*
 * ============================================================
 * PRODUCT VALIDATION
 * ============================================================
 */

/*
 * Apakah nama produk secara eksplisit
 * menyebut game tertentu?
 */
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

/*
 * Tolak produk yang secara eksplisit
 * menyebut game lain.
 *
 * Contoh search:
 *
 * Honor of Kings
 *
 * produk hasil parser:
 *
 * Mobile Legends 86 Diamonds
 *
 * => reject.
 */
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

/*
 * Beberapa produk tidak menggunakan
 * nominal currency.
 *
 * Contoh:
 *
 * Weekly Diamond Pass
 * Welkin Moon
 * Starlight Membership
 * Honor Pass
 */
function namedPackageMatchesGame(
  name,
  game
) {
  const text =
    normalizeText(
      name
    );

  /*
   * Genshin-specific.
   */
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

  /*
   * Mobile Legends-specific.
   */
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

  /*
   * PUBG-specific.
   */
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

  /*
   * Honor of Kings-specific.
   */
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

  /*
   * Paket generik masih boleh diterima
   * karena page-nya sendiri sudah
   * terlebih dahulu tervalidasi.
   */
  return /\b(?:weekly|monthly|membership|member|battle pass|coupon pass|elite bundle|epic bundle|card)\b/.test(
    text
  );
}

/*
 * Validasi produk terhadap game.
 *
 * Ini merupakan lapisan kedua setelah
 * page validation.
 */
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

  /*
   * Kalau nama produk jelas menyebut
   * game target, terima.
   */
  if (
    containsExplicitGameName(
      name,
      game
    )
  ) {
    return true;
  }

  /*
   * Kalau nama produk jelas menyebut
   * game berbeda, reject.
   */
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

  /*
   * Currency harus cocok dengan
   * currency game.
   *
   * Contoh:
   *
   * Honor of Kings:
   * 80 Tokens        -> PASS
   * 5 Diamonds       -> REJECT
   *
   * Roblox:
   * 400 Robux        -> PASS
   * 100 UC           -> REJECT
   *
   * COD Mobile:
   * 80 CP            -> PASS
   * 86 Diamonds      -> REJECT
   */
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

  /*
   * Named package.
   */
  if (
    namedPackageMatchesGame(
      name,
      game
    )
  ) {
    return true;
  }

  /*
   * Jika game belum mempunyai
   * unitAliases, jangan otomatis
   * membuang semua hasil.
   *
   * Tetapi game yang sudah punya
   * unitAliases harus strict.
   */
  return (
    unitAliases.length ===
    0
  );
}

/*
 * ============================================================
 * OFFER PARSER
 * ============================================================
 */

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

  /*
   * maxDistance dikembalikan ke 4.
   *
   * Jangan menggunakan 8 karena
   * berpotensi mengambil harga
   * dari card/produk berikutnya.
   */
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

  /*
   * Validasi setiap produk lagi
   * sebelum dikembalikan ke service.
   */
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

/*
 * ============================================================
 * UNIVERSAL STORE ADAPTER
 * ============================================================
 */

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

      /*
       * Ambil homepage untuk
       * menemukan link game.
       */
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

      /*
       * Tetap batasi request
       * per toko agar Vercel
       * tidak timeout.
       */
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

          /*
           * =================================================
           * FIX UTAMA
           * =================================================
           *
           * Jangan langsung parse harga.
           *
           * Pastikan page benar-benar
           * merupakan game yang dicari.
           */
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

          /*
           * Baru setelah page lolos
           * validasi, parse produknya.
           */
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

/*
 * ============================================================
 * EXPORT
 * ============================================================
 */

module.exports = {
  createUniversalAdapter,
  extractLinks,
  linkScore,
  makeCandidateUrls,

  /*
   * Diexport juga supaya mudah
   * dibuat unit test.
   */
  validatePageForGame,
  offerMatchesGame
};
