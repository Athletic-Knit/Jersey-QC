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
//
// The tall rolls (2 x 3 in, 2 x 4 in; the owner, 23 Nov 2026) replace the
// 2 x 1 in roll on the ticket printer. On them the flag ticket prints today's
// 2 x 1 in ticket in its top inch and, under it, the garment from the front
// and the back with the damage marked (garments.js); box labels and the count
// label keep today's look at the top; the lists put several of today's pages
// on one label (repageLists). On the 2 x 1 in and sticker rolls every label
// is exactly as before.
import { binEntries, binFieldOf, binFor, boxParts, bySize, shortSize } from "./roster.js";
import { GARMENTS, MAX_SPOTS, SIDES, garment as garmentShape, sideLabel } from "./garments.js";
import { packListZPL, packListRows, boxFaceZPL, signoffZPL } from "./packlabels.js";

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
// The spots of an entry, as the ticket may print them: at most MAX_SPOTS,
// each { side: "front" | "back", x, y } with x and y in 0–1. Anything else
// (from an old session or a hub body) is left out.
const inUnit = v => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
export function cleanSpots(spots) {
  return (Array.isArray(spots) ? spots : [])
    .filter(s => s && SIDES.includes(s.side) && inUnit(s.x) && inUnit(s.y))
    .slice(0, MAX_SPOTS).map(({ side, x, y }) => ({ side, x, y }));
}
export function flagLabel(entry, binMap, { orderNumber = "", station = "", tag = "DECIDE" } = {}) {
  const row = entry?.match || null, read = entry?.detected || null;
  const bin = row ? binFor(binMap, row) : null;
  const kind = entry?.garment;
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
    garment: typeof kind === "string" && Object.hasOwn(GARMENTS, kind) ? kind : "",   // "" draws the hockey jersey
    spots: cleanSpots(entry?.spots),
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
// A tall roll: 2.5 in or more, at least 2 in wide. Its ticket draws today's
// layout in a band one inch tall at the top, and the garment under it.
export const TALL_TICKET_IN = 2.5;
// In dots, like pagesPerLabel, so the two never disagree about a roll.
const dpiOf = size => Number(size?.dpi) || 203;
export const isTallTicket = size => (Number(size?.h) || 0) >= Math.round(TALL_TICKET_IN * dpiOf(size)) && (Number(size?.w) || 0) >= Math.round(2 * dpiOf(size));
export function flagLabelZPL(l, size = labelSize(DEFAULT_FLAG_LABEL_SIZE)) {
  const { w, h } = size;
  const tall  = isTallTicket(size);
  const band  = tall ? Math.min(h, size.dpi || 203) : h;         // what today's ticket fills: the whole label, or the top inch of a tall one
  const top   = (size.top || 0) + FLAG_LIFT;                      // the texts: where they were before the lift
  const a     = band - (size.top || 0);
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
  out.push(`^FO0,0^GB${side + lw},${band + FLAG_LIFT + 4},${side + lw}^FS`);   // 4 dots past the bottom edge (of the band) too
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
  if (tall) out.push(...garmentZPL(l, size));
  out.push(`^PQ${Math.max(1, Number(l.copies) || FLAG_COPIES)}`, "^XZ");
  return out.join("\n");
}

// ── Where the damage is: the garment under the ticket ───────────────────────
// Everything below is in the ticket's own frame, which ^LT lifts FLAG_LIFT
// dots: the band (today's ticket) ends at `band + FLAG_LIFT`. Nothing is drawn
// within 2 mm of the left edge (the ZD411 cuts it), nor of the right edge and
// the bottom, so the whole drawing is on the label.
const OUTLINE_DOTS = 3, DETAIL_DOTS = 2;
// Where the FRONT and the BACK go on a tall ticket: { rule, margin, across,
// panels: { front, back } }, each panel { x, y, w, h, cap } (its caption
// `cap` dots tall at the top) with the drawing's box { dx, dy, dw, dh } in it.
// A wide garment (hockey, a tee, a hoodie) is stacked, a tall one (pants,
// socks, a tank) side by side: whichever draws it bigger. Exported for the
// tests and the preview.
export function flagPanels(kind, size) {
  const { w, h } = size, dpi = size.dpi || 203;
  const band = Math.min(h, dpi), m = Math.round(dpi * 2 / 25.4);
  const g = garmentShape(kind), { aspect } = g;
  // The outline's own box in 0–1: a pair of pants or a sock does not fill its
  // garment box from side to side, and is scaled by what it really covers.
  const all = SIDES.flatMap(side => g.outlines[side]);            // both views, so they draw at one scale
  const xs = all.map(p => p[0]), ys = all.map(p => p[1]);
  const bx0 = Math.min(...xs), bx1 = Math.max(...xs), by0 = Math.min(...ys), by1 = Math.max(...ys);
  const shape = aspect * (bx1 - bx0) / Math.max(0.01, by1 - by0);   // the outline's width over its height
  const rule = band + FLAG_LIFT + 8;                              // under the black column, which ends at band + FLAG_LIFT + 4
  const x0 = m, x1 = w - m, y0 = rule + 2 + 8, y1 = h - m;
  const W = x1 - x0, H = y1 - y0, gap = Math.round(dpi * 0.05);
  const cap = Math.max(14, Math.round(dpi * 0.1)), capGap = 4;
  const fitIn = (pw, ph) => {                                     // the biggest drawing in one panel
    const rw = pw - OUTLINE_DOTS, rh = ph - cap - capGap - OUTLINE_DOTS;
    const sh = Math.max(0, Math.min(rh, rw / shape));
    return { sw: sh * shape, sh, rw, rh };
  };
  const stacked = fitIn(W, Math.floor((H - gap) / 2)), beside = fitIn(Math.floor((W - gap) / 2), H);
  const across = beside.sh > stacked.sh;
  const pw = across ? Math.floor((W - gap) / 2) : W, ph = across ? H : Math.floor((H - gap) / 2);
  const { sw, sh, rw, rh } = across ? beside : stacked;
  // The garment's whole 0–1 box in dots (dx, dy, dw, dh), placed so that the
  // outline itself is centred across its panel; side by side it sits right
  // under its caption, stacked it is centred down its panel too. A point
  // [x, y] of the garment is at [dx + x·dw, dy + y·dh], spots included.
  const dh = sh / Math.max(0.01, by1 - by0), dw = dh * aspect;
  const panel = i => {
    const x = x0 + (across ? i * (pw + gap) : 0), y = y0 + (across ? 0 : i * (ph + gap));
    const top = y + cap + capGap + (across ? 0 : (rh - sh) / 2);
    return { x, y, w: pw, h: ph, cap, capGap,
      dx: Math.round(x + (rw - sw) / 2 - bx0 * dw), dy: Math.round(top - by0 * dh), dw: Math.floor(dw), dh: Math.floor(dh) };
  };
  return { rule, margin: m, across, panels: { front: panel(0), back: panel(1) } };
}

// The garment is sent as ONE picture a side (^GFA), drawn here on the
// printer's own dot grid from the drawing's curves: a curve sent as many short
// ^GB / ^GD lines printed as stairs, each piece rounded to whole dots on its
// own (the owner's test ticket, 26 Nov 2026). Lines are drawn with a round pen
// (`width` dots across): every dot within half the width of a segment is black.
function penLine(bits, w, h, [xa, ya], [xb, yb], width) {
  const r = width / 2, r2 = r * r;
  const x0 = Math.max(0, Math.floor(Math.min(xa, xb) - r)), x1 = Math.min(w - 1, Math.ceil(Math.max(xa, xb) + r));
  const y0 = Math.max(0, Math.floor(Math.min(ya, yb) - r)), y1 = Math.min(h - 1, Math.ceil(Math.max(ya, yb) + r));
  const dx = xb - xa, dy = yb - ya, len2 = dx * dx + dy * dy || 1;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const px = x + 0.5, py = y + 0.5;                                // the dot's centre
    const t = Math.max(0, Math.min(1, ((px - xa) * dx + (py - ya) * dy) / len2));
    const ex = px - xa - t * dx, ey = py - ya - t * dy;
    if (ex * ex + ey * ey <= r2) bits[y * w + x] = 1;
  }
}
// Zebra's ASCII compression of ^GFA hex: a run of one hex digit as a count
// (G–Y = 1–19, g–z = 20–400) then the digit; "," ends a row of white, ":"
// repeats the row above. A label of lines is mostly white, so it stays small.
function runCode(n) {
  let out = "";
  while (n > 400) { out += "z"; n -= 400; }
  if (n >= 20) { out += String.fromCharCode(0x66 + Math.floor(n / 20)); n %= 20; }   // g = 20 … z = 400
  if (n > 0) out += String.fromCharCode(0x46 + n);                                     // G = 1 … Y = 19
  return out;
}
function gfaRow(hex) {
  const end = hex.replace(/0+$/, "");
  if (!end) return ",";
  let out = "";
  for (let i = 0; i < end.length;) {
    let j = i; while (j < end.length && end[j] === end[i]) j++;
    const n = j - i;
    out += (n > 1 ? runCode(n) : "") + end[i];
    i = j;
  }
  return end.length < hex.length ? out + "," : out;
}
// A bitmap (1 = black) of w × h dots as ^FO…^GFA…^FS at x, y.
export function bitmapZPL(x, y, bits, w, h) {
  const bpr = Math.ceil(w / 8), rows = [];
  let prev = null;
  for (let r = 0; r < h; r++) {
    let hex = "";
    for (let b = 0; b < bpr; b++) {
      let v = 0;
      for (let k = 0; k < 8; k++) { const c = b * 8 + k; if (c < w && bits[r * w + c]) v |= 0x80 >> k; }
      hex += v.toString(16).toUpperCase().padStart(2, "0");
    }
    rows.push(hex === prev ? ":" : gfaRow(hex));
    prev = hex;
  }
  return `^FO${x},${y}^GFA,${bpr * h},${bpr * h},${bpr},${rows.join("")}^FS`;
}
// One side of the garment as a picture: its outline (closed) and its lines,
// in the panel's frame (`at` turns a 0–1 point into label dots).
function garmentBitmap(g, side, at, p) {
  const x0 = p.x, y0 = p.y + p.cap + p.capGap, w = p.w, h = p.y + p.h - y0;
  if (w <= 0 || h <= 0) return "";
  const bits = new Uint8Array(w * h);
  const loc = pt => { const [x, y] = at(pt); return [x - x0, y - y0]; };
  const o = g.outlines[side].map(loc);
  o.forEach((pt, i) => penLine(bits, w, h, pt, o[(i + 1) % o.length], OUTLINE_DOTS));
  for (const poly of g.detail[side] || []) {
    const q = poly.map(loc);
    for (let i = 1; i < q.length; i++) penLine(bits, w, h, q[i - 1], q[i], DETAIL_DOTS);
  }
  return bitmapZPL(x0, y0, bits, w, h);
}
// The garment, FRONT and BACK, with the spots: the lines of a tall ticket under its band.
function garmentZPL(l, size) {
  const dpi = size.dpi || 203;
  const kind = l.garment && Object.hasOwn(GARMENTS, l.garment) ? l.garment : "";
  const g = garmentShape(kind);
  const { rule, margin: m, panels } = flagPanels(kind, size);
  const spots = cleanSpots(l.spots);
  const out = [`^FO${m},${rule}^GB${size.w - 2 * m},2,2^FS`];   // a thin rule under the ticket
  const dot = Math.max(20, Math.round(dpi * 0.13)), ring = dot + 12, num = Math.round(dot * 0.78);
  SIDES.forEach(side => {
    const p = panels[side];
    const at = ([x, y]) => [Math.round(p.dx + x * p.dw), Math.round(p.dy + y * p.dh)];
    const atF = ([x, y]) => [p.dx + x * p.dw, p.dy + y * p.dh];       // the drawing: not rounded, the pen works between dots
    const cap = sideLabel(kind, side).toUpperCase();
    if (side === "front") out.push(tight(p.x, p.y, p.cap, p.w, `${cap} · ${g.label}`));
    else {   // with nothing marked, the BACK caption says so: every tall ticket looks the same
      const lw = spots.length ? p.w : Math.round(p.w * 0.4);
      out.push(tight(p.x, p.y, p.cap, lw, cap));
      if (!spots.length) out.push(line(p.x + lw, p.y, p.cap, p.w - lw, "R", "Not marked"));
    }
    out.push(garmentBitmap(g, side, atF, p));
    // The spots of this side, numbered as they were marked (1–3 over both
    // sides, as on the station): a filled dot with its number in white, and a
    // ring round it so it stands out from the lines under it. Kept inside
    // the panel.
    spots.forEach((s, i) => {
      if (s.side !== side) return;
      const r = Math.ceil(ring / 2), [sx, sy] = at([s.x, s.y]);
      // Kept in its panel, under the caption (a spot on a collar would cover the words).
      const cx = Math.max(p.x + r, Math.min(p.x + p.w - r, sx)), cy = Math.max(p.y + p.cap + p.capGap + r, Math.min(p.y + p.h - r, sy));
      const d0 = Math.round(dot / 2);
      out.push(`^FO${cx - r},${cy - r}^GC${ring},2,B^FS`);
      out.push(`^FO${cx - d0},${cy - d0}^GC${dot},${dot},B^FS`);
      out.push(`^FO${cx - d0},${cy - Math.round(num / 2)}^A0N,${num},${num}^FB${dot},1,0,C^FR^FD${i + 1}^FS`);
    });
  });
  return out;
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
// On a tall roll a box label or a count label is laid out in a band at the
// top, at most BAND_OF_WIDTH times as tall as the label is wide (1.25 in on a
// 2 in roll), so it looks like today's 2 x 1 in label with blank under it.
// Every other roll (2 x 1, 2.25 x 1.25, the sticker roll, any roll that is
// neither a tall ticket nor holds two list pages) is laid out on its whole
// height, as before.
const BAND_OF_WIDTH = 0.625;
// Only on a tall roll (a tall ticket, or one holding several list pages):
// every other roll, an odd one too, is laid out on its whole height as before.
const tallRoll = size => isTallTicket(size) || pagesPerLabel(size) > 1;
const bandOf = size => (tallRoll(size) ? Math.min(size.h, Math.round(size.w * BAND_OF_WIDTH)) : size.h);
export function binLabelZPL(l, size = labelSize()) {
  if (tallRoll(size)) return binLabelTurnedZPL(l, size);
  const { w: full, h: label, top = 0, dpi = 203 } = size;
  const h = bandOf(size);
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
    "^XA", "^CI28", `^PW${full}`, `^LL${label}`, "^LH0,0", "^LT0",
    line(side, top + pad, fit(head, w, big), w, "C", head),
    line(side, top + pad + big + Math.round(a * 0.01), fit(sub, w, mid), w, "C", sub),
    ...(footer ? [line(side, h - small - pad, fit(footer, w, small), w, "C", footer)] : []),
    "^PQ1", "^XZ",
  ].join("\n");
}

// On a tall roll (2 x 3, 2 x 4) the box label is turned a quarter turn and
// fills the whole label (the co-op, 25 Nov 2026: "we use up like an inch of the
// 3 inch height"): it reads along the roll, BOX 5.1 as big as the length
// allows, the team or size under it, the order number and "by team" at the
// bottom, the three spread over the label's width. The fields are laid out on
// the label as if it were lying on its side (L long, S across) and then turned:
// a line at (X, Y) of height fh is printed with the ^A0R font (turned 90°
// clockwise) at x = S - Y - fh, y = X. Turn the label so its right-hand edge is
// on top to read it. 2 mm clear of every edge (the ZD411 cuts at the top and
// the left of the roll).
const turnedLine = (S, X, Y, fh, length, align, text) => {
  const fw = Math.max(5, Math.min(fh, Math.floor(length / textUnits(text))));
  return `^FO${Math.max(0, S - Y - fh)},${X}^A0R,${fh},${fw}^FB${length},1,0,${align}^FD${safe(text)}^FS`;
};
function binLabelTurnedZPL(l, size) {
  const { w: S, h: L, dpi = 203 } = size;
  const m = Math.round(dpi * 2 / 25.4);                           // 2 mm clear of each edge
  const len = L - 2 * m, across = S - 2 * m;
  const box = l.title || `BOX ${l.bin}`;
  // By size the size takes the big line and "BOX 6.1" the one under it, as on the 2 x 1 in label.
  const [head, sub] = l.by === "size" && !l.title && l.label ? [l.label, box] : [box, l.label || ""];
  const footer = [l.orderNumber ? `Order ${l.orderNumber}` : "", l.by === "size" ? "by size" : l.by === "team" ? "by team" : ""].filter(Boolean).join("   ");
  // The heights, each as big as its share of the width across and its text's length allow.
  const lines = [
    { text: head, h: fit(head, len, Math.round(across * 0.48)) },
    { text: sub, h: sub ? fit(sub, len, Math.round(across * 0.3)) : 0 },
    { text: footer, h: footer ? fit(footer, len, Math.round(across * 0.13)) : 0 },
  ].filter(x => x.h > 0);
  // Spread them evenly over the width across: the room left over goes in equal gaps.
  const gap = Math.max(0, Math.floor((across - lines.reduce((t, x) => t + x.h, 0)) / (lines.length + 1)));
  let y = m + gap;
  const out = ["^XA", "^CI28", `^PW${S}`, `^LL${L}`, "^LH0,0", "^LT0"];
  for (const x of lines) { out.push(turnedLine(S, m, y, x.h, len, "C", x.text)); y += x.h + gap; }
  out.push("^PQ1", "^XZ");
  return out.join("\n");
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
export const byNumber = (a, b) => {
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
function binCountZPL(l, size, band = bandOf(size), { open = false } = {}) {
  const { w: full, h: label, top = 0, dpi = 203 } = size;
  const h = band;                                          // a band at the top of a tall roll
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
  const out = ["^XA", "^CI28", `^PW${full}`, `^LL${label}`, "^LH0,0", "^LT0",
    line(side, top + pad, fit(head, w, big), w, "C", head),
    line(side, top + pad + big + 2, fit(pcs, w, mid), w, "C", pcs)];
  if (l.mix) out.push(line(side, top + pad + big + mid + 5, mixH, w, "C", l.mix));
  if (named && order) out.push(line(side + boxW, h - small - pad, fit(order, fw, small), fw, "C", order));
  if (boxTxt) out.push(line(side, h - boxH - pad, boxH, boxW, "L", boxTxt));
  if (open) return out;   // the list's first rows go under it (binListZPL)
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
  const k    = pagesPerLabel(size), hb = k === 1 ? h : (size.dpi || 203);   // on a tall roll the lines keep their 2 x 1 in height
  const a    = hb - top;
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
  const y0 = top + pad + head + 5, rowH = Math.floor((hb - pad - y0) / DAMAGED_PER_LABEL);
  return ["^XA", "^CI28", `^PW${w}`, `^LL${h}`, "^LH0,0", "^LT0",
    tight(x0, top + pad, head, lw, left),
    line(x0 + lw, top + pad, fit(right, rw, head), rw, "R", right),
    `^FO${x0},${top + pad + head + 1}^GB${fullW},1,1^FS`,
    ...(l.items || []).slice(0, DAMAGED_PER_LABEL * k).map((it, i) => tight(x0, y0 + i * rowH, Math.max(10, rowH - 3), fullW, it.text ?? `${it.who}: ${it.reason}`)),
    "^PQ1", "^XZ"].join("\n");
}

// One label of a list, as ZPL: a DAMAGED or boxes list page, the count label
// (`title`), or a page of a box list's rows in two columns.
export function binListZPL(l, size = labelSize(DEFAULT_FLAG_LABEL_SIZE)) {
  // The packing paperwork lays itself out whole (packlabels.js): a packing list is
  // all its pages (printJob has turned it into rows for a roll that is not tall).
  if (l.kind === "packlist") return packListZPL(l, size);
  if (l.kind === "boxface") return boxFaceZPL(l, size);
  if (l.kind === "signoff") return signoffZPL(l, size);
  if (l.damaged) return damagedListZPL(l, size);
  if (l.summary) return summaryCountZPL(l, size);
  const dpi = size.dpi || 203;
  // The count label with the list's first rows under it (a tall roll, see
  // repageLists): the count label in the top inch, as on the 2 x 1 in roll.
  if (l.title && l.items?.length) {
    const out = binCountZPL(l, size, dpi, { open: true });
    out.push(...listRows(l.items, size, dpi, pagesPerLabel(size) - 1, l.cols));
    out.push("^PQ1", "^XZ");
    return out.join("\n");
  }
  if (l.title) return binCountZPL(l, size);
  const out = ["^XA", "^CI28", `^PW${size.w}`, `^LL${size.h}`, "^LH0,0", "^LT0"];
  out.push(...listRows(l.items, size, 0, pagesPerLabel(size), l.cols), "^PQ1", "^XZ");
  return out.join("\n");
}
// The rows of a box list from `from` dots down, `k` inches of them (on the
// 2 x 1 in roll the whole label): 14 an inch in two columns (21 in three when
// no row has a name, `cols: 3`), read down the left column and then down the
// next, each row as tall as on the 2 x 1 in roll.
const listCols = cols => (cols === 3 ? 3 : 2);
function listRows(items, size, from, k, cols = 2) {
  const { w, h, top = 0 } = size;
  if (k < 1) return [];
  const one  = pagesPerLabel(size) === 1;
  const hb   = one ? h : (size.dpi || 203);                       // on a tall roll the rows keep their 2 x 1 in height
  const a    = hb - top;                                          // the printable height of one inch
  const pad  = Math.max(3, Math.round(a * 0.03));
  const c    = listCols(cols);                                    // three columns when no row has a name
  const rows = BIN_LIST_ROWS * k;                                 // in each column
  const y0   = from + (from ? pad : top + pad);
  const rowH = Math.floor((hb - pad - top - pad) / BIN_LIST_ROWS);
  const x0   = Math.round((size.dpi || 203) * BIN_LIST_LEFT_MM / 25.4) + pad;   // where the rows start
  const colW = Math.floor((w - x0 - c * pad) / c);
  return (items || []).slice(0, rows * c).map((text, i) => {
    const col = Math.floor(i / rows), row = i % rows;            // down the left column, then down the right
    return tight(x0 + col * (colW + pad), y0 + row * rowH, Math.max(10, rowH - 3), colW, text);
  });
}

// ── Lists on a tall roll ─────────────────────────────────────────────────────
// The station builds its lists in pages of the 2 x 1 in roll (14 jerseys, 7
// lines). A tall roll holds as many of those pages as it has whole inches
// (4 on 2 x 4 in: 56 jerseys in two columns of 28, or 28 lines) at the same
// row height, so the hub puts them together: the pages of one list, as they
// come one after another, become fewer, longer pages, still printed last page
// first with the count label last, and `page` / `pages` are counted again.
// One page per label (the 2 x 1 in roll): the labels exactly as they came.
export const pagesPerLabel = size => Math.max(1, Math.floor((Number(size?.h) || 0) / dpiOf(size)));
// The rows of one inch of a list: 7 lines of a DAMAGED list, 14 of a box list,
// 21 of a box list in three columns (`cols: 3`, no row has a name).
const rowsPerInch = (damaged = false, cols = 2) => (damaged ? DAMAGED_PER_LABEL : listCols(cols) === 3 ? BIN_LIST_PER_LABEL_NUMBERS : BIN_LIST_PER_LABEL);
export const rowsPerLabel = (size, damaged = false, cols = 2) => rowsPerInch(damaged, cols) * pagesPerLabel(size);
export function repageLists(labels, size) {
  const list = Array.isArray(labels) ? labels : [];
  if (pagesPerLabel(size) === 1) return list;
  const out = [];
  for (let i = 0; i < list.length;) {
    const l = list[i];
    if (!l || l.title || !Array.isArray(l.items)) { out.push(l); i++; continue; }
    // The run of pages of this list: same kind, box, title, order and count,
    // each page number once (the same list printed twice is two runs).
    const same = m => !!m && !m.title && Array.isArray(m.items) && !!m.damaged === !!l.damaged && m.bin === l.bin && m.label === l.label
      && m.head === l.head && m.orderNumber === l.orderNumber && m.pages === l.pages && m.count === l.count && m.cols === l.cols;
    const seen = new Set();
    let j = i;
    while (j < list.length && same(list[j]) && !seen.has(list[j].page)) seen.add(list[j++].page);
    const items = list.slice(i, j).sort((a, b) => (a.page || 0) - (b.page || 0)).flatMap(p => p.items);
    const per = rowsPerLabel(size, !!l.damaged, l.cols);
    const { items: _items, page: _page, ...base } = l;
    const next = list[j];
    if (!l.damaged && next?.title && next.bin === l.bin && next.label === l.label && next.orderNumber === l.orderNumber) {
      // The count label takes the top inch of the first label and the list
      // starts right under it (the co-op, 25 Nov 2026: the bottom of the count
      // label was left empty). That label is printed last, as the count label
      // was, so the strip still starts with it.
      const first = per - rowsPerInch(false, l.cols), rest = items.slice(first);
      const pages = 1 + Math.ceil(rest.length / per);
      out.push(...Array.from({ length: pages - 1 }, (_, p) => ({ ...base, pages, page: p + 2, items: rest.slice(p * per, (p + 1) * per) })).reverse());
      out.push({ ...next, pages, page: 1, items: items.slice(0, first) });
      i = j + 1;
      continue;
    }
    const pages = Math.max(1, Math.ceil(items.length / per));
    out.push(...Array.from({ length: pages }, (_, p) => ({ ...base, pages, page: p + 1, items: items.slice(p * per, (p + 1) * per) })).reverse());
    i = j;
  }
  return out;
}

// The station sends a long run of labels in several requests (the hub takes
// at most 100 a request). The hub re-pages a list for a tall roll only within
// one request, so a cut in the middle of a box's list would print it on two
// half-empty labels with the wrong page count: `listChunks` cuts only between
// lists. A list is a run of pages of the same list (as repageLists counts
// them) and, for a box list, the count label that ends it; a packing list on a
// tall roll (packlabels.js), its count label and its outside label. A single list
// longer than `max` (over 1,400 jerseys in one box) is cut where it must.
export function listChunks(labels, max = 100) {
  const list = Array.isArray(labels) ? labels : [], lists = [];
  const key = l => (l && typeof l === "object" ? JSON.stringify([!!l.damaged, l.bin ?? null, l.label ?? null, l.head ?? null, l.orderNumber ?? null, l.pages ?? null, l.count ?? null, l.cols ?? null]) : null);
  for (let i = 0; i < list.length;) {
    const l = list[i], k = key(l);
    let j = i + 1;
    if (l && !l.title && Array.isArray(l.items)) {
      while (j < list.length && list[j] && !list[j].title && Array.isArray(list[j].items) && key(list[j]) === k) j++;
      const next = list[j];
      if (!l.damaged && next?.title && next.bin === l.bin && next.label === l.label && next.orderNumber === l.orderNumber) j++;
    } else if (l?.kind === "packlist") {
      // A packing list (all its pages in one object) stays with the count label and the outside label of its box.
      while (j < list.length && list[j]?.bin === l.bin && (list[j].title || list[j].kind === "boxface")) j++;
    }
    lists.push(list.slice(i, j)); i = j;
  }
  const chunks = [];
  let cur = [];
  for (const one of lists) {
    if (cur.length && cur.length + one.length > max) { chunks.push(cur); cur = []; }
    for (let i = 0; i < one.length; i += max) {
      const part = one.slice(i, i + max);
      if (cur.length + part.length > max) { chunks.push(cur); cur = []; }
      cur.push(...part);
    }
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

// Every label of one kind, back to back. `kind`: "bin" (default), "jersey",
// "flag", "binlist" (what is in a box, the DAMAGED list, a list of boxes; on a
// tall roll re-paged first) or "binticket" (a box label on the ticket roll).
export function labelsZPL(labels, size = labelSize(), kind = "bin") { return printJob(labels, size, kind).zpl; }
// The same, with how many labels come out: on a tall roll a list prints on
// fewer labels than the station sent (repageLists), so the hub answers the
// station with this count (POST /print). A flag ticket counts once: the
// printer makes its second copy (FLAG_COPIES).
export function printJob(labels, size = labelSize(), kind = "bin") {
  const one = kind === "jersey" ? jerseyLabelZPL : kind === "flag" ? flagLabelZPL : kind === "binlist" ? binListZPL : binLabelZPL;
  let list = kind === "binlist" ? repageLists(labels, size) : (Array.isArray(labels) ? labels : []);
  // A packing list on a roll that is not tall (the station sends it only for a tall one) falls back to
  // the rows list of the 2 x 1 in roll; a list pages itself on a tall roll, and repageLists leaves it alone.
  if (kind === "binlist" && !isTallTicket(size) && list.some(l => l?.kind === "packlist")) {
    list = repageLists(list.flatMap(l => l?.kind === "packlist" ? binListLabels(packListRows(l), { bin: l.bin, label: l.team, orderNumber: l.orderNumber }).filter(x => !x.title) : [l]), size);
  }
  const zpls = list.map(l => one(l, size));
  // The labels that come out: a packing list is one object and several pages (the printer makes its copies, ^PQ).
  const pages = (l, z) => (kind === "binlist" && (l?.kind === "packlist" || l?.kind === "boxface" || l?.kind === "signoff") ? (z.match(/\^XA/g) || []).length : 1);
  return { zpl: zpls.join("\n") + "\n", count: list.reduce((n, l, i) => n + pages(l, zpls[i]), 0) };
}
