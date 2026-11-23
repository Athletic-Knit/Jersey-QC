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
  // Code review of 23 Nov 2026: typed SMITH 12 went green on #12 LEE.
  it("a typed name that is not the row's name is a question, not that row passed", () => {
    const r = findMatches(roster, "BROWN", "12", { typed: true });
    expect(r.type).toBe("pick");
    expect(r.candidates.map(c => c._id)).toEqual([1]);
    expect(r.reason).toBe("You typed BROWN, but #12 is LEE on the roster — which one?");
    const r2 = findMatches(roster, "SMITH", "12", { typed: true });   // SMITH is #40
    expect(r2.type).toBe("pick");
    expect(r2.candidates.map(c => c._id).sort()).toEqual([1, 3]);
    expect(r2.reason).toMatch(/You typed SMITH #12, but SMITH is #40/);
  });
  it("a typed name that is the row's name (capitals, accents ignored) is that row", () => {
    expect(findMatches(roster, "lee", "12", { typed: true })).toMatchObject({ type: "exact", match: { _id: 1 } });
    expect(findMatches([{ _id: 9, name: "CÔTÉ", number: "3" }], "cote", "3", { typed: true })).toMatchObject({ type: "exact", match: { _id: 9 } });
  });
  it("a typed name that fits one row is still that row", () => {
    expect(findMatches(roster, "SMITH", "", { typed: true })).toMatchObject({ type: "exact", match: { _id: 3 } });
  });
});
