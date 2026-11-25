// ── Labels for the Zebra ─────────────────────────────────────────────────────
// Two kinds, both ZPL (the Zebra's own language) sent raw to the printer by
// the hub, so no browser print dialog and no driver rendering are involved:
//   • a jersey sticker, printed on every pass when the station has stickers
//     on (off by default, the owner, 17 Nov 2026): the box the jersey goes in and
//     what the order is sorted by (the team or the size), for the packer who
//     stacks the folded jerseys by bin;
//   • a flag ticket, printed on every flag: the jersey (number, name, team,
//     size) in white on a solid black column, so a flagged jersey is never
//     packed, and what is wrong with it on the right. It goes on its own,
//     bigger roll: 2 in wide by 1 in tall (JERSEY_FLAG_LABEL_SIZE), on the
//     flag printer when there is one;
//   • a box label: "BOX 5.1" and what the box holds, printed when the order
//     starts (the set-out screen), when a box is opened after a full one, and
//     on request;
//   • lists, on the 2 x 1 in roll: what is in a box (with the customer's count
//     label), what is in the DAMAGED box, a list of boxes.
// labels.js also runs on the hub (hub-plugin.js builds the ZPL), so it never
// imports config.js.
// The sticker roll is 1 in wide by 0.5 in tall (JERSEY_LABEL_SIZE); every
// layout is in fractions of the label so another roll only needs the setting.
import { binEntries, binFieldOf, binFor, boxParts, bySize, shortSize } from "./roster.js";

// "1x0.5" (inches, width x height) → dots at the printer's resolution.
// `top` is where printing starts: the ZD411 begins its label about 2 mm
// above the sticker's edge, so the first 2 mm are left blank or the top
// line comes out cut in half (seen on the floor, 5 Nov 2026).
export const DEFAULT_LABEL_SIZE = "1x0.5";
export const DEFAULT_FLAG_LABEL_SIZE = "2x1";
export const LABEL_TOP_MM = 2;
export function labelSize(spec = DEFAULT_LABEL_SIZE, dpi = 203) {
  const m = String(spec || "").match(/^\s*([\d.]+)\s*[x×]\s*([\d.]+)\s*$/i);
  const w = m ? parseFloat(m[1]) : 1, h = m ? parseFloat(m[2]) : 0.5;
  return { w: Math.round(w * dpi), h: Math.round(h * dpi), dpi, widthIn: w, heightIn: h, top: Math.round(dpi * LABEL_TOP_MM / 25.4) };
}

// ZPL field data may not contain the control characters ^ and ~.
const safe = s => String(s ?? "").replace(/[\^~]/g, " ");
// How wide a text is in font 0 (the printer's scalable font), in units of the
// font's width setting. Letter by letter: capitals are much wider than digits
// and small letters, and a flat "0.58 a character" let "11-MACDONALD-AXL"
// overflow its box, where the printer wrapped it and printed "XL" over the
// "11" (seen on the floor, 10 Nov 2026). The figures are on the wide side on
// purpose: a line a little small is fine, a wrapped one is not.
const WIDE = "MW", NARROW = "Iijl.,:;'!|", SLIM = "ftr-/() ";
const charUnits = c =>
  WIDE.includes(c) ? 0.98 : c === "m" || c === "w" ? 0.92 : NARROW.includes(c) ? 0.34 : SLIM.includes(c) ? 0.4
  : c >= "A" && c <= "Z" ? 0.72 : c >= "0" && c <= "9" ? 0.63 : 0.6;
export const textUnits = text => Math.max(0.6, [...String(text ?? "")].reduce((t, c) => t + charUnits(c), 0));
// The tallest font that still fits `text` in `width` dots.
const fit = (text, width, maxH) => Math.max(10, Math.min(maxH, Math.floor(width / textUnits(text))));
// One line that can never wrap: no ^FB, so nothing is printed over. A text
// too wide for `width` is first squeezed (narrower letters at the same
// height, down to 70%), and only then made smaller.
const tight = (x, y, maxH, width, text) => {
  const fw = Math.max(8, Math.min(maxH, Math.floor(width / textUnits(text))));
  const fh = Math.max(10, Math.min(maxH, Math.floor(fw / 0.7)));
  return `^FO${x},${y}^A0N,${fh},${fw}^FD${safe(text)}^FS`;
};
// One line of text in a box: ^FB wraps it to `width`, one line, aligned.
// `lines` > 1 wraps onto that many lines; `reverse` prints white on black.
// A one-line text wider than its box would wrap, and the printer prints the
// wrapped piece over the start of the line; so a one-line field whose text
// does not fit at `fh` gets narrower letters (the font's width setting) until
// it does. `textUnits` is declared below; it is only called when a label is built.
const line = (x, y, fh, width, align, text, { lines = 1, reverse = false } = {}) => {
  const fw = lines === 1 ? Math.max(5, Math.min(fh, Math.floor(width / textUnits(text)))) : fh;
  return `^FO${x},${y}^A0N,${fh},${fw}^FB${width},${lines},0,${align}${reverse ? "^FR" : ""}^FD${safe(text)}^FS`;
};

// ── The jersey sticker ───────────────────────────────────────────────────────
// What a passed jersey's sticker says, from its roster row and the order's
// bin map: { bin, by, value, orderNumber }. An order with no bins still says
// the team or the size, so the packer can stack by it.
export function jerseyLabel(row, binMap, { orderNumber = "" } = {}) {
  const bin = binFor(binMap, row);
  let by = binFieldOf(binMap);
  if (!binMap || by === "all") by = String(row?.team ?? "").trim() ? "team" : "size";   // one bin for the whole order: still say the team or the size
  const value = String(row?.[by] ?? "").trim();
  return { bin: bin === null ? "" : bin, by, value: by === "size" ? shortSize(value) : value, orderNumber: String(orderNumber || "") };
}

// 1 x 0.5 in: a BIN column on the left with the number as big as the label
// allows, the sort (TEAM or SIZE) and its value on the right, the order
// number small under it.
export function jerseyLabelZPL(l, size = labelSize()) {
  const { w, h, top = 0 } = size;
  const a    = h - top;                                         // the printable height
  const pad  = Math.round(a * 0.04);
  const tag  = Math.max(12, Math.round(a * 0.16));
  const hasBin = l.bin !== "" && l.bin !== null && l.bin !== undefined;
  const lw   = hasBin ? Math.round(w * 0.36) : 0;              // the BIN column
  const rx   = hasBin ? lw + pad : pad, rw = w - rx - pad;      // the sort column
  const out  = ["^XA", "^CI28", `^PW${w}`, `^LL${h}`, "^LH0,0", "^LT0"];
  if (hasBin) {
    const big = Math.round(a * 0.58);
    out.push(line(0, top + pad, tag, lw, "C", "BOX"));
    out.push(line(0, top + pad + tag + 2, fit(l.bin, lw, big), lw, "C", l.bin));
    out.push(`^FO${lw},${top + pad}^GB1,${a - 2 * pad},1^FS`);     // a hairline between the columns
  }
  const valueH = fit(l.value || "—", rw, Math.round(a * 0.42));
  out.push(line(rx, top + pad, tag, rw, "C", l.by === "size" ? "SIZE" : "TEAM"));
  out.push(line(rx, top + pad + tag + 2, valueH, rw, "C", l.value || "—"));
  if (l.orderNumber) out.push(line(rx, h - tag - pad, fit(`Order ${l.orderNumber}`, rw, tag), rw, "C", `Order ${l.orderNumber}`));
  out.push("^PQ1", "^XZ");
  return out.join("\n");
}

// ── The flag ticket ──────────────────────────────────────────────────────────
// What a flagged jersey's ticket says, from its log entry: the number and
// name (from the roster row when there is one, else what the camera read),
// the reason, the team and size, the order and the station. It also carries
// `tag` (the board's tag for the reason's route, from severityOf in config.js
// — the caller passes it, as config.js needs Vite's env and this file also
// runs on the hub) and the bin, which the printed ticket leaves off (see
// flagLabelZPL). No time: it told the reader nothing (the owner, 17 Nov 2026).
const stationShort = id => String(id || "").replace(/^st-/, "").replace(/^station\s*/i, "St ").trim();
export function flagLabel(entry, binMap, { orderNumber = "", station = "", tag = "DECIDE" } = {}) {
  const row = entry?.match || null, read = entry?.detected || null;
  const bin = row ? binFor(binMap, row) : null;
  return {
    number: String(row?.number ?? read?.number ?? "").trim() || "?",
    name:   String(row?.name ?? read?.name ?? "").trim(),
    tag:    String(tag || "DECIDE"),
    reason: String(entry?.reason || "").replace(/ — found after it passed$/, "").trim(),
    team:   String(row?.team ?? "").trim(),
    size:   shortSize(String(row?.size ?? "").trim()),
    bin:    bin === null ? "" : bin,
    orderNumber: String(orderNumber || ""),
    station: stationShort(station),
  };
}

// 2 x 1 in: the JERSEY on the left, the DAMAGE on the right (the owner, 17 Nov
// 2026). The left column is solid black with everything about the jersey in
// white: the number as big as it fits, then the name, the team and the size
// stacked under it — the black alone says it is flagged, so no FLAG word
// (it took the top of the column and said nothing the black did not). The
// right column says what is wrong, as big as it fits on up to three lines,
// with the order number big under it (six digits, read at arm's length) and
// the station small above that. In fractions of the
// label, so it also comes out (small) on the 1 x 0.5 in sticker roll.
// The 2 x 1 in roll starts printing about half a millimetre below the label's
// top edge, which left a white line above the black column (10 Nov 2026). ^LT
// starts the ticket FLAG_LIFT dots higher, and only the black column uses
// that: it is drawn that much longer, so it covers the label from above its
// top edge to just past its bottom edge, while every text is laid out
// FLAG_LIFT lower and so sits exactly where it did. The printer keeps ^LT
// until told otherwise, so every other label sets ^LT0.
// 4 dots, no more: the printer prints a window exactly one label long, so
// every dot the ticket is lifted is a dot lost at the bottom (6 left a white
// line there). 4 puts the window on the label.
export const FLAG_LIFT = 4;
// Every flag prints this many tickets (the manager, 17 Nov 2026): one goes on
// the jersey, the other stays with whoever deals with it.
export const FLAG_COPIES = 2;
export function flagLabelZPL(l, size = labelSize(DEFAULT_FLAG_LABEL_SIZE)) {
  const { w, h } = size;
  const top   = (size.top || 0) + FLAG_LIFT;                      // the texts: where they were before the lift
  const a     = h - (size.top || 0);
  const pad   = Math.round(a * 0.04);
  const side  = w >= 300 ? Math.round((size.dpi || 203) * 2 / 25.4) : 0;   // the 2 x 1 in roll: the ZD411 cuts 2 mm off the left
  const lw    = Math.round((w - side) * 0.4);                     // the black column: the jersey
  const rx    = side + lw + 2 * pad, rw = w - rx - pad;           // the right column: the damage
  const nameH = Math.max(12, Math.round(a * 0.16));               // the name
  const mid   = Math.max(12, Math.round(a * 0.14));               // team · size on one line
  const mid2  = Math.max(12, Math.round(a * 0.13));               // or each on its own, when the team is long
  const ordH  = Math.max(12, Math.round(a * 0.24));               // the order number: six digits, ~5 mm
  const small = Math.max(10, Math.round(a * 0.1));                // the station
  const out   = ["^XA", "^CI28", `^PW${w}`, `^LL${h + FLAG_LIFT}`, "^LH0,0", `^LT${-FLAG_LIFT}`];
  // The black column: a box filled by a border as thick as the box is wide.
  // It runs off the top and the left of the label (the text in it keeps
  // clear of the 2 mm the printer cuts), so no white edge is left around it.
  out.push(`^FO0,0^GB${side + lw},${h + FLAG_LIFT + 4},${side + lw}^FS`);   // 4 dots past the bottom edge too
  // The jersey, in white on the black: team · size (one line when it fits
  // at full width, else the team over the size) and the name stack up from
  // the bottom, each as wide as the column allows; the number fills what is
  // left above them, centred, as big as it fits.
  const bottom = top + a - pad;
  let ly = bottom;
  // A long name or team is squeezed (narrower letters, `line` does that) at
  // not less than 85% of its line's height before it is made smaller: a
  // condensed VANDERMEULEN reads, a tiny one does not.
  const white = (y, fh, text) => out.push(line(side, y, Math.max(fit(text, lw - 4, fh), Math.round(fh * 0.85)), lw, "C", text, { reverse: true }));
  const both = [l.team, l.size].filter(Boolean).join(" · ");
  if (both && (!l.team || !l.size || textUnits(both) * mid <= lw - 4)) { ly -= mid; white(ly, mid, both); }
  else if (both) { ly -= mid2; white(ly, mid2, l.size); ly -= mid2 + 1; white(ly, mid2, l.team); }
  if (l.name) { ly -= nameH + 1; white(ly, nameH, l.name); }
  const numRoom = ly - 2 - (top + pad);
  const big     = fit(l.number, lw - 4, Math.min(Math.round(a * 0.5), numRoom));
  white(top + pad + Math.max(0, Math.floor((numRoom - big) / 2)), big, l.number);
  // The right column says WHAT IS WRONG, as big as it fits on up to three
  // lines, and under it the order number, big, and the station. No route word
  // (STITCHER, REMAKE) and no box: the ticket is for whoever picks the
  // jersey out of the DAMAGED box, and the problem is what they need (the
  // manager, 17 Nov 2026).
  const y = top + pad;
  let fy = bottom;
  if (l.orderNumber) {   // Ord 264247: squeezed to the column at 85% of its height or more before it is made smaller
    const t = `Ord ${l.orderNumber}`;
    fy -= ordH; out.push(line(rx, fy, Math.max(fit(t, rw, ordH), Math.round(ordH * 0.85)), rw, "C", t));
  }
  if (l.station) { fy -= small + 1; out.push(line(rx, fy, fit(l.station, rw, small), rw, "C", l.station)); }
  const room   = fy - 4 - y;
  const reason = l.reason || "Flagged";
  // The biggest letters at which the words fit in at most three lines. The
  // printer wraps at spaces, so the lines are counted the way it wraps: word
  // by word, a line holding about rw / (0.6 fh) letters. Counting letters
  // alone let "Wrong name, number or team" through at a size where it needs a
  // fourth line, which the printer prints over the third. A reason that still
  // does not fit at the smallest size (a long typed one) is cut with "…".
  const linesFor = (text, fh) => {
    const per = Math.max(1, Math.floor(rw / (0.6 * fh)));
    let n = 1, used = 0;
    for (const word of text.split(/\s+/).filter(Boolean)) {
      if (word.length > per) return 99;                           // a word longer than a line would be cut
      if (used && used + 1 + word.length > per) { n++; used = word.length; } else used += (used ? 1 : 0) + word.length;
    }
    return n;
  };
  let text = reason, fh = Math.max(12, Math.min(Math.round(a * 0.34), room));
  const fits = h => linesFor(text, h) <= Math.max(1, Math.min(3, Math.floor(room / h)));
  while (fh > 12 && !fits(fh)) fh--;
  while (!fits(fh) && text.length > 8) text = text.slice(0, -2).trimEnd().replace(/…$/, "") + "…";
  const used = Math.min(linesFor(text, fh), 3);
  out.push(line(rx, y + Math.max(0, Math.floor((room - used * fh) / 2)), fh, rw, "C", text, { lines: Math.max(1, Math.min(3, Math.floor(room / fh))) }));
  out.push(`^PQ${Math.max(1, Number(l.copies) || FLAG_COPIES)}`, "^XZ");
  return out.join("\n");
}

// ── Box labels ───────────────────────────────────────────────────────────────
// One entry per box: { bin, label (the team or size), by, count, orderNumber }.
// `boxes`: { [open box]: how many boxes that team or size is expected to
// need from here } (the station works it out from the box model): a team on
// box 5.1 expected to fill three gives BOX 5.1, 5.2 and 5.3, so the operator
// can label the boxes before scanning. Without it, one label per open box.
export function binLabels(roster, binMap, { orderNumber = "", boxes = null } = {}) {
  const by = binFieldOf(binMap);
  const counts = {};
  roster.forEach(r => { const b = binFor(binMap, r); if (b !== null) counts[b] = (counts[b] || 0) + 1; });
  return binEntries(roster, binMap).flatMap(({ label, bin }) => {
    const [g, s] = boxParts(bin), n = s ? Math.max(1, Math.min(60, Math.round(Number(boxes?.[bin]) || 1))) : 1;
    return Array.from({ length: n }, (_, i) => ({ bin: s ? `${g}.${s + i}` : bin, label, by, count: counts[bin] || 0, orderNumber: String(orderNumber || "") }));
  });
}

// "BOX 5.1" (or its `title`, "DAMAGED") as big as the label allows (half its
// height), the team under it (by size the other way round), a small footer with the order number and
// "by team" / "by size" (just the order number on a small label). No jersey
// count: nobody knows how many will go in before the box is full. It is read
// from across the table, so the box and what it holds take the room and the
// footer gets what is left. Box labels go on the 2 x 1 in roll (kind
// "binticket"): the ones printed when the order starts and the one for a box
// opened when another was full are the same label. On that roll the text keeps 2 mm clear
// of the left and right edges, where the ZD411 cuts.
export function binLabelZPL(l, size = labelSize()) {
  const { w: full, h, top = 0, dpi = 203 } = size;
  const wide  = full >= 300;
  const side  = wide ? Math.round(dpi * 2 / 25.4) : 0;
  const w     = full - 2 * side;
  const a     = h - top;                                          // the printable height
  const pad   = Math.round(a * 0.04);
  const small = Math.max(12, Math.round(a * 0.12));              // the footer
  const big   = Math.round(a * 0.5);                              // "BOX 5.1" (by size: the size)
  const mid   = Math.round(a * 0.27);                             // the team (by size: "BOX 5.1")
  const footer = (wide
    ? [l.orderNumber ? `Order ${l.orderNumber}` : "", l.by === "size" ? "by size" : l.by === "team" ? "by team" : ""]
    : [l.orderNumber ? `Order ${l.orderNumber}` : ""]).filter(Boolean).join("   ");
  // A by-size box is found by its size: the size takes the big line and
  // "BOX 6.1" the one under it (the owner, 25 Nov 2026). By team, and the
  // DAMAGED box, the box first.
  const box = l.title || `BOX ${l.bin}`;
  const [head, sub] = l.by === "size" && !l.title ? [l.label, box] : [box, l.label];
  return [
    "^XA", "^CI28", `^PW${full}`, `^LL${h}`, "^LH0,0", "^LT0",
    line(side, top + pad, fit(head, w, big), w, "C", head),
    line(side, top + pad + big + Math.round(a * 0.01), fit(sub, w, mid), w, "C", sub),
    ...(footer ? [line(side, h - small - pad, fit(footer, w, small), w, "C", footer)] : []),
    "^PQ1", "^XZ",
  ].join("\n");
}

// ── The list of what is in a box ─────────────────────────────────────────────
// Printed when a box is closed (it is full, or the order is finished), on the
// 2 x 1 in roll, for the taped box: packing and the customer read it.
//   • one count label, the customer's: the team or size, how many pieces are
//     in it and of each size, the order number (binCountZPL below);
//   • then the jerseys, as "23-JAMES-AXL" (number, name, size), fourteen to a
//     label in two columns of seven, read down the left column and then down
//     the right, in jersey-number order. These labels have no header at all:
//     the whole label is rows (owner, 12 Nov 2026). 24 jerseys are the count
//     label and two labels of rows.
// They are returned in the order they are PRINTED: the last page of rows
// first and the count label last, so the strip that comes out of the printer
// reads count label, page 1, page 2 from the end the operator tears it at.
// The rows start 2 mm in from the left edge: the ZD411 cut that much off the
// left of the 2 x 1 in roll (seen on the floor, 10 Nov 2026).
export const BIN_LIST_PER_LABEL = 14;
// A list in which no row has a name is only numbers and sizes ("23-AXL"): short, so three
// columns of seven fit a label, 21 a label (the owner, 25 Nov 2026: a 15-garment numbers-only
// box was two labels).
export const BIN_LIST_PER_LABEL_NUMBERS = 21;
const BIN_LIST_ROWS = 7;
export const BIN_LIST_LEFT_MM = 2;
const squash = s => String(s ?? "").trim().replace(/[\s-]+/g, "");
export function binListItem(row) {
  return [String(row?.number ?? "").trim(), String(row?.name ?? "").trim(), squash(shortSize(row?.size))].filter(Boolean).join("-");
}
// Jersey-number order: 2 before 10; a number that is not a number goes last;
// the same number by name.
const byNumber = (a, b) => {
  const x = parseInt(a.number, 10), y = parseInt(b.number, 10);
  if (Number.isNaN(x) !== Number.isNaN(y)) return Number.isNaN(x) ? 1 : -1;
  return (Number.isNaN(x) ? 0 : x - y) || String(a.number ?? "").localeCompare(String(b.number ?? "")) || String(a.name ?? "").localeCompare(String(b.name ?? ""));
};
// rows in the box → the labels in print order: the pages of rows, last page
// first ({ bin, label, orderNumber, page, pages, count, items }), then the
// count label ({ title: true, bin, label, orderNumber, count, pages }).
// `of`: how many jerseys the team (or size) has in all; the count label then reads "36/50 pcs".
export function binListLabels(rows, { bin, label = "", orderNumber = "", by = "team", of = 0 } = {}) {
  const items = [...(rows || [])].sort(byNumber).map(binListItem);
  if (!items.length) return [];
  const per = (rows || []).some(r => String(r?.name ?? "").trim()) ? BIN_LIST_PER_LABEL : BIN_LIST_PER_LABEL_NUMBERS;
  const cols = per / BIN_LIST_ROWS;                                 // no name on any row: three columns of seven
  const pages = Math.ceil(items.length / per);
  // What the customer checks the box against: how many of each size (or, in
  // an order sorted by size, of each team). "Y-M 4   A-L 12   A-XL 8".
  const other = by === "size" ? "team" : "size", tally = new Map();
  (rows || []).forEach(r => {   // "Navy" and "navy " are one team, as they are one box: counted together under the first spelling met
    const raw = String(r?.[other] ?? "").trim(), shown = other === "size" ? shortSize(raw) : raw; if (!shown) return;   // sizes in the short form: "Ladies-S" and "L-S" are one count
    const k = shown.toLowerCase(), t = tally.get(k) || { shown, n: 0 };
    t.n++; tally.set(k, t);
  });
  const mix = [...tally.values()].sort((a, b) => (other === "size" ? bySize(a.shown, b.shown) : a.shown.localeCompare(b.shown, undefined, { sensitivity: "base" }))).map(t => `${t.shown} ${t.n}`).join("   ");
  const base  = { bin, label: String(label || ""), orderNumber: String(orderNumber || ""), pages, count: items.length, by, mix, of: Number(of) || 0, cols };
  const lists = Array.from({ length: pages }, (_, i) => ({ ...base, page: i + 1, items: items.slice(i * per, (i + 1) * per) }));
  return [...lists.reverse(), { ...base, title: true, page: 0, items: [] }];
}

// The count label is the CUSTOMER'S label: it goes on the outside of the taped
// box. The box number is not what it leads with (5.1 is the floor's own name
// for the box and means nothing to them; the manager, 17 Nov 2026): the team
// (or the size, in an order sorted by size) as big as it fits, how many
// pieces, how many of each size, and the order number. An order that is not
// sorted leads with the order number. The box number is only small, in the
// bottom-left corner, for the packer (see below); the box also has its
// BOX 5.1 label inside.
function binCountZPL(l, size) {
  const { w: full, h, top = 0, dpi = 203 } = size;
  const side  = full >= 300 ? Math.round(dpi * 2 / 25.4) : 0;
  const w     = full - 2 * side;
  const a     = h - top;
  const pad   = Math.round(a * 0.03);
  const big   = Math.round(a * 0.38), mid = Math.round(a * 0.24), mixH = Math.round(a * 0.15), small = Math.max(12, Math.round(a * 0.12));
  const order = l.orderNumber ? `Order ${l.orderNumber}` : "";
  const named = l.by !== "all" && !!l.label && !/^whole order$/i.test(l.label);
  const head  = named ? l.label : order || "Order";
  const pcs   = l.of > 0 ? `${l.count}/${l.of} pcs` : `${l.count} ${l.count === 1 ? "pc" : "pcs"}`;   // 36/50: this box's share of the team's jerseys (the owner, 19 Nov 2026)
  // The box number, small in the bottom-left corner (the owner, 19 Nov 2026):
  // the customer does not need it, the packer finds the box by it. The order
  // line at the bottom keeps clear of it on both sides, so it stays centred.
  const boxTxt = l.bin ? String(l.bin) : "", boxH = Math.max(12, Math.round(a * 0.1)), boxW = boxTxt ? Math.ceil(textUnits(boxTxt) * boxH) + 6 : 0;
  const fw = w - 2 * boxW;
  const out = ["^XA", "^CI28", `^PW${full}`, `^LL${h}`, "^LH0,0", "^LT0",
    line(side, top + pad, fit(head, w, big), w, "C", head),
    line(side, top + pad + big + 2, fit(pcs, w, mid), w, "C", pcs)];
  if (l.mix) out.push(line(side, top + pad + big + mid + 5, mixH, w, "C", l.mix));
  if (named && order) out.push(line(side + boxW, h - small - pad, fit(order, fw, small), fw, "C", order));
  if (boxTxt) out.push(line(side, h - boxH - pad, boxH, boxW, "L", boxTxt));
  out.push("^PQ1", "^XZ");
  return out.join("\n");
}

// ── What is in the DAMAGED box ───────────────────────────────────────────────
// Every flagged jersey goes in the DAMAGED box with its ticket. Its list is
// printed when the inspector asks (the box is full, the shift ends) and at
// Finish order: the order number and the count in a header, then a line a
// jersey — number, name, team, and why it was flagged — seven to a 2 x 1 in
// label, in one column, as the reason needs the width.
// `entries`: [{ number, name, team, reason }]. → the labels in print order,
// the last page first, like a box list.
export const DAMAGED_PER_LABEL = 7;
export function damagedListLabels(entries, { orderNumber = "" } = {}) {
  const items = (entries || []).map(e => ({
    who: [String(e.number ?? "").trim() ? `#${String(e.number).trim()}` : "", String(e.name ?? "").trim(), String(e.team ?? "").trim()].filter(Boolean).join(" ") || "Garment",
    reason: String(e.reason || "").replace(/ — found after it passed$/, "").trim() || "Flagged",
  }));
  if (!items.length) return [];
  const pages = Math.ceil(items.length / DAMAGED_PER_LABEL);
  return Array.from({ length: pages }, (_, i) => ({
    damaged: true, bin: "DAMAGED", orderNumber: String(orderNumber || ""), page: i + 1, pages, count: items.length,
    items: items.slice(i * DAMAGED_PER_LABEL, (i + 1) * DAMAGED_PER_LABEL),
  })).reverse();
}
// Any list of lines under a title, seven to a 2 x 1 in label, drawn like the
// DAMAGED list: the FAILED, UNSCANNED, MISSING and PASSED lists of the order summary and a
// box's NOT IN BOX list (the owner, 24 Nov 2026). → the labels in print order,
// the last page first.
export function listLabels(lines, { title = "LIST", orderNumber = "" } = {}) {
  const items = (lines || []).map(t => ({ text: String(t) }));
  if (!items.length) return [];
  const pages = Math.ceil(items.length / DAMAGED_PER_LABEL);
  return Array.from({ length: pages }, (_, i) => ({
    damaged: true, head: String(title), bin: String(title), orderNumber: String(orderNumber || ""), page: i + 1, pages, count: items.length,
    items: items.slice(i * DAMAGED_PER_LABEL, (i + 1) * DAMAGED_PER_LABEL),
  })).reverse();
}

// The order summary's count label (the owner, 24 Nov 2026): the order number
// big, SUMMARY and how many jerseys, then passed · failed · unscanned · missing,
// the station and the day small at the bottom. It prints last, so the strip off
// the printer reads it first, then FAILED, UNSCANNED, MISSING and (on request) PASSED.
// `l`: { summary: true, orderNumber, station, date, counts: { total, passed, failed, notScanned, marked } }.
function summaryCountZPL(l, size) {
  const { w: full, h, top = 0, dpi = 203 } = size;
  const side  = full >= 300 ? Math.round(dpi * 2 / 25.4) : 0;
  const w     = full - 2 * side;
  const a     = h - top;
  const pad   = Math.round(a * 0.03);
  const big   = Math.round(a * 0.3), mid = Math.round(a * 0.17), small = Math.max(12, Math.round(a * 0.12));
  const c     = l.counts || {};
  const head  = l.orderNumber ? `Order ${l.orderNumber}` : "Order";
  const what  = `SUMMARY   ${c.total ?? 0} ${c.total === 1 ? "garment" : "garments"}${c.extra ? `   +${c.extra} extra` : ""}`;   // extra: flags with no roster row (not on the roster, a duplicate), apart from the order's count; on this line so the tally keeps its size (review, 24 Nov 2026)
  // Unscanned (not scanned yet) and Missing (the operator's mark) are two counts (the owner, 25 Nov 2026);
  // a station page loaded before that sends only `missing`, both together, and keeps its old word.
  const left  = c.notScanned === undefined ? [`${c.missing ?? 0} missing`] : [`${c.notScanned} unscanned`, ...(c.marked ? [`${c.marked} missing`] : [])];
  const tally = [`${c.passed ?? 0} passed`, `${c.failed ?? 0} failed`, ...left].join("   ");
  const foot  = [l.station, l.date].filter(Boolean).join("   ");
  const out = ["^XA", "^CI28", `^PW${full}`, `^LL${h}`, "^LH0,0", "^LT0",
    line(side, top + pad, fit(head, w, big), w, "C", head),
    line(side, top + pad + big + 4, fit(what, w, mid), w, "C", what),
    line(side, top + pad + big + mid + 8, fit(tally, w, mid), w, "C", tally)];
  if (foot) out.push(line(side, h - small - pad, fit(foot, w, small), w, "C", foot));
  out.push("^PQ1", "^XZ");
  return out.join("\n");
}

function damagedListZPL(l, size) {
  const { w, h, top = 0 } = size;
  const a    = h - top;
  const pad  = Math.max(3, Math.round(a * 0.03));
  const head = Math.max(12, Math.round(a * 0.12));
  const x0   = Math.round((size.dpi || 203) * BIN_LIST_LEFT_MM / 25.4) + pad;
  const fullW = w - x0 - pad;
  // `unit: "box"` comes only from a station page loaded before 25 Nov 2026 and not reloaded since (its
  // Done / Not done boxes lists, removed with the Packing screen): the hub builds the ZPL it sends.
  const unit  = l.unit === "box" ? (l.count === 1 ? "box" : "boxes") : (l.count === 1 ? "pc" : "pcs");
  const right = `${l.count} ${unit}${l.pages > 1 ? `  ${l.page}/${l.pages}` : ""}`;
  const rw = Math.round(fullW * 0.3), lw = fullW - rw;
  // The header never goes below about two thirds of its height (14 dots on the
  // 2 x 1 in roll): a long title ("NOT IN BOX 1.1 Thunder Bay Lakehead Lightning
  // U13 AA") is cut with "…" to what fits at that size instead (review, 24 Nov 2026).
  // tight() squeezes the letters to 70% width before it makes them smaller, so a
  // text whose natural width is within lw / 0.7 still prints at full height
  // (the third check, 24 Nov 2026: tested against lw * 0.7, titles that fit were cut).
  let left = `${l.head || "DAMAGED"}${l.orderNumber ? "  Order " + l.orderNumber : ""}`;
  const floor = Math.max(12, Math.round(head * 0.65));
  // The height tight() will print `t` at, step for step (the width setting is floored first; the
  // fourth check, 24 Nov 2026: `fit(left, lw / 0.7, head)` skipped that and most cut titles came out at 12).
  const heightOf = t => Math.max(10, Math.min(head, Math.floor(Math.max(8, Math.min(head, Math.floor(lw / textUnits(t)))) / 0.7)));
  while (left.length > 8 && heightOf(left) < floor) left = left.replace(/…$/, "").slice(0, -1).trimEnd() + "…";
  const y0 = top + pad + head + 5, rowH = Math.floor((h - pad - y0) / DAMAGED_PER_LABEL);
  return ["^XA", "^CI28", `^PW${w}`, `^LL${h}`, "^LH0,0", "^LT0",
    tight(x0, top + pad, head, lw, left),
    line(x0 + lw, top + pad, fit(right, rw, head), rw, "R", right),
    `^FO${x0},${top + pad + head + 1}^GB${fullW},1,1^FS`,
    ...(l.items || []).slice(0, DAMAGED_PER_LABEL).map((it, i) => tight(x0, y0 + i * rowH, Math.max(10, rowH - 3), fullW, it.text ?? `${it.who}: ${it.reason}`)),
    "^PQ1", "^XZ"].join("\n");
}

// One label of a list, as ZPL: a DAMAGED or boxes list page, the count label
// (`title`), or a page of a box list's rows in two columns.
export function binListZPL(l, size = labelSize(DEFAULT_FLAG_LABEL_SIZE)) {
  if (l.damaged) return damagedListZPL(l, size);
  if (l.summary) return summaryCountZPL(l, size);
  if (l.title) return binCountZPL(l, size);
  const { w, h, top = 0 } = size;
  const a    = h - top;                                           // the printable height
  const pad  = Math.max(3, Math.round(a * 0.03));
  const cols = l.cols === 3 ? 3 : 2;                              // three columns when no row has a name
  const rows = BIN_LIST_ROWS;
  const y0   = top + pad;
  const rowH = Math.floor((h - pad - y0) / rows);
  const x0   = Math.round((size.dpi || 203) * BIN_LIST_LEFT_MM / 25.4) + pad;   // where the rows start
  const colW = Math.floor((w - x0 - cols * pad) / cols);
  const out = ["^XA", "^CI28", `^PW${w}`, `^LL${h}`, "^LH0,0", "^LT0"];
  (l.items || []).slice(0, rows * cols).forEach((text, i) => {
    const col = Math.floor(i / rows), row = i % rows;            // down the left column, then down the right
    out.push(tight(x0 + col * (colW + pad), y0 + row * rowH, Math.max(10, rowH - 3), colW, text));
  });
  out.push("^PQ1", "^XZ");
  return out.join("\n");
}

// Every label of one kind, back to back. `kind`: "bin" (default), "jersey",
// "flag", "binlist" (what is in a box, the DAMAGED list, a list of boxes) or
// "binticket" (a box label on the 2 x 1 in roll).
export function labelsZPL(labels, size = labelSize(), kind = "bin") {
  const one = kind === "jersey" ? jerseyLabelZPL : kind === "flag" ? flagLabelZPL : kind === "binlist" ? binListZPL : binLabelZPL;
  return labels.map(l => one(l, size)).join("\n") + "\n";
}
