// A typed number is the number (20 Nov 2026): typed 400 with #40 the only
// near row was passed as #40 by hand, typed 122 as #12.
import { describe, it, expect } from "vitest";
import { findMatches } from "../match.js";

const roster = [
  { _id: 1, name: "LEE", number: "12", team: "Red", size: "A-M" },
  { _id: 2, name: "JONES", number: "7", team: "Navy", size: "A-L" },
  { _id: 3, name: "SMITH", number: "40", team: "Navy", size: "A-XL" },
];

describe("a typed number is never turned into another row's number", () => {
  it("typed 400 and 122 are questions, not #40 and #12", () => {
    for (const n of ["400", "122"]) {
      const r = findMatches(roster, "", n, { typed: true });
      expect(r.type).not.toBe("exact");
    }
  });
  it("typed 40 and 12 are still those rows", () => {
    expect(findMatches(roster, "", "40", { typed: true })).toMatchObject({ type: "exact", match: { _id: 3 } });
    expect(findMatches(roster, "", "12", { typed: true })).toMatchObject({ type: "exact", match: { _id: 1 } });
  });
  it("a typed name that fits one row is still that row", () => {
    expect(findMatches(roster, "SMITH", "", { typed: true })).toMatchObject({ type: "exact", match: { _id: 3 } });
  });
});
