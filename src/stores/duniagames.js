'use strict';

const { fetchPageOffers } = require('./base-page-adapter');

module.exports = {
  id: 'duniagames',
  name: 'Dunia Games',
  async fetchOffers(game, options) {
    return fetchPageOffers({
      game,
      storeId: 'duniagames',
      storeName: 'Dunia Games',
      timeoutMs: options.timeoutMs,
      startPatterns: [/pilih nominal/i, /daftar harga/i, /price/i],
      endPatterns: [/metode pembayaran/i, /cara top up/i, /artikel terkait/i],
      maxDistance: 8
    });
  }
};
