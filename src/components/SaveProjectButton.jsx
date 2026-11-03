import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api.js';
import { btnGhost, btnPrimary } from './ui.jsx';

/** Saves a topic (no ideaId) or one animation concept (ideaId). Shows a link once saved. */
export default function SaveProjectButton({ topicId, ideaId = null, label = 'Save project' }) {
  const [project, setProject] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setProject(null); setError('');
    api.projects({ topicId })
      .then((d) => { if (alive) setProject(d.items.find((p) => (p.animationIdeaId ?? null) === (ideaId ?? null)) ?? null); })
      .catch(() => {});
    return () => { alive = false; };
  }, [topicId, ideaId]);

  const save = async () => {
    setBusy(true); setError('');
    try { setProject(await api.createProject({ topicId, animationIdeaId: ideaId })); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  if (project) return <Link to={`/projects/${project.id}`} className={btnGhost}>✓ Saved · open project</Link>;
  return (
    <span className="inline-flex items-center gap-2">
      <button className={btnPrimary} disabled={busy} onClick={save}>{busy ? 'Saving…' : label}</button>
      {error && <span className="text-xs text-down">{error}</span>}
    </span>
  );
}