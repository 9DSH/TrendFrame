const pad = (n) => String(n).padStart(2, '0');
export const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const minutes = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const bad = (m) => Object.assign(new Error(m), { status: 400 });

/** Accepts an array or "8:00, 20:00". Returns sorted, unique "HH:MM" strings (local PC time). */
export function normalizeTimes(input) {
  const raw = Array.isArray(input) ? input : String(input ?? '').split(',');
  const out = [...new Set(raw.map((x) => String(x).trim()).filter(Boolean).map((x) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(x);
    if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw bad(`"${x}" is not a valid time. Use HH:MM, for example 08:00.`);
    return `${pad(Number(m[1]))}:${m[2]}`;
  }))].sort();
  if (!out.length) throw bad('Enter at least one time, for example 08:00.');
  if (out.length > 6) throw bad('At most 6 collection times per day.');
  return out;
}

/**
 * The slot ("YYYY-MM-DD HH:MM") that should run now, or null. Only the latest missed slot of today runs.
 * lastSlot = the slot that last ran. catchUp = also run a slot that was missed by more than 5 minutes.
 */
export function dueSlot(now, times, lastSlot, catchUp) {
  const today = localDate(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const lastTime = lastSlot?.startsWith(today) ? lastSlot.slice(11) : null;
  const pending = [...times].sort().filter((t) => minutes(t) <= nowMin && (!lastTime || t > lastTime));
  if (!pending.length) return null;
  const latest = pending.at(-1);
  if (!catchUp && nowMin - minutes(latest) > 5) return null;
  return `${today} ${latest}`;
}

export function nextRun(now, times) {
  if (!times.length) return null;
  const sorted = [...times].sort();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const at = (t, addDays) => {
    const d = new Date(now);
    d.setDate(d.getDate() + addDays);
    d.setHours(Number(t.slice(0, 2)), Number(t.slice(3, 5)), 0, 0);
    return d;
  };
  const later = sorted.find((t) => minutes(t) > nowMin);
  return later ? at(later, 0) : at(sorted[0], 1);
}