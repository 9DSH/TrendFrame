import { useEffect, useState } from 'react';
import { api } from '../services/api.js';
import Info from '../components/Info.jsx';
import { Card, Notice, Page, btnGhost, btnPrimary, inputCls } from '../components/ui.jsx';
import { METRICS } from '../utils/format.js';

const GROUPS = [
  { key: 'collection', title: 'Collection', note: 'What is fetched from YouTube. Applies to the next collection.' },
  { key: 'analysis', title: 'Analysis', note: 'How videos are grouped into topics. Applies to the next analysis run.' },
  { key: 'metrics', title: 'Metric inputs', note: 'Assumptions and thresholds used to score and label topics. They apply to the next analysis run, except the high-opportunity limits, which apply immediately.' },
];

const toForm = (s) => ({ ...s, regions: s.regions.join(', '), scoring_params: { ...s.scoring_params } });
const read = (form, f) => (f.setting ? form[f.setting]?.[f.key] : form[f.key]);
const write = (form, f, v) => (f.setting
  ? { ...form, [f.setting]: { ...form[f.setting], [f.key]: v } }
  : { ...form, [f.key]: v });
const asForm = (f, d) => (f.type === 'list' ? d.join(', ') : f.type === 'categories' ? [...d] : d);
function isDefault(f, v, d) {
  if (f.type === 'list') return String(v).split(',').map((x) => x.trim().toUpperCase()).filter(Boolean).join(',') === d.join(',');
  if (f.type === 'categories') return [...v].sort().join() === [...d].sort().join();
  if (f.type === 'int' || f.type === 'float') return Number(v) === d;
  return v === d;
}

function Field({ f, value, def, cats, onChange }) {
  const changed = !isDefault(f, value, def);
  let input;
  if (f.type === 'bool') input = <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />;
  else if (f.type === 'enum') input = (
    <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
      {f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>);
  else if (f.type === 'int' || f.type === 'float') input = (
    <input type="number" className={`${inputCls} w-32`} min={f.min} max={f.max} step={f.step ?? (f.type === 'int' ? 1 : 0.01)}
      value={value ?? ''} onChange={(e) => onChange(e.target.value)} />);
  else if (f.type === 'list') input = <input className={`${inputCls} w-64`} value={value} onChange={(e) => onChange(e.target.value)} />;
  else if (f.type === 'categories') input = (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
      {cats.map((c) => (
        <label key={c.key} className="flex items-center gap-2">
          <input type="checkbox" checked={value.includes(c.key)}
            onChange={() => onChange(value.includes(c.key) ? value.filter((x) => x !== c.key) : [...value, c.key])} />{c.label}
        </label>
      ))}
    </div>);

  return (
    <div className={f.type === 'categories' ? 'md:col-span-2' : ''}>
      <div className="mb-1 text-xs text-slate-400">
        {f.label}<Info text={f.help} />
        {changed && <button type="button" className="ml-2 text-[11px] text-slate-500 hover:text-accent" onClick={() => onChange(asForm(f, def))}>reset</button>}
      </div>
      <div className="flex items-center gap-2 text-sm">{input}{f.unit && <span className="text-xs text-slate-500">{f.unit}</span>}</div>
    </div>
  );
}

export default function Settings() {
  const [schema, setSchema] = useState(null);
  const [cats, setCats] = useState([]);
  const [form, setForm] = useState(null);
  const [initial, setInitial] = useState('');
  const [weights, setWeights] = useState(null);
  const [weightDefaults, setWeightDefaults] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [sc, c, s, w] = await Promise.all([api.settingsSchema(), api.config(), api.settings(), api.weights()]);
        setSchema(sc); setCats(c.categories); setWeights(w.weights); setWeightDefaults(w.defaults);
        const f = toForm(s); setForm(f); setInitial(JSON.stringify(f));
      } catch (e) { setMsg({ tone: 'error', text: `Cannot load settings: ${e.message}` }); }
    })();
  }, []);

  if (!form || !schema) return <Page title="Settings">{msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : <p className="text-slate-400">Loading…</p>}</Page>;

  const dirty = JSON.stringify(form) !== initial;
  const set = (f, v) => setForm((cur) => write(cur, f, v));

  const save = async (runAfter) => {
    setBusy(true); setMsg(null);
    try {
      const patch = {}; const params = {};
      for (const f of schema.fields) {
        let v = read(form, f);
        if (f.type === 'int' || f.type === 'float') v = v === '' ? v : Number(v);
        if (f.type === 'list') v = String(v).split(',').map((x) => x.trim()).filter(Boolean);
        (f.setting ? params : patch)[f.key] = v;
      }
      patch.scoring_params = params;
      const saved = await api.saveSettings(patch);
      const next = toForm(saved); setForm(next); setInitial(JSON.stringify(next));
      if (runAfter) await api.analysisRun();
      setMsg({ tone: 'ok', text: runAfter ? 'Saved. Analysis started; follow it on the Dashboard.' : 'Saved.' });
    } catch (e) { setMsg({ tone: 'error', text: e.message }); }
    finally { setBusy(false); }
  };

  const saveWeights = async () => {
    try {
      const w = Object.fromEntries(Object.entries(weights).map(([k, v]) => [k, Number(v)]));
      setWeights((await api.saveWeights(w)).weights);
      setMsg({ tone: 'ok', text: 'Weights applied to the latest scores.' });
    } catch (e) { setMsg({ tone: 'error', text: e.message }); }
  };
  const weightSum = Object.values(weights).reduce((a, b) => a + Number(b || 0), 0);

  return (
    <Page title="Settings" subtitle="Collection, analysis and scoring inputs in one place"
      right={(
        <div className="flex items-center gap-2">
          {dirty && <span className="text-xs text-yellow-400">Unsaved changes</span>}
          <button className={btnGhost} disabled={busy || !dirty} onClick={() => save(false)}>Save</button>
          <button className={btnPrimary} disabled={busy || !dirty} onClick={() => save(true)}>Save and run analysis</button>
        </div>
      )}>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      {GROUPS.map((g) => (
        <Card key={g.key} title={g.title}>
          <p className="mb-3 text-xs text-slate-500">{g.note}</p>
          <div className="grid gap-x-6 gap-y-4 md:grid-cols-2">
            {schema.fields.filter((f) => f.group === g.key).map((f) => (
              <Field key={`${f.setting ?? ''}.${f.key}`} f={f} value={read(form, f)} cats={cats} onChange={(v) => set(f, v)}
                def={f.setting ? schema.defaults[f.setting][f.key] : schema.defaults[f.key]} />
            ))}
          </div>
        </Card>
      ))}

      <Card title="Scoring weights" info="opportunity_score">
        <p className="mb-3 text-xs text-slate-500">Applied instantly to the latest scores, with no re-collection. Weights are normalised, so they don't need to add up to 100.</p>
        <div className="grid gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {Object.keys(METRICS).map((k) => (
            <label key={k} className="text-xs text-slate-400">{METRICS[k]}<Info term={k} />
              <input type="number" min="0" max="100" className={`${inputCls} mt-1 w-full`} value={weights[k]}
                onChange={(e) => setWeights({ ...weights, [k]: e.target.value })} />
            </label>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <button className={btnPrimary} onClick={saveWeights}>Apply weights</button>
          <button className={btnGhost} onClick={() => setWeights(weightDefaults)}>Reset to defaults</button>
          <span className="text-xs text-slate-500">Total {weightSum}</span>
        </div>
      </Card>
    </Page>
  );
}