import { useState } from 'react';
import { api } from '../services/api.js';
import { Card, Notice, btnGhost } from './ui.jsx';

export default function TranslateCard() {
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await api.translate();
      setMsg({ tone: 'ok', text: `Translated ${r.translated} titles. ${r.remaining} still untranslated${r.remaining ? ' (click again for the next batch)' : ''}.` });
    } catch (e) { setMsg({ tone: 'error', text: e.message }); } finally { setBusy(false); }
  };
  return (
    <Card title="Video titles in English" right={<button className={btnGhost} disabled={busy} onClick={run}>{busy ? 'Translating…' : 'Translate titles now'}</button>}>
      <p className="text-xs text-slate-500">Translates up to 300 untranslated titles per click using the topic naming model. Titles already in English are kept. For automatic translation after each analysis, turn on "Translate video titles to English" above.</p>
      {msg && <div className="mt-3"><Notice tone={msg.tone}>{msg.text}</Notice></div>}
    </Card>
  );
}