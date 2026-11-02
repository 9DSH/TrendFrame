import { ResponsiveContainer } from 'recharts';
import { COLORS } from '../utils/format.js';

export const axis = {
  stroke: COLORS.muted,
  tick: { fill: COLORS.muted, fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: COLORS.line },
};
export const gridProps = { stroke: COLORS.line, strokeDasharray: '3 3', vertical: false };
export const tooltipProps = {
  contentStyle: { background: COLORS.panel, border: `1px solid ${COLORS.line}`, borderRadius: 6, fontSize: 12 },
  labelStyle: { color: '#e2e8f0' },
  itemStyle: { color: '#cbd5e1' },
};
export const barCursor = { fill: 'rgba(74,144,226,0.08)' };
export const legendProps = { wrapperStyle: { fontSize: 11, color: COLORS.muted } };

export function Chart({ height = 240, children }) {
  return <ResponsiveContainer width="100%" height={height}>{children}</ResponsiveContainer>;
}