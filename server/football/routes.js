import { Router } from 'express';
import { getMatchDetail, getStatus } from './footballService.js';
import { startSearch, getSearch, cancelSearch } from './searchJobs.js';
import { PitchApiError } from './pitchApi.js';

const router = Router();

function statusOf(e) {
  if (!(e instanceof PitchApiError)) return e.status || 500;
  if (e.code === 'MISSING_KEY') return 400;
  if (e.code === 'RATE_LIMIT_EXCEEDED') return 429;
  if (e.code === 'RESOURCE_NOT_FOUND') return 404;
  return 502;
}

const wrap = (fn, ok = 200) => async (req, res) => {
  try { res.status(ok).json(await fn(req)); }
  catch (e) { res.status(statusOf(e)).json({ error: e.message }); }
};

router.get('/football/status', wrap(() => getStatus()));
router.post('/football/search', wrap((req) => startSearch(req.body?.q), 202));
router.get('/football/search/:id', wrap((req) => getSearch(req.params.id)));
router.delete('/football/search/:id', wrap((req) => cancelSearch(req.params.id)));
router.get('/football/matches/:id/goals', wrap((req) => getMatchDetail(req.params.id)));

export default router;