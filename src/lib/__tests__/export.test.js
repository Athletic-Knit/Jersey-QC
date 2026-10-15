import { describe, it, expect } from "vitest";
import { csvCell, safeFilename, buildLogCSV, buildRosterSheet, localDateStamp } from "../export.js";

describe("csv", () => {
  it("quotes commas and doubles quotes", () => {
    expect(csvCell('Rejected, needs "restitch"')).toBe('"Rejected, needs ""restitch"""');
    expect(csvCell("plain")).toBe("plain");
  });
  it("neutralises formula injection", () => {
    expect(csvCell("=cmd|' /C calc'!A0")).toMatch(/^ =/);
    expect(csvCell("+1")).toBe(" +1");
  });
  it("builds a log with reason and resolution in separate columns", () => {
    const csv = buildLogCSV([{ timestamp: "t", status: "flagged", detected: { name: "A, B", number: "1" }, match: { name: "A", number: "1", team: "T", size: "L" }, reason: "Stitching", resolution: "Rejected", operator: "Cooper" }], () => 2);
    const lines = csv.split("\r\n");
    expect(lines[0]).toContain("Reason,Resolution,Operator");
    expect(lines[1]).toBe('t,flagged,"A, B",1,A,1,T,L,2,Stitching,Rejected,Cooper');
  });
});

describe("filenames and dates", () => {
  it("strips characters Windows refuses", () => {
    expect(safeFilename("ORD/2026/44")).toBe("ORD-2026-44");
    expect(safeFilename("AK:26*104")).toBe("AK-26-104");
    expect(safeFilename("")).toBe("order");
  });
  it("uses the local date, not UTC", () => {
    expect(localDateStamp(new Date(2026, 9, 15, 21, 30))).toBe("2026-10-15");
  });
});

describe("roster sheet", () => {
  it("labels every state and carries reason / resolution", () => {
    const roster = [
      { _id: 0, name: "A", number: "1", team: "T", size: "L", scanned: "pass" },
      { _id: 1, name: "B", number: "2", team: "T", size: "M", scanned: "flag" },
      { _id: 2, name: "C", number: "3", team: "T", size: "S", scanned: "missing" },
      { _id: 3, name: "D", number: "4", team: "T", size: "S", scanned: false },
    ];
    const log = [{ match: { _id: 1 }, reason: "Stitching", resolution: "Rejected — sent back", operator: "Cooper", timestamp: "t1" }];
    const sheet = buildRosterSheet(roster, log, { orderNumber: "25" }, ["name", "number", "team", "size"], () => 1);
    const body = sheet.slice(6);
    expect(body.map(r => r[0])).toEqual(["PASS", "FLAGGED", "MISSING", "NOT SCANNED"]);
    expect(body[1].slice(6, 9)).toEqual(["Stitching", "Rejected — sent back", "Cooper"]);
  });
});
