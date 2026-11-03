import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../services/api.js';
import { BasisBadge } from '../components/ai.jsx';
import { Card, Empty, Notice, Page, StatusBadge, btnGhost, btnPrimary, inputCls } from '../components/ui.jsx';
import { PROJECT_STATUS, dateTime, growthPct, trunc } from '../utils/format.js';
import { conceptToMarkdown } from '../utils/conceptMarkdown.js';

const STATUS_KEYS = Object.keys(PROJECT_STATUS);
const Badge = ({ s }) => {
  const [label, cls] = PROJECT_STATUS[s] ?? PROJECT_STATUS.discovered;
  return <span className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] ${cls}`}>{label}</span>;
};
const pill = (on) => `rounded px-2.5 py-1 text-xs ${on ? 'bg-accent text-white' : 'border border-line text-slate-400 hover:text-white'}`;
const toForm = (p) => ({ title: p.title, status: p.status, notes: p.notes ?? '', tags: p.tags.join(', ') });

function Detail({ id, onChanged, onDeleted }) {
  const [d, setD] = useState(null);
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    setD(null); setMsg(null);
    api.project(id).then((r) => { if (alive) { setD(r); setForm(toForm(r.project)); } })
      .catch((e) => alive && setMsg({ tone: 'error', text: e.message }));
    return () => { alive = false; };
  }, [id]);

  if (!d || !form) return <Card>{msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : <p className="text-slate-400">Loading…</p>}</Card>;
  const { project: p, concept: c, evidence, research } = d;
  const dirty = JSON.stringify(form) !== JSON.stringify(toForm(p));

  const save = async (next = form) => {
    setMsg(null);
    try {
      const r = await api.updateProject(id, next);
      setD({ ...d, project: r }); setForm(toForm(r)); setMsg({ tone: 'ok', text: 'Saved.' }); onChanged();
    } catch (e) { setMsg({ tone: 'error', text: e.message }); }
  };
  const nextStatus = STATUS_KEYS[STATUS_KEYS.indexOf(form.status) + 1];
  const remove = async () => {
    if (!window.confirm(`Delete "${p.title}"? The topic and research stay; only this project is removed.`)) return;
    try { await api.deleteProject(id); onDeleted(); } catch (e) { setMsg({ tone: 'error', text: e.message }); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(conceptToMarkdown(c, p.topicName ?? '')); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setMsg({ tone: 'error', text: 'Copy failed: the browser blocked clipboard access.' }); }
  };

  return (
    <div className="space-y-4">
      <Card title="Project" right={(
        <div className="flex items-center gap-2">
          {dirty && <span className="text-xs text-yellow-400">Unsaved changes</span>}
          <button className={btnPrimary} disabled={!dirty} onClick={() => save()}>Save</button>
        </div>
      )}>
        {msg && <div className="mb-3"><Notice tone={msg.tone}>{msg.text}</Notice></div>}
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-xs text-slate-400 md:col-span-2">Title
            <input className={`${inputCls} mt-1 w-full`} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
          <label className="text-xs text-slate-400">Status
            <div className="mt-1 flex items-center gap-2">
              <select className={inputCls} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {STATUS_KEYS.map((k) => <option key={k} value={k}>{PROJECT_STATUS[k][0]}</option>)}
              </select>
              {nextStatus && <button className={btnGhost} onClick={() => save({ ...form, status: nextStatus })}>Next: {PROJECT_STATUS[nextStatus][0]} →</button>}
            </div></label>
          <label className="text-xs text-slate-400">Tags (comma separated)
            <input className={`${inputCls} mt-1 w-full`} value={form.tags} placeholder="war, 2026, priority" onChange={(e) => setForm({ ...form, tags: e.target.value })} /></label>
          <label className="text-xs text-slate-400 md:col-span-2">Notes
            <textarea rows={8} className={`${inputCls} mt-1 w-full`} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
        </div>
        <div className="mt-3 flex items-center gap-3 text-[11px] text-slate-500">
          <span>Created {dateTime(p.createdAt)} · updated {dateTime(p.updatedAt)}</span>
          <button className="ml-auto text-down hover:underline" onClick={remove}>Delete project</button>
        </div>
      </Card>

      <Card title="Topic">
        {p.topicId ? (
          <>
            <p className="text-sm text-slate-300"><Link className="text-accent hover:underline" to={`/analytics/${p.topicId}`}>{p.topicName}</Link>
              {evidence && <> · <StatusBadge status={evidence.status} /> · score {evidence.score.toFixed(1)} ({Math.round(evidence.confidence * 100)}% confidence) · {evidence.videoCount} videos · {evidence.channelCount} channels · growth {growthPct(evidence.growthRate)}{evidence.momentumBasis === 'publication_proxy' ? ' (proxy)' : ''}</>}</p>
            {!evidence && <p className="mt-1 text-xs text-slate-500">This topic has no videos in the current analysis scope, so live numbers are not available.</p>}
            {research ? (
              <p className="mt-2 text-sm text-slate-400"><b className="text-slate-300">Research ({dateTime(research.createdAt)}, {research.sourceCount} sources): </b>{trunc(research.summary, 500)}{' '}
                <Link className="text-accent hover:underline" to={`/research/${p.topicId}`}>Open research →</Link></p>
            ) : <p className="mt-2 text-xs text-slate-500">Not researched yet. <Link className="text-accent hover:underline" to={`/research/${p.topicId}`}>Research this topic →</Link></p>}
          </>
        ) : <p className="text-sm text-slate-500">The topic behind this project no longer exists.</p>}
      </Card>

      {c ? (
        <Card title={`Saved concept: ${c.title}`} right={<button className={btnGhost} onClick={copy}>{copied ? 'Copied' : 'Copy as Markdown'}</button>}>
          <div className="space-y-3 text-sm text-slate-300">
            {c.openingHook && <p className="italic">{c.openingHook}</p>}
            <p>{c.storyline}</p>
            <p className="text-xs text-slate-500">{c.narrativeStructure}{c.durationMinutes ? ` · about ${c.durationMinutes} min` : ''}</p>
            <div className="space-y-1">
              {c.scenes.map((s) => (
                <div key={s.number} className="flex items-start gap-2 text-xs">
                  <span className="w-5 shrink-0 text-right text-slate-500">{s.number}.</span>
                  <span><b className="text-slate-200">{s.title}</b> <BasisBadge status={s.basis} /> <span className="text-slate-400">{trunc(s.description, 220)}</span></span>
                </div>
              ))}
            </div>
            {c.factCheckNotes?.length > 0 && (
              <div><div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Fact-check notes</div>
                <ul className="list-disc pl-4 text-xs text-slate-400">{c.factCheckNotes.map((n, i) => <li key={i}>{n}</li>)}</ul></div>
            )}
          </div>
        </Card>
      ) : p.animationIdeaId == null ? null : <Card><p className="text-sm text-slate-500">The saved concept was removed from the database.</p></Card>}
    </div>
  );
}

export default function Projects() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [filters, setFilters] = useState({ status: '', q: '', tag: '' });
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => api.projects(filters).then((d) => { setData(d); setError(''); }).catch((e) => setError(e.message)), [filters]);
  useEffect(() => { load(); }, [load]);

  if (!data) return <Page title="Saved projects">{error ? <Notice>{error}</Notice> : <p className="text-slate-400">Loading…</p>}</Page>;
  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <Page title="Saved projects" subtitle="Topics and animation concepts you decided to pursue, tracked through production">
      {error && <Notice>{error}</Notice>}
      <div className="flex flex-wrap items-center gap-1">
        <button className={pill(!filters.status)} onClick={() => setFilters({ ...filters, status: '' })}>All ({data.total})</button>
        {STATUS_KEYS.map((k) => (
          <button key={k} className={pill(filters.status === k)} onClick={() => setFilters({ ...filters, status: filters.status === k ? '' : k })}>
            {PROJECT_STATUS[k][0]} ({data.counts[k]})</button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <Card>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <input placeholder="Search projects" className={`${inputCls} w-44`} value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
              <select className={inputCls} value={filters.tag} onChange={(e) => setFilters({ ...filters, tag: e.target.value })}>
                <option value="">All tags</option>{data.allTags.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              {hasFilters && <button className={btnGhost} onClick={() => setFilters({ status: '', q: '', tag: '' })}>Clear</button>}
            </div>
            <div className="max-h-[70vh] space-y-2 overflow-auto">
              {data.items.map((p) => (
                <div key={p.id} onClick={() => navigate(`/projects/${p.id}`)}
                  className={`cursor-pointer rounded border p-3 hover:border-accent ${String(p.id) === id ? 'border-accent bg-bg/60' : 'border-line bg-bg/30'}`}>
                  <div className="flex items-start gap-2"><div className="min-w-0 flex-1 text-sm text-slate-200">{trunc(p.title, 70)}</div><Badge s={p.status} /></div>
                  <div className="mt-0.5 text-[11px] text-slate-500">{p.ideaTitle ? 'Concept' : 'Topic'}{p.topicName ? ` · ${trunc(p.topicName, 40)}` : ''} · updated {dateTime(p.updatedAt)}</div>
                  {p.tags.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{p.tags.map((t) => <span key={t} className="rounded bg-bg px-1.5 py-0.5 text-[10px] text-slate-400">{t}</span>)}</div>}
                </div>
              ))}
              {!data.items.length && <Empty>{hasFilters ? 'No projects match these filters.' : 'No projects yet. Use "Save project" on a topic, a research page or an animation concept.'}</Empty>}
            </div>
          </Card>
        </div>
        <div className="lg:col-span-3">
          {id ? <Detail key={id} id={id} onChanged={load} onDeleted={() => { navigate('/projects'); load(); }} />
            : <Card><Empty>Select a project to see its details, notes and saved concept.</Empty></Card>}
        </div>
      </div>
    </Page>
  );
}