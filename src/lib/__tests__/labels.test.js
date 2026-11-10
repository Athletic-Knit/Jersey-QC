// Bin labels for the Zebra: what each label says, and the ZPL that says it.
import { describe, it, expect } from "vitest";
import { binLabels, labelSize, binLabelZPL, labelsZPL, jerseyLabel, jerseyLabelZPL, flagLabel, flagLabelZPL, binListItem, binListLabels, binListZPL } from "../labels.js";
import { buildBinMap } from "../roster.js";

const roster = [
  { _id: 0, name: "SMITH",  number: "7",  team: "Navy", size: "A-L" },
  { _id: 1, name: "JONES",  number: "9",  team: "navy", size: "Y-M" },   // same team, the file's own spelling varies
  { _id: 2, name: "LEE",    number: "3",  team: "Red",  size: "A-L" },
  { _id: 3, name: "PATEL",  number: "12", team: "",     size: "A-XL" },  // no team: in no bin
];

describe("binLabels", () => {
  it("one entry per bin, by team, with the jersey count and the order number", () => {
    const labels = binLabels(roster, buildBinMap(roster, {}, "team"), { orderNumber: 264247 });
    expect(labels).toEqual([
      { bin: 1, label: "Navy", by: "team", count: 2, orderNumber: "264247" },
      { bin: 2, label: "Red",  by: "team", count: 1, orderNumber: "264247" },
    ]);
  });
  it("by size: bins in rack order", () => {
    const labels = binLabels(roster, buildBinMap(roster, {}, "size"));
    expect(labels.map(l => [l.bin, l.label, l.count, l.by])).toEqual([[1, "Y-M", 1, "size"], [2, "A-L", 2, "size"], [3, "A-XL", 1, "size"]]);
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
  it("one label: the size, the bin, the team, the footer", () => {
    const z = binLabelZPL(label, labelSize("2.25x1.25"));
    expect(z.startsWith("^XA")).toBe(true);
    expect(z.trim().endsWith("^XZ")).toBe(true);
    expect(z).toContain("^PW457");
    expect(z).toContain("^LL254");
    expect(z).toContain("^FDBIN 3^FS");
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
    expect(z).toContain("^FDBIN 3^FS");
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
    expect((z.match(/\^XA/g) || []).length).toBe(2);
    expect((z.match(/\^XZ/g) || []).length).toBe(2);
    expect(z).toContain("^FDBIN 1^FS");
    expect(z).toContain("^FDBIN 2^FS");
    expect(z.endsWith("\n")).toBe(true);
  });
});

// The sticker on every passed jersey: the bin and what the order is sorted by.
describe("jerseyLabel", () => {
  const byTeam = buildBinMap(roster, {}, "team"), bySize = buildBinMap(roster, {}, "size");
  it("by team: the bin and the team", () => {
    expect(jerseyLabel(roster[1], byTeam, { orderNumber: 264247 })).toEqual({ bin: 1, by: "team", value: "navy", orderNumber: "264247" });
    expect(jerseyLabel(roster[2], byTeam)).toEqual({ bin: 2, by: "team", value: "Red", orderNumber: "" });
  });
  it("by size: the bin and the size", () => {
    expect(jerseyLabel(roster[0], bySize)).toEqual({ bin: 2, by: "size", value: "A-L", orderNumber: "" });
  });
  it("a jersey in no bin still says its team; an order with no bins says the team, or the size when there is no team", () => {
    expect(jerseyLabel(roster[3], byTeam)).toEqual({ bin: "", by: "team", value: "", orderNumber: "" });
    expect(jerseyLabel(roster[0], null)).toMatchObject({ bin: "", by: "team", value: "Navy" });
    expect(jerseyLabel(roster[3], null)).toMatchObject({ bin: "", by: "size", value: "A-XL" });
  });
});

describe("jerseyLabelZPL (1 x 0.5 in)", () => {
  it("BIN column on the left, the sort and its value on the right, the order under it", () => {
    const z = jerseyLabelZPL({ bin: 3, by: "team", value: "Navy", orderNumber: "264247" });
    expect(z).toContain("^PW203");
    expect(z).toContain("^LL102");
    expect(z).toContain("^FDBIN^FS");
    expect(z).toContain("^FD3^FS");
    expect(z).toContain("^FDTEAM^FS");
    expect(z).toContain("^FDNavy^FS");
    expect(z).toContain("^FDOrder 264247^FS");
    expect(z).toContain("^GB1,");                               // the hairline between the columns
    const bigFont = parseInt(z.split("\n").find(l => l.endsWith("^FD3^FS")).match(/\^A0N,(\d+)/)[1], 10);
    expect(bigFont).toBeGreaterThanOrEqual(48);                 // the bin number is the thing read from a distance
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
  it("no bin: no BIN column, the value across the label", () => {
    const z = jerseyLabelZPL({ bin: "", by: "team", value: "Navy", orderNumber: "1" });
    expect(z).not.toContain("^FDBIN^FS");
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
  it("from a log entry with a roster row: number, name, team, size, bin, the tag the caller gives, the reason, order, station and time", () => {
    expect(flagLabel(entry, byTeam, { orderNumber: 264247, station: "st-station1", tag: "STITCHER" })).toEqual({
      number: "3", name: "LEE", tag: "STITCHER", reason: "Loose, missing or broken stitching", team: "Red", size: "A-L", bin: 2,
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
  const l = { number: "7", name: "SMITH", tag: "STITCHER", reason: "Loose, missing or broken stitching", team: "Navy", size: "A-L", bin: 2, orderNumber: "264247", station: "St 1", time: "14:05" };
  const lines = z => z.split("\n");
  const fontOf = (z, text) => parseInt(lines(z).find(x => x.endsWith(`^FD${text}^FS`)).match(/\^A0N,(\d+)/)[1], 10);
  const topOf = z => lines(z).filter(x => x.startsWith("^FO") && !x.includes("^GB")).map(x => parseInt(x.match(/\^FO\d+,(\d+)/)[1], 10));
  it("the ticket is 2 in wide by 1 in tall by default", () => {
    expect(labelSize("2x1")).toMatchObject({ w: 406, h: 203, top: 16 });
    const z = flagLabelZPL(l);
    expect(z).toContain("^PW406");
    expect(z).toContain("^LL209");
  });
  it("a solid black column on the left with FLAG, the number and the name in white", () => {
    const z = flagLabelZPL(l);
    expect(z).toContain("^FO0,0^GB141,213,141^FS");                 // a box filled by its own border, off the top and left edges
    expect(z).toContain("^FR^FDFLAG^FS");
    expect(z).toContain("^FR^FD7^FS");
    expect(z).toContain("^FR^FDSMITH^FS");
    expect(fontOf(z, "7")).toBeGreaterThanOrEqual(90);               // ~11 mm, read from across the table
    expect(fontOf(z, "SMITH")).toBeGreaterThanOrEqual(24);
  });
  it("the route tag big on the right, the reason wrapped, team · size · bin, and order · station · time at the bottom", () => {
    const z = flagLabelZPL(l);
    expect(z).toContain("^FDSTITCHER^FS");
    expect(fontOf(z, "STITCHER")).toBeGreaterThanOrEqual(45);
    expect(z).toMatch(/\^A0N,2[0-6],2[0-6]\^FB24\d,[23],0,C\^FDLoose, missing or broken stitching\^FS/);
    expect(z).toContain("^FDNavy · A-L · Bin 2^FS");
    expect(fontOf(z, "Navy · A-L · Bin 2")).toBeGreaterThanOrEqual(22);
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
    expect(z).toContain("^FO0,0^GB65,112,65^FS");
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

// What is in a bin, on the 2 x 1 in roll: ten jerseys a label, two columns of five.
describe("bin list", () => {
  const rows = Array.from({ length: 23 }, (_, i) => ({ _id: i, number: String(30 - i), name: i % 2 ? `P${i}` : "", size: i % 3 ? "A-XL" : "Y-M" }));
  it("an item is number-name-size, the size without its hyphen", () => {
    expect(binListItem({ number: "23", name: "James", size: "A-XL" })).toBe("23-James-AXL");
    expect(binListItem({ number: "7", name: "", size: "Y-M" })).toBe("7-YM");
    expect(binListItem({ number: "7", name: "LEE", size: "" })).toBe("7-LEE");
  });
  it("ten to a label, in jersey-number order: 23 jerseys are 3 labels", () => {
    const labels = binListLabels(rows, { bin: 3, label: "Navy", orderNumber: 264247 });
    expect(labels.map(l => l.items.length)).toEqual([10, 10, 3]);
    expect(labels.map(l => [l.page, l.pages, l.count])).toEqual([[1, 3, 23], [2, 3, 23], [3, 3, 23]]);
    expect(labels[0].items[0].startsWith("8-")).toBe(true);       // 8 is the lowest number
    expect(labels[0].items[1].startsWith("9-")).toBe(true);       // 9 before 10: by number, not by text
    expect(labels[0].items[2].startsWith("10-")).toBe(true);
    expect(labels[2].items[2].startsWith("30-")).toBe(true);
    expect(binListLabels([], { bin: 1 })).toEqual([]);
    expect(binListLabels(rows.slice(0, 15), { bin: 1 }).length).toBe(2);
    expect(binListLabels(rows.slice(0, 10), { bin: 1 }).length).toBe(1);
  });
  it("the label: a header, then the left column top to bottom and the right column top to bottom", () => {
    const [l] = binListLabels(rows.slice(0, 10).map((r, i) => ({ ...r, number: String(i + 1), name: `N${i + 1}`, size: "A-L" })), { bin: 3, label: "Navy", orderNumber: "264247" });
    const z = binListZPL(l);
    expect(z).toContain("^PW406");
    expect(z).toContain("^LL203");
    expect(z).toContain("^FDBIN 3  Navy^FS");
    expect(z).toContain("Order 264247  10 pcs");
    const pos = t => { const m = z.split("\n").find(x => x.endsWith(`^FD${t}^FS`)).match(/\^FO(\d+),(\d+)/); return [Number(m[1]), Number(m[2])]; };
    const [x1, y1] = pos("1-N1-AL"), [x5, y5] = pos("5-N5-AL"), [x6, y6] = pos("6-N6-AL"), [x10, y10] = pos("10-N10-AL");
    expect(x5).toBe(x1); expect(y5).toBeGreaterThan(y1);          // 1 to 5 down the left
    expect(x6).toBeGreaterThan(x1); expect(y6).toBe(y1);          // 6 starts the right column, level with 1
    expect(x10).toBe(x6); expect(y10).toBe(y5);
    expect(y10 + 20).toBeLessThanOrEqual(203);                    // the last row is on the label
    expect(y1).toBeGreaterThanOrEqual(16);                        // nothing in the top 2 mm
  });
  it("a long name shrinks to its column; labelsZPL knows the kinds", () => {
    const fontOf = (z, t) => parseInt(z.split("\n").find(x => x.endsWith(`^FD${t}^FS`)).match(/\^A0N,(\d+)/)[1], 10);
    const [l] = binListLabels([{ number: "23", name: "James", size: "A-XL" }, { number: "88", name: "Vanderhoogenband", size: "A-2XL" }], { bin: 1 });
    const z = binListZPL(l);
    expect(fontOf(z, "88-Vanderhoogenband-A2XL")).toBeLessThan(fontOf(z, "23-James-AXL"));
    const all = labelsZPL(binListLabels(rows, { bin: 2 }), labelSize("2x1"), "binlist");
    expect((all.match(/\^XA/g) || []).length).toBe(3);
    expect(labelsZPL([{ bin: 5, label: "Navy", by: "team", count: 0, orderNumber: "1" }], labelSize("2x1"), "binticket")).toContain("^FDBIN 5^FS");
  });
});
