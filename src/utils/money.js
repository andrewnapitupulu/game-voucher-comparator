'use strict';

function parseIdrToken(value) {
  let text = String(value || '').trim().replace(/\s+/g, '');
  if (!text) return null;

  // Format Indonesia: 1.234.567 atau 1.234.567,00
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d{2})?$/.test(text)) {
    text = text.replace(/\./g, '').replace(/,\d{2}$/, '');
    const parsed = Number(text);
    return Number.isFinite(parsed) ? Math.round(parsed) : null;
  }

  // Format internasional: 1,234,567 atau 1,234,567.00
  if (/^\d{1,3}(?:,\d{3})+(?:\.\d{2})?$/.test(text)) {
    text = text.replace(/,/g, '').replace(/\.\d{2}$/, '');
    const parsed = Number(text);
    return Number.isFinite(parsed) ? Math.round(parsed) : null;
  }

  // Contoh 1000.00 atau 1000,00
  if (/^\d+[.,]\d{2}$/.test(text)) {
    const parsed = Number(text.replace(',', '.'));
    return Number.isFinite(parsed) ? Math.round(parsed) : null;
  }

  const digits = text.replace(/\D/g, '');
  if (!digits) return null;

  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseRupiah(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value);
  }

  const text = String(value || '')
    .replace(/\u00a0/g, ' ')
    .trim();

  if (!text) return null;

  // Contoh:
  // Rp 1.000
  // Rp.848
  // IDR 25000
  const prefixed = text.match(
    /(?:\bIDR\b|\bRp\.?)\s*[:=\-]?\s*([0-9][0-9.,]*)/i
  );

  if (prefixed) {
    return parseIdrToken(prefixed[1]);
  }

  // Contoh:
  // 1.000 IDR
  // 1000 Rupiah
  const suffixed = text.match(
    /([0-9][0-9.,]*)\s*(?:\bIDR\b|\bRupiah\b)/i
  );

  if (suffixed) {
    return parseIdrToken(suffixed[1]);
  }

  // Hanya izinkan angka polos jika SELURUH value memang angka.
  // Ini diperlukan untuk field JSON seperti price: 1000.
  if (/^[0-9][0-9.,]*$/.test(text)) {
    return parseIdrToken(text);
  }

  // Jangan mengambil angka sembarang dari nama produk.
  // "5 Diamonds" tidak boleh menjadi Rp5.
  return null;
}

function formatRupiah(value) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

module.exports = {
  parseRupiah,
  formatRupiah,
  parseIdrToken
};
