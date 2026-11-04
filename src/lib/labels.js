// ── Bin labels for the Zebra ─────────────────────────────────────────────────
// One label per bin when an order with bins starts: "BIN 3", the team or size
// the bin holds, and a footer with the order number and the jersey count.
// Built as ZPL (the Zebra's own language) and sent raw to the printer by the
// hub, so no browser print dialog and no driver rendering are involved.
import { binEntries, binFieldOf, binFor } from "./roster.js";

// What each label says, from the order's roster and bin map.
export function binLabels(roster, binMap, { orderNumber = "" } = {}) {
  const by = binFieldOf(binMap);
  const counts = {};
  roster.forEach(r => { const b = binFor(binMap, r); if (b !== null) counts[b] = (counts[b] || 0) + 1; });
  return binEntries(roster, binMap).map(({ label, bin }) => ({ bin, label, by, count: counts[bin] || 0, orderNumber: String(orderNumber || "") }));
}

// "2.25x1.25" (inches, width x height) → dots at the printer's resolution.
export function labelSize(spec = "2.25x1.25", dpi = 203) {
  const m = String(spec || "").match(/^\s*([\d.]+)\s*[x×]\s*([\d.]+)\s*$/i);
  const w = m ? parseFloat(m[1]) : 2.25, h = m ? parseFloat(m[2]) : 1.25;
  return { w: Math.round(w * dpi), h: Math.round(h * dpi), dpi, widthIn: w, heightIn: h };
}

// ZPL field data may not contain the control characters ^ and ~.
const safe = s => String(s ?? "").replace(/[\^~]/g, " ");

// One label. Font 0 is the printer's scalable font; ^FB centres the line.
export function binLabelZPL(l, size = labelSize()) {
  const { w, h } = size;
  const big   = Math.round(h * 0.46);               // "BIN 3"
  const mid   = Math.round(h * 0.26);               // the team or size
  const small = Math.max(18, Math.round(h * 0.10)); // the footer
  const pad   = Math.round(h * 0.04);
  const line  = (y, fh, text) => `^FO0,${y}^A0N,${fh},${fh}^FB${w},1,0,C^FD${safe(text)}^FS`;
  const footer = [l.orderNumber ? `Order ${l.orderNumber}` : "", l.by === "size" ? "by size" : "by team", l.count ? `${l.count} ${l.count === 1 ? "jersey" : "jerseys"}` : ""].filter(Boolean).join("   ");
  return [
    "^XA", "^CI28", `^PW${w}`, `^LL${h}`, "^LH0,0",
    line(pad, big, `BIN ${l.bin}`),
    line(pad + big + Math.round(h * 0.03), mid, l.label),
    line(h - small - pad, small, footer),
    "^PQ1", "^XZ",
  ].join("\n");
}

export function labelsZPL(labels, size = labelSize()) {
  return labels.map(l => binLabelZPL(l, size)).join("\n") + "\n";
}
