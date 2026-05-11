// ============================================================================
// Mubarokah ID SDK — OAuth Callback Middleware
// ============================================================================

import { timingSafeEqual } from 'node:crypto';
import type { MubarokahClient } from './client.js';
import type {
  CallbackMiddlewareOptions,
  OAuthErrorResponse,
  UserInfo,
} from './types.js';
import { ApiError, OAuthError } from './errors.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Bandingkan dua string secara constant-time untuk mencegah timing attack
 * pada validasi `state` parameter CSRF.
 */
function safeStringEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) {
    // Tetap lakukan comparison dengan panjang yang sama untuk masking timing.
    const pad = Buffer.alloc(Math.max(aBuf.length, bBuf.length));
    timingSafeEqual(pad, pad);
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}

/**
 * Bentuk bentuk-request yang kompatibel dengan Express (dan framework serupa).
 * Kita sengaja pakai `unknown`-based casting agar SDK tidak memaksa dependency
 * pada `@types/express`.
 */
interface RequestShape {
  query?: Record<string, string | string[] | undefined>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Buat route handler untuk OAuth callback (Express-kompatibel).
 *
 * Middleware ini secara otomatis:
 * 1. Mendeteksi error pada query (`?error=...`) → diteruskan ke `onError` sebagai `OAuthError`.
 * 2. Memvalidasi `state` dari session vs query (constant-time) untuk proteksi CSRF.
 * 3. Mengambil `code_verifier` (PKCE) dari session bila disediakan.
 * 4. Memanggil `clearStoredValues` SEBELUM token exchange — mencegah serangan replay
 *    bila exchange/fetch user gagal di tengah jalan.
 * 5. Menukar `code` dengan access token & refresh token.
 * 6. (Opsional) Memanggil `/api/user` untuk mengambil profil awal.
 * 7. Meneruskan hasil ke `onSuccess`.
 *
 * **Keamanan:**
 * - `getState` WAJIB diisi. Tanpa itu handler fail closed (lempar error saat dibuat).
 * - Comparison state memakai `timingSafeEqual`.
 * - State & verifier dihapus sebelum network call untuk menghindari race reuse.
 *
 * @example
 * ```typescript
 * app.get('/auth/callback', createCallbackHandler(client, {
 *   getState: (req) => (req as express.Request).session?.oauthState,
 *   getCodeVerifier: (req) => (req as express.Request).session?.codeVerifier,
 *   clearStoredValues: (req) => {
 *     const s = (req as express.Request).session;
 *     s.oauthState = undefined;
 *     s.codeVerifier = undefined;
 *   },
 *   onSuccess: async (req, res, { tokens, user }) => {
 *     (req as express.Request).session.tokens = tokens;
 *     (res as express.Response).redirect('/dashboard');
 *   },
 *   onError: async (req, res, error) => {
 *     (res as express.Response).redirect('/login?error=' + encodeURIComponent(error.message));
 *   },
 * }));
 * ```
 */
export function createCallbackHandler(
  client: MubarokahClient,
  options: CallbackMiddlewareOptions,
): (req: unknown, res: unknown) => Promise<void> {
  const { onSuccess, onError, fetchUser = true, getState, getCodeVerifier, clearStoredValues } = options;

  if (typeof onSuccess !== 'function' || typeof onError !== 'function') {
    throw new TypeError('[Mubarokah SDK] onSuccess dan onError wajib berupa function.');
  }
  if (typeof getState !== 'function') {
    throw new TypeError(
      '[Mubarokah SDK] getState wajib diisi untuk proteksi CSRF. ' +
        'Berikan fungsi yang mengembalikan state yang disimpan saat /auth/login.',
    );
  }

  return async (req: unknown, res: unknown): Promise<void> => {
    try {
      const query = ((req as RequestShape | null | undefined)?.query ?? {}) as Record<
        string,
        string | string[] | undefined
      >;

      const getParam = (key: string): string | undefined => {
        const value = query[key];
        if (Array.isArray(value)) return value[0];
        return value;
      };

      // 1. Deteksi error dari authorization server (mis. access_denied)
      const oauthErrorCode = getParam('error');
      if (oauthErrorCode) {
        const payload: OAuthErrorResponse = {
          error: oauthErrorCode,
          error_description: getParam('error_description'),
        };
        throw new OAuthError(payload, 400);
      }

      // 2. Validasi keberadaan authorization code
      const code = getParam('code');
      if (!code) {
        throw new OAuthError(
          {
            error: 'invalid_request',
            error_description: 'Authorization code tidak ditemukan di callback URL.',
          },
          400,
        );
      }

      // 3. Validasi state (CSRF) — constant time
      const savedState = getState(req);
      const receivedState = getParam('state');
      if (!savedState || !receivedState || !safeStringEqual(savedState, receivedState)) {
        throw new OAuthError(
          {
            error: 'invalid_request',
            error_description:
              'State parameter tidak valid atau tidak cocok. Kemungkinan serangan CSRF atau session expired.',
          },
          400,
        );
      }

      // 4. Ambil code_verifier (PKCE) bila tersedia
      const codeVerifier = getCodeVerifier?.(req);

      // 5. Bersihkan state/verifier SEBELUM token exchange untuk mencegah replay.
      //    Bila exchange/fetch user gagal, developer harus memulai flow baru —
      //    ini adalah sifat OAuth yang benar: authorization code hanya sekali pakai.
      if (clearStoredValues) {
        await clearStoredValues(req);
      }

      // 6. Token exchange
      const tokens = await client.auth.exchangeCode({ code, codeVerifier });

      // 7. Opsional: fetch user profile.
      //    403 insufficient/unapproved scope TIDAK menggagalkan login —
      //    login tetap berhasil, user info saja yang kosong. Developer bisa
      //    memberikan alur "lengkapi approval" setelahnya.
      let user: UserInfo | undefined;
      if (fetchUser && tokens.access_token) {
        try {
          user = await client.users.getUser(tokens.access_token);
        } catch (err) {
          if (!(err instanceof ApiError) || !err.isForbidden()) {
            throw err;
          }
        }
      }

      await onSuccess(req, res, { tokens, user });
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      await onError(req, res, normalized);
    }
  };
}
