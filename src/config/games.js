'use strict';

const GAMES = [
  {
    id: 'mobile-legends',
    name: 'Mobile Legends: Bang Bang',
    shortName: 'Mobile Legends',
    publisher: 'Moonton',
    icon: 'ML',
    aliases: ['mobile legends', 'mobile legend', 'ml', 'mlbb', 'mole', 'moonton ml'],
    unitAliases: ['diamond', 'diamonds'],
    stores: {
      codashop: 'https://www.codashop.com/id-id/mobile-legends',
      unipin: 'https://www.unipin.com/id/mobile-legends',
      lapakgaming: 'https://www.lapakgaming.com/id-id/mobile-legends',
      duniagames: 'https://duniagames.co.id/top-up/item/mobile-legends'
    }
  },
  {
    id: 'free-fire',
    name: 'Free Fire',
    shortName: 'Free Fire',
    publisher: 'Garena',
    icon: 'FF',
    aliases: ['free fire', 'ff', 'garena free fire', 'freefire'],
    unitAliases: ['diamond', 'diamonds'],
    stores: {
      codashop: 'https://www.codashop.com/id-id/free-fire',
      unipin: 'https://www.unipin.com/id/garena/free-fire',
      lapakgaming: 'https://www.lapakgaming.com/id-id/free-fire',
      duniagames: 'https://duniagames.co.id/top-up/item/free-fire'
    }
  },
  {
    id: 'pubg-mobile',
    name: 'PUBG Mobile',
    shortName: 'PUBG Mobile',
    publisher: 'KRAFTON / Tencent',
    icon: 'PM',
    aliases: ['pubg mobile', 'pubgm', 'pubg', 'unknown cash', 'uc pubg'],
    unitAliases: ['uc'],
    stores: {
      codashop: 'https://www.codashop.com/id-id/pubg-mobile-uc-redeem-code',
      unipin: 'https://www.unipin.com/id/pubg-mobile',
      lapakgaming: 'https://www.lapakgaming.com/id-id/pubg-mobile',
      duniagames: 'https://duniagames.co.id/top-up/item/pubg-mobile'
    }
  },
  {
    id: 'genshin-impact',
    name: 'Genshin Impact',
    shortName: 'Genshin Impact',
    publisher: 'HoYoverse',
    icon: 'GI',
    aliases: ['genshin impact', 'genshin', 'gi', 'genesis crystal', 'welkin'],
    unitAliases: ['genesis crystal', 'genesis crystals', 'crystal', 'crystals'],
    stores: {
      codashop: 'https://www.codashop.com/id-id/genshin-impact',
      unipin: 'https://www.unipin.com/id/genshin-impact',
      lapakgaming: 'https://www.lapakgaming.com/id-id/genshin-impact',
      duniagames: 'https://duniagames.co.id/top-up/item/genshin-impact'
    }
  },
  {
    id: 'valorant',
    name: 'VALORANT',
    shortName: 'VALORANT',
    publisher: 'Riot Games',
    icon: 'VA',
    aliases: ['valorant', 'valo', 'valorant points', 'vp valorant'],
    unitAliases: ['vp', 'valorant points', 'points'],
    stores: {
      codashop: 'https://www.codashop.com/id-id/valorant',
      unipin: 'https://www.unipin.com/id/valorant',
      lapakgaming: 'https://www.lapakgaming.com/id-id/valorant',
      duniagames: 'https://duniagames.co.id/top-up/item/valorant'
    }
  }
];

const GAME_BY_ID = Object.fromEntries(GAMES.map((game) => [game.id, game]));

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function scoreGame(game, query) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return 0;

  const candidates = [game.id, game.name, game.shortName, ...game.aliases].map(normalizeText);
  let best = 0;

  for (const candidate of candidates) {
    if (candidate === normalizedQuery) best = Math.max(best, 100);
    else if (candidate.startsWith(normalizedQuery) || normalizedQuery.startsWith(candidate)) best = Math.max(best, 82);
    else if (candidate.includes(normalizedQuery) || normalizedQuery.includes(candidate)) best = Math.max(best, 68);

    const queryTokens = new Set(normalizedQuery.split(' '));
    const candidateTokens = new Set(candidate.split(' '));
    const overlap = [...queryTokens].filter((token) => candidateTokens.has(token)).length;
    if (overlap) {
      const similarity = (overlap / Math.max(queryTokens.size, candidateTokens.size)) * 70;
      best = Math.max(best, similarity);
    }
  }

  return best;
}

function findLocalGame(query) {
  const ranked = GAMES
    .map((game) => ({ game, score: scoreGame(game, query) }))
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.score >= 45 ? ranked[0].game : null;
}

function listGames() {
  return GAMES.map(({ stores, ...game }) => game);
}

module.exports = {
  GAMES,
  GAME_BY_ID,
  findLocalGame,
  listGames,
  normalizeText
};
