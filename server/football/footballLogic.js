// Pure helpers for the Football module. No network and no database, so everything here is unit-tested.

// PitchAPI shot coordinates: metres on a 105 x 68 pitch, every shot attacks the goal at x = 105 (centre y = 34).
export const GOAL_X = 105;
export const GOAL_Y = 34;

const STOP = new Set(['vs', 'v', 'versus', 'against', 'the', 'fc', 'cf', 'match', 'matches', 'game', 'games',
  'goal', 'goals', 'and', 'in', 'at', 'of']);

  // ---------- team nicknames ----------

// Nickname -> a word of the real team name. Only used when the nickname is not itself part of a team name.
const ALIASES = {
  wolves: 'wolverhampton', spurs: 'tottenham', gunners: 'arsenal', toon: 'newcastle', magpies: 'newcastle',
  foxes: 'leicester', saints: 'southampton', hammers: 'west ham', baggies: 'west brom', utd: 'united',
  barca: 'barcelona', atleti: 'atletico', psg: 'paris', juve: 'juventus', gladbach: 'monchengladbach',
};
const VS = new Set(['vs', 'v', 'versus', 'against']);

/** Words typed after "vs": they are almost certainly a team. */
export function vsHints(raw) {
  const w = words(raw);
  const out = new Set();
  w.forEach((t, i) => {
    if (!VS.has(t)) return;
    for (const x of w.slice(i + 1, i + 4)) {
      if (VS.has(x)) break;
      if (!STOP.has(x) && !/^\d+$/.test(x)) out.add(x);
    }
  });
  return out;
}

function commonPrefix(a, b) {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}

/** Closest team-name word: shares a prefix of at least 4 letters (5 for longer words). Null when nothing is close. */
function closestTeamWord(token, vocab) {
  const need = Math.max(4, Math.min(token.length, 5));
  let best = null;
  let bestLen = 0;
  for (const w of vocab) {
    const n = commonPrefix(token, w);
    if (n >= need && (n > bestLen || (n === bestLen && w.length < best.length))) { best = w; bestLen = n; }
  }
  return best;
}

/**
 * Rewrites query words that are not part of any team name but clearly mean one: a known nickname ("wolves"),
 * or a word after "vs" that is close to a team word ("wolv"). Everything else, such as player names, is left alone.
 * Returns the new tokens and the new set of positions already used by a competition.
 */
export function fixTeamTokens(tokens, consumed, hints, teamNames) {
  const vocab = new Set(teamNames.flatMap((t) => t.split(' ').filter(Boolean)));
  const out = [];
  const used = new Set();
  tokens.forEach((t, i) => {
    let next = [t];
    if (!consumed.has(i) && !vocab.has(t)) {
      const alias = ALIASES[t]?.split(' ');
      if (alias && alias.every((a) => vocab.has(a))) next = alias;
      else if (hints.has(t)) {
        const near = closestTeamWord(t, vocab);
        if (near) next = [near];
      }
    }
    next.forEach((x) => { if (consumed.has(i)) used.add(out.length); out.push(x); });
  });
  return { tokens: out, consumed: used };
}

export const normalize = (s) => String(s ?? '')
  .normalize('NFD').replace(/\p{M}+/gu, '')
  .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

const words = (s) => { const n = normalize(s); return n ? n.split(' ') : []; };
const hasPhrase = (text, phrase) => ` ${normalize(text)} `.includes(` ${phrase} `);

// ---------- query ----------

/** "Ronaldo 2014 Real Madrid vs Barcelona" -> { year: 2014, seasonStart: null, tokens: [...] }. "2014/15" pins a season. */
export function parseQuery(raw) {
  let text = String(raw ?? '');
  let year = null;
  let seasonStart = null;
  const m = /\b((?:19|20)\d{2})(?:\s*[/-]\s*(\d{4}|\d{2}))?\b/.exec(text);
  if (m) {
    year = Number(m[1]);
    if (m[2]) seasonStart = year;
    text = text.replace(m[0], ' ');
  }
  return { year, seasonStart, tokens: words(text).filter((t) => !STOP.has(t) && !/^\d+$/.test(t)) };
}

// ---------- seasons ----------

const seasonParts = (label) => /^(\d{4})\s*[/-]\s*(\d{2}|\d{4})$/.exec(String(label));
export const seasonStartYear = (label) => {
  const m = seasonParts(label) ?? /^(\d{4})$/.exec(String(label));
  return m ? Number(m[1]) : null;
};

/** Does a season label ("2024/2025" or "2024") cover the requested year, or the requested season? */
export function seasonCovers(label, { year, seasonStart }) {
  const start = seasonStartYear(label);
  if (start == null) return false;
  if (seasonStart != null) return start === seasonStart;
  if (seasonParts(label)) return year === start || year === start + 1;
  return year === start;
}

export function latestSeason(league) {
  return [...(league.seasons ?? [])].filter((s) => seasonStartYear(s) != null)
    .sort((a, b) => seasonStartYear(b) - seasonStartYear(a))[0] ?? null;
}

export function earliestYear(leagues) {
  const years = leagues.flatMap((l) => (l.seasons ?? []).map(seasonStartYear)).filter((y) => y != null);
  return years.length ? Math.min(...years) : null;
}

/** A lone year means the calendar year the match was played; a pinned season is already filtered by season. */
export const matchYearOk = (match, { year, seasonStart }) =>
  year == null || seasonStart != null || String(match.date ?? '').slice(0, 4) === String(year);

// ---------- competitions, teams, players ----------

/**
 * Finds leagues named in the query by comparing 1 to 3 word phrases with the real league names.
 * Single words must be at least 7 letters ("bundesliga"), so "league" or "cup" alone never selects anything.
 */
export function findCompetitions(tokens, leagues) {
  const named = leagues.map((l) => ({ l, text: ` ${normalize(l.name)} ` }));
  const consumed = new Set();
  const hit = new Map();
  for (let n = Math.min(3, tokens.length); n >= 1; n--) {
    for (let i = 0; i + n <= tokens.length; i++) {
      if (Array.from({ length: n }, (_, k) => i + k).some((k) => consumed.has(k))) continue;
      const phrase = tokens.slice(i, i + n).join(' ');
      if (n === 1 && phrase.length < 7) continue;
      const found = named.filter((x) => x.text.includes(` ${phrase} `));
      if (!found.length) continue;
      found.forEach((x) => hit.set(x.l.id, x.l));
      for (let k = 0; k < n; k++) consumed.add(i + k);
    }
  }
  return { leagues: [...hit.values()], consumed };
}

/**
 * Splits the remaining words into team phrases (those found in real team names) and player words (everything else).
 * Returns at most two team phrases, in the order typed.
 */
export function splitTeamsAndPlayer(tokens, consumed, teamNames) {
  const used = new Set(consumed);
  const names = teamNames.map((t) => ` ${t} `);
  const found = [];
  for (let n = Math.min(3, tokens.length); n >= 1; n--) {
    for (let i = 0; i + n <= tokens.length; i++) {
      if (Array.from({ length: n }, (_, k) => i + k).some((k) => used.has(k))) continue;
      const phrase = tokens.slice(i, i + n).join(' ');
      if (n === 1 && phrase.length < 3) continue;
      if (!names.some((t) => t.includes(` ${phrase} `))) continue;
      found.push({ start: i, phrase });
      for (let k = 0; k < n; k++) used.add(i + k);
    }
  }
  found.sort((a, b) => a.start - b.start);
  return {
    groups: found.slice(0, 2).map((f) => f.phrase),
    playerTokens: tokens.filter((_, i) => !used.has(i)),
  };
}

/** One group: the team plays in the match. Two groups: they are the two opponents, in either order. */
export function matchHasTeams(match, groups) {
  if (!groups.length) return true;
  const home = match.home.name;
  const away = match.away.name;
  const [a, b] = groups;
  if (!b) return hasPhrase(home, a) || hasPhrase(away, a);
  return (hasPhrase(home, a) && hasPhrase(away, b)) || (hasPhrase(away, a) && hasPhrase(home, b));
}

/**
 * PitchAPI names are often abbreviated ("L. Messi"). Every query word must match a name word, or the initial of one,
 * and at least one must match a full name word, so "kane" can never match "K. Silva".
 */
export function nameMatchesPlayer(playerTokens, name) {
  if (!playerTokens.length || !name) return false;
  const nameWords = words(name);
  const full = nameWords.filter((w) => w.length > 1);
  let exact = 0;
  for (const t of playerTokens) {
    if (full.includes(t)) exact++;
    else if (!nameWords.some((w) => w.length === 1 && w === t[0])) return false;
  }
  return exact > 0;
}

// ---------- goals ----------

export function shotDistance(x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return Math.round(Math.hypot(GOAL_X - x, GOAL_Y - y) * 10) / 10;
}

const lc = (v) => String(v ?? '').toLowerCase();
const numOrNull = (v) => (Number.isFinite(v) ? v : null);

function takeShot(unused, playerId, minute, added) {
  if (playerId == null) return null;
  let i = unused.findIndex((s) => s.player?.id === playerId && s.minute === minute && (s.minute_added ?? 0) === (added ?? 0));
  if (i < 0) i = unused.findIndex((s) => s.player?.id === playerId && s.minute === minute);
  return i < 0 ? null : unused.splice(i, 1)[0];
}

function makeGoal({ minute, added, scorer, ownGoal, shot }) {
  const extra = added || 0;
  const usable = shot && !ownGoal;
  return {
    minute, minuteAdded: extra,
    label: extra > 0 ? `${minute}+${extra}'` : `${minute}'`,
    scorer: scorer || null,
    ownGoal: Boolean(ownGoal),
    assist: null,   // PitchAPI's documented goal events carry no assist provider
    distanceM: usable ? shotDistance(shot.x, shot.y) : null, // calculated from the shot's own coordinates
    speedKmh: null, // PitchAPI has no shot speed
    xg: usable ? numOrNull(shot.expected_goals) : null,
  };
}

const chronological = (a, b) => a.minute - b.minute || a.minuteAdded - b.minuteAdded;

/**
 * Builds the goal list. The events feed is the source of truth for who scored and when; each goal is then joined with its
 * shot (same player and minute) for distance and xG. If there are no goal events, goals are rebuilt from shots marked "Goal".
 */
export function buildGoals(events, shots) {
  const goalShots = (shots ?? []).filter((s) => lc(s.event_type) === 'goal');
  const unused = [...goalShots];
  const goalEvents = (events ?? []).filter((e) => lc(e.event_type) === 'goal');

  if (goalEvents.length) {
    const goals = goalEvents.map((e) => {
      const ownGoal = Boolean(e.is_own_goal);
      const shot = ownGoal ? null : takeShot(unused, e.player?.id, e.minute, e.minute_added);
      return makeGoal({ minute: e.minute, added: e.minute_added, scorer: e.player?.name, ownGoal, shot });
    }).sort(chronological);
    return { goals, source: 'events' };
  }
  if (goalShots.length) {
    const goals = goalShots.map((s) => makeGoal({
      minute: s.minute, added: s.minute_added, scorer: s.player?.name, ownGoal: Boolean(s.is_own_goal), shot: s,
    })).sort(chronological);
    return { goals, source: 'shots' };
  }
  return { goals: [], source: 'none' };
}

/** Goals the named player scored (own goals do not count for the scorer). */
export const goalsByPlayer = (goals, playerTokens) =>
  goals.filter((g) => !g.ownGoal && nameMatchesPlayer(playerTokens, g.scorer));

// ---------- misc ----------

/** Runs fn over items with at most `size` calls in flight. Results keep the input order. */
export async function mapPool(items, size, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  return out;
}