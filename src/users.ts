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
 * console.log(details.phone, details.address);
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
   * - `id` — ID unik user
   * - `name` — Nama lengkap
   * - `email` — Alamat email
   * - `username` — Username unik
   * - `profile_picture` — URL foto profil
   * - `gender` — Jenis kelamin
   *
   * @param accessToken - Access token yang valid dengan scope `view-user`
   * @returns Informasi dasar user
   * @throws {ApiError} Jika request gagal (token expired, invalid, dll)
   *
   * @example
   * ```typescript
   * const user = await client.users.getUser(accessToken);
   *
   * console.log(`Halo, ${user.name}!`);
   * console.log(`Email: ${user.email}`);
   * console.log(`Avatar: ${user.profile_picture}`);
   * ```
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
   * ⚠️ **Perlu Approval Admin**: Endpoint ini hanya bisa diakses jika
   * aplikasi Anda sudah mendapatkan persetujuan administratif untuk
   * scope `detail-user`.
   *
   * Data tambahan di atas `getUser()`:
   * - `phone` — Nomor telepon
   * - `date_of_birth` — Tanggal lahir
   * - `place_of_birth` — Tempat lahir
   * - `address` — Alamat lengkap
   * - `bio` — Biografi
   *
   * @param accessToken - Access token yang valid dengan scope `detail-user`
   * @returns Informasi detail user
   * @throws {ApiError} Jika request gagal
   *   - `403` jika scope belum di-approve admin
   *   - `401` jika token expired/invalid
   *
   * @example
   * ```typescript
   * try {
   *   const details = await client.users.getUserDetails(accessToken);
   *   console.log(`Alamat: ${details.address}`);
   *   console.log(`Telepon: ${details.phone}`);
   * } catch (error) {
   *   if (error instanceof ApiError && error.isForbidden()) {
   *     console.log('Aplikasi belum mendapat approval untuk detail-user scope');
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
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        body = await response.text();
      }

      const message =
        typeof body === 'object' && body !== null && 'message' in body
          ? String((body as Record<string, unknown>).message)
          : `API request failed with status ${response.status}`;

      throw new ApiError(message, response.status, body);
    }

    return (await response.json()) as T;
  }
}
