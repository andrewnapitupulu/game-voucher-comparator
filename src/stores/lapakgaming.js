'use strict';

const { fetchPageOffers } = require('./base-page-adapter');

module.exports = {
  id: 'lapakgaming',
  name: 'Lapakgaming',
  async fetchOffers(game, options) {
    return fetchPageOffers({
      game,
      storeId: 'lapakgaming',
      storeName: 'Lapakgaming',
      timeoutMs: options.timeoutMs,
      startPatterns: [/daftar harga top up/i, /pilih nominal/i],
      endPatterns: [/metode pembayaran/i, /sekilas mengenai/i, /masukkan detail akun/i],
      maxDistance: 5
    });
  }
};
