// ── Replay: yesterday's scans played back through today's screens ────────────
// The hub's ledger keeps, for every scan, the text of what the camera read
// ("#93? BOZZ [not flat]": the number, "?" when it looked covered, the name,
// "…" when it looked cut off, "[not flat]") and the row the operator ended on.
// No pictures. That is enough to run the whole order again through the
// matcher and the screens — the read is handed to the station instead of a
// camera read — and to act as the operator did: confirm the green, pick the
// same row on a list, flag the extra jersey. Development only (the station
// page with ?replay=<order>; the file is public/sim/replay-<order>.json, which
// stays out of git: it is a customer's order).
import { teamKey } from "./roster.js";

// "#93? BOZZ [not flat]" → what the camera would have returned.
export function parseRead(read) {
  const m = String(read || "").trim().match(/^#(\S*?)(\?)?(?:\s+([^[]+?))?(\s+\[not flat\])?$/);
  if (!m) return null;
  let number = m[1] === "?" ? "" : m[1];
  let name = String(m[3] || "").trim();
  const nameComplete = !name.endsWith("…");
  name = name.replace(/…$/, "");
  const numberComplete = !m[2];
  return {
    jersey_present: true, orientation: "upright",
    name, number, sleeve_numbers: [], jersey_colour: "", trim_colour: "",
    obstruction: numberComplete ? "" : "part of the number is covered",
    laid_flat: !m[4], number_position: "centre",
    name_complete: nameComplete, number_complete: numberComplete,
  };
}

// The ledger's events, oldest first, as steps the replay can take. A scan is
// an event with a read; what the operator did is on the event (the row it
// ended on, a flag that was "not on the roster", a duplicate). Marks made from
// the roster table (missing, un-check) are steps too. A flag on a jersey that
// had passed, or a jersey typed in with no read, is skipped: there is no
// screen to show for it.
export function replaySteps(events) {
  return [...(events || [])]
    .sort((a, b) => String(a.t).localeCompare(String(b.t)))
    .map(e => {
      const row = { number: String(e.number ?? ""), name: String(e.name ?? ""), size: String(e.size ?? ""), team: String(e.team ?? "") };
      const detected = e.read ? parseRead(e.read) : null;
      if (e.status === "undo")    return { kind: "undo", ...row, label: `un-check #${row.number} ${row.size} ${row.team}` };
      if (e.status === "missing") return { kind: "missing", ...row, label: `missing #${row.number} ${row.size} ${row.team}` };
      if (!detected) return { kind: "skip", ...row, label: `${e.status}: ${String(e.reason || "").slice(0, 40)} (no read)` };
      const off = e.status === "flagged" && !!e.offRoster;
      const dup = e.status === "flagged" && /^duplicate/i.test(String(e.reason || ""));
      return { kind: "scan", ...row, detected, off, dup, read: e.read, label: `${e.read} → ${off ? "not on the roster" : dup ? "duplicate" : e.status === "pass" ? `#${row.number} ${row.size} ${row.team}` : e.status}` };
    });
}

// The roster row a step speaks of: the same number, size and team. Open rows
// first; `done` asks for a row that has passed (an un-check).
export function findReplayRow(roster, step, done = false) {
  const same = r => String(r.number ?? "").trim() === step.number && String(r.size ?? "").trim() === step.size && teamKey(r.team) === teamKey(step.team);
  const rows = (roster || []).filter(same);
  return rows.find(r => (done ? !!r.scanned : !r.scanned)) || rows[0] || null;
}
export const sameReplayRow = (row, step) => !!findReplayRow([row], step, !!row.scanned);

// A stand-in for the camera frame: the number on a plain jersey, so the
// thumbnail and the flag photo show something. Returns a data URL.
export function placeholderFrame(number, name = "", width = 640, height = 480) {
  if (typeof document === "undefined") return "data:image/jpeg;base64,";
  const c = document.createElement("canvas"); c.width = width; c.height = height;
  const g = c.getContext("2d");
  g.fillStyle = "#1e293b"; g.fillRect(0, 0, width, height);
  g.fillStyle = "#334155"; g.fillRect(width * 0.12, height * 0.08, width * 0.76, height * 0.84);
  g.fillStyle = "#f8fafc"; g.textAlign = "center"; g.textBaseline = "middle";
  g.font = `bold ${Math.round(height * 0.5)}px "Barlow Condensed", Impact, sans-serif`;
  g.fillText(number ? `${number}` : "?", width / 2, height * 0.55);
  if (name) { g.font = `bold ${Math.round(height * 0.11)}px sans-serif`; g.fillText(name, width / 2, height * 0.22); }
  g.fillStyle = "#94a3b8"; g.font = `${Math.round(height * 0.06)}px sans-serif`; g.fillText("REPLAY", width / 2, height * 0.93);
  return c.toDataURL("image/jpeg", 0.7);
}
