// ── Station hub: a tiny in-process service inside the dev server ─────────────
// Stations report their progress; supervisors post rosters for stations to
// pick up. State lives in data/hub.json on the host PC. The routes are the
// shape a real roster server can adopt later:
//   GET    /api/hub/stations            every station's latest snapshot
//   POST   /api/hub/stations/:id        a station reports (body = snapshot)
//   DELETE /api/hub/stations/:id                 the supervisor takes a station off the board
//   POST   /api/hub/stations/:id/signout         the operator signed out: the station stays on the board, marked
//   DELETE /api/hub/stations/:id/carried?key=…   supervisor marks an item from an earlier order done
//   GET    /api/hub/orders?q=264247         an order by its number, any day in the ledger: rows, boxes, flags — the station's Print menu
//   GET    /api/hub/ledger?from=&to=         several days, slim (no photos, no rosters) — the board's "Compare days" workbook
//   GET    /api/hub/ledger?date=YYYY-MM-DD   every scan event and order of that day (default today) — the day sheet;
//                                            `days` lists every day still kept (90; photos only on the newest 14)
//   GET    /api/hub/rosters             rosters waiting for stations (summaries)
//   GET    /api/hub/rosters/:id         one roster, with rows
//   POST   /api/hub/rosters             { orderNumber, notes, jerseyType, garment, customer, fileName, rows, by } (customer: printed on the box's outside label and the sign-off ticket; the Paragon site will fill it later)
//   POST   /api/hub/rosters/:id/take    { station, operator } — a station starts it; 409 if another station already has it
//   POST   /api/hub/rosters/:id/release the supervisor frees it for another station
//   DELETE /api/hub/rosters/:id         the station finished it, or the supervisor removes it
//   GET    /api/hub/unfinished?q=&station=&all=1   { orders } — orders parked unfinished, newest change first; q = the order number (exact first, a part from 3 characters),
//                                            station = parked at or given to that station, all=1 = the closed ones too (a station learns its order was checked off)
//   POST   /api/hub/unfinished          { id?, station, order, run, operator, jerseyType, kind, total, done, flagged, missing, toScan, out, session } — a station parks an order; the whole order (`session`) goes to its own file on this PC's disk; one entry per order (`id` when it was picked up from one) → { id, entry }
//   GET    /api/hub/unfinished/:id/order     { session, entry } — the whole order, from the disk, for any station to pick up
//   POST   /api/hub/unfinished/:id/take      { station, operator } — a station opens it; another station gets 409 while it is open there → { entry }
//   POST   /api/hub/unfinished/:id/assign    { station, by } — the supervisor gives it to a station
//   POST   /api/hub/unfinished/:id/release   takes it off that station again (also one a station has open)
//   POST   /api/hub/unfinished/:id/checkoff  { ids, all, by, as } — the supervisor settles jerseys still out (ids: a row's id, or "x<id>" for an extra jersey): as "pass" (default) they count as passed, as "short" the order ships without them; an extra jersey is closed either way; in the ledger too → { entry }
//   DELETE /api/hub/unfinished/:id      the station finished the order the normal way
//   GET    /api/hub/openboxes?orders=264247,264248   { boxes } — boxes left open at Finish order for an order that ships with these (the owner, 20 Nov 2026)
//   POST   /api/hub/openboxes           { boxes: [{ orders, by, key, label, bin, items }], station, order, run } — a station finishes an order and leaves these boxes open (the same order, run and box again replaces its entry) → { ids }
//   POST   /api/hub/openboxes/:id/take  { station, order } — the next order takes the box (it is then that order's); 404 when another station took it first → { box }
//   DELETE /api/hub/openboxes/:id       the supervisor (or a station) gives the box up
//   GET    /api/hub/boxes               { model, answers } — the box model (src/lib/boxmodel.js) fitted to every answer so far
//   POST   /api/hub/boxes               { counts, box, station, order, bin, suggested } — a bin was closed and went in this box; → { model, answers }
//   GET    /api/hub/print?station=…     { printer, printers, labelSize, flagPrinter, flagLabelSize } — the label printer for that station (JERSEY_PRINTER_<STATION>), else the hub's (JERSEY_PRINTER, else the first Zebra queue); the flag-ticket printer likewise (JERSEY_FLAG_PRINTER_<STATION>, JERSEY_FLAG_PRINTER), else the label printer; the ticket roll JERSEY_FLAG_LABEL_SIZE_<STATION>, else JERSEY_FLAG_LABEL_SIZE
//   POST   /api/hub/print               { labels, kind, station } — prints one label per entry (labels.js: kind "jersey" = the sticker on a pass, "flag" = the ticket on a flag, on the flag printer and the station's ticket roll, "bin" = a bin label) → { ok, printer, count } (count: the labels that came out, after a tall roll's lists were re-paged); 503 when there is no label printer
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Buffer } from "node:buffer";
import { printJob, labelSize as labelDots, cleanSpots, DEFAULT_LABEL_SIZE, DEFAULT_FLAG_LABEL_SIZE } from "./src/lib/labels.js";
import { GARMENT_IDS } from "./src/lib/garments.js";
import { PRIOR as BOX_PRIOR, FEATURES as BOX_FEATURES, BOXES, MORE, fitBoxModel } from "./src/lib/boxmodel.js";

// The rolls a station may choose for its labels (LABEL_ROLLS in src/config.js, which the hub does not import).
export const LABEL_ROLLS = ["2x4", "2x3", "2x1", "1x0.5"];
// The garment an order is (the outline of the "where is the damage" step):
// one of garments.js's kinds, or "" (the station then draws a hockey jersey).
const knownGarment = g => (typeof g === "string" && GARMENT_IDS.includes(g) ? g : "");
// Where the damage is on a flag (24 Nov 2026): the garment and up to three
// spots ride on the flag's event. Like a photo, the newest spots that are not
// empty win, and a re-send without them never wipes them (an older station, or
// a report sent while the operator was still marking). The garment goes with
// the spots it was marked on. The event comes back with `garment` and `spots`
// only when it has them, cleaned (a known kind; at most 3 spots, each
// { side, x, y }).
export function withMarks(ev, old) {
  const out = { ...ev };
  delete out.garment; delete out.spots;
  const spots = cleanSpots(ev?.spots), before = cleanSpots(old?.spots);
  const [mine, other] = spots.length || !before.length ? [ev, old] : [old, ev];
  const garment = knownGarment(mine?.garment) || knownGarment(other?.garment);
  if (garment) out.garment = garment;
  if (spots.length) out.spots = spots; else if (before.length) out.spots = before;
  return out;
}

// ── Bin labels: the Zebra on the hub PC ──────────────────────────────────────
// The ZPL goes to a Windows print queue as raw bytes through tools/print-raw.ps1
// (no driver rendering). Both steps are injectable so the routes can be tested
// without a printer.
const PRINT_PS1 = path.join(path.dirname(fileURLToPath(import.meta.url)), "tools", "print-raw.ps1");
// Why the script failed, in words for the station's screen. What PowerShell
// said comes first. With nothing said, the script was stopped after 30 s
// (`killed`): it was still waiting for the printer, which for a printer shared
// from another PC means that PC did not answer. Node's own message for that is
// only the command line ("Command failed: powershell -NoProfile …"), which is
// what the Print menu showed on 12 Nov 2026 and told nobody anything.
const PS1_TIMEOUT_MS = 30000;
// A failed print script → one plain sentence for the station (see above).
export function ps1Problem(err, stderr, printer = "") {
  const said = String(stderr || "").split(/\r?\n/).map(l => l.trim()).find(Boolean);
  if (said) return said;
  const host = String(printer).startsWith("\\\\") ? String(printer).split("\\")[2] : "";
  if (err?.killed || err?.signal) return `${printer || "the printer"} did not answer in ${PS1_TIMEOUT_MS / 1000} s${host ? `: is ${host} (the PC that shares it) on, awake and on the network?` : ""}`;
  return `the print script stopped${err?.code !== undefined && err?.code !== null ? ` (code ${err.code})` : ""} without saying why`;
}
const runPs1 = (args, printer = "") => new Promise((resolve, reject) =>
  execFile("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", PRINT_PS1, ...args], { windowsHide: true, timeout: PS1_TIMEOUT_MS },
    (err, stdout, stderr) => err ? reject(new Error(ps1Problem(err, stderr, printer))) : resolve(String(stdout))));

// The print queues on this PC: [{ name, driver, port, status }].
export async function listPrintersWindows() {
  const out = JSON.parse((await runPs1(["-List"])).trim() || "[]");
  return (Array.isArray(out) ? out : [out]).filter(p => p?.Name).map(p => ({ name: p.Name, driver: p.DriverName || "", port: p.PortName || "", status: p.PrinterStatus }));
}
// Sends ZPL raw to a Windows print queue (tools/print-raw.ps1), through a temp
// file that is removed afterwards; throws with ps1Problem's sentence.
export async function printRawWindows(printer, zpl) {
  const tmp = path.join(os.tmpdir(), `jerseyqc-labels-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}.zpl`);
  fs.writeFileSync(tmp, zpl, "utf8");   // ^CI28: the printer reads the data as UTF-8
  try { await runPs1(["-Printer", printer, "-File", tmp], printer); }
  finally { try { fs.unlinkSync(tmp); } catch { /* already gone */ } }
}
// A Zebra queue, by its name or driver: the default printer when none is named.
export const isLabelPrinter = p => /zebra|zd4|zdesigner/i.test(`${p?.name || ""} ${p?.driver || ""}`);

// The ledger keeps `keepDays` of days; the photos (the weight, ~40 KB each)
// only on the newest `photoDays`. An event whose photos went says so.
export function pruneLedger(led, { keepDays = 90, photoDays = 14 } = {}) {
  const days = Object.keys(led || {}).sort();
  days.slice(0, Math.max(0, days.length - keepDays)).forEach(d => delete led[d]);
  days.slice(0, Math.max(0, days.length - photoDays)).filter(d => led[d]).forEach(d => Object.values(led[d].events || {}).forEach(ev => {
    if (ev && (ev.photo || ev.damagePhotos)) { delete ev.photo; delete ev.damagePhotos; ev.photosPruned = true; }
  }));
  return led;
}

// ── One scan, one ledger entry (code review of 23 Nov 2026, M5) ──────────────
// Stations re-send their whole log every 5 s. The ledger used to file each event
// under the day it ARRIVED and the station that SENT it, so an order running past
// midnight, a parked order picked up at another station, or a renamed order
// counted the same scans again, and the day sheet and Compare days were inflated.
// Now an event is filed under its OWN day (its stamp, "2026-11-23 14:05:12") and
// keyed by the run of the order and its own id: one run of an order is one start
// of it (`orderRun`, the time it was started, kept when another station picks it
// up), so the same scan re-sent by any station lands on the same entry. Events
// from before runs existed keep the station and order in their key.
export const eventKey = (ev, station = ev?.station) => (ev?.run ? `${ev.run}|${ev.id}` : `${station}|${ev?.order}|${ev?.id}`);
// The day an event belongs to: the date of its own stamp, else `fallback`.
export const eventDay = (ev, fallback) => (/^\d{4}-\d{2}-\d{2}/.test(String(ev?.t || "")) ? String(ev.t).slice(0, 10) : fallback);
// Files one event, as a station sent it: the station that filed it first is kept
// (the one that scanned it; a station that picked the order up re-sends it), and a
// photo once seen is kept when later reports leave it out. → true when it was new.
export function fileEvent(led, ev, station, today) {
  const day = (led[eventDay(ev, today)] ||= { events: {}, orders: {} });
  const events = (day.events ||= {});
  const k = eventKey(ev, station), old = events[k];
  events[k] = { ...withMarks(ev, old), station: old?.station || ev.station || station,
    ...(ev.photo ? {} : old?.photo ? { photo: old.photo } : {}),
    ...(ev.damagePhotos?.length ? {} : old?.damagePhotos?.length ? { damagePhotos: old.damagePhotos } : {}) };
  return !old;
}
// The ledger as the old filing left it, put right once when the hub starts:
// every event moved to its own day under its new key, copies merged (the newest
// content, the first station, any photo). Run again it changes nothing.
// → how many copies were dropped.
export function normaliseLedger(led) {
  const all = new Map();
  let copies = 0;
  for (const date of Object.keys(led || {}).sort()) {
    for (const ev of Object.values(led[date]?.events || {})) {
      if (!ev || ev.id === undefined) continue;
      const k = eventKey(ev), have = all.get(k);
      if (!have) { all.set(k, { ev, date }); continue; }
      copies++;
      all.set(k, { date: have.date, ev: { ...have.ev, ...withMarks(ev, have.ev), station: have.ev.station || ev.station,
        ...(ev.photo || !have.ev.photo ? {} : { photo: have.ev.photo }),
        ...(ev.damagePhotos?.length || !have.ev.damagePhotos?.length ? {} : { damagePhotos: have.ev.damagePhotos }) } });
    }
    if (led[date]) led[date].events = {};
  }
  for (const [k, { ev, date }] of all) ((led[eventDay(ev, date)] ||= { events: {}, orders: {} }).events ||= {})[k] = ev;
  return copies;
}

// The hub for one data file: its state, its routes (`handle`) and its writes.
// The options name the file, the clock and the printers (tests pass their own).
export function createHub({ file = path.resolve("data/hub.json"), now = () => Date.now(), printer = "", printers: stationPrinters = {}, labelSize = "", flagPrinter = "", flagPrinters: stationFlagPrinters = {}, flagLabelSize = "", flagLabelSizes: stationFlagSizes = {}, print = printRawWindows, listPrinters = listPrintersWindows } = {}) {
  // One hub per data file (code review M20). Saving hub-plugin.js or a file it imports makes
  // Vite load this module again and create a new hub in the same process, while the old one
  // may still hold changes it has not written (writes wait 1.5 s) and its server may still
  // take requests (Vite starts the new server before it closes the old, and keeps the old one
  // if the new one fails to start). So the old hub is closed first: what it holds is written,
  // and from then on it hands every request, also one whose body was still arriving, to the
  // newest hub for the file. Only then is the file read, so the new hub starts from everything.
  const key = path.resolve(file);
  const hubs = (globalThis.__jerseyQcHubs ||= new Map());
  hubs.get(key)?.close();

  let state = { stations: {}, rosters: {} };
  // `blocked`: the file is there but could not be read or set aside. Nothing is written then:
  // a hub that started empty and saved would wipe the 90-day ledger (code review M19). Every
  // change is refused with a 503, which the stations and the board show, until the server
  // is restarted with a file it can read.
  let blocked = "";
  // OneDrive can hold the file for a moment ("UNKNOWN: unknown error, read", 17 Nov 2026):
  // a read that fails is tried again three times, half a second apart, before anything else.
  const pause = ms => { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch { /* no wait */ } };
  let text = null, readErr = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try { text = fs.readFileSync(file, "utf8"); readErr = null; break; }
    catch (e) { readErr = e; if (e.code === "ENOENT") break; pause(500); }
  }
  if (readErr && readErr.code !== "ENOENT") {
    // There, but it cannot be read at all: it is not set aside (it may be whole), and nothing is written over it.
    blocked = `${file} could not be read (${readErr.message})`;
  } else if (text !== null) {
    try { state = { ...state, ...JSON.parse(text) }; }
    catch (e) {
      // Read, but it does not parse (a write cut short): kept aside, and the hub starts empty.
      // If it cannot be set aside, nothing is written over it.
      const aside = `${file}.unreadable-${Date.now().toString(36)}`;
      try { fs.renameSync(file, aside); console.error(`[hub] ${file} could not be read (${e.message}); kept as ${aside}, starting empty`); }
      catch (e2) { blocked = `${file} does not parse (${e.message}) and could not be set aside (${e2.message})`; }
    }
  }
  if (blocked) console.error(`[hub] ${blocked}. NOTHING WILL BE SAVED until the server is restarted with a file it can read: every change is refused.`);
  // Scans the old filing counted twice are merged once, at start (M5). Saved with the next write.
  if (state.ledger) { const copies = normaliseLedger(state.ledger); if (copies) console.log(`[hub] ledger: ${copies} copies of the same scan merged (each scan is now filed once, under its own day)`); }

  // Writes are coalesced: with flag photos in the ledger the file is a few MB,
  // and every station reports every 5 s.
  let saveTimer = null, closed = false;
  const writeNow = () => {
    clearTimeout(saveTimer); saveTimer = null;
    if (blocked) return;
    try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file + ".tmp", JSON.stringify(state)); fs.renameSync(file + ".tmp", file); }   // whole or not at all
    catch (e) { console.error("[hub] could not save:", e.message); }
  };
  const save = () => { if (!saveTimer && !closed) saveTimer = setTimeout(writeNow, 1500); };
  // One exit listener for every hub: a pending write is flushed when the dev server stops.
  if (!globalThis.__jerseyQcExit) { globalThis.__jerseyQcExit = true; globalThis.process?.on?.("exit", () => hubs.forEach(h => h.flush())); }
  // Closing: what is pending is written now, and nothing more is saved from this hub (the newest
  // hub for the file takes its requests, see handle).
  const close = () => {
    if (closed) return;
    if (saveTimer) writeNow();
    closed = true;
    if (hubs.get(key)?.close === close) hubs.delete(key);
  };
  const flush = () => { if (saveTimer) writeNow(); };
  const now_ = now;
  const json = (res, code, body) => { res.statusCode = code; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(body)); };
  // The body is read once and kept on the request (`__jqcBody`), so a request read here can
  // be handed to the newest hub whole (M20).
  const readBody = req => (req.__jqcBody !== undefined ? Promise.resolve(req.__jqcBody) : readBodyRaw(req));
  const readBodyRaw = req => new Promise((resolve, reject) => {
    const chunks = []; let size = 0;   // joined before decoding: an accented letter split across two chunks stays whole
    req.on("data", c => { const b = Buffer.isBuffer(c) ? c : Buffer.from(String(c)); chunks.push(b); size += b.length; if (size > 20e6) reject(new Error("body too large")); });
    req.on("end", () => { try { const s = Buffer.concat(chunks).toString("utf8"); resolve(s ? JSON.parse(s) : {}); } catch (e) { reject(e); } });
    req.on("error", reject);
  });
  // The label printer: the station's own (JERSEY_PRINTER_STATION1 = a queue on
  // this PC, which may be a shared printer on the station PC, \\AK-NB-164\Zebra),
  // else JERSEY_PRINTER, else the first Zebra queue on this PC. The flag
  // tickets go on a 2 x 1 in roll, so they have their own printer the same
  // way (JERSEY_FLAG_PRINTER_STATION1, else JERSEY_FLAG_PRINTER) and fall
  // back to the label printer when none is set. The queue list costs a
  // PowerShell start, so it is kept for a minute; a listing that fails (a
  // slow Get-Printer past the 30 s limit, seen on the floor 6 Nov 2026 as
  // "No label printer" on a ticket) keeps the last good list and is tried
  // again after 5 s, so one bad call does not blank the printer for a minute.
  const printerName = String(printer || "").trim(), labelSpec = String(labelSize || "").trim() || DEFAULT_LABEL_SIZE;
  const flagName = String(flagPrinter || "").trim(), flagSpec = String(flagLabelSize || "").trim() || DEFAULT_FLAG_LABEL_SIZE;
  const byStation = map => Object.fromEntries(Object.entries(map || {}).filter(([, v]) => String(v || "").trim()).map(([k, v]) => [String(k).trim().toLowerCase(), String(v).trim()]));
  const perStation = byStation(stationPrinters), perStationFlag = byStation(stationFlagPrinters);
  // The ticket roll of each station (JERSEY_FLAG_LABEL_SIZE_STATION1 …, else
  // JERSEY_FLAG_LABEL_SIZE), so the stations can move to the 2 x 4 in roll one
  // at a time (24 Nov 2026). It lays out the flag tickets, the box labels and the lists.
  // A size that is not W x H inches ("2by4") would be laid out as the sticker
  // roll (labelSize's fallback): it is left out, the station keeps the hub's
  // roll, and the server log says which variable to put right.
  const perStationFlagSize = Object.fromEntries(Object.entries(byStation(stationFlagSizes)).filter(([k, v]) => {
    if (/^\s*[\d.]+\s*[x×]\s*[\d.]+\s*$/i.test(v)) return true;
    console.error(`[hub] JERSEY_FLAG_LABEL_SIZE_${k.replace(/^st-/, "").toUpperCase()}="${v}" is not a size like 2x4: that station uses ${flagSpec}`);
    return false;
  }));
  const flagSpecOf = station => perStationFlagSize[String(station || "").trim().toLowerCase()] || flagSpec;
  let printers = { at: -Infinity, list: [], ok: false };
  const printerList = async () => {
    if (now_() - printers.at < (printers.ok ? 60000 : 5000)) return printers.list;
    try { printers = { at: now_(), list: await listPrinters(), ok: true }; }
    catch (e) { console.error("[hub] could not list printers:", e.message); printers = { at: now_(), list: printers.list, ok: false }; }
    return printers.list;
  };
  // A Zebra plugged into THIS PC beats a JERSEY_PRINTER (or JERSEY_FLAG_PRINTER)
  // shared from another PC: the owner moved the Zebra from AK-NB-164 to the
  // server PC and wants it to answer to the server, not to a PC (20 Nov 2026),
  // and every copy of .env.local still named \\AK-NB-164\Zebra. A name on this
  // PC (a local queue, or \\<this PC>\share) is used as it is; a station's own
  // printer (JERSEY_PRINTER_STATION1) is never overridden.
  const thisPC = os.hostname().toLowerCase();
  const onOtherPC = name => { const m = /^\\\\([^\\]+)\\/.exec(name); return !!m && !["localhost", "127.0.0.1", thisPC].includes(m[1].toLowerCase()); };
  const hubPrinter = async name => {
    if (name && !onOtherPC(name)) return name;
    const list = await printerList();
    const here = list.find(p => isLabelPrinter(p) && !String(p.name).startsWith("\\\\"));
    return here?.name || name || list.find(isLabelPrinter)?.name || null;
  };
  // The admin panel's printers (phase 3, 26 Nov 2026), from its file through
  // globalThis.__jqcAdminConfig (admin-plugin.js): { "st-station1": { sticker, ticket }, "*": {…} }.
  // A queue named there is used as written, before .env.local: the station's own, then
  // every station's ("*"); without one, .env.local as before (JERSEY_PRINTER_STATIONn,
  // then JERSEY_PRINTER with the local-Zebra rule above). `whyPrinter` says which one won.
  const adminPrinters = () => globalThis.__jqcAdminConfig?.get(key)?.printers?.() || {};
  const fromPanel = (station, which) => { const a = adminPrinters(), st = String(station || "").trim().toLowerCase(); return a[st]?.[which] ? { name: a[st][which], why: "set in the admin panel for this station" } : a["*"]?.[which] ? { name: a["*"][which], why: "set in the admin panel for every station" } : null; };
  const whyPrinter = async (station, which) => {
    const st = String(station || "").trim().toLowerCase();
    const panel = fromPanel(st, which); if (panel) return panel;
    if (which === "ticket") {
      if (perStationFlag[st]) return { name: perStationFlag[st], why: `.env.local JERSEY_FLAG_PRINTER_${st.replace(/^st-/, "").toUpperCase()}` };
      if (flagName) { const n = await hubPrinter(flagName); return { name: n, why: n === flagName ? ".env.local JERSEY_FLAG_PRINTER" : `the Zebra on this PC (JERSEY_FLAG_PRINTER names ${flagName}, on another PC)` }; }
      const s2 = await whyPrinter(st, "sticker"); return { name: s2.name, why: `the sticker printer (no ticket printer set): ${s2.why}` };
    }
    if (perStation[st]) return { name: perStation[st], why: `.env.local JERSEY_PRINTER_${st.replace(/^st-/, "").toUpperCase()}` };
    const n = await hubPrinter(printerName);
    return { name: n, why: !n ? "none: no queue named and no Zebra on this PC" : n === printerName ? ".env.local JERSEY_PRINTER" : printerName ? `the Zebra on this PC (JERSEY_PRINTER names ${printerName}, on another PC)` : "the first Zebra queue on this PC" };
  };
  const labelPrinter = async station => (await whyPrinter(station, "sticker")).name;
  const ticketPrinter = async station => (await whyPrinter(station, "ticket")).name;
  // The last print, good or not, for the admin panel's printer page.
  let lastPrint = null;
  // A test label on any queue and roll (the admin panel, phase 3): the stage's own print, so
  // development and testing refuse it unless JQC_STAGE_PRINT=1, like every other print.
  const testPrint = async (queue, roll, who = "") => {
    const d = labelDots(roll);
    const big = Math.max(18, Math.round(Math.min(d.h * 0.22, d.w * 0.12))), small = Math.max(14, Math.round(big * 0.55));
    const safeText = t => String(t ?? "").replace(/[\^~]/g, " ").slice(0, 60);
    const x = Math.round(d.dpi * 2 / 25.4), y = d.top || 16;
    const zpl = `^XA^CI28^PW${d.w}^LL${d.h}^LT0^FO${x},${y}^A0N,${big},${big}^FDJersey QC test^FS^FO${x},${y + big + 6}^A0N,${small},${small}^FD${safeText(queue)}^FS^FO${x},${y + big + small + 12}^A0N,${small},${small}^FD${roll} in  ${new Date(now_()).toLocaleTimeString("en-CA", { hour12: false })}${who ? "  " + safeText(who) : ""}^FS^XZ`;
    try { await print(queue, zpl); lastPrint = { at: now_(), ok: true, printer: queue, what: `test label (${roll} in)` }; console.log(`[hub] test label on ${queue} (${roll} in)${who ? " by " + who : ""}`); return { ok: true }; }
    catch (e) { lastPrint = { at: now_(), ok: false, printer: queue, what: `test label (${roll} in)`, error: e.message }; console.error(`[hub] test label on ${queue} failed: ${e.message}`); return { ok: false, error: e.message }; }
  };
  // The box model: every "this bin went in that box" answer from every
  // station is kept (the newest 3000) and the model is fitted to the newest
  // 600, so all stations learn from the same floor.
  const BOX_IDS = [...BOXES.map(b => b.id), MORE];
  let boxModel = null;
  const boxFit = () => (boxModel ||= fitBoxModel((state.boxAnswers || []).slice(-600), BOX_PRIOR));
  // Unfinished orders (the owner, 19 Nov 2026). An operator parks an order
  // that cannot be finished yet: jerseys out for repair, missing, or not
  // scanned. The whole order is kept HERE, on this PC's disk, one file an
  // order beside the data file (data/hub-orders/<id>.json), not on the station
  // PC and not in memory: any station picks it up (the owner, 19 Nov 2026).
  // The small entry in the state lets the board list it, give it to a station
  // and check off the jerseys still to come. An order on disk stays until it
  // is finished; an entry with no order file, or one the supervisor closed,
  // goes 90 days after its last change.
  const UNFINISHED_DAYS = 90;
  const orderDir = path.join(path.dirname(file), path.basename(file, path.extname(file)) + "-orders");
  const orderPath = id => path.join(orderDir, String(id).replace(/[^\w-]/g, "") + ".json");
  // An order file that is there but does not parse (a write cut short, a sync
  // tool holding it) is not written over: it may still be put together by
  // hand. It is kept aside as <file>.unreadable-<time>, the way the hub keeps
  // its own data file (code review, 23 Nov 2026). If it cannot be read or set
  // aside, the park is refused (507) and the order stays open at the station.
  const keepUnreadableOrder = p => {
    let text;
    try { text = fs.readFileSync(p, "utf8"); }
    catch (e) { if (e.code === "ENOENT") return; text = null; }
    if (text !== null) { try { JSON.parse(text); return; } catch { /* set aside below */ } }
    const aside = `${p}.unreadable-${Date.now().toString(36)}`;
    fs.renameSync(p, aside);   // throws when it cannot: nothing is written over the file then
    console.error(`[hub] ${p} could not be read; kept as ${aside}, the order is written afresh`);
  };
  const writeOrder = (id, session) => {   // whole or not at all; throws when the disk refuses
    fs.mkdirSync(orderDir, { recursive: true });
    const text = JSON.stringify(session), p = orderPath(id);
    keepUnreadableOrder(p);
    fs.writeFileSync(p + ".tmp", text); fs.renameSync(p + ".tmp", p);
    return Buffer.byteLength(text);
  };
  const readOrder = id => {
    const p = orderPath(id);
    let text; try { text = fs.readFileSync(p, "utf8"); } catch (e) { if (e.code !== "ENOENT") console.error(`[hub] ${p} could not be read (${e.message})`); return null; }
    try { return JSON.parse(text); } catch (e) { console.error(`[hub] ${p} could not be read (${e.message}); left as it is until the order is parked again`); return null; }
  };
  const dropOrderFile = id => { try { fs.unlinkSync(orderPath(id)); } catch { /* none */ } };
  const OUT_STATUS = ["flag", "missing", "short", "todo", "extra"];   // extra: a jersey not on the roster, with the supervisor (20 Nov 2026)
  const outCount = { flag: "flagged", missing: "missing", short: "missing", todo: "toScan" };   // which count an out jersey is in (an extra is in none: it is not on the roster)
  // One out jersey's key: its row's id, or "x" and the log entry's id for an extra jersey (no row).
  const jkey = j => (j?.rowId !== null && j?.rowId !== undefined ? String(j.rowId) : "x" + j?.xid);
  const whole = v => Math.max(0, Math.floor(Number(v)) || 0);
  const outOf = list => (Array.isArray(list) ? list : []).filter(j => j && typeof j === "object").slice(0, 5000).map(j => ({
    rowId: j.rowId ?? null, xid: j.xid ?? null, number: String(j.number ?? ""), name: String(j.name ?? ""), size: String(j.size ?? ""), team: String(j.team ?? ""),
    status: OUT_STATUS.includes(j.status) ? j.status : "todo", reason: String(j.reason ?? ""),
  }));
  const pruneUnfinished = () => {
    const pool = state.unfinished || {}; let gone = 0;
    for (const [k, u] of Object.entries(pool)) {
      if (u?.stored && !u.closed) continue;   // an order kept whole on the disk stays until it is finished
      if (now_() - (u?.updatedAt || 0) > UNFINISHED_DAYS * 86400000) { delete pool[k]; dropOrderFile(k); gone++; }
    }
    if (gone) { save(); console.log(`[hub] ${new Date().toLocaleTimeString()} dropped ${gone} unfinished order${gone === 1 ? "" : "s"} older than ${UNFINISHED_DAYS} days`); }
  };
  // The station's way of stamping a scan: local time, "2026-11-19 14:05:12".
  const localStamp = ms => { const d = new Date(ms), p = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; };
  // A check-off goes in the ledger too, so the order sheet and the day sheet
  // show it: the rows pass on the newest day that has the order's record, and
  // today gets one pass event a jersey, "Checked off by supervisor".
  const checkOffInLedger = (u, off, by, at, as = "pass") => {
    off = off.filter(j => j.status !== "extra");   // an extra jersey has no row and no count in the order
    const short = as === "short", word = short ? "Shipped short — supervisor" : "Checked off by supervisor";
    const led = (state.ledger ||= {});
    const same = o => o && o.station === u.station && String(o.order) === String(u.order) && (Number(o.run) || 0) === (u.run || 0);
    const date = Object.keys(led).sort().reverse().find(d => Object.values(led[d]?.orders || {}).some(same));
    const rec = date && Object.values(led[date].orders).find(same);
    if (rec) {
      const ids = new Set(off.map(j => String(j.rowId)));
      const counts = rec.counts ? { ...rec.counts } : null;
      rec.rows = (rec.rows || []).map(r => {
        if (!ids.has(String(r?._id)) || r.scanned === "pass" || r.scanned === "manual" || (short && r.scanned === "short")) return r;
        if (counts) {
          const f = r.scanned ? r.scanned : "remaining";   // a jersey not scanned is in remaining; a flagged, missing or short one in its own count
          if (typeof counts[f] === "number") counts[f] = Math.max(0, counts[f] - 1);
          const to = short ? "short" : "pass";
          counts[to] = (counts[to] || 0) + 1;
        }
        return { ...r, scanned: short ? "short" : "pass", checkedBy: "supervisor", checkedAt: at };
      });
      if (counts) rec.counts = counts;
    }
    // The id `co-<row>-<time>` is the one the station's log line gets when it opens the
    // order (applyCheckOff in orderstore.js, `ledgerId`), so the station re-sending it
    // updates this entry instead of counting the pass a second time (M5).
    off.forEach(j => {
      const evId = `co-${j.rowId}-${at}`;
      fileEvent(led, { id: evId, t: localStamp(at), status: short ? "short" : "pass", order: u.order, run: u.run, jerseyType: u.jerseyType || "", station: u.station, rowId: j.rowId,
        number: j.number, name: j.name, size: j.size, team: j.team, reason: word, resolution: word + (by ? ` (${by})` : ""), operator: by }, u.station, localStamp(at).slice(0, 10));
    });
  };
  const summary = r => ({ id: r.id, shipWith: r.shipWith || [], orderNumber: r.orderNumber, notes: r.notes, jerseyType: r.jerseyType || "", garment: r.garment || "", customer: r.customer || "", binBy: r.binBy || "", fileName: r.fileName, rowCount: r.rows.length, by: r.by, forStation: r.forStation || "", createdAt: r.createdAt, takenBy: r.takenBy || null });

  async function handle(req, res) {
    // The whole body first, then the request goes to the NEWEST hub for this file: a request
    // that reached a hub replaced while its body was arriving lands in the new hub's state, not
    // in this one's, which is no longer saved (M20, found by the phase 4 review).
    if (req.method !== "GET" && req.method !== "HEAD" && req.__jqcBody === undefined) {
      try { req.__jqcBody = await readBodyRaw(req); } catch (e) { return json(res, 400, { error: e.message }); }
    }
    const newest = hubs.get(key);
    if (newest && newest.handle !== handle) return newest.handle(req, res);
    if (closed) return json(res, 503, { error: "the hub is restarting: try again in a moment" });
    // A hub whose file could not be read answers nothing, reads included: an empty board would
    // look like a quiet floor, a 503 shows that the hub is in trouble (M19).
    if (blocked) return json(res, 503, { error: `the hub is not saving anything: ${blocked}. Restart the server once the file can be read.` });
    const parts = new URL(req.url, "http://hub").pathname.split("/").filter(Boolean);
    const [kind, id] = parts;
    // An id is a key in the hub's maps: "__proto__" or "constructor" would reach every object in
    // the server (state.stations, the rosters, the unfinished and open-box pools). Refused here
    // for every route (Fable's review of admin phases 5-8).
    if (parts.some(p => UNSAFE_KEYS.has(p))) return json(res, 400, { error: "no such id" });
    try {
      if (kind === "stations") {
        if (req.method === "GET" && !id) return json(res, 200, { now: now_(), today: new Date(now_()).toLocaleDateString("en-CA"), stations: Object.values(state.stations).map(s => Object.fromEntries(Object.entries(s).filter(([k]) => k !== "history"))).sort((a, b) => b.updatedAt - a.updatedAt) });   // history stays on the hub
        if (req.method === "POST" && id && parts.length === 2) {   // a station report
          const body = await readBody(req);
          const prev = state.stations[id];
          // The station moved to another order: its unresolved items are still
          // physically on their way to the supervisor, so they stay listed
          // under the station until the supervisor marks them done.
          let carried = prev?.carried || [];
          // The supervisor renamed the running order from the board: the station
          // now reports the new number. Same order, so nothing is carried and the
          // day tally continues; the record under the old name goes.
          // One start of an order on a station is a run (`orderRun`, the time it
          // was started). The same number started again is another run: its own
          // record in the ledger, the finished one kept as it was.
          const sameRun = !!prev && (prev.orderRun || 0) === (body.orderRun || 0);
          // The operator corrected the order number in the station's header: the
          // same run under another number is the same order renamed, not a new one
          // (code review M9: every keystroke used to open a new order record and add
          // the station's whole done count to the day tally again).
          const renamed = !!prev?.orderNumber && body.orderNumber !== prev.orderNumber && (
            (!!prev.setOrder && body.orderNumber === prev.setOrder.orderNumber)
            || (!!body.orderNumber && !!prev.orderRun && sameRun));
          if (prev && prev.orderNumber && !renamed && (body.orderNumber !== prev.orderNumber || !sameRun)) {
            // Key without the order number: if the order is renamed twice the same jersey must not be listed twice.
            const open = (prev.attention || []).filter(a => !a.resolution).map(a => ({ ...a, order: prev.orderNumber, key: `${a.time}|${a.jersey}|${a.status}` }));
            const seen = new Set(carried.map(c => c.key));
            carried = [...open.filter(c => !seen.has(c.key)), ...carried].slice(0, 50);
          }
          // Day tally: jerseys done (pass or by hand) since the station's first report
          // today, across orders. Rate and time left come from the last 20 minutes.
          const now   = now_();
          const today = new Date(now).toLocaleDateString("en-CA");            // YYYY-MM-DD, local
          const doneOf = c => Math.max(0, (c?.total || 0) - (c?.remaining || 0));
          const done  = doneOf(body.counts);
          const sameOrder = !!prev && ((prev.orderNumber === body.orderNumber && sameRun) || renamed);
          const day = prev?.day?.date === today ? { ...prev.day } : { date: today, done: 0 };
          const { events = [], rows = [], bins = null, ...rest } = body;
          const led = (state.ledger ||= {});
          // Another order on this station: count only the jerseys the hub has not seen
          // passed yet today. An order picked up from the unfinished pile arrives with
          // everything done on it before, and that was counted where it was done (M5).
          const freshDone = sameOrder ? 0 : events.filter(ev => ev && ev.id !== undefined && (ev.status === "pass" || ev.status === "manual")
            && eventDay(ev, today) === today && !led[today]?.events?.[eventKey(ev, id)]).length;
          day.done = Math.max(0, day.done + (sameOrder ? done - doneOf(prev.counts) : freshDone));   // an un-checked jersey takes one off again
          let history = (sameOrder && prev.history) || [];
          history = [...history, { t: now, done }].filter(h => now - h.t <= 20 * 60000).slice(-300);
          const first = history[0], span = now - first.t;
          const rate   = span >= 2 * 60000 && done > first.done ? (done - first.done) / span * 3600000 : null;   // jerseys per hour
          const etaMin = rate ? Math.round((body.counts?.remaining || 0) / rate * 60) : null;
          // Day ledger: every scan event from every station, each filed once under its
          // own day (fileEvent, M5), so a re-sent event updates in place — a resolution
          // added later lands too, and a photo once seen is kept.
          const dayLed = (led[today] ||= { events: {}, orders: {} });
          events.forEach(ev => { if (ev && ev.id !== undefined) fileEvent(led, ev, id, today); });
          const okey = (order, run) => `${id}|${order}${run ? "|" + run : ""}`;
          // Renamed: the record moves to the new number and keeps when it started.
          let renamedFrom = null;
          if (renamed && prev.orderNumber) { const k = okey(prev.orderNumber, prev.orderRun); renamedFrom = dayLed.orders[k] || null; delete dayLed.orders[k]; }
          if (body.orderNumber) {
            // The order record keeps the latest roster with each jersey's status, so the
            // supervisor can download the order's QC Results sheet at any time.
            const ok = okey(body.orderNumber, body.orderRun); const o = dayLed.orders[ok] || (renamedFrom ? { ...renamedFrom, order: body.orderNumber, run: body.orderRun || 0 } : null) || { station: id, order: body.orderNumber, run: body.orderRun || 0, operator: body.operatorName, firstSeen: now };
            dayLed.orders[ok] = { ...o, operator: body.operatorName || o.operator, lastSeen: now, counts: body.counts || o.counts, rosterFile: body.rosterFile || o.rosterFile, notes: body.notes ?? o.notes ?? "", jerseyType: body.jerseyType || o.jerseyType || "", garment: knownGarment(body.garment) || o.garment || "", customer: String(body.customer || o.customer || "").slice(0, 80), rows: rows.length ? rows : (o.rows || []), bins: bins || o.bins || null, closedBins: body.closedBins || o.closedBins || null, binSummary: body.binSummary || o.binSummary || null, idle: body.idle || o.idle || null, away: body.away || o.away || null,
              // When the station pressed Finish order (code review M7: an order finished with jerseys
              // still unscanned showed "in progress" for ever). The station is the judge: "Back to
              // this order" sends null again. A station from before this change sends nothing: kept.
              finishedAt: "finishedAt" in body ? (body.finishedAt || null) : (o.finishedAt || null) };
          }
          pruneLedger(led);   // 90 days; photos on the newest 14
          const setOrder = renamed ? undefined : prev?.setOrder;          // pending until the station reports it
          state.stations[id] = { ...rest, id, carried, day, history, rate, etaMin, updatedAt: now, ...(setOrder ? { setOrder } : {}) }; save();
          const admin = globalThis.__jqcAdminConfig?.get(key);   // the admin panel's settings: the station fetches them again when this differs from what it has (admin-plugin.js)
          return json(res, 200, { ok: true, ...(setOrder ? { setOrder } : {}), ...(admin ? { configVersion: admin.version?.() || 0 } : {}) });   // 0 too, so a reset admin file is noticed (Fable's review, L9)
        }
        // The supervisor gives a station's running order its number from the board.
        if (req.method === "POST" && id && parts[2] === "order") {
          const body = await readBody(req);
          const s = state.stations[id]; if (!s) return json(res, 404, { error: "no such station" });
          const orderNumber = String(body.orderNumber ?? "").trim(); if (!orderNumber) return json(res, 400, { error: "order number required" });
          s.setOrder = { orderNumber, by: String(body.by ?? ""), at: now_() }; save();
          console.log(`[hub] ${new Date().toLocaleTimeString()} ${id}: supervisor set the order number to ${orderNumber}`);
          return json(res, 200, { ok: true });
        }
        if (req.method === "DELETE" && id && parts[2] === "carried") {
          const key = new URL(req.url, "http://hub").searchParams.get("key");
          const s = state.stations[id]; if (s) { s.carried = (s.carried || []).filter(c => c.key !== key); save(); console.log(`[hub] ${new Date().toLocaleTimeString()} ${id}: supervisor marked done — ${key}`); }
          return json(res, 200, { ok: true });
        }
        // The operator signed out (code review M8). The station stays on the board as
        // "signed out": deleting it, as Sign out used to, lost the day's tally and the
        // flags still on their way to the supervisor. Its next report clears the mark.
        if (req.method === "POST" && id && parts[2] === "signout") {
          const s = state.stations[id]; if (!s) return json(res, 200, { ok: true });   // never reported: nothing to mark
          s.signedOut = { at: now_(), operator: s.operatorName || "" }; save();
          console.log(`[hub] ${new Date().toLocaleTimeString()} ${id}: ${s.operatorName || "the operator"} signed out`);
          return json(res, 200, { ok: true });
        }
        // The supervisor takes a station off the board ("Remove").
        if (req.method === "DELETE" && id) { delete state.stations[id]; save(); return json(res, 200, { ok: true }); }
      }
      // An order by its number, from any day the ledger still has: the roster
      // with each jersey's status, its boxes, and its flags (no photos), for
      // the station's Print menu. One entry per run of the order on a station
      // (the newest day's record of it), an exact match first, newest first.
      if (kind === "orders" && req.method === "GET") {
        const q = String(new URL(req.url, "http://hub").searchParams.get("q") || "").trim().toLowerCase();
        if (!q) return json(res, 400, { error: "order number required" });
        const found = {};
        for (const [date, d] of Object.entries(state.ledger || {}).sort(([a], [b]) => a.localeCompare(b))) {
          for (const o of Object.values(d.orders || {})) {
            const n = String(o.order ?? "").trim().toLowerCase();
            if (n !== q && !(q.length >= 3 && n.includes(q))) continue;
            const k = `${o.station}|${o.order}|${o.run || 0}`, before = found[k];
            const flags = { ...(before?.flagsById || {}) };
            Object.values(d.events || {}).forEach(ev => {
              // The run's flags wherever they were scanned (an event keeps the station that scanned it,
              // and a run picked up at another station keeps its run); by station before runs existed.
              if ((o.run && ev.run ? ev.run !== o.run : (ev.station !== o.station || (ev.run || 0) !== (o.run || 0))) || String(ev.order) !== String(o.order) || ev.status !== "flagged") return;
              const slim = { ...ev }; delete slim.photo; delete slim.damagePhotos; flags[ev.id] = slim;
            });
            found[k] = { date, exact: n === q, station: o.station, order: o.order, run: o.run || 0, operator: o.operator || "", firstSeen: before?.firstSeen ?? o.firstSeen, lastSeen: o.lastSeen, counts: o.counts || null, jerseyType: o.jerseyType || "", garment: o.garment || before?.garment || "", customer: o.customer || before?.customer || "", finishedAt: o.finishedAt || before?.finishedAt || null, rows: o.rows || [], bins: o.bins || null, closedBins: o.closedBins || [], flagsById: flags };
          }
        }
        const orders = Object.values(found).sort((a, b) => (b.exact - a.exact) || ((b.lastSeen || 0) - (a.lastSeen || 0))).slice(0, 10)
          .map(({ flagsById, exact, ...o }) => ({ ...o, exact, flags: Object.values(flagsById).sort((a, b) => String(a.t).localeCompare(String(b.t))) }));
        return json(res, 200, { orders });
      }
      // Several days at once, for comparing them: ?from=YYYY-MM-DD&to=YYYY-MM-DD
      // (both ends included, at most 92 days). Slim: no photos on the events and
      // no rosters on the orders, so three months stay a small answer.
      if (kind === "ledger" && req.method === "GET" && new URL(req.url, "http://hub").searchParams.get("from")) {
        const q = new URL(req.url, "http://hub").searchParams;
        const from = String(q.get("from")), to = String(q.get("to") || from);
        const days = Object.keys(state.ledger || {}).filter(d => d >= from && d <= to).sort().slice(-92).map(date => {
          const d = state.ledger[date];
          return {
            date,
            events: Object.values(d.events || {}).map(ev => { const slim = { ...ev }; delete slim.photo; delete slim.damagePhotos; return slim; }).sort((a, b) => String(a.t).localeCompare(String(b.t))),
            orders: Object.values(d.orders || {}).map(o => ({ station: o.station, order: o.order, run: o.run || 0, operator: o.operator || "", counts: o.counts || null, jerseyType: o.jerseyType || "", firstSeen: o.firstSeen, lastSeen: o.lastSeen, finishedAt: o.finishedAt || null })),
          };
        });
        return json(res, 200, { from, to, days, known: Object.keys(state.ledger || {}).sort() });
      }
      if (kind === "ledger" && req.method === "GET") {
        const date = new URL(req.url, "http://hub").searchParams.get("date") || new Date(now_()).toLocaleDateString("en-CA");
        const d = (state.ledger || {})[date] || { events: {}, orders: {} };
        return json(res, 200, { date, events: Object.values(d.events).sort((a, b) => String(a.t).localeCompare(String(b.t))), orders: Object.values(d.orders), days: Object.keys(state.ledger || {}).sort() });
      }
      if (kind === "rosters") {
        if (req.method === "GET" && !id)  return json(res, 200, { rosters: Object.values(state.rosters).map(summary).sort((a, b) => b.createdAt - a.createdAt) });
        if (req.method === "GET" && id)   { const r = state.rosters[id]; return r ? json(res, 200, r) : json(res, 404, { error: "no such roster" }); }
        if (req.method === "POST" && !id) {
          const body = await readBody(req);
          if (!Array.isArray(body.rows) || body.rows.length === 0) return json(res, 400, { error: "rows required" });
          const newId = now_().toString(36) + Math.random().toString(36).slice(2, 6);
          // forStation: a station id ("st-line1") when the supervisor sends it to one station; "" = any station may take it.
          state.rosters[newId] = { id: newId, shipWith: (Array.isArray(body.shipWith) ? body.shipWith : []).map(String).filter(Boolean).slice(0, 20), orderNumber: String(body.orderNumber ?? ""), notes: String(body.notes ?? ""), jerseyType: String(body.jerseyType ?? ""), garment: knownGarment(body.garment), customer: String(body.customer ?? "").trim().slice(0, 80), binBy: String(body.binBy ?? ""), fileName: String(body.fileName ?? ""), rows: body.rows, by: String(body.by ?? ""), forStation: String(body.forStation ?? ""), createdAt: now_() };
          save();
          return json(res, 200, { id: newId });
        }
        // One station works an order. The first station to start it takes it;
        // another station asking gets 409 and who has it. The same station may
        // take it again (its page reloaded, or the saved session was discarded).
        if (req.method === "POST" && id && parts[2] === "take") {
          const body = await readBody(req);
          const r = state.rosters[id]; if (!r) return json(res, 404, { error: "no such roster" });
          const station = String(body.station ?? "").trim(); if (!station) return json(res, 400, { error: "station required" });
          if (r.takenBy && r.takenBy.station !== station) return json(res, 409, { error: "already taken", takenBy: r.takenBy });
          r.takenBy = { station, operator: String(body.operator ?? ""), at: now_() }; save();
          console.log(`[hub] ${new Date().toLocaleTimeString()} ${station}: took order ${r.orderNumber || r.id}`);
          return json(res, 200, { ok: true, takenBy: r.takenBy });
        }
        if (req.method === "POST" && id && parts[2] === "release") {
          const r = state.rosters[id]; if (!r) return json(res, 404, { error: "no such roster" });
          delete r.takenBy; save();
          return json(res, 200, { ok: true });
        }
        if (req.method === "DELETE" && id) { delete state.rosters[id]; save(); return json(res, 200, { ok: true }); }
      }
      if (kind === "unfinished") {
        pruneUnfinished();
        const pool = (state.unfinished ||= {});
        const time = new Date().toLocaleTimeString();
        if (req.method === "GET" && !id) {
          const q = new URL(req.url, "http://hub").searchParams;
          const term = String(q.get("q") || "").trim().toLowerCase(), st = String(q.get("station") || "").trim().toLowerCase(), all = ["1", "true"].includes(q.get("all"));
          const orders = Object.values(pool)
            .filter(u => all || !u.closed)
            .filter(u => !st || String(u.station).toLowerCase() === st || String(u.assignedTo || "").toLowerCase() === st)
            .map(u => ({ u, exact: !!term && String(u.order).trim().toLowerCase() === term }))
            .filter(({ u, exact }) => !term || exact || (term.length >= 3 && String(u.order).toLowerCase().includes(term)))
            .sort((a, b) => (b.exact - a.exact) || ((b.u.updatedAt || 0) - (a.u.updatedAt || 0)))
            .map(x => x.u);
          return json(res, 200, { orders });
        }
        // A station parks an order (or parks it again with what is still out).
        // One entry per station|order|run: parked again, it keeps its id, when
        // it was first parked, the station it was given to and what the
        // supervisor checked off.
        if (req.method === "POST" && !id) {
          const body = await readBody(req);
          const station = String(body.station ?? "").trim(), order = String(body.order ?? "").trim();
          if (!station || !order) return json(res, 400, { error: "station and order required" });
          const run = Number(body.run) || 0, at = now_();
          // Picked up at another station and parked again, it is the same entry (its id comes back).
          const prev = (body.id && pool[body.id]) || Object.values(pool).find(u => u.key === `${station}|${order}|${run}`);
          const key = prev?.key || `${station}|${order}|${run}`;
          const counts = { total: whole(body.total), done: whole(body.done), flagged: whole(body.flagged), missing: whole(body.missing), toScan: whole(body.toScan) };
          // A jersey the supervisor checked off stays checked off, also when the
          // station has not heard of it yet and sends it as still out.
          const settled = new Map((prev?.checkedOff || []).map(j => [jkey(j), j]));
          const all = outOf(body.out), out = all.filter(j => !settled.has(jkey(j)));
          all.filter(j => !out.includes(j)).forEach(j => {
            const f = outCount[j.status]; if (!f) return;   // an extra jersey is in no count
            counts[f] = Math.max(0, counts[f] - 1);
            if (settled.get(jkey(j))?.as === "short") counts.missing++; else counts.done++;
          });
          const newId = prev?.id || at.toString(36) + Math.random().toString(36).slice(2, 6);
          // The whole order goes on the disk first: if it cannot be written the station is told,
          // and keeps the order open rather than lose it.
          let stored = prev?.stored || null;
          if (body.session && typeof body.session === "object") {
            try { stored = { bytes: writeOrder(newId, body.session), at }; }
            catch (e) { console.error(`[hub] ${time} ${station}: order ${order} could NOT be written to the disk: ${e.message}`); return json(res, 507, { error: `the server could not save the order on its disk: ${e.message}` }); }
          }
          const entry = {
            id: newId, key, order, run, station, stored, openOn: null,
            operator: String(body.operator ?? prev?.operator ?? ""), jerseyType: String(body.jerseyType ?? prev?.jerseyType ?? ""),
            kind: String(body.kind ?? prev?.kind ?? ""),   // "sorter" for an order started by a sorter, "" for an inspection: only that role picks it up
            parkedAt: prev?.parkedAt ?? at, updatedAt: at, ...counts, out,
            assignedTo: prev?.assignedTo || "", assignedBy: prev?.assignedBy || "", assignedAt: prev?.assignedAt || 0,
            checkedOff: prev?.checkedOff || [], closed: out.length ? null : (prev?.closed ?? null),
          };
          pool[entry.id] = entry; save();
          console.log(`[hub] ${time} ${station}: parked order ${order} unfinished, ${out.length} garment${out.length === 1 ? "" : "s"} out${prev ? " (again)" : ""}`);
          return json(res, 200, { id: entry.id, entry });
        }
        // The station finished the order the normal way. Gone already is fine.
        if (req.method === "DELETE" && id && parts.length === 2) {
          const u = pool[id]; delete pool[id]; dropOrderFile(id);
          if (u) { save(); console.log(`[hub] ${time} ${u.station}: unfinished order ${u.order} finished, taken off the list`); }
          return json(res, 200, { ok: true });
        }
        const u = id ? pool[id] : null;
        if (id && !u) return json(res, 404, { error: "no such unfinished order" });
        if (req.method === "POST" && parts[2] === "assign") {
          const body = await readBody(req);
          const station = String(body.station ?? "").trim(); if (!station) return json(res, 400, { error: "station required" });
          Object.assign(u, { assignedTo: station, assignedBy: String(body.by ?? ""), assignedAt: now_(), updatedAt: now_() }); save();
          console.log(`[hub] ${time} unfinished order ${u.order} given to ${station}${body.by ? " by " + body.by : ""}`);
          return json(res, 200, { entry: u });
        }
        // The whole order, for a station to pick it up.
        if (req.method === "GET" && parts[2] === "order") {
          const session = u.stored ? readOrder(u.id) : null;
          if (!session) return json(res, 404, { error: "the whole order is not on the server", entry: u });
          return json(res, 200, { session, entry: u });
        }
        // A station opens it: one station at a time. Parking it again, or the supervisor's
        // release, lets the next one in.
        if (req.method === "POST" && parts[2] === "take") {
          const body = await readBody(req);
          const station = String(body.station ?? "").trim(); if (!station) return json(res, 400, { error: "station required" });
          if (u.openOn && u.openOn.station !== station) return json(res, 409, { error: "open on another station", openOn: u.openOn });
          Object.assign(u, { openOn: { station, operator: String(body.operator ?? ""), at: now_() }, assignedTo: "", assignedBy: "", assignedAt: 0, updatedAt: now_() }); save();
          console.log(`[hub] ${time} ${station}: picked up unfinished order ${u.order}`);
          return json(res, 200, { entry: u });
        }
        if (req.method === "POST" && parts[2] === "release") {
          const was = u.assignedTo || u.openOn?.station;
          Object.assign(u, { assignedTo: "", assignedBy: "", assignedAt: 0, openOn: null, updatedAt: now_() }); save();
          console.log(`[hub] ${time} unfinished order ${u.order} taken off ${was || "no station"}`);
          return json(res, 200, { entry: u });
        }
        // The supervisor settles jerseys still out (the owner, 20 Nov 2026: an unfinished
        // order must go somewhere): "pass" — back and good, they count as passed; "short" —
        // the order ships without them (a repair that will not come, a jersey not found).
        // An extra jersey (not on the roster) is closed either way: the supervisor has it.
        // When none is left out the order is closed.
        if (req.method === "POST" && parts[2] === "checkoff") {
          // Not while a station has it open: the station may be passing those very jerseys (seen in a test,
          // 20 Nov 2026: two jerseys passed at the station were shipped short on the board). Free it first.
          if (u.openOn) return json(res, 409, { error: "open on a station", openOn: u.openOn });
          const body = await readBody(req);
          const ids = new Set((Array.isArray(body.ids) ? body.ids : []).map(String));
          const as = body.as === "short" ? "short" : "pass";
          const by = String(body.by ?? "").trim(), at = now_();
          const off = (u.out || []).filter(j => body.all ? true : ids.has(jkey(j)));
          if (off.length) {
            u.out = u.out.filter(j => !off.includes(j));
            off.forEach(j => {
              const f = outCount[j.status]; if (!f) return;   // an extra jersey is in no count
              u[f] = Math.max(0, (u[f] || 0) - 1);
              if (as === "short") u.missing = (u.missing || 0) + 1; else u.done = (u.done || 0) + 1;
            });
            u.checkedOff = [...(u.checkedOff || []), ...off.map(j => ({ ...j, by, at, as: j.status === "extra" ? "done" : as }))];
            u.updatedAt = at;
            if (!u.out.length) u.closed = { by, at };
            checkOffInLedger(u, off, by, at, as);
            save();
            console.log(`[hub] ${time} ${u.station}: ${off.length} garment${off.length === 1 ? "" : "s"} of unfinished order ${u.order} ${as === "short" ? "shipped short" : "checked off"}${by ? " by " + by : ""}${u.closed ? ", order closed" : ""}`);
          }
          return json(res, 200, { entry: u });
        }
      }
      // Boxes left open for an order that ships with this one (the owner, 20 Nov 2026: a
      // half-full box waits for the ship-with order, of the same team or customer, and is
      // closed when it is full). The next order takes them at its start: one station each.
      if (kind === "openboxes") {
        const pool = (state.openBoxes ||= {});
        const time = new Date(now_()).toLocaleTimeString();
        for (const [k, b] of Object.entries(pool)) if (now_() - (b.at || 0) > 90 * 86400000) delete pool[k];   // 90 days, like the ledger
        if (req.method === "GET" && !id) {
          const want = new Set(String(new URL(req.url, "http://hub").searchParams.get("orders") || "").split(",").map(s => s.trim()).filter(Boolean));
          const boxes = Object.values(pool).filter(b => !b.takenBy && (!want.size || (b.orders || []).some(o => want.has(String(o))))).sort((a, b) => (a.at || 0) - (b.at || 0));   // a box taken by the next order is kept only as a mark (below), never offered
          return json(res, 200, { boxes });
        }
        if (req.method === "POST" && !id) {
          const body = await readBody(req);
          const list = Array.isArray(body.boxes) ? body.boxes.slice(0, 200) : [];
          const station = String(body.station ?? ""), from = String(body.order ?? ""), run = Number(body.run) || 0;
          if (!list.length && !run) return json(res, 400, { error: "boxes required" });
          // Each Finish order of a ship-with order sends the WHOLE set of boxes it leaves open, also
          // none: the set replaces what an earlier Finish of the same station, order and run left
          // ("Back to this order", or a reload, then Finish once more). A box left open before and
          // closed now goes; a box still open keeps its entry and id. A box the next order has taken
          // since is not made again: it is in that order's hands, and the station is told (code
          // review M15: every Finish used to add another copy of every box).
          const mine = run ? Object.values(pool).filter(x => x.station === station && x.from === from && (x.run || 0) === run) : [];
          const wanted = new Set(list.map(b => String(b.bin ?? "")));
          mine.filter(x => !x.takenBy && !wanted.has(x.bin)).forEach(x => delete pool[x.id]);
          const taken = [];
          const ids = list.map((b, i) => {
            const same = mine.find(x => x.bin === String(b.bin ?? ""));
            if (same?.takenBy) { taken.push({ bin: same.bin, order: same.takenBy.order, station: same.takenBy.station }); return null; }
            const bid = same?.id || now_().toString(36) + i.toString(36) + Math.random().toString(36).slice(2, 5);
            pool[bid] = { run, id: bid, orders: [...new Set((b.orders || []).map(String).filter(Boolean))].slice(0, 20), by: String(b.by ?? "team"), key: String(b.key ?? ""), label: String(b.label ?? ""), bin: String(b.bin ?? ""),
              items: (Array.isArray(b.items) ? b.items : []).slice(0, 500).map(x => ({ order: String(x?.order ?? ""), number: String(x?.number ?? ""), name: String(x?.name ?? ""), size: String(x?.size ?? ""), team: String(x?.team ?? "") })),
              station: String(body.station ?? ""), from: String(body.order ?? ""), at: now_() };
            return bid;
          }).filter(Boolean);
          save();
          console.log(`[hub] ${time} ${body.station || "?"}: order ${body.order || "?"} finished with ${ids.length} box${ids.length === 1 ? "" : "es"} left open for the order it ships with`);
          return json(res, 200, { ids, taken });
        }
        const b = id ? pool[id] : null;
        if (id && (!b || (b.takenBy && req.method !== "DELETE"))) return json(res, 404, { error: "no such open box (another station may have taken it)" });
        if (req.method === "POST" && parts[2] === "take") {
          const body = await readBody(req);
          // Kept as a mark (not offered again) until the 90 days are up, so a Finish of the order
          // that left it does not make it again (M15).
          const box = { ...b };   // what the taking station gets: everything in it
          b.takenBy = { station: String(body.station ?? ""), order: String(body.order ?? ""), at: now_() }; b.items = []; save();
          console.log(`[hub] ${time} ${body.station || "?"}: order ${body.order || "?"} took open box ${box.bin} (${box.label}, ${box.items.length} in it, from order ${box.from})`);
          return json(res, 200, { box });
        }
        if (req.method === "DELETE" && id) { delete pool[id]; save(); return json(res, 200, { ok: true }); }
      }
      if (kind === "boxes" && !id) {
        if (req.method === "GET") return json(res, 200, { model: boxFit(), answers: (state.boxAnswers || []).length });
        if (req.method === "POST") {
          const body = await readBody(req);
          const counts = Object.fromEntries(BOX_FEATURES.map(f => [f, Math.floor(Number(body.counts?.[f])) || 0]).filter(([, n]) => n > 0 && n < 1000));
          if (!BOX_IDS.includes(body.box) || !Object.keys(counts).length) return json(res, 400, { error: "counts and box required" });
          (state.boxAnswers ||= []).push({ counts, box: body.box, suggested: String(body.suggested ?? ""), station: String(body.station ?? ""), order: String(body.order ?? "").slice(0, 40), bin: String(body.bin ?? "").slice(0, 20), at: now_() });
          if (state.boxAnswers.length > 3000) state.boxAnswers = state.boxAnswers.slice(-3000);
          boxModel = null; save();
          console.log(`[hub] ${new Date().toLocaleTimeString()} ${body.station ? body.station + ": " : ""}bin ${body.bin ?? "?"} of order ${body.order || "—"} went in: ${body.box}${body.suggested && body.suggested !== body.box ? ` (suggested ${body.suggested})` : ""}`);
          return json(res, 200, { model: boxFit(), answers: state.boxAnswers.length });
        }
      }
      if (kind === "print" && !id) {
        if (req.method === "GET") { const station = new URL(req.url, "http://hub").searchParams.get("station"); return json(res, 200, { printer: await labelPrinter(station), printers: await printerList(), labelSize: labelSpec, flagPrinter: await ticketPrinter(station), flagLabelSize: flagSpecOf(station) }); }
        if (req.method === "POST") {
          const body = await readBody(req);
          // A label that is not an object is dropped before the job is built (nothing
          // can be printed from it); none left is a 400.
          const labels = Array.isArray(body.labels) ? body.labels.slice(0, 100).filter(l => l && typeof l === "object") : [];
          if (!labels.length) return json(res, 400, { error: "labels required" });
          const kind = ["jersey", "flag", "binlist", "binticket"].includes(body.kind) ? body.kind : "bin";
          // The roll the station chose for this kind of label (Settings → Label printer;
          // the owner, 25 Nov 2026): the label is laid out for it, and a 1 x 0.5 one goes
          // to the station's sticker printer, the others to its ticket printer. With no
          // roll sent (an older station) it is as before: flag tickets, lists and box
          // labels on the ticket roll, stickers on the sticker roll, sizes from .env.local.
          const roll = LABEL_ROLLS.includes(body.roll) ? body.roll : null;
          const onTicketRoll = roll ? roll !== "1x0.5" : kind === "flag" || kind === "binlist" || kind === "binticket";
          const name = await (onTicketRoll ? ticketPrinter : labelPrinter)(body.station); if (!name) return json(res, 503, { error: "no label printer" });
          // `count`: the labels that really come out. On a tall roll the lists are
          // re-paged (repageLists) onto fewer labels than were sent; the station
          // says this number, not its own.
          const spec = roll || (onTicketRoll ? flagSpecOf(body.station) : labelSpec);
          const job = printJob(labels, labelDots(spec), kind), n = job.count;
          try { await print(name, job.zpl); }
          catch (e) { lastPrint = { at: now_(), ok: false, printer: name, station: body.station || "", what: kind, error: e.message }; console.error(`[hub] print on ${name} failed: ${e.message}`); return json(res, 502, { error: `print failed: ${e.message}` }); }
          lastPrint = { at: now_(), ok: true, printer: name, station: body.station || "", what: kind };
          const what = kind === "jersey" ? (n === 1 ? `sticker bin ${labels[0].bin || "—"} ${labels[0].value || ""}` : `${n} stickers`)
            : kind === "flag" ? (n === 1 ? `flag ticket #${labels[0].number || "?"} ${labels[0].tag || ""}${labels[0].spots?.length ? ` (${labels[0].spots.length} marked)` : ""}` : `${n} flag tickets`)
            : kind === "binlist" ? `${n} bin list label${n === 1 ? "" : "s"} (bin ${[...new Set(labels.map(l => l.bin))].join(", ")})`
            : `${n} bin label${n === 1 ? "" : "s"}`;
          console.log(`[hub] ${new Date().toLocaleTimeString()} ${body.station ? body.station + ": " : ""}printed ${what} on ${name} (${spec} in)${labels[0]?.orderNumber ? ` for order ${labels[0].orderNumber}` : ""}`);
          return json(res, 200, { ok: true, printer: name, count: n });
        }
      }
      return json(res, 404, { error: "unknown hub route" });
    } catch (e) {
      return json(res, 400, { error: e.message });
    }
  }

  // An address typed without https:// sends plain HTTP to the TLS port. Node
  // reports that as a TLS client error; answer it on the raw socket with a
  // redirect to the same address over https, instead of a blank page.
  const redirectPlainHttp = httpServer => {
    httpServer?.on?.("tlsClientError", (err, tlsSocket) => {
      if (err?.code !== "ERR_SSL_HTTP_REQUEST") return;
      const raw = tlsSocket?._parent || tlsSocket;
      try {
        const a = String(raw.localAddress || "").replace(/^::ffff:/, "");            // IPv4 arrives as ::ffff:192.168.0.189
        const host = a === "::1" ? "localhost" : a.includes(":") ? `[${a}]` : a;
        const to = `https://${host}:${raw.localPort}/`;
        raw.write(`HTTP/1.1 302 Found
Location: ${to}
Content-Type: text/html
Connection: close

<a href="${to}">Use ${to}</a>
`);
        raw.end();
      } catch { /* the socket is already gone */ }
    });
  };

  // The admin panel's "clear test data" (phase 5, development and testing only; admin-plugin.js
  // refuses it on production and makes a backup first): the stations, rosters, ledger,
  // unfinished orders and open boxes go; the box model's answers stay (they teach every
  // station). Written at once.
  const clearTestData = () => {
    if (blocked) throw new Error(`the hub is blocked: ${blocked}`);
    state = { stations: {}, rosters: {}, boxAnswers: state.boxAnswers || [] };
    boxModel = null;
    let files = 0;
    try { for (const f of fs.readdirSync(orderDir)) if (f.endsWith(".json")) { fs.unlinkSync(path.join(orderDir, f)); files++; } } catch { /* no orders folder */ }
    writeNow();
    return { files };
  };
  hubs.set(key, { close, handle, flush, blocked: () => blocked, state: () => state, orderDir, clearTestData,
    // the admin panel's printer page (phase 3): the queues, which one each station uses and why, the last print, a test label
    printing: { queues: () => printerList(), why: whyPrinter, last: () => lastPrint, test: testPrint, env: { printer: printerName, flagPrinter: flagName, stations: { ...perStation }, flagStations: { ...perStationFlag }, labelSize: labelSpec, flagLabelSize: flagSpec } } });   // the admin panel reads these (admin-plugin.js), read only
  return { handle, redirectPlainHttp, state: () => state, flush: writeNow, close, blocked: () => blocked };
}

// The Vite plugin: the hub's routes under /api/hub on the dev server that
// vite.config.js (or vite.config.stage.js) starts.
export const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export default function hubPlugin(opts = {}) {
  const { handle, redirectPlainHttp, close } = createHub(opts);
  return {
    name: "jersey-hub",
    buildEnd() { close(); },   // the dev server closing: what is pending is written first; a replaced hub was closed already (M20)
    configureServer(server) {
      server.middlewares.use("/api/hub", (req, res) => { handle(req, res); });
      redirectPlainHttp(server.httpServer);
    },
  };
}
