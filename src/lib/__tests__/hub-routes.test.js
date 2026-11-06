// The hub's routes, driven with fake requests: one station per order, and one
// ledger record per run of an order (the order started again by mistake must
// not overwrite the finished one).
import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { createHub } from "../../../hub-plugin.js";

function makeHub(opts = {}) {
  let t = 1_700_000_000_000;
  const hub = createHub({ file: path.join(os.tmpdir(), `hub-routes-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}.json`), now: () => t, ...opts });
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

// The bin labels: the hub finds the Zebra among the PC's print queues (or is
// told the queue by JERSEY_PRINTER), builds the ZPL and sends it raw. Both the
// queue list and the send are injected here.
describe("bin labels on the hub's printer", () => {
  const queues = [
    { name: "RICOH SP C360DNw", driver: "PCL6 V4 Driver for Universal Print", port: "WSD", status: 7 },
    { name: "ZDesigner ZD411-203dpi ZPL", driver: "ZDesigner ZD411-203dpi ZPL", port: "USB001", status: 0 },
  ];
  const labels = [{ bin: 1, label: "Navy", by: "team", count: 2, orderNumber: "264247" }, { bin: 2, label: "Red", by: "team", count: 1, orderNumber: "264247" }];
  const fakes = (list = queues) => {
    const printed = [];
    let lists = 0;
    return { printed, listsMade: () => lists, opts: { listPrinters: async () => { lists++; return list; }, print: async (printer, zpl) => { printed.push({ printer, zpl }); } } };
  };

  it("GET /print: the first Zebra queue, and every queue", async () => {
    const f = fakes();
    const { call } = makeHub(f.opts);
    const { status, body } = await call("GET", "/print");
    expect(status).toBe(200);
    expect(body.printer).toBe("ZDesigner ZD411-203dpi ZPL");
    expect(body.printers.map(p => p.name)).toEqual(["RICOH SP C360DNw", "ZDesigner ZD411-203dpi ZPL"]);
    expect(body.labelSize).toBe("1x0.5");
  });
  it("a queue matches on its driver too, and JERSEY_PRINTER wins over the search", async () => {
    const byDriver = makeHub(fakes([{ name: "Labels", driver: "Zebra ZPL", port: "USB001" }]).opts);
    expect((await byDriver.call("GET", "/print")).body.printer).toBe("Labels");
    const named = makeHub({ ...fakes().opts, printer: "RICOH SP C360DNw", labelSize: "4x6" });
    const { body } = await named.call("GET", "/print");
    expect(body.printer).toBe("RICOH SP C360DNw");
    expect(body.labelSize).toBe("4x6");
  });
  it("a station's own printer (JERSEY_PRINTER_STATION1) wins for that station only", async () => {
    const f = fakes();
    const { call } = makeHub({ ...f.opts, printers: { "st-station1": "\\\\AK-NB-164\\ZDesigner ZD411-203dpi ZPL", "st-station2": "" } });
    expect((await call("GET", "/print?station=st-station1")).body.printer).toBe("\\\\AK-NB-164\\ZDesigner ZD411-203dpi ZPL");
    expect((await call("GET", "/print?station=st-Station1")).body.printer).toBe("\\\\AK-NB-164\\ZDesigner ZD411-203dpi ZPL");   // the id's case does not matter
    expect((await call("GET", "/print?station=st-station2")).body.printer).toBe("ZDesigner ZD411-203dpi ZPL");         // the hub's own
    expect((await call("GET", "/print")).body.printer).toBe("ZDesigner ZD411-203dpi ZPL");
    await call("POST", "/print", { labels, station: "st-station1" });
    expect(f.printed[0].printer).toBe("\\\\AK-NB-164\\ZDesigner ZD411-203dpi ZPL");
  });
  it("a jersey sticker on a pass: kind jersey, the station's printer", async () => {
    const f = fakes();
    const { call } = makeHub(f.opts);
    const { status, body } = await call("POST", "/print", { kind: "jersey", station: "st-station1", labels: [{ bin: 3, by: "team", value: "Navy", orderNumber: "264247" }] });
    expect(status).toBe(200);
    expect(body).toEqual({ ok: true, printer: "ZDesigner ZD411-203dpi ZPL", count: 1 });
    const { zpl } = f.printed[0];
    expect(zpl).toContain("^PW203");
    expect(zpl).toContain("^LL102");
    expect(zpl).toContain("^FDBIN^FS");
    expect(zpl).toContain("^FD3^FS");
    expect(zpl).toContain("^FDTEAM^FS");
    expect(zpl).toContain("^FDNavy^FS");
    expect(zpl).toContain("^FDOrder 264247^FS");
    expect(zpl).not.toContain("^FDBIN 3^FS");   // not the bin-label layout
  });
  it("a flag ticket on a flag: kind flag, the station's printer", async () => {
    const f = fakes();
    const { call } = makeHub(f.opts);
    const { status, body } = await call("POST", "/print", { kind: "flag", station: "st-station1", labels: [{ number: "7", name: "SMITH", tag: "STITCHER", reason: "Loose stitching", team: "Navy", size: "A-L", bin: 2, orderNumber: "264247", station: "St 1", time: "14:05" }] });
    expect(status).toBe(200);
    expect(body).toEqual({ ok: true, printer: "ZDesigner ZD411-203dpi ZPL", count: 1 });
    const { zpl } = f.printed[0];
    expect(zpl).toContain("^FR^FDFLAG^FS");
    expect(zpl).toContain("^FR^FD7^FS");
    expect(zpl).toContain("^FDSTITCHER^FS");
    expect(zpl).not.toContain("^FDBIN^FS");    // not the sticker layout
  });
  it("no label printer: GET says null, POST says 503", async () => {
    const f = fakes([queues[0]]);
    const { call } = makeHub(f.opts);
    expect((await call("GET", "/print")).body.printer).toBeNull();
    const { status, body } = await call("POST", "/print", { labels });
    expect(status).toBe(503);
    expect(body.error).toBe("no label printer");
    expect(f.printed.length).toBe(0);
  });
  it("POST /print sends one ZPL block per label to the Zebra", async () => {
    const f = fakes();
    const { call } = makeHub(f.opts);
    const { status, body } = await call("POST", "/print", { labels });
    expect(status).toBe(200);
    expect(body).toEqual({ ok: true, printer: "ZDesigner ZD411-203dpi ZPL", count: 2 });
    expect(f.printed.length).toBe(1);
    expect(f.printed[0].printer).toBe("ZDesigner ZD411-203dpi ZPL");
    const { zpl } = f.printed[0];
    expect((zpl.match(/\^XA/g) || []).length).toBe(2);
    expect(zpl).toContain("^PW203");
    expect(zpl).toContain("^LL102");
    expect(zpl).toContain("^FDBIN 1^FS");
    expect(zpl).toContain("^FDNavy^FS");
    expect(zpl).toContain("^FDBIN 2^FS");
    expect(zpl).toContain("Order 264247");
  });
  it("JERSEY_LABEL_SIZE sets the label's dots", async () => {
    const f = fakes();
    const { call } = makeHub({ ...f.opts, labelSize: "4x6" });
    await call("POST", "/print", { labels });
    expect(f.printed[0].zpl).toContain("^PW812");
    expect(f.printed[0].zpl).toContain("^LL1218");
  });
  it("POST without labels is a 400; a failed send is a 502 with the reason", async () => {
    const f = fakes();
    const { call } = makeHub({ ...f.opts, print: async () => { throw new Error("OpenPrinter failed (1801)"); } });
    expect((await call("POST", "/print", {})).status).toBe(400);
    expect((await call("POST", "/print", { labels: [] })).status).toBe(400);
    const { status, body } = await call("POST", "/print", { labels });
    expect(status).toBe(502);
    expect(body.error).toContain("OpenPrinter failed");
  });
  it("the queue list is kept for a minute", async () => {
    const f = fakes();
    const { call, tick } = makeHub(f.opts);
    await call("GET", "/print"); await call("GET", "/print"); await call("POST", "/print", { labels });
    expect(f.listsMade()).toBe(1);
    tick(61000);
    await call("GET", "/print");
    expect(f.listsMade()).toBe(2);
  });
  it("a PC whose queues cannot be listed has no label printer, and the hub keeps working", async () => {
    const { call } = makeHub({ listPrinters: async () => { throw new Error("powershell not found"); }, print: async () => {} });
    expect((await call("GET", "/print")).body).toMatchObject({ printer: null, printers: [] });
    expect((await call("POST", "/print", { labels })).status).toBe(503);
    expect((await call("GET", "/rosters")).status).toBe(200);
  });
});
