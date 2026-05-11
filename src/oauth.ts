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
  AutoRefreshHandle,
} from './types.js';
import { ApiError, ConfigError, OAuthError } from './errors.js';
import { generateState, generateCodeVerifier, generateCodeChallenge } from './pkce.js';

/** Ambang batas refresh proaktif (ms) sebelum token expired. */
const PROACTIVE_REFRESH_THRESHOLD_MS = 30_000;

/**
 * Ubah `TokenResponse` dari server menjadi `AutoRefreshHandle` yang bisa
 * dipakai langsung oleh `OAuthManager.withAutoRefresh()`.
 *
 * @param response - Response dari token endpoint
 * @param issuedAt - Epoch ms saat token diterbitkan (default: sekarang)
 */
export function tokenResponseToHandle(
  response: TokenResponse,
  issuedAt: number = Date.now(),
): AutoRefreshHandle {
  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token,
    expiresAt: issuedAt + response.expires_in * 1000,
  };
}

/**
 * Mengelola semua OAuth 2.0 flow untuk Mubarokah ID.
 *
 * Mendukung:
 * - **Authorization Code Grant** (dengan optional PKCE)
 * - **Refresh Token Grant** (manual + auto-refresh wrapper)
 * - **Client Credentials Grant**
 * - **Single Sign-Out (logout SSO)**
 *
 * @example
 * ```typescript
 * const client = new MubarokahClient({ ... });
 *
 * // 1. Generate authorization URL
 * const { url, state, codeVerifier } = await client.auth.getAuthorizationUrl({ usePKCE: true });
 *
 * // 2. Redirect user ke url, lalu handle callback
 * const tokens = await client.auth.exchangeCode({ code: '...', codeVerifier });
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
  // Environment safety guard
  // ==========================================================================

  /**
   * Lempar error jika kita mendeteksi pengiriman `client_secret` dari browser.
   *
   * Sesuai dokumentasi Mubarokah ID dan best practice OAuth 2.1, `client_secret`
   * tidak boleh pernah sampai ke runtime browser. Public client (SPA / mobile)
   * wajib memakai PKCE tanpa secret.
   */
  private assertSafeEnvironment(): void {
    const inBrowser =
      typeof window !== 'undefined' &&
      typeof (window as unknown as { document?: unknown }).document !== 'undefined';

    if (inBrowser && this.config.clientSecret) {
      throw new ConfigError(
        '[Mubarokah SDK] clientSecret terdeteksi saat runtime browser. ' +
          'client_secret tidak boleh berada di bundle SPA. ' +
          'Gunakan PKCE tanpa clientSecret untuk public client, atau lakukan token exchange di backend.',
      );
    }
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
   * ⚠️ **Async sejak v2**: method ini sekarang async karena PKCE code challenge
   * dihasilkan via WebCrypto (`SubtleCrypto.digest`) yang Promise-based.
   *
   * @param options - Opsi tambahan (scopes, state, PKCE, dll)
   * @returns Promise ke objek berisi URL, state, dan (opsional) PKCE data
   *
   * @example Basic usage
   * ```typescript
   * const { url, state } = await client.auth.getAuthorizationUrl();
   * req.session.oauthState = state;
   * res.redirect(url);
   * ```
   *
   * @example Dengan PKCE (untuk SPA / mobile app)
   * ```typescript
   * const { url, state, codeVerifier } = await client.auth.getAuthorizationUrl({
   *   usePKCE: true,
   *   scopes: ['view-user', 'detail-user'],
   *   prompt: 'consent',
   * });
   *
   * req.session.oauthState = state;
   * req.session.codeVerifier = codeVerifier;
   * res.redirect(url);
   * ```
   */
  async getAuthorizationUrl(
    options: AuthorizationUrlOptions = {},
  ): Promise<AuthorizationUrlResult> {
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

    if (options.prompt) {
      params.set('prompt', options.prompt);
    }

    let codeVerifier: string | undefined;
    let codeChallenge: string | undefined;

    if (options.usePKCE) {
      codeVerifier = generateCodeVerifier();
      codeChallenge = await generateCodeChallenge(codeVerifier);
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
   * - **Confidential client (backend)**: config menyertakan `clientSecret`.
   * - **Public client (SPA/mobile)**: gunakan PKCE, config TANPA `clientSecret`.
   *   Wajib meneruskan `codeVerifier` dari sessionStorage.
   *
   * @param options - Authorization code dan opsional redirect URI / code verifier
   * @returns Token response (access_token, refresh_token, expires_in, dll)
   * @throws {ConfigError} Jika dijalankan di browser dengan clientSecret aktif
   * @throws {OAuthError} Jika exchange gagal (code expired, invalid, dll)
   *
   * @example
   * ```typescript
   * const tokens = await client.auth.exchangeCode({
   *   code: req.query.code,
   *   codeVerifier: req.session.codeVerifier, // jika pakai PKCE
   * });
   * ```
   */
  async exchangeCode(options: ExchangeCodeOptions): Promise<TokenResponse> {
    this.assertSafeEnvironment();

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
   * @throws {ConfigError} Jika dijalankan di browser dengan clientSecret aktif
   * @throws {OAuthError} Jika refresh gagal (token revoked, expired, dll)
   *
   * @example
   * ```typescript
   * try {
   *   const newTokens = await client.auth.refreshToken(storedRefreshToken);
   *   await saveTokens(userId, newTokens);
   * } catch (error) {
   *   if (error instanceof OAuthError && error.requiresReauth()) {
   *     res.redirect('/login');
   *   }
   * }
   * ```
   */
  async refreshToken(refreshToken: string, scope?: string): Promise<TokenResponse> {
    this.assertSafeEnvironment();

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
  // Auto-Refresh Wrapper
  // ==========================================================================

  /**
   * Jalankan sebuah API call dengan strategi refresh token otomatis.
   *
   * Strategi:
   * 1. **Proactive refresh** — jika token akan expired dalam `< 30 detik` dan
   *    `refreshToken` tersedia, refresh dulu sebelum memanggil `call`.
   * 2. **Reactive refresh** — jika `call` melempar `ApiError` 401 atau
   *    `OAuthError` `token_expired`/`invalid_token`, lakukan refresh lalu
   *    retry `call` sekali dengan access token baru.
   * 3. Jika refresh gagal, error asli atau error refresh dilempar ke caller
   *    supaya user bisa diarahkan login ulang.
   *
   * Method ini tidak menyimpan token sendiri — callback `onTokensUpdated`
   * dipanggil setiap kali token baru diterbitkan supaya caller bisa
   * memperbarui session storage / token store mereka.
   *
   * @param handle - Token saat ini (access, refresh, expiresAt)
   * @param call - Fungsi yang memakai `accessToken` untuk memanggil API
   * @param onTokensUpdated - Callback ketika token di-refresh (opsional)
   * @returns Hasil dari `call`
   *
   * @example
   * ```typescript
   * const handle = tokenResponseToHandle(tokens);
   *
   * const user = await client.auth.withAutoRefresh(
   *   handle,
   *   (accessToken) => client.users.getUser(accessToken),
   *   (newHandle) => {
   *     req.session.tokenHandle = newHandle;
   *   },
   * );
   * ```
   */
  async withAutoRefresh<T>(
    handle: AutoRefreshHandle,
    call: (accessToken: string) => Promise<T>,
    onTokensUpdated?: (handle: AutoRefreshHandle) => void | Promise<void>,
  ): Promise<T> {
    let current = handle;

    // 1. Proactive refresh
    if (this.shouldRefreshProactively(current)) {
      current = await this.tryRefresh(current, onTokensUpdated);
    }

    try {
      return await call(current.accessToken);
    } catch (err) {
      // 2. Reactive refresh hanya untuk kondisi unauthorized/expired
      if (!current.refreshToken || !this.shouldReactiveRefresh(err)) {
        throw err;
      }

      current = await this.tryRefresh(current, onTokensUpdated);
      return call(current.accessToken);
    }
  }

  /**
   * Cek apakah token perlu di-refresh proaktif (akan expired segera).
   */
  private shouldRefreshProactively(handle: AutoRefreshHandle): boolean {
    if (!handle.refreshToken) return false;
    const remaining = handle.expiresAt - Date.now();
    return remaining <= PROACTIVE_REFRESH_THRESHOLD_MS;
  }

  /**
   * Cek apakah sebuah error mengindikasikan token tidak valid sehingga refresh
   * otomatis bisa menolong.
   */
  private shouldReactiveRefresh(err: unknown): boolean {
    if (err instanceof ApiError && err.isUnauthorized()) return true;
    if (err instanceof OAuthError) {
      return ['token_expired', 'invalid_token'].includes(err.code);
    }
    return false;
  }

  /**
   * Jalankan refresh token dan panggil callback update. Melempar error asli
   * agar caller bisa menangani (mis. redirect ke login).
   */
  private async tryRefresh(
    handle: AutoRefreshHandle,
    onTokensUpdated?: (handle: AutoRefreshHandle) => void | Promise<void>,
  ): Promise<AutoRefreshHandle> {
    if (!handle.refreshToken) {
      throw new OAuthError(
        {
          error: 'invalid_grant',
          error_description: 'Tidak ada refresh_token tersimpan. User harus login ulang.',
        },
        401,
      );
    }

    const refreshed = await this.refreshToken(handle.refreshToken);
    const next: AutoRefreshHandle = {
      accessToken: refreshed.access_token,
      // Laravel Passport umumnya rotate refresh_token; fallback ke lama jika server tidak kirim baru
      refreshToken: refreshed.refresh_token ?? handle.refreshToken,
      expiresAt: Date.now() + refreshed.expires_in * 1000,
    };

    if (onTokensUpdated) {
      await onTokensUpdated(next);
    }

    return next;
  }

  // ==========================================================================
  // Client Credentials (Machine-to-Machine)
  // ==========================================================================

  /**
   * Dapatkan access token menggunakan Client Credentials Grant.
   *
   * Flow ini untuk komunikasi server-to-server (M2M) tanpa keterlibatan user.
   * Tidak menghasilkan refresh token, dan WAJIB berjalan di server.
   *
   * @param scope - Opsional: scopes yang diminta
   * @returns Token response (tanpa refresh_token)
   * @throws {ConfigError} Jika dijalankan di browser
   * @throws {OAuthError} Jika request gagal
   *
   * @example
   * ```typescript
   * const { access_token } = await client.auth.clientCredentials('server-operations');
   * ```
   */
  async clientCredentials(scope?: string): Promise<TokenResponse> {
    this.assertSafeEnvironment();

    if (!this.config.clientSecret) {
      throw new ConfigError(
        '[Mubarokah SDK] clientCredentials grant memerlukan clientSecret pada config.',
      );
    }

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    });

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
   * Endpoint ini mencabut access token aktif dan membersihkan sesi login user
   * di sistem Mubarokah ID — user akan ter-logout dari SELURUH aplikasi yang
   * terhubung ke SSO.
   *
   * ⚠️ **PEMBERITAHUAN UNTUK PENGEMBANG:**
   * Beritahu user secara eksplisit (via dialog konfirmasi) bahwa tindakan ini
   * akan mengeluarkan mereka dari seluruh ekosistem SSO Mubarokah ID,
   * bukan hanya aplikasi Anda.
   *
   * @param accessToken - Access token valid dari sesi aktif
   * @throws {OAuthError} Jika token tidak valid atau request gagal
   *
   * @example
   * ```typescript
   * await client.auth.logout(accessToken);
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

      const data =
        typeof body === 'object' && body !== null ? body : { error: String(body) };
      throw new OAuthError(data as OAuthErrorResponse, response.status);
    }
  }

  // ==========================================================================
  // Internal: Token Request
  // ==========================================================================

  /**
   * Internal: kirim request ke token endpoint dan bungkus error sebagai OAuthError.
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

    let data: TokenResponse | OAuthErrorResponse;
    try {
      data = (await response.json()) as TokenResponse | OAuthErrorResponse;
    } catch {
      throw new OAuthError(
        {
          error: 'server_error',
          error_description: `Token endpoint mengembalikan response non-JSON (status ${response.status}).`,
        },
        response.status,
      );
    }

    if (!response.ok) {
      throw new OAuthError(data as OAuthErrorResponse, response.status);
    }

    return data as TokenResponse;
  }
}
