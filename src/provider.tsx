/**
 * @mubarokah/auth-js — React Integration
 *
 * Provides `MubarokahProvider` (Context + auto-callback handling)
 * and `useMubarokahAuth` hook for easy React / Next.js usage.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { MubarokahAuth } from './client';
import type {
  MubarokahAuthConfig,
  AuthState,
  MubarokahUser,
  MubarokahUserDetails,
} from './types';

// ---------------------------------------------------------------------------
// Context value shape
// ---------------------------------------------------------------------------

interface MubarokahAuthContextValue extends AuthState {
  /** Redirect user to Mubarokah ID login. */
  login: () => Promise<void>;

  /** Clear authentication data. */
  logout: () => void;

  /** Fetch the basic user profile (`/api/user`). */
  getUser: () => Promise<MubarokahUser>;

  /** Fetch detailed user profile (`/api/user/details`). */
  getUserDetails: () => Promise<MubarokahUserDetails>;

  /** Underlying MubarokahAuth client instance. */
  client: MubarokahAuth;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const MubarokahAuthContext = createContext<MubarokahAuthContextValue | null>(
  null,
);

// ---------------------------------------------------------------------------
// Provider Props
// ---------------------------------------------------------------------------

interface MubarokahProviderProps {
  /** SDK configuration. */
  config: MubarokahAuthConfig;

  /**
   * If `true`, the provider will automatically attempt to handle the OAuth
   * callback when it detects `?code=` in the URL search params.
   * @default true
   */
  autoHandleCallback?: boolean;

  /**
   * Called after a successful callback + user fetch.
   * Useful for cleaning the URL or navigating away from the callback route.
   */
  onAuthSuccess?: (user: MubarokahUser) => void;

  /**
   * Called when an authentication error occurs.
   */
  onAuthError?: (error: Error) => void;

  children: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Provider Component
// ---------------------------------------------------------------------------

export function MubarokahProvider({
  config,
  autoHandleCallback = true,
  onAuthSuccess,
  onAuthError,
  children,
}: MubarokahProviderProps) {
  const clientRef = useRef<MubarokahAuth | null>(null);

  // Lazily instantiate the client so we only create it once
  if (!clientRef.current) {
    clientRef.current = new MubarokahAuth(config);
  }
  const client = clientRef.current;

  // -----------------------------------------------------------------------
  // State
  // -----------------------------------------------------------------------

  const [authState, setAuthState] = useState<AuthState>(() => ({
    user: null,
    isAuthenticated: client.isAuthenticated(),
    isLoading: false,
    error: null,
  }));

  // -----------------------------------------------------------------------
  // Auto-handle callback
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (!autoHandleCallback) return;

    const params = new URLSearchParams(window.location.search);
    const hasCode = params.has('code');
    const hasError = params.has('error');

    if (!hasCode && !hasError) return;

    let cancelled = false;

    const handleAuth = async () => {
      setAuthState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        await client.handleCallback();
        const user = await client.getUser();

        if (!cancelled) {
          setAuthState({
            user,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
          onAuthSuccess?.(user);

          // Clean URL query params after successful auth
          const cleanUrl =
            window.location.origin + window.location.pathname;
          window.history.replaceState({}, document.title, cleanUrl);
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        if (!cancelled) {
          setAuthState({
            user: null,
            isAuthenticated: false,
            isLoading: false,
            error: error.message,
          });
          onAuthError?.(error);
        }
      }
    };

    handleAuth();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -----------------------------------------------------------------------
  // Actions
  // -----------------------------------------------------------------------

  const login = useCallback(async () => {
    setAuthState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      await client.login();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setAuthState((prev) => ({ ...prev, isLoading: false, error: error.message }));
    }
  }, [client]);

  const logout = useCallback(() => {
    client.logout();
    setAuthState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
  }, [client]);

  const getUser = useCallback(async () => {
    return client.getUser();
  }, [client]);

  const getUserDetails = useCallback(async () => {
    return client.getUserDetails();
  }, [client]);

  // -----------------------------------------------------------------------
  // Context value (memoised)
  // -----------------------------------------------------------------------

  const value = useMemo<MubarokahAuthContextValue>(
    () => ({
      ...authState,
      login,
      logout,
      getUser,
      getUserDetails,
      client,
    }),
    [authState, login, logout, getUser, getUserDetails, client],
  );

  return (
    <MubarokahAuthContext.Provider value={value}>
      {children}
    </MubarokahAuthContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Custom hook to access Mubarokah authentication state and actions.
 *
 * Must be used within a `<MubarokahProvider>`.
 *
 * @example
 * ```tsx
 * function LoginButton() {
 *   const { isAuthenticated, user, login, logout } = useMubarokahAuth();
 *
 *   if (isAuthenticated) {
 *     return (
 *       <div>
 *         <p>Welcome, {user?.name}!</p>
 *         <button onClick={logout}>Logout</button>
 *       </div>
 *     );
 *   }
 *
 *   return <button onClick={login}>Login with Mubarokah ID</button>;
 * }
 * ```
 */
export function useMubarokahAuth(): MubarokahAuthContextValue {
  const context = useContext(MubarokahAuthContext);
  if (!context) {
    throw new Error(
      '[useMubarokahAuth] Must be used within a <MubarokahProvider>. ' +
        'Wrap your app (or the relevant subtree) with <MubarokahProvider config={...}>.',
    );
  }
  return context;
}
