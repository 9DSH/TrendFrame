import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/api.js';

const nf = new Intl.NumberFormat('en-US');
const n = (v) => (v == null ? '—' : nf.format(Math.round(v)));
const pct = (v) => (v == null ? '—' : `${(v * 100).toFixed(2)}%`);
const age = (h) => (h == null ? '—' : h < 48 ? `${h.toFixed(0)} h` : `${(h / 24).toFixed(1)} d`);
const BASIS = { snapshot_delta: 'from snapshots', lifetime_average: 'lifetime avg', none: 'n/a' };
const STATUS_COLOR = { completed: 'text-up', partial: 'text-yellow-400', failed: 'text-down', running: 'text-accent' };

function Card({ title, children }) {
  return (
    <section className="mb-4 rounded-lg border border-line bg-panel p-4">
      {title && <h2 className="mb-3 text-sm font-semibold text-slate-300">{title}</h2>}
      {children}
    </section>
  );
}

export default function Collection() {
  const [health, setHealth] = useState(null);
  const [cfg, setCfg] = useState({ categories: [] });
  const [form, setForm] = useState(null);
  const [quota, setQuota] = useState(null);
  const [stats, setStats] = useState(null);
  const [runs, setRuns] = useState([]);
  const [videos, setVideos] = useState([]);
  const [status, setStatus] = useState({ running: false });
  const [estimate, setEstimate] = useState(null);
  const [filters, setFilters] = useState({ q: '', category: '', sort: 'velocity' });
  const [error, setError] = useState('');
  const wasRunning = useRef(false);

  const refreshData = useCallback(async () => {
    try {
      const [q, s, r, v] = await Promise.all([api.quota(), api.stats(), api.runs(), api.videos(filters)]);
      setQuota(q); setStats(s); setRuns(r); setVideos(v);
    } catch (e) { setError(e.message); }
  }, [filters]);

  useEffect(() => {
    (async () => {
      try {
        const [h, c, s] = await Promise.all([api.health(), api.config(), api.settings()]);
        setHealth(h); setCfg(c);
        setForm({
          regions: s.regions.join(', '),
          categories: s.categories,
          searchesPerCategory: s.searches_per_category,
          refreshTracked: s.refresh_tracked,
        });
      } catch (e) { setError(`Cannot reach the API: ${e.message}`); }
    })();
  }, []);

  useEffect(() => { refreshData(); }, [refreshData]);

  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const s = await api.status();
        setStatus(s);
        if (wasRunning.current && !s.running) refreshData();
        wasRunning.current = s.running;
      } catch { /* server restarting */ }
    }, 2000);
    return () => clearInterval(t);
  }, [refreshData]);

  if (!form) return <p className="text-slate-400">{error || 'Loading…'}</p>;

  const body = () => ({
    regions: form.regions.split(',').map((s) => s.trim()).filter(Boolean),
    categories: form.categories,
    searchesPerCategory: Number(form.searchesPerCategory),
    refreshTracked: form.refreshTracked,
  });
  const run = async (fn) => { setError(''); try { await fn(); } catch (e) { setError(e.message); } };
  const toggleCat = (k) =>
    setForm((f) => ({ ...f, categories: f.categories.includes(k) ? f.categories.filter((x) => x !== k) : [...f.categories, k] }));

  const used = quota ? Math.min((quota.used / quota.limit) * 100, 100) : 0;
  const lastRun = runs[0];

  return (
    <>
      {health && !health.youtubeKeyConfigured && (
        <div className="mb-4 rounded-lg border border-down/50 bg-down/10 p-3 text-sm text-down">
          YOUTUBE_API_KEY is not set. Add it to <code>.env</code> and restart <code>npm run dev</code>.
        </div>
      )}
      {error && <div className="mb-4 rounded-lg border border-down/50 bg-down/10 p-3 text-sm text-down">{error}</div>}

      <div className="grid gap-4 md:grid-cols-3">
        <Card title="Database">
          <div className="grid grid-cols-2 gap-2 text-sm">
            {stats && Object.entries(stats).map(([k, v]) => (
              <div key={k}><div className="text-xl font-semibold text-white">{nf.format(v)}</div><div className="text-xs capitalize text-slate-500">{k}</div></div>
            ))}
          </div>
        </Card>
        <Card title="API quota (today, Pacific Time)">
        {quota && (<>
            {quota.exhausted && (
            <p className="mb-2 rounded border border-down/50 bg-down/10 p-2 text-xs text-down">
                Google reported the daily quota is exhausted. It resets at midnight Pacific Time.
            </p>
            )}
            <div className="mb-1 flex justify-between text-sm">
            <span>~{nf.format(quota.used)} / {nf.format(quota.limit)} units</span>
            <span className="text-slate-500">estimate</span>
            </div>
            <div className="h-2 rounded bg-bg"><div className="h-2 rounded bg-accent" style={{ width: `${used}%` }} /></div>
            <p className="mt-2 text-xs text-slate-500">
            Counted locally from the calls this app made. Nothing is blocked by this number; Google decides.
            Exact usage: Google Cloud Console → YouTube Data API v3 → Quotas.
            </p>
        </>)}
        </Card>
        <Card title="Status">
          {status.running
            ? <p className="text-sm text-accent">Running · {status.step}: {status.message}</p>
            : <p className="text-sm text-slate-400">{status.message || 'Idle'}</p>}
          {lastRun && <p className="mt-2 text-xs text-slate-500">Last run #{lastRun.id}: <span className={STATUS_COLOR[lastRun.status]}>{lastRun.status}</span></p>}
        </Card>
      </div>

      <Card title="Collection">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-slate-400">Countries (two-letter codes, comma separated)</label>
            <input className="mb-3 w-full rounded border border-line bg-bg px-2 py-1 text-sm" value={form.regions}
              onChange={(e) => setForm({ ...form, regions: e.target.value })} />
            <label className="mb-1 block text-xs text-slate-400">Keyword searches per category (each costs ~100 units)</label>
            <select className="mb-3 rounded border border-line bg-bg px-2 py-1 text-sm" value={form.searchesPerCategory}
              onChange={(e) => setForm({ ...form, searchesPerCategory: e.target.value })}>
              <option value={0}>0 (charts + tracking only, cheapest)</option><option value={1}>1</option><option value={2}>2</option>
            </select>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.refreshTracked} onChange={(e) => setForm({ ...form, refreshTracked: e.target.checked })} />
              Re-snapshot videos already tracked (builds growth history)
            </label>
          </div>
          <div>
            <div className="mb-1 text-xs text-slate-400">Categories</div>
            <div className="grid grid-cols-2 gap-1 text-sm">
              {cfg.categories.map((c) => (
                <label key={c.key} className="flex items-center gap-2">
                  <input type="checkbox" checked={form.categories.includes(c.key)} onChange={() => toggleCat(c.key)} />{c.label}
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50" disabled={status.running}
            onClick={() => run(async () => { await api.collect(body()); wasRunning.current = true; setStatus({ running: true, step: 'starting', message: '' }); })}>
            Collect now
          </button>
          <button className="rounded border border-line px-3 py-1.5 text-sm" onClick={() => run(async () => setEstimate(await api.estimate(body())))}>Estimate cost</button>
          <button className="rounded border border-line px-3 py-1.5 text-sm"
            onClick={() => run(() => api.saveSettings({ regions: body().regions, categories: body().categories, searches_per_category: body().searchesPerCategory, refresh_tracked: body().refreshTracked }))}>
            Save as defaults
          </button>
          <button className="rounded border border-line px-3 py-1.5 text-sm" onClick={refreshData}>Refresh view</button>
          {estimate && (
            <span className="text-xs text-slate-400">
              ~{nf.format(estimate.estimatedUnits)} units max ({estimate.counts.chart} charts, {estimate.counts.search} searches, {estimate.counts.tracked} tracked videos)
            </span>
          )}
        </div>
      </Card>

      <Card title="Recent runs">
        <table className="w-full text-left text-xs">
          <thead className="text-slate-500"><tr><th className="py-1">#</th><th>Started</th><th>Status</th><th>Videos</th><th>New</th><th>Snapshots</th><th>Units</th><th>Warnings / errors</th></tr></thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} className="border-t border-line align-top">
                <td className="py-1">{r.id}</td><td>{new Date(r.started_at).toLocaleString()}</td>
                <td className={STATUS_COLOR[r.status]}>{r.status}</td>
                <td>{r.videos_found}</td><td>{r.new_videos}</td><td>{r.snapshots_created}</td><td>{r.quota_used}</td>
                <td className="text-slate-400">{r.errors.map((e, i) => <div key={i} className={e.type === 'quota' ? 'text-down' : ''}>{e.label}: {e.message}</div>)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Collected videos (latest snapshot)">
        <div className="mb-3 flex flex-wrap gap-2">
          <input placeholder="Search title or channel" className="rounded border border-line bg-bg px-2 py-1 text-sm" value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
          <select className="rounded border border-line bg-bg px-2 py-1 text-sm" value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })}>
            <option value="">All categories</option>
            {cfg.categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <select className="rounded border border-line bg-bg px-2 py-1 text-sm" value={filters.sort} onChange={(e) => setFilters({ ...filters, sort: e.target.value })}>
            <option value="velocity">Sort: views/hour</option><option value="views">Sort: views</option>
            <option value="newest">Sort: newest</option><option value="engagement">Sort: engagement</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-slate-500">
              <tr><th className="py-1">Video</th><th>Channel</th><th>Views</th><th>Gained</th><th>Views/h <span className="text-accent2">(est.)</span></th><th>Engagement</th><th>Age</th><th>Snaps</th></tr>
            </thead>
            <tbody>
              {videos.map((v) => (
                <tr key={v.id} className="border-t border-line">
                  <td className="max-w-md py-1 pr-2"><a className="hover:text-accent" href={v.url} target="_blank" rel="noreferrer">{v.title}</a></td>
                  <td className="pr-2 text-slate-400">{v.channel_title}</td>
                  <td>{n(v.view_count)}</td>
                  <td className={v.views_gained ? 'text-up' : 'text-slate-500'}>{v.views_gained == null ? '—' : `+${n(v.views_gained)}`}</td>
                  <td>{n(v.views_per_hour)} <span className="text-[10px] text-accent2">{BASIS[v.velocity_basis]}</span></td>
                  <td>{pct(v.engagement_rate)}</td><td>{age(v.video_age_hours)}</td><td>{v.snapshot_count}</td>
                </tr>
              ))}
              {!videos.length && <tr><td colSpan="8" className="py-4 text-center text-slate-500">No videos yet. Run a collection.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500">Views, likes and gained views are measured. Views/hour is an estimate; the tag shows whether it comes from two real snapshots or from the video's lifetime average.</p>
      </Card>
    </>
  );
}