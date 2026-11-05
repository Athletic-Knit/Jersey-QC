// ── Labels for the Zebra ─────────────────────────────────────────────────────
// Two kinds, both ZPL (the Zebra's own language) sent raw to the printer by
// the hub, so no browser print dialog and no driver rendering are involved:
//   • a jersey sticker, printed on every pass: the bin the jersey goes in and
//     what the order is sorted by (the team or the size), for the packer who
//     stacks the folded jerseys by bin;
//   • a bin label (on request from the Bin setup screen): "BIN 3" and what
//     the bin holds.
// The roll is 1 in wide by 0.5 in tall (JERSEY_LABEL_SIZE); every layout is
// in fractions of the label so another roll only needs the setting.
import { binEntries, binFieldOf, binFor } from "./roster.js";

// "1x0.5" (inches, width x height) → dots at the printer's resolution.
// `top` is where printing starts: the ZD411 begins its label about 2 mm
// above the sticker's edge, so the first 2 mm are left blank or the top
// line comes out cut in half (seen on the floor, 5 Nov 2026).
export const DEFAULT_LABEL_SIZE = "1x0.5";
export const LABEL_TOP_MM = 2;
export function labelSize(spec = DEFAULT_LABEL_SIZE, dpi = 203) {
  const m = String(spec || "").match(/^\s*([\d.]+)\s*[x×]\s*([\d.]+)\s*$/i);
  const w = m ? parseFloat(m[1]) : 1, h = m ? parseFloat(m[2]) : 0.5;
  return { w: Math.round(w * dpi), h: Math.round(h * dpi), dpi, widthIn: w, heightIn: h, top: Math.round(dpi * LABEL_TOP_MM / 25.4) };
}

// ZPL field data may not contain the control characters ^ and ~.
const safe = s => String(s ?? "").replace(/[\^~]/g, " ");
// Font 0 (the printer's scalable font) at height h is about 0.55 h per
// character: the tallest font that still fits `text` in `width` dots.
const fit = (text, width, maxH) => Math.max(10, Math.min(maxH, Math.floor(width / (0.58 * Math.max(1, String(text).length)))));
// One line of text in a box: ^FB wraps it to `width`, one line, aligned.
const line = (x, y, fh, width, align, text) => `^FO${x},${y}^A0N,${fh},${fh}^FB${width},1,0,${align}^FD${safe(text)}^FS`;

// ── The jersey sticker ───────────────────────────────────────────────────────
// What a passed jersey's sticker says, from its roster row and the order's
// bin map: { bin, by, value, orderNumber }. An order with no bins still says
// the team or the size, so the packer can stack by it.
export function jerseyLabel(row, binMap, { orderNumber = "" } = {}) {
  const bin = binFor(binMap, row);
  let by = binFieldOf(binMap);
  if (!binMap) by = String(row?.team ?? "").trim() ? "team" : "size";
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
  const out  = ["^XA", "^CI28", `^PW${w}`, `^LL${h}`, "^LH0,0"];
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

// ── Bin labels ───────────────────────────────────────────────────────────────
// One entry per bin: { bin, label (the team or size), by, count, orderNumber }.
export function binLabels(roster, binMap, { orderNumber = "" } = {}) {
  const by = binFieldOf(binMap);
  const counts = {};
  roster.forEach(r => { const b = binFor(binMap, r); if (b !== null) counts[b] = (counts[b] || 0) + 1; });
  return binEntries(roster, binMap).map(({ label, bin }) => ({ bin, label, by, count: counts[bin] || 0, orderNumber: String(orderNumber || "") }));
}

// "BIN 3" big, the team or size under it, a footer with the order number,
// "by team" / "by size" and the jersey count (just the order number on a
// small label).
export function binLabelZPL(l, size = labelSize()) {
  const { w, h, top = 0 } = size;
  const a     = h - top;                                          // the printable height
  const pad   = Math.round(a * 0.04);
  const small = Math.max(12, Math.round(a * 0.14));              // the footer
  const big   = Math.round(a * 0.42);                             // "BIN 3"
  const mid   = Math.round(a * 0.26);                             // the team or size
  const wide  = w >= 300;
  const footer = (wide
    ? [l.orderNumber ? `Order ${l.orderNumber}` : "", l.by === "size" ? "by size" : "by team", l.count ? `${l.count} ${l.count === 1 ? "jersey" : "jerseys"}` : ""]
    : [l.orderNumber ? `Order ${l.orderNumber}` : ""]).filter(Boolean).join("   ");
  return [
    "^XA", "^CI28", `^PW${w}`, `^LL${h}`, "^LH0,0",
    line(0, top + pad, fit(`BIN ${l.bin}`, w, big), w, "C", `BIN ${l.bin}`),
    line(0, top + pad + big + Math.round(a * 0.03), fit(l.label, w, mid), w, "C", l.label),
    ...(footer ? [line(0, h - small - pad, fit(footer, w, small), w, "C", footer)] : []),
    "^PQ1", "^XZ",
  ].join("\n");
}

// Every label of one kind, back to back. `kind`: "bin" (default) or "jersey".
export function labelsZPL(labels, size = labelSize(), kind = "bin") {
  const one = kind === "jersey" ? jerseyLabelZPL : binLabelZPL;
  return labels.map(l => one(l, size)).join("\n") + "\n";
}
