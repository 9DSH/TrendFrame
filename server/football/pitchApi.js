// Thin client for PitchAPI (https://pitchapi.dev). Free, read-only, key in the X-API-KEY header, HTTPS only.
// The key is read on every call, so changing it in Settings takes effect immediately.
import { EventEmitter } from 'node:events';

const BASE = 'https://api.pitchapi.dev';
const TIMEOUT_MS = 20_000;
const MAX_RETRIES = 4;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Emits 'retry' (message) whenever a call is being retried, so the UI can show why a search is slow. */
export const pitchEvents = new EventEmitter();
let pausedUntil = 0; // shared: when one call gets a 429, every call waits

export class PitchApiError extends Error {
  constructor(message, { status = 0, code = 'UNKNOWN' } = {}) {
    super(message);
    this.name = 'PitchApiError';
    this.status = status;
    this.code = code;
  }
}

const apiKey = () => String(process.env.PITCHAPI_API_KEY ?? '').trim();
export const keyConfigured = () => Boolean(apiKey());

async function get(path, params = {}) {
  const key = apiKey();
  if (!key) throw new PitchApiError('PITCHAPI_API_KEY is missing. Add it in Settings → Integrations.', { status: 400, code: 'MISSING_KEY' });

  const url = new URL(path, BASE);
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, v);

  for (let attempt = 0; ; attempt++) {
    const wait = pausedUntil - Date.now();
    if (wait > 0) await sleep(wait);

    let res;
    try {
      res = await fetch(url, { headers: { 'X-API-KEY': key }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (e) {
      const why = e.name === 'TimeoutError' ? 'timed out' : e.message;
      if (attempt < MAX_RETRIES) {
        const delay = 500 * 2 ** attempt;
        pitchEvents.emit('retry', `PitchAPI request ${why}; retrying in ${delay / 1000}s (${attempt + 1}/${MAX_RETRIES})`);
        await sleep(delay);
        continue;
      }
      throw new PitchApiError(e.name === 'TimeoutError' ? 'PitchAPI request timed out.' : `Could not reach PitchAPI: ${e.message}`, { code: 'NETWORK' });
    }

    if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
      const ra = Number(res.headers.get('retry-after'));
      const delay = Math.min(ra > 0 ? ra * 1000 : 1000 * 2 ** attempt, 15_000);
      if (res.status === 429) pausedUntil = Math.max(pausedUntil, Date.now() + delay);
      pitchEvents.emit('retry', `PitchAPI answered ${res.status}; waiting ${Math.round(delay / 1000)}s (${attempt + 1}/${MAX_RETRIES})`);
      await res.body?.cancel().catch(() => {});
      await sleep(delay);
      continue;
    }

    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.error) {
      const code = body.error?.code ?? 'UNKNOWN';
      const message = code === 'UNAUTHORIZED'
        ? 'PitchAPI rejected the API key. Check it in Settings → Integrations.'
        : `PitchAPI ${res.status} (${code}): ${body.error?.message || res.statusText}`;
      throw new PitchApiError(message, { status: res.status, code });
    }
    if (body.data === undefined) throw new PitchApiError('PitchAPI returned an unexpected response (no "data" field).', { status: res.status, code: 'BAD_RESPONSE' });
    return body.data;
  }
}

/** { leagues: [{ id, name, country_code, seasons: ["2025/2026", ...] }] } */
export const listLeagues = () => get('/v1/leagues');
/** { league, matches: [{ id, date, status, home_team, away_team, score_home, score_away }] }. Played matches only. */
export const leagueMatches = (leagueId, season) => get(`/v1/leagues/${encodeURIComponent(leagueId)}/matches`, { season });
export const getMatch = (id) => get(`/v1/matches/${encodeURIComponent(id)}`);
export const matchEvents = (id) => get(`/v1/matches/${encodeURIComponent(id)}/events`);
export const matchShots = (id) => get(`/v1/matches/${encodeURIComponent(id)}/shots`);