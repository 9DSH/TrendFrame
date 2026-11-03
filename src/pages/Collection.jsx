
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/api.js';
import Info from '../components/Info.jsx';
import { TypeBadge, TypeSelect } from '../components/ui.jsx';

const nf = new Intl.NumberFormat('en-US');
const n = (v) => (v == null ? '—' : nf.format(Math.round(v)));
const pct = (v) => (v == null ? '—' : `${(v * 100).toFixed(2)}%`);
const age = (h) => (h == null ? '—' : h < 48 ? `${h.toFixed(0)} h` : `${(h / 24).toFixed(1)} d`);
const BASIS = { snapshot_delta: 'from snapshots', lifetime_average: 'lifetime avg', none: 'n/a' };
const STATUS_COLOR = { completed: 'text-up', partial: 'text-yellow-400', failed: 'text-down', running: 'text-accent' };

function Card({ title, children, className = '' }) {
  return (
    <section className={`mb-3 rounded-lg border border-line bg-panel p-3 ${className}`}>
      {title && (
        <h2 className="mb-2 text-xs font-semibold tracking-wide text-slate-300">
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}

function Metric({ label, value }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-lg font-semibold leading-tight text-white">
        {nf.format(value)}
      </div>
      <div className="mt-0.5 truncate text-[10px] capitalize text-slate-500">
        {label.replaceAll('_', ' ')}
      </div>
    </div>
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
  const [filters, setFilters] = useState({ q: '', category: '', type: '', sort: 'velocity' });
  const [error, setError] = useState('');
  const wasRunning = useRef(false);

  const refreshData = useCallback(async () => {
    try {
      const [q, s, r, v] = await Promise.all([
        api.quota(), api.stats(), api.runs(), api.videos(filters)
      ]);
      setQuota(q);
      setStats(s);
      setRuns(r);
      setVideos(v);
    } catch (e) {
      setError(e.message);
    }
  }, [filters]);

  useEffect(() => {
    (async () => {
      try {
        const [h, c, s] = await Promise.all([
          api.health(), api.config(), api.settings()
        ]);
        setHealth(h);
        setCfg(c);
        setForm({
          regions: s.regions.join(', '),
          categories: s.categories,
          searchesPerCategory: s.searches_per_category,
          videoType: s.video_type,
          refreshTracked: s.refresh_tracked,
        });
      } catch (e) {
        setError(`Cannot reach the API: ${e.message}`);
      }
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

  if (!form) return <p className="text-sm text-slate-400">{error || 'Loading…'}</p>;

  const body = () => ({
    regions: form.regions.split(',').map((s) => s.trim()).filter(Boolean),
    categories: form.categories,
    videoType: form.videoType,
    searchesPerCategory: Number(form.searchesPerCategory),
    refreshTracked: form.refreshTracked,
  });

  const run = async (fn) => {
    setError('');
    try { await fn(); } catch (e) { setError(e.message); }
  };

  const toggleCat = (k) =>
    setForm((f) => ({
      ...f,
      categories: f.categories.includes(k)
        ? f.categories.filter((x) => x !== k)
        : [...f.categories, k]
    }));

  const used = quota ? Math.min((quota.used / quota.limit) * 100, 100) : 0;
  const lastRun = runs[0];

  return (
    <>
      {health && !health.youtubeKeyConfigured && (
        <div className="mb-3 rounded border border-down/50 bg-down/10 px-3 py-2 text-xs text-down">
          YOUTUBE_API_KEY is not set. Add it to <code>.env</code> and restart <code>npm run dev</code>.
        </div>
      )}

      {error && (
        <div className="mb-3 rounded border border-down/50 bg-down/10 px-3 py-2 text-xs text-down">
          {error}
        </div>
      )}

      {/* Compact statistics */}
      <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-3">

        <Card title="Database" className="mb-0">
          <div className="grid grid-cols-3 gap-x-3 gap-y-3">
            {stats && Object.entries(stats).map(([k, v]) => (
              <Metric key={k} label={k} value={v} />
            ))}
          </div>
        </Card>

        <Card title={<>API quota (today, Pacific Time) <Info term="quota" /></>} className="mb-0">
          {quota && (
            <div className="space-y-2">
              {quota.exhausted && (
                <p className="rounded border border-down/50 bg-down/10 px-2 py-1.5 text-[10px] text-down">
                  Daily quota exhausted. Resets at midnight Pacific Time.
                </p>
              )}

              <div className="flex items-baseline justify-between">
                <span className="text-base font-semibold text-white">
                  {nf.format(quota.used)}
                  <span className="text-xs font-normal text-slate-500"> / {nf.format(quota.limit)} units</span>
                </span>
                <span className="text-[10px] text-slate-500">Estimated</span>
              </div>

              <div className="h-1.5 overflow-hidden rounded-full bg-bg">
                <div
                  className="h-full rounded-full bg-accent transition-all"
                  style={{ width: `${used}%` }}
                />
              </div>

              <p className="text-[10px] leading-relaxed text-slate-500">
                Counted locally from this app's calls. Nothing is blocked by this number;
                Google decides. Exact usage: Google Cloud Console → YouTube Data API v3 → Quotas.
              </p>
            </div>
          )}
        </Card>

        <Card title="Status" className="mb-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className={`h-2 w-2 shrink-0 rounded-full ${status.running ? 'bg-accent animate-pulse' : 'bg-slate-600'}`} />
              <span className={`truncate text-sm font-medium ${status.running ? 'text-accent' : 'text-slate-400'}`}>
                {status.running ? 'Running' : 'Idle'}
              </span>
            </div>
            {lastRun && (
              <span className={`shrink-0 text-xs ${STATUS_COLOR[lastRun.status]}`}>
                Last run #{lastRun.id}: {lastRun.status}
              </span>
            )}
          </div>

          <p className="mt-2 text-xs text-slate-400">
            {status.running
              ? `${status.step}: ${status.message}`
              : status.message || 'Waiting for collection'}
          </p>
        </Card>
      </div>

      {/* Collection configuration */}
      <Card title="Collection settings">
        <div className="grid gap-3 md:grid-cols-2">

          <div className="grid grid-cols-2 gap-x-3 gap-y-2">

            <div className="col-span-2">
              <label className="mb-1 block text-[10px] text-slate-400">
                Countries (two-letter codes, comma separated)
              </label>
              <input
                className="w-full rounded border border-line bg-bg px-2 py-1.5 text-xs"
                value={form.regions}
                onChange={(e) => setForm({ ...form, regions: e.target.value })}
              />
            </div>

            <div>
              <label className="mb-1 block text-[10px] text-slate-400">
                Keyword searches per category <Info term="quota" />
              </label>
              <select
                className="w-full rounded border border-line bg-bg px-2 py-1.5 text-xs"
                value={form.searchesPerCategory}
                onChange={(e) => setForm({ ...form, searchesPerCategory: e.target.value })}
              >
                <option value={0}>0 (charts + tracking only)</option>
                <option value={1}>1</option>
                <option value={2}>2</option>
              </select>
              <p className="mt-1 text-[10px] text-slate-500">Each search costs ~100 units</p>
            </div>

            <div>
              <label className="mb-1 block text-[10px] text-slate-400">
                Video types to collect <Info term="video_type" />
              </label>
              <select
                className="w-full rounded border border-line bg-bg px-2 py-1.5 text-xs"
                value={form.videoType}
                onChange={(e) => setForm({ ...form, videoType: e.target.value })}
              >
                <option value="both">Both (Shorts and long)</option>
                <option value="short">Shorts only</option>
                <option value="long">Long videos only</option>
              </select>
            </div>

            <label className="col-span-2 flex items-center gap-2 text-xs text-slate-400">
              <input
                type="checkbox"
                checked={form.refreshTracked}
                onChange={(e) => setForm({ ...form, refreshTracked: e.target.checked })}
              />
              Re-snapshot videos already tracked (builds growth history)
            </label>
          </div>

          <div>
            <div className="mb-2 text-[10px] text-slate-400">Categories</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
              {cfg.categories.map((c) => (
                <label key={c.key} className="flex items-center gap-2 text-slate-300">
                  <input
                    type="checkbox"
                    checked={form.categories.includes(c.key)}
                    onChange={() => toggleCat(c.key)}
                  />
                  {c.label}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <button
            className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            disabled={status.running}
            onClick={() => run(async () => {
              await api.collect(body());
              wasRunning.current = true;
              setStatus({ running: true, step: 'starting', message: '' });
            })}
          >
            Collect now
          </button>

          <button
            className="rounded border border-line px-3 py-1.5 text-xs hover:bg-bg"
            onClick={() => run(async () => setEstimate(await api.estimate(body())))}
          >
            Estimate cost
          </button>

          <button
            className="rounded border border-line px-3 py-1.5 text-xs hover:bg-bg"
            onClick={() => run(() => api.saveSettings({
              regions: body().regions,
              video_type: body().videoType,
              categories: body().categories,
              searches_per_category: body().searchesPerCategory,
              refresh_tracked: body().refreshTracked
            }))}
          >
            Save as defaults
          </button>

          <button
            className="rounded border border-line px-3 py-1.5 text-xs hover:bg-bg"
            onClick={refreshData}
          >
            Refresh view
          </button>

          {estimate && (
            <span className="text-[10px] text-slate-400">
              ~{nf.format(estimate.estimatedUnits)} units max
              ({estimate.counts.chart} charts, {estimate.counts.search} searches,
              {estimate.counts.tracked} tracked videos)
            </span>
          )}
        </div>
      </Card>

      {/* Recent runs */}
      <Card title="Recent runs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px]">
            <thead className="text-slate-500">
              <tr className="border-b border-line">
                <th className="py-2 pr-2">#</th>
                <th className="pr-2">Trigger</th>
                <th className="pr-2">Started</th>
                <th className="pr-2">Status</th>
                <th className="pr-2">Videos</th>
                <th className="pr-2">New</th>
                <th className="pr-2">Snapshots</th>
                <th className="pr-2">Units</th>
                <th>Warnings / errors</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-b border-line/50 align-top hover:bg-bg/30">
                  <td className="py-2 pr-2 text-slate-400">{r.id}</td>
                  <td className="pr-2">{r.trigger}</td>
                  <td className="whitespace-nowrap pr-2 text-slate-400">
                    {new Date(r.started_at).toLocaleString()}
                  </td>
                  <td className={`whitespace-nowrap pr-2 ${STATUS_COLOR[r.status]}`}>
                    {r.status}
                  </td>
                  <td className="pr-2">{r.videos_found}</td>
                  <td className="pr-2">{r.new_videos}</td>
                  <td className="pr-2">{r.snapshots_created}</td>
                  <td className="pr-2">{r.quota_used}</td>
                  <td className="min-w-40 text-slate-400">
                    {r.errors.map((e, i) => (
                      <div key={i} className={e.type === 'quota' ? 'text-down' : ''}>
                        {e.label}: {e.message}
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
              {!runs.length && (
                <tr>
                  <td colSpan="9" className="py-4 text-center text-slate-500">
                    No collection runs yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Collected videos */}
      <Card title="Collected videos (latest snapshot)">
        <div className="mb-3 flex flex-wrap gap-2">
          <input
            placeholder="Search title or channel"
            className="min-w-40 flex-1 rounded border border-line bg-bg px-2 py-1.5 text-xs"
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
          />

          <select
            className="rounded border border-line bg-bg px-2 py-1.5 text-xs"
            value={filters.category}
            onChange={(e) => setFilters({ ...filters, category: e.target.value })}
          >
            <option value="">All categories</option>
            {cfg.categories.map((c) => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>

          <TypeSelect
            value={filters.type}
            onChange={(type) => setFilters({ ...filters, type })}
          />

          <select
            className="rounded border border-line bg-bg px-2 py-1.5 text-xs"
            value={filters.sort}
            onChange={(e) => setFilters({ ...filters, sort: e.target.value })}
          >
            <option value="velocity">Sort: views/hour</option>
            <option value="views">Sort: views</option>
            <option value="newest">Sort: newest</option>
            <option value="engagement">Sort: engagement</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px]">
            <thead className="text-slate-500">
              <tr className="border-b border-line">
                <th className="py-2 pr-3">Video</th>
                <th className="pr-2">Type</th>
                <th className="pr-2">Channel</th>
                <th className="pr-2">Views</th>
                <th className="pr-2">Gained <Info term="views_gained" /></th>
                <th className="pr-2">Views/h <Info term="views_per_hour" /></th>
                <th className="pr-2">Engagement <Info term="engagement_rate" /></th>
                <th className="pr-2">Age <Info term="video_age" /></th>
                <th>Snaps <Info term="snapshots" /></th>
              </tr>
            </thead>
            <tbody>
              {videos.map((v) => (
                <tr key={v.id} className="border-b border-line/50 hover:bg-bg/30">
                  <td className="max-w-xs py-2 pr-3">
                    <a
                      className="line-clamp-2 hover:text-accent"
                      href={v.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {v.title}
                    </a>
                  </td>
                  <td className="whitespace-nowrap pr-2">
                    <TypeBadge type={v.video_type} />
                  </td>
                  <td className="max-w-36 truncate pr-2 text-slate-400">
                    {v.channel_title}
                  </td>
                  <td className="whitespace-nowrap pr-2">{n(v.view_count)}</td>
                  <td className={`whitespace-nowrap pr-2 ${v.views_gained ? 'text-up' : 'text-slate-500'}`}>
                    {v.views_gained == null ? '—' : `+${n(v.views_gained)}`}
                  </td>
                  <td className="whitespace-nowrap pr-2">
                    {n(v.views_per_hour)}
                    <span className="ml-1 text-[9px] text-accent2">
                      {BASIS[v.velocity_basis]}
                    </span>
                  </td>
                  <td className="whitespace-nowrap pr-2">{pct(v.engagement_rate)}</td>
                  <td className="whitespace-nowrap pr-2">{age(v.video_age_hours)}</td>
                  <td>{v.snapshot_count}</td>
                </tr>
              ))}

              {!videos.length && (
                <tr>
                  <td colSpan="9" className="py-5 text-center text-slate-500">
                    No videos yet. Run a collection.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="mt-2 border-t border-line pt-2 text-[10px] leading-relaxed text-slate-500">
          Views, likes and gained views are measured. Views/hour is an estimate;
          the tag shows whether it comes from two real snapshots or from the video's lifetime average.
        </p>
      </Card>
    </>
  );
}
