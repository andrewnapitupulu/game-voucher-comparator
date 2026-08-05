'use strict';

const { fetchPageOffers } = require('./base-page-adapter');

module.exports = {
  id: 'codashop',
  name: 'Codashop',
  async fetchOffers(game, options) {
    return fetchPageOffers({
      game,
      storeId: 'codashop',
      storeName: 'Codashop',
      timeoutMs: options.timeoutMs,
      startPatterns: [/pilih nominal/i, /^diamond$/i, /pilih voucher/i],
      endPatterns: [/pilih pembayaran/i, /cara terbaik top up/i, /mengapa memilih/i],
      maxDistance: 7
    });
  }
};
