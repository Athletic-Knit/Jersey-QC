// Garments still out coming back (the co-op, 26 Nov 2026), run through the same functions the
// station uses (scanpolicy.js), not read off App.jsx (Fable's final review, 26 Nov 2026):
//  - H3: a garment flagged on an order that was not parked (cameBack.live) is never green by
//    itself, from the camera or typed: it is a one-row list, a tap only;
//  - one garment (oneGarment in match.js) needs a known size, and prefers a row marked missing
//    to one flagged on this order: a garment that turns up is the missing one;
//  - on a list, rows still out come last, a missing one before a flagged one.
import { describe, it, expect } from "vitest";
import { matchRead, holdBack, tapOnly } from "../scanpolicy.js";
import { sortCandidates } from "../roster.js";

const clean = n => ({ jersey_present: true, name: "", number: n, name_complete: true, number_complete: true, flat: true, orientation: "upright" });
const flagged = r => ({ ...r, scanned: false, cameBack: { was: "flag", reason: "Holes", live: true } });
const missing = r => ({ ...r, scanned: false, cameBack: { was: "missing" } });
const row = (id, number, team, size, over = {}) => ({ _id: id, name: "", number, team, size, scanned: false, ...over });

describe("a flagged garment of an order not parked (H3)", () => {
  it("is never green by itself: a clean camera read of its number is a one-row list, a tap only", () => {
    const roster = [flagged(row(1, "10", "Hawks", "A-L"))];
    const m = holdBack(matchRead(roster, clean("10")));
    expect(m.type).toBe("pick");
    expect(m.candidates.map(c => c._id)).toEqual([1]);
    expect(tapOnly(m.candidates[0])).toBe(true);
  });
  it("one picked up from the unfinished pile (no `live`) goes green as before", () => {
    const roster = [{ ...row(1, "10", "Hawks", "A-L"), cameBack: { was: "flag", reason: "Holes" } }];
    expect(holdBack(matchRead(roster, clean("10"))).type).toBe("exact");
  });
});

describe("one garment and rows still out (Fable's final review)", () => {
  it("rows with no size are not one garment: a list, not a green in the first team's box", () => {
    const roster = [row(1, "10", "Hawks", ""), row(2, "10", "Eagles", "")];
    const m = matchRead(roster, clean("10"));
    expect(m.type).not.toBe("exact");
    expect(m.sameGarment).toBeUndefined();
  });
  it("the same size on two teams is still one garment", () => {
    const roster = [row(1, "10", "Hawks", "A-L"), row(2, "10", "Eagles", "A-L")];
    expect(matchRead(roster, clean("10"))).toMatchObject({ type: "exact", sameGarment: 2 });
  });
  it("a garment that turns up goes on the row marked missing, not the one in the DAMAGED box", () => {
    const roster = [flagged(row(1, "10", "Hawks", "A-L")), missing(row(2, "10", "Hawks", "A-L"))];
    const m = holdBack(matchRead(roster, clean("10")));
    expect(m.type).toBe("exact");
    expect(m.match._id).toBe(2);
  });
  it("a row not scanned yet comes before either", () => {
    const roster = [flagged(row(1, "10", "Hawks", "A-L")), missing(row(2, "10", "Hawks", "A-L")), row(3, "10", "Hawks", "A-L")];
    expect(matchRead(roster, clean("10")).match._id).toBe(3);
  });
  it("on a list: not scanned, then missing, then flagged on this order", () => {
    const rows = [flagged(row(1, "10", "Hawks", "A-L")), missing(row(2, "10", "Eagles", "A-M")), row(3, "10", "Owls", "A-S")];
    expect(sortCandidates(rows, "size").map(r => r._id)).toEqual([3, 2, 1]);
  });
});
