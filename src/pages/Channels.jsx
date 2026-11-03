import { useEffect, useState } from 'react';
import { api } from '../services/api.js';
import Info from '../components/Info.jsx';
import { Card, Empty, Notice, Page, Stat, TypeBadge, TypeSelect, inputCls } from '../components/ui.jsx';
import { dateTime, num, short } from '../utils/format.js';

const SORTS = [['views', 'Total views'], ['short_views', 'Shorts views'], ['long_views', 'Long views'], ['shorts', 'Shorts count'],
  ['longs', 'Long count'], ['videos', 'Videos'], ['subscribers', 'Subscribers'], ['name', 'Name']];
const dur = (s) => (s == null || s <= 0 ? '—' : s < 3600 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${(s / 3600).toFixed(1)} h`);

export default function Channels() {
  const [filters, setFilters] = useState({ q: '', type: '', sort: 'views' });
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [vtype, setVtype] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    api.channels(filters).then((d) => { if (alive) { setData(d); setError(''); } }).catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [filters]);
  useEffect(() => {
    if (!selected) { setDetail(null); return undefined; }
    let alive = true;
    api.channel(selected).then((d) => alive && setDetail(d)).catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [selected]);

  if (!data) return <Page title="Channels">{error ? <Notice>{error}</Notice> : <p className="text-slate-400">Loading…</p>}</Page>;
  const { totals, channels, shortMaxSeconds } = data;
  const videos = detail ? detail.videos.filter((v) => !vtype || v.video_type === vtype) : [];

  return (
    <Page title="Channels" subtitle={`Shorts are videos up to ${shortMaxSeconds} s. Numbers count only videos TrendFrame has collected, not each channel's whole catalogue.`}>
      {error && <Notice>{error}</Notice>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Shorts collected" info="video_type" value={num(totals.short.videos)} sub={`${num(totals.short.channels)} channels`} tone="text-accent2" />
        <Stat label="Shorts views" value={short(totals.short.views)} sub="latest snapshots" />
        <Stat label="Long videos collected" value={num(totals.long.videos)} sub={`${num(totals.long.channels)} channels`} tone="text-accent" />
        <Stat label="Long video views" value={short(totals.long.views)} sub="latest snapshots" />
      </div>

      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input placeholder="Search channels" className={`${inputCls} w-56`} value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
          <TypeSelect value={filters.type} title="Only channels that have this type of video" onChange={(type) => setFilters({ ...filters, type })} />
          <select className={inputCls} value={filters.sort} onChange={(e) => setFilters({ ...filters, sort: e.target.value })}>
            {SORTS.map(([k, l]) => <option key={k} value={k}>Sort: {l}</option>)}
          </select>
          <span className="ml-auto text-xs text-slate-500">{data.total} channels{data.total > channels.length ? ` (top ${channels.length} shown)` : ''}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-slate-500">
              <tr><th className="py-1">Channel</th><th>Subscribers</th><th>Shorts</th><th>Shorts views</th><th>Long</th><th>Long views</th><th>Total views</th><th>Shorts share<Info text="Share of this channel's collected views that come from Shorts." /></th><th>Last video</th></tr>
            </thead>
            <tbody>
              {channels.map((c) => (
                <tr key={c.id} onClick={() => { setSelected(c.id); setVtype(''); }}
                  className={`cursor-pointer border-t border-line hover:bg-bg/60 ${selected === c.id ? 'bg-bg/60' : ''}`}>
                  <td className="max-w-xs py-1.5 pr-3 text-slate-200">{c.title}</td>
                  <td className="pr-3">{c.subscribers == null ? 'hidden' : short(c.subscribers)}</td>
                  <td className="pr-3 text-accent2">{c.shorts}</td><td className="pr-3">{short(c.shortViews)}</td>
                  <td className="pr-3 text-accent">{c.longs}</td><td className="pr-3">{short(c.longViews)}</td>
                  <td className="pr-3 font-semibold text-white">{short(c.views)}</td>
                  <td className="pr-3">{c.views ? `${Math.round((c.shortViews / c.views) * 100)}%` : '—'}</td>
                  <td className="whitespace-nowrap text-slate-400">{dateTime(c.lastPublished)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!channels.length && <Empty>No channels match.</Empty>}
        </div>
      </Card>

      {detail && (
        <Card title={detail.channel.title}
          right={<TypeSelect value={vtype} onChange={setVtype} />}>
          <p className="mb-3 text-xs text-slate-400">
            {detail.channel.subscribers == null ? 'Subscribers hidden' : `${short(detail.channel.subscribers)} subscribers`}
            {detail.channel.totalVideos != null && <> · {num(detail.channel.totalVideos)} videos on YouTube (we collected {detail.videos.length}{detail.videos.length >= 300 ? '+' : ''})</>}
          </p>
          <table className="mb-4 w-full max-w-xl text-left text-xs">
            <thead className="text-slate-500"><tr><th className="py-1">Type</th><th>Videos</th><th>Total views</th><th>Avg views / video</th></tr></thead>
            <tbody>
              {['short', 'long', 'unknown'].filter((t) => detail.split[t].videos).map((t) => (
                <tr key={t} className="border-t border-line">
                  <td className="py-1"><TypeBadge type={t} /></td><td>{detail.split[t].videos}</td>
                  <td>{num(detail.split[t].views)}</td><td>{num(detail.split[t].avgViews)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-panel text-slate-500"><tr><th className="py-1">Video</th><th>Type</th><th>Length</th><th>Views</th><th>Views/h</th><th>Published</th></tr></thead>
              <tbody>
                {videos.map((v) => (
                  <tr key={v.id} className="border-t border-line">
                    <td className="max-w-md py-1 pr-2"><a className="hover:text-accent" href={v.url} target="_blank" rel="noreferrer">{v.title}</a></td>
                    <td className="pr-2"><TypeBadge type={v.video_type} /></td><td className="pr-2">{dur(v.duration_seconds)}</td>
                    <td className="pr-2">{num(v.view_count)}</td><td className="pr-2">{num(v.views_per_hour)}</td>
                    <td className="whitespace-nowrap text-slate-400">{dateTime(v.published_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </Page>
  );
}