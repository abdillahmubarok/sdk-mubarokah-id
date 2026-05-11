// ============================================================================
// Mubarokah ID SDK — PKCE (Proof Key for Code Exchange) Utilities
// ============================================================================
//
// Implementasi PKCE (RFC 7636) yang isomorphic:
// - Browser: menggunakan WebCrypto API (window.crypto.subtle) — aman untuk React/SPA.
// - Node.js 18+: menggunakan globalThis.crypto (WebCrypto tersedia native).
// - Node.js < 18: fallback ke `node:crypto` lewat indirect require agar tidak
//   ikut ter-bundle ke build browser.
//
// Fungsi yang menggunakan SHA-256 (generateCodeChallenge, generatePKCEPair)
// bersifat async karena WebCrypto subtle.digest() mengembalikan Promise.
// ============================================================================

/**
 * Hasil generate PKCE pair.
 */
export interface PKCEPair {
  /** Random code verifier (simpan di session/sessionStorage, kirim saat token exchange) */
  codeVerifier: string;
  /** SHA-256 hash dari code verifier, base64url-encoded (kirim saat authorization) */
  codeChallenge: string;
}

// ---------------------------------------------------------------------------
// Environment detection & crypto source
// ---------------------------------------------------------------------------

/**
 * Referensi WebCrypto yang tersedia di environment saat ini.
 *
 * Urutan prioritas:
 * 1. `globalThis.crypto` — standar modern (Node 18+, browser, Deno, Bun, edge runtimes)
 * 2. `node:crypto` webcrypto — fallback untuk Node lama yang belum expose global
 */
function getWebCrypto(): Crypto {
  const globalCrypto = (globalThis as { crypto?: Crypto }).crypto;
  if (globalCrypto && typeof globalCrypto.getRandomValues === 'function' && globalCrypto.subtle) {
    return globalCrypto;
  }

  // Fallback ke node:crypto tanpa membuat bundler browser mem-bundle modul ini.
  // `Function('return require')` menghindari static analysis dari webpack/rollup/esbuild.
  if (typeof window === 'undefined') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const nodeRequire = Function('return typeof require === "function" ? require : null')() as
        | NodeRequire
        | null;
      if (nodeRequire) {
        const nodeCrypto = nodeRequire('node:crypto') as typeof import('node:crypto');
        if (nodeCrypto.webcrypto) {
          return nodeCrypto.webcrypto as unknown as Crypto;
        }
      }
    } catch {
      // fall through
    }
  }

  throw new Error(
    '[Mubarokah SDK] WebCrypto tidak tersedia di environment ini. ' +
      'Pastikan berjalan di browser modern atau Node.js >= 18.',
  );
}

// ---------------------------------------------------------------------------
// Encoding helpers (base64url)
// ---------------------------------------------------------------------------

/**
 * Encode Uint8Array ke base64url string (RFC 4648 §5) tanpa padding.
 * Bekerja di browser dan Node tanpa bergantung pada Buffer.
 */
function bytesToBase64Url(bytes: Uint8Array): string {
  // Bangun binary string dalam chunk untuk menghindari call-stack overflow pada
  // input besar (String.fromCharCode(...bytes) meledak di length > ~120k).
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunkSize)),
    );
  }

  const base64 =
    typeof btoa === 'function'
      ? btoa(binary)
      : // Node < 16 tanpa global btoa — pakai Buffer sebagai jaring pengaman.
        (globalThis as { Buffer?: { from: (b: string, e: string) => { toString: (e: string) => string } } })
          .Buffer!.from(binary, 'binary')
          .toString('base64');

  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate random code verifier untuk PKCE.
 *
 * Sesuai RFC 7636, code verifier adalah string acak cryptographically secure
 * sepanjang 43-128 karakter dari charset `[A-Z][a-z][0-9]-._~`.
 *
 * Implementasi ini meng-encode 32 byte acak menjadi base64url → menghasilkan
 * 43 karakter dengan 256 bit entropy (melebihi rekomendasi RFC).
 *
 * @returns Code verifier string (43 karakter base64url)
 *
 * @example
 * ```typescript
 * const verifier = generateCodeVerifier();
 * // => 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
 * ```
 */
export function generateCodeVerifier(): string {
  const bytes = new Uint8Array(32);
  getWebCrypto().getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

/**
 * Generate code challenge dari code verifier menggunakan SHA-256.
 *
 * Fungsi ini **async** karena WebCrypto `subtle.digest()` adalah Promise-based.
 * Konsisten di browser maupun Node 18+.
 *
 * @param codeVerifier - Code verifier yang sudah di-generate
 * @returns Promise resolving ke code challenge (base64url-encoded SHA-256 hash)
 *
 * @example
 * ```typescript
 * const verifier = generateCodeVerifier();
 * const challenge = await generateCodeChallenge(verifier);
 * // => 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
 * ```
 */
export async function generateCodeChallenge(codeVerifier: string): Promise<string> {
  const data = new TextEncoder().encode(codeVerifier);
  const hashBuffer = await getWebCrypto().subtle.digest('SHA-256', data);
  return bytesToBase64Url(new Uint8Array(hashBuffer));
}

/**
 * Generate PKCE code verifier dan code challenge pair.
 *
 * Fungsi convenience yang menggabungkan `generateCodeVerifier()` dan
 * `generateCodeChallenge()` dalam satu panggilan.
 *
 * @returns Promise resolving ke objek berisi `codeVerifier` dan `codeChallenge`
 *
 * @example
 * ```typescript
 * import { generatePKCEPair } from 'mubarokah-id-sdk';
 *
 * const { codeVerifier, codeChallenge } = await generatePKCEPair();
 *
 * // Simpan codeVerifier di sessionStorage (browser) atau session (Node)
 * sessionStorage.setItem('pkce_verifier', codeVerifier);
 *
 * // Kirim codeChallenge ke authorization endpoint
 * ```
 */
export async function generatePKCEPair(): Promise<PKCEPair> {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  return { codeVerifier, codeChallenge };
}

/**
 * Generate random state string untuk CSRF protection.
 *
 * State adalah opaque value yang dikirim ke authorization endpoint dan
 * divalidasi saat callback untuk mencegah Cross-Site Request Forgery.
 *
 * @param length - Panjang state dalam karakter base64url (default: 32, ≈ 192 bit entropy).
 *                 Nilai efektif akan dibulatkan ke atas agar byte source cukup.
 * @returns Random state string yang aman untuk URL
 *
 * @example
 * ```typescript
 * const state = generateState();
 * // Simpan ke session untuk divalidasi di callback
 * req.session.oauthState = state;
 * ```
 */
export function generateState(length: number = 32): string {
  if (!Number.isInteger(length) || length < 8) {
    throw new Error('[Mubarokah SDK] generateState length minimal 8 karakter.');
  }

  // Setiap byte menghasilkan ~1.333 karakter base64url, jadi kita ambil byte
  // lebih banyak lalu slice ke panjang yang diminta.
  const byteCount = Math.ceil((length * 3) / 4);
  const bytes = new Uint8Array(byteCount);
  getWebCrypto().getRandomValues(bytes);
  return bytesToBase64Url(bytes).slice(0, length);
}
