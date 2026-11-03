
import { useEffect, useState } from 'react';
import { api } from '../services/api.js';
import Info from './Info.jsx';
import { Card, Notice, btnGhost, btnPrimary, inputCls } from './ui.jsx';

const GROUPS = [
  { key: 'keys', title: 'Integrations' },
  { key: 'server', title: 'Server configuration' },
];

const PROVIDERS = [
  {
    id: 'openai',
    title: 'OpenAI',
    description: 'AI research and topic analysis',
    key: 'OPENAI_API_KEY',
    test: 'openai',
    icon: '✳',
    modelFields: true,
  },
  {
    id: 'youtube',
    title: 'YouTube Data API',
    description: 'Video discovery and channel data',
    key: 'YOUTUBE_API_KEY',
    test: 'youtube',
    icon: '▶',
    modelFields: false,
  },
];

export default function EnvSettings() {
  const [fields, setFields] = useState(null);
  const [vals, setVals] = useState({});
  const [clear, setClear] = useState({});
  const [models, setModels] = useState([]);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState('');

  const load = async () => {
    const result = await api.env();
    setFields(result.fields);
    setVals({});
    setClear({});
  };

  useEffect(() => {
    load().catch((e) => setMsg({ tone: 'error', text: e.message }));
  }, []);

  if (!fields) {
    return (
      <Card title="Integrations">
        {msg
          ? <Notice tone={msg.tone}>{msg.text}</Notice>
          : <p className="text-xs text-slate-400">Loading configuration…</p>}
      </Card>
    );
  }

  const patch = {};

  for (const f of fields) {
    if (f.secret) {
      if (clear[f.key]) patch[f.key] = null;
      else if (vals[f.key]) patch[f.key] = vals[f.key];
    } else if (vals[f.key] !== undefined && vals[f.key] !== f.value) {
      patch[f.key] = vals[f.key];
    }
  }

  const dirty = Object.keys(patch).length > 0;

  const save = async () => {
    setBusy('save');
    setMsg(null);

    try {
      const r = await api.saveEnv(patch);
      setFields(r.fields);
      setVals({});
      setClear({});
      setMsg({
        tone: 'ok',
        text: r.restart.length
          ? `Saved. Restart npm run dev for ${r.restart.join(', ')} to take effect. Other changes are already active.`
          : 'Configuration saved and applied immediately.',
      });
    } catch (e) {
      setMsg({ tone: 'error', text: e.message });
    } finally {
      setBusy('');
    }
  };

  const test = async (target) => {
    setBusy(target);
    setMsg(null);

    try {
      const r = await api.testEnv(target);
      if (r.models) setModels(r.models);
      setMsg({ tone: 'ok', text: r.message });
    } catch (e) {
      setMsg({ tone: 'error', text: e.message });
    } finally {
      setBusy('');
    }
  };

  const renderField = (f) => (
    <div key={f.key} className="min-w-0">
      <div className="mb-1 flex flex-wrap items-center gap-x-1 text-[11px] text-slate-400">
        <span>{f.label}</span>
        <Info text={f.help} />
        {f.restart && (
          <span className="text-[9px] text-yellow-500">Restart required</span>
        )}
      </div>

      {f.secret ? (
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <input
            type="password"
            autoComplete="off"
            className={`${inputCls} min-w-0 flex-1`}
            disabled={!!clear[f.key]}
            placeholder={f.set ? `Saved (${f.hint}) · enter to replace` : 'Not configured'}
            value={vals[f.key] ?? ''}
            onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })}
          />

          {f.set && (
            <label className="flex shrink-0 cursor-pointer items-center gap-1 text-[10px] text-slate-400">
              <input
                type="checkbox"
                checked={!!clear[f.key]}
                onChange={(e) => setClear({ ...clear, [f.key]: e.target.checked })}
              />
              Remove
            </label>
          )}
        </div>
      ) : (
        <input
          className={`${inputCls} w-full`}
          list={f.model ? 'openai-models' : undefined}
          value={vals[f.key] ?? f.value}
          onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })}
        />
      )}
    </div>
  );

  const renderProvider = (provider) => {
    const keyField = fields.find((f) => f.key === provider.key);
    if (!keyField) return null;

    const providerModels = provider.modelFields
      ? fields.filter((f) => f.group === 'models')
      : [];

    const configured = keyField.set && !clear[keyField.key];

    return (
      <section
        key={provider.id}
        className="rounded-lg border border-line bg-bg/50 p-3"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line bg-panel text-sm text-slate-300">
              {provider.icon}
            </div>
            <div className="min-w-0">
              <h3 className="text-xs font-semibold text-slate-200">
                {provider.title}
              </h3>
              <p className="text-[10px] text-slate-500">
                {provider.description}
              </p>
            </div>
          </div>

          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] ${
            configured
              ? 'border-up/30 bg-up/10 text-up'
              : 'border-line bg-panel text-slate-500'
          }`}>
            {configured ? 'Configured' : 'Not configured'}
          </span>
        </div>

        <div className="space-y-3">
          <div>
            {renderField(keyField)}
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                className={`${btnGhost} !px-2 !py-1 text-[10px]`}
                disabled={!keyField.set || !!busy}
                onClick={() => test(provider.test)}
              >
                {busy === provider.test ? 'Testing…' : 'Test saved key'}
              </button>
            </div>
          </div>

          {providerModels.length > 0 && (
            <div className="border-t border-line pt-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Model selection
                </span>
                <span className="text-[9px] text-slate-600">
                  {providerModels.length} settings
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {providerModels.map(renderField)}
              </div>
            </div>
          )}
        </div>
      </section>
    );
  };

  return (
    <Card
      title="Integrations & configuration"
      right={(
        <div className="flex items-center gap-2">
          {dirty && (
            <span className="text-[10px] text-yellow-400">
              Unsaved changes
            </span>
          )}
          <button
            className={`${btnPrimary} !px-3 !py-1.5 text-xs`}
            disabled={!dirty || !!busy}
            onClick={save}
          >
            {busy === 'save' ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      )}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-[10px] leading-relaxed text-slate-500">
          Credentials are stored in your local <code>.env</code> file and never
          returned to the browser in full. Leave a key unchanged to keep it.
          Tests use the currently saved key, not unsaved input.
        </p>
      </div>

      {msg && (
        <div className="mb-3">
          <Notice tone={msg.tone}>{msg.text}</Notice>
        </div>
      )}

      <datalist id="openai-models">
        {models.map((m) => <option key={m} value={m} />)}
      </datalist>

      <div className="grid gap-3 xl:grid-cols-2">
        {PROVIDERS.map(renderProvider)}
      </div>

      {fields.some((f) => f.group === 'models') && (
        <p className="mt-2 text-[10px] text-slate-500">
          Test your OpenAI key to refresh available model suggestions. Empty
          model values use the application defaults.
        </p>
      )}

      {GROUPS.filter((g) => g[0] === 'server').map(([group, title]) => {
        const serverFields = fields.filter((f) => f.group === group);
        if (!serverFields.length) return null;

        return (
          <section key={group} className="mt-3 rounded-lg border border-line bg-bg/50 p-3">
            <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              {title}
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {serverFields.map(renderField)}
            </div>
          </section>
        );
      })}
    </Card>
  );
}
