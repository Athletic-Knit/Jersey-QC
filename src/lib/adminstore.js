// The admin panel's own file on the server (admin-plugin.js): its change log now, its
// settings in later phases. It sits beside the hub's data file and is named after it
// (data/hub.json → data/hub-admin.json, data/hub-test.json → data/hub-test-admin.json),
// so it matches data\hub*.json and Backup-Data in tools/stagelib.ps1 copies it at every
// promotion. It is NOT .env.local (a save there restarts the server and every station
// shows Resume) and NOT inside the hub's file (several MB, rewritten every 1.5 s).
//
// The same care as the hub's file (code review M19): written to .tmp and renamed, so
// it is whole or not there; a file that cannot be read is never written over (the
// store says why, and the panel shows it); a file that reads but does not parse is
// kept aside as .unreadable-… and the store starts fresh.
import fs from "node:fs";
import path from "node:path";

export const AUDIT_MAX = 2000;   // the newest entries kept
export const EMPTY = Object.freeze({ version: 1, configVersion: 0, audit: [], settings: {} });
export const MAX_OPERATORS = 60, MAX_NAME = 40;

export const adminFileFor = dataFile => {
  const { dir, name } = path.parse(path.resolve(dataFile));
  return path.join(dir, `${name}-admin.json`);
};

// What a parsed file may hold; anything else is dropped, so a hand-edited file cannot
// put a wrong type in front of the panel.
export function cleanAdmin(raw) {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const audit = Array.isArray(o.audit) ? o.audit.filter(e => e && typeof e === "object" && Number.isFinite(e.at) && typeof e.what === "string") : [];
  const given = o.settings && typeof o.settings === "object" && !Array.isArray(o.settings) ? o.settings : {};
  const settings = {};
  if (Array.isArray(given.operators)) { const ops = cleanOperators(given.operators); if (!ops.error && ops.list.length) settings.operators = ops.list; }
  if (given.printers && typeof given.printers === "object") { const pr = cleanPrinters(given.printers); if (!pr.error && Object.keys(pr.map).length) settings.printers = pr.map; }
  const configVersion = Number.isFinite(o.configVersion) && o.configVersion >= 0 ? Math.floor(o.configVersion) : 0;
  return { version: 1, configVersion, audit: audit.slice(-AUDIT_MAX), settings };
}

// → { data, error }. `error` set: the file is there but could not be read (nothing may be
// written over it) or could not be set aside.
export function readAdmin(file) {
  let text;
  try { text = fs.readFileSync(file, "utf8"); }
  catch (e) {
    if (e.code === "ENOENT") return { data: cleanAdmin(EMPTY), error: "" };
    return { data: cleanAdmin(EMPTY), error: `${file} could not be read (${e.message})` };
  }
  try { return { data: cleanAdmin(JSON.parse(text)), error: "" }; }
  catch (e) {
    const aside = `${file}.unreadable-${Date.now().toString(36)}`;
    try { fs.renameSync(file, aside); return { data: cleanAdmin(EMPTY), error: "", setAside: aside, parseError: e.message }; }
    catch (e2) { return { data: cleanAdmin(EMPTY), error: `${file} does not parse (${e.message}) and could not be set aside (${e2.message})` }; }
  }
}

// Whole or not at all. Throws when it cannot write (the caller answers with the reason).
export function writeAdmin(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file + ".tmp", JSON.stringify(cleanAdmin(data), null, 1));
  fs.renameSync(file + ".tmp", file);
}

// One line of the change log. `before` / `after` are what the panel showed; a secret
// (a PIN, a password) is never passed in, only that it changed.
export function auditEntry({ at = Date.now(), who = "", ip = "", stage = "", what, before, after } = {}) {
  const e = { at, who: String(who || "").slice(0, 60), ip: String(ip || ""), stage: String(stage || ""), what: String(what || "") };
  if (before !== undefined) e.before = before;
  if (after !== undefined) e.after = after;
  return e;
}
export const withAudit = (data, entry) => ({ ...data, audit: [...(data.audit || []), entry].slice(-AUDIT_MAX) });

// The names offered at sign-in (phase 2, 26 Nov 2026). Each trimmed, inner spaces made
// single; empty lines dropped; the same name twice (any case) once. `error` when a name
// is too long, or "Other" (the sign-in screen's own choice for anyone not on the list).
export function cleanOperators(list) {
  if (!Array.isArray(list)) return { list: [], error: "The names must be a list." };
  const out = [], seen = new Set();
  for (const raw of list) {
    const n = String(raw ?? "").replace(/\s+/g, " ").trim();
    if (!n) continue;
    if (n.length > MAX_NAME) return { list: [], error: `"${n.slice(0, 20)}…" is longer than ${MAX_NAME} letters.` };
    if (/^other$/i.test(n)) return { list: [], error: `"Other" is already on the sign-in screen for anyone not on the list.` };
    if (/[<>{}]/.test(n)) return { list: [], error: `"${n}" has a character a name does not need.` };
    const k = n.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k); out.push(n);
  }
  if (out.length > MAX_OPERATORS) return { list: [], error: `At most ${MAX_OPERATORS} names.` };
  return { list: out, error: "" };
}

// Which print queue each station uses (phase 3, 26 Nov 2026): { "*": { sticker, ticket },
// "st-station1": { sticker, ticket } }. "*" is every station without its own. A queue is a
// Windows printer name as this server PC knows it (a shared one is \\PC\Name). Empty
// values are dropped; a station left with nothing is dropped.
export const PRINTER_SLOTS = ["sticker", "ticket"];
export function cleanPrinters(map) {
  if (!map || typeof map !== "object" || Array.isArray(map)) return { map: {}, error: "The printers must be a map of stations." };
  const out = {};
  for (const [k, v] of Object.entries(map)) {
    const st = String(k).trim().toLowerCase();
    if (st !== "*" && !/^st-[a-z0-9-]{1,40}$/.test(st)) return { map: {}, error: `"${k}" is not a station.` };
    if (!v || typeof v !== "object") continue;
    const slot = {};
    for (const which of PRINTER_SLOTS) {
      const q = String(v[which] ?? "").trim();
      if (!q) continue;
      if (q.length > 200 || [...q].some(c => c.charCodeAt(0) < 32) || /["<>|]/.test(q)) return { map: {}, error: `"${q.slice(0, 40)}" is not a printer name.` };
      slot[which] = q;
    }
    if (Object.keys(slot).length) out[st] = slot;
  }
  return { map: out, error: "" };
}
