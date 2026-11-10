// Every order has a bin, and a closed bin names the box it is packed in.
import { describe, it, expect } from "vitest";
import { boxFor, boxLimits, DEFAULT_BOXES } from "../boxes.js";
import { buildBinMap, binFor, binEntries, binCount, binFieldOf, closeBin, binContents, ALL_LABEL } from "../roster.js";
import { binListLabels, binListZPL, jerseyLabel, binLabels, binLabelZPL, labelSize } from "../labels.js";
import { buildBinsSheet } from "../export.js";

describe("the box a bin is packed in", () => {
  it("is the smallest one that holds the jerseys", () => {
    expect(boxFor(0)).toBe(null);
    expect(boxFor(1).label).toBe("Bag");
    expect(boxFor(2).label).toBe("Small box");
    expect(boxFor(DEFAULT_BOXES.boxSmall).label).toBe("Small box");
    expect(boxFor(DEFAULT_BOXES.boxSmall + 1).label).toBe("Medium box");
    expect(boxFor(DEFAULT_BOXES.boxMedium + 1).label).toBe("Large box");
    expect(boxFor(DEFAULT_BOXES.boxLarge).label).toBe("Large box");
  });
  it("is several large boxes past what one holds", () => {
    expect(boxFor(DEFAULT_BOXES.boxLarge + 1)).toEqual({ id: "large", label: "2 large boxes", boxes: 2 });
    expect(boxFor(DEFAULT_BOXES.boxLarge * 3).boxes).toBe(3);
  });
  it("follows the station's settings, and survives nonsense in them", () => {
    const s = { boxBag: 2, boxSmall: 10, boxMedium: 20, boxLarge: 40 };
    expect(boxFor(2, s).label).toBe("Bag");
    expect(boxFor(10, s).label).toBe("Small box");
    expect(boxFor(40, s).label).toBe("Large box");
    expect(boxLimits({ boxSmall: "x", boxMedium: -3 }).map(k => k.max)).toEqual([1, 6, 15, 30]);
    expect(boxLimits({ boxSmall: 20, boxMedium: 8 }).map(k => k.max)).toEqual([1, 20, 20, 30]);   // never smaller than the one before
  });
});

const row = (i, o = {}) => ({ _id: i, name: `P${i}`, number: String(i + 1), team: "Navy", size: "A-L", scanned: false, ...o });

describe("every order has a bin", () => {
  it("one team is Bin 1", () => {
    const roster = [row(0), row(1)];
    const map = buildBinMap(roster, {}, "team");
    expect(binCount(map)).toBe(1);
    expect(binFor(map, roster[0])).toBe(1);
    expect(binEntries(roster, map)).toEqual([{ label: "Navy", bin: 1 }]);
  });
  it("a one-piece order has a bin too, and goes in a bag", () => {
    const roster = [row(0, { scanned: "pass" })];
    const map = buildBinMap(roster, {}, "team");
    expect(binContents(roster, map, [], 1).length).toBe(1);
    expect(boxFor(1).label).toBe("Bag");
  });
  it("an order that is not sorted, or has nothing to sort by, is one bin for the whole order", () => {
    const roster = [row(0, { team: "Navy" }), row(1, { team: "Red" })];
    const none = buildBinMap(roster, {}, "none");
    expect(binFieldOf(none)).toBe("all");
    expect(binFor(none, roster[0])).toBe(1); expect(binFor(none, roster[1])).toBe(1);
    expect(binEntries(roster, none)).toEqual([{ label: ALL_LABEL, bin: 1 }]);
    const bare = [{ _id: 0, name: "A", number: "1" }, { _id: 1, name: "B", number: "2" }];
    expect(binFieldOf(buildBinMap(bare, {}, "team"))).toBe("all");
    expect(binFor(buildBinMap(bare, {}, "size"), bare[1])).toBe(1);
    expect(buildBinMap([], {}, "none")).toEqual({});
  });
  it("the whole-order bin closes like any other and keeps its new number when rows are added", () => {
    const roster = [row(0, { scanned: "pass" }), row(1, { scanned: "pass" }), row(2)];
    const map = buildBinMap(roster, {}, "none");
    const r = closeBin(roster, map, [], 1, 1000);
    expect(r.newBin).toBe(2); expect(r.entry.ids).toEqual([0, 1]); expect(r.entry.label).toBe(ALL_LABEL);
    expect(binFor(r.binMap, roster[2])).toBe(2);
    const again = buildBinMap([...roster, row(3)], r.binMap, undefined, r.closed.map(c => c.bin));
    expect(binFor(again, row(3))).toBe(2);
  });
  it("its sticker still says the team or the size, and its bin label has no 'by' line", () => {
    const roster = [row(0)], map = buildBinMap(roster, {}, "none");
    expect(jerseyLabel(roster[0], map, { orderNumber: "5" })).toEqual({ bin: 1, by: "team", value: "Navy", orderNumber: "5" });
    const l = binLabels(roster, map, { orderNumber: "5" })[0];
    expect(l).toMatchObject({ bin: 1, label: ALL_LABEL, count: 1 });
    const zpl = binLabelZPL(l, labelSize("2x1"));
    expect(zpl).not.toMatch(/by team|by size/);
    expect(zpl).toMatch(/Order 5 {3}1 jersey/);
  });
});

describe("the box on the bin list and the Bins sheet", () => {
  const rows = Array.from({ length: 12 }, (_, i) => row(i));
  it("prints in capitals at the top right, the order and count on a line under it", () => {
    const labels = binListLabels(rows, { bin: 1, label: "Navy", orderNumber: "264247", box: "Medium box" });
    expect(labels.length).toBe(2);
    expect(labels.every(l => l.box === "Medium box")).toBe(true);
    const zpl = binListZPL(labels[0], labelSize("2x1"));
    expect(zpl).toMatch(/\^FDMEDIUM BOX\^FS/);
    expect(zpl).toMatch(/\^FDOrder 264247 {2}12 pcs {2}1\/2\^FS/);
    expect(zpl).toMatch(/\^FD1-P0-AL\^FS/);
    // ten items still fit above the bottom edge
    const ys = [...zpl.matchAll(/\^FO\d+,(\d+)\^A0N,(\d+)/g)].map(m => Number(m[1]) + Number(m[2]));
    expect(Math.max(...ys)).toBeLessThanOrEqual(labelSize("2x1").h);
  });
  it("without a box the list is as it was", () => {
    const zpl = binListZPL(binListLabels(rows, { bin: 1, label: "Navy", orderNumber: "264247" })[0], labelSize("2x1"));
    expect(zpl).toMatch(/\^FDOrder 264247 {2}12 pcs {2}1\/2\^FS/);
    expect(zpl).not.toMatch(/BOX/);
  });
  it("the Bins sheet has a line per bin and a total", () => {
    const sheet = buildBinsSheet([
      { bin: 1, label: "Navy", count: 12, box: "Medium box", open: false, closedAt: 5 },
      { bin: 2, label: "Navy", count: 1, box: "Bag", open: true },
    ], t => `t${t}`);
    expect(sheet[0]).toEqual(["Bin", "Holds", "Jerseys", "Box", "State", "Closed at"]);
    expect(sheet[1]).toEqual([1, "Navy", 12, "Medium box", "Closed (full)", "t5"]);
    expect(sheet[2]).toEqual([2, "Navy", 1, "Bag", "Open", ""]);
    expect(sheet[4]).toEqual(["Total", "", 13]);
  });
});
