import { describe, it, expect } from "vitest";
import { createVigilance, readsAgree, reconcile, describeRead, turnMatters, settleTurned, CHECKS_AFTER_MISTAKE, createInspection, inspectLabel, INSPECT_FULL, INSPECT_EVERY } from "../vigilance.js";
import { findMatches } from "../match.js";

const row = (i, name, number, extra = {}) => ({ _id: i, name, number, team: "", size: "A-L", scanned: false, ...extra });
const read = (number, name = "", extra = {}) => ({ number, name, number_complete: true, name_complete: true, laid_flat: true, jersey_present: true, number_position: "centre", ...extra });

describe("self-check counter", () => {
  it("owes 5 checks after a mistake, counts them down, and restarts on the next mistake", () => {
    const v = createVigilance();
    expect(v.active).toBe(false);
    expect(v.scanDone()).toBe(false);
    v.noteMistake("greenOverridden");
    expect(v.remaining).toBe(CHECKS_AFTER_MISTAKE);
    expect(v.scanDone()).toBe(true); expect(v.scanDone()).toBe(true);
    expect(v.remaining).toBe(3);
    v.noteMistake("unchecked");
    expect(v.remaining).toBe(5); expect(v.mistakes).toBe(2);
    for (let i = 0; i < 5; i++) expect(v.scanDone()).toBe(true);
    expect(v.active).toBe(false);
    expect(v.scanDone()).toBe(false);
  });
  it("survives a save and load", () => {
    const v = createVigilance(); v.noteMistake("notOnList"); v.scanDone();
    const w = createVigilance(); w.load(v.state());
    expect(w.remaining).toBe(4); expect(w.mistakes).toBe(1); expect(w.last.kind).toBe("notOnList");
    w.load(null); expect(w.remaining).toBe(4);
  });
});

describe("two reads agree", () => {
  it("same number and name, both complete", () => {
    expect(readsAgree(read("40", "SAMUEL"), read("40", "Samuel"))).toBe(true);
    expect(readsAgree(read("40"), read("40"))).toBe(true);
  });
  it("a name on one read and none on the other still agrees — the digit is what is being checked", () => {
    expect(readsAgree(read("40", "SAMUEL"), read("40"))).toBe(true);
  });
  it("not when a digit, a name, completeness or presence differs", () => {
    expect(readsAgree(read("40"), read("46"))).toBe(false);
    expect(readsAgree(read("40", "SAMUEL"), read("40", "NGUYEN"))).toBe(false);
    expect(readsAgree(read("40"), read("40", "", { number_complete: false }))).toBe(false);
    expect(readsAgree(read("40"), read("40", "", { jersey_present: false }))).toBe(false);
    expect(readsAgree(null, read("40"))).toBe(false);
  });
});

describe("reconcile two reads into one screen", () => {
  const roster = [row(0, "Samuel", "40"), row(1, "Evanovich", "4"), row(2, "Nguyen", "46")];
  const m = d => findMatches(roster, d.name, d.number, { numberComplete: d.number_complete, nameComplete: d.name_complete, laidFlat: d.laid_flat, position: d.number_position });
  it("agreeing greens stay green", () => {
    const d1 = read("40", "SAMUEL"), d2 = read("40", "SAMUEL");
    const r = reconcile(d1, m(d1), d2, m(d2));
    expect(r.agreed).toBe(true); expect(r.match.type).toBe("exact"); expect(r.match.match._id).toBe(0);
  });
  it("a misread digit on one read is caught: never green, both rows offered", () => {
    const d1 = read("46", "NGUYEN"), d2 = read("40", "SAMUEL");   // first read wrong, second right
    const r = reconcile(d1, m(d1), d2, m(d2));
    expect(r.agreed).toBe(false); expect(r.match.type).toBe("pick");
    expect(r.match.candidates.map(c => c._id).sort()).toEqual([0, 2]);
    expect(r.match.reason).toMatch(/#46 NGUYEN.*#40 SAMUEL/);
  });
  it("one read nameless, the other with the name: the reads agree and the fuller one decides (green)", () => {
    const d1 = read("40"), d2 = read("40", "SAMUEL");
    const r = reconcile(d1, m(d1), d2, m(d2));
    expect(r.agreed).toBe(true); expect(r.read).toBe(d2);
    expect(r.match).toMatchObject({ type: "exact", match: { _id: 0 } });
  });
  it("two greens on different rows never pass as agreement", () => {
    const twins = [row(0, "", "40", { team: "blue" }), row(1, "", "40", { team: "red" })];
    const mm = d => findMatches(twins, d.name, d.number, { colour: d.jersey_colour });
    const d1 = read("40", "", { jersey_colour: "blue" }), d2 = read("40", "", { jersey_colour: "red" });
    const r = reconcile(d1, mm(d1), d2, mm(d2));
    expect(r.agreed).toBe(false); expect(r.match.type).toBe("pick"); expect(r.match.candidates.length).toBe(2);
  });
  it("agreeing reads that are a list stay that list", () => {
    const d1 = read("4", "", { number_complete: false }), d2 = read("4", "", { number_complete: false });
    const r = reconcile(d1, m(d1), d2, m(d2));
    expect(r.match.type).toBe("pick");
  });
  it("neither read on the roster → none, with both reads named", () => {
    const d1 = read("77", "WALKER"), d2 = read("78", "WALKER");
    const r = reconcile(d1, m(d1), d2, m(d2));
    expect(r.match.type).toBe("none"); expect(r.match.reason).toMatch(/#77 WALKER then #78 WALKER/);
  });
  it("a turn only matters when the number's upside-down twin is open on the roster", () => {
    const r = [row(0, "", "6"), row(1, "", "9"), row(2, "", "52"), row(3, "", "18"), row(4, "", "81", { scanned: "pass" })];
    expect(turnMatters(read("6", "", { orientation: "upside_down" }), r)).toBe(true);
    expect(turnMatters(read("52", "", { orientation: "upside_down" }), r)).toBe(false);   // 52 has no twin
    expect(turnMatters(read("18", "", { orientation: "rotated_left" }), r)).toBe(false);  // the 81 has passed
    expect(turnMatters(read("6", "", { orientation: "upright" }), r)).toBe(false);
    expect(turnMatters(read("6"), r)).toBe(false);
    expect(turnMatters(read("", "SEACH", { orientation: "upside_down" }), r)).toBe(false);
  });
  it("the upright re-read wins when it is upright, whole and differs only the way a turn would", () => {
    const r = [row(0, "", "6"), row(1, "", "9")];
    const mm = d => findMatches(r, d.name, d.number, { orientation: d.orientation, numberComplete: d.number_complete });
    const first = read("9", "", { orientation: "upside_down" }), up = read("6", "", { orientation: "upright" });
    const s = settleTurned(first, mm(first), up, mm(up));
    expect(s.agreed).toBe(true); expect(s.read).toBe(up); expect(s.match).toMatchObject({ type: "exact", match: { _id: 0 } });
    // same number both times: also settled
    expect(settleTurned(first, mm(first), read("9", "", { orientation: "upright" }), mm(read("9", "", { orientation: "upright" }))).agreed).toBe(true);
    // the re-read still says it is turned, or is not whole, or changed in a way no turn explains → ask with both
    expect(settleTurned(first, mm(first), read("6", "", { orientation: "upside_down" }), mm(read("6", "", { orientation: "upside_down" }))).agreed).toBe(false);
    expect(settleTurned(first, mm(first), read("6", "", { orientation: "upright", number_complete: false }), mm(read("6", "", { orientation: "upright", number_complete: false }))).agreed).toBe(false);
    const odd = read("8", "", { orientation: "upright" });
    const s2 = settleTurned(first, mm(first), odd, mm(odd));
    expect(s2.agreed).toBe(false); expect(s2.match.type).toBe("pick");
  });
  it("describes a read for the reason line", () => {
    expect(describeRead(read("40", "SAMUEL"))).toBe("#40 SAMUEL");
    expect(describeRead(read("4", "", { number_complete: false }))).toBe("#4 (digit may be hidden)");
    expect(describeRead({ jersey_present: false })).toBe("no jersey");
    expect(describeRead(read("", ""))).toBe("nothing");
  });
});

describe("operator inspection regime", () => {
  it("opens with a full inspection of the first 5, then quick looks, then a spot check after 10 clean", () => {
    const r = createInspection();
    expect(r.current().phase).toBe("full"); expect(r.current().remaining).toBe(INSPECT_FULL);
    expect(inspectLabel(r.current())).toBe("Inspect fully · 5 to go");
    for (let i = 0; i < INSPECT_FULL; i++) r.jerseyDone();
    expect(r.current().phase).toBe("quick"); expect(r.full).toBe(false);
    expect(inspectLabel(r.current())).toBe("Quick look · 0/10");
    for (let i = 0; i < INSPECT_EVERY - 1; i++) r.jerseyDone();
    expect(r.current().phase).toBe("quick"); expect(r.current().clean).toBe(9);
    r.jerseyDone();
    expect(r.current().phase).toBe("sample"); expect(r.full).toBe(true);
    expect(inspectLabel(r.current())).toBe("Inspect fully · spot check");
    r.jerseyDone();                                   // the spot check was clean
    expect(r.current().phase).toBe("quick"); expect(r.current().clean).toBe(0);
  });
  it("a defect anywhere restarts the 5", () => {
    const r = createInspection();
    for (let i = 0; i < 12; i++) r.jerseyDone();      // deep into quick looks
    expect(r.current().phase).toBe("quick");
    r.defect();
    expect(r.current()).toMatchObject({ phase: "full", remaining: 5, clean: 0 });
    r.jerseyDone(); r.jerseyDone(); r.defect();
    expect(r.current().remaining).toBe(5);
    for (let i = 0; i < 15; i++) r.jerseyDone();
    expect(r.current().phase).toBe("sample");
    r.defect();                                       // the spot check found one
    expect(r.current().phase).toBe("full"); expect(r.state().defects).toBe(3);
  });
  it("survives a save and load, and an old session without it starts full", () => {
    const r = createInspection(); for (let i = 0; i < 7; i++) r.jerseyDone();
    const w = createInspection(); w.load(r.state());
    expect(w.current()).toEqual(r.current());
    const fresh = createInspection(); fresh.load(undefined);
    expect(fresh.current().phase).toBe("full"); expect(fresh.current().remaining).toBe(5);
  });
});

describe("a name that anchors the row: the turn cannot change the answer", () => {
  const roster = [row(0, "MACDONALD", "81"), row(1, "OKAFOR", "18"), row(2, "", "6"), row(3, "", "9")];
  it("turnMatters is false for #81 MACDONALD however the frame is turned, true for a nameless 6 with a 9 open", () => {
    expect(turnMatters({ ...read("81", "MACDONALD"), orientation: "rotated_left" }, roster)).toBe(false);
    expect(turnMatters({ ...read("6"), orientation: "upside_down" }, roster)).toBe(true);
    expect(turnMatters({ ...read("81", "MACDONALX"), orientation: "rotated_left" }, roster)).toBe(true);   // the name does not match a row: no anchor
  });
  it("settleTurned keeps the green when two non-upright reads agree on a name-anchored row", () => {
    const first = { ...read("81", "MACDONALD"), orientation: "rotated_left" }, again = { ...read("81", "MACDONALD"), orientation: "rotated_right" };
    const m = findMatches(roster, "MACDONALD", "81", { orientation: "rotated_left" });
    expect(settleTurned(first, m, again, m).match.type).toBe("exact");
    const n1 = { ...read("9"), orientation: "upside_down" }, n2 = { ...read("9"), orientation: "upside_down" };
    const m9 = findMatches(roster, "", "9", {});
    expect(settleTurned(n1, m9, n2, m9).match.type).toBe("pick");                    // nameless: still a question
  });
});
