// ── Unfinished orders, kept on this PC ──────────────────────────────────────
// An order parked with "Finish later" (jerseys out for repair, missing, not
// scanned) stays on the station PC, whole, until it is finished: it may take
// two or three weeks to come back (the owner, 19 Nov 2026). localStorage holds
// about 5 MB, which one 500-jersey order nearly fills, so these live in the
// browser's IndexedDB, which holds hundreds of orders. The hub keeps only a
// small entry per order (hub-plugin.js, /api/hub/unfinished).
//
// A record: { key: "station|order|run", station, order, run, savedAt, closed,
//             summary: { total, done, flagged, missing, toScan }, session }
// `session` is what saveSession() keeps for the open order (persist.js), so a
// parked order opens exactly as it was.
const DB = "jerseyqc", STORE = "unfinished", VERSION = 1;

let opening = null;
function db() {
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("no IndexedDB in this browser")); return; }
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "key" }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("could not open the order store"));
  }).catch(e => { opening = null; throw e; });
  return opening;
}
const run = (mode, fn) => db().then(d => new Promise((resolve, reject) => {
  const tx = d.transaction(STORE, mode), store = tx.objectStore(STORE);
  const req = fn(store);
  tx.oncomplete = () => resolve(req?.result);
  tx.onerror = () => reject(tx.error || new Error("order store failed"));
  tx.onabort = () => reject(tx.error || new Error("order store aborted"));
}));

export const orderKey = (station, order, run) => `${station}|${order}|${run || 0}`;

// What is still out of an order: flagged, missing or short-shipped, not scanned.
export function outOf(roster) {
  const rows = roster || [];
  const count = s => rows.filter(r => r.scanned === s).length;
  const toScan = rows.filter(r => !r.scanned).length;
  const done = rows.filter(r => r.scanned === "pass" || r.scanned === "manual").length;
  return { total: rows.length, done, flagged: count("flag"), missing: count("missing") + count("short"), toScan };
}
// The jerseys still out, for the hub's small entry (the supervisor ticks them off).
export const outList = (roster, log = []) => (roster || []).filter(r => r.scanned !== "pass" && r.scanned !== "manual").map(r => ({
  rowId: r._id, number: String(r.number ?? ""), name: String(r.name ?? ""), size: String(r.size ?? ""), team: String(r.team ?? ""),
  status: r.scanned === "flag" ? "flag" : r.scanned === "missing" ? "missing" : r.scanned === "short" ? "short" : "todo",
  reason: r.scanned === "flag" ? String(log.find(l => l.status === "flagged" && l.match?._id === r._id)?.reason || "").replace(/ — found after it passed$/, "") : "",
}));

// The supervisor checked jerseys off on the board (hub entry `checkedOff`, and
// `closed` when nothing is left): those rows pass here too, each with a log
// line saying so. → the record as it now is.
export function applyCheckOff(rec, entry) {
  if (!rec?.session || !entry) return rec;
  const ids = new Set((entry.checkedOff || []).map(c => c.rowId));
  const roster = rec.session.roster || [];
  const now = Date.now(), stampOf = c => new Date(c.at || now).toLocaleString("sv-SE").replace("T", " ");
  const fresh = roster.filter(r => ids.has(r._id) && r.scanned !== "pass" && r.scanned !== "manual");
  if (!fresh.length && !entry.closed) return rec;
  const byId = Object.fromEntries((entry.checkedOff || []).map(c => [c.rowId, c]));
  const lines = fresh.map((r, i) => ({ id: now + i, match: { ...r, scanned: "pass" }, status: "pass", reason: "Checked off by supervisor", resolution: `Checked off by supervisor${byId[r._id]?.by ? " (" + byId[r._id].by + ")" : ""}`, timestamp: stampOf(byId[r._id] || {}), operator: byId[r._id]?.by || "Supervisor" }));
  const session = { ...rec.session, roster: roster.map(r => (ids.has(r._id) && r.scanned !== "pass" && r.scanned !== "manual" ? { ...r, scanned: "pass", checkedBy: "supervisor" } : r)), log: [...lines.reverse(), ...(rec.session.log || [])] };
  return { ...rec, session, summary: outOf(session.roster), closed: entry.closed || rec.closed || null };
}

export const putOrder  = rec => run("readwrite", s => s.put({ ...rec, savedAt: Date.now() }));
export const getOrder  = key => run("readonly",  s => s.get(key));
export const dropOrder = key => run("readwrite", s => s.delete(key));
export const listOrders = () => run("readonly", s => s.getAll()).then(a => (a || []).sort((x, y) => (y.savedAt || 0) - (x.savedAt || 0)));
