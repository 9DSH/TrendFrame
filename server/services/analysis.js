import { db, getSetting } from '../database/db.js';
import { config } from '../config.js';
import { buildVectors, toRawDoc, cosine, centroid, topTerms, sharesEnough, nameFromTerms, slugify } from './text.js';
import { pairSimilarities, agglomerate } from './clustering.js';
import { computeTopicRaw, finalizeScores, applyWeights } from './scoring.js';
import { labelTopics } from './aiLabeler.js';

const DAY_MS = 86_400_000;
const MERGE_THRESHOLD = 0.6;
const MAX_VIDEOS = 3000;
const MAX_AI_TOPICS = 24;
const nowIso = () => new Date().toISOString();
const httpError = (status, message) => Object.assign(new Error(message), { status });

export const analysisState = { running: false, step: 'idle', message: 'Idle', startedAt: null, warnings: [], lastResult: null };

export function parseMeta(json) {
  try { return JSON.parse(json) || {}; } catch { return {}; }
}

// ---------- loading ----------
function loadCorpus(windowDays) {
  const cutoff = new Date(Date.now() - windowDays * DAY_MS).toISOString();
  const rows = db.prepare(`
    SELECT v.id, v.channel_id, v.title, v.description, v.tags, v.published_at, v.primary_category AS category,
           c.subscriber_count,
           s.view_count, s.views_per_hour, s.velocity_basis, s.engagement_rate
    FROM videos v
    JOIN channels c ON c.id = v.channel_id
    JOIN video_snapshots s ON s.id = (SELECT id FROM video_snapshots WHERE video_id = v.id ORDER BY captured_at DESC LIMIT 1)
    WHERE v.published_at >= ? AND v.primary_category IS NOT NULL
    ORDER BY v.published_at DESC LIMIT ?`).all(cutoff, MAX_VIDEOS);

  const snapsBy = new Map();
  for (const s of db.prepare(`SELECT s.video_id, s.captured_at, s.view_count FROM video_snapshots s
      JOIN videos v ON v.id = s.video_id WHERE v.published_at >= ? ORDER BY s.video_id, s.captured_at`).all(cutoff)) {
    if (!snapsBy.has(s.video_id)) snapsBy.set(s.video_id, []);
    snapsBy.get(s.video_id).push({ captured_at: s.captured_at, view_count: s.view_count });
  }
  const regionsBy = new Map();
  for (const r of db.prepare(`SELECT DISTINCT vs.video_id, vs.region_code FROM video_sources vs
      JOIN videos v ON v.id = vs.video_id WHERE v.published_at >= ?`).all(cutoff)) {
    if (!regionsBy.has(r.video_id)) regionsBy.set(r.video_id, new Set());
    regionsBy.get(r.video_id).add(r.region_code);
  }

  return rows.map((r) => ({
    id: r.id, channelId: r.channel_id, title: r.title, description: r.description, tags: r.tags,
    publishedAt: r.published_at, category: r.category, subscribers: r.subscriber_count,
    latest: { viewCount: r.view_count, viewsPerHour: r.views_per_hour, velocityBasis: r.velocity_basis, engagementRate: r.engagement_rate },
    snapshots: snapsBy.get(r.id) ?? [],
    regions: regionsBy.get(r.id) ?? new Set(),
  }));
}

// ---------- clustering ----------
function frequentCore(cores) {
  const counts = new Map();
  for (const c of cores) for (const t of c) counts.set(t, (counts.get(t) || 0) + 1);
  const need = cores.length === 1 ? 1 : Math.max(2, Math.ceil(cores.length * 0.3));
  return new Set([...counts].filter(([, n]) => n >= need).map(([t]) => t));
}

function refresh(topic, members, videos) {
  topic.members = members;
  topic.centroid = centroid(members.map((i) => videos[i].vec));
  topic.core = frequentCore(members.map((i) => videos[i].core));
}

const isValid = (members, videos, s) =>
  members.length >= s.minVideos && new Set(members.map((i) => videos[i].channelId)).size >= s.minChannels;

function pickWinner(a, b) {
  if (a.id && b.id) return a.id < b.id ? [a, b] : [b, a];
  if (a.id) return [a, b];
  if (b.id) return [b, a];
  return a.members.length >= b.members.length ? [a, b] : [b, a];
}

function mergeSimilar(topics, videos, df) {
  const list = [...topics];
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let a = 0; a < list.length; a++) {
      for (let b = a + 1; b < list.length; b++) {
        const A = list[a], B = list[b];
        if (A.category !== B.category) continue;
        if (cosine(A.centroid, B.centroid) < MERGE_THRESHOLD || !sharesEnough(A.core, B.core, df)) continue;
        const [win, lose] = pickWinner(A, B);
        refresh(win, [...win.members, ...lose.members], videos);
        list.splice(list.indexOf(lose), 1);
        changed = true;
        break outer;
      }
    }
  }
  return list;
}

function clusterVideos(videos, df, s) {
  const idxById = new Map(videos.map((v, i) => [v.id, i]));
  const seeds = new Map();
  for (const r of db.prepare('SELECT topic_id, video_id FROM topic_videos').all()) {
    const i = idxById.get(r.video_id);
    if (i === undefined) continue;
    if (!seeds.has(r.topic_id)) seeds.set(r.topic_id, []);
    seeds.get(r.topic_id).push(i);
  }

  // 1. existing topics become the first candidates (keeps topic ids stable between runs)
  const existing = [];
  for (const row of db.prepare('SELECT id, name, category, keywords FROM topics').all()) {
    const seed = seeds.get(row.id);
    if (!seed?.length) continue;
    const t = { id: row.id, name: row.name, category: row.category, meta: parseMeta(row.keywords) };
    refresh(t, seed, videos);
    existing.push(t);
  }
  const byCat = new Map();
  for (const t of existing) {
    if (!byCat.has(t.category)) byCat.set(t.category, []);
    byCat.get(t.category).push(t);
  }
  const incoming = new Map(existing.map((t) => [t, []]));
  videos.forEach((v, i) => {
    let best = null;
    let bestSim = s.threshold;
    for (const t of byCat.get(v.category) ?? []) {
      if (!sharesEnough(v.core, t.core, df)) continue;
      const sim = cosine(v.vec, t.centroid);
      if (sim >= bestSim) { best = t; bestSim = sim; }
    }
    if (best) incoming.get(best).push(i);
  });

  const kept = [];
  const assigned = new Set();
  for (const t of existing) {
    refresh(t, incoming.get(t), videos);
    if (isValid(t.members, videos, s)) { kept.push(t); t.members.forEach((i) => assigned.add(i)); }
  }

  // 2. cluster whatever is left, per category
  const leftover = new Map();
  videos.forEach((v, i) => {
    if (assigned.has(i)) return;
    if (!leftover.has(v.category)) leftover.set(v.category, []);
    leftover.get(v.category).push(i);
  });
  for (const [category, idxs] of leftover) {
    if (idxs.length < s.minVideos) continue;
    const subset = idxs.map((i) => videos[i]);
    const clusters = agglomerate(subset.length, pairSimilarities(subset, df), s.threshold);
    for (const c of clusters) {
      const members = c.map((k) => idxs[k]);
      if (!isValid(members, videos, s)) continue;
      const t = { id: null, category, meta: { named_by: 'keywords' } };
      refresh(t, members, videos);
      kept.push(t);
    }
  }

  // 3. merge near-duplicate topics
  return mergeSimilar(kept, videos, df);
}

// ---------- persistence ----------
function persistTopics(topics, videos) {
  const now = nowIso();
  const bySlug = db.prepare('SELECT id FROM topics WHERE slug = ?');
  const insert = db.prepare('INSERT INTO topics (slug, name, category, keywords, first_detected_at, updated_at) VALUES (?,?,?,?,?,?)');
  const reuse = db.prepare('UPDATE topics SET name = ?, category = ?, keywords = ?, updated_at = ? WHERE id = ?');
  const touch = db.prepare('UPDATE topics SET keywords = ?, updated_at = ? WHERE id = ?');
  const link = db.prepare('INSERT INTO topic_videos (topic_id, video_id, similarity, assigned_at) VALUES (?,?,?,?)');

  db.transaction(() => {
    db.prepare('DELETE FROM topic_videos').run(); // memberships are rebuilt from the current analysis window
    const claimed = new Set(topics.filter((t) => t.id).map((t) => t.id));
    for (const t of topics) {
      const terms = topTerms(t.centroid, 6);
      t.meta = { ...t.meta, terms };
      if (t.id) {
        touch.run(JSON.stringify(t.meta), now, t.id);
      } else {
        const name = nameFromTerms(terms);
        const base = slugify([...terms.slice(0, 3), t.category].join('-')) || `topic-${t.category}`;
        let slug = base;
        let n = 2;
        while (!t.id) {
          const row = bySlug.get(slug);
          if (!row) {
            t.id = Number(insert.run(slug, name, t.category, JSON.stringify(t.meta), now, now).lastInsertRowid);
          } else if (!claimed.has(row.id)) {
            t.id = row.id; // an old topic with no members: reuse it instead of creating a duplicate
            reuse.run(name, t.category, JSON.stringify(t.meta), now, row.id);
          } else {
            slug = `${base}-${n++}`;
          }
        }
        claimed.add(t.id);
      }
      for (const i of t.members) link.run(t.id, videos[i].id, Math.round(cosine(videos[i].vec, t.centroid) * 1e4) / 1e4, now);
    }
  })();
}

// ---------- optional AI naming ----------
async function aiLabel() {
  const rows = db.prepare(`SELECT t.id, t.category, t.keywords, COUNT(*) AS n FROM topics t
      JOIN topic_videos tv ON tv.topic_id = t.id GROUP BY t.id ORDER BY n DESC`).all()
    .filter((r) => parseMeta(r.keywords).named_by !== 'ai').slice(0, MAX_AI_TOPICS);
  if (!rows.length) return;
  const titles = db.prepare(`SELECT v.title, c.title AS channel FROM topic_videos tv
      JOIN videos v ON v.id = tv.video_id JOIN channels c ON c.id = v.channel_id
      WHERE tv.topic_id = ? ORDER BY tv.similarity DESC LIMIT 8`);
  const batch = rows.map((r) => ({
    id: r.id, category: r.category, videos: titles.all(r.id).map((x) => `${x.title} (${x.channel})`),
  }));
  const { labels, errors } = await labelTopics(batch);
  errors.forEach((e) => analysisState.warnings.push(`AI labeling: ${e}`));
  const upd = db.prepare('UPDATE topics SET name = ?, keywords = ? WHERE id = ?');
  db.transaction(() => {
    for (const r of rows) {
      const l = labels.get(r.id);
      if (!l) continue;
      const meta = { ...parseMeta(r.keywords), named_by: 'ai', ai: { coherent: l.coherent, animation_potential: l.animationPotential, reason: l.reason } };
      upd.run(l.name, JSON.stringify(meta), r.id);
    }
  })();
}

// ---------- scoring ----------
function scoreAll(videos) {
  const byId = new Map(videos.map((v) => [v.id, v]));
  const topicRows = db.prepare('SELECT id, name, category, keywords FROM topics WHERE id IN (SELECT DISTINCT topic_id FROM topic_videos)').all();
  const membersBy = new Map();
  for (const l of db.prepare('SELECT topic_id, video_id FROM topic_videos').all()) {
    const v = byId.get(l.video_id);
    if (!v) continue;
    if (!membersBy.has(l.topic_id)) membersBy.set(l.topic_id, []);
    membersBy.get(l.topic_id).push(v);
  }
  const inputs = topicRows.filter((r) => membersBy.get(r.id)?.length).map((r) => ({
    id: r.id, topic: { name: r.name, category: r.category, ai: parseMeta(r.keywords).ai }, members: membersBy.get(r.id),
  }));
  const raws = inputs.map((t) => computeTopicRaw(t.topic, t.members));
  const results = finalizeScores(raws, getSetting('scoring_weights'));

  const computedAt = nowIso();
  const ins = db.prepare(`INSERT INTO trend_scores (topic_id, computed_at, score, confidence, trend_status, components, weights)
                          VALUES (?,?,?,?,?,?,?)`);
  db.transaction(() => results.forEach((r, i) =>
    ins.run(inputs[i].id, computedAt, r.score, r.confidence, r.status, JSON.stringify(r.components), JSON.stringify(r.weights))))();
  return results.length;
}

/** Re-apply the current weights to the latest stored metrics. No new clustering or API calls. */
export function rescoreLatest() {
  const weights = getSetting('scoring_weights');
  const rows = db.prepare('SELECT id, components FROM trend_scores WHERE id IN (SELECT MAX(id) FROM trend_scores GROUP BY topic_id)').all();
  const upd = db.prepare('UPDATE trend_scores SET score = ?, weights = ?, components = ? WHERE id = ?');
  db.transaction(() => {
    for (const r of rows) {
      const comps = JSON.parse(r.components);
      const { score, contributions } = applyWeights(comps.metrics, weights);
      comps.contributions = contributions;
      upd.run(score, JSON.stringify(weights), JSON.stringify(comps), r.id);
    }
  })();
}

// ---------- orchestration ----------
async function execute() {
  const t0 = Date.now();
  const s = {
    windowDays: getSetting('analysis_window_days'),
    threshold: getSetting('similarity_threshold'),
    minVideos: getSetting('min_topic_videos'),
    minChannels: getSetting('min_topic_channels'),
    wantsAi: Boolean(getSetting('ai_topic_labeling')),
  };
  const step = (st, msg) => { analysisState.step = st; analysisState.message = msg; };

  step('loading', 'Loading videos and snapshots');
  const videos = loadCorpus(s.windowDays);
  if (videos.length < 2) {
    analysisState.lastResult = { ok: false, message: `Only ${videos.length} videos in the last ${s.windowDays} days. Run a collection first.` };
    return;
  }

  step('clustering', `Clustering ${videos.length} videos`);
  const { docs, df } = buildVectors(videos.map(toRawDoc));
  videos.forEach((v, i) => { v.vec = docs[i].vec; v.core = docs[i].core; });
  const topics = clusterVideos(videos, df, s);

  step('saving', `Saving ${topics.length} topics`);
  persistTopics(topics, videos);

  if (s.wantsAi) {
    if (!config.openaiKey) analysisState.warnings.push('AI naming is enabled but OPENAI_API_KEY is missing. Skipped.');
    else { step('ai', 'Naming topics with OpenAI'); await aiLabel(); }
  }

  step('scoring', 'Scoring topics');
  const scored = scoreAll(videos);
  analysisState.lastResult = {
    ok: true, videos: videos.length, topics: topics.length, scored,
    seconds: Math.round((Date.now() - t0) / 100) / 10, finishedAt: nowIso(),
  };
}

export function startAnalysis() {
  if (analysisState.running) throw httpError(409, 'Analysis is already running.');
  Object.assign(analysisState, { running: true, step: 'starting', message: 'Starting…', startedAt: nowIso(), warnings: [] });
  execute()
    .catch((e) => { console.error(e); analysisState.lastResult = { ok: false, message: e.message }; })
    .finally(() => {
      const r = analysisState.lastResult;
      Object.assign(analysisState, {
        running: false, step: 'idle',
        message: r?.ok ? `Done: ${r.topics} topics from ${r.videos} videos in ${r.seconds}s` : `Not completed: ${r?.message ?? 'unknown error'}`,
      });
    });
}