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
    expect(findMatches(r, "", "40").type).toBe("pick");          // Samuel's name was not read
  });
  it("number-only roster still goes green on a clean read", () => {
    const r = [row(0, "", "40"), row(1, "", "4")];
    expect(findMatches(r, "", "4")).toMatchObject({ type: "exact", match: { _id: 1 } });
  });
});

describe("the camera doubts its read", () => {
  it("name cut off: SAMU… with #40 → yellow with Samuel, says the name looks cut off", () => {
    const m = findMatches(named, "SAMU", "40", { nameComplete: false });
    expect(m.type).toBe("pick");
    expect(ids(m)[0]).toBe(0);
    expect(m.reason).toMatch(/"SAMU…"/);
    expect(m.reason).toMatch(/cut off/);
  });
  it("name fragment matches a word of a two-word roster name", () => {
    const r = [row(0, "Jordan Blake", "10")];
    const m = findMatches(r, "BLA", "10", { nameComplete: false });
    expect(m.type).toBe("pick");
    expect(ids(m)).toEqual([0]);
  });
  it("number covered: #4 flagged incomplete, no name → yellow with #4, #40, #14 and the model's words", () => {
    const m = findMatches(named, "", "4", { numberComplete: false, obstruction: "hand over the right digit" });
    expect(m.type).toBe("pick");
    expect(ids(m)).toEqual(expect.arrayContaining([0, 1, 2]));
    expect(m.reason).toMatch(/covered or cut off/);
    expect(m.reason).toMatch(/hand over the right digit/);
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
