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
    expect(t).toMatchObject({ number: "6", name: "P5", tag: "STITCHER", reason: "Loose thread", team: "Red", bin: "2.1", orderNumber: "264247", station: "St 1", time: "10:15" });
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
