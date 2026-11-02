import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../services/api.js';
import { btnGhost, Card, Direction, Empty, KindTag, Notice, Page, Stat, StatusBadge, inputCls } from '../components/ui.jsx';
import { Chart, axis, barCursor, gridProps, legendProps, tooltipProps } from '../components/charts.jsx';
import { COLORS, METRICS, SERIES, dateTime, dayLabel, growthPct, num, pct, short, trunc } from '../utils/format.js';

const NEED_TWO = 'Needs at least two collections that include this topic\'s videos.';

export default function Analytics() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [topics, setTopics] = useState([]);
  const [detail, setDetail] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.topics({}).then((list) => {
      setTopics(list);
      if (!id && list.length) navigate(`/analytics/${list[0].id}`, { replace: true });
    }).catch((e) => setError(e.message));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!id) return undefined;
    let alive = true;
    setLoading(true);
    Promise.all([api.topic(id), api.topicAnalytics(id)])
      .then(([d, a]) => { if (alive) { setDetail(d); setData(a); setError(''); } })
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [id]);

  const picker = (
    <select className={`${inputCls} w-72`} value={id ?? ''} onChange={(e) => navigate(`/analytics/${e.target.value}`)}>
      {!id && <option value="">Select a topic…</option>}
      {topics.map((t) => <option key={t.id} value={t.id}>{trunc(t.name, 50)} ({t.score.toFixed(0)})</option>)}
    </select>
  );

  if (!id) return <Page title="Analytics" right={picker}>{error ? <Notice>{error}</Notice> : <Empty>No topics yet. Collect data and run the analysis first.</Empty>}</Page>;
  if (!data || !detail) return <Page title="Analytics" right={picker}>{error ? <Notice>{error}</Notice> : <p className="text-slate-400">Loading…</p>}</Page>;

  const s = detail.score;
  const c = s?.components;
  const col = data.collections;
  const enough = col.length >= 2;
  const topChannels = data.channels.slice(0, 8).map((x) => ({ ...x, label: trunc(x.title, 22) }));
  const contributions = c ? Object.keys(METRICS).map((k) => ({ name: METRICS[k], points: c.contributions[k].points ?? 0, excluded: c.contributions[k].excluded })) : [];
  const compMetric = c?.metrics.competition;

  return (
    <Page title={detail.topic.name} subtitle={`Detailed analytics · ${data.meta.snapshots} snapshots in ${data.meta.collections} collections${loading ? ' · updating…' : ''}`} right={<div className="flex items-center gap-2"><Link to={`/research/${id}`} className={btnGhost}>AI research →</Link>{picker}</div>}>
      {error && <Notice>{error}</Notice>}

      {s && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
          <Stat label="Opportunity score" value={s.score.toFixed(1)} sub={`confidence ${Math.round(s.confidence * 100)}%`} tone="text-accent" />
          <Stat label="Trend" value={<StatusBadge status={s.status} />} sub={<>growth {growthPct(c.metrics.trend_momentum.detail.growthRate)}{c.metrics.trend_momentum.basis === 'publication_proxy' ? ' (proxy)' : ''}</>} />
          <Stat label="Videos" value={num(c.stats.videoCount)} sub={`${c.stats.spanDays} day span`} />
          <Stat label="Channels" value={num(c.stats.channelCount)} />
          <Stat label="Total views" value={short(c.stats.totalViews)} sub="measured" />
          <Stat label="Competition" value={<span className="capitalize">{c.stats.competitionLevel}</span>} sub="higher = more crowded" />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Views of the 5 biggest videos over time" kind="measured">
          {data.viewSeries.rows.length >= 2 ? (
            <Chart>
              <LineChart data={data.viewSeries.rows}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="t" tickFormatter={dateTime} {...axis} minTickGap={30} />
                <YAxis tickFormatter={short} width={48} {...axis} />
                <Tooltip {...tooltipProps} labelFormatter={dateTime} formatter={(v) => num(v)} />
                <Legend {...legendProps} />
                {data.viewSeries.videos.map((v, i) => (
                  <Line key={v.key} type="monotone" dataKey={v.key} name={trunc(v.title, 34)} stroke={SERIES[i]} strokeWidth={2} dot connectNulls />
                ))}
              </LineChart>
            </Chart>
          ) : <Empty>{NEED_TWO}</Empty>}
        </Card>

        <Card title="Views gained between collections" kind="measured">
          {enough && col.some((p) => p.gained != null) ? (
            <Chart>
              <BarChart data={col}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="t" tickFormatter={dateTime} {...axis} minTickGap={30} />
                <YAxis tickFormatter={short} width={48} {...axis} />
                <Tooltip {...tooltipProps} cursor={barCursor} labelFormatter={dateTime}
                  formatter={(v, _n, item) => [`${num(v)} (${item.payload.videos} videos in this collection)`, 'Views gained']} />
                <Bar dataKey="gained" fill={COLORS.accent} radius={[3, 3, 0, 0]} />
              </BarChart>
            </Chart>
          ) : <Empty>{NEED_TWO}</Empty>}
          <p className="mt-1 text-[11px] text-slate-500">Gains depend on how many of the topic's videos were re-checked in each collection (see tooltip).</p>
        </Card>

        <Card title="Growth velocity: topic views per hour" kind="estimated">
          {enough && col.some((p) => p.viewsPerHour != null) ? (
            <Chart>
              <LineChart data={col}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="t" tickFormatter={dateTime} {...axis} minTickGap={30} />
                <YAxis tickFormatter={short} width={48} {...axis} />
                <Tooltip {...tooltipProps} labelFormatter={dateTime}
                  formatter={(v, _n, item) => [`${num(v)} views/h from ${item.payload.measuredVideos} videos`, 'Velocity']} />
                <Line type="monotone" dataKey="viewsPerHour" stroke={COLORS.accent2} strokeWidth={2} dot connectNulls />
              </LineChart>
            </Chart>
          ) : <Empty>{NEED_TWO}</Empty>}
          <p className="mt-1 text-[11px] text-slate-500">Sum of snapshot-based views/hour (real view difference ÷ real elapsed hours) over videos with two snapshots.</p>
        </Card>

        <Card title="Engagement over time" kind="measured">
          {enough && col.some((p) => p.engagement != null) ? (
            <Chart>
              <LineChart data={col}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="t" tickFormatter={dateTime} {...axis} minTickGap={30} />
                <YAxis tickFormatter={(v) => `${v}%`} width={44} {...axis} />
                <Tooltip {...tooltipProps} labelFormatter={dateTime} formatter={(v) => [`${v}%`, '(likes + comments) / views']} />
                <Line type="monotone" dataKey="engagement" stroke={COLORS.up} strokeWidth={2} dot connectNulls />
              </LineChart>
            </Chart>
          ) : <Empty>{NEED_TWO} Videos with hidden likes are excluded.</Empty>}
        </Card>

        <Card title="Topic popularity over time" kind="estimated">
          {data.history.length >= 2 ? (
            <Chart>
              <LineChart data={data.history}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="t" tickFormatter={dateTime} {...axis} minTickGap={30} />
                <YAxis yAxisId="l" domain={[0, 100]} width={32} {...axis} />
                <YAxis yAxisId="r" orientation="right" width={32} {...axis} />
                <Tooltip {...tooltipProps} labelFormatter={dateTime} />
                <Legend {...legendProps} />
                <Line yAxisId="l" type="monotone" dataKey="score" name="Opportunity score" stroke={COLORS.accent} strokeWidth={2} dot={false} />
                <Line yAxisId="r" type="monotone" dataKey="videoCount" name="Videos in topic" stroke={COLORS.accent2} strokeWidth={2} dot={false} />
              </LineChart>
            </Chart>
          ) : <Empty>Needs at least two analysis runs.</Empty>}
        </Card>

        <Card title="Video publication frequency" kind="measured">
          {data.publication.length ? (
            <Chart>
              <BarChart data={data.publication}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="day" tickFormatter={dayLabel} {...axis} minTickGap={20} />
                <YAxis allowDecimals={false} width={28} {...axis} />
                <Tooltip {...tooltipProps} cursor={barCursor} labelFormatter={dayLabel} formatter={(v) => [v, 'Videos published']} />
                <Bar dataKey="count" fill={COLORS.accent2} radius={[3, 3, 0, 0]} />
              </BarChart>
            </Chart>
          ) : <Empty>No videos.</Empty>}
          <p className="mt-1 text-[11px] text-slate-500">Only videos YouTube surfaced to TrendFrame, not every video on the subject.</p>
        </Card>

        <Card title="Channel comparison: total views" kind="measured">
          {topChannels.length ? (
            <Chart height={Math.max(200, topChannels.length * 30)}>
              <BarChart data={topChannels} layout="vertical" margin={{ right: 16 }}>
                <CartesianGrid {...gridProps} horizontal={false} vertical />
                <XAxis type="number" tickFormatter={short} {...axis} />
                <YAxis type="category" dataKey="label" width={130} {...axis} />
                <Tooltip {...tooltipProps} cursor={barCursor} formatter={(v) => [num(v), 'Views']} />
                <Bar dataKey="views" fill={COLORS.accent} radius={[0, 3, 3, 0]} />
              </BarChart>
            </Chart>
          ) : <Empty>No channels.</Empty>}
        </Card>

        <Card title="Competition analysis: views by channel size" kind="estimated">
          <Chart height={200}>
            <BarChart data={data.sizeBuckets}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="label" {...axis} />
              <YAxis tickFormatter={(v) => `${v}%`} width={40} {...axis} />
              <Tooltip {...tooltipProps} cursor={barCursor}
                formatter={(v, _n, item) => [`${v}% of views · ${item.payload.channels} channels · ${item.payload.videos} videos`, 'Share']} />
              <Bar dataKey="viewShare" fill={COLORS.warn} radius={[3, 3, 0, 0]} />
            </BarChart>
          </Chart>
          {compMetric && (
            <p className="mt-1 text-[11px] text-slate-400">
              Competition opportunity: <b className="text-white">{compMetric.value == null ? 'n/a' : `${compMetric.value.toFixed(0)}/100`}</b> (higher = less crowded). {compMetric.note}
            </p>
          )}
        </Card>
      </div>

      <Card title="Channels in this topic" kind="measured">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-slate-500"><tr><th className="py-1">Channel</th><th>Subscribers</th><th>Videos</th><th>Views</th><th>Views / video</th><th>Engagement</th></tr></thead>
            <tbody>
              {data.channels.map((ch) => (
                <tr key={ch.id} className="border-t border-line">
                  <td className="py-1 pr-3 text-slate-200">{ch.title}</td>
                  <td>{ch.subscribers == null ? 'hidden / unknown' : short(ch.subscribers)}</td>
                  <td>{ch.videos}</td><td>{num(ch.views)}</td><td>{num(ch.viewsPerVideo)}</td><td>{pct(ch.engagement)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Related topic comparison" kind="estimated">
        {data.related.length > 1 ? (
          <>
            <Chart height={220}>
              <BarChart data={data.related.map((t) => ({ name: trunc(t.name, 18), score: t.score, confidence: Math.round(t.confidence * 100) }))}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="name" {...axis} interval={0} />
                <YAxis domain={[0, 100]} width={32} {...axis} />
                <Tooltip {...tooltipProps} cursor={barCursor} />
                <Legend {...legendProps} />
                <Bar dataKey="score" name="Opportunity score" fill={COLORS.accent} radius={[3, 3, 0, 0]} />
                <Bar dataKey="confidence" name="Confidence %" fill={COLORS.accent2} radius={[3, 3, 0, 0]} />
              </BarChart>
            </Chart>
            <table className="mt-3 w-full text-left text-xs">
              <thead className="text-slate-500"><tr><th className="py-1">Topic</th><th>Related by</th><th>Score</th><th>Growth</th><th>Trend</th><th>Videos</th><th>Channels</th></tr></thead>
              <tbody>
                {data.related.map((t) => (
                  <tr key={t.id} className={`border-t border-line ${t.isSelf ? 'bg-bg/60' : ''}`}>
                    <td className="py-1 pr-3">{t.isSelf ? <span className="text-white">{t.name}</span> : <Link to={`/analytics/${t.id}`} className="text-slate-200 hover:text-accent">{t.name}</Link>}</td>
                    <td className="pr-3 text-slate-500">{t.relation.join(', ')}</td>
                    <td className="font-semibold text-white">{t.score.toFixed(1)}</td>
                    <td className={t.growthRate >= 0 ? 'text-up' : 'text-down'}>{growthPct(t.growthRate)}</td>
                    <td><Direction direction={t.direction} /> <StatusBadge status={t.status} /></td>
                    <td>{t.videoCount}</td><td>{t.channelCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : <Empty>No related topics found (no shared keywords, channels or category).</Empty>}
      </Card>

      {c && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Why this score: points per metric" kind="estimated">
            <Chart height={240}>
              <BarChart data={contributions} layout="vertical" margin={{ right: 16 }}>
                <CartesianGrid {...gridProps} horizontal={false} vertical />
                <XAxis type="number" {...axis} />
                <YAxis type="category" dataKey="name" width={150} {...axis} />
                <Tooltip {...tooltipProps} cursor={barCursor} formatter={(v, _n, item) => [item.payload.excluded ? 'excluded (no data)' : `${v.toFixed(1)} points`, 'Contribution']} />
                <Bar dataKey="points" fill={COLORS.accent} radius={[0, 3, 3, 0]} />
              </BarChart>
            </Chart>
            <p className="mt-1 text-[11px] text-slate-500">Points add up to the opportunity score. Full explanations are on the Scoring & settings page.</p>
          </Card>

          <Card title="Videos in this topic" kind="measured">
            <div className="max-h-72 overflow-auto">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-panel text-slate-500"><tr><th className="py-1">Video</th><th>Views</th><th>Views/h</th></tr></thead>
                <tbody>
                  {detail.videos.slice(0, 15).map((v) => (
                    <tr key={v.id} className="border-t border-line">
                      <td className="max-w-[260px] py-1 pr-2"><a className="hover:text-accent" href={v.url} target="_blank" rel="noreferrer">{trunc(v.title, 70)}</a>
                        <div className="text-[10px] text-slate-500">{v.channel_title}</div></td>
                      <td>{num(v.view_count)}</td>
                      <td>{num(v.views_per_hour)} <KindTag kind={v.velocity_basis === 'snapshot_delta' ? 'measured' : 'estimated'} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </Page>
  );
}