// The hub's routes, driven with fake requests: one station per order, and one
// ledger record per run of an order (the order started again by mistake must
// not overwrite the finished one).
import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { createHub } from "../../../hub-plugin.js";

function makeHub() {
  let t = 1_700_000_000_000;
  const hub = createHub({ file: path.join(os.tmpdir(), `hub-routes-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}.json`), now: () => t });
  const call = (method, url, body) => new Promise(resolve => {
    const req = new EventEmitter(); req.method = method; req.url = url;
    const res = { statusCode: 200, setHeader() {}, end(s) { resolve({ status: res.statusCode, body: JSON.parse(s) }); } };
    hub.handle(req, res);
    if (body !== undefined) req.emit("data", JSON.stringify(body));
    req.emit("end");
  });
  return { call, tick: ms => { t += ms; }, state: hub.state };
}

const rows = [{ _id: 1, name: "SMITH", number: "7" }, { _id: 2, name: "JONES", number: "9" }];
const report = (order, run, remaining, extra = {}) => ({ operatorName: "Pat", orderNumber: order, orderRun: run, counts: { total: 2, remaining, pass: 2 - remaining }, rows, events: [], attention: [], ...extra });

describe("one station per order", () => {
  it("the first station takes a sent roster; a second gets 409 and who has it", async () => {
    const { call } = makeHub();
    const { body: { id } } = await call("POST", "/rosters", { orderNumber: "264247", rows, by: "Sam" });
    expect((await call("POST", `/rosters/${id}/take`, { station: "st-station1", operator: "Pat" })).status).toBe(200);
    const second = await call("POST", `/rosters/${id}/take`, { station: "st-station2", operator: "Lee" });
    expect(second.status).toBe(409);
    expect(second.body.takenBy).toMatchObject({ station: "st-station1", operator: "Pat" });
    const list = (await call("GET", "/rosters")).body.rosters;
    expect(list[0].takenBy.station).toBe("st-station1");
  });
  it("the same station may take it again (page reloaded)", async () => {
    const { call } = makeHub();
    const { body: { id } } = await call("POST", "/rosters", { orderNumber: "1", rows });
    await call("POST", `/rosters/${id}/take`, { station: "st-a", operator: "Pat" });
    expect((await call("POST", `/rosters/${id}/take`, { station: "st-a", operator: "Kim" })).status).toBe(200);
  });
  it("the supervisor's Release lets another station take it", async () => {
    const { call } = makeHub();
    const { body: { id } } = await call("POST", "/rosters", { orderNumber: "1", rows });
    await call("POST", `/rosters/${id}/take`, { station: "st-a", operator: "Pat" });
    expect((await call("POST", `/rosters/${id}/release`)).status).toBe(200);
    expect((await call("POST", `/rosters/${id}/take`, { station: "st-b", operator: "Lee" })).status).toBe(200);
  });
  it("a finished order's roster is removed and no longer offered", async () => {
    const { call } = makeHub();
    const { body: { id } } = await call("POST", "/rosters", { orderNumber: "1", rows });
    await call("POST", `/rosters/${id}/take`, { station: "st-a", operator: "Pat" });
    await call("DELETE", `/rosters/${id}`);
    expect((await call("GET", "/rosters")).body.rosters).toEqual([]);
    expect((await call("POST", `/rosters/${id}/take`, { station: "st-b" })).status).toBe(404);
  });
});

describe("one ledger record per run of an order", () => {
  it("the same order started again does not overwrite the finished record", async () => {
    const { call, tick } = makeHub();
    await call("POST", "/stations/st-a", report("264247", 1000, 2));
    tick(60000);
    await call("POST", "/stations/st-a", report("264247", 1000, 0));            // finished: 2 / 2
    tick(60000);
    await call("POST", "/stations/st-a", report("", 0, 0, { counts: { total: 0, remaining: 0 }, rows: [] }));   // Finish order: waiting
    tick(60000);
    await call("POST", "/stations/st-a", report("264247", 2000, 2));            // started again by mistake
    const { orders } = (await call("GET", "/ledger")).body;
    const runs = orders.filter(o => o.station === "st-a" && o.order === "264247").sort((a, b) => a.run - b.run);
    expect(runs.length).toBe(2);
    expect(runs[0]).toMatchObject({ run: 1000, counts: { remaining: 0 } });
    expect(runs[1]).toMatchObject({ run: 2000, counts: { remaining: 2 } });
  });
  it("the day tally keeps the finished order's jerseys when it is started again", async () => {
    const { call, tick } = makeHub();
    await call("POST", "/stations/st-a", report("5", 1000, 2));
    tick(1000); await call("POST", "/stations/st-a", report("5", 1000, 0));
    tick(1000); await call("POST", "/stations/st-a", report("5", 2000, 2));
    const st = (await call("GET", "/stations")).body.stations[0];
    expect(st.day.done).toBe(2);
  });
  it("a report of the same run updates the one record", async () => {
    const { call, tick } = makeHub();
    await call("POST", "/stations/st-a", report("5", 1000, 2));
    tick(1000); await call("POST", "/stations/st-a", report("5", 1000, 1));
    const { orders } = (await call("GET", "/ledger")).body;
    expect(orders.length).toBe(1);
    expect(orders[0].counts.remaining).toBe(1);
  });
  it("a station from before runs existed (no orderRun) still keeps one record", async () => {
    const { call, tick } = makeHub();
    await call("POST", "/stations/st-a", report("5", undefined, 2));
    tick(1000); await call("POST", "/stations/st-a", report("5", undefined, 0));
    const { orders } = (await call("GET", "/ledger")).body;
    expect(orders.length).toBe(1);
    expect(orders[0].run).toBe(0);
  });
});
