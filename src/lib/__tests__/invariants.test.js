// Property test: the matcher's rules must hold for ANY roster and ANY read,
// not just the floor cases the other tests name. Thousands of random rosters
// (numbers 0–99, with and without names, colours, sizes, some rows already
// passed) and random reads (a row read cleanly, a digit hidden, a digit
// misread, the name dropped or cut short, the jersey not flat) are checked
// against the rules the floor agreed on:
//
//   1. green only on an open row
//   2. green on a row WITH a name only when that name was read (typed entries excepted)
//   3. green only on the number that was read (never a different number)
//   4. a doubtful one-digit read is never green while an open row could be
//      that digit with another hidden (#4 read, #40 open)
//   5. two open rows with the same read, no body colour to tell them apart → never green
//   6. every row on a yellow list is related to the read: same number, the
//      read digit inside it, one digit away (only when the number is not on
//      the roster or a digit was covered), or a name match
import { describe, it, expect } from "vitest";
import { findMatches } from "../match.js";
import { normNum, nameMatches, norm } from "../text.js";
import { colourFamilies } from "../colour.js";

// Small deterministic PRNG so a failure is reproducible.
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const NAMES = ["", "", "", "Samuel", "Evanovich", "Nguyen", "Stephenson", "Leach", "Donnelly", "Rine", "Brown", "Martin", "Jordan Blake"];
const COLOURS = ["red", "blue", "yellow", "green", "white", "black", "", "Ravens"];
const pick = (r, a) => a[Math.floor(r() * a.length)];

function makeRoster(r) {
  const n = 2 + Math.floor(r() * 9);
  const rows = [];
  for (let i = 0; i < n; i++) {
    const number = r() < 0.4 ? String(Math.floor(r() * 10)) : String(Math.floor(r() * 100));
    const name = pick(r, NAMES);
    rows.push({ _id: i, name, number, team: pick(r, COLOURS), size: pick(r, ["A-S", "A-M", "A-L"]), scanned: r() < 0.25 ? "pass" : false });
  }
  return rows;
}

// A read derived from a roster row, with the camera's mistakes thrown in.
function makeRead(r, roster) {
  const row = pick(r, roster);
  let number = normNum(row.number), name = row.name, flags = {};
  const colourWord = colourFamilies(row.team).length ? row.team : pick(r, ["", "white", "black"]);
  flags.colour = r() < 0.6 ? colourWord : "";
  const mode = r();
  if (mode < 0.15 && number.length === 2) { number = r() < 0.5 ? number[0] : number[1]; flags.numberComplete = false; flags.obstruction = r() < 0.5 ? "hand over the left digit" : "second digit under a fold"; }   // a digit hidden
  else if (mode < 0.30) { const d = String(Math.floor(r() * 10)); number = number.length === 2 ? (r() < 0.5 ? d + number[1] : number[0] + d) : d; }  // a digit misread
  else if (mode < 0.40) { flags.laidFlat = false; }
  else if (mode < 0.50) { flags.numberComplete = false; }
  if (r() < 0.4) name = "";                                            // name out of frame
  else if (name && r() < 0.3) { name = name.slice(0, 3); flags.nameComplete = false; }   // name cut short
  if (r() < 0.1) number = "";                                          // number out of frame
  return { number, name, flags, from: row };
}

const related = (c, read, roster) => {
  const rn = normNum(c.number), nNum = normNum(read.number), nName = norm(read.name);
  if (nNum && rn === nNum) return true;
  if (nNum && nNum.length === 1 && rn.includes(nNum)) return true;
  if (nName && c.name && (nameMatches(nName, c.name) || norm(c.name).startsWith(nName))) return true;
  const onRoster = roster.some(x => normNum(x.number) === nNum);
  const covered = read.flags.numberComplete === false;
  if (nNum && rn.length === nNum.length && (!onRoster || covered)) { let d = 0; for (let i = 0; i < rn.length; i++) if (rn[i] !== nNum[i]) d++; if (d === 1) return true; }
  if (nNum && !onRoster && rn.length === 1 && nNum === rn + rn) return true;
  if (nNum && !onRoster && covered && nNum.length === 2 && (rn === nNum[0] || rn === nNum[1])) return true;
  return false;
};

describe("matcher invariants over random rosters and reads", () => {
  for (const [seed, n] of [[20261021, 4000], [7, 6000], [424242, 6000]]) it(`hold for ${n} random cases (seed ${seed})`, () => {
    const r = rng(seed);
    let greens = 0, yellows = 0;
    for (let k = 0; k < n; k++) {
      const roster = makeRoster(r);
      const read = makeRead(r, roster);
      const m = findMatches(roster, read.name, read.number, read.flags);
      const ctx = `case ${k}: roster ${JSON.stringify(roster.map(x => [x.number, x.name, x.team, x.scanned]))} read ${JSON.stringify(read)} → ${JSON.stringify({ type: m.type, match: m.match && [m.match.number, m.match.name], cands: m.candidates?.map(c => [c.number, c.name]) })}`;
      if (m.type === "exact") {
        greens++;
        const g = m.match;
        expect(g.scanned, "1 open row: " + ctx).toBeFalsy();
        if (g.name) {
          const full = nameMatches(norm(read.name), g.name);
          const cut  = read.flags.nameComplete === false && norm(read.name).length >= 2 && (norm(g.name).startsWith(norm(read.name)) || g.name.toLowerCase().split(/\s+/).some(w => norm(w).startsWith(norm(read.name)))) && normNum(g.number) === normNum(read.number);
          expect(full || cut, "2 named row needs its name (a cut-short name counts only with the exact number): " + ctx).toBe(true);
        }
        if (normNum(read.number)) expect(normNum(g.number), "3 the number read: " + ctx).toBe(normNum(read.number));
        const nNum = normNum(read.number);
        if (nNum.length === 1 && (read.flags.numberComplete === false || read.flags.laidFlat === false)) {
          const hiddenOpen = roster.some(x => !x.scanned && x !== g && normNum(x.number).length === 2 && normNum(x.number).includes(nNum));
          expect(hiddenOpen, "4 hidden digit alternative open: " + ctx).toBe(false);
        }
        const twins = roster.filter(x => !x.scanned && x !== g && normNum(x.number) === normNum(g.number) && (!g.name || nameMatches(norm(read.name), x.name)));
        if (twins.length) {
          const fam = colourFamilies(read.flags.colour);
          const gFam = colourFamilies(g.team);
          const decided = fam.length && gFam.length && gFam.some(f => fam.includes(f)) && twins.every(t => !colourFamilies(t.team).some(f => fam.includes(f)));
          expect(decided, "5 twins without a deciding body colour: " + ctx).toBe(true);
        }
      } else if (m.type === "pick" || m.type === "close") {
        yellows++;
        for (const c of m.candidates) expect(related(c, read, roster), "6 unrelated row on the list: " + ctx).toBe(true);
      }
    }
    expect(greens).toBeGreaterThan(300);
    expect(yellows).toBeGreaterThan(300);
  });
});
