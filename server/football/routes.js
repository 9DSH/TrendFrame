import { Router } from 'express';
import { searchMatches, getMatchDetail, getStatus } from './footballService.js';
import { PitchApiError } from './pitchApi.js';

const router = Router();

function statusOf(e) {
  if (!(e instanceof PitchApiError)) return e.status || 500;
  if (e.code === 'MISSING_KEY') return 400;
  if (e.code === 'RATE_LIMIT_EXCEEDED') return 429;
  if (e.code === 'RESOURCE_NOT_FOUND') return 404;
  return 502; // PitchAPI itself failed or rejected the key
}

const wrap = (fn) => async (req, res) => {
  try { res.json(await fn(req)); }
  catch (e) { res.status(statusOf(e)).json({ error: e.message }); }
};

router.get('/football/status', wrap(() => getStatus()));
router.get('/football/search', wrap((req) => searchMatches(req.query.q)));
router.get('/football/matches/:id/goals', wrap((req) => getMatchDetail(req.params.id)));

export default router;