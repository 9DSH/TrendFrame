import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api.js';
import { Card, Direction, Empty, Notice, StatusBadge, TypeBadge } from './ui.jsx';
import { dateTime, growthPct, num, trunc } from '../utils/format.js';

const TABS = [
  ['monitored', 'Monitored videos'], ['discovered', 'Discovered topics'], ['emerging', 'Emerging topics'],
  ['growing', 'Rapidly growing'], ['high', 'High-opportunity'],
];
const mix = (t) => (t.shortCount == null ? '—' : `${t.shortCount} / ${t.longCount}`);
const pill = (on) => `rounded px-3 py-1 text-xs ${on ? 'bg-accent text-white' : 'border border-line text-slate-400 hover:text-white'}`;

function VideoTable({ videos, showTopic = false, box = 'h-[28rem]' }) {
  if (!videos.length) return <p className="py-2 text-xs text-slate-500">No videos.</p>;
  return (
    <div className={`${box} overflow-auto`}>
      <table className="w-full text-left text-xs">
        <thead className="sticky top-0 bg-panel text-slate-500">
          <tr><th className="py-1">Video</th>{showTopic && <th>Topic</th>}<th>Type</th><th>Channel</th><th>Views</th><th>Views/h</th><th>Published</th></tr>
        </thead>
        <tbody>
          {videos.map((v) => (
            <tr key={v.id} className="border-t border-line">
              <td className="max-w-md py-1 pr-2"><a className="hover:text-accent" href={v.url} target="_blank" rel="noreferrer">{trunc(v.title, 80)}</a></td>
              {showTopic && <td className="pr-2"><Link to={`/analytics/${v.topicId}`} className="text-slate-300 hover:text-accent">{trunc(v.topicName, 28)}</Link></td>}
              <td className="pr-2"><TypeBadge type={v.video_type} /></td>
              <td className="pr-2 text-slate-400">{trunc(v.channel_title, 24)}</td>
              <td className="pr-2">{num(v.view_count)}</td>
              <td className="pr-2">{num(v.views_per_hour)} <span className="text-[10px] text-accent2">{v.velocity_basis === 'snapshot_delta' ? 'measured' : 'lifetime avg'}</span></td>
              <td className="whitespace-nowrap text-slate-400">{dateTime(v.published_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function DashboardDetails({ kind, onKind, type, stamp, catLabel }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('topics');
  const [open, setOpen] = useState(() => new Set());

  useEffect(() => {
    let alive = true;
    api.dashboardDetails(kind, type)
      .then((d) => { if (alive) { setData(d); setError(''); setOpen(new Set()); } })
      .catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [kind, type, stamp]);

  const toggle = (id) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const ready = data && data.kind === kind;
  const isTopics = kind !== 'monitored';
  const flat = ready && isTopics
    ? data.topics.flatMap((t) => t.videos.map((v) => ({ ...v, topicId: t.id, topicName: t.name }))).sort((a, b) => b.view_count - a.view_count)
    : [];

  return (
    <Card title="Details"
      right={isTopics && (
        <div className="flex gap-1">
          <button className={pill(mode === 'topics')} onClick={() => setMode('topics')}>Topics</button>
          <button className={pill(mode === 'videos')} onClick={() => setMode('videos')}>All videos</button>
        </div>
      )}>
      <div className="mb-3 flex flex-wrap gap-1">
        {TABS.map(([k, l]) => <button key={k} className={pill(kind === k)} onClick={() => onKind(k)}>{l}</button>)}
      </div>
      {error && <Notice>{error}</Notice>}
      {!ready && !error && <p className="text-sm text-slate-400">Loading…</p>}

      {ready && !isTopics && (
        <>
          <p className="mb-2 text-xs text-slate-500">
            {num(data.total)} videos published in the last {data.trackingDays} days{data.total > data.videos.length ? `; the ${data.videos.length} most viewed are listed` : ''}.
          </p>
          <VideoTable videos={data.videos} />
        </>
      )}

      {ready && isTopics && (
        <>
          <p className="mb-2 text-xs text-slate-500">
            {num(data.totalTopics)} topics{data.totalTopics > data.topics.length ? ` (top ${data.topics.length} by score shown)` : ''}.
            Up to {data.videosPerTopic} videos per topic, most viewed first{type ? `, ${type === 'short' ? 'Shorts' : 'long videos'} only` : ''}.
            {data.thresholds && <> High-opportunity = score ≥ {data.thresholds.score} and confidence ≥ {Math.round(data.thresholds.confidence * 100)}% (change in Settings).</>}
          </p>
          {!data.topics.length && <Empty>No topics in this group right now.</Empty>}

          {data.topics.length > 0 && mode === 'videos' && <VideoTable videos={flat} showTopic />}

          {data.topics.length > 0 && mode === 'topics' && (
             <div className="h-[28rem] overflow-auto">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 z-10 bg-panel text-slate-500">
                  <tr><th className="w-5 py-1"></th><th>Topic</th><th>Score</th><th>Trend</th><th>Growth</th><th>Videos</th><th>Channels</th><th>Shorts / Long</th></tr>
                </thead>
                <tbody>
                  {data.topics.map((t) => (
                    <FragmentRow key={t.id} t={t} isOpen={open.has(t.id)} onToggle={() => toggle(t.id)} catLabel={catLabel} type={type} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function FragmentRow({ t, isOpen, onToggle, catLabel, type }) {
  return (
    <>
      <tr onClick={onToggle} className="cursor-pointer border-t border-line hover:bg-bg/60">
        <td className="py-2 text-slate-500">{isOpen ? '▾' : '▸'}</td>
        <td className="max-w-xs pr-3">
          <Link to={`/analytics/${t.id}`} onClick={(e) => e.stopPropagation()} className="text-slate-200 hover:text-accent">{t.name}</Link>
          <div className="text-[10px] text-slate-500">{catLabel(t.category)}</div>
        </td>
        <td className="pr-3 font-semibold text-white">{t.score.toFixed(1)} <span className="text-[10px] font-normal text-slate-500">{Math.round(t.confidence * 100)}%</span></td>
        <td className="whitespace-nowrap pr-3"><Direction direction={t.direction} /> <StatusBadge status={t.status} /></td>
        <td className={`whitespace-nowrap pr-3 ${t.growthRate == null ? '' : t.growthRate >= 0 ? 'text-up' : 'text-down'}`}>
          {growthPct(t.growthRate)} {t.momentumBasis === 'publication_proxy' && <span className="text-[10px] text-accent2">proxy</span>}
        </td>
        <td className="pr-3">{t.videoCount}{type ? <span className="text-[10px] text-slate-500"> ({t.matchingVideos} {type})</span> : null}</td>
        <td className="pr-3">{t.channelCount}</td>
        <td className="whitespace-nowrap">{mix(t)}</td>
      </tr>
      {isOpen && (
        <tr className="bg-bg/40"><td></td><td colSpan="7" className="pb-3 pr-3"><VideoTable videos={t.videos} box="max-h-60" /></td></tr>
      )}
    </>
  );
}