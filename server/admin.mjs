// Admin API: login + shared site data + ndus token pool. Everything is stored on the SERVER
// (server/store.mjs), so a change made in the admin panel applies to every visitor and every device.
//
//   POST /api/admin?action=login            {password}          -> {token}
//   GET  /api/admin?action=session          (admin)             -> {ok:true}
//   GET  /api/admin?action=store            (public)            -> {videos, categories, ads, settings}
//   PUT  /api/admin?action=store&key=videos (admin) {value}     -> {ok:true}
//   GET  /api/admin?action=tokens           (admin)             -> {tokens:[...]}
//   PUT  /api/admin?action=tokens           (admin) {value:[…]} -> {ok:true}
//
// Secrets: ADMIN_PASSWORD (.env). Tokens are only ever returned to a logged-in admin.

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { getKey, setKey } from './store.mjs';

export const ADMIN_PATH = '/api/admin';

const PUBLIC_KEYS = new Set(['videos', 'categories', 'ads', 'settings']);
const TOKENS_KEY = 'ndus_tokens';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_BODY = 25 * 1024 * 1024; // thumbnails may be stored as base64

export const adminPasswordIsDefault = () => !process.env.ADMIN_PASSWORD;
const adminPassword = () => process.env.ADMIN_PASSWORD || 'admin';

// ---------------------------------------------------------------- stored ndus tokens (used by terabox.mjs too)
export function getStoredTokens() {
  const v = getKey(TOKENS_KEY);
  return Array.isArray(v) ? v : [];
}
export function saveStoredTokens(list) {
  setKey(TOKENS_KEY, list);
}

// ---------------------------------------------------------------- sessions (stateless, survive restarts)
const sessionKey = () => createHmac('sha256', adminPassword()).update('cinemitra-admin-session').digest();
const hmac = (s) => createHmac('sha256', sessionKey()).update(s).digest('hex');

function issueSession() {
  const exp = String(Date.now() + SESSION_TTL_MS);
  return `${exp}.${hmac(exp)}`;
}

function sessionValid(token) {
  const [exp, sig] = String(token || '').split('.');
  if (!exp || !sig || !(Number(exp) > Date.now())) return false;
  const a = Buffer.from(hmac(exp));
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}

const isAdmin = (req) => sessionValid(req.headers['x-admin-token']);
export const isAdminRequest = isAdmin;

function passwordMatches(given) {
  const h = (s) => createHash('sha256').update(String(s)).digest();
  return timingSafeEqual(h(given), h(adminPassword()));
}

// simple brute-force guard: 10 wrong passwords / 10 min / IP
const attempts = new Map();
function tooManyAttempts(ip) {
  const now = Date.now();
  const rec = (attempts.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  attempts.set(ip, rec);
  return rec.length >= 10;
}
const noteFailure = (ip) => attempts.set(ip, [...(attempts.get(ip) || []), Date.now()]);

// ---------------------------------------------------------------- helpers
function cors() {
  return {
    'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*',
    'Access-Control-Allow-Headers': 'content-type, x-admin-token',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  };
}

function send(res, status, body, req) {
  const json = JSON.stringify(body);
  const headers = { ...cors(), 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, max-age=0', Pragma: 'no-cache' };
  // the public store can contain base64 thumbnails (MBs): gzip it so phones on slow networks get it fast
  if (req && json.length > 1024 && /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''))) {
    res.writeHead(status, { ...headers, 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' });
    return res.end(gzipSync(json));
  }
  res.writeHead(status, headers);
  res.end(json);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('Request too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

const clientIp = (req) =>
  (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() || req.socket.remoteAddress || 'unknown';

// ---------------------------------------------------------------- entry
export async function handleAdmin(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors());
    return res.end();
  }

  try {
    const q = new URL(req.url, 'http://localhost').searchParams;
    const action = q.get('action') || '';

    if (action === 'login' && req.method === 'POST') {
      const ip = clientIp(req);
      if (tooManyAttempts(ip)) return send(res, 429, { error: 'Too many attempts. Try again in a few minutes.' });
      const body = await readJson(req);
      if (!passwordMatches(body.password ?? '')) {
        noteFailure(ip);
        return send(res, 401, { error: 'Invalid password.' });
      }
      return send(res, 200, { token: issueSession() });
    }

    // public: site data every visitor needs
    if (action === 'store' && req.method === 'GET') {
      const out = {};
      for (const k of PUBLIC_KEYS) {
        const v = getKey(k);
        if (v !== undefined) out[k] = v;
      }
      return send(res, 200, out, req);
    }

    // everything below needs a valid admin session
    if (!isAdmin(req)) return send(res, 401, { error: 'Admin login required.' });

    if (action === 'session' && req.method === 'GET') return send(res, 200, { ok: true });

    if (action === 'store' && req.method === 'PUT') {
      const key = q.get('key') || '';
      if (!PUBLIC_KEYS.has(key)) return send(res, 400, { error: 'Unknown key.' });
      const body = await readJson(req);
      if (body.value === undefined) return send(res, 400, { error: 'Missing value.' });
      setKey(key, body.value);
      return send(res, 200, { ok: true });
    }

    if (action === 'tokens' && req.method === 'GET') return send(res, 200, { tokens: getStoredTokens() });

    if (action === 'tokens' && req.method === 'PUT') {
      const body = await readJson(req);
      const list = body.value;
      if (!Array.isArray(list) || list.some((t) => !t || typeof t.token !== 'string')) {
        return send(res, 400, { error: 'Invalid token list.' });
      }
      saveStoredTokens(list);
      return send(res, 200, { ok: true });
    }

    return send(res, 404, { error: 'Unknown action.' });
  } catch (err) {
    if (res.headersSent) return res.destroy();
    return send(res, 500, { error: err instanceof Error ? err.message : 'Internal Server Error' });
  }
}
