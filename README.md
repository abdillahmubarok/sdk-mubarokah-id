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
const { url, state } = client.auth.getAuthorizationUrl({
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
app.get('/auth/login', (req, res) => {
  const { url, state } = client.auth.getAuthorizationUrl({
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
const { url, state, codeVerifier } = client.auth.getAuthorizationUrl({
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
  // Additional fields: details.phone, details.date_of_birth,
  // details.place_of_birth, details.address, details.bio
} catch (error) {
  if (error instanceof ApiError && error.isForbidden()) {
    console.log('Admin approval is required for the detail-user scope');
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
  onSuccess: async (req, res, { tokens, user }) => {
    (req as any).session.tokens = tokens;
    (req as any).session.user = user;
    (res as any).redirect('/dashboard');
  },
  onError: async (req, res, error) => {
    console.error('OAuth error:', error);
    (res as any).redirect('/login?error=auth_failed');
  },
  fetchUser: true,   // Auto-fetch user info (default: true)
  getState: (req) => (req as any).session?.oauthState,
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
    <MubarokahProvider config={{
      clientId: 'your-client-id',
      // clientSecret is OPTIONAL for React (omitted for security)
      redirectUri: 'http://localhost:3000/callback'
    }}>
      <YourAppComponents />
    </MubarokahProvider>
  );
}

// 2. Use the Hooks anywhere in your components
import { useMubarokahAuth } from 'mubarokah-id-sdk/react';

function AuthButton() {
  const { isAuthenticated, user, isLoading, loginWithRedirect, logout } = useMubarokahAuth();

  if (isLoading) return <span>Loading...</span>;

  if (isAuthenticated) {
    return (
      <div>
        <p>Welcome, {user?.name}</p>
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
    console.log(error.statusCode);       // 401, 403, etc.
    console.log(error.isUnauthorized()); // Token expired?
    console.log(error.isForbidden());    // Scope not approved?
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

// Generate PKCE pair
const { codeVerifier, codeChallenge } = generatePKCEPair();

// Or generate separately
const verifier = generateCodeVerifier(64);
const challenge = generateCodeChallenge(verifier);

// Generate state for CSRF protection
const state = generateState(40);
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

## 🔒 Security Best Practices

1. **DO NOT** store `clientSecret` in client-side code (browser/mobile)
2. **ALWAYS** use HTTPS in production
3. **ALWAYS** validate the `state` parameter to prevent CSRF
4. **USE** PKCE for public clients (SPAs, mobile apps)
5. **STORE** credentials in environment variables
6. **IMPLEMENT** token refresh logic for a seamless UX
7. **MONITOR** token usage for suspicious activity

---

## 📄 License

MIT License — See the [LICENSE](./LICENSE) file for details.
