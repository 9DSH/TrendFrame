
import { useEffect, useState } from 'react';
import { api } from '../services/api.js';
import Info from './Info.jsx';
import { Card, Notice, btnGhost, btnPrimary, inputCls } from './ui.jsx';

const toRows = (cats) => cats.map((c) => ({
  key: c.key,
  label: c.label,
  ids: c.youtubeCategoryIds.join(', '),
  queries: c.queries.join('\n'),
}));

const toPayload = (rows) => rows.map((r) => ({
  key: r.key,
  label: r.label,
  youtubeCategoryIds: r.ids.split(',').map((x) => x.trim()).filter(Boolean),
  queries: r.queries.split('\n').map((x) => x.trim()).filter(Boolean),
}));

export default function CategorySettings({ onSaved }) {
  const [rows, setRows] = useState(null);
  const [initial, setInitial] = useState('');
  const [defaults, setDefaults] = useState([]);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.categories()
      .then((d) => {
        const r = toRows(d.categories);
        setRows(r);
        setInitial(JSON.stringify(r));
        setDefaults(toRows(d.defaults));
      })
      .catch((e) => setMsg({ tone: 'error', text: e.message }));
  }, []);

  if (!rows) {
    return (
      <Card title="Categories">
        {msg
          ? <Notice tone={msg.tone}>{msg.text}</Notice>
          : <p className="text-xs text-slate-400">Loading categories…</p>}
      </Card>
    );
  }

  const dirty = JSON.stringify(rows) !== initial;

  const edit = (i, patch) => {
    setRows((rs) => rs.map((r, j) => (
      j === i ? { ...r, ...patch } : r
    )));
  };

  const save = async () => {
    setBusy(true);
    setMsg(null);

    try {
      const result = await api.saveCategories(toPayload(rows));
      const saved = toRows(result.categories);

      setRows(saved);
      setInitial(JSON.stringify(saved));
      onSaved?.();

      setMsg({
        tone: 'ok',
        text: 'Categories saved. Changes apply to the next collection. Run analysis afterwards to regroup topics.',
      });
    } catch (e) {
      setMsg({ tone: 'error', text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const restore = () => {
    setRows(defaults.map((r) => ({ ...r })));
    setMsg(null);
  };

  const add = () => {
    setRows((rs) => [
      ...rs,
      { key: null, label: '', ids: '', queries: '' },
    ]);
    setMsg(null);
  };

  const remove = (i) => {
    setRows((rs) => rs.filter((_, j) => j !== i));
    setMsg(null);
  };

  return (
    <Card
      title={
        <div className="flex items-center gap-2">
          Categories
          <span className="rounded border border-line bg-bg px-1.5 py-0.5 text-[10px] font-normal text-slate-400">
            {rows.length} / 30
          </span>
        </div>
      }
      right={(
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {dirty && (
            <span className="mr-1 text-[10px] text-yellow-400">
              Unsaved changes
            </span>
          )}
          <button
            type="button"
            className={`${btnGhost} !px-2 !py-1 text-[10px]`}
            disabled={busy}
            onClick={restore}
          >
            Restore defaults
          </button>
          <button
            type="button"
            className={`${btnPrimary} !px-3 !py-1.5 text-xs`}
            disabled={!dirty || busy}
            onClick={save}
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-3xl text-[10px] leading-relaxed text-slate-500">
          Categories are collected through YouTube's most-popular charts
          (category IDs) and/or keyword searches. Removing a category stops
          future collection but preserves its existing videos.
        </p>
        <span className="shrink-0 text-[10px] text-slate-500">
          Collection configuration
        </span>
      </div>

      {msg && (
        <div className="mb-3">
          <Notice tone={msg.tone}>{msg.text}</Notice>
        </div>
      )}

      <div className="grid gap-2.5 xl:grid-cols-2">
        {rows.map((r, i) => (
          <section
            key={r.key ?? `new-${i}`}
            className="min-w-0 rounded-lg border border-line bg-bg/40 p-3"
          >
            {/* Category heading */}
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-line bg-panel text-[10px] font-semibold text-slate-400">
                  {String(i + 1).padStart(2, '0')}
                </div>
                <span className="truncate text-xs font-semibold text-slate-200">
                  {r.label || 'New category'}
                </span>
                {r.key && (
                  <span className="truncate text-[9px] text-slate-600">
                    {r.key}
                  </span>
                )}
              </div>

              <button
                type="button"
                className="shrink-0 rounded px-2 py-1 text-[10px] text-down hover:bg-down/10 disabled:cursor-not-allowed disabled:opacity-30"
                disabled={rows.length <= 1 || busy}
                onClick={() => remove(i)}
              >
                Remove
              </button>
            </div>

            {/* Name and YouTube IDs */}
            <div className="mb-2 grid grid-cols-2 gap-2">
              <label className="min-w-0 text-[10px] text-slate-400">
                Category name
                <input
                  className={`${inputCls} mt-1 w-full`}
                  placeholder="e.g. Technology"
                  value={r.label}
                  onChange={(e) => edit(i, { label: e.target.value })}
                />
              </label>

              <label className="min-w-0 text-[10px] text-slate-400">
                YouTube IDs
                <Info text="Comma-separated category IDs for YouTube's most-popular chart. Examples: 28 = Science & Technology, 25 = News & Politics, 24 = Entertainment, 20 = Gaming, 17 = Sports. Leave empty for keyword-only collection." />
                <input
                  className={`${inputCls} mt-1 w-full`}
                  placeholder="e.g. 28, 20"
                  value={r.ids}
                  onChange={(e) => edit(i, { ids: e.target.value })}
                />
              </label>
            </div>

            {/* Search queries */}
            <label className="block text-[10px] text-slate-400">
              <span className="flex items-center gap-1">
                Search queries
                <Info text="Each keyword search costs approximately 100 quota units. Only the first N queries are used, where N is configured under Keyword searches per category (maximum 2). Put your strongest queries first. Up to 5 are stored." />
                <span className="ml-auto text-[9px] text-slate-600">
                  One query per line
                </span>
              </span>
              <textarea
                rows={2}
                className={`${inputCls} mt-1 w-full resize-y leading-relaxed`}
                placeholder={'e.g.\nAI technology trends\nEmerging tech startups'}
                value={r.queries}
                onChange={(e) => edit(i, { queries: e.target.value })}
              />
            </label>
          </section>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
        <p className="text-[10px] text-slate-500">
          {rows.length} categories configured
        </p>
        <button
          type="button"
          className={`${btnGhost} !px-3 !py-1.5 text-xs`}
          disabled={rows.length >= 30 || busy}
          onClick={add}
        >
          + Add category
        </button>
      </div>
    </Card>
  );
}
