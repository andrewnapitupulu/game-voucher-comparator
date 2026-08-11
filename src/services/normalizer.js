'use strict';

const {
  normalizeText
} = require(
  '../config/games'
);

const SPECIAL_TYPES = [
  {
    type: 'weekly-pass',
    pattern:
      /weekly\s+diamond\s+pass|weekly\s+pass|wdp/i,
    label:
      'Weekly Diamond Pass'
  },

  {
    type: 'weekly-card-plus',
    pattern:
      /weekly\s+card\s+plus/i,
    label:
      'Weekly Card Plus'
  },

  {
    type: 'weekly-card',
    pattern:
      /weekly\s+card/i,
    label:
      'Weekly Card'
  },

  {
    type: 'welkin',
    pattern:
      /welkin|blessing\s+of\s+the\s+welkin\s+moon/i,
    label:
      'Blessing of the Welkin Moon'
  },

  {
    type: 'starlight',
    pattern:
      /starlight/i,
    label:
      'Starlight Membership'
  },

  {
    type: 'twilight',
    pattern:
      /twilight\s+pass/i,
    label:
      'Twilight Pass'
  },

  {
    type: 'elite-bundle',
    pattern:
      /weekly\s+elite\s+bundle/i,
    label:
      'Weekly Elite Bundle'
  },

  {
    type: 'epic-bundle',
    pattern:
      /monthly\s+epic\s+bundle/i,
    label:
      'Monthly Epic Bundle'
  },

  {
    type: 'battle-pass',
    pattern:
      /battle\s+pass|royale\s+pass|honor\s+pass/i,
    label:
      'Battle Pass'
  },

  {
    type: 'monthly-pass',
    pattern:
      /monthly\s+pass|kafra\s+monthly/i,
    label:
      'Monthly Pass'
  },

  {
    type:
      'express-supply-pass',

    pattern:
      /express\s+supply\s+pass/i,

    label:
      'Express Supply Pass'
  },

  {
    type:
      'inter-knot-membership',

    pattern:
      /inter[-\s]*knot\s+membership/i,

    label:
      'Inter-Knot Membership'
  },

  {
    type:
      'coronomicon-monthly',

    pattern:
      /coronomicon\s+monthly(?:\s+package)?/i,

    label:
      'Coronomicon Monthly Package'
  },

  {
    type:
      'special-data',

    pattern:
      /\bspecial\s+data\b/i,

    label:
      'Special Data'
  },

  {
    type:
      'zero-data',

    pattern:
      /\bzero\s+data\b/i,

    label:
      'Zero Data'
  },

  /*
   * Wuthering Waves
   */
  {
    type:
      'lunite-subscription',

    pattern:
      /lunite\s+subscription/i,

    label:
      'Lunite Subscription'
  },

  {
    type: 'membership',
    pattern:
      /membership|member/i,
    label:
      'Membership'
  }
];

const UNIT_PATTERNS = [
  {
    unit:
      'Lunar Crystals',

    pattern:
      /lunar\s+crystal(?:s)?/i
  },

  {
    unit:
      'Genesis Crystals',

    pattern:
      /genesis\s+crystal(?:s)?/i
  },

  {
    unit:
      'Oneiric Shards',

    pattern:
      /oneiric\s+shard(?:s)?/i
  },

  {
    unit:
      'Riftcrystals',

    pattern:
      /rift\s*crystal(?:s)?|riftcrystal(?:s)?/i
  },

  {
    unit:
      'Origeometry',

    pattern:
      /origeometry/i
  },

  {
    unit:
      'Starstones',

    pattern:
      /starstone(?:s)?/i
  },

  {
    unit:
      'Monochrome',

    pattern:
      /monochrome/i
  },

  /*
   * Wuthering Waves
   */
  {
    unit:
      'Lunites',

    pattern:
      /lunite(?:s)?/i
  },

  {
    unit:
      'Opals',

    pattern:
      /opal(?:s)?/i
  },

  {
    unit:
      'Robux',

    pattern:
      /robux/i
  },

  {
    unit:
      'Diamonds',

    pattern:
      /diamond(?:s)?/i
  },

  {
    unit:
      'UC',

    pattern:
      /\buc\b/i
  },

  {
    unit:
      'CP',

    pattern:
      /\bcp\b|call\s+of\s+duty\s+points?/i
  },

  {
    unit:
      'VP',

    pattern:
      /\bvp\b|valorant\s+points?/i
  },

  {
    unit:
      'Crystals',

    pattern:
      /crystal(?:s)?/i
  },

  {
    unit:
      'Tokens',

    pattern:
      /token(?:s)?/i
  },

  {
    unit:
      'Points',

    pattern:
      /point(?:s)?/i
  },

  {
    unit:
      'Coins',

    pattern:
      /coin(?:s)?/i
  },

  {
    unit:
      'Vouchers',

    pattern:
      /voucher(?:s)?/i
  }
];

const DIRECT_UNIT_PATTERN = [
  'lunar\\s+crystal(?:s)?',
  'genesis\\s+crystal(?:s)?',
  'oneiric\\s+shard(?:s)?',
  'rift\\s*crystal(?:s)?',
  'riftcrystal(?:s)?',
  'origeometry',
  'starstone(?:s)?',
  'monochrome',
  'lunite(?:s)?',
  'opal(?:s)?',
  'robux',
  'diamond(?:s)?',
  'uc',
  'cp',
  'vp',
  'valorant\\s+points?',
  'crystal(?:s)?',
  'token(?:s)?',
  'point(?:s)?',
  'coin(?:s)?',
  'voucher(?:s)?'
].join('|');

function parseMultiplier(name) {
  const match =
    String(name)
      .match(
        /(?:x|×)\s*(\d+)/i
      );

  return match
    ? Math.max(
        1,
        Number(
          match[1]
        )
      )
    : 1;
}

function parseAmounts(name) {
  const value =
    String(
      name ||
      ''
    )
      .replace(
        /,/g,
        '.'
      );

  const parenthetical =
    value.match(
      /\((\d[\d.]*)\s*\+\s*(\d[\d.]*)\s*(?:bonus)?\)/i
    );

  const explicitBonus =
    value.match(
      new RegExp(
        `(\\d[\\d.]*)\\s*(?:${DIRECT_UNIT_PATTERN})?\\s*\\+\\s*(\\d[\\d.]*)\\s*bonus`,
        'i'
      )
    );

  const plusPattern =
    value.match(
      /(?:^|\s)(\d[\d.]*)\s*\+\s*(\d[\d.]*)(?:\s|$)/i
    );

  const match =
    parenthetical ||
    explicitBonus ||
    plusPattern;

  if (match) {
    const base =
      Number(
        match[1]
          .replace(
            /\./g,
            ''
          )
      );

    const bonus =
      Number(
        match[2]
          .replace(
            /\./g,
            ''
          )
      );

    return {
      baseAmount:
        base,

      bonusAmount:
        bonus,

      totalAmount:
        base +
        bonus
    };
  }

  const direct =
    value.match(
      new RegExp(
        `(\\d[\\d.]*)\\s*(?:${DIRECT_UNIT_PATTERN})`,
        'i'
      )
    );

  if (direct) {
    const total =
      Number(
        direct[1]
          .replace(
            /\./g,
            ''
          )
      );

    return {
      baseAmount:
        total,

      bonusAmount:
        0,

      totalAmount:
        total
    };
  }

  return {
    baseAmount:
      null,

    bonusAmount:
      null,

    totalAmount:
      null
  };
}

function detectUnit(name) {
  return (
    UNIT_PATTERNS.find(
      (entry) =>
        entry.pattern.test(
          name
        )
    )?.unit ||
    'Item'
  );
}

function canonicalizeOffer(
  offer
) {
  const name =
    String(
      offer.originalName ||
      ''
    )
      .trim();

  const special =
    SPECIAL_TYPES.find(
      (entry) =>
        entry.pattern.test(
          name
        )
    );

  const multiplier =
    parseMultiplier(
      name
    );

  const amounts =
    parseAmounts(
      name
    );

  const unit =
    detectUnit(
      name
    );

  let packageType =
    special?.type ||
    'currency';

  let canonicalName;
  let canonicalKey;

  if (special) {
    canonicalName =
      multiplier > 1
        ? `${special.label} x${multiplier}`
        : special.label;

    canonicalKey =
      `${packageType}:${multiplier}`;
  } else if (
    amounts.totalAmount
  ) {
    canonicalName =
      `${amounts.totalAmount.toLocaleString('id-ID')} ${unit}`;

    canonicalKey =
      `currency:${unit.toLowerCase()}:${amounts.totalAmount}`;
  } else {
    packageType =
      'other';

    canonicalName =
      name;

    canonicalKey =
      `other:${normalizeText(name)}`;
  }

  const isConditional =
    /first\s*top\s*up|first\s*recharge|pengguna\s*baru|new\s*user|promo/i.test(
      name
    );

  return {
    ...offer,

    packageType,
    canonicalName,
    canonicalKey,
    unit,
    multiplier,

    ...amounts,

    eligibility:
      isConditional
        ? 'conditional'
        : 'all-users'
  };
}

function groupOffers(
  rawOffers
) {
  const normalized =
    rawOffers
      .map(
        canonicalizeOffer
      )
      .filter(
        (offer) =>
          Number.isFinite(
            offer.finalPrice
          ) &&
          offer.finalPrice >
            0
      );

  const groups =
    new Map();

  for (
    const offer of
    normalized
  ) {
    const key =
      `${offer.gameId}|${offer.canonicalKey}`;

    if (
      !groups.has(
        key
      )
    ) {
      groups.set(
        key,
        {
          id:
            key,

          name:
            offer.canonicalName,

          packageType:
            offer.packageType,

          unit:
            offer.unit,

          totalAmount:
            offer.totalAmount,

          offers:
            []
        }
      );
    }

    groups
      .get(
        key
      )
      .offers
      .push(
        offer
      );
  }

  const result =
    [...groups.values()]
      .map(
        (group) => {
          group.offers.sort(
            (a, b) =>
              a.finalPrice -
                b.finalPrice ||
              a.storeName.localeCompare(
                b.storeName,
                'id'
              )
          );

          const cheapest =
            group.offers[0];

          const highest =
            group.offers[
              group.offers.length -
                1
            ];

          return {
            ...group,

            cheapestPrice:
              cheapest.finalPrice,

            cheapestStore:
              cheapest.storeName,

            highestPrice:
              highest.finalPrice,

            savings:
              Math.max(
                0,

                highest.finalPrice -
                  cheapest.finalPrice
              ),

            storeCount:
              new Set(
                group.offers.map(
                  (offer) =>
                    offer.storeId
                )
              ).size,

            hasLivePrice:
              group.offers.some(
                (offer) =>
                  offer.source ===
                  'live'
              )
          };
        }
      );

  return result.sort(
    (a, b) =>
      a.cheapestPrice -
        b.cheapestPrice ||
      String(a.name)
        .localeCompare(
          String(b.name),
          'id'
        )
  );
}

module.exports = {
  canonicalizeOffer,
  groupOffers,
  parseAmounts,
  detectUnit
};
