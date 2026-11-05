import { useEffect, useRef, useState } from 'react';
import { api } from '../services/api.js';
import { Card, Empty, Notice, Page, btnPrimary, inputCls } from '../components/ui.jsx';

const NA = <span className="text-slate-500">Not available</span>;
const dateLabel = (d) => (d
  ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })
  : '—');
const score = (m) => `${m.scoreHome ?? '–'}–${m.scoreAway ?? '–'}`;

function interpretation(i) {
  const parts = [];
  if (i.season) parts.push(`season ${i.season}`);
  else if (i.year) parts.push(`year ${i.year}`);
  if (i.competitions.length) parts.push(`competition ${i.competitions.join(', ')}`);
  if (i.teams.length) parts.push(`${i.teams.length > 1 ? 'teams' : 'team'} ${i.teams.join(' vs ')}`);
  if (i.player) parts.push(`scorer ${i.player}`);
  return parts.join(' · ');
}

function GoalTable({ goals }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="text-slate-500">
          <tr><th className="py-1">Minute</th><th>Scorer</th><th>Assist</th><th>Shot distance</th><th>Shot speed</th><th>xG</th></tr>
        </thead>
        <tbody>
          {goals.map((g, i) => (
            <tr key={i} className="border-t border-line">
              <td className="whitespace-nowrap py-1.5 pr-3 font-semibold text-white">{g.label}</td>
              <td className="pr-3 text-slate-200">{g.scorer ? <>{g.scorer}{g.ownGoal && <span className="text-slate-500"> (own goal)</span>}</> : NA}</td>
              <td className="pr-3">{g.assist ?? NA}</td>
              <td className="pr-3">{g.distanceM == null ? NA : `${g.distanceM.toFixed(1)} m`}</td>
              <td className="pr-3">{g.speedKmh == null ? NA : `${g.speedKmh} km/h`}</td>
              <td>{g.xg == null ? NA : g.xg.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Football() {
  const [status, setStatus] = useState(null);
  const [q, setQ] = useState('');
  const [search, setSearch] = useState(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailError, setDetailError] = useState('');
  const run = useRef(0);

  useEffect(() => { api.footballStatus().then(setStatus).catch(() => {}); }, []);

  useEffect(() => {
    if (!selected) return undefined;
    let alive = true;
    setDetail(null); setDetailError('');
    api.footballGoals(selected).then((d) => alive && setDetail(d)).catch((e) => alive && setDetailError(e.message));
    return () => { alive = false; };
  }, [selected]);

  const submit = async (e) => {
    e.preventDefault();
    const text = q.trim();
    if (text.length < 2 || searching) return;
    const id = ++run.current;
    setSearching(true); setError(''); setSelected(null); setDetail(null); setDetailError('');
    try {
      const r = await api.footballSearch(text);
      if (id === run.current) setSearch(r);
    } catch (err) {
      if (id === run.current) { setError(err.message); setSearch(null); }
    } finally {
      if (id === run.current) setSearching(false);
    }
  };

  const noKey = status && !status.keyConfigured;

  return (
    <Page title="Football goals" subtitle="Find a match, then see the available statistics for each of its goals">
      {noKey && <Notice>PITCHAPI_API_KEY is not set. Add it to <code>.env</code> and restart <code>npm run dev</code>. A free key is available at pitchapi.dev.</Notice>}

      <form onSubmit={submit} className="space-y-1">
        <div className="flex gap-2">
          <input className={`${inputCls} min-w-0 flex-1`} value={q} onChange={(e) => setQ(e.target.value)} disabled={noKey}
            placeholder="Player, team, opponent, competition, year. For example: Haaland 2024 Manchester City vs Arsenal" />
          <button className={btnPrimary} disabled={noKey || searching || q.trim().length < 2}>{searching ? 'Searching…' : 'Search'}</button>
        </div>
        <p className="text-[11px] text-slate-500">
          A year means the year the match was played; write 2023/24 for a season. Player names are matched against goal scorers.
          Source: PitchAPI{status?.earliestYear ? `, seasons from ${status.earliestYear} onward` : ''}.
        </p>
      </form>

      {searching && <p className="text-sm text-accent">Searching… the first search for a year downloads fixture lists and can take a minute. Results are cached locally.</p>}
      {error && <Notice>{error}</Notice>}

      {search && !searching && (
        <Card title={`Matches (${search.total}${search.total > search.results.length && search.results.length ? `, newest ${search.results.length} shown` : ''})`}
          right={<span className="text-[11px] text-slate-500">{interpretation(search.interpretation)}</span>}>
          {search.notes.map((n, i) => <p key={i} className="mb-2 text-xs text-yellow-400">{n}</p>)}
          {search.message && <Empty>{search.message}</Empty>}
          <div className="max-h-[28rem] space-y-2 overflow-auto">
            {search.results.map((m) => (
              <button key={m.id} type="button" onClick={() => setSelected(m.id)}
                className={`block w-full rounded border p-3 text-left hover:border-accent ${selected === m.id ? 'border-accent bg-bg/60' : 'border-line bg-bg/30'}`}>
                <div className="flex items-center gap-2 text-sm text-slate-200">
                  <span className="min-w-0 flex-1 truncate">{m.home.name} <b className="mx-1 text-white">{score(m)}</b> {m.away.name}</span>
                  {m.player && (
                    <span className="whitespace-nowrap rounded bg-accent2/15 px-1.5 py-0.5 text-[11px] text-accent2">
                      {m.player.name}{m.player.goals > 1 ? ` ×${m.player.goals}` : ''}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500">{dateLabel(m.date)} · {m.league}{m.season ? ` ${m.season}` : ''}</div>
              </button>
            ))}
          </div>
        </Card>
      )}

      {selected && (
        <Card title={detail ? `${detail.match.home.name} ${score(detail.match)} ${detail.match.away.name}` : 'Goals'}
          right={detail && <span className="text-[11px] text-slate-500">{dateLabel(detail.match.date)}{detail.match.league ? ` · ${detail.match.league}` : ''}</span>}>
          {detailError && <Notice>{detailError}</Notice>}
          {!detail && !detailError && <p className="text-sm text-slate-400">Loading…</p>}
          {detail && (
            <>
              {detail.warnings.map((w, i) => <div key={i} className="mb-2"><Notice tone="warn">{w}</Notice></div>)}
              {detail.goals.length ? <GoalTable goals={detail.goals} /> : <Empty>No goals listed for this match.</Empty>}
              <p className="mt-2 text-[11px] text-slate-500">
                Shot distance is calculated from the shot's pitch coordinates to the centre of the goal. PitchAPI does not provide shot speed
                or the assist provider. Anything missing is shown as "Not available", never estimated.
              </p>
            </>
          )}
        </Card>
      )}
    </Page>
  );
}