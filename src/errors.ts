// ============================================================================
// Mubarokah ID SDK — Custom Error Classes
// ============================================================================

import type { OAuthErrorResponse } from './types.js';

/**
 * Error mapping untuk pesan user-friendly (Bahasa Indonesia).
 */
const USER_FRIENDLY_MESSAGES: Record<string, string> = {
  invalid_request: 'Permintaan tidak valid. Parameter yang diperlukan tidak lengkap atau salah format.',
  invalid_client: 'Autentikasi client gagal. Periksa Client ID dan Client Secret Anda.',
  invalid_grant: 'Kode otorisasi tidak valid, sudah kedaluwarsa, atau sudah digunakan.',
  unauthorized_client: 'Aplikasi tidak memiliki izin untuk menggunakan grant type ini.',
  unsupported_grant_type: 'Grant type tidak didukung. Gunakan: authorization_code, refresh_token, atau client_credentials.',
  invalid_scope: 'Scope yang diminta tidak valid atau tidak dikenali.',
  access_denied: 'Anda menolak permintaan otorisasi dari aplikasi ini.',
  unapproved_scope: 'Aplikasi Anda memerlukan persetujuan admin untuk mengakses data ini.',
  insufficient_scope: 'Access token tidak memiliki scope yang diperlukan.',
  token_expired: 'Sesi Anda telah kedaluwarsa. Silakan login kembali.',
};

/**
 * Base error class untuk semua error dari Mubarokah ID SDK.
 *
 * @example
 * ```typescript
 * try {
 *   await client.auth.exchangeCode({ code: '...' });
 * } catch (error) {
 *   if (error instanceof MubarokahError) {
 *     console.log(error.code);    // 'invalid_grant'
 *     console.log(error.message); // 'The authorization code is invalid...'
 *   }
 * }
 * ```
 */
export class MubarokahError extends Error {
  /** Kode error */
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
 *
 * @example
 * ```typescript
 * try {
 *   await client.auth.exchangeCode({ code: 'expired_code' });
 * } catch (error) {
 *   if (error instanceof OAuthError) {
 *     console.log(error.errorDescription); // 'The authorization grant is invalid...'
 *     console.log(error.hint);             // 'Check the authorization code...'
 *   }
 * }
 * ```
 */
export class OAuthError extends MubarokahError {
  /** Deskripsi error dari server */
  public readonly errorDescription?: string;

  /** Petunjuk perbaikan dari server */
  public readonly hint?: string;

  constructor(response: OAuthErrorResponse, statusCode?: number) {
    const message = response.error_description ?? response.message ?? response.error ?? 'OAuth error';
    super(message, response.error, statusCode);
    this.name = 'OAuthError';
    this.errorDescription = response.error_description;
    this.hint = response.hint;
  }

  /**
   * Periksa apakah error ini bisa di-retry.
   */
  isRetryable(): boolean {
    return ['token_expired', 'temporarily_unavailable'].includes(this.code);
  }

  /**
   * Periksa apakah user perlu re-authenticate.
   */
  requiresReauth(): boolean {
    return ['invalid_grant', 'invalid_client', 'access_denied'].includes(this.code);
  }
}

/**
 * Error khusus untuk API calls (GET /api/user, dll).
 */
export class ApiError extends MubarokahError {
  /** Response body mentah */
  public readonly responseBody?: unknown;

  constructor(message: string, statusCode: number, responseBody?: unknown) {
    super(message, `api_error_${statusCode}`, statusCode);
    this.name = 'ApiError';
    this.responseBody = responseBody;
  }

  /** Apakah error karena token expired / unauthorized */
  isUnauthorized(): boolean {
    return this.statusCode === 401;
  }

  /** Apakah error karena forbidden (misal scope belum di-approve admin) */
  isForbidden(): boolean {
    return this.statusCode === 403;
  }
}

/**
 * Error untuk konfigurasi yang tidak valid.
 */
export class ConfigError extends MubarokahError {
  constructor(message: string) {
    super(message, 'config_error');
    this.name = 'ConfigError';
  }
}
