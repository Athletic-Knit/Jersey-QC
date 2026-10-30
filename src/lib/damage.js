// ── Damage report: every flagged jersey with its photo, as an Excel workbook ──
// Built with ExcelJS (loaded from the CDN on first use) because SheetJS's
// community build cannot embed images. The rows are pure data so they can be
// tested; only exportDamageReportXLSX touches the browser.
import { safeFilename, localDateStamp } from "./export.js";

// "Photo" is the scan (what the camera read, the back of the jersey); "Damage
// photo" is what the operator showed the camera after flagging. A jersey with
// more than one damage photo gets further columns ("Damage photo 2", ...).
export const DAMAGE_COLUMNS = ["Date", "Time", "Station", "Order", "Jersey type", "Operator", "Number", "Name", "Team / colour", "Size", "Status", "Reason", "Resolution", "Photo", "Damage photo"];

// Events as the hub ledger or a station log holds them → one row per flagged
// jersey, newest last. Accepts both shapes: ledger events ({ t, station,
// order, number, name, ... }) and station log entries ({ timestamp, match,
// detected, ... }).
export function buildDamageRows(events, { stationLabel = id => id, operatorName = "", orderNumber = "", jerseyType = "", typeLabel = t => t } = {}) {
  const rows = [];
  for (const e of events || []) {
    const status = e.status;
    if (status !== "flagged") continue;
    const t = String(e.t || e.timestamp || "");
    const m = e.match || null, d = e.detected || null;
    rows.push({
      date: t.slice(0, 10), time: t.slice(11, 19),
      station: e.station ? stationLabel(e.station) : "",
      order: e.order ?? orderNumber ?? "",
      type: typeLabel(e.jerseyType || jerseyType || "") || "",
      operator: e.operator || operatorName || "",
      number: e.number ?? m?.number ?? d?.number ?? "",
      name: e.name ?? m?.name ?? d?.name ?? "",
      team: e.team ?? m?.team ?? "",
      size: e.size ?? m?.size ?? "",
      status: e.offRoster || m?.offRoster ? "NOT ON ROSTER" : "FLAGGED",
      reason: e.reason || "",
      resolution: e.resolution || "",
      photo: e.photo || null,
      damagePhotos: Array.isArray(e.damagePhotos) ? e.damagePhotos.filter(Boolean) : [],
    });
  }
  rows.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  return rows;
}

const CDN = "https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js";
let loading = null;
export function loadExcelJS() {
  if (globalThis.ExcelJS) return Promise.resolve(globalThis.ExcelJS);
  if (!loading) loading = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = CDN; s.async = true;
    s.onload = () => globalThis.ExcelJS ? resolve(globalThis.ExcelJS) : reject(new Error("ExcelJS did not load"));
    s.onerror = () => { loading = null; reject(new Error("Could not load the Excel library — is the internet up?")); };
    document.head.appendChild(s);
  });
  return loading;
}

const PHOTO_W = 180, PHOTO_H = 135;   // 4:3 at 180 px wide; row height is in points (3/4 px)

/**
 * Writes damage_<name>_<date>.xlsx with one row per flagged jersey and the
 * jersey's photo in the last column. `rows` from buildDamageRows.
 */
export async function exportDamageReportXLSX(rows, { name = "all", title = "Damage report" } = {}, ExcelJS = null) {
  const XL = ExcelJS || await loadExcelJS();
  const wb = buildDamageWorkbook(rows, { title }, XL);
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `damage_${safeFilename(name)}_${localDateStamp()}.xlsx`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

// The workbook itself, for the browser download above or a Node script.
export function buildDamageWorkbook(rows, { title = "Damage report" } = {}, XL) {
  const wb = new XL.Workbook();
  wb.creator = "Jersey QC Scanner";
  const ws = wb.addWorksheet("Damage report", { views: [{ state: "frozen", ySplit: 2 }] });
  const most = rows.reduce((n, r) => Math.max(n, (r.damagePhotos || []).length), 0);
  const cols = [...DAMAGE_COLUMNS, ...Array.from({ length: Math.max(0, most - 1) }, (_, i) => `Damage photo ${i + 2}`)];
  const PHOTO_COL = DAMAGE_COLUMNS.length - 2;   // 0-based column of the scan photo; the damage photos follow it
  ws.addRow([title + (rows.length ? ` — ${rows.length} flagged ${rows.length === 1 ? "jersey" : "jerseys"}` : " — nothing flagged"), ...Array(cols.length - 1).fill("")]);
  ws.getRow(1).font = { bold: true, size: 13 };
  ws.addRow(cols);
  ws.getRow(2).font = { bold: true };
  ws.getRow(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
  const widths = [11, 9, 10, 10, 13, 14, 8, 16, 14, 8, 14, 32, 24, ...Array(cols.length - PHOTO_COL).fill(Math.ceil(PHOTO_W / 7))];
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  rows.forEach((r, i) => {
    const pics = [r.photo, ...(r.damagePhotos || [])];
    const row = ws.addRow([r.date, r.time, r.station, r.order, r.type, r.operator, r.number, r.name, r.team, r.size, r.status, r.reason, r.resolution, r.photo ? "" : "no photo", (r.damagePhotos || []).length ? "" : "none taken", ...Array(Math.max(0, cols.length - DAMAGE_COLUMNS.length)).fill("")]);
    row.alignment = { vertical: "top", wrapText: true };
    if (pics.some(Boolean)) row.height = PHOTO_H * 0.75 + 6;
    pics.forEach((p, j) => {
      const m = p && /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(p);
      if (!m) return;
      const id = wb.addImage({ base64: m[2], extension: m[1].toLowerCase() === "png" ? "png" : "jpeg" });
      ws.addImage(id, { tl: { col: PHOTO_COL + j, row: i + 2 }, ext: { width: PHOTO_W, height: PHOTO_H }, editAs: "oneCell" });
    });
  });
  return wb;
}
