// ── The admin panel's server side: /api/admin/* (phase 1, 26 Nov 2026) ──────
// For developers only (the co-op and the manager, 26 Nov 2026). The page is the
// station app opened with ?view=admin (src/admin/AdminPanel.jsx); this plugin
// answers its requests. Phase 1 changes nothing on the floor: it signs a developer
// in, shows how this server is doing (read only) and keeps a change log.
//
// Sign-in is a shared password checked HERE: JQC_ADMIN_PASSWORD in .env.local (no
// VITE_ prefix, so it never reaches a browser; the station PINs are in the page's
// code and anyone can read them). With no password set the panel says "not set up"
// and nothing else answers. A good password gets a random token in an HttpOnly
// cookie for 8 hours; five wrong tries from one address lock it out for 10 minutes.
//
// It is its own plugin, not part of the hub, so it still answers when the hub is
// `blocked` (its file could not be read) and the panel can show why. It reads the
// hub's state through globalThis.__jerseyQcHubs (hub-plugin.js), never writes it.
//
// Never in an answer: the API key, a PIN, the password, the token of anyone else.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { adminFileFor, readAdmin, writeAdmin, auditEntry, withAudit, cleanOperators, cleanPrinters } from "./src/lib/adminstore.js";

export const SESSION_MS = 8 * 60 * 60 * 1000;
export const TRIES = 5, LOCK_MS = 10 * 60 * 1000;
export const LIVE_MS = 20000, GONE_MS = 2 * 60 * 60 * 1000;   // as hub.js and the board count a station live / gone
const COOKIE = "jqc_admin";
const LOG_LINES = 300;

// The last lines this server printed, for the panel's log view. One tap per process:
// console.log/warn/error still print as before, and a copy goes in a ring buffer.
export function logTap() {
  const g = globalThis;
  if (!g.__jqcLogTap) {
    const lines = [];
    const keep = (level, args) => {
      const text = args.map(a => (typeof a === "string" ? a : a instanceof Error ? a.message : (() => { try { return JSON.stringify(a); } catch { return String(a); } })())).join(" ");
      lines.push({ at: Date.now(), level, text: text.slice(0, 1000) });
      if (lines.length > LOG_LINES) lines.splice(0, lines.length - LOG_LINES);
    };
    for (const level of ["log", "warn", "error"]) {
      const orig = console[level].bind(console);
      console[level] = (...args) => { try { keep(level, args); } catch { /* never in the way */ } orig(...args); };
    }
    g.__jqcLogTap = { lines };
  }
  return g.__jqcLogTap;
}

// git, read only, cached for 30 s (it runs on every health refresh otherwise).
function gitReader(root) {
  let cache = null, at = 0;
  const git = (...args) => execFileSync("git", args, { cwd: root, timeout: 3000, encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "ignore"] }).trim();
  return () => {
    if (cache && Date.now() - at < 30000) return cache;
    try {
      const dirty = git("status", "--porcelain").split("\n").filter(Boolean).length;
      cache = { branch: git("rev-parse", "--abbrev-ref", "HEAD"), commit: git("rev-parse", "--short", "HEAD"), subject: git("log", "-1", "--format=%s").slice(0, 140), date: git("log", "-1", "--format=%ci"), dirty };
    } catch (e) { cache = { error: `git is not available here (${e.message.split("\n")[0]})` }; }
    at = Date.now();
    return cache;
  };
}

const sha = s => crypto.createHash("sha256").update(String(s)).digest();
const same = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));
const ipOf = req => String(req.socket?.remoteAddress || "").replace(/^::ffff:/, "");
const send = (res, code, body, headers = {}) => { res.statusCode = code; res.setHeader("Content-Type", "application/json"); res.setHeader("Cache-Control", "no-store"); for (const [k, v] of Object.entries(headers)) res.setHeader(k, v); res.end(JSON.stringify(body)); };
const cookieOf = req => { const m = new RegExp(`(?:^|;\\s*)${COOKIE}=([A-Za-z0-9_-]+)`).exec(String(req.headers?.cookie || "")); return m ? m[1] : ""; };
async function readJson(req) {
  if (req.__jqcBody !== undefined) { try { return JSON.parse(String(req.__jqcBody || "{}")); } catch { return {}; } }
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > 64 * 1024) throw new Error("request too large"); chunks.push(c); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { return {}; }
}

// `dataFile`: the hub's data file on this server. `stage`: "production", "testing" or
// "development". `env`: .env.local as loadEnv read it (only names and yes/no leave here).
export function createAdmin({ dataFile = path.resolve("data/hub.json"), stage = "production", port = 0, env = {}, root = process.cwd(), now = () => Date.now(), hostname = os.hostname(), git, hubs = () => globalThis.__jerseyQcHubs } = {}) {
  const password = String(env.JQC_ADMIN_PASSWORD || "");
  const writable = stage !== "production" || String(env.JQC_ADMIN_WRITE || "").trim() === "1";
  const adminFile = adminFileFor(dataFile);
  const readGit = git || gitReader(root);
  const tap = logTap();
  const startedAt = now() - Math.round(process.uptime() * 1000);
  const sessions = (globalThis.__jqcAdminSessions ||= new Map());   // token → { name, ip, expires }; survives a reload of this file
  const fails = new Map();                                            // ip → { n, until }

  let store = readAdmin(adminFile);
  if (store.setAside) console.error(`[admin] ${adminFile} could not be read (${store.parseError}); kept as ${store.setAside}, starting a new one`);
  if (store.error) console.error(`[admin] ${store.error}: the change log is not saved until it can be read`);
  // The floor's settings the stations read (phase 2): public, never a secret. The hub adds
  // configVersion to every station report's answer (hub-plugin.js reads it here), so a
  // station knows when to fetch them again.
  const fallbackOperators = String(env.VITE_OPERATORS || "Person 1,Person 2,Person 3").split(",").map(x => x.trim()).filter(Boolean);
  const floorConfig = () => ({ configVersion: store.data.configVersion || 0, operators: store.data.settings.operators || [] });
  (globalThis.__jqcAdminConfig ||= new Map()).set(path.resolve(dataFile), { version: () => store.data.configVersion || 0, printers: () => store.data.settings.printers || {} });
  const hubPrinting = () => hubs?.()?.get?.(path.resolve(dataFile))?.printing || null;
  const STATION_IDS = ["st-station1", "st-station2", "st-station3"];   // the floor's stations (config.js STATIONS); the page cannot be imported here
  // A change to the settings: saved with the change log line in one write, version up.
  const change = (req, me, what, settings, before, after) => {
    if (!writable) return { code: 403, error: "This server's admin panel is read only (production: JQC_ADMIN_WRITE=1 in .env.local allows changes)." };
    if (store.error) return { code: 503, error: `The admin file cannot be read, so nothing can be saved: ${store.error}` };
    const entry = auditEntry({ at: now(), who: me.name, ip: ipOf(req), stage, what, before, after });
    const next = withAudit({ ...store.data, configVersion: (store.data.configVersion || 0) + 1, settings }, entry);
    try { writeAdmin(adminFile, next); } catch (e) { return { code: 500, error: `Could not save: ${e.message}` }; }
    store = { ...store, data: next };
    console.log(`[admin] ${me.name} (${entry.ip}): ${what}`);
    return null;
  };
  const log = (req, who, what, extra = {}) => {
    const entry = auditEntry({ at: now(), who, ip: ipOf(req), stage, what, ...extra });
    console.log(`[admin] ${who || "?"} (${entry.ip}): ${what}`);
    if (store.error) return;
    try { store = { ...store, data: withAudit(store.data, entry) }; writeAdmin(adminFile, store.data); }
    catch (e) { console.error(`[admin] could not save the change log: ${e.message}`); }
  };
  const session = req => {
    const t = cookieOf(req), s = t && sessions.get(t);
    if (!s) return null;
    if (s.expires < now()) { sessions.delete(t); return null; }
    return { token: t, ...s };
  };
  const cookie = (token, maxAge) => `${COOKIE}=${token}; Path=/api/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;

  function health() {
    const h = hubs?.()?.get?.(path.resolve(dataFile));
    const hubState = h?.state?.() || null;
    const stations = Object.values(hubState?.stations || {});
    const t = now();
    const dir = path.dirname(path.resolve(dataFile)), base = path.parse(dataFile).name;
    let files = [];
    try { files = fs.readdirSync(dir); } catch { /* no data folder yet */ }
    const statOf = f => { try { const s = fs.statSync(path.join(dir, f)); return { size: s.size, modified: s.mtimeMs }; } catch { return null; } };
    let orders = 0; try { orders = fs.readdirSync(path.join(dir, `${base}-orders`)).filter(f => f.endsWith(".json")).length; } catch { /* none */ }
    let backups = []; try { backups = fs.readdirSync(path.join(dir, "backups")).filter(f => /^\d/.test(f)).sort(); } catch { /* none */ }
    const key = env.CLAUDE_API_KEY ? "CLAUDE_API_KEY" : env.VITE_CLAUDE_API_KEY ? "VITE_CLAUDE_API_KEY" : "";
    return {
      server: { stage, port, host: hostname, node: process.version, startedAt, now: t, writable },
      git: readGit(),
      hub: h ? { found: true, blocked: h.blocked?.() || "" } : { found: false },
      data: {
        file: path.basename(dataFile), ...(statOf(path.basename(dataFile)) || { missing: true }),
        unreadable: files.filter(f => f.includes(".unreadable-")),
        conflictCopies: files.filter(f => /^hub-.+-\d+\.json$/i.test(f) && !/-admin\.json$/i.test(f)),
        unfinishedOrderFiles: orders,
        backups: backups.length, newestBackup: backups[backups.length - 1] || "",
        adminFile: path.basename(adminFile), adminError: store.error || "", auditEntries: store.data.audit.length,
      },
      stations: {
        total: stations.length,
        live: stations.filter(s => t - (s.updatedAt || 0) < LIVE_MS && !s.signedOut).map(s => String(s.id || "").replace(/^st-station/i, "Station ")).filter(Boolean),
        silent: stations.filter(s => t - (s.updatedAt || 0) >= GONE_MS).length,
      },
      ai: { keyPresent: !!key, keyName: key, keyOnPage: !!env.VITE_CLAUDE_API_KEY },
      printing: { stagePrint: stage === "production" ? "always" : (String(env.JQC_STAGE_PRINT || "").trim() === "1" ? "on" : "off") },
      setup: { passwordSet: !!password, productionWrites: stage === "production" ? writable : null },
    };
  }

  async function handle(req, res) {
    const route = new URL(req.url, "http://admin").pathname.replace(/\/+$/, "") || "/";
    const me = session(req);
    try {
      if (route === "/config" && req.method === "GET") return send(res, 200, floorConfig());   // public: what every station reads
      if (route === "/session" && req.method === "GET")
        return send(res, 200, { setup: !!password, signedIn: !!me, name: me?.name || "", stage, port, host: hostname, writable });
      if (!password) return send(res, 503, { error: "The admin panel is not set up on this server: add JQC_ADMIN_PASSWORD to .env.local (no VITE_ prefix)." });
      if (route === "/login" && req.method === "POST") {
        const ip = ipOf(req), f = fails.get(ip);
        if (f && f.until > now()) return send(res, 429, { error: `Too many wrong passwords from this PC. Try again in ${Math.ceil((f.until - now()) / 60000)} min.` });
        const body = await readJson(req);
        const name = String(body.name || "").trim().slice(0, 40);
        if (!name) return send(res, 400, { error: "Type your name: it goes in the change log." });
        if (!same(body.password || "", password)) {
          const n = (f?.n || 0) + 1;
          fails.set(ip, n >= TRIES ? { n: 0, until: now() + LOCK_MS } : { n, until: 0 });
          log(req, name, "wrong admin password");
          return send(res, 401, { error: n >= TRIES ? "Wrong password. This PC is locked out for 10 minutes." : `Wrong password (${TRIES - n} ${TRIES - n === 1 ? "try" : "tries"} left).` });
        }
        fails.delete(ip);
        const token = crypto.randomBytes(24).toString("base64url");
        sessions.set(token, { name, ip, expires: now() + SESSION_MS });
        log(req, name, "signed in");
        return send(res, 200, { signedIn: true, name, stage, writable }, { "Set-Cookie": cookie(token, SESSION_MS / 1000) });
      }
      if (route === "/logout" && req.method === "POST") {
        if (me) { sessions.delete(me.token); log(req, me.name, "signed out"); }
        return send(res, 200, { signedIn: false }, { "Set-Cookie": cookie("", 0) });
      }
      if (!me) return send(res, 401, { error: "Sign in first." });
      if (route === "/health" && req.method === "GET") return send(res, 200, health());
      if (route === "/log" && req.method === "GET") return send(res, 200, { lines: tap.lines.slice(-200) });
      if (route === "/settings" && req.method === "GET")
        return send(res, 200, { ...floorConfig(), fallbackOperators, writable, error: store.error || "" });
      if (route === "/settings/operators" && req.method === "PUT") {
        const body = await readJson(req);
        const { list, error } = cleanOperators(body.operators);
        if (error) return send(res, 400, { error });
        const before = store.data.settings.operators || [];
        if (JSON.stringify(before) === JSON.stringify(list)) return send(res, 200, { ...floorConfig(), fallbackOperators, writable, unchanged: true });
        const settings = { ...store.data.settings };
        if (list.length) settings.operators = list; else delete settings.operators;
        const bad = change(req, me, list.length ? "operator names" : "operator names: back to the .env.local list", settings, before.length ? before : `(.env.local) ${fallbackOperators.join(", ")}`, list.length ? list : `(.env.local) ${fallbackOperators.join(", ")}`);
        if (bad) return send(res, bad.code, { error: bad.error });
        return send(res, 200, { ...floorConfig(), fallbackOperators, writable });
      }
      if (route === "/printers" && req.method === "GET") {
        const pr = hubPrinting();
        if (!pr) return send(res, 503, { error: "No hub is running for this data file, so there are no printers to show." });
        let queues = [], queueError = "";
        try { queues = await pr.queues(); } catch (e) { queueError = e.message; }
        const known = Object.keys(hubs?.()?.get?.(path.resolve(dataFile))?.state?.()?.stations || {});
        const ids = [...new Set([...STATION_IDS, ...known.filter(k => /^st-station\d+$/i.test(k))])].sort();
        const stations = await Promise.all(ids.map(async id => ({ id, label: id.replace(/^st-station/i, "Station "), sticker: await pr.why(id, "sticker"), ticket: await pr.why(id, "ticket") })));
        return send(res, 200, { queues: queues.map(q => ({ ...q, zebra: /zebra|zd4|zdesigner/i.test(`${q.name} ${q.driver}`) })), queueError, stations, overrides: store.data.settings.printers || {}, env: pr.env, last: pr.last(), writable, stage, printing: stage === "production" ? "on" : (String(env.JQC_STAGE_PRINT || "").trim() === "1" ? "on" : "off") });
      }
      if (route === "/settings/printers" && req.method === "PUT") {
        const body = await readJson(req);
        const { map, error } = cleanPrinters(body.printers);
        if (error) return send(res, 400, { error });
        const before = store.data.settings.printers || {};
        if (JSON.stringify(before) === JSON.stringify(map)) return send(res, 200, { overrides: map, unchanged: true });
        const settings = { ...store.data.settings };
        if (Object.keys(map).length) settings.printers = map; else delete settings.printers;
        const show = m => Object.keys(m).length ? Object.entries(m).map(([k, v]) => `${k === "*" ? "every station" : k.replace(/^st-station/, "Station ")}: ${Object.entries(v).map(([w, q]) => `${w} ${q}`).join(", ")}`) : "(.env.local)";
        const bad = change(req, me, "printers", settings, show(before), show(map));
        if (bad) return send(res, bad.code, { error: bad.error });
        return send(res, 200, { overrides: map });
      }
      if (route === "/printers/test" && req.method === "POST") {
        if (!writable) return send(res, 403, { error: "This server's admin panel is read only (production: JQC_ADMIN_WRITE=1 in .env.local allows changes)." });
        const pr = hubPrinting();
        if (!pr) return send(res, 503, { error: "No hub is running for this data file." });
        const body = await readJson(req);
        const queue = String(body.queue || "").trim(), roll = String(body.roll || "");
        if (!queue || queue.length > 200) return send(res, 400, { error: "Pick a printer." });
        if (!["2x4", "2x3", "2x1", "1x0.5"].includes(roll)) return send(res, 400, { error: "Pick a roll." });
        const r = await pr.test(queue, roll, me.name);
        log(req, me.name, `test label on ${queue} (${roll} in): ${r.ok ? "sent" : "failed: " + r.error}`);
        return r.ok ? send(res, 200, { ok: true, last: pr.last() }) : send(res, 502, { error: r.error, last: pr.last() });
      }
      if (route === "/audit" && req.method === "GET") return send(res, 200, { entries: store.data.audit.slice(-300).reverse(), error: store.error || "" });
      return send(res, 404, { error: `no such admin route: ${req.method} ${route}` });
    } catch (e) {
      return send(res, 500, { error: e.message });
    }
  }
  return { handle, health, adminFile };
}

export default function adminPlugin(opts = {}) {
  const { handle } = createAdmin(opts);
  return {
    name: "jersey-admin",
    configureServer(server) { server.middlewares.use("/api/admin", (req, res) => { handle(req, res); }); },
  };
}
