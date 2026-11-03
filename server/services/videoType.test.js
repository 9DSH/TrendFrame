import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyVideo, matchesType } from './videoType.js';

test('classifyVideo uses the configured limit and treats 0 s as unknown', () => {
  assert.equal(classifyVideo(45, 60), 'short');
  assert.equal(classifyVideo(60, 60), 'short');
  assert.equal(classifyVideo(61, 60), 'long');
  assert.equal(classifyVideo(0, 60), 'unknown');
  assert.equal(classifyVideo(null, 60), 'unknown');
});

test('matchesType', () => {
  assert.equal(matchesType(0, 'both', 60), true);
  assert.equal(matchesType(30, 'long', 60), false);
  assert.equal(matchesType(300, 'long', 60), true);
  assert.equal(matchesType(0, 'short', 60), false);
});