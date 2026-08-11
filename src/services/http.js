'use strict';

class HttpError extends Error {
  constructor(
    message,
    details = {}
  ) {
    super(
      message
    );

    this.name =
      'HttpError';

    this.code =
      details.code ||
      'HTTP_ERROR';

    this.status =
      details.status ??
      null;

    this.url =
      details.url ||
      null;

    this.finalUrl =
      details.finalUrl ||
      null;

    this.contentType =
      details.contentType ||
      '';

    this.retryAfter =
      details.retryAfter ||
      null;

    this.timeoutMs =
      details.timeoutMs ??
      null;

    this.cause =
      details.cause;
  }
}

function codeFromStatus(
  status
) {
  /*
   * Website menerima request,
   * tetapi menolak akses.
   */
  if (
    status === 401 ||
    status === 403 ||
    status === 451
  ) {
    return 'ACCESS_BLOCKED';
  }

  /*
   * Candidate URL memang
   * tidak ditemukan.
   */
  if (
    status === 404 ||
    status === 410
  ) {
    return 'PAGE_NOT_FOUND';
  }

  /*
   * Upstream timeout.
   */
  if (
    status === 408 ||
    status === 504
  ) {
    return 'TIMEOUT';
  }

  /*
   * Terlalu banyak request.
   */
  if (
    status === 429
  ) {
    return 'RATE_LIMITED';
  }

  /*
   * Error server toko.
   */
  if (
    status >= 500
  ) {
    return 'UPSTREAM_ERROR';
  }

  return 'HTTP_ERROR';
}

async function fetchText(
  url,
  {
    timeoutMs = 6500,
    headers = {}
  } = {}
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
            /*
             * Tetap gunakan identitas
             * request aplikasi secara
             * transparan.
             *
             * Kita tidak mencoba
             * menyamarkan request
             * sebagai browser pengguna.
             */
            'user-agent':
              'Mozilla/5.0 (compatible; GamePriceComparator/1.0; +https://vercel.app)',

            accept:
              'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',

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

    /*
     * Jangan langsung melempar
     * Error biasa.
     *
     * Simpan status HTTP supaya
     * search-service dapat membedakan
     * 403, 404, 429, 500, dll.
     */
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
            )
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
        response.status
    };
  } catch (
    error
  ) {
    /*
     * HttpError yang sudah kita
     * bentuk di atas jangan diubah.
     */
    if (
      error instanceof
      HttpError
    ) {
      throw error;
    }

    /*
     * AbortController timeout.
     */
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

          cause:
            error
        }
      );
    }

    /*
     * DNS, socket, connection reset,
     * fetch failed, dan network error
     * lainnya.
     */
    throw new HttpError(
      error?.message ||
        'Gagal menghubungi server toko',

      {
        code:
          'NETWORK_ERROR',

        url:
          String(
            url
          ),

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

module.exports = {
  fetchText,
  HttpError,
  codeFromStatus
};
