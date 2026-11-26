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
import { adminFileFor, readAdmin, writeAdmin, auditEntry, withAudit } from "./src/lib/adminstore.js";

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
