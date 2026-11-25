// The Packing screen's "Now" step and the list-printed test (the owner, 25 Nov 2026).
import { describe, it, expect } from "vitest";
import { nowStep, listUnchanged, boxIds } from "../packing.js";
import { sessionBody } from "../persist.js";

describe("nowStep", () => {
  it("keeps scanning while jerseys are left to scan", () => {
    const s = nowStep({ toScan: 12, openBoxes: [{ bin: "1.1", count: 5, printed: false }] });
    expect(s.step).toBe("scan");
    expect(s.text).toBe("Now: keep scanning · 12 to go");
  });
  it("asks for the lists once everything is accounted for and a box has none", () => {
    const s = nowStep({ toScan: 0, openBoxes: [{ bin: "1.1", count: 5, printed: true }, { bin: "2.1", count: 3, printed: false }] });
    expect(s.step).toBe("print");
    expect(s.unprinted).toBe(1);
  });
  it("says finish when every list is printed", () => {
    expect(nowStep({ toScan: 0, openBoxes: [{ bin: "1.1", count: 5, printed: true }] }).step).toBe("finish");
  });
  it("a box with no jerseys never asks for a list", () => {
    expect(nowStep({ toScan: 0, openBoxes: [{ bin: "1.2", count: 0, printed: false }] }).step).toBe("finish");
    expect(nowStep({ toScan: 0, openBoxes: [] }).step).toBe("finish");
  });
  it("a printed box whose contents changed counts as unprinted", () => {
    const printed = listUnchanged(["1", "2"], boxIds([{ _id: 1 }, { _id: 2 }, { _id: 3 }]));
    expect(nowStep({ toScan: 0, openBoxes: [{ bin: "1.1", count: 3, printed }] }).step).toBe("print");
  });
});

describe("listUnchanged", () => {
  it("is true for the same jerseys in any order", () => {
    expect(listUnchanged(["2", "1"], boxIds([{ _id: 1 }, { _id: 2 }]))).toBe(true);
  });
  it("is false when a jersey came or went, or the list never printed", () => {
    expect(listUnchanged(["1", "2"], boxIds([{ _id: 1 }]))).toBe(false);
    expect(listUnchanged(["1"], boxIds([{ _id: 1 }, { _id: 2 }]))).toBe(false);
    expect(listUnchanged(["1", "2"], boxIds([{ _id: 1 }, { _id: 3 }]))).toBe(false);
    expect(listUnchanged(undefined, [])).toBe(false);
  });
  it("what was printed is kept in the saved session, even at the smallest body", () => {
    const body = JSON.parse(sessionBody({ orderRun: 4242, roster: [], log: [], listPrinted: { "1.1": ["1", "2"] } }, 0));
    expect(body.listPrinted).toEqual({ "1.1": ["1", "2"] });
  });
});
