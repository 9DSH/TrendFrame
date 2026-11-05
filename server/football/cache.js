import { db } from '../database/db.js';

// The module owns its own table, so the shared schema file does not change.
db.exec(`CREATE TABLE IF NOT EXISTS football_cache (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  fetched_at TEXT NOT NULL
)`);

const read = db.prepare('SELECT value, fetched_at FROM football_cache WHERE key = ?');
const write = db.prepare(`INSERT INTO football_cache (key, value, fetched_at) VALUES (?,?,?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, fetched_at = excluded.fetched_at`);

/** Cached value, or null when missing or older than maxAgeMs (Infinity = never expires). */
export function cacheGet(key, maxAgeMs = Infinity) {
  const row = read.get(key);
  if (!row) return null;
  if (Number.isFinite(maxAgeMs) && Date.now() - Date.parse(row.fetched_at) > maxAgeMs) return null;
  return JSON.parse(row.value);
}

export const cacheSet = (key, value) => write.run(key, JSON.stringify(value), new Date().toISOString());

const exists = db.prepare('SELECT 1 FROM football_cache WHERE key = ?');
export const cacheHas = (key) => Boolean(exists.get(key));

/** Fresh cache, else load. If loading fails but an expired copy exists, the expired copy is used. */
export async function cached(key, maxAgeMs, loader) {
  const fresh = cacheGet(key, maxAgeMs);
  if (fresh !== null) return fresh;
  try {
    const value = await loader();
    cacheSet(key, value);
    return value;
  } catch (e) {
    const stale = cacheGet(key);
    if (stale !== null) return stale;
    throw e;
  }
}