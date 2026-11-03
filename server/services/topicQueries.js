import { db } from '../database/db.js';
import { parseMeta } from './analysis.js';
import { trendDirection } from './scoring.js';

function shape(r) {
  const c = JSON.parse(r.components);
  const item = {
    id: r.id,
    name: r.name,
    category: r.category,
    score: r.score,
    confidence: r.confidence,
    status: r.trend_status,
    computedAt: r.computed_at,
    firstDetectedAt: r.first_detected_at,
    latestPublished: r.latest_published,
    videoCount: c.stats.videoCount,
    channelCount: c.stats.channelCount,
    totalViews: c.stats.totalViews,
    shortCount: c.stats.shortCount ?? null, // null for scores computed before video types existed
    longCount: c.stats.longCount ?? null,
    growthRate: c.metrics.trend_momentum.detail.growthRate,
    momentumBasis: c.metrics.trend_momentum.basis,
    competitionLevel: c.stats.competitionLevel,
    flags: c.flags,
    terms: parseMeta(r.keywords).terms ?? [],
    namedBy: parseMeta(r.keywords).named_by ?? 'keywords',
  };
  item.direction = trendDirection(item);
  return item;
}

/** Latest score for every topic that currently has videos. `region` keeps topics with at least one video seen in that country. */
export function latestTopics({ region = null } = {}) {
  return db.prepare(`
    SELECT t.id, t.name, t.category, t.keywords, t.first_detected_at,
           ts.score, ts.confidence, ts.trend_status, ts.components, ts.computed_at,
           (SELECT MAX(v.published_at) FROM topic_videos tv JOIN videos v ON v.id = tv.video_id
             WHERE tv.topic_id = t.id) AS latest_published
    FROM topics t
    JOIN trend_scores ts ON ts.id = (SELECT MAX(id) FROM trend_scores WHERE topic_id = t.id)
    WHERE EXISTS (
      SELECT 1 FROM topic_videos tv WHERE tv.topic_id = t.id
        AND (@region IS NULL OR EXISTS (
          SELECT 1 FROM video_sources vs WHERE vs.video_id = tv.video_id AND vs.region_code = @region)))
  `).all({ region }).map(shape);
}