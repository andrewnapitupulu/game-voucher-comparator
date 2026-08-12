'use strict';

class HttpError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'HttpError';
    this.code = details.code || 'HTTP_ERROR';
    this.status = details.status ?? null;
    this.url = details.url || null;
    this.finalUrl = details.finalUrl || null;
    this.contentType = details.contentType || '';
    this.retryAfter = details.retryAfter || null;
    this.timeoutMs = details.timeoutMs ?? null;
    this.attempts = details.attempts ?? 1;
    this.networkCode = details.networkCode || null;
    this.cause = details.cause;
  }
}

function codeFromStatus(status) {
  if ([401, 403, 451].includes(status)) return 'ACCESS_BLOCKED';
  if ([404, 410].includes(status)) return 'PAGE_NOT_FOUND';
  if ([408, 504].includes(status)) return 'TIMEOUT';
  if (status === 429) return 'RATE_LIMITED';
  if (status >= 500) return 'UPSTREAM_ERROR';
  return 'HTTP_ERROR';
}

function networkCodeFromError(error) {
  const rawCode = String(error?.cause?.code || error?.code || '').toUpperCase();
  const message = String(error?.cause?.message || error?.message || '').toLowerCase();

  if (
    rawCode === 'ENOTFOUND' ||
    rawCode === 'EAI_AGAIN' ||
    /getaddrinfo|\bdns\b/.test(message)
  ) {
    return 'NETWORK_DNS_ERROR';
  }

  if (
    ['ECONNRESET', 'ECONNREFUSED', 'EPIPE', 'UND_ERR_SOCKET'].includes(rawCode) ||
    /connection reset|socket|econnreset|econnrefused/.test(message)
  ) {
    return 'NETWORK_CONNECTION_ERROR';
  }

  if (
    rawCode.startsWith('CERT_') ||
    rawCode.startsWith('ERR_TLS_') ||
    rawCode === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
    rawCode === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
    /certificate|\btls\b|\bssl\b/.test(message)
  ) {
    return 'NETWORK_TLS_ERROR';
  }

  if (
    rawCode === 'ETIMEDOUT' ||
    rawCode === 'UND_ERR_CONNECT_TIMEOUT' ||
    /connect timeout|timed out/.test(message)
  ) {
    return 'NETWORK_CONNECT_TIMEOUT';
  }

  return 'NETWORK_FETCH_FAILED';
}

function isRetryableError(error) {
  const code = String(error?.code || '').toUpperCase();
  const status = Number(error?.status);

  if (
    [
      'NETWORK_DNS_ERROR',
      'NETWORK_CONNECTION_ERROR',
      'NETWORK_CONNECT_TIMEOUT',
      'NETWORK_FETCH_FAILED',
      'TIMEOUT',
      'RATE_LIMITED'
    ].includes(code)
  ) {
    return true;
  }

  return [502, 503, 504].includes(status);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelay(error, baseDelayMs) {
  const retryAfter = Number(error?.retryAfter);

  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(1500, retryAfter * 1000);
  }

  return Math.max(150, Math.min(750, Number(baseDelayMs) || 350));
}

async function fetchOnce(url, { timeoutMs, headers, attempt }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        // Identitas request dibuat eksplisit; tidak menyamarkan request sebagai browser pengguna.
        'user-agent':
          process.env.OUTBOUND_USER_AGENT ||
          'TopUpScout/1.0',

        accept:
          'text/html,application/xhtml+xml,application/json;q=0.9,application/xml;q=0.8,text/xml;q=0.8,*/*;q=0.7',

        'accept-language':
          'id-ID,id;q=0.9,en;q=0.7',

        ...headers
      }
    });

    const contentType =
      response.headers.get('content-type') || '';

    const finalUrl =
      response.url ||
      String(url);

    if (!response.ok) {
      throw new HttpError(
        `HTTP ${response.status}`,
        {
          code:
            codeFromStatus(response.status),

          status:
            response.status,

          url:
            String(url),

          finalUrl,
          contentType,

          retryAfter:
            response.headers.get('retry-after'),

          attempts:
            attempt
        }
      );
    }

    return {
      text:
        await response.text(),

      contentType,
      finalUrl,

      status:
        response.status,

      attempts:
        attempt
    };
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }

    if (error?.name === 'AbortError') {
      throw new HttpError(
        `Timeout setelah ${timeoutMs} ms`,
        {
          code:
            'TIMEOUT',

          url:
            String(url),

          timeoutMs,
          attempts:
            attempt,

          cause:
            error
        }
      );
    }

    const code =
      networkCodeFromError(error);

    throw new HttpError(
      error?.message ||
      'Gagal menghubungi server toko',
      {
        code,

        networkCode:
          String(
            error?.cause?.code ||
            error?.code ||
            ''
          ),

        url:
          String(url),

        attempts:
          attempt,

        cause:
          error
      }
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchText(
  url,
  {
    timeoutMs = 6500,
    headers = {},
    retries = 1,
    retryDelayMs = 350
  } = {}
) {
  /*
   * Hard limit satu retry.
   *
   * Homepage, sitemap, dan guessed URL
   * akan mengirim retries: 0.
   */
  const safeRetries =
    Math.max(
      0,
      Math.min(
        1,
        Number(retries) || 0
      )
    );

  let lastError =
    null;

  for (
    let attempt = 1;
    attempt <= safeRetries + 1;
    attempt += 1
  ) {
    try {
      return await fetchOnce(
        url,
        {
          timeoutMs,
          headers,
          attempt
        }
      );
    } catch (error) {
      lastError =
        error;

      if (
        attempt > safeRetries ||
        !isRetryableError(error)
      ) {
        throw error;
      }

      await sleep(
        retryDelay(
          error,
          retryDelayMs
        )
      );
    }
  }

  throw lastError;
}

module.exports = {
  fetchText,
  HttpError,
  codeFromStatus,
  networkCodeFromError,
  isRetryableError
};
