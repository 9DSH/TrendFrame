import { CATEGORIES } from '../config.js';
import { DEFAULT_SETTINGS, getSetting } from '../database/db.js';
import { DEFAULT_PARAMS } from './scoring.js';

const TYPES = [['both', 'Both (Shorts and long)'], ['short', 'Shorts only'], ['long', 'Long videos only']];
const P = 'scoring_params';

export const FIELDS = [
  // ---- collection ----
  { group: 'collection', key: 'regions', type: 'list', label: 'Countries', help: 'Two-letter country codes, comma separated (US, GB, DE). Every country adds its own chart and search calls, so quota use grows with the list.' },
  { group: 'collection', key: 'categories', type: 'categories', label: 'Categories', help: 'Which of the 10 categories are collected.' },
  { group: 'collection', key: 'video_type', type: 'enum', options: TYPES, label: 'Video types to collect', help: 'Videos of the other kind are dropped before saving. Most-popular charts rarely contain Shorts, so "Shorts only" mostly relies on keyword searches.' },
  { group: 'collection', key: 'short_max_seconds', type: 'int', min: 30, max: 600, step: 5, unit: 's', label: 'Shorts: longest length', help: 'YouTube\'s API has no Short flag, so a video counts as a Short when it is at most this long. Shorts can be up to 180 s, but 60 avoids labelling ordinary short clips as Shorts. Live streams are "unknown". Applies to filters and statistics immediately.' },
  { group: 'collection', key: 'searches_per_category', type: 'int', min: 0, max: 2, label: 'Keyword searches per category', help: 'Each search costs 100 quota units. 0 = charts and tracking only (cheapest).' },
  { group: 'collection', key: 'search_window_days', type: 'int', min: 1, max: 30, unit: 'days', label: 'Search window', help: 'Keyword searches only return videos published within this many days.' },
  { group: 'collection', key: 'tracking_window_days', type: 'int', min: 1, max: 90, unit: 'days', label: 'Tracking window', help: 'Videos published within this many days are re-checked on every collection to measure growth. Older videos stop being tracked.' },
  { group: 'collection', key: 'max_tracked_videos', type: 'int', min: 0, max: 2000, label: 'Max re-checked videos per run', help: 'Caps how many tracked videos are refreshed per run. Costs 1 quota unit per 50 videos.' },
  { group: 'collection', key: 'refresh_tracked', type: 'bool', label: 'Re-snapshot tracked videos', help: 'Builds growth history. Turn off only to save quota.' },
  { group: 'collection', key: 'daily_quota_limit', type: 'int', min: 100, max: 1000000, unit: 'units', label: 'Daily quota (display only)', help: 'Used for the usage bar and cost estimates. Google enforces the real limit (10,000 by default).' },

  // ---- analysis ----
  { group: 'analysis', key: 'analysis_video_type', type: 'enum', options: TYPES, label: 'Video types to analyse', help: 'Only this kind of video is clustered and scored. Topic pages show the result of the latest analysis, so run the analysis again after changing it.' },
  { group: 'analysis', key: 'analysis_window_days', type: 'int', min: 1, max: 90, unit: 'days', label: 'Analysis window', help: 'Only videos published within this many days are grouped into topics.' },
  { group: 'analysis', key: 'similarity_threshold', type: 'float', min: 0.05, max: 0.9, step: 0.01, label: 'Similarity threshold', help: 'How alike two videos must be to share a topic. Higher = stricter, smaller topics. Lower = looser, bigger topics. Raise it if unrelated videos get grouped; lower it if obvious same-story videos are split.' },
  { group: 'analysis', key: 'merge_threshold', type: 'float', min: 0.3, max: 0.95, step: 0.01, label: 'Topic merge threshold', help: 'Two topics in the same category are merged when their similarity is above this. Higher = fewer merges.' },
  { group: 'analysis', key: 'min_topic_videos', type: 'int', min: 2, max: 20, label: 'Minimum videos per topic', help: 'Groups smaller than this are not treated as a topic.' },
  { group: 'analysis', key: 'min_topic_channels', type: 'int', min: 1, max: 20, label: 'Minimum channels per topic', help: 'A topic needs videos from at least this many channels, so one channel\'s series is not mistaken for a trend.' },
  { group: 'analysis', key: 'auto_analyze', type: 'bool', label: 'Analyse after each collection', help: 'Runs the analysis automatically when a collection finishes.' },
  { group: 'analysis', key: 'ai_topic_labeling', type: 'bool', label: 'Name topics with OpenAI', help: 'Sends video titles and channel names to OpenAI to name topics and flag mixed clusters. Needs OPENAI_API_KEY and costs a little per run.' },

  // ---- metric inputs ----
  { group: 'metrics', key: 'high_opportunity_score', type: 'int', min: 30, max: 95, label: 'High-opportunity: minimum score', help: 'Dashboard counts a topic as "high-opportunity" at or above this score. Applies immediately.' },
  { group: 'metrics', key: 'high_opportunity_min_confidence', type: 'float', min: 0, max: 1, step: 0.05, label: 'High-opportunity: minimum confidence', help: 'And only if data confidence is at least this (0.4 = 40%). Applies immediately.' },
  { group: 'metrics', setting: P, key: 'decay_exponent', type: 'float', min: 0.2, max: 1.2, step: 0.05, label: 'Growth decay exponent', help: 'Assumption behind trend momentum: a video\'s cumulative views grow like age^exponent. Lower = views are expected to flatten sooner, so ongoing gains count as stronger growth.' },
  { group: 'metrics', setting: P, key: 'min_pair_gap_hours', type: 'float', min: 1, max: 48, step: 0.5, unit: 'h', label: 'Minimum gap between snapshots', help: 'Two snapshots must be at least this far apart to measure growth. Shorter gaps are noisy.' },
  { group: 'metrics', setting: P, key: 'min_base_age_hours', type: 'float', min: 0.5, max: 48, step: 0.5, unit: 'h', label: 'Minimum video age for growth', help: 'Videos younger than this at the earlier snapshot are ignored for momentum, because early growth is too erratic.' },
  { group: 'metrics', setting: P, key: 'declining_ratio', type: 'float', min: 0.1, max: 1, step: 0.05, label: 'Declining below (growth ratio)', help: 'Growth ratio 1 = as expected for the age. At or below this, a topic with measured data is labelled "Declining".' },
  { group: 'metrics', setting: P, key: 'growing_ratio', type: 'float', min: 1, max: 5, step: 0.1, label: 'Rapidly growing above (growth ratio)', help: 'At or above this ratio a topic is labelled "Rapidly growing".' },
  { group: 'metrics', setting: P, key: 'emerging_max_age_days', type: 'int', min: 1, max: 30, unit: 'days', label: 'Emerging: maximum age', help: 'A topic whose oldest video is younger than this (and has 2+ channels) can be labelled "Emerging".' },
  { group: 'metrics', setting: P, key: 'saturated_min_videos', type: 'int', min: 3, max: 100, label: 'Saturated: minimum videos', help: 'A topic needs at least this many videos before it can be "Saturated".' },
  { group: 'metrics', setting: P, key: 'saturated_competition', type: 'int', min: 5, max: 90, label: 'Saturated: competition score below', help: 'And a competition-opportunity score below this (crowded) for it to be "Saturated".' },
  { group: 'metrics', setting: P, key: 'competition_low_from', type: 'int', min: 50, max: 95, label: 'Low competition from (score)', help: 'Competition-opportunity score at or above this = "low" competition.' },
  { group: 'metrics', setting: P, key: 'competition_medium_from', type: 'int', min: 10, max: 70, label: 'Medium competition from (score)', help: 'At or above this (and below the low limit) = "medium". Below = "high" competition.' },
  { group: 'metrics', setting: P, key: 'big_channel_subs', type: 'int', min: 10000, max: 50000000, step: 10000, label: 'Big channel: subscribers', help: 'Channels with at least this many subscribers count as "big" when measuring how much of a topic\'s views they hold.' },
  { group: 'metrics', setting: P, key: 'velocity_top_n', type: 'int', min: 1, max: 20, label: 'Velocity: top videos counted', help: 'View velocity adds up views/hour of a topic\'s N fastest videos.' },
];

const bad = (m) => Object.assign(new Error(m), { status: 400 });
const TOP = new Map(FIELDS.filter((f) => !f.setting).map((f) => [f.key, f]));
const PARAMS = new Map(FIELDS.filter((f) => f.setting === P).map((f) => [f.key, f]));

function checkValue(f, v) {
  switch (f.type) {
    case 'bool':
      if (typeof v !== 'boolean') throw bad(`${f.label} must be on or off.`);
      return v;
    case 'enum':
      if (!f.options.some(([o]) => o === v)) throw bad(`${f.label}: choose one of the listed options.`);
      return v;
    case 'int':
    case 'float': {
      const n = v === '' || v == null ? NaN : Number(v);
      if (!Number.isFinite(n) || (f.type === 'int' && !Number.isInteger(n)) || n < f.min || n > f.max)
        throw bad(`${f.label} must be ${f.type === 'int' ? 'a whole number' : 'a number'} between ${f.min} and ${f.max}.`);
      return n;
    }
    case 'list': {
      const arr = [...new Set((Array.isArray(v) ? v : String(v).split(',')).map((x) => String(x).trim().toUpperCase()).filter(Boolean))];
      if (!arr.length || arr.some((x) => !/^[A-Z]{2}$/.test(x))) throw bad('Countries must be two-letter codes such as US, GB or DE.');
      return arr;
    }
    case 'categories': {
      const valid = CATEGORIES.map((c) => c.key);
      if (!Array.isArray(v) || !v.length || v.some((k) => !valid.includes(k))) throw bad('Choose at least one valid category.');
      return [...new Set(v)];
    }
    default: throw bad(`Unsupported field ${f.key}`);
  }
}

function validateParams(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw bad('scoring_params must be an object.');
  const merged = { ...DEFAULT_PARAMS, ...(getSetting(P) ?? {}) };
  for (const [k, val] of Object.entries(v)) {
    const f = PARAMS.get(k);
    if (!f) throw bad(`Unknown metric input: ${k}`);
    merged[k] = checkValue(f, val);
  }
  if (merged.declining_ratio >= merged.growing_ratio) throw bad('"Declining below" must be lower than "Rapidly growing above".');
  if (merged.competition_medium_from >= merged.competition_low_from) throw bad('"Medium competition from" must be lower than "Low competition from".');
  return merged;
}

/** Validates a settings patch and returns the cleaned values. Throws a 400 error on the first problem. */
export function validateSettingsPatch(patch) {
  const out = {};
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'scoring_weights') throw bad('Use PUT /api/scoring/weights');
    if (k === P) { out[k] = validateParams(v); continue; }
    if (!(k in DEFAULT_SETTINGS)) throw bad(`Unknown setting: ${k}`);
    const f = TOP.get(k);
    if (f) out[k] = checkValue(f, v);
    else if (typeof v !== typeof DEFAULT_SETTINGS[k]) throw bad(`Invalid value type for ${k}`);
    else out[k] = v;
  }
  const minV = out.min_topic_videos ?? getSetting('min_topic_videos');
  const minC = out.min_topic_channels ?? getSetting('min_topic_channels');
  if (minC > minV) throw bad('Minimum channels per topic cannot exceed minimum videos per topic.');
  return out;
}