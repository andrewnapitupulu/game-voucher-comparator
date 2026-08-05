'use strict';

async function fetchText(url, { timeoutMs = 6500, headers = {} } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; GamePriceComparator/1.0; +https://vercel.app)',
        'accept': 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
        'accept-language': 'id-ID,id;q=0.9,en;q=0.7',
        ...headers
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();
    return { text, contentType, finalUrl: response.url, status: response.status };
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`Timeout setelah ${timeoutMs} ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { fetchText };
