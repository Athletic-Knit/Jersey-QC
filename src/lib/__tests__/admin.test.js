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
import { adminFileFor, readAdmin, writeAdmin, cleanAdmin, withAudit, auditEntry, AUDIT_MAX, cleanOperators, cleanPrinters, cleanDefaults } from "../adminstore.js";
import { baseSettings, ownOf, effectiveSettings, loadOwn, saveOwn, recordOwn } from "../floorsettings.js";
import { operatorsFrom } from "../hub.js";
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
    expect(r.body).toEqual({ configVersion: 0, operators: [], defaults: {} });
    expect(r.text).not.toContain(PASSWORD);
  });
  it("saving needs a sign-in; a save goes in the change log with before and after, raises the version and reaches /config", async () => {
    expect((await call(handle, "PUT", "/settings/operators", { body: { operators: ["A"] } })).status).toBe(401);
    const c = await signIn();
    const s0 = (await call(handle, "GET", "/settings", { cookie: c })).body;
    expect(s0).toMatchObject({ operators: [], fallbackOperators: ["Shiv", "Priya"], configVersion: 0, writable: true });
    const r = await call(handle, "PUT", "/settings/operators", { cookie: c, body: { operators: ["Shiv", "Priya", "Arshil"] } });
    expect(r.status).toBe(200);
    expect((await call(handle, "GET", "/config")).body).toEqual({ configVersion: 1, operators: ["Shiv", "Priya", "Arshil"], defaults: {} });
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
  it("the app: defaults are taken only with no order open, and light or dark only on the sign-in screen and the board", () => {
    const src = fs.readFileSync(new URL("../../App.jsx", import.meta.url), "utf8");
    expect(src).toMatch(/const orderOpen = sessionStarted \|\| \(!!savedSession && !resumeDecided\);/);   // Resume not answered yet counts as an order (Fable's review, H2)
    expect(src).toMatch(/if \(!floorPending \|\| orderOpen\) return;/);
    expect(src).toMatch(/baseSettings\(DEFAULT_SETTINGS, inUse \?\? \(loadSession\(\) \? \{\} : cachedFloorConfig\(\)\?\.defaults\)\)/);   // a reload starts from the defaults in use
    expect(src).toMatch(/const themedScreen = !signedIn \|\| showSupervisor;/);
    expect(src).toMatch(/else clearTheme\(\);/);
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
    const WAS = { "k-page": "#0d1117", "k-card": "#161b22", "k-field": "#1e293b", "k-rule": "#21262d", "k-rule-2": "#334155", "k-rule-3": "#3f4b5c", "k-ink-5": "#475569", "k-ink-4": "#64748b", "k-ink-3b": "#7c8ba1", "k-ink-3": "#94a3b8", "k-ink-2": "#cbd5e1", "k-ink-1": "#e2e8f0", "k-ink-0": "#f1f5f9", "k-blue": "#3b82f6", "k-blue-ink": "#60a5fa", "k-blue-ink-2": "#93c5fd", "k-green": "#22c55e", "k-green-ink": "#4ade80", "k-green-ink-2": "#86efac", "k-green-deep": "#166534", "k-amber": "#f59e0b", "k-amber-ink": "#fbbf24", "k-amber-ink-2": "#fcd34d", "k-amber-ink-3": "#fde68a", "k-red": "#ef4444", "k-red-ink": "#f87171", "k-red-ink-2": "#fca5a5", "k-red-ink-3": "#fecaca", "k-pink-ink": "#f9a8d4", "k-violet-ink": "#ddd6fe", "k-strong": "#ffffff" };
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
