// ============================================================================
// Mubarokah ID SDK — Type Definitions
// ============================================================================

/**
 * Konfigurasi untuk inisialisasi MubarokahClient.
 *
 * @example
 * ```typescript
 * const config: MubarokahConfig = {
 *   clientId: 'your-client-id',
 *   clientSecret: 'your-client-secret',
 *   redirectUri: 'http://localhost:3090/auth/callback',
 * };
 * ```
 */
export interface MubarokahConfig {
  /** Client ID dari aplikasi yang terdaftar di Mubarokah ID */
  clientId: string;

  /** 
   * Client Secret dari aplikasi (simpan di server-side, JANGAN di client-side).
   * Opsional jika menggunakan implicit flow atau PKCE public client di browser (React/SPA).
   */
  clientSecret?: string;

  /** URL callback yang terdaftar di Mubarokah ID */
  redirectUri: string;

  /**
   * Base URL dari server Mubarokah ID.
   * @default 'https://accounts.mubarokah.com'
   */
  baseUrl?: string;

  /**
   * Scopes default yang diminta saat authorization.
   * @default ['view-user']
   */
  scopes?: string[];

  /**
   * Timeout untuk HTTP requests dalam milidetik.
   * @default 30000 (30 detik)
   */
  timeout?: number;
}

/** Konfigurasi internal dengan semua field yang sudah di-resolve */
export interface ResolvedConfig {
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  baseUrl: string;
  scopes: string[];
  timeout: number;
}

// ============================================================================
// OAuth Token Types
// ============================================================================

/**
 * Response dari Token Endpoint Mubarokah ID.
 *
 * @example
 * ```json
 * {
 *   "token_type": "Bearer",
 *   "expires_in": 86400,
 *   "access_token": "eyJ0eXAiOiJKV1Qi...",
 *   "refresh_token": "def502003e1b8f3c...",
 *   "scope": "view-user detail-user"
 * }
 * ```
 */
export interface TokenResponse {
  /** Tipe token, biasanya "Bearer" */
  token_type: string;

  /** Masa berlaku access token dalam detik (misal 86400 = 24 jam) */
  expires_in: number;

  /** Access token untuk mengakses protected resources */
  access_token: string;

  /** Refresh token untuk mendapatkan access token baru (opsional, tidak ada di client_credentials) */
  refresh_token?: string;

  /** Scopes yang diberikan */
  scope?: string;
}

/**
 * Data token yang disimpan, termasuk waktu expired.
 */
export interface StoredTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  tokenType: string;
  scope?: string;
}

// ============================================================================
// User Types
// ============================================================================

/**
 * Informasi dasar user dari endpoint `/api/user`.
 * Membutuhkan scope `view-user`.
 */
export interface UserInfo {
  /** ID unik user di Mubarokah ID */
  id: string | number;

  /** Nama lengkap user */
  name: string;

  /** Alamat email user */
  email: string;

  /** Username unik user */
  username: string;

  /** URL foto profil user */
  profile_picture: string | null;

  /** Jenis kelamin user */
  gender: string | null;
}

/**
 * Informasi detail user dari endpoint `/api/user/details`.
 * Membutuhkan scope `detail-user` dan approval admin.
 *
 * Termasuk semua field dari `UserInfo` ditambah informasi sensitif.
 */
export interface UserDetails extends UserInfo {
  /** Nomor telepon user */
  phone: string | null;

  /** Tanggal lahir user */
  date_of_birth: string | null;

  /** Tempat lahir user */
  place_of_birth: string | null;

  /** Alamat lengkap user */
  address: string | null;

  /** Biografi / tentang user */
  bio: string | null;
}

// ============================================================================
// Authorization Types
// ============================================================================

/**
 * Parameter untuk membuat Authorization URL.
 */
export interface AuthorizationUrlOptions {
  /**
   * Scopes yang diminta. Jika tidak diisi, akan menggunakan scopes dari config.
   * @example ['view-user', 'detail-user']
   */
  scopes?: string[];

  /**
   * State parameter untuk CSRF protection. Jika tidak diisi, akan di-generate otomatis.
   */
  state?: string;

  /**
   * Prompt behavior.
   * - `'consent'` — Paksa consent screen meskipun sudah pernah approve.
   * - `'login'` — Paksa user untuk login ulang.
   */
  prompt?: 'consent' | 'login';

  /**
   * Aktifkan PKCE (Proof Key for Code Exchange).
   * Cocok untuk public clients (SPA, mobile app).
   * @default false
   */
  usePKCE?: boolean;

  /**
   * Custom redirect URI (override dari config).
   */
  redirectUri?: string;
}

/**
 * Hasil dari pembuatan Authorization URL.
 */
export interface AuthorizationUrlResult {
  /** URL lengkap untuk redirect user */
  url: string;

  /** State yang digunakan (simpan dan validasi saat callback) */
  state: string;

  /** Code verifier untuk PKCE (simpan untuk token exchange) */
  codeVerifier?: string;

  /** Code challenge yang dikirim ke authorization server */
  codeChallenge?: string;
}

/**
 * Parameter untuk exchange authorization code.
 */
export interface ExchangeCodeOptions {
  /** Authorization code dari callback */
  code: string;

  /** Redirect URI (harus sama dengan yang digunakan saat authorization) */
  redirectUri?: string;

  /** Code verifier jika menggunakan PKCE */
  codeVerifier?: string;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Response error dari OAuth/API Mubarokah ID.
 */
export interface OAuthErrorResponse {
  /** Kode error standar OAuth 2.0 */
  error: string;

  /** Deskripsi error */
  error_description?: string;

  /** Pesan error */
  message?: string;

  /** Petunjuk untuk memperbaiki error */
  hint?: string;
}

// ============================================================================
// Token Store Types
// ============================================================================

/**
 * Interface untuk custom token storage.
 *
 * Implementasikan interface ini untuk menyimpan token di Redis, database, dll.
 *
 * @example
 * ```typescript
 * class RedisTokenStore implements TokenStore {
 *   async getTokens() { ... }
 *   async setTokens(tokens) { ... }
 *   async clearTokens() { ... }
 * }
 * ```
 */
export interface TokenStore {
  /** Ambil token yang tersimpan */
  getTokens(): Promise<StoredTokens | null>;

  /** Simpan token baru */
  setTokens(tokens: StoredTokens): Promise<void>;

  /** Hapus semua token */
  clearTokens(): Promise<void>;
}

// ============================================================================
// Middleware Types
// ============================================================================

/**
 * Opsi untuk Express callback middleware.
 */
export interface CallbackMiddlewareOptions {
  /**
   * Callback ketika OAuth berhasil.
   * @param tokens — Token hasil exchange
   * @param user — Informasi user (jika fetchUser: true)
   */
  onSuccess: (
    req: unknown,
    res: unknown,
    data: { tokens: TokenResponse; user?: UserInfo }
  ) => void | Promise<void>;

  /**
   * Callback ketika OAuth gagal.
   */
  onError: (
    req: unknown,
    res: unknown,
    error: Error
  ) => void | Promise<void>;

  /**
   * Otomatis fetch user info setelah token exchange.
   * @default true
   */
  fetchUser?: boolean;

  /**
   * Fungsi untuk mendapatkan dan memvalidasi state dari session.
   */
  getState?: (req: unknown) => string | undefined;
}

// ============================================================================
// Enums & Constants
// ============================================================================

/** OAuth 2.0 Grant Types yang didukung */
export enum GrantType {
  AuthorizationCode = 'authorization_code',
  RefreshToken = 'refresh_token',
  ClientCredentials = 'client_credentials',
}

/** Scopes yang tersedia di Mubarokah ID */
export enum Scope {
  /** Akses informasi dasar user (nama, email, username, foto profil, gender) */
  ViewUser = 'view-user',

  /** Akses informasi detail user (telepon, tanggal lahir, alamat, bio) — perlu approval admin */
  DetailUser = 'detail-user',
}

/** Prompt options */
export enum Prompt {
  Consent = 'consent',
  Login = 'login',
}

/** Default configuration values */
export const DEFAULTS = {
  BASE_URL: 'https://accounts.mubarokah.com',
  SCOPES: ['view-user'] as string[],
  TIMEOUT: 30_000,
} as const;
