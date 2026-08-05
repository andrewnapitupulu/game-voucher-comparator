'use strict';

const { fetchText } = require('../services/http');
const {
  htmlToLines,
  extractOffersFromLines,
  extractJsonScriptOffers,
  dedupeOffers,
  decodeEntities
} = require('../utils/html');
const { normalizeText } = require('../config/games');

const COMMON_TEMPLATES = [
  '{homepage}/{gameSlug}',
  '{homepage}/games/{gameSlug}',
  '{homepage}/topup/{gameSlug}',
  '{homepage}/top-up/{gameSlug}',
  '{homepage}/game/{gameSlug}',
  '{homepage}/product/{gameSlug}'
];

function absoluteUrl(value, baseUrl) {
  try {
    const url = new URL(String(value || ''), baseUrl);
    if (!/^https?:$/.test(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function stripTags(value) {
  return decodeEntities(String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function extractLinks(html, baseUrl) {
  const links = [];
  const regex = /<a\b[^>]*href\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of String(html || '').matchAll(regex)) {
    const href = absoluteUrl(match[1] || match[2] || match[3], baseUrl);
    if (!href) continue;
    links.push({ href, text: stripTags(match[4]) });
  }
  return links;
}

function linkScore(link, game, homepage) {
  const haystack = normalizeText(`${link.text} ${link.href}`);
  const candidates = [game.id, game.name, game.shortName, ...(game.aliases || [])].map(normalizeText);
  let score = 0;

  for (const candidate of candidates) {
    if (!candidate) continue;
    if (haystack.includes(candidate)) score = Math.max(score, 100 + candidate.length);
    const compactCandidate = candidate.replace(/\s+/g, '');
    const compactHaystack = haystack.replace(/\s+/g, '');
    if (compactCandidate.length >= 3 && compactHaystack.includes(compactCandidate)) score = Math.max(score, 92 + compactCandidate.length);
  }

  if (/mobile.?legend|mlbb/.test(haystack) && game.id === 'mobile-legends') score += 25;
  if (/free.?fire|garena.?ff/.test(haystack) && game.id === 'free-fire') score += 25;
  if (/pubg.?mobile|pubgm/.test(haystack) && game.id === 'pubg-mobile') score += 25;
  if (/genshin/.test(haystack) && game.id === 'genshin-impact') score += 25;
  if (/valorant/.test(haystack) && game.id === 'valorant') score += 25;

  if (/login|register|berita|news|article|blog|promo|terms|privacy|affiliate|reseller/.test(haystack)) score -= 80;
  try {
    if (new URL(link.href).origin !== new URL(homepage).origin) score -= 70;
  } catch {
    score -= 70;
  }
  return score;
}

function makeCandidateUrls(store, game, homepageHtml) {
  const direct = store.gameUrls?.[game.id];
  const fromTemplates = [...(store.urlTemplates || []), ...COMMON_TEMPLATES]
    .map((template) => String(template)
      .replaceAll('{homepage}', String(store.homepage || '').replace(/\/$/, ''))
      .replaceAll('{gameSlug}', game.id))
    .map((url) => absoluteUrl(url, store.homepage))
    .filter(Boolean);

  const discovered = homepageHtml
    ? extractLinks(homepageHtml, store.homepage)
      .map((link) => ({ ...link, score: linkScore(link, game, store.homepage) }))
      .filter((link) => link.score >= 70)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((link) => link.href)
    : [];

  return [...new Set([direct, ...discovered, ...fromTemplates].filter(Boolean))].slice(0, 4);
}

function parseOffers(html, finalUrl, store, game) {
  const context = {
    purchaseUrl: finalUrl,
    storeId: store.id,
    storeName: store.name,
    gameId: game.id,
    source: 'live'
  };
  const lineOffers = extractOffersFromLines(htmlToLines(html), {
    ...context,
    maxDistance: 8
  });
  const jsonOffers = extractJsonScriptOffers(html, context);
  return dedupeOffers([...lineOffers, ...jsonOffers]).slice(0, 150);
}

function createUniversalAdapter(store) {
  return {
    id: store.id,
    name: store.name,
    category: store.category,
    verification: store.verification,
    async fetchOffers(game, options) {
      if (!store.homepage) throw new Error('URL toko belum dikonfigurasi');

      const timeoutMs = options.timeoutMs;
      let homepageHtml = '';
      let homepageError = null;

      try {
        const homepage = await fetchText(store.homepage, { timeoutMs: Math.min(timeoutMs, 3500) });
        homepageHtml = homepage.text;
      } catch (error) {
        homepageError = error;
      }

      const candidates = makeCandidateUrls(store, game, homepageHtml);
      const maxPages = Math.max(1, Math.min(3, Number(process.env.MAX_PAGE_PROBES_PER_STORE || 2)));
      const errors = [];

      for (const url of candidates.slice(0, maxPages)) {
        try {
          const page = await fetchText(url, { timeoutMs });
          const offers = parseOffers(page.text, page.finalUrl || url, store, game);
          if (offers.length) return offers;
          errors.push('harga tidak ditemukan');
        } catch (error) {
          errors.push(error.message);
        }
      }

      if (!candidates.length && homepageError) throw homepageError;
      if (store.verification !== 'verified') {
        throw new Error(`Kandidat toko belum menghasilkan harga (${errors[0] || homepageError?.message || 'halaman game tidak ditemukan'})`);
      }
      throw new Error(errors[0] || homepageError?.message || 'Halaman game atau harga tidak ditemukan');
    }
  };
}

module.exports = { createUniversalAdapter, extractLinks, linkScore, makeCandidateUrls };
