'use strict';

const { findLocalGame, GAME_BY_ID } = require('../config/games');
const { resolveGameWithAi } = require('./ai-game-resolver');
const { groupOffers } = require('./normalizer');
const { makeFallbackOffers } = require('../data/fallback-offers');
const { getStoreAdapters } = require('../stores');

function envBoolean(name, fallback) {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return String(value).toLowerCase() === 'true';
}

async function resolveGame(query) {
  const exactById = GAME_BY_ID[String(query || '').toLowerCase()];
  if (exactById) return { game: exactById, resolver: 'id' };

  const local = findLocalGame(query);
  if (local) return { game: local, resolver: 'local' };

  const ai = await resolveGameWithAi(query);
  if (ai) return { game: ai, resolver: 'ai' };

  return { game: null, resolver: 'none' };
}

async function searchPrices(query) {
  const startedAt = Date.now();
  const timeoutMs = Math.max(1500, Math.min(15000, Number(process.env.STORE_TIMEOUT_MS || 6500)));
  const allowFallback = envBoolean('ALLOW_DEMO_FALLBACK', true);
  const { game, resolver } = await resolveGame(query);

  if (!game) {
    return {
      ok: false,
      code: 'GAME_NOT_FOUND',
      message: 'Game belum dikenali. Coba Mobile Legends, Free Fire, PUBG Mobile, Genshin Impact, atau VALORANT.'
    };
  }

  const adapters = getStoreAdapters();
  const results = await Promise.allSettled(
    adapters.map(async (adapter) => ({
      adapter,
      offers: await adapter.fetchOffers(game, { timeoutMs })
    }))
  );

  const liveOffers = [];
  const providerStatus = results.map((result, index) => {
    const adapter = adapters[index];
    if (result.status === 'fulfilled') {
      liveOffers.push(...result.value.offers);
      return {
        id: adapter.id,
        name: adapter.name,
        ok: true,
        mode: 'live',
        count: result.value.offers.length,
        message: `${result.value.offers.length} harga live ditemukan`
      };
    }

    return {
      id: adapter.id,
      name: adapter.name,
      ok: false,
      mode: 'error',
      count: 0,
      message: result.reason?.message || 'Gagal mengambil harga'
    };
  });

  let offers = liveOffers;
  let fallbackUsed = false;

  if (allowFallback) {
    const successfulStoreIds = new Set(liveOffers.map((offer) => offer.storeId));
    const fallbackForFailedStores = makeFallbackOffers(game).filter((offer) => !successfulStoreIds.has(offer.storeId));
    if (fallbackForFailedStores.length) {
      offers = [...liveOffers, ...fallbackForFailedStores];
      fallbackUsed = true;
    }
  }

  const groups = groupOffers(offers);
  const cheapestOverall = groups[0] || null;

  return {
    ok: true,
    query,
    resolver,
    game: {
      id: game.id,
      name: game.name,
      shortName: game.shortName,
      publisher: game.publisher,
      icon: game.icon
    },
    noDatabase: true,
    noCache: true,
    fetchedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    fallbackUsed,
    liveOfferCount: liveOffers.length,
    offerCount: offers.length,
    packageCount: groups.length,
    storeCount: new Set(offers.map((offer) => offer.storeId)).size,
    cheapestOverall,
    providerStatus,
    groups,
    notice: 'Harga adalah harga yang terbaca dari halaman/feed sumber. Biaya admin dan promo bersyarat dapat berbeda saat checkout.'
  };
}

module.exports = { searchPrices, resolveGame };
