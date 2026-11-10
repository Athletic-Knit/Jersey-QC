// ── The box a bin goes in: by room and by weight, learnt from the floor ──────
// A flat "15 jerseys is a medium box" is wrong: twelve youth sublimated
// jerseys and twelve adult 2XL stitched ones do not fill the same box, and a
// box may not weigh more than about 45 lb whatever its size. So:
//   • every jersey takes ROOM, in units of one adult 2XL stitched jersey, by
//     its size class and whether it is stitched or sublimated (`units`);
//   • every box holds so many units (`caps`: small, medium, large);
//   • every jersey has a WEIGHT in lb (`weights`), and no box goes over
//     `weightCap`.
// A bin goes in the smallest box that has the room; past a large box, or past
// the weight cap, it is split over several.
//
// The numbers start as estimates (PRIOR) and are LEARNT: every time a bin is
// closed and someone says which box it really went in, that is an
// observation { counts, box }. `fitBoxModel` fits the room each kind of
// jersey takes and what each box holds to all of them (an ordinal logistic
// regression on the log of the load, held to the starting estimates until the
// floor's answers outweigh them). Weight is not learnt: it comes off a scale.
//
// No config.js here: the hub runs this too.

export const SIZE_CLASSES = [
  { id: "youth", label: "Youth" },
  { id: "asm",   label: "Adult S / M" },
  { id: "alx",   label: "Adult L / XL" },
  { id: "a2x",   label: "Adult 2XL" },
  { id: "a3x",   label: "Adult 3XL+" },
];
export const BOXES = [
  { id: "small",  label: "Small box" },
  { id: "medium", label: "Medium box" },
  { id: "large",  label: "Large box" },
];
export const MORE = "more";   // the answer "it did not fit in one large box"

// "Y-M", "A-2XL", "Youth L", "XXL" → a size class. An unknown size counts as adult L / XL.
export function sizeClass(size) {
  const k = String(size ?? "").toLowerCase().replace(/[\s_]+/g, "");
  const m = k.match(/^(youth|adult|y|a)?[-/]?(.*)$/);
  if (/^y/.test(m?.[1] || "")) return "youth";
  const t = m?.[2] || k;
  if (/^(xxs|xs|s|m|sm|small|medium)$/.test(t)) return "asm";
  if (/^(2xl|xxl)$/.test(t)) return "a2x";
  if (/^([3-9]xl|xxxl|xxxxl)$/.test(t)) return "a3x";
  return "alx";
}
export const featureOf = (size, stitched = true) => `${sizeClass(size)}|${stitched ? "st" : "su"}`;
export const FEATURES = SIZE_CLASSES.flatMap(c => [`${c.id}|st`, `${c.id}|su`]);

// The starting estimates. One adult 2XL stitched jersey is 1 unit of room.
const table = (st, su) => Object.fromEntries(SIZE_CLASSES.flatMap((c, i) => [[`${c.id}|st`, st[i]], [`${c.id}|su`, su[i]]]));
export const PRIOR = {
  units:   table([0.62, 0.83, 0.92, 1.00, 1.10], [0.50, 0.66, 0.74, 0.80, 0.88]),
  weights: table([0.90, 1.15, 1.30, 1.40, 1.50], [0.55, 0.70, 0.80, 0.90, 1.00]),   // lb a jersey
  caps: [8, 18, 36],        // units a small, a medium and a large box hold
  weightCap: 45,            // lb: no box heavier than this
  bagMax: 1,                // a one-piece bin goes in a bag
};

// The rows of a bin → { feature: how many }.
export function binCounts(rows, stitched = true) {
  const c = {};
  (rows || []).forEach(r => { const f = featureOf(r?.size, stitched); c[f] = (c[f] || 0) + 1; });
  return c;
}
const total = (counts, per) => Object.entries(counts || {}).reduce((t, [f, n]) => t + n * (per[f] ?? per["alx|st"] ?? 1), 0);
export const pieces   = counts => Object.values(counts || {}).reduce((t, n) => t + n, 0);
export const loadOf   = (counts, model = PRIOR) => total(counts, model.units);
export const weightOf = (counts, model = PRIOR) => total(counts, model.weights);

// counts → { id, label, boxes, by, load, weight, room, heavy } or null for an
// empty bin. `room`: how full the box is by room (0–1); `heavy`: how close to
// the weight cap (0–1); `by`: what made it this box — "room" or "weight".
export function predictBox(counts, model = PRIOR) {
  const n = pieces(counts);
  if (n <= 0) return null;
  const load = loadOf(counts, model), weight = weightOf(counts, model);
  const cap = model.weightCap || Infinity, large = model.caps[model.caps.length - 1];
  const facts = { load, weight, heavy: weight / cap };
  if (n <= (model.bagMax ?? 1) && weight <= cap) return { id: "bag", label: "Bag", boxes: 1, by: "room", room: 1, ...facts };
  const byWeight = Math.ceil(weight / cap - 1e-9), byRoom = Math.ceil(load / large - 1e-9);
  if (byWeight > 1 || byRoom > 1) {
    const boxes = Math.max(byWeight, byRoom);
    return { id: MORE, label: `${boxes} large boxes`, boxes, by: byWeight >= byRoom && byWeight > 1 ? "weight" : "room", room: load / (boxes * large), ...facts };
  }
  const k = model.caps.findIndex(c => load <= c);
  return { id: BOXES[k].id, label: BOXES[k].label, boxes: 1, by: "room", room: load / model.caps[k], ...facts };
}

// How many jerseys of one kind fill each box, by room and by weight: the
// table a person can read ("Large box: 34 adult 2XL stitched").
export function capacityTable(model = PRIOR) {
  return FEATURES.map(f => ({
    feature: f,
    boxes: model.caps.map(c => Math.min(Math.floor(c / model.units[f] + 1e-9), Math.floor(model.weightCap / model.weights[f] + 1e-9))),
    byWeight: model.caps.map(c => Math.floor(model.weightCap / model.weights[f] + 1e-9) < Math.floor(c / model.units[f] + 1e-9)),
  }));
}

// ── Learning ─────────────────────────────────────────────────────────────────
// obs: [{ counts, box }] — box is "small" | "medium" | "large" | "more".
// Bags and bins that the weight cap alone explains teach nothing about room
// and are left out. → a model like PRIOR, with `units` and `caps` fitted and
// `seen`: how many answers it was fitted to.
const LABELS = [...BOXES.map(b => b.id), MORE];
const sig = x => 1 / (1 + Math.exp(-x));
export function fitBoxModel(obs, prior = PRIOR, { start = null, iters = 200, tau = 0.07, trust = 0.25, lr = 0.02 } = {}) {
  const F = FEATURES.length, K = prior.caps.length, P = F + K;
  const data = [];
  (obs || []).forEach(o => {
    const y = LABELS.indexOf(o?.box);
    if (y < 0 || pieces(o.counts) <= (prior.bagMax ?? 1)) return;
    if (weightOf(o.counts, prior) > prior.weightCap) return;                  // split by weight: says nothing about room
    const idx = [], n = [];
    FEATURES.forEach((f, i) => { if (o.counts[f]) { idx.push(i); n.push(o.counts[f]); } });
    if (idx.length) data.push({ idx, n, y });
  });
  // Parameters, all in logs: the room of each kind of jersey, then each box's capacity.
  const p0 = [...FEATURES.map(f => Math.log(prior.units[f])), ...prior.caps.map(Math.log)];
  const from = start || prior;
  const p = [...FEATURES.map(f => Math.log(from.units[f])), ...from.caps.map(Math.log)];
  if (data.length) {
    const m = new Array(P).fill(0), v = new Array(P).fill(0), g = new Array(P);
    const u = new Array(F);
    for (let it = 1; it <= iters; it++) {
      for (let i = 0; i < P; i++) g[i] = (p[i] - p0[i]) / (trust * trust);    // held to the starting estimates
      for (let i = 0; i < F; i++) u[i] = Math.exp(p[i]);
      for (const d of data) {
        let s = 0; for (let j = 0; j < d.idx.length; j++) s += d.n[j] * u[d.idx[j]];
        const z = Math.log(s);
        const cHi = d.y < K ? sig((p[F + d.y] - z) / tau) : 1;
        const cLo = d.y > 0 ? sig((p[F + d.y - 1] - z) / tau) : 0;
        const pr  = Math.max(1e-9, cHi - cLo);
        const gHi = d.y < K ? cHi * (1 - cHi) : 0, gLo = d.y > 0 ? cLo * (1 - cLo) : 0;
        if (d.y < K) g[F + d.y]     -= gHi / (tau * pr);
        if (d.y > 0) g[F + d.y - 1] += gLo / (tau * pr);
        const dz = (gHi - gLo) / (tau * pr);
        for (let j = 0; j < d.idx.length; j++) g[d.idx[j]] += dz * d.n[j] * u[d.idx[j]] / s;
      }
      for (let i = 0; i < P; i++) {                                           // Adam
        m[i] = 0.9 * m[i] + 0.1 * g[i]; v[i] = 0.999 * v[i] + 0.001 * g[i] * g[i];
        p[i] -= lr * (m[i] / (1 - 0.9 ** it)) / (Math.sqrt(v[i] / (1 - 0.999 ** it)) + 1e-8);
      }
    }
  }
  const caps = p.slice(F).map(Math.exp).sort((a, b) => a - b);
  return { ...prior, units: Object.fromEntries(FEATURES.map((f, i) => [f, Math.exp(p[i])])), caps, seen: data.length };
}
