
import { NavLink } from 'react-router-dom';

const GROUPS = [
  {
    title: 'OVERVIEW',
    items: [
      ['/', 'Dashboard', true],
    ],
  },
  {
    title: 'DISCOVERY',
    items: [
      ['/topics', 'Trending topics'],
      ['/channels', 'Channels'],
    ],
  },
  {
    title: 'AI STUDIO',
    items: [
      ['/research', 'AI research'],
      ['/ideas', 'Animation ideas'],
    ],
  },
  {
    title: 'WORKSPACE',
    items: [
      ['/projects', 'Saved projects'],
      ['/collection', 'Collection'],
    ],
  },
  {
    title: 'INSIGHTS',
    items: [
      ['/analytics', 'Analytics'],
      ['/scoring', 'Scoring details'],
    ],
  },
  {
    title: 'SYSTEM',
    items: [
      ['/settings', 'Settings'],
    ],
  },
];

export default function Sidebar() {
  return (
    <aside className="sticky top-0 flex h-screen w-52 shrink-0 flex-col border-r border-line bg-panel/60 p-3">

      <div className="mb-7 px-2 text-lg font-semibold text-white">
        Trend<span className="text-accent">Frame</span>
      </div>

      <nav className="flex flex-col gap-5">
        {GROUPS.map((group) => (
          <div key={group.title}>
            <div className="mb-2 px-2 text-[10px] font-semibold tracking-[0.14em] text-slate-600">
              {group.title}
            </div>

            <div className="flex flex-col gap-0.5">
              {group.items.map(([to, label, end]) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    `rounded px-2 py-1.5 text-sm transition-colors ${
                      isActive
                        ? 'bg-bg text-white'
                        : 'text-slate-400 hover:bg-bg/50 hover:text-white'
                    }`
                  }
                >
                  {label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-auto px-2 pt-4 text-[10px] text-slate-600">
        Local only
      </div>
    </aside>
  );
}
