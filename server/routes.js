import { Router } from 'express';
import { db, getAllSettings, setSetting, DEFAULT_SETTINGS } from './database/db.js';
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
router.put('/settings', wrap((req) => {
  for (const [k, v] of Object.entries(req.body || {})) {
    if (k === 'scoring_weights') throw httpError(400, 'Use PUT /api/scoring/weights');
    if (!(k in DEFAULT_SETTINGS)) throw httpError(400, `Unknown setting: ${k}`);
    if (typeof v !== typeof DEFAULT_SETTINGS[k]) throw httpError(400, `Invalid value type for ${k}`);
    setSetting(k, v);
  }
  return getAllSettings();
}));

router.get('/quota', wrap(() => getQuotaStatus()));

router.get('/stats', wrap(() => ({
  videos: db.prepare('SELECT COUNT(*) AS n FROM videos').get().n,
  channels: db.prepare('SELECT COUNT(*) AS n FROM channels').get().n,
  snapshots: db.prepare('SELECT COUNT(*) AS n FROM video_snapshots').get().n,
  runs: db.prepare('SELECT COUNT(*) AS n FROM collection_runs').get().n,
})));

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
  const { q, category, region, sort = 'velocity' } = req.query;
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const order = SORTS[sort] ?? SORTS.velocity;
  return db.prepare(
    `SELECT v.id, v.title, v.url, v.thumbnail_url, v.published_at, v.primary_category,
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
     ORDER BY ${order} DESC LIMIT @limit`
  ).all({ category: category || null, q: q ? `%${q}%` : null, region: region ? String(region).toUpperCase() : null, limit });
}));

router.get('/videos/:id/snapshots', wrap((req) =>
  db.prepare('SELECT * FROM video_snapshots WHERE video_id = ? ORDER BY captured_at').all(req.params.id)
));

export default router;