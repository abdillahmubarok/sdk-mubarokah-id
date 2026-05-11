// ============================================================================
// Mubarokah ID SDK — Express Example Application
// ============================================================================
//
// Aplikasi referensi untuk mendemonstrasikan SDK Mubarokah ID pada backend
// (confidential client dengan clientSecret).
//
// Cara menjalankan:
//   1. Copy .env.example → .env dan isi dengan credentials Anda
//   2. npm install
//   3. npm run example
//   4. Buka http://localhost:3090
//
// ============================================================================

import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import {
  MubarokahClient,
  createCallbackHandler,
  tokenResponseToHandle,
  OAuthError,
  ApiError,
  isWhatsAppUser,
} from '../../src/index.js';
import type { AutoRefreshHandle, UserInfo } from '../../src/index.js';

// ============================================================================
// Configuration & Required Environment Validation
// ============================================================================

const PORT = parseInt(process.env.PORT ?? '3090', 10);
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(
      `[Demo] Environment variable ${name} wajib diisi. ` +
        `Silakan copy .env.example → .env dan lengkapi nilainya.`,
    );
  }
  return value;
}

const CLIENT_ID = requireEnv('MUBAROKAH_CLIENT_ID');
const CLIENT_SECRET = requireEnv('MUBAROKAH_CLIENT_SECRET');
const SESSION_SECRET = requireEnv('SESSION_SECRET');

if (IS_PRODUCTION && SESSION_SECRET.length < 32) {
  throw new Error(
    '[Demo] SESSION_SECRET di production minimal 32 karakter (disarankan 64+).',
  );
}

const REDIRECT_URI =
  process.env.MUBAROKAH_REDIRECT_URI ?? `http://localhost:${PORT}/auth/callback`;
const BASE_URL = process.env.MUBAROKAH_BASE_URL ?? 'https://accounts.mubarokah.com';
const SCOPES = (process.env.MUBAROKAH_SCOPES ?? 'view-user').split(/\s+/).filter(Boolean);

const client = new MubarokahClient({
  clientId: CLIENT_ID,
  clientSecret: CLIENT_SECRET,
  redirectUri: REDIRECT_URI,
  baseUrl: BASE_URL,
  scopes: SCOPES,
});

// ============================================================================
// Express App Setup
// ============================================================================

const app = express();
app.disable('x-powered-by');

declare module 'express-session' {
  interface SessionData {
    oauthState?: string;
    codeVerifier?: string;
    tokenHandle?: AutoRefreshHandle;
    user?: UserInfo;
  }
}

app.use(
  session({
    name: 'mubarokah.sid',
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: IS_PRODUCTION,
      maxAge: 24 * 60 * 60 * 1000,
    },
  }),
);

// Trust proxy di production agar `secure` cookie bekerja di balik reverse proxy
if (IS_PRODUCTION) {
  app.set('trust proxy', 1);
}

// ============================================================================
// HTML helpers
// ============================================================================

const esc = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

function layoutHtml(title: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)} — Mubarokah ID SDK Demo</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%);
      color: #e2e8f0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .container {
      max-width: 640px; width: 100%; margin: 2rem; padding: 2.5rem;
      background: rgba(30, 41, 59, 0.8);
      border: 1px solid rgba(148, 163, 184, 0.15);
      border-radius: 16px; backdrop-filter: blur(12px);
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    }
    .logo { text-align: center; margin-bottom: 1.5rem; }
    .logo h1 {
      font-size: 1.75rem; font-weight: 700;
      background: linear-gradient(135deg, #38bdf8, #818cf8);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent;
      letter-spacing: -0.025em;
    }
    .logo p { color: #94a3b8; font-size: 0.9rem; margin-top: 0.25rem; }
    .card {
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid rgba(148, 163, 184, 0.1);
      border-radius: 12px; padding: 1.5rem; margin-bottom: 1rem;
    }
    .card h3 { font-size: 1rem; color: #cbd5e1; margin-bottom: 0.75rem; }
    .btn {
      display: inline-block; padding: 0.75rem 2rem; border-radius: 10px;
      font-size: 0.95rem; font-weight: 600; text-decoration: none;
      cursor: pointer; border: none; transition: all 0.2s; text-align: center;
    }
    .btn-primary {
      background: linear-gradient(135deg, #3b82f6, #6366f1); color: #fff;
      box-shadow: 0 4px 15px rgba(59, 130, 246, 0.3);
    }
    .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(59, 130, 246, 0.4); }
    .btn-danger {
      background: linear-gradient(135deg, #ef4444, #dc2626); color: #fff;
      padding: 0.5rem 1.25rem; font-size: 0.85rem;
    }
    .btn-secondary {
      background: rgba(100, 116, 139, 0.3); color: #94a3b8;
      border: 1px solid rgba(148, 163, 184, 0.2);
      padding: 0.5rem 1.25rem; font-size: 0.85rem;
    }
    .btn-block { display: block; width: 100%; }
    .user-info { display: grid; gap: 0.5rem; }
    .user-info .row {
      display: flex; justify-content: space-between;
      padding: 0.5rem 0;
      border-bottom: 1px solid rgba(148, 163, 184, 0.08);
    }
    .user-info .label { color: #64748b; font-size: 0.85rem; }
    .user-info .value {
      color: #e2e8f0; font-weight: 500; font-size: 0.9rem;
      text-align: right; max-width: 60%; word-break: break-all;
    }
    .avatar {
      width: 64px; height: 64px; border-radius: 50%;
      border: 2px solid rgba(59, 130, 246, 0.5);
    }
    .actions { display: flex; gap: 0.75rem; margin-top: 1rem; flex-wrap: wrap; }
    .status { text-align: center; padding: 0.5rem; border-radius: 8px; font-size: 0.8rem; margin-bottom: 1rem; }
    .status-success { background: rgba(34, 197, 94, 0.15); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.2); }
    .status-error { background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.2); }
    .status-info { background: rgba(56, 189, 248, 0.12); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.2); }
    .token-preview {
      background: rgba(0, 0, 0, 0.3); padding: 0.75rem; border-radius: 8px;
      font-family: 'Cascadia Code', 'Fira Code', monospace;
      font-size: 0.75rem; color: #94a3b8;
      word-break: break-all; margin-top: 0.5rem;
      max-height: 80px; overflow: hidden;
    }
    .badge {
      display: inline-block; padding: 0.2rem 0.5rem; border-radius: 6px;
      font-size: 0.7rem; font-weight: 600;
      background: rgba(56, 189, 248, 0.15); color: #38bdf8;
      border: 1px solid rgba(56, 189, 248, 0.2);
    }
    .badge-warn {
      background: rgba(251, 191, 36, 0.12); color: #fbbf24;
      border-color: rgba(251, 191, 36, 0.25);
    }
    em { color: #94a3b8; font-style: italic; }
    code { font-family: 'Cascadia Code', 'Fira Code', monospace; font-size: 0.85em; background: rgba(148,163,184,0.12); padding: 0.1rem 0.3rem; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">
      <h1>☪ Mubarokah ID</h1>
      <p>SDK Demo Application</p>
    </div>
    ${content}
  </div>
</body>
</html>`;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Panggil API users.getUser melalui `withAutoRefresh` sehingga token baru
 * disinkronkan ke session otomatis bila expired.
 */
async function getUserWithRefresh(req: express.Request): Promise<UserInfo> {
  const handle = req.session.tokenHandle;
  if (!handle) {
    throw new OAuthError(
      { error: 'invalid_grant', error_description: 'Session tidak memiliki token.' },
      401,
    );
  }

  return client.auth.withAutoRefresh(
    handle,
    (accessToken) => client.users.getUser(accessToken),
    (next) => {
      req.session.tokenHandle = next;
    },
  );
}

function renderEmailBadge(user: UserInfo): string {
  if (isWhatsAppUser(user)) {
    return `<span class="badge badge-warn">WhatsApp user</span> <em>Email belum ditautkan</em>`;
  }
  return esc(user.email);
}

// ============================================================================
// Routes
// ============================================================================

// — Home / Login Page ——————————————————————————
app.get('/', (req, res) => {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }

  const config = client.getConfig();

  res.send(
    layoutHtml(
      'Login',
      `
      <div class="card">
        <h3>🔐 Single Sign-On Demo</h3>
        <p style="color: #94a3b8; font-size: 0.85rem; margin-bottom: 1.25rem;">
          Klik tombol di bawah untuk login menggunakan akun Mubarokah ID Anda.
        </p>
        <a href="/auth/login" class="btn btn-primary btn-block">
          Login dengan Mubarokah ID →
        </a>
      </div>
      <div class="card">
        <h3>⚙️ Konfigurasi Aktif</h3>
        <div class="user-info">
          <div class="row">
            <span class="label">Client ID</span>
            <span class="value">${esc(config.clientId.substring(0, 20))}…</span>
          </div>
          <div class="row">
            <span class="label">Redirect URI</span>
            <span class="value">${esc(config.redirectUri)}</span>
          </div>
          <div class="row">
            <span class="label">Base URL</span>
            <span class="value">${esc(config.baseUrl)}</span>
          </div>
          <div class="row">
            <span class="label">Scopes</span>
            <span class="value">${config.scopes
              .map((s) => `<span class="badge">${esc(s)}</span>`)
              .join(' ')}</span>
          </div>
        </div>
      </div>
      <div class="card">
        <h3>🧪 Test PKCE Flow</h3>
        <a href="/auth/login?pkce=true" class="btn btn-secondary btn-block">
          Login dengan PKCE →
        </a>
      </div>
      `,
    ),
  );
});

// — OAuth: Initiate Login ————————————————————
app.get('/auth/login', async (req, res, next) => {
  try {
    const usePKCE = req.query.pkce === 'true';

    const { url, state, codeVerifier } = await client.auth.getAuthorizationUrl({
      usePKCE,
      prompt: 'consent',
    });

    req.session.oauthState = state;
    if (codeVerifier) {
      req.session.codeVerifier = codeVerifier;
    }

    // Pastikan cookie di-flush sebelum redirect
    req.session.save((err) => {
      if (err) return next(err);
      // eslint-disable-next-line no-console
      console.log(`[OAuth] Redirecting to authorization URL (PKCE: ${usePKCE})`);
      res.redirect(url);
    });
  } catch (err) {
    next(err);
  }
});

// — OAuth: Callback ——————————————————————————
app.get(
  '/auth/callback',
  createCallbackHandler(client, {
    getState: (req) => (req as express.Request).session?.oauthState,
    getCodeVerifier: (req) => (req as express.Request).session?.codeVerifier,
    clearStoredValues: (req) => {
      const s = (req as express.Request).session;
      s.oauthState = undefined;
      s.codeVerifier = undefined;
    },

    onSuccess: async (req, res, { tokens, user }) => {
      const expressReq = req as express.Request;
      const expressRes = res as express.Response;

      expressReq.session.tokenHandle = tokenResponseToHandle(tokens);
      if (user) expressReq.session.user = user;

      // eslint-disable-next-line no-console
      console.log('[OAuth] Login berhasil:', user?.name ?? 'Unknown');
      expressReq.session.save((err) => {
        if (err) {
          // eslint-disable-next-line no-console
          console.error('[OAuth] Gagal menyimpan session:', err);
          expressRes.redirect('/?error=session_save_failed');
          return;
        }
        expressRes.redirect('/dashboard');
      });
    },

    onError: async (req, res, error) => {
      const expressRes = res as express.Response;
      // eslint-disable-next-line no-console
      console.error('[OAuth] Login gagal:', error.message);

      expressRes.status(error instanceof OAuthError ? error.statusCode ?? 400 : 400).send(
        layoutHtml(
          'Login Gagal',
          `
          <div class="status status-error">⚠️ Login gagal</div>
          <div class="card">
            <h3>Detail Error</h3>
            <p style="color: #f87171; font-size: 0.9rem;">${esc(error.message)}</p>
            ${
              error instanceof OAuthError && error.hint
                ? `<p style="color: #94a3b8; font-size: 0.8rem; margin-top: 0.5rem;">Hint: ${esc(error.hint)}</p>`
                : ''
            }
          </div>
          <div class="actions">
            <a href="/" class="btn btn-primary">← Kembali ke Home</a>
          </div>
          `,
        ),
      );
    },
  }),
);

// — Dashboard (Authenticated) ————————————————
app.get('/dashboard', async (req, res, next) => {
  if (!req.session.user || !req.session.tokenHandle) {
    return res.redirect('/');
  }

  try {
    // Demonstrasi auto-refresh: selalu ambil user terbaru dengan refresh otomatis
    const user = await getUserWithRefresh(req);
    req.session.user = user;

    const handle = req.session.tokenHandle;
    const secondsLeft = Math.max(0, Math.round((handle.expiresAt - Date.now()) / 1000));

    res.send(
      layoutHtml(
        'Dashboard',
        `
        <div class="status status-success">✅ Login berhasil — Selamat datang!</div>
        <div class="card">
          <h3>👤 Profil User</h3>
          <div style="text-align: center; margin-bottom: 1rem;">
            ${user.profile_picture ? `<img src="${esc(user.profile_picture)}" alt="Avatar" class="avatar" />` : ''}
          </div>
          <div class="user-info">
            <div class="row"><span class="label">ID</span><span class="value">${esc(user.id)}</span></div>
            <div class="row"><span class="label">Nama</span><span class="value">${esc(user.name)}</span></div>
            <div class="row"><span class="label">Email</span><span class="value">${renderEmailBadge(user)}</span></div>
            <div class="row"><span class="label">Username</span><span class="value">${
              user.username ? esc(user.username) : '<em>Belum diatur</em>'
            }</span></div>
            <div class="row"><span class="label">Gender</span><span class="value">${
              user.gender ? esc(user.gender) : '-'
            }</span></div>
          </div>
        </div>
        <div class="card">
          <h3>🪙 Token Info</h3>
          <div class="user-info">
            <div class="row"><span class="label">Expires In</span><span class="value">${secondsLeft}s</span></div>
            <div class="row"><span class="label">Expires At</span><span class="value">${esc(
              new Date(handle.expiresAt).toISOString(),
            )}</span></div>
            <div class="row"><span class="label">Punya Refresh Token</span><span class="value">${
              handle.refreshToken ? '✅ Ya' : '❌ Tidak'
            }</span></div>
          </div>
          <div class="token-preview">${esc(handle.accessToken.substring(0, 100))}…</div>
        </div>
        <div class="actions">
          <a href="/user/details" class="btn btn-secondary">📋 Detail User</a>
          <a href="/token/refresh" class="btn btn-secondary">🔄 Refresh Manual</a>
          <a href="/auth/logout" class="btn btn-danger">Logout</a>
        </div>
        `,
      ),
    );
  } catch (err) {
    if (err instanceof OAuthError && err.requiresReauth()) {
      req.session.destroy(() => res.redirect('/'));
      return;
    }
    next(err);
  }
});

// — User Details (detail-user scope) —————————
app.get('/user/details', async (req, res, next) => {
  if (!req.session.tokenHandle) {
    return res.redirect('/');
  }

  try {
    const details = await client.auth.withAutoRefresh(
      req.session.tokenHandle,
      (accessToken) => client.users.getUserDetails(accessToken),
      (next) => {
        req.session.tokenHandle = next;
      },
    );

    res.send(
      layoutHtml(
        'Detail User',
        `
        <div class="status status-success">✅ Detail user berhasil diambil</div>
        <div class="card">
          <h3>📋 Informasi Detail</h3>
          <div class="user-info">
            <div class="row"><span class="label">Nama</span><span class="value">${esc(details.name)}</span></div>
            <div class="row"><span class="label">Email</span><span class="value">${renderEmailBadge(details)}</span></div>
            <div class="row"><span class="label">Telepon</span><span class="value">${
              details.phone_number ? esc(details.phone_number) : '<em>Tidak ada</em>'
            }</span></div>
            <div class="row"><span class="label">Tanggal Lahir</span><span class="value">${
              details.date_of_birth ? esc(details.date_of_birth) : '-'
            }</span></div>
            <div class="row"><span class="label">Tempat Lahir</span><span class="value">${
              details.place_of_birth ? esc(details.place_of_birth) : '-'
            }</span></div>
            <div class="row"><span class="label">Alamat</span><span class="value">${
              details.address ? esc(details.address) : '-'
            }</span></div>
            <div class="row"><span class="label">Bio</span><span class="value">${
              details.bio ? esc(details.bio) : '-'
            }</span></div>
          </div>
        </div>
        <div class="actions">
          <a href="/dashboard" class="btn btn-secondary">← Kembali</a>
        </div>
        `,
      ),
    );
  } catch (err) {
    if (err instanceof OAuthError && err.requiresReauth()) {
      req.session.destroy(() => res.redirect('/'));
      return;
    }

    const isForbidden = err instanceof ApiError && err.isForbidden();
    const message = err instanceof Error ? err.message : String(err);

    res.status(err instanceof ApiError ? err.statusCode ?? 500 : 500).send(
      layoutHtml(
        'Detail User — Error',
        `
        <div class="status status-error">⚠️ Gagal mengambil detail user</div>
        <div class="card">
          <h3>Detail Error</h3>
          <p style="color: #f87171; font-size: 0.9rem;">${esc(message)}</p>
          ${
            isForbidden
              ? '<p style="color: #fbbf24; font-size: 0.8rem; margin-top: 0.5rem;">💡 Aplikasi Anda mungkin belum mendapat approval admin untuk scope <code>detail-user</code>.</p>'
              : ''
          }
        </div>
        <div class="actions">
          <a href="/dashboard" class="btn btn-secondary">← Kembali</a>
        </div>
        `,
      ),
    );
    next; // no-op; kept for style consistency
  }
});

// — Token Refresh (manual) —————————————————
app.get('/token/refresh', async (req, res) => {
  const handle = req.session.tokenHandle;
  if (!handle?.refreshToken) {
    return res.redirect('/dashboard');
  }

  try {
    const newTokens = await client.auth.refreshToken(handle.refreshToken);
    req.session.tokenHandle = tokenResponseToHandle(newTokens);

    // eslint-disable-next-line no-console
    console.log('[Token] Manual refresh berhasil');

    res.send(
      layoutHtml(
        'Token Refresh',
        `
        <div class="status status-success">✅ Token berhasil di-refresh!</div>
        <div class="card">
          <h3>🪙 Token Baru</h3>
          <div class="user-info">
            <div class="row"><span class="label">Expires In</span><span class="value">${esc(newTokens.expires_in)}s</span></div>
            <div class="row"><span class="label">Scope</span><span class="value">${esc(newTokens.scope ?? '-')}</span></div>
          </div>
          <div class="token-preview">${esc(newTokens.access_token.substring(0, 100))}…</div>
        </div>
        <div class="actions">
          <a href="/dashboard" class="btn btn-secondary">← Kembali ke Dashboard</a>
        </div>
        `,
      ),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(err instanceof OAuthError ? err.statusCode ?? 400 : 500).send(
      layoutHtml(
        'Token Refresh — Error',
        `
        <div class="status status-error">⚠️ Gagal refresh token</div>
        <div class="card">
          <h3>Detail Error</h3>
          <p style="color: #f87171; font-size: 0.9rem;">${esc(message)}</p>
          <p style="color: #94a3b8; font-size: 0.8rem; margin-top: 0.5rem;">Anda mungkin perlu login ulang.</p>
        </div>
        <div class="actions">
          <a href="/" class="btn btn-primary">Login Ulang</a>
          <a href="/dashboard" class="btn btn-secondary">← Kembali</a>
        </div>
        `,
      ),
    );
  }
});

// — Logout ———————————————————————————————————
app.get('/auth/logout', async (req, res) => {
  const handle = req.session.tokenHandle;

  if (handle?.accessToken) {
    try {
      await client.auth.logout(handle.accessToken);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[Logout] Gagal memanggil endpoint SSO logout pusat:', err);
    }
  }

  req.session.destroy(() => {
    res.clearCookie('mubarokah.sid');
    res.redirect('/');
  });
});

// ============================================================================
// Error handler
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // eslint-disable-next-line no-console
  console.error('[App Error]', err);
  const message = err instanceof Error ? err.message : 'Unknown error';
  const status = err instanceof ApiError ? err.statusCode ?? 500 : 500;
  res.status(status).send(
    layoutHtml(
      'Error',
      `
      <div class="status status-error">⚠️ Terjadi kesalahan</div>
      <div class="card">
        <p style="color: #f87171; font-size: 0.9rem;">${esc(message)}</p>
      </div>
      <div class="actions"><a href="/" class="btn btn-primary">Home</a></div>
      `,
    ),
  );
});

// ============================================================================
// Start Server
// ============================================================================

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log('');
  console.log('  ☪  Mubarokah ID SDK — Demo App');
  console.log('  ────────────────────────────────');
  console.log(`  🌐 Server     : http://localhost:${PORT}`);
  console.log(`  🔑 Client ID  : ${client.getConfig().clientId.substring(0, 20)}…`);
  console.log(`  🔗 Redirect   : ${client.getConfig().redirectUri}`);
  console.log(`  📡 Base URL   : ${client.getConfig().baseUrl}`);
  console.log(`  🎯 Scopes     : ${client.getConfig().scopes.join(', ')}`);
  console.log(`  🛡  Mode      : ${IS_PRODUCTION ? 'production' : 'development'}`);
  console.log('  ────────────────────────────────');
  console.log('  📝 Routes:');
  console.log('     GET /              — Halaman login');
  console.log('     GET /auth/login    — Mulai OAuth flow');
  console.log('     GET /auth/callback — OAuth callback');
  console.log('     GET /dashboard     — Profil user (auto-refresh aktif)');
  console.log('     GET /user/details  — Detail user (auto-refresh aktif)');
  console.log('     GET /token/refresh — Refresh token manual');
  console.log('     GET /auth/logout   — Logout SSO global');
  console.log('');
});
