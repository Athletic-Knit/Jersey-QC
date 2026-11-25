// ── Exports: Excel roster sheet and CSV scan log ──────────────────────────────
// Also the order's other sheets (Summary, Boxes, Attention), the supervisor's
// day sheet and the "Compare days" workbook. The sheets are built as plain
// arrays of rows (tested); only the export* functions touch the browser and
// SheetJS. This file never imports config.js: the caller passes `categoryOf`
// (a flag reason's defect category).

// Excel opens a UTF-8 CSV with accents intact only when it starts with a BOM.
const BOM = String.fromCharCode(0xfeff);
import { buildAttentionSheet } from "./attention.js";

// Quote a CSV cell and neutralise leading formula characters (= + - @).
export function csvCell(v) {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = " " + s;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Order numbers go into filenames; Windows refuses / \ : * ? " < > |.
export function safeFilename(s) {
  return String(s ?? "").replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "order";
}

// Dates in the PC's own time zone ("2026-11-23", "2026-11-23 14:05:09"), not UTC:
// a file made at 7 pm must carry today's date.
const p2 = n => String(n).padStart(2, "0");
export function localDateStamp(d = new Date()) { return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; }
export function localTimeStamp(d = new Date()) { return `${localDateStamp(d)} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`; }

// A roster row's status as the sheet shows it ("manual" is a by-hand entry kept from older orders).
export const STATUS_LABEL = { pass: "PASS", flag: "FLAGGED", manual: "MANUAL", missing: "MISSING", short: "SHORT-SHIPPED" };
export function rosterStatusLabel(r) { return STATUS_LABEL[r.scanned] || "NOT SCANNED"; }

// Latest log entry per roster row, for reason / resolution / operator columns.
function latestByRow(log) {
  const m = new Map();
  [...log].reverse().forEach(l => { if (l.match?._id !== undefined) m.set(l.match._id, l); });
  return m;
}

// The "QC Results" sheet: the order's header lines, then every roster row with
// its status, its columns, its box and its newest log entry.
export function buildRosterSheet(roster, log, meta, columns, binOf = () => null) {
  const latest = latestByRow(log);
  const cap = c => c.charAt(0).toUpperCase() + c.slice(1);
  return [
    ["Order Number", meta.orderNumber || "—"],
    ["Operator",     meta.operatorName || "—"],
    ["Export Date",  localTimeStamp()],
    ["Garment Type",  meta.jerseyType || ""],
    ["Order Notes",  meta.notes || ""],
    [],
    ["Status", ...columns.map(cap), "Box", "Reason", "Resolution", "Inspected By", "Time"],
    ...roster.map(r => {
      const l = latest.get(r._id);
      return [rosterStatusLabel(r), ...columns.map(c => r[c] ?? ""), binOf(r) ?? "", l?.reason ?? "", l?.resolution ?? "", l?.operator ?? "", l?.timestamp ?? ""];
    }),
  ];
}

// One line per bin of the order, for packing: what it holds, how many
// garments, the box it goes in, and when it was closed. `bins`:
// [{ bin, label, count, box, open, closedAt }].
export function buildBinsSheet(bins = [], stamp = t => localTimeStamp(new Date(t))) {
  return [
    ["Box", "Holds", "Garments", "Box size", "State", "Closed at"],
    ...bins.map(b => [b.bin, b.label || "", b.count || 0, b.box || "", b.open ? "Open" : "Closed (full)", b.closedAt ? stamp(b.closedAt) : ""]),
    [],
    ["Total", "", bins.reduce((t, b) => t + (b.count || 0), 0)],
  ];
}

// The order's workbook, downloaded: QC Results, Summary, Boxes (when the order
// has boxes) and Attention.
export function exportRosterXLSX(roster, log, meta, columns, binOf, XLSX = globalThis.XLSX) {
  if (!XLSX) { alert("Excel library not loaded yet, please try again."); return; }
  const ws = XLSX.utils.aoa_to_sheet(buildRosterSheet(roster, log, meta, columns, binOf));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "QC Results");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(buildOrderSummarySheet(roster, log, meta, meta.categoryOf)), "Summary");
  if (meta.bins?.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(buildBinsSheet(meta.bins)), "Boxes");
  // Where the screen was while the order was open: idle and away spells.
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(buildAttentionSheet(meta.idleSpells || [], meta.awaySpells || [], t => localTimeStamp(new Date(t)))), "Attention");
  XLSX.writeFile(wb, `roster_${safeFilename(meta.orderNumber)}_${localDateStamp()}.xlsx`);
}

// The scan log as CSV text, one line per log entry, newest first as the log holds it.
export function buildLogCSV(log, binOf = () => null) {
  const header = ["Time", "Status", "Detected Name", "Detected Number", "Matched Name", "Matched Number", "Team", "Size", "Box", "Reason", "Resolution", "Operator"];
  const rows = log.map(l => [
    l.timestamp ?? "", l.status ?? "",
    l.detected?.name ?? "", l.detected?.number ?? "",
    l.match?.name ?? "", l.match?.number ?? "", l.match?.team ?? "", l.match?.size ?? "",
    l.match ? (binOf(l.match) ?? "") : "",
    l.reason ?? "", l.resolution ?? "", l.operator ?? "",
  ]);
  return [header, ...rows].map(r => r.map(csvCell).join(",")).join("\r\n");
}

// The scan log downloaded as a CSV file (with a BOM, so Excel keeps the accents).
export function exportLogCSV(log, orderNumber, binOf) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([BOM + buildLogCSV(log, binOf)], { type: "text/csv;charset=utf-8" }));
  a.download = `log_${safeFilename(orderNumber)}_${localDateStamp()}.csv`;
  a.click();
}

// ── Day sheet: one workbook for the whole day, every station ─────────────────
// Built from the hub's ledger (every scan event + every order seen today).
// The question it answers: is the app helping — how many garments, how fast,
// how many needed a retry, a hand entry or the supervisor, and when.
const tsMs = t => { const d = new Date(String(t).replace(" ", "T")); return isNaN(d) ? null : d.getTime(); };
const minutes = ms => Math.round(ms / 60000);
const median = arr => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const uniq = arr => [...new Set(arr.filter(Boolean))];

// Active time: gaps between consecutive events longer than `idleMin` minutes do not count (breaks, lunch).
function activeMs(times, idleMin = 10) {
  const t = times.filter(x => x !== null).sort((a, b) => a - b);
  let total = 0;
  for (let i = 1; i < t.length; i++) { const gap = t[i] - t[i - 1]; if (gap <= idleMin * 60000) total += gap; }
  return total;
}

// Did this "undo" event take back a PASS? The station uses status "undo" for
// more than an un-checked pass: a flag taken back on the size screen ("Taken
// back — wrong size picked (A-M)") and an un-check of a row that was entered
// by hand, flagged or marked missing ("Un-checked — was entered by hand; …").
// The event carries no field with the status it had before, only its reason,
// so the reason decides: those two kinds do not lower Passed, and every other
// undo (an un-checked pass, "Un-checked — was passed", or an older wording)
// does, as before. Code review of 23 Nov 2026.
export const undidPass = e => e.status === "undo"
  && !/^Taken back\b/i.test(String(e.reason || ""))
  && !/^Un-checked — was (?!passed\b)/i.test(String(e.reason || ""));

export function summarise(events) {
  const times = events.map(e => tsMs(e.t));
  const passTimes = events.filter(e => e.status === "pass").map(e => tsMs(e.t)).filter(x => x !== null).sort((a, b) => a - b);
  const gaps = passTimes.slice(1).map((t, i) => (t - passTimes[i]) / 1000).filter(g => g > 0 && g <= 600);
  const passed = events.filter(e => e.status === "pass").length - events.filter(undidPass).length;
  const active = activeMs(times);
  return {
    passed: Math.max(0, passed),
    byHand: events.filter(e => e.status === "manual").length,
    flagged: events.filter(e => e.status === "flagged" && !e.offRoster).length,
    offRoster: events.filter(e => e.status === "flagged" && e.offRoster).length,
    undone: events.filter(e => e.status === "undo").length,
    first: times.filter(x => x !== null).length ? new Date(Math.min(...times.filter(x => x !== null))) : null,
    last: times.filter(x => x !== null).length ? new Date(Math.max(...times.filter(x => x !== null))) : null,
    activeMin: minutes(active),
    perHour: active >= 2 * 60000 ? Math.round(Math.max(0, passed) / (active / 3600000)) : null,   // blank until two active minutes: seconds of scanning give silly rates
    medianSec: median(gaps) === null ? null : Math.round(median(gaps)),
    // Of the garments inspected (passed, entered by hand, or sent to the
    // supervisor), the share that went to the supervisor and the share that
    // passed on the camera's read. One decimal; blank with nothing inspected.
    ...rates(Math.max(0, passed), events.filter(e => e.status === "manual").length, events.filter(e => e.status === "flagged").length),
  };
}
const pct = (n, d) => (d > 0 ? Math.round(n / d * 1000) / 10 : "");
function rates(passed, byHand, flagged) {
  const inspected = passed + byHand + flagged;
  return { inspected, flagRate: pct(flagged, inspected), passRate: pct(passed, inspected) };
}

// ── Defects by category ─────────────────────────────────────────────────────
// Every flag counted under its category (decoration, artwork, sewing, label,
// fabric, cleaning, order, other) and under its reason. `categoryOf(reason)`
// comes from the caller (reasonCategory in config.js; this file is also read
// by tests and tools that have no floor configuration).
export function buildDefectsSheet(events, categoryOf = () => "Other") {
  const flags = (events || []).filter(e => e.status === "flagged");
  const reasonOf = e => (e.offRoster ? "Not on the roster" : String(e.reason || "—").replace(/ — found after it passed$/, ""));
  const cats = {}, reasons = {};
  flags.forEach(e => {
    const r = reasonOf(e), c = e.offRoster ? "Order" : categoryOf(r) || "Other";
    cats[c] = (cats[c] || 0) + 1;
    (reasons[c] ||= {})[r] = (reasons[c][r] || 0) + 1;
  });
  const order = Object.entries(cats).sort((a, b) => b[1] - a[1]);
  return [
    ["Category", "Garments", "Share of flags %"],
    ...order.map(([c, n]) => [c, n, pct(n, flags.length)]),
    ["All flags", flags.length, flags.length ? 100 : ""],
    [],
    ["Category", "Reason", "Garments"],
    ...order.flatMap(([c]) => Object.entries(reasons[c]).sort((a, b) => b[1] - a[1]).map(([r, n]) => [c, r, n])),
  ];
}

// ── One order, summed up ────────────────────────────────────────────────────
// The first sheet a supervisor wants at the end of an order: how many passed,
// what went to the supervisor and why, what is missing, and how long it took.
// `log` is the station's log (or the hub's events turned into that shape).
const logEvents = log => (log || []).map(l => ({ t: l.timestamp ?? l.t, status: l.status, reason: l.reason, offRoster: !!(l.match?.offRoster || l.offRoster), operator: l.operator }));
// summarise() of a station's log: the station's summary screen shows the same
// rates and pace as this sheet (25 Nov 2026).
export const summariseLog = log => summarise(logEvents(log));
export function buildOrderSummarySheet(roster, log, meta = {}, categoryOf = () => "Other") {
  const count = st => roster.filter(r => r.scanned === st).length;
  const events = logEvents(log);
  const sum = summarise(events);
  const total = roster.length, pass = count("pass"), manual = count("manual"), flag = count("flag"), missing = count("missing") + count("short");
  const offRoster = events.filter(e => e.status === "flagged" && e.offRoster).length;
  const todo = roster.filter(r => !r.scanned).length;
  const r = rates(pass, manual, flag + offRoster);
  const who = row => `#${row.number ?? ""}${row.name ? " " + row.name : ""}`.trim();
  const notIn = roster.filter(x => x.scanned !== "pass" && x.scanned !== "manual");
  return [
    ["Order", meta.orderNumber || "—"],
    ["Garment type", meta.jerseyType || ""],
    ["Made", localTimeStamp()],
    [],
    ["Garments on the order", total],
    ["Passed", pass],
    ["Entered by hand", manual],
    ["Sent to the supervisor", flag + offRoster, offRoster ? `${offRoster} of them not on the roster` : ""],
    ["Marked missing", missing],
    ["Not scanned", todo],
    [],
    ["Pass rate %", r.passRate, "of the garments inspected"],
    ["Flag rate %", r.flagRate, "of the garments inspected"],
    ["Active minutes", sum.activeMin, "gaps over 10 minutes left out"],
    ["Garments per active hour", sum.perHour ?? ""],
    ["Median seconds per garment", sum.medianSec ?? ""],
    ["Operators", uniq(events.map(e => e.operator)).join(", ") || meta.operatorName || ""],
    [],
    ["Defects by category"],
    ...buildDefectsSheet(events, categoryOf),
    [],
    [`Not in a box: ${notIn.length}`, "", "", "the garments below were not passed, so they are in no box"],
    ["Status", "Garment", "Team", "Size"],
    ...notIn.map(x => [rosterStatusLabel(x), who(x), x.team ?? "", x.size ?? ""]),
    ...(notIn.length ? [] : [["", "every garment on the order is in a box"]]),
  ];
}


const hhmm = d => d ? `${p2(d.getHours())}:${p2(d.getMinutes())}` : "";

// The day sheet's tabs from one day of the hub's ledger: Summary (a row per
// station), Orders (a row per run of an order), Operators, Defects, Flags and
// every scan.
export function buildDaySheets(ledger, stationLabel = id => id, { categoryOf = () => "Other" } = {}) {
  const events = ledger.events || [], orders = ledger.orders || [];
  const byStation = {};
  events.forEach(e => (byStation[e.station] ||= []).push(e));
  const all = summarise(events);
  const summary = [
    ["Jersey QC — day sheet", ledger.date || localDateStamp()],
    ["Made", localTimeStamp()],
    ["Stations", Object.keys(byStation).length, "Orders", orders.length, "Garments passed", all.passed, "By hand", all.byHand, "To supervisor", all.flagged + all.offRoster],
    [],
    ["Station", "Operators", "Orders", "Passed", "By hand", "To supervisor", "Not on roster", "Un-checked", "First scan", "Last scan", "Active minutes", "Garments per active hour", "Median seconds per garment", "Flag rate %", "Pass rate %"],
    ...Object.entries(byStation).sort(([a], [b]) => stationLabel(a).localeCompare(stationLabel(b), undefined, { numeric: true })).map(([id, evs]) => {
      const s = summarise(evs);
      return [stationLabel(id), uniq(evs.map(e => e.operator)).join(", "), uniq(evs.map(e => e.order)).join(", "), s.passed, s.byHand, s.flagged, s.offRoster, s.undone, hhmm(s.first), hhmm(s.last), s.activeMin, s.perHour ?? "", s.medianSec ?? "", s.flagRate, s.passRate];
    }),
    [],
    ["All stations", uniq(events.map(e => e.operator)).join(", "), uniq(events.map(e => e.order)).join(", "), all.passed, all.byHand, all.flagged, all.offRoster, all.undone, hhmm(all.first), hhmm(all.last), all.activeMin, all.perHour ?? "", all.medianSec ?? "", all.flagRate, all.passRate],
    [],
    ["How to read it", "Active minutes leave out gaps longer than 10 minutes (breaks). Garments per active hour = passed / active hours. Median seconds per garment = typical time between two confirmed garments. Compare with how long the same order took by hand."],
  ];
  const orderRows = orders.map(o => {
    // This station's scans of this run of the order: the same number started twice is two runs,
    // each with its own row (an event from before runs existed has none and matches any run).
    const evs = events.filter(e => e.station === o.station && String(e.order) === String(o.order) && (!e.run || !o.run || e.run === o.run));
    const s = summarise(evs); const c = o.counts || {};
    const awayMin = o.away ? Math.round((o.away.seconds || 0) / 60 * 10) / 10 : "";
    return [stationLabel(o.station), o.order, o.jerseyType || "", o.operator || "", c.total ?? "", s.passed, s.byHand, s.flagged + s.offRoster, c.remaining ?? "", hhmm(s.first), hhmm(s.last), s.activeMin, s.perHour ?? "", o.idle ? o.idle.count : "", o.away ? `${o.away.count}${o.away.count ? " · " + awayMin + " min" : ""}` : "", o.rosterFile || "", s.flagRate, s.passRate, s.medianSec ?? ""];
  });
  const ordersSheet = [["Station", "Order", "Garment type", "Operator", "Garments in order", "Passed", "By hand", "To supervisor", "Still remaining", "First scan", "Last scan", "Active minutes", "Garments per active hour", "Idle spells", "Screen left (times · minutes)", "Roster file", "Flag rate %", "Pass rate %", "Median seconds per garment"], ...orderRows];
  const operators = operatorRows(events, stationLabel);
  const reasons = {};
  events.filter(e => e.status === "flagged").forEach(e => { const k = e.offRoster ? "Not on the roster" : (e.reason || "—"); reasons[k] = (reasons[k] || 0) + 1; });
  const flagsSheet = [["Reason", "Garments"], ...Object.entries(reasons).sort((a, b) => b[1] - a[1]), [], ["Time", "Station", "Operator", "Order", "Garment", "Reason", "Resolution"],
    ...events.filter(e => e.status === "flagged" || e.status === "manual" || e.status === "missing" || e.status === "short").map(e => [e.t, stationLabel(e.station), e.operator, e.order, `#${e.number}${e.name ? " " + e.name : ""}`, e.reason, e.resolution])];
  const eventsSheet = [["Time", "Station", "Operator", "Order", "Status", "Number", "Name", "Size", "Team", "Camera read", "Reason", "Resolution"],
    ...events.map(e => [e.t, stationLabel(e.station), e.operator, e.order, e.status, e.number, e.name, e.size, e.team, e.read || "", e.reason, e.resolution])];
  return { summary, orders: ordersSheet, flags: flagsSheet, events: eventsSheet, operators, defects: buildDefectsSheet(events, categoryOf) };
}

// One row per operator: what they inspected, how fast, and how much of it
// went to the supervisor. An event with no operator on it counts under "—".
function operatorRows(events, stationLabel = id => id) {
  const by = {};
  events.forEach(e => (by[e.operator || "—"] ||= []).push(e));
  return [
    ["Operator", "Stations", "Orders", "Passed", "By hand", "To supervisor", "Not on roster", "Flag rate %", "Pass rate %", "First scan", "Last scan", "Active minutes", "Garments per active hour", "Median seconds per garment"],
    ...Object.entries(by).sort(([a], [b]) => a.localeCompare(b)).map(([name, evs]) => {
      const s = summarise(evs);
      return [name, uniq(evs.map(e => stationLabel(e.station))).join(", "), uniq(evs.map(e => e.order)).join(", "), s.passed, s.byHand, s.flagged, s.offRoster, s.flagRate, s.passRate, hhmm(s.first), hhmm(s.last), s.activeMin, s.perHour ?? "", s.medianSec ?? ""];
    }),
  ];
}

// ── Comparing days ──────────────────────────────────────────────────────────
// `days`: [{ date, events, orders }] from the hub (GET /ledger?from=&to=),
// oldest first. One workbook: a row per day, per operator, per operator and
// day, per station and day, per part of the day, and the defect categories
// day by day. "Part of the day" stands in for shifts until the floor's shift
// times are known: before noon, noon to 6 pm, after 6 pm.
const PARTS = ["Before noon", "Noon to 6 pm", "After 6 pm"];
const partOf = t => { const ms = tsMs(t); if (ms === null) return null; const h = new Date(ms).getHours(); return h < 12 ? PARTS[0] : h < 18 ? PARTS[1] : PARTS[2]; };
const PACE_HEAD = ["Passed", "By hand", "To supervisor", "Flag rate %", "Pass rate %", "Active minutes", "Garments per active hour", "Median seconds per garment"];
const paceCells = s => [s.passed, s.byHand, s.flagged + s.offRoster, s.flagRate, s.passRate, s.activeMin, s.perHour ?? "", s.medianSec ?? ""];
// The Compare days sheets described above, from the days the hub sent.
export function buildCompareSheets(days, stationLabel = id => id, { categoryOf = () => "Other" } = {}) {
  const list = (days || []).filter(d => d && d.date).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const all = list.flatMap(d => d.events || []);
  const group = (events, keyOf) => { const m = {}; events.forEach(e => { const k = keyOf(e); if (k !== null && k !== undefined) (m[k] ||= []).push(e); }); return m; };
  const byDay = [["Date", "Stations", "Orders", "Operators", ...PACE_HEAD],
    ...list.map(d => { const ev = d.events || []; return [d.date, uniq(ev.map(e => e.station)).length, (d.orders || []).length, uniq(ev.map(e => e.operator)).join(", "), ...paceCells(summarise(ev))]; }),
    [], ["All days", "", list.reduce((t, d) => t + (d.orders || []).length, 0), uniq(all.map(e => e.operator)).join(", "), ...paceCells(summarise(all))]];
  const ops = group(all, e => e.operator || "—");
  const byOperator = [["Operator", "Days worked", ...PACE_HEAD],
    ...Object.entries(ops).sort(([a], [b]) => a.localeCompare(b)).map(([name, ev]) => [name, list.filter(d => (d.events || []).some(e => (e.operator || "—") === name)).length, ...paceCells(summarise(ev))])];
  const operatorByDay = [["Date", "Operator", ...PACE_HEAD],
    ...list.flatMap(d => Object.entries(group(d.events || [], e => e.operator || "—")).sort(([a], [b]) => a.localeCompare(b)).map(([name, ev]) => [d.date, name, ...paceCells(summarise(ev))]))];
  const stationByDay = [["Date", "Station", "Operators", ...PACE_HEAD],
    ...list.flatMap(d => Object.entries(group(d.events || [], e => e.station)).sort(([a], [b]) => stationLabel(a).localeCompare(stationLabel(b), undefined, { numeric: true })).map(([id, ev]) => [d.date, stationLabel(id), uniq(ev.map(e => e.operator)).join(", "), ...paceCells(summarise(ev))]))];
  const partsSheet = [["Date", "Part of the day", ...PACE_HEAD],
    ...list.flatMap(d => { const g = group(d.events || [], e => partOf(e.t)); return PARTS.filter(p => g[p]).map(p => [d.date, p, ...paceCells(summarise(g[p]))]); }),
    [], ...PARTS.map(p => { const ev = all.filter(e => partOf(e.t) === p); return ["All days", p, ...paceCells(summarise(ev))]; })];
  const flagCat = e => (e.offRoster ? "Order" : categoryOf(String(e.reason || "").replace(/ — found after it passed$/, "")) || "Other");
  const cats = uniq(all.filter(e => e.status === "flagged").map(flagCat));
  const defects = [["Date", ...cats, "All flags", "Flag rate %"],
    ...list.map(d => { const f = (d.events || []).filter(e => e.status === "flagged"); return [d.date, ...cats.map(c => f.filter(e => flagCat(e) === c).length), f.length, summarise(d.events || []).flagRate]; }),
    [], ["All days", ...cats.map(c => all.filter(e => e.status === "flagged" && flagCat(e) === c).length), all.filter(e => e.status === "flagged").length, summarise(all).flagRate]];
  return { byDay, byOperator, operatorByDay, stationByDay, parts: partsSheet, defects };
}

// The Compare days workbook, downloaded, named by its first and last date.
export function exportCompareXLSX(days, stationLabel, XLSX = globalThis.XLSX, opts = {}) {
  if (!XLSX) { alert("Excel library not loaded yet, please try again."); return; }
  const s = buildCompareSheets(days, stationLabel, opts);
  const wb = XLSX.utils.book_new();
  [["By day", s.byDay], ["By operator", s.byOperator], ["Operator by day", s.operatorByDay], ["Station by day", s.stationByDay], ["Part of the day", s.parts], ["Defects by day", s.defects]]
    .forEach(([name, rows]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name));
  const dates = (days || []).map(d => d.date).filter(Boolean).sort();
  XLSX.writeFile(wb, `compare_${dates[0] || "days"}_to_${dates[dates.length - 1] || ""}.xlsx`);
}

// The day sheet, downloaded as one workbook.
export function exportDaySheetXLSX(ledger, stationLabel, XLSX = globalThis.XLSX, opts = {}) {
  if (!XLSX) { alert("Excel library not loaded yet, please try again."); return; }
  const sheets = buildDaySheets(ledger, stationLabel, opts);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheets.summary), "Summary");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheets.orders), "Orders");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheets.operators), "Operators");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheets.defects), "Defects");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheets.flags), "Flags");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheets.events), "Every scan");
  XLSX.writeFile(wb, `day_sheet_${ledger.date || localDateStamp()}.xlsx`);
}
