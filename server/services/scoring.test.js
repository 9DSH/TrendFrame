import test from 'node:test';
import assert from 'node:assert/strict';
import {
  trendDirection, growthPair, percentileRanks, applyWeights, classifyStatus, validateWeights, METRIC_KEYS, DECAY_EXPONENT,
} from './scoring.js';

const snap = (t, v) => ({ captured_at: t, view_count: v });
const published = Date.parse('2026-11-01T00:00:00Z');

test('growthPair compares the real gain with the age-decay expectation', () => {
  const p = growthPair([snap('2026-11-02T00:00:00Z', 10000), snap('2026-11-02T12:00:00Z', 12000)], published);
  assert.equal(p.actual, 2000);
  assert.equal(p.hours, 12);
  assert.ok(Math.abs(p.expected - 10000 * (Math.pow(1.5, DECAY_EXPONENT) - 1)) < 1e-6);
});

test('growthPair skips snapshots closer than 3 hours', () => {
  const p = growthPair([
    snap('2026-11-02T00:00:00Z', 10000), snap('2026-11-02T11:00:00Z', 11800), snap('2026-11-02T12:00:00Z', 12000),
  ], published);
  assert.equal(p.actual, 2000);
  assert.equal(p.hours, 12);
});

test('growthPair returns null with one snapshot or when views fall', () => {
  assert.equal(growthPair([snap('2026-11-02T00:00:00Z', 10)], published), null);
  assert.equal(growthPair([snap('2026-11-02T00:00:00Z', 100), snap('2026-11-02T12:00:00Z', 90)], published), null);
});

test('percentileRanks handles ties, nulls and a single value', () => {
  const r = percentileRanks([10, 20, 30]);
  assert.ok(Math.abs(r[0] - 16.667) < 0.01 && Math.abs(r[1] - 50) < 0.01 && Math.abs(r[2] - 83.333) < 0.01);
  assert.deepEqual(percentileRanks([10, null, 30]), [25, null, 75]);
  assert.deepEqual(percentileRanks([5]), [50]);
});

test('applyWeights excludes missing metrics and renormalises the rest', () => {
  const metrics = Object.fromEntries(METRIC_KEYS.map((k) => [k, { value: 100 }]));
  metrics.engagement = { value: null };
  const w = { trend_momentum: 25, view_velocity: 20, engagement: 15, cross_channel: 15, competition: 10, long_term: 5, animation_potential: 10 };
  const r = applyWeights(metrics, w);
  assert.equal(r.score, 100);
  assert.equal(r.contributions.engagement.excluded, true);
  const eff = Object.values(r.contributions).filter((c) => !c.excluded).reduce((a, c) => a + c.effectiveWeight, 0);
  assert.ok(Math.abs(eff - 100) < 1e-9);
});

test('classifyStatus', () => {
  const base = { ratio: 1, measured: true, videoCount: 4, channelCount: 3, oldestAgeDays: 20, spanDays: 10, competition: 60, recentVideos: 1 };
  assert.equal(classifyStatus({ ...base, ratio: 0.5 }), 'declining');
  assert.equal(classifyStatus({ ...base, ratio: 2 }), 'growing');
  assert.equal(classifyStatus({ ...base, ratio: 1.2, oldestAgeDays: 2 }), 'emerging');
  assert.equal(classifyStatus({ ...base, videoCount: 15, competition: 20 }), 'saturated');
  assert.equal(classifyStatus({ ...base, measured: false, ratio: 0.3 }), 'sustained'); // proxy never says "declining"
});

test('validateWeights', () => {
  const ok = { trend_momentum: 1, view_velocity: 1, engagement: 1, cross_channel: 1, competition: 1, long_term: 1, animation_potential: 1 };
  assert.deepEqual(validateWeights(ok), ok);
  assert.throws(() => validateWeights({ ...ok, engagement: -1 }));
  assert.throws(() => validateWeights(Object.fromEntries(METRIC_KEYS.map((k) => [k, 0]))));
});

test('trendDirection', async () => {
  const { trendDirection } = await import('./scoring.js');
  assert.equal(trendDirection({ status: 'declining', growthRate: 0.5 }), 'down');
  assert.equal(trendDirection({ status: 'growing', growthRate: 0.6 }), 'up');
  assert.equal(trendDirection({ status: 'sustained', growthRate: 0.05 }), 'flat');
  assert.equal(trendDirection({ status: 'sustained', growthRate: null }), 'flat');
});