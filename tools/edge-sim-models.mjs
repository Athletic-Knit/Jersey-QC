// Model comparison on the edge cases (run from tools/: `node edge-sim-models.mjs 5 <configs json>`; frames in ../public/sim): real frames → real model → the app's matcher
// → the screen the operator would see. Runs the CURRENT code and the DEMO-DAY
// code (Haiku 4.5, old prompt, old matcher) on the same frames and rosters.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const ROOT = "C:/Users/coop/OneDrive - Athletic Knit/Desktop/Jersey-QC-master";
const key = (fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").match(/^VITE_CLAUDE_API_KEY=(\S+)/m) || [])[1];
const fetchImpl = (url, init) => fetch("https://api.anthropic.com" + url.replace(/^\/api\/anthropic/, ""), init);
const NOW = { vision: await import(pathToFileURL(path.join(ROOT, "src/lib/vision.js")).href), match: await import(pathToFileURL(path.join(ROOT, "src/lib/match.js")).href) };
const CONFIGS = JSON.parse(process.argv[3] || '[{"id":"sonnet-5.5","model":"claude-sonnet-5-5","effort":"low","thinking":"off"}]');

const row = (i, name, number, team = "T", size = "A-L", extra = {}) => ({ _id: i, name, number, team, size, scanned: false, ...extra });
const R = {
  demo:    () => [row(0, "Samuel", "40"), row(1, "Evanovich", "4"), row(2, "Nguyen", "14"), row(3, "", "54", "blue")],
  fold35:  () => [row(0, "", "35", "yellow"), row(1, "", "5", "black"), row(2, "", "40", "blue"), row(3, "", "54", "blue")],
  nameless:() => [row(0, "", "40", "blue", "A-XL"), row(1, "", "54", "blue", "A-L"), row(2, "", "35", "yellow")],
  two:     () => [row(0, "Stephenson", "22", "yellow"), row(1, "", "5", "black"), row(2, "", "40", "blue")],
  thirty:  () => [row(0, "", "40", "blue", "A-XL"), row(1, "", "40", "blue", "A-L"), row(2, "", "41"), row(3, "", "70"), row(4, "", "60"), row(5, "", "4")],
  last:    () => [row(0, "", "54", "blue", "A-L"), row(1, "", "54", "blue", "A-S", { scanned: "pass" }), row(2, "", "54", "red", "A-M", { scanned: "pass" })],
  colour:  () => [row(0, "", "54", "white", "A-L"), row(1, "", "54", "red", "A-M"), row(2, "", "40", "black")],
};
// expect: colour of the screen, and (optionally) the exact set of candidate numbers
const SCEN = [
  { id: "clean #40, nameless row",            frame: "f40_clean.jpg",         roster: "nameless", expect: { colour: "green", pick: "40" } },
  { id: "clean #54, nameless row",            frame: "f54_clean.jpg",         roster: "nameless", expect: { colour: "green", pick: "54" } },
  { id: "upside-down #40",                    frame: "f40_upsidedown.jpg",    roster: "nameless", expect: { colour: "green", pick: "40" } },
  { id: "DEMO BREAK: 0 of #40 covered, #4 on roster", frame: "f40_cover0_fabric.jpg", roster: "demo", expect: { colour: "yellow", has: ["4", "40"] } },
  { id: "real fold: 3 of #35 under sleeve, #5 on roster", frame: "f35_fold_real.jpg", roster: "fold35", expect: { colour: "yellow", has: ["35"] } },
  { id: "fabric over 5 of #54",               frame: "f54_cover5_fabric.jpg", roster: "fold35", expect: { colour: "yellow", has: ["54"] } },
  { id: "hand over 4 of #40",                 frame: "f40_cover4_hand.jpg",   roster: "demo",   expect: { colour: "yellow", has: ["40"] } },
  { id: "hand over 4 of #54",                 frame: "f54_cover4_hand.jpg",   roster: "fold35", expect: { colour: "yellow", has: ["54"] } },
  { id: "4 of #40 cut off at picture edge",   frame: "f40_edge_cut4.jpg",     roster: "demo",   expect: { colour: "yellow-or-green-40", has: ["40"] } },
  { id: "two jerseys: STEPHENSON over a #5",  frame: "frame_two.jpg",         roster: "two",    expect: { colour: "yellow", has: ["22", "5"] } },
  { id: "covered lone 0 (of #40); rows 40,40,41,70,60,4 open", frame: "f40_cover4_fabric.jpg", roster: "thirty", expect: { colour: "yellow", only: ["40", "70", "60"] } },
  { id: "three #54 rows, two passed → the last", frame: "f54_clean.jpg",     roster: "last",   expect: { colour: "green", pick: "54" } },
  { id: "#54 white jersey, white and red rows", frame: "f54_clean.jpg",      roster: "colour", expect: { colour: "green", pick: "54", team: "white" } },
];

const colourOf = m => m.type === "exact" ? "green" : m.type === "duplicate" ? "red" : (m.type === "pick" || m.type === "close") ? "yellow" : "red";
const judge = (m, e) => {
  const col = colourOf(m);
  const nums = (m.candidates || []).map(c => c.number);
  if (e.colour === "yellow-or-green-40") return (col === "yellow" && nums.includes("40")) || (col === "green" && m.match?.number === "40");
  if (col !== e.colour) return false;
  if (e.pick && m.match?.number !== e.pick) return false;
  if (e.team && m.match?.team !== e.team) return false;
  if (e.has && !e.has.every(n => nums.includes(n))) return false;
  if (e.only && !(nums.every(n => e.only.includes(n)) && e.only.every(n => nums.includes(n)))) return false;
  return true;
};
const describe = m => m.type === "exact" ? `GREEN #${m.match.number}${m.match.team ? " " + m.match.team : ""}` : m.type === "duplicate" ? `RED already done #${m.match.number}` : (m.type === "pick" || m.type === "close") ? `YELLOW [${(m.candidates || []).map(c => "#" + c.number).join(" ")}]` : "RED not found";

async function runOne(cfg, s) {
  const base64 = fs.readFileSync(path.join(ROOT, "public/sim", s.frame)).toString("base64");
  const roster = R[s.roster]();
  const t0 = Date.now();
  const r = await NOW.vision.readJersey({ base64, apiKey: key, fetchImpl, model: cfg.model, effort: cfg.effort, thinking: cfg.thinking, orderNumbers: roster.filter(x => !x.scanned).map(x => x.number) });
  const ms = Date.now() - t0;
  const m = NOW.match.findMatches(roster, r.name, r.number, { nameComplete: r.name_complete, numberComplete: r.number_complete, position: r.number_position, obstruction: r.obstruction, colour: r.jersey_colour, trim: r.trim_colour, laidFlat: r.laid_flat });
  const covered = /cover|fold|hand|cut off|two jerseys|DEMO BREAK/.test(s.id);
  return { ms, read: `#${r.number}${r.number_complete === false ? "?" : ""}${r.name ? " " + r.name : ""}`, flagged: r.number_complete === false || r.laid_flat === false || (r.number.length === 1 && /left|right/.test(r.number_position)), covered, screen: describe(m), ok: judge(m, s.expect) };
}

const N = Number(process.argv[2] || 3);
const results = [];
const jobs = []; for (const cfg of CONFIGS) for (const s of SCEN) for (let i = 0; i < N; i++) jobs.push({ s, i, which: cfg.id, cfg });
let next = 0;
const isCovered = id => /cover|fold|hand|cut off|two jerseys|DEMO BREAK/.test(id);
async function worker() { while (next < jobs.length) { const j = jobs[next++]; try { const r = await runOne(j.cfg, j.s); results.push({ ...j, ...r }); } catch (e) { results.push({ ...j, ms: 0, read: "ERR", screen: "ERR " + e.message.slice(0, 60), ok: false, covered: isCovered(j.s.id), flagged: false }); } process.stderr.write(`${results.length}/${jobs.length}\r`); } }
await Promise.all(Array.from({ length: 3 }, worker));
fs.writeFileSync("sim-models.json", JSON.stringify(results, null, 1));

const pad = (s, n) => String(s).padEnd(n);
console.log("\n" + pad("scenario", 46) + CONFIGS.map(c => pad(c.id, 30)).join(""));
for (const s of SCEN) {
  const cells = CONFIGS.map(c => { const a = results.filter(r => r.s.id === s.id && r.which === c.id); return pad(`${a.filter(x => x.ok).length}/${a.length} ${Math.round(a.reduce((x, y) => x + y.ms, 0) / a.length)}ms ${a[0]?.screen?.slice(0, 14)}`, 30); });
  console.log(pad(s.id.slice(0, 45), 46) + cells.join(""));
}
console.log("\nPer model:  right overall | covered frames: model flagged doubt | covered: final screen right | clean frames: final right | avg ms");
for (const c of CONFIGS) {
  const a = results.filter(r => r.which === c.id), cov = a.filter(r => r.covered), cln = a.filter(r => !r.covered);
  console.log(pad(c.id, 14) + `${a.filter(x => x.ok).length}/${a.length}   | ${cov.filter(x => x.flagged).length}/${cov.length}   | ${cov.filter(x => x.ok).length}/${cov.length}   | ${cln.filter(x => x.ok).length}/${cln.length}   | ${Math.round(a.reduce((x, y) => x + y.ms, 0) / a.length)} ms`);
}
