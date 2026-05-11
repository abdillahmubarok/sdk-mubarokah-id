// ============================================================================
// Mubarokah ID SDK — Custom Error Classes
// ============================================================================

import type { OAuthErrorResponse } from './types.js';

/**
 * Error mapping untuk pesan user-friendly (Bahasa Indonesia).
 */
const USER_FRIENDLY_MESSAGES: Record<string, string> = {
  invalid_request:
    'Permintaan tidak valid. Parameter yang diperlukan tidak lengkap atau salah format.',
  invalid_client:
    'Autentikasi client gagal. Periksa Client ID dan Client Secret Anda.',
  invalid_grant:
    'Kode otorisasi tidak valid, sudah kedaluwarsa, atau sudah digunakan.',
  unauthorized_client:
    'Aplikasi tidak memiliki izin untuk menggunakan grant type ini.',
  unsupported_grant_type:
    'Grant type tidak didukung. Gunakan: authorization_code, refresh_token, atau client_credentials.',
  invalid_scope: 'Scope yang diminta tidak valid atau tidak dikenali.',
  access_denied: 'Anda menolak permintaan otorisasi dari aplikasi ini.',
  unapproved_scope:
    'Aplikasi Anda memerlukan persetujuan admin Mubarokah ID untuk mengakses data ini.',
  insufficient_scope:
    'Access token tidak memiliki scope yang diperlukan. Lakukan login ulang dengan scope yang benar.',
  token_expired: 'Sesi Anda telah kedaluwarsa. Silakan login kembali.',
  invalid_token: 'Access token tidak valid. Silakan login kembali.',
  rate_limit_exceeded:
    'Terlalu banyak permintaan. Silakan coba lagi beberapa saat lagi.',
};

/**
 * Base error class untuk semua error dari Mubarokah ID SDK.
 */
export class MubarokahError extends Error {
  /** Kode error (oauth error code atau `api_error_<status>` untuk error tanpa kode) */
  public readonly code: string;

  /** HTTP status code (jika ada) */
  public readonly statusCode?: number;

  constructor(message: string, code: string = 'sdk_error', statusCode?: number) {
    super(message);
    this.name = 'MubarokahError';
    this.code = code;
    this.statusCode = statusCode;

    // Fix prototype chain untuk instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * Dapatkan pesan user-friendly dalam Bahasa Indonesia.
   */
  getUserFriendlyMessage(): string {
    return USER_FRIENDLY_MESSAGES[this.code] ?? 'Terjadi kesalahan. Silakan coba lagi.';
  }
}

/**
 * Error khusus untuk OAuth flow (authorization, token exchange, refresh).
 */
export class OAuthError extends MubarokahError {
  /** Deskripsi error dari server */
  public readonly errorDescription?: string;

  /** Petunjuk perbaikan dari server */
  public readonly hint?: string;

  constructor(response: OAuthErrorResponse, statusCode?: number) {
    const message =
      response.error_description ?? response.message ?? response.error ?? 'OAuth error';
    super(message, response.error, statusCode);
    this.name = 'OAuthError';
    this.errorDescription = response.error_description;
    this.hint = response.hint;
  }

  /**
   * Apakah error ini bisa di-retry (misal karena race refresh atau server sibuk).
   */
  isRetryable(): boolean {
    return ['token_expired', 'temporarily_unavailable'].includes(this.code);
  }

  /**
   * Apakah error ini mengindikasikan bahwa **user** harus login ulang.
   *
   * Tidak termasuk `invalid_client` karena itu adalah masalah konfigurasi
   * developer (credential salah) — re-login user tidak akan menyelesaikannya.
   * Gunakan {@link OAuthError.isConfigIssue} untuk mendeteksinya.
   */
  requiresReauth(): boolean {
    return [
      'invalid_grant',
      'access_denied',
      'invalid_token',
      'token_expired',
    ].includes(this.code);
  }

  /**
   * Apakah error ini mengindikasikan masalah konfigurasi aplikasi (bukan user).
   *
   * Contoh: Client ID/Secret salah, grant type tidak diizinkan untuk client,
   * dll. Developer harus memperbaiki konfigurasi, bukan mengulang flow user.
   */
  isConfigIssue(): boolean {
    return [
      'invalid_client',
      'unauthorized_client',
      'unsupported_grant_type',
    ].includes(this.code);
  }
}

/**
 * Error khusus untuk panggilan API (endpoint `/api/user`, `/api/user/details`, dll).
 *
 * Membawa `oauthCode` bila server mengirim field `error` bergaya OAuth
 * (mis. `insufficient_scope`, `unapproved_scope`, `token_expired`).
 * Ini penting untuk membedakan dua kondisi 403 yang memerlukan penanganan
 * berbeda:
 *
 * - `insufficient_scope` → developer harus meminta scope yang benar saat
 *   authorization (user reauth dengan scope baru).
 * - `unapproved_scope` → aplikasi belum mendapatkan approval admin;
 *   developer harus menghubungi tim Mubarokah ID. User reauth tidak menolong.
 */
export class ApiError extends MubarokahError {
  /** Response body mentah dari server */
  public readonly responseBody?: unknown;

  /**
   * Kode error OAuth-style dari response body (bila ada).
   *
   * Contoh: `'insufficient_scope'`, `'unapproved_scope'`, `'token_expired'`,
   * `'invalid_token'`, `'rate_limit_exceeded'`.
   */
  public readonly oauthCode?: string;

  /** `retry_after` dalam detik, bila server mengirimkannya (429) */
  public readonly retryAfter?: number;

  constructor(
    message: string,
    statusCode: number,
    responseBody?: unknown,
    oauthCode?: string,
    retryAfter?: number,
  ) {
    // Pakai oauthCode sebagai `code` kalau ada, fallback ke `api_error_<status>`
    super(message, oauthCode ?? `api_error_${statusCode}`, statusCode);
    this.name = 'ApiError';
    this.responseBody = responseBody;
    this.oauthCode = oauthCode;
    this.retryAfter = retryAfter;
  }

  /** HTTP 401 atau oauthCode mengindikasikan token invalid/expired */
  isUnauthorized(): boolean {
    return (
      this.statusCode === 401 ||
      this.oauthCode === 'token_expired' ||
      this.oauthCode === 'invalid_token'
    );
  }

  /** HTTP 403 apa pun (generic forbidden) */
  isForbidden(): boolean {
    return this.statusCode === 403;
  }

  /**
   * Access token tidak memiliki scope yang diperlukan.
   *
   * Remediasi: minta user login ulang dengan scope yang benar di
   * authorization URL.
   */
  isInsufficientScope(): boolean {
    return this.oauthCode === 'insufficient_scope';
  }

  /**
   * Aplikasi client belum mendapatkan approval admin untuk scope sensitif
   * (misal `detail-user`).
   *
   * Remediasi: hubungi tim Mubarokah ID untuk approval. User reauth tidak
   * akan menyelesaikan masalah ini.
   */
  isUnapprovedScope(): boolean {
    return this.oauthCode === 'unapproved_scope';
  }

  /**
   * Access token sudah kadaluwarsa — gunakan refresh token untuk
   * mendapatkan token baru.
   */
  isTokenExpired(): boolean {
    return this.oauthCode === 'token_expired';
  }

  /** HTTP 429 rate-limit. `retryAfter` (detik) bisa dibaca. */
  isRateLimited(): boolean {
    return this.statusCode === 429 || this.oauthCode === 'rate_limit_exceeded';
  }
}

/**
 * Error untuk konfigurasi yang tidak valid saat inisialisasi client.
 */
export class ConfigError extends MubarokahError {
  constructor(message: string) {
    super(message, 'config_error');
    this.name = 'ConfigError';
  }
}
