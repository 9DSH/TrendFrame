import { Router } from 'express';
import { db, getSetting, setSetting, DEFAULT_SETTINGS } from './database/db.js';
import { config } from './config.js';
import { startAnalysis, analysisState, rescoreLatest, parseMeta } from './services/analysis.js';
import { validateWeights } from './services/scoring.js';
import { latestTopics } from './services/topicQueries.js';
import { classifyVideo } from './services/videoType.js';

const router = Router();
const wrap = (fn, ok = 200) => (req, res) => {
  try { res.status(ok).json(fn(req)); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
};
const err = (status, message) => Object.assign(new Error(message), { status });

router.post('/analysis/run', wrap(() => { startAnalysis(); return { started: true }; }, 202));
router.get('/analysis/status', wrap(() => ({ ...analysisState, openaiKeyConfigured: Boolean(config.openaiKey) })));

router.get('/scoring/weights', wrap(() => ({ weights: getSetting('scoring_weights'), defaults: DEFAULT_SETTINGS.scoring_weights })));
router.put('/scoring/weights', wrap((req) => {
  setSetting('scoring_weights', validateWeights(req.body?.weights));
  rescoreLatest();
  return { weights: getSetting('scoring_weights') };
}));

const SORTS = {
  score: (t) => t.score, confidence: (t) => t.confidence, growth: (t) => t.growthRate ?? -Infinity,
  videos: (t) => t.videoCount, channels: (t) => t.channelCount, updated: (t) => Date.parse(t.computedAt), name: (t) => t.name.toLowerCase(),
};

router.get('/topics', wrap((req) => {
  const { q, category, status, flag, direction, region, type, sort = 'score', dir } = req.query;
  const days = Number(req.query.days);
  let items = latestTopics({ region: region ? String(region).toUpperCase() : null });
  if (days > 0) {
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    items = items.filter((t) => t.latestPublished && t.latestPublished >= since); // has a video published in the period
  }
  if (q) {
    const needle = String(q).toLowerCase();
    items = items.filter((t) => t.name.toLowerCase().includes(needle) || t.terms.some((x) => x.includes(needle)));
  }
  if (category) items = items.filter((t) => t.category === category);
  if (status) items = items.filter((t) => t.status === status);
  if (direction) items = items.filter((t) => t.direction === direction);
  if (flag) items = items.filter((t) => t.flags.includes(flag));
  
  if (type === 'short') items = items.filter((t) => t.shortCount == null || t.shortCount > 0); // topic contains Shorts
  if (type === 'long') items = items.filter((t) => t.longCount == null || t.longCount > 0);
  const key = SORTS[sort] ?? SORTS.score;
  const sign = dir === 'asc' || (sort === 'name' && dir !== 'desc') ? 1 : -1;
  items.sort((a, b) => (key(a) > key(b) ? 1 : key(a) < key(b) ? -1 : 0) * sign);
  return items;
}));

router.get('/topics/:id', wrap((req) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw err(400, 'Invalid topic id');
  const topic = db.prepare('SELECT * FROM topics WHERE id = ?').get(id);
  if (!topic) throw err(404, 'Topic not found');
  const latest = db.prepare('SELECT * FROM trend_scores WHERE topic_id = ? ORDER BY id DESC LIMIT 1').get(id);
  const history = db.prepare('SELECT computed_at, score, confidence, trend_status FROM trend_scores WHERE topic_id = ? ORDER BY id DESC LIMIT 60').all(id).reverse();
  const videos = db.prepare(`
    SELECT v.id, v.title, v.url, v.published_at, v.duration_seconds, c.id AS channel_id, c.title AS channel_title, c.subscriber_count,
           tv.similarity, s.view_count, s.views_gained, s.views_per_hour, s.engagement_rate, s.velocity_basis
    FROM topic_videos tv
    JOIN videos v ON v.id = tv.video_id
    JOIN channels c ON c.id = v.channel_id
    JOIN video_snapshots s ON s.id = (SELECT id FROM video_snapshots WHERE video_id = v.id ORDER BY captured_at DESC LIMIT 1)
    WHERE tv.topic_id = ? ORDER BY s.views_per_hour DESC`).all(id).map((v) => ({ ...v, video_type: classifyVideo(v.duration_seconds, getSetting('short_max_seconds')) }));
  const channels = new Map();
  for (const v of videos) {
    const c = channels.get(v.channel_id) ?? { id: v.channel_id, title: v.channel_title, subscribers: v.subscriber_count, videos: 0, views: 0 };
    c.videos++; c.views += v.view_count;
    channels.set(v.channel_id, c);
  }
  return {
    topic: { id: topic.id, name: topic.name, category: topic.category, meta: parseMeta(topic.keywords) },
    score: latest && { score: latest.score, confidence: latest.confidence, status: latest.trend_status, computedAt: latest.computed_at, components: JSON.parse(latest.components) },
    history, videos, channels: [...channels.values()].sort((a, b) => b.views - a.views),
  };
}));

export default router;