import React, { createContext, useEffect, useState, ReactNode } from 'react';
import { MubarokahClient } from '../client.js';
import type { UserInfo, MubarokahConfig } from '../types.js';

export interface MubarokahContextState {
  isAuthenticated: boolean;
  user: UserInfo | null;
  isLoading: boolean;
  error: Error | null;
  client: MubarokahClient | null;
  loginWithRedirect: (options?: { prompt?: 'consent' | 'login' }) => void;
  logout: () => Promise<void>;
  getToken: () => string | null;
}

export const MubarokahContext = createContext<MubarokahContextState>({
  isAuthenticated: false,
  user: null,
  isLoading: true,
  error: null,
  client: null,
  loginWithRedirect: () => {},
  logout: async () => {},
  getToken: () => null,
});

export interface MubarokahProviderProps {
  config: Omit<MubarokahConfig, 'clientSecret'> & { clientSecret?: string };
  children: ReactNode;
  storageKeyPrefix?: string;
  onRedirectCallback?: (user: UserInfo | null) => void;
}

/**
 * MubarokahProvider mem-wrap aplikasi React Anda untuk memberikan konteks SSO.
 * 
 * Secara bawaan, provider ini menggunakan `localStorage` untuk menyimpan access_token 
 * dan `sessionStorage` untuk proses pertukaran PKCE yang lebih aman.
 */
export const MubarokahProvider: React.FC<MubarokahProviderProps> = ({
  config,
  children,
  storageKeyPrefix = 'mubarokah_sso',
  onRedirectCallback,
}) => {
  const [client] = useState(() => new MubarokahClient({ ...config }));
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const TOKEN_KEY = `${storageKeyPrefix}_token`;
  const PKCE_VERIFIER_KEY = `${storageKeyPrefix}_pkce_verifier`;
  const STATE_KEY = `${storageKeyPrefix}_state`;

  useEffect(() => {
    const handleAuth = async () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const state = urlParams.get('state');
        const errorParam = urlParams.get('error');

        if (errorParam) {
          throw new Error(urlParams.get('error_description') || errorParam);
        }

        // --- 1. Handle Callback Flow (Exchange Code) ---
        if (code && state) {
          const savedState = sessionStorage.getItem(STATE_KEY);
          const codeVerifier = sessionStorage.getItem(PKCE_VERIFIER_KEY);

          if (state !== savedState) {
            throw new Error('State parameter mismatch. Kemungkinan percobaan CSRF.');
          }
          if (!codeVerifier) {
            throw new Error('Code verifier tidak ditemukan di session storage.');
          }

          // Exchange the code for an access token
          const tokens = await client.auth.exchangeCode({
            code,
            codeVerifier,
          });

          // Clean up PKCE session storage
          sessionStorage.removeItem(STATE_KEY);
          sessionStorage.removeItem(PKCE_VERIFIER_KEY);

          // Save token to localStorage for SPA persistence
          localStorage.setItem(TOKEN_KEY, tokens.access_token);

          // Hapus parameter OAuth dari URL browser untuk kebersihan
          window.history.replaceState({}, document.title, window.location.pathname);
          
          setIsAuthenticated(true);
          
          // Fetch initial user profile
          const userProfile = await client.users.getUser(tokens.access_token);
          setUser(userProfile);
          
          if (onRedirectCallback) {
            onRedirectCallback(userProfile);
          }
          return;
        }

        // --- 2. Handle Existing Session Flow ---
        const existingToken = localStorage.getItem(TOKEN_KEY);
        if (existingToken) {
          try {
            // Verify if token is still valid by fetching user
            const userProfile = await client.users.getUser(existingToken);
            setUser(userProfile);
            setIsAuthenticated(true);
          } catch (e) {
            // Token likely expired or invalid
            localStorage.removeItem(TOKEN_KEY);
            setIsAuthenticated(false);
            setUser(null);
          }
        }
      } catch (err) {
        console.error('Mubarokah SSO Error:', err);
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setIsLoading(false);
      }
    };

    handleAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loginWithRedirect = (options?: { prompt?: 'consent' | 'login' }) => {
    // We force PKCE for the browser for maximum security
    const { url, state, codeVerifier } = client.auth.getAuthorizationUrl({
      usePKCE: true,
      prompt: options?.prompt,
    });

    if (codeVerifier) {
      sessionStorage.setItem(PKCE_VERIFIER_KEY, codeVerifier);
      sessionStorage.setItem(STATE_KEY, state);
    }

    // Arahkan ke Halaman Login Mubarokah ID
    window.location.assign(url);
  };

  /**
   * ⚠️ PEMBERITAHUAN PENTING UNTUK DEVELOPER:
   * Metode ini tidak hanya menghapus sesi di aplikasi React Anda,
   * tetapi juga MENCABUT SESI PENGGUNA DI PUSAT MUBAROKAH ID.
   * 
   * Sangat disarankan untuk menampilkan Alert / Dialog Konfirmasi kepada pengguna
   * bahwa "Anda akan Logout dari seluruh layanan SSO Mubarokah ID", 
   * bukan hanya dari aplikasi ini saja.
   */
  const logout = async () => {
    setIsLoading(true);
    const token = localStorage.getItem(TOKEN_KEY);
    
    try {
      if (token) {
        // Panggil endpoint global logout
        await client.auth.logout(token);
      }
    } catch (e) {
      console.warn('Gagal memanggil endpoint SSO logout pusat, menghapus sesi lokal fallback.', e);
    } finally {
      // Selalu bersihkan sesi lokal terlepas dari sukses/tidaknya API pusat
      localStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(PKCE_VERIFIER_KEY);
      sessionStorage.removeItem(STATE_KEY);
      
      setUser(null);
      setIsAuthenticated(false);
      setIsLoading(false);
    }
  };

  const getToken = () => localStorage.getItem(TOKEN_KEY);

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
      }}
    >
      {children}
    </MubarokahContext.Provider>
  );
};
