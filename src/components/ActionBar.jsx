import { useState } from 'react';
import { api } from '../services/api.js';
import { btnGhost, btnPrimary, Notice } from './ui.jsx';

export default function ActionBar({ jobs, onRefresh }) {
  const [error, setError] = useState('');
  const act = async (fn) => {
    setError('');
    try { await fn(); await jobs.poll(); } catch (e) { setError(e.message); }
  };
  const { collect, analysis, busy } = jobs;
  const message = collect.running ? `Collecting · ${collect.step}: ${collect.message}`
    : analysis.running ? `Analysing · ${analysis.message}`
    : analysis.message && analysis.message !== 'Idle' ? analysis.message : collect.message || 'Idle';

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button className={btnGhost} onClick={onRefresh}>Refresh</button>
        <button className={btnPrimary} disabled={busy} onClick={() => act(() => api.collect({}))}
          title="Uses the settings saved on the Collection page">Collect now</button>
        <button className={btnGhost} disabled={busy} onClick={() => act(() => api.analysisRun())}>Run analysis</button>
        <span className={`text-xs ${busy ? 'text-accent' : 'text-slate-500'}`}>{message}</span>
      </div>
      {error && <Notice>{error}</Notice>}
    </div>
  );
}