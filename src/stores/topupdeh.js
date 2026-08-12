'use strict';

const {
  fetchDedicatedOffers
} = require(
  './dedicated-store-parser'
);

function candidatesFor(
  game
) {
  const slug =
    encodeURIComponent(
      game.id
    );

  return [
    {
      url:
        `https://topupdeh.id/${slug}`,

      mode:
        'page'
    },

    {
      url:
        `https://topupdeh.id/games/${slug}`,

      mode:
        'page'
    },

    {
      url:
        `https://topupdeh.id/game/${slug}`,

      mode:
        'page'
    }
  ];
}

module.exports = {
  id:
    'topupdeh',

  name:
    'TopUpDeh',

  async fetchOffers(
    game,
    options = {}
  ) {
    return fetchDedicatedOffers({
      storeId:
        'topupdeh',

      storeName:
        'TopUpDeh',

      game,
      options,

      candidates:
        candidatesFor(
          game
        ),

      /*
       * TopUpDeh tidak selalu mengirim daftar
       * nominal pada visible server HTML.
       */
      enableDynamicDiscovery:
        true,

      /*
       * Untuk ML jangan menerima satu pasangan
       * dari konten SEO sebagai product list.
       */
      minOffers:
        game.id ===
        'mobile-legends'
          ? 3
          : 1
    });
  }
};
