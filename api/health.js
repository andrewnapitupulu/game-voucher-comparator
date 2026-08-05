'use strict';

const { listGames } = require('../src/config/games');
const { getStoreAdapters } = require('../src/stores');

module.exports = function handler(req, res) {
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store, max-age=0');
  res.statusCode = 200;
  res.end(JSON.stringify({
    ok: true,
    service: 'game-price-comparator-no-db',
    noDatabase: true,
    noCache: true,
    games: listGames(),
    stores: getStoreAdapters().map(({ id, name }) => ({ id, name })),
    timestamp: new Date().toISOString()
  }));
};
