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
import { binContents, binEntries, binFieldOf, binOfRow, binOrder, inBin, groupSize } from "./roster.js";
import { binListLabels, jerseyLabel, flagLabel, damagedListLabels } from "./labels.js";

// Every box of the order, closed and open, in box order, with the rows in it.
// A box an earlier ship-with order left open (`pack.carried`, the owner, 20 Nov 2026) holds that
// order's jerseys too; its list names every order in it: "264247 (12) + 264248 (8)".
const carriedRows = (pack, bin) => (pack?.carried || []).filter(c => c.bin === bin).flatMap(c => (c.items || []).map(x => ({ ...x, scanned: "pass", carried: true })));
// The order line of a box's list: the order number alone, or, in a carried
// box, every order in it with its count.
export function ordersInBox(pack, bin, rows) {
  const prev = carriedRows(pack, bin); if (!prev.length) return String(pack?.orderNumber || "");
  const n = new Map(); rows.forEach(r => { const o = r.carried ? r.order || "?" : String(pack?.orderNumber || ""); n.set(o, (n.get(o) || 0) + 1); });
  return [...n].map(([o, k]) => `${o} (${k})`).join(" + ");
}
// Every box of the order (see above): { bin, label, open, rows, count }.
export function packBoxes(pack) {
  const { roster = [], binMap = null } = pack || {};
  const closedBins = pack?.closedBins || [];
  if (!binMap) return [];
  const closed = closedBins.map(c => ({ bin: c.bin, label: c.label, open: false }));
  const open   = binEntries(roster, binMap).map(e => ({ bin: e.bin, label: e.label, open: true }));
  return [...closed, ...open]
    .map(b => { const rows = [...binContents(roster, binMap, closedBins, b.bin), ...carriedRows(pack, b.bin)]; return { ...b, rows, count: rows.length }; })
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
    .flatMap(b => binListLabels(b.rows, { bin: b.bin, label: b.label, orderNumber: ordersInBox(pack, b.bin, b.rows), by: binFieldOf(pack?.binMap), of: b.rows.some(r => r.carried) ? 0 : groupSize(pack?.roster, pack?.binMap, b.rows) }));
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
    .map(e => ({ ...flagLabel(e, pack.binMap, { orderNumber: pack.orderNumber, station: pack.station, tag: tagOf(e.reason) }), copies: 1 }));   // a reprint from the Print menu is one ticket (the owner, 19 Nov 2026); a new flag prints FLAG_COPIES
}

// ── The DAMAGED box ─────────────────────────────────────────────────────────
// What is in it: every jersey that is flagged right now, with the reason of
// its newest flag, in jersey-number order. A jersey that was flagged and has
// since passed or been un-checked is out of the box; one the supervisor has
// resolved is too. A flag with no roster row (not on the roster) counts: the
// jersey is in the box all the same.
export function damagedItems(pack) {
  const roster = pack?.roster || [], seen = new Set(), out = [];
  const newestFirst = [...(pack?.flags || [])].sort((a, b) => String(b.timestamp || "").localeCompare(String(a.timestamp || "")) || (Number(b.id) || 0) - (Number(a.id) || 0));
  newestFirst.forEach(e => {
    const id = e.match?._id, row = id !== undefined ? roster.find(r => r._id === id) : null;
    if (row && row.scanned !== "flag") return;
    if (!row && e.resolution) return;
    const key = row ? "r" + id : "e" + e.id;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ number: row?.number ?? e.match?.number ?? e.detected?.number ?? "", name: row?.name ?? e.match?.name ?? e.detected?.name ?? "", team: row?.team ?? e.match?.team ?? "", reason: e.reason || "" });
  });
  const num = x => { const n = parseInt(String(x.number).replace(/\D/g, ""), 10); return Number.isFinite(n) ? n : 1e9; };
  return out.sort((a, b) => num(a) - num(b) || String(a.name).localeCompare(String(b.name)));
}
// Its list (kind "binlist") and its own label (kind "binticket").
export function damagedListJobs(pack) { return damagedListLabels(damagedItems(pack), { orderNumber: pack?.orderNumber }); }
// The DAMAGED box's label: printed with the order's first flag, once an order.
export const damagedBoxLabel = pack => ({ bin: "DAMAGED", title: "DAMAGED", label: "Flagged jerseys", by: "", count: 0, orderNumber: String(pack?.orderNumber || "") });

// One of the hub's order records (GET /api/hub/orders) → a pack. Its box
// names are left as they were recorded: an order from before the boxes had
// two numbers prints the numbers its boxes carry.
export function packFromRecord(rec) {
  const roster = rec?.rows || [];
  return {
    orderNumber: String(rec?.order ?? ""), roster, binMap: rec?.bins || null, closedBins: rec?.closedBins || [], station: rec?.station || "",
    flags: (rec?.flags || []).map(ev => ({
      // `resolution` comes along: without it a past order's DAMAGED list kept the
      // off-roster jerseys the supervisor had already dealt with (code review of
      // 23 Nov 2026; damagedItems leaves a resolved flag with no row out).
      id: ev.id, reason: ev.reason || "", resolution: ev.resolution || "", timestamp: ev.t || "", detected: null,
      match: roster.find(r => r._id === ev.rowId) || { number: ev.number, name: ev.name, size: ev.size, team: ev.team },
    })),
    past: { station: rec?.station || "", date: rec?.date || "", operator: rec?.operator || "", counts: rec?.counts || null },
  };
}
