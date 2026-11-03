async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, { headers: { 'Content-Type': 'application/json' }, ...options });
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
  topicAnalytics: (id) => request(`/topics/${id}/analytics`),
  aiStatus: () => request('/ai/status'),
  topicAI: (id) => request(`/topics/${id}/ai`),
  research: (id) => post(`/topics/${id}/research`),
  generateIdeas: (id) => post(`/topics/${id}/ideas`),
};