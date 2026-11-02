import { db, getSetting } from '../database/db.js';

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

export function getQuotaStatus() {
  const day = pacificDay();
  const used = db.prepare('SELECT units FROM quota_usage WHERE day = ?').get(day)?.units ?? 0;
  const limit = getSetting('daily_quota_limit', 10000);
  const reserve = getSetting('quota_reserve', 200);
  return { day, used, limit, reserve, remaining: Math.max(limit - used, 0), available: Math.max(limit - reserve - used, 0) };
}

// Called before every API request. Throws if the local budget can't afford it.
export function chargeQuota(endpoint) {
  const cost = COSTS[endpoint] ?? 1;
  const status = getQuotaStatus();
  if (cost > status.available) {
    throw new QuotaExceededError(
      `Local quota budget reached (${status.used}/${status.limit} units used, ${status.reserve} reserved). Resets at midnight Pacific Time.`
    );
  }
  db.prepare(
    `INSERT INTO quota_usage (day, units) VALUES (?, ?)
     ON CONFLICT(day) DO UPDATE SET units = units + excluded.units`
  ).run(status.day, cost);
}

// Called when Google itself says the quota is gone, to sync our counter
export function markQuotaExhausted() {
  const { day, limit } = getQuotaStatus();
  db.prepare(
    `INSERT INTO quota_usage (day, units) VALUES (?, ?)
     ON CONFLICT(day) DO UPDATE SET units = MAX(units, excluded.units)`
  ).run(day, limit);
}