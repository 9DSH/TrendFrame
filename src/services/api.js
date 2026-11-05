async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, { headers: { 'Content-Type': 'application/json' }, ...options });
  } catch (e) {
    throw new Error(e.name === 'TimeoutError' ? 'The server took too long to answer.' : 'Cannot reach the TrendFrame server. Is it still running?');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

const post = (path, body) => request(path, { method: 'POST', body: JSON.stringify(body || {}) });
const query = (params) => new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v)));

export const api = {
  health: () => request('/health'),
  config: () => request('/config'),
  settings: () => request('/settings'),
  saveSettings: (body) => request('/settings', { method: 'PUT', body: JSON.stringify(body) }),
  quota: () => request('/quota'),
  stats: () => request('/stats'),
  estimate: (body) => post('/collect/estimate', body),
  collect: (body) => post('/collect', body),
  status: () => request('/collect/status'),
  runs: () => request('/collect/runs'),
  videos: (params) => request(`/videos?${query(params)}`),
  // Phase 3
  analysisRun: () => post('/analysis/run'),
  analysisStatus: () => request('/analysis/status'),
  topics: (params) => request(`/topics?${query(params)}`),
  topic: (id) => request(`/topics/${id}`),
  weights: () => request('/scoring/weights'),
  saveWeights: (weights) => request('/scoring/weights', { method: 'PUT', body: JSON.stringify({ weights }) }),
  dashboard: (type) => request(`/dashboard?${query({ type })}`),
  // Video types, channels, settings
  settingsSchema: () => request('/settings/schema'),
  scope: () => request('/scope'),
  channels: (params) => request(`/channels?${query(params)}`),
  channel: (id) => request(`/channels/${id}`),
  regions: () => request('/regions'),
  topicAnalytics: (id, type) => request(`/topics/${id}/analytics?${query({ type })}`),
  aiStatus: () => request('/ai/status'),
  topicAI: (id) => request(`/topics/${id}/ai`),
  research: (id) => post(`/topics/${id}/research`),
  generateIdeas: (id) => post(`/topics/${id}/ideas`),
  dashboardDetails: (kind, type) => request(`/dashboard/details?${query({ kind, type })}`),
  env: () => request('/env'),
  saveEnv: (body) => request('/env', { method: 'PUT', body: JSON.stringify(body) }),
  testEnv: (target) => post('/env/test', { target }),
  categories: () => request('/categories'),
  saveCategories: (categories) => request('/categories', { method: 'PUT', body: JSON.stringify({ categories }) }),
  // Phase 6
  projects: (params) => request(`/projects?${query(params)}`),
  project: (id) => request(`/projects/${id}`),
  createProject: (body) => post('/projects', body),
  updateProject: (id, body) => request(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteProject: (id) => request(`/projects/${id}`, { method: 'DELETE' }),
  schedule: () => request('/schedule'),
  saveSchedule: (body) => request('/schedule', { method: 'PUT', body: JSON.stringify(body) }),
  backup: () => post('/backup'),
  translate: () => post('/translate'),
  footballStatus: () => request('/football/status'),
  footballSearchStart: (q) => post('/football/search', { q }),
  footballSearchStatus: (id) => request(`/football/search/${id}`),
  footballSearchCancel: (id) => request(`/football/search/${id}`, { method: 'DELETE' }),
  footballGoals: (id) => request(`/football/matches/${id}/goals`, { signal: AbortSignal.timeout(90_000) }),
};
