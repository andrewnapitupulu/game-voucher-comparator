'use strict';

const { searchPrices } = require('../src/services/search-service');

function requestUrl(req) {
  return new URL(req.url, 'http://localhost');
}

function getParam(req, name) {
  if (req.query?.[name] !== undefined) return req.query[name];
  return requestUrl(req).searchParams.get(name);
}

module.exports = async function handler(req, res) {
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store, max-age=0');
  res.setHeader('x-content-type-options', 'nosniff');

  if (req.method !== 'GET') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ ok: false, message: 'Method not allowed' }));
  }

  const query = String(getParam(req, 'q') || '').trim().slice(0, 120);
  const offset = Math.max(0, Number(getParam(req, 'offset') || 0));
  const limit = Math.max(1, Math.min(20, Number(getParam(req, 'limit') || process.env.STORES_PER_BATCH || 8)));
  const storeIds = String(getParam(req, 'stores') || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 20);

  if (!query) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ ok: false, message: 'Parameter q wajib diisi.' }));
  }

  try {
    const result = await searchPrices(query, { offset, limit, storeIds });
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
