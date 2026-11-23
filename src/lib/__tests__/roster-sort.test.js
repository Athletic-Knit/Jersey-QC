// The station's roster table (src/lib/roster.js): its sort (size, the rack
// order, by default), its filters' choices, and its search box ("7" is #7
// exactly, never #70; the owner, 17 Nov 2026).
import { describe, it, expect } from "vitest";
import { sortRoster, ROSTER_SORTS, buildBinMap, rosterChoices, rosterMatches } from "../roster.js";

const roster = [
  { _id: 1, name: "ZED",   number: "10", team: "Red",  size: "A-L",  scanned: "pass" },
  { _id: 2, name: "AMY",   number: "7",  team: "Blue", size: "Y-M",  scanned: false },
  { _id: 3, name: "BOB",   number: "7",  team: "Red",  size: "A-XS", scanned: "flag" },
  { _id: 4, name: "CAL",   number: "22", team: "Blue", size: "A-L",  scanned: false },
  { _id: 5, name: "DEE",   number: "3",  team: "Red",  size: "A-3XL", scanned: "manual" },
];
const ids = rows => rows.map(r => r._id);

describe("the roster table's sort", () => {
  it("offers size first", () => { expect(ROSTER_SORTS[0].id).toBe("size"); });
  it("by size is the rack order: youth, then adult XS … 3XL; numbers within a size", () => {
    expect(ids(sortRoster(roster, "size"))).toEqual([2, 3, 1, 4, 5]);
  });
  it("by status puts the done ones on top: passed, by hand, flagged, then still to scan", () => {
    expect(ids(sortRoster(roster, "status"))).toEqual([1, 5, 3, 2, 4]);
  });
  it("by status, to-do on top: still to scan, flagged, by hand, passed", () => {
    expect(ids(sortRoster(roster, "status", null, { doneFirst: false }))).toEqual([2, 4, 3, 5, 1]);
  });
  it("offers the order's sizes in rack order and its teams by name, for the filter", () => {
    expect(rosterChoices(roster)).toEqual({ sizes: ["Y-M", "A-XS", "A-L", "A-3XL"], teams: ["Blue", "Red"] });
  });
  it("by number is numeric, not text (3 before 10 before 22)", () => {
    expect(ids(sortRoster(roster, "number"))).toEqual([5, 2, 3, 1, 4]);
  });
  it("by name, by team", () => {
    expect(ids(sortRoster(roster, "name"))).toEqual([2, 3, 4, 5, 1]);
    expect(ids(sortRoster(roster, "team")).slice(0, 2).sort()).toEqual([2, 4]);
  });
  it("by bin follows the bin map", () => {
    const bins = buildBinMap(roster, {}, "team");   // Blue = 1, Red = 2
    const out = sortRoster(roster, "bin", bins);
    expect(ids(out).slice(0, 2).sort()).toEqual([2, 4]);
  });
  it("by box uses the box the station says a jersey is in, done ones first inside a box", () => {
    const bins = buildBinMap(roster, {}, "team");
    const closed = { 2: "1.1" };                       // row 2 sits in a closed box, its team has moved on to 1.2
    const binOf = r => closed[r._id] || (bins[String(r.team).toLowerCase()] === "1.1" ? "1.2" : bins[String(r.team).toLowerCase()]);
    const out = sortRoster(roster, "bin", bins, { binOf });
    expect(ids(out)).toEqual([2, 4, 1, 5, 3]);         // box 1.1, then 1.2, then 2.1: its two done jerseys before the flagged one
    expect(ids(sortRoster(roster, "bin", bins, { binOf, doneFirst: false })).slice(2)).toEqual([3, 5, 1]);
  });
  it("leaves the roster itself alone and an unknown sort as it is", () => {
    const copy = roster.slice();
    sortRoster(roster, "size");
    expect(roster).toEqual(copy);
    expect(ids(sortRoster(roster, "nope"))).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("the roster table's search", () => {
  const hit = q => roster.filter(r => rosterMatches(r, q)).map(r => r._id);
  it("nothing typed shows everything", () => {
    expect(hit("")).toEqual([1, 2, 3, 4, 5]);
    expect(hit("   ")).toEqual([1, 2, 3, 4, 5]);
  });
  it("digits are the jersey number, exactly; # is allowed", () => {
    expect(hit("7")).toEqual([2, 3]);                  // both #7s, not #70 or #17
    expect(hit("#22")).toEqual([4]);
    expect(hit("2")).toEqual([]);                      // 22 is not 2
    expect(rosterMatches({ number: "00" }, "0")).toBe(false);   // 00 and 0 are different jerseys
    expect(rosterMatches({ number: "00" }, "00")).toBe(true);
  });
  it("letters are part of the name or the team, any case", () => {
    expect(hit("am")).toEqual([2]);
    expect(hit("BLUE")).toEqual([2, 4]);
    expect(hit("zz")).toEqual([]);
  });
  it("several words must all match", () => {
    expect(hit("7 red")).toEqual([3]);
    expect(hit("blue 22")).toEqual([4]);
    expect(hit("7 cal")).toEqual([]);
  });
});
