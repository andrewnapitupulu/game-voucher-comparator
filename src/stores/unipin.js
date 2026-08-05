'use strict';

const { fetchPageOffers } = require('./base-page-adapter');

module.exports = {
  id: 'unipin',
  name: 'UniPin',
  async fetchOffers(game, options) {
    return fetchPageOffers({
      game,
      storeId: 'unipin',
      storeName: 'UniPin',
      timeoutMs: options.timeoutMs,
      startPatterns: [/pilih jumlah/i, /pilih nominal/i],
      endPatterns: [/pilih pembayaran/i, /masukkan email/i, /korporat dan kemitraan/i],
      maxDistance: 10
    });
  }
};
