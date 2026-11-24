// The Print menu's jobs: any label of an order, again — for the order on the
// station or for one found in the hub's records.
import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { buildBinMap, closeBin } from "../roster.js";
import { packBoxes, boxLabelJobs, boxListJobs, stickerRows, stickerJobs, flagJobs, packFromRecord } from "../printjobs.js";
import { createHub } from "../../../hub-plugin.js";

const row = (i, o = {}) => ({ _id: i, name: `P${i}`, number: String(i + 1), team: i < 4 ? "Navy" : "Red", size: "A-L", scanned: "pass", ...o });
// Navy: 4 passed, box 1.1 closed with the first three, the fourth in 1.2. Red: one passed, one flagged, one to scan.
const roster = [row(0), row(1), row(2), row(3), row(4), row(5, { scanned: "flag" }), row(6, { scanned: false })];
const first  = buildBinMap(roster, {}, "team");
const closed = closeBin(roster.map((r, i) => i === 3 ? { ...r, scanned: false } : r), first, [], "1.1", 1000);
const pack = {
  orderNumber: "264247", roster, binMap: closed.binMap, closedBins: closed.closed, station: "st-station1",
  flags: [{ id: 9, match: roster[5], reason: "Loose thread", timestamp: "11/12/2026, 10:15:00" }],
};

describe("the boxes of an order", () => {
  it("closed and open, in box order, with what is in each", () => {
    expect(packBoxes(pack).map(b => [b.bin, b.label, b.open, b.count])).toEqual([["1.1", "Navy", false, 3], ["1.2", "Navy", true, 1], ["2.1", "Red", true, 1]]);
    expect(packBoxes({ roster, binMap: null })).toEqual([]);
  });
});

describe("box labels and lists", () => {
  it("every box label, or one; the labels the order still expects are added once", () => {
    expect(boxLabelJobs(pack).map(l => l.bin)).toEqual(["1.1", "1.2", "2.1"]);
    expect(boxLabelJobs(pack, "1.2")).toEqual([{ bin: "1.2", label: "Navy", by: "team", count: 1, orderNumber: "264247" }]);
    const plan = [{ bin: "1.2", label: "Navy", by: "team", orderNumber: "264247" }, { bin: "1.3", label: "Navy", by: "team", orderNumber: "264247" }];
    expect(boxLabelJobs({ ...pack, planLabels: plan }).map(l => l.bin)).toEqual(["1.1", "1.2", "1.3", "2.1"]);
  });
  it("the list of one box, or of every box with something in it: rows first, the count label last", () => {
    const one = boxListJobs(pack, "1.1");
    expect(one.map(l => l.title ? "count" : l.items)).toEqual([["1-P0-AL", "2-P1-AL", "3-P2-AL"], "count"]);
    expect(one[1]).toMatchObject({ bin: "1.1", label: "Navy", count: 3, orderNumber: "264247" });
    expect(boxListJobs(pack).filter(l => l.title).map(l => [l.bin, l.count])).toEqual([["1.1", 3], ["1.2", 1], ["2.1", 1]]);
    expect(boxListJobs({ ...pack, roster: roster.map(r => ({ ...r, scanned: false })) })).toEqual([]);
  });
});

describe("stickers and flag tickets", () => {
  it("a sticker for every passed jersey, with the box it is IN", () => {
    expect(stickerRows(pack).map(r => r._id)).toEqual([0, 1, 2, 3, 4]);
    const all = stickerJobs(pack);
    expect(all.map(l => l.bin)).toEqual(["1.1", "1.1", "1.1", "1.2", "2.1"]);     // the closed box, not the open one
    expect(stickerJobs(pack, [3])).toEqual([{ bin: "1.2", by: "team", value: "Navy", orderNumber: "264247" }]);
    expect(stickerJobs(pack, [5, 6])).toEqual([]);                                  // flagged, not scanned: no sticker
  });
  it("a ticket for a flag, with the tag the caller works out", () => {
    const [t] = flagJobs(pack, [9], reason => reason === "Loose thread" ? "STITCHER" : "DECIDE");
    expect(t).toMatchObject({ number: "6", name: "P5", tag: "STITCHER", reason: "Loose thread", team: "Red", bin: "2.1", orderNumber: "264247", station: "St 1" });
    expect(t.time).toBeUndefined();                                                  // no time on a ticket (the owner, 17 Nov 2026)
    expect(flagJobs(pack, [1])).toEqual([]);
    expect(flagJobs(pack).length).toBe(1);
  });
});

// The hub finds an order by its number, on any day it still has.
function makeHub() {
  let t = new Date("2026-11-10T14:00:00").getTime();
  const hub = createHub({ file: path.join(os.tmpdir(), `hub-print-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}.json`), now: () => t });
  const call = (method, url, body) => new Promise(resolve => {
    const req = new EventEmitter(); req.method = method; req.url = url;
    const res = { statusCode: 200, setHeader() {}, end(s) { resolve({ status: res.statusCode, body: JSON.parse(s) }); } };
    hub.handle(req, res);
    if (body !== undefined) req.emit("data", JSON.stringify(body));
    req.emit("end");
  });
  return { call, tick: ms => { t += ms; } };
}
const report = (order, run, extra = {}) => ({
  operatorName: "Pat", orderNumber: order, orderRun: run, counts: { total: 7, remaining: 1, pass: 5, flag: 1 }, rows: roster, bins: pack.binMap, closedBins: pack.closedBins, attention: [],
  events: [{ id: 9, t: "11/10/2026, 14:00:00", status: "flagged", order, run, rowId: 5, number: "6", name: "P5", team: "Red", size: "A-L", reason: "Loose thread", photo: "data:image/jpeg;base64,AAAA" },
           { id: 8, t: "11/10/2026, 13:59:00", status: "pass", order, run, rowId: 4, number: "5", name: "P4" }], ...extra,
});

describe("GET /orders: an order by its number", () => {
  it("finds it days later, with its rows, boxes and flags (no photos), and it prints the same", async () => {
    const { call, tick } = makeHub();
    await call("POST", "/stations/st-station2", report("264247", 111));
    await call("POST", "/stations/st-station3", report("999", 222));
    tick(2 * 86400000);
    await call("POST", "/stations/st-station3", report("1264247", 333));
    const { status, body } = await call("GET", "/orders?q=264247");
    expect(status).toBe(200);
    expect(body.orders.map(o => [o.order, o.exact])).toEqual([["264247", true], ["1264247", false]]);   // the exact number first
    const o = body.orders[0];
    expect(o).toMatchObject({ station: "st-station2", run: 111, operator: "Pat", date: "2026-11-10" });
    expect(o.rows.length).toBe(7);
    expect(o.flags.map(f => f.id)).toEqual([9]);
    expect(o.flags[0].photo).toBeUndefined();
    const past = packFromRecord(o);
    expect(packBoxes(past).map(b => [b.bin, b.count])).toEqual([["1.1", 3], ["1.2", 1], ["2.1", 1]]);
    expect(boxListJobs(past, "1.1")).toEqual(boxListJobs(pack, "1.1"));
    expect(flagJobs(past, null, () => "STITCHER")[0]).toMatchObject({ number: "6", name: "P5", tag: "STITCHER", bin: "2.1", station: "St 2" });
    expect(stickerJobs(past, [0])[0]).toMatchObject({ bin: "1.1", value: "Navy", orderNumber: "264247" });
  });
  it("no number is a 400; a number nobody ran is an empty list; two letters do not match inside a number", async () => {
    const { call } = makeHub();
    await call("POST", "/stations/st-station2", report("264247", 111));
    expect((await call("GET", "/orders")).status).toBe(400);
    expect((await call("GET", "/orders?q=555")).body.orders).toEqual([]);
    expect((await call("GET", "/orders?q=64")).body.orders).toEqual([]);
    expect((await call("GET", "/orders?q=6424")).body.orders.length).toBe(1);
  });
});

// ── The order summary and what is NOT in a box (the owner, 24 Nov 2026) ─────
import { orderSummary, summaryJobs, notInBox, notInBoxJobs, isLastBox, finishNotInBoxJobs, damagedItems } from "../printjobs.js";
import { binListZPL } from "../labels.js";

describe("the order summary", () => {
  // Navy: 4 passed (3 in 1.1 closed, 1 in 1.2). Red: #6 passed, #6b flagged, #7 to scan, #8 marked missing.
  const roster2 = [...roster, row(7, { team: "Red", scanned: "missing" })];
  const pack2 = { ...pack, roster: roster2 };
  it("passed with their box, failed with the reason, missing split in two", () => {
    const s = orderSummary(pack2);
    expect(s.passed.map(p => [p.row.number, p.bin])).toEqual([["1", "1.1"], ["2", "1.1"], ["3", "1.1"], ["4", "1.2"], ["5", "2.1"]]);
    expect(s.failed.map(f => [f.number, f.size, f.reason])).toEqual([["6", "A-L", "Loose thread"]]);
    expect(s.missing.marked.map(r => r.number)).toEqual(["8"]);
    expect(s.missing.notScanned.map(r => r.number)).toEqual(["7"]);
    expect(s.counts).toEqual({ total: 8, passed: 5, failed: 1, extra: 0, missing: 2, marked: 1, notScanned: 1 });
  });
  it("its labels: FAILED and MISSING pages then the count label; the PASSED list only on request", () => {
    const jobs = summaryJobs(pack2, { station: "Station 1", date: "2026-11-24" });
    expect(jobs.map(l => l.summary ? "count" : l.head)).toEqual(["MISSING", "FAILED", "count"]);
    expect(jobs[0].items.map(i => i.text)).toEqual(["#8 P7 Red A-L: marked missing", "#7 P6 Red A-L: not scanned"]);
    expect(jobs[1].items.map(i => i.text)).toEqual(["#6 P5 Red A-L: Loose thread"]);
    expect(jobs[2]).toMatchObject({ summary: true, orderNumber: "264247", station: "Station 1", date: "2026-11-24", counts: { total: 8, passed: 5, failed: 1, missing: 2 } });
    const withPassed = summaryJobs(pack2, { withPassed: true });
    expect(withPassed.map(l => l.summary ? "count" : l.head)).toEqual(["PASSED", "MISSING", "FAILED", "count"]);
    expect(withPassed[0].items[0].text).toBe("#1 P0 Navy A-L  Box 1.1");
    const z = binListZPL(jobs[2]);
    expect(z).toContain("^FDOrder 264247^FS");
    expect(z).toContain("^FD5 passed   1 failed   2 missing^FS");
    expect(z).toContain("^FDStation 1   2026-11-24^FS");
  });
});

describe("what is NOT in a box", () => {
  const roster2 = [...roster, row(7, { team: "Red", scanned: "missing" })];
  const pack2 = { ...pack, roster: roster2 };
  it("the jerseys of the box's team that are in no box, with why", () => {
    expect(notInBox(pack2, "2.1").map(x => [x.row.number, x.why])).toEqual([["6", "flagged — Loose thread"], ["7", "not scanned"], ["8", "marked missing"]]);
    expect(notInBox(pack2, "1.2")).toEqual([]);                       // Navy is complete
    expect(notInBox(pack2, "1.1")).toEqual([]);                       // a closed box of a complete team
    expect(notInBox({ ...pack2, binMap: null }, "2.1")).toEqual([]);
  });
  it("goes with the group's last box only, printed before the box's own list", () => {
    expect(isLastBox(pack2, "1.1")).toBe(false);                      // 1.2 has a jersey after it
    expect(isLastBox(pack2, "1.2")).toBe(true);
    expect(isLastBox(pack2, "2.1")).toBe(false);                     // Red still has #7 to scan: not last while the order is open
    expect(isLastBox({ ...pack2, finished: true }, "2.1")).toBe(true);   // the order is finished: nothing more comes, 2.1 is the last box
    expect(isLastBox({ ...pack2, past: {} }, "2.1")).toBe(true);
    const labels = notInBoxJobs(pack2, "2.1", "Red");
    expect(labels).toHaveLength(1);
    expect(labels[0]).toMatchObject({ head: "NOT IN BOX 2.1 Red", count: 3, box: "2.1", orderNumber: "" });   // no order number in the header (review, 24 Nov 2026)
    expect(boxListJobs({ ...pack2, finished: true }, "2.1").map(l => l.title ? "count" : l.head || "rows")).toEqual(["NOT IN BOX 2.1 Red", "rows", "count"]);
    expect(boxListJobs(pack2, "2.1").map(l => l.title ? "count" : l.head || "rows")).toEqual(["rows", "count"]);
    expect(boxListJobs(pack2, "1.1").map(l => l.title ? "count" : l.head || "rows")).toEqual(["rows", "count"]);
  });
});

describe("NOT IN BOX labels carry their box (review, 24 Nov 2026)", () => {
  it("so Finish order can hold them back with a box kept open for a ship-with order", () => {
    const roster2 = [...roster, row(7, { team: "Red", scanned: "missing" })];
    const labels = notInBoxJobs({ ...pack, roster: roster2 }, "2.1", "Red");
    expect(labels.map(l => [l.box, l.bin])).toEqual([["2.1", "NOT IN BOX 2.1 Red"]]);
    const kept = new Set(["2.1"]);
    expect([...labels, ...boxListJobs({ ...pack, roster: roster2 }, "1.1")].filter(l => !kept.has(String(l.box ?? l.bin))).map(l => l.bin)).toEqual(["1.1", "1.1"]);
  });
});

describe("review of 24 Nov 2026: the last box and the failed list", () => {
  it("a closed box is not last while its team has jerseys still to scan, even with the next box empty", () => {
    // Navy: 3 passed and closed in 1.1, #4 not scanned yet, 1.2 open and empty.
    const r = roster.map((x, i) => i === 3 ? { ...x, scanned: false } : x);
    const p = { ...pack, roster: r };
    expect(isLastBox(p, "1.1")).toBe(false);
    expect(boxListJobs(p, "1.1").map(l => l.title ? "count" : l.head || "rows")).toEqual(["rows", "count"]);
    // #4 marked missing instead: nothing left to scan, so 1.1 is the last box and lists it.
    const p2 = { ...pack, roster: roster.map((x, i) => i === 3 ? { ...x, scanned: "missing" } : x) };
    expect(isLastBox(p2, "1.1")).toBe(true);
    expect(notInBox(p2, "1.1").map(x => [x.row.number, x.why])).toEqual([["4", "marked missing"]]);
    expect(notInBoxJobs(p2, "1.1", "Navy")[0]).toMatchObject({ head: "NOT IN BOX 1.1 Navy", box: "1.1" });
    expect(binListZPL(notInBoxJobs(p2, "1.1", "Navy")[0])).not.toContain("Order 264247");   // the header keeps its size
  });
  it("a flagged row with no flag entry is still failed; flags with no row are extra, counted apart", () => {
    const p = { orderNumber: "1", roster: [row(0), row(1, { scanned: "flag" })], binMap: null, closedBins: [],
      flags: [{ id: 5, match: { number: "99", name: "STRAY", size: "A-M" }, reason: "Not on the roster — #99 A-M", timestamp: "2026-11-24 09:00:00" }] };
    const s = orderSummary(p);
    expect(s.failed.map(f => [f.number, f.reason])).toEqual([["2", "flagged"]]);
    expect(s.extra.map(f => f.number)).toEqual(["99"]);
    expect(s.counts).toMatchObject({ total: 2, passed: 1, failed: 1, extra: 1, missing: 0 });
    const jobs = summaryJobs(p);
    expect(jobs[0].items.map(i => i.text)).toEqual(["#2 P1 Navy A-L: flagged", "#99 STRAY A-M: Not on the roster — #99 A-M"]);
    expect(binListZPL(jobs[1])).toContain("^FDSUMMARY   2 jerseys   +1 extra^FS");   // the extra on the SUMMARY line, so the tally keeps its size
    expect(binListZPL(jobs[1])).toContain("^FD1 passed   1 failed   0 missing^FS");
  });
});

describe("second review, 24 Nov 2026", () => {
  it("a duplicate flagged from the ALREADY DONE screen is an extra: its row stays passed", () => {
    const p = { orderNumber: "1", roster: [row(0), row(1)], binMap: null, closedBins: [],
      flags: [{ id: 7, match: row(1), reason: "Duplicate — scanned again after passing", timestamp: "2026-11-24 09:00:00" }] };
    const s = orderSummary(p);
    expect(s.failed).toEqual([]);
    expect(s.extra.map(x => [x.number, x.name, x.size, x.reason])).toEqual([["2", "P1", "A-L", "Duplicate — scanned again after passing"]]);
    expect(s.counts).toMatchObject({ passed: 2, failed: 0, extra: 1 });
    expect(orderSummary({ ...p, flags: [{ ...p.flags[0], resolution: "ok" }] }).extra).toEqual([]);   // resolved by the supervisor: out
  });
  it("a long NOT IN BOX title is cut with … rather than shrunk below two thirds of the header", () => {
    const p = { ...pack, roster: roster.map((x, i) => i === 6 ? { ...x, scanned: "missing" } : x), binMap: { ...pack.binMap } };
    const z = binListZPL(notInBoxJobs(p, "2.1", "Thunder Bay Lakehead Lightning U13 AA")[0]);
    const headLine = z.split("\n").find(l => l.includes("NOT IN BOX"));
    expect(parseInt(headLine.match(/\^A0N,(\d+)/)[1], 10)).toBeGreaterThanOrEqual(14);   // about two thirds of the 22-dot header
    expect(headLine).toMatch(/…\^FS$/);
    const short = binListZPL(notInBoxJobs(p, "2.1", "Red")[0]).split("\n").find(l => l.includes("NOT IN BOX"));
    expect(short).toContain("^FDNOT IN BOX 2.1 Red^FS");
    // A title that fits at that height once the letters are squeezed is not cut (the third check, 24 Nov 2026).
    const nine = binListZPL(notInBoxJobs(p, "2.1", "Lightning")[0]).split("\n").find(l => l.includes("NOT IN BOX"));
    expect(nine).toContain("^FDNOT IN BOX 2.1 Lightning^FS");
    expect(parseInt(nine.match(/\^A0N,(\d+)/)[1], 10)).toBeGreaterThanOrEqual(14);
    // Whatever the title's length, a cut one prints at the floor or above (the fourth check, 24 Nov 2026: the
    // test skipped the printer's flooring of the width setting and most cut titles came out at 12 dots).
    for (const team of ["Wolverine Ladies Wolverine Ladies", "Mississauga North Stars Peewee AA", "Thunder Bay Lakehead Lightning U13 AA Girls", "ABCDEFGHIJKLMNOPQRSTUVWXYZ ABCDEFGHIJ"]) {
      const hl = binListZPL(notInBoxJobs(p, "2.1", team)[0]).split("\n").find(l => l.includes("NOT IN BOX"));
      expect(parseInt(hl.match(/\^A0N,(\d+)/)[1], 10), team).toBeGreaterThanOrEqual(14);
      expect(hl, team).toMatch(/…\^FS$/);
    }
  });
});

describe("third check, 24 Nov 2026", () => {
  // Navy: #1, #2 passed and in 1.1, closed with nothing left to scan (so 1.2 is open and empty);
  // #3 flagged. Red: #4 flagged, #5 marked missing: nothing ever went in a box, 2.1 is open and empty.
  const rows = [row(0), row(1), row(2, { scanned: "flag" }), row(3, { team: "Red", scanned: "flag" }), row(4, { team: "Red", scanned: "missing" })];
  const map  = buildBinMap(rows, {}, "team");
  const c    = closeBin(rows, map, [], "1.1", 1000);
  const flags = [{ id: 1, match: rows[2], reason: "Hole or snag", timestamp: "2026-11-24 09:00:00" }, { id: 2, match: rows[3], reason: "Twill peeling", timestamp: "2026-11-24 09:01:00" }];
  const p = (notIn) => ({ orderNumber: "5", roster: rows, binMap: c.binMap, closedBins: c.closed.map(x => notIn === undefined ? x : { ...x, notIn }), flags });
  const heads = labels => labels.map(l => l.title ? "count" : l.head || "rows");
  it("Finish order: an empty box after a closed one prints nothing when Box full printed the same list", () => {
    expect(c.newBin).toBe("1.2");
    expect(finishNotInBoxJobs(p([2]), "1.2", "Navy", 0)).toEqual([]);
  });
  it("…and the whole list again, under the CLOSED box's name, when it changed since or was never printed", () => {
    expect(heads(finishNotInBoxJobs(p([]), "1.2", "Navy", 0))).toEqual(["NOT IN BOX 1.1 Navy"]);   // #3 was flagged after 1.1 closed with nothing short
    expect(finishNotInBoxJobs(p([]), "1.2", "Navy", 0)[0].items.map(i => i.text)).toEqual(["#3 P2 Navy A-L: flagged — Hole or snag"]);
    expect(heads(finishNotInBoxJobs(p(undefined), "1.2", "Navy", 0))).toEqual(["NOT IN BOX 1.1 Navy"]);   // closed before the record existed
    expect(finishNotInBoxJobs(p([2]), "1.2", "Navy", 0)).toEqual([]);
  });
  it("an empty open box with no closed box before it lists its team under its own name; a box with jerseys in it is the last box", () => {
    expect(heads(finishNotInBoxJobs(p([2]), "2.1", "Red", 0))).toEqual(["NOT IN BOX 2.1 Red"]);
    expect(finishNotInBoxJobs(p([2]), "2.1", "Red", 0)[0].count).toBe(2);
    expect(heads(finishNotInBoxJobs(pack, "2.1", "Red", 1))).toEqual(["NOT IN BOX 2.1 Red"]);   // the fixture's Red box has #5 in it
  });
  it("the Print menu agrees: every box list names the closed last box and the lone empty box, never the empty next box", () => {
    expect(heads(boxListJobs(p([2])))).toEqual(["NOT IN BOX 1.1 Navy", "rows", "count", "NOT IN BOX 2.1 Red"]);
    expect(heads(boxListJobs(p([2]), "1.2"))).toEqual([]);
    expect(heads(boxListJobs(p([2]), "2.1"))).toEqual(["NOT IN BOX 2.1 Red"]);
  });
  it("a duplicate copy stays in the DAMAGED box and the summary when its row is later flagged itself", () => {
    const r = [row(0), row(1, { scanned: "flag" })];
    const q = { orderNumber: "1", roster: r, binMap: null, closedBins: [], flags: [
      { id: 7, match: r[1], reason: "Duplicate — scanned again after passing", timestamp: "2026-11-24 09:00:00" },
      { id: 8, match: r[1], reason: "Hole or snag", timestamp: "2026-11-24 10:00:00" }] };
    expect(damagedItems(q).map(x => [x._id, x.reason])).toEqual([[1, "Hole or snag"], [undefined, "Duplicate — scanned again after passing"]]);
    const s = orderSummary(q);
    expect(s.failed.map(x => x.reason)).toEqual(["Hole or snag"]);
    expect(s.extra.map(x => x.reason)).toEqual(["Duplicate — scanned again after passing"]);
    expect(s.counts).toMatchObject({ failed: 1, extra: 1 });
  });
});
