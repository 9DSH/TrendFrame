import fs from 'node:fs';
import path from 'node:path';
import { ROOT, config } from '../config.js';

const ENV_PATH = path.join(ROOT, '.env');
const bad = (m) => Object.assign(new Error(m), { status: 400 });

export const ENV_FIELDS = [
  { key: 'YOUTUBE_API_KEY', label: 'YouTube Data API key', secret: true, group: 'keys',
    help: 'Used for every collection. Create it in Google Cloud Console (YouTube Data API v3).',
    get: () => config.youtubeKey, apply: (v) => { config.youtubeKey = v; } },
  { key: 'OPENAI_API_KEY', label: 'OpenAI API key', secret: true, group: 'keys',
    help: 'Used for topic naming, research and animation ideas. Optional until you use the AI features.',
    get: () => config.openaiKey, apply: (v) => { config.openaiKey = v; } },
  { key: 'OPENAI_MODEL', label: 'Topic naming model', group: 'models', default: 'gpt-4o-mini', model: true,
    help: 'Small, cheap model used to name topics and rate animation potential.',
    get: () => config.openaiModel, apply: (v) => { config.openaiModel = v; } },
  { key: 'OPENAI_RESEARCH_MODEL', label: 'Research model', group: 'models', default: 'gpt-4o', model: true,
    help: 'Must support OpenAI web search. Research bills per web search call.',
    get: () => config.openaiResearchModel, apply: (v) => { config.openaiResearchModel = v; } },
  { key: 'OPENAI_IDEAS_MODEL', label: 'Animation ideas model', group: 'models', default: 'gpt-4o', model: true,
    help: 'Writes the three documentary concepts from the research report.',
    get: () => config.openaiIdeasModel, apply: (v) => { config.openaiIdeasModel = v; } },
  { key: 'PORT', label: 'API port', group: 'server', default: '3001', restart: true, int: [1024, 65535],
    help: 'Port of the local API. If you change it, also change the proxy target in vite.config.js. Needs a restart.',
    get: () => String(process.env.PORT || '3001') },
  { key: 'DB_PATH', label: 'Database file', group: 'server', default: './data/trendframe.db', restart: true,
    help: 'A different path starts a new, empty database (the old file is kept). Needs a restart.',
    get: () => process.env.DB_PATH || './data/trendframe.db' },
  { key: 'PITCHAPI_API_KEY', label: 'PitchAPI key', secret: true, group: 'keys',
    help: 'Used by the Football goals page. Free at pitchapi.dev/get-api-key. Applies immediately, no restart needed.',
    get: () => process.env.PITCHAPI_API_KEY || '' },
];
const byKey = new Map(ENV_FIELDS.map((f) => [f.key, f]));

/** What the browser may see: never a full secret. */
export function envView() {
  return ENV_FIELDS.map((f) => {
    const v = f.get() || '';
    return {
      key: f.key, label: f.label, help: f.help, group: f.group, secret: Boolean(f.secret), restart: Boolean(f.restart),
      model: Boolean(f.model), default: f.default ?? '', set: Boolean(v),
      value: f.secret ? '' : v, hint: f.secret && v ? `ends in …${v.slice(-4)}` : '',
    };
  });
}

function check(f, v) {
  if (f.secret) { if (v && !/^\S{10,300}$/.test(v)) throw bad(`${f.label}: expected one token of 10 to 300 characters without spaces.`); return; }
  if (f.model && !/^[\w.:-]{1,80}$/.test(v)) throw bad(`${f.label}: use a model name such as gpt-4o.`);
  if (f.int) {
    const n = Number(v);
    if (!Number.isInteger(n) || n < f.int[0] || n > f.int[1]) throw bad(`${f.label} must be a whole number between ${f.int[0]} and ${f.int[1]}.`);
  }
  if (f.key === 'DB_PATH' && !/^[^\r\n"'#]{1,300}$/.test(v)) throw bad('Database file: path must not contain quotes, # or line breaks.');
}

const fmt = (v) => (/[\s#]/.test(v) ? `"${v}"` : v);

function writeEnv(changes) {
  const text = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const done = new Set();
  const lines = (text ? text.split(/\r?\n/) : []).map((line) => {
    const k = /^\s*([A-Z0-9_]+)\s*=/.exec(line)?.[1];
    if (k && k in changes) { done.add(k); return `${k}=${fmt(changes[k])}`; }
    return line;
  });
  for (const k of Object.keys(changes)) if (!done.has(k)) lines.push(`${k}=${fmt(changes[k])}`);
  while (lines.length && lines.at(-1) === '') lines.pop();
  fs.writeFileSync(ENV_PATH, lines.join(eol) + eol);
}

/** patch: { KEY: value }. Secret: '' or undefined = unchanged, null = clear. Other fields: '' = default. */
export function updateEnv(patch) {
  const changes = {};
  for (const [k, raw] of Object.entries(patch || {})) {
    const f = byKey.get(k);
    if (!f) throw bad(`Unknown variable: ${k}`);
    if (raw === undefined || (f.secret && raw === '')) continue;
    let v = raw === null ? '' : String(raw).trim();
    if (!f.secret && v === '') v = f.default;
    check(f, v);
    changes[k] = v;
  }
  if (!Object.keys(changes).length) return { changed: [], restart: [] };
  writeEnv(changes);
  for (const [k, v] of Object.entries(changes)) {
    if (v === '') delete process.env[k]; else process.env[k] = v;
    byKey.get(k).apply?.(v);
  }
  return { changed: Object.keys(changes), restart: Object.keys(changes).filter((k) => byKey.get(k).restart) };
}