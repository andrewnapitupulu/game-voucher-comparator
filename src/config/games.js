'use strict';

const GAMES = [
  {
    id: 'mobile-legends',
    name: 'Mobile Legends: Bang Bang',
    shortName: 'Mobile Legends',
    publisher: 'Moonton',
    icon: 'ML',
    aliases: [
      'mobile legends',
      'mobile legend',
      'ml',
      'mlbb',
      'mole',
      'moonton ml'
    ],
    unitAliases: [
      'diamond',
      'diamonds'
    ],
    stores: {
      codashop:
        'https://www.codashop.com/id-id/mobile-legends',

      unipin:
        'https://www.unipin.com/id/mobile-legends',

      lapakgaming:
        'https://www.lapakgaming.com/id-id/mobile-legends',

      duniagames:
        'https://duniagames.co.id/top-up/item/mobile-legends'
    }
  },

  {
    id: 'free-fire',
    name: 'Free Fire',
    shortName: 'Free Fire',
    publisher: 'Garena',
    icon: 'FF',
    aliases: [
      'free fire',
      'ff',
      'garena free fire',
      'freefire'
    ],
    unitAliases: [
      'diamond',
      'diamonds'
    ],
    stores: {
      codashop:
        'https://www.codashop.com/id-id/free-fire',

      unipin:
        'https://www.unipin.com/id/garena/free-fire',

      lapakgaming:
        'https://www.lapakgaming.com/id-id/free-fire',

      duniagames:
        'https://duniagames.co.id/top-up/item/free-fire'
    }
  },

  {
    id: 'pubg-mobile',
    name: 'PUBG Mobile',
    shortName: 'PUBG Mobile',
    publisher: 'KRAFTON / Tencent',
    icon: 'PM',
    aliases: [
      'pubg mobile',
      'pubgm',
      'pubg',
      'unknown cash',
      'uc pubg'
    ],
    unitAliases: [
      'uc'
    ],
    stores: {
      codashop:
        'https://www.codashop.com/id-id/pubg-mobile-uc-redeem-code',

      unipin:
        'https://www.unipin.com/id/pubg-mobile',

      lapakgaming:
        'https://www.lapakgaming.com/id-id/pubg-mobile',

      duniagames:
        'https://duniagames.co.id/top-up/item/pubg-mobile'
    }
  },

  {
    id: 'genshin-impact',
    name: 'Genshin Impact',
    shortName: 'Genshin Impact',
    publisher: 'HoYoverse',
    icon: 'GI',
    aliases: [
      'genshin impact',
      'genshin',
      'gi',
      'genesis crystal',
      'welkin'
    ],
    unitAliases: [
      'genesis crystal',
      'genesis crystals',
      'crystal',
      'crystals'
    ],
    stores: {
      codashop:
        'https://www.codashop.com/id-id/genshin-impact',

      unipin:
        'https://www.unipin.com/id/genshin-impact',

      lapakgaming:
        'https://www.lapakgaming.com/id-id/genshin-impact',

      duniagames:
        'https://duniagames.co.id/top-up/item/genshin-impact'
    }
  },

  {
    id: 'valorant',
    name: 'VALORANT',
    shortName: 'VALORANT',
    publisher: 'Riot Games',
    icon: 'VA',
    aliases: [
      'valorant',
      'valo',
      'valorant points',
      'vp valorant'
    ],
    unitAliases: [
      'vp',
      'valorant points',
      'points'
    ],
    stores: {
      codashop:
        'https://www.codashop.com/id-id/valorant',

      unipin:
        'https://www.unipin.com/id/valorant',

      lapakgaming:
        'https://www.lapakgaming.com/id-id/valorant',

      duniagames:
        'https://duniagames.co.id/top-up/item/valorant'
    }
  },

  {
    id: 'crystal-of-atlan',
    name: 'Crystal of Atlan',
    shortName: 'Crystal of Atlan',
    publisher: 'Nuverse',
    icon: 'CA',
    aliases: [
      'crystal of atlan',
      'crystal atlan',
      'coa',
      'atlan',
      'coa opal',
      'opal crystal of atlan'
    ],
    unitAliases: [
      'opal',
      'opals',
      'voucher',
      'vouchers'
    ],
    stores: {
      lapakgaming:
        'https://www.lapakgaming.com/id-id/crystal-of-atlan'
    }
  },

  {
    id: 'honor-of-kings',
    name: 'Honor of Kings',
    shortName: 'Honor of Kings',
    publisher:
      'TiMi Studio Group / Level Infinite',
    icon: 'HK',
    aliases: [
      'honor of kings',
      'honour of kings',
      'hok',
      'hok global',
      'honor kings'
    ],
    unitAliases: [
      'token',
      'tokens'
    ],
    stores: {
      lapakgaming:
        'https://www.lapakgaming.com/id-id/honor-of-kings'
    }
  },

  {
    id: 'call-of-duty-mobile',
    name: 'Call of Duty: Mobile',
    shortName: 'Call of Duty Mobile',
    publisher: 'Activision',
    icon: 'CM',
    aliases: [
      'call of duty mobile',
      'call of duty: mobile',
      'cod mobile',
      'codm',
      'call duty mobile',
      'codm cp'
    ],
    unitAliases: [
      'cp',
      'cod points',
      'call of duty points'
    ],
    stores: {
      lapakgaming:
        'https://www.lapakgaming.com/id-id/call-of-duty-mobile'
    }
  },

  {
    id: 'rf-online-next',
    name: 'RF ONLINE NEXT',
    shortName: 'RF Online Next',
    publisher: 'Netmarble',
    icon: 'RF',
    aliases: [
      'rf online next',
      'rf next',
      'rfonline next',
      'rf online',
      'rfon'
    ],
    unitAliases: [
      'diamond',
      'diamonds'
    ],
    stores: {
      lapakgaming:
        'https://www.lapakgaming.com/id-id/rf-online-next'
    }
  },

  {
    id: 'ragnarok-the-new-world',
    name: 'Ragnarok: The New World',
    shortName: 'Ragnarok The New World',
    publisher: 'GRAVITY',
    icon: 'RN',
    aliases: [
      'ragnarok the new world',
      'ragnarok: the new world',
      'ragnarok new world',
      'ro the new world',
      'ro new world',
      'rtnw'
    ],
    unitAliases: [
      'starstone',
      'starstones'
    ],
    stores: {
      lapakgaming:
        'https://www.lapakgaming.com/id-id/ragnarok-the-new-world'
    }
  },

  {
    id: 'duet-night-abyss',
    name: 'Duet Night Abyss',
    shortName: 'Duet Night Abyss',
    publisher: 'Pan Studio',
    icon: 'DN',
    aliases: [
      'duet night abyss',
      'dna',
      'duet abyss',
      'duet night',
      'lunar crystal duet night abyss'
    ],
    unitAliases: [
      'lunar crystal',
      'lunar crystals'
    ],
    stores: {
      lapakgaming:
        'https://www.lapakgaming.com/id-id/duet-night-abyss'
    }
  },

  {
    id: 'roblox',
    name: 'Roblox',
    shortName: 'Roblox',
    publisher: 'Roblox Corporation',
    icon: 'RB',
    aliases: [
      'roblox',
      'robux',
      'roblox robux',
      'roblox gift card'
    ],
    unitAliases: [
      'robux'
    ],
    stores: {
      lapakgaming:
        'https://www.lapakgaming.com/id-id/roblox'
    }
  },

  {
    id: 'neverness-to-everness',
    name: 'Neverness to Everness',
    shortName: 'Neverness to Everness',
    publisher:
      'Hotta Studio / Perfect World Games',
    icon: 'NE',
    aliases: [
      'neverness to everness',
      'nte',
      'n2e',
      'neverness everness',
      'riftcrystal',
      'riftcrystals'
    ],
    unitAliases: [
      'riftcrystal',
      'riftcrystals'
    ],
    stores: {}
  },

  {
    id: 'arknights-endfield',
    name: 'Arknights: Endfield',
    shortName: 'Arknights Endfield',
    publisher:
      'Hypergryph / Gryphline',
    icon: 'AE',
    aliases: [
      'arknights endfield',
      'arknights: endfield',
      'endfield',

      /*
       * Typo "Enfield" tetap didukung.
       */
      'arknights enfield',
      'arknights: enfield',
      'enfield',

      'origeometry'
    ],
    unitAliases: [
      'origeometry'
    ],
    stores: {
      lapakgaming:
        'https://www.lapakgaming.com/id-id/arknights-endfield'
    }
  },

  /*
   * ======================================================
   * ZENLESS ZONE ZERO
   * ======================================================
   */
  {
    id: 'zenless-zone-zero',
    name: 'Zenless Zone Zero',
    shortName: 'Zenless Zone Zero',
    publisher: 'HoYoverse',
    icon: 'ZZ',
    aliases: [
      'zenless zone zero',
      'zenless',
      'zzz',
      'zenless zone',
      'monochrome',
      'inter knot membership',
      'inter-knot membership'
    ],
    unitAliases: [
      'monochrome'
    ],
    stores: {
      lapakgaming:
        'https://www.lapakgaming.com/id-id/zenless-zone-zero'
    }
  },

  /*
   * ======================================================
   * HONKAI STAR RAIL
   * ======================================================
   */
  {
    id: 'honkai-star-rail',
    name: 'Honkai: Star Rail',
    shortName: 'Honkai Star Rail',
    publisher: 'HoYoverse',
    icon: 'HS',
    aliases: [
      'honkai star rail',
      'honkai: star rail',
      'star rail',
      'hsr',
      'oneiric shard',
      'oneiric shards',
      'express supply pass'
    ],
    unitAliases: [
      'oneiric shard',
      'oneiric shards'
    ],
    stores: {
      lapakgaming:
        'https://www.lapakgaming.com/id-id/honkai-star-rail'
    }
  },

  /*
   * ======================================================
   * CHAOS ZERO NIGHTMARE
   * ======================================================
   */
  {
    id: 'chaos-zero-nightmare',
    name: 'Chaos Zero Nightmare',
    shortName: 'Chaos Zero Nightmare',
    publisher: 'Smilegate',
    icon: 'CZ',
    aliases: [
      'chaos zero nightmare',
      'chaos zero',
      'czn',
      'chaos nightmare',
      'coronomicon monthly package',
      'special data',
      'zero data'
    ],
    unitAliases: [
      'crystal',
      'crystals'
    ],
    stores: {
      lapakgaming:
        'https://www.lapakgaming.com/id-id/chaos-zero-nightmare-login'
    }
  }
];

const GAME_BY_ID =
  Object.fromEntries(
    GAMES.map(
      (game) => [
        game.id,
        game
      ]
    )
  );

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(
      /[^a-z0-9]+/g,
      ' '
    )
    .trim();
}

function scoreGame(
  game,
  query
) {
  const normalizedQuery =
    normalizeText(query);

  if (!normalizedQuery) {
    return 0;
  }

  const candidates = [
    game.id,
    game.name,
    game.shortName,
    ...game.aliases
  ].map(
    normalizeText
  );

  let best = 0;

  for (
    const candidate of
    candidates
  ) {
    if (
      candidate ===
      normalizedQuery
    ) {
      best =
        Math.max(
          best,
          100
        );
    } else if (
      candidate.startsWith(
        normalizedQuery
      ) ||
      normalizedQuery.startsWith(
        candidate
      )
    ) {
      best =
        Math.max(
          best,
          82
        );
    } else if (
      candidate.includes(
        normalizedQuery
      ) ||
      normalizedQuery.includes(
        candidate
      )
    ) {
      best =
        Math.max(
          best,
          68
        );
    }

    const queryTokens =
      new Set(
        normalizedQuery.split(
          ' '
        )
      );

    const candidateTokens =
      new Set(
        candidate.split(
          ' '
        )
      );

    const overlap =
      [...queryTokens]
        .filter(
          (token) =>
            candidateTokens.has(
              token
            )
        )
        .length;

    if (overlap) {
      const similarity =
        (
          overlap /
          Math.max(
            queryTokens.size,
            candidateTokens.size
          )
        ) * 70;

      best =
        Math.max(
          best,
          similarity
        );
    }
  }

  return best;
}

function findLocalGame(query) {
  const ranked =
    GAMES
      .map(
        (game) => ({
          game,
          score:
            scoreGame(
              game,
              query
            )
        })
      )
      .sort(
        (a, b) =>
          b.score -
          a.score
      );

  return (
    ranked[0]?.score >= 45
      ? ranked[0].game
      : null
  );
}

function listGames() {
  return GAMES.map(
    ({
      stores,
      ...game
    }) => game
  );
}

module.exports = {
  GAMES,
  GAME_BY_ID,
  findLocalGame,
  listGames,
  normalizeText
};
