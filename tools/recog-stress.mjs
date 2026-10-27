// Recognition stress test: every frame in public/sim/stress (synthetic jerseys
// from synth-jerseys.ps1, distorted real and synthetic frames from
// stress-distort.mjs) and the 13 real edge-case frames, through the CURRENT
// prompt, model and matcher, judged on the screen the operator would see.
//   node tools/recog-stress.mjs [runs per case = 2] [filter regex] [config json]
// Writes tools/recog-stress-results.json and prints a table by category and
// every failure with the raw read, so a prompt or matcher change can be judged
// against the same frames.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const key = (fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").match(/^VITE_CLAUDE_API_KEY=(\S+)/m) || [])[1];
const fetchImpl = (url, init) => fetch("https://api.anthropic.com" + url.replace(/^\/api\/anthropic/, ""), init);
const vision = await import(pathToFileURL(path.join(ROOT, "src/lib/vision.js")).href);
const match  = await import(pathToFileURL(path.join(ROOT, "src/lib/match.js")).href);
const vigil  = await import(pathToFileURL(path.join(ROOT, "src/lib/vigilance.js")).href);
const N = Number(process.argv[2] || 2);
const FILTER = process.argv[3] ? new RegExp(process.argv[3], "i") : null;
const CFG = JSON.parse(process.argv[4] || '{"model":"claude-haiku-5-5","effort":"low","thinking":"off"}');
// The app turns a jersey upright and reads it again; here sharp does the turning.
// SHARP_DIR = a folder with node_modules/sharp (the stress-distort.mjs one). Without it, no re-read.
const sharp = process.env.SHARP_DIR ? (await import(pathToFileURL(path.join(process.env.SHARP_DIR, "node_modules/sharp/lib/index.js")).href)).default : null;
if (!sharp) console.error("SHARP_DIR not set: turned jerseys will not be re-read upright");

const row = (i, name, number, team = "", size = "A-L", extra = {}) => ({ _id: i, name, number, team, size, scanned: false, ...extra });
const norm = s => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const swapDigits = { 0: "8", 1: "7", 3: "8", 5: "6", 6: "9", 7: "1", 8: "3", 9: "6", 2: "7", 4: "1" };
// Rows that a misread would land on: digit look-alikes, the reverse, hidden-digit
// numbers for a lone digit, each digit alone for two digits, and a name a letter off.
function distractors(name, number) {
  const nums = new Set();
  const n = String(number);
  if (n) {
    for (let i = 0; i < n.length; i++) nums.add(n.slice(0, i) + swapDigits[n[i]] + n.slice(i + 1));
    if (n.length === 2 && n[0] !== n[1]) nums.add(n[1] + n[0]);
    if (n.length === 1) { nums.add(n + "0"); nums.add("1" + n); nums.add("2" + n); }
    if (n.length === 2) { nums.add(n[0]); nums.add(n[1]); }
  }
  nums.delete(n); nums.delete("");
  const names = ["WALKER", "PATEL", "OKAFOR", "LINDQVIST", "MORALES", "TANAKA", "BRENNAN", "KOWALSKI", "DUBOIS"];
  const near = name ? name.replace(/O/, "Q").replace(/G/, "C").replace(/B/, "8") : "";
  const list = [...nums].slice(0, 6).map((x, i) => row(i + 1, name ? names[i] : "", x));
  if (name && near !== name) list.push(row(20, near, String(Number(n || 0) + 33 > 99 ? 12 : Number(n || 0) + 33)));
  return list;
}

// Every case: file, truth, roster, and the rule to judge the screen by.
//   green  : exact on the truth row
//   soft   : exact on the truth row, or a list with the truth row on it
//   yellow : a list with the truth row on it (the frame is covered or has two jerseys)
//   empty  : jersey_present false
//   blank  : jersey_present true, nothing read
const cases = [];
const add = c => { if (!FILTER || FILTER.test(c.id)) cases.push(c); };

// 1. The 13 real edge cases, as in edge-sim-models.mjs.
const R = {
  demo:    () => [row(0, "Samuel", "40"), row(1, "Evanovich", "4"), row(2, "Nguyen", "14"), row(3, "", "54", "blue")],
  fold35:  () => [row(0, "", "35", "yellow"), row(1, "", "5", "black"), row(2, "", "40", "blue"), row(3, "", "54", "blue")],
  nameless:() => [row(0, "", "40", "blue", "A-XL"), row(1, "", "54", "blue", "A-L"), row(2, "", "35", "yellow")],
  two:     () => [row(0, "Stephenson", "22", "yellow"), row(1, "", "5", "black"), row(2, "", "40", "blue")],
};
const REAL = [
  { id: "real clean #40",          frame: "f40_clean.jpg",         roster: "nameless", rule: "green",  truth: { number: "40" } },
  { id: "real clean #54",          frame: "f54_clean.jpg",         roster: "nameless", rule: "green",  truth: { number: "54" } },
  { id: "real upside-down #40",    frame: "f40_upsidedown.jpg",    roster: "nameless", rule: "green",  truth: { number: "40" } },
  { id: "real 0 of #40 covered",   frame: "f40_cover0_fabric.jpg", roster: "demo",     rule: "yellow", truth: { number: "40" }, has: ["4", "40"] },
  { id: "real fold 3 of #35",      frame: "f35_fold_real.jpg",     roster: "fold35",   rule: "yellow", truth: { number: "35" } },
  { id: "real fabric over 5 of #54", frame: "f54_cover5_fabric.jpg", roster: "fold35", rule: "yellow", truth: { number: "54" } },
  { id: "real hand over 4 of #40", frame: "f40_cover4_hand.jpg",   roster: "demo",     rule: "yellow", truth: { number: "40" } },
  { id: "real hand over 4 of #54", frame: "f54_cover4_hand.jpg",   roster: "fold35",   rule: "yellow", truth: { number: "54" } },
  { id: "real 4 of #40 cut off",   frame: "f40_edge_cut4.jpg",     roster: "demo",     rule: "soft",   truth: { number: "40" } },
  // The #5 jersey has no name; STEPHENSON is the other jersey in the frame. With both in view the screen must ask (#22 and #5); cropped to the #5 alone, a green #5 is right.
  { id: "real two jerseys",        frame: "frame_two.jpg",         roster: "two",      rule: "yellow", truth: { number: "5" }, has: ["22", "5"] },
];
for (const r of REAL) add({ ...r, cat: "real", path: path.join(ROOT, "public/sim", r.frame), roster: R[r.roster]() });

// 2. Synthetic jerseys.
const synth = JSON.parse(fs.readFileSync(path.join(ROOT, "public/sim/stress/synth/synth.json"), "utf8").replace(/^﻿/, ""));   // PowerShell writes a BOM
function synthCase(s, file, cat, rule, flags = {}) {
  const truthRow = row(0, s.name, s.number, "");
  let roster, expectRow = truthRow;
  if (s.kind === "empty" || s.kind === "blank-jersey") roster = [row(0, "Walker", "12"), row(1, "", "7")];
  else if (s.kind === "number-patch" || s.kind === "clean-nameless") roster = [truthRow, ...distractors("", s.number)];
  else if (s.kind === "name-plate") roster = [truthRow, ...distractors(s.name, "")];
  else roster = [truthRow, ...distractors(s.name, s.number)];
  // nameless rows must have no name at all so the roster is number-only
  if (!s.name) roster = roster.map(r => ({ ...r, name: "" }));
  return { id: `${cat} ${s.kind} ${path.basename(file, ".jpg")}`, frame: file, path: path.join(ROOT, "public/sim/stress", file), cat, rule, truth: { name: s.name, number: s.number }, roster, expectRow, ...flags };
}
const ruleFor = kind => kind === "empty" ? "empty" : kind === "blank-jersey" ? "blank" : kind === "merged-sleeve" ? "soft" : /^orient-/.test(kind) ? "green" : "green";
for (const s of synth) add(synthCase(s, s.file, "synth", ruleFor(s.kind)));

// 3. Distorted frames: judged by the base case's rule, loosened to soft where the variant says so.
const distort = JSON.parse(fs.readFileSync(path.join(ROOT, "public/sim/stress/distort/distort.json"), "utf8"));
for (const d of distort) {
  if (d.real) {
    const base = REAL.find(r => r.frame === d.source);
    let rule = base.rule === "green" ? (d.strict ? "green" : "soft") : base.rule;
    if (d.nameGone || d.nameCut) rule = base.rule === "yellow" ? "yellow" : "soft";
    let has = base.has;
    if (base.frame === "frame_two.jpg" && (d.nameGone || d.nameCut)) { rule = "soft"; has = undefined; }   // the STEPHENSON plate is out of the crop: only the #5 is there
    add({ ...base, id: `distort ${d.variant} ${base.id}`, cat: "distort-real", frame: d.file, path: path.join(ROOT, "public/sim/stress", d.file), roster: R[base.roster](), rule, has, variant: d.variant });
  } else {
    const s = synth.find(x => x.file === d.source);
    let rule = d.strict ? ruleFor(s.kind) : "soft";
    if ((d.nameGone || d.nameCut) && s.name) rule = "soft";   // the name is out of the picture: a named row cannot be green
    add({ ...synthCase(s, d.file, "distort-synth", rule), id: `distort ${d.variant} ${s.kind} ${path.basename(d.source, ".jpg")}`, variant: d.variant });
  }
}

const colourOf = m => m.type === "exact" ? "green" : m.type === "duplicate" ? "red" : (m.type === "pick" || m.type === "close") ? "yellow" : "red";
const describe = m => m.type === "exact" ? `GREEN #${m.match.number}${m.match.name ? " " + m.match.name : ""}` : m.type === "duplicate" ? `RED done #${m.match.number}` : (m.type === "pick" || m.type === "close") ? `YELLOW [${(m.candidates || []).map(c => "#" + c.number + (c.name ? " " + c.name : "")).join(", ")}]` : "RED not found";
function judge(c, r, m) {
  const col = colourOf(m);
  const onRow = x => x && norm(x.number) === norm(c.truth.number) && (!c.truth.name || norm(x.name) === norm(c.truth.name));
  const listed = (m.candidates || []).some(onRow) && (!c.has || c.has.every(n => (m.candidates || []).some(x => x.number === n)));
  switch (c.rule) {
    case "green":  return col === "green" && onRow(m.match);
    case "soft":   return (col === "green" && onRow(m.match)) || (col === "yellow" && listed);
    case "yellow": return col === "yellow" && listed;
    case "empty":  return r.jersey_present === false;
    case "blank":  return r.jersey_present !== false && !r.number && !r.name;
  }
  return false;
}

const flagsOf = r => ({ nameComplete: r.name_complete, numberComplete: r.number_complete, position: r.number_position, obstruction: r.obstruction, colour: r.jersey_colour, trim: r.trim_colour, laidFlat: r.laid_flat, orientation: r.orientation });
const showRead = r => `${r.jersey_present === false ? "(no jersey) " : ""}#${r.number || "—"}${r.number_complete === false ? "?" : ""} ${r.name || ""}${r.name_complete === false ? "…" : ""}${r.laid_flat === false ? " notflat" : ""}${r.orientation && r.orientation !== "upright" ? " " + r.orientation : ""}${r.obstruction ? ` (${r.obstruction})` : ""}`;
async function runOne(c) {
  const base64 = fs.readFileSync(c.path).toString("base64");
  const orderNumbers = c.roster.filter(x => !x.scanned).map(x => x.number);
  const readOne = b64 => vision.readJersey({ base64: b64, apiKey: key, fetchImpl, model: CFG.model, effort: CFG.effort, thinking: CFG.thinking, orderNumbers });
  const matchOf = d => (!d.name && !d.number) ? null : match.findMatches(c.roster, d.name, d.number, flagsOf(d));
  const t0 = Date.now();
  let r = await readOne(base64);
  let m = matchOf(r);
  let note = "";
  // As the app does: a turned jersey is turned upright and read again; the two reads reconcile.
  const first = r;
  if (vision.uprightRotation(r.orientation) && sharp && vigil.turnMatters(r, c.roster)) {
    let b = base64, d2 = r;
    for (let i = 0; i < 3 && vision.uprightRotation(d2.orientation); i++) {
      const turn = vision.uprightRotation(d2.orientation);
      b = (await sharp(Buffer.from(b, "base64")).rotate(turn).jpeg({ quality: 90 }).toBuffer()).toString("base64");
      d2 = await readOne(b);
      note += ` → turned ${turn}°: ${showRead(d2)}`;
    }
    const rc = vigil.settleTurned(r, m, d2, matchOf(d2));
    if (process.env.DEBUG) console.error(JSON.stringify({ r, d2, m, rc }, null, 1));
    note += rc.agreed ? " [upright read wins]" : " [not settled: ask]";
    r = rc.read || d2; m = rc.match;
  }
  const ms = Date.now() - t0;
  if (m === null) m = { type: "none" };
  const rawNum  = !c.truth.number ? !r.number : norm(r.number) === norm(c.truth.number);
  const rawName = c.truth.name === undefined ? true : !c.truth.name ? !r.name : norm(r.name) === norm(c.truth.name);
  return { ms, read: showRead(first) + note, rawNum, rawName, screen: describe(m), ok: judge(c, r, m), wrongGreen: colourOf(m) === "green" && !(m.match && norm(m.match.number) === norm(c.truth.number) && (!c.truth.name || norm(m.match.name) === norm(c.truth.name))) };
}

const jobs = []; for (const c of cases) for (let i = 0; i < N; i++) jobs.push({ c, i });
const results = []; let next = 0;
async function worker() { while (next < jobs.length) { const j = jobs[next++]; try { results.push({ id: j.c.id, cat: j.c.cat, rule: j.c.rule, frame: j.c.frame, truth: j.c.truth, i: j.i, ...(await runOne(j.c)) }); } catch (e) { results.push({ id: j.c.id, cat: j.c.cat, rule: j.c.rule, frame: j.c.frame, truth: j.c.truth, i: j.i, ms: 0, read: "ERR " + e.message.slice(0, 80), screen: "ERR", ok: false, rawNum: false, rawName: false, wrongGreen: false }); } process.stderr.write(`${results.length}/${jobs.length}\r`); } }
await Promise.all(Array.from({ length: 4 }, worker));
fs.writeFileSync(path.join(ROOT, "tools/recog-stress-results.json"), JSON.stringify({ cfg: CFG, when: new Date().toISOString(), results }, null, 1));

const pad = (s, n) => String(s).padEnd(n);
const cats = [...new Set(results.map(r => r.cat))];
console.log("\n" + pad("category", 16) + pad("screen right", 14) + pad("number read", 13) + pad("name read", 12) + pad("WRONG GREEN", 13) + "avg ms");
for (const cat of [...cats, "ALL"]) {
  const a = cat === "ALL" ? results : results.filter(r => r.cat === cat);
  console.log(pad(cat, 16) + pad(`${a.filter(x => x.ok).length}/${a.length}`, 14) + pad(`${a.filter(x => x.rawNum).length}/${a.length}`, 13) + pad(`${a.filter(x => x.rawName).length}/${a.length}`, 12) + pad(a.filter(x => x.wrongGreen).length, 13) + Math.round(a.reduce((x, y) => x + y.ms, 0) / Math.max(1, a.length)));
}
const bad = results.filter(r => !r.ok);
console.log(`\nFAILURES (${bad.length}):`);
for (const r of bad.sort((a, b) => a.id.localeCompare(b.id))) console.log(`  ${r.wrongGreen ? "WRONG GREEN  " : ""}${pad(r.id, 60)} truth #${r.truth.number || "—"} ${r.truth.name || ""} | read ${r.read} | ${r.screen}`);
