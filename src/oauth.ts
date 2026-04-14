// ============================================================================
// Mubarokah ID SDK — OAuth Manager
// ============================================================================

import type {
  ResolvedConfig,
  TokenResponse,
  AuthorizationUrlOptions,
  AuthorizationUrlResult,
  ExchangeCodeOptions,
  OAuthErrorResponse,
} from './types.js';
import { OAuthError } from './errors.js';
import { generateState, generateCodeVerifier, generateCodeChallenge } from './pkce.js';

/**
 * Mengelola semua OAuth 2.0 flow untuk Mubarokah ID.
 *
 * Mendukung:
 * - **Authorization Code Grant** (dengan optional PKCE)
 * - **Refresh Token Grant**
 * - **Client Credentials Grant**
 *
 * @example
 * ```typescript
 * const client = new MubarokahClient({ ... });
 *
 * // 1. Generate authorization URL
 * const { url, state } = client.auth.getAuthorizationUrl();
 *
 * // 2. Redirect user ke url, lalu handle callback
 * const tokens = await client.auth.exchangeCode({ code: '...' });
 *
 * // 3. Refresh token saat expired
 * const newTokens = await client.auth.refreshToken(tokens.refresh_token!);
 * ```
 */
export class OAuthManager {
  private readonly config: ResolvedConfig;

  constructor(config: ResolvedConfig) {
    this.config = config;
  }

  // ==========================================================================
  // Authorization URL
  // ==========================================================================

  /**
   * Buat Authorization URL untuk redirect user ke Mubarokah ID.
   *
   * URL ini akan mengarahkan user ke halaman login/consent Mubarokah ID.
   * Setelah user approve, mereka akan di-redirect kembali ke `redirectUri`
   * dengan authorization code.
   *
   * @param options - Opsi tambahan (scopes, state, PKCE, dll)
   * @returns Objek berisi URL, state, dan (opsional) PKCE data
   *
   * @example Basic usage
   * ```typescript
   * const { url, state } = client.auth.getAuthorizationUrl();
   * // Simpan state di session
   * req.session.oauthState = state;
   * // Redirect user
   * res.redirect(url);
   * ```
   *
   * @example Dengan PKCE (untuk SPA / mobile app)
   * ```typescript
   * const { url, state, codeVerifier } = client.auth.getAuthorizationUrl({
   *   usePKCE: true,
   *   scopes: ['view-user', 'detail-user'],
   *   prompt: 'consent',
   * });
   *
   * // Simpan state dan codeVerifier di session
   * req.session.oauthState = state;
   * req.session.codeVerifier = codeVerifier;
   * res.redirect(url);
   * ```
   */
  getAuthorizationUrl(options: AuthorizationUrlOptions = {}): AuthorizationUrlResult {
    const state = options.state ?? generateState();
    const scopes = options.scopes ?? this.config.scopes;
    const redirectUri = options.redirectUri ?? this.config.redirectUri;

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: redirectUri,
      scope: scopes.join(' '),
      state,
    });

    // Prompt (consent / login)
    if (options.prompt) {
      params.set('prompt', options.prompt);
    }

    // PKCE support
    let codeVerifier: string | undefined;
    let codeChallenge: string | undefined;

    if (options.usePKCE) {
      codeVerifier = generateCodeVerifier();
      codeChallenge = generateCodeChallenge(codeVerifier);
      params.set('code_challenge', codeChallenge);
      params.set('code_challenge_method', 'S256');
    }

    const url = `${this.config.baseUrl}/oauth/authorize?${params.toString()}`;

    return { url, state, codeVerifier, codeChallenge };
  }

  // ==========================================================================
  // Token Exchange (Authorization Code → Access Token)
  // ==========================================================================

  /**
   * Exchange authorization code untuk access token dan refresh token.
   *
   * Panggil method ini setelah user di-redirect kembali ke callback URL
   * dengan authorization code.
   *
   * ⚠️ Method ini HARUS dipanggil dari server-side karena menggunakan `client_secret`.
   *
   * @param options - Authorization code dan opsional redirect URI / code verifier
   * @returns Token response (access_token, refresh_token, expires_in, dll)
   * @throws {OAuthError} Jika exchange gagal (code expired, invalid, dll)
   *
   * @example
   * ```typescript
   * // Di callback route handler
   * const tokens = await client.auth.exchangeCode({
   *   code: req.query.code,
   * });
   *
   * console.log(tokens.access_token);
   * console.log(tokens.refresh_token);
   * console.log(tokens.expires_in); // 86400 (24 jam)
   * ```
   *
   * @example Dengan PKCE
   * ```typescript
   * const tokens = await client.auth.exchangeCode({
   *   code: req.query.code,
   *   codeVerifier: req.session.codeVerifier,
   * });
   * ```
   */
  async exchangeCode(options: ExchangeCodeOptions): Promise<TokenResponse> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: options.code,
      redirect_uri: options.redirectUri ?? this.config.redirectUri,
      client_id: this.config.clientId,
    });

    if (this.config.clientSecret) {
      body.set('client_secret', this.config.clientSecret);
    }

    if (options.codeVerifier) {
      body.set('code_verifier', options.codeVerifier);
    }

    return this.requestToken(body);
  }

  // ==========================================================================
  // Refresh Token
  // ==========================================================================

  /**
   * Dapatkan access token baru menggunakan refresh token.
   *
   * Gunakan method ini ketika access token sudah expired. Refresh token
   * memungkinkan Anda mendapatkan access token baru tanpa user harus
   * login ulang.
   *
   * @param refreshToken - Refresh token dari token exchange sebelumnya
   * @param scope - Opsional: request subset dari scopes original
   * @returns Token response baru
   * @throws {OAuthError} Jika refresh gagal (token revoked, expired, dll)
   *
   * @example
   * ```typescript
   * try {
   *   const newTokens = await client.auth.refreshToken(storedRefreshToken);
   *   // Update stored tokens
   *   await saveTokens(userId, newTokens);
   * } catch (error) {
   *   if (error instanceof OAuthError && error.requiresReauth()) {
   *     // Redirect user untuk login ulang
   *     res.redirect('/login');
   *   }
   * }
   * ```
   */
  async refreshToken(refreshToken: string, scope?: string): Promise<TokenResponse> {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: this.config.clientId,
    });

    if (this.config.clientSecret) {
      body.set('client_secret', this.config.clientSecret);
    }

    if (scope) {
      body.set('scope', scope);
    }

    return this.requestToken(body);
  }

  // ==========================================================================
  // Client Credentials (Machine-to-Machine)
  // ==========================================================================

  /**
   * Dapatkan access token menggunakan Client Credentials Grant.
   *
   * Flow ini untuk komunikasi server-to-server (M2M) tanpa keterlibatan user.
   * Tidak menghasilkan refresh token.
   *
   * @param scope - Opsional: scopes yang diminta
   * @returns Token response (tanpa refresh_token)
   * @throws {OAuthError} Jika request gagal
   *
   * @example
   * ```typescript
   * const { access_token } = await client.auth.clientCredentials('server-operations');
   * // Gunakan access_token untuk API calls server-side
   * ```
   */
  async clientCredentials(scope?: string): Promise<TokenResponse> {
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.config.clientId,
    });

    if (this.config.clientSecret) {
      body.set('client_secret', this.config.clientSecret);
    }

    if (scope) {
      body.set('scope', scope);
    }

    return this.requestToken(body);
  }

  // ==========================================================================
  // Single Sign-Out (Logout)
  // ==========================================================================

  /**
   * Logout user dari sesi SSO Mubarokah ID.
   * 
   * Endpoint ini akan mencabut (revoke) access token yang sedang aktif dan juga
   * membersihkan sesi login user di sistem Mubarokah ID, sehingga user akan
   * ter-logout secara menyeluruh dari seluruh aplikasi yang terhubung.
   * 
   * ⚠️ PEMBERITAHUAN PENTING UNTUK PENGEMBANG:
   * API ini akan membuat pengguna dari App Client Anda "Logout" dari App Client nya juga Mubarokah ID.
   * Pertimbangkan untuk memberikan Saran/Notifikasi terbaik terhadap pengguna agar
   * mereka mengetahui bahwa tindakan ini akan mengeluarkan mereka dari seluruh ekosistem SSO.
   *
   * @param accessToken - Access token yang valid dari sesi saat ini
   * @throws {OAuthError} Jika token tidak valid atau request gagal
   * 
   * @example
   * ```typescript
   * await client.auth.logout(accessToken);
   * // Kemudian bersihkan sesi di aplikasi lokal Anda
   * req.session.destroy();
   * res.redirect('/');
   * ```
   */
  async logout(accessToken: string): Promise<void> {
    const url = `${this.config.baseUrl}/api/logout-sso`;

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

      const data = typeof body === 'object' && body !== null ? body : { error: String(body) };
      throw new OAuthError(data as OAuthErrorResponse, response.status);
    }
  }

  // ==========================================================================
  // Internal: Token Request
  // ==========================================================================

  /**
   * Internal method untuk mengirim request ke token endpoint.
   */
  private async requestToken(body: URLSearchParams): Promise<TokenResponse> {
    const url = `${this.config.baseUrl}/oauth/token`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
      signal: AbortSignal.timeout(this.config.timeout),
    });

    const data = await response.json() as TokenResponse | OAuthErrorResponse;

    if (!response.ok) {
      throw new OAuthError(data as OAuthErrorResponse, response.status);
    }

    return data as TokenResponse;
  }
}
