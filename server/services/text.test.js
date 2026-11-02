import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, buildVectors, cosine, sharesEnough } from './text.js';

const raw = (id, title) => ({ id, title: tokenize(title), tags: [], desc: [] });

test('tokenize drops stop words, numbers and URLs', () => {
  assert.deepEqual(tokenize('The Official SpaceX Starship Launch 2026! https://x.com/a'), ['spacex', 'starship', 'launch']);
});

test('tokenize keeps important short terms such as AI', () => {
  assert.deepEqual(tokenize('AI breakthrough'), ['ai', 'breakthrough']);
});

test('related videos are similar, unrelated videos are not', () => {
  const { docs } = buildVectors([
    raw('a', 'SpaceX Starship launch test flight'),
    raw('b', 'Starship flight test launch SpaceX results'),
    raw('c', 'Federal Reserve interest rate decision'),
    raw('d', 'Federal Reserve rate cut explained'),
    raw('e', 'Minecraft survival base tutorial'),
  ]);
  assert.ok(cosine(docs[0].vec, docs[1].vec) > 0.95);
  assert.ok(cosine(docs[2].vec, docs[3].vec) > 0.95);
  assert.equal(cosine(docs[0].vec, docs[2].vec), 0);
  assert.equal(cosine(docs[4].vec, docs[0].vec), 0);
});

test('one shared generic term is not enough to link videos', () => {
  const a = new Set(['apple', 'reserve']);
  const b = new Set(['reserve', 'wine']);
  assert.equal(sharesEnough(a, b, new Map([['reserve', 10], ['apple', 2], ['wine', 2]])), false);
  assert.equal(sharesEnough(a, b, new Map([['reserve', 3], ['apple', 2], ['wine', 2]])), true);
});