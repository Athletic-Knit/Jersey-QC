// ── Input trial: mouse + pedal against up/down keys + pedal ─────────────────
// The floor cannot agree on how the operator should drive the result screens:
// a mouse and one pedal, or two mechanical keys (up / down) and one pedal.
// Settings → Input trial names the setup in use at this station; from then on
// every decision on a result screen is recorded (which screen, which option,
// by pointer or by key, how many steps, how long from the screen appearing to
// the choice), across orders, in this browser. Settings → "Compare the
// setups" sums it up per setup and says which is faster where, and the CSV
// goes to whoever wants the raw numbers.
//
// The pedal is a key to the browser (it types the Scan / Select key), so a
// "key" record on index 0 is almost always the pedal; a record with moves > 0
// was stepped to with the keys.

export const TRIAL_METHODS = [
  { id: "",      label: "Not recording",            hint: "" },
  { id: "mouse", label: "Mouse + pedal",            hint: "the pedal scans and confirms; everything else is a click" },
  { id: "keys",  label: "Up/down keys + pedal",     hint: "the pedal scans and confirms; the two keys move the highlight" },
];
export const trialMethodLabel = id => TRIAL_METHODS.find(m => m.id === id)?.label || "";

// The kinds the summary groups the overlay's modes into.
export const SCREEN_KINDS = [
  { id: "green",      label: "Green (confirm)",        modes: ["confirm"] },
  { id: "list",       label: "Yellow list (pick)",     modes: ["pick", "close"] },
  { id: "red",        label: "Red (not read)",         modes: ["flag", "duplicate"] },
  { id: "reasons",    label: "Flag reasons menu",      modes: ["reasons"] },
  { id: "supervisor", label: "Go to supervisor",       modes: ["supervisor"] },
  { id: "byhand",     label: "By hand — continue",     modes: ["manualDone"] },
  { id: "camera",     label: "Camera (scan trigger)",  modes: ["camera"] },
];
export const screenKindOf = mode => SCREEN_KINDS.find(k => k.modes.includes(mode))?.id || "other";

// ── Storage: one list of records per browser, across orders ──────────────────
const KEY = "jerseyqc.trial.v1";
const CAP = 20000;
const quiet = fn => { try { return fn(); } catch { return undefined; } };
export function loadTrial() { return quiet(() => { const v = localStorage.getItem(KEY); const a = v ? JSON.parse(v) : []; return Array.isArray(a) ? a : []; }) ?? []; }
export function appendTrial(rec) {
  const all = loadTrial(); all.push(rec);
  quiet(() => localStorage.setItem(KEY, JSON.stringify(all.length > CAP ? all.slice(-CAP) : all)));
  return all.length;
}
export function clearTrial() { quiet(() => localStorage.removeItem(KEY)); }

// ── Summary ──────────────────────────────────────────────────────────────────
export function median(xs) { const a = xs.filter(Number.isFinite).sort((x, y) => x - y); if (!a.length) return null; const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; }
const mean = xs => { const a = xs.filter(Number.isFinite); return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null; };
const r1 = x => x == null ? null : Math.round(x * 10) / 10;

function cell(recs) {
  const ms = recs.map(r => r.ms);
  return {
    n: recs.length,
    medianS: r1(median(ms) / 1000), meanS: r1(mean(ms) / 1000),
    movesPer: r1(mean(recs.map(r => r.moves || 0))),
    pointerShare: recs.length ? Math.round(100 * recs.filter(r => r.via === "pointer").length / recs.length) : null,
    firstOption: recs.length ? Math.round(100 * recs.filter(r => (r.idx || 0) === 0).length / recs.length) : null,
  };
}

// Per setup: every decision, then by screen kind; plus how many orders and
// operators the numbers come from, so a verdict on two orders says so.
export function summariseTrial(records) {
  const out = {};
  for (const m of TRIAL_METHODS.filter(m => m.id)) {
    const mine = records.filter(r => r.method === m.id);
    const nav = mine.filter(r => screenKindOf(r.screen) !== "camera");   // the scan trigger is the pedal either way
    out[m.id] = {
      label: m.label,
      all: cell(nav),
      byKind: Object.fromEntries(SCREEN_KINDS.map(k => [k.id, cell(mine.filter(r => screenKindOf(r.screen) === k.id))])),
      orders: new Set(mine.map(r => `${r.station || ""}|${r.order || ""}|${r.run || ""}`)).size,
      operators: new Set(mine.map(r => r.operator || "")).size,
      passes: mine.filter(r => (r.screen === "confirm" && r.id === "confirm") || ((r.screen === "pick" || r.screen === "close") && /^c/.test(r.id || ""))).length,
      // Time spent navigating per pass: what each setup costs the order.
      secondsPerPass: null,
    };
    const s = out[m.id];
    s.secondsPerPass = s.passes ? r1(nav.reduce((t, r) => t + (r.ms || 0), 0) / 1000 / s.passes) : null;
  }
  return out;
}

export const MIN_PASSES_FOR_VERDICT = 100;

// Plain words from the numbers. Never a verdict on thin data.
export function trialVerdict(sum) {
  const a = sum.mouse, b = sum.keys;
  if (!a || !b) return "Nothing recorded yet.";
  if (!a.passes && !b.passes) return "Nothing recorded yet. Pick a setup under Settings → Input trial and work an order with it.";
  if (!a.passes) return `Only "${b.label}" has data (${b.passes} passes). Work an order with "Mouse + pedal" to compare.`;
  if (!b.passes) return `Only "${a.label}" has data (${a.passes} passes). Work an order with "Up/down keys + pedal" to compare.`;
  const thin = a.passes < MIN_PASSES_FOR_VERDICT || b.passes < MIN_PASSES_FOR_VERDICT;
  const lines = [];
  const d = (a.secondsPerPass ?? 0) - (b.secondsPerPass ?? 0);
  const faster = d < 0 ? a : b, slower = d < 0 ? b : a;
  if (Math.abs(d) < 0.3) lines.push(`Over the whole order the two are the same within a third of a second per jersey (${a.label} ${a.secondsPerPass}s, ${b.label} ${b.secondsPerPass}s of screen time per pass).`);
  else lines.push(`${faster.label} is faster over the whole order: ${faster.secondsPerPass}s of screen time per pass against ${slower.secondsPerPass}s — about ${Math.round(Math.abs(d) * 100)}s per 100 jerseys.`);
  for (const k of SCREEN_KINDS) {
    const x = a.byKind[k.id], y = b.byKind[k.id];
    if (!x.n || !y.n || k.id === "camera") continue;
    if (x.n < 10 || y.n < 10) continue;
    const dd = x.medianS - y.medianS;
    if (Math.abs(dd) < 0.3) continue;
    lines.push(`${k.label}: ${dd < 0 ? a.label : b.label} is quicker (median ${Math.min(x.medianS, y.medianS)}s against ${Math.max(x.medianS, y.medianS)}s, ${x.n} and ${y.n} decisions).`);
  }
  if (thin) lines.push(`Thin data: ${a.passes} passes with the mouse, ${b.passes} with the keys. Work at least ${MIN_PASSES_FOR_VERDICT} jerseys with each, by more than one operator, before deciding.`);
  if (a.operators < 2 || b.operators < 2) lines.push("One operator so far — the setup someone is used to always wins on their own numbers.");
  return lines.join(" ");
}

// ── CSV of the raw records ──────────────────────────────────────────────────
import { csvCell, localTimeStamp } from "./export.js";
export const TRIAL_COLUMNS = ["time", "setup", "station", "operator", "order", "screen", "kind", "options", "chosen index", "chosen", "via", "key", "seconds", "key steps", "pointer moves"];
export function trialRows(records) {
  return records.map(r => [localTimeStamp(new Date(r.t || 0)), trialMethodLabel(r.method), r.station || "", r.operator || "", r.order || "", r.screen || "", screenKindOf(r.screen), r.n ?? "", r.idx ?? "", r.id || "", r.via || "", r.key || "", r.ms == null ? "" : (r.ms / 1000).toFixed(2), r.moves ?? 0, r.hovers ?? 0]);
}
export function trialCSV(records) { return [TRIAL_COLUMNS, ...trialRows(records)].map(row => row.map(csvCell).join(",")).join("\r\n"); }

// ── The model behind the simulation ──────────────────────────────────────────
// Keystroke-Level Model (Card, Moran & Newell 1980/1983; operator values after
// Kieras 2001): what a practised operator needs for each physical act. The
// same model for both setups; only the acts differ.
export const KLM = {
  K: 0.28,     // press a key or a dedicated button (average skilled)
  STEP: 0.30,  // one up/down step: the key press plus the glance that the highlight landed
  F: 0.30,     // press the pedal (a key to the browser; the foot is a touch slower than a finger)
  P: 1.10,     // point the mouse at a target on the screen (Fitts's law average)
  B: 0.20,     // click: button down and up
  H: 0.40,     // home the hand: from the jersey to the mouse or the keys, and back
  M: 1.35,     // decide what to do — the same whatever the hands then do
  MOUSE_MISS: 0.02,   // a click that lands beside the option: point and click again
  KEY_OVERSHOOT: 0.03 // one step too far on a multi-step run: a step back and a look
};

// A decision screen for the model: `n` options, the operator wants `idx`;
// `skipped` options before idx the keys jump over (disabled rows, the
// mouse-only Retry on a green) — the mouse does not care, the keys never land
// on them. `primary` says index 0 is the pedal's option (it always is).
// Returns seconds for each setup, decision time (M) included.
export function modelDecision({ idx = 0, skipped = 0 } = {}) {
  const i = Math.max(0, idx | 0);
  if (i === 0) { const t = KLM.M + KLM.F; return { mouse: t, keys: t }; }
  const steps = i - Math.min(skipped, i);
  const mouse = KLM.M + KLM.H + KLM.P + KLM.B + KLM.MOUSE_MISS * (KLM.P + KLM.B) + KLM.H;
  const keys  = KLM.M + KLM.H + steps * KLM.STEP + KLM.F + (steps > 1 ? KLM.KEY_OVERSHOOT * 2 * KLM.STEP : 0) + KLM.H;
  return { mouse: r3(mouse), keys: r3(keys) };
}
const r3 = x => Math.round(x * 1000) / 1000;

// Sum a list of modelled screens: [{ kind, idx, skipped }] → per-setup totals
// and the split by kind, so the simulation can say where the seconds go.
export function modelScreens(screens) {
  const tot = { mouse: 0, keys: 0, byKind: {} };
  for (const s of screens) {
    const d = modelDecision(s);
    tot.mouse += d.mouse; tot.keys += d.keys;
    const k = tot.byKind[s.kind] || (tot.byKind[s.kind] = { n: 0, mouse: 0, keys: 0 });
    k.n++; k.mouse += d.mouse; k.keys += d.keys;
  }
  tot.mouse = r3(tot.mouse); tot.keys = r3(tot.keys);
  for (const k of Object.values(tot.byKind)) { k.mouse = r3(k.mouse); k.keys = r3(k.keys); }
  return tot;
}
