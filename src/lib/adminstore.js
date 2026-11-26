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
import { KEY_DEFAULTS, ON_SCREEN_KEYS } from "./keydefaults.js";

const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);   // never a name an object inherits ("constructor", "toString")

export const AUDIT_MAX = 2000;   // the newest entries kept
export const EMPTY = Object.freeze({ version: 1, configVersion: 0, audit: [], settings: {} });
export const MAX_OPERATORS = 60, MAX_NAME = 40;

export const adminFileFor = dataFile => {
  const { dir, name } = path.parse(path.resolve(dataFile));
  return path.join(dir, `${name}-admin.json`);
};

// What a parsed file may hold. Each entry is checked on its own (Fable's review, M4): one bad
// name, queue or default drops only itself, and `dropped` says which, so a hand edit or an
// older version reading a newer file never loses a whole section. A section this version does
// not know is kept as it is, so writing the file back never deletes it.
export function cleanAdmin(raw, dropped = []) {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const audit = Array.isArray(o.audit) ? o.audit.filter(e => e && typeof e === "object" && Number.isFinite(e.at) && typeof e.what === "string") : [];
  const given = o.settings && typeof o.settings === "object" && !Array.isArray(o.settings) ? o.settings : {};
  const settings = {};
  for (const [k, v] of Object.entries(given)) if (!["operators", "printers", "defaults"].includes(k)) settings[k] = v;   // a later version's section: kept
  if (Array.isArray(given.operators)) {
    const ok = given.operators.filter(n => { const r = cleanOperators([n]); if (r.error) dropped.push(`operator ${JSON.stringify(n)}: ${r.error}`); return !r.error; });
    const list = cleanOperators(ok).list; if (list.length) settings.operators = list;
  }
  if (given.printers && typeof given.printers === "object" && !Array.isArray(given.printers)) {
    const map = {};
    for (const [st, slot] of Object.entries(given.printers)) for (const which of PRINTER_SLOTS) {
      if (!slot || typeof slot !== "object" || slot[which] === undefined) continue;
      const r = cleanPrinters({ [st]: { [which]: slot[which] } });
      if (r.error) { dropped.push(`printer ${st} ${which}: ${r.error}`); continue; }
      for (const [k, v] of Object.entries(r.map)) map[k] = { ...(map[k] || {}), ...v };
    }
    if (Object.keys(map).length) settings.printers = map;
  }
  if (given.defaults && typeof given.defaults === "object" && !Array.isArray(given.defaults)) {
    const map = {};
    for (const [k, v] of Object.entries(given.defaults)) { const r = cleanDefaults({ [k]: v }); if (r.error) dropped.push(`default ${k}: ${r.error}`); else Object.assign(map, r.map); }
    const whole = cleanDefaults(map);
    if (whole.error) { dropped.push(`defaults: ${whole.error} (the keys are left at the app's own)`); for (const k of ON_SCREEN_KEYS) delete map[k]; }
    if (Object.keys(map).length) settings.defaults = map;
  }
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
  try { const dropped = []; const data = cleanAdmin(JSON.parse(text), dropped); return { data, error: "", dropped }; }
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
export const printerNameOk = q => typeof q === "string" && q.length > 0 && q.length <= 200 && ![...q].some(c => c.charCodeAt(0) < 32) && !/["<>|]/.test(q);
export function cleanPrinters(map) {
  if (!map || typeof map !== "object" || Array.isArray(map)) return { map: {}, error: "The printers must be a map of stations." };
  const out = {};
  for (const [k, v] of Object.entries(map)) {
    const st = String(k).trim().toLowerCase();
    if (st !== "*" && !/^st-[a-z0-9-]{1,40}$/.test(st)) return { map: {}, error: `"${k}" is not a station.` };
    if (!own(map, k)) continue;
    if (!v || typeof v !== "object") continue;
    const slot = {};
    for (const which of PRINTER_SLOTS) {
      const q = String(v[which] ?? "").trim();
      if (!q) continue;
      if (!printerNameOk(q)) return { map: {}, error: `"${q.slice(0, 40)}" is not a printer name.` };
      slot[which] = q;
    }
    if (Object.keys(slot).length) out[st] = slot;
  }
  return { map: out, error: "" };
}

// The floor's defaults for the stations' Settings (phase 4, 26 Nov 2026; the co-op: no locks,
// "admins can make what is default for operators"). A station uses them for every setting
// its operator has not changed on that station; they reach it at the next sign-in or once no
// order is open, never in the middle of one. The camera and its rotation belong to the PC
// and are not here. Each value is checked; anything else is refused with the reason.
export const DEFAULT_KEYS = ["scanKey", "confirmKey", "cancelKey", "upKey", "retryKey", "byHandKey"];
const KEY_LABEL = { confirmKey: "Select", cancelKey: "Highlight down", upKey: "Highlight up", retryKey: "Retry", byHandKey: "By hand" };
export const DEFAULT_RULES = {
  ...Object.fromEntries(DEFAULT_KEYS.map(k => [k, v => typeof v === "string" && /^[A-Za-z0-9]{1,24}$/.test(v)])),
  autoScan: v => typeof v === "boolean",
  autoScanDelay: v => typeof v === "number" && v >= 0 && v <= 30,
  stickers: v => typeof v === "boolean",
  flagTickets: v => typeof v === "boolean",
  binLists: v => typeof v === "boolean",
  boxAutoPrint: v => typeof v === "boolean",
  boxWeights: v => typeof v === "boolean",
  boxWeightCap: v => typeof v === "number" && v >= 10 && v <= 100,
  stickerRoll: v => ["2x4", "2x3", "2x1", "1x0.5"].includes(v),
  flagRoll: v => ["2x4", "2x3", "2x1", "1x0.5"].includes(v),
  boxRoll: v => ["2x4", "2x3", "2x1", "1x0.5"].includes(v),
  listSort: v => ["size", "team", "number"].includes(v),
  theme: v => ["dark", "light", "system"].includes(v),
};
export function cleanDefaults(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return { map: {}, error: "The defaults must be a map of settings." };
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined || v === "") continue;   // blank: the app's own default
    if (!own(DEFAULT_RULES, k)) return { map: {}, error: `"${k}" is not a setting the floor's defaults can hold.` };
    if (!DEFAULT_RULES[k](v)) return { map: {}, error: `${k}: ${JSON.stringify(v)} is not a value it can take.` };
    out[k] = v;
  }
  // Checked with the app's own keys filled in (Fable's review, M2): "Retry = Enter" alone would
  // make Retry and Select the same key on every station.
  const merged = { ...KEY_DEFAULTS, ...out };
  const keys = ON_SCREEN_KEYS.map(k => merged[k]);
  if (new Set(keys).size !== keys.length) {
    const twice = ON_SCREEN_KEYS.filter((k, i) => keys.indexOf(merged[k]) !== i).map(k => KEY_LABEL[k]);
    return { map: {}, error: `Two of the on-screen keys would be the same key (${twice.join(", ")} and another), counting the app's own keys for the ones left blank.` };
  }
  return { map: out, error: "" };
}
