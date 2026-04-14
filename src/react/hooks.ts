import { useContext } from 'react';
import { MubarokahContext } from './context.js';

/**
 * Hook kustom untuk mengakses authentication state dari Mubarokah ID.
 * 
 * ⚠️ Pastikan Hook ini dipanggil di dalam komponen yang di-wrap oleh `<MubarokahProvider>`.
 * 
 * @example
 * ```tsx
 * const { isAuthenticated, user, isLoading, loginWithRedirect, logout } = useMubarokahAuth();
 * 
 * if (isLoading) return <p>Loading...</p>;
 * 
 * if (!isAuthenticated) {
 *   return <button onClick={() => loginWithRedirect()}>Log In dengan Mubarokah ID</button>;
 * }
 * 
 * return (
 *   <div>
 *      <p>Halo, {user?.name}!</p>
 *      <button onClick={() => logout()}>Log Out Semua Layanan</button>
 *   </div>
 * );
 * ```
 */
export const useMubarokahAuth = () => {
  const context = useContext(MubarokahContext);

  if (context === undefined) {
    throw new Error('Error: useMubarokahAuth must be used within the <MubarokahProvider />');
  }

  return context;
};
