import { describe, it, expect } from "vitest";
import { findMatches, subNumberCandidates, differingFields, isPlausibleNumber } from "../match.js";

const row = (i, name, number, team = "T", size = "A-L", extra = {}) => ({ _id: i, name, number, team, size, scanned: false, ...extra });
const roster = [
  row(0, "Thompson", "7",  "Ravens", "A-L"),
  row(1, "MacDonald", "7", "Wolves", "Y-L"),
  row(2, "Nguyen", "23",   "Ravens", "A-M"),
  row(3, "Yamamoto", "19", "Titans", "A-L"),
  row(4, "Côté", "77",     "Titans", "A-XL"),
  row(5, "Smith", "6",     "Titans", "A-S"),
  row(6, "", "35",         "grey",   "A-S"),
  row(7, "", "35",         "sky blue", "A-S"),
  row(8, "", "8",          "lime",   "A-M"),
  row(9, "Jordan Blake", "10", "Ravens", "A-L"),
];
const numberOnly = [row(0, "", "7"), row(1, "", "88"), row(2, "", "8")];

describe("findMatches: exact and ambiguity", () => {
  it("green when name and number agree on one row", () => {
    expect(findMatches(roster, "NGUYEN", "23")).toMatchObject({ type: "exact", match: { _id: 2 } });
  });
  it("yellow when the number is shared and no name was read", () => {
    const m = findMatches(roster, "", "7");
    expect(m.type).toBe("pick");
    expect(m.candidates.map(c => c._id).slice(0, 2)).toEqual([0, 1]);
    expect(m.candidates.map(c => c._id)).toContain(4);      // #77: a hidden digit would make 7 from it
  });
  it("yellow for colour-only twins, never green", () => {
    const m = findMatches(roster, "", "35");
    expect(m.type).toBe("pick");
    expect(m.candidates).toHaveLength(2);
  });
  it("accents do not break the match", () => {
    expect(findMatches(roster, "COTE", "77").type).toBe("exact");
  });
  it("surname matches a full roster name", () => {
    expect(findMatches(roster, "BLAKE", "10")).toMatchObject({ type: "exact", match: { _id: 9 } });
  });
});

describe("findMatches: the dangerous cases", () => {
  it("right name, wrong number → the name's row is offered first, not green", () => {
    const m = findMatches(roster, "SMITH", "9");
    expect(m.type).toBe("pick");
    expect(m.candidates[0]._id).toBe(5);
  });
  it("right name, number that exists elsewhere → both offered, name's row first, never green", () => {
    const m = findMatches(roster, "SMITH", "19");           // #19 is Yamamoto
    expect(m.type).toBe("pick");
    expect(m.candidates.map(c => c._id)).toEqual([5, 3]);
  });
  it("sleeve merge: 777 is not a jersey; offers 77 and 7", () => {
    const m = findMatches(roster, "", "777");
    expect(m.type).toBe("pick");
    expect(m.candidates.map(c => c.number)).toEqual(["77", "7", "7"]);
  });
  it("sleeve merge with a name read: Côté 777 → Côté first", () => {
    const m = findMatches(roster, "COTE", "777");
    expect(m.candidates[0]._id).toBe(4);
  });
  it("number-only roster: a two-digit misread that is a real row still matches (prompt + SOP guard this)", () => {
    expect(findMatches(numberOnly, "", "77").type).toBe("close");
    expect(findMatches(numberOnly, "", "88")).toMatchObject({ type: "exact", match: { _id: 1 } });
  });
  it("same jersey twice → duplicate, not a second green", () => {
    const r2 = roster.map(r => r._id === 3 ? { ...r, scanned: "pass" } : r);
    expect(findMatches(r2, "YAMAMOTO", "19").type).toBe("duplicate");
    const n2 = numberOnly.map(r => r._id === 1 ? { ...r, scanned: "pass" } : r);
    expect(findMatches(n2, "", "88").type).toBe("duplicate");
  });
  it("a flagged row is with the supervisor: scanning it again shows the flag, not a green", () => {
    const r2 = roster.map(r => r._id === 3 ? { ...r, scanned: "flag" } : r);
    expect(findMatches(r2, "YAMAMOTO", "19")).toMatchObject({ type: "duplicate", match: { _id: 3 } });
  });
});

describe("findMatches: fuzzy fallback", () => {
  it("#10 not on a roster suggests a one-digit substitution only, not every number containing 1", () => {
    const r = [row(0, "", "1"), row(1, "", "19"), row(2, "", "100"), row(3, "", "41")];
    const m = findMatches(r, "", "10");
    expect(m.type).toBe("close");
    expect(m.candidates.map(c => c.number)).toEqual(["19"]);
  });
  it("a one-digit read is near two-digit rows that contain it (a fold hid a digit)", () => {
    const r = [row(0, "", "19"), row(1, "", "41"), row(2, "", "23")];
    const m = findMatches(r, "", "1");
    expect(m.type).toBe("close");
    expect(m.candidates.map(c => c.number).sort()).toEqual(["19", "41"]);
  });
  it("#88 on a number-only roster with only #8 is a near miss, not a confident match", () => {
    const m = findMatches([row(0, "", "8")], "", "88");
    expect(m.type).toBe("close");
  });
  it("nothing near → none", () => {
    expect(findMatches(roster, "ZIELINSKI", "56").type).toBe("none");
  });
});

describe("helpers", () => {
  it("isPlausibleNumber", () => {
    expect(isPlausibleNumber("7")).toBe(true);
    expect(isPlausibleNumber("00")).toBe(true);
    expect(isPlausibleNumber("777")).toBe(false);
  });
  it("subNumberCandidates prefers two-digit substrings", () => {
    expect(subNumberCandidates("223", roster).map(c => c.number)).toEqual(["23"]);
  });
  it("differingFields finds what to headline", () => {
    expect(differingFields([roster[6], roster[7]], ["name", "number", "team", "size"])).toEqual(["team"]);
    expect(differingFields([roster[0], roster[1]], ["name", "number", "team", "size"])).toEqual(["name", "team", "size"]);
  });
});

describe("a name with no number, from the camera", () => {
  const two = [{ _id: 1, number: "22", name: "Stephenson" }, { _id: 2, number: "5", name: "" }];
  it("is a question when the row carries a number the camera did not read (the two-jerseys frame)", () => {
    const m = findMatches(two, "STEPHENSON", "", {});
    expect(m.type).toBe("pick");
    expect(m.soft).toBe(true);
    expect(m.candidates.map(r => r._id)).toEqual([1]);
    expect(m.reason).toMatch(/no number/);
  });
  it("is still a question when every other row has passed", () => {
    const m = findMatches([{ _id: 1, number: "22", name: "Stephenson" }, { _id: 2, number: "5", name: "", scanned: "pass" }], "STEPHENSON", "", {});
    expect(m.type).toBe("pick");
  });
  it("goes green on a row that has no number of its own", () => {
    const m = findMatches([{ _id: 1, number: "", name: "Tremblay" }, { _id: 2, number: "7", name: "Ng" }], "TREMBLAY", "", {});
    expect(m).toMatchObject({ type: "exact", match: { _id: 1 } });
  });
  it("typed by the operator, the name alone settles", () => {
    const m = findMatches(two, "Stephenson", "", { typed: true });
    expect(m).toMatchObject({ type: "exact", match: { _id: 1 } });
  });
  it("a passed row is a duplicate, not a question", () => {
    const m = findMatches([{ _id: 1, number: "22", name: "Stephenson", scanned: "pass" }], "STEPHENSON", "", {});
    expect(m.type).toBe("duplicate");
  });
});

// A list only ever offers jerseys still to do: a row that has passed is not a
// choice, and it is not shown greyed out either.
describe("done rows stay off the list", () => {
  const roster = [
    { _id: 0, name: "",      number: "7",  team: "blue",   size: "Y-XL" },
    { _id: 1, name: "",      number: "70", team: "blue",   size: "A-XL" },
    { _id: 2, name: "",      number: "37", team: "yellow", size: "A-S", scanned: "pass" },
    { _id: 3, name: "BROWN", number: "71", team: "blue",   size: "A-M" },
    { _id: 4, name: "",      number: "72", team: "green",  size: "A-L", scanned: "flag" },
    { _id: 5, name: "",      number: "17", team: "red",    size: "A-L" },
  ];
  const reads = [
    ["7",  "",      { numberComplete: false, obstruction: "the jersey is not laid flat" }],
    ["7",  "",      { position: "left" }],
    ["3",  "",      { numberComplete: false }],
    ["71", "BROWM", {}],
    ["77", "",      {}],
  ];
  it("no pick or close list carries a passed or flagged row", () => {
    let lists = 0;
    for (const [number, name, read] of reads) {
      const m = findMatches(roster, name, number, read);
      if (m.type === "pick" || m.type === "close") {
        lists++;
        expect(m.candidates.length).toBeGreaterThan(0);
        expect(m.candidates.some(c => c.scanned)).toBe(false);
      }
    }
    expect(lists).toBeGreaterThan(0);
  });
  it("a list on which every row is done is still a duplicate", () => {
    const all = [{ _id: 0, name: "", number: "84", team: "red", scanned: "pass" }, { _id: 1, name: "", number: "84", team: "blue", scanned: "pass" }];
    expect(findMatches(all, "", "84", {}).type).toBe("duplicate");
  });
});
