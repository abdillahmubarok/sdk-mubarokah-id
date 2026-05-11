import React, {
  createContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from 'react';
import { MubarokahClient } from '../client.js';
import { ApiError } from '../errors.js';
import type { UserInfo, MubarokahConfig } from '../types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Konfigurasi yang aman dipakai di browser: TIDAK memperbolehkan `clientSecret`.
 *
 * TypeScript akan menolak props yang mengandung `clientSecret` secara compile-time,
 * dan Provider juga melakukan runtime check tambahan.
 */
export type BrowserSafeMubarokahConfig = Omit<MubarokahConfig, 'clientSecret'>;

/**
 * Strategi penyimpanan access token di browser.
 *
 * - **`'memory'`** (default, paling aman): token disimpan hanya di memory
 *   React (via `useRef`). Reload halaman akan menghilangkan token sehingga
 *   user harus login ulang. Mengeliminasi XSS exfiltration risk.
 *
 * - **`'sessionStorage'`**: token disimpan di `sessionStorage` dan bertahan
 *   selama tab browser terbuka. Masih ada XSS risk tapi lebih kecil daripada
 *   `localStorage` (tidak share antar tab, hilang saat tab ditutup).
 *
 * ⚠️ `localStorage` **sengaja tidak didukung** karena rentan XSS persisten.
 *
 * Refresh token **tidak pernah** disimpan di browser untuk public client.
 * Untuk production dengan UX reload-friendly, pertimbangkan arsitektur
 * Backend-for-Frontend (BFF) dengan cookie `HttpOnly`.
 */
export type TokenPersistence = 'memory' | 'sessionStorage';

export interface MubarokahContextState {
  isAuthenticated: boolean;
  user: UserInfo | null;
  isLoading: boolean;
  error: Error | null;
  client: MubarokahClient | null;
  /**
   * Mulai flow login dengan redirect ke Mubarokah ID.
   *
   * Async karena PKCE code challenge dihasilkan via WebCrypto.
   * Panggil tanpa `await` sudah cukup (return Promise akan dieksekusi),
   * tetapi bila butuh error handling, gunakan `await` atau `.catch()`.
   */
  loginWithRedirect: (options?: { prompt?: 'consent' | 'login' }) => Promise<void>;
  logout: () => Promise<void>;
  /** Ambil access token aktif (dari memory/sessionStorage) atau null. */
  getToken: () => string | null;
  /** Refresh user profile dari server. Tidak melempar error bila gagal. */
  refreshUser: () => Promise<void>;
}

export const MubarokahContext = createContext<MubarokahContextState>({
  isAuthenticated: false,
  user: null,
  isLoading: true,
  error: null,
  client: null,
  loginWithRedirect: async () => {},
  logout: async () => {},
  getToken: () => null,
  refreshUser: async () => {},
});

export interface MubarokahProviderProps {
  /**
   * Konfigurasi SDK (tanpa `clientSecret`).
   *
   * ⚠️ `clientSecret` dilarang di bundle browser. TypeScript akan menolak
   * props yang menyertakannya dan Provider akan throw runtime error bila
   * terdeteksi saat boot.
   */
  config: BrowserSafeMubarokahConfig;
  children: ReactNode;
  storageKeyPrefix?: string;
  onRedirectCallback?: (user: UserInfo | null) => void;
  /**
   * Strategi penyimpanan access token. Default: `'memory'`.
   * @see TokenPersistence
   */
  persistence?: TokenPersistence;
}

// ---------------------------------------------------------------------------
// Internal: token holder yang bisa switch antara memory & sessionStorage
// ---------------------------------------------------------------------------

interface TokenHolder {
  get: () => string | null;
  set: (token: string) => void;
  clear: () => void;
}

function createTokenHolder(
  persistence: TokenPersistence,
  storageKey: string,
  memoryRef: React.MutableRefObject<string | null>,
): TokenHolder {
  if (persistence === 'sessionStorage' && typeof window !== 'undefined') {
    return {
      get: () => {
        // Sinkronkan memory cache dengan sessionStorage untuk akses cepat
        if (memoryRef.current) return memoryRef.current;
        const stored = window.sessionStorage.getItem(storageKey);
        memoryRef.current = stored;
        return stored;
      },
      set: (token) => {
        memoryRef.current = token;
        window.sessionStorage.setItem(storageKey, token);
      },
      clear: () => {
        memoryRef.current = null;
        window.sessionStorage.removeItem(storageKey);
      },
    };
  }

  // Memory-only (default, paling aman)
  return {
    get: () => memoryRef.current,
    set: (token) => {
      memoryRef.current = token;
    },
    clear: () => {
      memoryRef.current = null;
    },
  };
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

/**
 * `<MubarokahProvider>` memberikan konteks SSO Mubarokah ID ke komponen React.
 *
 * **Keamanan (lihat audit K-4):**
 * - Access token disimpan di memory secara default (tidak di `localStorage`).
 * - PKCE code_verifier & state disimpan sementara di `sessionStorage` hanya
 *   selama window redirect → callback, lalu dibersihkan sebelum network call
 *   untuk mencegah replay.
 * - Refresh token TIDAK pernah disimpan di browser (public client). Bila user
 *   reload tab, dia harus login ulang — trade-off keamanan vs UX yang
 *   disengaja. Untuk UX reload-friendly, gunakan arsitektur BFF dengan
 *   cookie `HttpOnly`.
 */
export const MubarokahProvider: React.FC<MubarokahProviderProps> = ({
  config,
  children,
  storageKeyPrefix = 'mubarokah_sso',
  onRedirectCallback,
  persistence = 'memory',
}) => {
  // --- Runtime guard: pastikan clientSecret tidak bocor ke browser ---
  if (
    typeof window !== 'undefined' &&
    typeof (config as unknown as Record<string, unknown>).clientSecret === 'string'
  ) {
    throw new Error(
      '[Mubarokah SDK] clientSecret terdeteksi pada props MubarokahProvider. ' +
        'client_secret dilarang berada di bundle browser. ' +
        'Hapus clientSecret dari config React dan gunakan PKCE, ' +
        'atau lakukan token exchange di backend via BFF pattern.',
    );
  }

  const [client] = useState(() => new MubarokahClient({ ...config }));
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const TOKEN_KEY = `${storageKeyPrefix}_token`;
  const PKCE_VERIFIER_KEY = `${storageKeyPrefix}_pkce_verifier`;
  const STATE_KEY = `${storageKeyPrefix}_state`;

  // Token disimpan via ref — tidak memicu re-render saat berubah dan
  // tidak bocor ke React DevTools props tree.
  const tokenMemoryRef = useRef<string | null>(null);
  const holderRef = useRef<TokenHolder>(
    createTokenHolder(persistence, TOKEN_KEY, tokenMemoryRef),
  );

  const getToken = useCallback(() => holderRef.current.get(), []);

  const fetchUser = useCallback(
    async (accessToken: string): Promise<UserInfo | null> => {
      try {
        return await client.users.getUser(accessToken);
      } catch (err) {
        if (err instanceof ApiError) {
          // unapproved_scope → aplikasi butuh approval admin, user reauth tidak menolong.
          // insufficient_scope → user harus login ulang dengan scope yang benar.
          // Kedua kasus: login dianggap sukses tapi profil tidak tersedia — UI bisa
          // memandu developer lewat state `error`.
          if (err.isUnapprovedScope() || err.isInsufficientScope()) {
            return null;
          }
          if (err.isForbidden()) {
            return null;
          }
        }
        throw err;
      }
    },
    [client],
  );

  const refreshUser = useCallback(async () => {
    const token = holderRef.current.get();
    if (!token) return;
    try {
      const next = await fetchUser(token);
      setUser(next);
    } catch {
      // Token invalid/expired — bersihkan dan reset state
      holderRef.current.clear();
      setUser(null);
      setIsAuthenticated(false);
    }
  }, [fetchUser]);

  useEffect(() => {
    let cancelled = false;

    /**
     * Bangun error yang bisa ditindaklanjuti developer berdasarkan ApiError
     * yang dilempar saat fetch user awal.
     */
    const buildActionableError = (err: unknown): Error => {
      if (err instanceof ApiError) {
        if (err.isUnapprovedScope()) {
          return new Error(
            'Aplikasi Anda belum mendapatkan approval admin Mubarokah ID untuk scope sensitif. ' +
              'Hubungi tim Mubarokah ID untuk proses approval — user tidak dapat menyelesaikan ini sendiri.',
          );
        }
        if (err.isInsufficientScope()) {
          return new Error(
            'Access token tidak memiliki scope yang diperlukan. ' +
              'Pastikan OAuth authorization URL meminta scope yang benar, lalu minta user login ulang.',
          );
        }
        if (err.isTokenExpired()) {
          return new Error('Sesi Anda telah kedaluwarsa. Silakan login ulang.');
        }
        if (err.isRateLimited()) {
          const retry = err.retryAfter ? ` (coba lagi dalam ${err.retryAfter}s)` : '';
          return new Error(`Rate limit Mubarokah ID tercapai${retry}.`);
        }
      }
      return err instanceof Error ? err : new Error(String(err));
    };

    const handleAuth = async () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const state = urlParams.get('state');
        const errorParam = urlParams.get('error');

        if (errorParam) {
          throw new Error(urlParams.get('error_description') || errorParam);
        }

        // --- 1. Handle OAuth Callback ---
        if (code && state) {
          const savedState = window.sessionStorage.getItem(STATE_KEY);
          const codeVerifier = window.sessionStorage.getItem(PKCE_VERIFIER_KEY);

          // Bersihkan PKCE state SEBELUM network call: authorization code
          // hanya sekali pakai — jika exchange gagal, user mulai flow baru.
          window.sessionStorage.removeItem(STATE_KEY);
          window.sessionStorage.removeItem(PKCE_VERIFIER_KEY);

          if (!savedState || savedState !== state) {
            throw new Error('State parameter mismatch. Kemungkinan percobaan CSRF.');
          }
          if (!codeVerifier) {
            throw new Error('PKCE code_verifier tidak ditemukan di session storage.');
          }

          const tokens = await client.auth.exchangeCode({ code, codeVerifier });
          if (cancelled) return;

          // ⚠️ Public client: refresh_token TIDAK disimpan di browser.
          holderRef.current.set(tokens.access_token);

          // Bersihkan query OAuth dari URL
          window.history.replaceState({}, document.title, window.location.pathname);

          let userProfile: UserInfo | null = null;
          try {
            userProfile = await client.users.getUser(tokens.access_token);
          } catch (err) {
            // Login tetap sukses meskipun profile tidak bisa diambil.
            // Developer dapat membaca `error` untuk memberikan UX yang sesuai.
            if (cancelled) return;
            setError(buildActionableError(err));
            userProfile = null;
          }

          if (cancelled) return;

          setUser(userProfile);
          setIsAuthenticated(true);
          onRedirectCallback?.(userProfile);
          return;
        }

        // --- 2. Existing session (sessionStorage persistence saja) ---
        const existingToken = holderRef.current.get();
        if (existingToken) {
          try {
            const userProfile = await client.users.getUser(existingToken);
            if (cancelled) return;
            setUser(userProfile);
            setIsAuthenticated(true);
          } catch (err) {
            if (cancelled) return;

            // Token tidak bisa dipakai untuk fetch profile
            if (err instanceof ApiError) {
              if (err.isUnauthorized()) {
                // Token benar-benar invalid — clear dan anggap logged-out
                holderRef.current.clear();
                setIsAuthenticated(false);
                setUser(null);
              } else if (err.isUnapprovedScope() || err.isInsufficientScope()) {
                // Token masih valid — user tetap "authenticated", profile kosong.
                // Developer diberi pesan actionable.
                setUser(null);
                setIsAuthenticated(true);
                setError(buildActionableError(err));
              } else {
                setError(buildActionableError(err));
              }
            } else {
              setError(err instanceof Error ? err : new Error(String(err)));
            }
          }
        }
      } catch (err) {
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.error('[Mubarokah SDK] Auth init error:', err);
        setError(buildActionableError(err));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    handleAuth();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loginWithRedirect = useCallback(
    async (options?: { prompt?: 'consent' | 'login' }) => {
      // Browser = public client → selalu pakai PKCE, tidak pernah clientSecret
      const { url, state, codeVerifier } = await client.auth.getAuthorizationUrl({
        usePKCE: true,
        prompt: options?.prompt,
      });

      if (!codeVerifier) {
        throw new Error('[Mubarokah SDK] Gagal membuat PKCE verifier.');
      }

      window.sessionStorage.setItem(PKCE_VERIFIER_KEY, codeVerifier);
      window.sessionStorage.setItem(STATE_KEY, state);

      window.location.assign(url);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client],
  );

  /**
   * ⚠️ PEMBERITAHUAN PENTING UNTUK DEVELOPER:
   * Metode ini tidak hanya menghapus sesi di aplikasi React Anda, tetapi juga
   * MENCABUT SESI PENGGUNA DI PUSAT MUBAROKAH ID.
   *
   * Disarankan menampilkan dialog konfirmasi: "Anda akan logout dari seluruh
   * layanan SSO Mubarokah ID", bukan hanya dari aplikasi ini.
   */
  const logout = useCallback(async () => {
    setIsLoading(true);
    const token = holderRef.current.get();

    try {
      if (token) {
        await client.auth.logout(token);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(
        '[Mubarokah SDK] Gagal memanggil endpoint SSO logout pusat, menghapus sesi lokal sebagai fallback.',
        e,
      );
    } finally {
      holderRef.current.clear();
      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem(PKCE_VERIFIER_KEY);
        window.sessionStorage.removeItem(STATE_KEY);
      }

      setUser(null);
      setIsAuthenticated(false);
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  return (
    <MubarokahContext.Provider
      value={{
        isAuthenticated,
        user,
        isLoading,
        error,
        client,
        loginWithRedirect,
        logout,
        getToken,
        refreshUser,
      }}
    >
      {children}
    </MubarokahContext.Provider>
  );
};
