import { Router } from 'express';
import { db, getSetting } from './database/db.js';
import { CATEGORIES } from './config.js';
import { latestTopics } from './services/topicQueries.js';
import { parseMeta } from './services/analysis.js';
import { TYPE_SQL, TYPE_FILTER_SQL, classifyVideo, normalizeType } from './services/videoType.js';

const router = Router();
const wrap = (fn) => (req, res) => {
  try { res.json(fn(req)); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
};
const err = (status, message) => Object.assign(new Error(message), { status });

const DAY = 86_400_000;
const daysAgo = (n) => new Date(Date.now() - n * DAY).toISOString();
const round1 = (v) => Math.round(v * 10) / 10;

router.get('/regions', wrap(() =>
  db.prepare('SELECT DISTINCT region_code FROM video_sources ORDER BY region_code').all().map((r) => r.region_code)
));

router.get('/dashboard', wrap((req) => {
  const topics = latestTopics(); // topics reflect the analysis scope; the video widgets below follow ?type=
  const trackingDays = getSetting('tracking_window_days');
  const type = normalizeType(req.query.type);
  const shortMax = getSetting('short_max_seconds');
  const F = TYPE_FILTER_SQL();
  const bind = (extra = {}) => ({ vtype: type, shortMax, ...extra });
  const count = (sql, extra) => db.prepare(sql).get(bind(extra)).n;

  const videos = {
    total: count(`SELECT COUNT(*) AS n FROM videos v WHERE ${F}`),
    tracked: count(`SELECT COUNT(*) AS n FROM videos v WHERE v.published_at >= @since AND ${F}`, { since: daysAgo(trackingDays) }),
    channels: count(`SELECT COUNT(DISTINCT v.channel_id) AS n FROM videos v WHERE ${F}`),
    trackingDays,
  };

  const hiScore = getSetting('high_opportunity_score');
  const hiConf = getSetting('high_opportunity_min_confidence');
  const summary = {
    discovered: topics.length,
    emerging: topics.filter((t) => t.status === 'emerging').length,
    growing: topics.filter((t) => t.status === 'growing').length,
    highOpportunity: topics.filter((t) => t.score >= hiScore && t.confidence >= hiConf).length,
    highThreshold: hiScore,
    highMinConfidence: hiConf,
  };

  // Shorts vs long: always shown side by side, whatever ?type is
  const typeSplit = db.prepare(`
    SELECT ${TYPE_SQL()} AS type, COUNT(*) AS videos, COUNT(DISTINCT v.channel_id) AS channels, SUM(s.view_count) AS views
    FROM videos v JOIN video_snapshots s ON s.id = (SELECT id FROM video_snapshots WHERE video_id = v.id ORDER BY captured_at DESC LIMIT 1)
    GROUP BY 1`).all({ shortMax })
    .map((r) => ({ ...r, avgViews: r.videos ? Math.round(r.views / r.videos) : 0 }));

  // Trending categories: average topic score (estimate) + measured views gained in the last 7 days
  const gained = new Map(db.prepare(`
    SELECT v.primary_category AS category, SUM(s.views_gained) AS gained
    FROM video_snapshots s JOIN videos v ON v.id = s.video_id
    WHERE s.views_gained IS NOT NULL AND s.captured_at >= @since AND ${F} GROUP BY v.primary_category`)
    .all(bind({ since: daysAgo(7) })).map((r) => [r.category, r.gained]));
  const categories = CATEGORIES.map(({ key, label }) => {
    const list = topics.filter((t) => t.category === key);
    return {
      key, label, topics: list.length,
      avgScore: list.length ? round1(list.reduce((a, t) => a + t.score, 0) / list.length) : null,
      rising: list.filter((t) => t.status === 'emerging' || t.status === 'growing').length,
      viewsGained7d: gained.get(key) ?? 0,
    };
  }).sort((a, b) => (b.avgScore ?? -1) - (a.avgScore ?? -1));

  const byScore = [...topics].sort((a, b) => b.score - a.score);
  const topOpportunities = byScore.slice(0, 8);

  // Growth chart 1: measured views gained per (UTC) day across all monitored videos
  const growth = db.prepare(`
    SELECT substr(s.captured_at, 1, 10) AS day, SUM(s.views_gained) AS gained, COUNT(DISTINCT s.video_id) AS videos
    FROM video_snapshots s JOIN videos v ON v.id = s.video_id
    WHERE s.views_gained IS NOT NULL AND s.captured_at >= @since AND ${F}
    GROUP BY day ORDER BY day`).all(bind({ since: daysAgo(30) }));

  // Growth chart 2: score history of the top 5 topics (last score of each day)
  const series = byScore.slice(0, 5).map((t, i) => ({ key: `t${i}`, id: t.id, name: t.name }));
  const rowsByDay = new Map();
  const hist = db.prepare('SELECT substr(computed_at, 1, 10) AS day, score FROM trend_scores WHERE topic_id = ? AND computed_at >= ? ORDER BY id');
  for (const s of series) {
    for (const h of hist.all(s.id, daysAgo(30))) {
      if (!rowsByDay.has(h.day)) rowsByDay.set(h.day, { day: h.day });
      rowsByDay.get(h.day)[s.key] = h.score; // later rows overwrite earlier ones, so the last score of the day wins
    }
  }
  const scoreTrend = { series, rows: [...rowsByDay.values()].sort((a, b) => (a.day < b.day ? -1 : 1)) };

  const recentDiscoveries = [...topics]
    .sort((a, b) => (a.firstDetectedAt < b.firstDetectedAt ? 1 : -1)).slice(0, 8);

  const lastRun = db.prepare(
    'SELECT id, started_at, finished_at, status, videos_found, new_videos, quota_used FROM collection_runs ORDER BY id DESC LIMIT 1'
  ).get() ?? null;

  return { videos, summary, typeSplit, categories, topOpportunities, growth, scoreTrend, recentDiscoveries, lastRun };
}));

router.get('/topics/:id/analytics', wrap((req) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw err(400, 'Invalid topic id');
  const topic = db.prepare('SELECT id, name, category, keywords FROM topics WHERE id = ?').get(id);
  if (!topic) throw err(404, 'Topic not found');
  const shortMax = getSetting('short_max_seconds');

  const videos = db.prepare(`
    SELECT v.id, v.title, v.published_at, v.duration_seconds, v.channel_id, c.title AS channel_title, c.subscriber_count
    FROM topic_videos tv JOIN videos v ON v.id = tv.video_id JOIN channels c ON c.id = v.channel_id
    WHERE tv.topic_id = ?`).all(id);
  const byVideo = new Map(videos.map((v) => [v.id, v]));
  const snaps = db.prepare(`
    SELECT s.video_id, s.run_id, s.captured_at, s.view_count, s.like_count, s.comment_count,
           s.views_gained, s.views_per_hour, s.velocity_basis
    FROM video_snapshots s JOIN topic_videos tv ON tv.video_id = s.video_id
    WHERE tv.topic_id = ? ORDER BY s.captured_at`).all(id);

  const latest = new Map();
  for (const s of snaps) latest.set(s.video_id, s);
  const runKey = (s) => s.run_id ?? s.captured_at;

  // ---- one point per collection run ----
  const runs = new Map();
  for (const s of snaps) {
    let r = runs.get(runKey(s));
    if (!r) { r = { t: s.captured_at, videos: 0, gained: null, vph: null, measuredVideos: 0, eng: 0, engViews: 0 }; runs.set(runKey(s), r); }
    if (s.captured_at < r.t) r.t = s.captured_at;
    r.videos++;
    if (s.views_gained != null) r.gained = (r.gained ?? 0) + s.views_gained;
    if (s.velocity_basis === 'snapshot_delta' && s.views_per_hour != null) { r.vph = (r.vph ?? 0) + s.views_per_hour; r.measuredVideos++; }
    if (s.like_count != null && s.view_count > 0) { r.eng += s.like_count + (s.comment_count ?? 0); r.engViews += s.view_count; }
  }
  const collections = [...runs.values()].sort((a, b) => (a.t < b.t ? -1 : 1)).map((r) => ({
    t: r.t, videos: r.videos, gained: r.gained,
    viewsPerHour: r.vph == null ? null : Math.round(r.vph), measuredVideos: r.measuredVideos,
    engagement: r.engViews > 0 ? Math.round((r.eng / r.engViews) * 10000) / 100 : null, // percent
  }));

  // ---- views over time for the 5 biggest videos ----
  const topIds = [...latest.values()].sort((a, b) => b.view_count - a.view_count).slice(0, 5).map((s) => s.video_id);
  const viewRows = new Map();
  for (const s of snaps) {
    const idx = topIds.indexOf(s.video_id);
    if (idx < 0) continue;
    const row = viewRows.get(runKey(s)) ?? { t: s.captured_at };
    if (s.captured_at < row.t) row.t = s.captured_at;
    row[`v${idx}`] = s.view_count;
    viewRows.set(runKey(s), row);
  }
  const viewSeries = {
    videos: topIds.map((vid, i) => ({ key: `v${i}`, id: vid, title: byVideo.get(vid)?.title ?? vid })),
    rows: [...viewRows.values()].sort((a, b) => (a.t < b.t ? -1 : 1)),
  };

  // ---- publication frequency (last 60 days of the topic's range, zero days filled) ----
  const perDay = new Map();
  for (const v of videos) { const d = v.published_at.slice(0, 10); perDay.set(d, (perDay.get(d) || 0) + 1); }
  const publication = [];
  const dayKeys = [...perDay.keys()].sort();
  if (dayKeys.length) {
    const end = Date.parse(dayKeys.at(-1));
    for (let t = Math.max(Date.parse(dayKeys[0]), end - 59 * DAY); t <= end; t += DAY) {
      const d = new Date(t).toISOString().slice(0, 10);
      publication.push({ day: d, count: perDay.get(d) || 0 });
    }
  }

  // ---- channels (with Shorts / long split) ----
  const chMap = new Map();
  for (const v of videos) {
    const s = latest.get(v.id);
    if (!s) continue;
    const c = chMap.get(v.channel_id) ?? { id: v.channel_id, title: v.channel_title, subscribers: v.subscriber_count, videos: 0, views: 0, eng: 0, engViews: 0, shorts: 0, longs: 0, shortViews: 0, longViews: 0 };
    c.videos++; c.views += s.view_count;
    const vt = classifyVideo(v.duration_seconds, shortMax);
    if (vt === 'short') { c.shorts++; c.shortViews += s.view_count; }
    else if (vt === 'long') { c.longs++; c.longViews += s.view_count; }
    if (s.like_count != null && s.view_count > 0) { c.eng += s.like_count + (s.comment_count ?? 0); c.engViews += s.view_count; }
    chMap.set(v.channel_id, c);
  }
  const channels = [...chMap.values()].map((c) => ({
    id: c.id, title: c.title, subscribers: c.subscribers, videos: c.videos, views: c.views,
    shorts: c.shorts, longs: c.longs, shortViews: c.shortViews, longViews: c.longViews,
    viewsPerVideo: Math.round(c.views / c.videos), engagement: c.engViews > 0 ? c.eng / c.engViews : null,
  })).sort((a, b) => b.views - a.views);

  // ---- Shorts vs long inside this topic ----
  const split = {};
  for (const v of videos) {
    const t = classifyVideo(v.duration_seconds, shortMax);
    const e = (split[t] ??= { type: t, videos: 0, views: 0 });
    e.videos++; e.views += latest.get(v.id)?.view_count ?? 0;
  }
  const typeSplit = ['short', 'long', 'unknown'].filter((t) => split[t])
    .map((t) => ({ ...split[t], avgViews: Math.round(split[t].views / split[t].videos) }));

  // ---- competition: who owns the views, by channel size ----
  const BUCKETS = [['Under 10K', 0, 1e4], ['10K–100K', 1e4, 1e5], ['100K–1M', 1e5, 1e6], ['1M+', 1e6, Infinity]];
  const sizeBuckets = [...BUCKETS.map(([label]) => ({ label, channels: 0, videos: 0, views: 0 })), { label: 'Unknown', channels: 0, videos: 0, views: 0 }];
  for (const c of channels) {
    const i = c.subscribers == null ? 4 : BUCKETS.findIndex(([, lo, hi]) => c.subscribers >= lo && c.subscribers < hi);
    const b = sizeBuckets[i];
    b.channels++; b.videos += c.videos; b.views += c.views;
  }
  const totalViews = sizeBuckets.reduce((a, b) => a + b.views, 0);
  sizeBuckets.forEach((b) => { b.viewShare = totalViews ? Math.round((b.views / totalViews) * 1000) / 10 : 0; });

  // ---- topic popularity over time (stored score history) ----
  const history = db.prepare('SELECT computed_at, score, confidence, trend_status, components FROM trend_scores WHERE topic_id = ? ORDER BY id DESC LIMIT 60')
    .all(id).reverse().map((h) => ({
      t: h.computed_at, score: h.score, confidence: Math.round(h.confidence * 100),
      status: h.trend_status, videoCount: JSON.parse(h.components).stats.videoCount,
    }));

  // ---- related topics: shared keywords, shared channels, same category ----
  const all = latestTopics();
  const me = all.find((t) => t.id === id) ?? null;
  const myTerms = new Set(me?.terms ?? parseMeta(topic.keywords).terms ?? []);
  const channelsByTopic = new Map();
  for (const r of db.prepare('SELECT DISTINCT tv.topic_id, v.channel_id FROM topic_videos tv JOIN videos v ON v.id = tv.video_id').all()) {
    if (!channelsByTopic.has(r.topic_id)) channelsByTopic.set(r.topic_id, new Set());
    channelsByTopic.get(r.topic_id).add(r.channel_id);
  }
  const myChannels = channelsByTopic.get(id) ?? new Set();
  const related = all.filter((t) => t.id !== id).map((t) => {
    const sharedTerms = t.terms.filter((x) => myTerms.has(x)).length;
    const unionSize = new Set([...myTerms, ...t.terms]).size;
    const sharedChannels = [...(channelsByTopic.get(t.id) ?? [])].filter((c) => myChannels.has(c)).length;
    const relation = [];
    if (sharedTerms) relation.push('shared keywords');
    if (sharedChannels) relation.push('shared channels');
    if (t.category === topic.category) relation.push('same category');
    const relevance = (unionSize ? 2 * sharedTerms / unionSize : 0) + 0.15 * Math.min(sharedChannels, 4) + (t.category === topic.category ? 0.1 : 0);
    return { ...t, relation, relevance };
  }).filter((t) => t.relation.length).sort((a, b) => b.relevance - a.relevance).slice(0, 6);
  const compare = me ? [{ ...me, relation: ['this topic'], relevance: 1, isSelf: true }, ...related] : related;

  return {
    topic: { id: topic.id, name: topic.name, category: topic.category },
    meta: { snapshots: snaps.length, collections: collections.length },
    collections, viewSeries, publication, channels, typeSplit, sizeBuckets, history, related: compare,
  };
}));

export default router;