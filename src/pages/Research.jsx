import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../services/api.js';
import { useTopicAI } from '../hooks/useTopicAI.js';
import TopicPicker from '../components/TopicPicker.jsx';
import { BasisBadge, ClaimList } from '../components/ai.jsx';
import { Card, Empty, Notice, Page, btnGhost, btnPrimary } from '../components/ui.jsx';
import { dateTime, growthPct, num, short } from '../utils/format.js';
import SaveProjectButton from '../components/SaveProjectButton.jsx';

const host = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };

export default function Research() {
  const { id } = useParams();
  const { data, error, reload } = useTopicAI(id);
  const [status, setStatus] = useState(null);
  const [actionError, setActionError] = useState('');
  useEffect(() => { api.aiStatus().then(setStatus).catch(() => {}); }, []);

  const picker = <TopicPicker id={id} basePath="/research" />;
  if (!id) return <Page title="AI research" right={picker}><Empty>No topics yet. Collect data and run the analysis first.</Empty></Page>;
  if (!data) return <Page title="AI research" right={picker}>{error ? <Notice>{error}</Notice> : <p className="text-slate-400">Loading…</p>}</Page>;

  const { topic, evidence, research, jobs } = data;
  const job = jobs.research;
  const r = research?.report;
  const sources = research?.sources ?? [];
  const meta = r?.meta;

  const start = async () => {
    setActionError('');
    try { await api.research(id); await reload(); } catch (e) { setActionError(e.message); }
  };

  return (
    <Page title={`AI research: ${topic.name}`} subtitle="Sourced research with verified and speculative claims kept apart" right={picker}>
      {error && <Notice>{error}</Notice>}
      {actionError && <Notice>{actionError}</Notice>}
      {status && !status.openaiKeyConfigured && <Notice>OPENAI_API_KEY is not set. Add it to <code>.env</code> and restart <code>npm run dev</code>.</Notice>}

      <div className="flex flex-wrap items-center gap-2">
        <button className={btnPrimary} disabled={job.running || (status && !status.openaiKeyConfigured)} onClick={start}>
          {research ? 'Re-run research' : 'Research this topic'}
        </button>
        {research && <Link to={`/ideas/${id}`} className={btnGhost}>Animation ideas →</Link>}
        <Link to={`/analytics/${id}`} className={btnGhost}>Analytics</Link>
        <SaveProjectButton topicId={Number(id)} />
        {job.running && <span className="text-sm text-accent">Working: {job.step}…</span>}
        {status && <span className="ml-auto text-xs text-slate-500">model: {status.researchModel} · uses web search, which OpenAI bills per call</span>}
      </div>
      {job.error && <Notice>Research failed: {job.error}</Notice>}

      {evidence && (
        <Card title="What TrendFrame's own data shows" kind="measured">
          <p className="text-sm text-slate-300">
            {num(evidence.videoCount)} videos from {num(evidence.channelCount)} channels, {short(evidence.totalViews)} total views (measured).
            Opportunity score {evidence.score.toFixed(1)} at {Math.round(evidence.confidence * 100)}% confidence, growth {growthPct(evidence.growthRate)}
            {evidence.momentumBasis === 'publication_proxy' ? ' (proxy)' : ''} (estimated).
          </p>
          <p className="mt-1 text-xs text-slate-500">This comes from your database, not from the web research below.</p>
        </Card>
      )}

      {!research && !job.running && <Card><Empty>No research yet. Click "Research this topic". It takes about 1 to 3 minutes.</Empty></Card>}

      {r && (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-line bg-panel px-4 py-2 text-xs text-slate-400">
            <span>Report from {dateTime(research.createdAt)}</span><span>model {research.model}</span>
            <span>{meta.webSearches} web searches</span><span>{meta.sourceCount} sources retrieved</span>
            {meta.downgradedClaims > 0 && <span className="text-yellow-400">{meta.downgradedClaims} claims downgraded to "unverified" (no valid source attached)</span>}
            <span className="ml-auto flex items-center gap-2">
              <BasisBadge status="sourced" /> source cited · <BasisBadge status="unverified" /> no source · <BasisBadge status="speculation" /> inference
            </span>
          </div>
          {meta.sourceCount === 0 && <Notice tone="warn">No web sources were retrieved, so nothing in this report could be marked as sourced. Check that your research model supports web search.</Notice>}
          {meta.truncatedByModel && <Notice tone="warn">The research output was cut off by the model, so the report may be incomplete.</Notice>}
          {r.coherent === false && <Notice tone="warn">The research found no single clear subject for this topic. {r.coherenceNote} Treat the content below with caution. Animation ideas are blocked.</Notice>}

          <Card title={r.subject ? `Summary: ${r.subject}` : 'Summary'}>
            <p className="text-sm text-slate-300">{r.summary || 'No summary produced.'}</p>
            <p className="mt-2 text-[11px] text-slate-500">A synthesis of the sourced claims below. Check the sections for the status of each individual claim.</p>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Why it is trending"><ClaimList items={r.whyTrending} sources={sources} empty="No explanation found." /></Card>
            <Card title="Background research"><ClaimList items={r.background} sources={sources} /></Card>
          </div>
          <Card title="Historical timeline"><ClaimList items={r.timeline} sources={sources} empty="No dated events found." /></Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Key people and organizations"><ClaimList items={r.keyPeopleOrgs} sources={sources} /></Card>
            <Card title="Important events"><ClaimList items={r.importantEvents} sources={sources} /></Card>
          </div>
          <Card title="Current developments"><ClaimList items={r.currentDevelopments} sources={sources} empty="No recent developments found." /></Card>

          <Card title="Potential storytelling angles" right={<span className="text-[11px] text-slate-500">suggestions, not facts</span>}>
            {r.storytellingAngles.length ? (
              <ul className="space-y-2 text-sm text-slate-300">
                {r.storytellingAngles.map((a, i) => <li key={i}>{a.title && <b className="text-slate-200">{a.title}: </b>}{a.description}</li>)}
              </ul>
            ) : <p className="text-xs text-slate-500">None suggested.</p>}
          </Card>

          {r.gaps.length > 0 && (
            <Card title="Could not be verified or found">
              <ul className="list-disc space-y-1 pl-4 text-sm text-slate-300">{r.gaps.map((g, i) => <li key={i}>{g}</li>)}</ul>
            </Card>
          )}

          <Card title={`Research sources (${sources.length})`}>
            {sources.length ? (
              <ol className="space-y-1 text-sm">
                {sources.map((s) => (
                  <li key={s.id} className="flex gap-2">
                    <span className="w-6 shrink-0 text-right text-slate-500">[{s.id}]</span>
                    <a href={s.url} target="_blank" rel="noreferrer noopener" className="text-accent hover:underline">{s.title || s.url}</a>
                    <span className="text-xs text-slate-500">{host(s.url)}</span>
                  </li>
                ))}
              </ol>
            ) : <p className="text-xs text-slate-500">No sources were retrieved.</p>}
            <p className="mt-2 text-[11px] text-slate-500">Only links returned by the web search tool are listed. "Sourced" means a claim cites one of them. Open the link to confirm it says what the claim says.</p>
          </Card>
        </>
      )}
    </Page>
  );
}