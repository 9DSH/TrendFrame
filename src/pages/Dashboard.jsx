import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../services/api.js';
import { useJobs } from '../hooks/useJobs.js';
import ActionBar from '../components/ActionBar.jsx';
import ScopeBadge from '../components/ScopeBadge.jsx'
import Info from '../components/Info.jsx';
import { Card, TypeSelect,TypeBadge, Direction, Empty, Notice, Page, Stat, StatusBadge } from '../components/ui.jsx';
import { Chart, axis, barCursor, gridProps, legendProps, tooltipProps } from '../components/charts.jsx';
import { COLORS, SERIES, dayLabel, num, short, timeAgo, trunc } from '../utils/format.js';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [type, setType] = useState('');

  const load = useCallback(async () => {
    try { setData(await api.dashboard(type)); setError(''); } catch (e) { setError(e.message); }
  }, [type]);
  useEffect(() => { load(); }, [load]);
  const jobs = useJobs(load);

  if (!data) return <p className="text-slate-400">{error || 'Loading…'}</p>;
  const { videos, summary, typeSplit, categories, topOpportunities, growth, scoreTrend, recentDiscoveries, lastRun } = data;
  const chartCats = categories.filter((c) => c.avgScore != null).map((c) => ({ ...c, label: trunc(c.label, 22) }));

  return (
    <Page title="Dashboard" subtitle={lastRun ? `Last collection #${lastRun.id}: ${lastRun.status}, ${timeAgo(lastRun.started_at)}` : 'No collection yet'}
      right={<ActionBar jobs={jobs} onRefresh={load} />}>
      {error && <Notice>{error}</Notice>}
        <div className="flex flex-wrap items-center gap-3">
        <TypeSelect value={type} onChange={setType} title="Applies to the video counts and view-gain charts. Topics follow the analysis scope." />
        <ScopeBadge />
      </div>
      {summary.discovered === 0 && (
        <Notice tone="warn">No topics yet. Use <b>Collect now</b>, then <b>Run analysis</b> (it also runs automatically after a collection).</Notice>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Monitored videos" info="monitored" value={num(videos.tracked)} sub={`published in last ${videos.trackingDays} d · ${num(videos.total)} collected`} />
        <Stat label="Discovered topics" value={num(summary.discovered)} sub={`${num(videos.channels)} channels seen`} />
        <Stat label="Emerging topics" info="status_emerging" value={num(summary.emerging)} tone="text-accent2" sub={`${num(summary.growing)} rapidly growing`} />
        <Stat label="High-opportunity" info="high_opportunity" value={num(summary.highOpportunity)} tone="text-up" sub={`score ≥ ${summary.highThreshold}, confidence ≥ ${Math.round(summary.highMinConfidence * 100)}%`} />
        <Stat label="Top score" info="opportunity_score" value={topOpportunities[0] ? topOpportunities[0].score.toFixed(1) : '—'} sub={topOpportunities[0] ? trunc(topOpportunities[0].name, 28) : ''} />
      </div>

    <Card title="Shorts vs long videos" info="video_type" kind="measured">
        {typeSplit.length ? (
          <table className="w-full max-w-2xl text-left text-xs">
            <thead className="text-slate-500"><tr><th className="py-1">Type</th><th>Videos</th><th>Channels</th><th>Total views</th><th>Avg views / video</th></tr></thead>
            <tbody>
              {['short', 'long', 'unknown'].map((t) => typeSplit.find((r) => r.type === t)).filter(Boolean).map((r) => (
                <tr key={r.type} className="border-t border-line">
                  <td className="py-1"><TypeBadge type={r.type} /></td><td>{num(r.videos)}</td><td>{num(r.channels)}</td><td>{short(r.views)}</td><td>{num(r.avgViews)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <Empty>No videos yet.</Empty>}
      </Card>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card title="Top opportunities" info="opportunity_score" kind="estimated" className="lg:col-span-3">
          {topOpportunities.length ? (
            <table className="w-full text-left text-xs">
              <thead className="text-slate-500"><tr><th className="py-1">Topic</th><th>Score</th><th>Conf.<Info term="confidence" /></th><th>Status</th><th>Videos</th></tr></thead>
              <tbody>
                {topOpportunities.map((t) => (
                  <tr key={t.id} className="border-t border-line">
                    <td className="max-w-[220px] py-1.5 pr-2">
                      <Link to={`/analytics/${t.id}`} className="text-slate-200 hover:text-accent">{t.name}</Link>
                      <div className="text-[10px] text-slate-500">{categories.find((c) => c.key === t.category)?.label}</div>
                    </td>
                    <td className="pr-3">
                      <div className="font-semibold text-white">{t.score.toFixed(1)}</div>
                      <div className="h-1 w-16 rounded bg-bg"><div className="h-1 rounded bg-accent" style={{ width: `${t.score}%` }} /></div>
                    </td>
                    <td className={t.confidence < 0.4 ? 'text-yellow-400' : 'text-slate-300'}>{Math.round(t.confidence * 100)}%</td>
                    <td><Direction direction={t.direction} /> <StatusBadge status={t.status} /></td>
                    <td>{t.videoCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <Empty>No scored topics yet.</Empty>}
        </Card>

        <Card title="Trending categories" kind="estimated" info="trending_categories" className="lg:col-span-2">
          {chartCats.length ? (
            <>
              <Chart height={Math.max(180, chartCats.length * 26)}>
                <BarChart data={chartCats} layout="vertical" margin={{ left: 0, right: 16 }}>
                  <CartesianGrid {...gridProps} horizontal={false} vertical />
                  <XAxis type="number" domain={[0, 100]} {...axis} />
                  <YAxis type="category" dataKey="label" width={130} {...axis} />
                  <Tooltip {...tooltipProps} cursor={barCursor} formatter={(v) => [v, 'Average topic score']} />
                  <Bar dataKey="avgScore" fill={COLORS.accent} radius={[0, 3, 3, 0]} />
                </BarChart>
              </Chart>
              <table className="mt-2 w-full text-left text-[11px]">
                <thead className="text-slate-500"><tr><th>Category</th><th>Topics</th><th>Rising</th><th>Views gained 7d <span className="text-up">(measured)</span></th></tr></thead>
                <tbody>
                  {categories.filter((c) => c.topics > 0).map((c) => (
                    <tr key={c.key} className="border-t border-line">
                      <td className="py-1 text-slate-300">{c.label}</td><td>{c.topics}</td>
                      <td className={c.rising ? 'text-up' : 'text-slate-500'}>{c.rising}</td><td>{short(c.viewsGained7d)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : <Empty>No category data yet.</Empty>}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Views gained per day, all monitored videos" kind="measured">
          {growth.length ? (
            <Chart>
              <BarChart data={growth}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="day" tickFormatter={dayLabel} {...axis} />
                <YAxis tickFormatter={short} width={48} {...axis} />
                <Tooltip {...tooltipProps} cursor={barCursor} labelFormatter={dayLabel}
                  formatter={(v, _n, item) => [`${num(v)} (${item.payload.videos} videos)`, 'Views gained']} />
                <Bar dataKey="gained" fill={COLORS.accent} radius={[3, 3, 0, 0]} />
              </BarChart>
            </Chart>
          ) : <Empty>Needs at least two collections (videos seen again) to measure gains.</Empty>}
          <p className="mt-1 text-[11px] text-slate-500">Sum of view differences between consecutive collections, grouped by UTC day. A day with more collections or more re-checked videos shows more.</p>
        </Card>

        <Card title="Opportunity score history, top 5 topics" kind="estimated">
          {scoreTrend.rows.length >= 2 ? (
            <Chart>
              <LineChart data={scoreTrend.rows}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="day" tickFormatter={dayLabel} {...axis} />
                <YAxis domain={[0, 100]} width={32} {...axis} />
                <Tooltip {...tooltipProps} labelFormatter={dayLabel} />
                <Legend {...legendProps} />
                {scoreTrend.series.map((s, i) => (
                  <Line key={s.key} type="monotone" dataKey={s.key} name={trunc(s.name, 26)} stroke={SERIES[i]} strokeWidth={2} dot={false} connectNulls />
                ))}
              </LineChart>
            </Chart>
          ) : <Empty>Needs analysis runs on at least two different days.</Empty>}
        </Card>
      </div>

      <Card title="Recent discoveries">
        {recentDiscoveries.length ? (
          <div className="grid gap-2 md:grid-cols-2">
            {recentDiscoveries.map((t) => (
              <Link key={t.id} to={`/analytics/${t.id}`} className="flex items-center gap-3 rounded border border-line bg-bg/50 px-3 py-2 hover:border-accent">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-slate-200">{t.name}</div>
                  <div className="text-[11px] text-slate-500">{categories.find((c) => c.key === t.category)?.label} · detected {timeAgo(t.firstDetectedAt)} · {t.videoCount} videos</div>
                </div>
                <StatusBadge status={t.status} />
                <span className="w-10 text-right text-sm font-semibold text-white">{t.score.toFixed(0)}</span>
              </Link>
            ))}
          </div>
        ) : <Empty>Nothing discovered yet.</Empty>}
      </Card>

      <p className="text-xs text-slate-500">Opportunity scores are estimates, not predictions of guaranteed virality. Percentile-based metrics are relative to the topics currently monitored.</p>
    </Page>
  );
}