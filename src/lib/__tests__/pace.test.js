// Pace from working time: a night with the tab left open is not working time.
import { describe, it, expect } from "vitest";
import { workingMinutes, pace, entryTime, CAP_MIN } from "../pace.js";

const T0 = new Date("2026-11-08T14:00:00").getTime();
const at = min => ({ id: T0 + min * 60000, timestamp: new Date(T0 + min * 60000).toISOString().slice(0, 19).replace("T", " "), status: "pass" });
const MIN = 60000;

describe("workingMinutes", () => {
  it("adds the gaps between scans and the gap to now", () => {
    const log = [at(0), at(2), at(5)];
    expect(workingMinutes(log, T0 + 6 * MIN)).toBeCloseTo(6);
  });
  it("caps every gap at CAP_MIN: a night away counts as one cap", () => {
    const log = [at(0), at(2), at(5), at(5 + 18 * 60)];              // the next scan is 18 hours later
    expect(workingMinutes(log, T0 + (5 + 18 * 60 + 1) * MIN)).toBeCloseTo(5 + CAP_MIN + 1);
  });
  it("a station standing idle now keeps the pace it had", () => {
    const log = [at(0), at(2), at(4)];
    expect(workingMinutes(log, T0 + 4 * MIN + 3 * 60 * MIN)).toBeCloseTo(4 + CAP_MIN);
  });
  it("the lead-in before the first entry counts, capped", () => {
    expect(workingMinutes([at(3)], T0 + 4 * MIN, { start: T0 })).toBeCloseTo(4);
    expect(workingMinutes([at(60)], T0 + 61 * MIN, { start: T0 })).toBeCloseTo(CAP_MIN + 1);
    expect(workingMinutes([], T0 + 3 * MIN, { start: T0 })).toBeCloseTo(3);
    expect(workingMinutes([], T0)).toBe(0);
  });
  it("entries out of order, or with only an id, still count", () => {
    const log = [at(5), { id: T0 + 2 * MIN, status: "flag" }, at(0)];
    expect(workingMinutes(log, T0 + 5 * MIN)).toBeCloseTo(5);
    expect(entryTime({ timestamp: "garbage", id: 7 })).toBe(7);
    expect(Number.isNaN(entryTime({}))).toBe(true);
  });
});

describe("pace", () => {
  it("rate and ETA from working time, not the clock", () => {
    const log = [at(0), at(2), at(4), at(6), at(8 + 16 * 60)];       // 4 passes in 8 min, then one the next morning
    const p = pace(log, 5, 20, T0 + (8 + 16 * 60 + 2) * MIN);
    expect(p.workingMin).toBeCloseTo(8 + CAP_MIN + 2);
    expect(p.rate).toBeCloseTo(5 / 20);
    expect(p.etaMin).toBe(80);                                        // 20 left at 4 a minute... 20 / 0.25
  });
  it("no rate until a minute of work and one pass", () => {
    expect(pace([at(0)], 1, 5, T0 + 30000).rate).toBeNull();
    expect(pace([at(0), at(2)], 0, 5, T0 + 3 * MIN).rate).toBeNull();
    expect(pace([at(0), at(2)], 2, 0, T0 + 3 * MIN).etaMin).toBeNull();
  });
});
