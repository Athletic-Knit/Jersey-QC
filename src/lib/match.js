// ── Matching: what the operator sees for a read { name, number } ─────────────
import { norm, normNum, nameMatches, nameWords, editDistance } from "./text.js";

// A row counts as done when it passed, or was entered by hand (awaiting the
// supervisor's sign-off). A flagged row is out for repair and comes back with a
// pink slip to be scanned again, so it stays selectable.
export const isDone = r => r.scanned === "pass" || r.scanned === "manual";

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

// Roster numbers a misread could have come from — never a plain substring:
//   same length, one digit wrong      6↔9, 1↔7, 3↔8   ("19" near "10")
//   read is missing a digit           a fold hid one   ("1"  near "19")
//   read is the roster digit doubled  sleeve merge     ("88" near "8")
// "10" is NOT near "1" or "100"; "56" is NOT near "6".
function nearNumbers(nNum, roster) {
  if (!nNum) return [];
  return roster.filter(r => {
    const rn = normNum(r.number);
    if (!rn || rn === nNum || !isPlausibleNumber(rn)) return false;
    if (rn.length === nNum.length) return editDistance(rn, nNum) <= 1;
    if (nNum.length < rn.length)   return editDistance(rn, nNum) <= 1;
    return rn.length === 1 && nNum === rn + rn;
  });
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
 *   position       "left" | "centre" | "right" — where the number sat on the back
 *   obstruction    the model's words for what was in the way
 *   typed          true when the operator typed the values (no camera doubt)
 *
 * Green needs a name AND a number that both agree with one row, read in full.
 * A number with no name on a roster that has names is yellow: the name may be
 * hidden, and so may a digit. A partial or off-centre read is never green.
 * Number-only rosters stay green on a clean, complete, centred read.
 */
export function findMatches(roster, name, number, read = {}) {
  const nName      = norm(name);
  const nNumRaw    = normNum(number);
  const numberOnly = isNumberOnlyRoster(roster);
  const typed      = read.typed === true;
  const position   = typed ? "" : String(read.position || "");
  const partialName = !typed && !!nName && read.nameComplete === false;
  const partialNum  = !typed && !!nNumRaw && read.numberComplete === false;
  const offCentre   = !typed && !!nNumRaw && nNumRaw.length === 1 && (position === "left" || position === "right");
  const suspect     = partialName || partialNum || offCentre;

  // Misread guard: 3+ digits cannot be a jersey number.
  if (nNumRaw && !isPlausibleNumber(nNumRaw)) {
    const byName = nName && !numberOnly ? roster.filter(r => nameMatches(nName, r.name)) : [];
    const cands  = dedupe([...byName, ...subNumberCandidates(nNumRaw, roster)]);
    if (cands.length) return { type: "pick", candidates: cands, reason: `Read "${nNumRaw}" — sleeve numbers may have merged with the back number. Which jersey is this?` };
    return { type: "none" };
  }
  const nNum = nNumRaw;

  const byNum  = nNum ? roster.filter(r => normNum(r.number) === nNum) : [];
  const byName = nName && !numberOnly
    ? (partialName ? prefixNames(nName, roster) : roster.filter(r => nameMatches(nName, r.name)))
    : [];
  const byBoth = byNum.filter(r => byName.includes(r));

  // The camera doubts its own read: part of the name or number was covered,
  // cut off, or the number sat off-centre (a digit hidden). Never green. Offer
  // every row the read could be a piece of, and say what was wrong.
  if (suspect) {
    const shown = String(name ?? "").trim();
    const why = [];
    if (partialName) why.push(`name read as "${shown}…" and looks cut off`);
    if (partialNum)  why.push(`#${nNum} looks covered or cut off`);
    else if (offCentre) why.push(`#${nNum} sits ${position} of centre — a digit may be hidden`);
    if (!nName && !partialNum && !offCentre) why.push("no name was read");
    const what = read.obstruction ? ` (${String(read.obstruction).trim()})` : "";
    // A covered digit makes the model guess it ("35" read as 55 or 75), so a
    // partial two-digit read also offers each digit on its own and every
    // one-digit substitution; a partial one-digit read offers what a hidden
    // digit would make.
    const guessed = partialNum ? subNumberCandidates(nNum, roster) : [];
    const cands = dedupe([...byBoth, ...byName, ...byNum, ...hiddenDigitNumbers(nNum, roster), ...nearNumbers(nNum, roster), ...guessed, ...(partialName ? [] : nearNames(nName, roster))]);
    if (cands.length) return { type: "pick", candidates: cands, reason: `Check the jersey: ${why.join("; ")}${what}. Is it one of these?` };
    return { type: "none", reason: `${why.join("; ")}${what}` };
  }

  // Name and number both agree.
  if (byBoth.length >= 1) {
    return single(byBoth) || { type: "pick", candidates: byBoth, reason: "Same name and number on more than one row — check size and team" };
  }

  // A number with no name, where the row it points at HAS a name: the name may
  // be hidden or out of frame, and so may a digit. Green needs both. The
  // operator sees the #4 row first, then rows a hidden digit would make (#40,
  // #14). A row with no name of its own (a mixed roster) has nothing to read
  // and stays green on a clean number.
  if (byNum.length >= 1 && nName === "" && !typed && byNum.some(r => norm(r.name))) {
    const cands = dedupe([...byNum, ...hiddenDigitNumbers(nNum, roster)]);
    if (cands.length === 1 && isDone(cands[0])) return { type: "duplicate", match: cands[0] };
    return { type: "pick", candidates: cands, reason: `Read #${nNum} but no name — is the name hidden or out of frame? Is it one of these?` };
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
    return single(byNum) || { type: "pick", candidates: byNum, reason: "More than one row with this number — check size and team" };
  }

  // Number is on the roster but the name read agrees with no row.
  if (byNum.length >= 1) {
    return { type: "pick", candidates: dedupe([...byNum, ...nearNames(nName, roster)]), reason: `#${nNum} is on the roster but the name read as "${String(name).trim()}"` };
  }

  // Name is on the roster; the number is not.
  if (byName.length >= 1) {
    if (!nNum) return single(byName) || { type: "pick", candidates: byName, reason: "Name matches more than one row" };
    return { type: "pick", candidates: dedupe([...byName, ...nearNumbers(nNum, roster)]), reason: `Name matches #${[...new Set(byName.map(r => r.number))].join(" / ")} but the number read as #${nNum}` };
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
