import { Router } from 'express';
import { db, getSetting, setSetting } from './database/db.js';
import { config, CATEGORIES, DEFAULT_CATEGORIES, setCategories } from './config.js';
import { envView, updateEnv } from './services/envFile.js';
import * as yt from './services/youtubeClient.js';
import { translatePending } from './services/translate.js';
import { listLeagues, keyConfigured as pitchKeyConfigured } from './football/pitchApi.js';

const router = Router();
const bad = (m) => Object.assign(new Error(m), { status: 400 });
const wrap = (fn) => async (req, res) => {
  try { res.json(await fn(req)); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
};

// ---------- .env ----------
router.get('/env', wrap(() => ({ fields: envView() })));
router.put('/env', wrap((req) => ({ ...updateEnv(req.body), fields: envView() })));
router.post('/translate', wrap(() => translatePending()));

router.post('/env/test', wrap(async (req) => {
  if (req.body?.target === 'youtube') {
    await yt.fetchVideoCategories('US'); // costs 1 quota unit
    return { ok: true, message: 'The YouTube key works (1 quota unit used).' };
  }
  if (req.body?.target === 'openai') {
    if (!config.openaiKey) throw bad('No OpenAI key is saved.');
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${config.openaiKey}` }, signal: AbortSignal.timeout(20_000),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw bad(`OpenAI ${res.status}: ${body.error?.message || res.statusText}`);
    const models = (body.data ?? []).map((m) => m.id).filter((id) => /^(gpt|o\d|chatgpt)/.test(id)).sort().slice(0, 80);
    return { ok: true, message: 'The OpenAI key works.', models };
  }
  if (req.body?.target === 'pitchapi') {
    if (!pitchKeyConfigured()) throw bad('No PitchAPI key is saved.');
    try {
      const r = await listLeagues();
      return { ok: true, message: `The PitchAPI key works (${r.leagues?.length ?? 0} leagues available).` };
    } catch (e) { throw bad(e.message); }
  }

  throw bad('Unknown test target.');
}));

// ---------- categories ----------
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30) || 'category';

function normalizeCategories(input) {
  if (!Array.isArray(input) || !input.length) throw bad('Keep at least one category.');
  if (input.length > 30) throw bad('At most 30 categories.');
  const existing = new Set(CATEGORIES.map((c) => c.key));
  const used = new Set();
  return input.map((c) => {
    const label = String(c?.label ?? '').trim().slice(0, 40);
    if (!label) throw bad('Every category needs a name.');
    const ids = [...new Set((Array.isArray(c.youtubeCategoryIds) ? c.youtubeCategoryIds : []).map((x) => String(x).trim()).filter(Boolean))];
    if (ids.some((x) => !/^\d{1,3}$/.test(x))) throw bad(`"${label}": YouTube category IDs are numbers such as 28.`);
    const queries = [...new Set((Array.isArray(c.queries) ? c.queries : []).map((x) => String(x).trim().slice(0, 80)).filter(Boolean))].slice(0, 5);
    if (!ids.length && !queries.length) throw bad(`"${label}" needs at least one YouTube category ID or one search query.`);
    let key = typeof c.key === 'string' && existing.has(c.key) ? c.key : null;
    if (!key) {
      const base = slug(label);
      key = base;
      for (let n = 2; used.has(key) || existing.has(key); n++) key = `${base}_${n}`;
    }
    if (used.has(key)) throw bad(`Duplicate category: ${label}`);
    used.add(key);
    return { key, label, youtubeCategoryIds: ids, queries };
  });
}

router.get('/categories', wrap(() => ({ categories: CATEGORIES, defaults: DEFAULT_CATEGORIES })));
router.put('/categories', wrap((req) => {
  const list = normalizeCategories(req.body?.categories);
  setSetting('categories_config', list);
  setCategories(list);
  // keep the "categories to collect" setting valid
  const keys = new Set(list.map((c) => c.key));
  const selected = getSetting('categories').filter((k) => keys.has(k));
  setSetting('categories', selected.length ? selected : list.map((c) => c.key));
  return { categories: CATEGORIES };
}));

export default router;