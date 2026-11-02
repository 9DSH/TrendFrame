import { tokenize } from './text.js';

const H = 3_600_000;
const D = 86_400_000;

export const METRIC_KEYS = [
  'trend_momentum', 'view_velocity', 'engagement', 'cross_channel', 'competition', 'long_term', 'animation_potential',
];

// ASSUMPTION: typical cumulative views grow like age^0.6 (fast early, slowing later).
export const DECAY_EXPONENT = 0.6;
export const MIN_PAIR_GAP_HOURS = 3;
export const MIN_BASE_AGE_HOURS = 2;
export const THRESHOLDS = {
  declining: 0.7, growing: 1.5, emergingMaxAgeDays: 5, saturatedMinVideos: 10, saturatedCompetition: 35,
};
const BIG_CHANNEL_SUBS = 1_000_000;

const CATEGORY_PRIOR = {
  tech_ai: 45, business: 35, finance: 30, geopolitics: 70, history: 80,
  entertainment: 40, science: 65, gaming: 45, sports: 40, nature: 70,
};
const VISUAL_TERMS = new Set(`war wars battle battles empire ancient history historic map border borders invasion revolution
  treaty dynasty pyramid pyramids castle kingdom ship ships submarine navy fleet mission rocket space satellite moon mars
  planet asteroid volcano earthquake tsunami hurricane storm flood ocean island expedition mountain glacier arctic
  antarctic jungle desert river dinosaur fossil discovery treasure heist collapse crisis explosion crash disaster plane
  train bridge tunnel city spy secret mystery lost conflict strait canal pipeline coast sea`.split(/\s+/));

const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const round1 = (v) => Math.round(v * 10) / 10;
const round3 = (v) => Math.round(v * 1000) / 1000;
const median = (a) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function validateWeights(w) {
  const bad = (m) => Object.assign(new Error(m), { status: 400 });
  if (!w || typeof w !== 'object') throw bad('weights must be an object');
  const out = {};
  for (const k of METRIC_KEYS) {
    const v = Number(w[k]);
    if (!Number.isFinite(v) || v < 0 || v > 100) throw bad(`Weight "${k}" must be a number between 0 and 100`);
    out[k] = v;
  }
  if (Object.values(out).reduce((a, b) => a + b, 0) <= 0) throw bad('At least one weight must be above 0');
  return out;
}

/** Rank 0-100 with ties averaged; nulls stay null. */
export function percentileRanks(values) {
  const valid = values.filter((v) => v != null && Number.isFinite(v));
  const n = valid.length;
  return values.map((v) => {
    if (v == null || !Number.isFinite(v)) return null;
    if (n === 1) return 50;
    let less = 0, equal = 0;
    for (const x of valid) { if (x < v) less++; else if (x === v) equal++; }
    return ((less + 0.5 * equal) / n) * 100;
  });
}

/**
 * Actual view gain between the latest snapshot and an earlier one (>= 3 h older), compared with the gain
 * an average video of the same age would be expected to make under the age^DECAY_EXPONENT model.
 */
export function growthPair(snapshots, publishedMs) {
  if (!snapshots || snapshots.length < 2) return null;
  const last = snapshots[snapshots.length - 1];
  const lastMs = Date.parse(last.captured_at);
  let prev = null;
  for (let i = snapshots.length - 2; i >= 0; i--) {
    if ((lastMs - Date.parse(snapshots[i].captured_at)) / H >= MIN_PAIR_GAP_HOURS) { prev = snapshots[i]; break; }
  }
  if (!prev) return null;
  const a1 = (Date.parse(prev.captured_at) - publishedMs) / H;
  const a2 = (lastMs - publishedMs) / H;
  if (!(a1 >= MIN_BASE_AGE_HOURS) || prev.view_count <= 0) return null;
  const actual = last.view_count - prev.view_count;
  if (actual < 0) return null; // view correction, not growth
  const expected = prev.view_count * (Math.pow(a2 / a1, DECAY_EXPONENT) - 1);
  if (!(expected > 0)) return null;
  return { actual, expected, hours: a2 - a1 };
}

// ratio 1 (= as expected for its age) -> 50; 2x -> ~79; 0.5x -> ~21
export const momentumScore = (ratio) => 50 + 50 * Math.tanh(Math.log2(ratio) / 1.5);

export function applyWeights(metrics, weights) {
  let sumW = 0;
  for (const k of METRIC_KEYS) if (metrics[k]?.value != null) sumW += weights[k];
  const contributions = {};
  let total = 0;
  for (const k of METRIC_KEYS) {
    const v = metrics[k]?.value;
    if (v == null || sumW <= 0) { contributions[k] = { weight: weights[k], effectiveWeight: 0, points: null, excluded: true }; continue; }
    const effectiveWeight = (weights[k] / sumW) * 100;
    const points = (v * weights[k]) / sumW;
    total += points;
    contributions[k] = { weight: weights[k], effectiveWeight, points: round3(points), excluded: false };
  }
  return { score: round1(total), contributions };
}

export function classifyStatus(s) {
  const { ratio, measured, videoCount, channelCount, oldestAgeDays, spanDays, competition, recentVideos } = s;
  if (measured && ratio <= THRESHOLDS.declining) return 'declining';
  if (videoCount >= THRESHOLDS.saturatedMinVideos && competition != null &&
      competition < THRESHOLDS.saturatedCompetition && (!measured || ratio < 1.2)) return 'saturated';
  if (oldestAgeDays <= THRESHOLDS.emergingMaxAgeDays && channelCount >= 2 && (!measured || ratio >= 1)) return 'emerging';
  if (measured ? ratio >= THRESHOLDS.growing : ratio >= 2 && recentVideos >= 3) return 'growing';
  if (spanDays >= 5) return 'sustained';
  return 'unclear';
}

/** Raw (un-normalised) numbers for one topic. `members` come from analysis.loadCorpus(). */
export function computeTopicRaw(topic, members, now = Date.now()) {
  const n = members.length;
  const channels = new Set(members.map((m) => m.channelId));
  const regions = new Set();
  members.forEach((m) => m.regions.forEach((r) => regions.add(r)));

  // momentum
  let actual = 0, expected = 0, pairs = 0;
  for (const m of members) {
    const p = growthPair(m.snapshots, Date.parse(m.publishedAt));
    if (p) { actual += p.actual; expected += p.expected; pairs++; }
  }
  const age = (m) => now - Date.parse(m.publishedAt);
  const recentVideos = members.filter((m) => age(m) <= 3 * D).length;
  const previousVideos = members.filter((m) => age(m) > 3 * D && age(m) <= 6 * D).length;
  let momentumBasis, ratio;
  if (pairs >= 2 && expected > 0) { momentumBasis = 'snapshot_expected_growth'; ratio = clamp(actual / expected, 0.05, 20); }
  else { momentumBasis = 'publication_proxy'; ratio = clamp((recentVideos + 1) / (previousVideos + 1), 0.05, 20); }

  // velocity
  const vphs = members.map((m) => m.latest.viewsPerHour).filter((v) => v != null).sort((a, b) => b - a);
  const totalVph = vphs.reduce((a, b) => a + b, 0);
  const velocityRaw = vphs.length ? vphs.slice(0, 5).reduce((a, b) => a + b, 0) : null;
  const measuredShare = members.filter((m) => m.latest.velocityBasis === 'snapshot_delta').length / n;

  // engagement (views-weighted)
  const withEng = members.filter((m) => m.latest.engagementRate != null && m.latest.viewCount > 0);
  const engViews = withEng.reduce((a, m) => a + m.latest.viewCount, 0);
  const engagementRaw = withEng.length && engViews > 0
    ? withEng.reduce((a, m) => a + m.latest.engagementRate * m.latest.viewCount, 0) / engViews : null;

  // competition inputs
  const known = members.filter((m) => m.subscribers != null);
  let dominance = null;
  if (known.length / n >= 0.5) {
    const tv = known.reduce((a, m) => a + m.latest.viewCount, 0);
    const big = known.filter((m) => m.subscribers >= BIG_CHANNEL_SUBS).reduce((a, m) => a + m.latest.viewCount, 0);
    dominance = tv > 0 ? big / tv : 0;
  }

  // long-term
  const pubs = members.map((m) => Date.parse(m.publishedAt));
  const oldestAgeDays = (now - Math.min(...pubs)) / D;
  const spanDays = (Math.max(...pubs) - Math.min(...pubs)) / D;
  const publishDays = new Set(members.map((m) => m.publishedAt.slice(0, 10))).size;

  // animation heuristic
  const words = new Set(tokenize([topic.name, ...members.map((m) => m.title)].join(' ')));
  const hits = [...words].filter((w) => VISUAL_TERMS.has(w)).length;
  const lexicon = Math.min(100, hits * 15);
  const heuristic = 0.4 * (CATEGORY_PRIOR[topic.category] ?? 45) + 0.6 * lexicon;
  const ai = Number.isFinite(topic.ai?.animation_potential) ? topic.ai.animation_potential : null;

  // confidence
  const spans = members.map((m) => m.snapshots.length >= 2
    ? (Date.parse(m.snapshots.at(-1).captured_at) - Date.parse(m.snapshots[0].captured_at)) / H : 0);
  let confidence =
    0.25 * Math.min(n / 8, 1) + 0.30 * (pairs / n) + 0.20 * Math.min(median(spans) / 48, 1) +
    0.15 * Math.min(channels.size / 3, 1) + 0.10 * (known.length / n);
  if (topic.ai?.coherent === false) confidence *= 0.7;

  return {
    ratio, momentumBasis, pairs, recentVideos, previousVideos,
    velocityRaw, measuredShare, engagementRaw, supplyDemandRaw: vphs.length ? totalVph / n : null, dominance,
    crossChannelValue: Math.min(100,
      100 * (1 - Math.exp(-(channels.size - 1) / 3)) * 0.85 + 15 * (clamp(regions.size || 1, 1, 3) - 1) / 2),
    longTermValue: 60 * Math.min(1, spanDays / 14) + 40 * Math.min(1, publishDays / 7),
    animation: { heuristic, ai, hits, value: ai != null ? 0.5 * ai + 0.5 * heuristic : heuristic },
    confidence: Math.round(confidence * 100) / 100,
    aiIncoherent: topic.ai?.coherent === false,
    stats: {
      videoCount: n, channelCount: channels.size, regionCount: regions.size,
      oldestAgeDays: round1(oldestAgeDays), spanDays: round1(spanDays),
      totalViews: members.reduce((a, m) => a + m.latest.viewCount, 0),
    },
  };
}

/** Normalise across topics, build the metric breakdown, apply weights, classify status. */
export function finalizeScores(raws, weights) {
  const velPct = percentileRanks(raws.map((r) => r.velocityRaw));
  const engPct = percentileRanks(raws.map((r) => r.engagementRaw));
  const sdPct = percentileRanks(raws.map((r) => r.supplyDemandRaw));

  return raws.map((r, i) => {
    const measured = r.momentumBasis === 'snapshot_expected_growth';
    const competition = sdPct[i] == null ? null
      : r.dominance == null ? sdPct[i] : 0.6 * sdPct[i] + 0.4 * 100 * (1 - r.dominance);

    const metrics = {
      trend_momentum: {
        value: round1(momentumScore(r.ratio)), kind: 'estimated', basis: r.momentumBasis,
        note: measured
          ? `Measured view gains on ${r.pairs} videos vs. the gain expected for their age (decay exponent ${DECAY_EXPONENT}, an assumption).`
          : `No usable snapshot pairs yet. Proxy: ${r.recentVideos} videos published in the last 3 days vs ${r.previousVideos} in the 3 days before.`,
        detail: { ratio: round3(r.ratio), growthRate: round3(r.ratio - 1), pairs: r.pairs },
      },
      view_velocity: {
        value: velPct[i] == null ? null : round1(velPct[i]), kind: 'estimated',
        note: `Top-5 videos ≈ ${Math.round(r.velocityRaw ?? 0).toLocaleString('en-US')} views/hour; ${Math.round(r.measuredShare * 100)}% of videos have a snapshot-based rate. Ranked against other topics.`,
        detail: { viewsPerHour: r.velocityRaw, measuredShare: round3(r.measuredShare) },
      },
      engagement: {
        value: engPct[i] == null ? null : round1(engPct[i]), kind: 'measured',
        note: r.engagementRaw == null ? 'Likes/comments hidden or unavailable. Metric excluded.'
          : `Views-weighted (likes + comments) / views = ${(r.engagementRaw * 100).toFixed(2)}%. Ranked against other topics.`,
        detail: { rate: r.engagementRaw },
      },
      cross_channel: {
        value: round1(r.crossChannelValue), kind: 'measured',
        note: `${r.stats.channelCount} distinct channels across ${r.stats.regionCount || 1} region(s).`,
      },
      competition: {
        value: competition == null ? null : round1(competition), kind: 'estimated',
        note: r.dominance == null
          ? 'Demand per video only (subscriber counts incomplete). Higher = less crowded.'
          : `Demand per video, with ${Math.round(r.dominance * 100)}% of views on channels with 1M+ subscribers. Higher = less crowded.`,
        detail: { demandPerVideo: r.supplyDemandRaw, bigChannelViewShare: r.dominance },
      },
      long_term: {
        value: round1(r.longTermValue), kind: 'estimated',
        note: `Videos span ${r.stats.spanDays} days. Based on publication dates only.`,
      },
      animation_potential: {
        value: round1(r.animation.value), kind: 'heuristic',
        note: `Category prior + ${r.animation.hits} visual-story keywords${r.animation.ai != null ? ' + AI rating' : ''}. A heuristic, not a measurement.`,
      },
    };

    const { score, contributions } = applyWeights(metrics, weights);
    const status = classifyStatus({
      ratio: r.ratio, measured, videoCount: r.stats.videoCount, channelCount: r.stats.channelCount,
      oldestAgeDays: r.stats.oldestAgeDays, spanDays: r.stats.spanDays, competition, recentVideos: r.recentVideos,
    });
    const competitionLevel = competition == null ? 'unknown' : competition >= 65 ? 'low' : competition >= 40 ? 'medium' : 'high';

    const flags = [];
    if (competition != null && competition >= 65 && (metrics.view_velocity.value ?? 0) >= 50) flags.push('low_competition');
    if (r.stats.channelCount >= 3 && metrics.cross_channel.value >= 60) flags.push('cross_channel');
    if (status === 'saturated') flags.push('saturated');
    if (!measured) flags.push('proxy_momentum');
    if (r.confidence < 0.4) flags.push('low_confidence');
    if (r.aiIncoherent) flags.push('needs_review');

    return {
      score, confidence: r.confidence, status, weights,
      components: { metrics, contributions, stats: { ...r.stats, competitionLevel }, flags },
    };
  });
}

/** Direction of a topic's trend, used for the arrows in the UI. Declining status always wins. */
export function trendDirection({ status, growthRate }) {
  if (status === 'declining') return 'down';
  if (growthRate == null) return 'flat';
  if (growthRate > 0.15) return 'up';
  if (growthRate < -0.15) return 'down';
  return 'flat';
}