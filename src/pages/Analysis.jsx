import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/api.js';
import Info from '../components/Info.jsx';
import ScopeBadge from '../components/ScopeBadge.jsx';
import { TypeBadge, TypeSelect } from '../components/ui.jsx';

const nf = new Intl.NumberFormat('en-US');
const STATUS = {
  emerging: ['Emerging', 'bg-accent2/20 text-accent2'],
  growing: ['Rapidly growing', 'bg-up/20 text-up'],
  sustained: ['Sustained', 'bg-accent/20 text-accent'],
  declining: ['Declining', 'bg-down/20 text-down'],
  saturated: ['Saturated', 'bg-yellow-400/20 text-yellow-400'],
  unclear: ['Unclear', 'bg-slate-500/20 text-slate-400'],
};
const METRICS = {
  trend_momentum: 'Trend momentum', view_velocity: 'View velocity', engagement: 'Engagement', cross_channel: 'Cross-channel interest',
  competition: 'Competition opportunity', long_term: 'Long-term relevance', animation_potential: 'Animation potential',
};
const KIND = { measured: 'text-up', estimated: 'text-accent2', heuristic: 'text-yellow-400' };
const FLAGS = { low_competition: 'Low competition', cross_channel: 'Cross-channel', saturated: 'Saturated', proxy_momentum: 'Proxy momentum', low_confidence: 'Low confidence', needs_review: 'Needs review' };
const growth = (g) => (g == null ? '—' : `${g >= 0 ? '+' : ''}${(g * 100).toFixed(0)}%`);

const Badge = ({ status }) => {
  const [label, cls] = STATUS[status] ?? STATUS.unclear;
  return <span className={`rounded px-1.5 py-0.5 text-[11px] ${cls}`}>{label}</span>;
};
const Card = ({ title, children, className = '' }) => (
  <section className={`mb-4 rounded-lg border border-line bg-panel p-4 ${className}`}>
    {title && <h2 className="mb-3 text-sm font-semibold text-slate-300">{title}</h2>}
    {children}
  </section>
);
const input = 'rounded border border-line bg-bg px-2 py-1 text-sm';

export default function Analysis() {
  const [topics, setTopics] = useState([]);
  const [cats, setCats] = useState([]);
  const [filters, setFilters] = useState({ q: '', category: '', status: '', flag: '', type: '', sort: 'score' });
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [weights, setWeights] = useState(null);
  const [defaults, setDefaults] = useState(null);
  const [settings, setSettings] = useState({ ai_topic_labeling: false, auto_analyze: true });
  const [health, setHealth] = useState(null);
  const [status, setStatus] = useState({ running: false, warnings: [] });
  const [error, setError] = useState('');
  const wasRunning = useRef(false);

  const loadTopics = useCallback(async () => {
    try { setTopics(await api.topics(filters)); } catch (e) { setError(e.message); }
  }, [filters]);
  const loadDetail = useCallback(async (id) => {
    if (!id) return setDetail(null);
    try { setDetail(await api.topic(id)); } catch (e) { setError(e.message); }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [c, w, s, h] = await Promise.all([api.config(), api.weights(), api.settings(), api.health()]);
        setCats(c.categories); setWeights(w.weights); setDefaults(w.defaults); setHealth(h);
        setSettings({ ai_topic_labeling: s.ai_topic_labeling, auto_analyze: s.auto_analyze });
      } catch (e) { setError(`Cannot reach the API: ${e.message}`); }
    })();
  }, []);
  useEffect(() => { loadTopics(); }, [loadTopics]);
  useEffect(() => { loadDetail(selected); }, [selected, loadDetail]);

  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const s = await api.analysisStatus();
        setStatus(s);
        if (wasRunning.current && !s.running) { loadTopics(); loadDetail(selected); }
        wasRunning.current = s.running;
      } catch { /* server restarting */ }
    }, 2000);
    return () => clearInterval(t);
  }, [loadTopics, loadDetail, selected]);

  const run = async (fn) => { setError(''); try { await fn(); } catch (e) { setError(e.message); } };
  const saveSetting = (patch) => run(async () => { await api.saveSettings(patch); setSettings((s) => ({ ...s, ...patch })); });
  const weightSum = weights ? Object.values(weights).reduce((a, b) => a + Number(b || 0), 0) : 0;
  const c = detail?.score?.components;

  return (
    <>
      {error && <div className="mb-4 rounded-lg border border-down/50 bg-down/10 p-3 text-sm text-down">{error}</div>}

      <Card title="Analysis">
        <div className="flex flex-wrap items-center gap-3">
          <button className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50" disabled={status.running}
            onClick={() => run(async () => { await api.analysisRun(); wasRunning.current = true; setStatus({ running: true, step: 'starting', message: 'Starting…', warnings: [] }); })}>
            Run analysis
          </button>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={settings.auto_analyze} onChange={(e) => saveSetting({ auto_analyze: e.target.checked })} />
            Run automatically after each collection
          </label>
          <label className={`flex items-center gap-2 text-sm ${health?.openaiKeyConfigured ? '' : 'opacity-50'}`}
            title={health?.openaiKeyConfigured ? '' : 'Add OPENAI_API_KEY to .env'}>
            <input type="checkbox" disabled={!health?.openaiKeyConfigured} checked={settings.ai_topic_labeling}
              onChange={(e) => saveSetting({ ai_topic_labeling: e.target.checked })} />
            Name topics with OpenAI (sends video titles, small cost)
          </label>
        </div>
        <p className={`mt-2 text-sm ${status.running ? 'text-accent' : 'text-slate-400'}`}>{status.message}</p>
        {status.warnings?.map((w, i) => <p key={i} className="text-xs text-yellow-400">{w}</p>)}
      </Card>

      {weights && (
        <Card title="Scoring weights (applied instantly, no re-collection needed)">
          <div className="grid gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {Object.keys(METRICS).map((k) => (
              <label key={k} className="text-xs text-slate-400">{METRICS[k]}<Info term={k} />
                <input type="number" min="0" max="100" className={`${input} mt-1 w-full`} value={weights[k]}
                  onChange={(e) => setWeights({ ...weights, [k]: e.target.value })} />
              </label>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <button className="rounded bg-accent px-3 py-1 text-white"
              onClick={() => run(async () => {
                const w = Object.fromEntries(Object.entries(weights).map(([k, v]) => [k, Number(v)]));
                setWeights((await api.saveWeights(w)).weights); await loadTopics(); await loadDetail(selected);
              })}>Apply weights</button>
            <button className="rounded border border-line px-3 py-1" onClick={() => setWeights(defaults)}>Reset to defaults</button>
            <span className="text-xs text-slate-500">Total {weightSum} (weights are normalised, so they don't need to add up to 100)</span>
          </div>
        </Card>
      )}

      <Card title={`Topics (${topics.length})`}>
        <div className="mb-3 flex flex-wrap gap-2">
          <input placeholder="Search topics" className={input} value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
          <select className={input} value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })}>
            <option value="">All categories</option>{cats.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
          </select>
          <select className={input} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
            <option value="">All statuses</option>{Object.entries(STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
          </select>
             <TypeSelect value={filters.type} onChange={(type) => setFilters({ ...filters, type })} title="Topics that contain at least one video of this type" />
          <select className={input} value={filters.flag} onChange={(e) => setFilters({ ...filters, flag: e.target.value })}>
            <option value="">Any flag</option>{Object.entries(FLAGS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <select className={input} value={filters.sort} onChange={(e) => setFilters({ ...filters, sort: e.target.value })}>
            <option value="score">Sort: opportunity score</option><option value="growth">Sort: growth</option><option value="confidence">Sort: confidence</option>
            <option value="videos">Sort: videos</option><option value="channels">Sort: channels</option><option value="updated">Sort: updated</option><option value="name">Sort: name</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-slate-500">
              <tr><th className="py-1">Topic</th><th>Category</th><th>Score</th><th>Confidence<Info term="confidence" /></th><th>Status</th>
                <th title="Growth relative to what is expected for videos of that age">Growth</th><th>Videos</th><th>Channels</th><th>Shorts / Long<Info term="video_type" /></th><th>Competition</th><th>Flags</th></tr>
            </thead>
            <tbody>
              {topics.map((t) => (
                <tr key={t.id} onClick={() => setSelected(t.id)}
                  className={`cursor-pointer border-t border-line hover:bg-bg/60 ${selected === t.id ? 'bg-bg/60' : ''}`}>
                  <td className="max-w-xs py-1.5 pr-2"><div className="text-slate-200">{t.name}</div>
                    <div className="text-[10px] text-slate-500">{t.namedBy === 'ai' ? 'AI name' : t.terms.slice(0, 4).join(', ')}</div></td>
                  <td className="pr-2 text-slate-400">{cats.find((x) => x.key === t.category)?.label ?? t.category}</td>
                  <td className="pr-3"><div className="font-semibold text-white">{t.score.toFixed(1)}</div>
                    <div className="h-1 w-16 rounded bg-bg"><div className="h-1 rounded bg-accent" style={{ width: `${t.score}%` }} /></div></td>
                  <td className={t.confidence < 0.4 ? 'text-yellow-400' : 'text-slate-300'}>{Math.round(t.confidence * 100)}%</td>
                  <td><Badge status={t.status} /></td>
                  <td className={t.growthRate == null ? '' : t.growthRate >= 0 ? 'text-up' : 'text-down'}>
                    {growth(t.growthRate)} {t.momentumBasis === 'publication_proxy' && <span className="text-[10px] text-accent2">proxy</span>}</td>
                  <td>{t.videoCount}</td>                  <td className="whitespace-nowrap">{t.shortCount == null ? '—' : `${t.shortCount} / ${t.longCount}`}</td><td className="capitalize">{t.competitionLevel}</td>
                  <td className="text-[10px] text-slate-400">{t.flags.map((f) => FLAGS[f]).join(' · ')}</td>
                </tr>
              ))}
              {!topics.length && <tr><td colSpan="11" className="py-4 text-center text-slate-500">No topics yet. Collect data, then run the analysis.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Opportunity scores are estimates, not predictions of virality. Percentile-based metrics are relative to the topics currently monitored.
        </p>
      </Card>

      {detail && c && (
        <Card title={`Why "${detail.topic.name}" scores ${detail.score.score.toFixed(1)}`}>
          <p className="mb-3 text-xs text-slate-400">
            <Badge status={detail.score.status} /> · confidence {Math.round(detail.score.confidence * 100)}% · {c.stats.videoCount} videos · {c.stats.channelCount} channels ·
            {' '}{nf.format(c.stats.totalViews)} total views · computed {new Date(detail.score.computedAt).toLocaleString()}
            {detail.topic.meta.ai?.reason && <> · AI note: {detail.topic.meta.ai.reason}</>}
          </p>
          <table className="mb-4 w-full text-left text-xs">
            <thead className="text-slate-500"><tr><th className="py-1">Metric</th><th>Type</th><th>Value (0-100)</th><th>Weight</th><th>Points</th><th>How it was computed</th></tr></thead>
            <tbody>
              {Object.keys(METRICS).map((k) => {
                const m = c.metrics[k]; const w = c.contributions[k];
                return (
                  <tr key={k} className={`border-t border-line align-top ${w.excluded ? 'opacity-50' : ''}`}>
                    <td className="py-1 pr-2 text-slate-200">{METRICS[k]}<Info term={k} /></td>
                    <td className={KIND[m.kind]}>{m.kind}{m.basis === 'publication_proxy' ? ' (proxy)' : ''}</td>
                    <td>{m.value == null ? 'n/a' : m.value.toFixed(1)}</td>
                    <td>{w.excluded ? 'excluded' : `${w.effectiveWeight.toFixed(1)}%`}</td>
                    <td>{w.points == null ? '—' : w.points.toFixed(1)}</td>
                    <td className="max-w-md text-slate-400">{m.note}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <h3 className="mb-1 text-xs font-semibold text-slate-300">Videos in this topic</h3>
          <table className="w-full text-left text-xs">
            <thead className="text-slate-500"><tr><th className="py-1">Video</th><th>Type</th><th>Channel</th><th>Match</th><th>Views</th><th>Views/h</th></tr></thead>
            <tbody>
              {detail.videos.map((v) => (
                <tr key={v.id} className="border-t border-line">
                  <td className="max-w-md py-1 pr-2"><a className="hover:text-accent" href={v.url} target="_blank" rel="noreferrer">{v.title}</a></td>
                  <td className="pr-2 text-slate-400"><TypeBadge type={v.video_type} /></td>      
                  <td className="pr-2 text-slate-400">{v.channel_title}</td>
                  <td>{(v.similarity * 100).toFixed(0)}%</td>
                  <td>{nf.format(v.view_count)}</td>
                  <td>{v.views_per_hour == null ? '—' : nf.format(Math.round(v.views_per_hour))} <span className="text-[10px] text-accent2">{v.velocity_basis === 'snapshot_delta' ? 'measured gain' : 'lifetime avg'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}