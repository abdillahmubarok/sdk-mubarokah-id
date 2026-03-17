
# @mubarokah/auth-js

The official TypeScript SDK for integrating **Mubarokah ID SSO** into React and Next.js applications. This SDK implements the OAuth 2.0 Authorization Code Grant with Proof Key for Code Exchange (PKCE) for secure, browser-based authentication.

---

## Features

* 🔐 **OAuth 2.0 + PKCE** — Secure authorization flow designed for public clients (SPAs) without exposing client secrets.
* ⚛️ **React Ready** — Includes `MubarokahProvider` and `useMubarokahAuth` for seamless React integration.
* 🔄 **Automatic Token Refresh** — Handles token expiration and silent refreshing.
* 🛡️ **CSRF Protection** — Internal state validation to prevent Cross-Site Request Forgery attacks.
* 📦 **Zero External Dependencies** — Lightweight implementation using the native Web Crypto API.

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
  clientId: 'your-client-id', // Obtain from Mubarokah ID Dashboard
  redirectUri: '[https://your-app.com/callback](https://your-app.com/callback)', // Must match registered URI
  scope: 'view-user', // Request desired permissions
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <MubarokahProvider config={config}>
          {children}
        </MubarokahProvider>
      </body>
    </html>
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

Mubarokah ID uses scopes to control access to user data.

| Scope | Description | API Endpoints |
| :--- | :--- | :--- |
| `view-user` | **Basic Profile**: Access to ID, name, email, username, and profile picture. | `/api/user` |
| `detail-user` | **Detailed Profile**: Includes phone number, date of birth, and address. **Requires Admin Approval**. | `/api/user/details` |

---

## API Reference

### `MubarokahAuth` Instance Methods

* **`login()`**: Redirects the user to the Mubarokah ID authorization page at `https://accounts.mubarokah.com/oauth/authorize`.
* **`handleCallback()`**: Exchanges the authorization code received in the URL for access and refresh tokens at `https://accounts.mubarokah.com/oauth/token`.
* **`getUser()`**: Fetches basic profile information.
* **`getUserDetails()`**: Fetches sensitive profile data (if authorized).
* **`logout()`**: Clears local authentication state and redirects to the logout endpoint.

---

## Security Best Practices

* **Public Clients**: This SDK is designed for public clients where a `client_secret` cannot be kept secure.
* **State Validation**: Always utilize the `state` parameter to prevent CSRF attacks.
* **Token Storage**: Tokens are stored in `sessionStorage` by default to ensure they are cleared when the browser tab is closed.
* **Minimum Scopes**: Only request the scopes necessary for your application to function.

---

## License

MIT