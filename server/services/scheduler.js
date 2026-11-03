import { getSetting, setSetting } from '../database/db.js';
import { startCollection, collectionState } from './collector.js';
import { normalizeTimes, dueSlot, nextRun } from './scheduleLogic.js';

const TICK_MS = 60_000;
const nowIso = () => new Date().toISOString();

export function scheduleStatus(now = new Date()) {
  const enabled = Boolean(getSetting('schedule_enabled'));
  const times = getSetting('schedule_times');
  const catchUp = Boolean(getSetting('schedule_catch_up'));
  const last = getSetting('schedule_last_slot', null);
  return {
    enabled, times, catchUp, lastSlot: last, lastError: getSetting('schedule_last_error', null),
    pendingNow: enabled && Boolean(dueSlot(now, times, last, catchUp)),
    nextRun: enabled ? nextRun(now, times)?.toISOString() ?? null : null,
  };
}

export function saveSchedule({ enabled, times, catchUp }) {
  const t = normalizeTimes(times);
  setSetting('schedule_times', t);
  setSetting('schedule_enabled', Boolean(enabled));
  setSetting('schedule_catch_up', Boolean(catchUp));
  // slots that already passed today must not fire just because the schedule was saved
  setSetting('schedule_last_slot', dueSlot(new Date(), t, null, true));
  setSetting('schedule_last_error', null);
  return scheduleStatus();
}

function tick() {
  try {
    if (!getSetting('schedule_enabled') || collectionState.running) return; // busy: try again next minute
    const slot = dueSlot(new Date(), getSetting('schedule_times'), getSetting('schedule_last_slot', null), getSetting('schedule_catch_up'));
    if (!slot) return;
    setSetting('schedule_last_slot', slot); // mark first so a failure is not retried every minute
    try {
      startCollection({}, 'scheduled');
      setSetting('schedule_last_error', null);
      console.log(`Scheduled collection started (${slot})`);
    } catch (e) {
      setSetting('schedule_last_error', { at: nowIso(), message: e.message });
      console.error('Scheduled collection could not start:', e.message);
    }
  } catch (e) { console.error('Scheduler error:', e.message); }
}

export function startScheduler() {
  setInterval(tick, TICK_MS).unref?.();
  setTimeout(tick, 5_000); // catch up shortly after start
}