// tools/merge-hub-data.mjs: several copies of the hub's data file → one.
import { describe, it, expect } from "vitest";
import { mergeHub, summary } from "../../../tools/merge-hub-data.mjs";

const full = {
  stations: { "st-station1": { id: "st-station1", updatedAt: 100, orderNumber: "25" } },
  rosters: { r1: { id: "r1", orderNumber: "25" } },
  ledger: {
    "2026-11-10": { events: { "st-station1|1": { id: 1, status: "pass", t: "2026-11-10 09:00:00" } }, orders: { "st-station1|25|1": { order: "25", lastSeen: 50, counts: { pass: 1 } } } },
    "2026-11-17": { events: { "st-station1|7": { id: 7, status: "flagged", reason: "Twill peeling", photo: "PHOTO" } }, orders: { "st-station1|25|9": { order: "25", lastSeen: 90, counts: { pass: 3 } } } },
  },
  boxAnswers: [{ at: 1, station: "st-station1", order: "25", bin: "1.1", box: "small" }],
};
const small = {
  stations: { "st-station1": { id: "st-station1", updatedAt: 200, orderNumber: "256021" }, "st-station3": { id: "st-station3", updatedAt: 150 } },
  rosters: {},
  ledger: {
    "2026-11-17": {
      events: { "st-station1|7": { id: 7, status: "flagged", reason: "Twill peeling", resolution: "Sent to decoration" }, "st-station3|2": { id: 2, status: "pass" } },
      orders: { "st-station1|25|9": { order: "25", lastSeen: 60, counts: { pass: 2 } }, "st-station3|256021|5": { order: "256021", lastSeen: 300 } },
    },
  },
  boxAnswers: [{ at: 1, station: "st-station1", order: "25", bin: "1.1", box: "small" }, { at: 2, station: "st-station3", order: "256021", bin: "4.1", box: "large" }],
};

describe("putting copies of the hub's data back into one", () => {
  const m = mergeHub([full, small]);
  it("keeps every day, every scan and every order from both copies", () => {
    expect(Object.keys(m.ledger)).toEqual(["2026-11-10", "2026-11-17"]);
    expect(Object.keys(m.ledger["2026-11-17"].events).sort()).toEqual(["st-station1|7", "st-station3|2"]);
    expect(Object.keys(m.ledger["2026-11-17"].orders).length).toBe(2);
    expect(m.ledger["2026-11-10"].events["st-station1|1"].status).toBe("pass");
  });
  it("the same scan in two copies: the later copy's words, the photo from whichever has it", () => {
    const ev = m.ledger["2026-11-17"].events["st-station1|7"];
    expect(ev.resolution).toBe("Sent to decoration");
    expect(ev.photo).toBe("PHOTO");
    const back = mergeHub([small, full]).ledger["2026-11-17"].events["st-station1|7"];
    expect(back.photo).toBe("PHOTO");
    expect(back.resolution).toBe("Sent to decoration");          // a resolution is never lost to a copy that lacks it
  });
  it("the same order or station in two copies: the one seen last", () => {
    expect(m.ledger["2026-11-17"].orders["st-station1|25|9"].counts.pass).toBe(3);
    expect(m.stations["st-station1"].orderNumber).toBe("256021");
    expect(Object.keys(m.stations).sort()).toEqual(["st-station1", "st-station3"]);
  });
  it("box answers once each, rosters kept, and odd input ignored", () => {
    expect(m.boxAnswers.map(a => a.at)).toEqual([1, 2]);
    expect(m.rosters.r1.orderNumber).toBe("25");
    expect(mergeHub([null, undefined, 7, full]).ledger["2026-11-10"]).toBeTruthy();
    expect(mergeHub([])).toEqual({ stations: {}, rosters: {}, ledger: {}, boxAnswers: [] });
  });
  it("says what a file holds in one line", () => {
    expect(summary(m)).toBe("2 days (2026-11-10 to 2026-11-17), 3 orders, 3 scans, 2 stations, 2 box answers");
  });
});
