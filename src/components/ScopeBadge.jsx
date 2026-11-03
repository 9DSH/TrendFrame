import { useEffect, useState } from 'react';
import { api } from '../services/api.js';

const LABEL = { both: 'all videos', short: 'Shorts only', long: 'long videos only' };

/** Shows which videos the current topics were built from, and warns when settings changed since. */
export default function ScopeBadge() {
  const [s, setS] = useState(null);
  useEffect(() => { api.scope().then(setS).catch(() => {}); }, []);
  if (!s) return null;
  const last = s.lastAnalysis;
  if (!last) return <p className="text-[11px] text-slate-500">Analysis scope: not analysed yet.</p>;
  const cur = s.settings;
  const stale = last.videoType !== cur.analysisVideoType || last.windowDays !== cur.windowDays || last.shortMaxSeconds !== cur.shortMaxSeconds;
  return (
    <p className="text-[11px] text-slate-500">
      Analysis scope: <b className="text-slate-300">{LABEL[last.videoType]}</b> · last {last.windowDays} days · Shorts ≤ {last.shortMaxSeconds} s
      {stale && <span className="ml-2 text-yellow-400">Settings changed since then. Run the analysis to apply them.</span>}
    </p>
  );
}