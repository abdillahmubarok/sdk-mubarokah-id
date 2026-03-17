/**
 * @mubarokah/auth-js
 *
 * TypeScript SDK for integrating Mubarokah ID SSO (OAuth 2.0 + PKCE)
 * into React / Next.js applications.
 *
 * @packageDocumentation
 */

// Core client
export { MubarokahAuth } from './client';

// React integration
export { MubarokahProvider, useMubarokahAuth } from './provider';

// PKCE utilities (exposed for advanced use-cases)
export {
  generateRandomString,
  generateCodeChallenge,
  sha256,
  base64UrlEncode,
} from './pkce';

// Types
export type {
  MubarokahAuthConfig,
  TokenResponse,
  StoredTokenData,
  MubarokahUser,
  MubarokahUserDetails,
  AuthState,
  OAuthError,
} from './types';
