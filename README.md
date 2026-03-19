# Mubarokah ID SDK

TypeScript SDK untuk integrasi OAuth 2.0 dengan **Mubarokah ID** SSO (Single Sign-On). Mempermudah developer mengintegrasikan aplikasi mereka dengan sistem autentikasi Mubarokah ID yang berbasis Laravel Passport.

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-green)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow)](./LICENSE)

## ✨ Fitur

- 🔐 **OAuth 2.0 Lengkap** — Authorization Code Grant, Refresh Token, Client Credentials
- 🛡️ **PKCE Support** — Proof Key for Code Exchange untuk public clients
- 📦 **Zero Dependencies** — Menggunakan native `fetch` (Node.js 18+)
- 🔄 **Dual Output** — CommonJS + ESM untuk kompatibilitas maksimal
- 📝 **Full TypeScript** — Type-safe dengan declarations lengkap
- 🚀 **Express.js Middleware** — Callback handler siap pakai
- ⚡ **Token Management** — Interface token store yang extensible
- 🌐 **Error Handling** — Error classes dengan pesan user-friendly (Bahasa Indonesia)

## 📋 Persyaratan

- **Node.js** >= 18.0.0
- **Akun Mubarokah ID** dengan Client ID dan Client Secret

## 🚀 Instalasi

```bash
npm install mubarokah-id-sdk
```

## ⚡ Quick Start

### 1. Inisialisasi Client

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

// Simpan state di session untuk validasi CSRF
req.session.oauthState = state;

// Redirect user ke Mubarokah ID
res.redirect(url);
```

### 3. Handle Callback & Exchange Code

```typescript
// Di callback route
const tokens = await client.auth.exchangeCode({
  code: req.query.code as string,
});

console.log(tokens.access_token);
console.log(tokens.refresh_token);
```

### 4. Ambil Data User

```typescript
const user = await client.users.getUser(tokens.access_token);
console.log(`Halo, ${user.name}!`);
// { id, name, email, username, profile_picture, gender }
```

---

## 📖 Panduan Lengkap

### Konfigurasi

```typescript
const client = new MubarokahClient({
  // Wajib
  clientId: 'your-client-id',
  clientSecret: 'your-client-secret',
  redirectUri: 'https://yourapp.com/auth/callback',

  // Opsional
  baseUrl: 'https://accounts.mubarokah.com', // Default
  scopes: ['view-user'],                      // Default
  timeout: 30000,                              // Default: 30 detik
});
```

| Parameter      | Tipe       | Wajib | Default                            | Deskripsi                           |
| -------------- | ---------- | ----- | ---------------------------------- | ----------------------------------- |
| `clientId`     | `string`   | ✅     | —                                  | Client ID aplikasi Anda             |
| `clientSecret` | `string`   | ✅     | —                                  | Client Secret (simpan di server!)   |
| `redirectUri`  | `string`   | ✅     | —                                  | URL callback yang terdaftar         |
| `baseUrl`      | `string`   | ❌     | `https://accounts.mubarokah.com`   | Base URL server Mubarokah ID        |
| `scopes`       | `string[]` | ❌     | `['view-user']`                    | Scopes default                      |
| `timeout`      | `number`   | ❌     | `30000`                            | Timeout HTTP request (ms)           |

---

### OAuth 2.0 Flows

#### Authorization Code Grant (Recommended)

Flow paling umum untuk aplikasi web server-side:

```typescript
// Step 1: Redirect user ke Mubarokah ID
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
  // Validasi state (CSRF protection)
  if (req.query.state !== req.session.oauthState) {
    return res.status(403).send('Invalid state');
  }

  // Exchange code → tokens
  const tokens = await client.auth.exchangeCode({
    code: req.query.code as string,
  });

  // Ambil user data
  const user = await client.users.getUser(tokens.access_token);

  req.session.user = user;
  req.session.tokens = tokens;
  res.redirect('/dashboard');
});
```

#### Authorization Code + PKCE

Untuk public clients (SPA, mobile app):

```typescript
import { MubarokahClient } from 'mubarokah-id-sdk';

// Generate URL dengan PKCE
const { url, state, codeVerifier } = client.auth.getAuthorizationUrl({
  usePKCE: true,
});

// Simpan codeVerifier di session
req.session.codeVerifier = codeVerifier;

// Saat callback, sertakan codeVerifier
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
    // Redirect user untuk login ulang
    res.redirect('/auth/login');
  }
}
```

#### Client Credentials (Machine-to-Machine)

```typescript
const { access_token } = await client.auth.clientCredentials('server-operations');
// Gunakan untuk operasi server-to-server
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

> ⚠️ Memerlukan approval admin untuk aplikasi Anda.

```typescript
import { ApiError } from 'mubarokah-id-sdk';

try {
  const details = await client.users.getUserDetails(accessToken);
  // Tambahan: details.phone, details.date_of_birth,
  // details.place_of_birth, details.address, details.bio
} catch (error) {
  if (error instanceof ApiError && error.isForbidden()) {
    console.log('Perlu approval admin untuk scope detail-user');
  }
}
```

---

### Express.js Middleware

SDK menyediakan callback handler siap pakai untuk Express:

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

### Error Handling

SDK menyediakan error classes yang terstruktur:

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
    console.log(error.code);                  // 'invalid_grant'
    console.log(error.message);               // Deskripsi dari server
    console.log(error.hint);                  // Petunjuk perbaikan
    console.log(error.getUserFriendlyMessage()); // Pesan Bahasa Indonesia
    console.log(error.isRetryable());         // false
    console.log(error.requiresReauth());      // true
  }

  if (error instanceof ApiError) {
    console.log(error.statusCode);    // 401, 403, dll
    console.log(error.isUnauthorized()); // Token expired?
    console.log(error.isForbidden());   // Scope belum di-approve?
  }
}
```

---

### Token Storage

SDK menyediakan interface `TokenStore` yang bisa di-extend:

```typescript
import { TokenStore, StoredTokens, MemoryTokenStore } from 'mubarokah-id-sdk';

// Default: In-Memory (untuk development)
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

// Atau generate terpisah
const verifier = generateCodeVerifier(64);
const challenge = generateCodeChallenge(verifier);

// Generate state untuk CSRF protection
const state = generateState(40);
```

---

### Scopes yang Tersedia

| Scope         | Data yang Diakses                                                    | Approval           |
| ------------- | -------------------------------------------------------------------- | ------------------- |
| `view-user`   | ID, Name, Email, Username, Profile Picture, Gender                   | Otomatis            |
| `detail-user` | Semua data `view-user` + Phone, Tanggal Lahir, Alamat, Biografi      | Perlu Admin Review  |

```typescript
import { Scope } from 'mubarokah-id-sdk';

const { url } = client.auth.getAuthorizationUrl({
  scopes: [Scope.ViewUser, Scope.DetailUser],
});
```

---

## 🧪 Menjalankan Contoh Aplikasi

1. **Clone dan install dependencies:**

```bash
cd sdk-mubarokah-id
npm install
```

2. **Konfigurasi environment:**

```bash
cp .env.example .env
# Edit .env dengan Client ID dan Client Secret Anda
```

3. **Jalankan aplikasi demo:**

```bash
npm run example
```

4. **Buka browser:** [http://localhost:3090](http://localhost:3090)

Aplikasi demo menyediakan:
- 🔐 Login dengan Mubarokah ID (Authorization Code + opsional PKCE)
- 👤 Dashboard profil user
- 📋 Detail user (jika scope `detail-user` disetujui admin)
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

## 📁 Struktur Projek

```
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
│   └── middleware.ts     # Express middleware
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

1. **JANGAN** simpan `clientSecret` di client-side code (browser/mobile)
2. **SELALU** gunakan HTTPS di production
3. **SELALU** validasi `state` parameter untuk mencegah CSRF
4. **GUNAKAN** PKCE untuk public clients (SPA, mobile apps)
5. **SIMPAN** credentials di environment variables
6. **IMPLEMENTASIKAN** token refresh logic untuk UX yang seamless
7. **MONITOR** penggunaan token untuk aktivitas mencurigakan

---

## 📄 License

MIT License — Lihat file [LICENSE](./LICENSE) untuk detail.
