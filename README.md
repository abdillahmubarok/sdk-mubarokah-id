# Mubarokah ID SDK

TypeScript SDK for OAuth 2.0 integration with **Mubarokah ID** SSO (Single Sign-On). Simplifies the integration of modern applications with the Mubarokah ID authentication system powered by Laravel Passport.

[![NPM Version](https://img.shields.io/npm/v/mubarokah-id-sdk.svg)](https://www.npmjs.com/package/mubarokah-id-sdk)
[![NPM Downloads](https://img.shields.io/npm/dt/mubarokah-id-sdk.svg)](https://www.npmjs.com/package/mubarokah-id-sdk)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-green)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow)](https://github.com/abdillahmubarok/sdk-mubarokah-id/blob/main/LICENSE)

## ✨ Features

- 🔐 **Complete OAuth 2.0** — Authorization Code Grant, Refresh Token, Client Credentials
- ⚛️ **Native React Support** — Context Provider & Hooks for SPA (`mubarokah-id-sdk/react`)
- 🛡️ **PKCE Support** — Proof Key for Code Exchange for public clients
- 📦 **Zero Dependencies** — Uses native `fetch` (Node.js 18+)
- 🔄 **Dual Output** — CommonJS + ESM for maximum compatibility
- 📝 **Full TypeScript** — Type-safe with complete declarations
- 🚀 **Express.js Middleware** — Ready-to-use callback handler
- ⚡ **Token Management** — Extensible token store interface
- 🌐 **Error Handling** — Error classes with user-friendly messages

## 📋 Requirements

- **Node.js** >= 18.0.0
- **Mubarokah ID Account** with Client ID and Client Secret

## 🚀 Installation

```bash
npm install mubarokah-id-sdk
```

## ⚡ Quick Start

### 1. Initialize Client

```typescript
import { MubarokahClient } from 'mubarokah-id-sdk';

const client = new MubarokahClient({
  clientId: process.env.MUBAROKAH_CLIENT_ID!,
  clientSecret: process.env.MUBAROKAH_CLIENT_SECRET!,
  redirectUri: 'http://localhost:3090/auth/callback',
});
```

### 2. Generate Authorization URL

```typescript
const { url, state } = await client.auth.getAuthorizationUrl({
  scopes: ['view-user'],
});

// Save state in session for CSRF validation
req.session.oauthState = state;

// Redirect user to Mubarokah ID
res.redirect(url);
```

### 3. Handle Callback & Exchange Code

```typescript
// In callback route
const tokens = await client.auth.exchangeCode({
  code: req.query.code as string,
});

console.log(tokens.access_token);
console.log(tokens.refresh_token);
```

### 4. Fetch User Data

```typescript
const user = await client.users.getUser(tokens.access_token);
console.log(`Hello, ${user.name}!`);
// { id, name, email, username, profile_picture, gender }
// ⚠️ email, username, profile_picture, and gender may be null
// (e.g. for WhatsApp-registered users that haven't linked an email).
```

---

## 📖 Complete Guide

### Configuration

```typescript
const client = new MubarokahClient({
  // Required
  clientId: 'your-client-id',
  clientSecret: 'your-client-secret',
  redirectUri: 'https://yourapp.com/auth/callback',

  // Optional
  baseUrl: 'https://accounts.mubarokah.com', // Default
  scopes: ['view-user'],                      // Default
  timeout: 30000,                              // Default: 30 seconds
});
```

| Parameter      | Type       | Required | Default                            | Description                           |
| -------------- | ---------- | -------- | ---------------------------------- | ------------------------------------- |
| `clientId`     | `string`   | ✅     | —                                  | Your application's Client ID          |
| `clientSecret` | `string`   | ❌ (Yes for server)| —                          | Required for server apps, **optional** for React/SPA |
| `redirectUri`  | `string`   | ✅     | —                                  | Registered callback URL               |
| `baseUrl`      | `string`   | ❌     | `https://accounts.mubarokah.com`   | Base URL of Mubarokah ID server       |
| `scopes`       | `string[]` | ❌     | `['view-user']`                    | Default scopes                        |
| `timeout`      | `number`   | ❌     | `30000`                            | HTTP request timeout (ms)             |

---

### OAuth 2.0 Flows

#### Authorization Code Grant (Recommended)

Most common flow for server-side web applications:

```typescript
// Step 1: Redirect user to Mubarokah ID
app.get('/auth/login', async (req, res) => {
  const { url, state } = await client.auth.getAuthorizationUrl({
    scopes: ['view-user', 'detail-user'],
    prompt: 'consent',
  });
  req.session.oauthState = state;
  res.redirect(url);
});

// Step 2: Handle callback
app.get('/auth/callback', async (req, res) => {
  // Validate state (CSRF protection)
  if (req.query.state !== req.session.oauthState) {
    return res.status(403).send('Invalid state');
  }

  // Exchange code → tokens
  const tokens = await client.auth.exchangeCode({
    code: req.query.code as string,
  });

  // Fetch user data
  const user = await client.users.getUser(tokens.access_token);

  req.session.user = user;
  req.session.tokens = tokens;
  res.redirect('/dashboard');
});
```

#### Authorization Code + PKCE

For public clients (SPA, mobile app):

```typescript
import { MubarokahClient } from 'mubarokah-id-sdk';

// Generate URL with PKCE
const { url, state, codeVerifier } = await client.auth.getAuthorizationUrl({
  usePKCE: true,
});

// Save codeVerifier in session
req.session.codeVerifier = codeVerifier;

// Include codeVerifier during callback
const tokens = await client.auth.exchangeCode({
  code: req.query.code as string,
  codeVerifier: req.session.codeVerifier,
});
```

#### Refresh Token

```typescript
import { OAuthError } from 'mubarokah-id-sdk';

try {
  const newTokens = await client.auth.refreshToken(storedRefreshToken);
  // Update stored tokens
} catch (error) {
  if (error instanceof OAuthError && error.requiresReauth()) {
    // Redirect user to re-login
    res.redirect('/auth/login');
  }
}
```

#### Client Credentials (Machine-to-Machine)

```typescript
const { access_token } = await client.auth.clientCredentials('server-operations');
// Use for server-to-server operations
```

---

### User API

#### Basic Info (`view-user` scope)

```typescript
const user = await client.users.getUser(accessToken);
// user.id, user.name, user.email, user.username,
// user.profile_picture, user.gender
```

#### Detail Info (`detail-user` scope)

> ⚠️ Requires admin approval for your application.

```typescript
import { ApiError } from 'mubarokah-id-sdk';

try {
  const details = await client.users.getUserDetails(accessToken);
  // Additional fields: details.phone_number, details.date_of_birth,
  // details.place_of_birth, details.address, details.bio
  // All additional fields may be null.
} catch (error) {
  if (error instanceof ApiError) {
    if (error.isUnapprovedScope()) {
      // Your app has no admin approval for detail-user — contact Mubarokah ID.
    } else if (error.isInsufficientScope()) {
      // Token was not issued with detail-user — re-run the authorization flow.
    } else if (error.isTokenExpired()) {
      // Access token expired — refresh it.
    }
  }
}
```

---

### Express.js Middleware

The SDK provides a ready-to-use callback handler for Express:

```typescript
import express from 'express';
import { MubarokahClient, createCallbackHandler } from 'mubarokah-id-sdk';

const app = express();
const client = new MubarokahClient({ ... });

app.get('/auth/callback', createCallbackHandler(client, {
  // getState is REQUIRED — prevents accidental CSRF bypass
  getState:        (req) => (req as any).session?.oauthState,
  // Required if you used usePKCE at login time
  getCodeVerifier: (req) => (req as any).session?.codeVerifier,
  // Recommended — prevents replay of the authorization code
  clearStoredValues: (req) => {
    const s = (req as any).session;
    s.oauthState   = undefined;
    s.codeVerifier = undefined;
  },
  onSuccess: async (req, res, { tokens, user }) => {
    (req as any).session.tokens = tokens;
    (req as any).session.user   = user;
    (res as any).redirect('/dashboard');
  },
  onError: async (req, res, error) => {
    console.error('OAuth error:', error);
    (res as any).redirect('/login?error=auth_failed');
  },
  fetchUser: true, // default
}));
```

---

### React/SPA Integration

The SDK provides a native React Context and Hooks designed for Single Page Applications (SPA). It automatically handles the PKCE flow securely completely from the browser:

```tsx
// 1. Wrap your root app with MubarokahProvider
import { MubarokahProvider } from 'mubarokah-id-sdk/react';

function App() {
  return (
    <MubarokahProvider
      config={{
        clientId: 'your-client-id',
        // ⚠️ Do NOT pass clientSecret. TypeScript and a runtime guard
        // will reject it in browser environments.
        redirectUri: 'http://localhost:3000/callback',
      }}
      // Default: 'memory' (most secure — token vanishes on reload).
      // Use 'sessionStorage' if you need tab-lifetime persistence.
      persistence="memory"
    >
      <YourAppComponents />
    </MubarokahProvider>
  );
}

// 2. Use the Hooks anywhere in your components
import { useMubarokahAuth } from 'mubarokah-id-sdk/react';

function AuthButton() {
  const { isAuthenticated, user, isLoading, error, loginWithRedirect, logout } = useMubarokahAuth();

  if (isLoading) return <span>Loading...</span>;
  if (error)     return <span>Auth error: {error.message}</span>;

  if (isAuthenticated) {
    return (
      <div>
        <p>Welcome, {user?.name}</p>
        {!user?.email && <p><em>Link your email to receive notifications.</em></p>}
        <button onClick={() => logout()}>Logout</button>
      </div>
    );
  }

  return <button onClick={() => loginWithRedirect()}>Login with Mubarokah ID</button>;
}
```

> **⚠️ SINGLE SIGN-OUT WARNING:** Calling `logout()` via the React Hook (or `client.auth.logout()`) will not only clear your local React state but also **terminate the user's main SSO session on the Mubarokah ID central server**. It is highly recommended to show a confirmation dialog to your users indicating that they will be logged out from all Mubarokah ID affiliated apps concurrently.

---

### Error Handling

The SDK provides structured error classes:

```typescript
import {
  MubarokahError,  // Base error
  OAuthError,       // OAuth flow errors
  ApiError,         // API call errors
  ConfigError,      // Configuration errors
} from 'mubarokah-id-sdk';

try {
  const tokens = await client.auth.exchangeCode({ code: '...' });
} catch (error) {
  if (error instanceof OAuthError) {
    console.log(error.code);                  // e.g. 'invalid_grant'
    console.log(error.message);               // Description from the server
    console.log(error.hint);                  // Fix hint
    console.log(error.getUserFriendlyMessage()); // User friendly message
    console.log(error.isRetryable());         // false
    console.log(error.requiresReauth());      // true
  }

  if (error instanceof ApiError) {
    console.log(error.statusCode);            // 401, 403, etc.
    console.log(error.oauthCode);             // e.g. 'insufficient_scope' | 'unapproved_scope'
    console.log(error.isUnauthorized());      // token expired / invalid?
    console.log(error.isInsufficientScope()); // reauth with proper scope
    console.log(error.isUnapprovedScope());   // needs admin approval
    console.log(error.isRateLimited());       // 429 — read error.retryAfter
  }
}
```

---

### Token Storage

The SDK provides an extensible `TokenStore` interface:

```typescript
import { TokenStore, StoredTokens, MemoryTokenStore } from 'mubarokah-id-sdk';

// Default: In-Memory (for development)
const memoryStore = new MemoryTokenStore();

// Custom: Redis
class RedisTokenStore implements TokenStore {
  async getTokens(): Promise<StoredTokens | null> { /* ... */ }
  async setTokens(tokens: StoredTokens): Promise<void> { /* ... */ }
  async clearTokens(): Promise<void> { /* ... */ }
}
```

---

### PKCE Utilities

```typescript
import {
  generatePKCEPair,
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
} from 'mubarokah-id-sdk';

// Generate PKCE pair (async — uses WebCrypto)
const { codeVerifier, codeChallenge } = await generatePKCEPair();

// Or generate separately
const verifier  = generateCodeVerifier();
const challenge = await generateCodeChallenge(verifier);

// Generate state for CSRF protection
const state = generateState();
```

---

### Available Scopes

| Scope         | Data Accessed                                                        | Approval             |
| ------------- | -------------------------------------------------------------------- | -------------------- |
| `view-user`   | ID, Name, Email, Username, Profile Picture, Gender                   | Automatic            |
| `detail-user` | All data from `view-user` + Phone, Date of Birth, Address, Biography | Requires Admin Review|

```typescript
import { Scope } from 'mubarokah-id-sdk';

const { url } = client.auth.getAuthorizationUrl({
  scopes: [Scope.ViewUser, Scope.DetailUser],
});
```

---

## 🧪 Running the Example Application

1. **Clone and install dependencies:**

```bash
cd sdk-mubarokah-id
npm install
```

2. **Configure the environment:**

```bash
cp .env.example .env
# Edit .env with your Client ID and Client Secret
```

3. **Run the demo application:**

```bash
npm run example
```

4. **Open browser:** [http://localhost:3090](http://localhost:3090)

The demo application provides:
- 🔐 Login with Mubarokah ID (Authorization Code + optional PKCE)
- 👤 User profile dashboard
- 📋 User details (if the `detail-user` scope is approved by an admin)
- 🔄 Token refresh
- 🚪 Logout

---

## 🏗️ Build

```bash
# Build SDK (CJS + ESM)
npm run build

# Type checking
npm run typecheck

# Watch mode
npm run dev
```

---

## 📁 Project Structure

```text
sdk-mubarokah-id/
├── src/
│   ├── index.ts          # Public API exports
│   ├── client.ts         # MubarokahClient (entry point)
│   ├── oauth.ts          # OAuthManager (auth flows)
│   ├── users.ts          # UserManager (user API)
│   ├── types.ts          # TypeScript interfaces & enums
│   ├── errors.ts         # Custom error classes
│   ├── pkce.ts           # PKCE utilities
│   ├── token-store.ts    # Token storage interface
│   ├── middleware.ts     # Express middleware
│   └── react/            # Native React implementation (Context & Hooks)
├── examples/
│   └── express-app/
│       └── server.ts     # Demo application
├── dist/                 # Build output (CJS + ESM + declarations)
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── .env.example
└── README.md
```

---

## 🔒 Security Best Practices: Public vs Confidential Client

OAuth 2.0 defines two client profiles. Picking the right one determines which
APIs of this SDK you are allowed to use and how you store tokens.

### Confidential client (your server / backend)

Your server can store `clientSecret` safely — that is the definition.

- Use all of `OAuthManager`: `exchangeCode`, `refreshToken`,
  `clientCredentials`, `logout`, `withAutoRefresh`.
- Pass `clientSecret` in the config.
- Store tokens in a server-side store (Redis, DB, encrypted file) via the
  `TokenStore` interface.
- In Express, use `createCallbackHandler` with `getState` + `getCodeVerifier`
  + `clearStoredValues` wired to your session.

### Public client (SPA, mobile, desktop)

Your runtime cannot keep a secret. Anyone viewing the bundle can read it.

- **Never** set `clientSecret`. The SDK throws a `ConfigError` if you try to
  perform a token exchange from a browser with `clientSecret` set.
- **Always** use PKCE (`usePKCE: true` in `getAuthorizationUrl`).
- **Do not** store refresh tokens in the browser. The React provider does not
  persist them.
- Prefer `persistence="memory"` for access tokens. Tokens vanish on reload but
  XSS cannot exfiltrate what no longer exists.

```tsx
<MubarokahProvider
  config={{ clientId: 'your-client-id', redirectUri: 'https://app.example.com/callback' }}
  persistence="memory"   // 'sessionStorage' is available as opt-in
>
  <App />
</MubarokahProvider>
```

### Backend-for-Frontend (BFF) — recommended for production SPAs

If reload-survival, refresh-token lifecycle, and XSS hardening all matter,
do not treat the SPA as a public client. Put a thin backend in front of it:

```
┌───────────┐    1. /login         ┌─────────────┐      ┌────────────────┐
│           │ ──────────────────▶  │             │ 2.   │                │
│  Browser  │    (HttpOnly cookie) │  Your BFF   │ ───▶ │  Mubarokah ID  │
│           │ ◀──────────────────  │  (Node/PHP) │ ◀─── │                │
└───────────┘    3. user JSON      └─────────────┘      └────────────────┘
```

- The BFF runs this SDK as a **confidential client** (holds `clientSecret`).
- The browser never sees access or refresh tokens. The BFF exchanges cookie
  for token when proxying user-scoped requests.
- Set the session cookie `httpOnly: true`, `sameSite: 'lax'`,
  `secure: true` in production (see `examples/express-app/server.ts`).
- Your React app stays unchanged: swap `MubarokahProvider` for a plain
  `fetch('/api/me', { credentials: 'include' })` call.

### ⚠️ Do not put `clientSecret` in a browser

Even if bundled behind env-substitution, obfuscation, or "private" CDN paths:
the secret is trivially recoverable from any user's DevTools. Rotate it
immediately if this has ever happened.

---

## 🔐 Other Security Reminders

1. Use HTTPS everywhere in production.
2. Validate the `state` parameter on every callback (the middleware enforces
   this with a constant-time comparison).
3. Treat authorization codes as single-use — clear state and code_verifier
   **before** exchanging.
4. Keep the `detail-user` scope only for features that genuinely need it.
   Admin approval is required; users cannot self-service.
5. Monitor `ApiError.isRateLimited()` — Mubarokah ID enforces 100 req/min
   for `/api/user` and 50 req/min for `/api/user/details`.
6. Inform users before calling `client.auth.logout(token)` — it terminates
   the **global SSO** session, not just your app.

---

## 📄 License

MIT License — See the [LICENSE](./LICENSE) file for details.
