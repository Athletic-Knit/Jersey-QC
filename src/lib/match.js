// ── Matching: what the operator sees for a read { name, number } ─────────────
import { norm, normNum, nameMatches, editDistance } from "./text.js";

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

function nearNames(nName, roster) {
  if (nName.length < 3) return [];
  const tol = nName.length >= 6 ? 2 : 1;
  return roster.filter(r => { const rn = norm(r.name); return rn && rn !== nName && editDistance(rn, nName) <= tol; });
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
 * Never auto-confirms while there is any ambiguity, and never while the number
 * read disagrees with the row the name points at.
 */
export function findMatches(roster, name, number) {
  const nName      = norm(name);
  const nNumRaw    = normNum(number);
  const numberOnly = isNumberOnlyRoster(roster);

  // Misread guard: 3+ digits cannot be a jersey number.
  if (nNumRaw && !isPlausibleNumber(nNumRaw)) {
    const byName = nName && !numberOnly ? roster.filter(r => nameMatches(nName, r.name)) : [];
    const cands  = dedupe([...byName, ...subNumberCandidates(nNumRaw, roster)]);
    if (cands.length) return { type: "pick", candidates: cands, reason: `Read "${nNumRaw}" — sleeve numbers may have merged with the back number. Which jersey is this?` };
    return { type: "none" };
  }
  const nNum = nNumRaw;

  const byNum  = nNum ? roster.filter(r => normNum(r.number) === nNum) : [];
  const byName = nName && !numberOnly ? roster.filter(r => nameMatches(nName, r.name)) : [];
  const byBoth = byNum.filter(r => nameMatches(nName, r.name));

  // Name and number both agree.
  if (byBoth.length >= 1) {
    return single(byBoth) || { type: "pick", candidates: byBoth, reason: "Same name and number on more than one row — check size and team" };
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
