// ── Labels for the Zebra ─────────────────────────────────────────────────────
// Two kinds, both ZPL (the Zebra's own language) sent raw to the printer by
// the hub, so no browser print dialog and no driver rendering are involved:
//   • a jersey sticker, printed on every pass: the bin the jersey goes in and
//     what the order is sorted by (the team or the size), for the packer who
//     stacks the folded jerseys by bin;
//   • a flag ticket, printed on every flag: the mirror of the sticker, with
//     the left column solid black so a flagged jersey is never packed — the
//     number on the black, where the jersey goes (STITCHER, REMAKE …) and
//     why on the right. It goes on its own, bigger roll: 2 in wide by 1 in
//     tall (JERSEY_FLAG_LABEL_SIZE), on the flag printer when there is one;
//   • a bin label (on request from the Bin setup screen): "BIN 3" and what
//     the bin holds.
// The sticker roll is 1 in wide by 0.5 in tall (JERSEY_LABEL_SIZE); every
// layout is in fractions of the label so another roll only needs the setting.
import { binEntries, binFieldOf, binFor } from "./roster.js";

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
const line = (x, y, fh, width, align, text, { lines = 1, reverse = false } = {}) =>
  `^FO${x},${y}^A0N,${fh},${fh}^FB${width},${lines},0,${align}${reverse ? "^FR" : ""}^FD${safe(text)}^FS`;

// ── The jersey sticker ───────────────────────────────────────────────────────
// What a passed jersey's sticker says, from its roster row and the order's
// bin map: { bin, by, value, orderNumber }. An order with no bins still says
// the team or the size, so the packer can stack by it.
export function jerseyLabel(row, binMap, { orderNumber = "" } = {}) {
  const bin = binFor(binMap, row);
  let by = binFieldOf(binMap);
  if (!binMap || by === "all") by = String(row?.team ?? "").trim() ? "team" : "size";   // one bin for the whole order: still say the team or the size
  return { bin: bin === null ? "" : bin, by, value: String(row?.[by] ?? "").trim(), orderNumber: String(orderNumber || "") };
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
    out.push(line(0, top + pad, tag, lw, "C", "BIN"));
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
// where it goes (`tag`: the board's tag for the reason's route, from
// severityOf in config.js — the caller passes it, as config.js needs Vite's
// env and this file also runs on the hub), the reason, the team, size and
// bin, and the order, station and time.
const stationShort = id => String(id || "").replace(/^st-/, "").replace(/^station\s*/i, "St ").trim();
export function flagLabel(entry, binMap, { orderNumber = "", station = "", tag = "DECIDE" } = {}) {
  const row = entry?.match || null, read = entry?.detected || null;
  const bin = row ? binFor(binMap, row) : null;
  const time = String(entry?.timestamp || "").match(/(\d\d:\d\d)(?::\d\d)?\s*$/)?.[1] || "";
  return {
    number: String(row?.number ?? read?.number ?? "").trim() || "?",
    name:   String(row?.name ?? read?.name ?? "").trim(),
    tag:    String(tag || "DECIDE"),
    reason: String(entry?.reason || "").replace(/ — found after it passed$/, "").trim(),
    team:   String(row?.team ?? "").trim(),
    size:   String(row?.size ?? "").trim(),
    bin:    bin === null ? "" : bin,
    orderNumber: String(orderNumber || ""),
    station: stationShort(station),
    time,
  };
}

// 2 x 1 in, the mirror of the sticker: a solid black column on the left
// with FLAG, the number and the name in white; on the right the route tag
// as big as it fits, the reason on up to three lines, team · size · bin,
// and order · station · time small at the bottom. In fractions of the
// label, so it also comes out (small) on the 1 x 0.5 in sticker roll.
// The 2 x 1 in roll starts printing about half a millimetre below the label's
// top edge, which left a white line above the black column (10 Nov 2026). ^LT
// lifts the whole ticket by FLAG_LIFT dots so the black reaches the edge. The
// printer keeps ^LT until told otherwise, so every other label sets ^LT0.
export const FLAG_LIFT = 6;
export function flagLabelZPL(l, size = labelSize(DEFAULT_FLAG_LABEL_SIZE)) {
  const { w, h, top = 0 } = size;
  const a     = h - top;
  const pad   = Math.round(a * 0.04);
  const side  = w >= 300 ? Math.round((size.dpi || 203) * 2 / 25.4) : 0;   // the 2 x 1 in roll: the ZD411 cuts 2 mm off the left
  const lw    = Math.round((w - side) * 0.32);                    // the black column
  const rx    = side + lw + 2 * pad, rw = w - rx - pad;           // the right column
  const tag   = Math.max(12, Math.round(a * 0.16));               // FLAG
  const tiny  = Math.max(12, Math.round(a * 0.14));               // the name, the reason
  const mid   = Math.max(12, Math.round(a * 0.13));               // team · size · bin
  const small = Math.max(10, Math.round(a * 0.12));               // order · station · time
  const out   = ["^XA", "^CI28", `^PW${w}`, `^LL${h}`, "^LH0,0", `^LT${-FLAG_LIFT}`];
  // The black column: a box filled by a border as thick as the box is wide.
  // It runs off the top and the left of the label (the text in it keeps
  // clear of the 2 mm the printer cuts), so no white edge is left around it.
  out.push(`^FO0,0^GB${side + lw},${h},${side + lw}^FS`);
  const nameH = l.name ? tiny : 0;
  const big   = fit(l.number, lw - 4, Math.round(a * 0.5));
  out.push(line(side, top + pad, tag, lw, "C", "FLAG", { reverse: true }));
  out.push(line(side, top + pad + tag + 1, big, lw, "C", l.number, { reverse: true }));
  if (l.name) out.push(line(side, top + a - pad - nameH, fit(l.name, lw - 4, tiny), lw, "C", l.name, { reverse: true }));
  // The right column.
  const tagH = fit(l.tag || "DECIDE", rw, Math.round(a * 0.26));
  let y = top + pad;
  out.push(line(rx, y, tagH, rw, "C", l.tag || "DECIDE"));
  y += tagH + pad;
  const parts = [l.team, l.size, l.bin !== "" ? `Bin ${l.bin}` : ""].filter(Boolean).join(" · ");
  const footer = [l.orderNumber ? `Ord ${l.orderNumber}` : "", l.station, l.time].filter(Boolean).join(" · ");
  const bottom = top + a - pad;                                   // the lines stack up from here
  let fy = bottom;
  if (footer) { fy -= small; out.push(line(rx, fy, fit(footer, rw, small), rw, "C", footer)); }
  if (parts)  { fy -= mid + 1; out.push(line(rx, fy, fit(parts, rw, mid), rw, "C", parts)); }
  const room = fy - 2 - y;                                        // what is left for the reason
  if (l.reason && room >= 10) {
    // As many lines as the room allows (up to 3); when the reason still
    // does not fit, a smaller font down to 10 dots rather than a cut line.
    let fh = Math.min(tiny, room), lines = 1;
    for (; fh >= 10; fh--) {
      lines = Math.max(1, Math.min(3, Math.floor(room / fh)));
      if (lines * Math.floor(rw / (0.58 * fh)) >= l.reason.length) break;
    }
    out.push(line(rx, y, Math.max(10, fh), rw, "C", l.reason, { lines }));
  }
  out.push("^PQ1", "^XZ");
  return out.join("\n");
}

// ── Bin labels ───────────────────────────────────────────────────────────────
// One entry per bin: { bin, label (the team or size), by, count, orderNumber }.
export function binLabels(roster, binMap, { orderNumber = "" } = {}) {
  const by = binFieldOf(binMap);
  const counts = {};
  roster.forEach(r => { const b = binFor(binMap, r); if (b !== null) counts[b] = (counts[b] || 0) + 1; });
  return binEntries(roster, binMap).map(({ label, bin }) => ({ bin, label, by, count: counts[bin] || 0, orderNumber: String(orderNumber || "") }));
}

// "BIN 3" as big as the label allows (half its height), the team or size
// under it, a small footer with the order number and "by team" / "by size"
// (just the order number on a small label). No jersey count: nobody knows
// how many will go in before the bin is full. It is read from
// across the table, so the bin and what it holds take the room and the footer
// gets what is left. Bin labels go on the 2 x 1 in roll (kind "binticket"):
// the ones printed when the order starts and the one for a bin opened when
// another was full are the same label. On that roll the text keeps 2 mm clear
// of the left and right edges, where the ZD411 cuts.
export function binLabelZPL(l, size = labelSize()) {
  const { w: full, h, top = 0, dpi = 203 } = size;
  const wide  = full >= 300;
  const side  = wide ? Math.round(dpi * 2 / 25.4) : 0;
  const w     = full - 2 * side;
  const a     = h - top;                                          // the printable height
  const pad   = Math.round(a * 0.04);
  const small = Math.max(12, Math.round(a * 0.12));              // the footer
  const big   = Math.round(a * 0.5);                              // "BIN 3"
  const mid   = Math.round(a * 0.27);                             // the team or size
  const footer = (wide
    ? [l.orderNumber ? `Order ${l.orderNumber}` : "", l.by === "size" ? "by size" : l.by === "team" ? "by team" : ""]
    : [l.orderNumber ? `Order ${l.orderNumber}` : ""]).filter(Boolean).join("   ");
  return [
    "^XA", "^CI28", `^PW${full}`, `^LL${h}`, "^LH0,0", "^LT0",
    line(side, top + pad, fit(`BIN ${l.bin}`, w, big), w, "C", `BIN ${l.bin}`),
    line(side, top + pad + big + Math.round(a * 0.01), fit(l.label, w, mid), w, "C", l.label),
    ...(footer ? [line(side, h - small - pad, fit(footer, w, small), w, "C", footer)] : []),
    "^PQ1", "^XZ",
  ].join("\n");
}

// ── The list of what is in a bin ─────────────────────────────────────────────
// Printed when a bin is closed (it is full, or the order is finished), on the
// 2 x 1 in roll: every jersey in the bin as "23-JAMES-AXL" (number, name,
// size), ten to a label in two columns of five, read down the left column and
// then down the right, in jersey-number order. A bin of 15 is two labels, a
// bin of 30 three. `box` (what packing puts the bin in: "Medium box", from
// boxes.js — the station passes it, as it knows the box sizes) goes at the
// top right, in capitals, with the order and the count on a small line under.
// The list starts 2 mm in from the left edge: the ZD411 cut that much off the
// left of the 2 x 1 in roll (seen on the floor, 10 Nov 2026).
export const BIN_LIST_PER_LABEL = 10;
export const BIN_LIST_LEFT_MM = 2;
const squash = s => String(s ?? "").trim().replace(/[\s-]+/g, "");
export function binListItem(row) {
  return [String(row?.number ?? "").trim(), String(row?.name ?? "").trim(), squash(row?.size)].filter(Boolean).join("-");
}
// Jersey-number order: 2 before 10; a number that is not a number goes last;
// the same number by name.
const byNumber = (a, b) => {
  const x = parseInt(a.number, 10), y = parseInt(b.number, 10);
  if (Number.isNaN(x) !== Number.isNaN(y)) return Number.isNaN(x) ? 1 : -1;
  return (Number.isNaN(x) ? 0 : x - y) || String(a.number ?? "").localeCompare(String(b.number ?? "")) || String(a.name ?? "").localeCompare(String(b.name ?? ""));
};
// rows in the bin → one entry per label: { bin, label, orderNumber, box, page, pages, count, items }.
export function binListLabels(rows, { bin, label = "", orderNumber = "", box = "" } = {}) {
  const items = [...(rows || [])].sort(byNumber).map(binListItem);
  const pages = Math.ceil(items.length / BIN_LIST_PER_LABEL);
  return Array.from({ length: pages }, (_, i) => ({
    bin, label: String(label || ""), orderNumber: String(orderNumber || ""), box: String(box || ""), page: i + 1, pages, count: items.length,
    items: items.slice(i * BIN_LIST_PER_LABEL, (i + 1) * BIN_LIST_PER_LABEL),
  }));
}

export function binListZPL(l, size = labelSize(DEFAULT_FLAG_LABEL_SIZE)) {
  const { w, h, top = 0 } = size;
  const a    = h - top;                                           // the printable height
  const pad  = Math.max(3, Math.round(a * 0.03));
  const head = Math.max(12, Math.round(a * 0.12));
  const rows = BIN_LIST_PER_LABEL / 2;
  const box  = String(l.box || "").toUpperCase();
  const sub  = box ? Math.max(10, Math.round(a * 0.09)) + 2 : 0;  // with a box: a small second line for the order and the count
  const y0   = top + pad + head + sub + 4;                        // under the header and its rule
  const rowH = Math.floor((h - pad - y0) / rows);
  const x0   = Math.round((size.dpi || 203) * BIN_LIST_LEFT_MM / 25.4) + pad;   // where the list starts
  const fullW = w - x0 - pad;
  const colW = Math.floor((fullW - pad) / 2);
  const left  = `BIN ${l.bin}${l.label ? "  " + l.label : ""}`;
  const facts = [l.orderNumber ? `Order ${l.orderNumber}` : "", `${l.count} pcs`, l.pages > 1 ? `${l.page}/${l.pages}` : ""].filter(Boolean).join("  ");
  const right = box || facts;
  const lw = Math.round(fullW * 0.5), rw = fullW - lw;
  const out = ["^XA", "^CI28", `^PW${w}`, `^LL${h}`, "^LH0,0", "^LT0",
    tight(x0, top + pad, head, lw, left),
    line(x0 + lw, top + pad, fit(right, rw, head), rw, "R", right),
    ...(box ? [tight(x0, top + pad + head + 1, sub - 2, fullW, facts)] : []),
    `^FO${x0},${top + pad + head + sub + 1}^GB${fullW},1,1^FS`];
  (l.items || []).slice(0, BIN_LIST_PER_LABEL).forEach((text, i) => {
    const col = Math.floor(i / rows), row = i % rows;            // down the left column, then down the right
    out.push(tight(x0 + col * (colW + pad), y0 + row * rowH, Math.max(10, rowH - 3), colW, text));
  });
  out.push("^PQ1", "^XZ");
  return out.join("\n");
}

// Every label of one kind, back to back. `kind`: "bin" (default), "jersey",
// "flag", "binlist" (what is in a bin) or "binticket" (a bin label on the
// 2 x 1 in roll, for a bin opened when another was full).
export function labelsZPL(labels, size = labelSize(), kind = "bin") {
  const one = kind === "jersey" ? jerseyLabelZPL : kind === "flag" ? flagLabelZPL : kind === "binlist" ? binListZPL : binLabelZPL;
  return labels.map(l => one(l, size)).join("\n") + "\n";
}
