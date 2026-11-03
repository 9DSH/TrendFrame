
import { useEffect, useState } from 'react';
import { api } from '../services/api.js';
import Info from './Info.jsx';
import { Card, Notice, btnGhost, btnPrimary, inputCls } from './ui.jsx';
import { dateTime } from '../utils/format.js';

export function ScheduleSettings() {
  const [s, setS] = useState(null);
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const sync = (r) => {
    setS(r);
    setForm({
      enabled: r.enabled,
      times: r.times.join(', '),
      catchUp: r.catchUp,
    });
  };

  useEffect(() => {
    api.schedule()
      .then(sync)
      .catch((e) => setMsg({ tone: 'error', text: e.message }));
  }, []);

  if (!s || !form) {
    return (
      <Card title="Scheduled collection">
        {msg
          ? <Notice tone={msg.tone}>{msg.text}</Notice>
          : <p className="text-xs text-slate-400">Loading schedule…</p>}
      </Card>
    );
  }

  const dirty =
    form.enabled !== s.enabled ||
    form.catchUp !== s.catchUp ||
    form.times !== s.times.join(', ');

  const save = async () => {
    setBusy(true);
    setMsg(null);

    try {
      sync(await api.saveSchedule(form));
      setMsg({ tone: 'ok', text: 'Schedule saved successfully.' });
    } catch (e) {
      setMsg({ tone: 'error', text: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title={
        <div className="flex items-center gap-2">
          Scheduled collection
          <span className={`rounded border px-1.5 py-0.5 text-[9px] font-medium ${
            s.enabled
              ? 'border-up/30 bg-up/10 text-up'
              : 'border-line bg-bg text-slate-500'
          }`}>
            {s.enabled ? 'ACTIVE' : 'DISABLED'}
          </span>
        </div>
      }
      right={(
        <div className="flex items-center gap-2">
          {dirty && (
            <span className="text-[10px] text-yellow-400">
              Unsaved changes
            </span>
          )}
          <button
            type="button"
            className={`${btnPrimary} !px-3 !py-1.5 text-xs`}
            disabled={!dirty || busy}
            onClick={save}
          >
            {busy ? 'Saving…' : 'Save schedule'}
          </button>
        </div>
      )}
    >
      <p className="mb-3 text-[10px] leading-relaxed text-slate-500">
        Automatically collects videos using your saved collection settings
        and runs analysis afterwards if enabled. The application must be
        running and your PC awake at the scheduled time.
      </p>

      {msg && (
        <div className="mb-3">
          <Notice tone={msg.tone}>{msg.text}</Notice>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-line bg-bg/40 p-3">
          <label className="flex cursor-pointer items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-slate-200">
                Automatic collection
              </p>
              <p className="mt-0.5 text-[10px] text-slate-500">
                Enable or disable scheduled runs
              </p>
            </div>
            <input
              type="checkbox"
              className="h-4 w-4 shrink-0 accent-current"
              checked={form.enabled}
              onChange={(e) => setForm({
                ...form,
                enabled: e.target.checked,
              })}
            />
          </label>
          
        </div>

        <div className="rounded-lg border border-line bg-bg/40 p-3">
          <label className="block text-[10px] text-slate-400">
            <span className="flex items-center gap-1 font-medium text-slate-300">
              Daily collection times
              <Info text="Comma-separated HH:MM, up to 6 times per day. Example: 08:00, 20:00. Several runs per day provide better growth measurements. Searches cost 100 quota units each, so check the cost estimate on the Collection page first." />
            </span>
            <input
              className={`${inputCls} mt-1.5 w-full`}
              value={form.times}
              placeholder="08:00, 14:00, 20:00"
              onChange={(e) => setForm({
                ...form,
                times: e.target.value,
              })}
            />
            <span className="mt-1 block text-[9px] text-slate-600">
              Uses your PC's local time · HH:MM format
            </span>
          </label>
        </div>

        <div className="rounded-lg border border-line bg-bg/40 p-3 md:col-span-2">
          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 accent-current"
              checked={form.catchUp}
              onChange={(e) => setForm({
                ...form,
                catchUp: e.target.checked,
              })}
            />
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-1 text-xs font-medium text-slate-200">
                Catch up missed collections
                <Info text="Only the latest missed time runs, never several at once. Turn off to skip any run that is more than 5 minutes late." />
              </span>
              <span className="mt-1 block text-[10px] leading-relaxed text-slate-500">
                If the application was closed or your PC was asleep,
                automatically run the latest missed collection when it
                becomes available again.
              </span>
            </span>
          </label>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-bg/40 px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-[10px] font-medium text-slate-400">
            Schedule status
          </p>
          <p className="mt-1 text-xs text-slate-300">
            {s.enabled ? (
              <>
                Next run:{' '}
                <span className="font-semibold text-slate-100">
                  {s.nextRun ? dateTime(s.nextRun) : '—'}
                </span>
                {s.pendingNow && (
                  <span className="ml-1 text-[10px] text-yellow-400">
                    · Catch-up starting soon
                  </span>
                )}
              </>
            ) : (
              <span className="text-slate-500">Scheduling is disabled.</span>
            )}
          </p>
        </div>

        {s.lastSlot && (
          <div className="text-right">
            <p className="text-[10px] text-slate-500">Last scheduled run</p>
            <p className="mt-1 text-[10px] text-slate-300">
              {s.lastSlot}
            </p>
          </div>
        )}
      </div>

      {s.lastError && (
        <div className="mt-2">
          <Notice tone="warn">
            Last scheduled run failed ({dateTime(s.lastError.at)}):{' '}
            {s.lastError.message}
          </Notice>
        </div>
      )}
    </Card>
  );
}

export function BackupCard() {
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    setMsg(null);

    try {
      const r = await api.backup();
      setMsg({
        tone: 'ok',
        text: `Backup saved to ${r.file} (${r.sizeMb} MB). The last ${r.kept} backups are kept.`,
      });
    } catch (e) {
      setMsg({ tone: 'error', text: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title={
        <div className="flex items-center gap-2">
          Database backup
          <span className="rounded border border-line bg-bg px-1.5 py-0.5 text-[9px] text-slate-500">
            LOCAL
          </span>
        </div>
      }
      right={(
        <button
          type="button"
          className={`${btnGhost} !px-3 !py-1.5 text-xs`}
          disabled={busy}
          onClick={run}
        >
          {busy ? 'Creating backup…' : 'Back up now'}
        </button>
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-bg">
          <span className="text-lg">↗</span>
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-slate-200">
            Protect your TrendFrame database
          </p>
          <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
            Creates a complete database backup containing videos, snapshots,
            topics, research, ideas, projects and settings.
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-2 rounded-lg border border-line bg-bg/40 p-3 text-[10px] sm:grid-cols-2">
        <div>
          <p className="text-slate-500">Backup location</p>
          <code className="mt-1 block text-slate-300">data/backups/</code>
        </div>
        <div>
          <p className="text-slate-500">Restore location</p>
          <code className="mt-1 block text-slate-300">data/trendframe.db</code>
        </div>
      </div>

      <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
        To restore, stop the application and replace the database file with
        a backup. API keys are stored separately in <code>.env</code> and
        are not included.
      </p>

      {msg && (
        <div className="mt-3">
          <Notice tone={msg.tone}>{msg.text}</Notice>
        </div>
      )}
    </Card>
  );
}
