import { NavLink } from 'react-router-dom';

const ITEMS = [
  ['/', 'Dashboard', true],
  ['/collection', 'Collection'],
  ['/scoring', 'Scoring & settings'],
  ['/topics', 'Trending topics'],
  ['/analytics', 'Analytics'],
  ['/research', 'AI research'],
  ['/ideas', 'Animation ideas'],
];
const SOON = ['Saved projects'];

export default function Sidebar() {
  return (
    <aside className="sticky top-0 flex h-screen w-52 shrink-0 flex-col border-r border-line bg-panel/60 p-3">
      <div className="mb-5 px-2 text-lg font-semibold text-white">Trend<span className="text-accent">Frame</span></div>
      <nav className="flex flex-col gap-0.5">
        {ITEMS.map(([to, label, end]) => (
          <NavLink key={to} to={to} end={end}
            className={({ isActive }) => `rounded px-2 py-1.5 text-sm ${isActive ? 'bg-bg text-white' : 'text-slate-400 hover:text-white'}`}>
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-6 px-2 text-[10px] uppercase tracking-wide text-slate-600">Coming next</div>
      <div className="mt-1 flex flex-col gap-0.5">
        {SOON.map((s) => <span key={s} className="px-2 py-1 text-sm text-slate-600">{s}</span>)}
      </div>
      <div className="mt-auto px-2 text-[10px] text-slate-600">Local only · Phase 5</div>
    </aside>
  );
}