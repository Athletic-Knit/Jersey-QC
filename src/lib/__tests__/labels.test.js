// Bin labels for the Zebra: what each label says, and the ZPL that says it.
import { describe, it, expect } from "vitest";
import { binLabels, labelSize, binLabelZPL, labelsZPL, jerseyLabel, jerseyLabelZPL, flagLabel, flagLabelZPL, binListItem, binListLabels, binListZPL, BIN_LIST_PER_LABEL } from "../labels.js";
import { buildBinMap } from "../roster.js";

const roster = [
  { _id: 0, name: "SMITH",  number: "7",  team: "Navy", size: "A-L" },
  { _id: 1, name: "JONES",  number: "9",  team: "navy", size: "Y-M" },   // same team, the file's own spelling varies
  { _id: 2, name: "LEE",    number: "3",  team: "Red",  size: "A-L" },
  { _id: 3, name: "PATEL",  number: "12", team: "",     size: "A-XL" },  // no team: the "No team" bin
];

describe("binLabels", () => {
  it("one entry per box, by team, with the jersey count and the order number", () => {
    const labels = binLabels(roster, buildBinMap(roster, {}, "team"), { orderNumber: 264247 });
    expect(labels).toEqual([
      { bin: "1.1", label: "Navy", by: "team", count: 2, orderNumber: "264247" },
      { bin: "2.1", label: "Red",  by: "team", count: 1, orderNumber: "264247" },
      { bin: "3.1", label: "No team", by: "team", count: 1, orderNumber: "264247" },   // every jersey is in a box
    ]);
  });
  it("boxes: so many labels for a team that will fill several, one for the others", () => {
    const map = buildBinMap(roster, {}, "team");
    const labels = binLabels(roster, map, { orderNumber: 264247, boxes: { "1.1": 3 } });
    expect(labels.map(l => [l.bin, l.label])).toEqual([["1.1", "Navy"], ["1.2", "Navy"], ["1.3", "Navy"], ["2.1", "Red"], ["3.1", "No team"]]);
    expect(labels.slice(0, 3).every(l => l.count === 2 && l.by === "team" && l.orderNumber === "264247")).toBe(true);
    // a team already on its second box carries on from there
    expect(binLabels(roster, { ...map, navy: "1.2" }, { boxes: { "1.2": 2 } }).map(l => l.bin)).toEqual(["1.2", "1.3", "2.1", "3.1"]);
  });
  it("by size: boxes in rack order", () => {
    const labels = binLabels(roster, buildBinMap(roster, {}, "size"));
    expect(labels.map(l => [l.bin, l.label, l.count, l.by])).toEqual([["1.1", "Y-M", 1, "size"], ["2.1", "A-L", 2, "size"], ["3.1", "A-XL", 1, "size"]]);
    expect(labels[0].orderNumber).toBe("");
  });
  it("no bin map: no labels", () => {
    expect(binLabels(roster, null)).toEqual([]);
  });
});

describe("labelSize", () => {
  it("inches to dots at 203 dpi", () => {
    expect(labelSize("2.25x1.25")).toMatchObject({ w: 457, h: 254, dpi: 203, widthIn: 2.25, heightIn: 1.25 });
    expect(labelSize("4 X 6")).toMatchObject({ w: 812, h: 1218 });
    expect(labelSize("3×2", 300)).toMatchObject({ w: 900, h: 600 });
  });
  it("the roll is 1 x 0.5 in unless the spec says otherwise", () => {
    expect(labelSize()).toMatchObject({ w: 203, h: 102, widthIn: 1, heightIn: 0.5, top: 16 });   // printing starts 2 mm down
    expect(labelSize("")).toMatchObject({ w: 203, h: 102 });
    expect(labelSize("wide")).toMatchObject({ w: 203, h: 102 });
  });
});

describe("ZPL", () => {
  const label = { bin: 3, label: "Navy", by: "team", count: 14, orderNumber: "264247" };
  it("one label: the size, the box, the team, the footer", () => {
    const z = binLabelZPL(label, labelSize("2.25x1.25"));
    expect(z.startsWith("^XA")).toBe(true);
    expect(z.trim().endsWith("^XZ")).toBe(true);
    expect(z).toContain("^PW457");
    expect(z).toContain("^LL254");
    expect(z).toContain("^FDBOX 3^FS");
    expect(binLabelZPL({ ...label, bin: "1.1" }, labelSize("2.25x1.25"))).toContain("^FDBOX 1.1^FS");
    expect(z).toContain("^FDNavy^FS");
    expect(z).toContain("Order 264247");
    expect(z).toContain("by team");
    expect(z).not.toContain("jerseys");   // no count: nobody knows how many go in before it is full
    expect(z).toContain("^CI28");   // UTF-8 data, so a team named "Équipe" prints
  });
  it("by size, one jersey, no order number", () => {
    const z = binLabelZPL({ bin: 1, label: "Y-M", by: "size", count: 1, orderNumber: "" }, labelSize("2.25x1.25"));
    expect(z).toContain("by size");
    expect(z).not.toContain("jersey");
    expect(z).not.toContain("Order");
  });
  it("on the small roll the footer is just the order number", () => {
    const z = binLabelZPL(label, labelSize("1x0.5"));
    expect(z).toContain("^PW203");
    expect(z).toContain("^LL102");
    expect(z).toContain("^FDBOX 3^FS");
    expect(z).toContain("^FDOrder 264247^FS");
    expect(z).not.toContain("by team");
    expect(z).not.toContain("jerseys");
  });
  it("strips the ZPL control characters ^ and ~ from the data", () => {
    const z = binLabelZPL({ bin: 1, label: "Red^XZ~JA", by: "team", count: 2, orderNumber: "12~34" }, labelSize("2.25x1.25"));
    expect(z).toContain("^FDRed XZ JA^FS");
    expect(z).toContain("Order 12 34");
    expect((z.match(/\^XZ/g) || []).length).toBe(1);
    expect(z).not.toContain("~");
  });
  it("every label scales with the label size", () => {
    const small = binLabelZPL(label, labelSize("2.25x1.25")), big = binLabelZPL(label, labelSize("4x6"));
    const fontOf = z => parseInt(z.match(/\^A0N,(\d+)/)[1], 10);
    expect(fontOf(big)).toBeGreaterThan(fontOf(small));
    expect(big).toContain("^FB780,")   // 4 in less 2 mm each side;
  });
  it("a long team name gets a smaller font so it fits the width", () => {
    const fontOf = z => parseInt(z.split("\n").find(l => l.includes("^FDBlue Jays Home") || l.includes("^FDNavy")).match(/\^A0N,(\d+)/)[1], 10);
    const short = binLabelZPL({ ...label, label: "Navy" }), long = binLabelZPL({ ...label, label: "Blue Jays Home Alternate" });
    expect(fontOf(long)).toBeLessThan(fontOf(short));
    expect(fontOf(long)).toBeGreaterThanOrEqual(10);
  });
  it("labelsZPL joins one ^XA…^XZ block per label", () => {
    const labels = binLabels(roster, buildBinMap(roster, {}, "team"), { orderNumber: "1" });
    const z = labelsZPL(labels);
    expect((z.match(/\^XA/g) || []).length).toBe(3);
    expect((z.match(/\^XZ/g) || []).length).toBe(3);
    expect(z).toContain("^FDBOX 1.1^FS");
    expect(z).toContain("^FDBOX 2.1^FS");
    expect(z.endsWith("\n")).toBe(true);
  });
});

// The sticker on every passed jersey: the box and what the order is sorted by.
describe("jerseyLabel", () => {
  const byTeam = buildBinMap(roster, {}, "team"), bySize = buildBinMap(roster, {}, "size");
  it("by team: the box and the team", () => {
    expect(jerseyLabel(roster[1], byTeam, { orderNumber: 264247 })).toEqual({ bin: "1.1", by: "team", value: "navy", orderNumber: "264247" });
    expect(jerseyLabel(roster[2], byTeam)).toEqual({ bin: "2.1", by: "team", value: "Red", orderNumber: "" });
  });
  it("by size: the box and the size", () => {
    expect(jerseyLabel(roster[0], bySize)).toEqual({ bin: "2.1", by: "size", value: "A-L", orderNumber: "" });
  });
  it("a jersey with no team is in the No team box; an order with no boxes says the team, or the size when there is no team", () => {
    expect(jerseyLabel(roster[3], byTeam)).toEqual({ bin: "3.1", by: "team", value: "", orderNumber: "" });
    expect(jerseyLabel(roster[0], null)).toMatchObject({ bin: "", by: "team", value: "Navy" });
    expect(jerseyLabel(roster[3], null)).toMatchObject({ bin: "", by: "size", value: "A-XL" });
  });
});

describe("jerseyLabelZPL (1 x 0.5 in)", () => {
  it("BOX column on the left, the sort and its value on the right, the order under it", () => {
    const z = jerseyLabelZPL({ bin: 3, by: "team", value: "Navy", orderNumber: "264247" });
    expect(z).toContain("^PW203");
    expect(z).toContain("^LL102");
    expect(z).toContain("^FDBOX^FS");
    expect(z).not.toContain("^FDBIN^FS");
    expect(z).toContain("^FD3^FS");
    expect(z).toContain("^FDTEAM^FS");
    expect(z).toContain("^FDNavy^FS");
    expect(z).toContain("^FDOrder 264247^FS");
    expect(z).toContain("^GB1,");                               // the hairline between the columns
    const bigFont = parseInt(z.split("\n").find(l => l.endsWith("^FD3^FS")).match(/\^A0N,(\d+)/)[1], 10);
    expect(bigFont).toBeGreaterThanOrEqual(48);                 // the box number is the thing read from a distance
    expect(jerseyLabelZPL({ bin: "12.3", by: "team", value: "Navy", orderNumber: "264247" })).toContain("^FD12.3^FS");   // a two-number box name
  });
  it("nothing is printed in the top 2 mm, where the ZD411 cuts the first line in half", () => {
    const ys = z => z.split("\n").filter(l => l.startsWith("^FO")).map(l => parseInt(l.match(/\^FO\d+,(\d+)/)[1], 10));
    expect(Math.min(...ys(jerseyLabelZPL({ bin: 3, by: "team", value: "Navy", orderNumber: "264247" })))).toBeGreaterThanOrEqual(16);
    expect(Math.min(...ys(binLabelZPL({ bin: 3, label: "Navy", by: "team", count: 1, orderNumber: "1" })))).toBeGreaterThanOrEqual(16);
    const bottom = jerseyLabelZPL({ bin: 3, by: "team", value: "Navy", orderNumber: "264247" }).split("\n").find(l => l.includes("Order"));
    const [, y, fh] = bottom.match(/\^FO\d+,(\d+)\^A0N,(\d+)/).map(Number);
    expect(y + fh).toBeLessThanOrEqual(102);                   // and the order line still sits on the sticker
  });
  it("by size", () => {
    const z = jerseyLabelZPL({ bin: 2, by: "size", value: "A-XL", orderNumber: "" });
    expect(z).toContain("^FDSIZE^FS");
    expect(z).toContain("^FDA-XL^FS");
    expect(z).not.toContain("Order");
  });
  it("no box: no BOX column, the value across the label", () => {
    const z = jerseyLabelZPL({ bin: "", by: "team", value: "Navy", orderNumber: "1" });
    expect(z).not.toContain("^FDBOX^FS");
    expect(z).not.toContain("^GB");
    expect(z).toMatch(/\^FB19\d,1,0,C\^FDNavy\^FS/);          // nearly the whole width
  });
  it("no value: a dash, so the sticker never prints blank", () => {
    expect(jerseyLabelZPL({ bin: 1, by: "team", value: "", orderNumber: "" })).toContain("^FD—^FS");
  });
  it("a long team name shrinks to fit the column", () => {
    const fontOf = (z, text) => parseInt(z.split("\n").find(l => l.endsWith(`^FD${text}^FS`)).match(/\^A0N,(\d+)/)[1], 10);
    const short = jerseyLabelZPL({ bin: 1, by: "team", value: "Navy" }), long = jerseyLabelZPL({ bin: 1, by: "team", value: "Blue Jays Home" });
    expect(fontOf(long, "Blue Jays Home")).toBeLessThan(fontOf(short, "Navy"));
  });
  it("strips ^ and ~; labelsZPL with kind jersey uses this layout", () => {
    const z = labelsZPL([{ bin: 1, by: "team", value: "Red^XZ", orderNumber: "1~2" }, { bin: 2, by: "team", value: "Navy" }], labelSize(), "jersey");
    expect((z.match(/\^XA/g) || []).length).toBe(2);
    expect(z).toContain("^FDRed XZ^FS");
    expect(z).toContain("Order 1 2");
    expect(z).toContain("^FDTEAM^FS");
  });
});

// The ticket on every flagged jersey: the mirror of the sticker, black on the left.
describe("flagLabel", () => {
  const byTeam = buildBinMap(roster, {}, "team");
  const entry = { id: 5, match: roster[2], status: "flagged", reason: "Loose, missing or broken stitching", timestamp: "2026-11-06 14:05:12", operator: "Priya" };
  it("from a log entry with a roster row: number, name, team, size, box, the tag the caller gives, the reason, order, station and time", () => {
    expect(flagLabel(entry, byTeam, { orderNumber: 264247, station: "st-station1", tag: "STITCHER" })).toEqual({
      number: "3", name: "LEE", tag: "STITCHER", reason: "Loose, missing or broken stitching", team: "Red", size: "A-L", bin: "2.1",
      orderNumber: "264247", station: "St 1", time: "14:05",
    });
  });
  it("no roster row (not on the roster, could not read): what the camera read, or ?", () => {
    expect(flagLabel({ detected: { number: "88", name: "NOBODY" }, reason: "Not on the roster." }, byTeam, { tag: "CHECK ORDER" })).toMatchObject({ number: "88", name: "NOBODY", tag: "CHECK ORDER", team: "", size: "", bin: "", station: "", time: "" });
    expect(flagLabel({ detected: {}, reason: "Could not read" }, null)).toMatchObject({ number: "?", name: "", tag: "DECIDE" });
  });
  it("a flag found after it passed loses the suffix on the ticket", () => {
    expect(flagLabel({ ...entry, reason: "Seam, hem or construction — found after it passed" }, byTeam).reason).toBe("Seam, hem or construction");
  });
});

describe("flagLabelZPL (2 x 1 in)", () => {
  const l = { number: "7", name: "SMITH", tag: "STITCHER", reason: "Loose, missing or broken stitching", team: "Navy", size: "A-L", bin: "2.1", orderNumber: "264247", station: "St 1", time: "14:05" };
  const lines = z => z.split("\n");
  const fontOf = (z, text) => parseInt(lines(z).find(x => x.endsWith(`^FD${text}^FS`)).match(/\^A0N,(\d+)/)[1], 10);
  const topOf = z => lines(z).filter(x => x.startsWith("^FO") && !x.includes("^GB")).map(x => parseInt(x.match(/\^FO\d+,(\d+)/)[1], 10));
  it("the ticket is 2 in wide by 1 in tall by default", () => {
    expect(labelSize("2x1")).toMatchObject({ w: 406, h: 203, top: 16 });
    const z = flagLabelZPL(l);
    expect(z).toContain("^PW406");
    expect(z).toContain("^LL207");
  });
  it("a solid black column on the left with FLAG, the number and the name in white", () => {
    const z = flagLabelZPL(l);
    expect(z).toContain("^FO0,0^GB141,211,141^FS");                 // a box filled by its own border, off the top and left edges
    expect(z).toContain("^FR^FDFLAG^FS");
    expect(z).toContain("^FR^FD7^FS");
    expect(z).toContain("^FR^FDSMITH^FS");
    expect(fontOf(z, "7")).toBeGreaterThanOrEqual(90);               // ~11 mm, read from across the table
    expect(fontOf(z, "SMITH")).toBeGreaterThanOrEqual(24);
  });
  it("the route tag big on the right, the reason wrapped, team · size · box, and order · station · time at the bottom", () => {
    const z = flagLabelZPL(l);
    expect(z).toContain("^FDSTITCHER^FS");
    expect(fontOf(z, "STITCHER")).toBeGreaterThanOrEqual(45);
    expect(z).toMatch(/\^A0N,2[0-6],2[0-6]\^FB24\d,[23],0,C\^FDLoose, missing or broken stitching\^FS/);
    expect(z).toContain("^FDNavy · A-L · Box 2.1^FS");
    expect(fontOf(z, "Navy · A-L · Box 2.1")).toBeGreaterThanOrEqual(22);
    expect(z).toContain("^FDOrd 264247 · St 1 · 14:05^FS");
    expect(topOf(z).every(y => y >= 16)).toBe(true);
    expect(z).not.toContain("^FR^FDSTITCHER");                      // the right column is black on white
  });
  it("a long reason takes three lines, a little smaller, rather than losing its end", () => {
    const long = flagLabelZPL({ ...l, reason: "Print error — ghosting, fading, misaligned" });
    expect(long).toMatch(/\^A0N,2[0-4],2[0-4]\^FB24\d,3,0,C\^FDPrint error — ghosting, fading, misaligned\^FS/);
    expect(fontOf(flagLabelZPL({ ...l, reason: "Cleaning not done" }), "Cleaning not done")).toBe(26);
  });
  it("on the 1 x 0.5 in sticker roll the same layout still fits, smaller", () => {
    const z = flagLabelZPL(l, labelSize("1x0.5"));
    expect(z).toContain("^PW203");
    expect(z).toContain("^FO0,0^GB65,110,65^FS");
    expect(z).toContain("^FR^FD7^FS");
    expect(z).toContain("^FDSTITCHER^FS");
    expect(topOf(z).every(y => y >= 16 && y < 102)).toBe(true);
    expect(lines(z).filter(x => x.includes("^A0N")).every(x => parseInt(x.match(/\^A0N,(\d+)/)[1], 10) >= 10)).toBe(true);
  });
  it("nothing to say: no name, no reason, no team — the ticket still prints", () => {
    const z = flagLabelZPL({ number: "?", name: "", tag: "DECIDE", reason: "", team: "", size: "", bin: "", orderNumber: "", station: "", time: "" });
    expect(z).toContain("^FR^FD?^FS");
    expect(z).toContain("^FDDECIDE^FS");
    expect(z).not.toContain("^FD^FS");
  });
  it("labelsZPL with kind flag uses this layout", () => {
    const z = labelsZPL([l, { ...l, number: "9" }], labelSize("2x1"), "flag");
    expect((z.match(/\^XA/g) || []).length).toBe(2);
    expect(z).toContain("^PW406");
    expect(z).toContain("^FR^FD9^FS");
  });
});

// What is in a box, on the 2 x 1 in roll: a count label, then fourteen jerseys a label, two columns of seven.
describe("box list", () => {
  const rows = Array.from({ length: 23 }, (_, i) => ({ _id: i, number: String(30 - i), name: i % 2 ? `P${i}` : "", size: i % 3 ? "A-XL" : "Y-M" }));
  it("an item is number-name-size, the size without its hyphen", () => {
    expect(binListItem({ number: "23", name: "James", size: "A-XL" })).toBe("23-James-AXL");
    expect(binListItem({ number: "7", name: "", size: "Y-M" })).toBe("7-YM");
    expect(binListItem({ number: "7", name: "LEE", size: "" })).toBe("7-LEE");
  });
  it("fourteen to a label in jersey-number order; printed last page first, the count label last", () => {
    expect(BIN_LIST_PER_LABEL).toBe(14);
    const labels = binListLabels(rows, { bin: "3.1", label: "Navy", orderNumber: 264247 });
    expect(labels.map(l => l.title ? "count" : l.page)).toEqual([2, 1, "count"]);      // the order they print in
    expect(labels.map(l => l.items.length)).toEqual([9, 14, 0]);
    expect(labels.every(l => l.bin === "3.1" && l.label === "Navy" && l.orderNumber === "264247" && l.count === 23 && l.pages === 2)).toBe(true);
    const first = labels[1], last = labels[0];
    expect(first.items[0].startsWith("8-")).toBe(true);           // 8 is the lowest number
    expect(first.items[1].startsWith("9-")).toBe(true);           // 9 before 10: by number, not by text
    expect(first.items[2].startsWith("10-")).toBe(true);
    expect(last.items[8].startsWith("30-")).toBe(true);
    expect(binListLabels([], { bin: "1.1" })).toEqual([]);
    expect(binListLabels(rows.slice(0, 15), { bin: "1.1" }).length).toBe(3);   // two of rows and the count label
    expect(binListLabels(rows.slice(0, 14), { bin: "1.1" }).length).toBe(2);
    expect(binListLabels(rows.slice(0, 1), { bin: "1.1" }).length).toBe(2);
  });
  it("the count label: BOX 5.1, the pieces, the team and the order", () => {
    const labels = binListLabels(rows, { bin: "5.1", label: "Navy", orderNumber: "264247" });
    const z = binListZPL(labels[labels.length - 1], labelSize("2x1"));
    expect(z).toContain("^FDBOX 5.1^FS");
    expect(z).toContain("^FD23 pcs^FS");
    expect(z).toContain("^FDNavy   Order 264247^FS");
    expect(binListZPL({ title: true, bin: "5.2", label: "Navy", orderNumber: "", count: 1 }, labelSize("2x1"))).toContain("^FD1 pc^FS");
    const fields = [...z.matchAll(/\^FO(\d+),(\d+)\^A0N,(\d+),/g)].map(m => ({ x: +m[1], y: +m[2], fh: +m[3] }));
    expect(fields.length).toBe(3);
    fields.forEach(f => { expect(f.y + f.fh).toBeLessThanOrEqual(203); expect(f.y).toBeGreaterThanOrEqual(16); expect(f.x).toBeGreaterThanOrEqual(16); });
    expect(fields[0].fh).toBeGreaterThan(fields[1].fh);           // the box name is the biggest thing on it
    expect(fields[1].fh).toBeGreaterThan(fields[2].fh);
  });
  it("a label of rows has no header: the left column top to bottom, then the right, and nothing else", () => {
    const size = labelSize("2x1");
    const labels = binListLabels(Array.from({ length: 14 }, (_, i) => ({ _id: i, number: String(i + 1), name: i === 3 ? "MACDONALD" : `N${i + 1}`, size: "A-L" })), { bin: "3.1", label: "Navy", orderNumber: "264247" });
    const l = labels[0];
    expect(l.items.length).toBe(14);
    const z = binListZPL(l, size);
    expect(z).toContain("^PW406");
    expect(z).toContain("^LL203");
    expect(z).not.toMatch(/BOX|Navy|Order|pcs|\^GB/);              // no header, no rule
    const fields = z.split("\n").filter(x => x.includes("^FD")).map(x => { const m = x.match(/^\^FO(\d+),(\d+)\^A0N,(\d+),(\d+)(\^FB)?.*\^FD(.*)\^FS$/); return { x: Number(m[1]), y: Number(m[2]), fh: Number(m[3]), boxed: !!m[5], text: m[6] }; });
    expect(fields.map(f => f.text)).toEqual(l.items);             // fourteen rows, in order, and nothing else
    expect(fields.some(f => f.boxed)).toBe(false);                // no ^FB: a wide line can never wrap over itself
    fields.forEach(f => { expect(f.y + f.fh).toBeLessThanOrEqual(size.h); expect(f.y).toBeGreaterThanOrEqual(size.top); expect(f.x).toBeGreaterThanOrEqual(16); });
    expect(fields[6].x).toBe(fields[0].x); expect(fields[6].y).toBeGreaterThan(fields[0].y);     // 1 to 7 down the left
    expect(fields[7].x).toBeGreaterThan(fields[0].x); expect(fields[7].y).toBe(fields[0].y);     // 8 starts the right column, level with 1
    expect(fields[13].x).toBe(fields[7].x); expect(fields[13].y).toBe(fields[6].y);
    expect(fields[0].fh).toBeGreaterThanOrEqual(20);              // rows as big as they were with ten a label
  });
  it("a long name shrinks to its column; labelsZPL knows the kinds", () => {
    const fontOf = (z, t) => parseInt(z.split("\n").find(x => x.endsWith(`^FD${t}^FS`)).match(/\^A0N,(\d+)/)[1], 10);
    const [l] = binListLabels([{ number: "23", name: "James", size: "A-XL" }, { number: "88", name: "Vanderhoogenband", size: "A-2XL" }], { bin: 1 });
    const z = binListZPL(l);
    expect(fontOf(z, "88-Vanderhoogenband-A2XL")).toBeLessThan(fontOf(z, "23-James-AXL"));
    const all = labelsZPL(binListLabels(rows, { bin: 2 }), labelSize("2x1"), "binlist");
    expect((all.match(/\^XA/g) || []).length).toBe(3);
    expect(all.indexOf("^FD30-")).toBeLessThan(all.indexOf("^FD8-"));           // the last page prints first
    expect(all.indexOf("^FD8-")).toBeLessThan(all.indexOf("^FDBOX 2^FS"));      // the count label prints last
    expect(labelsZPL([{ bin: 5, label: "Navy", by: "team", count: 0, orderNumber: "1" }], labelSize("2x1"), "binticket")).toContain("^FDBOX 5^FS");
  });
});
