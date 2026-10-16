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
