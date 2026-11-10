// Packing simulation: does the box model name the box a bin really goes in?
//
// Each "factory" has a truth the model is never told: how much room each kind
// of jersey really takes, what each box really holds, and what a jersey
// really weighs — all off from the model's starting estimates. Bins are
// closed one after another; for each the model names a box, the packer packs
// it (folding a little tighter or looser each time) and taps the box that was
// really used (now and then the wrong one), and the model learns from the tap.
//
//   SIM_BINS=3000 SIM_FACTORIES=12 npx vitest run box-sim
/* global process */
import { describe, it, expect } from "vitest";
import { PRIOR, FEATURES, BOXES, MORE, featureOf, predictBox, fitBoxModel, capacityTable, weightOf, loadOf, sizeClass, binCounts } from "../boxmodel.js";
import { boxFor } from "../boxes.js";

const BINS      = Number(process.env.SIM_BINS) || 1500;
const FACTORIES = Number(process.env.SIM_FACTORIES) || 8;
const SEED      = Number(process.env.SIM_SEED) || 20261110;
const FOLD      = 0.05;    // a bin packs 5% tighter or looser than the last one, give or take
const MISTAP    = 0.03;    // the packer taps the box next to the right one
const OFF       = 0.30;    // the truth is up to 30% off the starting estimates, each number its own way
const WINDOWS   = [[1, 25], [26, 50], [51, 100], [101, 200], [201, 400], [401, 800], [801, 1e9]];

const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const gauss = r => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
const pick = (r, xs) => xs[Math.floor(r() * xs.length)];
const off = (r, by) => Math.exp((r() * 2 - 1) * Math.log(1 + by));

// A factory's truth.
function truthOf(r) {
  return {
    units:   Object.fromEntries(FEATURES.map(f => [f, PRIOR.units[f] * off(r, OFF)])),
    weights: Object.fromEntries(FEATURES.map(f => [f, PRIOR.weights[f] * off(r, 0.05)])),   // the scale is right to 5%
    caps:    PRIOR.caps.map(c => c * off(r, OFF)).sort((a, b) => a - b),
    weightCap: PRIOR.weightCap, bagMax: 1,
  };
}

// A bin as it is closed: one order's kind of jersey, a team's spread of sizes,
// and as many as the operator put in before saying "full" (or the order ended).
const ADULT = ["A-S", "A-M", "A-M", "A-L", "A-L", "A-L", "A-XL", "A-XL", "A-2XL", "A-3XL"];
const YOUTH = ["Y-S", "Y-M", "Y-M", "Y-L", "Y-XL"];
function binOf(r) {
  const stitched = r() < 0.6;
  const kind = r();                                            // a youth team, an adult team, a mixed order, one size (bins by size)
  const sizes = kind < 0.2 ? YOUTH : kind < 0.65 ? ADULT : kind < 0.85 ? [...ADULT, ...YOUTH] : [pick(r, [...ADULT, ...YOUTH])];
  const fill = r();                                            // the tail of an order, a part bin, a full one
  const n = fill < 0.3 ? 2 + Math.floor(r() * 8) : fill < 0.65 ? 8 + Math.floor(r() * 16) : 20 + Math.floor(r() * 24);
  const rows = Array.from({ length: n }, () => ({ size: pick(r, sizes) }));
  return { counts: binCounts(rows, stitched), n };
}

// The box the bin really goes in.
function reality(counts, truth, r) {
  if (weightOf(counts, truth) > truth.weightCap) return MORE;
  const load = loadOf(counts, truth) * Math.exp(gauss(r) * FOLD);
  const k = truth.caps.findIndex(c => load <= c);
  return k < 0 ? MORE : BOXES[k].id;
}
const ORDER = ["bag", ...BOXES.map(b => b.id), MORE];
const flatBox = n => { const b = boxFor(n); return b.boxes > 1 ? MORE : b.id; };

function runFactory(seed) {
  const r = rng(seed), truth = truthOf(r);
  const obs = []; let model = PRIOR;
  const rows = [];
  for (let i = 1; i <= BINS; i++) {
    const { counts, n } = binOf(r);
    const real = reality(counts, truth, r);
    rows.push({
      i, real,
      flat:    flatBox(n),
      prior:   predictBox(counts, PRIOR).id,
      learnt:  predictBox(counts, model).id,
      oracle:  predictBox(counts, truth).id,
      heavy:   weightOf(counts, truth) > truth.weightCap,
      warned:  weightOf(counts, model) > model.weightCap * 0.95,
    });
    // The tap: the box really used, now and then the one beside it.
    let said = real;
    if (r() < MISTAP) { const k = ORDER.indexOf(real) + (r() < 0.5 ? -1 : 1); said = ORDER[Math.max(1, Math.min(ORDER.length - 1, k))]; }
    obs.push({ counts, box: said });
    if (i <= 100 ? i % 5 === 0 : i <= 400 ? i % 25 === 0 : i % 100 === 0) model = fitBoxModel(obs.slice(-600), PRIOR, { start: model, iters: 150 });
  }
  return { rows, truth, model };
}

describe("packing simulation: the box a bin goes in", () => {
  it(`${FACTORIES} factories, ${BINS} bins each`, () => {
    const runs = Array.from({ length: FACTORIES }, (_, f) => runFactory(SEED + f * 7919));
    const all = runs.flatMap(x => x.rows);
    const pct = (xs, f) => xs.length ? (100 * xs.filter(f).length / xs.length).toFixed(1).padStart(5) + "%" : "    —";
    const dist = (a, b) => ORDER.indexOf(a) - ORDER.indexOf(b);
    const out = [];
    out.push(`PACKING SIMULATION — ${FACTORIES} factories × ${BINS} bins (seed ${SEED})`);
    out.push(`  each factory's truth is up to ${OFF * 100}% off the starting estimates; a bin packs ±${FOLD * 100}% tighter or looser; ${MISTAP * 100}% of taps are the wrong box`);
    out.push(`  real boxes: ${ORDER.slice(1).map(b => `${b} ${pct(all, x => x.real === b).trim()}`).join(" · ")}`);
    out.push("");
    out.push("  right box, by how many bins the station has seen:");
    out.push("    bins seen     flat count   size+weight   + learning   best possible");
    for (const [a, b] of WINDOWS) {
      const w = all.filter(x => x.i >= a && x.i <= b); if (!w.length) continue;
      out.push(`    ${(b > 1e8 ? `${a}+` : `${a}–${b}`).padEnd(12)}  ${pct(w, x => x.flat === x.real)}       ${pct(w, x => x.prior === x.real)}        ${pct(w, x => x.learnt === x.real)}       ${pct(w, x => x.oracle === x.real)}`);
    }
    const late = all.filter(x => x.i > 400);
    out.push("");
    out.push("  after 400 bins, when it is wrong:");
    for (const [name, k] of [["flat count", "flat"], ["size+weight", "prior"], ["+ learning", "learnt"], ["best possible", "oracle"]]) {
      out.push(`    ${name.padEnd(14)} box too small ${pct(late, x => dist(x[k], x.real) < 0)} · too big ${pct(late, x => dist(x[k], x.real) > 0)} · off by two or more ${pct(late, x => Math.abs(dist(x[k], x.real)) > 1)}`);
    }
    const heavy = all.filter(x => x.heavy);
    out.push("");
    out.push(`  weight: ${heavy.length} bins were really over ${PRIOR.weightCap} lb; the station warned (95% of the cap) on ${pct(heavy, x => x.warned).trim()} of them; said "one box" for ${pct(heavy, x => x.learnt !== MORE).trim()}`);
    // One factory's table: what it learnt against the truth.
    const { truth, model } = runs[0];
    const tt = capacityTable(truth), tm = capacityTable(model), tp = capacityTable(PRIOR);
    out.push("");
    out.push(`  factory 1 — jerseys that fill a box (small / medium / large): the truth, what it started with, what it learnt from ${model.seen} answers`);
    FEATURES.forEach((f, i) => out.push(`    ${f.padEnd(9)}  truth ${tt[i].boxes.join(" / ").padEnd(13)} started ${tp[i].boxes.join(" / ").padEnd(13)} learnt ${tm[i].boxes.join(" / ")}`));
    console.log(out.join("\n"));

    const acc = (xs, k) => xs.filter(x => x[k] === x.real).length / xs.length;
    expect(acc(late, "learnt")).toBeGreaterThan(acc(late, "prior"));
    expect(acc(late, "learnt")).toBeGreaterThan(acc(late, "flat"));
    expect(acc(late, "learnt")).toBeGreaterThan(acc(late, "oracle") - 0.03);     // within 3 points of the best any rule could do
    expect(heavy.filter(x => !x.warned).length / Math.max(1, heavy.length)).toBeLessThan(0.02);
    }, 120000);
});

describe("the box model", () => {
  it("reads sizes into classes", () => {
    expect(["Y-M", "A-S", "A-XL", "A-2XL", "XXL", "A-3XL", "Youth L", ""].map(sizeClass)).toEqual(["youth", "asm", "alx", "a2x", "a2x", "a3x", "youth", "alx"]);
    expect(featureOf("A-2XL", false)).toBe("a2x|su");
  });
  it("names the box by room, and splits by weight", () => {
    expect(predictBox({})).toBe(null);
    expect(predictBox({ "a2x|st": 1 }).id).toBe("bag");
    expect(predictBox({ "youth|su": 12 }).id).toBe("small");       // 6 units
    expect(predictBox({ "a2x|st": 12 }).id).toBe("medium");        // 12 units
    expect(predictBox({ "a2x|st": 30 }).id).toBe("large");         // 30 units, 42 lb
    const heavy = predictBox({ "a2x|st": 34 });                     // 34 units fit a large box by room, but 47.6 lb
    expect(heavy).toMatchObject({ id: MORE, boxes: 2, by: "weight" });
    expect(predictBox({ "youth|su": 150 })).toMatchObject({ id: MORE, by: "room" });
  });
  it("learns that a box holds less than it thought", () => {
    // Twenty answers: 14 adult 2XL stitched needed a large box, 12 still fitted a medium.
    const obs = [...Array(10).fill({ counts: { "a2x|st": 14 }, box: "large" }), ...Array(10).fill({ counts: { "a2x|st": 12 }, box: "medium" })];
    expect(predictBox({ "a2x|st": 14 }).id).toBe("medium");
    const m = fitBoxModel(obs);
    expect(m.seen).toBe(20);
    expect(predictBox({ "a2x|st": 14 }, m).id).toBe("large");
    expect(predictBox({ "a2x|st": 12 }, m).id).toBe("medium");
  });
});
