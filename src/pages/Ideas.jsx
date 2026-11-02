import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../services/api.js';
import { useTopicAI } from '../hooks/useTopicAI.js';
import TopicPicker from '../components/TopicPicker.jsx';
import { BASIS, BasisBadge } from '../components/ai.jsx';
import { Card, Empty, Notice, Page, btnGhost, btnPrimary } from '../components/ui.jsx';
import { conceptToMarkdown } from '../utils/conceptMarkdown.js';
import { dateTime, trunc } from '../utils/format.js';

const Section = ({ title, children }) => (
  <div><h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>{children}</div>
);
const Bullets = ({ items }) => (items?.length
  ? <ul className="list-disc space-y-0.5 pl-4 text-sm text-slate-300">{items.map((x, i) => <li key={i}>{x}</li>)}</ul>
  : <p className="text-xs text-slate-500">—</p>);
const Named = ({ items }) => (items?.length
  ? <ul className="list-disc space-y-0.5 pl-4 text-sm text-slate-300">
      {items.map((x, i) => <li key={i}><b className="text-slate-200">{x.name}</b>{x.description && <> — {x.description}</>}</li>)}
    </ul>
  : <p className="text-xs text-slate-500">—</p>);
const Meta = ({ label, value }) => (value ? <div><dt className="inline text-slate-500">{label}: </dt><dd className="inline text-slate-300">{value}</dd></div> : null);

export default function Ideas() {
  const { id } = useParams();
  const { data, error, reload } = useTopicAI(id);
  const [status, setStatus] = useState(null);
  const [sel, setSel] = useState(0);
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState('');
  useEffect(() => { api.aiStatus().then(setStatus).catch(() => {}); }, []);
  useEffect(() => { setSel(0); }, [id]);

  const picker = <TopicPicker id={id} basePath="/ideas" />;
  if (!id) return <Page title="Animation ideas" right={picker}><Empty>No topics yet. Collect data and run the analysis first.</Empty></Page>;
  if (!data) return <Page title="Animation ideas" right={picker}>{error ? <Notice>{error}</Notice> : <p className="text-slate-400">Loading…</p>}</Page>;

  const { topic, research, ideas, jobs } = data;
  const job = jobs.ideas;
  const stale = ideas && research && ideas.researchReportId !== research.id;
  const incoherent = research?.report.coherent === false;
  const c = ideas?.concepts[Math.min(sel, (ideas?.concepts.length ?? 1) - 1)];

  const start = async () => {
    setActionError('');
    try { await api.generateIdeas(id); await reload(); } catch (e) { setActionError(e.message); }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(conceptToMarkdown(c, topic.name));
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    } catch { setActionError('Copy failed: the browser blocked clipboard access.'); }
  };

  return (
    <Page title={`Animation ideas: ${topic.name}`} subtitle="Three documentary concepts built on the research report" right={picker}>
      {error && <Notice>{error}</Notice>}
      {actionError && <Notice>{actionError}</Notice>}
      {status && !status.openaiKeyConfigured && <Notice>OPENAI_API_KEY is not set. Add it to <code>.env</code> and restart <code>npm run dev</code>.</Notice>}
      {!research && <Notice tone="warn">This topic has not been researched yet. <Link className="underline" to={`/research/${id}`}>Run the research first</Link>, so the concepts rest on sourced facts.</Notice>}
      {incoherent && <Notice tone="warn">The research found no single clear subject for this topic, so idea generation is blocked.</Notice>}

      <div className="flex flex-wrap items-center gap-2">
        <button className={btnPrimary} disabled={!research || incoherent || job.running || (status && !status.openaiKeyConfigured)} onClick={start}>
          {ideas ? 'Generate 3 new concepts' : 'Generate 3 concepts'}
        </button>
        <Link to={`/research/${id}`} className={btnGhost}>← Research</Link>
        {job.running && <span className="text-sm text-accent">Working: {job.step}…</span>}
        {status && <span className="ml-auto text-xs text-slate-500">model: {status.ideasModel}</span>}
      </div>
      {job.error && <Notice>Generation failed: {job.error}</Notice>}
      {stale && <Notice tone="warn">These concepts were written for an older research report. Generate new ones to use the latest research.</Notice>}

      {!ideas && !job.running && research && !incoherent && <Card><Empty>No concepts yet. Click "Generate 3 concepts".</Empty></Card>}

      {c && (
        <>
          <div className="flex flex-wrap gap-2">
            {ideas.concepts.map((x, i) => (
              <button key={x.id} onClick={() => setSel(i)}
                className={`rounded border px-3 py-1.5 text-left text-sm ${i === sel ? 'border-accent bg-panel text-white' : 'border-line text-slate-400 hover:text-white'}`}>
                <span className="text-[10px] text-slate-500">Concept {x.conceptIndex}</span><br />{trunc(x.title, 48)}
              </button>
            ))}
            <span className="ml-auto self-center text-xs text-slate-500">generated {dateTime(ideas.createdAt)}</span>
          </div>

          <Card title={c.title}
            right={<button className={btnGhost} onClick={copy}>{copied ? 'Copied' : 'Copy as Markdown'}</button>}>
            <div className="space-y-4">
              <p className="text-[11px] text-slate-500">
                Scene tags: {Object.keys(BASIS).map((k) => <span key={k} className="mr-1 inline-block"><BasisBadge status={k} /></span>)}
                "Creative" scenes are invented for storytelling. Only "Sourced" matches the research report.
              </p>
              <Section title="Alternative titles"><Bullets items={c.alternativeTitles} /></Section>
              <Section title="Opening hook"><p className="text-sm italic text-slate-300">{c.openingHook}</p></Section>
              <Section title="Storyline"><p className="text-sm text-slate-300">{c.storyline}</p></Section>
              <div className="grid gap-4 md:grid-cols-2">
                <Section title="Narrative structure"><p className="text-sm text-slate-300">{c.narrativeStructure}</p></Section>
                <Section title="Estimated duration"><p className="text-sm text-slate-300">{c.durationMinutes ? `${c.durationMinutes} minutes` : '—'}</p></Section>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Section title="Main characters"><Named items={c.mainCharacters} /></Section>
                <Section title="Locations"><Named items={c.locations} /></Section>
              </div>
              {c.historicalTimeline.length > 0 && (
                <Section title="Historical timeline">
                  <ul className="space-y-0.5 text-sm text-slate-300">
                    {c.historicalTimeline.map((e, i) => <li key={i}>{e.date && <b className="mr-1 text-slate-200">{e.date}</b>}{e.event}</li>)}
                  </ul>
                </Section>
              )}
            </div>
          </Card>

          <Card title={`Scene-by-scene breakdown (${c.scenes.length} scenes)`}>
            <div className="space-y-2">
              {c.scenes.map((s) => (
                <div key={s.number} className="rounded border border-line bg-bg/50 p-3">
                  <div className="mb-1 flex items-center gap-2 text-sm">
                    <span className="text-slate-500">{s.number}.</span><b className="text-slate-200">{s.title}</b><BasisBadge status={s.basis} />
                    {s.durationSeconds && <span className="ml-auto text-xs text-slate-500">~{s.durationSeconds}s</span>}
                  </div>
                  <p className="mb-2 text-sm text-slate-300">{s.description}</p>
                  <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                    <Meta label="3D environment" value={s.environment3d} /><Meta label="Camera" value={s.camera} />
                    <Meta label="Sound effects" value={s.soundEffects} /><Meta label="Music" value={s.music} />
                  </dl>
                </div>
              ))}
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="3D environments"><Bullets items={c.environments3d} /></Card>
            <Card title="Character requirements"><Bullets items={c.characterRequirements} /></Card>
            <Card title="Camera movements"><Bullets items={c.cameraMovements} /></Card>
            <Card title="Sound effects"><Bullets items={c.soundEffects} /></Card>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Music atmosphere"><p className="text-sm text-slate-300">{c.musicAtmosphere || '—'}</p></Card>
            <Card title="Closing scene"><p className="text-sm text-slate-300">{c.closingScene || '—'}</p></Card>
          </div>
          <Card title="Fact-check notes"><Bullets items={c.factCheckNotes} /></Card>
        </>
      )}
    </Page>
  );
}