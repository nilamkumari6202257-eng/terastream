// Self-hosted TeraBox resolver + HLS proxy (Node 18+, no external deps, no Supabase).
// Ported from the working Supabase `terabox` edge function.
//
// Actions (all on /api/terabox):
//   ?action=resolve&url=<terabox share link>   -> JSON { url, title, duration, ... }
//   ?action=playlist&u=..&sig=..               -> rewritten m3u8 (internal, signed)
//   ?action=asset&u=..&sig=..                  -> proxied .ts segment / key (internal, signed)
//   ?action=test                               -> basic ndus token sanity check
//   ?action=diagnose&url=..  (admin only)      -> step-by-step report of what fails for a link
//
// Secrets live ONLY on the server: NDUS_TOKENS / PROXY_SECRET (.env) and the tokens added in the admin
// panel (data/store.json, see admin.mjs).

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Readable } from 'node:stream';
import { gzipSync } from 'node:zlib';
import { getStoredTokens, isAdminRequest, saveStoredTokens } from './admin.mjs';
import { getKey, setKey } from './store.mjs';

export const API_PATH = '/api/terabox';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const SIGNING_KEY = 'iuuPc64E4Fhn0rTXEzrnbLph0o5qyEEa';
const APP_ID = '250528';

const MAX_TOKENS_TRIED = 4;
const FETCH_TIMEOUT_MS = 15000;
const RESOLVE_BUDGET_MS = 45000; // stop trying more tokens after this
const CRED_TTL_MS = 6 * 60 * 60 * 1000;

// ---------------------------------------------------------------- secret + stateless credentials
// The signing / encryption secret must be the same across restarts and across instances, otherwise every
// stream link dies ("Stream session expired") - the classic "works locally, breaks after deploy" bug.
//   1. PROXY_SECRET env (best when you run several instances)
//   2. a random secret saved once in DATA_DIR/store.json (survives restarts)
//   3. random per process (last resort, e.g. read-only disk)
let cachedSecret = null;
function proxySecret() {
  if (process.env.PROXY_SECRET) return process.env.PROXY_SECRET;
  if (cachedSecret) return cachedSecret;
  try {
    let s = getKey('proxy_secret');
    if (typeof s !== 'string' || s.length < 32) {
      s = randomBytes(32).toString('hex');
      setKey('proxy_secret', s);
    }
    cachedSecret = s;
  } catch {
    cachedSecret = randomBytes(32).toString('hex');
  }
  return cachedSecret;
}

const encKey = () => createHash('sha256').update(`enc:${proxySecret()}`).digest();

/** Cookie jar -> opaque encrypted token (`ck:...`). No server memory needed, so any instance can read it. */
function sealCookie(cookieHeader) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', encKey(), iv);
  const enc = Buffer.concat([c.update(JSON.stringify({ c: cookieHeader, e: Date.now() + CRED_TTL_MS }), 'utf8'), c.final()]);
  return `ck:${Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64url')}`;
}

/** returns the cookie string, or null if the token is invalid / expired */
function openCookie(cred) {
  if (!cred || !cred.startsWith('ck:')) return null;
  try {
    const buf = Buffer.from(cred.slice(3), 'base64url');
    const d = createDecipheriv('aes-256-gcm', encKey(), buf.subarray(0, 12));
    d.setAuthTag(buf.subarray(12, 28));
    const o = JSON.parse(Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8'));
    return o && o.e > Date.now() && typeof o.c === 'string' ? o.c : null;
  } catch {
    return null;
  }
}

const tfetch = (url, opts = {}, ms = FETCH_TIMEOUT_MS) => fetch(url, { ...opts, signal: opts.signal || AbortSignal.timeout(ms) });

// ---------------------------------------------------------------- helpers

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*',
    'Access-Control-Allow-Headers': 'content-type, x-terabox-cookie, x-admin-token, range',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Expose-Headers': 'content-length, content-range, accept-ranges',
  };
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    ...corsHeaders(),
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, no-cache',
  });
  res.end(JSON.stringify(body));
}

function envTokens() {
  return (process.env.NDUS_TOKENS || process.env.NDUS_TOKEN || '')
    .split(/[,\n]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * Token pool, in the order they are tried:
 *   1. tokens added in the admin panel (stored on the server) - primary first, healthy before failing
 *   2. NDUS_TOKENS from .env
 * Because this lives on the server, every visitor on every device gets the same VIP tokens.
 */
function buildTokenPool() {
  const rank = { active: 0, standby: 1, error: 2, expired: 3 };
  const stored = getStoredTokens()
    .filter((t) => t && typeof t.token === 'string' && t.token.trim())
    .sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0) || (rank[a.status] ?? 1) - (rank[b.status] ?? 1));

  const pool = [];
  const seen = new Set();
  for (const t of stored) {
    const raw = t.token.trim();
    if (seen.has(raw)) continue;
    seen.add(raw);
    pool.push({ cookie: toCookieHeader(raw), label: t.label || 'Admin token', id: t.id });
  }
  envTokens().forEach((raw, i) => {
    if (seen.has(raw)) return;
    seen.add(raw);
    pool.push({ cookie: toCookieHeader(raw), label: `env-token-${i + 1}` });
  });
  return pool;
}

/** Update success/failure counters of admin-panel tokens after a resolve. Best effort. */
function recordTokenStats(successId, limitedIds) {
  if (!successId && limitedIds.length === 0) return;
  try {
    const list = getStoredTokens();
    const now = new Date().toISOString();
    let changed = false;
    for (const t of list) {
      if (successId && t.id === successId) {
        t.successCount = (t.successCount || 0) + 1;
        t.failureCount = 0;
        t.lastUsedAt = now;
        t.status = t.isPrimary ? 'active' : t.status === 'expired' || t.status === 'error' ? 'standby' : t.status;
        changed = true;
      } else if (limitedIds.includes(t.id)) {
        // another token streamed this very video in full, so this one is the problem
        t.failureCount = (t.failureCount || 0) + 1;
        t.status = t.failureCount >= 3 ? 'expired' : 'error';
        changed = true;
      }
    }
    if (changed) saveStoredTokens(list);
  } catch (e) {
    console.error('token stats update failed:', e instanceof Error ? e.message : e);
  }
}

/** "ndus=xxx; foo=bar" or bare "xxx" -> cookie header string */
function toCookieHeader(raw) {
  const v = (raw || '').trim();
  if (!v) return '';
  return v.includes('=') ? v : `ndus=${v}`;
}

// 128-bit truncated HMAC keeps the (many) segment URLs in a playlist short
function sign(payload) {
  return createHmac('sha256', proxySecret()).update(payload).digest('hex').slice(0, 32);
}

function verify(payload, sig) {
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(String(sig || ''));
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/**
 * Build a signed internal proxy URL. It is deliberately RELATIVE ("?action=...") so the browser resolves it
 * against the URL the playlist was loaded from. That means it keeps working behind any proxy / CDN / sub-path /
 * https terminator, with no need to guess the public host - which is what used to cause blocked
 * "mixed content" (http:// segments inside an https:// page) after deploying.
 */
function proxyUrl(action, target, cred) {
  const sig = sign(`${action}\n${target}\n${cred}`);
  const p = new URLSearchParams({ action, u: target, c: cred, sig });
  return `?${p.toString()}`;
}

function extractShortUrl(value) {
  const trimmed = value.trim();
  const parsed = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
  if (parsed.searchParams.has('surl')) {
    return (parsed.searchParams.get('surl') || '').replace(/^1/, '');
  }
  const match = parsed.pathname.match(/\/s\/1?([A-Za-z0-9_-]+)/);
  if (match) return match[1];
  throw new Error('Could not parse TeraBox share ID from link');
}

function hmacSha1Hex(key, data) {
  return createHmac('sha1', key).update(data).digest('hex');
}

class CookieJar {
  constructor() {
    this.map = new Map();
  }
  set(str) {
    if (!str) return;
    const [k, ...rest] = str.split(';')[0].split('=');
    const v = rest.join('=');
    if (k && v !== undefined) this.map.set(k.trim(), v.trim());
  }
  header() {
    return [...this.map.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }
}

async function fetchWithRedirects(startUrl, cookie) {
  const jar = new CookieJar();
  for (const part of (cookie || '').split(';')) jar.set(part.trim());

  const doFetch = (u) =>
    tfetch(u, {
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en-US,en;q=0.9', Cookie: jar.header() },
      redirect: 'manual',
    });

  let currentUrl = startUrl;
  let res = await doFetch(currentUrl);
  for (let i = 0; i < 5; i++) {
    for (const c of res.headers.getSetCookie?.() ?? []) jar.set(c);
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) break;
      currentUrl = new URL(loc, currentUrl).toString();
      res = await doFetch(currentUrl);
    } else break;
  }
  return { res, finalUrl: currentUrl, jar };
}

/** Rewrite every segment / sub-playlist / key URI in an m3u8 so it goes through our signed proxy. */
function rewritePlaylist(text, baseUrl, cred) {
  const abs = (u) => new URL(u, baseUrl).toString();
  const isPlaylist = (u) => /\.m3u8(\?|$)/i.test(u) || /[?&]type=M3U8/i.test(u);
  const wrap = (u) => proxyUrl(isPlaylist(u) ? 'playlist' : 'asset', abs(u), cred);

  return text
    .split(/\r?\n/)
    .map((line) => {
      const t = line.trim();
      if (!t) return line;
      if (t.startsWith('#')) {
        // e.g. #EXT-X-KEY:METHOD=AES-128,URI="..."  /  #EXT-X-MAP:URI="..."
        return line.replace(/URI="([^"]+)"/g, (_, u) => `URI="${wrap(u)}"`);
      }
      return wrap(t);
    })
    .join('\n');
}

// ---------------------------------------------------------------- resolve

/** Share pages to try, in order. Some hosts / regions are only served by one of TeraBox's domains. */
function pageCandidates(inputUrl, shortId) {
  const list = [inputUrl];
  for (const host of ['1024terabox.com', 'www.terabox.app', 'www.1024tera.com', 'www.teraboxapp.com']) {
    list.push(`https://${host}/s/1${shortId}`);
  }
  return [...new Set(list)];
}

function findTokens(html) {
  const pc =
    html.match(/"pcftoken"\s*:\s*"([^"]*)"/) ||
    html.match(/pcftoken['"]?\s*[:=]\s*['"]([A-Za-z0-9_\-]+)['"]/);
  const js =
    html.match(/fn%28%22([A-Za-z0-9]+)%22/) ||
    html.match(/window\.jsToken\s*=\s*a\}\s*;fn\((?:"|')([A-Za-z0-9]+)/) ||
    html.match(/fn\(\s*["']([A-Fa-f0-9]{24,})["']\s*\)/) ||
    html.match(/jsToken['"]?\s*[:=]\s*['"]([A-Za-z0-9]{24,})['"] /);
  return pc && js ? { pcftoken: pc[1], jsToken: js[1].replace(/["']/g, '') } : null;
}

/** Quality ladder: every TeraBox rendition we know of. Each step tries its types in order
 * (TeraBox answers a slightly different subset per request, so a fallback helps) - the first type
 * that returns a valid #EXTM3U becomes that selectable quality in the player.
 * Non-VIP accounts / anonymous visitors only get a short preview of the first. */
const QUALITY_LADDER = [
  { label: 'Auto', types: ['M3U8_AUTO_480', 'M3U8_FLV_264_480', 'M3U8_HLS_MP4_480'] },
  { label: '1080P', types: ['M3U8_AUTO_1080', 'M3U8_HLS_MP4_1080', 'M3U8_FLV_264_1080'] },
  { label: '720P', types: ['M3U8_AUTO_720', 'M3U8_HLS_MP4_720', 'M3U8_FLV_264_720'] },
  { label: '480P', types: ['M3U8_FLV_264_480', 'M3U8_AUTO_480', 'M3U8_HLS_MP4_480'] },
  { label: '360P', types: ['M3U8_AUTO_360', 'M3U8_FLV_264_360'] },
  { label: '240P', types: ['M3U8_AUTO_240'] },
  { label: '144P', types: ['M3U8_AUTO_144'] },
];

async function resolveWithCookie(inputUrl, cookie, trace) {
  const log = (m) => trace && trace.push(m);
  const shortId = extractShortUrl(inputUrl);

  // 1) share page -> pcftoken + jsToken
  let page = null;
  for (const candidate of pageCandidates(inputUrl, shortId).slice(0, 4)) {
    try {
      const { res, finalUrl, jar } = await fetchWithRedirects(candidate, cookie);
      const html = await res.text();
      const tokens = findTokens(html);
      log(`page ${new URL(candidate).host} -> HTTP ${res.status}, tokens ${tokens ? 'found' : 'NOT found'}`);
      if (tokens) {
        page = { ...tokens, finalUrl, jar };
        break;
      }
    } catch (e) {
      log(`page ${candidate} -> ${e instanceof Error ? e.message : 'failed'}`);
    }
  }
  if (!page) {
    return {
      status: 404,
      error: 'This TeraBox link is invalid/expired, or TeraBox is blocking this server (check the link opens in a browser).',
      is_404: true,
    };
  }

  const { pcftoken, jsToken, finalUrl, jar } = page;
  const browserId = jar.map.get('browserid') || '';
  const pageBase = `${new URL(finalUrl).protocol}//${new URL(finalUrl).host}`;
  const baseHeaders = { 'User-Agent': USER_AGENT, Referer: `${pageBase}/`, Cookie: jar.header() };

  // 2) file list
  const listParams = new URLSearchParams({
    clientfrom: 'h5', psign: '0', pcftoken, clienttype: '0', channel: 'dubox', web: '1',
    app_id: APP_ID, jsToken, page: '1', num: '20', scene: '', shorturl: shortId,
    root: '1', by: 'time', order: 'desc',
  });
  const listRes = await tfetch(`${pageBase}/share/list?${listParams}`, { headers: baseHeaders });
  const listData = await listRes.json().catch(() => null);
  log(`share/list -> errno ${listData ? listData.errno : 'no-json'}, items ${listData?.list?.length ?? 0}`);

  if (!listData || listData.errno !== 0 || !listData.list || listData.list.length === 0) {
    return { status: 404, error: 'No video files found in this TeraBox share, or the file was deleted.', is_404: true };
  }

  const fileItem = listData.list.find((i) => i.category === 1 || i.isdir === 0) || listData.list[0];
  const isAudio = fileItem.category === 2 || /\.(m4a|mp3|aac|wav|flac|ogg)$/i.test(fileItem.server_filename || '');
  const ladder = isAudio
    ? [{ label: 'Auto', types: ['M3U8_HLS_MP3_128'] }]
    : QUALITY_LADDER;

  // 3) streaming manifests: probe every rendition (entries in parallel, types within an entry in order).
  //    Each success becomes a quality option; the first ("Auto") is the default stream.
  const probeStream = async (label, type) => {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = hmacSha1Hex(SIGNING_KEY, `0dubox${browserId}${timestamp}`);
    const streamParams = new URLSearchParams({
      uk: String(listData.uk), shareid: String(listData.share_id), type,
      fid: String(fileItem.fs_id), sign: signature, timestamp, jsToken,
      esl: '1', isplayer: '1', ehps: '1', clientfrom: 'h5', psign: '0', pcftoken,
      clienttype: '0', channel: 'dubox', web: '1', app_id: APP_ID,
    });
    const url = `${pageBase}/share/streaming?${streamParams}`;
    try {
      const check = await tfetch(url, { headers: baseHeaders });
      const text = await check.text();
      if (text.includes('#EXTM3U')) {
        let seconds = 0;
        for (const m of text.matchAll(/#EXTINF:([0-9.]+)/g)) seconds += parseFloat(m[1]);
        log(`streaming ${type} -> OK, ${Math.round(seconds)}s of segments`);
        return { label, type, url, seconds: Math.round(seconds) };
      }
      let code = '';
      try {
        const j = JSON.parse(text);
        code = `errno ${j.errno ?? '?'}${j.errmsg ? ` (${j.errmsg})` : ''}`;
      } catch {
        code = `HTTP ${check.status}`;
      }
      log(`streaming ${type} -> ${code}`);
    } catch (e) {
      log(`streaming ${type} -> ${e instanceof Error ? e.message : 'network error'}`);
    }
    return null;
  };

  const probeEntry = async (entry) => {
    for (const type of entry.types) {
      const hit = await probeStream(entry.label, type);
      if (hit) return hit;
    }
    return null;
  };

  const probed = (await Promise.all(ladder.map(probeEntry))).filter(Boolean);

  if (probed.length === 0) {
    return { status: 502, error: 'TeraBox did not return a video stream. Try again in a moment.' };
  }

  // default stream: the "Auto" entry if it answered, otherwise the first success (still labelled Auto)
  const autoEntry = probed.find((p) => p.label === 'Auto') || probed[0];
  const previewSeconds = autoEntry.seconds || Math.max(...probed.map((p) => p.seconds));
  const isLimited = previewSeconds <= 10 && (fileItem.duration || 0) > 12;
  const cred = sealCookie(jar.header().length > 900 ? [...jar.map].filter(([k]) => k === 'ndus' || k === 'browserid').map(([k, v]) => `${k}=${v}`).join('; ') : jar.header());

  // resolutions: Auto first (the default stream), then every other rendition that answered.
  // Skip anything that is physically the same stream type as the default.
  const resolutions = [{ label: 'Auto', url: proxyUrl('playlist', autoEntry.url, cred), height: 0 }];
  for (const p of probed) {
    if (p.type === autoEntry.type) continue;
    resolutions.push({ label: p.label, url: proxyUrl('playlist', p.url, cred), height: parseInt(p.label, 10) || 0 });
  }

  return {
    status: 200,
    body: {
      url: resolutions[0].url, // relative on purpose: the client resolves it against the API URL it called
      type: 'application/vnd.apple.mpegurl',
      title: fileItem.server_filename || 'TeraBox Video Stream',
      duration: previewSeconds || fileItem.duration || 25,
      full_duration: fileItem.duration || 0,
      preview_seconds: previewSeconds || fileItem.duration || 25,
      preview_limited: isLimited,
      thumbnail: fileItem.thumbs?.url3 || fileItem.thumbs?.url2 || '',
      width: fileItem.width || 360,
      height: fileItem.height || 640,
      resolutions,
    },
  };
}

/**
 * Tries, in order: explicit client cookie -> admin-panel tokens -> .env tokens -> ANONYMOUS.
 * Anonymous is always the last resort, so a missing / expired / wrong ndus token still gives the free
 * ~10 second preview instead of an error.
 */
async function runResolve(req, q, trace) {
  let inputUrl = (q.get('url') || '').trim();
  if (!inputUrl) return { status: 400, body: { error: 'Missing url parameter' } };

  if (!/^https?:\/\//i.test(inputUrl)) {
    inputUrl = inputUrl.includes('/') ? `https://${inputUrl}` : `https://1024terabox.com/s/1${inputUrl.replace(/^1/, '')}`;
  }
  try {
    extractShortUrl(inputUrl);
  } catch (e) {
    return { status: 400, body: { error: e instanceof Error ? e.message : 'Invalid TeraBox link' } };
  }

  const clientCookie = (req.headers['x-terabox-cookie'] || q.get('cookie') || '').toString().trim();
  const candidates = [];
  if (clientCookie) candidates.push({ cookie: toCookieHeader(clientCookie), label: 'client-token' });
  candidates.push(...buildTokenPool().slice(0, MAX_TOKENS_TRIED));
  candidates.push({ cookie: '', label: 'anonymous' });

  let last = { status: 502, error: 'Could not resolve TeraBox link.' };
  let limited = null; // best "10 second preview only" answer, used only if no token gives the full video
  const limitedIds = [];
  const t0 = Date.now();

  for (const c of candidates) {
    if (Date.now() - t0 > RESOLVE_BUDGET_MS) break;
    trace?.push(`--- trying: ${c.label}`);
    try {
      const r = await resolveWithCookie(inputUrl, c.cookie, trace);
      if (r.status === 200) {
        if (r.body.preview_limited) {
          // This token only unlocks a short preview (expired / not VIP). Try the next one.
          if (!limited) limited = { r, c };
          if (c.id) limitedIds.push(c.id);
          continue;
        }
        recordTokenStats(c.id, limitedIds);
        return { status: 200, body: { ...r.body, token_label: c.label } };
      }
      last = r;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Internal error';
      trace?.push(`error: ${msg}`);
      last = { status: 502, error: `Could not reach TeraBox from this server (${msg}).` };
    }
  }

  if (limited) return { status: 200, body: { ...limited.r.body, token_label: limited.c.label } };
  return { status: last.status || 500, body: { error: last.error, is_404: last.is_404 } };
}

async function actionResolve(req, res, q) {
  const r = await runResolve(req, q);
  return sendJson(res, r.status, r.body);
}

/** Admin only: step-by-step report of what happens for a link (never includes tokens / cookies). */
async function actionDiagnose(req, res, q) {
  if (!isAdminRequest(req)) return sendJson(res, 401, { error: 'Admin login required.' });
  const trace = [];
  const r = await runResolve(req, q, trace);
  const b = r.body || {};
  return sendJson(res, 200, {
    ok: r.status === 200,
    status: r.status,
    error: b.error,
    token_used: b.token_label,
    preview_only: Boolean(b.preview_limited),
    preview_seconds: b.preview_seconds,
    full_duration: b.full_duration,
    title: b.title,
    steps: trace,
  });
}

// ---------------------------------------------------------------- proxy (playlist / asset)

function verifiedTarget(q, action) {
  const target = q.get('u') || '';
  const cred = q.get('c') || '';
  const sig = q.get('sig') || '';
  if (!target || !verify(`${action}\n${target}\n${cred}`, sig)) return null;
  if (!/^https?:\/\//i.test(target)) return null;
  return { target, cred };
}

async function actionPlaylist(req, res, q) {
  const v = verifiedTarget(q, 'playlist');
  if (!v) return sendJson(res, 403, { error: 'Invalid or expired stream link. Please play again.' });

  const cookie = openCookie(v.cred);
  if (cookie === null) return sendJson(res, 410, { error: 'Stream session expired. Please play again.' });

  const upstream = await tfetch(v.target, {
    headers: { 'User-Agent': USER_AGENT, Referer: 'https://www.terabox.app/', Cookie: cookie },
  });
  const text = await upstream.text();
  if (!text.includes('#EXTM3U')) {
    return sendJson(res, 502, { error: 'TeraBox stream token expired. Please play again.' });
  }

  const body = rewritePlaylist(text, v.target, v.cred);
  const headers = { ...corsHeaders(), 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'no-store, no-cache' };
  if (/\bgzip\b/.test(String(req.headers['accept-encoding'] || ''))) {
    res.writeHead(200, { ...headers, 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' });
    return res.end(gzipSync(body));
  }
  res.writeHead(200, headers);
  res.end(body);
}

async function actionAsset(req, res, q) {
  const v = verifiedTarget(q, 'asset');
  if (!v) return sendJson(res, 403, { error: 'Invalid or expired stream link.' });

  const cookie = openCookie(v.cred);
  if (cookie === null) return sendJson(res, 410, { error: 'Stream session expired. Please play again.' });

  const headers = { 'User-Agent': USER_AGENT, Referer: 'https://www.terabox.app/', Cookie: cookie };
  if (req.headers.range) headers.Range = req.headers.range;

  const ac = new AbortController();
  res.on('close', () => ac.abort());
  const connectTimer = setTimeout(() => ac.abort(), 20000); // only until the first byte / headers arrive

  let upstream;
  try {
    upstream = await fetch(v.target, { headers, signal: ac.signal });
  } finally {
    clearTimeout(connectTimer);
  }

  const out = { ...corsHeaders() };
  for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
    const val = upstream.headers.get(h);
    if (val) out[h] = val;
  }
  if (!out['content-type']) out['content-type'] = 'video/mp2t';
  out['Cache-Control'] = 'private, max-age=300';

  res.writeHead(upstream.status, out);
  if (!upstream.body) return res.end();
  Readable.fromWeb(upstream.body).on('error', () => res.destroy()).pipe(res);
}

// ---------------------------------------------------------------- token test

async function actionTest(req, res, q) {
  const clean = (req.headers['x-terabox-cookie'] || q.get('cookie') || '').toString().trim().replace(/^ndus=/, '');
  if (clean.length < 15 || !/^[A-Za-z0-9_\-%.]+$/.test(clean)) {
    return sendJson(res, 200, { valid: false, message: 'Invalid or empty ndus token format' });
  }
  try {
    const r = await fetch('https://www.1024tera.com/', {
      headers: { 'User-Agent': USER_AGENT, Cookie: `ndus=${clean}` },
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
    });
    const reachable = r.status < 500;
    return sendJson(res, 200, {
      valid: reachable,
      status: r.status,
      message: reachable
        ? 'Token format OK and TeraBox is reachable. (Real validation happens when a video is resolved.)'
        : `TeraBox returned status ${r.status}`,
    });
  } catch {
    return sendJson(res, 200, { valid: true, message: 'Token format is valid (TeraBox not reachable from server right now).' });
  }
}

// ---------------------------------------------------------------- entry

/** Node http-style handler. Mount it on API_PATH. */
export async function handleTerabox(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders());
    return res.end();
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const q = new URL(req.url, 'http://localhost').searchParams;
    const action = q.get('action') || 'resolve';
    if (action === 'asset') return await actionAsset(req, res, q);
    if (action === 'playlist') return await actionPlaylist(req, res, q);
    if (action === 'test') return await actionTest(req, res, q);
    if (action === 'diagnose') return await actionDiagnose(req, res, q);
    return await actionResolve(req, res, q);
  } catch (err) {
    if (res.headersSent) return res.destroy();
    return sendJson(res, 500, { error: err instanceof Error ? err.message : 'Internal Server Error' });
  }
}

// exported for tests
export const __internal = { rewritePlaylist, extractShortUrl, sign, verify, sealCookie, openCookie, proxyUrl, findTokens };
