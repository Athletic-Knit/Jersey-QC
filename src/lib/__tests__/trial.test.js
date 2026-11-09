import { describe, it, expect } from "vitest";
import { summariseTrial, trialVerdict, trialCSV, trialRows, screenKindOf, modelDecision, modelScreens, KLM, median, MIN_PASSES_FOR_VERDICT } from "../trial.js";

const rec = (method, screen, idx, ms, extra = {}) => ({ t: 1_760_000_000_000, method, station: "st-station1", operator: "Sam", order: "55", run: 1, screen, n: 3, idx, id: idx === 0 ? (screen === "confirm" ? "confirm" : "c1") : "x", via: idx === 0 ? "key" : "pointer", key: idx === 0 ? "Enter" : "", ms, moves: 0, hovers: 0, ...extra });

describe("input trial records", () => {
  it("groups the overlay's modes into screen kinds", () => {
    expect(screenKindOf("confirm")).toBe("green");
    expect(screenKindOf("pick")).toBe("list"); expect(screenKindOf("close")).toBe("list");
    expect(screenKindOf("flag")).toBe("red"); expect(screenKindOf("duplicate")).toBe("red");
    expect(screenKindOf("reasons")).toBe("reasons"); expect(screenKindOf("supervisor")).toBe("supervisor");
    expect(screenKindOf("manualDone")).toBe("byhand"); expect(screenKindOf("camera")).toBe("camera");
    expect(screenKindOf("whatever")).toBe("other");
  });
  it("sums per setup: passes, screen time per pass, medians by kind; the scan trigger is left out of the navigation total", () => {
    const recs = [
      rec("mouse", "confirm", 0, 1000), rec("mouse", "confirm", 0, 3000), rec("mouse", "pick", 0, 2000), rec("mouse", "camera", 0, 500, { id: "scan" }),
      rec("keys", "confirm", 0, 1000), rec("keys", "reasons", 3, 4000, { via: "key", moves: 3 }),
    ];
    const s = summariseTrial(recs);
    expect(s.mouse.passes).toBe(3);
    expect(s.mouse.all.n).toBe(3);                 // the camera record is not navigation
    expect(s.mouse.byKind.camera.n).toBe(1);
    expect(s.mouse.secondsPerPass).toBe(2);        // 6 s over 3 passes
    expect(s.mouse.byKind.green.medianS).toBe(2);
    expect(s.keys.passes).toBe(1);
    expect(s.keys.byKind.reasons.movesPer).toBe(3);
    expect(s.keys.all.pointerShare).toBe(0);
    expect(s.mouse.all.firstOption).toBe(100);
    expect(s.mouse.orders).toBe(1); expect(s.mouse.operators).toBe(1);
  });
  it("median of an even and an odd list", () => { expect(median([3, 1, 2])).toBe(2); expect(median([4, 1, 3, 2])).toBe(2.5); expect(median([])).toBe(null); });
  it("the verdict refuses to decide on nothing, names the setup with no data, and warns on thin data", () => {
    expect(trialVerdict(summariseTrial([]))).toMatch(/Nothing recorded/);
    expect(trialVerdict(summariseTrial([rec("mouse", "confirm", 0, 1000)]))).toMatch(/Only "Mouse \+ pedal" has data/);
    const both = [...Array(20)].flatMap((_, i) => [rec("mouse", "confirm", 0, 1000 + i), rec("keys", "confirm", 0, 2500 + i)]);
    const v = trialVerdict(summariseTrial(both));
    expect(v).toMatch(/Mouse \+ pedal is faster over the whole order/);
    expect(v).toMatch(new RegExp(`at least ${MIN_PASSES_FOR_VERDICT} jerseys`));
    expect(v).toMatch(/One operator so far/);
  });
  it("the verdict calls a difference under 0.3 s per jersey a tie", () => {
    const both = [...Array(120)].flatMap((_, i) => [rec("mouse", "confirm", 0, 1000, { operator: i % 2 ? "A" : "B" }), rec("keys", "confirm", 0, 1100, { operator: i % 2 ? "A" : "B" })]);
    const v = trialVerdict(summariseTrial(both));
    expect(v).toMatch(/the same within a third of a second/);
    expect(v).not.toMatch(/Thin data/); expect(v).not.toMatch(/One operator/);
  });
  it("CSV: a header and one row per record, seconds from ms", () => {
    const csv = trialCSV([rec("keys", "pick", 2, 1234, { via: "key", key: "Enter", moves: 2 })]);
    const lines = csv.split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^time,setup,station/);
    expect(lines[1]).toContain("Up/down keys + pedal"); expect(lines[1]).toContain(",1.23,2,0");
    expect(trialRows([])).toEqual([]);
  });
});

describe("the Keystroke-Level Model behind the simulation", () => {
  it("the first option is the pedal in both setups: identical", () => {
    const d = modelDecision({ idx: 0 });
    expect(d.mouse).toBe(d.keys); expect(d.mouse).toBeCloseTo(KLM.M + KLM.F, 5);
  });
  it("one step down: the keys beat the mouse; a long way down: the mouse wins", () => {
    const one = modelDecision({ idx: 1 });
    expect(one.keys).toBeLessThan(one.mouse);
    const far = modelDecision({ idx: 6 });
    expect(far.mouse).toBeLessThan(far.keys);
    expect(far.mouse).toBe(one.mouse);              // pointing costs the same wherever the option is
  });
  it("skipped options (the mouse-only Retry on a green) cost the keys nothing", () => {
    expect(modelDecision({ idx: 2, skipped: 1 }).keys).toBe(modelDecision({ idx: 1 }).keys);
  });
  it("totals by kind add up", () => {
    const t = modelScreens([{ kind: "green", idx: 0 }, { kind: "green", idx: 0 }, { kind: "list", idx: 2 }]);
    expect(t.byKind.green.n).toBe(2); expect(t.byKind.list.n).toBe(1);
    expect(t.mouse).toBeCloseTo(t.byKind.green.mouse + t.byKind.list.mouse, 3);
    expect(t.keys).toBeCloseTo(t.byKind.green.keys + t.byKind.list.keys, 3);
  });
});
