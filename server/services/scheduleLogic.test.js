import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTimes, dueSlot, nextRun } from './scheduleLogic.js';

const at = (h, m, day = 3) => new Date(2026, 10, day, h, m);

test('normalizeTimes cleans, sorts and validates', () => {
  assert.deepEqual(normalizeTimes('20:00, 8:00, 8:00'), ['08:00', '20:00']);
  assert.throws(() => normalizeTimes('25:00'));
  assert.throws(() => normalizeTimes('abc'));
  assert.throws(() => normalizeTimes(''));
  assert.throws(() => normalizeTimes('01:00,02:00,03:00,04:00,05:00,06:00,07:00'));
});

test('dueSlot fires once when the time is reached', () => {
  assert.equal(dueSlot(at(7, 59), ['08:00'], null, true), null);
  assert.equal(dueSlot(at(8, 0), ['08:00'], null, true), '2026-11-03 08:00');
  assert.equal(dueSlot(at(8, 5), ['08:00'], '2026-11-03 08:00', true), null);
});

test('catch-up runs a missed slot only when enabled', () => {
  assert.equal(dueSlot(at(14, 0), ['08:00'], null, true), '2026-11-03 08:00');
  assert.equal(dueSlot(at(14, 0), ['08:00'], null, false), null);
  assert.equal(dueSlot(at(8, 4), ['08:00'], null, false), '2026-11-03 08:00');
});

test('with several slots only the latest missed one runs', () => {
  assert.equal(dueSlot(at(15, 0), ['08:00', '14:00'], '2026-11-02 14:00', true), '2026-11-03 14:00');
  assert.equal(dueSlot(at(15, 0), ['08:00', '14:00'], '2026-11-03 08:00', true), '2026-11-03 14:00');
  assert.equal(dueSlot(at(15, 0), ['08:00', '14:00'], '2026-11-03 14:00', true), null);
});

test('nextRun picks the next slot today or the first one tomorrow', () => {
  assert.equal(nextRun(at(9, 0), ['08:00', '20:00']).getTime(), at(20, 0).getTime());
  assert.equal(nextRun(at(21, 0), ['08:00', '20:00']).getTime(), at(8, 0, 4).getTime());
});