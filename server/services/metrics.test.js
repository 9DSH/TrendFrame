import test from 'node:test';
import assert from 'node:assert/strict';
import { computeSnapshotMetrics } from './metrics.js';

const publishedAt = '2026-11-01T00:00:00Z';
const prev = { captured_at: '2026-11-02T00:00:00Z', view_count: 10000 };

test('uses snapshot delta when a previous snapshot exists', () => {
  const m = computeSnapshotMetrics({
    current: { viewCount: 12000, likeCount: 600, commentCount: 60 },
    previous: prev, publishedAt, capturedAt: '2026-11-02T10:00:00Z',
  });
  assert.equal(m.velocityBasis, 'snapshot_delta');
  assert.equal(m.viewsGained, 2000);
  assert.equal(m.viewsPerHour, 200);
  assert.equal(m.viewsPerDay, 4800);
  assert.equal(m.engagementRate, 0.055);
});

test('first snapshot falls back to lifetime average', () => {
  const m = computeSnapshotMetrics({
    current: { viewCount: 24000, likeCount: 10, commentCount: 1 },
    previous: null, publishedAt, capturedAt: '2026-11-02T00:00:00Z',
  });
  assert.equal(m.velocityBasis, 'lifetime_average');
  assert.equal(m.viewsGained, null);
  assert.equal(m.viewsPerHour, 1000);
});

test('hidden likes give null engagement', () => {
  const m = computeSnapshotMetrics({
    current: { viewCount: 500, likeCount: null, commentCount: 5 },
    previous: null, publishedAt, capturedAt: '2026-11-02T00:00:00Z',
  });
  assert.equal(m.engagementRate, null);
});

test('decreasing views are treated as a correction, not negative growth', () => {
  const m = computeSnapshotMetrics({
    current: { viewCount: 9900, likeCount: 1, commentCount: 1 },
    previous: prev, publishedAt, capturedAt: '2026-11-02T10:00:00Z',
  });
  assert.equal(m.viewsGained, null);
  assert.equal(m.velocityBasis, 'lifetime_average');
});

test('very new video gets no rate', () => {
  const m = computeSnapshotMetrics({
    current: { viewCount: 100, likeCount: 5, commentCount: 1 },
    previous: null, publishedAt: '2026-11-02T00:00:00Z', capturedAt: '2026-11-02T00:20:00Z',
  });
  assert.equal(m.velocityBasis, 'none');
  assert.equal(m.viewsPerHour, null);
});