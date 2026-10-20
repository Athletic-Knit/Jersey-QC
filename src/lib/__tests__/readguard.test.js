import { describe, it, expect } from "vitest";
import { findMatches } from "../match.js";
import { parseModelText, normPosition } from "../vision.js";

const row = (i, name, number, team = "T", size = "A-L", extra = {}) => ({ _id: i, name, number, team, size, scanned: false, ...extra });

// The demo roster: #40 Samuel, #4 Evanovich, #14 Nguyen.
const named = [
  row(0, "Samuel", "40"),
  row(1, "Evanovich", "4"),
  row(2, "Nguyen", "14"),
  row(3, "MacDonald", "7"),
];
const ids = m => m.candidates.map(c => c._id);

describe("green needs a name and a number", () => {
  it("full read of name and number → green", () => {
    expect(findMatches(named, "SAMUEL", "40")).toMatchObject({ type: "exact", match: { _id: 0 } });
  });
  it("the demo break: #40 with the 0 hidden reads as #4, no name → yellow, #4 first then #40 and #14", () => {
    const m = findMatches(named, "", "4");
    expect(m.type).toBe("pick");
    expect(ids(m)[0]).toBe(1);
    expect(ids(m)).toEqual(expect.arrayContaining([0, 2]));
    expect(m.reason).toMatch(/no name/);
  });
  it("number read, no name, the only candidate already passed → duplicate", () => {
    const r = [row(0, "Smith", "9", "T", "A-L", { scanned: "pass" })];
    expect(findMatches(r, "", "9").type).toBe("duplicate");
  });
  it("name read, no number, two Stephensons open → yellow between them", () => {
    const r = [row(0, "Stephenson", "22", "A"), row(1, "Stephenson", "9", "B")];
    const m = findMatches(r, "STEPHENSON", "");
    expect(m.type).toBe("pick");
    expect(ids(m)).toEqual([0, 1]);
    expect(m.reason).toMatch(/#22 \/ 9/);
  });
  it("name from one jersey, number from another on top → yellow with both rows", () => {
    const r = [row(0, "Stephenson", "22"), row(1, "", "5")];
    const m = findMatches(r, "STEPHENSON", "5");
    expect(m.type).toBe("pick");
    expect(ids(m)).toEqual(expect.arrayContaining([0, 1]));
  });
  it("name read, no number, that row already passed → duplicate", () => {
    const r = [row(0, "Stephenson", "22", "T", "A-L", { scanned: "pass" })];
    expect(findMatches(r, "STEPHENSON", "").type).toBe("duplicate");
  });
  it("typed name alone is still green", () => {
    expect(findMatches([row(0, "Stephenson", "22")], "Stephenson", "", { typed: true }).type).toBe("exact");
  });
  it("typed by the operator: number alone is still green (no camera doubt)", () => {
    expect(findMatches(named, "", "4", { typed: true })).toMatchObject({ type: "exact", match: { _id: 1 } });
  });
  it("name SAMUEL with number read as #4 → yellow, Samuel first", () => {
    const m = findMatches(named, "SAMUEL", "4");
    expect(m.type).toBe("pick");
    expect(ids(m)[0]).toBe(0);
  });
  it("mixed roster: a row with no name of its own goes green on a clean number read", () => {
    const r = [row(0, "Samuel", "40"), row(1, "", "54"), row(2, "", "7")];
    expect(findMatches(r, "", "54")).toMatchObject({ type: "exact", match: { _id: 1 } });
    expect(findMatches(r, "", "40")).toMatchObject({ type: "exact", match: { _id: 0 } });   // Samuel's name not read, but no other row could be #40
    const r2 = [...r, row(3, "", "4")];
    expect(findMatches(r2, "", "4").type).toBe("exact");                              // clean, complete read of the nameless #4: green
    expect(findMatches(r2, "", "4", { numberComplete: false }).type).toBe("pick");    // doubtful read: #40 is open, so ask
  });
  it("number-only roster still goes green on a clean read", () => {
    const r = [row(0, "", "40"), row(1, "", "4")];
    expect(findMatches(r, "", "4")).toMatchObject({ type: "exact", match: { _id: 1 } });
  });
});

describe("no alternative, no yellow", () => {
  it("one #4 with no name on the roster, clean read → green", () => {
    const r = [row(0, "", "4"), row(1, "Nguyen", "23")];
    expect(findMatches(r, "", "4")).toMatchObject({ type: "exact", match: { _id: 0 } });
  });
  it("two #4 rows with no name → yellow", () => {
    const r = [row(0, "", "4", "red"), row(1, "", "4", "blue")];
    expect(findMatches(r, "", "4").type).toBe("pick");
  });
  it("#4 read flagged covered, and no other open row a hidden digit could make → green on #4", () => {
    const r = [row(0, "Evanovich", "4"), row(1, "Nguyen", "23")];
    expect(findMatches(r, "", "4", { numberComplete: false })).toMatchObject({ type: "exact", match: { _id: 0 } });
  });
  it("same read while #40 is still open → yellow", () => {
    const r = [row(0, "Evanovich", "4"), row(1, "Samuel", "40")];
    expect(findMatches(r, "", "4", { numberComplete: false }).type).toBe("pick");
  });
  it("same read once #40 has passed → green on #4", () => {
    const r = [row(0, "Evanovich", "4"), row(1, "Samuel", "40", "T", "A-L", { scanned: "pass" })];
    expect(findMatches(r, "", "4", { numberComplete: false })).toMatchObject({ type: "exact", match: { _id: 0 } });
  });
  it("#4 read, no name, Evanovich the only open candidate → green", () => {
    const r = [row(0, "Evanovich", "4"), row(1, "Nguyen", "23")];
    expect(findMatches(r, "", "4")).toMatchObject({ type: "exact", match: { _id: 0 } });
  });
  it("SAMU… with #40 and one Samuel → green", () => {
    const r = [row(0, "Samuel", "40"), row(1, "Nguyen", "23")];
    expect(findMatches(r, "SAMU", "40", { nameComplete: false })).toMatchObject({ type: "exact", match: { _id: 0 } });
  });
  it("STEPHENSON with no number and one Stephenson → green; with #5 read as well → yellow (contradiction)", () => {
    const r = [row(0, "Stephenson", "22"), row(1, "", "5")];
    expect(findMatches(r, "STEPHENSON", "")).toMatchObject({ type: "exact", match: { _id: 0 } });
    expect(findMatches(r, "STEPHENSON", "5").type).toBe("pick");
    expect(findMatches(r, "STEPHENSON", "5", { numberComplete: false }).type).toBe("pick");
  });
  it("the direct row already passed while the alternative is open → still yellow, never green on the alternative", () => {
    const r = [row(0, "Evanovich", "4", "T", "A-L", { scanned: "pass" }), row(1, "Samuel", "40")];
    expect(findMatches(r, "", "4", { numberComplete: false }).type).toBe("pick");
  });
  it("doubtful results carry soft: true for the second look; contradictions do not", () => {
    const r = [row(0, "Evanovich", "4"), row(1, "Samuel", "40")];
    expect(findMatches(r, "", "4", { numberComplete: false }).soft).toBe(true);
    expect(findMatches(r, "", "4").soft).toBe(true);
    expect(findMatches(r, "SAMUEL", "4").soft).toBeUndefined();
  });
});

describe("same number on several rows", () => {
  const three = () => [row(0, "", "1", "red", "A-M"), row(1, "", "1", "red", "A-S"), row(2, "", "1", "yellow", "A-L")];
  it("all open → pick", () => {
    expect(findMatches(three(), "", "1").type).toBe("pick");
  });
  it("two of three passed → the last open row is green", () => {
    const r = three(); r[1].scanned = "pass"; r[2].scanned = "manual";
    expect(findMatches(r, "", "1")).toMatchObject({ type: "exact", match: { _id: 0 } });
  });
  it("one of three passed → still a pick between the two open", () => {
    const r = three(); r[1].scanned = "pass";
    const m = findMatches(r, "", "1");
    expect(m.type).toBe("pick");
  });
  it("all three passed → pick with every row disabled (already done)", () => {
    const r = three(); r.forEach(x => { x.scanned = "pass"; });
    expect(findMatches(r, "", "1").type).toBe("pick");
  });
  it("same name and number twice, one passed → green on the other", () => {
    const r = [row(0, "Smith", "9", "A", "A-L", { scanned: "pass" }), row(1, "Smith", "9", "B", "A-M")];
    expect(findMatches(r, "SMITH", "9")).toMatchObject({ type: "exact", match: { _id: 1 } });
  });
  it("a flagged (out for repair) row still counts as open", () => {
    const r = three(); r[1].scanned = "pass"; r[2].scanned = "flag";
    expect(findMatches(r, "", "1").type).toBe("pick");
  });
});

describe("the camera doubts its read", () => {
  it("name cut off: SAMU… with #40 and two Samu… rows → yellow, says the name looks cut off", () => {
    const r = [...named, row(9, "Samuels", "40", "B")];
    const m = findMatches(r, "SAMU", "40", { nameComplete: false });
    expect(m.type).toBe("pick");
    expect(ids(m)).toEqual(expect.arrayContaining([0, 9]));
    expect(m.reason).toMatch(/"SAMU…"/);
    expect(m.reason).toMatch(/cut off/);
  });
  it("name fragment matches a word of a two-word roster name", () => {
    const r = [row(0, "Jordan Blake", "10"), row(1, "Blair", "10")];
    const m = findMatches(r, "BLA", "10", { nameComplete: false });
    expect(m.type).toBe("pick");
    expect(ids(m)).toEqual([0, 1]);
  });
  it("number covered: #4 flagged incomplete, no name → yellow with #4, #40, #14 and the model's words", () => {
    const m = findMatches(named, "", "4", { numberComplete: false, obstruction: "hand over the right digit" });
    expect(m.type).toBe("pick");
    expect(ids(m)).toEqual(expect.arrayContaining([0, 1, 2]));
    expect(m.reason).toMatch(/covered or cut off/);
    expect(m.reason).toMatch(/hand over the right digit/);
  });
  it("covered 3 of #35 read as a guessed 55 or 75, flagged incomplete → yellow with #35 and #5 offered", () => {
    const r = [row(0, "", "35"), row(1, "", "5"), row(2, "", "40"), row(3, "", "12")];
    for (const guess of ["55", "75", "35", "5"]) {
      const m = findMatches(r, "", guess, { numberComplete: false });
      expect(m.type).toBe("pick");
      expect(ids(m)).toEqual(expect.arrayContaining([0, 1]));
      expect(ids(m)).not.toContain(3);
    }
  });
  it("number-only roster, single digit sitting left of centre → yellow, not green", () => {
    const r = [row(0, "", "40"), row(1, "", "4")];
    const m = findMatches(r, "", "4", { position: "left" });
    expect(m.type).toBe("pick");
    expect(ids(m)).toEqual(expect.arrayContaining([0, 1]));
    expect(m.reason).toMatch(/left of centre/);
  });
  it("number-only roster, single digit centred and complete → green", () => {
    const r = [row(0, "", "40"), row(1, "", "4")];
    expect(findMatches(r, "", "4", { position: "centre", numberComplete: true }).type).toBe("exact");
  });
  it("a two-digit number off-centre is not suspicious by itself", () => {
    const r = [row(0, "", "40"), row(1, "", "4")];
    expect(findMatches(r, "", "40", { position: "right" }).type).toBe("exact");
  });
  it("name and number both read in full but flagged incomplete number → yellow, that row first", () => {
    const m = findMatches(named, "EVANOVICH", "4", { numberComplete: false });
    expect(m.type).toBe("pick");
    expect(ids(m)[0]).toBe(1);
  });
  it("suspect read with nothing on the roster → none, with the reason", () => {
    const m = findMatches([row(0, "Samuel", "40")], "", "9", { numberComplete: false });
    expect(m.type).toBe("none");
    expect(m.reason).toMatch(/#9/);
  });
  it("sleeve-merge guard still runs first", () => {
    expect(findMatches(named, "", "444", { numberComplete: false }).type).toBe("pick");
  });
});

describe("vision parser", () => {
  const wrap = obj => ({ content: [{ type: "text", text: JSON.stringify(obj) }] });
  it("reads the completeness fields", () => {
    const r = parseModelText(wrap({ name: "SAMU", number: 4, sleeve_numbers: [], name_complete: false, number_complete: false, number_position: "Left", obstruction: "hand" }));
    expect(r).toMatchObject({ name: "SAMU", number: "4", name_complete: false, number_complete: false, number_position: "left", obstruction: "hand" });
  });
  it("missing fields default to complete", () => {
    const r = parseModelText(wrap({ name: "SAMUEL", number: "40" }));
    expect(r).toMatchObject({ name_complete: true, number_complete: true, number_position: "", obstruction: "" });
  });
  it("normalises position spellings", () => {
    expect(normPosition("center")).toBe("centre");
    expect(normPosition("Middle")).toBe("centre");
    expect(normPosition("right side")).toBe("right");
    expect(normPosition("")).toBe("");
  });
});
