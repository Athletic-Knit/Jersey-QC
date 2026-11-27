// Roster files and the rules on their rows (src/lib/roster.js): CSV and Excel
// quirks, header aliases, the order number and title rows, boxes and closing a
// full one, an order saved before boxes had two numbers, shortages before a
// box is sealed, and rosters of blank jerseys by quantity.
import { blankGroups, isBlankRow, MAX_QUANTITY } from "../roster.js";
import { shortages, jerseyList } from "../roster.js";
import { describe, it, expect } from "vitest";
import { modernBins } from "../roster.js";
import { parseCSV, splitCSVLine, detectDelimiter, canonicalHeader, rowsToRoster, buildBinMap, binFor, binEntries, extraColumns, displayColumns, BOM, orderNumberOf, closeBin, binOfRow, binContents, nextBinNumber, dropFromClosed, boxParts, binOrder } from "../roster.js";

const SAMPLE = `Name,Number,Team,Size Range,Size
Smith,12,Eagles,A,L
Jones,7,Eagles,Y,M
O'Brien,4,Eagles,Y,S
Kim,9,Hawks,Y,XS
`;

describe("parseCSV", () => {
  it("reads the sample roster and merges size range + size", () => {
    const r = parseCSV(SAMPLE);
    expect(r).toHaveLength(4);
    expect(r[0]).toMatchObject({ name: "Smith", number: "12", team: "Eagles", size: "A-L", _id: 0 });
    expect(r[2].name).toBe("O'Brien");
  });
  it("survives an Excel CSV UTF-8 byte-order mark", () => {
    const r = parseCSV(BOM + SAMPLE);
    expect(r[0].name).toBe("Smith");
  });
  it("honours quoted fields with commas", () => {
    const r = parseCSV(`Name,Number,Team\n"Smith, John",12,Eagles\n`);
    expect(r[0]).toMatchObject({ name: "Smith, John", number: "12", team: "Eagles" });
  });
  it("accepts semicolon CSVs and tab-separated files", () => {
    expect(parseCSV("Name;Number;Team\nSmith;12;Eagles\n")[0].team).toBe("Eagles");
    expect(parseCSV("Name\tNumber\tTeam\nSmith\t12\tEagles\n")[0].team).toBe("Eagles");
  });
  it("skips title rows above the header", () => {
    const r = parseCSV(`Order 25 - Eagles\n\nName,Number,Team\nSmith,12,Eagles\n`);
    expect(r).toHaveLength(1);
  });
  it("leaves a blank size blank instead of A- or -", () => {
    const r = parseCSV(`Name,Number,Team,Size Range,Size\nA,1,T,,\nB,2,T,A,\nC,3,T,,L\n`);
    expect(r.map(x => x.size)).toEqual(["", "A", "L"]);
  });
  it("keeps extra columns such as goalie or colour", () => {
    const r = parseCSV(`Name,Number,Team,Size,Goalie,Colour\nA,1,T,L,Y,Home\n`);
    expect(r[0].goalie).toBe("Y");
    expect(extraColumns(r)).toEqual(["goalie", "colour"]);
    expect(displayColumns(r)).toEqual(["name", "number", "team", "size", "goalie", "colour"]);
  });
  it("returns nothing for a file with no recognisable header", () => {
    expect(parseCSV("foo,bar\n1,2\n")).toEqual([]);
  });
});

describe("header aliases", () => {
  it("maps common variants", () => {
    expect(canonicalHeader("#")).toBe("number");
    expect(canonicalHeader("Jersey #")).toBe("number");
    expect(canonicalHeader("Player")).toBe("name");
    expect(canonicalHeader("Last Name")).toBe("name");
    expect(canonicalHeader("Team Name")).toBe("team");
    expect(canonicalHeader(BOM + "Name")).toBe("name");
    expect(canonicalHeader("Colour")).toBe("colour");
  });
  it("delimiter detection prefers the most frequent separator", () => {
    expect(detectDelimiter("a,b,c")).toBe(",");
    expect(detectDelimiter("a;b;c")).toBe(";");
    expect(detectDelimiter("a\tb\tc")).toBe("\t");
    expect(splitCSVLine('a,"b ""q"", c",d', ",")).toEqual(["a", 'b "q", c', "d"]);
  });
});

describe("rowsToRoster (Excel path)", () => {
  it("keeps 00 and 07 as text", () => {
    const r = rowsToRoster([["Name", "Number"], ["G", "00"], ["S", "07"]]);
    expect(r.map(x => x.number)).toEqual(["00", "07"]);
  });
});

describe("bins", () => {
  const roster = [{ team: "Ravens" }, { team: "ravens " }, { team: "Hawks" }, { team: "" }];
  it("case-folds and trims team names", () => {
    const m = buildBinMap(roster);
    expect(m).toEqual({ hawks: "1", ravens: "2", "?": "3" });   // a row with no team: the "No team" box
    expect(binFor(m, "Ravens")).toBe("2");
    expect(binFor(m, "ravens ")).toBe("2");
    expect(binFor(m, { team: "" })).toBe("3");
    expect(binFor(buildBinMap([{ team: "Ravens" }, { team: "Hawks" }]), { team: "" })).toBeNull();   // every row has a team: no such bin
  });
  it("pins existing bins when the roster is replaced", () => {
    const first = buildBinMap([{ team: "Ravens" }, { team: "Hawks" }]);
    const second = buildBinMap([{ team: "Hawks" }, { team: "Wolves" }], first);
    expect(second.hawks).toBe(first.hawks);
    expect(second.ravens).toBe(first.ravens);
    expect(second.wolves).toBe("3");
  });
  it("lists entries with the roster's spelling", () => {
    expect(binEntries(roster, buildBinMap(roster))).toEqual([{ label: "Hawks", bin: "1" }, { label: "Ravens", bin: "2" }, { label: "No team", bin: "3" }]);
  });
  it("by size: one box per size, youth before adult, XS before 3XL; the row says which field", () => {
    const r = [{ team: "Ravens", size: "A-L" }, { team: "Hawks", size: "Y-M" }, { team: "Ravens", size: "A-XS" }, { team: "Hawks", size: "a-l " }, { team: "Hawks", size: "A-3XL" }];
    const m = buildBinMap(r, {}, "size");
    expect(m.__by).toBe("size");
    expect(binEntries(r, m)).toEqual([{ label: "Y-M", bin: "1" }, { label: "A-XS", bin: "2" }, { label: "A-L", bin: "3" }, { label: "A-3XL", bin: "4" }]);
    expect(binFor(m, { team: "Hawks", size: "A-L" })).toBe("3");
    expect(binFor(m, { team: "Hawks" })).toBeNull();
    expect(binFor(buildBinMap(r), { team: "Hawks", size: "A-L" })).toBe("1");   // by team, the size is ignored
  });
  it("switching the field starts the bins over; the same field keeps them", () => {
    const r = [{ team: "Ravens", size: "A-L" }, { team: "Hawks", size: "A-M" }];
    const team = buildBinMap(r);
    const size = buildBinMap(r, team, "size");
    expect(Object.keys(size).sort()).toEqual(["__by", "a-l", "a-m"]);
    expect(buildBinMap(r, size).__by).toBe("size");
    expect(buildBinMap(r, size, "team")).toEqual(team);
  });
});

describe("a re-used export is a roster, not yesterday's results", () => {
  const exported = [
    "Order Number,25",
    "Operator,Shiv",
    "",
    "Status,Name,Number,Team,Size,Bin,Reason,Resolution,Inspected By,Time",
    "PASS,HUNTER,22,blue,Y-XL,1,,,Shiv,2026-10-15 10:01:02",
    "NOT SCANNED,,5,yellow,A-M,2,,,,",
  ].join("\n");
  it("drops the app's own result columns and keeps the roster columns", () => {
    const rows = parseCSV(exported);
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe("HUNTER");
    expect(rows[0].number).toBe("22");
    expect(rows[0].status).toBeUndefined();
    expect(rows[0].bin).toBeUndefined();
    expect(rows[0].scanned).toBeUndefined();
    expect(displayColumns(rows)).toEqual(["name", "number", "team", "size"]);
  });
});

describe("order number in the roster file", () => {
  it("comes from an order column, which is not kept as roster data", () => {
    const r = parseCSV("Order Number,Name,Number,Size\n55555,SEACH,9,A-L\n55555,EVANOVICH,4,Y-M\n");
    expect(orderNumberOf(r)).toBe("55555");
    expect(r).toHaveLength(2);
    expect(Object.keys(r[0])).not.toContain("order");
    expect(JSON.parse(JSON.stringify(r)).orderNumber).toBeUndefined();   // the saved session sees plain rows
  });
  it("comes from a title row above the header", () => {
    const r = rowsToRoster([["Order 4521 - Ravens"], [], ["Name", "Number"], ["SEACH", "9"]]);
    expect(orderNumberOf(r)).toBe("4521");
    const po = rowsToRoster([["PO# AK-7781"], ["Name", "Number"], ["SEACH", "9"]]);
    expect(orderNumberOf(po)).toBe("AK-7781");
  });
  it("is empty when the file has none", () => {
    expect(orderNumberOf(parseCSV("name,number\nSEACH,9\n"))).toBe("");
    expect(orderNumberOf([])).toBe("");
  });
});

// A box that is full: it is closed with what was in it, and its team or size
// carries on in the next free box number of the whole order (the co-op,
// 27 Nov 2026: boxes have whole numbers; Navy 1 and Red 2, Navy's next is 3).
describe("closing a full box", () => {
  const rows = [
    { _id: 0, name: "SMITH", number: "7",  team: "Navy", size: "A-L",  scanned: "pass" },
    { _id: 1, name: "JONES", number: "9",  team: "Navy", size: "A-M",  scanned: "manual" },
    { _id: 2, name: "LEE",   number: "3",  team: "Red",  size: "A-L",  scanned: "pass" },
    { _id: 3, name: "PATEL", number: "12", team: "Navy", size: "A-XL", scanned: false },
    { _id: 4, name: "KIM",   number: "4",  team: "Navy", size: "A-S",  scanned: "flag" },
  ];
  const map = buildBinMap(rows, {}, "team");   // Navy 1, Red 2
  it("the closed box keeps its rows, the team moves to the next free box number", () => {
    expect(map).toEqual({ navy: "1", red: "2" });
    const r = closeBin(rows, map, [], "1", 1000);
    expect(r.newBin).toBe("3");                                   // one more than the highest box of the order
    expect(r.binMap).toEqual({ navy: "3", red: "2" });
    expect(r.entry).toEqual({ bin: "1", key: "navy", label: "Navy", ids: [0, 1], closedAt: 1000 });   // passed and by hand; not the flag, not the unscanned
    expect(binOfRow(r.binMap, r.closed, rows[0])).toBe("1");      // already in the closed box
    expect(binOfRow(r.binMap, r.closed, rows[3])).toBe("3");      // still to scan: the new box
    expect(binContents(rows, r.binMap, r.closed, "1").map(x => x._id)).toEqual([0, 1]);
    const later = rows.map(x => x._id === 3 ? { ...x, scanned: "pass" } : x);
    expect(binContents(later, r.binMap, r.closed, "3").map(x => x._id)).toEqual([3]);
  });
  it("closing again never reuses a box number; a box that is not open is not closed", () => {
    const a = closeBin(rows, map, [], "1");                       // Navy 1 -> 3
    const b = closeBin(rows, a.binMap, a.closed, "3");            // Navy 3 -> 4
    expect(b.newBin).toBe("4");
    expect(b.entry.ids).toEqual([]);                              // nothing went in box 3 yet
    expect(closeBin(rows, b.binMap, b.closed, "1")).toBeNull();   // box 1 is closed already
    expect(closeBin(rows, b.binMap, b.closed, "3")).toBeNull();
    expect(closeBin(rows, b.binMap, b.closed, "1.1")).toBeNull(); // a two-number name is not a box of this order
    expect(nextBinNumber(b.binMap, b.closed, "4")).toBe("5");
    expect(nextBinNumber(b.binMap, b.closed, "2")).toBe("5");     // the other team takes the next free number of the order too
    const c = closeBin(rows, b.binMap, b.closed, "2");            // Red 2 -> 5: one team's boxes need not be side by side
    expect(c.binMap).toEqual({ navy: "4", red: "5" });
    expect(c.closed.map(x => [x.bin, x.key])).toEqual([["1", "navy"], ["3", "navy"], ["2", "red"]]);
  });
  it("with three teams, closing the first box opens box 4, not 1.2; a closed box's number is never handed out again", () => {
    const three = [...rows, { _id: 5, name: "", number: "20", team: "White", size: "A-L", scanned: false }];
    const m = buildBinMap(three, {}, "team");                     // Navy 1, Red 2, White 3
    expect(m).toEqual({ navy: "1", red: "2", white: "3" });
    const a = closeBin(three, m, [], "1");
    expect(a.newBin).toBe("4");
    const b = closeBin(three, a.binMap, a.closed, "4");           // the highest box is now closed: 5, never 4 again
    expect(b.newBin).toBe("5");
    expect(nextBinNumber({ navy: "2" }, [{ bin: "9", key: "red", ids: [] }], "2")).toBe("10");
  });
  it("box names sort by their numbers, not as text; whole numbers and two-number names both read", () => {
    expect(boxParts("5.2")).toEqual([5, 2]);
    expect(boxParts("10.1")).toEqual([10, 1]);
    expect(boxParts("3")).toEqual([3, 0]);                        // a whole-number box
    expect(boxParts(3)).toEqual([3, 0]);
    expect(binOrder("2", "10")).toBeLessThan(0);
    expect(["10", "4", "31", "2", "1"].sort(binOrder)).toEqual(["1", "2", "4", "10", "31"]);
    expect(binOrder("2.1", "10.1")).toBeLessThan(0);
    expect(binOrder("5.2", "5.10")).toBeLessThan(0);
    expect(["10.1", "5.10", "2.1", "5.2", "5.1"].sort(binOrder)).toEqual(["2.1", "5.1", "5.2", "5.10", "10.1"]);
  });
  it("by size: the map keeps its field", () => {
    const bySz = buildBinMap(rows, {}, "size");
    const r = closeBin(rows, bySz, [], binFor(bySz, rows[0]));
    expect(r.binMap.__by).toBe("size");
    expect(r.entry.label).toBe("A-L");
    expect(r.entry.ids).toEqual([0, 2]);
  });
  it("an un-checked row leaves the closed box; rows added later for a new team get a number no box has had", () => {
    const r = closeBin(rows, map, [], "1");                       // Navy 1 -> 3
    const closed = dropFromClosed(r.closed, 0);
    expect(closed[0].ids).toEqual([1]);
    const more = [...rows, { _id: 5, name: "", number: "20", team: "Green", size: "A-L", scanned: false }];
    expect(buildBinMap(more, r.binMap, undefined, r.closed.map(c => c.bin))).toEqual({ navy: "3", red: "2", green: "4" });   // 1 is closed, 2 and 3 are open
  });
});

// An order started before whole numbers keeps its two-number names and carries
// on with them exactly as before (owner, 12 Nov 2026): 1.1 then 1.2 gives 1.3,
// and each team counts its own boxes.
describe("an order started with two-number box names", () => {
  const rows = [
    { _id: 0, name: "SMITH", number: "7",  team: "Navy", size: "A-L",  scanned: "pass" },
    { _id: 1, name: "JONES", number: "9",  team: "Navy", size: "A-M",  scanned: "manual" },
    { _id: 2, name: "LEE",   number: "3",  team: "Red",  size: "A-L",  scanned: "pass" },
    { _id: 3, name: "PATEL", number: "12", team: "Navy", size: "A-XL", scanned: false },
  ];
  const map = { navy: "1.1", red: "2.1" };                        // as such an order was saved
  it("1.1 then 1.2 gives 1.3; the other team counts its own boxes; a plain number is not one of its boxes", () => {
    const a = closeBin(rows, map, [], "1.1", 1000);
    expect(a.newBin).toBe("1.2");
    expect(a.entry).toEqual({ bin: "1.1", key: "navy", label: "Navy", ids: [0, 1], closedAt: 1000 });
    expect(binOfRow(a.binMap, a.closed, rows[3])).toBe("1.2");
    const b = closeBin(rows, a.binMap, a.closed, "1.2");
    expect(b.newBin).toBe("1.3");
    expect(b.binMap).toEqual({ navy: "1.3", red: "2.1" });
    expect(b.closed.map(c => c.bin)).toEqual(["1.1", "1.2"]);
    expect(closeBin(rows, b.binMap, b.closed, "1.1")).toBeNull();
    expect(closeBin(rows, b.binMap, b.closed, 1)).toBeNull();
    expect(nextBinNumber(b.binMap, b.closed, "1.3")).toBe("1.4");
    expect(nextBinNumber(b.binMap, b.closed, "2.1")).toBe("2.2");
  });
  it("rows added later for a new team get the next unused first number", () => {
    const r = closeBin(rows, map, [], "1.1");
    const more = [...rows, { _id: 5, name: "", number: "20", team: "Green", size: "A-L", scanned: false }];
    const m = buildBinMap(more, r.binMap, undefined, r.closed.map(c => c.bin));
    expect(m.navy).toBe("1.2");
    expect(m.red).toBe("2.1");
    expect(m.green).toBe("3");                                    // a team new to the order gets a whole number
  });
});

// Saved sessions are still passed through modernBins. While boxes had two
// numbers it turned a plain 3 into 3.1; plain numbers are box names again
// (the co-op, 27 Nov 2026), so it leaves every name as it is.
describe("modernBins", () => {
  it("leaves whole numbers, two-number names and the sort field alone", () => {
    expect(modernBins({ navy: "1", red: "3" })).toEqual({ navy: "1", red: "3" });
    expect(modernBins({ "y-m": "2", "a-l": "4.2", __by: "size" })).toEqual({ "y-m": "2", "a-l": "4.2", __by: "size" });
    expect(modernBins(null)).toBeNull();
  });
});

describe("what a box is short of before it is sealed", () => {
  const r = (id, team, scanned, number = String(id)) => ({ _id: id, team, number, name: `P${id}`, size: "A-L", scanned });
  const roster = [r(1, "Navy", "pass"), r(2, "Navy", "pass"), r(3, "Navy", "flag"), r(4, "Navy", "missing"), r(5, "Red", "pass"), r(6, "Red", false), r(7, "White", "manual")];
  const map = buildBinMap(roster, {}, "team");
  it("lists, per open box, what is not scanned and what will not arrive", () => {
    const s = shortages(roster, map, []);
    expect(s.map(x => [x.bin, x.label, x.toScan, x.flagged, x.missing])).toEqual([["1", "Navy", 0, 1, 1], ["2", "Red", 1, 0, 0]]);
    expect(s[0].short.map(x => x._id)).toEqual([3, 4]);
    expect(s[1].waiting.map(x => x._id)).toEqual([6]);
  });
  it("a complete box, and an order with no boxes, lack nothing", () => {
    expect(shortages(roster, map, []).some(x => x.label === "White")).toBe(false);
    expect(shortages(roster, null, [])).toEqual([]);
    expect(shortages(roster.map(x => ({ ...x, scanned: "pass" })), map, [])).toEqual([]);
  });
  it("after a box is closed the shortage is the next box's", () => {
    const c = closeBin(roster, map, [], "1");                     // Navy 1, Red 2, White 3: Navy goes on in box 4
    expect(shortages(roster, c.binMap, c.closed).map(x => [x.bin, x.label])).toEqual([["2", "Red"], ["4", "Navy"]]);
  });
  it("names the jerseys for a screen line", () => {
    expect(jerseyList([r(3, "Navy"), r(4, "Navy")])).toBe("#3, #4");
    expect(jerseyList([1, 2, 3, 4].map(i => r(i, "Navy")), 2)).toBe("#1, #2 and 2 more");
    expect(jerseyList([{ number: "", name: "LEE" }, { number: "", name: "", size: "Y-M" }, {}])).toBe("LEE, Y-M blank, blank");
  });
});

describe("blank jerseys: a roster of sizes and quantities", () => {
  it("a blanks file has no name or number column; the quantity makes that many rows", () => {
    const r = parseCSV("Team,Size,Qty,Style\nNavy,A-L,3,H550\nNavy,A-XL,2,H550\nRed,Y-M,1,H550\n");
    expect(r.length).toBe(6);
    expect(r.every(isBlankRow)).toBe(true);
    expect(r.map(x => x._id)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(r[0]).toMatchObject({ team: "Navy", size: "A-L", style: "H550", name: "", number: "" });
    expect("quantity" in r[0]).toBe(false);                       // the quantity is not kept as a column
    expect(orderNumberOf(parseCSV("Order 77123\nSize,Quantity\nA-L,2\n"))).toBe("77123");
  });
  it("a blanks file without quantities is one row a line; an empty line is still dropped", () => {
    const r = parseCSV("Team,Size\nNavy,A-L\nNavy,A-L\n,\nRed,Y-M\n");
    expect(r.map(x => [x.team, x.size])).toEqual([["Navy", "A-L"], ["Navy", "A-L"], ["Red", "Y-M"]]);
  });
  it("a names roster is read as it always was: a line with no name and no number is dropped unless it says how many", () => {
    const plain = parseCSV("Name,Number,Team,Size\nSMITH,7,Navy,A-L\n,,Navy,A-XL\nJONES,9,Navy,A-L\n");
    expect(plain.map(x => x.name)).toEqual(["SMITH", "JONES"]);
    const mixed = parseCSV("Name,Number,Team,Size,Qty\nSMITH,7,Navy,A-L,1\n,,Navy,A-XL,3\n");
    expect(mixed.length).toBe(4);
    expect(mixed.filter(isBlankRow).length).toBe(3);
    expect(parseCSV("Name,Number,Qty\nSMITH,7,0\n").length).toBe(1);   // a named jersey is one jersey whatever the cell says
  });
  it("a silly quantity cannot freeze the station", () => {
    expect(parseCSV("Size,Qty\nA-L,999999\n").length).toBe(MAX_QUANTITY);
    expect(parseCSV("Size,Qty\nA-L,-4\nA-L,0\n").length).toBe(0);            // none asked for: none made
    expect(parseCSV("Size,Qty\nA-M,abc\n").length).toBe(1);                    // a cell that is not a number: the line is one jersey, not lost
  });
  it("groups by team, size and style, with what is done and the next row to count", () => {
    const r = parseCSV("Team,Size,Qty\nRed,Y-M,2\nNavy,A-XL,1\nNavy,A-L,3\n");
    r[2].scanned = "pass"; r[3].scanned = "flag";                 // the one Navy A-XL passed, one Navy A-L flagged
    const g = blankGroups([...r, { _id: 99, name: "SMITH", number: "7", team: "Navy", size: "A-L" }]);
    expect(g.map(x => [x.team, x.size, x.total, x.done, x.flagged])).toEqual([["Navy", "A-L", 3, 0, 1], ["Navy", "A-XL", 1, 1, 0], ["Red", "Y-M", 2, 0, 0]]);
    expect(g[0].next._id).toBe(4);                                 // the first Navy A-L not yet touched
    expect(g[1].next).toBeNull();
    expect(blankGroups([{ _id: 1, name: "SMITH", number: "7" }])).toEqual([]);
  });
});

// Code review of 23 Nov 2026, the low findings.
describe("roster file quirks", () => {
  it("a title row 'Order Form' does not give the order number 'Form'", () => {
    const r = parseCSV("Order Form\nName,Number\nSmith,12\nJones,7\n");
    expect(orderNumberOf(r)).toBe("");
    expect(orderNumberOf(parseCSV("Order Form - Order 55555\nName,Number\nSmith,12\n"))).toBe("55555");
    expect(orderNumberOf(parseCSV("PO# A-264247\nName,Number\nSmith,12\n"))).toBe("A-264247");
  });
  it("a number cell with decimals (12.0, 7.00) is the digits, leading zeros kept", () => {
    const r = rowsToRoster([["Name", "Number"], ["Smith", "12.0"], ["Jones", "7.00"], ["Lee", "07.0"], ["Kim", "07"], ["Li", "12.5"]]);
    expect(r.map(x => x.number)).toEqual(["12", "7", "07", "07", "12.5"]);
  });
  it("a quoted cell with a line break in it stays one cell of one row", () => {
    const r = parseCSV('Name,Number,Team\n"Smith\nJr",12,Navy\nJones,7,"Red\r\nWhite"\r\nLee,4,Navy\n');
    expect(r.map(x => [x.name, x.number, x.team])).toEqual([["Smith Jr", "12", "Navy"], ["Jones", "7", "Red White"], ["Lee", "4", "Navy"]]);
  });
  it("ordinary quoting is unchanged, and a stray inch mark does not swallow lines", () => {
    const r = parseCSV('Name,Number,Team\n"Smith, John",12,"Navy ""A"""\nJones,7,Sleeve 12"\nLee,4,Navy\n');
    expect(r.map(x => [x.name, x.number])).toEqual([["Smith, John", "12"], ["Jones", "7"], ["Lee", "4"]]);
    expect(r[0].team).toBe('Navy "A"');
  });
});
