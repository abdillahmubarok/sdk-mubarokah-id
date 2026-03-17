/**
 * @mubarokah/auth-js — MubarokahAuth Client
 *
 * Core class implementing OAuth 2.0 Authorization Code Grant with PKCE
 * against the Mubarokah ID provider (https://accounts.mubarokah.com).
 */

import { generateRandomString, generateCodeChallenge } from './pkce';
import type {
  MubarokahAuthConfig,
  TokenResponse,
  StoredTokenData,
  MubarokahUser,
  MubarokahUserDetails,
  OAuthError,
} from './types';

// Session-storage keys
const STORAGE_PREFIX = 'mubarokah_auth_';
const KEY_STATE = `${STORAGE_PREFIX}state`;
const KEY_CODE_VERIFIER = `${STORAGE_PREFIX}code_verifier`;
const KEY_TOKEN = `${STORAGE_PREFIX}token`;

const DEFAULT_PROVIDER_URL = 'https://accounts.mubarokah.com';
const DEFAULT_SCOPE = 'view-user';

/**
 * MubarokahAuth — class-based OAuth 2.0 PKCE client.
 *
 * Designed for public clients (SPA / Next.js) — never touches `client_secret`.
 *
 * @example
 * ```ts
 * const auth = new MubarokahAuth({
 *   clientId: 'YOUR_CLIENT_ID',
 *   redirectUri: 'http://localhost:3000/callback',
 * });
 *
 * // Redirect user to Mubarokah ID login
 * auth.login();
 *
 * // In your callback page
 * const token = await auth.handleCallback();
 * const user  = await auth.getUser();
 * ```
 */
export class MubarokahAuth {
  private readonly config: Required<
    Pick<MubarokahAuthConfig, 'clientId' | 'redirectUri'>
  > &
    MubarokahAuthConfig;

  private readonly providerUrl: string;
  private readonly scope: string;

  constructor(config: MubarokahAuthConfig) {
    if (!config.clientId) throw new Error('[MubarokahAuth] clientId is required');
    if (!config.redirectUri)
      throw new Error('[MubarokahAuth] redirectUri is required');

    this.config = config;
    this.providerUrl = (config.providerUrl ?? DEFAULT_PROVIDER_URL).replace(
      /\/$/,
      '',
    );
    this.scope = config.scope ?? DEFAULT_SCOPE;
  }

  // -------------------------------------------------------------------------
  // Authorization Flow
  // -------------------------------------------------------------------------

  /**
   * Build the full authorization URL and persist PKCE + state in sessionStorage.
   *
   * @returns The URL to redirect the user to.
   */
  async getAuthorizationUrl(): Promise<string> {
    const state = generateRandomString(40);
    const codeVerifier = generateRandomString(64);
    const codeChallenge = await generateCodeChallenge(codeVerifier);

    // Persist for validation after redirect
    sessionStorage.setItem(KEY_STATE, state);
    sessionStorage.setItem(KEY_CODE_VERIFIER, codeVerifier);

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: this.scope,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    return `${this.providerUrl}/oauth/authorize?${params.toString()}`;
  }

  /**
   * Convenience method: build the auth URL then redirect the browser.
   */
  async login(): Promise<void> {
    const url = await this.getAuthorizationUrl();
    window.location.href = url;
  }

  // -------------------------------------------------------------------------
  // Callback Handling
  // -------------------------------------------------------------------------

  /**
   * Handle the OAuth callback.
   *
   * 1. Read `code` and `state` from the current URL's search params.
   * 2. Validate `state` against the stored value (CSRF protection).
   * 3. Exchange the `code` for tokens via POST `/oauth/token` with PKCE `code_verifier`.
   * 4. Store the tokens in sessionStorage.
   *
   * @returns The parsed {@link TokenResponse}.
   * @throws On state mismatch, missing params, or token exchange failure.
   */
  async handleCallback(): Promise<TokenResponse> {
    const urlParams = new URLSearchParams(window.location.search);

    // Check for error response from provider
    const error = urlParams.get('error');
    if (error) {
      const description =
        urlParams.get('error_description') ?? 'Authorization was denied.';
      throw new Error(`[MubarokahAuth] OAuth error: ${error} — ${description}`);
    }

    const code = urlParams.get('code');
    const returnedState = urlParams.get('state');

    if (!code) throw new Error('[MubarokahAuth] Missing authorization code in callback URL');
    if (!returnedState) throw new Error('[MubarokahAuth] Missing state in callback URL');

    // Validate state (CSRF protection)
    const storedState = sessionStorage.getItem(KEY_STATE);
    if (returnedState !== storedState) {
      this.clearSessionData();
      throw new Error('[MubarokahAuth] State mismatch — possible CSRF attack');
    }

    // Retrieve code_verifier
    const codeVerifier = sessionStorage.getItem(KEY_CODE_VERIFIER);
    if (!codeVerifier) {
      throw new Error('[MubarokahAuth] Missing code_verifier — session may have expired');
    }

    // Exchange code for tokens
    const tokenResponse = await this.exchangeCodeForToken(code, codeVerifier);

    // Persist token data
    this.storeToken(tokenResponse);

    // Cleanup PKCE data (no longer needed)
    sessionStorage.removeItem(KEY_STATE);
    sessionStorage.removeItem(KEY_CODE_VERIFIER);

    return tokenResponse;
  }

  // -------------------------------------------------------------------------
  // Token Management
  // -------------------------------------------------------------------------

  /**
   * Get the current access token, or `null` if not authenticated / expired.
   */
  getToken(): string | null {
    const data = this.getStoredToken();
    if (!data) return null;
    if (this.isTokenExpired()) return null;
    return data.accessToken;
  }

  /**
   * Check whether the stored access token has expired.
   */
  isTokenExpired(): boolean {
    const data = this.getStoredToken();
    if (!data) return true;
    // Consider token expired 60 s before actual expiry (clock skew buffer)
    return Date.now() >= data.expiresAt - 60_000;
  }

  /**
   * Returns `true` when a non-expired access token is present.
   */
  isAuthenticated(): boolean {
    return this.getToken() !== null;
  }

  // -------------------------------------------------------------------------
  // API Methods
  // -------------------------------------------------------------------------

  /**
   * Fetch basic user profile from `/api/user`.
   * Requires scope: `view-user`.
   */
  async getUser(): Promise<MubarokahUser> {
    return this.authenticatedFetch<MubarokahUser>('/api/user');
  }

  /**
   * Fetch detailed user profile from `/api/user/details`.
   * Requires scope: `detail-user` and admin-approved client.
   */
  async getUserDetails(): Promise<MubarokahUserDetails> {
    return this.authenticatedFetch<MubarokahUserDetails>('/api/user/details');
  }

  // -------------------------------------------------------------------------
  // Logout
  // -------------------------------------------------------------------------

  /**
   * Clear all stored authentication data.
   */
  logout(): void {
    this.clearSessionData();
  }

  // -------------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------------

  /**
   * Exchange an authorization code for tokens via POST `/oauth/token`.
   */
  private async exchangeCodeForToken(
    code: string,
    codeVerifier: string,
  ): Promise<TokenResponse> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.config.clientId,
      code,
      redirect_uri: this.config.redirectUri,
      code_verifier: codeVerifier,
    });

    const response = await fetch(`${this.providerUrl}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body,
    });

    if (!response.ok) {
      const errorBody: OAuthError = await response.json().catch(() => ({
        error: 'unknown_error',
        error_description: `HTTP ${response.status}`,
      }));
      throw new Error(
        `[MubarokahAuth] Token exchange failed: ${errorBody.error} — ${errorBody.error_description ?? errorBody.message ?? ''}`,
      );
    }

    return response.json() as Promise<TokenResponse>;
  }

  /**
   * Make an authenticated GET request to a Mubarokah ID API endpoint.
   */
  private async authenticatedFetch<T>(path: string): Promise<T> {
    const token = this.getToken();
    if (!token) {
      throw new Error(
        '[MubarokahAuth] No valid access token. User must authenticate first.',
      );
    }

    const response = await fetch(`${this.providerUrl}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error(
          '[MubarokahAuth] Access token expired or revoked. Please re-authenticate.',
        );
      }
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(
        `[MubarokahAuth] API request failed (${response.status}): ${JSON.stringify(errorBody)}`,
      );
    }

    return response.json() as Promise<T>;
  }

  /**
   * Persist token data in sessionStorage.
   */
  private storeToken(tokenResponse: TokenResponse): void {
    const data: StoredTokenData = {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      expiresAt: Date.now() + tokenResponse.expires_in * 1000,
      scope: tokenResponse.scope,
    };
    sessionStorage.setItem(KEY_TOKEN, JSON.stringify(data));
  }

  /**
   * Read token data from sessionStorage.
   */
  private getStoredToken(): StoredTokenData | null {
    const raw = sessionStorage.getItem(KEY_TOKEN);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as StoredTokenData;
    } catch {
      return null;
    }
  }

  /**
   * Remove all SDK-related entries from sessionStorage.
   */
  private clearSessionData(): void {
    sessionStorage.removeItem(KEY_STATE);
    sessionStorage.removeItem(KEY_CODE_VERIFIER);
    sessionStorage.removeItem(KEY_TOKEN);
  }
}
