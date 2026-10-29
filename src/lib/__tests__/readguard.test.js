import { describe, it, expect } from "vitest";
import { findMatches, rotated180 } from "../match.js";
import { parseModelText, normPosition, normOrientation, uprightRotation } from "../vision.js";
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
    expect(ids(m)).toEqual([0, 1]);   // the jersey has no name, so RINE and DONNELLY are off the list — but they still keep this a question
    const m2 = findMatches(r, "", "31", { colour: "red", trim: "white" });   // even a red body: Donnelly has a name that was not read
    expect(m2.type).toBe("pick");
  });
  it("the floor case later in the order: every other #31 has passed, the jersey looks white, the roster says green → green on the last open row", () => {
    const r = [row(0, "", "31", "green", "A-S"), row(1, "", "31", "green", "A-XL"), row(2, "Rine", "31", "green", "A-3XL"), row(3, "Donnelly", "31", "red", "A-M")];
    r[0].scanned = "pass"; r[2].scanned = "pass"; r[3].scanned = "pass";
    expect(findMatches(r, "", "31", { colour: "white", trim: "orange" })).toMatchObject({ type: "exact", match: { _id: 1 } });
  });
  it("the navy #0 scanned twice: navy has passed, white is open, the jersey looks navy → not green on the white one", () => {
    const r = [row(0, "", "0", "navy"), row(1, "", "0", "white")];
    r[0].scanned = "pass";
    expect(findMatches(r, "", "0", { colour: "navy blue" }).type).not.toBe("exact");
    expect(findMatches(r, "", "0", { colour: "white" })).toMatchObject({ type: "exact", match: { _id: 1 } });
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
  it("a flagged row is done like a passed one: the last open twin is green", () => {
    const r = three(); r[1].scanned = "pass"; r[2].scanned = "flag";
    expect(findMatches(r, "", "1")).toMatchObject({ type: "exact", match: { _id: 0 } });
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
  it("number covered: #4 flagged incomplete, no name, hand to the RIGHT → yellow with #4 and #40 (not #14) and the model's words", () => {
    const m = findMatches(named, "", "4", { numberComplete: false, obstruction: "hand over the right digit" });
    expect(m.type).toBe("pick");
    expect(m.candidates.map(c => c.number)).toEqual(expect.arrayContaining(["4", "40"]));
    expect(m.candidates.map(c => c.number)).not.toContain("14");   // a 4 with the cover to its right is the FIRST digit
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
  it("name and number both read in full, number flagged covered / not flat / off centre → green: the name settles it", () => {
    expect(findMatches(named, "EVANOVICH", "4", { numberComplete: false })).toMatchObject({ type: "exact", match: { _id: 1 } });
    expect(findMatches(named, "EVANOVICH", "4", { laidFlat: false })).toMatchObject({ type: "exact", match: { _id: 1 } });
    expect(findMatches(named, "EVANOVICH", "4", { position: "left" })).toMatchObject({ type: "exact", match: { _id: 1 } });
    expect(findMatches(named, "EVANOVICH", "4", { numberComplete: false, laidFlat: false, position: "right", obstruction: "second digit may be under a fold" })).toMatchObject({ type: "exact", match: { _id: 1 } });
    // Already passed: a duplicate, not a question.
    const done = named.map(r => r._id === 1 ? { ...r, scanned: "pass" } : r);
    expect(findMatches(done, "EVANOVICH", "4", { numberComplete: false })).toMatchObject({ type: "duplicate", match: { _id: 1 } });
  });
  it("…but the same name on another open row with a hidden-digit number keeps it a question", () => {
    const r = [row(0, "Seach", "9"), row(1, "Seach", "19"), row(2, "Nguyen", "14")];
    const m = findMatches(r, "SEACH", "9", { numberComplete: false });
    expect(m.type).toBe("pick");
    expect(ids(m)).toEqual([0, 1]);
    // Once the #19 has passed, #9 is the only Seach left: green.
    const done = r.map(x => x._id === 1 ? { ...x, scanned: "pass" } : x);
    expect(findMatches(done, "SEACH", "9", { numberComplete: false })).toMatchObject({ type: "exact", match: { _id: 0 } });
  });
  it("a cut-short name with a covered number is still a question", () => {
    expect(findMatches(named, "EVAN", "4", { nameComplete: false, numberComplete: false }).type).toBe("pick");
  });
  it("a nameless 6 on a jersey that is not upright, with a 9 open on the roster → ask with both; upright → green", () => {
    const r = [row(0, "", "6"), row(1, "", "9"), row(2, "", "23")];
    const m = findMatches(r, "", "6", { orientation: "upside_down" });
    expect(m.type).toBe("pick"); expect(ids(m)).toEqual([0, 1]); expect(m.reason).toMatch(/#9/);
    expect(findMatches(r, "", "6", { orientation: "rotated_left" }).type).toBe("pick");
    expect(findMatches(r, "", "6", { orientation: "upright" })).toMatchObject({ type: "exact", match: { _id: 0 } });
    expect(findMatches(r, "", "6", {})).toMatchObject({ type: "exact", match: { _id: 0 } });
    // the 9 has passed: the 6 is the only one it can be
    const done = r.map(x => x._id === 1 ? { ...x, scanned: "pass" } : x);
    expect(findMatches(done, "", "6", { orientation: "upside_down" })).toMatchObject({ type: "exact", match: { _id: 0 } });
    // 23 has no upside-down twin; a name anchors the row
    expect(findMatches(r, "", "23", { orientation: "upside_down" })).toMatchObject({ type: "exact", match: { _id: 2 } });
    expect(findMatches([row(0, "Seach", "6"), row(1, "Walker", "9")], "SEACH", "6", { orientation: "upside_down" })).toMatchObject({ type: "exact", match: { _id: 0 } });
    // a "name" that is on no row (a badge, a sponsor) anchors nothing: still a question
    expect(findMatches(r, "AK", "6", { orientation: "upside_down" }).type).toBe("pick");
    expect(findMatches([row(0, "Seach", "6"), row(1, "Walker", "9")], "AK", "6", { orientation: "upside_down" }).type).toBe("pick");
  });
  it("rotated180: 6↔9, 18↔81, 66↔99, 69→69; nothing for 2 3 4 5 7 or a leading zero", () => {
    expect(rotated180("6")).toBe("9"); expect(rotated180("18")).toBe("81"); expect(rotated180("66")).toBe("99"); expect(rotated180("69")).toBe("69");
    expect(rotated180("23")).toBe(""); expect(rotated180("60")).toBe(""); expect(rotated180("0")).toBe("0"); expect(rotated180("00")).toBe("");
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
  it("reports whether a jersey is in the picture; absent means present; a number read means present", () => {
    expect(parseModelText(wrap({ jersey_present: false, name: "", number: "" })).jersey_present).toBe(false);
    expect(parseModelText(wrap({ name: "SAMUEL", number: "40" })).jersey_present).toBe(true);
    // a close-up of a number patch: the flag says no garment, but a number was read — never an empty table
    expect(parseModelText(wrap({ jersey_present: false, name: "", number: "17" })).jersey_present).toBe(true);
  });
  it("reads the orientation and knows how far to turn the frame", () => {
    expect(parseModelText(wrap({ name: "A", number: "1", orientation: "upside_down" })).orientation).toBe("upside_down");
    expect(normOrientation("Upside-down")).toBe("upside_down"); expect(normOrientation("rotated left")).toBe("rotated_left");
    expect(normOrientation("rotated_right")).toBe("rotated_right"); expect(normOrientation("upright")).toBe("upright"); expect(normOrientation("")).toBe("");
    expect(uprightRotation("upside_down")).toBe(180); expect(uprightRotation("rotated_left")).toBe(90); expect(uprightRotation("rotated_right")).toBe(270); expect(uprightRotation("upright")).toBe(0); expect(uprightRotation("")).toBe(0);
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

describe("a jersey with no name does not list named rows", () => {
  const row = (i, number, name = "", team = "") => ({ _id: i, name, number, team, size: "A-L", scanned: false });
  const mixed = [row(0, "40", "", "blue"), row(1, "41", "", "blue"), row(2, "45", "VARGHESE", "green"), row(3, "11", "BIDDLE", "blue")];
  const covered = { numberComplete: false, nameComplete: true, laidFlat: false, position: "centre", obstruction: "hand over the right digit" };
  it("hidden right digit on a nameless #40: #40 and #41, not #45 VARGHESE", () => {
    const m = findMatches(mixed, "", "40", covered);
    expect(m.type).toBe("pick");
    expect(m.candidates.map(c => c.number)).toEqual(["40", "41"]);
  });
  it("still a question, never green, while the named row could be the jersey", () => {
    const only40 = [row(0, "40", "", "blue"), row(2, "45", "VARGHESE", "green")];
    const m = findMatches(only40, "", "4", { ...covered, numberComplete: false });
    expect(m.type).toBe("pick");                       // #45 VARGHESE blocks the green even though it is not listed
    expect(m.candidates.map(c => c.number)).toEqual(["40"]);
  });
  it("named rows stay when every candidate is named, when something covers the name, or when the number sits off-centre", () => {
    const named = [row(0, "40", "SMITH"), row(1, "41", "JONES")];
    expect(findMatches(named, "", "4", covered).candidates.length).toBe(2);
    expect(findMatches(mixed, "", "40", { ...covered, obstruction: "fold over the name and the right digit" }).candidates.map(c => c.number)).toContain("45");
    expect(findMatches(mixed, "", "4", { ...covered, position: "right" }).candidates.map(c => c.number)).toContain("45");
  });
  it("a typed number is never trimmed", () => {
    const m = findMatches(mixed, "", "4", { typed: true });
    expect(m.type === "none" || m.candidates.length >= 0).toBe(true);
  });
});

describe("a flagged jersey stays flagged", () => {
  const row = (i, number, name = "", scanned = false) => ({ _id: i, name, number, team: "", size: "A-L", scanned });
  it("scanning a flagged jersey again shows the flag, never a green", () => {
    const r = [row(0, "9", "SEACH", "flag"), row(1, "19", "SEACH")];
    expect(findMatches(r, "SEACH", "9", {})).toMatchObject({ type: "duplicate", match: { _id: 0 } });
    const nameless = [row(0, "40", "", "flag"), row(1, "41")];
    expect(findMatches(nameless, "", "40", {})).toMatchObject({ type: "duplicate", match: { _id: 0 } });
  });
  it("a flagged twin does not compete: the open row is green", () => {
    const r = [row(0, "31", "", "flag"), row(1, "31")];
    expect(findMatches(r, "", "31", {})).toMatchObject({ type: "exact", match: { _id: 1 } });
  });
  it("a jersey marked missing that turns up scans normally", () => {
    const r = [row(0, "52", "", "missing")];
    expect(findMatches(r, "", "52", {})).toMatchObject({ type: "exact", match: { _id: 0 } });
  });
});

describe("the side of the hidden digit trims the list", () => {
  const row = (i, number) => ({ _id: i, name: "", number, team: "", size: "A-L", scanned: false });
  const roster = [row(0, "40"), row(1, "14"), row(2, "54"), row(3, "41"), row(4, "52")];
  it("a 4 with the cover to its right lists #40 and #41; to its left, #14 and #54; unknown side, all four", () => {
    const right = findMatches(roster, "", "4", { numberComplete: false, obstruction: "hand over the right digit" });
    expect(right.type).toBe("pick"); expect(right.candidates.map(c => c.number).sort()).toEqual(["40", "41"]);
    const left = findMatches(roster, "", "4", { numberComplete: false, obstruction: "fold covering the left digit" });
    expect(left.candidates.map(c => c.number).sort()).toEqual(["14", "54"]);
    const unknown = findMatches(roster, "", "4", { numberComplete: false, obstruction: "a hand" });
    expect(unknown.candidates.map(c => c.number).sort()).toEqual(["14", "40", "41", "54"]);
  });
  it("never trims into a green: #4 open with a cover to the right and only #14 as the alternative stays a question", () => {
    const r = [row(0, "4"), row(1, "14")];
    const m = findMatches(r, "", "4", { numberComplete: false, obstruction: "hand over the right digit" });
    expect(m.type).toBe("pick");
    expect(m.candidates.map(c => c.number)).toEqual(["4"]);
  });
});

describe("vision parser: sleeve numbers", () => {
  const wrap = obj => ({ content: [{ type: "text", text: JSON.stringify(obj) }] });
  it("a one-digit sleeve number (a cut-off '3' of a '30' sleeve) never puts the back number in doubt", () => {
    const r = parseModelText(wrap({ name: "", number: "30", sleeve_numbers: ["3"], number_complete: true }));
    expect(r.number_complete).toBe(true);
    expect(r.sleeve_numbers).toEqual(["3"]);
  });
  it("a sleeve number that copies the whole back number, or none, changes nothing", () => {
    expect(parseModelText(wrap({ name: "GABBARD", number: "40", sleeve_numbers: ["40", "40"], number_complete: true })).number_complete).toBe(true);
    expect(parseModelText(wrap({ name: "", number: "40", number_complete: true })).number_complete).toBe(true);
    expect(parseModelText(wrap({ name: "", number: "4", sleeve_numbers: ["4"], number_complete: true })).number_complete).toBe(true);
  });
});
