// ============================================================================
// Mubarokah ID SDK — User Manager
// ============================================================================

import type { ResolvedConfig, UserInfo, UserDetails } from './types.js';
import { ApiError } from './errors.js';

/**
 * Mengelola API endpoints untuk data user Mubarokah ID.
 *
 * @example
 * ```typescript
 * const client = new MubarokahClient({ ... });
 *
 * // Ambil info dasar user (scope: view-user)
 * const user = await client.users.getUser(accessToken);
 * console.log(user.name, user.email);
 *
 * // Ambil detail lengkap user (scope: detail-user, perlu approval admin)
 * const details = await client.users.getUserDetails(accessToken);
 * console.log(details.phone_number, details.address);
 * ```
 */
export class UserManager {
  private readonly config: ResolvedConfig;

  constructor(config: ResolvedConfig) {
    this.config = config;
  }

  // ==========================================================================
  // Get User Info (Basic)
  // ==========================================================================

  /**
   * Ambil informasi dasar user yang sedang login.
   *
   * Endpoint: `GET /api/user`
   * Scope yang diperlukan: `view-user`
   *
   * Data yang dikembalikan:
   * - `id` — ID unik user (number)
   * - `name` — Nama lengkap
   * - `email` — Alamat email (**`null`** untuk user WhatsApp)
   * - `username` — Username unik (bisa `null`)
   * - `profile_picture` — URL foto profil (bisa `null`)
   * - `gender` — Jenis kelamin (bisa `null`)
   *
   * @param accessToken - Access token yang valid dengan scope `view-user`
   * @returns Informasi dasar user
   * @throws {ApiError} Jika request gagal. Gunakan `isUnauthorized()`,
   *   `isInsufficientScope()`, `isUnapprovedScope()`, `isRateLimited()`
   *   untuk mendeteksi kondisi spesifik.
   */
  async getUser(accessToken: string): Promise<UserInfo> {
    return this.apiRequest<UserInfo>('/api/user', accessToken);
  }

  // ==========================================================================
  // Get User Details (Sensitive)
  // ==========================================================================

  /**
   * Ambil informasi detail user termasuk data sensitif.
   *
   * Endpoint: `GET /api/user/details`
   * Scope yang diperlukan: `detail-user`
   *
   * ⚠️ **Perlu Approval Admin**: hanya bisa diakses bila aplikasi Anda sudah
   * mendapatkan persetujuan administratif untuk scope `detail-user`. Tanpa
   * approval, akan mengembalikan 403 `unapproved_scope`.
   *
   * Data tambahan di atas `getUser()`:
   * - `phone_number` — Nomor telepon terverifikasi (bisa `null`)
   * - `date_of_birth`, `place_of_birth`, `address`, `bio` — semua bisa `null`
   *
   * @param accessToken - Access token yang valid dengan scope `detail-user`
   * @returns Informasi detail user
   * @throws {ApiError} Jika request gagal:
   *   - `isInsufficientScope()` → minta user reauth dengan scope yang benar
   *   - `isUnapprovedScope()` → hubungi admin Mubarokah ID
   *   - `isUnauthorized()` → refresh token atau minta login ulang
   *
   * @example
   * ```typescript
   * try {
   *   const details = await client.users.getUserDetails(accessToken);
   * } catch (error) {
   *   if (error instanceof ApiError) {
   *     if (error.isUnapprovedScope()) {
   *       showAdminApprovalRequiredMessage();
   *     } else if (error.isInsufficientScope()) {
   *       redirectToReauthWithDetailScope();
   *     }
   *   }
   * }
   * ```
   */
  async getUserDetails(accessToken: string): Promise<UserDetails> {
    return this.apiRequest<UserDetails>('/api/user/details', accessToken);
  }

  // ==========================================================================
  // Internal: API Request
  // ==========================================================================

  /**
   * Internal method untuk mengirim authenticated request ke API.
   */
  private async apiRequest<T>(path: string, accessToken: string): Promise<T> {
    const url = `${this.config.baseUrl}${path}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      throw await this.buildApiError(response);
    }

    return (await response.json()) as T;
  }

  /**
   * Parse body response error menjadi `ApiError` yang kaya metadata.
   *
   * Berdasarkan dokumentasi Mubarokah ID:
   * - 401: `{ "error": "token_expired" | "token_invalid", ... }` atau `{ "message": "Unauthenticated." }`
   * - 403: `{ "error": "insufficient_scope" | "unapproved_scope" | "permission_denied", ... }`
   * - 429: `{ "error": "rate_limit_exceeded", "retry_after": 60 }`
   */
  private async buildApiError(response: Response): Promise<ApiError> {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      try {
        body = await response.text();
      } catch {
        body = undefined;
      }
    }

    const parsed = (typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>)
      : {}) as Record<string, unknown>;

    const oauthCode =
      typeof parsed.error === 'string' ? (parsed.error as string) : undefined;

    const message =
      (typeof parsed.message === 'string' && parsed.message) ||
      (typeof parsed.error_description === 'string' && parsed.error_description) ||
      oauthCode ||
      `API request failed with status ${response.status}`;

    // `Retry-After` header atau field body
    let retryAfter: number | undefined;
    const retryHeader = response.headers.get('Retry-After');
    if (retryHeader && /^\d+$/.test(retryHeader)) {
      retryAfter = Number.parseInt(retryHeader, 10);
    } else if (typeof parsed.retry_after === 'number') {
      retryAfter = parsed.retry_after;
    }

    return new ApiError(message, response.status, body, oauthCode, retryAfter);
  }
}
