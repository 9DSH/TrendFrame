import { cosine, sharesEnough } from './text.js';

/** Sparse pairwise similarities, only for pairs that share vocabulary and pass the gate. key = i * n + j (i < j). */
export function pairSimilarities(docs, df, minSim = 0.05) {
  const n = docs.length;
  const postings = new Map();
  docs.forEach((d, i) => {
    for (const t of d.vec.keys()) {
      if (!postings.has(t)) postings.set(t, []);
      postings.get(t).push(i);
    }
  });
  const seen = new Set();
  const sims = new Map();
  for (const list of postings.values()) {
    if (list.length > 500) continue;
    for (let x = 0; x < list.length; x++) {
      for (let y = x + 1; y < list.length; y++) {
        const i = list[x], j = list[y];
        const key = i * n + j;
        if (seen.has(key)) continue;
        seen.add(key);
        if (!sharesEnough(docs[i].core, docs[j].core, df)) continue;
        const s = cosine(docs[i].vec, docs[j].vec);
        if (s >= minSim) sims.set(key, s);
      }
    }
  }
  return sims;
}

/** Average-link agglomerative clustering over sparse similarities. Returns arrays of indices. */
export function agglomerate(n, sims, threshold) {
  const members = new Map();
  const adj = new Map();
  for (let i = 0; i < n; i++) { members.set(i, [i]); adj.set(i, new Map()); }
  for (const [key, s] of sims) {
    const i = Math.floor(key / n), j = key % n;
    adj.get(i).set(j, s);
    adj.get(j).set(i, s);
  }
  for (;;) {
    let best = null;
    let bestAvg = threshold;
    for (const [a, nb] of adj) {
      for (const [b, sum] of nb) {
        if (a >= b) continue;
        const avg = sum / (members.get(a).length * members.get(b).length);
        if (avg >= bestAvg) { bestAvg = avg; best = [a, b]; }
      }
    }
    if (!best) break;
    const [a, b] = best;
    for (const [c, sum] of adj.get(b)) {
      if (c === a) continue;
      const total = (adj.get(a).get(c) || 0) + sum;
      adj.get(a).set(c, total);
      adj.get(c).set(a, total);
      adj.get(c).delete(b);
    }
    adj.get(a).delete(b);
    adj.delete(b);
    members.get(a).push(...members.get(b));
    members.delete(b);
  }
  return [...members.values()];
}