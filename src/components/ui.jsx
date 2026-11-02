import { STATUS } from '../utils/format.js';

export const inputCls = 'rounded border border-line bg-bg px-2 py-1 text-sm text-slate-200';
export const btnPrimary = 'rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50';
export const btnGhost = 'rounded border border-line px-3 py-1.5 text-sm text-slate-300 hover:bg-bg disabled:opacity-50';

const KINDS = {
  measured: ['Measured', 'bg-up/15 text-up', 'Taken directly from YouTube statistics'],
  estimated: ['Estimated', 'bg-accent2/15 text-accent2', 'Derived from measured data using assumptions'],
  heuristic: ['Heuristic', 'bg-yellow-400/15 text-yellow-400', 'Rule-based guess, not a measurement'],
};

export function KindTag({ kind }) {
  const [label, cls, tip] = KINDS[kind] ?? KINDS.estimated;
  return <span title={tip} className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>{label}</span>;
}

export function Card({ title, kind, right, children, className = '' }) {
  return (
    <section className={`rounded-lg border border-line bg-panel p-4 ${className}`}>
      {(title || kind || right) && (
        <div className="mb-3 flex items-center gap-2">
          {title && <h2 className="text-sm font-semibold text-slate-300">{title}</h2>}
          {kind && <KindTag kind={kind} />}
          {right && <div className="ml-auto">{right}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, sub, tone = 'text-white' }) {
  return (
    <div className="rounded-lg border border-line bg-panel p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-2xl font-semibold ${tone}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}

export function StatusBadge({ status }) {
  const [label, cls] = STATUS[status] ?? STATUS.unclear;
  return <span className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] ${cls}`}>{label}</span>;
}

export function Direction({ direction }) {
  const map = { up: ['▲', 'text-up'], down: ['▼', 'text-down'], flat: ['▬', 'text-slate-500'] };
  const [sym, cls] = map[direction] ?? map.flat;
  return <span className={`text-[10px] ${cls}`}>{sym}</span>;
}

export function Notice({ tone = 'error', children }) {
  const cls = tone === 'error' ? 'border-down/50 bg-down/10 text-down' : 'border-yellow-400/40 bg-yellow-400/10 text-yellow-300';
  return <div className={`rounded-lg border p-3 text-sm ${cls}`}>{children}</div>;
}

export const Empty = ({ children }) => (
  <div className="flex h-32 items-center justify-center px-4 text-center text-sm text-slate-500">{children}</div>
);

export function Page({ title, subtitle, right, children }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-lg font-semibold text-white">{title}</h1>
          {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        </div>
        {right && <div className="ml-auto">{right}</div>}
      </div>
      {children}
    </div>
  );
}