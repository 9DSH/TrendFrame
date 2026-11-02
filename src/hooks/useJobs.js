import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/api.js';

/** Polls collection and analysis status. Calls onFinished() when either job stops running. */
export function useJobs(onFinished) {
  const [collect, setCollect] = useState({ running: false });
  const [analysis, setAnalysis] = useState({ running: false, warnings: [] });
  const prev = useRef({ c: false, a: false });
  const cb = useRef(onFinished);
  cb.current = onFinished;

  const poll = useCallback(async () => {
    try {
      const [c, a] = await Promise.all([api.status(), api.analysisStatus()]);
      setCollect(c);
      setAnalysis(a);
      if ((prev.current.c && !c.running) || (prev.current.a && !a.running)) cb.current?.();
      prev.current = { c: c.running, a: a.running };
    } catch { /* server restarting */ }
  }, []);

  useEffect(() => {
    poll();
    const t = setInterval(poll, 2000);
    return () => clearInterval(t);
  }, [poll]);

  return { collect, analysis, busy: Boolean(collect.running || analysis.running), poll };
}