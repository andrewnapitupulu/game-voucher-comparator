'use strict';

const { findLocalGame, GAME_BY_ID } = require('../config/games');
const { STORE_BY_ID } = require('../config/stores');
const { resolveGameWithAi } = require('./ai-game-resolver');
const { groupOffers } = require('./normalizer');
const { makeFallbackOffers } = require('../data/fallback-offers');
const { getStoreAdapters, getStoreAdapterCount } = require('../stores');

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

async function searchPrices(query, options = {}) {
  const startedAt = Date.now();
  const timeoutMs = Math.max(1500, Math.min(10000, Number(process.env.STORE_TIMEOUT_MS || 4200)));
  const allowFallback = envBoolean('ALLOW_DEMO_FALLBACK', false);
  const offset = Math.max(0, Number(options.offset) || 0);
  const limit = Math.max(1, Math.min(20, Number(options.limit) || 8));
  const storeIds = Array.isArray(options.storeIds) ? options.storeIds : [];
  const { game, resolver } = await resolveGame(query);

  if (!game) {
    return {
      ok: false,
      code: 'GAME_NOT_FOUND',
      message: 'Game belum dikenali. Coba Mobile Legends, Free Fire, PUBG Mobile, Genshin Impact, atau VALORANT.'
    };
  }

  const totalStoreCount = getStoreAdapterCount();
  const adapters = getStoreAdapters({ offset, limit, storeIds });
  const results = await Promise.allSettled(
    adapters.map(async (adapter) => ({
      adapter,
      offers: await adapter.fetchOffers(game, { timeoutMs })
    }))
  );

  const liveOffers = [];
  const providerStatus = results.map((result, index) => {
    const adapter = adapters[index];
    const registry = STORE_BY_ID[adapter.id] || {};
    const common = {
      id: adapter.id,
      name: adapter.name,
      category: adapter.category || registry.category || 'partner',
      verification: adapter.verification || registry.verification || 'feed'
    };

    if (result.status === 'fulfilled') {
      liveOffers.push(...result.value.offers);
      return {
        ...common,
        ok: true,
        mode: 'live',
        count: result.value.offers.length,
        message: `${result.value.offers.length} harga live ditemukan`
      };
    }

    return {
      ...common,
      ok: false,
      mode: 'error',
      count: 0,
      message: result.reason?.message || 'Gagal mengambil harga'
    };
  });

  let offers = liveOffers;
  let fallbackUsed = false;

  if (allowFallback) {
    const fallbackCatalog = makeFallbackOffers(game);
    const selectedStoreIds = adapters.length
      ? new Set(adapters.map((adapter) => adapter.id))
      : new Set(fallbackCatalog.map((offer) => offer.storeId));
    const successfulStoreIds = new Set(liveOffers.map((offer) => offer.storeId));
    const fallbackForFailedStores = fallbackCatalog.filter(
      (offer) => selectedStoreIds.has(offer.storeId) && !successfulStoreIds.has(offer.storeId)
    );
    if (fallbackForFailedStores.length) {
      offers = [...liveOffers, ...fallbackForFailedStores];
      fallbackUsed = true;
    }
  }

  const groups = groupOffers(offers);
  const cheapestOverall = groups[0] || null;
  const nextOffset = storeIds.length ? null : offset + adapters.length;

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
    checkedStoreCount: adapters.length,
    totalStoreCount,
    batch: {
      offset,
      limit,
      nextOffset,
      hasMore: nextOffset !== null && nextOffset < totalStoreCount
    },
    cheapestOverall,
    providerStatus,
    groups,
    notice: 'Harga diambil real-time per batch tanpa database dan cache. Biaya admin, promo bersyarat, dan harga checkout dapat berbeda.'
  };
}

module.exports = { searchPrices, resolveGame };
