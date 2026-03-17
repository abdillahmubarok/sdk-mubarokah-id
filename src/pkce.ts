/**
 * @mubarokah/auth-js — PKCE Utilities
 *
 * Implements Proof Key for Code Exchange (RFC 7636) using the
 * Web Crypto API. Zero external dependencies.
 */

/**
 * Generate a cryptographically-secure random string.
 *
 * Uses `crypto.getRandomValues` (available in all modern browsers
 * and Node ≥ 15 via the `globalThis.crypto` polyfill).
 *
 * The output alphabet follows RFC 7636 §4.1 (unreserved URI characters).
 *
 * @param length — Desired string length (default 64, min 43 per spec).
 */
export function generateRandomString(length = 64): string {
  const CHARSET =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);

  let result = '';
  for (let i = 0; i < length; i++) {
    result += CHARSET[randomValues[i] % CHARSET.length];
  }
  return result;
}

/**
 * Compute the SHA-256 digest of a plain-text string.
 *
 * @returns Raw `ArrayBuffer` of the 32-byte hash.
 */
export async function sha256(plain: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return crypto.subtle.digest('SHA-256', data);
}

/**
 * Encode an `ArrayBuffer` as a Base64-URL string (no padding).
 *
 * Follows RFC 7636 §Appendix A encoding rules:
 *   • `+` → `-`
 *   • `/` → `_`
 *   • Trailing `=` stripped
 */
export function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Derive a PKCE `code_challenge` from a `code_verifier` using the S256 method.
 *
 * Equivalent to: `BASE64URL(SHA256(code_verifier))`
 */
export async function generateCodeChallenge(
  codeVerifier: string,
): Promise<string> {
  const digest = await sha256(codeVerifier);
  return base64UrlEncode(digest);
}
