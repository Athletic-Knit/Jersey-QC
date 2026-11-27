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
import { binContents, binEntries, binFieldOf, binFor, binOfRow, binOrder, inBin, groupSize, shortSize, bySize, teamKey } from "./roster.js";
import { binListLabels, jerseyLabel, flagLabel, damagedListLabels, listLabels } from "./labels.js";
import { packListLabel } from "./packlabels.js";
import { garmentOf } from "./garments.js";

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
// The team or size a box belongs to: its key in the bin map, or the key its closed entry kept. Boxes have
// whole numbers (the co-op, 27 Nov 2026), so the number no longer says which team a box is (Hawks 1 and 31).
export function keyOfBox(pack, bin) {
  const binMap = pack?.binMap, closed = pack?.closedBins || [];
  return Object.entries(binMap || {}).find(([k, v]) => k !== "__by" && v === bin)?.[0] ?? closed.find(c => c.bin === bin)?.key;
}
// Every box of the order (see above): { bin, key, label, open, rows, count }.
export function packBoxes(pack) {
  const { roster = [], binMap = null } = pack || {};
  const closedBins = pack?.closedBins || [];
  if (!binMap) return [];
  const keyOpen = bin => Object.entries(binMap).find(([k, v]) => k !== "__by" && v === bin)?.[0];
  const closed = closedBins.map(c => ({ bin: c.bin, key: c.key, label: c.label, open: false }));
  const open   = binEntries(roster, binMap).map(e => ({ bin: e.bin, key: keyOpen(e.bin), label: e.label, open: true }));
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

// What a box's list is made of (the owner, 25 Nov 2026): on a TALL roll the packing list is a table, one
// label object that the hub lays out in pages, then the count label, then the outside label (printed
// last, so it comes off the printer on top of the strip); on the 2 x 1 in roll and the sticker roll it is
// the pages of rows and the count label. `b.rows` are the garments in the box.
export function boxListLabels(pack, b, { tall = false } = {}) {
  if (!b || !b.rows?.length) return [];
  const by = binFieldOf(pack?.binMap), orderNumber = ordersInBox(pack, b.bin, b.rows);
  const of = b.rows.some(r => r.carried) ? 0 : groupSize(pack?.roster, pack?.binMap, b.rows);
  const pages = binListLabels(b.rows, { bin: b.bin, label: b.label, orderNumber, by, of });
  if (!tall) return pages;
  return [packListLabel(b.rows, { bin: b.bin, label: b.label, orderNumber, by }), ...pages.filter(l => l.title), boxFaceLabel(pack, b)];
}

// ── The outside label of a box (the owner, 25 Nov 2026) ─────────────────────
// The shipping face of the box: the order, the customer (the box's teams when
// none was given), the teams and the sizes in it as "in this box / in the whole
// order" (within the box's own team: see below), what is not in it, and "Box 1
// of 3". No garment names: the list with the names goes inside. `pack.plan` (the station's box plan: [{ bin, boxes,
// total }]) says how many boxes the order is still expected to need, for "of N"
// before Finish; on a finished order (`pack.finished`, `pack.past`, `pack.final`)
// N is the number of boxes that have garments in them.
export function boxFaceLabel(pack, b) {
  const boxes = packBoxes(pack), roster = pack?.roster || [], by = binFieldOf(pack?.binMap);
  const rows = b?.rows || [], label = String(b?.label || "");
  const count = (list, key) => { const m = new Map(); list.forEach(r => { const v = key(r); if (!v.k) return; const t = m.get(v.k) || { name: v.name, n: 0 }; t.n++; m.set(v.k, t); }); return m; };
  const teamOf = r => { const t = String(r.team ?? "").trim(); return { k: teamKey(t) || teamKey(label), name: t || label }; };
  const sizeOf = r => { const z = shortSize(String(r.size ?? "").trim()); return { k: teamKey(z), name: z }; };
  // "Of order" is counted within the box's own team (or size, on a box sorted by size): a box of U11 Tigers reads
  // "A-M 3 / 4", the Tigers' A-M garments, not the A-M of the other teams (the paper trial of 25 Nov 2026 did the same).
  const g = rows.length && by !== "all" ? teamKey(rows[0][by]) : null, scope = g === null ? roster : roster.filter(r => teamKey(r[by]) === g);
  const inTeam = count(rows, teamOf), allTeam = count(scope, teamOf), inSize = count(rows, sizeOf), allSize = count(scope, sizeOf);
  const teams = [...inTeam].map(([k, t]) => ({ team: t.name, inBox: t.n, ofOrder: allTeam.get(k)?.n ?? t.n })).sort((x, y) => x.team.localeCompare(y.team, undefined, { sensitivity: "base" }));
  const sizes = [...inSize].map(([k, t]) => ({ size: t.name, inBox: t.n, ofOrder: allSize.get(k)?.n ?? t.n })).sort((x, y) => bySize(x.size, y.size));
  // The box's place among the order's boxes that have garments, and how many there are: the closed boxes
  // first, in the order they were closed, then the open ones in box order. A sealed box keeps its number
  // on a reprint whatever opens after it (by box order alone, 2.1 closed as "Box 2" became "Box 3" once
  // 1.2 had garments; the co-op, 25 Nov 2026).
  const closedAt = new Map((pack?.closedBins || []).map((c, i) => [c.bin, i]));
  const withG = boxes.filter(x => x.count > 0 || x.bin === b?.bin)
    .sort((x, y) => (closedAt.get(x.bin) ?? Infinity) - (closedAt.get(y.bin) ?? Infinity) || binOrder(x.bin, y.bin));
  const boxNo = Math.max(1, withG.findIndex(x => x.bin === b?.bin) + 1);
  let total = withG.length;
  if (!(pack?.finished || pack?.past || pack?.final) && Array.isArray(pack?.plan)) {
    const closed = boxes.filter(x => !x.open && x.count > 0).length;
    const open = pack.plan.filter(e => e.boxes > 0 && (e.total > 0 || (boxes.find(x => x.bin === e.bin)?.count || 0) > 0 || e.bin === b?.bin)).reduce((n, e) => n + e.boxes, 0);
    total = Math.max(total, closed + open);
  }
  // What the team is missing: only on the group's last box (the earlier ones were full, not short).
  const why = r => r.scanned === "flag" ? "flagged" : r.scanned === "missing" || r.scanned === "short" ? "missing" : "not scanned";
  const notIn = b && by !== "all" && isLastBox(pack, b.bin) ? notInBox(pack, b.bin).map(x => `${String(x.row.number ?? "").trim() ? "#" + String(x.row.number).trim() : "Garment"} ${shortSize(x.row.size)} ${why(x.row)}`.replace(/\s+/g, " ").trim()) : [];
  return { kind: "boxface", bin: b?.bin, boxNo, boxes: total, orderNumber: String(pack?.orderNumber || ""), customer: String(pack?.customer || "").trim() || teams.map(t => t.team).join(", ") || label, teams, sizes, notIn };
}
// The outside label of one box, or of every box with something in it (the Print menu).
export function boxFaceJobs(pack, bin) {
  return packBoxes(pack).filter(b => b.count > 0 && (bin === undefined || b.bin === bin)).map(b => boxFaceLabel(pack, b));
}

// The list of what is in a box (kind "binlist"): one box, or every box with
// something in it. Each box's labels come in print order (labels.js); the
// group's last box gets its NOT IN BOX list too (below), printed first so the
// strip reads count label, the rows, then what is not there.
export function boxListJobs(pack, bin, { tall = false } = {}) {
  const boxes = packBoxes(pack);
  // An empty open box with no closed box before it: the whole team is flagged or missing, and only
  // its NOT IN BOX list says so (the third check, 24 Nov 2026: Finish order printed it, the Print
  // menu did not). An empty box AFTER a closed one is where a jersey that comes back would go; its
  // group's last box is the closed one, which carries the NOT IN BOX list.
  const alone = b => b.open && b.count === 0 && !boxes.some(x => !x.open && x.key !== undefined && x.key === b.key);
  return boxes.filter(b => (b.count > 0 || alone(b)) && (bin === undefined || b.bin === bin))
    .flatMap(b => [
      ...(isLastBox(pack, b.bin) ? notInBoxJobs(pack, b.bin, b.label) : []),
      ...(b.count > 0 ? boxListLabels(pack, b, { tall }) : []),
    ]);
}
// What Finish order prints for an OPEN box, before its own list (the third
// check, 24 Nov 2026: Box full always opens the next box, 1.1 → 1.2, so that a
// jersey that comes back — un-checked and scanned again, back from repair on a
// picked-up order — has a box to go in; with nothing left to scan that box
// stays empty and unlabelled, and Finish printed a second NOT IN BOX list under
// its name, the same jerseys as the one Box full printed for 1.1).
//   with jerseys in it        it is the group's last box: its NOT IN BOX list;
//   empty, no closed box      the whole team is flagged or missing: the list under this name;
//   empty after a closed box  the group's last box on the floor is the CLOSED one. Box full printed
//                             its NOT IN BOX list when nothing was left to scan and the closed entry
//                             keeps what was on it (`notIn`, the row ids): nothing prints again
//                             unless that changed since — a jersey flagged or un-checked after the
//                             box closed — and then the whole list again under the closed box's
//                             name. An entry with no record (closed before this, or closed with
//                             jerseys still to scan) prints the list.
export function finishNotInBoxJobs(pack, bin, label = "", count = 0) {
  if (count > 0) return notInBoxJobs(pack, bin, label);
  const g = keyOfBox(pack, bin);
  const last = g === undefined ? null : (pack?.closedBins || []).filter(c => c.key === g).sort((a, b) => binOrder(b.bin, a.bin))[0];
  if (!last) return notInBoxJobs(pack, bin, label);
  const now = notInBox(pack, last.bin).map(x => String(x.row._id));
  const was = Array.isArray(last.notIn) ? last.notIn.map(String) : null;
  if (was && was.length === now.length && now.every(id => was.includes(id))) return [];
  return notInBoxJobs(pack, last.bin, last.label || label);
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
  const why = r => r.scanned === "flag" ? `flagged${reason.get(r._id) ? " — " + reason.get(r._id) : ""}` : r.scanned === "missing" || r.scanned === "short" ? "marked missing" : "unscanned";
  return roster.filter(r => !inBin(r) && binFor(binMap, r) === open).sort(byNumber).map(r => ({ row: r, why: why(r) }));
}
// Its labels (kind "binlist"): "NOT IN BOX 5.1 Navy" and one line a jersey.
// `box` names the box they belong to (`bin` on a list label is its title), so
// Finish order can hold them back with the box's own list when the box stays
// open for a ship-with order (review, 24 Nov 2026).
export function notInBoxJobs(pack, bin, label = "") {
  // No order number in the header: with a long team name it squeezed the header to 1.4 mm type
  // (review, 24 Nov 2026); the box's count label and its rows carry the order.
  return listLabels(notInBox(pack, bin).map(x => `${who(x.row)}: ${x.why}`), { title: `NOT IN BOX ${bin}${label ? " " + label : ""}` })
    .map(l => ({ ...l, box: String(bin) }));
}
// Is `bin` the last box of its team or size: no later box of the group has
// anything in it, and nothing of the group is left to scan (the rule Box full
// uses; review, 24 Nov 2026: a closed 1.1 with an empty 1.2 and three jerseys
// still to scan is not last — they are going into 1.2 in an hour).
// On a finished order (`pack.finished`: the done screen; `pack.past`: a record
// from the hub) nothing more will be scanned, so a jersey never scanned is
// short and the group's last box lists it.
export function isLastBox(pack, bin) {
  const g = keyOfBox(pack, bin);
  if (packBoxes(pack).some(x => g !== undefined && x.key === g && x.bin !== bin && binOrder(x.bin, bin) > 0 && x.count > 0)) return false;
  if (pack?.finished || pack?.past) return true;
  const binMap = pack?.binMap, closed = pack?.closedBins || [];
  const key = keyOfBox({ binMap, closedBins: closed }, bin);
  if (key === undefined) return false;
  return !(pack?.roster || []).some(r => !r.scanned && binFor(binMap, r) === binMap[key]);
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
const who = x => [String(x?.number ?? "").trim() ? `#${String(x.number).trim()}` : "", x?.name, x?.team, shortSize(x?.size)].map(v => String(v ?? "").trim()).filter(Boolean).join(" ") || "Garment";
export function orderSummary(pack) {
  const roster = pack?.roster || [], binMap = pack?.binMap || null, closed = pack?.closedBins || [];
  const passed = roster.filter(inBin).sort(byNumber).map(row => ({ row, bin: binMap ? binOfRow(binMap, closed, row) : null }));
  // Failed comes from the ROSTER (every row flagged right now), with the reason of its newest flag
  // from the log; a flagged row with no flag entry (a past order with its events gone) still counts
  // (review, 24 Nov 2026). The flags with no row of their own — not on the roster, a duplicate
  // (from a list, or a second copy of a passed row), no size tag — are `extra`: in the DAMAGED box,
  // but not among the order's jerseys, so they are counted apart.
  const dmg = damagedItems(pack), reasonOf = new Map(dmg.filter(x => x._id !== undefined).map(x => [x._id, x.reason]));
  const failed = roster.filter(r => r.scanned === "flag").sort(byNumber).map(r => ({ _id: r._id, number: r.number, name: r.name, team: r.team, size: r.size, reason: reasonOf.get(r._id) || "flagged" }));
  const extra  = dmg.filter(x => x._id === undefined);
  const marked = roster.filter(r => r.scanned === "missing" || r.scanned === "short").sort(byNumber);
  const notScanned = roster.filter(r => !r.scanned).sort(byNumber);
  return { passed, failed, extra, missing: { marked, notScanned },
    counts: { total: roster.length, passed: passed.length, failed: failed.length, extra: extra.length, missing: marked.length + notScanned.length, marked: marked.length, notScanned: notScanned.length } };
}
// The summary's labels (kind "binlist"), in print order: the PASSED list (only
// `withPassed`: on a 500-jersey order it is 70 labels by itself, and the box
// lists carry every passed jersey), the UNSCANNED list, the MISSING list, the
// FAILED list, then the count label — so the strip off the printer reads count
// label, FAILED, MISSING, UNSCANNED, PASSED. Unscanned (not scanned yet) and
// Missing (the operator's mark) are two lists (the owner, 25 Nov 2026). Finish
// order prints it without the passed list; the Print menu and the summary
// screen print it on request.
export function summaryJobs(pack, { withPassed = false, station = "", date = "" } = {}) {
  const s = orderSummary(pack), o = pack?.orderNumber;
  const passed    = withPassed ? listLabels(s.passed.map(p => `${who(p.row)}${p.bin ? "  Box " + p.bin : ""}`), { title: "PASSED", orderNumber: o }) : [];
  const unscanned = listLabels(s.missing.notScanned.map(who), { title: "UNSCANNED", orderNumber: o });
  const missing   = listLabels(s.missing.marked.map(who), { title: "MISSING", orderNumber: o });
  const failed    = listLabels([...s.failed, ...s.extra].map(x => `${who(x)}: ${x.reason || "flagged"}`), { title: "FAILED", orderNumber: o });   // the extras' reasons say what they are (Duplicate, Not on the roster, No size tag): no suffix
  return [...passed, ...unscanned, ...missing, ...failed, { summary: true, orderNumber: String(o || ""), station: String(station || ""), date: String(date || ""), counts: s.counts }];
}

// ── The sign-off ticket (the owner, 25 Nov 2026) ───────────────────────────────
// For the order paper at Finish order: the order, the customer and teams, when and where and who, the
// passed garments per size in rack order, PASSED, flagged / missing / of the order's total / boxes, and
// two lines to sign. A past order (`pack.past`: the hub's record) takes the date, station and operator
// it was done with, and the time it was finished; the order on a station, `meta` ({ date, time, station,
// operator }; the caller gives what the station knows right now).
const p2 = n => String(n).padStart(2, "0");
export function signoffLabel(pack, meta = {}) {
  const roster = pack?.roster || [], past = pack?.past || null;
  const sum = orderSummary(pack), n = new Map();
  roster.filter(inBin).forEach(r => { const z = shortSize(String(r.size ?? "").trim()) || "No size", k = z.toLowerCase(), t = n.get(k) || { size: z, passed: 0 }; t.passed++; n.set(k, t); });
  const teams = [...new Map(roster.map(r => String(r.team ?? "").trim()).filter(Boolean).map(t => [teamKey(t), t])).values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  const at = past?.finishedAt ? new Date(past.finishedAt) : null;
  return {
    kind: "signoff", orderNumber: String(pack?.orderNumber || ""), customer: String(pack?.customer || "").trim(), teams,
    date: String(past ? past.date || (at ? `${at.getFullYear()}-${p2(at.getMonth() + 1)}-${p2(at.getDate())}` : "") : meta.date || ""),
    time: String(past ? (at ? `${p2(at.getHours())}:${p2(at.getMinutes())}` : "") : meta.time || ""),
    station: String(past ? past.station || "" : meta.station || ""), operator: String(past ? past.operator || "" : meta.operator || ""),
    bySize: [...n.values()].sort((a, b) => bySize(a.size, b.size)),
    passed: sum.counts.passed, flagged: sum.counts.failed, missing: sum.counts.missing, total: sum.counts.total,
    boxes: packBoxes(pack).filter(b => b.count > 0).length,
  };
}
export const signoffJobs = (pack, meta) => [signoffLabel(pack, meta)];

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
    // A flag never asked "where" (Others, No size tag, Not on the roster, Duplicate, a sorter's)
    // has no garment of its own: it takes the row's style or the order's garment, as the first ticket did
    // (printTicket in App.jsx), so the reprint draws the same garment.
    .map(e => ({ ...flagLabel({ ...e, garment: e.garment || garmentOf(e.match, pack.garment) }, pack.binMap, { orderNumber: pack.orderNumber, station: pack.station, tag: tagOf(e.reason) }), copies: 1 }));   // a reprint from the Print menu is one ticket (the owner, 19 Nov 2026); a new flag prints FLAG_COPIES. flagLabel carries the garment and the spots: a reprint shows the marks
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
    const id = e.match?._id;
    let row = id !== undefined ? roster.find(r => r._id === id) : null;
    // A duplicate flagged from the ALREADY DONE screen carries the PASSED row it was a copy of: the
    // second jersey is in the DAMAGED box with its ticket while the row stays passed, so it counts
    // as a jersey with no row of its own (review, 24 Nov 2026), like a duplicate flagged from a list.
    // The reason alone says so: the row's own state is beside the point (the third check, 24 Nov
    // 2026: a copy was lost from the box when its row was later flagged for damage itself).
    const copy = /^Duplicate\b/.test(e.reason || "");
    if (row && row.scanned !== "flag" && !copy) return;
    if (!row && e.resolution) return;
    if (copy && e.resolution) return;
    const key = row && !copy ? "r" + id : "e" + e.id;
    if (seen.has(key)) return;
    seen.add(key);
    const from = row || e.match || {};
    if (copy) row = null;
    out.push({ _id: row?._id, number: from.number ?? e.detected?.number ?? "", name: from.name ?? e.detected?.name ?? "", team: from.team ?? "", size: from.size ?? "", reason: e.reason || "" });   // _id and size for the order summary and the NOT IN BOX list (24 Nov 2026)
  });
  const num = x => { const n = parseInt(String(x.number).replace(/\D/g, ""), 10); return Number.isFinite(n) ? n : 1e9; };
  return out.sort((a, b) => num(a) - num(b) || String(a.name).localeCompare(String(b.name)));
}
// Its list (kind "binlist") and its own label (kind "binticket").
export function damagedListJobs(pack) { return damagedListLabels(damagedItems(pack), { orderNumber: pack?.orderNumber }); }
// The DAMAGED box's label: printed with the order's first flag, once an order.
export const damagedBoxLabel = pack => ({ bin: "DAMAGED", title: "DAMAGED", label: "Flagged garments", by: "", count: 0, orderNumber: String(pack?.orderNumber || "") });

// One of the hub's order records (GET /api/hub/orders) → a pack. Its box
// names are left as they were recorded: an order from before the boxes had
// two numbers prints the numbers its boxes carry.
export function packFromRecord(rec) {
  const roster = rec?.rows || [];
  return {
    orderNumber: String(rec?.order ?? ""), garment: rec?.garment || "", customer: rec?.customer || "", roster, binMap: rec?.bins || null, closedBins: rec?.closedBins || [], station: rec?.station || "",
    flags: (rec?.flags || []).map(ev => ({
      // `resolution` comes along: without it a past order's DAMAGED list kept the
      // off-roster jerseys the supervisor had already dealt with (code review of
      // 23 Nov 2026; damagedItems leaves a resolved flag with no row out).
      id: ev.id, reason: ev.reason || "", resolution: ev.resolution || "", timestamp: ev.t || "", detected: null,
      // Where the damage was marked (24 Nov 2026): a reprint of a past order's ticket shows the marks.
      ...(ev.garment ? { garment: ev.garment } : {}), ...(Array.isArray(ev.spots) && ev.spots.length ? { spots: ev.spots } : {}),
      match: roster.find(r => r._id === ev.rowId) || { number: ev.number, name: ev.name, size: ev.size, team: ev.team },
    })),
    past: { station: rec?.station || "", date: rec?.date || "", operator: rec?.operator || "", counts: rec?.counts || null, finishedAt: rec?.finishedAt || null },
  };
}
