# @mubarokah/auth-js

> TypeScript SDK for integrating **Mubarokah ID SSO** (OAuth 2.0 + PKCE) into React / Next.js applications.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3+-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-17+-61dafb.svg)](https://react.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## Features

- 🔐 **OAuth 2.0 + PKCE** — Secure authorization flow for public clients (SPA)
- ⚛️ **React Integration** — `MubarokahProvider` + `useMubarokahAuth` hook
- 🔒 **Zero client_secret exposure** — Designed exclusively for browser environments
- 📦 **Zero external dependencies** — Uses Web Crypto API for PKCE
- 🎯 **Full TypeScript support** — Typed interfaces for all API responses

---

## Installation

```bash
npm install @mubarokah/auth-js
# or
yarn add @mubarokah/auth-js
# or
pnpm add @mubarokah/auth-js
```

**Peer Dependencies:** `react >= 17.0.0`, `react-dom >= 17.0.0`

---

## Quick Start (React / Next.js)

### 1. Wrap your app with `MubarokahProvider`

```tsx
// app/layout.tsx  (Next.js App Router)
'use client';

import { MubarokahProvider } from '@mubarokah/auth-js';

const authConfig = {
  clientId: 'YOUR_CLIENT_ID',
  redirectUri: 'http://localhost:3000/auth/callback',
  scope: 'view-user',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <MubarokahProvider
          config={authConfig}
          onAuthSuccess={(user) => console.log('Logged in:', user.name)}
          onAuthError={(err) => console.error('Auth failed:', err)}
        >
          {children}
        </MubarokahProvider>
      </body>
    </html>
  );
}
```

### 2. Use the `useMubarokahAuth` hook

```tsx
'use client';

import { useMubarokahAuth } from '@mubarokah/auth-js';

export default function LoginButton() {
  const { isAuthenticated, isLoading, user, login, logout } = useMubarokahAuth();

  if (isLoading) return <p>Loading...</p>;

  if (isAuthenticated && user) {
    return (
      <div>
        <p>Welcome, {user.name}!</p>
        <button onClick={logout}>Logout</button>
      </div>
    );
  }

  return <button onClick={login}>Login with Mubarokah ID</button>;
}
```

### 3. Create a callback page

```tsx
// app/auth/callback/page.tsx
'use client';

export default function CallbackPage() {
  // MubarokahProvider auto-handles the callback when it detects ?code= in the URL.
  // You can show a loading spinner here while the token exchange completes.
  return <p>Authenticating...</p>;
}
```

---

## Standalone Usage (without React)

```ts
import { MubarokahAuth } from '@mubarokah/auth-js';

const auth = new MubarokahAuth({
  clientId: 'YOUR_CLIENT_ID',
  redirectUri: 'http://localhost:3000/callback',
  scope: 'view-user detail-user',
});

// Redirect to login
await auth.login();

// On callback page
const tokens = await auth.handleCallback();
const user = await auth.getUser();
const details = await auth.getUserDetails();

// Check auth state
auth.isAuthenticated(); // true
auth.isTokenExpired();  // false

// Logout
auth.logout();
```

---

## API Reference

### `MubarokahAuth` Class

| Method | Returns | Description |
|---|---|---|
| `login()` | `Promise<void>` | Redirect to Mubarokah ID login |
| `getAuthorizationUrl()` | `Promise<string>` | Get the authorization URL without redirecting |
| `handleCallback()` | `Promise<TokenResponse>` | Handle OAuth callback and exchange code for tokens |
| `getToken()` | `string \| null` | Get current access token |
| `isTokenExpired()` | `boolean` | Check if token has expired |
| `isAuthenticated()` | `boolean` | Check if user is authenticated |
| `getUser()` | `Promise<MubarokahUser>` | Fetch basic user profile |
| `getUserDetails()` | `Promise<MubarokahUserDetails>` | Fetch detailed user profile |
| `logout()` | `void` | Clear all stored auth data |

### `MubarokahAuthConfig`

| Property | Type | Required | Default |
|---|---|---|---|
| `clientId` | `string` | ✅ | — |
| `redirectUri` | `string` | ✅ | — |
| `scope` | `string` | ❌ | `"view-user"` |
| `providerUrl` | `string` | ❌ | `"https://accounts.mubarokah.com"` |

### Available Scopes

| Scope | Data Access | Endpoint |
|---|---|---|
| `view-user` | Basic profile (name, email, username, avatar, gender) | `/api/user` |
| `detail-user` | Extended data (phone, DOB, address, bio) — requires admin approval | `/api/user/details` |

---

## Security

- **PKCE** is used for all authorization flows (no `client_secret` on client side)
- **State parameter** validated against CSRF attacks
- **sessionStorage** used for token storage (cleared on tab close)
- **60-second buffer** before token expiry to prevent edge-case failures

---

## License

MIT
