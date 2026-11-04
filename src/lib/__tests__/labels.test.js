// Bin labels for the Zebra: what each label says, and the ZPL that says it.
import { describe, it, expect } from "vitest";
import { binLabels, labelSize, binLabelZPL, labelsZPL } from "../labels.js";
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
  it("falls back to 2.25 x 1.25 when the spec makes no sense", () => {
    expect(labelSize("")).toMatchObject({ w: 457, h: 254 });
    expect(labelSize("wide")).toMatchObject({ w: 457, h: 254 });
    expect(labelSize(undefined)).toMatchObject({ w: 457, h: 254 });
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
    const z = binLabelZPL({ bin: 1, label: "Y-M", by: "size", count: 1, orderNumber: "" });
    expect(z).toContain("by size");
    expect(z).toContain("1 jersey^FS");
    expect(z).not.toContain("Order");
  });
  it("strips the ZPL control characters ^ and ~ from the data", () => {
    const z = binLabelZPL({ bin: 1, label: "Red^XZ~JA", by: "team", count: 2, orderNumber: "12~34" });
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
