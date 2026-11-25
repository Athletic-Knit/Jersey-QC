// The Packing screen's "Now" step and the list-printed test (the owner, 25 Nov 2026).
import { describe, it, expect } from "vitest";
import { nowStep, listUnchanged, listIds } from "../packing.js";
import { notInBox, isLastBox } from "../printjobs.js";
import { sessionBody } from "../persist.js";

describe("nowStep", () => {
  it("keeps scanning while jerseys are left to scan", () => {
    const s = nowStep({ toScan: 12, openBoxes: [{ count: 5, printed: false }] });
    expect(s.step).toBe("scan");
    expect(s.text).toBe("Now: keep scanning · 12 to go");
  });
  it("asks for the lists once everything is accounted for and a box has none", () => {
    expect(nowStep({ toScan: 0, openBoxes: [{ count: 5, printed: true }, { count: 3, printed: false }] }).step).toBe("print");
  });
  it("says finish when every list is printed", () => {
    expect(nowStep({ toScan: 0, openBoxes: [{ count: 5, printed: true }] }).step).toBe("finish");
  });
  it("a box with no jerseys never asks for a list", () => {
    expect(nowStep({ toScan: 0, openBoxes: [{ count: 0, printed: false }] }).step).toBe("finish");
    expect(nowStep({ toScan: 0, openBoxes: [] }).step).toBe("finish");
  });
  it("a printed box whose contents changed counts as unprinted", () => {
    const printed = listUnchanged(["1", "2"], listIds([{ _id: 1 }, { _id: 2 }, { _id: 3 }]));
    expect(nowStep({ toScan: 0, openBoxes: [{ count: 3, printed }] }).step).toBe("print");
  });
});

describe("listUnchanged", () => {
  it("is true for the same jerseys in any order", () => {
    expect(listUnchanged(["2", "1"], listIds([{ _id: 1 }, { _id: 2 }]))).toBe(true);
  });
  it("is false when a jersey came or went, or the list never printed", () => {
    expect(listUnchanged(["1", "2"], listIds([{ _id: 1 }]))).toBe(false);
    expect(listUnchanged(["1"], listIds([{ _id: 1 }, { _id: 2 }]))).toBe(false);
    expect(listUnchanged(["1", "2"], listIds([{ _id: 1 }, { _id: 3 }]))).toBe(false);
    expect(listUnchanged(undefined, [])).toBe(false);
  });
  // The gap the first build left: the box's jerseys stay the same, but its NOT IN BOX list does not.
  it("a jersey marked missing after the list printed makes the list changed", () => {
    const row = (id, scanned) => ({ _id: id, number: String(id), name: `P${id}`, team: "Navy", scanned });
    const pack = scanned3 => ({ roster: [row(1, "pass"), row(2, "pass"), row(3, scanned3)], binMap: { navy: "1.1" }, closedBins: [], flags: [] });
    const carried = p => listIds(p.roster.filter(r => r.scanned === "pass"), isLastBox(p, "1.1") ? notInBox(p, "1.1") : []);
    const printed = carried(pack(""));                          // #3 still to scan: no NOT IN BOX list went with it
    expect(printed).toEqual(["1", "2"]);
    expect(carried(pack("missing"))).toEqual(["1", "2", "out:3"]);
    expect(listUnchanged(printed, carried(pack("missing")))).toBe(false);
    expect(listUnchanged(carried(pack("flag")), carried(pack("flag")))).toBe(true);
  });
  it("what was printed is kept in the saved session, even at the smallest body", () => {
    const body = JSON.parse(sessionBody({ orderRun: 4242, roster: [], log: [], listPrinted: { "1.1": ["1", "2"] } }, 0));
    expect(body.listPrinted).toEqual({ "1.1": ["1", "2"] });
  });
});
