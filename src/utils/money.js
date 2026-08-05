'use strict';

function parseRupiah(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  const text = String(value || '');
  const match = text.match(/(?:rp\.?\s*)?([\d.,]+)/i);
  if (!match) return null;
  const digits = match[1].replace(/\D/g, '');
  if (!digits) return null;
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatRupiah(value) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

module.exports = { parseRupiah, formatRupiah };
