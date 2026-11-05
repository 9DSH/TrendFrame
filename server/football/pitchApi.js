// Thin client for PitchAPI (https://pitchapi.dev). Free, read-only, key in the X-API-KEY header, HTTPS only.
// The key is read from PITCHAPI_API_KEY on every call, so it never reaches the browser.

const BASE = 'https://api.pitchapi.dev';
const TIMEOUT_MS = 30_000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class PitchApiError extends Error {
  constructor(message, { status = 0, code = 'UNKNOWN' } = {}) {
    super(message);
    this.name = 'PitchApiError';
    this.status = status;
    this.code = code;
  }
}

export const keyConfigured = () => Boolean(process.env.PITCHAPI_API_KEY);

async function get(path, params = {}, retries = 2) {
  const key = process.env.PITCHAPI_API_KEY;
  if (!key) throw new PitchApiError('PITCHAPI_API_KEY is missing. Add it to .env and restart the server.', { status: 400, code: 'MISSING_KEY' });

  const url = new URL(path, BASE);
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, v);

  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(url, { headers: { 'X-API-KEY': key }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (e) {
      if (attempt < retries) { await sleep(500 * 2 ** attempt); continue; }
      throw new PitchApiError(e.name === 'TimeoutError' ? 'PitchAPI request timed out.' : `Could not reach PitchAPI: ${e.message}`, { code: 'NETWORK' });
    }
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      const wait = Number(res.headers.get('retry-after'));
      await sleep(Math.min(wait > 0 ? wait * 1000 : 1000 * 2 ** attempt, 10_000));
      continue;
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.error) {
      const code = body.error?.code ?? 'UNKNOWN';
      const message = code === 'UNAUTHORIZED'
        ? 'PitchAPI rejected the API key. Check PITCHAPI_API_KEY in .env.'
        : `PitchAPI ${res.status} (${code}): ${body.error?.message || res.statusText}`;
      throw new PitchApiError(message, { status: res.status, code });
    }
    return body.data;
  }
}

/** { leagues: [{ id, name, country_code, seasons: ["2025/2026", ...] }] } */
export const listLeagues = () => get('/v1/leagues');
/** { league, matches: [{ id, date, status, home_team, away_team, score_home, score_away }] }. Played matches only. */
export const leagueMatches = (leagueId, season) => get(`/v1/leagues/${encodeURIComponent(leagueId)}/matches`, { season });
export const getMatch = (id) => get(`/v1/matches/${encodeURIComponent(id)}`);
/** { events: [{ event_type, minute, minute_added, player, is_own_goal, ... }] } */
export const matchEvents = (id) => get(`/v1/matches/${encodeURIComponent(id)}/events`);
/** { periods: [{ period, shots: [{ player, x, y, expected_goals, minute, event_type, ... }] }] } */
export const matchShots = (id) => get(`/v1/matches/${encodeURIComponent(id)}/shots`);