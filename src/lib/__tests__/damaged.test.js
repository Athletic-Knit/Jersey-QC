// The DAMAGED box: what is in it, its list, and its own label.
import { describe, it, expect } from "vitest";
import { damagedItems, damagedListJobs, damagedBoxLabel, packFromRecord } from "../printjobs.js";
import { damagedListLabels, binListZPL, labelsZPL, labelSize, DAMAGED_PER_LABEL } from "../labels.js";

const row = (id, number, name, team, scanned) => ({ _id: id, number: String(number), name, team, size: "A-L", scanned });
const roster = [row(1, 7, "SMITH", "Navy", "flag"), row(2, 9, "JONES", "Navy", "pass"), row(3, 21, "LEACH", "Red", "flag"), row(4, 4, "ROY", "Red", "pass"), row(5, 30, "LEE", "Red", false)];
const flag = (id, r, reason, timestamp, extra = {}) => ({ id, match: r, reason, timestamp, status: "flagged", ...extra });
const pack = {
  orderNumber: "264247", roster,
  flags: [
    flag(40, roster[2], "Hole or snag", "2026-11-17 10:05:00"),
    flag(30, roster[0], "Twill peeling — found after it passed", "2026-11-17 10:03:00"),
    flag(20, roster[0], "Logo or crest", "2026-11-17 10:01:00"),            // flagged twice: the newer reason is the one that counts
    flag(10, roster[3], "Stitching or seam", "2026-11-17 10:00:00"),         // flagged, then passed: it is not in the box
    flag(50, { number: "88", name: "STRAY", team: "", offRoster: true }, "Not on the roster", "2026-11-17 10:06:00"),
  ],
};

describe("what is in the DAMAGED box", () => {
  it("every garment flagged right now, with its newest reason, in number order", () => {
    expect(damagedItems(pack).map(({ number, name, team, reason }) => ({ number, name, team, reason }))).toEqual([   // _id and size come along too (the order summary, 24 Nov 2026)
      { number: "7", name: "SMITH", team: "Navy", reason: "Twill peeling — found after it passed" },
      { number: "21", name: "LEACH", team: "Red", reason: "Hole or snag" },
      { number: "88", name: "STRAY", team: "", reason: "Not on the roster" },
    ]);
  });
  it("a garment that passed after its flag is out; so is an off-roster flag the supervisor resolved", () => {
    expect(damagedItems(pack).some(x => x.name === "ROY")).toBe(false);
    const resolved = { ...pack, flags: pack.flags.map(f => f.id === 50 ? { ...f, resolution: "Rejected" } : f) };
    expect(damagedItems(resolved).some(x => x.name === "STRAY")).toBe(false);
    expect(damagedItems({ roster, flags: [] })).toEqual([]);
    expect(damagedItems(null)).toEqual([]);
  });
  it("the hub's record of a past order gives the same list", () => {
    const rec = { order: "264247", station: "st-station1", rows: roster, bins: { navy: "1.1", red: "2.1" }, closedBins: [],
      flags: [{ id: 30, rowId: 1, reason: "Twill peeling", t: "2026-11-17 10:03:00" }, { id: 40, rowId: 3, reason: "Hole or snag", t: "2026-11-17 10:05:00" }] };
    expect(damagedItems(packFromRecord(rec)).map(x => [x.number, x.reason])).toEqual([["7", "Twill peeling"], ["21", "Hole or snag"]]);
  });
  // Code review of 23 Nov 2026: packFromRecord dropped `resolution`.
  it("a past order's off-roster flag the supervisor dealt with is out of its list", () => {
    const off = { id: 60, number: "88", name: "STRAY", reason: "Not on the roster", t: "2026-11-17 10:07:00" };
    const rec = { order: "264247", station: "st-station1", rows: roster, bins: null, closedBins: [], flags: [off] };
    expect(damagedItems(packFromRecord(rec)).map(x => x.name)).toEqual(["STRAY"]);
    const done = { ...rec, flags: [{ ...off, resolution: "Dealt with by the supervisor" }] };
    expect(packFromRecord(done).flags[0].resolution).toBe("Dealt with by the supervisor");
    expect(damagedItems(packFromRecord(done))).toEqual([]);
  });
});

describe("the DAMAGED box's list and label", () => {
  it("a header with the order and the count, then number, name, team and reason on a line each", () => {
    const [l] = damagedListJobs(pack);
    expect(l).toMatchObject({ damaged: true, orderNumber: "264247", count: 3, page: 1, pages: 1 });
    expect(l.items).toEqual([{ who: "#7 SMITH Navy", reason: "Twill peeling" }, { who: "#21 LEACH Red", reason: "Hole or snag" }, { who: "#88 STRAY", reason: "Not on the roster" }]);
    const z = binListZPL(l, labelSize("2x1"));
    expect(z).toContain("^FDDAMAGED  Order 264247^FS");
    expect(z).toContain("^FD3 pcs^FS");
    expect(z).toContain("^FD#7 SMITH Navy: Twill peeling^FS");
    expect(z).toContain("^FD#21 LEACH Red: Hole or snag^FS");
    expect(z).not.toContain("found after it passed");
    const ys = [...z.matchAll(/\^FO(\d+),(\d+)\^A0N,(\d+)/g)].map(m => ({ x: +m[1], bottom: +m[2] + +m[3] }));
    ys.forEach(f => { expect(f.bottom).toBeLessThanOrEqual(203); expect(f.x).toBeGreaterThanOrEqual(16); });
  });
  it("seven a label; more go on further labels, the last page printed first; none is no label", () => {
    const many = Array.from({ length: 16 }, (_, i) => ({ number: i + 1, name: `P${i + 1}`, team: "Navy", reason: "Size label" }));
    const labels = damagedListLabels(many, { orderNumber: "5" });
    expect(DAMAGED_PER_LABEL).toBe(7);
    expect(labels.map(l => [l.page, l.items.length])).toEqual([[3, 2], [2, 7], [1, 7]]);
    expect(labelsZPL(labels, labelSize("2x1"), "binlist")).toContain("^FD16 pcs  3/3^FS");
    expect(damagedListLabels([], { orderNumber: "5" })).toEqual([]);
    expect(damagedListLabels([{ number: "", name: "", team: "", reason: "" }])[0].items).toEqual([{ who: "Garment", reason: "Flagged" }]);
  });
  it("a long line is squeezed, never wrapped: no row is in a wrapping box", () => {
    const [l] = damagedListLabels([{ number: 23, name: "VANDENBERGHE", team: "MISSISSAUGA STEELHEADS", reason: "Dirt that will not come out" }], { orderNumber: "264247" });
    const rowLine = binListZPL(l, labelSize("2x1")).split("\n").find(x => x.includes("VANDENBERGHE"));
    expect(rowLine).not.toContain("^FB");
  });
  it("the box's own label says DAMAGED, not a box number", () => {
    const l = damagedBoxLabel({ orderNumber: "264247" });
    expect(l).toMatchObject({ title: "DAMAGED", label: "Flagged garments", orderNumber: "264247" });
    const z = labelsZPL([l], labelSize("2x1"), "binticket");
    expect(z).toContain("^FDDAMAGED^FS");
    expect(z).not.toContain("BOX");
  });
});

// Two things the first review of these labels found.
describe("the flag ticket's reason never needs a fourth line", () => {
  const lineOf = z => z.split("\n").find(x => /\^FB\d+,[123],0,C\^FD/.test(x) && !/Ord |·/.test(x));
  const wrapped = (text, per) => { let n = 1, used = 0; for (const w of text.split(/\s+/)) { if (used && used + 1 + w.length > per) { n++; used = w.length; } else used += (used ? 1 : 0) + w.length; } return n; };
  it("old long wordings and a long typed reason fit in three lines, or are cut with an ellipsis", async () => {
    const { flagLabelZPL } = await import("../labels.js");
    for (const reason of ["Wrong name, number or team", "Missing, wrong or misplaced logo", "Print error — ghosting, fading, misaligned", "the left sleeve has a long pulled thread near the cuff and the hem is coming apart at the side seam"]) {
      const z = flagLabelZPL({ number: "7", name: "SMITH", reason, team: "Navy", size: "A-L", orderNumber: "264247", station: "St 1", time: "12:05" }, labelSize("2x1"));
      const row = lineOf(z), m = row.match(/\^FO(\d+),(\d+)\^A0N,(\d+),\d+\^FB(\d+),(\d),0,C\^FD(.*)\^FS/);
      const fh = +m[3], width = +m[4], lines = +m[5], text = m[6];
      expect(wrapped(text, Math.floor(width / (0.6 * fh)))).toBeLessThanOrEqual(lines);
      expect(lines).toBeLessThanOrEqual(3);
      expect(+m[2] + Math.min(lines, wrapped(text, Math.floor(width / (0.6 * fh)))) * fh).toBeLessThanOrEqual(203);
    }
  });
});
describe("the customer's label counts a team once however it is spelt", () => {
  it("Navy and navy are one line of the tally", async () => {
    const { binListLabels } = await import("../labels.js");
    const rows = [{ number: "1", team: "Navy", size: "A-L" }, { number: "2", team: "navy ", size: "A-L" }, { number: "3", team: "Red", size: "A-L" }];
    const labels = binListLabels(rows, { bin: "1.1", label: "A-L", orderNumber: "5", by: "size" });
    expect(labels[labels.length - 1].mix).toBe("Navy 2   Red 1");
  });
});
