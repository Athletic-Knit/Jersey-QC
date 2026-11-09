// ── Where the operator's screen was ──────────────────────────────────────────
// A browser page knows two things about its own window and nothing more: it
// can tell when it is hidden (minimised, another tab in front, the screen
// locked) and when another window has the keyboard (the page is visible but
// not focused). It cannot see what the other window is. So an "away" spell
// says the Jersey QC screen was left, from when to when, and whether it was
// hidden or only unfocused. Spells shorter than `minSeconds` are dropped: a
// file dialog or a print dialog blurs the window for a moment.
//
// Idle spells (src/App.jsx IdleWatch) are the other half: the screen was up,
// nobody touched it. Both go on the order's Excel export and to the hub.

export const AWAY_MIN_SECONDS = 5;

export function createAwayWatch({ onSpell, minSeconds = AWAY_MIN_SECONDS, doc = globalThis.document, win = globalThis.window, now = () => Date.now() } = {}) {
  let away = null;   // { start, how } while the screen is left
  const leave = how => { if (!away) away = { start: now(), how }; };
  const back = () => {
    if (!away) return;
    const end = now(), seconds = Math.round((end - away.start) / 1000);
    const spell = { start: away.start, end, seconds, how: away.how };
    away = null;
    if (seconds >= minSeconds) onSpell?.(spell);
  };
  const onVis = () => { if (doc.hidden) leave("hidden"); else if (away?.how === "hidden") back(); };
  const onBlur = () => { if (!doc.hidden) leave("unfocused"); };
  const onFocus = () => { if (!doc.hidden) back(); };
  doc.addEventListener("visibilitychange", onVis);
  win.addEventListener("blur", onBlur);
  win.addEventListener("focus", onFocus);
  return {
    stop() { doc.removeEventListener("visibilitychange", onVis); win.removeEventListener("blur", onBlur); win.removeEventListener("focus", onFocus); back(); },
    isAway: () => !!away,
  };
}

export const awayLabel = how => how === "hidden" ? "Screen hidden (minimised, another tab, or locked)" : "Another window in front";

// For the hub snapshot and the day sheet: how often and how long.
export function awaySummary(spells = []) {
  const s = Array.isArray(spells) ? spells : [];
  return { count: s.length, seconds: s.reduce((t, x) => t + (x.seconds || 0), 0) };
}
export const fmtMin = seconds => { const m = Math.round((seconds || 0) / 60); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`; };

// The "Attention" sheet of an order's export: every idle spell and every away
// spell, in time order. No names: the sheet says the station's screen was left,
// not who left it.
export function buildAttentionSheet(idleSpells = [], awaySpells = [], fmtTime = t => new Date(t).toLocaleString()) {
  const rows = [
    ...idleSpells.map(s => ({ t: s.start, row: ["Idle — screen up, nobody touched it", fmtTime(s.start), fmtTime(s.end), s.minutes ?? Math.round((s.end - s.start) / 60000)] })),
    ...awaySpells.map(s => ({ t: s.start, row: [awayLabel(s.how), fmtTime(s.start), fmtTime(s.end), Math.round((s.seconds || 0) / 60 * 10) / 10] })),
  ].sort((a, b) => a.t - b.t).map(x => x.row);
  const away = awaySummary(awaySpells);
  return [
    ["Attention", "Where the screen was while this order was open"],
    ["Idle spells (3 min or more untouched)", idleSpells.length],
    ["Times the screen was left", away.count, "Minutes away", Math.round(away.seconds / 60 * 10) / 10],
    [],
    ["What", "From", "To", "Minutes"],
    ...rows,
    ...(rows.length ? [] : [["—", "nothing recorded"]]),
  ];
}
