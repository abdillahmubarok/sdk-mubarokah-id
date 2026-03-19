// ============================================================================
// Mubarokah ID SDK — Public API
// ============================================================================

/**
 * @module mubarokah-id-sdk
 *
 * TypeScript SDK untuk integrasi OAuth 2.0 dengan Mubarokah ID SSO.
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
 * // Exchange code → tokens
 * const tokens = await client.auth.exchangeCode({ code: '...' });
 *
 * // Fetch user info
 * const user = await client.users.getUser(tokens.access_token);
 * ```
 *
 * @packageDocumentation
 */

// — Main Client ——————————————————————————————————————
export { MubarokahClient } from './client.js';

// — Sub-Modules ——————————————————————————————————————
export { OAuthManager } from './oauth.js';
export { UserManager } from './users.js';

// — Error Classes ————————————————————————————————————
export {
  MubarokahError,
  OAuthError,
  ApiError,
  ConfigError,
} from './errors.js';

// — Token Store ——————————————————————————————————————
export { MemoryTokenStore } from './token-store.js';

// — PKCE Utilities ———————————————————————————————————
export {
  generateCodeVerifier,
  generateCodeChallenge,
  generatePKCEPair,
  generateState,
} from './pkce.js';
export type { PKCEPair } from './pkce.js';

// — Express Middleware ———————————————————————————————
export { createCallbackHandler } from './middleware.js';

// — Types ————————————————————————————————————————————
export type {
  MubarokahConfig,
  ResolvedConfig,
  TokenResponse,
  StoredTokens,
  UserInfo,
  UserDetails,
  AuthorizationUrlOptions,
  AuthorizationUrlResult,
  ExchangeCodeOptions,
  OAuthErrorResponse,
  TokenStore,
  CallbackMiddlewareOptions,
} from './types.js';

// — Enums & Constants ————————————————————————————————
export { GrantType, Scope, Prompt, DEFAULTS } from './types.js';
