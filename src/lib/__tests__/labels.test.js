// Bin labels for the Zebra: what each label says, and the ZPL that says it.
import { describe, it, expect } from "vitest";
import { binLabels, labelSize, binLabelZPL, labelsZPL, jerseyLabel, jerseyLabelZPL, flagLabel, flagLabelZPL, FLAG_COPIES, binListItem, binListLabels, binListZPL, BIN_LIST_PER_LABEL } from "../labels.js";
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
  it("a label with a title prints the title in place of BOX and its number: the DAMAGED box", () => {
    const z = binLabelZPL({ title: "DAMAGED", label: "Flagged jerseys", by: "", orderNumber: "5" }, labelSize("2x1"));
    expect(z).toContain("^FDDAMAGED^FS");
    expect(z).not.toContain("BOX");
    expect(z).not.toContain("undefined");                         // this box has no number
    expect(z).toContain("^FDFlagged jerseys^FS");
    expect(z).toContain("^FDOrder 5^FS");                         // the order alone: this box is not by team or by size
    expect(z).not.toMatch(/by team|by size/);
    const fontOf = t => parseInt(z.split("\n").find(x => x.endsWith(`^FD${t}^FS`)).match(/\^A0N,(\d+)/)[1], 10);
    expect(fontOf("DAMAGED")).toBeGreaterThan(fontOf("Flagged jerseys"));   // the title is the big line, where BOX 3 is
    // a box with a number and a title: the title wins; without a title nothing changes
    expect(binLabelZPL({ ...label, title: "DAMAGED" }, labelSize("2x1"))).not.toContain("BOX");
    expect(binLabelZPL({ ...label, title: "" }, labelSize("2x1"))).toContain("^FDBOX 3^FS");
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
      orderNumber: "264247", station: "St 1",
    });
  });
  it("no roster row (not on the roster, could not read): what the camera read, or ?", () => {
    expect(flagLabel({ detected: { number: "88", name: "NOBODY" }, reason: "Not on the roster." }, byTeam, { tag: "CHECK ORDER" })).toMatchObject({ number: "88", name: "NOBODY", tag: "CHECK ORDER", team: "", size: "", bin: "", station: "" });
    expect(flagLabel({ detected: {}, reason: "Could not read" }, null)).toMatchObject({ number: "?", name: "", tag: "DECIDE" });
  });
  it("a flag found after it passed loses the suffix on the ticket", () => {
    expect(flagLabel({ ...entry, reason: "Seam, hem or construction — found after it passed" }, byTeam).reason).toBe("Seam, hem or construction");
  });
});

describe("flagLabelZPL (2 x 1 in)", () => {
  const l = { number: "7", name: "SMITH", tag: "STITCHER", reason: "Loose, missing or broken stitching", team: "Navy", size: "A-L", bin: "2.1", orderNumber: "264247", station: "St 1" };
  const lines = z => z.split("\n");
  const fontOf = (z, text) => parseInt(lines(z).find(x => x.endsWith(`^FD${text}^FS`)).match(/\^A0N,(\d+)/)[1], 10);
  const topOf = z => lines(z).filter(x => x.startsWith("^FO") && !x.includes("^GB")).map(x => parseInt(x.match(/\^FO\d+,(\d+)/)[1], 10));
  it("the ticket is 2 in wide by 1 in tall by default", () => {
    expect(labelSize("2x1")).toMatchObject({ w: 406, h: 203, top: 16 });
    const z = flagLabelZPL(l);
    expect(z).toContain("^PW406");
    expect(z).toContain("^LL207");
  });
  it("a solid black column on the left with the jersey in white: the number, the name, team · size — and no FLAG word (the owner, 17 Nov 2026)", () => {
    const z = flagLabelZPL(l);
    expect(z).toContain("^FO0,0^GB172,211,172^FS");                 // a box filled by its own border, off the top and left edges; wider than before, it holds the team and size too
    expect(z).not.toContain("FLAG");
    expect(z).toContain("^FR^FD7^FS");
    expect(z).toContain("^FR^FDSMITH^FS");
    expect(z).toContain("^FR^FDNavy · A-L^FS");
    expect(fontOf(z, "7")).toBeGreaterThanOrEqual(90);               // ~11 mm, read from across the table
    expect(fontOf(z, "SMITH")).toBeGreaterThanOrEqual(28);
    expect(fontOf(z, "Navy · A-L")).toBeGreaterThanOrEqual(24);
  });
  it("a long team name: the team over the size on their own lines, the number still big", () => {
    const z = flagLabelZPL({ ...l, number: "100", name: "VANDERMEULEN", team: "Ottawa Senators", size: "A-2XL" });
    expect(z).toContain("^FR^FDOttawa Senators^FS");
    expect(z).toContain("^FR^FDA-2XL^FS");
    expect(z).not.toContain("Ottawa Senators · A-2XL");
    expect(fontOf(z, "100")).toBeGreaterThanOrEqual(80);
    expect(fontOf(z, "A-2XL")).toBeGreaterThanOrEqual(22);
    expect(fontOf(z, "Ottawa Senators")).toBeGreaterThanOrEqual(20);   // squeezed to the column's width (narrower letters) at 85% of the line's height or more, not made small
    const team = fieldsOf(z).find(x => x.text === "Ottawa Senators"), name = fieldsOf(z).find(x => x.text === "VANDERMEULEN");
    expect(team.fw).toBeLessThan(team.fh);
    expect(name.fh).toBeGreaterThanOrEqual(25);
    expect(name.fw).toBeLessThan(name.fh);
  });
  // Every text field of a ticket: where it starts, its font height, how many lines its box allows.
  const fieldsOf = z => lines(z).filter(x => x.includes("^FD")).map(x => {
    const m = x.match(/^\^FO(\d+),(\d+)\^A0N,(\d+),(\d+)\^FB(\d+),(\d+),0,([LCR])(\^FR)?\^FD(.*)\^FS$/);
    return { x: +m[1], y: +m[2], fh: +m[3], fw: +m[4], width: +m[5], lines: +m[6], align: m[7], reverse: !!m[8], text: m[9] };
  });
  it("the reason big on the right, centred on up to three lines, with the order number big at the bottom and the station small above it, no time; the jersey's details all on the left; no route tag, no box", () => {
    const z = flagLabelZPL(l);
    const f = fieldsOf(z), reason = f.find(x => x.text === l.reason), parts = f.find(x => x.text === "Navy · A-L"), footer = f.find(x => x.text === "Ord 264247"), st = f.find(x => x.text === "St 1");
    expect(reason).toMatchObject({ lines: 3, align: "C", reverse: false });   // the right column is black on white
    expect(reason.width).toBeGreaterThanOrEqual(200);
    expect(reason.fh).toBeGreaterThanOrEqual(24);                   // an old five-word wording on three lines of the narrower column: ~3 mm; the menu's own reasons are two or three words and come out far bigger
    expect(reason.fh).toBeGreaterThan(st.fh);                       // an old five-word wording is smaller than the order number now; the menu's own reasons are bigger (below)
    expect(footer.fh).toBeGreaterThanOrEqual(32);                   // the order number: six digits at ~4 mm, not the 2.5 mm it was (the owner, 17 Nov 2026)
    expect(footer.fh).toBeGreaterThan(st.fh);
    expect(st.y + st.fh).toBeLessThanOrEqual(footer.y);               // the station small, above the order
    expect(z).not.toMatch(/14:05|\d\d:\d\d/);                     // no time on the ticket
    expect(z).not.toMatch(/STITCHER|REMAKE|DECORATION|CLEANING|DECIDE/);   // no route tag, although the label still carries one
    expect(parts).toMatchObject({ x: 16, reverse: true });           // team · size is on the black, with the jersey
    expect(parts.x + parts.width).toBeLessThanOrEqual(reason.x);     // left of everything on the right
    expect(z).not.toMatch(/Box|BOX|2\.1/);                          // the box is not on the ticket
    expect(parts.fh).toBeGreaterThanOrEqual(24);
    expect(footer).toMatchObject({ x: reason.x, reverse: false });
    expect(reason.y + reason.lines * reason.fh).toBeLessThanOrEqual(st.y);   // three lines of reason end above the station and the order
    expect(topOf(z).every(y => y >= 16)).toBe(true);
  });
  it("every flag prints two tickets: ^PQ2, not ^PQ1", () => {
    expect(FLAG_COPIES).toBe(2);
    for (const size of [labelSize("2x1"), labelSize("1x0.5"), labelSize("2.25x1.25")]) {
      const z = flagLabelZPL(l, size);
      expect(z.endsWith("^PQ2\n^XZ")).toBe(true);
      expect(z).not.toContain("^PQ1");
    }
    expect(flagLabelZPL({ number: "?", name: "", reason: "" }).endsWith("^PQ2\n^XZ")).toBe(true);
    // the stickers, the box labels and the box lists are still one each
    expect(jerseyLabelZPL({ bin: 3, by: "team", value: "Navy", orderNumber: "264247" })).toContain("^PQ1");
    expect(binLabelZPL({ bin: 3, label: "Navy", by: "team", count: 1, orderNumber: "1" })).toContain("^PQ1");
  });
  it("a reason off the short menu: 'Twill peeling' big, no route word, two tickets, every text on the label", () => {
    const size = labelSize("2x1");
    const z = flagLabelZPL({ ...l, tag: "DECORATION", reason: "Twill peeling" }, size);
    expect(z).toContain("^FDTwill peeling^FS");
    expect(z).not.toMatch(/STITCHER|REMAKE|DECORATION/);
    expect(z.endsWith("^PQ2\n^XZ")).toBe(true);
    const f = fieldsOf(z);
    expect(f.map(x => x.text)).toEqual(["Navy · A-L", "SMITH", "7", "Ord 264247", "St 1", "Twill peeling"]);   // and nothing else: no FLAG word
    f.forEach(x => {
      expect(x.x).toBeGreaterThanOrEqual(0);
      expect(x.x + x.width).toBeLessThanOrEqual(size.w);
      expect(x.y + x.fh).toBeLessThanOrEqual(203 + 8);              // the label, the 4 dots it is lifted and the 4 the black column runs past the bottom
    });
    const reason = f.at(-1), st = f.find(x => x.text === "St 1");
    expect(reason.fh).toBeGreaterThanOrEqual(40);                   // two short words: as big as the route tag used to be
    expect(reason.y + reason.lines * reason.fh).toBeLessThanOrEqual(st.y);
  });
  it("a long reason takes three lines, smaller, rather than losing its end", () => {
    const z = flagLabelZPL({ ...l, reason: "Print error — ghosting, fading, misaligned" });
    const long = fieldsOf(z).find(x => x.text === "Print error — ghosting, fading, misaligned");
    expect(long).toMatchObject({ lines: 3, align: "C" });
    expect(long.fh).toBeGreaterThanOrEqual(18);   // still over 2 mm tall: sized by how the words wrap, not by a letter count
    expect(long.y + 3 * long.fh).toBeLessThanOrEqual(fieldsOf(z).find(x => x.text === "St 1").y);
    const short = reason => fontOf(flagLabelZPL({ ...l, reason }), reason);
    expect(long.fh).toBeLessThan(short("Cleaning not done"));
    expect(short("Cleaning not done")).toBeLessThan(short("Size label"));   // the fewer the words, the bigger
  });
  it("on the 1 x 0.5 in sticker roll the same layout still fits, smaller", () => {
    const z = flagLabelZPL(l, labelSize("1x0.5"));
    expect(z).toContain("^PW203");
    expect(z).toContain("^FO0,0^GB81,110,81^FS");
    expect(z).toContain("^FR^FD7^FS");
    expect(z).toContain("^FDLoose, missing or broken stitching^FS");
    expect(z).not.toContain("STITCHER");
    expect(topOf(z).every(y => y >= 16 && y < 102)).toBe(true);
    expect(lines(z).filter(x => x.includes("^A0N")).every(x => parseInt(x.match(/\^A0N,(\d+)/)[1], 10) >= 10)).toBe(true);
  });
  it("nothing to say: no name, no reason, no team — the ticket still prints, and says Flagged", () => {
    const z = flagLabelZPL({ number: "?", name: "", tag: "DECIDE", reason: "", team: "", size: "", bin: "", orderNumber: "", station: "" });
    expect(z).toContain("^FR^FD?^FS");
    expect(z).toContain("^FDFlagged^FS");
    expect(z).not.toContain("DECIDE");
    expect(z).not.toContain("^FD^FS");
    expect(fieldsOf(z).map(x => x.text)).toEqual(["?", "Flagged"]);
  });
  it("labelsZPL with kind flag uses this layout", () => {
    const z = labelsZPL([l, { ...l, number: "9" }], labelSize("2x1"), "flag");
    expect((z.match(/\^XA/g) || []).length).toBe(2);
    expect(z).toContain("^PW406");
    expect(z).toContain("^FR^FD9^FS");
    expect((z.match(/\^PQ2/g) || []).length).toBe(2);
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
    expect(labels.every(l => l.by === "team" && l.mix === "Y-M 8   A-XL 15")).toBe(true);   // by team unless told otherwise, and the sizes in the box on every entry
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
  it("`by` and `mix` on every entry: the sizes in a team's box, the teams in a size's box, in rack order", () => {
    const box = [
      { number: "1", name: "A", team: "Red",  size: "A-L" }, { number: "2", name: "B", team: "Navy", size: "Y-M" },
      { number: "3", name: "C", team: "Navy", size: "A-L" }, { number: "4", name: "D", team: "Navy", size: "A-XL" },
      { number: "5", name: "E", team: "",     size: "A-L" }, { number: "6", name: "F", team: "Red",  size: "" },
    ];
    const mixOf = by => { const labels = binListLabels(box, { bin: "1.1", label: "x", orderNumber: "5", by }); expect(labels.every(l => l.by === by)).toBe(true); expect(new Set(labels.map(l => l.mix)).size).toBe(1); return labels[0].mix; };
    expect(mixOf("team")).toBe("Y-M 1   A-L 3   A-XL 1");         // sizes, youth before adult, small before large; a row with no size is not counted
    expect(mixOf("all")).toBe("Y-M 1   A-L 3   A-XL 1");          // an order that is not sorted: sizes too
    expect(mixOf("size")).toBe("Navy 3   Red 2");                 // sorted by size: how many of each team; a row with no team is not counted
    expect(binListLabels(box, { bin: "1.1" })[0]).toMatchObject({ by: "team", mix: "Y-M 1   A-L 3   A-XL 1" });   // by team unless told otherwise
    expect(binListLabels([{ number: "1", name: "A" }], { bin: "1.1", by: "team" }).every(l => l.mix === "")).toBe(true);   // no sizes on the roster: no mix
  });
  it("the count label is the customer's: the team big, the pieces, how many of each size, the order small — and no box number", () => {
    const labels = binListLabels(rows, { bin: "5.1", label: "Navy", orderNumber: "264247", by: "team" });
    const count = labels[labels.length - 1];
    expect(count).toMatchObject({ title: true, bin: "5.1", label: "Navy", by: "team", count: 23, mix: "Y-M 8   A-XL 15" });   // the entry still says which box it is for
    const z = binListZPL(count, labelSize("2x1"));
    expect(z).toContain("^FDNavy^FS");
    expect(z).toContain("^FD23 pcs^FS");
    expect(z).toContain("^FDY-M 8   A-XL 15^FS");
    expect(z).toContain("^FDOrder 264247^FS");
    expect(z).not.toContain("BOX");                               // no BOX word: the customer does not need it
    expect(z).toContain("^FD5.1^FS");                             // the box number, small in the top-left corner, for the packer (the owner, 19 Nov 2026)
    expect(binListZPL({ title: true, bin: "5.2", label: "Navy", orderNumber: "", count: 1 }, labelSize("2x1"))).toContain("^FD1 pc^FS");
    const all = [...z.matchAll(/\^FO(\d+),(\d+)\^A0N,(\d+),.*\^FD(.*)\^FS/g)].map(m => ({ x: +m[1], y: +m[2], fh: +m[3], text: m[4] }));
    const corner = all.find(f => f.text === "5.1");
    expect(corner.fh).toBeLessThan(25); expect(corner.x).toBeLessThan(40);   // small, in the corner
    const fields = all.filter(f => f !== corner);
    expect(fields.map(f => f.text)).toEqual(["Navy", "23 pcs", "Y-M 8   A-XL 15", "Order 264247"]);   // top to bottom, and nothing else
    fields.forEach(f => { expect(f.y + f.fh).toBeLessThanOrEqual(203); expect(f.y).toBeGreaterThanOrEqual(16); expect(f.x).toBeGreaterThanOrEqual(16); });
    fields.slice(1).forEach((f, i) => { expect(f.y).toBeGreaterThanOrEqual(fields[i].y + fields[i].fh); expect(f.fh).toBeLessThan(fields[i].fh); });   // no line over another, each smaller than the one above: the team is the biggest thing on it
    expect(z).toContain("^PQ1");                                  // one count label, not two
  });
  it("the count label by size leads with the size and tallies the teams; a box with no label or an old entry without a mix still prints", () => {
    const teams = rows.map((r, i) => ({ ...r, team: i % 4 ? "Navy" : "Red", size: "A-L" }));
    const labels = binListLabels(teams, { bin: "7.2", label: "A-L", orderNumber: "264247", by: "size" });
    const z = binListZPL(labels.at(-1), labelSize("2x1"));
    expect(z).toContain("^FDA-L^FS");
    expect(z).toContain("^FD23 pcs^FS");
    expect(z).toContain("^FDNavy 17   Red 6^FS");
    expect(z).toContain("^FDOrder 264247^FS");
    expect(z).not.toMatch(/BOX/);
    expect(z).toContain("^FD7.2^FS");
    const old = binListZPL({ title: true, bin: "5.2", label: "Navy", orderNumber: "264247", count: 12, pages: 1 }, labelSize("2x1"));   // an entry made before `by` and `mix`
    expect(old).toContain("^FDNavy^FS"); expect(old).toContain("^FD12 pcs^FS"); expect(old).toContain("^FDOrder 264247^FS");
    expect(old).not.toMatch(/BOX|undefined|\^FD\^FS/);
  });
  it("the count label of an order that is not sorted leads with the order, and has no footer", () => {
    for (const entry of [{ by: "all", label: "Whole order" }, { by: "all", label: "" }, { by: "team", label: "Whole order" }]) {   // by "all", or the label alone says so
      const labels = binListLabels(rows, { bin: "1.3", orderNumber: "264247", ...entry });
      const z = binListZPL(labels.at(-1), labelSize("2x1"));
      const fields = [...z.matchAll(/\^FO(\d+),(\d+)\^A0N,(\d+),.*\^FD(.*)\^FS/g)].map(m => ({ y: +m[2], fh: +m[3], text: m[4] }));
      expect(fields.filter(f => f.text !== "1.3").map(f => f.text)).toEqual(["Order 264247", "23 pcs", "Y-M 8   A-XL 15"]);   // the order once, as the big line (and the box number small in the corner)
      expect(fields[0].fh).toBeGreaterThan(fields[1].fh);
      expect(z).not.toMatch(/BOX|Whole order/);
      fields.forEach(f => expect(f.y + f.fh).toBeLessThanOrEqual(203));
    }
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
    expect(all.indexOf("^FD23 pcs^FS")).toBeGreaterThan(all.indexOf("^FD8-"));  // the count label prints last
    expect(all).not.toContain("BOX");                                            // and the box number is on none of them
    expect(labelsZPL([{ bin: 5, label: "Navy", by: "team", count: 0, orderNumber: "1" }], labelSize("2x1"), "binticket")).toContain("^FDBOX 5^FS");
  });
});

describe("the box list's count: this box out of the team (the owner, 19 Nov 2026)", () => {
  it("36 of a 50-jersey team in the first box reads 36/50 pcs; the last 14 read 14/50", async () => {
    const { groupSize } = await import("../roster.js");
    const roster = Array.from({ length: 50 }, (_, i) => ({ _id: i, number: String(i), name: "", team: "Navy", size: "A-L" }))
      .concat([{ _id: 99, number: "1", name: "", team: "Red", size: "A-L" }]);
    const binMap = { navy: "1.2", red: "2.1" };
    const first = roster.slice(0, 36), last = roster.slice(36, 50);
    expect(groupSize(roster, binMap, first)).toBe(50);
    const a = binListLabels(first, { bin: "1.1", label: "Navy", orderNumber: "264247", by: "team", of: groupSize(roster, binMap, first) });
    expect(binListZPL(a.at(-1), labelSize("2x1"))).toContain("^FD36/50 pcs^FS");
    const b = binListLabels(last, { bin: "1.2", label: "Navy", orderNumber: "264247", by: "team", of: groupSize(roster, binMap, last) });
    expect(binListZPL(b.at(-1), labelSize("2x1"))).toContain("^FD14/50 pcs^FS");
    expect(groupSize(roster, { __by: "all", "*": "1.1" }, first)).toBe(51);   // not sorted: out of the whole order
  });
});
