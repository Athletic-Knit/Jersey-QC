import { describe, it, expect } from "vitest";
import { parseCSV, splitCSVLine, detectDelimiter, canonicalHeader, rowsToRoster, buildBinMap, binFor, binEntries, extraColumns, displayColumns, BOM, orderNumberOf, closeBin, binOfRow, binContents, nextBinNumber, dropFromClosed } from "../roster.js";

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
    expect(m).toEqual({ hawks: 1, ravens: 2 });
    expect(binFor(m, "Ravens")).toBe(2);
    expect(binFor(m, "ravens ")).toBe(2);
    expect(binFor(m, "")).toBeNull();
  });
  it("pins existing bins when the roster is replaced", () => {
    const first = buildBinMap([{ team: "Ravens" }, { team: "Hawks" }]);
    const second = buildBinMap([{ team: "Hawks" }, { team: "Wolves" }], first);
    expect(second.hawks).toBe(first.hawks);
    expect(second.ravens).toBe(first.ravens);
    expect(second.wolves).toBe(3);
  });
  it("lists entries with the roster's spelling", () => {
    expect(binEntries(roster, buildBinMap(roster))).toEqual([{ label: "Hawks", bin: 1 }, { label: "Ravens", bin: 2 }]);
  });
  it("by size: one bin per size, youth before adult, XS before 3XL; the row says which field", () => {
    const r = [{ team: "Ravens", size: "A-L" }, { team: "Hawks", size: "Y-M" }, { team: "Ravens", size: "A-XS" }, { team: "Hawks", size: "a-l " }, { team: "Hawks", size: "A-3XL" }];
    const m = buildBinMap(r, {}, "size");
    expect(m.__by).toBe("size");
    expect(binEntries(r, m)).toEqual([{ label: "Y-M", bin: 1 }, { label: "A-XS", bin: 2 }, { label: "A-L", bin: 3 }, { label: "A-3XL", bin: 4 }]);
    expect(binFor(m, { team: "Hawks", size: "A-L" })).toBe(3);
    expect(binFor(m, { team: "Hawks" })).toBeNull();
    expect(binFor(buildBinMap(r), { team: "Hawks", size: "A-L" })).toBe(1);   // by team, the size is ignored
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

// A bin that is full: it is closed with what was in it, and its team or size
// carries on in a bin number nobody has used.
describe("closing a full bin", () => {
  const rows = [
    { _id: 0, name: "SMITH", number: "7",  team: "Navy", size: "A-L",  scanned: "pass" },
    { _id: 1, name: "JONES", number: "9",  team: "Navy", size: "A-M",  scanned: "manual" },
    { _id: 2, name: "LEE",   number: "3",  team: "Red",  size: "A-L",  scanned: "pass" },
    { _id: 3, name: "PATEL", number: "12", team: "Navy", size: "A-XL", scanned: false },
    { _id: 4, name: "KIM",   number: "4",  team: "Navy", size: "A-S",  scanned: "flag" },
  ];
  const map = buildBinMap(rows, {}, "team");   // Navy 1, Red 2
  it("the closed bin keeps its rows, the team moves to the next free number", () => {
    const r = closeBin(rows, map, [], 1, 1000);
    expect(r.newBin).toBe(3);
    expect(r.binMap).toEqual({ navy: 3, red: 2 });
    expect(r.entry).toEqual({ bin: 1, key: "navy", label: "Navy", ids: [0, 1], closedAt: 1000 });   // passed and by hand; not the flag, not the unscanned
    expect(binOfRow(r.binMap, r.closed, rows[0])).toBe(1);        // already in the closed bin
    expect(binOfRow(r.binMap, r.closed, rows[3])).toBe(3);        // still to scan: the new bin
    expect(binContents(rows, r.binMap, r.closed, 1).map(x => x._id)).toEqual([0, 1]);
    const later = rows.map(x => x._id === 3 ? { ...x, scanned: "pass" } : x);
    expect(binContents(later, r.binMap, r.closed, 3).map(x => x._id)).toEqual([3]);
  });
  it("closing again never reuses a number; a bin that is not open is not closed", () => {
    const a = closeBin(rows, map, [], 1);
    const b = closeBin(rows, a.binMap, a.closed, 3);
    expect(b.newBin).toBe(4);
    expect(b.entry.ids).toEqual([]);                              // nothing went in bin 3 yet
    expect(closeBin(rows, b.binMap, b.closed, 1)).toBeNull();     // bin 1 is closed already
    expect(nextBinNumber(b.binMap, b.closed)).toBe(5);
  });
  it("by size: the map keeps its field", () => {
    const bySz = buildBinMap(rows, {}, "size");
    const r = closeBin(rows, bySz, [], binFor(bySz, rows[0]));
    expect(r.binMap.__by).toBe("size");
    expect(r.entry.label).toBe("A-L");
    expect(r.entry.ids).toEqual([0, 2]);
  });
  it("an un-checked row leaves the closed bin; rows added later never get a closed bin's number", () => {
    const r = closeBin(rows, map, [], 1);
    const closed = dropFromClosed(r.closed, 0);
    expect(closed[0].ids).toEqual([1]);
    const more = [...rows, { _id: 5, name: "", number: "20", team: "Green", size: "A-L", scanned: false }];
    expect(buildBinMap(more, r.binMap, undefined, r.closed.map(c => c.bin))).toEqual({ navy: 3, red: 2, green: 4 });
  });
});
