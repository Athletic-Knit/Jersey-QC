// ── Unfinished orders ───────────────────────────────────────────────────────
// An order put aside with "Finish later" (jerseys out for repair, missing, not
// scanned) is kept WHOLE ON THE SERVER, on its disk, until it is finished, and
// any station picks it up (the owner, 19 Nov 2026: "store it local to the
// server", not on the station PC; hub-plugin.js, /api/hub/unfinished).
// For a day the orders were kept on the station PC, in the browser's IndexedDB.
// What is left there moves to the server by itself (moveLocalToServer) and
// leaves the PC once the server has it; nothing new is written there.
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
// Who an order is for: one started by a sorter is a sorting order and only a sorter
// continues it; anything else is an inspection (the owner, 19 Nov 2026). From a saved
// session (`orderRole`, or the role saved with it before orderRole existed), a hub entry
// (`kind`), or a signed-in role.
export const kindOfRole = role => (role === "sorter" ? "sorter" : "inspector");
export const kindOfSession = s => kindOfRole(s?.orderRole || s?.role);
export const kindOfEntry = e => kindOfRole(e?.kind);

// What is still out of an order: flagged, missing or short-shipped, not scanned.
export function outOf(roster) {
  const rows = roster || [];
  const count = s => rows.filter(r => r.scanned === s).length;
  const toScan = rows.filter(r => !r.scanned).length;
  const done = rows.filter(r => r.scanned === "pass" || r.scanned === "manual").length;
  return { total: rows.length, done, flagged: count("flag"), missing: count("missing") + count("short"), toScan };
}
// The jerseys still out, for the hub's small entry (the supervisor settles them):
// every row not passed, and every extra jersey (flagged, not on the roster or
// with no row) the supervisor has not dealt with yet (status "extra", `xid` =
// its log entry; the owner, 20 Nov 2026).
export const outList = (roster, log = []) => [
  ...(roster || []).filter(r => r.scanned !== "pass" && r.scanned !== "manual").map(r => ({
    rowId: r._id, number: String(r.number ?? ""), name: String(r.name ?? ""), size: String(r.size ?? ""), team: String(r.team ?? ""),
    status: r.scanned === "flag" ? "flag" : r.scanned === "missing" ? "missing" : r.scanned === "short" ? "short" : "todo",
    reason: r.scanned === "flag" ? String(log.find(l => l.status === "flagged" && l.match?._id === r._id)?.reason || "").replace(/ — found after it passed$/, "") : "",
  })),
  ...(log || []).filter(isOpenExtra).map(l => ({
    rowId: null, xid: l.id, number: String(l.match?.number ?? ""), name: String(l.match?.name ?? ""), size: String(l.match?.size ?? ""), team: String(l.match?.team ?? ""),
    status: "extra", reason: String(l.reason || ""),
  })),
];
// A flagged jersey that has no roster row (not on the roster, a duplicate, no size tag) and is not dealt with.
export const isOpenExtra = l => l?.status === "flagged" && !!(l.match?.offRoster || l.match?.noRow) && !l.resolution;
// How the out jerseys read on a screen, in plain words, grouped.
export function outGroups(out) {
  const g = { flag: [], missing: [], extra: [], todo: [] };
  (out || []).forEach(j => (g[j.status === "short" ? "missing" : j.status] || g.todo).push(j));
  return g;
}
export const jerseyWords = j => `#${j.number || "?"}${j.name ? " " + j.name : ""}${j.size ? " " + j.size : ""}`;

// The supervisor settled jerseys on the board (hub entry `checkedOff`, and
// `closed` when nothing is left): a row checked off passes here too, one
// shipped short is marked short, each with a log line saying so; an extra
// jersey's flag is closed ("Dealt with by the supervisor"). → the record as it now is.
export function applyCheckOff(rec, entry) {
  if (!rec?.session || !entry) return rec;
  const rows = (entry.checkedOff || []).filter(c => c.rowId !== null && c.rowId !== undefined);
  const extras = new Map((entry.checkedOff || []).filter(c => c.xid !== null && c.xid !== undefined).map(c => [c.xid, c]));
  const byId = Object.fromEntries(rows.map(c => [c.rowId, c]));
  const roster = rec.session.roster || [];
  const now = Date.now(), stampOf = c => new Date(c.at || now).toLocaleString("sv-SE").replace("T", " ");
  const to = c => (c?.as === "short" ? "short" : "pass");
  const fresh = roster.filter(r => byId[r._id] && r.scanned !== "pass" && r.scanned !== "manual" && r.scanned !== to(byId[r._id]));
  const log0 = rec.session.log || [];
  const extraOpen = log0.some(l => extras.has(l.id) && !l.resolution);
  if (!fresh.length && !extraOpen && !entry.closed) return rec;
  const words = c => (to(c) === "short" ? "Shipped short — supervisor" : "Checked off by supervisor");
  // `ledgerId`: the hub filed this check-off as `co-<row>-<time>` (checkOffInLedger in
  // hub-plugin.js); the station reports the line under that id, so it is one pass, not two (M5).
  const lines = fresh.map((r, i) => { const c = byId[r._id]; return { id: now + i, ...(c.at ? { ledgerId: `co-${r._id}-${c.at}` } : {}), match: { ...r, scanned: to(c) }, status: to(c), reason: words(c), resolution: `${words(c)}${c.by ? " (" + c.by + ")" : ""}`, timestamp: stampOf(c), operator: c.by || "Supervisor" }; });
  const session = {
    ...rec.session,
    roster: roster.map(r => (fresh.includes(r) ? { ...r, scanned: to(byId[r._id]), checkedBy: "supervisor" } : r)),
    log: [...lines.reverse(), ...log0.map(l => (extras.has(l.id) && !l.resolution ? { ...l, resolution: `Dealt with by the supervisor${extras.get(l.id).by ? " (" + extras.get(l.id).by + ")" : ""}` } : l))],
  };
  return { ...rec, session, summary: outOf(session.roster), closed: entry.closed || rec.closed || null };
}

// The orders a station put aside on this PC before they were kept on the server:
// each goes to the server, whole (`park` = hub.parkOrder), and is taken off this PC
// once the server has it. The server away, they wait for the next time. → how many moved
export async function moveLocalToServer(park) {
  let recs; try { recs = await listOrders(); } catch { return 0; }
  let moved = 0;
  for (const rec of recs) {
    const s = rec.session;
    if (rec.closed || !s) { await dropOrder(rec.key).catch(() => {}); continue; }
    try {
      await park({ id: rec.hubId || undefined, station: rec.station, order: rec.order, run: rec.run, operator: s.operatorName || "", jerseyType: s.jerseyType || "",
        kind: kindOfSession(s) === "sorter" ? "sorter" : "", ...outOf(s.roster), out: outList(s.roster, s.log), session: s });
      await dropOrder(rec.key); moved++;
    } catch { /* the server is away: next time */ }
  }
  return moved;
}

export const putOrder  = rec => run("readwrite", s => s.put({ ...rec, savedAt: Date.now() }));
export const getOrder  = key => run("readonly",  s => s.get(key));
export const dropOrder = key => run("readwrite", s => s.delete(key));
export const listOrders = () => run("readonly", s => s.getAll()).then(a => (a || []).sort((x, y) => (y.savedAt || 0) - (x.savedAt || 0)));
