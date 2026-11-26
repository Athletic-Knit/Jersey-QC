// The admin panel's server side (phase 1, 26 Nov 2026): its file (adminstore.js) and its
// routes (admin-plugin.js). What must hold: no password set → nothing but "not set up";
// sign-in needs the password and a name, and locks a PC out after five wrong tries; every
// route but /session needs the cookie; no answer ever carries the API key, a PIN or the
// password; health answers when the hub is blocked; a change log file that cannot be read
// is never written over; production says it is read only.
import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { Buffer } from "node:buffer";
import { adminFileFor, readAdmin, writeAdmin, cleanAdmin, withAudit, auditEntry, AUDIT_MAX, cleanOperators, cleanPrinters, cleanDefaults, cleanAi, cleanPrices, cleanInspection } from "../adminstore.js";
import { pinFor } from "../pins.js";
import { createInspection, createVigilance } from "../vigilance.js";
import { baseSettings, ownOf, effectiveSettings, loadOwn, saveOwn, recordOwn } from "../floorsettings.js";
import { operatorsFrom, checkPin } from "../hub.js";
import { createAdmin, TRIES } from "../../../admin-plugin.js";
import { resolveTheme } from "../theme.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "jqc-admin-"));
const KEY = "sk-ant-test-key-never-shown";
const PASSWORD = "correct horse battery";
const ENV = { JQC_ADMIN_PASSWORD: PASSWORD, CLAUDE_API_KEY: KEY, VITE_PIN_STATION1: "4321" };

// A request and a response good enough for handle().
function call(handle, method, url, { body, cookie, ip = "10.0.0.5" } = {}) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  Object.assign(req, { method, url, headers: cookie ? { cookie } : {}, socket: { remoteAddress: ip } });
  return new Promise(resolve => {
    const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(text) { resolve({ status: this.statusCode, headers: this.headers, body: JSON.parse(text || "{}"), text: text || "" }); } };
    handle(req, res);
  });
}
const cookieFrom = r => String(r.headers["set-cookie"] || "").split(";")[0];

describe("adminstore", () => {
  it("names the file after the hub's data file, so Backup-Data (data\\hub*.json) copies it", () => {
    expect(path.basename(adminFileFor("data/hub.json"))).toBe("hub-admin.json");
    expect(path.basename(adminFileFor("data/hub-test.json"))).toBe("hub-test-admin.json");
  });
  it("writes whole and reads back; drops what does not belong; keeps the newest entries", () => {
    const f = path.join(tmp(), "hub-admin.json");
    let d = cleanAdmin({});
    for (let i = 0; i < AUDIT_MAX + 5; i++) d = withAudit(d, auditEntry({ at: i + 1, who: "dev", what: "x" + i }));
    writeAdmin(f, { ...d, junk: 1, audit: [...d.audit, { what: 5 }] });
    const back = readAdmin(f);
    expect(back.error).toBe("");
    expect(back.data.audit.length).toBe(AUDIT_MAX);
    expect(back.data.audit.at(-1).what).toBe("x" + (AUDIT_MAX + 4));
    expect(back.data.junk).toBeUndefined();
    expect(fs.existsSync(f + ".tmp")).toBe(false);
  });
  it("a file that does not parse is set aside and a new one starts", () => {
    const dir = tmp(), f = path.join(dir, "hub-admin.json");
    fs.writeFileSync(f, "{ not json");
    const r = readAdmin(f);
    expect(r.error).toBe("");
    expect(r.setAside).toMatch(/\.unreadable-/);
    expect(fs.existsSync(r.setAside)).toBe(true);
  });
  it("a file that cannot be read is never written over: the admin plugin keeps its change log in memory only", async () => {
    const dir = tmp(), data = path.join(dir, "hub.json"), f = adminFileFor(data);
    fs.mkdirSync(f);   // a folder where the file should be: reading it fails, and it must stay a folder
    const { handle } = createAdmin({ dataFile: data, stage: "development", env: ENV, git: () => ({}) });
    const r = await call(handle, "POST", "/login", { body: { name: "Dev", password: PASSWORD } });
    expect(r.status).toBe(200);
    expect(fs.statSync(f).isDirectory()).toBe(true);
    const a = await call(handle, "GET", "/audit", { cookie: cookieFrom(r) });
    expect(a.body.error).toMatch(/could not be read/);
  });
});

describe("admin routes", () => {
  let dir, handle, hubsMap, blocked;
  beforeEach(() => {
    dir = tmp(); blocked = "";
    const dataFile = path.join(dir, "hub-test.json");
    fs.writeFileSync(dataFile, "{}");
    hubsMap = new Map([[path.resolve(dataFile), { blocked: () => blocked, state: () => ({ stations: { "st-station1": { id: "st-station1", updatedAt: Date.now() } } }) }]]);
    ({ handle } = createAdmin({ dataFile, stage: "development", port: 5174, env: ENV, git: () => ({ branch: "development", commit: "abc1234", dirty: 0 }), hubs: () => hubsMap }));
  });

  it("with no password set, the panel only says it is not set up", async () => {
    const { handle: h } = createAdmin({ dataFile: path.join(dir, "hub-test.json"), stage: "development", env: { CLAUDE_API_KEY: KEY }, git: () => ({}) });
    expect((await call(h, "GET", "/session")).body).toMatchObject({ setup: false, signedIn: false });
    expect((await call(h, "POST", "/login", { body: { name: "x", password: "" } })).status).toBe(503);
    expect((await call(h, "GET", "/health")).status).toBe(503);
  });
  it("every route but /session needs a sign-in", async () => {
    for (const r of ["/health", "/log", "/audit"]) expect((await call(handle, "GET", r)).status).toBe(401);
  });
  it("signs in with the password and a name; the cookie is HttpOnly and Secure; sign-in and sign-out go in the change log", async () => {
    expect((await call(handle, "POST", "/login", { body: { password: PASSWORD } })).status).toBe(400);   // no name
    const r = await call(handle, "POST", "/login", { body: { name: "Coop", password: PASSWORD } });
    expect(r.status).toBe(200);
    expect(r.headers["set-cookie"]).toMatch(/HttpOnly/);
    expect(r.headers["set-cookie"]).toMatch(/Secure/);
    expect(r.headers["set-cookie"]).toMatch(/SameSite=Strict/);
    const c = cookieFrom(r);
    expect((await call(handle, "GET", "/session", { cookie: c })).body).toMatchObject({ signedIn: true, name: "Coop" });
    await call(handle, "POST", "/logout", { cookie: c, body: {} });
    expect((await call(handle, "GET", "/health", { cookie: c })).status).toBe(401);
    const again = cookieFrom(await call(handle, "POST", "/login", { body: { name: "Coop", password: PASSWORD } }));
    const log = (await call(handle, "GET", "/audit", { cookie: again })).body.entries.map(e => e.what);
    expect(log).toEqual(["signed in", "signed out", "signed in"]);
  });
  it(`locks a PC out after ${TRIES} wrong passwords, and not another PC`, async () => {
    for (let i = 0; i < TRIES; i++) expect((await call(handle, "POST", "/login", { body: { name: "x", password: "nope" + i } })).status).toBe(401);
    expect((await call(handle, "POST", "/login", { body: { name: "x", password: PASSWORD } })).status).toBe(429);
    expect((await call(handle, "POST", "/login", { body: { name: "x", password: PASSWORD }, ip: "10.0.0.9" })).status).toBe(200);
  });
  it("health says what it should, and no answer ever carries the key, a PIN or the password", async () => {
    const c = cookieFrom(await call(handle, "POST", "/login", { body: { name: "Coop", password: PASSWORD } }));
    const h = await call(handle, "GET", "/health", { cookie: c });
    expect(h.status).toBe(200);
    expect(h.body.ai).toMatchObject({ keyPresent: true, keyName: "CLAUDE_API_KEY", keyOnPage: false });
    expect(h.body.stations.live).toEqual(["Station 1"]);
    expect(h.body.git.commit).toBe("abc1234");
    console.log("a line with nothing secret");
    const all = [h, await call(handle, "GET", "/session", { cookie: c }), await call(handle, "GET", "/log", { cookie: c }), await call(handle, "GET", "/audit", { cookie: c })].map(r => r.text).join("\n");
    for (const secret of [KEY, PASSWORD, "4321"]) expect(all).not.toContain(secret);
  });
  it("health still answers when the hub is blocked, and says so", async () => {
    blocked = "hub-test.json could not be read (EBUSY)";
    const c = cookieFrom(await call(handle, "POST", "/login", { body: { name: "Coop", password: PASSWORD } }));
    expect((await call(handle, "GET", "/health", { cookie: c })).body.hub.blocked).toMatch(/EBUSY/);
  });
  it("production is read only unless JQC_ADMIN_WRITE=1", async () => {
    const f = path.join(dir, "hub.json");
    const ro = createAdmin({ dataFile: f, stage: "production", env: ENV, git: () => ({}) });
    const rw = createAdmin({ dataFile: f, stage: "production", env: { ...ENV, JQC_ADMIN_WRITE: "1" }, git: () => ({}) });
    const dev = createAdmin({ dataFile: f, stage: "testing", env: ENV, git: () => ({}) });
    expect((await call(ro.handle, "GET", "/session")).body.writable).toBe(false);
    expect((await call(rw.handle, "GET", "/session")).body.writable).toBe(true);
    expect((await call(dev.handle, "GET", "/session")).body.writable).toBe(true);
  });
});

describe("theme", () => {
  it("light and dark are what they say; Follow this PC asks the PC", () => {
    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
    expect(resolveTheme("system", () => true)).toBe("light");
    expect(resolveTheme("system", () => false)).toBe("dark");
  });
  it("the dark tokens are the station's colours as they are (nothing changes on a station)", () => {
    const css = fs.readFileSync(new URL("../../index.css", import.meta.url), "utf8");
    expect(css).toMatch(/:root, :root\[data-theme="dark"\] \{[^}]*--bg: #0d1117;[^}]*--text: #e2e8f0;/);
    expect(css).toMatch(/:root\[data-theme="light"\] \{/);
    const main = fs.readFileSync(new URL("../../main.jsx", import.meta.url), "utf8");
    expect(main).toMatch(/if \(admin\) applyTheme\(\)/);   // only the admin page sets a theme in phase 1
  });
});

describe("phase 2: operator names", () => {
  let dir, handle, dataFile;
  const signIn = async (h = handle) => cookieFrom(await call(h, "POST", "/login", { body: { name: "Coop", password: PASSWORD } }));
  beforeEach(() => {
    dir = tmp(); dataFile = path.join(dir, "hub-test.json");
    ({ handle } = createAdmin({ dataFile, stage: "development", env: { ...ENV, VITE_OPERATORS: "Shiv, Priya" }, git: () => ({}) }));
  });

  it("cleans a list: trims, one space inside, drops blanks and the same name twice; refuses Other, long names and odd characters", () => {
    expect(cleanOperators(["  Shiv ", "", "Priya  Kaur", "shiv", "Arshil"])).toEqual({ list: ["Shiv", "Priya Kaur", "Arshil"], error: "" });
    expect(cleanOperators(["Other"]).error).toMatch(/Other/);
    expect(cleanOperators(["x".repeat(41)]).error).toMatch(/longer/);
    expect(cleanOperators(["<b>"]).error).toBeTruthy();
    expect(cleanOperators("Shiv").error).toBeTruthy();
  });
  it("/config is public and holds no secret; with nothing set it has no names (the stations keep .env.local's)", async () => {
    const r = await call(handle, "GET", "/config");
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ configVersion: 0, operators: [], defaults: {}, ai: {}, inspection: {} });
    expect(r.text).not.toContain(PASSWORD);
  });
  it("saving needs a sign-in; a save goes in the change log with before and after, raises the version and reaches /config", async () => {
    expect((await call(handle, "PUT", "/settings/operators", { body: { operators: ["A"] } })).status).toBe(401);
    const c = await signIn();
    const s0 = (await call(handle, "GET", "/settings", { cookie: c })).body;
    expect(s0).toMatchObject({ operators: [], fallbackOperators: ["Shiv", "Priya"], configVersion: 0, writable: true });
    const r = await call(handle, "PUT", "/settings/operators", { cookie: c, body: { operators: ["Shiv", "Priya", "Arshil"] } });
    expect(r.status).toBe(200);
    expect((await call(handle, "GET", "/config")).body).toEqual({ configVersion: 1, operators: ["Shiv", "Priya", "Arshil"], defaults: {}, ai: {}, inspection: {} });
    const same = await call(handle, "PUT", "/settings/operators", { cookie: c, body: { operators: ["Shiv", "Priya", "Arshil"] } });
    expect(same.body.unchanged).toBe(true);   // no new version, no log line
    const back = await call(handle, "PUT", "/settings/operators", { cookie: c, body: { operators: [] } });
    expect(back.body).toMatchObject({ operators: [], configVersion: 2 });
    const log = (await call(handle, "GET", "/audit", { cookie: c })).body.entries;
    expect(log[0]).toMatchObject({ what: "operator names: back to the .env.local list", before: ["Shiv", "Priya", "Arshil"] });
    expect(log[1]).toMatchObject({ what: "operator names", after: ["Shiv", "Priya", "Arshil"] });
    // kept in the file: a new plugin on the same file serves the same version
    const again = createAdmin({ dataFile, stage: "development", env: ENV, git: () => ({}) });
    expect((await call(again.handle, "GET", "/config")).body.configVersion).toBe(2);
  });
  it("a bad list is refused with the reason, and nothing changes", async () => {
    const c = await signIn();
    const r = await call(handle, "PUT", "/settings/operators", { cookie: c, body: { operators: ["Other"] } });
    expect(r.status).toBe(400);
    expect((await call(handle, "GET", "/config")).body.configVersion).toBe(0);
  });
  it("production refuses changes unless JQC_ADMIN_WRITE=1", async () => {
    const ro = createAdmin({ dataFile: path.join(dir, "hub.json"), stage: "production", env: ENV, git: () => ({}) });
    const c = await signIn(ro.handle);
    expect((await call(ro.handle, "PUT", "/settings/operators", { cookie: c, body: { operators: ["A"] } })).status).toBe(403);
  });
  it("the stations' side: the panel's names when it has some, else .env.local's", () => {
    expect(operatorsFrom({ operators: ["A", "B"] }, ["X"])).toEqual(["A", "B"]);
    expect(operatorsFrom({ operators: [] }, ["X"])).toEqual(["X"]);
    expect(operatorsFrom(null, ["X"])).toEqual(["X"]);
  });
  it("the hub's answer to a station report carries the version, so the station fetches the names again", async () => {
    const { createHub } = await import("../../../hub-plugin.js");
    const hubFile = path.join(tmp(), "hub-x.json");
    const h = createHub({ file: hubFile, print: async () => ({}), listPrinters: async () => [] });
    const a = createAdmin({ dataFile: hubFile, stage: "development", env: ENV, git: () => ({}) });
    const c = cookieFrom(await call(a.handle, "POST", "/login", { body: { name: "Coop", password: PASSWORD } }));
    await call(a.handle, "PUT", "/settings/operators", { cookie: c, body: { operators: ["Shiv"] } });
    const r = await call(h.handle, "POST", "/stations/st-station1", { body: { operatorName: "Shiv", roster: [], log: [] } });
    expect(r.body).toMatchObject({ ok: true, configVersion: 1 });
    h.close();
  });
});

describe("phase 3: printers", () => {
  const QUEUES = [{ name: "ZDesigner ZD411-203dpi ZPL", driver: "ZDesigner ZD411", port: "USB001", status: 0 }, { name: "Office Laser", driver: "HP", port: "IP_10", status: 0 }];
  let hubFile, h, a, c, printed, failNext;
  beforeEach(async () => {
    hubFile = path.join(tmp(), "hub-p.json"); printed = []; failNext = "";
    h = (await import("../../../hub-plugin.js")).createHub({ file: hubFile, printer: String.raw`\\OTHER-PC\Zebra`, printers: { "st-station2": "Station2 Zebra" }, print: async (q, zpl) => { if (failNext) throw new Error(failNext); printed.push({ q, zpl }); }, listPrinters: async () => QUEUES });
    a = createAdmin({ dataFile: hubFile, stage: "development", env: ENV, git: () => ({}) });
    c = cookieFrom(await call(a.handle, "POST", "/login", { body: { name: "Coop", password: PASSWORD } }));
  });
  const stationsNow = async () => Object.fromEntries((await call(a.handle, "GET", "/printers", { cookie: c })).body.stations.map(s => [s.id, s]));

  it("cleans the map: stations or *, sticker and ticket only, blanks dropped, odd names refused", () => {
    expect(cleanPrinters({ "*": { sticker: " A ", ticket: "" }, "ST-Station1": { ticket: String.raw`\\PC\Zebra`, other: "x" }, "st-station3": {} })).toEqual({ map: { "*": { sticker: "A" }, "st-station1": { ticket: String.raw`\\PC\Zebra` } }, error: "" });
    expect(cleanPrinters({ "kitchen": { sticker: "A" } }).error).toBeTruthy();
    expect(cleanPrinters({ "*": { sticker: "a|b" } }).error).toBeTruthy();
    expect(cleanPrinters({ "*": { sticker: "a\u0007" } }).error).toBeTruthy();
  });
  it("with nothing set, each station prints where .env.local says, and the page says why", async () => {
    const s = await stationsNow();
    expect(s["st-station1"].sticker).toMatchObject({ name: "ZDesigner ZD411-203dpi ZPL", why: expect.stringMatching(/Zebra on this PC/) });
    expect(s["st-station2"].sticker).toMatchObject({ name: "Station2 Zebra", why: expect.stringMatching(/JERSEY_PRINTER_STATION2/) });
    expect(s["st-station1"].ticket.why).toMatch(/sticker printer/);
  });
  it("a queue set in the panel comes first, the station's own before every station's, and the next print goes there", async () => {
    const unknown = await call(a.handle, "PUT", "/settings/printers", { cookie: c, body: { printers: { "*": { ticket: "Office Laser" }, "st-station2": { sticker: "Panel Zebra" } } } });
    expect(unknown.status).toBe(400);                       // "Panel Zebra" is not on this PC's list (Fable's review, M5)
    expect(unknown.body.unknown).toEqual(["Panel Zebra"]);
    const r = await call(a.handle, "PUT", "/settings/printers", { cookie: c, body: { force: true, printers: { "*": { ticket: "Office Laser" }, "st-station2": { sticker: "Panel Zebra" } } } });
    expect(r.status).toBe(200);
    const s = await stationsNow();
    expect(s["st-station2"].sticker).toMatchObject({ name: "Panel Zebra", why: expect.stringMatching(/this station/) });
    expect(s["st-station1"].ticket).toMatchObject({ name: "Office Laser", why: expect.stringMatching(/every station/) });
    expect(s["st-station1"].sticker.name).toBe("ZDesigner ZD411-203dpi ZPL");   // not set in the panel: .env.local as before
    await call(h.handle, "POST", "/print", { body: { station: "st-station2", kind: "jersey", roll: "1x0.5", labels: [{ bin: "1.1", value: "Hawks" }] } });
    expect(printed.at(-1).q).toBe("Panel Zebra");
    const log = (await call(a.handle, "GET", "/audit", { cookie: c })).body.entries[0];
    expect(log).toMatchObject({ what: "printers", before: "(.env.local)" });
    expect(log.after.join(" ")).toMatch(/Station 2: sticker Panel Zebra/);
  });
  it("a test label goes to the queue picked, on the roll picked, and into the change log; a failed one says why", async () => {
    const r = await call(a.handle, "POST", "/printers/test", { cookie: c, body: { queue: "Office Laser", roll: "2x3" } });
    expect(r.status).toBe(200);
    expect(printed.at(-1).q).toBe("Office Laser");
    expect(printed.at(-1).zpl).toMatch(/\^PW406\^LL609/);
    expect(printed.at(-1).zpl).toMatch(/Jersey QC test/);
    failNext = "Printing is off on the development server";
    const bad = await call(a.handle, "POST", "/printers/test", { cookie: c, body: { queue: "Office Laser", roll: "2x4" } });
    expect(bad.status).toBe(502);
    expect(bad.body.error).toMatch(/off/);
    expect((await call(a.handle, "GET", "/printers", { cookie: c })).body.last).toMatchObject({ ok: false, printer: "Office Laser" });
    const what = (await call(a.handle, "GET", "/audit", { cookie: c })).body.entries.map(e => e.what);
    expect(what[0]).toMatch(/test label on Office Laser \(2x4 in\): failed/);
    expect(what[1]).toMatch(/test label on Office Laser \(2x3 in\): sent/);
  });
  it("production refuses changes and test labels unless JQC_ADMIN_WRITE=1", async () => {
    const ro = createAdmin({ dataFile: hubFile, stage: "production", env: ENV, git: () => ({}) });
    const rc = cookieFrom(await call(ro.handle, "POST", "/login", { body: { name: "Coop", password: PASSWORD } }));
    expect((await call(ro.handle, "PUT", "/settings/printers", { cookie: rc, body: { printers: { "*": { sticker: "X" } } } })).status).toBe(403);
    expect((await call(ro.handle, "POST", "/printers/test", { cookie: rc, body: { queue: "X", roll: "2x4" } })).status).toBe(403);
    expect((await call(ro.handle, "GET", "/printers", { cookie: rc })).status).toBe(200);   // looking is fine
    h.close();
  });
});

describe("phase 4: station defaults", () => {
  const APP = { scanKey: "Enter", confirmKey: "Enter", cancelKey: "KeyA", upKey: "ArrowUp", retryKey: "KeyR", byHandKey: "KeyW", rotation: 180, cameraId: "", autoScan: true, stickers: false, flagRoll: "2x4", listSort: "size", theme: "dark" };
  it("cleans the defaults: known settings with good values only, blanks dropped, two on-screen keys the same refused", () => {
    expect(cleanDefaults({ stickers: true, flagRoll: "2x3", theme: "light", listSort: "", autoScanDelay: 5 })).toEqual({ map: { stickers: true, flagRoll: "2x3", theme: "light", autoScanDelay: 5 }, error: "" });
    expect(cleanDefaults({ rotation: 90 }).error).toMatch(/not a setting/);          // the camera belongs to the PC
    expect(cleanDefaults({ stickers: "yes" }).error).toMatch(/not a value/);
    expect(cleanDefaults({ autoScanDelay: 99 }).error).toBeTruthy();
    expect(cleanDefaults({ retryKey: "KeyW", byHandKey: "KeyW" }).error).toMatch(/same key/);
  });
  it("a station: the app's default, then the floor's, then what its operator changed, which always wins", () => {
    const base = baseSettings(APP, { stickers: true, flagRoll: "2x3", rotation: 0, nonsense: 1 });
    expect(base).toMatchObject({ stickers: true, flagRoll: "2x3", rotation: 180 });   // never the PC's rotation, nothing unknown
    expect(base.nonsense).toBeUndefined();
    const mine = { ...base, stickers: false };                                         // the operator turned stickers off here
    const own = ownOf(mine, base);
    expect(own).toEqual({ stickers: false });
    const later = baseSettings(APP, { stickers: true, flagRoll: "2x1", listSort: "team" });   // the floor's defaults change
    expect(effectiveSettings(later, own)).toMatchObject({ stickers: false, flagRoll: "2x1", listSort: "team" });
  });
  it("a station from before phase 4 keeps everything it had set (its whole saved object, against the app's defaults)", () => {
    const store = new Map(), storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
    expect(loadOwn(APP, { ...APP, rotation: 90, stickers: true }, storage)).toEqual({ rotation: 90, stickers: true });
    saveOwn({ listSort: "team" }, storage);
    expect(loadOwn(APP, { ...APP, rotation: 90 }, storage)).toEqual({ listSort: "team" });
  });
  it("saving defaults needs a sign-in, goes in the change log, raises the version and reaches /config; production refuses", async () => {
    const dir = tmp(), dataFile = path.join(dir, "hub-test.json");
    const { handle } = createAdmin({ dataFile, stage: "development", env: ENV, git: () => ({}) });
    expect((await call(handle, "PUT", "/settings/defaults", { body: { defaults: { stickers: true } } })).status).toBe(401);
    const c = cookieFrom(await call(handle, "POST", "/login", { body: { name: "Coop", password: PASSWORD } }));
    expect((await call(handle, "PUT", "/settings/defaults", { cookie: c, body: { defaults: { rotation: 0 } } })).status).toBe(400);
    const r = await call(handle, "PUT", "/settings/defaults", { cookie: c, body: { defaults: { stickers: true, theme: "light" } } });
    expect(r.status).toBe(200);
    expect((await call(handle, "GET", "/config")).body).toMatchObject({ configVersion: 1, defaults: { stickers: true, theme: "light" } });
    const e = (await call(handle, "GET", "/audit", { cookie: c })).body.entries[0];
    expect(e).toMatchObject({ what: "station defaults", before: "(the app's own defaults)", after: ["stickers true", "theme light"] });
    const ro = createAdmin({ dataFile: path.join(dir, "hub.json"), stage: "production", env: ENV, git: () => ({}) });
    const rc = cookieFrom(await call(ro.handle, "POST", "/login", { body: { name: "Coop", password: PASSWORD } }));
    expect((await call(ro.handle, "PUT", "/settings/defaults", { cookie: rc, body: { defaults: { stickers: true } } })).status).toBe(403);
  });
  it("the app: defaults are taken only with no order open, and light or dark on every screen (phase 8)", () => {
    const src = fs.readFileSync(new URL("../../App.jsx", import.meta.url), "utf8");
    expect(src).toMatch(/const orderOpen = sessionStarted \|\| \(!!savedSession && !resumeDecided\);/);   // Resume not answered yet counts as an order (Fable's review, H2)
    expect(src).toMatch(/if \(!floorPending \|\| orderOpen\) return;/);
    expect(src).toMatch(/baseSettings\(DEFAULT_SETTINGS, inUse \?\? \(loadSession\(\) \? \{\} : cachedFloorConfig\(\)\?\.defaults\)\)/);   // a reload starts from the defaults in use
    expect(src).toMatch(/useEffect\(\(\) => \{ applyTheme\(settings\.theme \|\| "dark"\); \}, \[settings\.theme\]\);/);   // every screen since phase 8
    const css = fs.readFileSync(new URL("../../index.css", import.meta.url), "utf8");
    expect(css).toMatch(/:root, :root\[data-theme="dark"\] \{\n {2}--k-page: #0d1117;/);   // dark: the colours as they were
  });
});

describe("Fable's review of phases 1-4 (26 Nov 2026)", () => {
  it("H1, M3: the server never hands out .env files, the data folder, /@fs/, logs or the repository; the app and the routes still pass", async () => {
    const { blockedPath } = await import("../../../guard-plugin.js");
    for (const u of ["/.env.local", "/.env", "/%2e%65nv.local", "/data/hub.json", "/data/hub-test-admin.json", "/data%2Fhub.json", "/DATA/hub.json", "/data/backups/x/hub.json", "/@fs/C:/Users/coop/JerseyQC-dev/.env.local", "/.git/config", "/tools/printer-check.ps1", "/x/server.log", "/a/../data/hub.json", "/x.local"])
      expect(blockedPath(u), u).toBe(true);
    for (const u of ["/", "/?view=admin", "/src/main.jsx", "/src/index.css", "/node_modules/.vite/deps/react.js", "/node_modules/@fontsource/barlow-condensed/files/x.woff2", "/api/admin/session", "/api/hub/stations", "/sim/replay-1.json"])
      expect(blockedPath(u), u).toBe(false);
    for (const f of ["vite.config.js", "vite.config.stage.js"]) {
      const src = fs.readFileSync(new URL(`../../../${f}`, import.meta.url), "utf8");
      expect(src, f).toMatch(/plugins: \[guardPlugin\(\), /);
      expect(src, f).not.toMatch(/strict: false/);
    }
  });
  it("M2: a floor key is checked with the app's own keys filled in; a station drops a clashing floor key and keeps the operator's", () => {
    expect(cleanDefaults({ retryKey: "Enter" }).error).toMatch(/same key/);
    expect(cleanDefaults({ byHandKey: "KeyA" }).error).toMatch(/same key/);
    expect(cleanDefaults({ retryKey: "KeyQ" }).error).toBe("");
    const APP = { confirmKey: "Enter", cancelKey: "KeyA", upKey: "ArrowUp", retryKey: "KeyR", byHandKey: "KeyW", stickers: false };
    expect(effectiveSettings({ ...APP, retryKey: "Enter" }, {}, APP).retryKey).toBe("KeyR");
    expect(effectiveSettings({ ...APP, byHandKey: "KeyQ" }, { retryKey: "KeyQ" }, APP)).toMatchObject({ retryKey: "KeyQ", byHandKey: "KeyW" });
  });
  it("M4: one bad entry drops only itself, says so, and a section this version does not know is kept", () => {
    const dropped = [];
    const d = cleanAdmin({ settings: { operators: ["Shiv", "Other", "Priya"], printers: { "*": { sticker: "Zebra", ticket: "bad|name" }, kitchen: { sticker: "X" } }, defaults: { stickers: true, newThing: 1, flagRoll: "9x9" }, models: { reads: 3 } } }, dropped);
    expect(d.settings.operators).toEqual(["Shiv", "Priya"]);
    expect(d.settings.printers).toEqual({ "*": { sticker: "Zebra" } });
    expect(d.settings.defaults).toEqual({ stickers: true });
    expect(d.settings.models).toEqual({ reads: 3 });
    expect(dropped.length).toBe(5);
  });
  it("M7: an operator's own choice stays when a floor default happens to equal it, and goes back to the floor only when they set it back", () => {
    const base0 = { stickers: false, listSort: "size" };
    let own = recordOwn({}, base0, { ...base0, stickers: true }, base0);
    expect(own).toEqual({ stickers: true });
    const base1 = { stickers: true, listSort: "size" };
    const base2 = { stickers: false, listSort: "size" };
    expect(effectiveSettings(base2, own).stickers).toBe(true);
    own = recordOwn(own, effectiveSettings(base1, own), { stickers: true, listSort: "team" }, base1);
    expect(own).toEqual({ stickers: true, listSort: "team" });
    own = recordOwn(own, { stickers: true, listSort: "team" }, { stickers: true, listSort: "size" }, base1);
    expect(own).toEqual({ stickers: true });
  });
  it("M1, L6: the tags and pills tint with color-mix at the old strength, so a colour token works and dark looks as before", () => {
    const src = fs.readFileSync(new URL("../../App.jsx", import.meta.url), "utf8");
    expect(src).not.toMatch(/\$\{s\.colour\}22/);
    expect(src).toMatch(/color-mix\(in srgb, \$\{s\.colour\} 13\.33%, transparent\)/);
    expect(src).toMatch(/color-mix\(in srgb, \$\{color\} 13\.33%, transparent\)/);
    const css = fs.readFileSync(new URL("../../index.css", import.meta.url), "utf8");
    const block = css.match(/:root, :root\[data-theme="dark"\] \{([^}]*--k-page[^}]*)\}/)[1];
    const dark = Object.fromEntries([...block.matchAll(/--(k-[a-z0-9-]+): (#[0-9a-f]{6})/g)].map(m => [m[1], m[2]]));
    // Each token's dark value is the literal it replaced (the colours as they were before phase 4).
    const WAS = { "k-page": "#0d1117", "k-card": "#161b22", "k-field": "#1e293b", "k-rule": "#21262d", "k-rule-2": "#334155", "k-rule-3": "#3f4b5c", "k-ink-5": "#475569", "k-ink-4": "#64748b", "k-ink-3b": "#7c8ba1", "k-ink-3": "#94a3b8", "k-ink-2": "#cbd5e1", "k-ink-1": "#e2e8f0", "k-ink-0": "#f1f5f9", "k-blue": "#3b82f6", "k-blue-ink": "#60a5fa", "k-blue-ink-2": "#93c5fd", "k-green": "#22c55e", "k-green-ink": "#4ade80", "k-green-ink-2": "#86efac", "k-green-deep": "#166534", "k-amber": "#f59e0b", "k-amber-ink": "#fbbf24", "k-amber-ink-2": "#fcd34d", "k-amber-ink-3": "#fde68a", "k-red": "#ef4444", "k-red-ink": "#f87171", "k-red-ink-2": "#fca5a5", "k-red-ink-3": "#fecaca", "k-pink-ink": "#f9a8d4", "k-violet-ink": "#ddd6fe", "k-strong": "#ffffff", "k-bg-green": "#052e16", "k-bg-amber": "#1c1a06", "k-bg-violet": "#1a1033", "k-bg-sky": "#082f49", "k-bg-red": "#450a0a", "k-green-locked": "#14532d", "k-rule-0": "#30363d", "k-sky": "#38bdf8", "k-sky-ink": "#7dd3fc", "k-sky-ink-2": "#bae6fd", "k-sky-ink-3": "#e0f2fe", "k-violet": "#a78bfa", "k-violet-ink-2": "#c4b5fd", "k-purple-ink": "#d8b4fe", "k-purple": "#c084fc", "k-purple-2": "#a855f7", "k-purple-deep": "#6b21a8", "k-indigo": "#818cf8", "k-blue-ink-3": "#bfdbfe", "k-green-ink-3": "#bbf7d0", "k-teal-ink": "#a7f3d0", "k-orange-ink": "#fed7aa", "k-stone-ink": "#a8a29e", "k-stone-ink-2": "#d6d3d1" };   // phase 8: the scanning screens' colours
    expect(dark).toEqual(WAS);
  });
  it("M6: clearTheme stops following the PC and takes the theme off", async () => {
    const { applyTheme, clearTheme } = await import("../theme.js");
    const listeners = new Set();
    globalThis.window = { matchMedia: () => ({ matches: true, addEventListener: (_, f) => listeners.add(f), removeEventListener: (_, f) => listeners.delete(f) }) };
    const attrs = {}, root = { setAttribute: (k, v) => { attrs[k] = v; }, removeAttribute: k => { delete attrs[k]; } };
    applyTheme("system", root);
    expect(attrs["data-theme"]).toBe("light");
    expect(listeners.size).toBe(1);
    clearTheme(root);
    expect(listeners.size).toBe(0);
    expect(attrs["data-theme"]).toBeUndefined();
    delete globalThis.window;
  });
  it("L5: names an object inherits are refused", () => {
    expect(cleanDefaults({ constructor: "x" }).error).toBeTruthy();
    expect(cleanDefaults({ toString: "x" }).error).toBeTruthy();
    expect(baseSettings({ a: 1 }, { constructor: 5, toString: 6 })).toEqual({ a: 1 });
  });
  it("L1, L3: a stale tab gets 409; the cookie carries the port; a new password ends old sessions; a wrong password does not log the name typed", async () => {
    const dir = tmp(), dataFile = path.join(dir, "hub-test.json");
    const a = createAdmin({ dataFile, stage: "development", port: 5174, env: ENV, git: async () => ({}) });
    const r = await call(a.handle, "POST", "/login", { body: { name: "Coop", password: PASSWORD } });
    expect(r.headers["set-cookie"]).toMatch(/^jqc_admin_5174=/);
    const c = cookieFrom(r);
    expect((await call(a.handle, "PUT", "/settings/operators", { cookie: c, body: { operators: ["A"], configVersion: 0 } })).status).toBe(200);
    expect((await call(a.handle, "PUT", "/settings/operators", { cookie: c, body: { operators: ["B"], configVersion: 0 } })).status).toBe(409);
    await call(a.handle, "POST", "/login", { body: { name: "secret-typed-in-name-box", password: "wrong" } });
    const log = (await call(a.handle, "GET", "/audit", { cookie: c })).body.entries;
    expect(JSON.stringify(log)).not.toContain("secret-typed-in-name-box");
    const changed = createAdmin({ dataFile, stage: "development", port: 5174, env: { ...ENV, JQC_ADMIN_PASSWORD: "a new one" }, git: async () => ({}) });
    expect((await call(changed.handle, "GET", "/health", { cookie: c })).status).toBe(401);
  });
  it("L7: with an admin file that cannot be read, the change log is kept in memory", async () => {
    const dir = tmp(), data = path.join(dir, "hub.json"), f = adminFileFor(data);
    fs.mkdirSync(f);
    const { handle } = createAdmin({ dataFile: data, stage: "development", env: ENV, git: async () => ({}) });
    const c = cookieFrom(await call(handle, "POST", "/login", { body: { name: "Dev", password: PASSWORD } }));
    expect((await call(handle, "GET", "/audit", { cookie: c })).body.entries.map(e => e.what)).toContain("signed in");
  });
});

describe("phase 5: data tools", () => {
  let dir, hubFile, h, a, c;
  const seed = async () => {
    await call(h.handle, "POST", "/rosters", { body: { orderNumber: "777001", rows: [{ number: "1" }, { number: "2" }], by: "Sup" } });
    const rid = (await call(h.handle, "GET", "/rosters")).body.rosters[0].id;
    await call(h.handle, "POST", `/rosters/${rid}/take`, { body: { station: "st-station2", operator: "Shiv" } });
    await call(h.handle, "POST", "/openboxes", { body: { boxes: [{ orders: ["777002"], by: "team", key: "Hawks", label: "Hawks", bin: "1.1", items: [{ number: "1" }] }], station: "st-station1", order: "777001", run: 1 } });
    await call(h.handle, "POST", "/boxes", { body: { counts: { "youth|st": 3 }, box: "small", station: "st-station1", order: "777001", bin: "1.1" } });
    await call(h.handle, "POST", "/stations/st-station1", { body: { operatorName: "Shiv", roster: [], log: [] } });
    return rid;
  };
  beforeEach(async () => {
    dir = tmp(); hubFile = path.join(dir, "hub-test.json");
    h = (await import("../../../hub-plugin.js")).createHub({ file: hubFile, print: async () => {}, listPrinters: async () => [] });
    a = createAdmin({ dataFile: hubFile, stage: "development", env: ENV, git: async () => ({}) });
    c = cookieFrom(await call(a.handle, "POST", "/login", { body: { name: "Coop", password: PASSWORD } }));
  });
  it("shows what the hub holds; releases a stuck roster and gives up an open box through the hub's own routes, into the change log", async () => {
    const rid = await seed();
    const d = (await call(a.handle, "GET", "/data", { cookie: c })).body;
    expect(d).toMatchObject({ stage: "development", canClear: true, stations: 1, boxAnswers: 1 });
    expect(d.rosters[0]).toMatchObject({ id: rid, orderNumber: "777001", rows: 2, takenBy: { station: "st-station2" } });
    expect(d.openBoxes.length).toBe(1);
    expect((await call(a.handle, "POST", "/data/release-roster", { cookie: c, body: { id: rid } })).status).toBe(200);
    expect(h.state().rosters[rid].takenBy).toBeUndefined();
    expect((await call(a.handle, "POST", "/data/drop-openbox", { cookie: c, body: { id: d.openBoxes[0].id } })).status).toBe(200);
    expect(Object.keys(h.state().openBoxes)).toEqual([]);
    const what = (await call(a.handle, "GET", "/audit", { cookie: c })).body.entries.map(e => e.what);
    expect(what[0]).toMatch(/open box .* given up/);
    expect(what[1]).toMatch(/roster .* released/);
    h.close();
  });
  it("Back up now copies the data file and the admin file into data/backups/<date_time>, the newest 20 kept", async () => {
    await seed(); h.flush();
    const b = fs.mkdirSync(path.join(dir, "backups"), { recursive: true });
    for (let i = 0; i < 21; i++) fs.mkdirSync(path.join(dir, "backups", `2020-01-01_0000${String(i).padStart(2, "0")}`));
    const r = await call(a.handle, "POST", "/data/backup", { cookie: c, body: {} });
    expect(r.status).toBe(200);
    expect(r.body.name).toMatch(/^\d{4}-\d{2}-\d{2}_\d{6}$/);
    const copied = fs.readdirSync(path.join(dir, "backups", r.body.name));
    expect(copied).toContain("hub-test.json");
    expect(copied).toContain("hub-test-admin.json");
    expect(fs.readdirSync(path.join(dir, "backups")).length).toBe(20);
    expect(b === undefined || typeof b === "string").toBe(true);
    h.close();
  });
  it("clearing test data needs the stage typed, makes a backup first, keeps the box answers, and is never offered on production or on a hub.json outside testing", async () => {
    await seed(); h.flush();
    expect((await call(a.handle, "POST", "/data/clear", { cookie: c, body: { confirm: "yes" } })).status).toBe(400);
    const r = await call(a.handle, "POST", "/data/clear", { cookie: c, body: { confirm: "clear development" } });
    expect(r.status).toBe(200);
    expect(fs.existsSync(path.join(dir, "backups", r.body.backup, "hub-test.json"))).toBe(true);
    const s1 = h.state();
    expect(Object.keys(s1.stations)).toEqual([]);
    expect(Object.keys(s1.rosters)).toEqual([]);
    expect(s1.boxAnswers.length).toBe(1);
    expect(JSON.parse(fs.readFileSync(hubFile, "utf8")).rosters).toEqual({});   // written at once
    const prod = createAdmin({ dataFile: path.join(dir, "hub.json"), stage: "production", env: { ...ENV, JQC_ADMIN_WRITE: "1" }, git: async () => ({}) });
    const pc = cookieFrom(await call(prod.handle, "POST", "/login", { body: { name: "Coop", password: PASSWORD } }));
    expect((await call(prod.handle, "POST", "/data/clear", { cookie: pc, body: { confirm: "clear production" } })).status).toBe(403);
    const devOnFloorName = createAdmin({ dataFile: path.join(dir, "hub.json"), stage: "development", env: ENV, git: async () => ({}) });
    const dc = cookieFrom(await call(devOnFloorName.handle, "POST", "/login", { body: { name: "Coop", password: PASSWORD } }));
    expect((await call(devOnFloorName.handle, "POST", "/data/clear", { cookie: dc, body: { confirm: "clear development" } })).status).toBe(403);   // a file named hub.json outside testing
    h.close();
  });
  it("a read-only production refuses every data action but shows the data", async () => {
    const ro = createAdmin({ dataFile: hubFile, stage: "production", env: ENV, git: async () => ({}) });
    const rc = cookieFrom(await call(ro.handle, "POST", "/login", { body: { name: "Coop", password: PASSWORD } }));
    expect((await call(ro.handle, "GET", "/data", { cookie: rc })).status).toBe(200);
    for (const r of ["/data/backup", "/data/release-roster", "/data/drop-openbox", "/data/clear"]) expect((await call(ro.handle, "POST", r, { cookie: rc, body: { id: "x" } })).status, r).toBe(403);
    h.close();
  });
});

describe("phase 6: the AI proxy, read counts and model settings", () => {
  const read = (over = {}) => ({ model: "claude-haiku-5-5", max_tokens: 300, messages: [{ role: "user", content: "x" }], ...over });
  const fakeAnthropic = (calls, status = 200) => async (url, opts) => { calls.push({ url, key: opts.headers["x-api-key"], body: JSON.parse(String(opts.body)) }); return { status, text: async () => JSON.stringify(status === 200 ? { content: [{ type: "text", text: "{}" }], usage: { input_tokens: 1000, output_tokens: 50, cache_read_input_tokens: 2000 } } : { type: "error", error: { type: "overloaded_error", message: "busy" } }) }; };
  const ai = async (opts = {}) => (await import("../../../ai-proxy.js")).createAiProxy({ env: { CLAUDE_API_KEY: KEY }, dataFile: path.join(tmp(), "hub-test.json"), log: false, ...opts });
  const post = (p, body, { ip = "10.0.0.5", headers = {} } = {}) => new Promise(resolve => {
    const req = Readable.from([Buffer.from(JSON.stringify(body))]);
    Object.assign(req, { method: "POST", url: "/v1/messages", headers, socket: { remoteAddress: ip } });
    const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(t) { resolve({ status: this.statusCode, body: JSON.parse(t || "{}") }); } };
    p.handle(req, res);
  });
  it("passes the app's own read with the server's key, and counts it per day, station and model", async () => {
    const calls = [], p = await ai({ fetchImpl: fakeAnthropic(calls) });
    const r = await post(p, read(), { headers: { "x-jqc-station": "st-station2" } });
    expect(r.status).toBe(200);
    expect(calls[0]).toMatchObject({ url: "https://api.anthropic.com/v1/messages", key: KEY });
    const day = Object.values(p.stats().days)[0];
    expect(day).toMatchObject({ calls: 1, failed: 0, input: 1000, output: 50, cacheRead: 2000 });
    expect(day.stations["st-station2"]).toEqual({ calls: 1, failed: 0 });
    expect(day.models["claude-haiku-5-5"]).toMatchObject({ calls: 1, input: 1000 });
  });
  it("refuses what is not the app's own read: another model, a huge answer, many messages, another path or method", async () => {
    const calls = [], p = await ai({ fetchImpl: fakeAnthropic(calls) });
    expect((await post(p, read({ model: "claude-opus-5-5" }))).status).toBe(403);
    expect((await post(p, read({ max_tokens: 64000 }))).status).toBe(400);
    expect((await post(p, read({ messages: [1, 2, 3, 4, 5] }))).status).toBe(400);
    const other = await new Promise(resolve => { const req = Readable.from([]); Object.assign(req, { method: "GET", url: "/v1/models", headers: {}, socket: {} }); p.handle(req, { setHeader() {}, end(t) { resolve({ status: this.statusCode, t }); } }); });
    expect(other.status).toBe(404);
    expect(calls.length).toBe(0);
    expect(Object.values(p.stats().days)[0].refused).toBe(3);
  });
  it(`allows at most so many reads a minute from one PC, not another`, async () => {
    const calls = [], p = await ai({ fetchImpl: fakeAnthropic(calls) });
    const { PER_PC_MIN } = await import("../../../ai-proxy.js");
    for (let i = 0; i < PER_PC_MIN; i++) await post(p, read());
    expect((await post(p, read())).status).toBe(429);
    expect((await post(p, read(), { ip: "10.0.0.9" })).status).toBe(200);
  });
  it("a request with its own key (the test tools) spends its own key, is not checked or counted", async () => {
    const calls = [], p = await ai({ fetchImpl: fakeAnthropic(calls) });
    expect((await post(p, read({ model: "claude-opus-5-5" }), { ip: "127.0.0.1", headers: { "x-api-key": "sk-own" } })).status).toBe(200);   // from the server's own PC (Fable's review of 5-8, L2)
    expect(calls[0].key).toBe("sk-own");
    expect(Object.keys(p.stats().days)).toEqual([]);
  });
  it("a failed read is counted as failed; the counts are written to data/<hub>-ai.json; the median comes from the buckets", async () => {
    const dir = tmp(), dataFile = path.join(dir, "hub-test.json"), calls = [];
    const { createAiProxy, aiStatsFileFor, medianMs } = await import("../../../ai-proxy.js");
    const p = createAiProxy({ env: { CLAUDE_API_KEY: KEY }, dataFile, log: false, fetchImpl: fakeAnthropic(calls, 529) });
    expect((await post(p, read())).status).toBe(529);
    p.flush();
    const saved = JSON.parse(fs.readFileSync(aiStatsFileFor(dataFile), "utf8"));
    expect(Object.values(saved.days)[0]).toMatchObject({ calls: 1, failed: 1 });
    expect(path.basename(aiStatsFileFor(dataFile))).toBe("hub-test-ai.json");   // in data\, which the guard never serves
    expect(medianMs([0, 3, 1])).toBe(375);
  });
  it("the model settings: checked, development and testing only, served to stations only there, and the panel's model is let through", async () => {
    expect(cleanAi({ model: "claude-sonnet-5-5", maxPx: 1024 }).error).toBe("");
    expect(cleanAi({ model: "gpt-4" }).error).toBeTruthy();
    expect(cleanAi({ maxPx: 99 }).error).toBeTruthy();
    const dir = tmp(), dataFile = path.join(dir, "hub-test.json");
    const a = createAdmin({ dataFile, stage: "development", env: ENV, git: async () => ({}) });
    const c = cookieFrom(await call(a.handle, "POST", "/login", { body: { name: "Coop", password: PASSWORD } }));
    expect((await call(a.handle, "PUT", "/settings/ai", { cookie: c, body: { ai: { model: "claude-sonnet-5-5" } } })).status).toBe(200);
    expect((await call(a.handle, "GET", "/config")).body.ai).toEqual({ model: "claude-sonnet-5-5" });
    const calls = [];
    const { default: plugin } = await import("../../../ai-proxy.js");
    let mw; plugin({ env: { CLAUDE_API_KEY: KEY }, dataFile, log: false, fetchImpl: fakeAnthropic(calls) }).configureServer({ middlewares: { use: (_, f) => { mw = f; } } });
    const viaPlugin = await new Promise(resolve => { const req = Readable.from([Buffer.from(JSON.stringify(read({ model: "claude-sonnet-5-5" })))]); Object.assign(req, { method: "POST", url: "/v1/messages", headers: {}, socket: { remoteAddress: "10.1.1.1" } }); mw(req, { statusCode: 200, setHeader() {}, end() { resolve(this.statusCode); } }); });
    expect(viaPlugin).toBe(200);
    const prod = createAdmin({ dataFile: path.join(dir, "hub.json"), stage: "production", env: { ...ENV, JQC_ADMIN_WRITE: "1" }, git: async () => ({}) });
    const pc = cookieFrom(await call(prod.handle, "POST", "/login", { body: { name: "Coop", password: PASSWORD } }));
    expect((await call(prod.handle, "PUT", "/settings/ai", { cookie: pc, body: { ai: { model: "claude-sonnet-5-5" } } })).status).toBe(403);
    expect((await call(prod.handle, "GET", "/config")).body.ai).toEqual({});
  });
  it("token prices: checked, saved with the change log", async () => {
    expect(cleanPrices({ "claude-haiku-5-5": { input: 1, output: 5 } }).error).toBe("");
    expect(cleanPrices({ "claude-haiku-5-5": { input: -1 } }).error).toBeTruthy();
    expect(cleanPrices({ "rm -rf": { input: 1 } }).error).toBeTruthy();
    const a = createAdmin({ dataFile: path.join(tmp(), "hub-test.json"), stage: "development", env: ENV, git: async () => ({}) });
    const c = cookieFrom(await call(a.handle, "POST", "/login", { body: { name: "Coop", password: PASSWORD } }));
    expect((await call(a.handle, "PUT", "/settings/prices", { cookie: c, body: { prices: { "claude-haiku-5-5": { input: 1, output: 5 } } } })).status).toBe(200);
    expect((await call(a.handle, "GET", "/audit", { cookie: c })).body.entries[0].what).toBe("token prices");
  });
  it("the station sends its id with each read, and every stage uses the new proxy, not Vite's open one", async () => {
    const { readJersey } = await import("../vision.js");
    let headers = null;
    await readJersey({ base64: "x", station: "st-station3", retries: 0, fetchImpl: async (u, o) => { headers = o.headers; return { ok: true, status: 200, text: async () => JSON.stringify({ content: [{ type: "text", text: '{"jersey_present":true,"name":"","number":"7"}' }] }) }; } }).catch(() => {});
    expect(headers["x-jqc-station"]).toBe("st-station3");
    for (const f of ["vite.config.js", "vite.config.stage.js"]) {
      const src = fs.readFileSync(new URL(`../../../${f}`, import.meta.url), "utf8");
      expect(src, f).toMatch(/aiProxyPlugin\(\{ env/);
      expect(src, f).not.toMatch(/'\/api\/anthropic': anthropicProxy/);
    }
  });
});

describe("phase 7: inspection counts in the panel, PINs checked by the server", () => {
  it("the inspection counts: checked, saved with the change log, handed to stations; read only on production", async () => {
    expect(cleanInspection({ full: 3, every: 12, selfCheck: 8 })).toEqual({ map: { full: 3, every: 12, selfCheck: 8 }, error: "" });
    expect(cleanInspection({ full: 0 }).error).toBeTruthy();
    expect(cleanInspection({ every: 2.5 }).error).toBeTruthy();
    expect(cleanInspection({ spot: 3 }).error).toBeTruthy();
    expect(cleanAdmin({ settings: { inspection: { full: 99 } } }).settings.inspection).toBeUndefined();   // a bad value in the file drops itself
    const dataFile = path.join(tmp(), "hub-test.json");
    const a = createAdmin({ dataFile, stage: "development", env: ENV, git: async () => ({}) });
    const c = cookieFrom(await call(a.handle, "POST", "/login", { body: { name: "Coop", password: PASSWORD } }));
    expect((await call(a.handle, "PUT", "/settings/inspection", { cookie: c, body: { inspection: { full: 99 } } })).status).toBe(400);
    expect((await call(a.handle, "PUT", "/settings/inspection", { cookie: c, body: { inspection: { full: 3, every: 12 } } })).status).toBe(200);
    expect((await call(a.handle, "GET", "/config")).body.inspection).toEqual({ full: 3, every: 12 });
    expect((await call(a.handle, "GET", "/audit", { cookie: c })).body.entries[0]).toMatchObject({ what: "inspection counts", after: ["full 3", "every 12"] });
    const prod = createAdmin({ dataFile: path.join(tmp(), "hub.json"), stage: "production", env: ENV, git: async () => ({}) });
    const pc = cookieFrom(await call(prod.handle, "POST", "/login", { body: { name: "Coop", password: PASSWORD } }));
    expect((await call(prod.handle, "PUT", "/settings/inspection", { cookie: pc, body: { inspection: { full: 3 } } })).status).toBe(403);
  });
  it("a station's order keeps the counts it started with: createInspection and the self-check take them and save them", () => {
    const i = createInspection({ full: 2, every: 3 });
    expect(i.current()).toMatchObject({ phase: "full", remaining: 2, full: 2, every: 3 });
    i.jerseyDone(); i.jerseyDone();
    expect(i.current().phase).toBe("quick");
    for (let n = 0; n < 3; n++) i.jerseyDone();
    expect(i.current().phase).toBe("sample");
    const back = createInspection(); back.load(i.state());   // a resume on a station whose panel counts changed since
    expect(back.current()).toMatchObject({ phase: "sample", full: 2, every: 3 });
    expect(createInspection({ full: 0, every: "x" }).current()).toMatchObject({ full: 5, every: 10 });   // nonsense: the app's own
    const v = createVigilance({ checks: 2 }); v.noteMistake("unchecked");
    expect(v.remaining).toBe(2);
    const w = createVigilance(); w.load(v.state());
    expect(w.checks).toBe(2);
  });
  it("POST /pin: yes or no from the server, never the PIN; works with no admin password; 10 wrong in a row wait a minute", async () => {
    const env = { CLAUDE_API_KEY: KEY, VITE_PIN_STATION1: "4321", JQC_PIN_SUPERVISOR: "9876" };   // no JQC_ADMIN_PASSWORD
    const a = createAdmin({ dataFile: path.join(tmp(), "hub-test.json"), stage: "production", env, git: async () => ({}) });
    const ok = await call(a.handle, "POST", "/pin", { body: { id: "station1", pin: "4321" } });
    expect(ok).toMatchObject({ status: 200, body: { ok: true } });
    expect((await call(a.handle, "POST", "/pin", { body: { id: "supervisor", pin: "9876" } })).body.ok).toBe(true);   // JQC_PIN_ first
    expect((await call(a.handle, "POST", "/pin", { body: { id: "supervisor", pin: "3333" } })).status).toBe(401);
    expect((await call(a.handle, "POST", "/pin", { body: { id: "inspector", pin: "1111" } })).body.ok).toBe(true);    // the default, as before
    expect((await call(a.handle, "POST", "/pin", { body: { id: "admin", pin: "0000" } })).status).toBe(400);
    const { PIN_TRIES } = await import("../../../admin-plugin.js");
    let last;
    for (let n = 0; n < PIN_TRIES; n++) last = await call(a.handle, "POST", "/pin", { body: { id: "station1", pin: "0000" }, ip: "10.0.0.7" });
    expect(last.text).not.toMatch(/4321/);
    expect((await call(a.handle, "POST", "/pin", { body: { id: "station1", pin: "4321" }, ip: "10.0.0.7" })).status).toBe(429);
    expect((await call(a.handle, "POST", "/pin", { body: { id: "station1", pin: "4321" }, ip: "10.0.0.8" })).status).toBe(200);
  });
  it("health says where each PIN comes from, never the PIN", async () => {
    const a = createAdmin({ dataFile: path.join(tmp(), "hub-test.json"), stage: "development", env: { ...ENV, JQC_PIN_SUPERVISOR: "9876" }, git: async () => ({}) });
    const c = cookieFrom(await call(a.handle, "POST", "/login", { body: { name: "Coop", password: PASSWORD } }));
    const h = await call(a.handle, "GET", "/health", { cookie: c });
    expect(h.body.pins).toContainEqual({ id: "station1", from: "VITE_PIN_STATION1" });
    expect(h.body.pins).toContainEqual({ id: "supervisor", from: "JQC_PIN_SUPERVISOR" });
    expect(h.body.pins).toContainEqual({ id: "inspector", from: "default" });
    expect(h.text).not.toMatch(/4321|9876/);
    expect(pinFor({ VITE_PIN_STATION2: "77" }, "station2")).toEqual({ pin: "77", from: "VITE_PIN_STATION2" });
    expect(pinFor({}, "constructor").pin).toBe("");
  });
  it("checkPin (the station): the server's yes or no; no admin route (a test server) checks here; no server is a no", async () => {
    const answer = (status, body) => async () => ({ status, ok: status < 300, json: async () => body });
    expect(await checkPin("station1", "1", { fetchImpl: answer(200, { ok: true }) })).toMatchObject({ ok: true });
    expect(await checkPin("station1", "1", { fetchImpl: answer(401, { ok: false, error: "Wrong PIN." }) })).toMatchObject({ ok: false, error: "Wrong PIN." });
    expect(await checkPin("station1", "1", { fetchImpl: answer(429, { ok: false, error: "Too many" }) })).toMatchObject({ ok: false, error: "Too many" });
    expect(await checkPin("station1", "1001", { fetchImpl: answer(404, {}), env: {} })).toMatchObject({ ok: true, local: true });
    expect(await checkPin("station1", "9", { fetchImpl: answer(404, {}), env: {} })).toMatchObject({ ok: false });
    expect((await checkPin("station1", "1001", { fetchImpl: async () => { throw new Error("down"); } })).ok).toBe(false);
  });
  it("the sign-in screen asks the server, and the order start takes the panel's counts", () => {
    const src = fs.readFileSync(new URL("../../App.jsx", import.meta.url), "utf8");
    expect(src).toMatch(/await checkPin\(pinOwner\.id, pin\)/);
    expect(src).not.toMatch(/pinOwner\.pin/);
    expect(src).toMatch(/createInspection\(\{ full: counts\.full, every: counts\.every/);
  });
});

describe("Fable's review of phases 5-8 (26 Nov 2026)", () => {
  const read = (over = {}) => ({ model: "claude-haiku-5-5", max_tokens: 300, messages: [{ role: "user", content: "x" }], ...over });
  const answer = (calls) => async (url, opts) => { calls.push({ headers: opts.headers, signal: opts.signal }); return { status: 200, text: async () => JSON.stringify({ content: [], usage: { input_tokens: 10, output_tokens: 1 } }) }; };
  const proxy = async (opts = {}) => (await import("../../../ai-proxy.js")).createAiProxy({ env: { CLAUDE_API_KEY: KEY }, dataFile: path.join(tmp(), "hub-test.json"), log: false, ...opts });
  const post = (p, body, { ip = "10.0.0.5", headers = {} } = {}) => new Promise(resolve => {
    const req = Readable.from([Buffer.from(JSON.stringify(body))]);
    Object.assign(req, { method: "POST", url: "/v1/messages", headers, socket: { remoteAddress: ip } });
    const res = { statusCode: 200, setHeader() {}, end(t) { resolve({ status: this.statusCode, body: JSON.parse(t || "{}") }); } };
    p.handle(req, res);
  });
  it("M1: a station name like __proto__ counts under the PC's address and reaches no other object", async () => {
    const { stationName } = await import("../../../ai-proxy.js");
    expect(stationName("st-station2", "10.0.0.5")).toBe("st-station2");
    expect(stationName("__proto__", "10.0.0.5")).toBe("10.0.0.5");
    expect(stationName("constructor", "")).toBe("?");
    const p = await proxy({ fetchImpl: answer([]) });
    expect((await post(p, read(), { headers: { "x-jqc-station": "__proto__" } })).status).toBe(200);
    expect(({}).calls).toBeUndefined();
    expect(Object.values(p.stats().days)[0].stations["10.0.0.5"]).toEqual({ calls: 1, failed: 0 });
  });
  it("L2: an own key only from the server's PC (any PC on development and testing); tighter limits; no streaming; no beta header on the floor's key", async () => {
    const calls = [];
    const p = await proxy({ fetchImpl: answer(calls) });
    expect((await post(p, read(), { headers: { "x-api-key": "sk-own" } })).status).toBe(403);
    expect((await post(p, read(), { ip: "127.0.0.1", headers: { "x-api-key": "sk-own" } })).status).toBe(200);
    const stage = await proxy({ fetchImpl: answer([]), ownKeyFromAnyPc: true });
    expect((await post(stage, read(), { headers: { "x-api-key": "sk-own" } })).status).toBe(200);
    expect((await post(p, read({ max_tokens: 4001 }))).status).toBe(400);
    expect((await post(p, read({ max_tokens: 4000 }))).status).toBe(200);   // what vision.js asks with thinking on
    expect((await post(p, read({ stream: true }))).status).toBe(400);
    calls.length = 0;
    await post(p, read(), { headers: { "anthropic-beta": "something" } });
    expect(calls[0].headers["anthropic-beta"]).toBeUndefined();
    const src = fs.readFileSync(new URL("../../../vite.config.stage.js", import.meta.url), "utf8");
    expect(src).toMatch(/aiProxyPlugin\(\{ env, dataFile, ownKeyFromAnyPc: true \}\)/);
  });
  it("L3: Anthropic too slow: the call is stopped and the station hears 504, once", async () => {
    const slow = async (url, opts) => new Promise((_, reject) => opts.signal.addEventListener("abort", () => reject(new Error("aborted"))));
    const p = await proxy({ fetchImpl: slow, upstreamMs: 30 });
    const r = await post(p, read());
    expect(r.status).toBe(504);
    expect(r.body.error.message).toMatch(/no answer from Anthropic/);
  });
  it("L4: a damaged counts file never fails a read; a reload reads the counts the proxy before it wrote", async () => {
    const dir = tmp(), dataFile = path.join(dir, "hub-test.json");
    const { createAiProxy, aiStatsFileFor } = await import("../../../ai-proxy.js");
    fs.writeFileSync(aiStatsFileFor(dataFile), JSON.stringify({ days: null }));
    const a = createAiProxy({ env: { CLAUDE_API_KEY: KEY }, dataFile, log: false, fetchImpl: answer([]) });
    expect((await post(a, read())).status).toBe(200);
    const b = createAiProxy({ env: { CLAUDE_API_KEY: KEY }, dataFile, log: false, fetchImpl: answer([]) });   // Vite loading the server again: a's counts are flushed first
    expect(Object.values(b.stats().days)[0].calls).toBe(1);
    fs.writeFileSync(aiStatsFileFor(dataFile), '{"days":{"2026-11-26":{"calls":2,"stations":{"__proto__":{"calls":9}},"models":[]}}}');
    const c = createAiProxy({ env: { CLAUDE_API_KEY: KEY }, dataFile, log: false, fetchImpl: answer([]) });
    expect(Object.getPrototypeOf(c.stats().days["2026-11-26"].stations)).toBe(null);
  });
  it("L1: a PIN someone knows does not clear the count for guessing another", async () => {
    const a = createAdmin({ dataFile: path.join(tmp(), "hub-test.json"), stage: "production", env: { CLAUDE_API_KEY: KEY }, git: async () => ({}) });
    const { PIN_TRIES } = await import("../../../admin-plugin.js");
    for (let n = 0; n < PIN_TRIES - 1; n++) await call(a.handle, "POST", "/pin", { body: { id: "supervisor", pin: "0000" } });
    expect((await call(a.handle, "POST", "/pin", { body: { id: "packer", pin: "2222" } })).status).toBe(200);   // a known PIN
    await call(a.handle, "POST", "/pin", { body: { id: "supervisor", pin: "0001" } });
    expect((await call(a.handle, "POST", "/pin", { body: { id: "supervisor", pin: "3333" } })).status).toBe(429);   // locked all the same
    expect((await call(a.handle, "POST", "/pin", { body: { id: "station1", pin: "1001" } })).status).toBe(200);    // the station's own sign-in still works
  });
  it("L5: an order saved before phase 7 runs on the app's own counts, never the last order's", () => {
    const i = createInspection({ full: 3, every: 4 });
    i.load({ phase: "quick", remaining: 0, clean: 2 });
    expect(i.current()).toMatchObject({ full: 5, every: 10 });
    const v = createVigilance({ checks: 2 });
    v.load({ remaining: 1 });
    expect(v.checks).toBe(5);
  });
  it("the hub refuses __proto__ and constructor as an id on every route", async () => {
    const h = (await import("../../../hub-plugin.js")).createHub({ file: path.join(tmp(), "hub-test.json"), print: async () => {}, listPrinters: async () => [] });
    for (const [m, u] of [["POST", "/unfinished/__proto__/release"], ["POST", "/stations/__proto__"], ["GET", "/rosters/constructor"], ["DELETE", "/openboxes/__proto__"]]) {
      expect((await call(h.handle, m, u, { body: { station: "st-station1" } })).status, u).toBe(400);
    }
    expect(({}).assignedTo).toBeUndefined();
    expect(({}).station).toBeUndefined();
  });
  it("Back up now does not hold up the server (no synchronous copy); key caps are tokens in dark and light", () => {
    const src = fs.readFileSync(new URL("../../../admin-plugin.js", import.meta.url), "utf8");
    const b = src.slice(src.indexOf("const backupNow = async"), src.indexOf("return { name, files };"));
    expect(b).not.toMatch(/Sync\(/);
    const css = fs.readFileSync(new URL("../../index.css", import.meta.url), "utf8");
    expect(css).toMatch(/--k-kbd-bg: rgba\(0,0,0,0\.3\);/);   // dark as before
  });
});

describe("Fable's final review (26 Nov 2026)", () => {
  it("the guard reads the path as Vite's file server does: backslashes, doubled slashes and /@id/ paths are refused", async () => {
    const { blockedPath } = await import("../../../guard-plugin.js");
    for (const u of [String.raw`/\data/hub.json`, String.raw`/\data\hub.json?raw`, "//data/hub.json", "///data/hub-test-admin.json", "/%5Cdata/hub.json", "/@id/C:/JerseyQC/data/hub.json?import", "/@id/c:/Users/coop/JerseyQC-dev/.env.local", "/@id/data/hub.json", "/@id/@fs/C:/x"])
      expect(blockedPath(u), u).toBe(true);
    for (const u of ["/", "/?view=admin", "/src/main.jsx?t=123", "/@vite/client", "/@react-refresh", "/@id/__x00__react/jsx-runtime", "/node_modules/.vite/deps/react.js?v=1", "/api/hub/stations"])
      expect(blockedPath(u), u).toBe(false);
  });
});
