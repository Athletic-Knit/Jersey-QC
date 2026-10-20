// ── Exports: Excel roster sheet and CSV scan log ──────────────────────────────

// Excel opens a UTF-8 CSV with accents intact only when it starts with a BOM.
const BOM = String.fromCharCode(0xfeff);

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

const p2 = n => String(n).padStart(2, "0");
export function localDateStamp(d = new Date()) { return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; }
export function localTimeStamp(d = new Date()) { return `${localDateStamp(d)} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`; }

export const STATUS_LABEL = { pass: "PASS", flag: "FLAGGED", manual: "MANUAL", missing: "MISSING", short: "SHORT-SHIPPED" };
export function rosterStatusLabel(r) { return STATUS_LABEL[r.scanned] || "NOT SCANNED"; }

// Latest log entry per roster row, for reason / resolution / operator columns.
function latestByRow(log) {
  const m = new Map();
  [...log].reverse().forEach(l => { if (l.match?._id !== undefined) m.set(l.match._id, l); });
  return m;
}

export function buildRosterSheet(roster, log, meta, columns, binOf = () => null) {
  const latest = latestByRow(log);
  const cap = c => c.charAt(0).toUpperCase() + c.slice(1);
  return [
    ["Order Number", meta.orderNumber || "—"],
    ["Operator",     meta.operatorName || "—"],
    ["Export Date",  localTimeStamp()],
    ["Jersey Type",  meta.jerseyType || ""],
    ["Order Notes",  meta.notes || ""],
    [],
    ["Status", ...columns.map(cap), "Bin", "Reason", "Resolution", "Inspected By", "Time"],
    ...roster.map(r => {
      const l = latest.get(r._id);
      return [rosterStatusLabel(r), ...columns.map(c => r[c] ?? ""), binOf(r.team) ?? "", l?.reason ?? "", l?.resolution ?? "", l?.operator ?? "", l?.timestamp ?? ""];
    }),
  ];
}

export function exportRosterXLSX(roster, log, meta, columns, binOf, XLSX = globalThis.XLSX) {
  if (!XLSX) { alert("Excel library not loaded yet, please try again."); return; }
  const ws = XLSX.utils.aoa_to_sheet(buildRosterSheet(roster, log, meta, columns, binOf));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "QC Results");
  XLSX.writeFile(wb, `roster_${safeFilename(meta.orderNumber)}_${localDateStamp()}.xlsx`);
}

export function buildLogCSV(log, binOf = () => null) {
  const header = ["Time", "Status", "Detected Name", "Detected Number", "Matched Name", "Matched Number", "Team", "Size", "Bin", "Reason", "Resolution", "Operator"];
  const rows = log.map(l => [
    l.timestamp ?? "", l.status ?? "",
    l.detected?.name ?? "", l.detected?.number ?? "",
    l.match?.name ?? "", l.match?.number ?? "", l.match?.team ?? "", l.match?.size ?? "",
    l.match ? (binOf(l.match.team) ?? "") : "",
    l.reason ?? "", l.resolution ?? "", l.operator ?? "",
  ]);
  return [header, ...rows].map(r => r.map(csvCell).join(",")).join("\r\n");
}

export function exportLogCSV(log, orderNumber, binOf) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([BOM + buildLogCSV(log, binOf)], { type: "text/csv;charset=utf-8" }));
  a.download = `log_${safeFilename(orderNumber)}_${localDateStamp()}.csv`;
  a.click();
}

// ── Day sheet: one workbook for the whole day, every station ─────────────────
// Built from the hub's ledger (every scan event + every order seen today).
// The question it answers: is the app helping — how many jerseys, how fast,
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

function summarise(events) {
  const times = events.map(e => tsMs(e.t));
  const passTimes = events.filter(e => e.status === "pass").map(e => tsMs(e.t)).filter(x => x !== null).sort((a, b) => a - b);
  const gaps = passTimes.slice(1).map((t, i) => (t - passTimes[i]) / 1000).filter(g => g > 0 && g <= 600);
  const passed = events.filter(e => e.status === "pass").length - events.filter(e => e.status === "undo").length;
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
  };
}

const hhmm = d => d ? `${p2(d.getHours())}:${p2(d.getMinutes())}` : "";

export function buildDaySheets(ledger, stationLabel = id => id) {
  const events = ledger.events || [], orders = ledger.orders || [];
  const byStation = {};
  events.forEach(e => (byStation[e.station] ||= []).push(e));
  const all = summarise(events);
  const summary = [
    ["Jersey QC — day sheet", ledger.date || localDateStamp()],
    ["Made", localTimeStamp()],
    ["Stations", Object.keys(byStation).length, "Orders", orders.length, "Jerseys passed", all.passed, "By hand", all.byHand, "To supervisor", all.flagged + all.offRoster],
    [],
    ["Station", "Operators", "Orders", "Passed", "By hand", "To supervisor", "Not on roster", "Un-checked", "First scan", "Last scan", "Active minutes", "Jerseys per active hour", "Median seconds per jersey"],
    ...Object.entries(byStation).sort(([a], [b]) => stationLabel(a).localeCompare(stationLabel(b), undefined, { numeric: true })).map(([id, evs]) => {
      const s = summarise(evs);
      return [stationLabel(id), uniq(evs.map(e => e.operator)).join(", "), uniq(evs.map(e => e.order)).join(", "), s.passed, s.byHand, s.flagged, s.offRoster, s.undone, hhmm(s.first), hhmm(s.last), s.activeMin, s.perHour ?? "", s.medianSec ?? ""];
    }),
    [],
    ["All stations", uniq(events.map(e => e.operator)).join(", "), uniq(events.map(e => e.order)).join(", "), all.passed, all.byHand, all.flagged, all.offRoster, all.undone, hhmm(all.first), hhmm(all.last), all.activeMin, all.perHour ?? "", all.medianSec ?? ""],
    [],
    ["How to read it", "Active minutes leave out gaps longer than 10 minutes (breaks). Jerseys per active hour = passed / active hours. Median seconds per jersey = typical time between two confirmed jerseys. Compare with how long the same order took by hand."],
  ];
  const orderRows = orders.map(o => {
    const evs = events.filter(e => e.station === o.station && e.order === o.order);
    const s = summarise(evs); const c = o.counts || {};
    return [stationLabel(o.station), o.order, o.jerseyType || "", o.operator || "", c.total ?? "", s.passed, s.byHand, s.flagged + s.offRoster, c.remaining ?? "", hhmm(s.first), hhmm(s.last), s.activeMin, s.perHour ?? "", o.rosterFile || ""];
  });
  const ordersSheet = [["Station", "Order", "Jersey type", "Operator", "Jerseys in order", "Passed", "By hand", "To supervisor", "Still remaining", "First scan", "Last scan", "Active minutes", "Jerseys per active hour", "Roster file"], ...orderRows];
  const reasons = {};
  events.filter(e => e.status === "flagged").forEach(e => { const k = e.offRoster ? "Not on the roster" : (e.reason || "—"); reasons[k] = (reasons[k] || 0) + 1; });
  const flagsSheet = [["Reason", "Jerseys"], ...Object.entries(reasons).sort((a, b) => b[1] - a[1]), [], ["Time", "Station", "Operator", "Order", "Jersey", "Reason", "Resolution"],
    ...events.filter(e => e.status === "flagged" || e.status === "manual").map(e => [e.t, stationLabel(e.station), e.operator, e.order, `#${e.number}${e.name ? " " + e.name : ""}`, e.reason, e.resolution])];
  const eventsSheet = [["Time", "Station", "Operator", "Order", "Status", "Number", "Name", "Size", "Team", "Reason", "Resolution"],
    ...events.map(e => [e.t, stationLabel(e.station), e.operator, e.order, e.status, e.number, e.name, e.size, e.team, e.reason, e.resolution])];
  return { summary, orders: ordersSheet, flags: flagsSheet, events: eventsSheet };
}

export function exportDaySheetXLSX(ledger, stationLabel, XLSX = globalThis.XLSX) {
  if (!XLSX) { alert("Excel library not loaded yet, please try again."); return; }
  const sheets = buildDaySheets(ledger, stationLabel);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheets.summary), "Summary");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheets.orders), "Orders");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheets.flags), "Flags");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheets.events), "Every scan");
  XLSX.writeFile(wb, `day_sheet_${ledger.date || localDateStamp()}.xlsx`);
}
