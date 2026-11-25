// ── What a read becomes: the station's result-screen policy ─────────────────
// The camera's read goes to the matcher (match.js), and the matcher's answer
// decides which screen the operator sees. That decision lived inside App.jsx
// (doRunScan), and the operator simulation re-stated it by hand, so the two
// could drift apart. It lives here now, in one place: App.jsx and the
// simulation both call it, and tests hold it (code review of 23 Nov 2026,
// "App.jsx has no tests"; consolidation of the same day).
//
// The rules, in order:
//   the read failed (an API error)            → red "SCAN FAILED"
//   nothing readable (empty table, or no
//   name and no number in view)               → no screen at all: hands-free learns the
//                                                table, a pedal press gets a quiet notice,
//                                                nothing goes in the log
//   no match could be made                    → red "COULD NOT READ"
//   one open row, sure                        → GREEN (confirm)
//   the jersey's row is done already          → ALREADY DONE (duplicate)
//   rows to choose from                       → YELLOW list (pick, or close)
//   nothing on the roster like it             → red "NOT FOUND"
// Whether a read may be green at all (doubtful reads, whole names, 07 vs 7…) is
// the matcher's job: see the rules at the top of match.js.
import { findMatches } from "./match.js";

// The camera's read (vision.js field names) as the matcher's options.
export const readOptions = d => ({
  nameComplete: d.name_complete, numberComplete: d.number_complete,
  position: d.number_position, obstruction: d.obstruction,
  colour: d.jersey_colour, trim: d.trim_colour, laidFlat: d.laid_flat, orientation: d.orientation,
});

// Nothing readable on the table: no screen, nothing in the log (the owner: an
// empty table must never give a red screen or a form; there is no jersey to enter).
// A read with any name or number in it is never "nothing", whatever jersey_present says.
export const nothingRead = d => d?.jersey_present === false || (!String(d?.number ?? "").trim() && !String(d?.name ?? "").trim());

// The matcher's answer for a read, or null when there is no name and no number to match.
export const matchRead = (roster, d) => (!d?.name && !d?.number) ? null : findMatches(roster, d.name, d.number, readOptions(d));

const jersey = r => `#${r.number}${r.name ? " · " + r.name : ""}${r.size ? " · " + r.size : ""}`;

// The screen for a read and its match. → { mode, ... } as the result overlay takes it,
// with `shown` (what the app first put up for this jersey: a correction later is told
// apart from the operator answering a question) and `tone`; or { mode: null, empty }
// for "nothing readable", which shows no screen.
export function screenFor({ error = null, read = {}, match = null } = {}) {
  if (error) return { mode: "flag", title: "SCAN FAILED", reason: "API error: " + error, shown: { mode: "flag" }, tone: "flag" };
  if (nothingRead(read)) return { mode: null, empty: read.jersey_present === false };
  if (match === null) return { mode: "flag", title: "COULD NOT READ", reason: "No name or number could be read.", shown: { mode: "flag" }, tone: "flag" };
  const m = match;
  if (m.type === "exact") return { mode: "confirm", match: m.match, shown: { mode: "confirm", id: m.match._id } };
  if (m.type === "duplicate") return {
    mode: "duplicate", match: m.match, shown: { mode: "duplicate", id: m.match._id }, tone: "flag",
    reason: `${jersey(m.match)}${m.match.scanned === "flag" ? " is flagged — with the supervisor." : " already passed this session."}`,
  };
  if (m.type === "pick" || m.type === "close") return { mode: m.type, candidates: m.candidates, reason: m.reason, ...(m.twinOf ? { twinOf: m.twinOf } : {}), shown: { mode: m.type, ids: m.candidates.map(c => c._id) } };
  return { mode: "flag", title: "NOT FOUND", reason: `"${read.name || "?"}" #${read.number || "?"} is not on this roster.${m.reason ? ` Camera: ${m.reason}.` : ""}`, shown: { mode: "flag" }, tone: "flag" };
}
