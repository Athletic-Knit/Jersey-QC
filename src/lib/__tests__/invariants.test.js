// Property test: the matcher's rules must hold for ANY roster and ANY read,
// not just the floor cases the other tests name. Thousands of random rosters
// (numbers 0–99 and a few 0X, with and without names, colours, sizes, some
// rows already passed) and random reads (a row read cleanly, a digit hidden, a
// digit misread, the name dropped or cut short, the jersey not flat, a stray
// name) are checked against the rules the floor agreed on:
//
//   1. green only on an open row
//   2. green on a row WITH a name only when the WHOLE name was read, in full (N4)
//   3. green only on the number that was read, digit for digit (N2: 07 is not 7)
//   4. a doubtful read is never green (N1, Noam, 23 Nov 2026): name or number
//      covered or cut off, a one-digit number off-centre or on a jersey not laid flat
//   5. two open rows with the same read and no KNOWN body colour to tell them
//      apart → never green (a row with no colour on the roster is unknown, not different)
//   6. every row on a yellow list is related to the read: same number, the
//      read digit inside it, one digit away (only when the number is not on
//      the roster or a digit was covered), or a name match
//   7. the team column never changes the result (N5, Noam, 23 Nov 2026)
//   8. green on a row with NO name only when no name was read (the owner, 23 Nov 2026)
// (Rule 4 used to be "no green on a one-digit doubtful read while a two-digit
// row containing the digit is open"; it was dropped on 19 Nov 2026 and N1
// replaced it with the stricter rule above.)
import { describe, it, expect } from "vitest";
import { findMatches } from "../match.js";
import { normNum, nameMatches, norm } from "../text.js";
import { colourFamilies } from "../colour.js";

// Small deterministic PRNG so a failure is reproducible.
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const NAMES = ["", "", "", "Samuel", "Evanovich", "Nguyen", "Stephenson", "Leach", "Donnelly", "Rine", "Brown", "Martin", "Jordan Blake", "Van Dyk", "Dyk", "O'Neil", "Smith", "Smithe"];
const COLOURS = ["red", "blue", "yellow", "green", "white", "black", "", ""];
// Team names, some of which contain colour words: N5 says they never count.
const TEAMS = ["Ravens", "Cherry Hill", "Silver Lake", "Forest Park", "Red", "Navy", ""];
const STRAYS = ["ZHANG", "AK", "KOWALSKI"];
const pick = (r, a) => a[Math.floor(r() * a.length)];

function makeRoster(r) {
  const n = 2 + Math.floor(r() * 9);
  const rows = [];
  for (let i = 0; i < n; i++) {
    let number = r() < 0.4 ? String(Math.floor(r() * 10)) : String(Math.floor(r() * 100));
    if (number.length === 1 && r() < 0.08) number = "0" + number;          // a 0X jersey (N2)
    const name = pick(r, NAMES);
    rows.push({ _id: i, name, number, team: pick(r, TEAMS), colour: pick(r, COLOURS), size: pick(r, ["A-S", "A-M", "A-L"]), scanned: r() < 0.25 ? "pass" : false });
  }
  return rows;
}

// A read derived from a roster row, with the camera's mistakes thrown in.
function makeRead(r, roster) {
  const row = pick(r, roster);
  let number = normNum(row.number), name = row.name;
  const flags = {};
  const colourWord = colourFamilies(row.colour).length ? row.colour : pick(r, ["", "white", "black"]);
  flags.colour = r() < 0.6 ? colourWord : "";
  const mode = r();
  if (mode < 0.15 && number.length === 2) { number = r() < 0.5 ? number[0] : number[1]; flags.numberComplete = false; flags.obstruction = r() < 0.5 ? "hand over the left digit" : "second digit under a fold"; }   // a digit hidden
  else if (mode < 0.30) { const d = String(Math.floor(r() * 10)); number = number.length === 2 ? (r() < 0.5 ? d + number[1] : number[0] + d) : d; }  // a digit misread
  else if (mode < 0.40) { flags.laidFlat = false; }
  else if (mode < 0.50) { flags.numberComplete = false; }
  else if (mode < 0.55 && number.length === 1) { flags.position = r() < 0.5 ? "left" : "right"; }
  if (r() < 0.05) { name = ""; flags.nameComplete = false; }           // letters seen but unreadable: nothing read, yet doubtful
  else if (r() < 0.4) name = "";                                       // name out of frame
  else if (name && r() < 0.3) { name = name.slice(0, 3); flags.nameComplete = false; }   // name cut short
  else if (r() < 0.08) name = pick(r, STRAYS);                         // a name that is on no row (a stray jersey)
  if (r() < 0.1) number = "";                                          // number out of frame
  return { number, name, flags, from: row };
}

const related = (c, read, roster) => {
  const rn = normNum(c.number), nNum = normNum(read.number), nName = norm(read.name);
  if (nNum && rn === nNum) return true;
  if (nNum && nNum.length === 1 && rn.includes(nNum)) return true;
  if (nName && c.name && (nameMatches(nName, c.name) || norm(c.name).startsWith(nName) || c.name.toLowerCase().split(/[^a-z0-9]+/).some(w => w && w.startsWith(nName)))) return true;
  if (nName && c.name && nName.length >= 3) { const a = norm(c.name); if (Math.abs(a.length - nName.length) <= 2) return true; }   // near names (edit distance ≤ 2 is offered)
  const onRoster = roster.some(x => normNum(x.number) === nNum);
  const covered = read.flags.numberComplete === false;
  if (nNum && rn.length === nNum.length && (!onRoster || covered)) { let d = 0; for (let i = 0; i < rn.length; i++) if (rn[i] !== nNum[i]) d++; if (d === 1) return true; }
  if (nNum && !onRoster && rn.length === 1 && (nNum === rn + rn || nNum === "0" + rn)) return true;   // a doubled sleeve digit, or a 0 in front (N2)
  if (nNum && !onRoster && nNum.length < rn.length) return true;      // a read missing a digit ("7" for #07, "1" for #19)
  if (nNum && !onRoster && covered && nNum.length === 2 && (rn === nNum[0] || rn === nNum[1])) return true;
  return false;
};

// N1: what counts as a doubtful read — also when the doubtful field came back
// empty (the camera saw letters or digits it could not read).
const doubtful = read => {
  const f = read.flags, n = normNum(read.number);
  return f.nameComplete === false
    || f.numberComplete === false
    || (n.length === 1 && f.laidFlat === false)
    || (n.length === 1 && (f.position === "left" || f.position === "right"));
};

describe("matcher invariants over random rosters and reads", () => {
  for (const [seed, n] of [[20261021, 4000], [7, 6000], [424242, 6000]]) it(`hold for ${n} random cases (seed ${seed})`, () => {
    const r = rng(seed);
    let greens = 0, yellows = 0;
    for (let k = 0; k < n; k++) {
      const roster = makeRoster(r);
      const read = makeRead(r, roster);
      const m = findMatches(roster, read.name, read.number, read.flags);
      const ctx = `case ${k}: roster ${JSON.stringify(roster.map(x => [x.number, x.name, x.team, x.colour, x.scanned]))} read ${JSON.stringify(read)} → ${JSON.stringify({ type: m.type, match: m.match && [m.match.number, m.match.name], cands: m.candidates?.map(c => [c.number, c.name]) })}`;
      // 7. The same roster with every team name changed gives the same answer.
      const reteamed = roster.map(x => ({ ...x, team: x.team ? "Team " + x._id : "" }));
      const m7 = findMatches(reteamed, read.name, read.number, read.flags);
      expect(m7.type, "7 the team column changed the result: " + ctx).toBe(m.type);
      expect(m7.match?._id, "7 the team column changed the green: " + ctx).toBe(m.match?._id);
      if (m.type === "exact") {
        greens++;
        const g = m.match;
        expect(g.scanned, "1 open row: " + ctx).toBeFalsy();
        expect(doubtful(read), "4 a doubtful read went green: " + ctx).toBe(false);
        if (g.name) expect(nameMatches(read.name, g.name) && read.flags.nameComplete !== false, "2 named row needs its whole name: " + ctx).toBe(true);
        // 8, narrowed by 5h (the owner, 25 Nov 2026): a name read on a nameless row is allowed only on a
        // roster with no names at all, and only when the number has exactly one open row.
        else if (norm(read.name)) expect(roster.every(x => !x.name) && roster.filter(x => !x.scanned && normNum(x.number) === normNum(g.number)).length === 1, "8 a name was read but the row has none: " + ctx).toBe(true);
        expect(normNum(g.number), "3 the number read, digit for digit: " + ctx).toBe(normNum(read.number));
        const twins = roster.filter(x => !x.scanned && x !== g && normNum(x.number) === normNum(g.number) && (!g.name || nameMatches(read.name, x.name)));
        if (twins.length) {
          const fam = colourFamilies(read.flags.colour);
          const gFam = colourFamilies(g.colour);
          // Decided only when the green row's colour agrees with the body colour seen and every other
          // open twin has a KNOWN colour that does not.
          const decided = fam.length && gFam.length && gFam.some(f => fam.includes(f)) && twins.every(t => colourFamilies(t.colour).length && !colourFamilies(t.colour).some(f => fam.includes(f)));
          expect(!!decided, "5 twins without a deciding body colour: " + ctx).toBe(true);
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
