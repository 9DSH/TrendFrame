import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config, CATEGORIES } from '../config.js';
import { SCHEMA } from './schema.js';
import { DEFAULT_PARAMS } from '../services/scoring.js';

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

export const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(SCHEMA);

export const DEFAULT_SETTINGS = {
  regions: ['US'],
  categories: CATEGORIES.map((c) => c.key),
  searches_per_category: 1,
  search_window_days: 7,
  tracking_window_days: 30,
  max_tracked_videos: 500,
  refresh_tracked: true,
  daily_quota_limit: 10000,
  quota_reserve: 200,
  scoring_weights: {
    trend_momentum: 25, view_velocity: 20, engagement: 15, cross_channel: 15,
    competition: 10, long_term: 5, animation_potential: 10,
  },
  analysis_window_days: 30,
  similarity_threshold: 0.28,
  min_topic_videos: 2,
  min_topic_channels: 2,
  auto_analyze: true,
  ai_topic_labeling: false,
  video_type: 'both',              // what to collect: both | short | long
  short_max_seconds: 60,           // a video <= this length counts as a Short
  analysis_video_type: 'both',     // what to cluster and score
  merge_threshold: 0.6,
  high_opportunity_score: 65,
  high_opportunity_min_confidence: 0.4,
  scoring_params: DEFAULT_PARAMS,
  
};

const nowIso = () => new Date().toISOString();

export function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (row) return JSON.parse(row.value);
  return key in DEFAULT_SETTINGS ? DEFAULT_SETTINGS[key] : fallback;
}

export function setSetting(key, value) {
  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(key, JSON.stringify(value), nowIso());
}

export function getAllSettings() {
  return Object.fromEntries(Object.keys(DEFAULT_SETTINGS).map((k) => [k, getSetting(k)]));
}

export const getScoringParams = () => ({ ...DEFAULT_PARAMS, ...(getSetting('scoring_params') ?? {}) });


// Seed defaults without overwriting user changes
const seed = db.prepare('INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, ?)');
for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) seed.run(k, JSON.stringify(v), nowIso());
