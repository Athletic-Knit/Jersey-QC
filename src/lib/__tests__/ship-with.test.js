// Orders that ship together (the owner, 20 Nov 2026): the order form says which;
// boxes not full are left open for the ship-with order of the same team or customer.
import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { Buffer } from "node:buffer";
import { rowsToRoster, orderNumberOf, shipWithOf, orderList } from "../roster.js";
import { createHub } from "../../../hub-plugin.js";

describe("ship-with order numbers from the roster file", () => {
  it("a title row: this order's number and the ones it ships with, apart", () => {
    const r = rowsToRoster([["Order 264247   Ship with: 264248, 264249"], ["Name", "Number", "Team", "Size"], ["SMITH", "7", "Navy", "A-L"]]);
    expect(orderNumberOf(r)).toBe("264247");
    expect(shipWithOf(r)).toEqual(["264248", "264249"]);
  });
  it("\"Ship with order 264248\" alone is not this order's number", () => {
    const r = rowsToRoster([["Ships with order #264248 & 264250"], ["Name", "Number"], ["SMITH", "7"]]);
    expect(orderNumberOf(r)).toBe("");
    expect(shipWithOf(r)).toEqual(["264248", "264250"]);
  });
  it("a ship-with column, not kept as roster data", () => {
    const r = rowsToRoster([["Name", "Number", "Ship with"], ["SMITH", "7", "264248"], ["JONES", "9", "264248"]]);
    expect(shipWithOf(r)).toEqual(["264248"]);
    expect(Object.keys(r[0])).not.toContain("ship with");
  });
  it("none: an empty list", () => {
    expect(shipWithOf(rowsToRoster([["Name", "Number"], ["SMITH", "7"]]))).toEqual([]);
    expect(orderList("264248 / 264249 and 12")).toEqual(["264248", "264249"]);
  });
});

function makeHub() {
  let t = 1_700_000_000_000;
  const hub = createHub({ file: path.join(os.tmpdir(), `hub-openboxes-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}.json`), now: () => t, listPrinters: async () => [], print: async () => {} });
  const call = (method, url, body) => new Promise((resolve, reject) => {
    const req = new EventEmitter(); req.method = method; req.url = url;
    const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(s) { resolve({ status: this.statusCode, body: s ? JSON.parse(s) : null }); } };
    hub.handle(req, res).catch(reject);
    req.emit("data", Buffer.from(body ? JSON.stringify(body) : "")); req.emit("end");
  });
  return { call, tick: ms => { t += ms; } };
}

describe("boxes left open on the hub", () => {
  const box = { orders: ["264247", "264248"], by: "team", key: "navy", label: "Navy", bin: "5.2", items: [{ order: "264247", number: "7", name: "SMITH", size: "A-L", team: "Navy" }] };
  it("left open, found by any order of the group, taken once", async () => {
    const { call } = makeHub();
    const { ids } = (await call("POST", "/openboxes", { boxes: [box], station: "st-station1", order: "264247" })).body;
    expect(ids.length).toBe(1);
    expect((await call("GET", "/openboxes?orders=264248")).body.boxes.map(b => b.bin)).toEqual(["5.2"]);
    expect((await call("GET", "/openboxes?orders=999999")).body.boxes).toEqual([]);
    const took = await call("POST", `/openboxes/${ids[0]}/take`, { station: "st-station2", order: "264248" });
    expect(took.body.box).toMatchObject({ bin: "5.2", key: "navy", from: "264247", items: [{ number: "7" }] });
    expect((await call("POST", `/openboxes/${ids[0]}/take`, { station: "st-station3" })).status).toBe(404);   // one station each
  });
  it("kept 90 days", async () => {
    const { call, tick } = makeHub();
    await call("POST", "/openboxes", { boxes: [box] });
    tick(91 * 86400000);
    expect((await call("GET", "/openboxes?orders=264248")).body.boxes).toEqual([]);
  });
});
