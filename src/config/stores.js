'use strict';
const STORE_REGISTRY = [
  { id: 'codashop', name: 'Codashop', homepage: 'https://www.codashop.com/id-id', category: 'major', verification: 'verified', urlTemplates: [] },
  { id: 'unipin', name: 'UniPin', homepage: 'https://www.unipin.com/id', category: 'major', verification: 'verified', urlTemplates: [] },
  { id: 'lapakgaming', name: 'Lapakgaming', homepage: 'https://www.lapakgaming.com/id-id', category: 'major', verification: 'verified', urlTemplates: [] },
  { id: 'duniagames', name: 'Dunia Games', homepage: 'https://duniagames.co.id', category: 'major', verification: 'verified', urlTemplates: [] },
  { id: 'gopay-games', name: 'GoPay Games', homepage: 'https://gopay.co.id/games', category: 'major', verification: 'verified', urlTemplates: [] },
  { id: 'kiosgamer', name: 'Kiosgamer', homepage: 'https://kiosgamer.co.id', category: 'major', verification: 'verified', urlTemplates: [] },
  { id: 'upoint', name: 'UPOINT.ID', homepage: 'https://upoint.id', category: 'major', verification: 'verified', urlTemplates: [] },
  { id: 'vocagame', name: 'VocaGame', homepage: 'https://vocagame.com', category: 'major', verification: 'candidate', urlTemplates: [] },
  { id: 'jollymax', name: 'JollyMax', homepage: 'https://www.jollymax.com', category: 'major', verification: 'verified', urlTemplates: [] },
  { id: 'smile-one', name: 'Smile.One', homepage: 'https://www.smile.one', category: 'major', verification: 'verified', urlTemplates: [] },
  { id: 'midasbuy', name: 'Midasbuy', homepage: 'https://www.midasbuy.com/id', category: 'major', verification: 'verified', urlTemplates: [] },
  { id: 'razer-gold', name: 'Razer Gold', homepage: 'https://gold.razer.com', category: 'major', verification: 'verified', urlTemplates: [] },
  { id: 'ggwp-topup', name: 'GGWP Top Up', homepage: 'https://topup.ggwp.id', category: 'major', verification: 'verified', urlTemplates: ['{homepage}/games/{gameSlug}'] },
  { id: 'topup-id', name: 'TOPUP.ID', homepage: 'https://topup.id', category: 'major', verification: 'verified', urlTemplates: ['{homepage}/games/{gameSlug}', '{homepage}/{gameSlug}'] },
  { id: 'saldogame', name: 'SaldoGame', homepage: 'https://saldogame.com', category: 'major', verification: 'candidate', urlTemplates: [] },
  { id: 'diamond-store', name: 'Diamond Store', homepage: 'https://diamondstore.my.id', category: 'retail', verification: 'verified', urlTemplates: ['{homepage}/{gameSlug}', '{homepage}/games/{gameSlug}'] },
  { id: 'ym-store', name: 'YM Store', homepage: 'https://ymstore.id', category: 'retail', verification: 'verified', urlTemplates: [] },
  { id: 'gigames', name: 'Gigames', homepage: 'https://gigames.id', category: 'retail', verification: 'candidate', urlTemplates: [] },
  { id: 'radjatopup', name: 'RadjaTopup', homepage: 'https://radjatopup.com', category: 'retail', verification: 'candidate', urlTemplates: [] },
  { id: 'oura-store', name: 'Oura Store', homepage: 'https://ourastore.com', category: 'retail', verification: 'candidate', urlTemplates: [] },
  { id: 'pasargames', name: 'PasarGames', homepage: 'https://pasargames.id', category: 'retail', verification: 'candidate', urlTemplates: [] },
  { id: 'topupgamestore', name: 'TopupGameStore', homepage: 'https://topupgamestore.id', category: 'retail', verification: 'verified', urlTemplates: ['{homepage}/{gameSlug}', '{homepage}/games/{gameSlug}'] },
  { id: 'kunjastore', name: 'KunjaStore', homepage: 'https://kunjastore.com', category: 'retail', verification: 'candidate', urlTemplates: [] },
  { id: 'itemgame', name: 'ItemGame', homepage: 'https://itemgame.com', category: 'retail', verification: 'candidate', urlTemplates: [] },
  { id: 'tokoneo', name: 'TokoNeo', homepage: 'https://tokoneo.com', category: 'retail', verification: 'candidate', urlTemplates: [] },
  { id: 'menorigaming', name: 'MenoriGaming', homepage: 'https://menorigaming.com', category: 'retail', verification: 'candidate', urlTemplates: [] },
  { id: 'toprush', name: 'Toprush', homepage: 'https://toprush.id', category: 'retail', verification: 'verified', urlTemplates: ['{homepage}/{gameSlug}', '{homepage}/games/{gameSlug}'] },
  { id: 'nexpoint', name: 'Nexpoint', homepage: 'https://nexpoint.id', category: 'retail', verification: 'candidate', urlTemplates: [] },
  { id: 'gamesloot', name: 'GamesLoot', homepage: 'https://gamesloot.com', category: 'retail', verification: 'candidate', urlTemplates: [] },
  { id: 'linktopup', name: 'Linktopup', homepage: 'https://linktopup.com', category: 'retail', verification: 'candidate', urlTemplates: [] },
  { id: 'zenoratopup', name: 'ZenoraTopup', homepage: 'https://zenoratopup.com', category: 'retail', verification: 'candidate', urlTemplates: [] },
  { id: 'maadonly', name: 'Maadonly', homepage: 'https://maadonly.com', category: 'retail', verification: 'verified', urlTemplates: ['{homepage}/{gameSlug}', '{homepage}/games/{gameSlug}'] },
  { id: 'astromoba', name: 'Astromoba', homepage: 'https://astromoba.com', category: 'retail', verification: 'candidate', urlTemplates: [] },
  { id: 'kios-game-indonesia', name: 'Kios Game Indonesia', homepage: 'https://kiosgameindonesia.com', category: 'retail', verification: 'candidate', urlTemplates: [] },
  { id: 'topupdeh', name: 'TopUpDeh', homepage: 'https://topupdeh.com', category: 'retail', verification: 'candidate', urlTemplates: [] },
  { id: 'primatle', name: 'Primatle', homepage: 'https://primatle.com', category: 'retail', verification: 'candidate', urlTemplates: [] },
  { id: 'vogam', name: 'VOGAM', homepage: 'https://vogam.id', category: 'retail', verification: 'verified', urlTemplates: ['{homepage}/{gameSlug}', '{homepage}/games/{gameSlug}'] },
  { id: 'murahgo', name: 'MurahGo', homepage: 'https://murahgo.id', category: 'retail', verification: 'candidate', urlTemplates: [] },
  { id: 'speedcash', name: 'SpeedCash', homepage: 'https://speedcash.co.id', category: 'platform', verification: 'verified', urlTemplates: [] },
  { id: 'mygamemart', name: 'MyGameMart', homepage: 'https://mygamemart.com', category: 'retail', verification: 'candidate', urlTemplates: [] },
  { id: 'makergames', name: 'MakerGames', homepage: 'https://makergames.id', category: 'retail', verification: 'candidate', urlTemplates: [] },
  { id: 'epictopup', name: 'EpicTopup', homepage: 'https://epictopup.id', category: 'retail', verification: 'verified', urlTemplates: ['{homepage}/{gameSlug}'] },
  { id: 'garuda-voucher', name: 'Garuda Voucher', homepage: 'https://garudavoucher.id', category: 'retail', verification: 'candidate', urlTemplates: [] },
  { id: 'rocket-game-store', name: 'Rocket Game Store', homepage: 'https://rocketgamestore.id', category: 'retail', verification: 'candidate', urlTemplates: [] },
  { id: 'itemku', name: 'itemku', homepage: 'https://www.itemku.com', category: 'marketplace', verification: 'verified', urlTemplates: [] },
  { id: 'vcgamers', name: 'VCGamers', homepage: 'https://www.vcgamers.com', category: 'marketplace', verification: 'verified', urlTemplates: [] },
  { id: 'shopee', name: 'Shopee', homepage: 'https://shopee.co.id', category: 'marketplace', verification: 'verified', urlTemplates: [] },
  { id: 'blibli', name: 'Blibli', homepage: 'https://www.blibli.com', category: 'marketplace', verification: 'verified', urlTemplates: [] },
  { id: 'lazada', name: 'Lazada', homepage: 'https://www.lazada.co.id', category: 'marketplace', verification: 'verified', urlTemplates: [] },
  { id: 'nevalis', name: 'Nevalis', homepage: 'https://nevalis.id', category: 'retail', verification: 'verified', urlTemplates: ['{homepage}/{gameSlug}', '{homepage}/topup/{gameSlug}'] },
  { id: 'ditusi', name: 'Ditusi', homepage: 'https://ditusi.co.id', category: 'retail', verification: 'verified', urlTemplates: ['{homepage}/{gameSlug}', '{homepage}/top-up/{gameSlug}'] },
  { id: 'bangjeff', name: 'BangJeff', homepage: 'https://www.bangjeff.com/id-id', category: 'supplier', verification: 'verified', urlTemplates: ['{homepage}/{gameSlug}', '{homepage}/games/{gameSlug}'] },
  { id: 'xcashshop', name: 'Xcashshop', homepage: 'https://xcashshop.com', category: 'retail', verification: 'candidate', urlTemplates: [] },
  { id: 'seagm', name: 'SEAGM', homepage: 'https://www.seagm.com', category: 'major', verification: 'verified', urlTemplates: [] },
  { id: 'topupgame-com', name: 'TopupGame.com', homepage: 'https://topupgame.com', category: 'retail', verification: 'verified', urlTemplates: [] },
  { id: 'fumola-store', name: 'Fumola Store', homepage: 'https://fumolastore.id', category: 'retail', verification: 'verified', urlTemplates: ['{homepage}/topup/{gameSlug}'] },
  { id: 'h2h-id', name: 'H2H.id', homepage: 'https://h2h.id', category: 'supplier', verification: 'verified', urlTemplates: [] },
  { id: 'isiaja', name: 'IsiAja', homepage: 'https://isiaja.id', category: 'retail', verification: 'verified', urlTemplates: [] },
  { id: 'isiulang-id', name: 'Isiulang.id', homepage: 'https://isiulang.id', category: 'retail', verification: 'verified', urlTemplates: [] },
  { id: 'juragan-game', name: 'Juragan Game', homepage: 'https://juragangame.id', category: 'retail', verification: 'candidate', urlTemplates: [] },
  { id: 'neverdie', name: 'Neverdie', homepage: 'https://neverdie.id', category: 'retail', verification: 'candidate', urlTemplates: [] },
  { id: 'x45', name: 'X45', homepage: 'https://x45.co.id', category: 'retail', verification: 'candidate', urlTemplates: [] },
  { id: 'java-game-store', name: 'Java Game Store', homepage: 'https://javagamestore.com', category: 'retail', verification: 'candidate', urlTemplates: [] },
  { id: 'mvstore', name: 'MVStore', homepage: 'https://mvstore.id', category: 'retail', verification: 'candidate', urlTemplates: [] },
  { id: 'bilskytopup', name: 'BilskyTopup', homepage: 'https://bilskytopup.com', category: 'white-label', verification: 'candidate', urlTemplates: [] },
  { id: 'napertopup', name: 'NaperTopup', homepage: 'https://napertopup.com', category: 'white-label', verification: 'verified', urlTemplates: ['{homepage}/games/{gameSlug}-games', '{homepage}/games/{gameSlug}'] },
  { id: 'pojoktopup', name: 'PojokTopup', homepage: 'https://pojoktopup.com', category: 'white-label', verification: 'candidate', urlTemplates: [] },
  { id: 'seringtopup', name: 'SeringTopUp', homepage: 'https://seringtopup.com', category: 'white-label', verification: 'candidate', urlTemplates: [] },
  { id: 'ngetopup', name: 'Ngetopup', homepage: 'https://ngetopup.com', category: 'white-label', verification: 'candidate', urlTemplates: [] },
  { id: 'elaastore', name: 'ElaaStore', homepage: 'https://elaastore.com', category: 'white-label', verification: 'candidate', urlTemplates: [] },
  { id: 'wewestore', name: 'WeweStore', homepage: 'https://wewestore.com', category: 'white-label', verification: 'candidate', urlTemplates: [] },
  { id: 'pg-store', name: 'PG Store', homepage: 'https://pgstore.id', category: 'white-label', verification: 'candidate', urlTemplates: [] },
  { id: 'idgame', name: 'IDGame', homepage: 'https://idgame.id', category: 'white-label', verification: 'candidate', urlTemplates: [] },
  { id: 'deyustore', name: 'Deyustore', homepage: 'https://deyustore.com', category: 'white-label', verification: 'candidate', urlTemplates: [] },
  { id: 'crownstore', name: 'CrownStore', homepage: 'https://crownstore.id', category: 'white-label', verification: 'candidate', urlTemplates: [] },
  { id: 'gachaku', name: 'Gachaku', homepage: 'https://gachaku.com', category: 'white-label', verification: 'candidate', urlTemplates: [] },
  { id: 'yuketsu', name: 'Yuketsu', homepage: 'https://yuketsu.com', category: 'white-label', verification: 'candidate', urlTemplates: [] },
  { id: 'hiddengame', name: 'HiddenGame', homepage: 'https://hiddengame.id', category: 'white-label', verification: 'candidate', urlTemplates: [] },
  { id: 'sektetopup', name: 'SekteTopup', homepage: 'https://sektetopup.com', category: 'white-label', verification: 'candidate', urlTemplates: [] },
  { id: 'pasargamer', name: 'PasarGamer', homepage: 'https://www.pasargamer.com', category: 'white-label', verification: 'verified', urlTemplates: ['{homepage}/{gameSlug}', '{homepage}/games/{gameSlug}'] },
  { id: 'casatopup', name: 'CasaTopup', homepage: 'https://casatopup.com', category: 'white-label', verification: 'candidate', urlTemplates: [] },
  { id: 'topupgamez', name: 'Topupgamez', homepage: 'https://topupgamez.id', category: 'white-label', verification: 'candidate', urlTemplates: [] },
  { id: 'pitopup', name: 'PiTopup', homepage: 'https://pitopup.com', category: 'white-label', verification: 'candidate', urlTemplates: [] },
  { id: 'bxystore', name: 'BXYStore', homepage: 'https://bxystore.com', category: 'white-label', verification: 'candidate', urlTemplates: [] },
  { id: 'pipgamingstore', name: 'PIPGamingStore', homepage: 'https://pipgamingstore.com', category: 'white-label', verification: 'candidate', urlTemplates: [] },
  { id: 'pokecang', name: 'Pokecang', homepage: 'https://pokecang.com', category: 'white-label', verification: 'candidate', urlTemplates: [] },
  { id: 'takapedia', name: 'Takapedia', homepage: 'https://takapedia.com', category: 'white-label', verification: 'verified', urlTemplates: [] },
  { id: 'kingsmlstore', name: 'KingsMLStore', homepage: 'https://kingsmlstore.com', category: 'white-label', verification: 'candidate', urlTemplates: [] },
  { id: 'kinztopup', name: 'KinzTopup', homepage: 'https://kinztopup.com', category: 'white-label', verification: 'candidate', urlTemplates: [] },
  { id: 'sontopup', name: 'Sontopup', homepage: 'https://sontopup.com', category: 'white-label', verification: 'candidate', urlTemplates: [] },
  { id: 'vy-gaming-store', name: 'VY Gaming Store', homepage: 'https://vygamingstore.com', category: 'white-label', verification: 'candidate', urlTemplates: [] },
  { id: 'yoggstore', name: 'Yoggstore', homepage: 'https://yoggstore.com', category: 'white-label', verification: 'candidate', urlTemplates: [] },
  { id: 'gogogo', name: 'Gogogo', homepage: 'https://gogogo.id', category: 'white-label', verification: 'candidate', urlTemplates: [] },
  { id: 'rapidfire', name: 'RapidFire', homepage: 'https://rapidfire.id', category: 'white-label', verification: 'candidate', urlTemplates: [] },
  { id: 'adagames', name: 'AdaGames', homepage: 'https://adagamestore.com', category: 'retail', verification: 'candidate', urlTemplates: [] },
  { id: 'gamestorecan', name: 'GameStoreCan', homepage: 'https://gamestorecan.com', category: 'retail', verification: 'candidate', urlTemplates: [] },
  { id: 'topupnolimit', name: 'TopupNoLimit', homepage: 'https://topupnolimit.com', category: 'retail', verification: 'candidate', urlTemplates: [] },
  { id: 'ibanezblack', name: 'IbanezBlack', homepage: 'https://ibanezblack.com', category: 'retail', verification: 'candidate', urlTemplates: [] },
  { id: 'fmpedia', name: 'FMPedia', homepage: 'https://fmpedia.id', category: 'supplier', verification: 'candidate', urlTemplates: [] },
];

if (STORE_REGISTRY.length !== 99) throw new Error(`Store registry harus berisi 99 toko, saat ini ${STORE_REGISTRY.length}`);

const STORE_BY_ID = Object.fromEntries(STORE_REGISTRY.map((store) => [store.id, store]));

function parseOverrides() {
  try {
    const value = JSON.parse(process.env.STORE_OVERRIDES_JSON || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function listStores() {
  const overrides = parseOverrides();
  const includeCandidates = String(process.env.INCLUDE_CANDIDATE_STORES || 'true').toLowerCase() !== 'false';
  return STORE_REGISTRY
    .filter((store) => includeCandidates || store.verification === 'verified')
    .map((store) => {
      const override = overrides[store.id] || {};
      return {
        ...store,
        ...override,
        gameUrls: { ...(store.gameUrls || {}), ...(override.gameUrls || {}) },
        urlTemplates: Array.isArray(override.urlTemplates) ? override.urlTemplates : store.urlTemplates
      };
    });
}

module.exports = { STORE_REGISTRY, STORE_BY_ID, listStores };
