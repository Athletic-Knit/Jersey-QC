// Operator simulation: thousands of whole orders worked the way the floor
// works them, through the app's real libraries — roster files with every
// quirk Excel produces, a camera that makes the mistakes the real one makes,
// an operator who scans, picks, types, flags, un-checks and resolves, then the
// exports, the hub snapshot, the day sheet and the saved session.
//
// The result screens' policy (what each read becomes) is re-stated here from
// App.jsx: exact → green; duplicate → "already passed"; pick/close → yellow
// list; none → NOT FOUND; nothing read → COULD NOT READ (retry).
//
//   SIM_ORDERS=5000 npx vitest run operator-sim     (default 1500 orders)
//
// Hard rules (the test fails):
//   A. a green is never a different jersey from the one on the table
//   B. "already passed" is never shown for a jersey that is still open
//   C. every order can be finished: every row ends with a status
//   D. the snapshot's counts add up; the QC sheet has one line per row
//   E. the saved session survives a round trip and never exceeds localStorage
//   F. the log CSV round-trips through the CSV splitter
// Soft findings are printed as a report: yellow rate, by-hand rate, time lost.
/* global process */
import { describe, it, expect } from "vitest";

// A localStorage for persist.js, with the browser's ~5 MB limit.
const store = {};
globalThis.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { if (String(v).length > 5_000_000) throw new Error("QuotaExceededError"); store[k] = String(v); },
  removeItem: k => { delete store[k]; },
};

import { parseCSV, splitCSVLine, buildBinMap, binFor, displayColumns } from "../roster.js";
import { findMatches, isDone } from "../match.js";
import { norm, normNum, nameMatches } from "../text.js";
import { buildRosterSheet, buildLogCSV, buildDaySheets, localTimeStamp } from "../export.js";
import { snapshotOf } from "../hub.js";
import { saveSession, loadSession, clearSession } from "../persist.js";
import { buildDamageRows } from "../damage.js";
import { reasonsFor, JERSEY_TYPES } from "../../config.js";

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const pick = (r, a) => a[Math.floor(r() * a.length)];
const chance = (r, p) => r() < p;
const shuffle = (r, a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

const LAST = ["Smith", "Nguyen", "Côté", "O'Brien", "Smith-Jones", "Van der Berg", "Evanovich", "Stephenson", "Leach", "Donnelly", "Samuel", "Rine", "Brown", "Martin", "Tremblay", "Gagné", "St. Pierre", "Lee", "Li", "Wong", "Mac Donald", "McDonald", "De La Cruz", "Jr. Miller", "Ng", "Ó Súilleabháin", "Zhang", "Kowalski", "Papadopoulos", "Ivanova"];
const FIRST = ["Jordan", "Alex", "Sam", "Taylor", "Chris", "Jamie"];
const TEAMS = ["Ravens", "Red", "Blue", "Sky Blue", "Black", "White", "Forest Green", "Gold", "Hawks", "Eagles", "Navy"];
const SIZES = ["A-XS", "A-S", "A-M", "A-L", "A-XL", "A-2XL", "Y-S", "Y-M", "Y-L"];

// ── A roster the way a customer's sheet arrives ──────────────────────────────
function makeOrder(r) {
  const n = chance(r, 0.1) ? 1 + Math.floor(r() * 4) : 5 + Math.floor(r() * (chance(r, 0.15) ? 150 : 40));
  const teams = chance(r, 0.5) ? [pick(r, TEAMS)] : shuffle(r, TEAMS).slice(0, 2 + Math.floor(r() * 2));
  const namelessShare = pick(r, [0, 0, 0.1, 0.5, 1]);
  const rows = [];
  const used = new Set();
  for (let i = 0; i < n; i++) {
    const team = pick(r, teams);
    let number;
    const roll = r();
    if (roll < 0.02) number = "00";
    else if (roll < 0.04) number = "0";
    else if (roll < 0.06) number = String(100 + Math.floor(r() * 50));
    else if (roll < 0.30) number = String(Math.floor(r() * 10));
    else number = String(Math.floor(r() * 100));
    if (chance(r, 0.03)) number = "";                                   // no number on the sheet
    // numbers repeat across teams (two teams, each with a #7) and, rarely, within one
    if (number && used.has(team + "|" + number) && !chance(r, 0.03)) { i--; continue; }
    used.add(team + "|" + number);
    const first = chance(r, 0.15) ? pick(r, FIRST) : "";
    let name = chance(r, namelessShare) ? "" : (first ? first + " " + pick(r, LAST) : pick(r, LAST));
    if (!name && !number) { i--; continue; }
    if (chance(r, 0.05)) name = name.toUpperCase();
    if (chance(r, 0.05)) name = name + "  ";
    if (chance(r, 0.03) && number.length === 1) number = "0" + number;     // "07" on the sheet
    rows.push({ name, number, team, size: pick(r, SIZES), goalie: chance(r, 0.05) ? "Y" : "", first });
  }
  // the same jersey twice on the sheet (two sizes, or a plain repeat)
  if (rows.length > 3 && chance(r, 0.2)) { const src = pick(r, rows); rows.push({ ...src, size: chance(r, 0.5) ? pick(r, SIZES) : src.size }); }
  return { rows, teams, jerseyType: pick(r, JERSEY_TYPES).id };
}

// Write it as the kinds of CSV Excel and people make, then read it back with
// the app's parser. The parsed rows are the truth the pile is built from.
function toCSV(r, order) {
  const delim = pick(r, [",", ",", ";", "\t"]);
  const headers = { name: pick(r, ["Name", "name", "Player", "Last Name", "PLAYER NAME"]), number: pick(r, ["Number", "No.", "#", "Jersey #", "NUM", "number"]), team: pick(r, ["Team", "Club", "team"]), size: pick(r, ["Size", "size"]) };
  const splitSize = chance(r, 0.3);   // "Size Range" + "Size" columns
  const cols = shuffle(r, ["name", "number", "team", "size", "goalie"]);
  const head = cols.map(c => c === "size" && splitSize ? ["Size Range", "Size"] : c === "goalie" ? ["Goalie"] : [headers[c]]).flat();
  const cell = v => { v = String(v ?? ""); return /[",;\t\n]/.test(v) || (chance(r, 0.1) && v) ? `"${v.replace(/"/g, '""')}"` : v; };
  const lines = [];
  if (chance(r, 0.2)) lines.push("Order 4521 — Ravens 2026", "");            // title rows above the header
  lines.push(head.map(cell).join(delim));
  for (const row of order.rows) {
    const cells = cols.map(c => {
      if (c === "size" && splitSize) { const [range, size] = row.size.split("-"); return [range, size]; }
      if (c === "goalie") return [row.goalie];
      return [row[c]];
    }).flat();
    lines.push(cells.map(cell).join(delim));
    if (chance(r, 0.03)) lines.push("");                                      // blank lines
  }
  return (chance(r, 0.3) ? "﻿" : "") + lines.join(chance(r, 0.5) ? "\r\n" : "\n");
}

// ── The camera: what the model reads from the jersey on the table ────────────
const LOOKALIKE = { "0": "8", "1": "7", "2": "7", "3": "8", "5": "6", "6": "8", "7": "1", "8": "3", "9": "0", "4": "4" };
function camera(r, jersey) {
  const num = normNum(jersey.number);
  let read = { name: jersey.name.trim(), number: num, name_complete: true, number_complete: true, laid_flat: true, obstruction: "", number_position: "centre", jersey_colour: "", trim_colour: "" };
  const colourWord = jersey.team.toLowerCase();
  if (chance(r, 0.6)) read.jersey_colour = colourWord;
  // what the shirt actually shows: last name only, upper case
  if (jersey.first && chance(r, 0.8)) read.name = read.name.slice(jersey.first.length).trim();   // the shirt shows the surname
  read.name = read.name.toUpperCase();
  const m = r();
  let kind = "clean";
  if (m < 0.10)      { read.name = ""; kind = "name out of frame"; }
  else if (m < 0.15 && read.name.length > 3) { read.name = read.name.slice(0, 3); read.name_complete = false; kind = "name cut by a fold"; }
  else if (m < 0.20 && num.length === 2) { const side = chance(r, 0.5) ? 0 : 1; read.number = side === 0 ? num[1] : num[0]; read.number_complete = false; read.obstruction = side === 0 ? "hand over the left digit" : "second digit under a fold"; kind = "digit hidden"; }
  else if (m < 0.23 && num) { const i = Math.floor(r() * num.length); read.number = num.slice(0, i) + LOOKALIKE[num[i]] + num.slice(i + 1); kind = "digit misread"; }
  else if (m < 0.26) { read.laid_flat = false; kind = "not flat"; }
  else if (m < 0.28) { read.name = ""; read.number = ""; kind = "nothing read"; }
  else if (m < 0.29) { kind = "api error"; }
  else if (m < 0.30 && num.length === 1) { read.number_position = pick(r, ["left", "right"]); kind = "digit off centre"; }
  if (!num && kind === "clean") kind = "no number on jersey";
  return { read, kind };
}

// Rows that are the same jersey for every practical purpose.
const sameJersey = (a, b) => a === b || (norm(a.name) === norm(b.name) && normNum(a.number) === normNum(b.number) && (a.size || "") === (b.size || "") && norm(a.team) === norm(b.team));

// Seconds the floor spends on each thing (from the pilot: a scan answers in ~1.2 s).
const T = { place: 2, scan: 1.3, green: 0.6, yellow: 2.5, duplicate: 2, byHand: 15, flag: 6, retry: 1.5, unscan: 5 };

// ── One order, start to finish, as the operator lives it ─────────────────────
function workOrder(r, seed, k, stats, findings) {
  const order = makeOrder(r);
  const csv = toCSV(r, order);
  let roster = parseCSV(csv);
  const ctxHead = `order ${k} (seed ${seed})`;
  if (roster.length !== order.rows.length) {
    findings.push(`${ctxHead}: the file had ${order.rows.length} rows but ${roster.length} were read — first line ${JSON.stringify(csv.split(/\r?\n/)[0])}`);
    stats.parseLoss++;
    if (!roster.length) return;
  }
  const binMap = buildBinMap(roster);
  const binOf = team => binFor(binMap, team);
  const operator = pick(r, ["Arshil", "Sam O'Neil", "Priya"]);
  const reasons = reasonsFor(order.jerseyType).filter(x => !x.inPlace && !x.custom);
  let log = [];
  let nextId = 1;
  let seconds = 0;
  const stamp = () => ({ timestamp: localTimeStamp(new Date(2026, 9, 22, 8, 0, Math.floor(seconds))), operator });
  const setRow = (id, scanned) => { roster = roster.map(x => x._id === id ? { ...x, scanned } : x); };
  const add = entry => { log = [{ id: nextId++, ...entry, ...stamp() }, ...log]; return log[0]; };

  // The pile: every jersey once, in a random order, plus a stray from another
  // order and a jersey that gets scanned twice.
  let pile = shuffle(r, roster.map(x => ({ truth: x, extra: false })));
  if (chance(r, 0.15)) { let stray, tries = 0; do { stray = { name: pick(r, LAST), number: String(Math.floor(r() * 100)), team: "other", size: "A-M", _id: -1 }; } while (++tries < 50 && roster.some(x => normNum(x.number) === normNum(stray.number) && (!x.name || nameMatches(stray.name, x.name)))); if (tries < 50) pile.splice(Math.floor(r() * pile.length), 0, { truth: stray, extra: true }); }
  if (pile.length > 1 && chance(r, 0.2)) { const dup = pick(r, pile); pile.splice(Math.floor(r() * pile.length), 0, { ...dup, again: true }); }

  const byHand = (truth, why) => {
    seconds += T.byHand; stats.byHand++; stats.byHandWhy[why] = (stats.byHandWhy[why] || 0) + 1;
    const m = findMatches(roster, truth.name, truth.number, { typed: true });
    if (process.env.SIM_TRACE && Number(process.env.SIM_TRACE) === k) console.log(`[trace]    BY HAND #${truth.number} "${truth.name}" → ${m.type} ${m.match ? `#${m.match.number} ${m.match.team} ${m.match.size}` : ""} ${m.candidates ? JSON.stringify(m.candidates.map(c => [c.number, c.team, c.size, c.scanned || "open"])) : ""}`);
    if (m.type === "exact") { setRow(m.match._id, "manual"); add({ match: m.match, status: "manual", reason: "Entered by operator — the camera could not read it" }); return; }
    if (m.type === "pick" || m.type === "close") {
      const c = m.candidates.find(x => sameJersey(x, truth) && !isDone(x));
      if (c) { setRow(c._id, "manual"); add({ match: c, status: "manual", reason: "Entered by operator — the camera could not read it" }); return; }
    }
    if (m.type === "duplicate" || roster.some(x => sameJersey(x, truth) && isDone(x))) { stats.dupOnByHand++; return; }   // its row is done: the list greys it, the operator flags a duplicate
    if (truth._id === -1) { add({ match: { ...truth, offRoster: true }, status: "flagged", reason: "Not on the roster — operator typed it", photo: "data:image/jpeg;base64," + "x".repeat(40_000) }); seconds += T.flag; stats.offRosterFlag++; return; }
    const truthNow = roster.find(x => x._id === truth._id);
    const rel = x => normNum(x.number) === normNum(truth.number) || (truth.name && norm(x.name) === norm(truth.name));
    findings.push(`${ctxHead}: by hand for #${truth.number} ${truth.name} ${truth.team} ${truth.size} [row now ${truthNow?.scanned || "open"}] (${why}) got ${m.type} — ${JSON.stringify(m.candidates?.map(c => [c.number, c.name, c.size, c.scanned || ""]))}; history ${JSON.stringify(log.filter(l => l.match && rel(l.match)).reverse().map(l => [l.status, l.match.number, l.match.size, (l.reason || "").slice(0, 30)]))}`);
    stats.byHandFail++;
  };

  for (const item of pile) {
    const truth = item.truth;
    seconds += T.place;
    let done = false;
    for (let attempt = 0; attempt < 3 && !done; attempt++) {
      seconds += T.scan; stats.scans++;
      const { read, kind } = camera(r, truth);
      stats.kinds[kind] = (stats.kinds[kind] || 0) + 1;
      if (kind === "api error") { seconds += T.retry; stats.retries++; continue; }
      const m = (!read.name && !read.number) ? null : findMatches(roster, read.name, read.number, { nameComplete: read.name_complete, numberComplete: read.number_complete, position: read.number_position, obstruction: read.obstruction, colour: read.jersey_colour, trim: read.trim_colour, laidFlat: read.laid_flat });
      const detected = { ...read, number_complete: read.number_complete, laid_flat: read.laid_flat };
      const related = x => normNum(x.number) === normNum(truth.number) || normNum(x.number) === normNum(read.number) || (truth.name && norm(x.name) === norm(truth.name));
      const ctx = () => `${ctxHead}: jersey #${truth.number} "${truth.name}" ${truth.team} ${truth.size}${item.again ? " (scanned AGAIN)" : ""}${item.extra ? " (STRAY)" : ""}, camera ${kind} → read #${read.number}${read.number_complete ? "" : "?"} "${read.name}"${read.name_complete ? "" : "…"}${read.laid_flat ? "" : " [not flat]"} colour "${read.jersey_colour}"; related rows ${JSON.stringify(roster.filter(related).map(x => [x.number, x.name, x.team, x.size, x.scanned || "open"]))}; history ${JSON.stringify(log.filter(l => l.match && related(l.match)).reverse().map(l => [l.status, l.match.number, l.match.size, l.reason || ""]))}`;
      if (process.env.SIM_TRACE && Number(process.env.SIM_TRACE) === k) console.log(`[trace] #${truth.number} "${truth.name}" ${truth.team} ${truth.size}${item.again ? " AGAIN" : ""}${item.extra ? " STRAY" : ""} | ${kind} → #${read.number} "${read.name}" ${read.jersey_colour} | ${m ? m.type : "null"} ${m?.match ? `→ #${m.match.number} ${m.match.team} ${m.match.size}` : ""} ${m?.candidates ? JSON.stringify(m.candidates.map(c => [c.number, c.team, c.size, c.scanned || "open"])) : ""}`);
      if (m === null) { seconds += T.retry; stats.retries++; continue; }                  // COULD NOT READ → scan again
      if (m.type === "exact") {
        const g = m.match;
        if (item.again && !sameJersey(g, truth) && norm(g.name) === norm(truth.name) && normNum(g.number) === normNum(truth.number)) { stats.twinRescan++; seconds += T.retry; done = true; continue; }
        const consumed = !item.extra && !sameJersey(g, truth) && roster.some(x => sameJersey(x, truth) && isDone(x));   // its own row was taken by an earlier misread
        if (item.extra || !sameJersey(g, truth)) { if (kind === "digit misread") stats.misreadGreen++; else if (consumed) stats.misreadChain++; else { findings.push(`A WRONG GREEN: ${ctx()} → green on #${g.number} "${g.name}" ${g.team} ${g.size}`); stats.wrongGreen++; } }
        seconds += T.green; stats.greens++; stats.greenByKind[kind] = (stats.greenByKind[kind] || 0) + 1;
        setRow(g._id, "pass"); add({ detected, match: g, status: "pass", thumb: "t".repeat(6_000) });
        done = true; continue;
      }
      if (m.type === "duplicate") {
        const alreadyDone = !item.extra && roster.some(x => sameJersey(x, truth) && isDone(x)) && !roster.some(x => sameJersey(x, truth) && !isDone(x));
        if (!alreadyDone) { if (kind === "digit misread" || item.extra) stats.misreadDup++; else { findings.push(`B WRONG DUPLICATE: ${ctx()} → "already passed" on #${m.match.number} ${m.match.name}`); stats.wrongDup++; } seconds += T.retry; continue; }
        seconds += T.duplicate; stats.dups++;
        if (!item.again) add({ detected, match: m.match, status: "flagged", reason: "Duplicate — scanned again after passing", photo: "data:image/jpeg;base64," + "x".repeat(40_000) });
        done = true; continue;
      }
      if ((m.type === "pick" || m.type === "close") && item.again && roster.some(x => sameJersey(x, truth) && isDone(x)) && !m.candidates.some(x => sameJersey(x, truth) && !isDone(x))) { stats.dups++; seconds += T.duplicate; done = true; continue; }
      if (m.type === "pick" || m.type === "close") {
        seconds += T.yellow; stats.yellows++; stats.yellowByKind[kind] = (stats.yellowByKind[kind] || 0) + 1;
        stats.listLen.push(m.candidates.length);
        const c = m.candidates.find(x => sameJersey(x, truth) && !isDone(x));
        if (process.env.SIM_TRACE && Number(process.env.SIM_TRACE) === k) console.log(`[trace]    operator picks ${c ? `#${c.number} ${c.team} ${c.size}` : "nothing → by hand"}`);
        if (c) { seconds += T.green; setRow(c._id, "pass"); add({ detected, match: c, status: "pass", thumb: "t".repeat(6_000) }); done = true; continue; }
        if (item.extra) { seconds += T.flag; stats.offRosterFlag++; add({ detected, match: null, status: "flagged", reason: "Not on the roster", photo: "data:image/jpeg;base64," + "x".repeat(40_000) }); done = true; continue; }
        const open = roster.some(x => sameJersey(x, truth) && !isDone(x));
        if (open) { stats.listMissing++; stats.listMissingByKind[kind] = (stats.listMissingByKind[kind] || 0) + 1; if (kind === "clean") findings.push(`list without the jersey on a CLEAN read: ${ctx()} → ${JSON.stringify(m.candidates.map(x => [x.number, x.name]))}`); }
        byHand(truth, "not on the yellow list (" + kind + ")"); done = true; continue;
      }
      // none
      if (item.extra) { seconds += T.flag; stats.offRosterFlag++; add({ detected, match: null, status: "flagged", reason: `"${read.name}" #${read.number} is not on this roster`, photo: "data:image/jpeg;base64," + "x".repeat(40_000) }); done = true; continue; }
      stats.notFound++; stats.notFoundByKind[kind] = (stats.notFoundByKind[kind] || 0) + 1;
      if (kind === "clean") findings.push(`NOT FOUND on a CLEAN read: ${ctx()}`);
      byHand(truth, "not found (" + kind + ")"); done = true;
    }
    if (!done) byHand(truth, "three scans failed");

    // Things the operator does now and then
    if (chance(r, 0.03) && reasons.length) {                       // a damaged jersey: flag it with a reason
      const last = log[0]; if (last?.status === "pass" && last.match) { const reason = pick(r, reasons); setRow(last.match._id, "flag"); add({ detected: last.detected, match: last.match, status: "flagged", reason: reason.label, reasonId: reason.id, photo: "data:image/jpeg;base64," + "x".repeat(40_000) }); seconds += T.flag; stats.damageFlags++; }
    }
    if (chance(r, 0.01)) {                                         // confirmed the wrong size by mistake: un-check and scan again
      const passed = roster.filter(x => x.scanned === "pass"); if (passed.length) { const u = pick(r, passed); if (process.env.SIM_TRACE && Number(process.env.SIM_TRACE) === k) console.log(`[trace] UN-CHECK #${u.number} ${u.team} ${u.size}`); setRow(u._id, false); add({ match: { ...u, scanned: false }, status: "undo", reason: "Un-checked — was passed; scan it again" }); pile.push({ truth: u, extra: false }); seconds += T.unscan; stats.unscans++; }
    }
  }

  // The supervisor's decisions on flags (accept / reject / note), as resolveFlag does
  for (const l of log.filter(x => x.status === "flagged" && x.match && x.match._id !== undefined)) {
    const d = pick(r, ["accept", "reject", "note", "none"]);
    if (d === "none") continue;
    if (d === "accept") { setRow(l.match._id, "pass"); log = log.map(x => x.id === l.id ? { ...x, status: "manual", resolution: "Accepted — manually verified" } : x); }
    else if (d === "reject") { log = log.map(x => x.id === l.id ? { ...x, status: "manual", resolution: "Rejected — sent back for rework" } : x); }
    else log = log.map(x => x.id === l.id ? { ...x, resolution: "Note added" } : x);
  }
  // What is still open at the end: the operator marks it missing or short-shipped
  for (const x of roster.filter(x => !x.scanned)) { stats.openAtEnd++; setRow(x._id, chance(r, 0.5) ? "missing" : "short"); }

  // C. finished
  const remaining = roster.filter(x => !x.scanned).length;
  expect(remaining, "C every row has a status: " + ctxHead).toBe(0);

  // D. snapshot and QC sheet
  const snap = snapshotOf({ operatorName: operator, role: "inspector", orderNumber: String(1000 + k), notes: "", jerseyType: order.jerseyType, rosterFile: "sim.csv", roster, log, lastConfirmed: log.find(l => l.status === "pass") || null, binMap });
  const c = snap.counts;
  expect(c.pass + c.flag + c.manual + c.missing + c.short + c.remaining, "D counts add up: " + ctxHead).toBe(c.total);
  expect(c.total).toBe(roster.length);
  if (log.length > 400) stats.over400++;
  const sheet = buildRosterSheet(roster, log, { orderNumber: String(1000 + k), operatorName: operator, jerseyType: order.jerseyType }, displayColumns(roster), binOf);
  expect(sheet.length - 7, "D one QC line per row: " + ctxHead).toBe(roster.length);
  for (const line of sheet.slice(7)) expect(["PASS", "FLAGGED", "MANUAL", "MISSING", "SHORT-SHIPPED"]).toContain(line[0]);
  const binsUsed = new Set(roster.map(x => binOf(x.team)).filter(b => b !== null));
  if (order.teams.length > 1 && binsUsed.size !== new Set(roster.map(x => norm(x.team))).size) findings.push(`${ctxHead}: ${new Set(roster.map(x => x.team)).size} teams but ${binsUsed.size} bins`);

  // F. log CSV round trip
  const csvOut = buildLogCSV(log, binOf);
  const lines = csvOut.split("\r\n");
  expect(lines.length - 1, "F one CSV line per log entry: " + ctxHead).toBe(log.length);
  const width = splitCSVLine(lines[0], ",").length;
  for (const l of lines.slice(1)) expect(splitCSVLine(l, ",").length, "F CSV columns: " + ctxHead).toBe(width);

  // E. the saved session round trip within the browser's limit
  clearSession();
  saveSession({ sessionStarted: true, role: "inspector", roster, rosterFile: "sim.csv", orderNumber: String(1000 + k), operatorName: operator, notes: "", jerseyType: order.jerseyType, log, binMap, firstScanTime: 1 });
  const back = loadSession();
  if (!back) { findings.push(`E SESSION NOT SAVED: ${ctxHead} — ${roster.length} rows, ${log.length} log lines, ${log.filter(l => l.photo).length} photos, ${log.filter(l => l.thumb).length} thumbs; body ${JSON.stringify({ roster, log }).length} chars`); stats.sessionLost++; }
  else { expect(back.roster.length).toBe(roster.length); expect(back.log.length).toBe(log.length); if (back.log.some(l => l.thumb === undefined && log.find(x => x.id === l.id)?.thumb)) findings.push(`E thumbs lost: ${ctxHead}`); }

  // The day sheet and the damage report from this order's events
  const events = snap.events.map(e => ({ ...e, station: "st-station1" }));
  const day = buildDaySheets({ date: "2026-10-22", events, orders: [{ station: "st-station1", order: String(1000 + k), operator, counts: c, rows: snap.rows }] }, id => id);
  const passedOnSheet = day.summary[2][5];
  const passedTrue = events.filter(e => e.status === "pass").length - events.filter(e => e.status === "undo").length;
  expect(passedOnSheet, "day sheet passed count: " + ctxHead).toBe(Math.max(0, passedTrue));
  const dmg = buildDamageRows(events, { stationLabel: id => id });
  expect(dmg.length).toBe(events.filter(e => e.status === "flagged").length);

  stats.orders++; stats.jerseys += roster.length; stats.seconds += seconds;
  stats.perHour.push(roster.length / (seconds / 3600));
}

describe("operator simulation: whole orders, the way the floor works them", () => {
  const N = Number(process.env.SIM_ORDERS) || 1500;
  it(`${N} orders end to end`, { timeout: 600_000 }, () => {
    const seed = Number(process.env.SIM_SEED) || 20261022;
    const r = rng(seed);
    const stats = { orders: 0, jerseys: 0, seconds: 0, scans: 0, greens: 0, yellows: 0, dups: 0, retries: 0, byHand: 0, byHandFail: 0, dupOnByHand: 0, offRosterFlag: 0, damageFlags: 0, unscans: 0, notFound: 0, listMissing: 0, wrongGreen: 0, wrongDup: 0, misreadGreen: 0, misreadDup: 0, misreadChain: 0, twinRescan: 0, openAtEnd: 0, parseLoss: 0, over400: 0, sessionLost: 0, kinds: {}, greenByKind: {}, yellowByKind: {}, listMissingByKind: {}, notFoundByKind: {}, byHandWhy: {}, listLen: [], perHour: [] };
    const findings = [];
    for (let k = 0; k < N; k++) workOrder(r, seed, k, stats, findings);

    const pct = (a, b) => b ? (100 * a / b).toFixed(1) + "%" : "—";
    const sorted = [...stats.perHour].sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)] || 0;
    const listMed = [...stats.listLen].sort((a, b) => a - b)[Math.floor(stats.listLen.length / 2)] || 0;
    const report = [
      `OPERATOR SIMULATION — ${stats.orders} orders, ${stats.jerseys} jerseys, ${stats.scans} scans (seed ${seed})`,
      `  camera: ${Object.entries(stats.kinds).map(([k, v]) => `${k} ${pct(v, stats.scans)}`).join(" · ")}`,
      `  outcomes per scan: green ${pct(stats.greens, stats.scans)} · yellow ${pct(stats.yellows, stats.scans)} (list median ${listMed} rows) · already-passed ${pct(stats.dups, stats.scans)} · not found ${pct(stats.notFound, stats.scans)} · retry ${pct(stats.retries, stats.scans)}`,
      `  yellow by cause: ${Object.entries(stats.yellowByKind).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(" · ")}`,
      `  jersey not on its yellow list: ${stats.listMissing} (${Object.entries(stats.listMissingByKind).map(([k, v]) => `${k} ${v}`).join(", ")})`,
      `  not found by cause: ${Object.entries(stats.notFoundByKind).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(" · ")}`,
      `  by hand: ${stats.byHand} jerseys (${pct(stats.byHand, stats.jerseys)} of jerseys) — ${Object.entries(stats.byHandWhy).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k} ${v}`).join(" · ")}`,
      `  by hand that still failed: ${stats.byHandFail} · duplicate shown on by-hand: ${stats.dupOnByHand}`,
      `  flags: damage ${stats.damageFlags} · not on roster ${stats.offRosterFlag} · un-checks ${stats.unscans} · rows left open at the end ${stats.openAtEnd}`,
      `  camera misread a clean digit → green on the wrong row ${stats.misreadGreen}, "already passed" ${stats.misreadDup} (the model's error; the screen shows the number large so the operator can catch it); the real jersey then landing on the last open twin: ${stats.misreadChain}`,
      `  same jersey scanned twice while its twin (another size) was open → the twin offered, caught by the size on screen: ${stats.twinRescan}`,
      `  WRONG GREEN ${stats.wrongGreen} · WRONG DUPLICATE ${stats.wrongDup} · roster rows lost in parsing ${stats.parseLoss} · orders over 400 log lines ${stats.over400} · sessions that could not be saved ${stats.sessionLost}`,
      `  pace: median ${med.toFixed(0)} jerseys/hour (slowest order ${sorted[0]?.toFixed(0)}, fastest ${sorted[sorted.length - 1]?.toFixed(0)}); ${(stats.seconds / stats.jerseys).toFixed(1)} s per jersey`,
      `  findings: ${findings.length}`,
      ...findings.slice(0, 40).map(f => "    - " + f.slice(0, 600)),
    ].join("\n");
    console.log(report);

    expect(stats.wrongGreen, "A wrong greens").toBe(0);
    expect(stats.wrongDup, "B wrong duplicates").toBe(0);
    expect(stats.sessionLost, "E sessions lost").toBe(0);
    expect(stats.byHandFail, "by-hand entry that still failed").toBe(0);
  });
});
