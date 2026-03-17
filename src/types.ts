/**
 * @mubarokah/auth-js — Type Definitions
 *
 * TypeScript interfaces for the Mubarokah ID OAuth 2.0 SDK.
 * All shapes match the official API documentation at https://docs.mubarokah.com
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Configuration object passed to MubarokahAuth constructor. */
export interface MubarokahAuthConfig {
  /** Your application's OAuth Client ID. */
  clientId: string;

  /** The registered redirect URI for your application. */
  redirectUri: string;

  /**
   * Space-separated list of OAuth scopes to request.
   * Available scopes: `view-user`, `detail-user`
   * @default "view-user"
   */
  scope?: string;

  /**
   * The Mubarokah ID provider base URL.
   * @default "https://accounts.mubarokah.com"
   */
  providerUrl?: string;
}

// ---------------------------------------------------------------------------
// Token
// ---------------------------------------------------------------------------

/** Response shape from `POST /oauth/token`. */
export interface TokenResponse {
  /** Bearer access token for API requests. */
  access_token: string;

  /** Token type — always "Bearer". */
  token_type: 'Bearer';

  /** Token lifetime in seconds (e.g. 86400 = 24 h). */
  expires_in: number;

  /** Refresh token for obtaining new access tokens. */
  refresh_token?: string;

  /** Granted scopes (space-separated). */
  scope?: string;
}

/** Internal representation of stored token data. */
export interface StoredTokenData {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // Unix timestamp (ms)
  scope?: string;
}

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

/**
 * Basic user profile returned by `GET /api/user`.
 * Requires scope: `view-user`
 */
export interface MubarokahUser {
  id: number | string;
  name: string;
  email: string;
  username: string;
  profile_picture: string | null;
  gender: string | null;
}

/**
 * Detailed user profile returned by `GET /api/user/details`.
 * Requires scope: `detail-user` (admin-approved clients only).
 */
export interface MubarokahUserDetails extends MubarokahUser {
  phone: string | null;
  date_of_birth: string | null;
  place_of_birth: string | null;
  address: string | null;
  bio: string | null;
}

// ---------------------------------------------------------------------------
// Auth State (React)
// ---------------------------------------------------------------------------

/** Shape of the authentication state exposed via React Context. */
export interface AuthState {
  /** The authenticated user's basic profile, or null. */
  user: MubarokahUser | null;

  /** Whether the user is currently authenticated. */
  isAuthenticated: boolean;

  /** Whether an auth operation is in progress. */
  isLoading: boolean;

  /** Last error message, if any. */
  error: string | null;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Error response shape from Mubarokah ID endpoints. */
export interface OAuthError {
  error: string;
  error_description?: string;
  message?: string;
  hint?: string;
}
