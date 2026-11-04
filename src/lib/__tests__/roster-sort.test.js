import { describe, it, expect } from "vitest";
import { sortRoster, ROSTER_SORTS, buildBinMap } from "../roster.js";

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
  it("by status puts what is still to do first, then flagged, by hand, passed", () => {
    expect(ids(sortRoster(roster, "status"))).toEqual([2, 4, 3, 5, 1]);
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
  it("leaves the roster itself alone and an unknown sort as it is", () => {
    const copy = roster.slice();
    sortRoster(roster, "size");
    expect(roster).toEqual(copy);
    expect(ids(sortRoster(roster, "nope"))).toEqual([1, 2, 3, 4, 5]);
  });
});
