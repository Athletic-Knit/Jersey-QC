// The loop of an unfinished order (the owner, 20 Nov 2026): what is still out,
// in groups, and what the supervisor settled coming back to the station.
import { describe, it, expect } from "vitest";
import { outList, outGroups, applyCheckOff, jerseyWords } from "../orderstore.js";

const roster = [
  { _id: 0, number: "7", name: "SMITH", size: "A-L", team: "Navy", scanned: "pass" },
  { _id: 1, number: "9", name: "JONES", size: "A-M", team: "Navy", scanned: "flag" },
  { _id: 2, number: "11", name: "BROWN", size: "A-S", team: "Red", scanned: "missing" },
  { _id: 3, number: "12", name: "WHITE", size: "A-XL", team: "Red", scanned: false },
];
const log = [
  { id: 50, status: "flagged", match: { number: "29", size: "A-M", offRoster: true }, reason: "Not on the roster — #29 A-M" },
  { id: 40, status: "flagged", match: { ...roster[1] }, reason: "Name or number — found after it passed" },
  { id: 30, status: "flagged", match: { number: "5", noRow: true }, reason: "No size tag", resolution: "Dealt with by the supervisor" },
];

describe("what is still out", () => {
  const out = outList(roster, log);
  it("every row not passed, and every extra jersey not dealt with", () => {
    expect(out.map(j => [j.rowId, j.xid ?? null, j.status])).toEqual([[1, null, "flag"], [2, null, "missing"], [3, null, "todo"], [null, 50, "extra"]]);
    expect(out[0].reason).toBe("Name or number");
  });
  it("grouped for the screens, in plain words", () => {
    const g = outGroups(out);
    expect([g.flag.length, g.missing.length, g.extra.length, g.todo.length]).toEqual([1, 1, 1, 1]);
    expect(jerseyWords(g.flag[0])).toBe("#9 JONES A-M");
  });
});

describe("what the supervisor settled, applied at the station", () => {
  const rec = { session: { roster, log } };
  const entry = { checkedOff: [{ rowId: 1, by: "Sam", at: 1, as: "pass" }, { rowId: 2, by: "Sam", at: 1, as: "short" }, { rowId: null, xid: 50, by: "Sam", at: 1, as: "done" }], closed: null };
  const got = applyCheckOff(rec, entry).session;
  it("back and good passes, shipped short is short, each with a log line", () => {
    expect(got.roster.map(r => r.scanned)).toEqual(["pass", "pass", "short", false]);
    expect(got.log.slice(0, 2).map(l => [l.status, l.reason])).toEqual([["short", "Shipped short — supervisor"], ["pass", "Checked off by supervisor"]]);   // newest first, like every log
  });
  it("an extra jersey's flag is closed", () => {
    expect(got.log.find(l => l.id === 50).resolution).toBe("Dealt with by the supervisor (Sam)");
    expect(outList(got.roster, got.log).map(j => j.status)).toEqual(["short", "todo"]);
  });
  it("applied twice, nothing changes the second time", () => {
    const again = applyCheckOff({ session: got }, entry).session;
    expect(again.log.length).toBe(got.log.length);
  });
});
