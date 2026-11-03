import { Router } from 'express';
import { db, getSetting } from './database/db.js';
import { TYPE_SQL, classifyVideo } from './services/videoType.js';

const router = Router();
const wrap = (fn) => (req, res) => {
  try { res.json(fn(req)); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
};
const LATEST = 'JOIN video_snapshots s ON s.id = (SELECT id FROM video_snapshots WHERE video_id = v.id ORDER BY captured_at DESC LIMIT 1)';

const SORTS = {
  views: (c) => c.views, short_views: (c) => c.shortViews, long_views: (c) => c.longViews,
  shorts: (c) => c.shorts, longs: (c) => c.longs, videos: (c) => c.videos,
  subscribers: (c) => c.subscribers ?? -1, name: (c) => c.title.toLowerCase(),
};

router.get('/channels', wrap((req) => {
  const { q, type, sort = 'views' } = req.query;
  const shortMax = getSetting('short_max_seconds');
  const all = db.prepare(`
    SELECT c.id, c.title, c.custom_url, c.subscriber_count, c.country, c.video_count AS channel_total_videos,
           COUNT(*) AS videos,
           SUM(t.vtype = 'short') AS shorts, SUM(t.vtype = 'long') AS longs, SUM(t.vtype = 'unknown') AS unknown,
           SUM(CASE WHEN t.vtype = 'short' THEN t.views ELSE 0 END) AS short_views,
           SUM(CASE WHEN t.vtype = 'long' THEN t.views ELSE 0 END) AS long_views,
           SUM(t.views) AS views, MAX(t.published_at) AS last_published
    FROM (SELECT v.channel_id, v.published_at, s.view_count AS views, ${TYPE_SQL()} AS vtype
          FROM videos v ${LATEST}) t
    JOIN channels c ON c.id = t.channel_id
    GROUP BY c.id`).all({ shortMax }).map((r) => ({
    id: r.id, title: r.title,customUrl: r.custom_url, subscribers: r.subscriber_count, country: r.country, channelTotalVideos: r.channel_total_videos,
    videos: r.videos, shorts: r.shorts, longs: r.longs, unknown: r.unknown,
    shortViews: r.short_views, longViews: r.long_views, views: r.views, lastPublished: r.last_published,
  }));

  const totals = {
    short: { channels: all.filter((c) => c.shorts > 0).length, videos: all.reduce((a, c) => a + c.shorts, 0), views: all.reduce((a, c) => a + c.shortViews, 0) },
    long: { channels: all.filter((c) => c.longs > 0).length, videos: all.reduce((a, c) => a + c.longs, 0), views: all.reduce((a, c) => a + c.longViews, 0) },
  };

  let items = all;
  if (q) { const n = String(q).toLowerCase(); items = items.filter((c) => c.title.toLowerCase().includes(n)); }
  if (type === 'short') items = items.filter((c) => c.shorts > 0);
  if (type === 'long') items = items.filter((c) => c.longs > 0);
  const key = SORTS[sort] ?? SORTS.views;
  const sign = sort === 'name' ? 1 : -1;
  items.sort((a, b) => (key(a) > key(b) ? 1 : key(a) < key(b) ? -1 : 0) * sign);
  return { shortMaxSeconds: shortMax, totals, total: items.length, channels: items.slice(0, 500) };
}));

router.get('/channels/:id', wrap((req) => {
  const ch = db.prepare('SELECT * FROM channels WHERE id = ?').get(req.params.id);
  if (!ch) throw Object.assign(new Error('Channel not found'), { status: 404 });
  const shortMax = getSetting('short_max_seconds');
  const videos = db.prepare(`
    SELECT v.id, v.title, v.url, v.published_at, v.duration_seconds, s.view_count, s.views_per_hour, s.velocity_basis, s.engagement_rate
    FROM videos v ${LATEST} WHERE v.channel_id = ? ORDER BY v.published_at DESC LIMIT 300`).all(req.params.id)
    .map((v) => ({ ...v, video_type: classifyVideo(v.duration_seconds, shortMax) }));
  const split = {};
  for (const t of ['short', 'long', 'unknown']) {
    const list = videos.filter((v) => v.video_type === t);
    const views = list.reduce((a, v) => a + v.view_count, 0);
    split[t] = { videos: list.length, views, avgViews: list.length ? Math.round(views / list.length) : 0 };
  }
  return {
    channel: { id: ch.id, title: ch.title, subscribers: ch.subscriber_count, country: ch.country, totalVideos: ch.video_count, totalViews: ch.view_count },
    shortMaxSeconds: shortMax, split, videos,
  };
}));

export default router;