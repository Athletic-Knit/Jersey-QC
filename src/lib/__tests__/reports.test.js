// Phase 2 reports: flag and pass rates, a row per operator, defects by
// category, the order's summary sheet, and the comparison across days.
import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { buildDaySheets, buildDefectsSheet, buildOrderSummarySheet, buildCompareSheets } from "../export.js";
import { reasonCategory, DEFECT_CATEGORIES, reasonsFor, REASONS } from "../../config.js";
import { createHub } from "../../../hub-plugin.js";

const ev = (id, t, status, operator, extra = {}) => ({ id, t, status, operator, order: "25", station: "st-station1", number: String(id), name: `P${id}`, ...extra });
const day1 = [
  ev(1, "2026-11-10 09:00:00", "pass", "Jordan"),
  ev(2, "2026-11-10 09:00:30", "pass", "Jordan"),
  ev(3, "2026-11-10 09:01:00", "flagged", "Jordan", { reason: "Loose, missing or broken stitching" }),
  ev(4, "2026-11-10 09:01:30", "manual", "Jordan"),
  ev(5, "2026-11-10 14:00:00", "pass", "Sam", { station: "st-station2" }),
  ev(6, "2026-11-10 14:00:40", "flagged", "Sam", { station: "st-station2", reason: "Print error — ghosting, fading, misaligned — found after it passed" }),
  ev(7, "2026-11-10 14:01:20", "flagged", "Sam", { station: "st-station2", offRoster: true, reason: "Flagged by operator" }),
  ev(8, "2026-11-10 14:02:00", "pass", "Sam", { station: "st-station2" }),
];
const day2 = [
  ev(11, "2026-11-11 09:00:00", "pass", "Jordan"),
  ev(12, "2026-11-11 09:00:30", "pass", "Jordan"),
  ev(13, "2026-11-11 09:01:00", "flagged", "Jordan", { reason: "Wrong or missing size label" }),
];
const col = (sheet, row, name) => row[sheet[0].indexOf(name)];

describe("defect categories", () => {
  it("every reason on every menu has a category the reports know", () => {
    for (const list of [REASONS, reasonsFor("echl"), reasonsFor("sublimated"), reasonsFor("")])
      for (const r of list) expect(DEFECT_CATEGORIES).toContain(reasonCategory(r.label));
  });
  it("the roadmap's four: label, sewing, artwork, decoration", () => {
    expect(reasonCategory("Wrong or missing size label")).toBe("Label");
    expect(reasonCategory("Loose, missing or broken stitching")).toBe("Sewing");
    expect(reasonCategory("Seam, hem or construction")).toBe("Sewing");
    expect(reasonCategory("Print error — ghosting, fading, misaligned")).toBe("Artwork");
    expect(reasonCategory("Wrong name, number or team")).toBe("Decoration");
    expect(reasonCategory("Twill lifting, peeling or torn")).toBe("Decoration");
  });
  it("a late flag keeps its category; typed text is Other; not on the roster is an order problem", () => {
    expect(reasonCategory("Fabric flaw, snag or hole — found after it passed")).toBe("Fabric");
    expect(reasonCategory("button fell off")).toBe("Other");
    expect(reasonCategory("Not on the roster")).toBe("Order");
    expect(reasonCategory("")).toBe("Other");
  });
  it("the size label reason is offered on both kinds of order", () => {
    expect(reasonsFor("echl").map(r => r.id)).toContain("label");
    expect(reasonsFor("sublimated").map(r => r.id)).toContain("label");
  });
  it("a flag fixed at the station counts in the Defects sheet and the flag rate like any other", () => {
    const fixed = [ev(21, "2026-11-12 09:00:00", "pass", "Jordan"), ev(22, "2026-11-12 09:01:00", "flagged", "Jordan", { reason: "Dirt or mark", resolution: "Fixed at the station" })];
    const s = buildDefectsSheet(fixed, reasonCategory);
    expect(s.find(r => r[0] === "Cleaning")?.[1]).toBe(1);
    expect(s.find(r => r[0] === "All flags")?.[1]).toBe(1);
    const d = buildDaySheets({ date: "2026-11-12", events: fixed, orders: [] }, id => id, { categoryOf: reasonCategory });
    const all = d.summary.find(r => r[0] === "All stations");
    expect(all[d.summary[4].indexOf("Flag rate %")]).toBe(50);   // 1 of 2 inspected
  });
  it("the sheet counts flags by category, then by reason", () => {
    const s = buildDefectsSheet(day1, reasonCategory);
    expect(s[0]).toEqual(["Category", "Garments", "Share of flags %"]);
    const cats = Object.fromEntries(s.slice(1, 4).map(r => [r[0], r[1]]));
    expect(cats).toEqual({ Sewing: 1, Artwork: 1, Order: 1 });
    expect(s[4]).toEqual(["All flags", 3, 100]);
    expect(s.slice(7)).toEqual(expect.arrayContaining([["Artwork", "Print error — ghosting, fading, misaligned", 1], ["Order", "Not on the roster", 1]]));
    expect(buildDefectsSheet([], reasonCategory)[1]).toEqual(["All flags", 0, ""]);
  });
});

describe("the day sheet: rates and operators", () => {
  const s = buildDaySheets({ date: "2026-11-10", events: day1, orders: [{ station: "st-station1", order: "25", operator: "Jordan", counts: { total: 4, remaining: 0 } }] }, id => id, { categoryOf: reasonCategory });
  it("flag rate and pass rate per station: of the garments inspected", () => {
    const head = s.summary[4], st1 = s.summary[5];
    expect(st1[head.indexOf("Flag rate %")]).toBe(25);      // 1 of 4 inspected (2 passed, 1 by hand, 1 flagged)
    expect(st1[head.indexOf("Pass rate %")]).toBe(50);
    const all = s.summary.find(r => r[0] === "All stations");
    expect(all[head.indexOf("Flag rate %")]).toBe(37.5);    // 3 of 8
  });
  it("a row per operator", () => {
    const jordan = s.operators.find(r => r[0] === "Jordan"), sam = s.operators.find(r => r[0] === "Sam");
    expect(col(s.operators, jordan, "Passed")).toBe(2);
    expect(col(s.operators, jordan, "By hand")).toBe(1);
    expect(col(s.operators, jordan, "Flag rate %")).toBe(25);
    expect(col(s.operators, sam, "Passed")).toBe(2);
    expect(col(s.operators, sam, "To supervisor")).toBe(1);
    expect(col(s.operators, sam, "Not on roster")).toBe(1);
    expect(col(s.operators, sam, "Flag rate %")).toBe(50);
    expect(col(s.operators, sam, "Stations")).toBe("st-station2");
  });
  it("the order row carries its rates, and the defects sheet rides along", () => {
    const head = s.orders[0], row = s.orders[1];
    expect(row[head.indexOf("Flag rate %")]).toBe(25);
    expect(s.defects[0][0]).toBe("Category");
  });
});

describe("the order's summary sheet", () => {
  const roster = [
    { _id: 1, number: "1", name: "A", team: "Navy", size: "A-L", scanned: "pass" },
    { _id: 2, number: "2", name: "B", team: "Navy", size: "A-L", scanned: "pass" },
    { _id: 3, number: "3", name: "C", team: "Navy", size: "A-L", scanned: "flag" },
    { _id: 4, number: "4", name: "D", team: "Red", size: "A-XL", scanned: "manual" },
    { _id: 5, number: "5", name: "E", team: "Red", size: "A-XL", scanned: "missing" },
    { _id: 6, number: "6", name: "F", team: "Red", size: "A-XL", scanned: false },
  ];
  const log = [
    { timestamp: "2026-11-10 09:00:00", status: "pass", operator: "Jordan", match: roster[0] },
    { timestamp: "2026-11-10 09:00:40", status: "pass", operator: "Jordan", match: roster[1] },
    { timestamp: "2026-11-10 09:01:20", status: "flagged", operator: "Jordan", match: roster[2], reason: "Twill lifting, peeling or torn" },
    { timestamp: "2026-11-10 09:02:00", status: "manual", operator: "Jordan", match: roster[3] },
  ];
  const s = buildOrderSummarySheet(roster, log, { orderNumber: "264247", jerseyType: "ECHL" }, reasonCategory);
  const val = label => s.find(r => r[0] === label)?.[1];
  it("counts, rates and pace", () => {
    expect(val("Order")).toBe("264247");
    expect(val("Garments on the order")).toBe(6);
    expect(val("Passed")).toBe(2);
    expect(val("Entered by hand")).toBe(1);
    expect(val("Sent to the supervisor")).toBe(1);
    expect(val("Marked missing")).toBe(1);
    expect(val("Unscanned")).toBe(1);
    expect(val("Pass rate %")).toBe(50);
    expect(val("Flag rate %")).toBe(25);
    expect(val("Active minutes")).toBe(2);
    expect(val("Operators")).toBe("Jordan");
  });
  it("the defects, and every garment that is in no box", () => {
    expect(s).toEqual(expect.arrayContaining([["Decoration", 1, 100]]));
    expect(s.find(r => String(r[0]).startsWith("Not in a box"))[0]).toBe("Not in a box: 3");
    expect(s).toEqual(expect.arrayContaining([["FLAGGED", "#3 C", "Navy", "A-L"], ["MISSING", "#5 E", "Red", "A-XL"], ["UNSCANNED", "#6 F", "Red", "A-XL"]]));
  });
});

describe("comparing days", () => {
  const s = buildCompareSheets([{ date: "2026-11-11", events: day2, orders: [{}] }, { date: "2026-11-10", events: day1, orders: [{}, {}] }], id => id.replace("st-", ""), { categoryOf: reasonCategory });
  it("a row per day, oldest first, and a total", () => {
    expect(s.byDay.slice(1, 3).map(r => r[0])).toEqual(["2026-11-10", "2026-11-11"]);
    expect(col(s.byDay, s.byDay[1], "Passed")).toBe(4);
    expect(col(s.byDay, s.byDay[1], "Flag rate %")).toBe(37.5);
    expect(col(s.byDay, s.byDay[2], "Passed")).toBe(2);
    expect(col(s.byDay, s.byDay[2], "Orders")).toBe(1);
    const total = s.byDay.find(r => r[0] === "All days");
    expect(col(s.byDay, total, "Passed")).toBe(6);
    expect(col(s.byDay, total, "Orders")).toBe(3);
  });
  it("each operator over the range, and day by day", () => {
    const jordan = s.byOperator.find(r => r[0] === "Jordan");
    expect(col(s.byOperator, jordan, "Days worked")).toBe(2);
    expect(col(s.byOperator, jordan, "Passed")).toBe(4);
    expect(s.operatorByDay.filter(r => r[1] === "Jordan").map(r => r[0])).toEqual(["2026-11-10", "2026-11-11"]);
    expect(s.operatorByDay.filter(r => r[1] === "Sam").length).toBe(1);
  });
  it("each station by day, and the morning against the afternoon", () => {
    expect(s.stationByDay.slice(1).map(r => [r[0], r[1]])).toEqual([["2026-11-10", "station1"], ["2026-11-10", "station2"], ["2026-11-11", "station1"]]);
    const parts = s.parts.filter(r => r[0] === "2026-11-10").map(r => [r[1], col(s.parts, r, "Passed")]);
    expect(parts).toEqual([["Before noon", 2], ["Noon to 6 pm", 2]]);
  });
  it("the defect categories day by day", () => {
    const head = s.defects[0];
    expect(head[0]).toBe("Date");
    expect(head).toEqual(expect.arrayContaining(["Sewing", "Artwork", "Order", "Label", "All flags", "Flag rate %"]));
    const d2 = s.defects.find(r => r[0] === "2026-11-11");
    expect(d2[head.indexOf("Label")]).toBe(1);
    expect(d2[head.indexOf("Sewing")]).toBe(0);
    expect(d2[head.indexOf("All flags")]).toBe(1);
  });
});

describe("GET /ledger?from=&to=: several days, slim", () => {
  it("returns each day in the range without photos or rosters", async () => {
    let t = new Date("2026-11-10T14:00:00").getTime();
    const hub = createHub({ file: path.join(os.tmpdir(), `hub-range-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}.json`), now: () => t });
    const call = (method, url, body) => new Promise(resolve => {
      const req = new EventEmitter(); req.method = method; req.url = url;
      const res = { statusCode: 200, setHeader() {}, end(x) { resolve({ status: res.statusCode, body: JSON.parse(x) }); } };
      hub.handle(req, res);
      if (body !== undefined) req.emit("data", JSON.stringify(body));
      req.emit("end");
    });
    const report = id => ({ operatorName: "Pat", orderNumber: "25", orderRun: 1, counts: { total: 1, remaining: 0, pass: 1 }, rows: [{ _id: 1, number: "7" }], attention: [],
      events: [{ id, t: "x", status: "flagged", order: "25", run: 1, reason: "Seam, hem or construction", photo: "data:image/jpeg;base64,AAAA" }] });
    await call("POST", "/stations/st-station1", report(1));
    t += 86400000; await call("POST", "/stations/st-station1", report(2));
    t += 86400000; await call("POST", "/stations/st-station1", report(3));
    const { status, body } = await call("GET", "/ledger?from=2026-11-10&to=2026-11-11");
    expect(status).toBe(200);
    expect(body.days.map(d => d.date)).toEqual(["2026-11-10", "2026-11-11"]);
    expect(body.days[0].events[0].photo).toBeUndefined();
    expect(body.days[0].events[0].reason).toBe("Seam, hem or construction");
    expect(body.days[0].orders[0].rows).toBeUndefined();
    expect(body.days[0].orders[0]).toMatchObject({ station: "st-station1", order: "25", operator: "Pat" });
    expect(body.known.length).toBe(3);
    expect((await call("GET", "/ledger?date=2026-11-12")).body.events.length).toBe(1);   // the one-day route is as it was
  });
});
