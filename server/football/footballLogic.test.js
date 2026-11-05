import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseQuery, seasonCovers, latestSeason, earliestYear, matchYearOk, findCompetitions, splitTeamsAndPlayer,
  matchHasTeams, nameMatchesPlayer, shotDistance, buildGoals, goalsByPlayer, mapPool,
} from './footballLogic.js';

test('parseQuery pulls out the year and keeps the other words', () => {
  assert.deepEqual(parseQuery('Ronaldo 2014 Real Madrid vs Barcelona'),
    { year: 2014, seasonStart: null, tokens: ['ronaldo', 'real', 'madrid', 'barcelona'] });
  assert.deepEqual(parseQuery('Messi Barcelona'), { year: null, seasonStart: null, tokens: ['messi', 'barcelona'] });
  assert.equal(parseQuery('Neymar 2023/24 Champions League').seasonStart, 2023);
  assert.deepEqual(parseQuery('Mbappé  2024!').tokens, ['mbappe']);
});

test('seasonCovers: a lone year can fall in two fall-spring seasons, a pinned season in one', () => {
  assert.equal(seasonCovers('2023/2024', { year: 2024, seasonStart: null }), true);
  assert.equal(seasonCovers('2024/2025', { year: 2024, seasonStart: null }), true);
  assert.equal(seasonCovers('2022/2023', { year: 2024, seasonStart: null }), false);
  assert.equal(seasonCovers('2024', { year: 2024, seasonStart: null }), true);
  assert.equal(seasonCovers('2023', { year: 2024, seasonStart: null }), false);
  assert.equal(seasonCovers('2023/2024', { year: 2023, seasonStart: 2023 }), true);
  assert.equal(seasonCovers('2024/2025', { year: 2023, seasonStart: 2023 }), false);
});

test('latestSeason and earliestYear read the real season labels', () => {
  const leagues = [{ seasons: ['2024/2025', '2025/2026', '2021/2022'] }, { seasons: ['2024'] }];
  assert.equal(latestSeason(leagues[0]), '2025/2026');
  assert.equal(earliestYear(leagues), 2021);
  assert.equal(earliestYear([]), null);
});

test('matchYearOk uses the match date for a lone year only', () => {
  assert.equal(matchYearOk({ date: '2024-03-02' }, { year: 2024, seasonStart: null }), true);
  assert.equal(matchYearOk({ date: '2023-12-02' }, { year: 2024, seasonStart: null }), false);
  assert.equal(matchYearOk({ date: '2023-12-02' }, { year: 2023, seasonStart: 2023 }), true);
  assert.equal(matchYearOk({ date: '2023-12-02' }, { year: null, seasonStart: null }), true);
});

test('findCompetitions matches real league names and ignores short generic words', () => {
  const leagues = [
    { id: 'l1', name: 'UEFA Champions League' }, { id: 'l2', name: 'Premier League' }, { id: 'l3', name: 'Ukrainian Premier League' },
  ];
  const a = findCompetitions(['neymar', 'champions', 'league'], leagues);
  assert.deepEqual(a.leagues.map((l) => l.id), ['l1']);
  assert.deepEqual([...a.consumed].sort(), [1, 2]);
  assert.deepEqual(findCompetitions(['premier', 'league'], leagues).leagues.map((l) => l.id), ['l2', 'l3']);
  assert.equal(findCompetitions(['league'], leagues).leagues.length, 0);
  assert.equal(findCompetitions(['messi'], leagues).leagues.length, 0);
});

test('splitTeamsAndPlayer separates teams from player words', () => {
  const teams = ['real madrid', 'fc barcelona', 'real betis'];
  const r = splitTeamsAndPlayer(['ronaldo', 'real', 'madrid', 'barcelona'], new Set(), teams);
  assert.deepEqual(r.groups, ['real madrid', 'barcelona']);
  assert.deepEqual(r.playerTokens, ['ronaldo']);
  const one = splitTeamsAndPlayer(['messi', 'barcelona'], new Set(), teams);
  assert.deepEqual(one, { groups: ['barcelona'], playerTokens: ['messi'] });
  assert.deepEqual(splitTeamsAndPlayer(['messi'], new Set(), teams), { groups: [], playerTokens: ['messi'] });
  // words already taken by a competition are not reused
  assert.deepEqual(splitTeamsAndPlayer(['real', 'madrid'], new Set([0, 1]), teams), { groups: [], playerTokens: [] });
});

test('matchHasTeams accepts one team, or two opponents in either order', () => {
  const m = { home: { name: 'Real Madrid' }, away: { name: 'FC Barcelona' } };
  assert.equal(matchHasTeams(m, []), true);
  assert.equal(matchHasTeams(m, ['barcelona']), true);
  assert.equal(matchHasTeams(m, ['real madrid', 'barcelona']), true);
  assert.equal(matchHasTeams(m, ['barcelona', 'real madrid']), true);
  assert.equal(matchHasTeams(m, ['barcelona', 'sevilla']), false);
  assert.equal(matchHasTeams(m, ['real madrid', 'real madrid']), false);
});

test('nameMatchesPlayer handles initials and accents, and refuses weak matches', () => {
  assert.equal(nameMatchesPlayer(['messi'], 'L. Messi'), true);
  assert.equal(nameMatchesPlayer(['lionel', 'messi'], 'L. Messi'), true);
  assert.equal(nameMatchesPlayer(['mbappe'], 'K. Mbappé'), true);
  assert.equal(nameMatchesPlayer(['neymar'], 'Neymar Jr'), true);
  assert.equal(nameMatchesPlayer(['kane'], 'K. Silva'), false);
  assert.equal(nameMatchesPlayer(['cristiano'], 'C. Ronaldo'), false);
  assert.equal(nameMatchesPlayer([], 'L. Messi'), false);
  assert.equal(nameMatchesPlayer(['messi'], null), false);
});

test('shotDistance measures to the centre of the goal and refuses missing coordinates', () => {
  assert.equal(shotDistance(94, 34), 11); // penalty spot
  assert.equal(shotDistance(105, 34), 0);
  assert.equal(shotDistance(88.5, 42.3), 18.5);
  assert.equal(shotDistance(undefined, 34), null);
  assert.equal(shotDistance(null, null), null);
});

const shot = (id, pid, minute, extra = {}) => ({ id, player: { id: pid, name: `P ${pid}` }, minute, event_type: 'Goal', ...extra });

test('buildGoals joins each goal event with its shot and keeps chronological order', () => {
  const events = [
    { event_type: 'Goal', minute: 90, minute_added: 3, player: { id: 'p_b', name: 'B. Late' } },
    { event_type: 'Substitution', minute: 60, player: { id: 'p_x', name: 'X' } },
    { event_type: 'Goal', minute: 34, minute_added: 0, player: { id: 'p_a', name: 'A. Early' } },
    { event_type: 'Goal', minute: 45, minute_added: 2, player: { id: 'p_c', name: 'C. Stoppage' } },
    { event_type: 'Goal', minute: 46, player: { id: 'p_d', name: 'D. Nodata' } },
  ];
  const shots = [
    shot('s1', 'p_a', 34, { x: 94, y: 34, expected_goals: 0.78 }),
    shot('s2', 'p_b', 90, { minute_added: 3, x: 100, y: 34, expected_goals: 0.5 }),
    shot('s3', 'p_c', 45, { minute_added: 2, x: 88.5, y: 34 }), // shot without xG
    { id: 's4', player: { id: 'p_a' }, minute: 12, event_type: 'Miss', x: 80, y: 30, expected_goals: 0.1 },
  ];
  const { goals, source } = buildGoals(events, shots);
  assert.equal(source, 'events');
  assert.deepEqual(goals.map((g) => g.label), ["34'", "45+2'", "46'", "90+3'"]);
  assert.equal(goals[0].distanceM, 11);
  assert.equal(goals[0].xg, 0.78);
  assert.equal(goals[1].distanceM, 16.5);
  assert.equal(goals[1].xg, null); // missing stays null, never estimated
  assert.equal(goals[2].distanceM, null); // goal event with no matching shot
  assert.equal(goals[2].xg, null);
  assert.equal(goals[3].distanceM, 5);
  for (const g of goals) { assert.equal(g.assist, null); assert.equal(g.speedKmh, null); }
});

test('buildGoals gives no distance or xG to own goals, and uses each shot only once', () => {
  const events = [
    { event_type: 'Goal', minute: 10, player: { id: 'p_a', name: 'A' }, is_own_goal: true },
    { event_type: 'Goal', minute: 10, player: { id: 'p_a', name: 'A' } },
    { event_type: 'Goal', minute: 10, player: { id: 'p_a', name: 'A' } },
  ];
  const { goals } = buildGoals(events, [shot('s1', 'p_a', 10, { x: 100, y: 34, expected_goals: 0.4 })]);
  assert.equal(goals[0].ownGoal, true);
  assert.equal(goals[0].distanceM, null);
  assert.equal(goals.filter((g) => g.xg === 0.4).length, 1);
});

test('buildGoals falls back to shots when there are no goal events, and to nothing when there is no data', () => {
  const fallback = buildGoals([{ event_type: 'Yellowcard', minute: 5 }], [shot('s1', 'p_a', 20, { x: 94, y: 34, expected_goals: 0.7 })]);
  assert.equal(fallback.source, 'shots');
  assert.equal(fallback.goals[0].scorer, 'P p_a');
  assert.equal(fallback.goals[0].distanceM, 11);
  assert.deepEqual(buildGoals([], []), { goals: [], source: 'none' });
  assert.deepEqual(buildGoals(undefined, undefined), { goals: [], source: 'none' });
});

test('event type matching is case-insensitive because the docs show both forms', () => {
  assert.equal(buildGoals([{ event_type: 'goal', minute: 1, player: { name: 'A' } }], []).goals.length, 1);
  assert.equal(buildGoals([{ event_type: 'GOAL', minute: 1, player: { name: 'A' } }], []).goals.length, 1);
});

test('goalsByPlayer ignores own goals', () => {
  const goals = [
    { scorer: 'L. Messi', ownGoal: false }, { scorer: 'L. Messi', ownGoal: true }, { scorer: 'N. Neymar', ownGoal: false },
  ];
  assert.equal(goalsByPlayer(goals, ['messi']).length, 1);
});

test('mapPool keeps order and never exceeds the limit', async () => {
  let active = 0;
  let peak = 0;
  const out = await mapPool([1, 2, 3, 4, 5, 6], 2, async (n) => {
    active++; peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, 5));
    active--;
    return n * 2;
  });
  assert.deepEqual(out, [2, 4, 6, 8, 10, 12]);
  assert.ok(peak <= 2);
  assert.deepEqual(await mapPool([], 3, async (x) => x), []);
});