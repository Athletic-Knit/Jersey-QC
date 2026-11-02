import { describe, it, expect } from "vitest";
import { pruneLedger } from "../../../hub-plugin.js";

const day = (d, photo) => ({ events: { "st-a|1": { id: 1, t: d + " 09:00:00", status: "flagged", ...(photo ? { photo: "p", damagePhotos: ["d"] } : {}) } }, orders: {} });
const dates = n => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10));

describe("the hub's ledger keep", () => {
  it("keeps 90 days and drops the rest", () => {
    const led = Object.fromEntries(dates(100).map(d => [d, day(d, false)]));
    pruneLedger(led);
    const kept = Object.keys(led).sort();
    expect(kept.length).toBe(90);
    expect(kept[0]).toBe(dates(100)[10]);
  });
  it("strips photos from days older than the newest 14 and marks the event", () => {
    const ds = dates(20);
    const led = Object.fromEntries(ds.map(d => [d, day(d, true)]));
    pruneLedger(led);
    const ev = d => led[d].events["st-a|1"];
    expect(ev(ds[19]).photo).toBe("p");
    expect(ev(ds[6]).photo).toBe("p");
    expect(ev(ds[5]).photo).toBeUndefined();
    expect(ev(ds[5]).damagePhotos).toBeUndefined();
    expect(ev(ds[5]).photosPruned).toBe(true);
    expect(Object.keys(led).length).toBe(20);
  });
  it("leaves a short ledger alone", () => {
    const led = Object.fromEntries(dates(3).map(d => [d, day(d, true)]));
    pruneLedger(led);
    expect(Object.keys(led).length).toBe(3);
    expect(Object.values(led).every(d => d.events["st-a|1"].photo === "p")).toBe(true);
  });
});
