// Every order has a box ("1.1"), and the list of what is in it does not print the box size.
import { describe, it, expect } from "vitest";
import { boxFor, boxLimits, DEFAULT_BOXES } from "../boxes.js";
import { buildBinMap, binFor, binEntries, binCount, binFieldOf, closeBin, binContents, ALL_LABEL } from "../roster.js";
import { binListLabels, binListZPL, jerseyLabel, binLabels, binLabelZPL, labelSize, textUnits } from "../labels.js";
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

describe("every order has a box", () => {
  it("one team is Box 1.1", () => {
    const roster = [row(0), row(1)];
    const map = buildBinMap(roster, {}, "team");
    expect(binCount(map)).toBe(1);
    expect(binFor(map, roster[0])).toBe("1.1");
    expect(binEntries(roster, map)).toEqual([{ label: "Navy", bin: "1.1" }]);
  });
  it("a one-piece order has a box too, and goes in a bag", () => {
    const roster = [row(0, { scanned: "pass" })];
    const map = buildBinMap(roster, {}, "team");
    expect(binContents(roster, map, [], "1.1").length).toBe(1);
    expect(boxFor(1).label).toBe("Bag");
  });
  it("an order that is not sorted, or has nothing to sort by, is one run of boxes for the whole order", () => {
    const roster = [row(0, { team: "Navy" }), row(1, { team: "Red" })];
    const none = buildBinMap(roster, {}, "none");
    expect(none).toEqual({ "*": "1.1", __by: "all" });
    expect(binFieldOf(none)).toBe("all");
    expect(binFor(none, roster[0])).toBe("1.1"); expect(binFor(none, roster[1])).toBe("1.1");
    expect(binEntries(roster, none)).toEqual([{ label: ALL_LABEL, bin: "1.1" }]);
    const bare = [{ _id: 0, name: "A", number: "1" }, { _id: 1, name: "B", number: "2" }];
    expect(binFieldOf(buildBinMap(bare, {}, "team"))).toBe("all");
    expect(binFor(buildBinMap(bare, {}, "size"), bare[1])).toBe("1.1");
    expect(buildBinMap([], {}, "none")).toEqual({});
  });
  it("the whole-order box closes like any other and keeps its new name when rows are added", () => {
    const roster = [row(0, { scanned: "pass" }), row(1, { scanned: "pass" }), row(2)];
    const map = buildBinMap(roster, {}, "none");
    const r = closeBin(roster, map, [], "1.1", 1000);
    expect(r.newBin).toBe("1.2"); expect(r.entry.ids).toEqual([0, 1]); expect(r.entry.label).toBe(ALL_LABEL);
    expect(binFor(r.binMap, roster[2])).toBe("1.2");
    const again = buildBinMap([...roster, row(3)], r.binMap, undefined, r.closed.map(c => c.bin));
    expect(binFor(again, row(3))).toBe("1.2");
  });
  it("its sticker still says the team or the size, and its box label has no 'by' line", () => {
    const roster = [row(0)], map = buildBinMap(roster, {}, "none");
    expect(jerseyLabel(roster[0], map, { orderNumber: "5" })).toEqual({ bin: "1.1", by: "team", value: "Navy", orderNumber: "5" });
    const l = binLabels(roster, map, { orderNumber: "5" })[0];
    expect(l).toMatchObject({ bin: "1.1", label: ALL_LABEL, count: 1 });
    const zpl = binLabelZPL(l, labelSize("2x1"));
    expect(zpl).toContain("^FDBOX 1.1^FS");
    expect(zpl).not.toMatch(/by team|by size/);
    expect(zpl).toContain("^FDOrder 5^FS");   // the order alone: no "by", no jersey count
  });
});

describe("the box size is not on the box list; the Bins sheet", () => {
  const rows = Array.from({ length: 13 }, (_, i) => row(i));
  it("the list never prints the box size, on the rows or on the count label", () => {
    const labels = binListLabels(rows, { bin: "1.1", label: "Navy", orderNumber: "264247", box: "Medium box" });
    expect(labels.length).toBe(2);                                // 13 jerseys: one label of rows and the count label
    expect(labels.every(l => !("box" in l))).toBe(true);          // a box size handed in is not kept
    const zpl = labels.map(l => binListZPL({ ...l, box: "Medium box" }, labelSize("2x1"))).join("\n");   // nor printed when an old caller still sends it
    expect(zpl).not.toMatch(/MEDIUM|LARGE|SMALL|BAG/i);
    expect(zpl).toMatch(/\^FD1-P0-AL\^FS/);
    expect(zpl).toContain("^FDBOX 1.1^FS");
    expect(zpl).toContain("^FD13 pcs^FS");
    // nothing starts in the 2 mm (16 dots) the printer cuts off the left edge, or runs off the bottom
    const xs = [...zpl.matchAll(/\^FO(\d+),/g)].map(m => Number(m[1]));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(16);
    const ys = [...zpl.matchAll(/\^FO\d+,(\d+)\^A0N,(\d+)/g)].map(m => Number(m[1]) + Number(m[2]));
    expect(Math.max(...ys)).toBeLessThanOrEqual(labelSize("2x1").h);
  });
  it("the Boxes sheet has a line per box and a total", () => {
    const sheet = buildBinsSheet([
      { bin: "1.1", label: "Navy", count: 12, box: "Medium box", open: false, closedAt: 5 },
      { bin: "1.2", label: "Navy", count: 1, box: "Bag", open: true },
    ], t => `t${t}`);
    expect(sheet[0]).toEqual(["Box", "Holds", "Jerseys", "Box size", "State", "Closed at"]);
    expect(sheet[1]).toEqual(["1.1", "Navy", 12, "Medium box", "Closed (full)", "t5"]);
    expect(sheet[2]).toEqual(["1.2", "Navy", 1, "Bag", "Open", ""]);
    expect(sheet[4]).toEqual(["Total", "", 13]);
  });
});

// A wide name must never wrap: the printer prints the wrapped piece over the
// start of the line ("11-MACDONALD-AXL" came out as "XL-MACDONALD-A").
describe("long names on the bin list", () => {
  const rows = [["MACDONALD", 11, "A-XL"], ["VANDENBERGHE", 23, "A-2XL"], ["KONSTANTINOPOULOS", 88, "A-3XL"], ["LEE", 3, "A-M"]].map(([name, number, size]) => ({ name, number: String(number), size }));
  const zpl = binListZPL(binListLabels(rows, { bin: 1, label: "WINNIPEG WARRIORS MAROON", orderNumber: "264247", box: "Medium box" })[0], labelSize("2x1"));
  const items = [...zpl.matchAll(/\^FO(\d+),\d+\^A0N,(\d+),(\d+)\^FD([^^]*)\^FS/g)].map(m => ({ x: +m[1], h: +m[2], w: +m[3], text: m[4] }));
  it("prints each jersey as one field with no wrapping box", () => {
    expect(items.map(i => i.text)).toEqual(expect.arrayContaining(["11-MACDONALD-AXL", "23-VANDENBERGHE-A2XL", "88-KONSTANTINOPOULOS-A3XL", "3-LEE-AM"]));
    expect(zpl.split("\n").filter(l => /MACDONALD|VANDENBERGHE|KONSTANTINOPOULOS|WINNIPEG/.test(l)).every(l => !l.includes("^FB"))).toBe(true);
  });
  it("squeezes a long name before it shrinks it, and keeps it inside its column", () => {
    const short = items.find(i => i.text === "3-LEE-AM"), mac = items.find(i => i.text === "11-MACDONALD-AXL"), long = items.find(i => i.text === "88-KONSTANTINOPOULOS-A3XL");
    expect(mac.h).toBeGreaterThanOrEqual(short.h - 2);   // nearly the same height, narrower letters
    expect(mac.w).toBeLessThan(mac.h);
    expect(long.h).toBeLessThan(short.h);
    items.forEach(i => expect(i.x + textUnits(i.text) * i.w).toBeLessThanOrEqual(labelSize("2x1").w));
  });
});

// The same wrap, on the other labels: a long team on the jersey sticker, a
// long name on the flag ticket. A one-line field is squeezed until it fits.
describe("no one-line field can wrap", () => {
  const fits = zpl => [...zpl.matchAll(/\^A0N,(\d+),(\d+)\^FB(\d+),1,0,[LCR](?:\^FR)?\^FD([^^]*)\^FS/g)].every(m => textUnits(m[4]) * Number(m[2]) <= Number(m[3]) + 1);
  it("a long team on the sticker, a long name on the flag ticket, a long team on the bin label", async () => {
    const { jerseyLabelZPL, flagLabelZPL } = await import("../labels.js");
    const sticker = jerseyLabelZPL({ bin: 12, by: "team", value: "MISSISSAUGA STEELHEADS WHITE", orderNumber: "264247" });
    expect(sticker).toContain("^FDMISSISSAUGA STEELHEADS WHITE^FS");
    expect(fits(sticker)).toBe(true);
    expect(fits(flagLabelZPL({ number: "88", name: "VANDENBROUCKE-JUNIOR", tag: "DECORATION", reason: "Wrong name", team: "MISSISSAUGA STEELHEADS WHITE", size: "A-3XL", bin: 12, orderNumber: "264247", station: "St 1", time: "09:00" }))).toBe(true);
    expect(fits(binLabelZPL({ bin: 12, label: "MISSISSAUGA STEELHEADS WHITE ALTERNATE", by: "team", orderNumber: "264247" }, labelSize("2x1")))).toBe(true);
  });
});
describe("a row with nothing to sort by", () => {
  it("has a box of its own, is in its contents, and a by-size order does the same", () => {
    const roster = [row(0), row(1, { team: "", scanned: "pass" }), row(2, { team: "Red" })];
    const map = buildBinMap(roster, {}, "team");
    expect(binFor(map, roster[1])).toBe("3.1");
    expect(binContents(roster, map, [], "3.1").map(r => r._id)).toEqual([1]);
    expect(binEntries(roster, map).map(e => e.label)).toEqual(["Navy", "Red", "No team"]);
    const bySize = buildBinMap([row(0), row(1, { size: "" })], {}, "size");
    expect(binFor(bySize, row(1, { size: "" }))).toBe("2.1");
  });
});
describe("the box model learns from a heavy bin that went in one box", () => {
  it("40 adult 2XL stitched in a large box counts, though the estimate says 56 lb", async () => {
    const { fitBoxModel, predictBox, PRIOR } = await import("../boxmodel.js");
    const m = fitBoxModel(Array(50).fill({ counts: { "a2x|st": 40 }, box: "large" }));
    expect(m.seen).toBe(50);
    expect(predictBox({ "a2x|st": 40 }, { ...m, weightCap: Infinity }).id).toBe("large");
    expect(predictBox({ "a2x|st": 40 }, { ...PRIOR, weightCap: Infinity }).id).toBe("more");
    expect(predictBox({ "a2x|st": 5 }, { ...PRIOR, caps: [NaN, NaN, NaN], weightCap: Infinity }).id).toBeTruthy();   // never a crash
  });
});
