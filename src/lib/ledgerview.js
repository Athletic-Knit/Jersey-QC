// ── Reading the hub's ledger on the supervisor board ─────────────────────────
// The board shows orders from the hub's day ledger (hub-plugin.js): one record
// per run of an order on a station, and every scan event. These rules decide
// which record is "the order", which events belong to it, and whether it is
// finished. They live here, not in App.jsx, so tests can hold them (code review
// of 23 Nov 2026, M7, M10, M12).

// The same record and the same events: one run of an order on a station.
// Events from before runs existed carry none and match any run.
export const sameRun = (a, b) => !a || !b || a === b;

// The events of one run of an order, wherever they were scanned: a run picked
// up at another station keeps its run (`orderRun`), and the hub keeps on each
// event the station that scanned it. Events from before runs existed go by
// station and order.
export const ofRun = rec => e => !!rec && String(e.order) === String(rec.order) && (rec.run && e.run ? e.run === rec.run : e.station === rec.station);

// The record to show: the run asked for, or with none asked (a station card's
// Open), the newest run. `sameRun(x, 0)` is always true, so the oldest run used
// to win (M12).
export function pickRun(runs, run = 0) {
  const list = runs || [];
  return (run ? list.find(x => sameRun(x.run, run)) : null) || list.slice().sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0))[0];
}

// An order is finished when its station pressed Finish order (`finishedAt`), or
// when every jersey on it is accounted for. Before `finishedAt`, an order
// finished with jerseys not scanned showed "in progress" for ever (M7).
export const orderDone = o => !!o?.finishedAt || ((o?.counts?.total ?? 0) > 0 && o.counts.remaining === 0);
// When it finished: the Finish order press, else the last report.
export const doneAt = o => o?.finishedAt || o?.lastSeen;

// The hub's events as the station's log has them, for the order workbook:
// the status is kept, as the Summary sheet counts by it (M10: without it every
// count there was 0).
export const eventsAsLog = events => (events || []).map(e => ({
  id: e.id, status: e.status, reason: e.reason, resolution: e.resolution, operator: e.operator, timestamp: e.t,
  match: { _id: e.rowId, number: e.number, name: e.name, size: e.size, team: e.team, offRoster: !!e.offRoster },
}));
