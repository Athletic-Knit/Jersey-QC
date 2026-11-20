// "Replay an order" on the testing server (the owner, 20 Nov 2026): the runs of
// a floor order are found in the hub data files, read only (replay-plugin.js).
import { describe, it, expect } from "vitest";
import { replayRuns } from "../../../replay-plugin.js";

const day = (events, orders) => ({ events, orders });
const floor = {
  ledger: {
    "2026-11-18": day(
      { "st-station1|1": { id: 1, station: "st-station1", order: "263577", run: 5, t: "2026-11-18 09:10:54", status: "pass", read: "#93", number: "93", photo: "data:…" },
        "st-station1|2": { id: 2, station: "st-station1", order: "999", run: 7, t: "2026-11-18 09:11:00", status: "pass", read: "#1", number: "1" } },
      { "st-station1|263577|5": { station: "st-station1", order: "263577", run: 5, operator: "Pat", lastSeen: 100, jerseyType: "echl", bins: { __by: "size" },
          rows: [{ _id: 0, number: "93", size: "Y-M", team: "10U", scanned: "pass" }, { _id: 1, number: "7", size: "A-L", team: "10U", scanned: false }] } }),
    "2026-11-19": day(
      { "st-station1|3": { id: 3, station: "st-station1", order: "263577", run: 5, t: "2026-11-19 08:00:00", status: "pass", read: "#7", number: "7" } },
      { "st-station1|263577|5": { station: "st-station1", order: "263577", run: 5, operator: "Pat", lastSeen: 200, rows: [] } }),
  },
};
const mine = { ledger: { "2026-11-20": day(
  { "st-station2|9": { id: 9, station: "st-station2", order: "263577", run: 8, t: "2026-11-20 10:00:00", status: "pass", read: "#93" } },
  { "st-station2|263577|8": { station: "st-station2", order: "263577", run: 8, lastSeen: 999, rows: [{ number: "93" }] },
    "st-station3|263577|9": { station: "st-station3", order: "263577", run: 9, lastSeen: 1000, rows: [{ number: "93" }] } }) } };

describe("replayRuns", () => {
  const runs = replayRuns([{ label: "floor", state: floor }, { label: "this testing server", state: mine }], "263577");
  it("one run per station and start, the floor's first, a run with no scans left out", () => {
    expect(runs.map(r => [r.source, r.station, r.run])).toEqual([["floor", "st-station1", 5], ["this testing server", "st-station2", 8]]);
  });
  it("the events of every day the run went on, oldest first, no photos; only that order's", () => {
    expect(runs[0].events.map(e => e.id)).toEqual([1, 3]);
    expect(runs[0].events[0].photo).toBeUndefined();
  });
  it("the roster without its statuses (the newest record that has rows), and how it was sorted", () => {
    expect(runs[0].rows).toEqual([{ number: "93", size: "Y-M", team: "10U" }, { number: "7", size: "A-L", team: "10U" }]);
    expect(runs[0]).toMatchObject({ total: 2, done: 1, binBy: "size", jerseyType: "echl", operator: "Pat" });
  });
  it("nothing for no number or an order nobody ran", () => {
    expect(replayRuns([{ label: "floor", state: floor }], "")).toEqual([]);
    expect(replayRuns([{ label: "floor", state: floor }], "123")).toEqual([]);
  });
});
