const jobs = new Map();
const MAX_PARALLEL = 2;

export const httpError = (status, message) => Object.assign(new Error(message), { status });

/** Starts `fn(setStep)` in the background. Errors are stored on the job and shown in the UI. */
export function startJob(key, fn) {
  if (jobs.get(key)?.running) throw httpError(409, 'This job is already running.');
  if ([...jobs.values()].filter((j) => j.running).length >= MAX_PARALLEL)
    throw httpError(429, 'Two AI jobs are already running. Wait for one to finish.');
  const job = { running: true, step: 'starting', startedAt: new Date().toISOString(), finishedAt: null, error: null };
  jobs.set(key, job);
  Promise.resolve()
    .then(() => fn((step) => { job.step = step; }))
    .catch((e) => { job.error = e.message; console.error(`AI job ${key} failed:`, e.message); })
    .finally(() => { job.running = false; job.step = 'idle'; job.finishedAt = new Date().toISOString(); });
}

export const getJob = (key) => jobs.get(key) ?? { running: false, step: 'idle', error: null };