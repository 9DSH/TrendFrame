import { useState } from 'react';
import { GLOSSARY } from '../utils/glossary.js';

/** Small "i" with a tooltip. Use `term` (glossary key) or `text`. */
export default function Info({ term, text }) {
  const body = text ?? GLOSSARY[term];
  const [pos, setPos] = useState(null);
  if (!body) return null;
  const W = 288;
  const open = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const above = r.bottom > window.innerHeight - 200;
    setPos({
      left: Math.min(Math.max(r.left + r.width / 2 - W / 2, 8), window.innerWidth - W - 8),
      top: above ? undefined : r.bottom + 6,
      bottom: above ? window.innerHeight - r.top + 6 : undefined,
    });
  };
  return (
    <>
      <button type="button" aria-label="What is this?"
        onMouseEnter={open} onMouseLeave={() => setPos(null)} onFocus={open} onBlur={() => setPos(null)}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (pos) setPos(null); else open(e); }}
        className="ml-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-slate-600 align-middle text-[9px] font-semibold leading-none text-slate-400 hover:border-accent hover:text-accent">
        i
      </button>
      {pos && (
        <span role="tooltip" style={{ position: 'fixed', width: W, ...pos }}
          className="pointer-events-none z-50 rounded-md border border-line bg-bg p-2.5 text-left text-xs font-normal normal-case leading-snug tracking-normal text-slate-300 shadow-xl">
          {body}
        </span>
      )}
    </>
  );
}