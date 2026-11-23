// ── Matching: what the operator sees for a read { name, number } ─────────────
// findMatches takes the roster and one read (from the camera, via vision.js, or
// typed by the operator) and says green, a list, ALREADY DONE or nothing;
// scanpolicy.js turns that into the station's result screen. The rules are in
// the comment above findMatches.
import { norm, normNum, nameMatches, nameWords, editDistance } from "./text.js";
import { narrowByColour } from "./colour.js";

// A row is done when it passed, was entered by hand (status "manual", only on
// orders saved before a typed jersey became a plain pass, 20 Nov 2026), or is
// FLAGGED: a flagged jersey is out for repair, so scanning it again shows the
// flag, never a green. On an order picked up again the station hands the
// matcher its flagged rows as open (`scanRoster` in App.jsx), so a jersey back
// from repair can pass (the owner, 19 Nov 2026). Missing and short marks are
// not done: a jersey that turns up after all scans normally.
export const isDone = r => r.scanned === "pass" || r.scanned === "manual" || r.scanned === "flag";

// A roster with no names at all (numbers only): a nameless read is all such a
// jersey can give, so the "a number needs its name" rules do not apply.
export function isNumberOnlyRoster(roster) {
  return roster.length > 0 && roster.every(r => !r.name);
}

// A jersey number is 1–2 digits ("00" allowed). Anything longer is a misread,
// usually the sleeve numbers merged with the back number ("7"+"7" → "77", "777").
export function isPlausibleNumber(n) {
  return /^\d{1,2}$/.test(n);
}

// Rows once each, by roster id, in the order first seen (the list's order).
function dedupe(rows) { const m = new Map(); rows.forEach(r => m.set(r._id, r)); return [...m.values()]; }

// For an implausible read like "777" or "223": every 1–2 digit substring that is
// on the roster, two-digit ones first.
export function subNumberCandidates(read, roster) {
  const s = String(read ?? "");
  const seen = new Set(), out = [];
  for (const len of [2, 1]) for (let i = 0; i + len <= s.length; i++) {
    const sub = normNum(s.slice(i, i + len));
    if (!sub || seen.has(sub)) continue;
    seen.add(sub);
    roster.filter(r => normNum(r.number) === sub).forEach(r => out.push(r));
  }
  return dedupe(out);
}

// Digits a camera read can mistake for each other on block numerals. A "0"
// is never a misread "4": they share nothing, so #4 is not offered for a 0.
const CONFUSABLE = { "0": "689", "1": "7", "2": "7", "3": "8", "4": "", "5": "6", "6": "058", "7": "12", "8": "0369", "9": "068" };
const lookAlike = (a, b) => a === b || (CONFUSABLE[a] || "").includes(b);
// Same length, exactly one digit wrong, and that digit a look-alike.
function oneLookAlikeOff(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) { if (!lookAlike(a[i], b[i])) return false; diff++; }
  return diff === 1;
}

// Roster numbers a misread could have come from — never a plain substring:
//   same length, one look-alike digit wrong   6↔9, 1↔7, 3↔8   ("19" near "10")
//   read is missing a digit (a fold hid one)  a look-alike or a hidden digit ("1" near "19")
//   read is the roster digit doubled          sleeve merge     ("88" near "8")
// "10" is NOT near "1" or "100"; "56" is NOT near "6"; "0" is NOT near "4".
// `anyDigit`: the read had a covered digit, so the model's digit there is a
// guess and any digit may stand in ("35" guessed as 55 or 75 still finds #35).
// `side`: 0 or 1 when the model said which digit was covered (left/first,
// right/second), so only that digit may vary; null = either.
function nearNumbers(nNum, roster, { anyDigit = false, side = null, sameLength = false } = {}) {
  if (!nNum) return [];
  const differsAt = (a, b) => { const d = []; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d.push(i); return d; };
  return roster.filter(r => {
    const rn = normNum(r.number);
    if (!rn || rn === nNum || !isPlausibleNumber(rn)) return false;
    if (rn.length === nNum.length) {
      if (!anyDigit) return oneLookAlikeOff(rn, nNum);
      const d = differsAt(rn, nNum);
      return d.length === 1 && (side === null || d[0] === side);
    }
    if (sameLength) return false;
    if (nNum.length < rn.length)   return editDistance(rn, nNum) <= 1;
    // A longer read than the roster number: the sleeve digit doubled ("88" for #8),
    // or a 0 in front ("07" read where the roster has #7). Since 07 and 7 are
    // different jerseys (N2) the second is a near miss to offer on the yellow list,
    // never a match (code review of 23 Nov 2026).
    return rn.length === 1 && (nNum === rn + rn || nNum === "0" + rn);
  });
}

// What a number reads as when the jersey is upside down: 6 ↔ 9, 18 ↔ 81,
// 66 ↔ 99, 60 ↔ 09; "" when a digit has no upside-down twin (2, 3, 4, 5, 7).
// A result that starts with 0 counts: since 07 and 7 are different jerseys (N2,
// 23 Nov 2026), a #09 on the roster is a real twin of an upside-down 60.
export function rotated180(nNum) {
  const map = { 0: "0", 1: "1", 6: "9", 8: "8", 9: "6" };
  const out = [...String(nNum)].reverse().map(d => map[d]).join("");
  if (out.length !== String(nNum).length || !out) return "";
  return out;
}

// Roster numbers a hidden digit would make from a shorter read: "4" → 40, 14, 44.
// Only longer numbers that contain the read; a one-digit substitution is not a
// hidden digit (that is nearNumbers' job).
function hiddenDigitNumbers(nNum, roster) {
  if (!nNum) return [];
  return roster.filter(r => { const rn = normNum(r.number); return rn.length > nNum.length && isPlausibleNumber(rn) && rn.includes(nNum); });
}

// Which side of the digits the cover is on, from the model's own words about
// the obstruction: 1 = right / second / last, 0 = left / first, null = unknown.
export function coverSide(obstruction) {
  const obs = String(obstruction || "").toLowerCase();
  return /\b(left|first)\b/.test(obs) ? 0 : /\b(right|second|last)\b/.test(obs) ? 1 : null;
}

// A one-digit read with the cover to its RIGHT can only be the first digit
// of a two-digit number ("4" with a hand to the right: 40, 41, 45, never 14
// or 54); a cover to the LEFT, only the second. Trims the two-digit rows on
// the list to the side that fits. Only the list the operator sees changes;
// if nothing would be left, the list stays as it was.
export function trimBySide(cands, nNum, side, covered) {
  if (!covered || side === null || !nNum || nNum.length !== 1) return cands;
  const fits = r => { const rn = normNum(r.number); return rn.length !== 2 || (side === 1 ? rn[0] === nNum : rn[rn.length - 1] === nNum); };
  const kept = cands.filter(fits);
  return kept.length ? kept : cands;
}

// Roster names a misread name could have come from: one letter off for a short
// name, two for a name of six letters or more; none for a read under 3 letters.
function nearNames(nName, roster) {
  if (nName.length < 3) return [];
  const tol = nName.length >= 6 ? 2 : 1;
  return roster.filter(r => { const rn = norm(r.name); return rn && rn !== nName && editDistance(rn, nName) <= tol; });
}

// Rows whose name starts with a fragment the camera could only partly read
// ("SAMU" → Samuel; "MACD" → MacDonald): any word of the roster name, or the
// whole normalised name, begins with the fragment.
function prefixNames(fragment, roster) {
  if (fragment.length < 2) return [];
  return roster.filter(r => {
    const rn = norm(r.name);
    if (!rn) return false;
    if (rn.startsWith(fragment)) return true;
    return nameWords(r.name).some(w => w.startsWith(fragment));
  });
}

// One row: green, or ALREADY DONE when it has passed. More than one: null, and
// the caller decides.
const single = rows => rows.length === 1
  ? (isDone(rows[0]) ? { type: "duplicate", match: rows[0] } : { type: "exact", match: rows[0] })
  : null;

// Several rows carry the same read and differ by colour or size. The colour
// the camera saw narrows them; one open row left is green. Otherwise the
// agreeing rows lead the list and the reason says what was seen.
// The one rule for rows that all carry the read (same number, or same name and
// number): EVERY open one competes, whether or not it has a name — a nameless
// read may be a named jersey with its name out of frame. Only a body-colour
// mismatch may eliminate a competitor. When exactly one survives, it is green
// if it is `eligible` (a row with a name only when its name was read).
function settleTwins(rows, eligible, read) {
  const open = rows.filter(r => !isDone(r));
  if (!open.length) return null;
  const { rows: agree, strong } = narrowByColour(open, read);
  const survivors = strong ? agree : open;
  if (survivors.length !== 1) return null;
  // The last open twin is green unless the body colour seen points at one of
  // its passed twins: a navy #0 read while the navy #0 has passed and the
  // white #0 is open is the navy jersey scanned twice. When the colour seen
  // matches no row at all (white jersey, roster says green and red), the
  // roster's colour words are not describing these jerseys — floor rosters
  // name teams, not fabric — and the last open twin stays green.
  // (`agreeing`, not `rows`: a twin whose colour is not on the roster is no
  // evidence either way, so the last open twin with no colour of its own stays
  // a question when the colour seen matches a passed twin.)
  const byBody = narrowByColour(rows, read);
  if (byBody.strong && !byBody.agreeing.includes(survivors[0])) return null;
  return eligible.includes(survivors[0]) ? { type: "exact", match: survivors[0] } : null;
}

// Rows that all carry the read: green when settleTwins settles it, else a list
// with the rows the colour seen agrees with first.
function sameReadRows(rows, read, reason, eligible = rows) {
  const sure = settleTwins(rows, eligible, read);
  if (sure) return sure;
  const { rows: agree, narrowed } = narrowByColour(rows, read);
  const seen = narrowed && read.colour ? ` — the jersey looks ${String(read.colour).trim()}` : "";
  return { type: "pick", candidates: dedupe([...agree, ...rows]), reason: reason + seen, twins: true };   // twins: the one left open may be the passed one scanned again (the colour seen says so), so a list of one here stays a list
}

// `direct` is the row the read points at, `cands` every row it could be: when
// `direct` is open and no other candidate is, the jersey can only be `direct`.
// Used only on a clean read (a name and no number, for a row that has no
// number); a doubtful read never comes here (N1).
const soleOpen = (direct, cands) => {
  if (!direct || isDone(direct)) return null;
  const open = cands.filter(r => !isDone(r));
  return open.length === 1 && open[0] === direct ? { type: "exact", match: direct } : null;
};

/**
 * Returns one of:
 *   { type: "exact",     match }                  one row, nothing to question
 *   { type: "duplicate", match }                  that row already passed
 *   { type: "pick",      candidates, reason }     several plausible rows
 *   { type: "close",     candidates, reason }     nothing exact; nearest rows
 *   { type: "none" }
 *
 * `read` carries what the camera said about its own read:
 *   nameComplete   false when letters were covered or cut off ("SAMU" of SAMUEL)
 *   numberComplete false when part of the number was covered or cut off
 *   laidFlat       false when the jersey was folded, bunched or partly covered
 *   position       "left" | "centre" | "right" — where the number sat on the back
 *   obstruction    the model's words for what was in the way
 *   colour, trim   the jersey body colour and its second colour, as seen
 *   typed          true when the operator typed the values (no camera doubt)
 *
 * Flags on a list: `doubtful` (N1: the read was doubtful, so a list of one
 * stays a list), `trimmed` and `twins` (see findMatches), and `soft` (the
 * question comes from the camera's own doubt, not a contradiction; only the
 * tests read it now).
 *
 * Green needs a name AND a number that both agree with one row, read in full.
 * A number with no name on a roster that has names is yellow: the name may be
 * hidden, and so may a digit. A number-only row stays green on a clean,
 * complete, centred read of its number with no name on the jersey.
 *
 * The rules decided in the code review of 23 Nov 2026 (each is marked where it
 * is applied below):
 *   N1  A doubtful read is ALWAYS yellow (Noam). Doubtful = part of the name or
 *       number covered or cut off, or a one-digit number off-centre, or a
 *       one-digit number on a jersey that is not laid flat. No exception, not
 *       even when name and number match a row exactly.
 *   N2  07 and 7 are different jerseys (Noam): see normNum in text.js.
 *   N4  Green needs the whole name (Noam): see nameMatches in text.js.
 *   N5  The team column never decides a green (Noam): see colour.js.
 *   NN  A name read on the jersey while the roster row has no name is ALWAYS
 *       yellow, also on a roster with no name column at all (the owner,
 *       23 Nov 2026): it may be a stray jersey from another order.
 */
// A read with no name at all, the number sitting in the middle of the jersey
// and nothing said about the name area: the name area is in view and empty,
// so this jersey has no name printed. Rows WITH names come off the list while
// an open nameless row remains to choose from. Only the list the operator
// sees changes: the named rows still count when deciding that nothing may be
// green, so a hidden digit on a named jersey is still a question, never a pass.
function withoutNamed(cands, nName, read, numberOnly) {
  if (nName || read.typed || numberOnly) return cands;
  if (read.nameComplete === false) return cands;                       // letters were seen, just not read
  const pos = String(read.position || "");
  if (pos === "left" || pos === "right") return cands;                 // off-centre: the name may be out of frame too
  if (/\bname\b/i.test(String(read.obstruction || ""))) return cands; // something lies over the name area
  if (!cands.some(r => !norm(r.name) && !isDone(r))) return cands;
  return Object.assign(cands.filter(r => !norm(r.name)), { trimmed: true });   // trimmed: the named rows still count, so a list of one here stays a list
}

export function findMatches(roster, name, number, read = {}) {
  let m = findMatchesInner(roster, name, number, read);
  // A list on which every row has already passed is not a choice: the jersey
  // was scanned before (two #84 rows, both done). Say so.
  if ((m.type === "pick" || m.type === "close") && m.candidates.length && m.candidates.every(isDone)) return { type: "duplicate", match: m.candidates[0] };
  // Otherwise a row that has passed (or is with the supervisor) is not a
  // choice either: it leaves the list, so the operator only sees jerseys
  // still to do (9 Nov 2026: "#37 · Already passed" was cluttering the list).
  if ((m.type === "pick" || m.type === "close") && m.candidates.some(isDone)) m = { ...m, candidates: m.candidates.filter(r => !isDone(r)) };
  // A list with one jersey on it is not a choice either: it goes straight to
  // the green (the owner, 19 Nov 2026: "why bother with showing it"). Only
  // when that jersey is what was read — its number is the number read, and
  // its name, if it has one, the name read; typed by the operator, always.
  // A near miss ("close": nothing exact) or a contradiction stays a question;
  // so does a list that was trimmed for the operator's eyes (`trimmed`: the
  // named rows still count) and a last open twin the colour seen argues
  // against (`twins`: the passed twin scanned again).
  // N1 (Noam, 23 Nov 2026): the 19 Nov rule applies only to a clean, complete
  // read. A list that comes from a doubtful read (`doubtful`) stays a list,
  // even with one jersey on it.
  if (m.type === "pick" && m.candidates.length === 1 && !m.trimmed && !m.twins && !m.doubtful && agreesWithRead(m.candidates[0], name, number, read)) m = { type: "exact", match: m.candidates[0] };
  // N1, the last word: a camera read that says ANY part of the name or number
  // was hidden is never green, whatever path above reached "exact". This also
  // covers a doubt about a field that came back empty (the camera saw letters
  // it could not read, so `name` is ""), which the suspect path in
  // findMatchesInner does not see (found by the code review's fuzz test,
  // 23 Nov 2026: a nameless #5 went green on a "name unreadable" read).
  if (m.type === "exact" && isDoubtfulRead(number, read)) {
    return { type: "pick", candidates: [m.match], reason: "Check the jersey: the camera could not see all of the name or number. Is it this one?", soft: true, doubtful: true };
  }
  return m;
}

// N1: does the camera doubt its own read? Covered or cut-off name or number
// (also when nothing could be read in that field), or a one-digit number that
// is off-centre or on a jersey not laid flat (a second digit may be hidden).
// A typed entry is never doubtful: the operator's word stands.
export function isDoubtfulRead(number, read = {}) {
  if (read.typed) return false;
  const n = normNum(number);
  return read.nameComplete === false || read.numberComplete === false
    || (n.length === 1 && (read.laidFlat === false || read.position === "left" || read.position === "right"));
}

// Does this one row say exactly what was read? Used only by the one-item-list
// shortcut above.
function agreesWithRead(row, name, number, read) {
  const nName = norm(name), nNum = normNum(number), rNum = normNum(row.number);
  // Typed by the operator: the name may be part of it, but a typed number is the
  // number. Typed 400 with only #40 open is a question, not #40 passed (seen on
  // the test server 20 Nov 2026: 400 and 122 passed #40 and #12 by hand).
  // (A typed number on a row with NO number is not that row either: typed
  // SAMUEL 9 is not the numberless Samuel. Code review of 23 Nov 2026.)
  // A typed NAME counts too, when the row has one: typed SMITH 12 where #12 is
  // JONES on the roster is a question, not JONES passed (code review of
  // 23 Nov 2026). Whole name, as from the camera (N4). A typed name on a row
  // with no name does not block it: the operator's word stands (review-rules).
  if (read.typed) {
    if (nNum && rNum !== nNum) return false;
    if (nName && norm(row.name)) return nameMatches(nName, row.name);
    return true;
  }
  // From the camera the number must be the row's number exactly, digit for digit
  // (N2). That includes "both empty", and excludes a number read on a row that
  // has none: a stray #1 SAMUEL is not the roster's numberless Samuel (code
  // review of 23 Nov 2026; it went green in the 3000-order simulation).
  if (rNum !== nNum) return false;
  // A row with a name: the whole name read, in full (N4).
  if (norm(row.name)) return !!nName && read.nameComplete !== false && nameMatches(nName, row.name);
  // A row with no name: only when no name was read either (rule NN above).
  return !nName;
}

// The matcher itself; findMatches tidies its answer (passed rows off the list,
// a one-row list to green, N1's last word).
function findMatchesInner(roster, name, number, read = {}) {
  const nName      = norm(name);
  const nNumRaw    = normNum(number);
  const numberOnly = isNumberOnlyRoster(roster);
  const typed      = read.typed === true;
  const position   = typed ? "" : String(read.position || "");
  const partialName = !typed && !!nName && read.nameComplete === false;
  // A fold can hide a digit, so "not laid flat" makes a ONE-digit read doubtful
  // (5 may be 35); it cannot add a third digit to a two-digit read, so a
  // complete two-digit number on a rumpled jersey is still that number.
  const partialNum  = !typed && !!nNumRaw && (read.numberComplete === false || (read.laidFlat === false && nNumRaw.length === 1));
  const offCentre   = !typed && !!nNumRaw && nNumRaw.length === 1 && (position === "left" || position === "right");
  const suspect     = partialName || partialNum || offCentre;   // a doubtful read: never green (N1)

  // Misread guard: 3+ digits cannot be a jersey number — unless the roster
  // itself carries that number (a #104 exists on some orders).
  if (nNumRaw && !isPlausibleNumber(nNumRaw) && !roster.some(r => normNum(r.number) === nNumRaw)) {
    const byName = nName && !numberOnly ? roster.filter(r => nameMatches(nName, r.name)) : [];
    const cands  = dedupe([...byName, ...subNumberCandidates(nNumRaw, roster)]);
    if (cands.length) return { type: "pick", candidates: cands, reason: `Read "${nNumRaw}" — sleeve numbers may have merged with the back number. Which jersey is this?` };
    return { type: "none" };
  }
  const nNum = nNumRaw;

  const byNum  = nNum ? roster.filter(r => normNum(r.number) === nNum) : [];

  // A jersey that is not the right way up, with no name to anchor it, and a
  // number that reads as another number upside down (6/9, 18/81, 66/99): if
  // that other number is open on the roster, the camera cannot tell them
  // apart from a turned picture. Ask, with both. (The app turns the frame and
  // reads again first; this is the net under that.)
  // (A name that is on no roster row — a badge, a sponsor, a misread — anchors nothing.)
  const nameAnchors = !!nName && !numberOnly && roster.some(r => nameMatches(nName, r.name));
  if (!typed && !nameAnchors && nNum && read.orientation && read.orientation !== "upright") {
    const alt = rotated180(nNum);
    const altRows = alt && alt !== nNum ? roster.filter(r => normNum(r.number) === alt && !isDone(r)) : [];
    if (altRows.length) {
      const cands = dedupe([...byNum, ...altRows]);
      return { type: "pick", candidates: cands, reason: `Read #${nNum} on a jersey that is not the right way up — turned round it would read #${alt}. Which is it?`, soft: true };
    }
  }
  const byName = nName && !numberOnly
    ? (partialName ? prefixNames(nName, roster) : roster.filter(r => nameMatches(nName, r.name)))
    : [];
  const byBoth = byNum.filter(r => byName.includes(r));

  // An exact name + number does not clear a doubt (N1): a doubtful read stays
  // yellow.

  // The camera doubts its own read: part of the name or number was covered,
  // cut off, or the number sat off-centre (a digit hidden). Never green (N1).
  // Offer every row the read could be a piece of, the most likely first, and
  // say what was wrong. Every result from here is `doubtful`, which also stops
  // the one-item-list shortcut in findMatches from turning it green.
  if (suspect) {
    const shown = String(name ?? "").trim();
    const why = [];
    if (partialName) why.push(`name read as "${shown}…" and looks cut off`);
    if (partialNum)  why.push(read.numberComplete === false ? `#${nNum} looks covered or cut off` : `the jersey is not laid flat — a digit may be under a fold`);
    else if (offCentre) why.push(`#${nNum} sits ${position} of centre — a digit may be hidden`);
    if (!nName && !partialNum && !offCentre) why.push("no name was read");
    const what = read.obstruction ? ` (${String(read.obstruction).trim()})` : "";
    // What to offer. If the read points at rows on the roster, offer THOSE and
    // only those — a #30 read never lists #31 or #70, they have nothing to do
    // with it, and a #4 read lists the #4 rows and not #40 or #14 (the owner,
    // 19 Nov 2026: on a 521-jersey order every one-digit read put the whole
    // column of two-digit numbers on the list; a digit under a fold is rare,
    // and a rescan sorts it out). Only when the read matches no row at all do
    // the rows a hidden digit would make (#4 → #40, #14) and the near misses
    // come in: one-digit substitutions, and for a covered two-digit read, each
    // digit on its own ("35" guessed as 55 or 75 still finds #35 and #5).
    const exact = dedupe([...byBoth, ...byName, ...byNum]);
    const hidden = nNum.length === 1 && !exact.length ? hiddenDigitNumbers(nNum, roster) : [];
    // A COVERED two-digit read is a guess at the hidden digit ("21" with the 3
    // under a hand is the #31), so it also offers the rows one digit away.
    const side = coverSide(read.obstruction);
    const guessedDigit = partialNum && read.numberComplete === false && nNum.length === 2 ? nearNumbers(nNum, roster, { anyDigit: true, side, sameLength: true }) : [];
    const cands = exact.length
      ? dedupe([...exact, ...guessedDigit])
      : dedupe([...hidden, ...(nNum.length === 1 && hidden.length ? [] : nearNumbers(nNum, roster, { anyDigit: partialNum })), ...(partialNum ? subNumberCandidates(nNum, roster) : []), ...(partialName ? [] : nearNames(nName, roster))]);   // a covered lone digit with hidden-digit rows to offer needs no substitutions
    // Name and number pointing at different rows is a contradiction: always ask.
    // Otherwise `direct`, the row the read itself points at, goes to the top of
    // the list; it is never green (N1).
    const contradiction = byName.length >= 1 && byNum.length >= 1 && byBoth.length === 0;
    let direct = null;
    if (!contradiction) {
      // A row with a name is only ever "direct" when its name was read: a
      // nameless read never puts a named row first, however few rows there are.
      // …and a row reached through its name is only "direct" when the number
      // read is that row's number or nothing was read: a cut-short "Ngu" with a
      // misread #36 is not the #34 Nguyen, it is a question.
      // A cut-short name ("Mar…") settles only through the exact number (byBoth):
      // with no number read it is two missing pieces, not a match.
      // From the camera, a name with NO number read settles only a row that has
      // no number of its own (the jersey has none to read). A row that carries a
      // number was not seen whole — the number is under a fold, out of frame, or
      // on the other jersey in the picture — and stays a question. Typed by the
      // operator, the name alone is their word.
      const nameSettles = r => typed || !!nNum || !normNum(r.number);
      direct = byBoth[0]
        || (!partialName && byName.length === 1 && byNum.length === 0 && (nNum ? normNum(byName[0].number) === nNum : nameSettles(byName[0])) ? byName[0] : null)
        // …and a row with no name is only "direct" when no name was read either:
        // "#5?" with ZHANG on the jersey is not the roster's nameless #5 (a stray
        // #56 ZHANG with a digit under a fold went green on it in the simulation,
        // 11 Nov 2026), also on a roster with no names at all (rule NN).
        || (byNum.length === 1 && byName.length === 0 && !norm(byNum[0].name) && !nName ? byNum[0] : null);
      if (direct && isDone(direct)) direct = null;   // a passed row is not offered first
    }
    if (cands.length) {
      const ordered = direct ? dedupe([direct, ...cands]) : cands;
      const shown = withoutNamed(trimBySide(ordered, nNum, side, partialNum && read.numberComplete === false), nName, read, numberOnly);
      const sameNum = nNum ? exact.filter(r => normNum(r.number) === nNum) : [];
      return { type: "pick", candidates: shown, reason: `Check the jersey: ${why.join("; ")}${what}. Is it one of these?`, soft: true, doubtful: true, trimmed: !!shown.trimmed || undefined, twins: sameNum.length > 1 || undefined };
    }
    return { type: "none", reason: `${why.join("; ")}${what}`, soft: true };
  }

  // Name and number both agree.
  if (byBoth.length >= 1) {
    return single(byBoth) || sameReadRows(byBoth, read, "Same name and number on more than one row — check size and team");
  }

  // A number with no name, where the row it points at HAS a name: the name may
  // be hidden or out of frame. Green needs both. The operator sees the rows
  // with that number (not the rows a hidden digit would make: see above). A
  // row with no name of its own (a mixed roster) has nothing to read and
  // stays green on a clean number.
  if (byNum.length >= 1 && nName === "" && !typed && byNum.some(r => norm(r.name))) {
    const cands = byNum;
    if (cands.length === 1 && isDone(cands[0])) return { type: "duplicate", match: cands[0] };
    // No "sole candidate" shortcut here: every row in byNum that could be
    // green has a name, and that name was not read. The floor showed what the
    // shortcut does — a nameless #21 passed as LEACH.
    // Several rows with this number: the colour seen may settle it — but only
    // among rows with NO name, and only on the body colour. A row with a name
    // needs its name read before it can be green; a nameless read that lands
    // on "DONNELLY" because the jersey's trim is red is exactly the wrong green.
    if (byNum.length > 1) {
      const s2 = settleTwins(byNum, byNum.filter(r => !norm(r.name)), read);
      if (s2) return s2;
    }
    const shown = withoutNamed(cands, nName, read, numberOnly);
    return { type: "pick", candidates: shown, reason: `Read #${nNum} but no name — is the name hidden or out of frame? Is it one of these?`, soft: true, trimmed: !!shown.trimmed || undefined, twins: byNum.length > 1 || undefined };
  }

  // The name points at one row, the number at another: a digit was misread
  // (6↔9, 1↔7, a merged sleeve). The name is the more reliable read; offer its
  // row first and never go green.
  if (byName.length >= 1 && byNum.length >= 1) {
    const nums = [...new Set(byName.map(r => r.number))].join(" / ");
    const typedName = String(name).trim();
    const reason = typed
      ? `You typed ${typedName} #${nNum}, but ${typedName} is #${nums} on the roster — which one?`
      : `Name matches #${nums} but the number read as #${nNum}`;
    return { type: "pick", candidates: dedupe([...byName, ...byNum]), reason };
  }

  // Number read and no name read. (A name read on a number-only roster is a
  // question, rule NN: the next branch.)
  if (byNum.length >= 1 && nName === "") {
    return single(byNum) || sameReadRows(byNum, read, "More than one row with this number — check size and team", byNum.filter(r => !norm(r.name)));
  }

  // Number is on the roster but the name read agrees with no row: a misread
  // name, a jersey whose name is not the roster's (N4), or a name printed on a
  // jersey whose row has no name (rule NN, also on a roster with no names).
  if (byNum.length >= 1) {
    const shown = String(name).trim();
    // Typed by the operator, say it in their terms: the name they typed is not
    // the roster's name for that number (code review of 23 Nov 2026).
    const onRoster = [...new Set(byNum.map(r => String(r.name || "").trim()).filter(Boolean))].join(" / ");
    const reason = byNum.every(r => !norm(r.name))
      ? `The jersey shows the name "${shown}" but the roster has no name for #${nNum} — check it is this order's jersey`
      : typed
        ? `You typed ${shown}, but #${nNum} is ${onRoster} on the roster — which one?`
        : `#${nNum} is on the roster but the name read as "${shown}"`;
    return { type: "pick", candidates: dedupe([...byNum, ...nearNames(nName, roster)]), reason };
  }

  // Name is on the roster; the number is not.
  if (byName.length >= 1) {
    if (!nNum) {
      // Typed by the operator: the name alone is their word. From the camera a
      // name with no number is half a read (the number under a fold, or the
      // name plate of a different jersey): yellow, never green.
      if (typed) return single(byName) || { type: "pick", candidates: byName, reason: "Name matches more than one row" };
      if (byName.length === 1 && isDone(byName[0])) return { type: "duplicate", match: byName[0] };
      const nums = [...new Set(byName.map(r => r.number))].join(" / ");
      const settles = byName.length === 1 && !normNum(byName[0].number) ? byName[0] : null;   // a row with no number: the name is the whole jersey
      return soleOpen(settles, byName) || { type: "pick", candidates: byName, reason: `Read "${String(name).trim()}" but no number — is #${nums} hidden or out of frame? Is it this jersey?`, soft: true };
    }
    return { type: "pick", candidates: byName, reason: `Name matches #${[...new Set(byName.map(r => r.number))].join(" / ")} but the number read as #${nNum}` };
  }

  // Nothing exact: nearest rows only.
  const close = dedupe([...nearNumbers(nNum, roster), ...nearNames(nName, roster)]);
  if (close.length) return { type: "close", candidates: close, reason: "" };   // the headline says it
  return { type: "none" };
}

// Which of `fields` differ among the candidates — drives the adaptive headline
// (when name and number are identical, the size or colour becomes the big text).
export function differingFields(candidates, fields) {
  return fields.filter(f => new Set(candidates.map(c => String(c[f] ?? "").trim().toLowerCase())).size > 1);
}
