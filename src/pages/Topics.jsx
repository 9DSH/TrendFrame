import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api.js';
import { Card, TypeSelect, Direction, Empty, inputCls, Notice, Page, StatusBadge, btnGhost } from '../components/ui.jsx';
import { COMPETITION_ORDER, COMPETITION_STYLE, STATUS, dateTime, growthPct, num } from '../utils/format.js';
import Info from '../components/Info.jsx';
import ScopeBadge from '../components/ScopeBadge.jsx';

const COLUMNS = [
  { key: 'name', label: 'Topic', get: (t) => t.name.toLowerCase() },
  { key: 'category', label: 'Category', get: (t) => t.category ?? '' },
  { key: 'score', label: 'Opportunity', info: 'opportunity_score', get: (t) => t.score },
  { key: 'growth', label: 'Growth', info: 'trend_momentum', get: (t) => t.growthRate ?? -Infinity },
  { key: 'status', label: 'Trend', info: 'status', get: (t) => t.status },
  { key: 'videos', label: 'Videos', get: (t) => t.videoCount },
  { key: 'channels', label: 'Channels', info: 'cross_channel', get: (t) => t.channelCount },
  { key: 'mix', label: 'Shorts / Long', info: 'video_type', get: (t) => t.shortCount ?? -1 },
  { key: 'competition', label: 'Competition', info: 'competition', get: (t) => COMPETITION_ORDER[t.competitionLevel] ?? 5 },
  { key: 'updated', label: 'Updated', get: (t) => t.computedAt },
];
const PERIODS = [['', 'Any time'], ['1', 'Last 24 h'], ['3', 'Last 3 days'], ['7', 'Last 7 days'], ['14', 'Last 14 days'], ['30', 'Last 30 days']];

export default function Topics() {
  const navigate = useNavigate();
  const [cfg, setCfg] = useState({ categories: [] });
  const [regions, setRegions] = useState([]);
  const [filters, setFilters] = useState({ q: '', category: '', status: '', region: '', days: '' , type: ''});
  const [sort, setSort] = useState({ key: 'score', dir: 'desc' });
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [visible, setVisible] = useState(50);

  useEffect(() => {
    Promise.all([api.config(), api.regions()]).then(([c, r]) => { setCfg(c); setRegions(r); }).catch((e) => setError(e.message));
  }, []);

  const { q, ...serverFilters } = filters; // search is applied locally, the rest on the server
  const serverKey = JSON.stringify(serverFilters);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.topics(serverFilters)
      .then((list) => { if (alive) { setItems(list); setError(''); setVisible(50); } })
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [serverKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const col = COLUMNS.find((c) => c.key === sort.key) ?? COLUMNS[2];
    const sign = sort.dir === 'asc' ? 1 : -1;
    return items
      .filter((t) => !needle || t.name.toLowerCase().includes(needle) || t.terms.some((x) => x.includes(needle)))
      .sort((a, b) => {
        const x = col.get(a), y = col.get(b);
        return (typeof x === 'string' ? x.localeCompare(y) : x - y) * sign;
      });
  }, [items, q, sort]);

  const catLabel = (k) => cfg.categories.find((c) => c.key === k)?.label ?? k;
  const clickSort = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' || key === 'category' ? 'asc' : 'desc' }));
  const set = (patch) => setFilters((f) => ({ ...f, ...patch }));
  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <Page title="Trending topics" subtitle="Click a column to sort, click a row to open its analytics">
      <ScopeBadge />
      {error && <Notice>{error}</Notice>}
      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input placeholder="Search topics or keywords" className={`${inputCls} w-56`} value={filters.q} onChange={(e) => set({ q: e.target.value })} />
          <select className={inputCls} value={filters.region} onChange={(e) => set({ region: e.target.value })} title="Topics with at least one video seen in this country">
            <option value="">All countries</option>{regions.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <select className={inputCls} value={filters.category} onChange={(e) => set({ category: e.target.value })}>
            <option value="">All categories</option>{cfg.categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <select className={inputCls} value={filters.status} onChange={(e) => set({ status: e.target.value })}>
            <option value="">All trend statuses</option>{Object.entries(STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <TypeSelect value={filters.type} onChange={(type) => set({ type })} title="Topics that contain at least one video of this type" />
          <select className={inputCls} value={filters.days} onChange={(e) => set({ days: e.target.value })} title="Topic has a video published within this period">
            {PERIODS.map(([v, l]) => <option key={v} value={v}>{v ? `Active: ${l}` : 'Any date'}</option>)}
          </select>
          {hasFilters && <button className={btnGhost} onClick={() => setFilters({ q: '', category: '', status: '', region: '', days: '', type: '' })}>Clear</button>}
          <span className="ml-auto text-xs text-slate-500">{loading ? 'Loading…' : `${rows.length} topics`}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-slate-500">
              <tr>
                {COLUMNS.map((c) => (
                  <th key={c.key} onClick={() => clickSort(c.key)} className="cursor-pointer select-none whitespace-nowrap py-1.5 pr-3 hover:text-slate-300">
                    {c.label}{c.info && <Info term={c.info} />}{sort.key === c.key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, visible).map((t) => (
                <tr key={t.id} onClick={() => navigate(`/analytics/${t.id}`)} className="cursor-pointer border-t border-line hover:bg-bg/60">
                  <td className="max-w-xs py-2 pr-3">
                    <Link to={`/analytics/${t.id}`} onClick={(e) => e.stopPropagation()} className="text-slate-200 hover:text-accent">{t.name}</Link>
                    <div className="text-[10px] text-slate-500">{t.namedBy === 'ai' ? 'AI-named' : t.terms.slice(0, 4).join(', ')}</div>
                  </td>
                  <td className="pr-3 text-slate-400">{catLabel(t.category)}</td>
                  <td className="pr-3">
                    <div className="font-semibold text-white">{t.score.toFixed(1)} <span className={`text-[10px] font-normal ${t.confidence < 0.4 ? 'text-yellow-400' : 'text-slate-500'}`}>{Math.round(t.confidence * 100)}% conf.</span></div>
                    <div className="h-1 w-20 rounded bg-bg"><div className="h-1 rounded bg-accent" style={{ width: `${t.score}%` }} /></div>
                  </td>
                  <td className={`pr-3 whitespace-nowrap ${t.growthRate == null ? '' : t.growthRate >= 0 ? 'text-up' : 'text-down'}`}>
                    {growthPct(t.growthRate)} {t.momentumBasis === 'publication_proxy' && <span className="text-[10px] text-accent2">proxy</span>}
                  </td>
                  <td className="pr-3 whitespace-nowrap"><Direction direction={t.direction} /> <StatusBadge status={t.status} /></td>
                  <td className="pr-3">{num(t.videoCount)}</td>
                  <td className="whitespace-nowrap pr-3">{t.shortCount == null ? '—' : `${t.shortCount} / ${t.longCount}`}</td>
                  <td className="pr-3">{num(t.channelCount)}</td>
                  
                  <td className={`pr-3 capitalize ${COMPETITION_STYLE[t.competitionLevel]}`}>{t.competitionLevel}</td>
                  <td className="whitespace-nowrap text-slate-400">{dateTime(t.computedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && !rows.length && <Empty>{hasFilters ? 'No topics match these filters.' : 'No topics yet. Collect data, then run the analysis.'}</Empty>}
        </div>
        {rows.length > visible && (
          <div className="mt-3 text-center"><button className={btnGhost} onClick={() => setVisible((v) => v + 50)}>Show 50 more ({rows.length - visible} left)</button></div>
        )}
        <p className="mt-3 text-xs text-slate-500">
          Country filter: topics with at least one video seen in that country's chart or search (counts show all videos in the topic).
          Date filter: topics with a video published in the period. Competition: higher means a more crowded topic.
        </p>
      </Card>
    </Page>
  );
}