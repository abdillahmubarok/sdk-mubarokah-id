# @mubarokah/auth-js

The official TypeScript SDK for integrating **Mubarokah ID SSO** into React and Next.js applications. [cite_start]This SDK implements the OAuth 2.0 Authorization Code Grant with Proof Key for Code Exchange (PKCE) for secure, browser-based authentication[cite: 1, 2, 30, 31, 126, 127, 211, 247, 281].

---

## Features

* [cite_start]🔐 **OAuth 2.0 + PKCE** — Secure authorization flow designed for public clients (SPAs) without exposing client secrets[cite: 30, 31, 45, 126, 127, 177, 212, 247, 282].
* ⚛️ **React Ready** — Includes `MubarokahProvider` and `useMubarokahAuth` for seamless React integration.
* [cite_start]🔄 **Automatic Token Refresh** — Handles token expiration and silent refreshing[cite: 4, 72, 73, 145, 154, 180, 189, 215, 224, 250, 259, 325, 326, 329].
* [cite_start]🛡️ **CSRF Protection** — Internal state validation to prevent Cross-Site Request Forgery attacks[cite: 25, 26, 37, 120, 121, 122, 131, 138, 176, 211, 246, 281, 307].
* [cite_start]📦 **Zero External Dependencies** — Lightweight implementation using the native Web Crypto API[cite: 129, 391].

---

## Installation

Install the package directly from the GitHub repository:

```bash
npm install github:abdillahmubarok/sdk-mubarokah-id
# or
yarn add github:abdillahmubarok/sdk-mubarokah-id
```

**Peer Dependencies:** Requires `react >= 17.0.0` and `react-dom >= 17.0.0`.

---

## Getting Started (React / Next.js)

### 1. Configure the Provider

Wrap your application (e.g., in `app/layout.tsx` for Next.js) with the `MubarokahProvider`.

```tsx
'use client';

import { MubarokahProvider } from '@mubarokah/auth-js';

const config = {
  [cite_start]clientId: 'your-client-id', // Obtain from Mubarokah ID Dashboard [cite: 19, 20, 116, 148, 183, 218, 253]
  [cite_start]redirectUri: 'https://your-app.com/callback', // Must match registered URI [cite: 21, 22, 23, 117, 118]
  [cite_start]scope: 'view-user', // Request desired permissions [cite: 24, 119, 284, 304]
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <MubarokahProvider config={config}>
      {children}
    </MubarokahProvider>
  );
}
```

### 2. Use Authentication in Components

Use the `useMubarokahAuth` hook to access the user state and authentication methods.

```tsx
'use client';

import { useMubarokahAuth } from '@mubarokah/auth-js';

export default function Navbar() {
  const { isAuthenticated, isLoading, user, login, logout } = useMubarokahAuth();

  if (isLoading) return <span>Loading...</span>;

  if (isAuthenticated && user) {
    return (
      <div>
        <span>Welcome, {user.name}!</span>
        <button onClick={logout}>Sign Out</button>
      </div>
    );
  }

  return <button onClick={login}>Sign In with Mubarokah ID</button>;
}
```

---

## Scopes and Permissions

[cite_start]Mubarokah ID uses scopes to control access to user data[cite: 283, 284].

| Scope | Description | API Endpoints |
| :--- | :--- | :--- |
| `view-user` | [cite_start]**Basic Profile**: Access to ID, name, email, username, and profile picture[cite: 286, 287, 294, 295, 296]. | [cite_start]`/api/user` [cite: 297, 306, 335, 354] |
| `detail-user` | [cite_start]**Detailed Profile**: Includes phone number, date of birth, and address[cite: 286, 287, 297, 298]. [cite_start]**Requires Admin Approval**[cite: 299, 337, 338, 341, 343]. | [cite_start]`/api/user/details` [cite: 300, 314, 336, 343, 356] |

---

## API Reference

### `MubarokahAuth` Instance Methods

* [cite_start]**`login()`**: Redirects the user to the Mubarokah ID authorization page at `https://accounts.mubarokah.com/oauth/authorize`[cite: 7, 14, 15, 39, 42, 112, 113, 304, 313, 391].
* [cite_start]**`handleCallback()`**: Exchanges the authorization code received in the URL for access and refresh tokens at `https://accounts.mubarokah.com/oauth/token`[cite: 6, 11, 43, 44, 46, 47, 65, 143, 144, 146, 181, 216, 251, 305, 326].
* [cite_start]**`getUser()`**: Fetches basic profile information[cite: 297, 306, 335, 354].
* [cite_start]**`getUserDetails()`**: Fetches sensitive profile data (if authorized)[cite: 300, 314, 336, 356].
* **`logout()`**: Clears local authentication state and redirects to the logout endpoint.

---

## Security Best Practices

* [cite_start]**Public Clients**: This SDK is designed for public clients where a `client_secret` cannot be kept secure[cite: 30, 31, 45, 126, 127, 212, 247, 282].
* [cite_start]**State Validation**: Always utilize the `state` parameter to prevent CSRF attacks[cite: 25, 26, 37, 121, 122, 131, 138, 176, 211, 246, 281, 307].
* **Token Storage**: Tokens are stored in `sessionStorage` by default to ensure they are cleared when the browser tab is closed.
* [cite_start]**Minimum Scopes**: Only request the scopes necessary for your application to function[cite: 301, 302, 352, 353].

---

## License

MIT