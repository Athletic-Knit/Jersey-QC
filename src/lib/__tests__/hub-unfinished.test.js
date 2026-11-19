// Unfinished orders on the hub (the owner, 19 Nov 2026): a station parks an
// order that cannot be finished yet, the board lists it, gives it to a
// station and checks off the jerseys still out. Driven with fake requests.
import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { createHub } from "../../../hub-plugin.js";

function makeHub(opts = {}) {
  let t = 1_700_000_000_000;
  const hub = createHub({ file: path.join(os.tmpdir(), `hub-unfinished-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}.json`), now: () => t, ...opts });
  const call = (method, url, body) => new Promise(resolve => {
    const req = new EventEmitter(); req.method = method; req.url = url;
    const res = { statusCode: 200, setHeader() {}, end(s) { resolve({ status: res.statusCode, body: JSON.parse(s) }); } };
    hub.handle(req, res);
    if (body !== undefined) req.emit("data", JSON.stringify(body));
    req.emit("end");
  });
  return { call, tick: ms => { t += ms; }, now: () => t, state: hub.state };
}

const DAY = 86400000;
const out = [
  { rowId: 2, number: "9", name: "JONES", size: "A-L", team: "Navy", status: "flag", reason: "Twill peeling" },
  { rowId: 3, number: "11", name: "BROWN", size: "A-M", team: "Navy", status: "missing", reason: "" },
  { rowId: 4, number: "12", name: "WHITE", size: "A-S", team: "Navy", status: "todo", reason: "" },
];
const park = (extra = {}) => ({ station: "st-station1", order: "264247", run: 1000, operator: "Pat", jerseyType: "echl", total: 4, done: 1, flagged: 1, missing: 1, toScan: 1, out, ...extra });

describe("parking an unfinished order", () => {
  it("a parked order is listed, with the entry's whole shape", async () => {
    const { call, now } = makeHub();
    const r = await call("POST", "/unfinished", park());
    expect(r.status).toBe(200);
    expect(r.body.id).toBeTruthy();
    expect(r.body.entry).toEqual({
      id: r.body.id, key: "st-station1|264247|1000", order: "264247", run: 1000, station: "st-station1", operator: "Pat", jerseyType: "echl", kind: "",
      parkedAt: now(), updatedAt: now(), total: 4, done: 1, flagged: 1, missing: 1, toScan: 1, out,
      assignedTo: "", assignedBy: "", assignedAt: 0, checkedOff: [], closed: null,
    });
    const { orders } = (await call("GET", "/unfinished")).body;
    expect(orders.map(o => o.id)).toEqual([r.body.id]);
  });
  it("parking the same station|order|run again updates the one entry and keeps its id", async () => {
    const { call, tick, state } = makeHub();
    const first = (await call("POST", "/unfinished", park())).body;
    tick(60000);
    const again = (await call("POST", "/unfinished", park({ done: 2, toScan: 0, out: out.slice(0, 2) }))).body;
    expect(again.id).toBe(first.id);
    expect(again.entry.parkedAt).toBe(first.entry.parkedAt);
    expect(again.entry.updatedAt).toBe(first.entry.updatedAt + 60000);
    expect(again.entry.out.length).toBe(2);
    expect(Object.keys(state().unfinished)).toEqual([first.id]);
    // another run of the same order is its own entry
    await call("POST", "/unfinished", park({ run: 2000 }));
    expect(Object.keys(state().unfinished).length).toBe(2);
  });
  it("newest change first; search by the exact number, or a part of it from 3 characters", async () => {
    const { call, tick } = makeHub();
    await call("POST", "/unfinished", park({ order: "264247" }));
    tick(1000); await call("POST", "/unfinished", park({ order: "1264247" }));
    tick(1000); await call("POST", "/unfinished", park({ order: "555" }));
    expect((await call("GET", "/unfinished")).body.orders.map(o => o.order)).toEqual(["555", "1264247", "264247"]);
    expect((await call("GET", "/unfinished?q=264247")).body.orders.map(o => o.order)).toEqual(["264247", "1264247"]);   // exact first
    expect((await call("GET", "/unfinished?q=642")).body.orders.map(o => o.order)).toEqual(["1264247", "264247"]);
    expect((await call("GET", "/unfinished?q=55")).body.orders).toEqual([]);                                            // 2 characters: exact only
    expect((await call("GET", "/unfinished?q=555")).body.orders.map(o => o.order)).toEqual(["555"]);
  });
  it("the station filter takes the station's own and the ones given to it", async () => {
    const { call } = makeHub();
    const a = (await call("POST", "/unfinished", park({ station: "st-station1", order: "1" }))).body.id;
    const b = (await call("POST", "/unfinished", park({ station: "st-station2", order: "2" }))).body.id;
    await call("POST", "/unfinished", park({ station: "st-station3", order: "3" }));
    await call("POST", `/unfinished/${b}/assign`, { station: "st-station1", by: "Sam" });
    const mine = (await call("GET", "/unfinished?station=st-station1")).body.orders.map(o => o.id).sort();
    expect(mine).toEqual([a, b].sort());
    expect((await call("GET", "/unfinished?station=st-station2")).body.orders.map(o => o.id)).toEqual([b]);
  });
  it("assign and release", async () => {
    const { call, now } = makeHub();
    const { id } = (await call("POST", "/unfinished", park())).body;
    const given = await call("POST", `/unfinished/${id}/assign`, { station: "st-station2", by: "Sam" });
    expect(given.status).toBe(200);
    expect(given.body.entry).toMatchObject({ assignedTo: "st-station2", assignedBy: "Sam", assignedAt: now() });
    const freed = await call("POST", `/unfinished/${id}/release`);
    expect(freed.body.entry).toMatchObject({ assignedTo: "", assignedBy: "", assignedAt: 0 });
    // parked again, an assignment is kept
    await call("POST", `/unfinished/${id}/assign`, { station: "st-station3", by: "Sam" });
    expect((await call("POST", "/unfinished", park())).body.entry.assignedTo).toBe("st-station3");
  });
});

describe("checking off the jerseys still out", () => {
  const rows = [
    { _id: 1, number: "7", name: "SMITH", scanned: "pass" },
    { _id: 2, number: "9", name: "JONES", scanned: "flag" },
    { _id: 3, number: "11", name: "BROWN", scanned: "missing" },
    { _id: 4, number: "12", name: "WHITE", scanned: false },
  ];
  const report = { operatorName: "Pat", orderNumber: "264247", orderRun: 1000, counts: { total: 4, pass: 1, flag: 1, manual: 0, missing: 1, short: 0, remaining: 1 }, rows, events: [], attention: [] };

  it("some, then all: the counts move, then the order closes and leaves the default list", async () => {
    const { call, tick, now } = makeHub();
    const { id } = (await call("POST", "/unfinished", park())).body;
    tick(1000);
    const some = await call("POST", `/unfinished/${id}/checkoff`, { ids: [2, 4], by: "Sam" });
    expect(some.status).toBe(200);
    expect(some.body.entry).toMatchObject({ done: 3, flagged: 0, missing: 1, toScan: 0, closed: null });
    expect(some.body.entry.out.map(j => j.rowId)).toEqual([3]);
    expect(some.body.entry.checkedOff.map(j => [j.rowId, j.by, j.at])).toEqual([[2, "Sam", now()], [4, "Sam", now()]]);
    expect((await call("GET", "/unfinished")).body.orders.length).toBe(1);
    tick(1000);
    const rest = await call("POST", `/unfinished/${id}/checkoff`, { all: true, by: "Sam" });
    expect(rest.body.entry).toMatchObject({ done: 4, flagged: 0, missing: 0, toScan: 0, out: [], closed: { by: "Sam", at: now() } });
    expect((await call("GET", "/unfinished")).body.orders).toEqual([]);
    const withClosed = (await call("GET", "/unfinished?all=1&station=st-station1")).body.orders;
    expect(withClosed.map(o => o.id)).toEqual([id]);
    expect(withClosed[0].checkedOff.length).toBe(3);
  });
  it("a jersey checked off stays checked off when the station parks the order again without knowing", async () => {
    const { call } = makeHub();
    const { id } = (await call("POST", "/unfinished", park())).body;
    await call("POST", `/unfinished/${id}/checkoff`, { ids: [4], by: "Sam" });
    const again = (await call("POST", "/unfinished", park())).body.entry;
    expect(again.out.map(j => j.rowId)).toEqual([2, 3]);
    expect(again).toMatchObject({ done: 2, toScan: 0, flagged: 1, missing: 1 });
  });
  it("the ledger's order record passes those rows, and today gets one event a jersey", async () => {
    const { call, tick, now, state } = makeHub();
    await call("POST", "/stations/st-station1", report);
    tick(3 * DAY);                                             // checked off days later
    const { id } = (await call("POST", "/unfinished", park())).body;
    await call("POST", `/unfinished/${id}/checkoff`, { ids: [2, 4], by: "Sam" });
    const led = state().ledger;
    const recDay = Object.keys(led).sort()[0];
    const rec = Object.values(led[recDay].orders)[0];
    expect(rec.rows.map(r => [r._id, r.scanned, r.checkedBy])).toEqual([[1, "pass", undefined], [2, "pass", "supervisor"], [3, "missing", undefined], [4, "pass", "supervisor"]]);
    expect(rec.counts).toMatchObject({ total: 4, pass: 3, flag: 0, missing: 1, remaining: 0 });
    const today = new Date(now()).toLocaleDateString("en-CA");
    expect(today).not.toBe(recDay);
    const { events } = (await call("GET", "/ledger")).body;
    expect(events.length).toBe(2);
    expect(events[0]).toMatchObject({ id: `co-2-${now()}`, status: "pass", order: "264247", run: 1000, station: "st-station1", rowId: 2, number: "9", name: "JONES", size: "A-L", team: "Navy", reason: "Checked off by supervisor", resolution: "Checked off by supervisor (Sam)", operator: "Sam" });
    expect(events[0].t).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/);
    expect(events[0].t.slice(0, 10)).toBe(today);
    expect(Object.keys(led[today].events)).toEqual([`st-station1|co-2-${now()}`, `st-station1|co-4-${now()}`]);
  });
  it("without a name the resolution has no brackets", async () => {
    const { call } = makeHub();
    const { id } = (await call("POST", "/unfinished", park())).body;
    await call("POST", `/unfinished/${id}/checkoff`, { ids: [3] });
    const { events } = (await call("GET", "/ledger")).body;
    expect(events[0].resolution).toBe("Checked off by supervisor");
  });
});

describe("taking an unfinished order off the list", () => {
  it("DELETE removes it", async () => {
    const { call } = makeHub();
    const { id } = (await call("POST", "/unfinished", park())).body;
    expect((await call("DELETE", `/unfinished/${id}`)).status).toBe(200);
    expect((await call("GET", "/unfinished?all=1")).body.orders).toEqual([]);
  });
  it("an entry goes 90 days after its last change", async () => {
    const { call, tick, state } = makeHub();
    const old = (await call("POST", "/unfinished", park({ order: "1" }))).body.id;
    tick(30 * DAY);
    const kept = (await call("POST", "/unfinished", park({ order: "2" }))).body.id;
    tick(61 * DAY);                                            // 91 days after the first, 61 after the second
    expect((await call("GET", "/unfinished?all=1")).body.orders.map(o => o.id)).toEqual([kept]);
    expect(state().unfinished[old]).toBeUndefined();
  });
  it("404 for an unknown id, 400 without station or order", async () => {
    const { call } = makeHub();
    expect((await call("POST", "/unfinished/nope/assign", { station: "st-a" })).status).toBe(404);
    expect((await call("POST", "/unfinished/nope/release")).status).toBe(404);
    expect((await call("POST", "/unfinished/nope/checkoff", { all: true })).status).toBe(404);
    expect((await call("POST", "/unfinished", park({ station: "" }))).status).toBe(400);
    expect((await call("POST", "/unfinished", park({ order: " " }))).status).toBe(400);
    const { id } = (await call("POST", "/unfinished", park())).body;
    expect((await call("POST", `/unfinished/${id}/assign`, { by: "Sam" })).status).toBe(400);
  });
});
