// Bin labels for the Zebra: what each label says, and the ZPL that says it.
import { describe, it, expect } from "vitest";
import { binLabels, labelSize, binLabelZPL, labelsZPL, jerseyLabel, jerseyLabelZPL } from "../labels.js";
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
    expect(labelSize()).toMatchObject({ w: 203, h: 102, widthIn: 1, heightIn: 0.5 });
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
    expect(z).toContain("14 jerseys");
    expect(z).toContain("^CI28");   // UTF-8 data, so a team named "Équipe" prints
  });
  it("by size, one jersey, no order number", () => {
    const z = binLabelZPL({ bin: 1, label: "Y-M", by: "size", count: 1, orderNumber: "" }, labelSize("2.25x1.25"));
    expect(z).toContain("by size");
    expect(z).toContain("1 jersey^FS");
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
    expect(big).toContain("^FB812,");
  });
  it("a long team name gets a smaller font so it fits the width", () => {
    const fontOf = z => parseInt(z.split("\n").find(l => l.includes("^FDBlue Jays Home") || l.includes("^FDNavy")).match(/\^A0N,(\d+)/)[1], 10);
    const short = binLabelZPL({ ...label, label: "Navy" }), long = binLabelZPL({ ...label, label: "Blue Jays Home" });
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
    expect(bigFont).toBeGreaterThanOrEqual(60);                 // the bin number is the thing read from a distance
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
    expect(z).toContain("^FB195,1,0,C^FDNavy^FS");
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
