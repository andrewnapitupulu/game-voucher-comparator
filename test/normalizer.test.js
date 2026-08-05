'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { canonicalizeOffer, groupOffers } = require('../src/services/normalizer');

function offer(storeId, name, price) {
  return {
    id: `${storeId}-${name}`,
    storeId,
    storeName: storeId,
    gameId: 'mobile-legends',
    originalName: name,
    finalPrice: price,
    productPrice: price,
    source: 'live'
  };
}

test('menyamakan format diamond base + bonus', () => {
  const a = canonicalizeOffer(offer('a', '85 Diamonds (77 + 8 Bonus)', 22000));
  const b = canonicalizeOffer(offer('b', '77 Diamonds + 8 Bonus', 23000));
  assert.equal(a.totalAmount, 85);
  assert.equal(b.totalAmount, 85);
  assert.equal(a.canonicalKey, b.canonicalKey);
});

test('memisahkan Weekly Diamond Pass dari diamond reguler', () => {
  const pass = canonicalizeOffer(offer('a', 'Weekly Diamond Pass', 29000));
  const diamond = canonicalizeOffer(offer('b', '85 Diamonds', 23000));
  assert.equal(pass.packageType, 'weekly-pass');
  assert.notEqual(pass.canonicalKey, diamond.canonicalKey);
});

test('mengurutkan toko termurah dalam grup yang sama', () => {
  const groups = groupOffers([
    offer('mahal', '85 Diamonds', 25000),
    offer('murah', '77 Diamonds + 8 Bonus', 22000)
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].offers[0].storeId, 'murah');
  assert.equal(groups[0].savings, 3000);
});
