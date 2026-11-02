import { db, getSetting, setSetting } from '../database/db.js';

export const COSTS = {
  'videos.list': 1,
  'search.list': 100,
  'channels.list': 1,
  'videoCategories.list': 1,
};

export class QuotaExceededError extends Error {
  constructor(message) {
    super(message);
    this.name = 'QuotaExceededError';
    this.status = 429;
  }
}

// YouTube resets quota at midnight Pacific Time
export const pacificDay = (d = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(d); // YYYY-MM-DD

/** Informational only. The local counter is an estimate and never blocks a request. */
export function getQuotaStatus() {
  const day = pacificDay();
  const used = db.prepare('SELECT units FROM quota_usage WHERE day = ?').get(day)?.units ?? 0;
  const limit = getSetting('daily_quota_limit', 10000);
  const remaining = Math.max(limit - used, 0);
  return {
    day, used, limit, reserve: 0, remaining, available: remaining,
    exhausted: getSetting('quota_exhausted_day', null) === day, // set only when Google says so
  };
}

// Records usage after Google has answered. Never throws.
export function chargeQuota(endpoint) {
  const cost = COSTS[endpoint] ?? 1;
  db.prepare(
    `INSERT INTO quota_usage (day, units) VALUES (?, ?)
     ON CONFLICT(day) DO UPDATE SET units = units + excluded.units`
  ).run(pacificDay(), cost);
}

// Called when Google itself reports the quota is gone
export function markQuotaExhausted() {
  setSetting('quota_exhausted_day', pacificDay());
}