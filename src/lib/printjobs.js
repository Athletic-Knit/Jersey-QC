// ── Everything an order can print, on request ────────────────────────────────
// The Print menu at the station (and the finished-order screen) prints any
// label of an order again: the box labels, the list of what is in a box, a
// jersey's sticker, a flag's ticket. An order is handed in as a "pack":
//   { orderNumber, roster, binMap, closedBins, flags, station, planLabels }
// — the order open on the station, or one from the hub's records (an order
// done in the past, found by its number). `flags` are log entries (or the
// hub's flag events turned into the same shape); `planLabels` are the box
// labels the station expects the order to need (the open order only).
// Nothing here prints: each function returns the labels for hub.printLabels.
import { binContents, binEntries, binFieldOf, binOfRow, binOrder, inBin } from "./roster.js";
import { binListLabels, jerseyLabel, flagLabel } from "./labels.js";

// Every box of the order, closed and open, in box order, with the rows in it.
export function packBoxes(pack) {
  const { roster = [], binMap = null } = pack || {};
  const closedBins = pack?.closedBins || [];
  if (!binMap) return [];
  const closed = closedBins.map(c => ({ bin: c.bin, label: c.label, open: false }));
  const open   = binEntries(roster, binMap).map(e => ({ bin: e.bin, label: e.label, open: true }));
  return [...closed, ...open]
    .map(b => { const rows = binContents(roster, binMap, closedBins, b.bin); return { ...b, rows, count: rows.length }; })
    .sort((a, b) => binOrder(a.bin, b.bin));
}

// The box labels (kind "binticket"): one box, or every box the order has plus
// the ones it is expected to need.
export function boxLabelJobs(pack, bin) {
  const by = binFieldOf(pack?.binMap), orderNumber = String(pack?.orderNumber || "");
  const have = packBoxes(pack).map(b => ({ bin: b.bin, label: b.label, by, count: b.count, orderNumber }));
  if (bin !== undefined) return have.filter(l => l.bin === bin);
  const extra = (pack?.planLabels || []).filter(l => !have.some(h => h.bin === l.bin));
  return [...have, ...extra].sort((a, b) => binOrder(a.bin, b.bin));
}

// The list of what is in a box (kind "binlist"): one box, or every box with
// something in it. Each box's labels come in print order (labels.js).
export function boxListJobs(pack, bin) {
  return packBoxes(pack).filter(b => b.count > 0 && (bin === undefined || b.bin === bin))
    .flatMap(b => binListLabels(b.rows, { bin: b.bin, label: b.label, orderNumber: pack?.orderNumber }));
}

// The jerseys that have a sticker: passed by the camera or by hand.
export const stickerRows = pack => (pack?.roster || []).filter(inBin);
// Their stickers (kind "jersey"); `ids` picks some. The box on a reprinted
// sticker is the box the jersey is IN (a closed one too), not the open one.
export function stickerJobs(pack, ids) {
  return stickerRows(pack).filter(r => !ids || ids.includes(r._id)).map(r => {
    const bin = binOfRow(pack.binMap, pack.closedBins || [], r);
    return { ...jerseyLabel(r, pack.binMap, { orderNumber: pack.orderNumber }), bin: bin === null ? "" : bin };
  });
}

// The flag tickets (kind "flag"); `ids` picks some. `tagOf(reason)` gives the
// route tag (severityOf in config.js; the caller passes it, as labels do).
export function flagJobs(pack, ids, tagOf = () => "DECIDE") {
  return (pack?.flags || []).filter(e => !ids || ids.includes(e.id))
    .map(e => flagLabel(e, pack.binMap, { orderNumber: pack.orderNumber, station: pack.station, tag: tagOf(e.reason) }));
}

// One of the hub's order records (GET /api/hub/orders) → a pack. Its box
// names are left as they were recorded: an order from before the boxes had
// two numbers prints the numbers its boxes carry.
export function packFromRecord(rec) {
  const roster = rec?.rows || [];
  return {
    orderNumber: String(rec?.order ?? ""), roster, binMap: rec?.bins || null, closedBins: rec?.closedBins || [], station: rec?.station || "",
    flags: (rec?.flags || []).map(ev => ({
      id: ev.id, reason: ev.reason || "", timestamp: ev.t || "", detected: null,
      match: roster.find(r => r._id === ev.rowId) || { number: ev.number, name: ev.name, size: ev.size, team: ev.team },
    })),
    past: { station: rec?.station || "", date: rec?.date || "", operator: rec?.operator || "", counts: rec?.counts || null },
  };
}
