import { config } from '../config.js';
import { extractJson } from './aiNormalize.js';

export class OpenAIError extends Error {
  constructor(message, { status = 0, retryable = false } = {}) {
    super(message);
    this.name = 'OpenAIError';
    this.status = status;
    this.retryable = retryable;
  }
}

async function post(path, body, timeoutMs) {
  if (!config.openaiKey) throw new OpenAIError('OPENAI_API_KEY is missing in .env', { status: 400 });
  let res;
  try {
    res = await fetch(`https://api.openai.com/v1/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.openaiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    throw new OpenAIError(e.name === 'TimeoutError' ? 'OpenAI request timed out' : `Network error: ${e.message}`);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new OpenAIError(`OpenAI ${res.status}: ${data.error?.message || res.statusText}`, { status: res.status });
  return data;
}

function parseResponses(data) {
  let text = '';
  const sources = [];
  let searches = 0;
  for (const item of data.output ?? []) {
    if (item.type === 'web_search_call') searches++;
    if (item.type !== 'message') continue;
    for (const part of item.content ?? []) {
      if (part.type !== 'output_text') continue;
      text += `${part.text}\n`;
      for (const a of part.annotations ?? []) if (a.type === 'url_citation' && a.url) sources.push({ url: a.url, title: a.title });
    }
  }
  return { text: text.trim(), sources, searches, incomplete: data.status === 'incomplete' };
}

/** Research with OpenAI's web search tool. Tries the current tool name first, then the preview name. */
export async function webResearch({ model, instructions, input }) {
  let lastError;
  for (const type of ['web_search', 'web_search_preview']) {
    try {
      return parseResponses(await post('responses', { model, instructions, input, tools: [{ type }] }, 300_000));
    } catch (e) {
      lastError = e;
      if (!(e.status === 400 && /tool|web_search/i.test(e.message))) throw e;
    }
  }
  throw new OpenAIError(`${lastError.message} (model "${model}" may not support web search; set OPENAI_RESEARCH_MODEL to one that does)`, { status: 400 });
}

async function chatJson({ model, system, user }) {
  const data = await post('chat/completions', {
    model,
    response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
  }, 240_000);
  const choice = data.choices?.[0];
  if (choice?.finish_reason === 'length') throw new OpenAIError('The model response was cut off (too long)', { retryable: true });
  return choice?.message?.content ?? '';
}

/** Calls the model, parses JSON and runs `check` on it. Retries once on bad JSON or a failed check. */
export async function chatJsonChecked(args, check, attempts = 2) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try { return check(extractJson(await chatJson(args))); }
    catch (e) {
      lastErr = e;
      if (e instanceof OpenAIError && !e.retryable) throw e; // auth, quota, network: retrying will not help
    }
  }
  throw lastErr;
}