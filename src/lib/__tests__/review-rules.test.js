// The matching rules decided in the code review of 23 Nov 2026, one block per
// rule, each with the example that was decided on. If one of these fails, the
// app no longer does what Noam or the owner decided: change the rule with them,
// not the test.
//   N1  a doubtful read is always yellow                      (Noam)
//   N2  07 and 7 are different jerseys                        (Noam; the owner: trust the camera when both are on the roster)
//   N4  green needs the whole name                            (Noam; the owner: spaces and hyphens still ignored)
//   N5  a team's name never decides a green                   (Noam)
//   NN  a name read where the roster row has none is yellow   (the owner, also on a roster with no names)
import { describe, it, expect } from "vitest";
import { findMatches } from "../match.js";
import { parseCSV } from "../roster.js";

const row = (i, name, number, extra = {}) => ({ _id: i, name, number, team: "T", size: "A-L", scanned: false, ...extra });
const ids = m => (m.candidates || []).map(c => c._id);

describe("N1: a doubtful read is always yellow", () => {
  // The review's own example (finding H2): number-only roster with #4, #14 and #40.
  const roster = [row(0, "", "4"), row(1, "", "14"), row(2, "", "40")];
  it("a 4 the camera says is covered, off-centre, or on a jersey not laid flat is never green", () => {
    for (const read of [{ numberComplete: false }, { position: "right" }, { position: "left" }, { laidFlat: false }]) {
      expect(findMatches(roster, "", "4", read).type).not.toBe("exact");
    }
  });
  it("…also when the whole name and the number match one row exactly", () => {
    const r = [row(0, "Evanovich", "4"), row(1, "Nguyen", "23")];
    expect(findMatches(r, "EVANOVICH", "4", { numberComplete: false }).type).toBe("pick");
    expect(findMatches(r, "EVAN", "4", { nameComplete: false }).type).toBe("pick");
  });
  it("…also when the doubtful field came back empty (letters or digits seen but unreadable; found by the review's fuzz test)", () => {
    expect(findMatches([row(0, "", "5"), row(1, "", "23")], "", "5", { nameComplete: false }).type).toBe("pick");
    expect(findMatches([row(0, "Zhang", ""), row(1, "Li", "5")], "ZHANG", "", { numberComplete: false }).type).toBe("pick");
  });
  it("a typed number on a row with no number is not that row (typed SAMUEL 9 is not the numberless Samuel)", () => {
    expect(findMatches([row(0, "Samuel", ""), row(1, "Li", "5")], "SAMUEL", "9", { typed: true }).type).not.toBe("exact");
  });
  it("the same read, clean and complete, is green", () => {
    expect(findMatches(roster, "", "4", { numberComplete: true, laidFlat: true, position: "centre" })).toMatchObject({ type: "exact", match: { _id: 0 } });
  });
});

describe("N2: 07 and 7 are different jerseys", () => {
  const both = [row(0, "", "7"), row(1, "", "07")];
  it("a read of 07 is #07, a read of 7 is #7 (the camera is trusted, the owner 23 Nov 2026)", () => {
    expect(findMatches(both, "", "07")).toMatchObject({ type: "exact", match: { _id: 1 } });
    expect(findMatches(both, "", "7")).toMatchObject({ type: "exact", match: { _id: 0 } });
  });
  it("typed numbers the same way", () => {
    expect(findMatches(both, "", "07", { typed: true })).toMatchObject({ type: "exact", match: { _id: 1 } });
    expect(findMatches(both, "", "7", { typed: true })).toMatchObject({ type: "exact", match: { _id: 0 } });
  });
  it("only #7 on the roster: a read of 07 is a yellow near miss offering #7, never green", () => {
    const m = findMatches([row(0, "", "7"), row(1, "", "23")], "", "07");
    expect(m.type).not.toBe("exact");
    expect(ids(m)).toEqual([0]);
  });
  it("only #07 on the roster: a read of 7 is a yellow near miss offering #07, never green", () => {
    const m = findMatches([row(0, "", "07"), row(1, "", "23")], "", "7");
    expect(m.type).not.toBe("exact");
    expect(ids(m)).toEqual([0]);
  });
  it("a roster file keeps 07 as 07", () => {
    const r = parseCSV("Name,Number\nSmith,07\nJones,7\nBrown,00\n");
    expect(r.map(x => x.number)).toEqual(["07", "7", "00"]);
  });
});

describe("N4: green needs the whole name", () => {
  it("one word of a longer name is yellow with the row on the list", () => {
    const m = findMatches([row(0, "Van Dyk", "12"), row(1, "Nguyen", "23")], "DYK", "12");
    expect(m.type).toBe("pick");
    expect(ids(m)).toContain(0);
  });
  it("missing or extra letters are yellow", () => {
    expect(findMatches([row(0, "Smithe", "2")], "SMITH", "2").type).toBe("pick");
    expect(findMatches([row(0, "Smith", "2")], "SMITHE", "2").type).toBe("pick");
  });
  it("capitals, accents, apostrophes, spaces and hyphens do not matter", () => {
    expect(findMatches([row(0, "O'Neil", "5")], "ONEIL", "5").type).toBe("exact");
    expect(findMatches([row(0, "Côté", "5")], "COTE", "5").type).toBe("exact");
    expect(findMatches([row(0, "De La Cruz", "8")], "DELACRUZ", "8").type).toBe("exact");
    expect(findMatches([row(0, "De La Cruz", "8")], "DE-LA-CRUZ", "8").type).toBe("exact");
  });
  it("a stray #1 SAMUEL is not the roster's numberless Samuel (found by the reviewer in the 3000-order simulation)", () => {
    expect(findMatches([row(0, "Samuel", ""), row(1, "Nguyen", "23")], "SAMUEL", "1").type).not.toBe("exact");
  });
});

describe("N5: a team's name never decides a green", () => {
  it("twins on Cherry Hill and Silver Lake with a red or silver jersey seen stay yellow", () => {
    const r = [row(0, "Smith", "9", { team: "Cherry Hill" }), row(1, "Smith", "9", { team: "Silver Lake" })];
    expect(findMatches(r, "SMITH", "9", { colour: "red" }).type).toBe("pick");
    expect(findMatches(r, "SMITH", "9", { colour: "silver" }).type).toBe("pick");
  });
  it("a colour column still settles twins", () => {
    const r = [row(0, "", "9", { colour: "red" }), row(1, "", "9", { colour: "white" })];
    expect(findMatches(r, "", "9", { colour: "red" })).toMatchObject({ type: "exact", match: { _id: 0 } });
  });
  it("a twin with no colour on the roster is never ruled out by the other twin's colour", () => {
    const r = [row(0, "", "9", { colour: "red" }), row(1, "", "9")];
    expect(findMatches(r, "", "9", { colour: "red" }).type).toBe("pick");
  });
});

describe("NN: a name read where the roster row has no name is yellow", () => {
  it("on a roster with no names at all", () => {
    const r = [row(0, "", "5"), row(1, "", "23")];
    const m = findMatches(r, "ZHANG", "5");
    expect(m.type).toBe("pick");
    expect(ids(m)).toEqual([0]);
    expect(m.reason).toMatch(/no name/);
    expect(findMatches(r, "", "5")).toMatchObject({ type: "exact", match: { _id: 0 } });   // no name on the jersey: green as before
  });
  it("on a roster where only that row has no name", () => {
    const r = [row(0, "", "5"), row(1, "Nguyen", "23")];
    expect(findMatches(r, "ZHANG", "5").type).toBe("pick");
    expect(findMatches(r, "", "5")).toMatchObject({ type: "exact", match: { _id: 0 } });
  });
  it("typed by the operator, the typed name does not block the nameless row", () => {
    expect(findMatches([row(0, "", "5")], "ZHANG", "5", { typed: true }).type).toBe("exact");
  });
});

describe("phase 6 review: a team chosen by hand never passes a row whose name differs from the name typed", () => {
  it("the source: the team shortcut in manualSubmit needs the name to fit as well as the number", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync(new URL("../../App.jsx", import.meta.url), "utf8");
    expect(src).toMatch(/same\.length === 1 && numberFits\(same\[0\]\) && nameFits\(same\[0\]\)/);
    expect(src).toMatch(/const nameFits = r => !norm\(name\) \|\| !norm\(r\.name\) \|\| nameMatches\(name, r\.name\);/);
  });
});

describe("phase 6 review: a stray quote does not swallow roster rows", () => {
  it("a cell starting with an unclosed inch mark and a real quote later: every row is kept", () => {
    const r = parseCSV('Name,Number,Note\nSmith,5,"6 in\nJones,7,ok\nLee,9,ok\nKim,11,ok\nPark,12,"a, b"\n');
    expect(r.map(x => x.name)).toEqual(["Smith", "Jones", "Lee", "Kim", "Park"]);
  });
  it("a real line break inside a quoted cell still reads as one cell", () => {
    const r = parseCSV('Name,Number\n"Smith\nJr",5\nJones,7\n');
    expect(r.map(x => x.name)).toEqual(["Smith Jr", "Jones"]);
  });
});
