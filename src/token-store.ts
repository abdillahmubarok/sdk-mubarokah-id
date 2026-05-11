// ============================================================================
// Mubarokah ID SDK — Token Store & Persistence Helpers
// ============================================================================

import type { StoredTokens, TokenResponse, TokenStore } from './types.js';

/**
 * Ubah `TokenResponse` dari server menjadi `StoredTokens` dengan `expiresAt`
 * absolut (epoch ms) yang siap dipersist.
 *
 * Keuntungan memakai `expiresAt` daripada `expires_in`:
 * - Tidak perlu dihitung ulang saat dibaca dari storage.
 * - Tahan terhadap delay persist (mis. write ke Redis dengan latency).
 * - Konsisten dengan `AutoRefreshHandle` yang dipakai `withAutoRefresh`.
 *
 * @param response - Response dari token endpoint
 * @param issuedAt - Epoch ms saat token diterbitkan (default: sekarang).
 *   Gunakan timestamp custom bila token baru di-deserialize dari jaringan
 *   dan Anda ingin menghormati delay transit.
 * @returns Token object yang siap disimpan
 *
 * @example
 * ```typescript
 * const response = await client.auth.exchangeCode({ code });
 * const stored = tokenResponseToStored(response);
 *
 * await myTokenStore.setTokens(stored);
 * ```
 */
export function tokenResponseToStored(
  response: TokenResponse,
  issuedAt: number = Date.now(),
): StoredTokens {
  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token,
    expiresAt: issuedAt + response.expires_in * 1000,
    tokenType: response.token_type,
    scope: response.scope,
  };
}

/**
 * Cek apakah sebuah `StoredTokens` sudah expired (atau akan expired dalam
 * `skewMs` milidetik ke depan).
 *
 * @param stored - Token yang sudah disimpan
 * @param skewMs - Toleransi clock skew / proactive refresh window (default: 0)
 * @returns `true` jika token dianggap expired
 */
export function isStoredTokenExpired(stored: StoredTokens, skewMs: number = 0): boolean {
  return stored.expiresAt - skewMs <= Date.now();
}

/**
 * In-memory token store (default).
 *
 * Menyimpan token di memory proses. Token akan hilang saat restart.
 * Cocok untuk development, testing, atau single-request use case.
 *
 * Untuk production, implementasikan `TokenStore` interface dengan
 * storage persisten seperti Redis, database, atau encrypted file.
 *
 * @example
 * ```typescript
 * import { MubarokahClient, MemoryTokenStore, tokenResponseToStored } from 'mubarokah-id-sdk';
 *
 * const store = new MemoryTokenStore();
 * const response = await client.auth.exchangeCode({ code });
 * await store.setTokens(tokenResponseToStored(response));
 * ```
 *
 * @example Custom Redis Store
 * ```typescript
 * import { TokenStore, StoredTokens } from 'mubarokah-id-sdk';
 * import Redis from 'ioredis';
 *
 * class RedisTokenStore implements TokenStore {
 *   constructor(private redis: Redis, private key: string) {}
 *
 *   async getTokens(): Promise<StoredTokens | null> {
 *     const data = await this.redis.get(this.key);
 *     return data ? JSON.parse(data) : null;
 *   }
 *
 *   async setTokens(tokens: StoredTokens): Promise<void> {
 *     const ttlSec = Math.max(1, Math.floor((tokens.expiresAt - Date.now()) / 1000));
 *     await this.redis.set(this.key, JSON.stringify(tokens), 'EX', ttlSec);
 *   }
 *
 *   async clearTokens(): Promise<void> {
 *     await this.redis.del(this.key);
 *   }
 * }
 * ```
 */
export class MemoryTokenStore implements TokenStore {
  private tokens: StoredTokens | null = null;

  async getTokens(): Promise<StoredTokens | null> {
    return this.tokens;
  }

  async setTokens(tokens: StoredTokens): Promise<void> {
    this.tokens = { ...tokens };
  }

  async clearTokens(): Promise<void> {
    this.tokens = null;
  }
}
