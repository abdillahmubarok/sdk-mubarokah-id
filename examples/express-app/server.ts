// ============================================================================
// Mubarokah ID SDK — Express Example Application
// ============================================================================
//
// Aplikasi pengujian untuk memverifikasi SDK Mubarokah ID.
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
import { MubarokahClient, createCallbackHandler, OAuthError, ApiError } from '../../src/index.js';

// ============================================================================
// Configuration
// ============================================================================

const PORT = parseInt(process.env.PORT ?? '3090', 10);

const client = new MubarokahClient({
  clientId: process.env.MUBAROKAH_CLIENT_ID ?? 'test-client-id',
  clientSecret: process.env.MUBAROKAH_CLIENT_SECRET ?? 'test-client-secret',
  redirectUri: process.env.MUBAROKAH_REDIRECT_URI ?? `http://localhost:${PORT}/auth/callback`,
  baseUrl: process.env.MUBAROKAH_BASE_URL ?? 'https://accounts.mubarokah.com',
  scopes: (process.env.MUBAROKAH_SCOPES ?? 'view-user').split(' '),
});

// ============================================================================
// Express App Setup
// ============================================================================

const app = express();

// Session middleware
declare module 'express-session' {
  interface SessionData {
    oauthState?: string;
    codeVerifier?: string;
    tokens?: {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      token_type: string;
      scope?: string;
    };
    user?: Record<string, unknown>;
  }
}

app.use(
  session({
    secret: process.env.SESSION_SECRET ?? 'mubarokah-sdk-dev-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 },
  })
);

// ============================================================================
// HTML Templates
// ============================================================================

function layoutHtml(title: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — Mubarokah ID SDK Demo</title>
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
      max-width: 640px;
      width: 100%;
      margin: 2rem;
      padding: 2.5rem;
      background: rgba(30, 41, 59, 0.8);
      border: 1px solid rgba(148, 163, 184, 0.15);
      border-radius: 16px;
      backdrop-filter: blur(12px);
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    }
    .logo {
      text-align: center;
      margin-bottom: 1.5rem;
    }
    .logo h1 {
      font-size: 1.75rem;
      font-weight: 700;
      background: linear-gradient(135deg, #38bdf8, #818cf8);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      letter-spacing: -0.025em;
    }
    .logo p { color: #94a3b8; font-size: 0.9rem; margin-top: 0.25rem; }
    .card {
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid rgba(148, 163, 184, 0.1);
      border-radius: 12px;
      padding: 1.5rem;
      margin-bottom: 1rem;
    }
    .card h3 { font-size: 1rem; color: #cbd5e1; margin-bottom: 0.75rem; }
    .btn {
      display: inline-block;
      padding: 0.75rem 2rem;
      border-radius: 10px;
      font-size: 0.95rem;
      font-weight: 600;
      text-decoration: none;
      cursor: pointer;
      border: none;
      transition: all 0.2s;
      text-align: center;
    }
    .btn-primary {
      background: linear-gradient(135deg, #3b82f6, #6366f1);
      color: #fff;
      box-shadow: 0 4px 15px rgba(59, 130, 246, 0.3);
    }
    .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(59, 130, 246, 0.4); }
    .btn-danger {
      background: linear-gradient(135deg, #ef4444, #dc2626);
      color: #fff;
      padding: 0.5rem 1.25rem;
      font-size: 0.85rem;
    }
    .btn-secondary {
      background: rgba(100, 116, 139, 0.3);
      color: #94a3b8;
      border: 1px solid rgba(148, 163, 184, 0.2);
      padding: 0.5rem 1.25rem;
      font-size: 0.85rem;
    }
    .btn-block { display: block; width: 100%; }
    .user-info { display: grid; gap: 0.5rem; }
    .user-info .row {
      display: flex;
      justify-content: space-between;
      padding: 0.5rem 0;
      border-bottom: 1px solid rgba(148, 163, 184, 0.08);
    }
    .user-info .label { color: #64748b; font-size: 0.85rem; }
    .user-info .value { color: #e2e8f0; font-weight: 500; font-size: 0.9rem; text-align: right; max-width: 60%; word-break: break-all; }
    .avatar { width: 64px; height: 64px; border-radius: 50%; border: 2px solid rgba(59, 130, 246, 0.5); }
    .actions { display: flex; gap: 0.75rem; margin-top: 1rem; flex-wrap: wrap; }
    .status { text-align: center; padding: 0.5rem; border-radius: 8px; font-size: 0.8rem; margin-bottom: 1rem; }
    .status-success { background: rgba(34, 197, 94, 0.15); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.2); }
    .status-error { background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.2); }
    .token-preview {
      background: rgba(0, 0, 0, 0.3);
      padding: 0.75rem;
      border-radius: 8px;
      font-family: 'Cascadia Code', 'Fira Code', monospace;
      font-size: 0.75rem;
      color: #94a3b8;
      word-break: break-all;
      margin-top: 0.5rem;
      max-height: 80px;
      overflow: hidden;
    }
    .badge {
      display: inline-block;
      padding: 0.2rem 0.5rem;
      border-radius: 6px;
      font-size: 0.7rem;
      font-weight: 600;
      background: rgba(56, 189, 248, 0.15);
      color: #38bdf8;
      border: 1px solid rgba(56, 189, 248, 0.2);
    }
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
// Routes
// ============================================================================

// — Home / Login Page ——————————————————————————
app.get('/', (req, res) => {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }

  const config = client.getConfig();

  const html = layoutHtml(
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
          <span class="value">${config.clientId.substring(0, 20)}...</span>
        </div>
        <div class="row">
          <span class="label">Redirect URI</span>
          <span class="value">${config.redirectUri}</span>
        </div>
        <div class="row">
          <span class="label">Base URL</span>
          <span class="value">${config.baseUrl}</span>
        </div>
        <div class="row">
          <span class="label">Scopes</span>
          <span class="value">${config.scopes.map((s) => `<span class="badge">${s}</span>`).join(' ')}</span>
        </div>
      </div>
    </div>
    <div class="card">
      <h3>🧪 Test PKCE Flow</h3>
      <a href="/auth/login?pkce=true" class="btn btn-secondary btn-block">
        Login dengan PKCE →
      </a>
    </div>
    `
  );

  res.send(html);
});

// — OAuth: Initiate Login ————————————————————
app.get('/auth/login', (req, res) => {
  const usePKCE = req.query.pkce === 'true';

  const { url, state, codeVerifier } = client.auth.getAuthorizationUrl({
    usePKCE,
    prompt: 'consent',
  });

  // Save state (and PKCE verifier) in session
  req.session.oauthState = state;
  if (codeVerifier) {
    req.session.codeVerifier = codeVerifier;
  }

  console.log(`[OAuth] Redirecting to authorization URL (PKCE: ${usePKCE})`);
  res.redirect(url);
});

// — OAuth: Callback ——————————————————————————
app.get(
  '/auth/callback',
  createCallbackHandler(client, {
    onSuccess: async (req, res, { tokens, user }) => {
      const expressReq = req as express.Request;
      const expressRes = res as express.Response;

      // Store tokens and user in session
      expressReq.session.tokens = tokens;
      expressReq.session.user = user as Record<string, unknown>;

      console.log('[OAuth] Login berhasil:', user?.name ?? 'Unknown');
      expressRes.redirect('/dashboard');
    },

    onError: async (req, res, error) => {
      const expressRes = res as express.Response;
      console.error('[OAuth] Login gagal:', error.message);

      const html = layoutHtml(
        'Login Gagal',
        `
        <div class="status status-error">⚠️ Login gagal</div>
        <div class="card">
          <h3>Detail Error</h3>
          <p style="color: #f87171; font-size: 0.9rem;">${error.message}</p>
          ${error instanceof OAuthError ? `<p style="color: #94a3b8; font-size: 0.8rem; margin-top: 0.5rem;">Hint: ${error.hint ?? '-'}</p>` : ''}
        </div>
        <div class="actions">
          <a href="/" class="btn btn-primary">← Kembali ke Home</a>
        </div>
        `
      );
      expressRes.send(html);
    },

    getState: (req) => (req as express.Request).session?.oauthState,
  })
);

// — Dashboard (Authenticated) ————————————————
app.get('/dashboard', async (req, res) => {
  if (!req.session.user || !req.session.tokens) {
    return res.redirect('/');
  }

  const user = req.session.user;
  const tokens = req.session.tokens;

  const html = layoutHtml(
    'Dashboard',
    `
    <div class="status status-success">✅ Login berhasil — Selamat datang!</div>
    <div class="card">
      <h3>👤 Profil User</h3>
      <div style="text-align: center; margin-bottom: 1rem;">
        ${user.profile_picture ? `<img src="${user.profile_picture}" alt="Avatar" class="avatar" />` : ''}
      </div>
      <div class="user-info">
        <div class="row"><span class="label">ID</span><span class="value">${user.id}</span></div>
        <div class="row"><span class="label">Nama</span><span class="value">${user.name}</span></div>
        <div class="row"><span class="label">Email</span><span class="value">${user.email}</span></div>
        <div class="row"><span class="label">Username</span><span class="value">${user.username}</span></div>
        <div class="row"><span class="label">Gender</span><span class="value">${user.gender ?? '-'}</span></div>
      </div>
    </div>
    <div class="card">
      <h3>🪙 Token Info</h3>
      <div class="user-info">
        <div class="row"><span class="label">Tipe</span><span class="value">${tokens.token_type}</span></div>
        <div class="row"><span class="label">Expires In</span><span class="value">${tokens.expires_in}s (${Math.round(tokens.expires_in / 3600)}h)</span></div>
        <div class="row"><span class="label">Scope</span><span class="value">${tokens.scope ?? '-'}</span></div>
      </div>
      <div class="token-preview">${tokens.access_token.substring(0, 100)}...</div>
    </div>
    <div class="actions">
      <a href="/user/details" class="btn btn-secondary">📋 Detail User</a>
      <a href="/token/refresh" class="btn btn-secondary">🔄 Refresh Token</a>
      <a href="/auth/logout" class="btn btn-danger">Logout</a>
    </div>
    `
  );

  res.send(html);
});

// — User Details (detail-user scope) —————————
app.get('/user/details', async (req, res) => {
  if (!req.session.tokens) {
    return res.redirect('/');
  }

  try {
    const details = await client.users.getUserDetails(req.session.tokens.access_token);

    const html = layoutHtml(
      'Detail User',
      `
      <div class="status status-success">✅ Detail user berhasil diambil</div>
      <div class="card">
        <h3>📋 Informasi Detail</h3>
        <div class="user-info">
          <div class="row"><span class="label">Nama</span><span class="value">${details.name}</span></div>
          <div class="row"><span class="label">Email</span><span class="value">${details.email}</span></div>
          <div class="row"><span class="label">Telepon</span><span class="value">${details.phone ?? '-'}</span></div>
          <div class="row"><span class="label">Tanggal Lahir</span><span class="value">${details.date_of_birth ?? '-'}</span></div>
          <div class="row"><span class="label">Tempat Lahir</span><span class="value">${details.place_of_birth ?? '-'}</span></div>
          <div class="row"><span class="label">Alamat</span><span class="value">${details.address ?? '-'}</span></div>
          <div class="row"><span class="label">Bio</span><span class="value">${details.bio ?? '-'}</span></div>
        </div>
      </div>
      <div class="actions">
        <a href="/dashboard" class="btn btn-secondary">← Kembali</a>
      </div>
      `
    );
    res.send(html);
  } catch (error) {
    const errMsg = error instanceof ApiError
      ? `Status ${error.statusCode}: ${error.message}`
      : (error as Error).message;

    const html = layoutHtml(
      'Detail User — Error',
      `
      <div class="status status-error">⚠️ Gagal mengambil detail user</div>
      <div class="card">
        <h3>Detail Error</h3>
        <p style="color: #f87171; font-size: 0.9rem;">${errMsg}</p>
        ${error instanceof ApiError && error.isForbidden() ? '<p style="color: #fbbf24; font-size: 0.8rem; margin-top: 0.5rem;">💡 Aplikasi Anda mungkin belum mendapat approval admin untuk scope <code>detail-user</code>.</p>' : ''}
      </div>
      <div class="actions">
        <a href="/dashboard" class="btn btn-secondary">← Kembali</a>
      </div>
      `
    );
    res.send(html);
  }
});

// — Token Refresh ————————————————————————————
app.get('/token/refresh', async (req, res) => {
  if (!req.session.tokens?.refresh_token) {
    return res.redirect('/dashboard');
  }

  try {
    const newTokens = await client.auth.refreshToken(req.session.tokens.refresh_token);
    req.session.tokens = newTokens;

    console.log('[Token] Refresh berhasil');
    const html = layoutHtml(
      'Token Refresh',
      `
      <div class="status status-success">✅ Token berhasil di-refresh!</div>
      <div class="card">
        <h3>🪙 Token Baru</h3>
        <div class="user-info">
          <div class="row"><span class="label">Expires In</span><span class="value">${newTokens.expires_in}s</span></div>
          <div class="row"><span class="label">Scope</span><span class="value">${newTokens.scope ?? '-'}</span></div>
        </div>
        <div class="token-preview">${newTokens.access_token.substring(0, 100)}...</div>
      </div>
      <div class="actions">
        <a href="/dashboard" class="btn btn-secondary">← Kembali ke Dashboard</a>
      </div>
      `
    );
    res.send(html);
  } catch (error) {
    const errMsg = error instanceof OAuthError ? error.message : (error as Error).message;
    const html = layoutHtml(
      'Token Refresh — Error',
      `
      <div class="status status-error">⚠️ Gagal refresh token</div>
      <div class="card">
        <h3>Detail Error</h3>
        <p style="color: #f87171; font-size: 0.9rem;">${errMsg}</p>
        <p style="color: #94a3b8; font-size: 0.8rem; margin-top: 0.5rem;">Anda mungkin perlu login ulang.</p>
      </div>
      <div class="actions">
        <a href="/" class="btn btn-primary">Login Ulang</a>
        <a href="/dashboard" class="btn btn-secondary">← Kembali</a>
      </div>
      `
    );
    res.send(html);
  }
});

// — Logout ———————————————————————————————————
app.get('/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// ============================================================================
// Start Server
// ============================================================================

app.listen(PORT, () => {
  console.log('');
  console.log('  ☪  Mubarokah ID SDK — Demo App');
  console.log('  ────────────────────────────────');
  console.log(`  🌐 Server     : http://localhost:${PORT}`);
  console.log(`  🔑 Client ID  : ${client.getConfig().clientId.substring(0, 20)}...`);
  console.log(`  🔗 Redirect   : ${client.getConfig().redirectUri}`);
  console.log(`  📡 Base URL   : ${client.getConfig().baseUrl}`);
  console.log(`  🎯 Scopes     : ${client.getConfig().scopes.join(', ')}`);
  console.log('  ────────────────────────────────');
  console.log('  📝 Routes:');
  console.log(`     GET /              — Halaman login`);
  console.log(`     GET /auth/login    — Mulai OAuth flow`);
  console.log(`     GET /auth/callback — OAuth callback`);
  console.log(`     GET /dashboard     — Profil user`);
  console.log(`     GET /user/details  — Detail user (detail-user scope)`);
  console.log(`     GET /token/refresh — Refresh token`);
  console.log(`     GET /auth/logout   — Logout`);
  console.log('');
});
