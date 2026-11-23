// Phase 2 of the code review of 23 Nov 2026: the reports and the supervisor
// board must count every scan once and say the truth about an order. One block
// per finding (M5–M12). If one of these fails, a report is counting wrong again.
import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { createHub, normaliseLedger, eventKey } from "../../../hub-plugin.js";
import { stationUse, snapshotOf } from "../hub.js";
import { applyCheckOff } from "../orderstore.js";
import { ofRun, pickRun, orderDone, eventsAsLog } from "../ledgerview.js";
import { buildOrderSummarySheet, buildDaySheets } from "../export.js";

const p2 = n => String(n).padStart(2, "0");
const stamp = ms => { const d = new Date(ms); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`; };
const dayOf = ms => stamp(ms).slice(0, 10);

function makeHub(start) {
  let t = start ?? new Date(2026, 10, 23, 10, 0, 0).getTime();   // 23 Nov 2026, 10:00 local
  const file = path.join(os.tmpdir(), `hub-reports-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}.json`);
  const hub = createHub({ file, now: () => t });
  const call = (method, url, body) => new Promise(resolve => {
    const req = new EventEmitter(); req.method = method; req.url = url;
    const res = { statusCode: 200, setHeader() {}, end(s) { resolve({ status: res.statusCode, body: JSON.parse(s) }); } };
    hub.handle(req, res);
    if (body !== undefined) req.emit("data", JSON.stringify(body));
    req.emit("end");
  });
  return { call, tick: ms => { t += ms; }, now: () => t, state: hub.state };
}
// A station's report: an order, its run, and its log as events.
const ev = (id, t, status = "pass", extra = {}) => ({ id, t: stamp(t), status, order: "264247", run: 1000, rowId: id, number: String(id), name: "", ...extra });
const report = (events, extra = {}) => ({ operatorName: "Pat", orderNumber: "264247", orderRun: 1000, counts: { total: 10, remaining: 10 - events.filter(e => e.status === "pass").length }, events, rows: [], ...extra });
const allEvents = state => Object.values(state().ledger).flatMap(d => Object.values(d.events || {}));

describe("M5: every scan is in the ledger once, under its own day", () => {
  it("an order that runs past midnight: yesterday's scans stay on yesterday and are not counted again today", async () => {
    const { call, tick, now, state } = makeHub(new Date(2026, 10, 22, 23, 58, 0).getTime());
    const yesterday = dayOf(now());
    const a = ev(1, now());
    await call("POST", "/stations/st-station1", report([a]));
    tick(5 * 60000);   // 00:03 on the 23rd
    const b = ev(2, now());
    await call("POST", "/stations/st-station1", report([a, b]));
    const led = state().ledger;
    expect(Object.values(led[yesterday].events).map(e => e.id)).toEqual([1]);
    expect(Object.values(led[dayOf(now())].events).map(e => e.id)).toEqual([2]);
    expect(allEvents(state).length).toBe(2);
  });
  it("a parked order picked up at another station: its old scans are not counted again, and keep the station that scanned them", async () => {
    const { call, tick, now, state } = makeHub();
    const a = ev(1, now()), b = ev(2, now() + 1000);
    await call("POST", "/stations/st-station1", report([a, b]));
    tick(3600000);
    const c = ev(3, now());
    const r = await call("POST", "/stations/st-station2", report([a, b, c]));
    expect(r.status).toBe(200);
    const evs = allEvents(state);
    expect(evs.map(e => e.id).sort()).toEqual([1, 2, 3]);
    expect(evs.find(e => e.id === 1).station).toBe("st-station1");
    expect(evs.find(e => e.id === 3).station).toBe("st-station2");
    // the day tally: station 2 did one jersey, not three
    const st = (await call("GET", "/stations")).body.stations;
    expect(st.find(s => s.id === "st-station2").day.done).toBe(1);
    // the day sheet counts three passes
    const day = (await call("GET", "/ledger")).body;
    expect(buildDaySheets(day).summary[2][5]).toBe(3);
  });
  it("a supervisor's check-off is one pass, also once the station has opened the order and re-sends it", async () => {
    const { call, tick, state } = makeHub();
    const park = { station: "st-station1", order: "264247", run: 1000, operator: "Pat", total: 2, done: 1, flagged: 0, missing: 0, toScan: 1,
      out: [{ rowId: 2, number: "9", name: "JONES", size: "A-L", team: "Navy", status: "todo" }] };
    const { id } = (await call("POST", "/unfinished", park)).body;
    tick(60000);
    const entry = (await call("POST", `/unfinished/${id}/checkoff`, { all: true, by: "Sam" })).body.entry;
    const before = allEvents(state).filter(e => e.status === "pass").length;
    expect(before).toBe(1);
    // the station opens the order: applyCheckOff adds the line, and the station reports it
    const rec = applyCheckOff({ session: { roster: [{ _id: 1, number: "5", scanned: "pass" }, { _id: 2, number: "9", scanned: false }], log: [] } }, entry);
    const snap = snapshotOf({ operatorName: "Kim", orderNumber: "264247", orderRun: 1000, roster: rec.session.roster, log: rec.session.log, binMap: null });
    tick(60000);
    await call("POST", "/stations/st-station2", { ...snap, rows: [] });
    expect(allEvents(state).filter(e => e.status === "pass").length).toBe(1);
  });
  it("the old filing is put right when the hub starts: copies merged, each on its own day, the first station and the photo kept", () => {
    const d1 = "2026-11-22", d2 = "2026-11-23";
    const led = {
      [d1]: { orders: {}, events: {
        "st-station1|5": { id: 5, run: 1000, order: "264247", t: "2026-11-22 23:59:00", status: "flagged", station: "st-station1", photo: "data:a" },
      } },
      [d2]: { orders: {}, events: {
        "st-station1|5": { id: 5, run: 1000, order: "264247", t: "2026-11-22 23:59:00", status: "flagged", station: "st-station1", resolution: "Accepted" },
        "st-station2|5": { id: 5, run: 1000, order: "264247", t: "2026-11-22 23:59:00", status: "flagged", station: "st-station2" },
        "st-station2|6": { id: 6, run: 1000, order: "264247", t: "2026-11-23 08:00:00", status: "pass", station: "st-station2" },
      } },
    };
    expect(normaliseLedger(led)).toBe(2);
    expect(Object.keys(led[d1].events)).toEqual(["1000|5"]);
    expect(led[d1].events["1000|5"]).toMatchObject({ station: "st-station1", photo: "data:a", resolution: "Accepted" });
    expect(Object.keys(led[d2].events)).toEqual(["1000|6"]);
    expect(normaliseLedger(led)).toBe(0);   // run again, nothing changes
    expect(eventKey({ id: 7, order: "1", station: "st-x" })).toBe("st-x|1|7");   // before runs existed
  });
});

describe("M6: a resolved flag is still a flag in the reports", () => {
  it("the damage counts keep an accepted flag", () => {
    const log = [{ id: 1, status: "flagged", reason: "Holes", resolution: "Accepted — manually verified", outcome: "accepted", match: { _id: 1 }, timestamp: "2026-11-23 10:00:00" }];
    const sheet = buildOrderSummarySheet([{ _id: 1, number: "5", scanned: "pass" }], log);
    expect(sheet.find(r => r[0] === "Category")).toBeTruthy();
    expect(sheet.find(r => r[0] === "All flags")[1]).toBe(1);
  });
});

describe("M7: an order finished with jerseys not scanned is finished", () => {
  it("the hub keeps finishedAt from the station, keeps it when an older station says nothing, and drops it on Back to this order", async () => {
    const { call, tick, now, state } = makeHub();
    await call("POST", "/stations/st-station1", report([], { finishedAt: null }));
    tick(1000); const at = now();
    await call("POST", "/stations/st-station1", report([], { finishedAt: at }));
    const rec = () => Object.values(state().ledger[dayOf(now())].orders)[0];
    expect(rec().finishedAt).toBe(at);
    tick(1000); await call("POST", "/stations/st-station1", report([]));   // a station from before this change
    expect(rec().finishedAt).toBe(at);
    tick(1000); await call("POST", "/stations/st-station1", report([], { finishedAt: null }));
    expect(rec().finishedAt).toBe(null);
  });
  it("the board's rule", () => {
    expect(orderDone({ finishedAt: 5, counts: { total: 10, remaining: 5 } })).toBe(true);
    expect(orderDone({ counts: { total: 10, remaining: 5 } })).toBe(false);
    expect(orderDone({ counts: { total: 10, remaining: 0 } })).toBe(true);
    expect(orderDone({ counts: { total: 0, remaining: 0 } })).toBe(false);
  });
});

describe("M8: signing out keeps the station on the board", () => {
  it("the station is marked signed out, keeps its day tally and carried flags, is free at once, and its next report clears the mark", async () => {
    const { call, tick, now } = makeHub();
    await call("POST", "/stations/st-station1", report([ev(1, now())], { counts: { total: 10, remaining: 9 } }));
    tick(5000);
    await call("POST", "/stations/st-station1/signout");
    let s = (await call("GET", "/stations")).body;
    const st = s.stations.find(x => x.id === "st-station1");
    expect(st.signedOut).toMatchObject({ operator: "Pat" });
    expect(st.day.done).toBe(1);
    expect(stationUse(s)["st-station1"].live).toBe(false);
    tick(5000);
    await call("POST", "/stations/st-station1", report([ev(1, now())], { counts: { total: 10, remaining: 9 } }));
    s = (await call("GET", "/stations")).body;
    expect(s.stations[0].signedOut).toBeUndefined();
    expect(s.stations[0].day.done).toBe(1);
  });
});

describe("M9: correcting the order number is the same order", () => {
  it("one record under the new number, its start kept, the day tally not added again", async () => {
    const { call, tick, now, state } = makeHub();
    const evs = [ev(1, now()), ev(2, now()), ev(3, now())];
    await call("POST", "/stations/st-station1", report(evs, { orderNumber: "2", counts: { total: 10, remaining: 7 } }));
    const started = now();
    for (const n of ["26", "264", "2642", "26424", "264247"]) { tick(300); await call("POST", "/stations/st-station1", report(evs.map(e => ({ ...e, order: n })), { orderNumber: n, counts: { total: 10, remaining: 7 } })); }
    const orders = Object.values(state().ledger[dayOf(now())].orders);
    expect(orders.map(o => o.order)).toEqual(["264247"]);
    expect(orders[0].firstSeen).toBe(started);
    const st = (await call("GET", "/stations")).body.stations[0];
    expect(st.day.done).toBe(3);
    expect(allEvents(state).length).toBe(3);
    expect(allEvents(state).every(e => e.order === "264247")).toBe(true);
  });
  it("a new order started on the station (a new run) is a new record", async () => {
    const { call, tick, now, state } = makeHub();
    await call("POST", "/stations/st-station1", report([ev(1, now())], { counts: { total: 10, remaining: 9 } }));
    tick(1000);
    await call("POST", "/stations/st-station1", report([], { orderNumber: "264248", orderRun: 2000, counts: { total: 5, remaining: 5 } }));
    expect(Object.values(state().ledger[dayOf(now())].orders).map(o => o.order).sort()).toEqual(["264247", "264248"]);
  });
});

describe("M10: the board's order sheet keeps each event's status", () => {
  it("the Summary counts flags from the hub's events", () => {
    const events = [{ id: 1, t: "2026-11-23 10:00:00", status: "flagged", reason: "Holes", rowId: 1, order: "264247", run: 1000, station: "st-station1" },
      { id: 2, t: "2026-11-23 10:01:00", status: "flagged", offRoster: true, reason: "Not on the roster", order: "264247", run: 1000, station: "st-station1" }];
    const sheet = buildOrderSummarySheet([{ _id: 1, number: "5", scanned: "flag" }], eventsAsLog(events));
    expect(sheet.find(r => r[0] === "Sent to the supervisor")[1]).toBe(2);
    expect(sheet.find(r => r[0] === "All flags")[1]).toBe(2);
  });
});

describe("M12: Open order on a station card shows the run the station is on", () => {
  const runs = [{ run: 1000, lastSeen: 1 }, { run: 2000, lastSeen: 2 }];
  it("the run asked for, else the newest", () => {
    expect(pickRun(runs, 1000).run).toBe(1000);
    expect(pickRun(runs, 0).run).toBe(2000);
    expect(pickRun(runs).run).toBe(2000);
  });
  it("the events of a run, wherever they were scanned", () => {
    const rec = { station: "st-station2", order: "264247", run: 1000 };
    expect(ofRun(rec)({ station: "st-station1", order: "264247", run: 1000 })).toBe(true);
    expect(ofRun(rec)({ station: "st-station2", order: "264247", run: 2000 })).toBe(false);
    expect(ofRun({ station: "st-station2", order: "264247", run: 0 })({ station: "st-station1", order: "264247" })).toBe(false);
  });
});

describe("phase 2 review: a finished order stays decided across a reload", () => {
  it("a resumed order with finishedAt comes back on its done screen, and Finish later never parks it as finished", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync(new URL("../../App.jsx", import.meta.url), "utf8");
    const resume = src.slice(src.indexOf("const resumeSession = useCallback"), src.indexOf("const discardSession"));
    expect(resume).toMatch(/if \(s\.finishedAt\) setFinished\(/);
    const aside = src.slice(src.indexOf("const setAsideSaved = useCallback"), src.indexOf("const resetOrder = useCallback"));
    expect(aside).toMatch(/finishedAt: null/);
  });
});

describe("phase 2 review: an order looked up by number has the flags of its run, wherever they were scanned", () => {
  it("the Print menu's Another order lists a flag scanned at station 1 on the record station 2 kept", async () => {
    const { call, tick, now } = makeHub();
    const f = ev(1, now(), "flagged", { reason: "Holes" });
    await call("POST", "/stations/st-station1", report([f]));
    tick(60000);
    await call("POST", "/stations/st-station2", report([f, ev(2, now())]));
    const { orders } = (await call("GET", "/orders?q=264247")).body;
    expect(orders.find(o => o.station === "st-station2").flags.map(x => x.id)).toEqual([1]);
  });
});
