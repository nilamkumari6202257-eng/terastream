// Production server: serves the built site (dist/) + the self-hosted TeraBox API. No Supabase.
//   npm run build && npm start
import http from 'node:http';
import { createGzip } from 'node:zlib';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { loadEnvFile } from './env.mjs';
import { API_PATH, handleTerabox } from './terabox.mjs';
import { ADMIN_PATH, adminPasswordIsDefault, handleAdmin } from './admin.mjs';
import { storeLocation } from './store.mjs';

loadEnvFile();

const PORT = Number(process.env.PORT || 8787);
const DIST = resolve(process.cwd(), 'dist');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8', '.map': 'application/json',
};

const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.txt', '.map']);

function serveFile(req, res, file) {
  const ext = extname(file).toLowerCase();
  const immutable = file.includes(`${DIST}/assets/`) || file.includes(`${DIST}\\assets\\`);
  const headers = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  };
  const stream = createReadStream(file);
  stream.on('error', () => res.destroy());
  if (COMPRESSIBLE.has(ext) && /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''))) {
    res.writeHead(200, { ...headers, 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' });
    stream.pipe(createGzip()).pipe(res);
  } else {
    res.writeHead(200, headers);
    stream.pipe(res);
  }
}

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = new URL(req.url, 'http://localhost').pathname;
  } catch {
    res.writeHead(400);
    return void res.end('Bad request');
  }

  if (pathname === API_PATH) return void handleTerabox(req, res);
  if (pathname === ADMIN_PATH) return void handleAdmin(req, res);
  if (pathname === '/api/health' || pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return void res.end(JSON.stringify({ ok: true }));
  }

  if (!existsSync(DIST)) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    return void res.end('dist/ not found. Run `npm run build` first.');
  }

  // static files, with SPA fallback to index.html
  let decoded = pathname;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    /* keep raw path */
  }
  const safe = normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  const file = join(DIST, safe);
  if (file.startsWith(DIST) && existsSync(file) && statSync(file).isFile()) return serveFile(req, res, file);
  serveFile(req, res, join(DIST, 'index.html'));
});

server.keepAliveTimeout = 65000; // longer than typical proxy/load-balancer idle timeouts
server.headersTimeout = 66000;
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => server.close(() => process.exit(0)));

server.listen(PORT, '0.0.0.0', () => {
  const n = (process.env.NDUS_TOKENS || process.env.NDUS_TOKEN || '').split(/[,\n]/).filter((t) => t.trim()).length;
  console.log(`TeraStream running on http://localhost:${PORT}  (TeraBox API: ${API_PATH}, ndus tokens loaded: ${n})`);
  console.log(`Admin data + tokens are saved in: ${storeLocation()}  (keep this folder on a persistent disk)`);
  if (adminPasswordIsDefault()) console.warn('WARNING: ADMIN_PASSWORD is not set in .env - the admin password is the default "admin". Change it!');
});
