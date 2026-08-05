'use strict';

const { fetchText } = require('../services/http');
const {
  htmlToLines,
  sliceLines,
  extractOffersFromLines,
  extractJsonScriptOffers,
  dedupeOffers
} = require('../utils/html');

async function fetchPageOffers({
  game,
  storeId,
  storeName,
  timeoutMs,
  startPatterns,
  endPatterns,
  maxDistance = 8,
  lineTransform
}) {
  const purchaseUrl = game.stores[storeId];
  if (!purchaseUrl) throw new Error('URL toko belum dikonfigurasi');

  const { text: html, finalUrl } = await fetchText(purchaseUrl, { timeoutMs });
  const allLines = htmlToLines(html);
  const sliced = sliceLines(allLines, startPatterns, endPatterns);
  const lines = typeof lineTransform === 'function' ? lineTransform(sliced) : sliced;

  const lineOffers = extractOffersFromLines(lines, {
    maxDistance,
    purchaseUrl: finalUrl || purchaseUrl,
    storeId,
    storeName,
    gameId: game.id,
    source: 'live'
  });

  const jsonOffers = extractJsonScriptOffers(html, {
    purchaseUrl: finalUrl || purchaseUrl,
    storeId,
    storeName,
    gameId: game.id
  });

  const offers = dedupeOffers([...lineOffers, ...jsonOffers]);
  if (!offers.length) throw new Error('Harga tidak ditemukan pada halaman publik');
  return offers;
}

module.exports = { fetchPageOffers };
