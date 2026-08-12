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
  if (
    status === 401 ||
    status === 403 ||
    status === 451
  ) {
    return 'ACCESS_BLOCKED';
  }

  if (
    status === 404 ||
    status === 410
  ) {
    return 'PAGE_NOT_FOUND';
  }

  if (
    status === 408 ||
    status === 504
  ) {
    return 'TIMEOUT';
  }

  if (status === 429) {
    return 'RATE_LIMITED';
  }

  if (status >= 500) {
    return 'UPSTREAM_ERROR';
  }

  return 'HTTP_ERROR';
}

function networkCodeFromError(error) {
  const rawCode = String(
    error?.cause?.code ||
    error?.code ||
    ''
  ).toUpperCase();

  const message = String(
    error?.cause?.message ||
    error?.message ||
    ''
  ).toLowerCase();

  if (
    rawCode === 'ENOTFOUND' ||
    rawCode === 'EAI_AGAIN' ||
    /getaddrinfo|dns/.test(message)
  ) {
    return 'NETWORK_DNS_ERROR';
  }

  if (
    rawCode === 'ECONNRESET' ||
    rawCode === 'ECONNREFUSED' ||
    rawCode === 'EPIPE' ||
    rawCode === 'UND_ERR_SOCKET' ||
    /connection reset|socket|econnreset|econnrefused/.test(message)
  ) {
    return 'NETWORK_CONNECTION_ERROR';
  }

  if (
    rawCode.startsWith('CERT_') ||
    rawCode.startsWith('ERR_TLS_') ||
    rawCode === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
    rawCode === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
    /certificate|tls|ssl/.test(message)
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
  const code = String(
    error?.code ||
    ''
  ).toUpperCase();

  const status = Number(
    error?.status
  );

  if (
    code === 'NETWORK_DNS_ERROR' ||
    code === 'NETWORK_CONNECTION_ERROR' ||
    code === 'NETWORK_CONNECT_TIMEOUT' ||
    code === 'NETWORK_FETCH_FAILED' ||
    code === 'TIMEOUT' ||
    code === 'RATE_LIMITED'
  ) {
    return true;
  }

  return (
    status === 502 ||
    status === 503 ||
    status === 504
  );
}

function retryDelay(
  error,
  baseDelayMs
) {
  const retryAfter = Number(
    error?.retryAfter
  );

  if (
    Number.isFinite(
      retryAfter
    ) &&
    retryAfter > 0
  ) {
    return Math.min(
      1500,
      retryAfter * 1000
    );
  }

  return Math.max(
    100,
    Math.min(
      1000,
      Number(baseDelayMs) || 300
    )
  );
}

function sleep(ms) {
  return new Promise(
    (resolve) =>
      setTimeout(
        resolve,
        ms
      )
  );
}

async function fetchOnce(
  url,
  {
    timeoutMs,
    headers,
    attempt
  }
) {
  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      timeoutMs
    );

  try {
    const response =
      await fetch(
        url,
        {
          redirect:
            'follow',

          signal:
            controller.signal,

          headers: {
            'user-agent':
              'Mozilla/5.0 (compatible; GamePriceComparator/1.0; +https://vercel.app)',

            accept:
              'text/html,application/xhtml+xml,application/json;q=0.9,application/xml;q=0.8,text/xml;q=0.8,*/*;q=0.7',

            'accept-language':
              'id-ID,id;q=0.9,en;q=0.7',

            ...headers
          }
        }
      );

    const contentType =
      response.headers.get(
        'content-type'
      ) ||
      '';

    const finalUrl =
      response.url ||
      String(
        url
      );

    if (
      !response.ok
    ) {
      throw new HttpError(
        `HTTP ${response.status}`,
        {
          code:
            codeFromStatus(
              response.status
            ),

          status:
            response.status,

          url:
            String(
              url
            ),

          finalUrl,
          contentType,

          retryAfter:
            response.headers.get(
              'retry-after'
            ),

          attempts:
            attempt
        }
      );
    }

    const text =
      await response.text();

    return {
      text,
      contentType,
      finalUrl,

      status:
        response.status,

      attempts:
        attempt
    };
  } catch (
    error
  ) {
    if (
      error instanceof
      HttpError
    ) {
      throw error;
    }

    if (
      error?.name ===
      'AbortError'
    ) {
      throw new HttpError(
        `Timeout setelah ${timeoutMs} ms`,
        {
          code:
            'TIMEOUT',

          url:
            String(
              url
            ),

          timeoutMs,
          attempts:
            attempt,

          cause:
            error
        }
      );
    }

    const networkCode =
      networkCodeFromError(
        error
      );

    throw new HttpError(
      error?.message ||
      'Gagal menghubungi server toko',
      {
        code:
          networkCode,

        networkCode:
          String(
            error?.cause?.code ||
            error?.code ||
            ''
          ),

        url:
          String(
            url
          ),

        attempts:
          attempt,

        cause:
          error
      }
    );
  } finally {
    clearTimeout(
      timeout
    );
  }
}

async function fetchText(
  url,
  {
    timeoutMs = 6500,
    headers = {},
    retries = 1,
    retryDelayMs = 300
  } = {}
) {
  const safeRetries =
    Math.max(
      0,
      Math.min(
        2,
        Number(
          retries
        ) ||
        0
      )
    );

  let lastError =
    null;

  for (
    let attempt = 1;
    attempt <=
    safeRetries + 1;
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
    } catch (
      error
    ) {
      lastError =
        error;

      if (
        attempt >
          safeRetries ||
        !isRetryableError(
          error
        )
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
