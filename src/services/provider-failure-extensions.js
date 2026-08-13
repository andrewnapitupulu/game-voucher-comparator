'use strict';

const EXTENDED_PROVIDER_STATUS_VERSION =
  '2026-08-13-provider-status-v2';

function classifyExtendedProviderFailure(
  error,
  {
    httpStatus = null
  } = {}
) {
  const code =
    String(
      error?.code ||
      ''
    )
      .toUpperCase();

  const reason =
    String(
      error?.parserReason ||
      code ||
      ''
    )
      .toUpperCase();

  if (
    code ===
    'REGION_UNAVAILABLE'
  ) {
    return {
      statusCode:
        'REGION_UNAVAILABLE',

      detailCode:
        reason ||
        'REGION_UNAVAILABLE',

      httpStatus,

      retryable:
        false,

      message:
        'REGION UNAVAILABLE · Halaman Indonesia dialihkan ke region lain; harga non-IDR tidak digunakan'
    };
  }

  if (
    code ===
    'DYNAMIC_PRICE_REQUIRED'
  ) {
    return {
      statusCode:
        'DYNAMIC_PRICE_REQUIRED',

      detailCode:
        reason ||
        'DYNAMIC_PRICE_REQUIRED',

      httpStatus,

      retryable:
        false,

      message:
        error?.message ||
        'DYNAMIC PRICE · Produk ditemukan, tetapi harga baru tersedia setelah interaksi/state halaman'
    };
  }

  if (
    code ===
    'PRODUCT_UNAVAILABLE'
  ) {
    return {
      statusCode:
        'PRODUCT_UNAVAILABLE',

      detailCode:
        reason ||
        'PRODUCT_UNAVAILABLE',

      httpStatus,

      retryable:
        false,

      message:
        error?.message ||
        'PRODUCT UNAVAILABLE · Produk/game sedang tidak tersedia pada toko'
    };
  }

  if (
    code ===
    'MAINTENANCE'
  ) {
    return {
      statusCode:
        'MAINTENANCE',

      detailCode:
        reason ||
        'PRODUCT_MAINTENANCE',

      httpStatus,

      retryable:
        false,

      message:
        error?.message ||
        'MAINTENANCE · Produk sedang dinonaktifkan sementara oleh toko'
    };
  }

  return null;
}

module.exports = {
  EXTENDED_PROVIDER_STATUS_VERSION,

  classifyExtendedProviderFailure
};
