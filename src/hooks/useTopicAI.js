import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api.js';

/** Loads research and ideas for a topic and polls every 3 s while an AI job is running. */
export function useTopicAI(id) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    try { setData(await api.topicAI(id)); setError(''); } catch (e) { setError(e.message); }
  }, [id]);

  useEffect(() => { setData(null); load(); }, [load]);

  const running = Boolean(data && (data.jobs.research?.running || data.jobs.ideas?.running));
  useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [running, load]);

  return { data, error, reload: load };
}