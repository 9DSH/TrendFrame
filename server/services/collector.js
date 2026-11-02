import { db, getSetting } from '../database/db.js';
import { config, CATEGORIES } from '../config.js';
import * as yt from './youtubeClient.js';
import { COSTS, QuotaExceededError, getQuotaStatus } from './quota.js';
import { computeSnapshotMetrics } from './metrics.js';
import { startAnalysis } from './analysis.js';

const DAY_MS = 86_400_000;
const CATEGORY_REFRESH_DAYS = 30;
const CHANNEL_REFRESH_DAYS = 7;
const nowIso = () => new Date().toISOString();

export const collectionState = { running: false, runId: null, step: 'idle', message: '', startedAt: null };

export function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

const clamp = (v, min, max, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(Math.max(Math.round(n), min), max) : fallback;
};

/** Merge request options over saved settings and validate them. */
export function resolveOptions(input = {}) {
  const pick = (camel, snake) => input[camel] ?? getSetting(snake);

  const regions = [...new Set([].concat(pick('regions', 'regions')).map((r) => String(r).trim().toUpperCase()).filter(Boolean))];
  if (!regions.length || regions.some((r) => !/^[A-Z]{2}$/.test(r)))
    throw httpError(400, 'Regions must be two-letter country codes such as US, GB or DE.');

  const validKeys = CATEGORIES.map((c) => c.key);
  const categories = [].concat(pick('categories', 'categories'));
  if (!categories.length || categories.some((k) => !validKeys.includes(k)))
    throw httpError(400, 'Choose at least one valid category.');

  return {
    regions,
    categories,
    searchesPerCategory: clamp(pick('searchesPerCategory', 'searches_per_category'), 0, 2, 1),
    searchWindowDays: clamp(pick('searchWindowDays', 'search_window_days'), 1, 30, 7),
    trackingWindowDays: clamp(pick('trackingWindowDays', 'tracking_window_days'), 1, 90, 30),
    maxTrackedVideos: clamp(pick('maxTrackedVideos', 'max_tracked_videos'), 0, 2000, 500),
    refreshTracked: Boolean(pick('refreshTracked', 'refresh_tracked')),
  };
}

/** Work out which API calls a run will make and estimate the quota cost (upper bound). */
export function buildPlan(options) {
  const calls = [];
  for (const region of options.regions) {
    for (const key of options.categories) {
      const cat = CATEGORIES.find((c) => c.key === key);
      for (const id of cat.youtubeCategoryIds) calls.push({ type: 'chart', region, category: key, videoCategoryId: id });
      for (const q of cat.queries.slice(0, options.searchesPerCategory))
        calls.push({ type: 'search', region, category: key, query: q });
    }
  }
  const charts = calls.filter((c) => c.type === 'chart').length;
  const searches = calls.length - charts;

  let tracked = 0;
  if (options.refreshTracked) {
    const cutoff = new Date(Date.now() - options.trackingWindowDays * DAY_MS).toISOString();
    const n = db.prepare('SELECT COUNT(*) AS n FROM videos WHERE published_at >= ?').get(cutoff).n;
    tracked = Math.min(n, options.maxTrackedVideos);
  }

  const estimatedUnits =
    charts * COSTS['videos.list'] +
    searches * (COSTS['search.list'] + COSTS['videos.list']) +
    Math.ceil(tracked / 50) * COSTS['videos.list'] +
    options.regions.length * COSTS['videoCategories.list'] +
    (charts + searches) * COSTS['channels.list'];

  return { calls, counts: { chart: charts, search: searches, tracked }, estimatedUnits };
}

export function startCollection(input = {}, trigger = 'manual') {
  if (collectionState.running) throw httpError(409, 'A collection is already running.');
  if (!config.youtubeKey) throw httpError(400, 'YOUTUBE_API_KEY is missing. Add it to .env and restart the server.');

  const options = resolveOptions(input);
  const plan = buildPlan(options);
  const quota = getQuotaStatus();
  if (quota.available <= 0)
    throw httpError(429, `Daily quota budget used up (${quota.used}/${quota.limit} units). Resets at midnight Pacific Time.`);

  const runId = Number(
    db.prepare('INSERT INTO collection_runs (started_at, status, trigger, options) VALUES (?, ?, ?, ?)')
      .run(nowIso(), 'running', trigger, JSON.stringify({ options, counts: plan.counts, estimatedUnits: plan.estimatedUnits }))
      .lastInsertRowid
  );
  Object.assign(collectionState, { running: true, runId, step: 'starting', message: 'Starting…', startedAt: nowIso() });
  execute(runId, plan, options); // runs in background; handles its own errors
  return { runId, estimatedUnits: plan.estimatedUnits };
}

async function execute(runId, plan, options) {
  const unitsBefore = getQuotaStatus().used;
  const found = new Map();   // videoId -> normalized video + fetchedAt
  const sources = [];
  const errors = [];
  let aborted = false;
  let fatal = null;
  let result = { newVideos: 0, snapshots: 0 };

  const step = (s, m) => { collectionState.step = s; collectionState.message = m; };
  // Run one API task; a quota error stops the run, other errors are logged and skipped.
  const safe = async (label, fn) => {
    if (aborted) return;
    try { await fn(); }
    catch (e) {
      const quota = e instanceof QuotaExceededError;
      if (quota) aborted = true;
      errors.push({ label, type: quota ? 'quota' : 'api', message: e.message });
    }
  };

  try {
    // 1. Video categories
    for (const region of options.regions) {
      step('categories', `Video categories (${region})`);
      await safe(`categories ${region}`, () => refreshCategories(region));
    }

    // 2. Most-popular charts (not available in every region)
    for (const call of plan.calls.filter((c) => c.type === 'chart')) {
      step('charts', `Most popular: ${call.region} / ${call.category}`);
      await safe(`chart ${call.region}/${call.category}`, async () => {
        const items = await yt.fetchMostPopular({ regionCode: call.region, videoCategoryId: call.videoCategoryId });
        const fetchedAt = nowIso();
        items.forEach((v, i) => {
          found.set(v.id, { ...v, fetchedAt });
          sources.push({ videoId: v.id, regionCode: call.region, categoryKey: call.category, source: 'most_popular', query: '', rank: i + 1 });
        });
      });
    }

    // 3. Re-snapshot tracked videos (cheap: 1 unit per 50 videos)
    if (options.refreshTracked && options.maxTrackedVideos > 0) {
      step('tracked', 'Refreshing tracked videos');
      await safe('tracked refresh', async () => {
        const cutoff = new Date(Date.now() - options.trackingWindowDays * DAY_MS).toISOString();
        const ids = db.prepare(
          `SELECT v.id FROM videos v WHERE v.published_at >= ?
           ORDER BY (SELECT MAX(captured_at) FROM video_snapshots WHERE video_id = v.id) ASC LIMIT ?`
        ).all(cutoff, options.maxTrackedVideos).map((r) => r.id).filter((id) => !found.has(id));
        if (!ids.length) return;
        const items = await yt.fetchVideosByIds(ids);
        const fetchedAt = nowIso();
        for (const v of items) found.set(v.id, { ...v, fetchedAt });
        const missing = ids.length - items.length; // deleted, private, or unavailable
        if (missing > 0) errors.push({ label: 'tracked refresh', type: 'info', message: `${missing} tracked videos no longer available.` });
      });
    }

    // 4. Keyword searches (100 units each)
    for (const call of plan.calls.filter((c) => c.type === 'search')) {
      step('search', `Search: "${call.query}" (${call.region})`);
      await safe(`search ${call.region}/${call.query}`, async () => {
        const publishedAfter = new Date(Date.now() - options.searchWindowDays * DAY_MS).toISOString();
        const ids = await yt.searchVideoIds({ query: call.query, regionCode: call.region, publishedAfter });
        const newIds = ids.filter((id) => !found.has(id));
        const details = newIds.length ? await yt.fetchVideosByIds(newIds) : [];
        const fetchedAt = nowIso();
        const byId = new Map(details.map((v) => [v.id, v]));
        ids.forEach((id, i) => {
          if (byId.has(id)) found.set(id, { ...byId.get(id), fetchedAt });
          if (!found.has(id)) return;
          sources.push({ videoId: id, regionCode: call.region, categoryKey: call.category, source: 'search', query: call.query, rank: i + 1 });
        });
      });
    }

    // 5. Save everything we got, even after a quota cut-off
    step('saving', 'Saving videos and snapshots');
    result = persist(runId, found, sources);

    // 6. Channel details
    step('channels', 'Fetching channel details');
    await safe('channels', () => refreshChannels([...new Set([...found.values()].map((v) => v.channelId))]));
  } catch (e) {
    fatal = e;
    errors.push({ label: 'internal', type: 'internal', message: e.message });
    console.error(e);
  }

  const status = fatal ? 'failed' : aborted ? 'partial' : found.size === 0 && errors.some((e) => e.type !== 'info') ? 'failed' : 'completed';
  db.prepare(
    `UPDATE collection_runs SET finished_at = ?, status = ?, videos_found = ?, new_videos = ?,
       snapshots_created = ?, quota_used = ?, errors = ? WHERE id = ?`
  ).run(nowIso(), status, found.size, result.newVideos, result.snapshots, getQuotaStatus().used - unitsBefore, JSON.stringify(errors), runId);

  Object.assign(collectionState, { running: false, step: 'idle', message: `Run #${runId} ${status}` });
  
  if (status !== 'failed' && found.size > 0 && getSetting('auto_analyze')) {
    try { startAnalysis(); } catch (e) { console.error('Auto-analysis skipped:', e.message); }
  }
}

function persist(runId, found, sources) {
  const now = nowIso();
  const firstCategory = new Map();
  for (const s of sources) if (!firstCategory.has(s.videoId)) firstCategory.set(s.videoId, s.categoryKey);

  const insertChannel = db.prepare(
    `INSERT INTO channels (id, title, first_seen_at, updated_at) VALUES (@id, @title, @now, @now) ON CONFLICT(id) DO NOTHING`
  );
  const exists = db.prepare('SELECT 1 FROM videos WHERE id = ?');
  const upsertVideo = db.prepare(
    `INSERT INTO videos (id, channel_id, title, description, published_at, category_id, primary_category, thumbnail_url,
       url, duration_seconds, tags, default_language, first_seen_at, last_seen_at)
     VALUES (@id, @channelId, @title, @description, @publishedAt, @categoryId, @primaryCategory, @thumbnailUrl,
       @url, @durationSeconds, @tags, @defaultLanguage, @now, @now)
     ON CONFLICT(id) DO UPDATE SET title = excluded.title, description = excluded.description,
       category_id = excluded.category_id, thumbnail_url = excluded.thumbnail_url,
       duration_seconds = excluded.duration_seconds, tags = excluded.tags,
       primary_category = COALESCE(videos.primary_category, excluded.primary_category),
       last_seen_at = excluded.last_seen_at`
  );
  const lastSnapshot = db.prepare('SELECT captured_at, view_count FROM video_snapshots WHERE video_id = ? ORDER BY captured_at DESC LIMIT 1');
  const insertSnapshot = db.prepare(
    `INSERT OR IGNORE INTO video_snapshots (video_id, run_id, captured_at, view_count, like_count, comment_count,
       views_gained, hours_since_prev, views_per_hour, views_per_day, engagement_rate, video_age_hours, velocity_basis)
     VALUES (@videoId, @runId, @capturedAt, @viewCount, @likeCount, @commentCount,
       @viewsGained, @hoursSincePrev, @viewsPerHour, @viewsPerDay, @engagementRate, @videoAgeHours, @velocityBasis)`
  );
  const insertSource = db.prepare(
    `INSERT OR IGNORE INTO video_sources (video_id, run_id, region_code, category_key, source, query, rank)
     VALUES (@videoId, @runId, @regionCode, @categoryKey, @source, @query, @rank)`
  );

  let newVideos = 0;
  let snapshots = 0;
  db.transaction(() => {
    for (const v of found.values()) {
      if (!exists.get(v.id)) newVideos++;
      insertChannel.run({ id: v.channelId, title: v.channelTitle, now });
      upsertVideo.run({ ...v, primaryCategory: firstCategory.get(v.id) ?? null, now });

      const metrics = computeSnapshotMetrics({
        current: v, previous: lastSnapshot.get(v.id) ?? null, publishedAt: v.publishedAt, capturedAt: v.fetchedAt,
      });
      snapshots += insertSnapshot.run({
        videoId: v.id, runId, capturedAt: v.fetchedAt,
        viewCount: v.viewCount, likeCount: v.likeCount, commentCount: v.commentCount, ...metrics,
      }).changes;
    }
    for (const s of sources) insertSource.run({ ...s, runId });
  })();
  return { newVideos, snapshots };
}

async function refreshCategories(region) {
  const cutoff = new Date(Date.now() - CATEGORY_REFRESH_DAYS * DAY_MS).toISOString();
  const last = db.prepare('SELECT MAX(fetched_at) AS t FROM video_categories WHERE region_code = ?').get(region).t;
  if (last && last > cutoff) return;
  const cats = await yt.fetchVideoCategories(region);
  const up = db.prepare(
    `INSERT INTO video_categories (id, region_code, title, assignable, fetched_at) VALUES (@id, @region, @title, @assignable, @now)
     ON CONFLICT(id, region_code) DO UPDATE SET title = excluded.title, assignable = excluded.assignable, fetched_at = excluded.fetched_at`
  );
  const now = nowIso();
  db.transaction(() => cats.forEach((c) => up.run({ ...c, region, now })))();
}

async function refreshChannels(ids) {
  const cutoff = new Date(Date.now() - CHANNEL_REFRESH_DAYS * DAY_MS).toISOString();
  const get = db.prepare('SELECT details_fetched_at FROM channels WHERE id = ?');
  const stale = ids.filter((id) => {
    const r = get.get(id);
    return !r || !r.details_fetched_at || r.details_fetched_at < cutoff;
  });
  if (!stale.length) return;
  const channels = await yt.fetchChannelsByIds(stale);
  const now = nowIso();
  const update = db.prepare(
    `UPDATE channels SET title = @title, description = @description, custom_url = @customUrl, country = @country,
       thumbnail_url = @thumbnailUrl, subscriber_count = @subscriberCount, view_count = @viewCount,
       video_count = @videoCount, details_fetched_at = @now, updated_at = @now WHERE id = @id`
  );
  db.transaction(() => channels.forEach((c) => update.run({ ...c, now })))();
}