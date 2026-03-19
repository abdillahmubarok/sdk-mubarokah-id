// ============================================================================
// Mubarokah ID SDK — Token Store
// ============================================================================

import type { StoredTokens, TokenStore } from './types.js';

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
 * import { MubarokahClient, MemoryTokenStore } from 'mubarokah-id-sdk';
 *
 * const client = new MubarokahClient({
 *   clientId: '...',
 *   clientSecret: '...',
 *   redirectUri: '...',
 * });
 *
 * // Default: MemoryTokenStore
 * // Custom: implementasi TokenStore sendiri
 * ```
 *
 * @example Custom Redis Store
 * ```typescript
 * import { TokenStore, StoredTokens } from 'mubarokah-id-sdk';
 * import Redis from 'ioredis';
 *
 * class RedisTokenStore implements TokenStore {
 *   private redis: Redis;
 *   private key: string;
 *
 *   constructor(redis: Redis, userId: string) {
 *     this.redis = redis;
 *     this.key = `tokens:${userId}`;
 *   }
 *
 *   async getTokens(): Promise<StoredTokens | null> {
 *     const data = await this.redis.get(this.key);
 *     return data ? JSON.parse(data) : null;
 *   }
 *
 *   async setTokens(tokens: StoredTokens): Promise<void> {
 *     await this.redis.set(this.key, JSON.stringify(tokens), 'EX', 86400);
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
