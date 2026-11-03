import { Router } from 'express';
import { db } from './database/db.js';
import { latestTopics } from './services/topicQueries.js';
import { getLatestReport } from './services/research.js';

export const STATUSES = ['discovered', 'researching', 'approved', 'scripting', 'asset_preparation', 'animation', 'editing', 'published'];

const router = Router();
const bad = (m, status = 400) => Object.assign(new Error(m), { status });
const wrap = (fn) => (req, res) => {
  try { res.json(fn(req)); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
};

const BASE = `SELECT p.*, t.name AS topic_name, t.category AS topic_category,
    ai.concept_index, json_extract(ai.idea, '$.title') AS idea_title
  FROM saved_projects p
  LEFT JOIN topics t ON t.id = p.topic_id
  LEFT JOIN animation_ideas ai ON ai.id = p.animation_idea_id`;

const shape = (r) => ({
  id: r.id, topicId: r.topic_id, animationIdeaId: r.animation_idea_id, title: r.title, status: r.status,
  notes: r.notes ?? '', tags: JSON.parse(r.tags || '[]'), createdAt: r.created_at, updatedAt: r.updated_at,
  topicName: r.topic_name, topicCategory: r.topic_category, ideaTitle: r.idea_title, conceptIndex: r.concept_index,
});

const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ').trim().slice(0, max);

function normalizeTags(input) {
  const raw = Array.isArray(input) ? input : String(input ?? '').split(',');
  const seen = new Set();
  const out = [];
  for (const t of raw.map((x) => clean(x, 30)).filter(Boolean)) {
    if (!seen.has(t.toLowerCase())) { seen.add(t.toLowerCase()); out.push(t); }
  }
  if (out.length > 15) throw bad('At most 15 tags per project.');
  return out;
}

const getRow = (id) => {
  const r = db.prepare(`${BASE} WHERE p.id = ?`).get(id);
  if (!r) throw bad('Project not found', 404);
  return r;
};
const projectId = (req) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw bad('Invalid project id');
  return id;
};

router.get('/projects', wrap((req) => {
  const { status, q, tag } = req.query;
  const topicId = req.query.topicId ? Number(req.query.topicId) : null;
  const needle = q ? String(q).toLowerCase() : '';
  let all = db.prepare(`${BASE} ORDER BY p.updated_at DESC`).all().map(shape);
  const allTags = [...new Set(all.flatMap((p) => p.tags))].sort((a, b) => a.localeCompare(b));
  if (topicId) all = all.filter((p) => p.topicId === topicId);
  if (tag) all = all.filter((p) => p.tags.includes(String(tag)));
  if (needle) all = all.filter((p) => [p.title, p.notes, p.topicName, p.ideaTitle, ...p.tags].some((x) => x && String(x).toLowerCase().includes(needle)));
  const counts = Object.fromEntries(STATUSES.map((s) => [s, all.filter((p) => p.status === s).length]));
  return { items: status ? all.filter((p) => p.status === status) : all, counts, total: all.length, allTags };
}));

router.post('/projects', wrap((req) => {
  const topicId = Number(req.body?.topicId);
  const ideaId = req.body?.animationIdeaId == null ? null : Number(req.body.animationIdeaId);
  const topic = Number.isInteger(topicId) && db.prepare('SELECT id, name FROM topics WHERE id = ?').get(topicId);
  if (!topic) throw bad('Topic not found', 404);

  let ideaTitle = null;
  if (ideaId != null) {
    const idea = db.prepare('SELECT topic_id, json_extract(idea, \'$.title\') AS title FROM animation_ideas WHERE id = ?').get(ideaId);
    if (!idea || idea.topic_id !== topicId) throw bad('That concept does not belong to this topic.');
    ideaTitle = idea.title;
  }
  const existing = db.prepare('SELECT id FROM saved_projects WHERE topic_id IS ? AND animation_idea_id IS ?').get(topicId, ideaId);
  if (existing) return { ...shape(getRow(existing.id)), existed: true };

  const status = req.body?.status ?? 'discovered';
  if (!STATUSES.includes(status)) throw bad('Unknown status.');
  const now = new Date().toISOString();
  const info = db.prepare(`INSERT INTO saved_projects (topic_id, animation_idea_id, title, status, notes, tags, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?)`).run(topicId, ideaId, clean(req.body?.title || ideaTitle || topic.name, 200), status,
    clean(req.body?.notes, 20000), JSON.stringify(normalizeTags(req.body?.tags)), now, now);
  return shape(getRow(Number(info.lastInsertRowid)));
}));

router.get('/projects/:id', wrap((req) => {
  const row = getRow(projectId(req));
  const project = shape(row);
  const ideaRow = row.animation_idea_id ? db.prepare('SELECT idea FROM animation_ideas WHERE id = ?').get(row.animation_idea_id) : null;
  const live = row.topic_id ? latestTopics().find((t) => t.id === row.topic_id) : null;
  const rep = row.topic_id ? getLatestReport(row.topic_id) : null;
  return {
    project,
    concept: ideaRow ? JSON.parse(ideaRow.idea) : null,
    evidence: live ? {
      score: live.score, confidence: live.confidence, status: live.status, videoCount: live.videoCount,
      channelCount: live.channelCount, growthRate: live.growthRate, momentumBasis: live.momentumBasis,
    } : null,
    research: rep ? {
      createdAt: rep.createdAt, subject: rep.report.subject, summary: rep.report.summary,
      coherent: rep.report.coherent, sourceCount: rep.report.meta?.sourceCount ?? rep.sources.length,
    } : null,
  };
}));

router.put('/projects/:id', wrap((req) => {
  const id = projectId(req);
  const cur = getRow(id);
  const b = req.body || {};
  const title = b.title === undefined ? cur.title : clean(b.title, 200);
  if (!title) throw bad('A project needs a title.');
  const status = b.status === undefined ? cur.status : b.status;
  if (!STATUSES.includes(status)) throw bad('Unknown status.');
  const notes = b.notes === undefined ? cur.notes : clean(b.notes, 20000);
  const tags = b.tags === undefined ? cur.tags : JSON.stringify(normalizeTags(b.tags));
  db.prepare('UPDATE saved_projects SET title = ?, status = ?, notes = ?, tags = ?, updated_at = ? WHERE id = ?')
    .run(title, status, notes, tags, new Date().toISOString(), id);
  return shape(getRow(id));
}));

router.delete('/projects/:id', wrap((req) => {
  const id = projectId(req);
  getRow(id);
  db.prepare('DELETE FROM saved_projects WHERE id = ?').run(id);
  return { deleted: true };
}));

export default router;