// ============================================================================
// Mubarokah ID SDK — Main Client
// ============================================================================

import type { MubarokahConfig, ResolvedConfig } from './types.js';
import { DEFAULTS } from './types.js';
import { ConfigError } from './errors.js';
import { OAuthManager } from './oauth.js';
import { UserManager } from './users.js';

/**
 * Client utama untuk berinteraksi dengan Mubarokah ID.
 *
 * `MubarokahClient` adalah entry point utama dari SDK ini. Gunakan class ini
 * untuk mengakses semua fitur OAuth 2.0 dan API Mubarokah ID.
 *
 * @example Quick Start
 * ```typescript
 * import { MubarokahClient } from 'mubarokah-id-sdk';
 *
 * const client = new MubarokahClient({
 *   clientId: process.env.MUBAROKAH_CLIENT_ID!,
 *   clientSecret: process.env.MUBAROKAH_CLIENT_SECRET!,
 *   redirectUri: 'http://localhost:3090/auth/callback',
 * });
 *
 * // Generate authorization URL
 * const { url, state } = client.auth.getAuthorizationUrl();
 *
 * // Exchange code untuk tokens
 * const tokens = await client.auth.exchangeCode({ code: '...' });
 *
 * // Ambil user info
 * const user = await client.users.getUser(tokens.access_token);
 * ```
 *
 * @example Dengan custom options
 * ```typescript
 * const client = new MubarokahClient({
 *   clientId: 'your-client-id',
 *   clientSecret: 'your-client-secret',
 *   redirectUri: 'https://yourapp.com/auth/callback',
 *   baseUrl: 'https://accounts.mubarokah.com',
 *   scopes: ['view-user', 'detail-user'],
 *   timeout: 15000, // 15 detik
 * });
 * ```
 */
export class MubarokahClient {
  /** Konfigurasi yang sudah di-resolve */
  private readonly config: ResolvedConfig;

  /** Manager untuk OAuth 2.0 flows */
  public readonly auth: OAuthManager;

  /** Manager untuk User API endpoints */
  public readonly users: UserManager;

  /**
   * Buat instance MubarokahClient baru.
   *
   * @param config - Konfigurasi client
   * @throws {ConfigError} Jika konfigurasi tidak valid
   */
  constructor(config: MubarokahConfig) {
    this.config = this.resolveConfig(config);
    this.auth = new OAuthManager(this.config);
    this.users = new UserManager(this.config);
  }

  /**
   * Dapatkan konfigurasi yang digunakan (read-only).
   */
  getConfig(): Readonly<ResolvedConfig> {
    return { ...this.config };
  }

  /**
   * Validasi dan resolve konfigurasi dengan default values.
   */
  private resolveConfig(config: MubarokahConfig): ResolvedConfig {
    if (!config.clientId || typeof config.clientId !== 'string') {
      throw new ConfigError('clientId wajib diisi dan harus berupa string.');
    }

    if (!config.clientSecret || typeof config.clientSecret !== 'string') {
      throw new ConfigError('clientSecret wajib diisi dan harus berupa string.');
    }

    if (!config.redirectUri || typeof config.redirectUri !== 'string') {
      throw new ConfigError('redirectUri wajib diisi dan harus berupa string.');
    }

    // Validate redirectUri format
    try {
      new URL(config.redirectUri);
    } catch {
      throw new ConfigError(`redirectUri tidak valid: "${config.redirectUri}". Harus berupa URL lengkap (contoh: http://localhost:3090/auth/callback).`);
    }

    // Resolve base URL (remove trailing slash)
    let baseUrl = config.baseUrl ?? DEFAULTS.BASE_URL;
    baseUrl = baseUrl.replace(/\/+$/, '');

    return {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: config.redirectUri,
      baseUrl,
      scopes: config.scopes ?? [...DEFAULTS.SCOPES],
      timeout: config.timeout ?? DEFAULTS.TIMEOUT,
    };
  }
}
