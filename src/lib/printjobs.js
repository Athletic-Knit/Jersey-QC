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
import { binContents, binEntries, binFieldOf, binFor, binOfRow, binOrder, boxParts, inBin, groupSize } from "./roster.js";
import { binListLabels, jerseyLabel, flagLabel, damagedListLabels, listLabels } from "./labels.js";

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
// something in it. Each box's labels come in print order (labels.js); the
// group's last box gets its NOT IN BOX list too (below), printed first so the
// strip reads count label, the rows, then what is not there.
export function boxListJobs(pack, bin) {
  return packBoxes(pack).filter(b => b.count > 0 && (bin === undefined || b.bin === bin))
    .flatMap(b => [
      ...(isLastBox(pack, b.bin) ? notInBoxJobs(pack, b.bin, b.label) : []),
      ...binListLabels(b.rows, { bin: b.bin, label: b.label, orderNumber: ordersInBox(pack, b.bin, b.rows), by: binFieldOf(pack?.binMap), of: b.rows.some(r => r.carried) ? 0 : groupSize(pack?.roster, pack?.binMap, b.rows) }),
    ]);
}

// ── What is NOT in a box, and why (the owner, 24 Nov 2026) ─────────────────
// "Each box should have what's there, and what isn't there and why": for a
// box, the jerseys of its team or size that are in no box — flagged (with the
// reason of the newest flag), marked missing, or not scanned yet — one line
// each. It goes with the group's LAST box (the open one, or the box closed
// when nothing of the group was left to scan): the earlier boxes were full,
// not short. → [{ row, why }] in jersey-number order.
export function notInBox(pack, bin) {
  const roster = pack?.roster || [], binMap = pack?.binMap, closed = pack?.closedBins || [];
  if (!binMap) return [];
  const key = Object.entries(binMap).find(([k, v]) => k !== "__by" && v === bin)?.[0] ?? closed.find(c => c.bin === bin)?.key;
  if (key === undefined) return [];
  const open = binMap[key];   // binFor gives the group's open box for any row of the group
  const reason = new Map(damagedItems(pack).filter(x => x._id !== undefined).map(x => [x._id, x.reason]));
  const why = r => r.scanned === "flag" ? `flagged${reason.get(r._id) ? " — " + reason.get(r._id) : ""}` : r.scanned === "missing" || r.scanned === "short" ? "marked missing" : "not scanned";
  return roster.filter(r => !inBin(r) && binFor(binMap, r) === open).sort(byNumber).map(r => ({ row: r, why: why(r) }));
}
// Its labels (kind "binlist"): "NOT IN BOX 5.1 Navy" and one line a jersey.
// `box` names the box they belong to (`bin` on a list label is its title), so
// Finish order can hold them back with the box's own list when the box stays
// open for a ship-with order (review, 24 Nov 2026).
export function notInBoxJobs(pack, bin, label = "") {
  return listLabels(notInBox(pack, bin).map(x => `${who(x.row)}: ${x.why}`), { title: `NOT IN BOX ${bin}${label ? " " + label : ""}`, orderNumber: pack?.orderNumber })
    .map(l => ({ ...l, box: String(bin) }));
}
// Is `bin` the last box of its team or size: no later box of the group has anything in it.
export function isLastBox(pack, bin) {
  const g = boxParts(bin)[0];
  return !packBoxes(pack).some(x => boxParts(x.bin)[0] === g && binOrder(x.bin, bin) > 0 && x.count > 0);
}

// ── The order summary (the owner, 24 Nov 2026) ─────────────────────────────
// "Which jerseys are there and passed, which are there and failed, which are
// missing." From a pack, so the Print menu gives it for a past order too.
//   passed   every jersey in a box, with the box it is in;
//   failed   every jersey flagged right now, with the reason of its newest flag
//            (damagedItems: the roster rows, then the off-roster flags);
//   missing  marked missing by the operator, and not scanned yet, side by side.
const byNumber = (a, b) => { const n = x => { const v = parseInt(String(x.number ?? "").replace(/\D/g, ""), 10); return Number.isFinite(v) ? v : 1e9; }; return n(a) - n(b) || String(a.name ?? "").localeCompare(String(b.name ?? "")); };
// "#7 SMITH White A-L": a jersey on one line of a label.
const who = x => [String(x?.number ?? "").trim() ? `#${String(x.number).trim()}` : "", x?.name, x?.team, x?.size].map(v => String(v ?? "").trim()).filter(Boolean).join(" ") || "Jersey";
export function orderSummary(pack) {
  const roster = pack?.roster || [], binMap = pack?.binMap || null, closed = pack?.closedBins || [];
  const passed = roster.filter(inBin).sort(byNumber).map(row => ({ row, bin: binMap ? binOfRow(binMap, closed, row) : null }));
  const failed = damagedItems(pack);
  const marked = roster.filter(r => r.scanned === "missing" || r.scanned === "short").sort(byNumber);
  const notScanned = roster.filter(r => !r.scanned).sort(byNumber);
  return { passed, failed, missing: { marked, notScanned },
    counts: { total: roster.length, passed: passed.length, failed: failed.length, missing: marked.length + notScanned.length, marked: marked.length, notScanned: notScanned.length } };
}
// The summary's labels (kind "binlist"), in print order: the PASSED list (only
// `withPassed`: on a 500-jersey order it is 70 labels by itself, and the box
// lists carry every passed jersey), the MISSING list, the FAILED list, then the
// count label — so the strip off the printer reads count label, FAILED,
// MISSING, PASSED. Finish order prints it without the passed list; the Print
// menu and the summary screen print it on request.
export function summaryJobs(pack, { withPassed = false, station = "", date = "" } = {}) {
  const s = orderSummary(pack), o = pack?.orderNumber;
  const passed  = withPassed ? listLabels(s.passed.map(p => `${who(p.row)}${p.bin ? "  Box " + p.bin : ""}`), { title: "PASSED", orderNumber: o }) : [];
  const missing = listLabels([...s.missing.marked.map(r => `${who(r)}: marked missing`), ...s.missing.notScanned.map(r => `${who(r)}: not scanned`)], { title: "MISSING", orderNumber: o });
  const failed  = listLabels(s.failed.map(x => `${who(x)}: ${x.reason || "flagged"}`), { title: "FAILED", orderNumber: o });
  return [...passed, ...missing, ...failed, { summary: true, orderNumber: String(o || ""), station: String(station || ""), date: String(date || ""), counts: s.counts }];
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
    out.push({ _id: row?._id, number: row?.number ?? e.match?.number ?? e.detected?.number ?? "", name: row?.name ?? e.match?.name ?? e.detected?.name ?? "", team: row?.team ?? e.match?.team ?? "", size: row?.size ?? e.match?.size ?? "", reason: e.reason || "" });   // _id and size for the order summary and the NOT IN BOX list (24 Nov 2026)
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
