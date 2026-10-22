import { describe, it, expect } from "vitest";
import { findMatches } from "../match.js";
import { parseModelText, normPosition } from "../vision.js";
import { colourFamilies, narrowByColour } from "../colour.js";

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
    expect(findMatches(r, "", "40").type).toBe("pick");                                    // Samuel has a name and it was not read: never green
    const r2 = [...r, row(3, "", "4")];
    expect(findMatches(r2, "", "4").type).toBe("exact");                              // clean, complete read of the nameless #4: green
    expect(findMatches(r2, "", "4", { numberComplete: false }).type).toBe("pick");    // doubtful read: #40 is open, so ask
  });
  it("number-only roster still goes green on a clean read", () => {
    const r = [row(0, "", "40"), row(1, "", "4")];
    expect(findMatches(r, "", "4")).toMatchObject({ type: "exact", match: { _id: 1 } });
  });
});

describe("folded jersey", () => {
  it("#5 read off a jersey the model says is not flat, while #35 is open → yellow with #35 offered", () => {
    const r = [row(0, "", "35", "yellow"), row(1, "", "5", "black"), row(2, "", "40", "blue")];
    const m = findMatches(r, "", "5", { laidFlat: false, numberComplete: true });
    expect(m.type).toBe("pick");
    expect(ids(m)).toEqual(expect.arrayContaining([0, 1]));
    expect(m.reason).toMatch(/not laid flat/);
  });
  it("same read, nothing a fold could hide → green", () => {
    const r = [row(0, "", "5", "black"), row(1, "", "40", "blue")];
    expect(findMatches(r, "", "5", { laidFlat: false }).type).toBe("exact");
  });
  it("'not flat' on a complete TWO-digit read changes nothing: a fold cannot add a third digit", () => {
    const r = [row(0, "", "54", "blue"), row(1, "", "5", "black"), row(2, "", "40", "blue")];
    expect(findMatches(r, "", "54", { laidFlat: false, numberComplete: true })).toMatchObject({ type: "exact", match: { _id: 0 } });
  });
  it("doubtful read, three rows of that number, two passed → green on the last", () => {
    const r = [row(0, "", "54", "blue", "A-L"), row(1, "", "54", "blue", "A-S", { scanned: "pass" }), row(2, "", "54", "red", "A-M", { scanned: "pass" })];
    expect(findMatches(r, "", "54", { numberComplete: false })).toMatchObject({ type: "exact", match: { _id: 0 } });
  });
  it("doubtful read, two rows of that number in different colours → the colour seen decides", () => {
    const r = [row(0, "", "54", "white"), row(1, "", "54", "red")];
    expect(findMatches(r, "", "54", { numberComplete: false, colour: "white" })).toMatchObject({ type: "exact", match: { _id: 0 } });
    expect(findMatches(r, "", "54", { numberComplete: false }).type).toBe("pick");
  });
  it("a read of 0 with no #0 row offers hidden-digit rows, never #4", () => {
    const r = [row(0, "", "40"), row(1, "", "70"), row(2, "", "4"), row(3, "", "60")];
    const m = findMatches(r, "", "0", { numberComplete: false });
    expect(m.type).toBe("pick");
    expect(ids(m)).toEqual(expect.arrayContaining([0, 1, 3]));
    expect(ids(m)).not.toContain(2);
  });
  it("a flat jersey with a complete number is unaffected", () => {
    const r = [row(0, "", "35", "yellow"), row(1, "", "5", "black")];
    expect(findMatches(r, "", "5", { laidFlat: true, numberComplete: true }).type).toBe("exact");
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
  it("#4 read flagged covered on a NAMED row, no name read → yellow even with nothing else to offer", () => {
    const r = [row(0, "Evanovich", "4"), row(1, "Nguyen", "23")];
    const m = findMatches(r, "", "4", { numberComplete: false });
    expect(m.type).toBe("pick");
    expect(ids(m)).toEqual([0]);
  });
  it("#4 read flagged covered on a NAMELESS row, nothing else open → green", () => {
    const r = [row(0, "", "4", "red"), row(1, "Nguyen", "23")];
    expect(findMatches(r, "", "4", { numberComplete: false })).toMatchObject({ type: "exact", match: { _id: 0 } });
  });
  it("same read while #40 is still open → yellow", () => {
    const r = [row(0, "Evanovich", "4"), row(1, "Samuel", "40")];
    expect(findMatches(r, "", "4", { numberComplete: false }).type).toBe("pick");
  });
  it("same read once #40 has passed → still yellow: Evanovich has a name that was not read", () => {
    const r = [row(0, "Evanovich", "4"), row(1, "Samuel", "40", "T", "A-L", { scanned: "pass" })];
    expect(findMatches(r, "", "4", { numberComplete: false }).type).toBe("pick");
  });
  it("the floor case: a nameless read of #21 where #21 is LEACH → yellow with Leach, never green", () => {
    const r = [row(0, "Leach", "21", "red", "A-XL"), row(1, "", "70", "blue"), row(2, "Donnelly", "31", "red")];
    const m = findMatches(r, "", "21", { colour: "white", trim: "red" });
    expect(m.type).toBe("pick");
    expect(ids(m)).toEqual([0]);
    // the 3 of #31 under a hand, guessed as 21 and flagged covered: Leach AND the #31 rows are offered
    const m2 = findMatches(r, "", "21", { numberComplete: false, obstruction: "hand over the left digit", colour: "white", trim: "red" });
    expect(m2.type).toBe("pick");
    expect(ids(m2)).toEqual(expect.arrayContaining([0, 2]));
    expect(findMatches(r, "LEACH", "21")).toMatchObject({ type: "exact", match: { _id: 0 } });   // with the name read: green
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

describe("colour settles same-number rows", () => {
  // Order 41 on the floor: numbers repeat across colours, the team column is the colour.
  const order41 = () => [
    row(0, "", "1", "red", "A-M"), row(1, "", "1", "red", "A-S"), row(2, "", "1", "yellow", "A-L"),
    row(3, "", "31", "green", "A-S"), row(4, "", "31", "green", "A-XL"), row(5, "Rine", "31", "green", "A-3XL"), row(6, "Donnelly", "31", "red", "A-M"),
    row(7, "", "35", "yellow", "A-S"), row(8, "", "35", "yellow", "A-S"),
    row(9, "", "40", "blue", "A-XL"), row(10, "Hunter", "22", "red", "Y-XL"), row(11, "Stephenson", "22", "yellow", "A-L"),
  ];
  it("#1 on a yellow jersey → green on the yellow row", () => {
    expect(findMatches(order41(), "", "1", { colour: "yellow" })).toMatchObject({ type: "exact", match: { _id: 2 } });
  });
  it("#1 on a red jersey → pick between the two red sizes, red rows first, says what it saw", () => {
    const m = findMatches(order41(), "", "1", { colour: "red", trim: "white" });
    expect(m.type).toBe("pick");
    expect(ids(m).slice(0, 2)).toEqual([0, 1]);
    expect(m.reason).toMatch(/looks red/);
  });
  it("#1 red once red A-S has passed → green on red A-M", () => {
    const r = order41(); r[1].scanned = "pass";
    expect(findMatches(r, "", "1", { colour: "red" })).toMatchObject({ type: "exact", match: { _id: 0 } });
  });
  it("colour words map to families: scarlet is red, sky blue is blue, teal meets blue and green", () => {
    expect(colourFamilies("scarlet")).toEqual(["red"]);
    expect(colourFamilies("sky blue")).toEqual(["blue"]);
    expect(colourFamilies("Ravens")).toEqual([]);
    const rows = [row(0, "", "7", "teal"), row(1, "", "7", "red")];
    expect(narrowByColour(rows, { colour: "blue" }).rows.map(r => r._id)).toEqual([0]);
    expect(narrowByColour(rows, { colour: "green" }).rows.map(r => r._id)).toEqual([0]);
  });
  it("colour that agrees with no row never rules anything out", () => {
    const m = findMatches(order41(), "", "1", { colour: "purple" });
    expect(m.type).toBe("pick");
    expect(ids(m).length).toBe(3);
  });
  it("team names that are not colours leave the pick as it was", () => {
    const r = [row(0, "", "7", "Ravens"), row(1, "", "7", "Wolves")];
    expect(findMatches(r, "", "7", { colour: "black" }).type).toBe("pick");
  });
  it("trim colour orders the list but never decides a green", () => {
    const r = [row(0, "", "7", "white"), row(1, "", "7", "navy")];
    const m = findMatches(r, "", "7", { colour: "silver", trim: "navy blue" });
    expect(m.type).toBe("pick");
    expect(ids(m)[0]).toBe(1);
  });
  it("the floor case: white #31 with red trim, no name read; rows green, green, RINE green, DONNELLY red → never green on Donnelly", () => {
    const r = [row(0, "", "31", "green", "A-S"), row(1, "", "31", "green", "A-XL"), row(2, "Rine", "31", "green", "A-3XL"), row(3, "Donnelly", "31", "red", "A-M")];
    const m = findMatches(r, "", "31", { colour: "white", trim: "red" });
    expect(m.type).toBe("pick");
    expect(ids(m)).toEqual(expect.arrayContaining([0, 1, 2, 3]));
    const m2 = findMatches(r, "", "31", { colour: "red", trim: "white" });   // even a red body: Donnelly has a name that was not read
    expect(m2.type).toBe("pick");
  });
  it("a nameless read with two nameless rows of that number in different body colours → the body colour decides", () => {
    const r = [row(0, "", "31", "green"), row(1, "", "31", "white"), row(2, "Donnelly", "31", "red")];
    expect(findMatches(r, "", "31", { colour: "white", trim: "red" })).toMatchObject({ type: "exact", match: { _id: 1 } });
  });
  it("a nameless read on #22 (two NAMED rows) on a yellow jersey → still yellow: a named row needs its name read", () => {
    const m = findMatches(order41(), "", "22", { colour: "yellow" });
    expect(m.type).toBe("pick");
    expect(ids(m)).toEqual(expect.arrayContaining([10, 11]));
  });
  it("parser lower-cases the colour fields and defaults them empty", () => {
    const wrap = obj => ({ content: [{ type: "text", text: JSON.stringify(obj) }] });
    expect(parseModelText(wrap({ number: "1", jersey_colour: "Navy Blue", trim_colour: "White" }))).toMatchObject({ jersey_colour: "navy blue", trim_colour: "white" });
    expect(parseModelText(wrap({ number: "1" }))).toMatchObject({ jersey_colour: "", trim_colour: "" });
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
  it("all three passed → 'already passed', not a list with every row greyed out", () => {
    const r = three(); r.forEach(x => { x.scanned = "pass"; });
    expect(findMatches(r, "", "1").type).toBe("duplicate");
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
  it("covered 3 of #35 guessed as 55 or 75 (not on the roster) → yellow with #35 and #5, nothing unrelated", () => {
    const r = [row(0, "", "35"), row(1, "", "5"), row(2, "", "40"), row(3, "", "12")];
    for (const guess of ["55", "75"]) {
      const m = findMatches(r, "", guess, { numberComplete: false });
      expect(m.type).toBe("pick");
      expect(ids(m)).toEqual(expect.arrayContaining([0, 1]));
      expect(ids(m)).not.toContain(3);
    }
  });
  it("a doubtful (not flat) read of a number that IS on the roster lists only that number's rows", () => {
    const r = [row(0, "", "30", "red"), row(1, "", "30", "blue"), row(2, "", "31"), row(3, "", "70"), row(4, "", "60"), row(5, "", "3")];
    const m = findMatches(r, "", "30", { laidFlat: false });
    expect(m.type).toBe("pick");
    expect(ids(m)).toEqual([0, 1]);
  });
  it("a COVERED read adds neighbours on the covered side only: left digit covered → 70, 60, not 31", () => {
    const r = [row(0, "", "30", "red"), row(1, "", "30", "blue"), row(2, "", "31"), row(3, "", "70"), row(4, "", "60"), row(5, "", "3")];
    const m = findMatches(r, "", "30", { numberComplete: false, obstruction: "hand over the left digit" });
    expect(ids(m)).toEqual(expect.arrayContaining([0, 1, 3, 4]));
    expect(ids(m)).not.toContain(2);
    const m2 = findMatches(r, "", "30", { numberComplete: false, obstruction: "second digit may be under a fold" });
    expect(ids(m2)).toEqual(expect.arrayContaining([0, 1, 2]));
    expect(ids(m2)).not.toContain(3);
  });
  it("a doubtful single-digit read still offers the rows a hidden digit would make, and nothing else", () => {
    const r = [row(0, "", "5"), row(1, "", "35"), row(2, "", "50"), row(3, "", "6"), row(4, "", "70")];
    const m = findMatches(r, "", "5", { numberComplete: false });
    expect(m.type).toBe("pick");
    expect(ids(m)).toEqual([0, 1, 2]);
  });
  it("name on the roster, number not: the name's row only", () => {
    const r = [row(0, "Stephenson", "22"), row(1, "", "6"), row(2, "", "4")];
    const m = findMatches(r, "STEPHENSON", "5");
    expect(m.type).toBe("pick");
    expect(ids(m)).toEqual([0]);
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
