import { cached, cacheGet, cacheSet, cacheHas } from './cache.js';
import * as api from './pitchApi.js';
import { PitchApiError } from './pitchApi.js';
import {
  parseQuery, seasonCovers, latestSeason, earliestYear, matchYearOk, findCompetitions, splitTeamsAndPlayer,
  matchHasTeams, buildGoals, goalsByPlayer, normalize, mapPool, fixTeamTokens, vsHints, nameMatchesPlayer,
} from './footballLogic.js';

const HOUR = 3_600_000;
const DAY = 86_400_000;
const POOL = 4;                // parallel PitchAPI calls; PitchAPI has a fair-use burst limit
const MAX_GOAL_FETCHES = 400;  // per search, uncached games only
const MAX_RESULTS = 100;

const httpError = (status, message) => Object.assign(new Error(message), { status });
const isFatal = (e) => e instanceof PitchApiError && (e.code === 'MISSING_KEY' || e.code === 'UNAUTHORIZED');
// A finished match older than this will not change any more, so its data is cached for good.
const isSettled = (date) => Date.now() - Date.parse(date) > 2 * DAY;

// ---------- leagues and fixtures ----------

export const getLeagues = () => cached('leagues', 7 * DAY, async () =>
  ((await api.listLeagues()).leagues ?? []).map((l) => ({ id: l.id, name: l.name, country: l.country_code ?? null, seasons: l.seasons ?? [] })));

const slim = (m) => ({
  id: m.id,
  date: m.date ?? m.time_utc?.slice(0, 10) ?? null,
  home: { id: m.home_team?.id ?? null, name: m.home_team?.name ?? 'Unknown' },
  away: { id: m.away_team?.id ?? null, name: m.away_team?.name ?? 'Unknown' },
  scoreHome: m.score_home ?? null,
  scoreAway: m.score_away ?? null,
});

/** Played matches of one league season. Finished seasons are cached for good, the current one for 6 hours. */
async function seasonMatches(league, season) {
  const current = season === latestSeason(league);
  const rows = await cached(`fixtures:${league.id}:${season}`, current ? 6 * HOUR : Infinity,
    async () => ((await api.leagueMatches(league.id, season)).matches ?? []).map(slim));
  return rows.map((m) => ({ ...m, league: league.name, season }));
}

// ---------- goals of one match ----------

async function loadSummary(id) {
  const hit = cacheGet(`match:${id}`);
  if (hit) return hit;
  const d = await api.getMatch(id);
  const match = { ...slim(d), league: d.league?.name ?? null, status: d.status ?? null };
  if (match.status === 'finished' && isSettled(match.date)) cacheSet(`match:${id}`, match);
  return match;
}

/** Goals with scorer, minute, shot distance and xG where PitchAPI has them. Complete results are cached. */
async function loadGoals(id, date) {
  const key = `goals:${id}`;
  const hit = cacheGet(key);
  if (hit) return hit;

  const [ev, sh] = await Promise.allSettled([api.matchEvents(id), api.matchShots(id)]);
  if (ev.status === 'rejected' && sh.status === 'rejected') throw ev.reason;

  const built = buildGoals(
    ev.status === 'fulfilled' ? ev.value?.events ?? [] : [],
    sh.status === 'fulfilled' ? (sh.value?.periods ?? []).flatMap((p) => p.shots ?? []) : [],
  );
  const warnings = [];
  if (ev.status === 'rejected') warnings.push('Goal events could not be loaded, so the goals were rebuilt from shot data.');
  if (sh.status === 'rejected') warnings.push('Shot data could not be loaded, so distance and xG are not available.');

  const result = { goals: built.goals, source: built.source, warnings };
  if (!warnings.length && isSettled(date)) cacheSet(key, result); // never cache a partial result
  return result;
}

/** Everyone named in the lineup of a match, with their team. Settled matches are cached for good. */
async function loadLineupPlayers(id, date) {
  const key = `lineup:${id}`;
  const hit = cacheGet(key);
  if (hit) return hit;
  const d = await api.matchLineups(id);
  const side = (s, team) => [...(s?.starters ?? []), ...(s?.subs ?? [])]
    .map((p) => ({ name: p.name, teamId: team?.id ?? null, teamName: team?.name ?? null }));
  const players = [...side(d.home, d.home_team), ...side(d.away, d.away_team)];
  if (isSettled(date)) cacheSet(key, players);
  return players;
}

const MAX_LINEUP_FETCHES = 120;

/** No team in the query: find the player's club in the lineups of the newest match of each team. */
async function findClub(candidates, playerTokens, ctl) {
  const covered = new Set();
  const picks = [];
  for (const m of candidates) { // candidates are newest first
    const ids = [m.home.id, m.away.id].filter(Boolean);
    if (!ids.length || ids.every((i) => covered.has(i))) continue;
    ids.forEach((i) => covered.add(i));
    picks.push(m);
    if (picks.length >= MAX_LINEUP_FETCHES) break;
  }
  ctl.log(`No team given: looking for the player's club in ${picks.length} recent lineup(s)`);
  ctl.progress("Finding the player's club", 0, picks.length);

  const ids = new Set();
  const names = new Set();
  const brk = breaker();
  let fatal = null;
  let hit = false;
  let done = 0;
  await mapPool(picks, POOL, async (m) => {
    if (fatal || hit || ctl.cancelled()) return;
    try {
      const players = await loadLineupPlayers(m.id, m.date);
      brk.ok();
      for (const p of players) {
        if (p.teamId && nameMatchesPlayer(playerTokens, p.name)) { ids.add(p.teamId); names.add(p.teamName); hit = true; }
      }
    } catch (e) {
      if (isFatal(e)) fatal = e;
      else if (brk.tripped()) fatal = httpError(502, `PitchAPI keeps failing (last error: ${e.message}). The search was stopped.`);
      ctl.log(`Lineup ${m.home.name} v ${m.away.name}: ${e.message}`);
    } finally {
      ctl.progress("Finding the player's club", ++done, picks.length);
    }
  });
  if (fatal) throw fatal;
  return ids.size ? { ids, names } : null;
}

export async function getMatchDetail(id) {
  if (!/^m_[A-Za-z0-9]{6}$/.test(String(id))) throw httpError(400, 'Invalid match id.');
  const match = await loadSummary(id);
  const { goals, source, warnings } = await loadGoals(id, match.date);

  const notes = [...warnings];
  const total = Number.isFinite(match.scoreHome) && Number.isFinite(match.scoreAway) ? match.scoreHome + match.scoreAway : null;
  if (total != null && goals.length !== total) notes.push(`PitchAPI lists ${goals.length} goal(s), but the final score adds up to ${total}.`);
  return { match, goals, source, warnings: notes };
}
// ---------- search ----------

const NOOP = { progress() {}, log() {}, cancelled: () => false };

export class SearchCancelled extends Error {
  constructor() { super('Search cancelled.'); this.name = 'SearchCancelled'; }
}

/** Stops a search that keeps failing instead of grinding through hundreds of doomed calls. */
function breaker(limit = 15) {
  let streak = 0;
  return { ok() { streak = 0; }, tripped() { return ++streak >= limit; } };
}

const toResult = (m, player = null) => ({
  id: m.id, date: m.date, league: m.league, season: m.season,
  home: { name: m.home.name }, away: { name: m.away.name }, scoreHome: m.scoreHome, scoreAway: m.scoreAway, player,
});

export async function searchMatches(rawQuery, ctl = NOOP) {
  const stop = () => { if (ctl.cancelled()) throw new SearchCancelled(); };
  const q = String(rawQuery ?? '').trim().slice(0, 200);
  const parsed = parseQuery(q);
  if (q.length < 2 || (!parsed.tokens.length && parsed.year == null)) {
    throw httpError(400, 'Type a player, team, opponent, competition or year.');
  }

  ctl.progress('Reading the list of leagues');
  const leagues = await getLeagues();
  stop();
  if (!leagues.length) throw httpError(502, 'PitchAPI returned no leagues.');
  ctl.log(`${leagues.length} leagues available`);

  const notes = [];
  const comp = findCompetitions(parsed.tokens, leagues);
  const scope = comp.leagues.length ? comp.leagues : leagues;
  const interpretation = {
    year: parsed.year, season: parsed.seasonStart != null ? `${parsed.seasonStart}/${parsed.seasonStart + 1}` : null,
    competitions: comp.leagues.slice(0, 4).map((l) => l.name), teams: [], player: null, club: null,
  };
  const base = { query: q, interpretation, results: [], total: 0, notes, message: null, tooBroad: false };

  // Which league seasons to read. No year: only the current season of each league.
  const wanted = scope.flatMap((lg) => (parsed.year == null
    ? [latestSeason(lg)].filter(Boolean)
    : lg.seasons.filter((s) => seasonCovers(s, parsed))).map((s) => [lg, s]));
  if (!wanted.length) {
    const from = earliestYear(scope);
    const who = comp.leagues.length ? 'The selected competition has' : 'PitchAPI has';
    base.message = parsed.year == null ? 'PitchAPI lists no seasons for this search.'
      : from && parsed.year < from ? `${who} no data for ${parsed.year}. The earliest season it lists is ${from}.`
        : `${who} no season covering ${parsed.year}.`;
    return base;
  }
  if (parsed.year == null) notes.push('No year given, so only the current season of each league was searched.');

  // Stage 1: fixture lists
  let fatal = null;
  let skipped = 0;
  let done = 0;
  const brk1 = breaker();
  ctl.log(`Loading ${wanted.length} league season(s). Finished seasons are cached, so repeat searches are fast.`);
  ctl.progress('Loading fixture lists', 0, wanted.length);
  const lists = await mapPool(wanted, POOL, async ([lg, season]) => {
    if (fatal || ctl.cancelled()) return [];
    try {
      const r = await seasonMatches(lg, season);
      brk1.ok();
      return r;
    } catch (e) {
      if (isFatal(e)) fatal = e;
      else if (brk1.tripped()) fatal = httpError(502, `PitchAPI keeps failing (last error: ${e.message}). The search was stopped.`);
      skipped++;
      ctl.log(`${lg.name} ${season}: ${e.message}`);
      return [];
    } finally {
      ctl.progress('Loading fixture lists', ++done, wanted.length);
    }
  });
  stop();
  if (fatal) throw fatal;
  if (skipped === wanted.length) throw httpError(502, 'PitchAPI could not be reached. Try again in a moment.');
  if (skipped) notes.push(`${skipped} league season(s) could not be loaded and were left out. Search again to retry them.`);

  const unique = [...new Map(lists.flat().map((m) => [m.id, m])).values()]; // one row per match id
  const inYear = unique.filter((m) => matchYearOk(m, parsed));
  const teamNames = [...new Set(inYear.flatMap((m) => [normalize(m.home.name), normalize(m.away.name)]))];
  const fixed = fixTeamTokens(parsed.tokens, comp.consumed, vsHints(q), teamNames);
  const { groups, playerTokens } = splitTeamsAndPlayer(fixed.tokens, fixed.consumed, teamNames);
  interpretation.teams = groups;
  interpretation.player = playerTokens.join(' ') || null;

  const candidates = inYear.filter((m) => matchHasTeams(m, groups))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  ctl.log(`${unique.length} matches loaded, ${candidates.length} fit the year, competition and teams`);

  if (!playerTokens.length) {
    base.results = candidates.slice(0, MAX_RESULTS).map((m) => toResult(m));
    base.total = candidates.length;
    if (!candidates.length) base.message = 'No matches found for these teams, competition and year.';
    return base;
  }

  // Stage 2: a player is found through the goals of the candidate games, so those games have to be read.
  let pool = candidates;
  const uncachedIn = (list) => list.filter((m) => !cacheHas(`goals:${m.id}`)).length;

  if (!groups.length && uncachedIn(pool) > MAX_GOAL_FETCHES) {
    const club = await findClub(pool, playerTokens, ctl);
    stop();
    if (club) {
      pool = pool.filter((m) => club.ids.has(m.home.id) || club.ids.has(m.away.id));
      interpretation.club = [...club.names].join(', ');
      notes.push(`Found "${playerTokens.join(' ')}" in a lineup of ${interpretation.club}, so only that club's matches were checked. If the player moved clubs during the period, add the other club to the search.`);
      ctl.log(`Club found: ${interpretation.club} (${pool.length} matches)`);
    }
  }

  const unchecked = uncachedIn(pool);
  if (unchecked > MAX_GOAL_FETCHES) {
    base.tooBroad = true;
    base.total = pool.length;
    base.message = `${pool.length} games fit the year, competition and teams you gave, and ${unchecked} of them have not been checked for scorers yet. I also could not tell which club "${playerTokens.join(' ')}" plays for. Add a team or a competition to narrow the search.`;
    return base;
  }

  let failed = 0;
  done = 0;
  const brk2 = breaker();
  ctl.log(`Checking ${pool.length} game(s) for scorers (${unchecked} not cached yet)`);
  ctl.progress('Checking goal scorers', 0, pool.length);
  const checked = await mapPool(pool, POOL, async (m) => {
    if (fatal || ctl.cancelled()) return null;
    try {
      const r = { m, goals: (await loadGoals(m.id, m.date)).goals };
      brk2.ok();
      return r;
    } catch (e) {
      if (isFatal(e)) fatal = e;
      else if (brk2.tripped()) fatal = httpError(502, `PitchAPI keeps failing (last error: ${e.message}). The search was stopped.`);
      failed++;
      ctl.log(`${m.home.name} v ${m.away.name} (${m.date}): ${e.message}`);
      return null;
    } finally {
      ctl.progress('Checking goal scorers', ++done, pool.length);
    }
  });
  stop();
  if (fatal) throw fatal;
  if (failed) notes.push(`${failed} game(s) could not be checked because PitchAPI returned an error. Search again to retry them.`);

  const found = [];
  for (const c of checked) {
    if (!c) continue;
    const mine = goalsByPlayer(c.goals, playerTokens);
    if (mine.length) found.push(toResult(c.m, { name: mine[0].scorer, goals: mine.length }));
  }
  base.results = found.slice(0, MAX_RESULTS);
  base.total = found.length;
  if (!found.length) base.message = `No game found where a goal scorer matches "${playerTokens.join(' ')}". Player names are matched against goal scorers.`;
  return base;
}

export async function getStatus() {
  const keyConfigured = api.keyConfigured();
  let earliest = null;
  let error = null;
  if (keyConfigured) {
    try { earliest = earliestYear(await getLeagues()); } catch (e) { error = e.message; }
  }
  return { keyConfigured, provider: 'PitchAPI', earliestYear: earliest, error };
}