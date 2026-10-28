// ── Matching: what the operator sees for a read { name, number } ─────────────
import { norm, normNum, nameMatches, nameWords, editDistance } from "./text.js";
import { narrowByColour } from "./colour.js";

// A row counts as done when it passed, or was entered by hand (awaiting the
// supervisor's sign-off). A flagged row is out for repair and comes back with a
// pink slip to be scanned again, so it stays selectable.
// A row is done when it passed, was entered by hand, or is FLAGGED: a flagged
// jersey is with the supervisor until they clear it, so scanning it again shows
// the flag, never a green. Missing / short-shipped marks are not "done": a
// jersey that turns up after all scans normally.
export const isDone = r => r.scanned === "pass" || r.scanned === "manual" || r.scanned === "flag";

export function isNumberOnlyRoster(roster) {
  return roster.length > 0 && roster.every(r => !r.name);
}

// A jersey number is 1–2 digits ("00" allowed). Anything longer is a misread,
// usually the sleeve numbers merged with the back number ("7"+"7" → "77", "777").
export function isPlausibleNumber(n) {
  return /^\d{1,2}$/.test(n);
}

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
    return rn.length === 1 && nNum === rn + rn;
  });
}

// What a number reads as when the jersey is upside down: 6 ↔ 9, 18 ↔ 81,
// 66 ↔ 99; "" when a digit has no upside-down twin (2, 3, 4, 5, 7) or the
// result would start with 0.
export function rotated180(nNum) {
  const map = { 0: "0", 1: "1", 6: "9", 8: "8", 9: "6" };
  const out = [...String(nNum)].reverse().map(d => map[d]).join("");
  if (out.length !== String(nNum).length || !out || (out.length > 1 && out[0] === "0")) return "";
  return out;
}

// Roster numbers a hidden digit would make from a shorter read: "4" → 40, 14, 44.
// Only longer numbers that contain the read; a one-digit substitution is not a
// hidden digit (that is nearNumbers' job).
function hiddenDigitNumbers(nNum, roster) {
  if (!nNum) return [];
  return roster.filter(r => { const rn = normNum(r.number); return rn.length > nNum.length && isPlausibleNumber(rn) && rn.includes(nNum); });
}

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

const single = rows => rows.length === 1
  ? (isDone(rows[0]) ? { type: "duplicate", match: rows[0] } : { type: "exact", match: rows[0] })
  : null;

// A doubt only matters when another open row could be the answer. `direct` is
// the row the read itself points at; `cands` every row the read could be a
// piece of. If `direct` is open and no other candidate is, the jersey can only
// be `direct`: green. Contradictions never come here — a name pointing at one
// row and a number at another is evidence, not a gap.
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
  const byBody = narrowByColour(rows, read);
  if (byBody.strong && !byBody.rows.includes(survivors[0])) return null;
  return eligible.includes(survivors[0]) ? { type: "exact", match: survivors[0] } : null;
}

function sameReadRows(rows, read, reason, eligible = rows) {
  const sure = settleTwins(rows, eligible, read);
  if (sure) return sure;
  const { rows: agree, narrowed } = narrowByColour(rows, read);
  const seen = narrowed && read.colour ? ` — the jersey looks ${String(read.colour).trim()}` : "";
  return { type: "pick", candidates: dedupe([...agree, ...rows]), reason: reason + seen };
}

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
 * Green needs a name AND a number that both agree with one row, read in full.
 * A number with no name on a roster that has names is yellow: the name may be
 * hidden, and so may a digit. A partial or off-centre read is never green.
 * Number-only rosters stay green on a clean, complete, centred read.
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
  return cands.filter(r => !norm(r.name));
}

export function findMatches(roster, name, number, read = {}) {
  const m = findMatchesInner(roster, name, number, read);
  // A list on which every row has already passed is not a choice: the jersey
  // was scanned before (two #84 rows, both done). Say so.
  if ((m.type === "pick" || m.type === "close") && m.candidates.length && m.candidates.every(isDone)) return { type: "duplicate", match: m.candidates[0] };
  return m;
}

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
  let   suspect     = partialName || partialNum || offCentre;

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

  // The whole name AND the number were read, and together they point at a row:
  // that is the jersey. A doubt about the number alone ("the 9 may be a 19
  // under a fold", "the 4 sits left of centre") cannot change the name, so it
  // is only a question when THIS name is also on the roster with a number a
  // hidden digit would make (SEACH #9 and SEACH #19 both open). Every
  // one-digit jersey went yellow before this; the floor said: exact row → green.
  if (suspect && !partialName && byBoth.length >= 1) {
    const sameNameOther = byName.filter(r => !byBoth.includes(r) && !isDone(r));
    if (!sameNameOther.length) suspect = false;
  }

  // The camera doubts its own read: part of the name or number was covered,
  // cut off, or the number sat off-centre (a digit hidden). Never green. Offer
  // every row the read could be a piece of, and say what was wrong.
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
    // with it. The one addition is for a single-digit read: the two-digit rows
    // a hidden digit would make (#4 → #40, #14), the case this guard exists
    // for. Only when the read matches no row at all do the near misses come
    // in: one-digit substitutions, and for a covered two-digit read, each
    // digit on its own ("35" guessed as 55 or 75 still finds #35 and #5).
    const exact = dedupe([...byBoth, ...byName, ...byNum]);
    const hidden = nNum.length === 1 ? hiddenDigitNumbers(nNum, roster) : [];
    // A COVERED two-digit read is a guess at the hidden digit ("21" with the 3
    // under a hand is the #31), so it also offers the rows one digit away.
    const obs = String(read.obstruction || "").toLowerCase();
    const side = /\b(left|first)\b/.test(obs) ? 0 : /\b(right|second|last)\b/.test(obs) ? 1 : null;
    const guessedDigit = partialNum && read.numberComplete === false && nNum.length === 2 ? nearNumbers(nNum, roster, { anyDigit: true, side, sameLength: true }) : [];
    const cands = exact.length
      ? dedupe([...exact, ...hidden, ...guessedDigit])
      : dedupe([...hidden, ...(nNum.length === 1 && hidden.length ? [] : nearNumbers(nNum, roster, { anyDigit: partialNum })), ...(partialNum ? subNumberCandidates(nNum, roster) : []), ...(partialName ? [] : nearNames(nName, roster))]);   // a covered lone digit with hidden-digit rows to offer needs no substitutions
    // Name and number pointing at different rows is a contradiction: always ask.
    const contradiction = byName.length >= 1 && byNum.length >= 1 && byBoth.length === 0;
    if (!contradiction) {
      // A row with a name is only ever "direct" when its name was read: a
      // nameless read on a named row is never green, however few rows there are.
      // …and a row reached through its name is only "direct" when the number
      // read is that row's number or nothing was read: a cut-short "Ngu" with a
      // misread #36 is not the #34 Nguyen, it is a question.
      // A cut-short name ("Mar…") settles only through the exact number (byBoth):
      // with no number read it is two missing pieces, not a match.
      const direct = byBoth[0]
        || (!partialName && byName.length === 1 && byNum.length === 0 && (!nNum || normNum(byName[0].number) === nNum) ? byName[0] : null)
        || (byNum.length === 1 && byName.length === 0 && !norm(byNum[0].name) ? byNum[0] : null);
      const sure = soleOpen(direct, cands);
      if (sure) return sure;
      // Several rows carry the read (same number, different colour or size):
      // the colour seen, then "every other one has passed", settle it the
      // same way they do for a clean read — as long as no hidden-digit row is
      // still open to compete.
      // Twins must carry the number that was read: "Bro" with #64 never settles
      // on #98 Brown. Any other open candidate (a different number reached by
      // name, a hidden-digit row) keeps it a question.
      const sameNum = nNum ? exact.filter(r => normNum(r.number) === nNum) : exact;
      if ((nNum || !partialName) && sameNum.length > 1 && !cands.some(r => !sameNum.includes(r) && !isDone(r))) {   // a cut-short name with no number never settles
        const sure2 = settleTwins(sameNum, nName ? sameNum.filter(r => byName.includes(r)) : sameNum.filter(r => !norm(r.name)), read);   // eligible: the name read fits, or no name to read
        if (sure2) return sure2;
      }
    }
    if (cands.length) return { type: "pick", candidates: withoutNamed(cands, nName, read, numberOnly), reason: `Check the jersey: ${why.join("; ")}${what}. Is it one of these?`, soft: true };
    return { type: "none", reason: `${why.join("; ")}${what}`, soft: true };
  }

  // Name and number both agree.
  if (byBoth.length >= 1) {
    return single(byBoth) || sameReadRows(byBoth, read, "Same name and number on more than one row — check size and team");
  }

  // A number with no name, where the row it points at HAS a name: the name may
  // be hidden or out of frame, and so may a digit. Green needs both. The
  // operator sees the #4 row first, then rows a hidden digit would make (#40,
  // #14). A row with no name of its own (a mixed roster) has nothing to read
  // and stays green on a clean number.
  if (byNum.length >= 1 && nName === "" && !typed && byNum.some(r => norm(r.name))) {
    const cands = dedupe([...byNum, ...hiddenDigitNumbers(nNum, roster)]);
    if (cands.length === 1 && isDone(cands[0])) return { type: "duplicate", match: cands[0] };
    // No "sole candidate" shortcut here: every row in byNum that could be
    // green has a name, and that name was not read. The floor showed what the
    // shortcut does — a nameless #21 passed as LEACH.
    // Several rows with this number: the colour seen may settle it — but only
    // among rows with NO name, and only on the body colour. A row with a name
    // needs its name read before it can be green; a nameless read that lands
    // on "DONNELLY" because the jersey's trim is red is exactly the wrong green.
    if (byNum.length > 1 && !cands.some(r => !byNum.includes(r) && !isDone(r))) {   // no open hidden-digit row competing
      const s2 = settleTwins(byNum, byNum.filter(r => !norm(r.name)), read);
      if (s2) return s2;
    }
    return { type: "pick", candidates: withoutNamed(cands, nName, read, numberOnly), reason: `Read #${nNum} but no name — is the name hidden or out of frame? Is it one of these?`, soft: true };
  }

  // The name points at one row, the number at another: a digit was misread
  // (6↔9, 1↔7, a merged sleeve). The name is the more reliable read; offer its
  // row first and never go green.
  if (byName.length >= 1 && byNum.length >= 1) {
    const nums = [...new Set(byName.map(r => r.number))].join(" / ");
    return { type: "pick", candidates: dedupe([...byName, ...byNum]), reason: `Name matches #${nums} but the number read as #${nNum}` };
  }

  // Number read; no name read, or a number-only roster.
  if (byNum.length >= 1 && (nName === "" || numberOnly)) {
    return single(byNum) || sameReadRows(byNum, read, "More than one row with this number — check size and team", nName === "" ? byNum.filter(r => !norm(r.name)) : byNum);
  }

  // Number is on the roster but the name read agrees with no row.
  if (byNum.length >= 1) {
    return { type: "pick", candidates: dedupe([...byNum, ...nearNames(nName, roster)]), reason: `#${nNum} is on the roster but the name read as "${String(name).trim()}"` };
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
      return soleOpen(byName.length === 1 ? byName[0] : null, byName) || { type: "pick", candidates: byName, reason: `Read "${String(name).trim()}" but no number — is #${nums} hidden or out of frame? Is it this jersey?`, soft: true };
    }
    return { type: "pick", candidates: byName, reason: `Name matches #${[...new Set(byName.map(r => r.number))].join(" / ")} but the number read as #${nNum}` };
  }

  // Nothing exact: nearest rows only.
  const close = dedupe([...nearNumbers(nNum, roster), ...nearNames(nName, roster)]);
  if (close.length) return { type: "close", candidates: close, reason: "No exact match — nearest rows" };
  return { type: "none" };
}

// Which of `fields` differ among the candidates — drives the adaptive headline
// (when name and number are identical, the size or colour becomes the big text).
export function differingFields(candidates, fields) {
  return fields.filter(f => new Set(candidates.map(c => String(c[f] ?? "").trim().toLowerCase())).size > 1);
}
