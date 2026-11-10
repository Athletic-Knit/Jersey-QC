// ── Which box a bin is packed in ─────────────────────────────────────────────
// Packing has a bag (a one-piece order) and a small, a medium and a large box.
// The box follows from how many jerseys are in the bin when it is closed: the
// smallest one that holds them. The limits are the station's settings
// (boxBag, boxSmall, boxMedium, boxLarge: the most jerseys each holds); more
// than a large box holds is that many large boxes.
export const DEFAULT_BOXES = { boxBag: 1, boxSmall: 6, boxMedium: 15, boxLarge: 30 };
export const BOX_KINDS = [
  { id: "bag",    key: "boxBag",    label: "Bag" },
  { id: "small",  key: "boxSmall",  label: "Small box" },
  { id: "medium", key: "boxMedium", label: "Medium box" },
  { id: "large",  key: "boxLarge",  label: "Large box" },
];

// The limits as numbers, each at least the one before it.
export function boxLimits(settings = {}) {
  let floor = 0;
  return BOX_KINDS.map(k => {
    const n = Math.floor(Number(settings?.[k.key]));
    floor = Math.max(floor, Number.isFinite(n) && n > 0 ? n : DEFAULT_BOXES[k.key]);
    return { ...k, max: floor };
  });
}

// count → { id, label, boxes } or null for an empty bin.
export function boxFor(count, settings = {}) {
  const n = Math.floor(Number(count)) || 0;
  if (n <= 0) return null;
  const limits = boxLimits(settings);
  const hit = limits.find(k => n <= k.max);
  if (hit) return { id: hit.id, label: hit.label, boxes: 1 };
  const boxes = Math.ceil(n / limits[limits.length - 1].max);
  return { id: "large", label: `${boxes} large boxes`, boxes };
}
