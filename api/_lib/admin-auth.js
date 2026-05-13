const crypto = require('node:crypto');
const { json, readBody, normalizeText } = require('./common');

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'managingdirector@ameerglobal.ca').toLowerCase();
const DEFAULT_ADMIN_LOGIN_CODE = 'AmeerGlobal1966';
const DEFAULT_ADMIN_SESSION_SECRET = 'ameer-global-admin-session-v1';
const ADMIN_LOGIN_CODE = process.env.ADMIN_LOGIN_CODE || DEFAULT_ADMIN_LOGIN_CODE;
const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || DEFAULT_ADMIN_SESSION_SECRET;
const COOKIE_NAME = 'ag_admin_session_v2';
const MAX_AGE_SEC = 60 * 60 * 12;

function b64url(input) {
  return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function unb64url(input) {
  const normalized = String(input || '').replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + pad, 'base64').toString('utf8');
}

function parseCookies(req) {
  const raw = String(req.headers.cookie || '');
  const out = {};
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(val);
  }
  return out;
}

function sign(payload) {
  return crypto.createHmac('sha256', ADMIN_SESSION_SECRET).update(payload).digest('hex');
}

function buildToken(email) {
  const payload = JSON.stringify({ email, exp: Date.now() + MAX_AGE_SEC * 1000 });
  const body = b64url(payload);
  const sig = sign(body);
  return `${body}.${sig}`;
}

function verifyToken(token) {
  if (!token || !ADMIN_SESSION_SECRET) return { ok: false };
  const [body, sig] = String(token).split('.');
  if (!body || !sig) return { ok: false };
  const expected = sign(body);
  if (sig.length !== expected.length) return { ok: false };
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return { ok: false };
  let parsed;
  try {
    parsed = JSON.parse(unb64url(body));
  } catch {
    return { ok: false };
  }
  if (!parsed || typeof parsed !== 'object') return { ok: false };
  if (String(parsed.email || '').toLowerCase() !== ADMIN_EMAIL) return { ok: false };
  if (!Number.isFinite(Number(parsed.exp)) || Number(parsed.exp) < Date.now()) return { ok: false };
  return { ok: true, email: ADMIN_EMAIL, exp: Number(parsed.exp) };
}

function sessionCookie(token) {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${MAX_AGE_SEC}`;
}

function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`;
}

function getSession(req) {
  const cookies = parseCookies(req);
  return verifyToken(cookies[COOKIE_NAME]);
}

function requireAdmin(req, res) {
  const session = getSession(req);
  if (!session.ok) {
    json(res, 401, { authenticated: false, error: 'Unauthorized' });
    return null;
  }
  return session;
}

async function login(req, res) {
  const body = await readBody(req);
  const email = normalizeText(body.email).toLowerCase();
  const code = normalizeText(body.code);

  if (email !== ADMIN_EMAIL) {
    json(res, 403, { error: 'Only managingdirector@ameerglobal.ca is allowed.' });
    return;
  }
  if (code !== ADMIN_LOGIN_CODE) {
    json(res, 403, { error: 'Invalid admin passcode.' });
    return;
  }

  const token = buildToken(ADMIN_EMAIL);
  const verified = verifyToken(token);
  res.setHeader('Set-Cookie', sessionCookie(token));
  json(res, 200, { ok: true, authenticated: true, email: ADMIN_EMAIL, expiresAt: verified.exp });
}

module.exports = {
  ADMIN_EMAIL,
  ADMIN_LOGIN_CODE,
  ADMIN_SESSION_SECRET,
  DEFAULT_ADMIN_LOGIN_CODE,
  DEFAULT_ADMIN_SESSION_SECRET,
  clearSessionCookie,
  getSession,
  login,
  requireAdmin
};
