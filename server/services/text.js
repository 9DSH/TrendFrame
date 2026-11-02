const STOP = new Set((
  `a an the and or but if of to in on at by for with from as is are was were be been being it its this that these those
   you your he she we they them his her our their me my not no do does did have has had will would can could should may
   might must just so than then too very about into over after before up down out off again more most some any all each
   other such only own same how what when where which who why via per here there now get got
   der die das und ist ein eine nicht mit von zu im für auf den dem des sich auch wie
   official video videos full new latest shorts short subscribe watch episode part live stream today update updates
   breaking news highlights reaction reacts react`
).split(/\s+/).filter(Boolean));

const SHORT_OK = new Set(['ai', 'uk', 'eu', 'un', 'ev', 'vr', 'f1', '5g']);
const FIELD_WEIGHT = { title: 3, tags: 1.5, desc: 0.7 };

export function tokenize(text) {
  if (!text) return [];
  return String(text)
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t && !STOP.has(t) && !/^\d+$/.test(t) && (t.length >= 3 || SHORT_OK.has(t)));
}

export function toRawDoc(video) {
  let tags = [];
  try { tags = JSON.parse(video.tags || '[]'); } catch { /* ignore */ }
  return {
    id: video.id,
    title: tokenize(video.title),
    tags: tokenize(tags.slice(0, 15).join(' ')),
    desc: tokenize((video.description || '').slice(0, 300)),
  };
}

/**
 * TF-IDF vectors (L2-normalised). Terms that appear in only one video are dropped (they can't create
 * similarity) and so are terms that appear in a large share of all videos (boilerplate).
 * `core` = title/tag unigrams, used to require real shared vocabulary between videos.
 */
export function buildVectors(rawDocs, { minDf = 2 } = {}) {
  const N = rawDocs.length;
  const counts = rawDocs.map((d) => {
    const m = new Map();
    const add = (t, w) => m.set(t, (m.get(t) || 0) + w);
    d.title.forEach((t) => add(t, FIELD_WEIGHT.title));
    for (let i = 0; i < d.title.length - 1; i++) add(`${d.title[i]}_${d.title[i + 1]}`, FIELD_WEIGHT.title);
    d.tags.forEach((t) => add(t, FIELD_WEIGHT.tags));
    d.desc.forEach((t) => add(t, FIELD_WEIGHT.desc));
    return m;
  });

  const df = new Map();
  for (const m of counts) for (const t of m.keys()) df.set(t, (df.get(t) || 0) + 1);
  const maxDf = N < 20 ? N : Math.max(3, Math.floor(N * 0.4));
  const keep = (t) => { const d = df.get(t); return d >= minDf && d <= maxDf; };

  const docs = rawDocs.map((d, i) => {
    const vec = new Map();
    let norm = 0;
    for (const [t, c] of counts[i]) {
      if (!keep(t)) continue;
      const w = Math.log(1 + c) * (Math.log((N + 1) / (df.get(t) + 1)) + 1);
      vec.set(t, w);
      norm += w * w;
    }
    norm = Math.sqrt(norm);
    if (norm > 0) for (const [t, w] of vec) vec.set(t, w / norm);
    const core = new Set([...d.title, ...d.tags].filter(keep));
    return { id: d.id, vec, core };
  });
  return { docs, df };
}

export function cosine(a, b) {
  if (!a.size || !b.size) return 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [t, w] of small) { const o = large.get(t); if (o) dot += w * o; }
  return dot;
}

export function centroid(vectors) {
  const sum = new Map();
  for (const v of vectors) for (const [t, w] of v) sum.set(t, (sum.get(t) || 0) + w);
  let norm = 0;
  for (const w of sum.values()) norm += w * w;
  norm = Math.sqrt(norm);
  if (norm > 0) for (const [t, w] of sum) sum.set(t, w / norm);
  return sum;
}

export const topTerms = (vec, n = 6) =>
  [...vec].filter(([t]) => !t.includes('_')).sort((a, b) => b[1] - a[1]).slice(0, n).map(([t]) => t);

/** Anti-false-positive gate: share >= 2 core terms, or 1 rare (distinctive) term. */
export function sharesEnough(coreA, coreB, df, distinctiveDf = 6) {
  let shared = 0;
  let only = null;
  for (const t of coreA) {
    if (coreB.has(t)) { shared++; only = t; if (shared >= 2) return true; }
  }
  return shared === 1 && (df.get(only) ?? Infinity) <= distinctiveDf;
}

export const nameFromTerms = (terms) =>
  terms.length ? terms.slice(0, 4).map((t) => t[0].toUpperCase() + t.slice(1)).join(' ') : 'Untitled topic';

export const slugify = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');