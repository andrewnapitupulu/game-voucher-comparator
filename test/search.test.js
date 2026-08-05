'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.ENABLE_PUBLIC_PAGE_ADAPTERS = 'false';
process.env.ALLOW_DEMO_FALLBACK = 'true';

const { searchPrices } = require('../src/services/search-service');

test('MLBB dikenali dan menghasilkan paket tanpa database/cache', async () => {
  const result = await searchPrices('MLBB');
  assert.equal(result.ok, true);
  assert.equal(result.game.id, 'mobile-legends');
  assert.equal(result.noDatabase, true);
  assert.equal(result.noCache, true);
  assert.ok(result.packageCount > 0);
  assert.ok(result.groups.every((group) => group.offers[0].finalPrice <= group.offers.at(-1).finalPrice));
});
