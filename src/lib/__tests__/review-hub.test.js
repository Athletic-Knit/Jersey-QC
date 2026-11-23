// Phase 4 of the code review of 23 Nov 2026: the hub's data file must never be
// lost. M19: a file that cannot be read is never written over. M20: when Vite
// loads the hub again (a saved server file), the old hub's pending changes are
// written before the new hub reads the file, and the old hub answers nothing more.
import { describe, it, expect } from "vitest";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import { createHub } from "../../../hub-plugin.js";

const tmp = name => path.join(os.tmpdir(), `hub-review-${name}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);
const caller = hub => (method, url, body) => new Promise(resolve => {
  const req = new EventEmitter(); req.method = method; req.url = url;
  const res = { statusCode: 200, setHeader() {}, end(s) { resolve({ status: res.statusCode, body: JSON.parse(s) }); } };
  hub.handle(req, res);
  if (body !== undefined) req.emit("data", JSON.stringify(body));
  req.emit("end");
});
const report = { operatorName: "Pat", orderNumber: "264247", orderRun: 1000, counts: { total: 1, remaining: 1 }, events: [], rows: [] };

describe("M19: a data file that cannot be read is never written over", () => {
  it("a file that cannot be read at all: the hub refuses every change and writes nothing", async () => {
    const file = tmp("dir") + ".json";
    fs.mkdirSync(file);                    // reading a folder fails, as a file OneDrive holds can
    const hub = createHub({ file });
    expect(hub.blocked()).toMatch(/could not be read/);
    const call = caller(hub);
    const r = await call("POST", "/stations/st-station1", report);
    expect(r.status).toBe(503);
    expect(r.body.error).toMatch(/not saving anything/);
    expect((await call("GET", "/stations")).status).toBe(503);   // reads too: an empty board would look like a quiet floor
    hub.flush();
    expect(fs.statSync(file).isDirectory()).toBe(true);           // untouched
    hub.close();
  });
  it("a file that does not parse is set aside and the hub starts empty, as before", async () => {
    const file = tmp("bad") + ".json";
    fs.writeFileSync(file, "{ half a fi");
    const hub = createHub({ file });
    expect(hub.blocked()).toBe("");
    const aside = fs.readdirSync(path.dirname(file)).filter(f => f.startsWith(path.basename(file) + ".unreadable-"));
    expect(aside.length).toBe(1);
    expect((await caller(hub)("POST", "/stations/st-station1", report)).status).toBe(200);
    hub.close();
  });
});

describe("M20: one hub per data file", () => {
  it("a new hub on the same file starts from everything the old one held, also what it had not written yet", async () => {
    const file = tmp("reload") + ".json";
    const a = createHub({ file });
    await caller(a)("POST", "/stations/st-station1", report);       // pending: writes wait 1.5 s
    const b = createHub({ file });                                    // Vite loads the hub again
    expect(Object.keys(b.state().stations)).toEqual(["st-station1"]);
    const late = await caller(a)("POST", "/stations/st-station2", report);
    expect(late.status).toBe(200);                                    // the old hub hands it to the new one
    expect(Object.keys(b.state().stations).sort()).toEqual(["st-station1", "st-station2"]);
    b.close();
    expect(Object.keys(JSON.parse(fs.readFileSync(file, "utf8")).stations).sort()).toEqual(["st-station1", "st-station2"]);
  });
  it("a request whose body was still arriving when the hub was replaced lands in the new hub (found by the phase 4 review)", async () => {
    const file = tmp("inflight") + ".json";
    const a = createHub({ file });
    const req = new EventEmitter(); req.method = "POST"; req.url = "/stations/st-station1";
    const answer = new Promise(resolve => { const res = { statusCode: 200, setHeader() {}, end(t) { resolve({ status: res.statusCode, body: JSON.parse(t) }); } }; a.handle(req, res); });
    const b = createHub({ file });                                    // replaced mid-upload
    req.emit("data", JSON.stringify(report)); req.emit("end");
    expect((await answer).status).toBe(200);
    expect(Object.keys(b.state().stations)).toEqual(["st-station1"]);
    b.close();
  });
  it("the old server goes on working through the new hub when the new server fails to start", async () => {
    const file = tmp("failed") + ".json";
    const a = createHub({ file });
    const b = createHub({ file });                                    // its server never starts: only the old one takes requests
    expect((await caller(a)("POST", "/stations/st-station1", report)).status).toBe(200);
    expect((await caller(a)("GET", "/stations")).body.stations.map(x => x.id)).toEqual(["st-station1"]);
    b.close();
  });
  it("hubs on different files leave each other alone", async () => {
    const a = createHub({ file: tmp("one") + ".json" }), b = createHub({ file: tmp("two") + ".json" });
    expect((await caller(a)("POST", "/stations/st-station1", report)).status).toBe(200);
    expect((await caller(b)("POST", "/stations/st-station1", report)).status).toBe(200);
    a.close(); b.close();
  });
});

describe("M21: the stage scripts", () => {
  const read = f => fs.readFileSync(new URL(`../../../tools/${f}`, import.meta.url), "utf8");
  it("no stage links another folder's packages any more", () => {
    expect(read("stage.ps1")).not.toMatch(/mklink/);
  });
  it("promotion to production and the testing pull back up the unfinished orders and install changed packages", () => {
    for (const f of ["promote.ps1", "pull-testing.ps1"]) {
      expect(read(f)).toMatch(/Backup-Data \$root/);
      expect(read(f)).toMatch(/Install-Packages \$root/);
    }
    expect(read("stagelib.ps1")).toMatch(/-Filter "hub\*-orders"/);
  });
  it("a link is removed with rmdir alone, never /s, which would delete the folder it points to", () => {
    const lib = read("stagelib.ps1");
    expect(lib).toMatch(/cmd \/c rmdir "\$nm"/);
    expect(lib).not.toMatch(/rmdir \/s/);
  });
});
