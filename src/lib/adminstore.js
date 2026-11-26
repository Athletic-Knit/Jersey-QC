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
export const EMPTY = Object.freeze({ version: 1, audit: [], settings: {} });

export const adminFileFor = dataFile => {
  const { dir, name } = path.parse(path.resolve(dataFile));
  return path.join(dir, `${name}-admin.json`);
};

// What a parsed file may hold; anything else is dropped, so a hand-edited file cannot
// put a wrong type in front of the panel.
export function cleanAdmin(raw) {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const audit = Array.isArray(o.audit) ? o.audit.filter(e => e && typeof e === "object" && Number.isFinite(e.at) && typeof e.what === "string") : [];
  const settings = o.settings && typeof o.settings === "object" && !Array.isArray(o.settings) ? o.settings : {};
  return { version: 1, audit: audit.slice(-AUDIT_MAX), settings };
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
