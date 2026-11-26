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
import { adminFileFor, readAdmin, writeAdmin, cleanAdmin, withAudit, auditEntry, AUDIT_MAX, cleanOperators } from "../adminstore.js";
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
    expect(r.body).toEqual({ configVersion: 0, operators: [] });
    expect(r.text).not.toContain(PASSWORD);
  });
  it("saving needs a sign-in; a save goes in the change log with before and after, raises the version and reaches /config", async () => {
    expect((await call(handle, "PUT", "/settings/operators", { body: { operators: ["A"] } })).status).toBe(401);
    const c = await signIn();
    const s0 = (await call(handle, "GET", "/settings", { cookie: c })).body;
    expect(s0).toMatchObject({ operators: [], fallbackOperators: ["Shiv", "Priya"], configVersion: 0, writable: true });
    const r = await call(handle, "PUT", "/settings/operators", { cookie: c, body: { operators: ["Shiv", "Priya", "Arshil"] } });
    expect(r.status).toBe(200);
    expect((await call(handle, "GET", "/config")).body).toEqual({ configVersion: 1, operators: ["Shiv", "Priya", "Arshil"] });
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
