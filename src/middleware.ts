// ============================================================================
// Mubarokah ID SDK — Express Middleware Helper
// ============================================================================

import type { MubarokahClient } from './client.js';
import type { CallbackMiddlewareOptions } from './types.js';

/**
 * Buat Express.js route handler untuk OAuth callback.
 *
 * Middleware ini secara otomatis:
 * 1. Mengambil authorization `code` dari query parameter
 * 2. Exchange code untuk tokens
 * 3. (Opsional) Fetch user info
 * 4. Memanggil `onSuccess` atau `onError` callback
 *
 * @param client - Instance MubarokahClient
 * @param options - Callback options (onSuccess, onError, dll)
 * @returns Express route handler function
 *
 * @example
 * ```typescript
 * import express from 'express';
 * import { MubarokahClient, createCallbackHandler } from 'mubarokah-id-sdk';
 *
 * const app = express();
 * const client = new MubarokahClient({ ... });
 *
 * // Login route
 * app.get('/auth/login', (req, res) => {
 *   const { url, state } = client.auth.getAuthorizationUrl();
 *   req.session.oauthState = state;
 *   res.redirect(url);
 * });
 *
 * // Callback route
 * app.get('/auth/callback', createCallbackHandler(client, {
 *   onSuccess: async (req, res, { tokens, user }) => {
 *     // Simpan tokens dan user data di session
 *     (req as any).session.tokens = tokens;
 *     (req as any).session.user = user;
 *     (res as any).redirect('/dashboard');
 *   },
 *   onError: async (req, res, error) => {
 *     console.error('OAuth error:', error);
 *     (res as any).redirect('/login?error=' + encodeURIComponent(error.message));
 *   },
 *   getState: (req) => (req as any).session?.oauthState,
 * }));
 * ```
 */
export function createCallbackHandler(
  client: MubarokahClient,
  options: CallbackMiddlewareOptions
): (req: unknown, res: unknown) => Promise<void> {
  const { onSuccess, onError, fetchUser = true, getState } = options;

  return async (req: unknown, res: unknown): Promise<void> => {
    try {
      const reqObj = req as Record<string, unknown>;
      const query = (reqObj.query ?? {}) as Record<string, string>;

      // Check for OAuth errors in callback
      if (query.error) {
        throw new Error(
          query.error_description
            ? `${query.error}: ${query.error_description}`
            : `OAuth error: ${query.error}`
        );
      }

      const code = query.code;
      if (!code) {
        throw new Error('Authorization code tidak ditemukan di callback URL.');
      }

      // Validate state parameter (CSRF protection)
      if (getState) {
        const savedState = getState(req);
        const receivedState = query.state;

        if (!savedState || !receivedState || savedState !== receivedState) {
          throw new Error(
            'State parameter tidak valid. Kemungkinan serangan CSRF. Silakan coba lagi.'
          );
        }
      }

      // Exchange code for tokens
      const tokens = await client.auth.exchangeCode({ code });

      // Optionally fetch user info
      let user;
      if (fetchUser && tokens.access_token) {
        user = await client.users.getUser(tokens.access_token);
      }

      await onSuccess(req, res, { tokens, user });
    } catch (error) {
      await onError(req, res, error instanceof Error ? error : new Error(String(error)));
    }
  };
}
