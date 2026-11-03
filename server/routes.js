import { Router } from 'express';
import { db, getSetting, getAllSettings, setSetting, DEFAULT_SETTINGS } from './database/db.js';
import { FIELDS, validateSettingsPatch } from './services/settingsSchema.js';
import { TYPE_SQL, TYPE_FILTER_SQL, normalizeType } from './services/videoType.js';
import { config, CATEGORIES } from './config.js';
import { getQuotaStatus } from './services/quota.js';
import { buildPlan, resolveOptions, startCollection, collectionState, httpError } from './services/collector.js';

const router = Router();
const wrap = (fn) => (req, res) => {
  try { res.json(fn(req)); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
};

router.get('/health', wrap(() => ({
  ok: true,
  youtubeKeyConfigured: Boolean(config.youtubeKey),
  openaiKeyConfigured: Boolean(config.openaiKey),
})));

router.get('/config', wrap(() => ({
  categories: CATEGORIES.map(({ key, label }) => ({ key, label })),
})));

router.get('/settings', wrap(() => getAllSettings()));
router.get('/settings/schema', wrap(() => ({ fields: FIELDS, defaults: DEFAULT_SETTINGS })));
router.put('/settings', wrap((req) => {
  for (const [k, v] of Object.entries(validateSettingsPatch(req.body || {}))) setSetting(k, v);
  return getAllSettings();
}));

// What the last analysis covered, and what the settings say now (used by the scope badge)
router.get('/scope', wrap(() => ({
  settings: {
    collectVideoType: getSetting('video_type'), analysisVideoType: getSetting('analysis_video_type'),
    shortMaxSeconds: getSetting('short_max_seconds'), windowDays: getSetting('analysis_window_days'),
  },
  lastAnalysis: getSetting('last_analysis_scope', null),
})));

router.get('/quota', wrap(() => getQuotaStatus()));

router.get('/stats', wrap(() => {
  const split = Object.fromEntries(
    db.prepare(`SELECT ${TYPE_SQL()} AS type, COUNT(*) AS n FROM videos v GROUP BY 1`).all({ shortMax: getSetting('short_max_seconds') })
      .map((r) => [r.type, r.n]));
  return {
    videos: db.prepare('SELECT COUNT(*) AS n FROM videos').get().n,
    shorts: split.short ?? 0,
    long: split.long ?? 0,
    channels: db.prepare('SELECT COUNT(*) AS n FROM channels').get().n,
    snapshots: db.prepare('SELECT COUNT(*) AS n FROM video_snapshots').get().n,
    runs: db.prepare('SELECT COUNT(*) AS n FROM collection_runs').get().n,
  };
}));

router.post('/collect/estimate', wrap((req) => {
  const options = resolveOptions(req.body || {});
  const plan = buildPlan(options);
  return { counts: plan.counts, estimatedUnits: plan.estimatedUnits, quota: getQuotaStatus() };
}));

router.post('/collect', (req, res) => {
  try { res.status(202).json(startCollection(req.body || {})); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

router.get('/collect/status', wrap(() => collectionState));

router.get('/collect/runs', wrap(() =>
  db.prepare('SELECT * FROM collection_runs ORDER BY id DESC LIMIT 10').all().map((r) => ({
    ...r,
    options: JSON.parse(r.options || 'null'),
    errors: JSON.parse(r.errors || '[]'),
  }))
));

const SORTS = {
  velocity: 's.views_per_hour',
  views: 's.view_count',
  newest: 'v.published_at',
  engagement: 's.engagement_rate',
};

router.get('/videos', wrap((req) => {
  const { q, category, region, type, sort = 'velocity' } = req.query;
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const order = SORTS[sort] ?? SORTS.velocity;
  return db.prepare(
    `SELECT v.id, v.title, v.url, v.thumbnail_url, v.published_at, v.primary_category, v.duration_seconds,
            ${TYPE_SQL()} AS video_type,
            c.id AS channel_id, c.title AS channel_title, c.subscriber_count,
            s.view_count, s.like_count, s.comment_count, s.views_gained, s.views_per_hour, s.views_per_day,
            s.engagement_rate, s.video_age_hours, s.velocity_basis, s.captured_at,
            (SELECT COUNT(*) FROM video_snapshots WHERE video_id = v.id) AS snapshot_count
     FROM videos v
     JOIN channels c ON c.id = v.channel_id
     JOIN video_snapshots s ON s.id = (SELECT id FROM video_snapshots WHERE video_id = v.id ORDER BY captured_at DESC LIMIT 1)
     WHERE (@category IS NULL OR v.primary_category = @category)
       AND (@q IS NULL OR v.title LIKE @q OR c.title LIKE @q)
       AND (@region IS NULL OR EXISTS (SELECT 1 FROM video_sources vs WHERE vs.video_id = v.id AND vs.region_code = @region))
       AND ${TYPE_FILTER_SQL()}
     ORDER BY ${order} DESC LIMIT @limit`
  ).all({
    category: category || null, q: q ? `%${q}%` : null, region: region ? String(region).toUpperCase() : null, limit,
    vtype: normalizeType(type), shortMax: getSetting('short_max_seconds'),
  });
}));

router.get('/videos/:id/snapshots', wrap((req) =>
  db.prepare('SELECT * FROM video_snapshots WHERE video_id = ? ORDER BY captured_at').all(req.params.id)
));

export default router;