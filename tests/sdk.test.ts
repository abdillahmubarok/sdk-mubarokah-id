// ============================================================================
// Mubarokah ID SDK — Integration tests (Vitest)
// ============================================================================
//
// Mock responses follow the exact JSON shapes documented on
// https://docs-accounts.mubarokah.com. Do not change them without updating the
// upstream documentation reference in the CHANGELOG.
// ============================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MubarokahClient,
  ApiError,
  OAuthError,
  tokenResponseToHandle,
  isWhatsAppUser,
  hasEmail,
} from '../src/index.js';
import type {
  AutoRefreshHandle,
  TokenResponse,
  UserInfo,
  UserDetails,
} from '../src/index.js';

// ---------------------------------------------------------------------------
// Fixtures — verbatim from Mubarokah ID documentation
// ---------------------------------------------------------------------------

/**
 * Example WhatsApp-registered user from:
 * docs-accounts.mubarokah.com → "WhatsApp Authentication Flow".
 * Note: `email` is explicitly `null`.
 */
const WHATSAPP_USER_RESPONSE: UserInfo = {
  id: 88123,
  name: 'Budi Santoso',
  email: null,
  username: 'budi_88123',
  profile_picture: null,
  gender: 'male',
};

/**
 * Example "detail-user" unapproved_scope error from:
 * docs-accounts.mubarokah.com → "Get Detailed User Information"
 * → "403 Forbidden - Unapproved Scope" tab.
 */
const UNAPPROVED_SCOPE_ERROR_BODY = {
  error: 'unapproved_scope',
  message:
    'Your application needs approval to access detailed user information. Please contact support.',
  error_description:
    "Client application has not been approved for the 'detail-user' scope.",
};

/**
 * Example successful token response from:
 * docs-accounts.mubarokah.com → "Token Endpoint" → "Example Success Response".
 */
const TOKEN_RESPONSE_FIXTURE: TokenResponse = {
  token_type: 'Bearer',
  expires_in: 86400,
  access_token: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.fixture.access',
  refresh_token:
    'def5020023761949f076f069874c92d8a1b2c3d4e5f6071828394a5b6c7d8e9f0',
  scope: 'view-user detail-user',
};

/**
 * Example token_expired error at the resource API from:
 * docs-accounts.mubarokah.com → "Get Basic User Information"
 * → "401 Unauthorized" tab.
 */
const TOKEN_EXPIRED_ERROR_BODY = {
  error: 'token_expired',
  error_description: 'The access token provided has expired.',
  message: 'The access token provided has expired.',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createClient(): MubarokahClient {
  return new MubarokahClient({
    clientId: '0a9f8dd9-9f13-4138-abf7-566f30886cf1',
    clientSecret: 'ORgE1SbhnjX73A3NPk2zZjxN0fMJetKPxXsH7Hyu',
    redirectUri: 'http://127.0.0.1:3090/sso/auth/callback',
  });
}

/**
 * Build a Response-like object that mimics the minimum surface of `fetch`
 * Response used by the SDK: `ok`, `status`, `headers.get`, `json`, `text`.
 */
function buildResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  const status = init.status ?? 200;
  const headers = new Headers(init.headers ?? { 'content-type': 'application/json' });
  const text = typeof body === 'string' ? body : JSON.stringify(body);

  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: '',
    headers,
    json: async () => JSON.parse(text),
    text: async () => text,
  } as unknown as Response;
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Scenario 1 — WhatsApp user with null email must not crash the SDK
// ---------------------------------------------------------------------------

describe('WhatsApp-registered user (email: null)', () => {
  it('parses the response without throwing and preserves nulls', async () => {
    fetchMock.mockResolvedValueOnce(buildResponse(WHATSAPP_USER_RESPONSE));

    const client = createClient();
    const user = await client.users.getUser('access-token-placeholder');

    // Exact equality against the documented fixture — guarantees the SDK
    // does not mutate or drop fields.
    expect(user).toEqual(WHATSAPP_USER_RESPONSE);

    // Narrowing helpers must work on real null values from the server.
    expect(isWhatsAppUser(user)).toBe(true);
    expect(hasEmail(user)).toBe(false);
    expect(user.email).toBeNull();

    // ID and name are always populated per the documentation.
    expect(typeof user.id).toBe('number');
    expect(user.name).toBe(WHATSAPP_USER_RESPONSE.name);

    // The SDK must hit the correct endpoint with a Bearer header.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchMock.mock.calls[0];
    expect(String(calledUrl)).toBe('https://accounts.mubarokah.com/api/user');
    expect(init?.method).toBe('GET');
    expect(
      (init?.headers as Record<string, string>).Authorization,
    ).toBe('Bearer access-token-placeholder');
  });
});

// ---------------------------------------------------------------------------
// Scenario 2 — /api/user/details returning 403 unapproved_scope
// ---------------------------------------------------------------------------

describe('detail-user endpoint returns 403 unapproved_scope', () => {
  it('throws ApiError with oauthCode="unapproved_scope" and isUnapprovedScope()=true', async () => {
    fetchMock.mockResolvedValueOnce(
      buildResponse(UNAPPROVED_SCOPE_ERROR_BODY, { status: 403 }),
    );

    const client = createClient();

    const error = await client.users
      .getUserDetails('access-token-placeholder')
      .then(() => {
        throw new Error('getUserDetails must have rejected');
      })
      .catch((err: unknown) => err);

    expect(error).toBeInstanceOf(ApiError);
    const apiError = error as ApiError;

    expect(apiError.statusCode).toBe(403);
    expect(apiError.oauthCode).toBe('unapproved_scope');
    expect(apiError.isUnapprovedScope()).toBe(true);
    // Must be distinguishable from insufficient_scope (same HTTP status).
    expect(apiError.isInsufficientScope()).toBe(false);
    expect(apiError.isForbidden()).toBe(true);

    // Human-readable message should come from the server body, not the fallback.
    expect(apiError.message).toBe(UNAPPROVED_SCOPE_ERROR_BODY.message);

    // The raw body is surfaced for further inspection.
    expect(apiError.responseBody).toEqual(UNAPPROVED_SCOPE_ERROR_BODY);
  });
});

// ---------------------------------------------------------------------------
// Scenario 3 — withAutoRefresh retries on 401 and persists the new token
// ---------------------------------------------------------------------------

describe('OAuthManager.withAutoRefresh reactive refresh', () => {
  it('refreshes on 401 token_expired and retries the original call once', async () => {
    // Call 1: the API call — 401 token_expired
    fetchMock.mockResolvedValueOnce(
      buildResponse(TOKEN_EXPIRED_ERROR_BODY, { status: 401 }),
    );

    // Call 2: the token endpoint — fresh tokens
    fetchMock.mockResolvedValueOnce(buildResponse(TOKEN_RESPONSE_FIXTURE));

    // Call 3: the retried API call — success with WhatsApp user payload
    fetchMock.mockResolvedValueOnce(buildResponse(WHATSAPP_USER_RESPONSE));

    const client = createClient();
    const onTokensUpdated = vi.fn<(h: AutoRefreshHandle) => void>();

    // Handle starts with a non-expired timestamp to force the *reactive*
    // branch, not the proactive one.
    const initialHandle: AutoRefreshHandle = {
      accessToken: 'expired-access-token',
      refreshToken: 'original-refresh-token',
      expiresAt: Date.now() + 10 * 60 * 1000, // +10 minutes
    };

    const result = await client.auth.withAutoRefresh<UserInfo>(
      initialHandle,
      (accessToken) => client.users.getUser(accessToken),
      onTokensUpdated,
    );

    // 3.1 Result is the successful retry payload
    expect(result).toEqual(WHATSAPP_USER_RESPONSE);

    // 3.2 Exactly three fetch calls in the right order
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const firstUrl = String(fetchMock.mock.calls[0][0]);
    const secondUrl = String(fetchMock.mock.calls[1][0]);
    const thirdUrl = String(fetchMock.mock.calls[2][0]);
    expect(firstUrl).toBe('https://accounts.mubarokah.com/api/user');
    expect(secondUrl).toBe('https://accounts.mubarokah.com/oauth/token');
    expect(thirdUrl).toBe('https://accounts.mubarokah.com/api/user');

    // 3.3 The token request uses the refresh_token grant with the original refresh token
    const tokenInit = fetchMock.mock.calls[1][1] as RequestInit;
    expect(tokenInit.method).toBe('POST');
    expect(
      (tokenInit.headers as Record<string, string>)['Content-Type'],
    ).toBe('application/x-www-form-urlencoded');

    const tokenBody = new URLSearchParams(tokenInit.body as string);
    expect(tokenBody.get('grant_type')).toBe('refresh_token');
    expect(tokenBody.get('refresh_token')).toBe('original-refresh-token');
    expect(tokenBody.get('client_id')).toBeTruthy();
    expect(tokenBody.get('client_secret')).toBeTruthy();

    // 3.4 The retried API call uses the NEW access token
    const retriedInit = fetchMock.mock.calls[2][1] as RequestInit;
    expect(
      (retriedInit.headers as Record<string, string>).Authorization,
    ).toBe(`Bearer ${TOKEN_RESPONSE_FIXTURE.access_token}`);

    // 3.5 onTokensUpdated was called exactly once with the new handle
    expect(onTokensUpdated).toHaveBeenCalledTimes(1);
    const persisted = onTokensUpdated.mock.calls[0][0];
    expect(persisted.accessToken).toBe(TOKEN_RESPONSE_FIXTURE.access_token);
    expect(persisted.refreshToken).toBe(TOKEN_RESPONSE_FIXTURE.refresh_token);
    expect(persisted.expiresAt).toBeGreaterThan(Date.now());
  });

  it('surfaces the refresh failure when the refresh call itself errors', async () => {
    // 1. Original API call fails with 401.
    fetchMock.mockResolvedValueOnce(
      buildResponse(TOKEN_EXPIRED_ERROR_BODY, { status: 401 }),
    );

    // 2. Refresh fails with invalid_grant (refresh token revoked).
    fetchMock.mockResolvedValueOnce(
      buildResponse(
        {
          error: 'invalid_grant',
          error_description:
            'The refresh token is invalid, expired, revoked, or was issued to another client.',
          hint: 'Please re-authenticate the user.',
        },
        { status: 400 },
      ),
    );

    const client = createClient();
    const handle: AutoRefreshHandle = {
      accessToken: 'stale-access-token',
      refreshToken: 'revoked-refresh-token',
      expiresAt: Date.now() + 5 * 60 * 1000,
    };

    const error = await client.auth
      .withAutoRefresh(handle, (token) => client.users.getUser(token))
      .then(() => {
        throw new Error('withAutoRefresh must have rejected');
      })
      .catch((err: unknown) => err);

    expect(error).toBeInstanceOf(OAuthError);
    const oauthError = error as OAuthError;
    expect(oauthError.code).toBe('invalid_grant');
    expect(oauthError.requiresReauth()).toBe(true);
    // And no stray retry must happen after a failed refresh.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Scenario 3 bonus — helper correctness
// ---------------------------------------------------------------------------

describe('tokenResponseToHandle', () => {
  it('produces an AutoRefreshHandle with absolute expiresAt', () => {
    const before = Date.now();
    const handle = tokenResponseToHandle(TOKEN_RESPONSE_FIXTURE);
    const after = Date.now();

    expect(handle.accessToken).toBe(TOKEN_RESPONSE_FIXTURE.access_token);
    expect(handle.refreshToken).toBe(TOKEN_RESPONSE_FIXTURE.refresh_token);
    // expiresAt sits in the expected window (expires_in * 1000 ms from now)
    const expected = before + TOKEN_RESPONSE_FIXTURE.expires_in * 1000;
    const upperBound = after + TOKEN_RESPONSE_FIXTURE.expires_in * 1000;
    expect(handle.expiresAt).toBeGreaterThanOrEqual(expected);
    expect(handle.expiresAt).toBeLessThanOrEqual(upperBound);
  });
});

// ---------------------------------------------------------------------------
// Type check — UserDetails shape (compile-time assertion)
// ---------------------------------------------------------------------------

describe('UserDetails typing', () => {
  it('accepts the documented nullable fields (phone_number, not phone)', () => {
    const details: UserDetails = {
      id: 12345,
      name: 'Ahmad Mubarak',
      email: 'ahmad.mubarak@example.com',
      profile_picture:
        'https://accounts.mubarokah.com/storage/avatars/12345.jpg',
      username: 'ahmadmubarak',
      gender: 'male',
      bio: 'Software engineer.',
      phone_number: '+6281234567890',
      place_of_birth: 'Jakarta, Indonesia',
      date_of_birth: '1990-01-15',
      address: 'Jl. Sudirman No. 123',
    };

    expect(details.phone_number).toBe('+6281234567890');
  });
});
