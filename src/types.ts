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
   * Client Secret dari aplikasi.
   *
   * ⚠️ **Keamanan:** `client_secret` HARUS disimpan di server-side saja.
   * Jangan pernah memasukkannya ke bundle React / SPA / mobile app.
   * Untuk public client (browser/mobile), gunakan PKCE tanpa `clientSecret`.
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

  /** Refresh token untuk mendapatkan access token baru (tidak ada pada client_credentials grant) */
  refresh_token?: string;

  /** Scopes yang diberikan */
  scope?: string;
}

/**
 * Data token yang disimpan, termasuk waktu expired dalam epoch millisecond.
 */
export interface StoredTokens {
  accessToken: string;
  refreshToken?: string;
  /** Epoch ms saat access token akan expired */
  expiresAt: number;
  tokenType: string;
  scope?: string;
}

/**
 * Handle token ringkas yang dipakai oleh `OAuthManager.withAutoRefresh()`.
 *
 * Sama seperti `StoredTokens` tetapi tanpa field metadata yang tidak dipakai
 * untuk keputusan refresh (`tokenType`, `scope`) sehingga konsumer bisa
 * dengan mudah menyusunnya dari `TokenResponse`.
 */
export interface AutoRefreshHandle {
  accessToken: string;
  refreshToken?: string;
  /** Epoch ms saat access token akan expired */
  expiresAt: number;
}

// ============================================================================
// User Types
// ============================================================================

/**
 * Informasi dasar user dari endpoint `GET /api/user`.
 *
 * Membutuhkan scope `view-user`.
 *
 * ### Catatan WhatsApp Registration
 *
 * User yang mendaftar via WhatsApp mungkin **tidak memiliki email**.
 * Dalam kasus tersebut `email` akan bernilai `null`. Aplikasi Anda WAJIB
 * menangani kondisi ini dan tidak boleh mengasumsikan email selalu ada.
 *
 * **Best practice:**
 * - Gunakan `id` sebagai primary key lokal, BUKAN `email`.
 * - Jika butuh email, tampilkan prompt "Lengkapi profil" ke user
 *   atau generate synthetic email (`${id}@sso.mubarokah.local`).
 *
 * @see https://docs-accounts.mubarokah.com — WhatsApp Authentication Flow
 */
export interface UserInfo {
  /** ID unik user di Mubarokah ID (numerik). Gunakan ini sebagai primary key. */
  id: number;

  /** Nama lengkap user (selalu ada) */
  name: string;

  /**
   * Alamat email user.
   *
   * ⚠️ Bernilai `null` untuk user yang mendaftar via WhatsApp dan belum
   * menautkan email.
   */
  email: string | null;

  /**
   * Username unik user.
   *
   * Bisa bernilai `null` jika user belum memilih username.
   */
  username: string | null;

  /** URL foto profil user. `null` jika user belum upload avatar. */
  profile_picture: string | null;

  /** Jenis kelamin user ("male", "female", "other"). `null` jika tidak diisi. */
  gender: string | null;
}

/**
 * Informasi detail user dari endpoint `GET /api/user/details`.
 *
 * Membutuhkan:
 * - Scope `detail-user`
 * - **Approval admin Mubarokah ID** untuk aplikasi client Anda
 *
 * Termasuk semua field dari `UserInfo` ditambah informasi sensitif berikut.
 *
 * ⚠️ Semua field tambahan bisa bernilai `null` jika user belum melengkapinya.
 *
 * @see https://docs-accounts.mubarokah.com — Get Detailed User Information
 */
export interface UserDetails extends UserInfo {
  /**
   * Nomor telepon user (terverifikasi via OTP WhatsApp).
   *
   * Ini adalah identifier utama untuk user WhatsApp-registered.
   * Field name sesuai response server: `phone_number` (bukan `phone`).
   */
  phone_number: string | null;

  /** Tanggal lahir user (format YYYY-MM-DD) */
  date_of_birth: string | null;

  /** Tempat lahir user */
  place_of_birth: string | null;

  /** Alamat lengkap user */
  address: string | null;

  /** Biografi / tentang user */
  bio: string | null;
}

/**
 * Type guard: cek apakah user adalah hasil registrasi WhatsApp (tanpa email).
 *
 * @example
 * ```typescript
 * if (isWhatsAppUser(user)) {
 *   // user.email adalah null di sini
 *   showEmailLinkingPrompt();
 * } else {
 *   // TypeScript tahu user.email adalah string
 *   sendEmail(user.email);
 * }
 * ```
 */
export function isWhatsAppUser(user: UserInfo): user is UserInfo & { email: null } {
  return user.email === null;
}

/**
 * Type guard: cek apakah user memiliki email (bukan WhatsApp-only).
 *
 * Mem-persempit tipe sehingga `user.email` terjamin `string`.
 */
export function hasEmail(user: UserInfo): user is UserInfo & { email: string } {
  return typeof user.email === 'string' && user.email.length > 0;
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
 * Opsi untuk OAuth callback middleware (Express & kompatibel).
 *
 * Middleware ini melakukan:
 * 1. Deteksi `error` pada query → forward ke `onError`.
 * 2. Validasi `state` CSRF via `getState` (WAJIB).
 * 3. Ambil `code_verifier` via `getCodeVerifier` (opsional, untuk PKCE).
 * 4. Panggil `clearStoredValues` untuk mencegah replay.
 * 5. Exchange code → tokens.
 * 6. (Opsional) Fetch user info.
 * 7. Forward ke `onSuccess`.
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
    data: { tokens: TokenResponse; user?: UserInfo },
  ) => void | Promise<void>;

  /**
   * Callback ketika OAuth gagal.
   */
  onError: (req: unknown, res: unknown, error: Error) => void | Promise<void>;

  /**
   * Otomatis fetch user info setelah token exchange.
   * @default true
   */
  fetchUser?: boolean;

  /**
   * **WAJIB.** Ambil state yang disimpan di session untuk validasi CSRF.
   * Jika tidak diisi, `createCallbackHandler` akan melempar error saat dibuat.
   */
  getState: (req: unknown) => string | undefined;

  /**
   * Opsional: ambil code_verifier dari session untuk flow PKCE.
   * Wajib dipasang jika authorization URL dibuat dengan `usePKCE: true`.
   */
  getCodeVerifier?: (req: unknown) => string | undefined;

  /**
   * Opsional tapi sangat direkomendasikan: hapus state dan code_verifier dari
   * session setelah divalidasi. Mencegah serangan replay dengan memastikan
   * authorization code → token exchange hanya bisa dilakukan sekali.
   */
  clearStoredValues?: (req: unknown) => void | Promise<void>;
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
