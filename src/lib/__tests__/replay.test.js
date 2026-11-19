import { describe, it, expect } from "vitest";
import { parseRead, replaySteps, findReplayRow } from "../replay.js";

describe("replay: the ledger's read text as a camera read", () => {
  it("number, doubt, name, cut-off name, not flat", () => {
    expect(parseRead("#93")).toMatchObject({ number: "93", name: "", number_complete: true, laid_flat: true, name_complete: true });
    expect(parseRead("#5? [not flat]")).toMatchObject({ number: "5", number_complete: false, laid_flat: false });
    expect(parseRead("#12 BAYCAT [not flat]")).toMatchObject({ number: "12", name: "BAYCAT", laid_flat: false });
    expect(parseRead("#40 SAMU… [not flat]")).toMatchObject({ number: "40", name: "SAMU", name_complete: false });
    expect(parseRead("#?")).toMatchObject({ number: "" });
    expect(parseRead("")).toBeNull();
  });
  it("steps: scans with what the operator did, marks from the table, skips for the rest", () => {
    const steps = replaySteps([
      { t: "2026-11-18 09:12:00", status: "pass", number: "23", size: "A-M", team: "11U DS", read: "#23 [not flat]" },
      { t: "2026-11-18 09:11:00", status: "flagged", number: "29", offRoster: true, read: "#29", reason: "Not on the roster — operator typed #29" },
      { t: "2026-11-18 09:13:00", status: "flagged", number: "10", size: "Y-L", team: "10U AA", read: "#10", reason: "Duplicate — scanned again after passing" },
      { t: "2026-11-18 09:14:00", status: "missing", number: "1", size: "Y-L", team: "13U A" },
      { t: "2026-11-18 09:15:00", status: "flagged", number: "21", size: "A-S", team: "18U A", reason: "Size label — found after it passed" },
    ]);
    expect(steps.map(s => s.kind)).toEqual(["scan", "scan", "scan", "missing", "skip"]);   // sorted by time
    expect(steps[0]).toMatchObject({ off: true, number: "29" });
    expect(steps[1]).toMatchObject({ off: false, dup: false, size: "A-M" });
    expect(steps[2]).toMatchObject({ dup: true });
  });
  it("finds the row of a step: open first, done on request", () => {
    const roster = [{ _id: 0, number: "7", size: "Y-M", team: "10U A", scanned: "pass" }, { _id: 1, number: "7", size: "Y-M", team: "10u a" }];
    const step = { number: "7", size: "Y-M", team: "10U A" };
    expect(findReplayRow(roster, step)._id).toBe(1);
    expect(findReplayRow(roster, step, true)._id).toBe(0);
    expect(findReplayRow(roster, { number: "8", size: "Y-M", team: "10U A" })).toBeNull();
  });
});
