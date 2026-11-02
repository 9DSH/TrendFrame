import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api.js';
import { inputCls } from './ui.jsx';
import { trunc } from '../utils/format.js';

export default function TopicPicker({ id, basePath }) {
  const navigate = useNavigate();
  const [topics, setTopics] = useState([]);
  useEffect(() => { api.topics({}).then(setTopics).catch(() => {}); }, []);
  useEffect(() => {
    if (!id && topics.length) navigate(`${basePath}/${topics[0].id}`, { replace: true });
  }, [id, topics, basePath, navigate]);

  return (
    <select className={`${inputCls} w-72`} value={id ?? ''} onChange={(e) => navigate(`${basePath}/${e.target.value}`)}>
      {!id && <option value="">Select a topic…</option>}
      {topics.map((t) => <option key={t.id} value={t.id}>{trunc(t.name, 50)} ({t.score.toFixed(0)})</option>)}
    </select>
  );
}