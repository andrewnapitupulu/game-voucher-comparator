'use strict';

const { fetchText } = require('../services/http');
const { parseRupiah } = require('../utils/money');

function parseFeeds() {
  try {
    const parsed = JSON.parse(process.env.PROVIDER_FEEDS_JSON || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function makeGenericAdapters() {
  return parseFeeds().map((feed, index) => ({
    id: String(feed.id || `partner-${index + 1}`),
    name: String(feed.name || `Partner ${index + 1}`),
    async fetchOffers(game, options) {
      const url = String(feed.url || '').replaceAll('{gameSlug}', game.id);
      if (!url) throw new Error('URL feed belum diatur');

      const { text } = await fetchText(url, {
        timeoutMs: options.timeoutMs,
        headers: feed.authorization ? { authorization: String(feed.authorization) } : {}
      });

      let payload;
      try {
        payload = JSON.parse(text);
      } catch {
        throw new Error('Respons feed bukan JSON valid');
      }

      const rows = Array.isArray(payload)
        ? payload
        : Array.isArray(payload.products)
          ? payload.products
          : Array.isArray(payload.data)
            ? payload.data
            : [];

      const checkedAt = new Date().toISOString();
      const offers = rows.map((row, rowIndex) => {
        const name = row.name || row.productName || row.title || row.denomination;
        const price = parseRupiah(row.finalPrice ?? row.price ?? row.sellingPrice ?? row.amount);
        if (!name || !price || price <= 0) return null;

        return {
          id: `${feed.id || index}-${game.id}-${rowIndex + 1}`,
          storeId: String(feed.id || `partner-${index + 1}`),
          storeName: String(feed.name || `Partner ${index + 1}`),
          gameId: game.id,
          originalName: String(name),
          productPrice: price,
          finalPrice: price,
          feeStatus: row.feeStatus || 'unknown',
          purchaseUrl: row.url || row.purchaseUrl || feed.purchaseBaseUrl || url,
          source: 'live',
          checkedAt
        };
      }).filter(Boolean);

      if (!offers.length) throw new Error('Feed tidak mengembalikan produk');
      return offers;
    }
  }));
}

module.exports = { makeGenericAdapters };
