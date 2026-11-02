export const COLORS = {
  bg: '#10131C', panel: '#1A1E2E', line: '#2A3047', accent: '#4A90E2', accent2: '#8B7CF6',
  up: '#34D399', down: '#F87171', warn: '#FACC15', muted: '#94A3B8',
};
export const SERIES = [COLORS.accent, COLORS.accent2, COLORS.up, COLORS.warn, COLORS.down];

const nf = new Intl.NumberFormat('en-US');
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
export const num = (v) => (v == null ? '—' : nf.format(Math.round(v)));
export const short = (v) => (v == null ? '—' : compact.format(v));
export const pct = (v, digits = 2) => (v == null ? '—' : `${(v * 100).toFixed(digits)}%`);
export const growthPct = (g) => (g == null ? '—' : `${g >= 0 ? '+' : ''}${(g * 100).toFixed(0)}%`);
export const dateTime = (iso) =>
  iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
export const dayLabel = (d) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
export const trunc = (s, n) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s ?? '');

export function timeAgo(iso) {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

export const STATUS = {
  emerging: ['Emerging', 'bg-accent2/20 text-accent2'],
  growing: ['Rapidly growing', 'bg-up/20 text-up'],
  sustained: ['Sustained', 'bg-accent/20 text-accent'],
  declining: ['Declining', 'bg-down/20 text-down'],
  saturated: ['Saturated', 'bg-yellow-400/20 text-yellow-400'],
  unclear: ['Unclear', 'bg-slate-500/20 text-slate-400'],
};

export const METRICS = {
  trend_momentum: 'Trend momentum', view_velocity: 'View velocity', engagement: 'Engagement',
  cross_channel: 'Cross-channel interest', competition: 'Competition opportunity',
  long_term: 'Long-term relevance', animation_potential: 'Animation potential',
};

export const COMPETITION_STYLE = { low: 'text-up', medium: 'text-yellow-400', high: 'text-down', unknown: 'text-slate-500' };
export const COMPETITION_ORDER = { low: 1, medium: 2, high: 3, unknown: 4 };