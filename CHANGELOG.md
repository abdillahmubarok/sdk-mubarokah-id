# Changelog

All notable changes to `mubarokah-id-sdk` are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.0.0] — Unreleased

This release is the outcome of a full security and integration audit against
the official [Mubarokah ID documentation](https://docs-accounts.mubarokah.com).
It contains multiple breaking changes but significantly improves security,
type safety, and developer experience.

### ⚠️ Breaking Changes

#### 1. `getAuthorizationUrl` is now `async`

The PKCE code challenge is now derived via the WebCrypto API
(`SubtleCrypto.digest`), which is Promise-based. This fixed a crash in
browsers where `node:crypto` was unavailable.

```diff
- const { url, state } = client.auth.getAuthorizationUrl();
+ const { url, state } = await client.auth.getAuthorizationUrl();
```

The same applies to `generateCodeChallenge` and `generatePKCEPair` utilities:

```diff
- const challenge = generateCodeChallenge(verifier);
- const pair = generatePKCEPair();
+ const challenge = await generateCodeChallenge(verifier);
+ const pair = await generatePKCEPair();
```

#### 2. `UserInfo` / `UserDetails` now reflect the real server shape

WhatsApp-registered users have no email. Several fields are now nullable and
one was renamed to match the API response.

```diff
 interface UserInfo {
-  id: string | number;
+  id: number;
   name: string;
-  email: string;
-  username: string;
+  email: string | null;           // null for WhatsApp-registered users
+  username: string | null;
   profile_picture: string | null;
   gender: string | null;
 }

 interface UserDetails extends UserInfo {
-  phone: string | null;
+  phone_number: string | null;    // renamed to match server response
   date_of_birth: string | null;
   place_of_birth: string | null;
   address: string | null;
   bio: string | null;
 }
```

**Migration:** search your codebase for `.email`, `.username`, and `.phone`
on Mubarokah ID user objects and add null checks. New helpers are available:

```ts
import { isWhatsAppUser, hasEmail } from 'mubarokah-id-sdk';

if (hasEmail(user)) {
  sendNotification(user.email); // string, TypeScript-narrowed
}

if (isWhatsAppUser(user)) {
  showLinkEmailPrompt();
}
```

#### 3. Express `createCallbackHandler` — `getState` is now required

CSRF protection can no longer be accidentally disabled. The handler throws at
construction time if `getState` is not a function. Two optional helpers were
added to fully support PKCE and anti-replay hygiene:

```diff
 app.get('/auth/callback', createCallbackHandler(client, {
+  getState: (req) => (req as express.Request).session?.oauthState,
+  getCodeVerifier: (req) => (req as express.Request).session?.codeVerifier,
+  clearStoredValues: (req) => {
+    const s = (req as express.Request).session;
+    s.oauthState = undefined;
+    s.codeVerifier = undefined;
+  },
   onSuccess: async (req, res, { tokens, user }) => { /* ... */ },
   onError:   async (req, res, error) => { /* ... */ },
 }));
```

State comparison is constant-time (`timingSafeEqual`). `clearStoredValues`
runs **before** token exchange so a failed exchange cannot be replayed.

#### 4. React token persistence default changed to `memory`

`<MubarokahProvider>` no longer writes access tokens to `localStorage`
(which is rebuildable XSS territory). Default is now memory-only via `useRef`.

```tsx
<MubarokahProvider
  config={{ clientId, redirectUri }}
  // Optional opt-in for reload-survival (tab-lifetime only):
  persistence="sessionStorage"
>
  {children}
</MubarokahProvider>
```

- `'memory'` (default): token vanishes on reload. Eliminates XSS exfiltration.
- `'sessionStorage'`: smaller attack surface than `localStorage`, tab-scoped.
- `localStorage` is intentionally **not supported** for tokens.

Refresh tokens are **never** stored in the browser for public clients.
For reload-friendly UX in production, use a Backend-for-Frontend (BFF) pattern
with `HttpOnly` cookies.

#### 5. `MubarokahProviderProps.config` strictly forbids `clientSecret`

Previously the type used `Omit<MubarokahConfig, 'clientSecret'> & { clientSecret?: string }`
which defeated the intent. The new type is a strict `Omit`, and the provider
additionally throws at runtime if `clientSecret` sneaks in.

#### 6. `OAuthError.requiresReauth()` behaviour corrected

`invalid_client` is a developer configuration issue (wrong credentials) — user
re-authentication cannot fix it. It was moved out of `requiresReauth()` and
into the new `isConfigIssue()` method.

```diff
-error.requiresReauth() // was true for invalid_client
+error.requiresReauth() // true for invalid_grant | access_denied | invalid_token | token_expired
+error.isConfigIssue()  // true for invalid_client | unauthorized_client | unsupported_grant_type
```

#### 7. `ApiError` carries OAuth-style error codes

Two 403 errors used to be indistinguishable; the SDK now parses the response
body and exposes precise detectors:

```ts
catch (error) {
  if (error instanceof ApiError) {
    if (error.isInsufficientScope()) {
      // Retry auth flow with correct scope
    } else if (error.isUnapprovedScope()) {
      // Admin approval required — contact Mubarokah ID team
    } else if (error.isTokenExpired()) {
      // Refresh token
    } else if (error.isRateLimited()) {
      console.log('retry after', error.retryAfter, 'seconds');
    }
  }
}
```

### ✨ New Features

- **PKCE isomorphic**: `pkce.ts` uses WebCrypto on browser and Node 18+,
  with a `node:crypto` fallback behind an indirect `Function('return require')`
  so bundlers cannot pull Node-only modules into SPA bundles.
- **`OAuthManager.withAutoRefresh(handle, call, onTokensUpdated?)`**:
  - Proactive refresh 30s before expiry.
  - Reactive refresh on 401 / `token_expired` / `invalid_token` with single retry.
  - Stateless — callers persist new tokens via `onTokensUpdated`.
- **`tokenResponseToHandle()` / `tokenResponseToStored()`**: convert a
  `TokenResponse` to a ready-to-persist object with absolute `expiresAt`.
- **`isStoredTokenExpired(stored, skewMs)`**: centralised expiry check.
- **`isWhatsAppUser(user)` / `hasEmail(user)`**: type guards that narrow
  nullable fields for safer consumer code.
- **`MubarokahContextState.refreshUser()`**: force-refetch the profile.
- **`OAuthError.isConfigIssue()`**: distinguishes developer-facing errors.
- **Rate-limit awareness**: `ApiError.retryAfter` exposes `Retry-After` header
  or `retry_after` body field.

### 🔒 Security Fixes

- Block `client_secret` at runtime when the SDK is used from a browser
  (both in `OAuthManager` token methods and in `<MubarokahProvider>`).
- Constant-time `state` comparison in the Express middleware.
- Remove `localStorage` token storage from React provider (XSS hardening).
- Authorization code is treated as one-time-use: state + verifier are cleared
  before the token exchange network call.
- Single-Sign-Out now invoked in the Express example on logout.

### 🧱 Internal Improvements

- Defensive JSON parsing in token endpoint: non-JSON responses no longer
  surface as opaque `SyntaxError`.
- Query-parameter parser in the callback handler tolerates `string[]` shapes.
- Example app: required env validation, `httpOnly`/`secure` cookie,
  `sameSite: 'lax'`, `trust proxy` in production, global error handler,
  HTML output escaped.

### 📚 Documentation

- New README section: **Public vs Confidential Client & BFF pattern**.
- Inline TypeDoc for every public method, including security notes.
- This CHANGELOG with migration guide.

---

## [1.0.3] — 2025

Initial public release. See git history for details.
