export const CLAIM_STATUSES = ['sourced', 'unverified', 'speculation'];
export const BASIS_VALUES = ['sourced', 'unverified', 'speculation', 'creative'];

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g;
export const clip = (v, max) => (v == null ? '' : String(v)).replace(CONTROL, ' ').trim().slice(0, max);
const list = (v) => (Array.isArray(v) ? v : []);
const strList = (v, n, max) => list(v).map((x) => clip(typeof x === 'object' ? x?.text ?? x?.name : x, max)).filter(Boolean).slice(0, n);

export function extractJson(text) {
  if (!text) throw new Error('Empty model response');
  const cleaned = String(text).replace(/```json|```/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Model response contained no JSON');
  return JSON.parse(cleaned.slice(start, end + 1));
}

/** Only http(s) links are kept (blocks javascript: URLs); tracking parameters are removed. */
export function normalizeUrl(raw) {
  try {
    const u = new URL(String(raw).trim());
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    for (const k of [...u.searchParams.keys()]) if (/^utm_/i.test(k)) u.searchParams.delete(k);
    u.hash = '';
    return u.toString();
  } catch { return null; }
}

export function dedupeSources(sources, max = 40) {
  const seen = new Map();
  for (const s of sources) {
    const url = normalizeUrl(s?.url);
    if (!url || seen.has(url)) continue;
    seen.set(url, { id: seen.size + 1, url, title: clip(s.title, 200) });
    if (seen.size >= max) break;
  }
  return [...seen.values()];
}

/**
 * Validates the structured research report. A claim stays "sourced" only if it points at real
 * source numbers and web research actually happened; otherwise it is downgraded to "unverified".
 */
export function normalizeReport(raw, { sourceCount, webResearch }) {
  if (!raw || typeof raw !== 'object') throw new Error('Report is not an object');
  let downgraded = 0;

  const items = (arr, max, extra = {}) => list(arr).slice(0, max).map((r) => {
    if (!r || typeof r !== 'object') return null;
    const text = clip(r.text ?? r.role ?? r.event ?? r.description, 700);
    if (!text) return null;
    let status = CLAIM_STATUSES.includes(r.status) ? r.status : 'unverified';
    const sourceIds = [...new Set(list(r.source_ids).map(Number)
      .filter((i) => Number.isInteger(i) && i >= 1 && i <= sourceCount))].slice(0, 5);
    if (status === 'sourced' && (!sourceIds.length || !webResearch)) { status = 'unverified'; downgraded++; }
    const out = { text, status, sourceIds };
    for (const [key, len] of Object.entries(extra)) { const v = clip(r[key], len); if (v) out[key] = v; }
    return out;
  }).filter(Boolean);

  const report = {
    subject: clip(raw.subject, 200),
    coherent: raw.coherent !== false,
    coherenceNote: clip(raw.coherence_note, 400),
    summary: clip(raw.summary, 1800),
    whyTrending: items(raw.why_trending, 8),
    background: items(raw.background, 10),
    timeline: items(raw.timeline, 25, { date: 40 }),
    keyPeopleOrgs: items(raw.key_people_orgs, 15, { name: 120 }),
    importantEvents: items(raw.important_events, 10, { title: 120 }),
    currentDevelopments: items(raw.current_developments, 10, { date: 40 }),
    storytellingAngles: list(raw.storytelling_angles).slice(0, 8).map((a) =>
      typeof a === 'string' ? { title: '', description: clip(a, 500) } : { title: clip(a?.title, 120), description: clip(a?.description, 500) })
      .filter((a) => a.title || a.description),
    gaps: strList(raw.unverified_or_missing, 10, 300),
  };
  return { report, downgraded };
}

const namedList = (arr, n) => list(arr).slice(0, n).map((x) => {
  if (typeof x === 'string') return { name: clip(x, 120), description: '' };
  if (!x || typeof x !== 'object') return null;
  return { name: clip(x.name, 120), description: clip([x.role, x.description, x.visual_notes].filter(Boolean).join(' — '), 400) };
}).filter((x) => x?.name);

/** Returns a clean concept, or null if it is too incomplete to use. */
export function normalizeConcept(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const title = clip(raw.title, 140);
  const storyline = clip(raw.storyline, 2500);
  const scenes = list(raw.scenes).slice(0, 20).map((s) => {
    if (!s || typeof s !== 'object') return null;
    const description = clip(s.description, 700);
    if (!description) return null;
    const dur = Number(s.duration_seconds);
    return {
      title: clip(s.title, 100), description,
      durationSeconds: Number.isFinite(dur) && dur > 0 ? Math.min(Math.round(dur), 900) : null,
      environment3d: clip(s.environment_3d, 300), camera: clip(s.camera, 300),
      soundEffects: clip(s.sound_effects, 300), music: clip(s.music, 200),
      basis: BASIS_VALUES.includes(s.basis) ? s.basis : 'unverified', // unknown = treat conservatively
    };
  }).filter(Boolean).map((s, i) => ({ number: i + 1, ...s }));
  if (!title || !storyline || scenes.length < 3) return null;

  const mins = Number(raw.estimated_duration_minutes);
  return {
    title,
    alternativeTitles: strList(raw.alternative_titles, 5, 140),
    openingHook: clip(raw.opening_hook, 800),
    storyline,
    narrativeStructure: clip(raw.narrative_structure, 800),
    durationMinutes: Number.isFinite(mins) && mins > 0 ? Math.min(Math.round(mins * 10) / 10, 60) : null,
    mainCharacters: namedList(raw.main_characters, 8),
    locations: namedList(raw.locations, 10),
    historicalTimeline: list(raw.historical_timeline).slice(0, 20)
      .map((e) => ({ date: clip(e?.date, 40), event: clip(e?.event ?? e?.text, 300) })).filter((e) => e.event),
    scenes,
    environments3d: strList(raw.environments_3d, 10, 300),
    characterRequirements: strList(raw.character_requirements, 10, 300),
    cameraMovements: strList(raw.camera_movements, 10, 200),
    soundEffects: strList(raw.sound_effects, 12, 200),
    musicAtmosphere: clip(raw.music_atmosphere, 500),
    closingScene: clip(raw.closing_scene, 800),
    factCheckNotes: strList(raw.fact_check_notes, 8, 300),
  };
}