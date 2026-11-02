import test from 'node:test';
import assert from 'node:assert/strict';
import { extractJson, normalizeUrl, dedupeSources, normalizeReport, normalizeConcept } from './aiNormalize.js';

test('extractJson handles code fences and surrounding text', () => {
  assert.deepEqual(extractJson('Here you go:\n```json\n{"a":1}\n```'), { a: 1 });
  assert.throws(() => extractJson('no json here'));
});

test('normalizeUrl strips tracking and rejects non-http schemes', () => {
  assert.equal(normalizeUrl('https://example.com/a?utm_source=openai&x=1#frag'), 'https://example.com/a?x=1');
  assert.equal(normalizeUrl('https://example.com/a?utm_source=openai'), 'https://example.com/a');
  assert.equal(normalizeUrl('javascript:alert(1)'), null);
  assert.equal(normalizeUrl('not a url'), null);
});

test('dedupeSources numbers unique valid URLs from 1', () => {
  const s = dedupeSources([
    { url: 'https://a.com/x?utm_source=openai', title: 'A' }, { url: 'https://a.com/x', title: 'A again' },
    { url: 'javascript:1', title: 'bad' }, { url: 'https://b.com', title: 'B' },
  ]);
  assert.deepEqual(s.map((x) => [x.id, x.url]), [[1, 'https://a.com/x'], [2, 'https://b.com/']]);
});

test('normalizeReport downgrades "sourced" claims without a valid source', () => {
  const raw = {
    subject: 'X', coherent: true, summary: 's',
    background: [
      { text: 'ok', status: 'sourced', source_ids: [1] },
      { text: 'no source', status: 'sourced', source_ids: [] },
      { text: 'bad id', status: 'sourced', source_ids: [9] },
      { text: 'theory', status: 'speculation', source_ids: [] },
      { text: 'weird status', status: 'certain' },
    ],
  };
  const { report, downgraded } = normalizeReport(raw, { sourceCount: 2, webResearch: true });
  assert.deepEqual(report.background.map((b) => b.status), ['sourced', 'unverified', 'unverified', 'speculation', 'unverified']);
  assert.deepEqual(report.background[0].sourceIds, [1]);
  assert.equal(downgraded, 2);
});

test('without web research nothing can be sourced', () => {
  const { report } = normalizeReport(
    { background: [{ text: 'x', status: 'sourced', source_ids: [1] }] }, { sourceCount: 0, webResearch: false });
  assert.equal(report.background[0].status, 'unverified');
});

test('normalizeConcept requires title, storyline and at least 3 scenes', () => {
  const scene = (n) => ({ title: `S${n}`, description: `Scene ${n}`, duration_seconds: 20, basis: 'sourced' });
  const ok = normalizeConcept({ title: 'T', storyline: 'S', scenes: [scene(1), scene(2), scene(3)] });
  assert.equal(ok.scenes.length, 3);
  assert.equal(ok.scenes[0].basis, 'sourced');
  assert.equal(normalizeConcept({ title: 'T', storyline: 'S', scenes: [scene(1)] }), null);
  assert.equal(normalizeConcept({ storyline: 'S', scenes: [scene(1), scene(2), scene(3)] }), null);
  const unknown = normalizeConcept({ title: 'T', storyline: 'S', scenes: [{ description: 'd' }, { description: 'e' }, { description: 'f' }] });
  assert.equal(unknown.scenes[0].basis, 'unverified');
});