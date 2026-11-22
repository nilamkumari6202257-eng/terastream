// Tiny JSON-file store (no dependency). Everything the admin panel changes lives here, so every
// visitor / device sees the same data. Default location: ./data/store.json  (override: DATA_DIR)
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

let dirOverride = null; // set if the configured folder is read-only (some hosts) - we fall back to a temp dir

const storeFile = () => resolve(dirOverride || process.env.DATA_DIR || resolve(process.cwd(), 'data'), 'store.json');

let cache = null;

function load() {
  if (cache) return cache;
  try {
    const f = storeFile();
    cache = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {};
  } catch (e) {
    console.error('store.json could not be read, starting empty:', e instanceof Error ? e.message : e);
    cache = {};
  }
  if (!cache || typeof cache !== 'object' || Array.isArray(cache)) cache = {};
  return cache;
}

function write(f) {
  mkdirSync(dirname(f), { recursive: true });
  const tmp = `${f}.tmp`;
  writeFileSync(tmp, JSON.stringify(cache));
  renameSync(tmp, f); // atomic replace: never leaves a half-written file
}

function persist() {
  try {
    write(storeFile());
  } catch (e) {
    if (dirOverride) throw e;
    // read-only disk (some serverless / shared hosts): keep working from a temp folder instead of failing every save
    dirOverride = resolve(tmpdir(), 'cinemitra-data');
    console.error(`Could not write to ${dirname(storeFile())}; falling back to ${dirOverride}. Data may be LOST on restart - set DATA_DIR to a persistent disk.`);
    write(storeFile());
  }
}

export const getKey = (key) => load()[key];

export function setKey(key, value) {
  load()[key] = value;
  persist();
}

export const storeLocation = storeFile;
