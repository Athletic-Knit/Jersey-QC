// What a read becomes (src/lib/scanpolicy.js): the screen the station shows,
// one rule a block. App.jsx and the operator simulation both use these.
import { describe, it, expect } from "vitest";
import { screenFor, matchRead, nothingRead, readOptions } from "../scanpolicy.js";

const row = (i, name, number, extra = {}) => ({ _id: i, name, number, team: "Navy", size: "A-L", scanned: false, ...extra });
const roster = [row(0, "Smith", "12"), row(1, "Jones", "7"), row(2, "Brown", "23", { scanned: "pass" }), row(3, "Green", "40", { scanned: "flag" })];
const read = (number, name, extra = {}) => ({ number, name, name_complete: true, number_complete: true, laid_flat: true, number_position: "centre", jersey_present: true, ...extra });
const screen = d => screenFor({ read: d, match: matchRead(roster, d) });

describe("what a read becomes", () => {
  it("a failed read is a red SCAN FAILED", () => {
    expect(screenFor({ error: "timeout", read: read("12", "SMITH") })).toMatchObject({ mode: "flag", title: "SCAN FAILED", reason: "API error: timeout" });
  });
  it("an empty table, or nothing readable, shows no screen at all", () => {
    expect(screen({ jersey_present: false, number: "", name: "" })).toEqual({ mode: null, empty: true });
    expect(screen({ jersey_present: true, number: "", name: "" })).toEqual({ mode: null, empty: false });
    expect(nothingRead({ jersey_present: true, number: " ", name: "" })).toBe(true);
  });
  it("a sure read of an open row is green", () => {
    expect(screen(read("12", "SMITH"))).toMatchObject({ mode: "confirm", match: { _id: 0 }, shown: { mode: "confirm", id: 0 } });
  });
  it("a passed or flagged row read again is ALREADY DONE, and says which", () => {
    expect(screen(read("23", "BROWN"))).toMatchObject({ mode: "duplicate", match: { _id: 2 }, reason: "#23 · Brown · A-L already passed this session.", tone: "flag" });
    expect(screen(read("40", "GREEN")).reason).toMatch(/is flagged — with the supervisor\.$/);
  });
  it("a doubtful read is a yellow list, never green (N1)", () => {
    const sc = screen(read("12", "SMITH", { number_complete: false }));
    expect(sc.mode).toBe("pick");
    expect(sc.shown).toEqual({ mode: "pick", ids: sc.candidates.map(c => c._id) });
  });
  it("a jersey not on the roster is a red NOT FOUND", () => {
    expect(screen(read("88", "ZHANG"))).toMatchObject({ mode: "flag", title: "NOT FOUND" });
    expect(screen(read("88", "ZHANG")).reason).toMatch(/^"ZHANG" #88 is not on this roster\./);
  });
  it("the camera's fields reach the matcher under its own names", () => {
    expect(readOptions({ name_complete: false, number_complete: true, number_position: "left", obstruction: "fold", jersey_colour: "red", trim_colour: "white", laid_flat: false, orientation: "upright" }))
      .toEqual({ nameComplete: false, numberComplete: true, position: "left", obstruction: "fold", colour: "red", trim: "white", laidFlat: false, orientation: "upright" });
  });
});
