import { Router } from 'express';
import { db } from './database/db.js';
import { config } from './config.js';
import { latestTopics } from './services/topicQueries.js';
import { getLatestReport, runResearch } from './services/research.js';
import { getLatestIdeas, runIdeas } from './services/ideas.js';
import { getJob, startJob, httpError } from './services/aiJobs.js';

const router = Router();
const wrap = (fn, ok = 200) => (req, res) => {
  try { res.status(ok).json(fn(req)); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
};

function topicId(req) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw httpError(400, 'Invalid topic id');
  if (!db.prepare('SELECT 1 FROM topics WHERE id = ?').get(id)) throw httpError(404, 'Topic not found');
  return id;
}
const requireKey = () => { if (!config.openaiKey) throw httpError(400, 'OPENAI_API_KEY is missing. Add it to .env and restart the server.'); };

router.get('/ai/status', wrap(() => ({
  openaiKeyConfigured: Boolean(config.openaiKey), researchModel: config.openaiResearchModel, ideasModel: config.openaiIdeasModel,
})));

router.get('/topics/:id/ai', wrap((req) => {
  const id = topicId(req);
  const topic = db.prepare('SELECT id, name, category FROM topics WHERE id = ?').get(id);
  const live = latestTopics().find((t) => t.id === id);
  return {
    topic,
    evidence: live && {
      score: live.score, confidence: live.confidence, status: live.status, videoCount: live.videoCount,
      channelCount: live.channelCount, totalViews: live.totalViews, growthRate: live.growthRate, momentumBasis: live.momentumBasis,
    },
    research: getLatestReport(id),
    ideas: getLatestIdeas(id),
    jobs: { research: getJob(`research:${id}`), ideas: getJob(`ideas:${id}`) },
  };
}));

router.post('/topics/:id/research', wrap((req) => {
  const id = topicId(req);
  requireKey();
  startJob(`research:${id}`, (setStep) => runResearch(id, setStep));
  return { started: true };
}, 202));

router.post('/topics/:id/ideas', wrap((req) => {
  const id = topicId(req);
  requireKey();
  if (!getLatestReport(id)) throw httpError(400, 'Research this topic first.');
  startJob(`ideas:${id}`, (setStep) => runIdeas(id, setStep));
  return { started: true };
}, 202));

export default router;