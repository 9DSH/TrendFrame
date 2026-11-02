import { config } from '../config.js';
import { chargeQuota, markQuotaExhausted, QuotaExceededError } from './quota.js';

const BASE = 'https://www.googleapis.com/youtube/v3';

export class YouTubeApiError extends Error {
  constructor(message, { status = 0, reason = 'unknown' } = {}) {
    super(message);
    this.name = 'YouTubeApiError';
    this.status = status;
    this.reason = reason;
  }
}

const HINTS = {
  keyInvalid: 'The API key is invalid. Check YOUTUBE_API_KEY in .env.',
  accessNotConfigured: 'YouTube Data API v3 is not enabled for the key\'s Google Cloud project.',
  videoChartNotFound: 'Most-popular chart is not available for this region/category.',
};

async function call(endpoint, params) {
  if (!config.youtubeKey) throw new YouTubeApiError('YOUTUBE_API_KEY is missing in .env', { reason: 'missingKey' });
  // chargeQuota(endpoint);

  const url = new URL(`${BASE}/${endpoint.split('.')[0]}`);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) url.searchParams.set(k, v);
  url.searchParams.set('key', config.youtubeKey);

  let res;
  try {
    res = await fetch(url);
  } catch (e) {
   // refundQuota(endpoint);   // add to quota.js: UPDATE quota_usage SET units = MAX(units - cost, 0)
    throw new YouTubeApiError(`Network error: ${e.message}`, { reason: 'network' });
    }
  chargeQuota(endpoint);   // <-- here: Google answered, so the units are spent
  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    const reason = body.error?.errors?.[0]?.reason ?? body.error?.status ?? 'unknown';
    if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') {
      markQuotaExhausted();
      throw new QuotaExceededError('YouTube reports the daily API quota is exhausted. It resets at midnight Pacific Time.');
    }
    const hint = HINTS[reason] ?? body.error?.message ?? res.statusText;
    throw new YouTubeApiError(`YouTube API ${res.status} (${reason}): ${hint}`, { status: res.status, reason });
  }
  return body;
}

const toInt = (v) => (v === undefined || v === null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);

export function parseIsoDuration(iso) {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(iso || '');
  if (!m) return null;
  const [, d = 0, h = 0, mi = 0, s = 0] = m;
  return ((Number(d) * 24 + Number(h)) * 60 + Number(mi)) * 60 + Number(s);
}

export function normalizeVideo(item) {
  const sn = item.snippet ?? {};
  const st = item.statistics ?? {};
  const th = sn.thumbnails ?? {};
  return {
    id: item.id,
    channelId: sn.channelId ?? null,
    channelTitle: sn.channelTitle ?? 'Unknown channel',
    title: sn.title ?? '(untitled)',
    description: sn.description ?? null,
    publishedAt: sn.publishedAt ?? null,
    categoryId: sn.categoryId ?? null,
    thumbnailUrl: (th.maxres ?? th.high ?? th.medium ?? th.default)?.url ?? null,
    url: `https://www.youtube.com/watch?v=${item.id}`,
    durationSeconds: parseIsoDuration(item.contentDetails?.duration),
    tags: JSON.stringify(sn.tags ?? []),
    defaultLanguage: sn.defaultAudioLanguage ?? sn.defaultLanguage ?? null,
    viewCount: toInt(st.viewCount) ?? 0,
    likeCount: toInt(st.likeCount),       // null when hidden
    commentCount: toInt(st.commentCount), // null when disabled
  };
}

const usable = (v) => v.channelId && v.publishedAt;

export async function fetchMostPopular({ regionCode, videoCategoryId, maxResults = 50 }) {
  const data = await call('videos.list', {
    part: 'snippet,statistics,contentDetails',
    chart: 'mostPopular',
    regionCode,
    videoCategoryId,
    maxResults,
  });
  return (data.items ?? []).map(normalizeVideo).filter(usable);
}

export async function searchVideoIds({ query, regionCode, publishedAfter, maxResults = 50 }) {
  const data = await call('search.list', {
    part: 'snippet',
    type: 'video',
    q: query,
    order: 'viewCount',
    regionCode,
    publishedAfter,
    maxResults,
  });
  return (data.items ?? []).map((i) => i.id?.videoId).filter(Boolean);
}

export async function fetchVideosByIds(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 50) {
    // maxResults is not allowed together with id
    const data = await call('videos.list', {
      part: 'snippet,statistics,contentDetails',
      id: ids.slice(i, i + 50).join(','),
    });
    out.push(...(data.items ?? []).map(normalizeVideo).filter(usable));
  }
  return out;
}

export async function fetchChannelsByIds(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 50) {
    const data = await call('channels.list', { part: 'snippet,statistics', id: ids.slice(i, i + 50).join(',') });
    for (const c of data.items ?? []) {
      const th = c.snippet?.thumbnails ?? {};
      out.push({
        id: c.id,
        title: c.snippet?.title ?? 'Unknown channel',
        description: c.snippet?.description ?? null,
        customUrl: c.snippet?.customUrl ?? null,
        country: c.snippet?.country ?? null,
        thumbnailUrl: (th.medium ?? th.default)?.url ?? null,
        subscriberCount: c.statistics?.hiddenSubscriberCount ? null : toInt(c.statistics?.subscriberCount),
        viewCount: toInt(c.statistics?.viewCount),
        videoCount: toInt(c.statistics?.videoCount),
      });
    }
  }
  return out;
}

export async function fetchVideoCategories(regionCode) {
  const data = await call('videoCategories.list', { part: 'snippet', regionCode });
  return (data.items ?? []).map((c) => ({
    id: c.id,
    title: c.snippet?.title ?? c.id,
    assignable: c.snippet?.assignable ? 1 : 0,
  }));
}