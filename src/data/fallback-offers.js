'use strict';

const BASE_CATALOG = {
  'mobile-legends': [
    ['5 Diamonds', 1550], ['12 Diamonds (11 + 1 Bonus)', 3600], ['19 Diamonds (17 + 2 Bonus)', 5700],
    ['28 Diamonds (25 + 3 Bonus)', 8200], ['44 Diamonds (40 + 4 Bonus)', 12400], ['59 Diamonds (53 + 6 Bonus)', 16600],
    ['85 Diamonds (77 + 8 Bonus)', 23800], ['170 Diamonds (154 + 16 Bonus)', 47500], ['240 Diamonds (217 + 23 Bonus)', 67000],
    ['296 Diamonds (256 + 40 Bonus)', 82000], ['408 Diamonds (367 + 41 Bonus)', 115000], ['568 Diamonds (503 + 65 Bonus)', 153000],
    ['Weekly Diamond Pass', 29200]
  ],
  'free-fire': [
    ['5 Diamonds', 1000], ['12 Diamonds', 1900], ['50 Diamonds', 7600], ['70 Diamonds', 10100],
    ['140 Diamonds', 19500], ['355 Diamonds', 48000], ['720 Diamonds', 95000], ['Membership Mingguan', 30000]
  ],
  'pubg-mobile': [
    ['60 UC', 19200], ['325 UC', 96000], ['660 UC', 192000], ['1800 UC', 470000], ['3850 UC', 960000]
  ],
  'genshin-impact': [
    ['60 Genesis Crystals', 16000], ['300 + 30 Genesis Crystals', 79000], ['980 + 110 Genesis Crystals', 239000],
    ['1980 + 260 Genesis Crystals', 479000], ['3280 + 600 Genesis Crystals', 799000], ['Blessing of the Welkin Moon', 79000]
  ],
  valorant: [
    ['475 VP', 56000], ['1000 VP', 112000], ['2050 VP', 224000], ['3650 VP', 389000], ['5350 VP', 559000], ['11000 VP', 1099000]
  ]
};

const STORES = [
  { id: 'codashop', name: 'Codashop', multiplier: 0.98 },
  { id: 'unipin', name: 'UniPin', multiplier: 1.015 },
  { id: 'lapakgaming', name: 'Lapakgaming', multiplier: 1 },
  { id: 'duniagames', name: 'Dunia Games', multiplier: 0.995 }
];

function makeFallbackOffers(game) {
  const items = BASE_CATALOG[game.id] || [];
  const checkedAt = new Date().toISOString();
  const offers = [];

  for (const store of STORES) {
    const purchaseUrl = game.stores[store.id];
    if (!purchaseUrl) continue;

    items.forEach(([name, basePrice], index) => {
      const deterministicVariation = 1 + (((index + store.id.length) % 5) - 2) * 0.006;
      const price = Math.max(500, Math.round((basePrice * store.multiplier * deterministicVariation) / 100) * 100);
      offers.push({
        id: `${store.id}-${game.id}-fallback-${index + 1}`,
        storeId: store.id,
        storeName: store.name,
        gameId: game.id,
        originalName: name,
        productPrice: price,
        finalPrice: price,
        feeStatus: 'unknown',
        purchaseUrl,
        source: 'fallback',
        checkedAt
      });
    });
  }

  return offers;
}

module.exports = { makeFallbackOffers };
