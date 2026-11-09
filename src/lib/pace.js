// ── Pace: jerseys per hour and time left, from working time ─────────────────
// The station's rate used to be passes over the whole time since the first
// scan, so an order left open over lunch or overnight (the tab never closed,
// the PC never shut down) came back with a rate near zero and an ETA in the
// thousands of minutes. Working time instead: the gap between one scan and
// the next counts in full up to CAP_MIN minutes, and any longer gap — a break,
// a shift end, a night — counts as CAP_MIN, the most anyone sits on one
// jersey. The gap from the last scan to now is capped the same way, so a
// station standing idle keeps the pace it had.
export const CAP_MIN = 10;

// "2026-11-09 12:44:56" (localTimeStamp) → ms, or the entry's id (Date.now()
// at the scan) when the stamp is missing or unreadable.
export function entryTime(e) {
  const s = String(e?.timestamp || "");
  const t = s ? new Date(s.replace(" ", "T")).getTime() : NaN;
  if (Number.isFinite(t)) return t;
  return Number.isFinite(e?.id) ? e.id : NaN;
}

// Minutes actually worked across `log` (every entry counts as activity,
// whatever its status) up to `now`. `start` is the first scan's time when
// known; it adds the capped lead-in before the first entry.
export function workingMinutes(log, now = Date.now(), { start = null, capMin = CAP_MIN } = {}) {
  const times = (log || []).map(entryTime).filter(Number.isFinite).sort((a, b) => a - b);
  if (!times.length) return start ? Math.min(now - start, capMin * 60000) / 60000 : 0;
  const cap = capMin * 60000;
  let ms = start && start < times[0] ? Math.min(times[0] - start, cap) : 0;
  for (let i = 1; i < times.length; i++) ms += Math.min(Math.max(0, times[i] - times[i - 1]), cap);
  ms += Math.min(Math.max(0, now - times[times.length - 1]), cap);
  return ms / 60000;
}

// { rate: jerseys per minute or null, etaMin: minutes left or null }.
// No rate until a minute of work and one pass, as before.
export function pace(log, passCount, remaining, now = Date.now(), opts = {}) {
  const min  = workingMinutes(log, now, opts);
  const rate = min > 1 && passCount > 0 ? passCount / min : null;
  return { workingMin: min, rate, etaMin: rate && remaining > 0 ? Math.ceil(remaining / rate) : null };
}
