// ── Self-check after a mistake ───────────────────────────────────────────────
// The floor's rule: a station that gets one wrong checks its own work on the
// next CHECKS jerseys, and every further mistake starts the count again.
//
// A "mistake" is the app being corrected by the operator: a green the
// operator overrode (typed a different jersey, or flagged it as not this
// jersey), a list the right jersey was not on, a "could not read" or "not
// found" that the operator then typed as a roster row, or a pass that was
// un-checked. The operator picking from a yellow list is not a mistake — the
// app asked.
//
// While checks are owed, every scan is read TWICE, from two frames, and the
// screen goes green only when both reads say the same jersey. Reads that
// disagree become a list of everything either read pointed at, with the
// disagreement spelled out. The model's two answers are independent enough
// that a misread digit (4.7% of clean reads in the operator simulation) is
// caught on the second read almost every time.
import { norm, normNum } from "./text.js";
import { rotated180 } from "./match.js";

export const CHECKS_AFTER_MISTAKE = 5;

export const MISTAKES = {
  greenOverridden: "a green was not this jersey",
  notOnList:       "the right jersey was not on the list",
  couldNotRead:    "the camera could not read a jersey the operator then typed",
  unchecked:       "a passed jersey was un-checked",
};

export function createVigilance({ checks = CHECKS_AFTER_MISTAKE, log } = {}) {
  let remaining = 0, mistakes = 0, last = null;
  return {
    get remaining() { return remaining; },
    get active()    { return remaining > 0; },
    get mistakes()  { return mistakes; },
    get last()      { return last; },
    noteMistake(kind) {
      mistakes++; last = { kind, at: Date.now() }; remaining = checks;
      log?.(`[self-check] ${MISTAKES[kind] || kind} — double-checking the next ${checks} jerseys`);
    },
    // One scan was shown to the operator (any colour). Returns true when that
    // scan was one of the double-checked ones.
    scanDone() { if (remaining <= 0) return false; remaining--; if (remaining === 0) log?.("[self-check] done — back to single reads"); return true; },
    reset() { remaining = 0; },
    // For the saved session.
    state() { return { remaining, mistakes, last }; },
    load(s) { if (s && typeof s === "object") { remaining = Number(s.remaining) || 0; mistakes = Number(s.mistakes) || 0; last = s.last || null; } },
  };
}

// Two reads of the same jersey agree when they name the same jersey: the same
// number, read whole both times, and the same name — or a name on one read
// and none on the other (the name was out of frame the second time; the
// mistake being hunted is a wrong digit). Two different names, or a digit
// that may be hidden, or an "empty table" answer, is a disagreement.
export function readsAgree(a, b) {
  if (!a || !b) return false;
  if (a.jersey_present === false || b.jersey_present === false) return false;
  if (normNum(a.number) !== normNum(b.number)) return false;
  const na = norm(a.name), nb = norm(b.name);
  if (na && nb && na !== nb) return false;
  if (a.number_complete === false || b.number_complete === false) return false;
  if (a.name_complete === false || b.name_complete === false) return false;
  return true;
}

// The read that says more: the one with a name, else the first.
export function fullerRead(a, b) { return !norm(a?.name) && norm(b?.name) ? b : a; }

// The screen to show from two reads and their matches.
//   agree → the match of the fuller read (the one that read the name)
//   disagree → a list of every row either read reached, never green
// `describeRead` turns a read into "#40 SAMUEL" for the reason line.
export function reconcile(d1, m1, d2, m2) {
  const rowsOf = m => !m ? [] : m.type === "exact" || m.type === "duplicate" ? [m.match] : (m.candidates || []);
  const same = (x, y) => x && y && x._id === y._id;
  if (readsAgree(d1, d2)) {
    const [d, m, mo] = fullerRead(d1, d2) === d1 ? [d1, m1, m2] : [d2, m2, m1];
    // Agreeing reads that are both green must be green on the SAME row.
    if (m && m.type === "exact" && mo && mo.type === "exact" && !same(m.match, mo.match)) { /* fall through to the list */ }
    else if (m) return { match: m, read: d, checked: true, agreed: true };
  }
  const seen = new Set(), candidates = [];
  for (const r of [...rowsOf(m1), ...rowsOf(m2)]) if (r && !seen.has(r._id)) { seen.add(r._id); candidates.push(r); }
  const a = describeRead(d1), b = describeRead(d2);
  const reason = a === b
    ? `Double-check: the two reads agree on ${a} but not on which row — which jersey is this?`
    : `Double-check: the camera read ${a} and then ${b}. Which jersey is this?`;
  if (!candidates.length) return { match: { type: "none", reason: `Double-check: ${a} then ${b} — neither is on the roster`, soft: true }, checked: true, agreed: false };
  return { match: { type: "pick", candidates, reason, soft: true, disagreed: true }, checked: true, agreed: false };
}

// A turned jersey only matters when turning could change the answer: the
// number read has an upside-down twin (6/9, 18/81, 66/99) that is open on the
// roster. A #52 reads as #52 whichever way up it lies.
export function turnMatters(read, roster) {
  if (!read || !read.orientation || read.orientation === "upright") return false;
  const n = normNum(read.number); if (!n) return false;
  const alt = rotated180(n);
  return !!alt && alt !== n && roster.some(r => normNum(r.number) === alt && !r.scanned);
}

// The first read said the jersey was turned; the frame was turned upright and
// read again. The upright read wins when it says the lettering is now upright,
// its number is whole, and it differs from the first read only the way a turn
// would (99 → 66, 9 → 6, or not at all). Anything else is a question with both.
export function settleTurned(first, m1, upright, m2) {
  const n1 = normNum(first?.number), n2 = normNum(upright?.number);
  const explained = n1 === n2 || rotated180(n1) === n2;
  if (upright && upright.orientation === "upright" && upright.number_complete !== false && explained && m2) return { match: m2, read: upright, checked: true, agreed: true };
  const rc = reconcile(first, m1, upright, m2);
  // Two reads of a jersey that is still not upright may agree on a 9 that is
  // really a 6: that agreement is never a green.
  if (rc.agreed && rc.match?.type === "exact" && upright?.orientation !== "upright") {
    return { match: { type: "pick", candidates: [rc.match.match], reason: `Read #${n2 || n1} on a jersey that is not the right way up — check the number. Is it this one?`, soft: true }, read: rc.read, checked: true, agreed: false };
  }
  return rc;
}

export function describeRead(d) {
  if (!d || d.jersey_present === false) return "no jersey";
  const n = String(d.number ?? "").trim(), s = String(d.name ?? "").trim();
  if (!n && !s) return "nothing";
  return `${n ? "#" + n : ""}${n && s ? " " : ""}${s}${d.number_complete === false ? " (digit may be hidden)" : ""}`.trim();
}

// ── The operator's inspection regime ─────────────────────────────────────────
// The same rule, for the person: after a defect, inspect the next FULL
// jerseys completely; once EVERY jerseys in a row are clean, inspect one
// completely as a spot check; a defect anywhere starts the FULL count again.
// An order opens with a full inspection of its first FULL jerseys.
//
// A "defect" is a problem the operator found on the jersey itself: a reason
// chosen on the reasons screen, typed in, or found after the jersey passed.
// A jersey the camera could not read, a duplicate, or a missing mark is not.
export const INSPECT_FULL  = 5;    // jerseys inspected fully after a defect
export const INSPECT_EVERY = 10;   // clean jerseys between spot checks

export function createInspection({ full = INSPECT_FULL, every = INSPECT_EVERY, log } = {}) {
  let phase = "full", remaining = full, clean = 0, defects = 0;
  const api = {
    // What the operator should do with the jersey on the screen now.
    current() { return { phase, remaining, clean, full, every }; },
    get full() { return phase !== "quick"; },
    defect() {
      defects++; phase = "full"; remaining = full; clean = 0;
      log?.(`[inspect] defect found — inspect the next ${full} jerseys fully`);
    },
    // A jersey passed (confirmed, or entered by hand).
    jerseyDone() {
      if (phase === "full")        { remaining--; if (remaining <= 0) { phase = "quick"; remaining = 0; clean = 0; log?.("[inspect] 5 clean — quick look from here"); } }
      else if (phase === "quick")  { clean++; if (clean >= every) { phase = "sample"; log?.(`[inspect] ${every} clean — inspect the next one fully`); } }
      else                         { phase = "quick"; clean = 0; }   // the spot check was clean
    },
    reset() { phase = "full"; remaining = full; clean = 0; },
    state() { return { phase, remaining, clean, defects }; },
    load(s) {
      if (!s || typeof s !== "object") return;
      phase = ["full", "quick", "sample"].includes(s.phase) ? s.phase : "full";
      remaining = Number(s.remaining) || 0; clean = Number(s.clean) || 0; defects = Number(s.defects) || 0;
      if (phase === "full" && remaining <= 0) remaining = full;
    },
  };
  return api;
}

// The words on the header pill and the green screen.
export function inspectLabel(cur) {
  if (!cur) return "";
  if (cur.phase === "full")   return `Inspect fully · ${cur.remaining} to go`;
  if (cur.phase === "sample") return "Inspect fully · spot check";
  return `Quick look · ${cur.clean}/${cur.every}`;
}
