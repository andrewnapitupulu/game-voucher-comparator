'use strict';

const { searchPrices } = require('../src/services/search-service');

function getQuery(req) {
  if (req.query?.q !== undefined) return req.query.q;
  const url = new URL(req.url, 'http://localhost');
  return url.searchParams.get('q');
}

module.exports = async function handler(req, res) {
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store, max-age=0');
  res.setHeader('x-content-type-options', 'nosniff');

  if (req.method !== 'GET') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ ok: false, message: 'Method not allowed' }));
  }

  const query = String(getQuery(req) || '').trim().slice(0, 120);
  if (!query) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ ok: false, message: 'Parameter q wajib diisi.' }));
  }

  try {
    const result = await searchPrices(query);
    res.statusCode = result.ok ? 200 : 404;
    return res.end(JSON.stringify(result));
  } catch (error) {
    console.error(error);
    res.statusCode = 500;
    return res.end(JSON.stringify({
      ok: false,
      message: 'Terjadi kesalahan saat mengambil harga.',
      detail: process.env.NODE_ENV === 'development' ? error.message : undefined
    }));
  }
};
