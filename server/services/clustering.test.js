import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, buildVectors } from './text.js';
import { pairSimilarities, agglomerate } from './clustering.js';

test('two distinct subjects form two clusters', () => {
  const titles = [
    'SpaceX Starship launch test flight',
    'Starship flight test launch SpaceX results',
    'SpaceX Starship flight launch explained',
    'Federal Reserve interest rate decision',
    'Federal Reserve rate cut announcement',
    'Federal Reserve rate decision markets',
  ];
  const { docs, df } = buildVectors(titles.map((t, i) => ({ id: String(i), title: tokenize(t), tags: [], desc: [] })));
  const clusters = agglomerate(docs.length, pairSimilarities(docs, df), 0.25);
  assert.deepEqual(clusters.map((c) => c.length).sort(), [3, 3]);
  for (const c of clusters) assert.ok(c.every((i) => (i < 3) === (c[0] < 3)), 'clusters must not mix subjects');
});