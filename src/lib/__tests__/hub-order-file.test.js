// An unfinished order's file that does not parse (code review, 23 Nov 2026):
// reading it gives nothing (the station rebuilds the order from the ledger),
// and parking the order again keeps the bad file aside instead of writing
// over it, as the hub does with its own data file.
import { describe, it, expect, vi } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { EventEmitter } from "node:events";
import { createHub } from "../../../hub-plugin.js";

function makeHub() {
  const file = path.join(os.tmpdir(), `hub-orderfile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}.json`);
  const hub = createHub({ file, now: () => 1_700_000_000_000 });
  const call = (method, url, body) => new Promise(resolve => {
    const req = new EventEmitter(); req.method = method; req.url = url;
    const res = { statusCode: 200, setHeader() {}, end(s) { resolve({ status: res.statusCode, body: JSON.parse(s) }); } };
    hub.handle(req, res);
    if (body !== undefined) req.emit("data", JSON.stringify(body));
    req.emit("end");
  });
  const orderDir = path.join(path.dirname(file), path.basename(file, ".json") + "-orders");
  return { call, orderDir, orderFile: id => path.join(orderDir, id + ".json") };
}

const park = extra => ({ station: "st-station1", order: "264247", run: 1000, total: 2, done: 1, toScan: 1, out: [{ rowId: 2, number: "9", status: "todo" }], ...extra });
const session = { orderNumber: "264247", roster: [{ _id: 1, number: "7", scanned: "pass" }] };

describe("an order file that does not parse", () => {
  it("is read as no order, and is left where it is", async () => {
    const { call, orderFile } = makeHub();
    const { id } = (await call("POST", "/unfinished", park({ session }))).body;
    fs.writeFileSync(orderFile(id), '{"orderNumber":"2642');   // cut short
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await call("GET", `/unfinished/${id}/order`)).status).toBe(404);
    err.mockRestore();
    expect(fs.readFileSync(orderFile(id), "utf8")).toBe('{"orderNumber":"2642');
  });
  it("parked again, the bad file is kept aside as .unreadable-<time> and the new order written", async () => {
    const { call, orderDir, orderFile } = makeHub();
    const { id } = (await call("POST", "/unfinished", park({ session }))).body;
    fs.writeFileSync(orderFile(id), '{"orderNumber":"2642');
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const again = await call("POST", "/unfinished", park({ id, session: { ...session, orderRun: 2000 } }));
    expect(again.status).toBe(200);
    expect(err.mock.calls.some(([m]) => /could not be read; kept as .*\.unreadable-/.test(m))).toBe(true);
    err.mockRestore();
    const aside = fs.readdirSync(orderDir).filter(f => f.startsWith(id + ".json.unreadable-"));
    expect(aside.length).toBe(1);
    expect(fs.readFileSync(path.join(orderDir, aside[0]), "utf8")).toBe('{"orderNumber":"2642');
    expect(JSON.parse(fs.readFileSync(orderFile(id), "utf8")).orderRun).toBe(2000);
  });
  it("a good file is written over with nothing kept aside", async () => {
    const { call, orderDir } = makeHub();
    const { id } = (await call("POST", "/unfinished", park({ session }))).body;
    await call("POST", "/unfinished", park({ id, session: { ...session, orderRun: 2000 } }));
    expect(fs.readdirSync(orderDir).filter(f => f.includes("unreadable"))).toEqual([]);
  });
});
