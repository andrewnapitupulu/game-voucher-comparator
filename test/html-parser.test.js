'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { htmlToLines, sliceLines, extractOffersFromLines } = require('../src/utils/html');

const codashopFixture = `
<html><body>
<h2>Pilih Nominal Top Up</h2>
<div>5 Diamonds</div><span>Dari</span><div>Rp. 1.423</div><del>Rp. 1.575</del>
<div>12 Diamonds</div><div>(11 + 1 Bonus)</div><span>Dari</span><div>Rp. 3.323</div>
<h2>Pilih pembayaran</h2>
</body></html>`;

test('mengambil harga pertama setelah nama produk', () => {
  const lines = sliceLines(htmlToLines(codashopFixture), [/pilih nominal/i], [/pilih pembayaran/i]);
  const offers = extractOffersFromLines(lines, {
    storeId: 'codashop', storeName: 'Codashop', gameId: 'mobile-legends', purchaseUrl: 'https://example.com'
  });
  assert.equal(offers.length, 2);
  assert.equal(offers[0].productPrice, 1423);
  assert.equal(offers[1].productPrice, 3323);
});
