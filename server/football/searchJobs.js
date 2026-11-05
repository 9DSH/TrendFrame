import { randomUUID } from 'node:crypto';
import { searchMatches, SearchCancelled } from './footballService.js';
import { pitchEvents } from './pitchApi.js';

const jobs = new Map();
const MAX_LOG = 60;
const KEEP_MS = 30 * 60_000;
const now = () => new Date().toISOString();
const httpError = (status, message) => Object.assign(new Error(message), { status });

const view = (j) => ({
  id: j.id, state: j.state, phase: j.phase, done: j.done, total: j.total, log: j.log,
  startedAt: j.startedAt, updatedAt: j.updatedAt, finishedAt: j.finishedAt,
  result: j.state === 'done' ? j.result : null, error: j.error,
});

function prune() {
  for (const [id, j] of jobs) if (j.finishedAt && Date.now() - Date.parse(j.finishedAt) > KEEP_MS) jobs.delete(id);
}

export function startSearch(q) {
  prune();
  for (const j of jobs.values()) if (j.state === 'running') j.cancel = true; // one search at a time

  const job = {
    id: randomUUID(), state: 'running', phase: 'Starting', done: 0, total: 0, log: [], cancel: false,
    startedAt: now(), updatedAt: now(), finishedAt: null, result: null, error: null,
  };
  jobs.set(job.id, job);

  const ctl = {
    progress(phase, done = 0, total = 0) { Object.assign(job, { phase, done, total, updatedAt: now() }); },
    log(msg) { job.log.push({ t: now(), msg }); if (job.log.length > MAX_LOG) job.log.shift(); job.updatedAt = now(); },
    cancelled: () => job.cancel,
  };
  const onRetry = (msg) => ctl.log(msg);
  pitchEvents.on('retry', onRetry);

  searchMatches(q, ctl)
    .then((result) => { job.result = result; job.state = 'done'; ctl.progress('Done', job.total, job.total); })
    .catch((e) => {
      if (e instanceof SearchCancelled || job.cancel) { job.state = 'cancelled'; job.error = 'Search cancelled.'; return; }
      job.state = 'failed';
      job.error = e.message || 'The search failed.';
      console.error('Football search failed:', e.message);
    })
    .finally(() => { pitchEvents.off('retry', onRetry); job.finishedAt = now(); });

  return view(job);
}

export function getSearch(id) {
  const j = jobs.get(id);
  if (!j) throw httpError(404, 'Search not found (the server may have restarted). Search again.');
  return view(j);
}

export function cancelSearch(id) {
  const j = jobs.get(id);
  if (!j) throw httpError(404, 'Search not found.');
  if (j.state === 'running') j.cancel = true;
  return view(j);
}