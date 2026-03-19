// ============================================================================
// Mubarokah ID SDK — PKCE (Proof Key for Code Exchange) Utilities
// ============================================================================

import { randomBytes, createHash } from 'node:crypto';

/**
 * Hasil generate PKCE pair.
 */
export interface PKCEPair {
  /** Random code verifier (simpan di session, kirim saat token exchange) */
  codeVerifier: string;
  /** SHA-256 hash dari code verifier, base64url-encoded (kirim saat authorization) */
  codeChallenge: string;
}

/**
 * Generate random code verifier untuk PKCE.
 *
 * Menghasilkan string acak 43-128 karakter yang aman secara kriptografis
 * sesuai spesifikasi RFC 7636.
 *
 * @param length - Panjang code verifier (default: 64)
 * @returns Code verifier string
 *
 * @example
 * ```typescript
 * const verifier = generateCodeVerifier();
 * // => 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk...'
 * ```
 */
export function generateCodeVerifier(length: number = 64): string {
  const allowedChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const bytes = randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += allowedChars[bytes[i] % allowedChars.length];
  }
  return result;
}

/**
 * Generate code challenge dari code verifier menggunakan SHA-256.
 *
 * @param codeVerifier - Code verifier yang sudah di-generate
 * @returns Code challenge (base64url-encoded)
 *
 * @example
 * ```typescript
 * const challenge = generateCodeChallenge(verifier);
 * // => 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
 * ```
 */
export function generateCodeChallenge(codeVerifier: string): string {
  const hash = createHash('sha256').update(codeVerifier).digest('base64');
  // Convert base64 to base64url (RFC 4648)
  return hash.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Generate PKCE code verifier dan code challenge pair.
 *
 * Fungsi convenience yang menggabungkan `generateCodeVerifier()` dan
 * `generateCodeChallenge()` dalam satu panggilan.
 *
 * @returns Objek berisi codeVerifier dan codeChallenge
 *
 * @example
 * ```typescript
 * import { generatePKCEPair } from 'mubarokah-id-sdk';
 *
 * const { codeVerifier, codeChallenge } = generatePKCEPair();
 *
 * // Simpan codeVerifier di session
 * req.session.codeVerifier = codeVerifier;
 *
 * // Kirim codeChallenge ke authorization endpoint
 * const authUrl = client.auth.getAuthorizationUrl({
 *   usePKCE: true, // SDK handle otomatis
 * });
 * ```
 */
export function generatePKCEPair(): PKCEPair {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  return { codeVerifier, codeChallenge };
}

/**
 * Generate random state string untuk CSRF protection.
 *
 * @param length - Panjang state string (default: 40)
 * @returns Random state string
 */
export function generateState(length: number = 40): string {
  return randomBytes(Math.ceil(length / 2))
    .toString('hex')
    .slice(0, length);
}
