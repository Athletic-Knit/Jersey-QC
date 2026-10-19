import { describe, it, expect } from "vitest";
import { parseCSV, splitCSVLine, detectDelimiter, canonicalHeader, rowsToRoster, buildBinMap, binFor, binEntries, extraColumns, displayColumns, BOM } from "../roster.js";

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
    expect(binEntries(roster, buildBinMap(roster))).toEqual([{ team: "Hawks", bin: 1 }, { team: "Ravens", bin: 2 }]);
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
