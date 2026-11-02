export const BASIS = {
  sourced: ['Sourced', 'bg-up/15 text-up', 'A retrieved web source is cited. Open it to check the claim.'],
  unverified: ['Unverified', 'bg-yellow-400/15 text-yellow-400', 'No retrieved source supports this claim'],
  speculation: ['Speculation', 'bg-orange-400/15 text-orange-400', 'Inference or hypothesis, not established fact'],
  creative: ['Creative', 'bg-accent2/15 text-accent2', 'Invented for storytelling, not a claim of fact'],
};

export function BasisBadge({ status }) {
  const [label, cls, tip] = BASIS[status] ?? BASIS.unverified;
  return <span title={tip} className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>{label}</span>;
}

export function SourceRefs({ ids = [], sources = [] }) {
  return ids.map((id) => {
    const s = sources.find((x) => x.id === id);
    return s ? (
      <a key={id} href={s.url} target="_blank" rel="noreferrer noopener" title={s.title || s.url}
        className="mr-1 text-[11px] text-accent hover:underline">[{id}]</a>
    ) : null;
  });
}

export function ClaimList({ items, sources, empty = 'Nothing reported.' }) {
  if (!items?.length) return <p className="text-xs text-slate-500">{empty}</p>;
  return (
    <ul className="space-y-2">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2 text-sm">
          <span className="mt-0.5 shrink-0"><BasisBadge status={it.status} /></span>
          <span className="text-slate-300">
            {it.date && <b className="mr-1 text-slate-200">{it.date}</b>}
            {(it.name || it.title) && <b className="mr-1 text-slate-200">{it.name || it.title}:</b>}
            {it.text} <SourceRefs ids={it.sourceIds} sources={sources} />
          </span>
        </li>
      ))}
    </ul>
  );
}