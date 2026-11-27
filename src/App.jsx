// ── Jersey QC: every screen of the app ───────────────────────────────────────
// One file holds the station (sign-in, the order screen, the camera, the result
// screens, the roster table and every dialog), the packer's and sorter's
// variants of it, and the supervisor board. It draws and wires; the rules live
// in src/lib (matching in match.js and scanpolicy.js, rosters and boxes in
// roster.js, labels in labels.js and printjobs.js, the hub in hub.js, saving in
// persist.js, the self-check and inspection in vigilance.js) and the floor's
// settings in src/config.js. Styles are inline; all state is in App, at the end.
//
// Map, in file order:
//   shared styles and small parts    Pill, ScreenKeys (on-screen keys), Kbd
//   station chrome                   IdleWatch, RosterRow, CompareDays, ResumeModal
//   sign-in and order setup          SignInModal, BinByPicker, JerseyTypePicker,
//                                    UnfinishedOrders, OrderSetupModal
//   on the result screens            LivePreview, ReasonTextForm, ManualEntryForm
//   supervisor board                 PhotoThumbs, PhotoLightbox, OrderView, RouteTag,
//                                    UnfinishedPile, SupervisorPanel
//   the result screens               CandidateRow, ScanOverlay
//   station dialogs                  ResultCard, SettingsPanel, BinSetupModal (set out
//                                    boxes), ReplayFinder, StillOutModal, PackingScreen
//                                    (the one Packing screen), IssuesModal, HistoryModal,
//                                    BlanksModal, FinishedModal, PrintModal,
//                                    FinishOrderModal, RosterCompleteModal
//   App                              state, scan flow (doRunScan), result actions,
//                                    order start and finish, the station layout
import { useState, useRef, useCallback, useEffect, useLayoutEffect, useMemo, memo, Fragment } from "react";
import { flushSync } from "react-dom";
import { parseCSV, parseExcel, normaliseRosterRows, buildBinMap, binFor, binEntries, binCount, binFieldOf, binOfRow, binContents, closeBin, dropFromClosed, binOrder, boxParts, modernBins, BIN_BY, displayColumns, extraColumns, CORE_COLUMNS, orderNumberOf , nextRowId, teamKey, sortRoster, ROSTER_SORTS, rosterChoices, rosterMatches, shortages, jerseyList, blankGroups, sortCandidates, lastSizeRank, lastSizeLetter, shortSize, sizeChoiceGroups, LIST_SORTS, shipWithOf, orderList, shipParts, shipJoin, shipNorm, shipPress, shipRemove, ALL_KEY, BLANK_KEY } from "./lib/roster.js";
import { findMatches, differingFields, isDone } from "./lib/match.js";
import { normNum, norm, nameMatches } from "./lib/text.js";
import { summarise, summariseLog, exportRosterXLSX, exportLogCSV, exportDaySheetXLSX, exportCompareXLSX, localTimeStamp, localDateStamp } from "./lib/export.js";
const clockNow = () => localTimeStamp().slice(11, 16);   // "14:32", for the sign-off ticket
import { saveSession, loadSession, clearSession, saveSettings, loadSettings, saveSignIn, loadSignIn, clearSignIn, rememberName, shrinkDataUrl, downscaleImage, frameForUpload, cropDataUrl, rotateDataUrl } from "./lib/persist.js";
import { buildDamageRows, exportDamageReportXLSX } from "./lib/damage.js";
import { createAwayWatch } from "./lib/attention.js";
import { playTone } from "./lib/audio.js";
import { readJersey, uprightRotation } from "./lib/vision.js";
import { sampleFrame, createMotionGate } from "./lib/motion.js";
import { createVigilance, reconcile, turnMatters, settleTurned, createInspection, inspectLabel, checksFor } from "./lib/vigilance.js";
import { checkOfReason } from "./lib/checks.js";
import { hub, stationId, snapshotOf, stationUse, holdPrints, setPrintRolls, rollFor, cachedFloorConfig, loadFloorConfig, operatorsFrom, checkPin } from "./lib/hub.js";
import { baseSettings, effectiveSettings, recordOwn, loadOwn, saveOwn, loadFloorInUse, saveFloorInUse } from "./lib/floorsettings.js";
import { applyTheme, THEMES } from "./lib/theme.js";
import { ofRun, pickRun, orderDone, doneAt, eventsAsLog } from "./lib/ledgerview.js";
import { outOf, outList, outGroups, jerseyWords, dropOrder, listOrders, applyCheckOff, kindOfRole, kindOfSession, kindOfEntry, moveLocalToServer } from "./lib/orderstore.js";
import akLogo from "./assets/ak-logo.jpg";
import { replaySteps, findReplayRow, sameReplayRow, placeholderFrame } from "./lib/replay.js";
import { PRIOR as BOX_PRIOR, BOXES, predictBox, binCounts } from "./lib/boxmodel.js";
import { duplicateOptions } from "./lib/dupoptions.js";
import { matchRead, screenFor, tapOnly, holdBack } from "./lib/scanpolicy.js";
import { binLabels, jerseyLabel, flagLabel, listChunks, cleanSpots, repageLists, isTallTicket, labelSize as labelDots, DEFAULT_FLAG_LABEL_SIZE } from "./lib/labels.js";
import { LIST_COPIES } from "./lib/packlabels.js";
// The status line of a print with a packing list in it: each of its pages comes out four times (the owner, 25 Nov 2026).
const copiesNote = labels => (labels.some(l => l?.kind === "packlist") ? `, the packing list ${LIST_COPIES} copies` : "");
import { nowStep, listUnchanged, listIds } from "./lib/packing.js";
import { photoSet, photoCaption } from "./lib/photoset.js";
import { packBoxes, boxLabelJobs, boxListJobs, boxListLabels, boxFaceJobs, signoffJobs, stickerRows, stickerJobs, flagJobs, packFromRecord, damagedItems, damagedListJobs, damagedBoxLabel, orderSummary, summaryJobs, notInBox, notInBoxJobs, finishNotInBoxJobs, isLastBox } from "./lib/printjobs.js";
import { MODEL, EFFORT, THINKING, SEND_MAX_PX, OPERATORS, CHECKS, REASONS, JERSEY_TYPES, jerseyTypeOf, jerseyTypeLabel, reasonsFor, ROLES, STATIONS, stationOf, PIN_REQUIRED, DEFAULT_SETTINGS, severityOf, reasonCategory, NO_SIZE_TAG, FIXED_AT_STATION, GARMENT_MENU, DEFAULT_ORDER_GARMENT, LABEL_ROLLS } from "./config.js";
import { garment as garmentShape, garmentOf, garmentView, toView, fromView, spotAt, spotWords, rosterGarment, orderGarmentOf, SIDES, sideLabel, MAX_SPOTS, GARMENT_GROUPS } from "./lib/garments.js";


const S_PASS    = "pass";
const S_FLAGGED = "flagged";
const S_MANUAL  = "manual";
// A jersey that comes back (the owner, 20 Nov 2026: the loop was open): one flagged that
// is back from repair, or one marked missing that turned up. `cameBack` on a row the
// matcher sees: { was: "flag", reason } or { was: "missing" }.
const backWords = b => (b?.was === "flag" ? `Back from repair${b.reason ? " — it was flagged: " + b.reason : ""}` : "Found — it was marked missing");
// Its open flag or missing line in the log is closed when it passes.
const closeOpenFor = (log, id, resolution) => log.map(l => (l.match?._id === id && (l.status === S_FLAGGED || l.status === "missing" || l.status === "short") && !l.resolution ? { ...l, resolution } : l));

// A key code as the screens show it on a key cap: "KeyR" → "R", "ArrowUp" → "↑".
function formatKey(code) {
  if (!code) return "?";   // a key that has no setting yet (older saved settings) must never crash the screen
  const map = {
    ShiftRight: "RShift", ShiftLeft: "LShift",
    ControlRight: "RCtrl", ControlLeft: "LCtrl",
    AltRight: "RAlt", AltLeft: "LAlt",
    Space: "Space", Enter: "Enter", Tab: "Tab",
    ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→",
  };
  if (map[code]) return map[code];
  if (code.startsWith("Key"))   return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  return code;
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const card     = { background: "var(--k-card)", borderRadius: 10, border: "1px solid var(--k-rule)", marginBottom: 10, overflow: "hidden" };
const FONT_UI      = '"Barlow", system-ui, sans-serif';                          // the interface text (brand body face)
const FONT_READ    = '"Atkinson Hyperlegible", system-ui, sans-serif';           // a player's name and the roster cells: keeps 0/O, 1/l/I, 6/9 apart from 4-5 ft
const FONT_DISPLAY = '"Barlow Condensed", "Arial Narrow", system-ui, sans-serif'; // the big numerals: number, size, bin, counters
const btnPri   = { padding: "10px 20px", borderRadius: 8, border: "none", background: "var(--k-blue)", color: "var(--k-on-blue)", fontWeight: 600, fontSize: 16, cursor: "pointer" };
const btnGhost = { padding: "8px 14px", borderRadius: 8, border: "1px solid var(--k-blue)", background: "transparent", color: "var(--k-blue)", fontWeight: 600, fontSize: 14, cursor: "pointer" };
const btnSm    = { padding: "7px 14px", borderRadius: 6, fontWeight: 700, fontSize: 14, cursor: "pointer" };
const codeSt   = { background: "var(--k-field)", padding: "2px 8px", borderRadius: 4, fontSize: 14 };
const thSt     = { padding: "10px 12px", textAlign: "left", fontSize: 14, fontWeight: 700, color: "var(--k-ink-3)" };
const tdSt     = { padding: "10px 12px", color: "var(--k-ink-1)", fontSize: 18 };
const inputSt  = { width: "100%", boxSizing: "border-box", padding: "11px 14px", borderRadius: 8, border: "1px solid var(--k-rule-3)", background: "var(--k-field)", color: "var(--k-ink-1)", fontSize: 17 };
const labelSt  = { fontSize: 14, color: "var(--k-ink-3)", fontWeight: 700, display: "block", marginBottom: 6 };
const titleSt   = { fontFamily: FONT_DISPLAY, fontWeight: 700, color: "var(--k-blue)" };                 // a dialog or screen title
const titleBig  = { ...titleSt, fontWeight: 800, fontStyle: "italic" };                                                   // the big screen titles
const modalBg   = { position: "fixed", inset: 0, background: "var(--k-page)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", overflowY: "auto" };
const modalCard = { background: "var(--k-card)", borderRadius: 10, border: "1px solid var(--k-rule)", padding: 40, width: 560, maxWidth: "90vw" };
const errSt     = { fontSize: 15, color: "var(--k-red-ink)", marginBottom: 12, padding: "10px 14px", background: "var(--k-tint-red-faint)", borderRadius: 6 };
const bigBtn    = { width: "100%", padding: "15px", borderRadius: 8, border: "none", background: "var(--k-blue)", color: "var(--k-on-blue)", fontWeight: 600, fontSize: 19, cursor: "pointer" };

// A log entry's colour by its status: green passed, red flagged, amber undone or missing.
function statusColor(s) {
  if (s === S_PASS)    return "var(--k-green)";
  if (s === S_FLAGGED) return "var(--k-red)";
  if (s === S_MANUAL)  return "var(--k-ink-3)";
  if (s === "undo" || s === "missing" || s === "short") return "var(--k-amber)";
  return "var(--k-ink-4)";
}

// A small rounded count in the header ("3 By hand"); `active` fills it, when it is the filter shown.
function Pill({ color, children, onClick, active = false, alert = false, title }) {
  // The brand's status tag: a coloured dot and a word, never the colour alone. The selected
  // filter is outlined and tinted in its own colour.
  return (
    <span onClick={onClick} title={title} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: active || alert ? `color-mix(in srgb, ${color} 16%, var(--k-card))` : "var(--k-card)", color: alert ? "var(--k-red-ink)" : "var(--k-ink-1)", fontFamily: FONT_DISPLAY, fontSize: 15, fontWeight: 700, padding: "3px 11px", borderRadius: 20, border: active || alert ? `2px solid ${color}` : "1px solid var(--k-rule)", margin: active || alert ? -1 : 0, whiteSpace: "nowrap", cursor: onClick ? "pointer" : "default", userSelect: "none" }}>
      <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0 }} />
      {children}
    </span>
  );
}

// The Athletic Knit logo and "Jersey QC". The logo is a colour picture on white: bare in the
// light theme, on a white tile in the dark one (.ak-logo in index.css decides, so nothing re-renders).
function BrandMark({ height = 28, size = 22, title = "Jersey QC", color = "var(--k-blue)", style }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10, minWidth: 0, ...style }}>
      <img src={akLogo} alt="Athletic Knit" className="ak-logo" style={{ height, width: "auto", display: "block", flexShrink: 0 }} />
      {title ? <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: size, lineHeight: 1, color, whiteSpace: "nowrap" }}>{title}</span> : null}
    </span>
  );
}

// ── On-screen keys ───────────────────────────────────────────────────────────
// The stations have a mouse and four programmed keys, no keyboard. Anything
// that must be typed (the PIN, a jersey entered by hand) gets these keys under
// the field. "digits" is a numeric pad; "full" adds the letters and a dash for
// names and sizes; "search" is "full" with a space bar and Clear, for a search
// box (the roster table's, the Print menu's). Presses do not steal focus from
// the field. `typeKey` is what a press does to the text in the field.
const typeKey = (v, k) => (k === "⌫" ? v.slice(0, -1) : k === "⌧" ? "" : k === "␣" ? (v && !v.endsWith(" ") ? v + " " : v) : v + k);
const KEY_ROWS = {
  digits: [["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"], ["⌫", "0", "⏎"]],
  shipdigits: [["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"], ["⌫", "0", ","], ["⏎"]],   // the ship-with field: "," ends a number and starts the next
  full:  [["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"], ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"], ["A", "S", "D", "F", "G", "H", "J", "K", "L", "-"], ["Z", "X", "C", "V", "B", "N", "M", "⌫", "⏎"]],
  search: [["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"], ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"], ["A", "S", "D", "F", "G", "H", "J", "K", "L", "-"], ["Z", "X", "C", "V", "B", "N", "M", "⌫"], ["⌧", "␣", "⏎"]],
};
const KEY_NAMES = { "␣": "Space", "⌧": "Clear", ",": "Next number" };
function ScreenKeys({ layout = "digits", onKey, onEnter, enterLabel = "OK" }) {
  const rows = KEY_ROWS[layout] || KEY_ROWS.digits;
  const wide = layout === "digits" || layout === "shipdigits";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10, userSelect: "none" }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "flex", gap: 6, justifyContent: "center" }}>
          {r.map(k => (
            <button key={k} type="button" onMouseDown={e => e.preventDefault()} onClick={() => (k === "⏎" ? onEnter?.() : onKey(k))}
              style={{ flex: wide ? 1 : "0 0 auto", minWidth: wide ? 0 : k === "␣" ? 230 : k === "⌧" || (k === "⏎" && layout === "search") ? 96 : 44, padding: wide ? "12px 0" : "10px 0", borderRadius: 8, border: "1px solid var(--k-rule-3)", background: k === "⏎" ? "var(--k-blue)" : k === "⌫" || k === "⌧" ? "var(--k-rule-2)" : "var(--k-field)", color: k === "⏎" ? "var(--k-on-blue)" : "var(--k-ink-0)", fontSize: k === "⏎" || KEY_NAMES[k] ? 15 : 20, fontWeight: 700, cursor: "pointer" }}>
              {k === "⏎" ? enterLabel : KEY_NAMES[k] || k}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

// The "Ships with" field of both order forms (the station's and the supervisor's send-roster): every
// number is a chip with an ✕, the number being typed is in the box, and the keypad has "Next number"
// (a comma goes in by itself after every six digits too). `value` is the text, "264248, 264249", that
// `orderList` reads.
function ShipWithField({ value, onChange, placeholder }) {
  const [keys, setKeys] = useState(false);
  const ref = useRef(null);
  const { done, cur } = shipParts(value);
  return (
    <div>
      <div style={{ ...inputSt, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", padding: "6px 10px" }}>
        {done.map((n, i) => (
          <span key={i + n} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--k-bg-sky)", color: "var(--k-sky-ink-3)", border: "1px solid var(--k-sky)", borderRadius: 14, padding: "3px 4px 3px 11px", fontSize: 16, fontWeight: 700 }}>
            {n}
            <button type="button" aria-label={`Remove ${n}`} onMouseDown={e => e.preventDefault()} onClick={() => onChange(shipRemove(value, i))}
              style={{ border: "none", background: "var(--k-tint-sky)", color: "var(--k-sky-ink-3)", borderRadius: "50%", width: 24, height: 24, fontSize: 14, lineHeight: 1, cursor: "pointer", padding: 0 }}>✕</button>
          </span>
        ))}
        <input ref={ref} value={cur} inputMode="numeric" placeholder={done.length ? "next number" : placeholder}
          onChange={e => onChange(shipNorm(shipJoin(done, e.target.value)))}
          onKeyDown={e => {
            if (e.key === "Backspace" && !cur && done.length) { e.preventDefault(); onChange(shipPress(value, "⌫")); }
            else if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); e.currentTarget.blur(); }   // leave the box, like the search box; the keypad goes with it
          }}
          onFocus={() => setKeys(true)} onBlur={() => setKeys(false)}
          style={{ flex: 1, minWidth: 130, border: "none", outline: "none", background: "transparent", color: "var(--k-ink-1)", fontSize: 17, padding: "5px 2px" }} />
      </div>
      {keys && <ScreenKeys layout="shipdigits" onKey={k => onChange(shipPress(value, k))} onEnter={() => ref.current?.blur()} enterLabel="Done" />}
    </div>
  );
}

// A key cap drawn beside a button's label, so the operator sees which key does it.
function Kbd({ light, children }) {
  return (
    <kbd style={{ background: light ? "color-mix(in srgb, var(--k-strong) 12%, transparent)" : "var(--k-kbd-bg)", border: light ? "1px solid color-mix(in srgb, var(--k-strong) 30%, transparent)" : "1px solid var(--k-kbd-line)", padding: "3px 9px", borderRadius: 6, fontSize: 15, fontWeight: 700 }}>
      {children}
    </kbd>
  );
}

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

// ── Idle watch ───────────────────────────────────────────────────────────────
// Two clocks. The notice appears when nobody has touched the station — no
// key, click or tap — for IDLE_AFTER_MIN minutes, and any touch hides it
// again; someone working a stubborn jersey never sees it. The number on it
// is the other clock: minutes since the last scanned jersey, which only the
// next scan resets. So a key press makes the notice go away, but the next
// time the station sits untouched it is back with the whole time since that
// last scan. Input passes through the notice, so the scan key still scans.
// Each spell is handed back when a scan ends it.
const IDLE_AFTER_MIN = 3;
function IdleWatch({ pulse, onSpell }) {
  const lastScan = useRef(0);
  const lastTouch = useRef(0);
  const shownMin = useRef(0);                                              // minutes on the notice now up, 0 when hidden
  const [idle, setIdle] = useState(null);                                  // { minutes, since, pulse } while the notice is up
  const pulseRef = useRef(pulse);
  const onSpellRef = useRef(onSpell);
  useEffect(() => { onSpellRef.current = onSpell; }, [onSpell]);

  useEffect(() => {                                                        // a scan landed: the spell, if any, is over
    const now = Date.now();
    const min = lastScan.current ? Math.floor((now - lastScan.current) / 60000) : 0;
    if (min >= IDLE_AFTER_MIN) onSpellRef.current?.({ start: lastScan.current, end: now, minutes: min });
    lastScan.current = now; lastTouch.current = now; shownMin.current = 0; pulseRef.current = pulse;   // a notice from before this scan no longer renders
  }, [pulse]);

  useEffect(() => {
    const touch = () => { lastTouch.current = Date.now(); if (shownMin.current) { shownMin.current = 0; setIdle(null); } };
    const evs = ["keydown", "pointerdown", "touchstart"];
    evs.forEach(e => window.addEventListener(e, touch, true));
    const tick = setInterval(() => {
      const now = Date.now();
      if (now - lastTouch.current < IDLE_AFTER_MIN * 60000) return;        // someone is working here
      const min = Math.floor((now - lastScan.current) / 60000);
      if (min !== shownMin.current) {
        if (!shownMin.current) playTone("scan");
        shownMin.current = min; setIdle({ minutes: min, since: lastScan.current, pulse: pulseRef.current });
      }
    }, 5000);
    return () => { evs.forEach(e => window.removeEventListener(e, touch, true)); clearInterval(tick); };
  }, []);

  if (!idle || idle.pulse !== pulse) return null;
  const fmt = m => m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2500, background: "var(--k-amber)", color: "var(--k-on-blue)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none", fontFamily: FONT_UI, textAlign: "center", padding: 24 }}>
      <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase", opacity: 0.9 }}>Idle for</div>
      <div style={{ fontSize: "clamp(64px, 18vw, 180px)", fontWeight: 900, lineHeight: 1, margin: "16px 0" }}>{fmt(idle.minutes)}</div>
    </div>
  );
}

// One row of the station's roster table. Memoised: on a 500-jersey order the
// table is 500 rows with a menu each, and rebuilding all of them on every
// render of the app (several a scan) held the screen for most of a second
// (measured 11 Nov 2026). A row is rebuilt only when its own jersey changes.
const RosterRow = memo(function RosterRow({ r, cols, hasBins, bin, canSupervise, onMark }) {
  return (
    <tr style={{
      background: r.scanned === "pass" ? "var(--k-tint-green-faint)" : r.scanned === "flag" ? "var(--k-tint-red-faint)" : r.scanned ? "var(--k-tint-amber-faint)" : "transparent",
      borderBottom: "1px solid var(--k-field)",
    }}>
      <td style={{ ...tdSt, textAlign: "center" }}>
        {r.scanned === "pass" ? "✅" : r.scanned === "flag" ? "🛑" : r.scanned === "manual" ? "✍" : r.scanned === "missing" ? "❓" : r.scanned === "short" ? "📦" : <span style={{ color: "var(--k-ink-5)" }}>—</span>}
      </td>
      {cols.map(c => (
        <td key={c} style={{ ...tdSt, fontFamily: FONT_READ, fontWeight: c === "size" || c === "number" ? 700 : 400, color: c === "size" ? "var(--k-amber-ink)" : "var(--k-ink-1)" }}>{c === "size" ? shortSize(r[c]) : r[c]}</td>
      ))}
      {hasBins && <td style={{ ...tdSt, color: r.scanned === "flag" ? "var(--k-red-ink)" : "var(--k-blue-ink)", fontWeight: 700, whiteSpace: "nowrap" }}>{r.scanned === "flag" ? "Damaged" : bin !== null ? `Box ${bin}` : "—"}</td>}
      <td style={{ ...tdSt, padding: "2px 6px" }}>
        {/* A flagged jersey that is back from repair, or a missing one that turned up, passes from
            here when the camera cannot read it (the owner, 20 Nov 2026). A supervisor still gets
            Un-check on a flagged row. */}
        <select value={["missing", "short"].includes(r.scanned) ? "missing" : ""}
          onChange={e => onMark(r, e.target.value)}
          style={{ background: "var(--k-field)", color: "var(--k-ink-2)", border: "1px solid var(--k-rule-3)", borderRadius: 6, fontSize: 14, padding: "5px 8px" }}>
          <option value="">—</option>
          {(!r.scanned || ["missing", "short"].includes(r.scanned)) && <option value="missing">Missing</option>}
          {["missing", "short"].includes(r.scanned) && <option value="back">✓ Found — pass it</option>}
          {r.scanned === "flag" && <option value="back">🔧 Back from repair — pass it</option>}
          {(r.scanned === "pass" || r.scanned === "manual") && <option value="flag">🚩 Flag / damage</option>}
          {(r.scanned === "pass" || r.scanned === "manual" || (r.scanned === "flag" && canSupervise)) && <option value="unscan">Un-check</option>}
        </select>
      </td>
    </tr>
  );
});

// ── Compare days (the supervisor's board) ────────────────────────────────────
// One workbook over a range of days from the hub's ledger: a row per day, per
// operator, per station, per part of the day, and the defect categories day by
// day. `days` is every day the hub has; the range starts on the last seven.
function CompareDays({ days = [], stationLabel, onProblem }) {
  const known = [...days].sort();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to,   setTo]   = useState("");
  const [busy, setBusy] = useState(false);
  const first = from || known[Math.max(0, known.length - 7)] || "", last = to || known[known.length - 1] || "";
  const run = () => {
    if (!first || !last) return;
    setBusy(true);
    hub.ledgerRange(first <= last ? first : last, first <= last ? last : first)
      .then(r => { if (!(r.days || []).length) { onProblem?.("No scans on record between those two days."); return; } exportCompareXLSX(r.days, stationLabel, undefined, { categoryOf: reasonCategory }); })
      .catch(() => onProblem?.("Could not fetch those days from the hub."))
      .finally(() => setBusy(false));
  };
  const dateSt = { ...inputSt, fontSize: 13, padding: "6px 8px" };
  if (known.length < 2) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <button onClick={() => setOpen(o => !o)} title="One Excel file over several days: each day, each operator, each station, morning against afternoon, and the defect categories day by day"
        style={{ ...bigBtn, fontSize: 13, marginBottom: open ? 8 : 0, background: "transparent", border: "1px solid var(--k-blue)", color: "var(--k-blue-ink-2)" }}>⬇ Compare days (Excel) {open ? "▲" : "▼"}</button>
      {open && (
        <div style={{ padding: 10, borderRadius: 8, border: "1px solid var(--k-rule)", background: "var(--k-page)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            <label style={{ ...labelSt, marginBottom: 0 }}>From<input type="date" value={first} min={known[0]} max={known[known.length - 1]} onChange={e => setFrom(e.target.value)} style={dateSt} /></label>
            <label style={{ ...labelSt, marginBottom: 0 }}>To<input type="date" value={last} min={known[0]} max={known[known.length - 1]} onChange={e => setTo(e.target.value)} style={dateSt} /></label>
          </div>
          <button onClick={run} disabled={busy || !first || !last} style={{ ...bigBtn, fontSize: 13, background: "var(--k-blue)", color: "var(--k-on-blue)", opacity: busy ? 0.6 : 1 }}>{busy ? "Fetching…" : "Download the comparison"}</button>
          <div style={{ fontSize: 12, color: "var(--k-ink-3b)", marginTop: 6 }}>The hub keeps {known.length} {known.length === 1 ? "day" : "days"}: {known[0]} to {known[known.length - 1]}.</div>
        </div>
      )}
    </div>
  );
}

// ── Resume modal ──────────────────────────────────────────────────────────────
// A saved order found at sign-in: resume it or discard it. An order of the
// other kind (a sorter's for an inspector, or the other way) can only be set
// aside under Unfinished orders (the owner, 19 Nov 2026).
function ResumeModal({ session, onResume, onDiscard, role = "", onSetAside, onSignOut, error = "" }) {
  const done = outOf(session.roster).done;   // passed or by hand, as Finish later counts it: a missing or flagged jersey is not done (code review, low finding)
  // A sorter's order is not an inspector's, and the other way round (the owner, 19 Nov 2026).
  const kind = kindOfSession(session);
  if (role && kind !== kindOfRole(role)) return (
    <div style={{ position: "fixed", inset: 0, background: "var(--k-page)", zIndex: 2100, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "var(--k-card)", borderRadius: 16, border: "2px solid var(--k-amber)", padding: 40, width: 600, maxWidth: "90vw", textAlign: "center" }}>
        <div style={{ ...titleSt, fontSize: 28, marginBottom: 8 }}>Order {session.orderNumber || "—"} is {kind === "sorter" ? "a sorting order" : "an inspection order"}</div>
        <div style={{ fontSize: 17, color: "var(--k-ink-2)", marginBottom: 20, lineHeight: 1.4 }}>
          It was started by {session.operatorName || "someone"} as {kind === "sorter" ? "a sorter" : "an inspector"} ({done} of {session.roster.length} done). Only {kind === "sorter" ? "a sorter" : "an inspector"} can continue it.
          {" "}Set it aside to keep it under Unfinished orders for {kind === "sorter" ? "a sorter" : "an inspector"}, and start your own order here.
        </div>
        {error && <div style={{ ...errSt, marginBottom: 14 }}>{error}</div>}
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <button onClick={onSetAside} style={{ ...btnPri, fontSize: 18, padding: "14px 26px", background: "var(--k-amber)", color: "var(--k-page)" }}>⏸ Set it aside</button>
          <button onClick={onSignOut} style={{ ...btnGhost, fontSize: 17, padding: "14px 22px" }}>Sign out</button>
        </div>
      </div>
    </div>
  );
  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--k-page)", zIndex: 2100, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "var(--k-card)", borderRadius: 16, border: "2px solid var(--k-blue)", padding: 40, width: 560, maxWidth: "90vw", textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>🔄</div>
        <div style={{ ...titleSt, fontSize: 30, marginBottom: 6 }}>Resume order {session.orderNumber || "—"}?</div>
        <div style={{ fontSize: 17, color: "var(--k-ink-2)", marginBottom: 4 }}>
          {done} of {session.roster.length} garments done · {session.log.length} scans · started by {session.operatorName || "an unknown operator"}
        </div>
        <div style={{ fontSize: 15, color: "var(--k-ink-3)", marginBottom: 24 }}>Saved {new Date(session.savedAt).toLocaleString()}</div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button onClick={onResume} style={{ ...btnPri, fontSize: 19, padding: "14px 32px" }}>▶ Resume</button>
          <button onClick={onDiscard} style={{ ...btnGhost, fontSize: 17, padding: "14px 22px" }}>Start a new order</button>
        </div>
      </div>
    </div>
  );
}

// ── Sign-in (once per shift) ──────────────────────────────────────────────────
// Which station this page is, from ?station= in the address ("" when none).
const urlStation = () => { try { return new URLSearchParams(window.location.search).get("station") || ""; } catch { return ""; } };
// The replay is ours, never the floor's (the owner, 19 Nov 2026): it runs only where VITE_REPLAY=1, which
// the development and testing servers set (vite.config.stage.js; the owner, 20 Nov 2026: on the testing
// server without a special link) and the floor's vite.config.js never does. The floor runs Vite in dev mode
// too, so DEV is not enough.
const REPLAY_ON = import.meta.env.VITE_REPLAY === "1";
// A replay started from the order screen ("Replay an order") is kept for the tab, so a reload carries on.
const REPLAY_KEY = "jerseyqc.replayRun";
const storedReplay = () => { try { return JSON.parse(sessionStorage.getItem(REPLAY_KEY) || "null"); } catch { return null; } };
const storeReplay = run => { try { if (run) sessionStorage.setItem(REPLAY_KEY, JSON.stringify(run)); else sessionStorage.removeItem(REPLAY_KEY); } catch { /* too big or blocked: this tab only */ } };
// Replay (development only, src/lib/replay.js): ?replay=<order> on the station
// page, kept in sessionStorage so the sign-in's reload does not lose it.
const replayRequested = () => { try { const q = new URLSearchParams(window.location.search).get("replay"); if (q) sessionStorage.setItem("jerseyqc.replay", q); return sessionStorage.getItem("jerseyqc.replay") || ""; } catch { return ""; } };
// Switch this page to a station: the address changes and the page reloads, so
// the saved order, the sign-in and the hub id all follow the station.
const goToStation = id => { const u = new URL(window.location.href); u.searchParams.set("station", id); window.location.href = u.toString(); };

// Sign-in is two steps: the role, then — for an inspector — which station.
// Each inspection station has its own PIN; packer and supervisor have a role
// PIN. The page's ?station= says where it is: station1..3 for inspectors,
// "packing" for the packer, "supervisor" for the supervisor's board.
// Admin (the co-op, 27 Nov 2026): a choice on the sign-in screen that opens the admin panel
// (?view=admin), where the panel's own password (JQC_ADMIN_PASSWORD, checked by the server) is
// the gate. It is not a floor role: no PIN, no name, no station, nothing in ROLES.
const ADMIN_CHOICE = { id: "admin", label: "Admin" };
// The sign-in card's body under the role row: as tall as the PIN and its keypad, so it keeps one height whatever role is picked.
const SIGNIN_BODY_MIN = 296;
const ROLE_CHOICES = [...ROLES, ADMIN_CHOICE];
const openAdminPanel = () => { const u = new URL(window.location.href); u.search = "?view=admin"; u.hash = ""; window.location.href = u.toString(); };
// The head of a long dialog (its title and Close) stays at the top while the
// list under it scrolls, like a frozen header row in Excel (the owner, 19 Nov
// 2026: no keyboard on the floor, so Esc was a scroll to the end and a click).
const STICKY_HEAD = { display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap", position: "sticky", top: -30, zIndex: 3, background: "var(--k-card)", margin: "-30px -30px 0", padding: "30px 30px 12px", borderBottom: "1px solid var(--k-rule)" };
const BLOCKED_ROLES = ["packer"];   // shown, but not signable: the packer side is not built yet
const roleOfStation = id => stationOf(id) ? "inspector" : id === "packing" ? "packer" : id === "supervisor" ? "supervisor" : "";
const atStation = role => role === "inspector" || role === "sorter";   // signs in at a station, with the station's PIN
const pageFor = (role, station) => atStation(role) ? station : role === "packer" ? "packing" : "supervisor";

function SignInModal({ onSignIn, initial, onCancel, title }) {   // onCancel + title: hand the station to another operator without losing the order
  const here = urlStation();
  const [role,    setRole]    = useState(roleOfStation(here) || initial?.role || "inspector");
  const [station, setStation] = useState(stationOf(here) ? here : STATIONS[0].id);
  const [pin,   setPin]   = useState("");
  // The names: the admin panel's list when it set one (kept from the last fetch, fetched again
  // as this screen opens), else VITE_OPERATORS (phase 2, 26 Nov 2026).
  const [operators, setOperators] = useState(() => operatorsFrom(cachedFloorConfig(), OPERATORS));
  const [name, setName] = useState(() => (initial?.name || "") || operators[0] || "");
  const [nameChoice, setNameChoice] = useState(() => (initial?.name && !operators.includes(initial.name) ? "other" : (initial?.name || operators[0] || "other")));   // "Other": someone sent to this station for the day   // a name from the list, or "other" with the field below
  const choiceRef = useRef(nameChoice);
  useEffect(() => { choiceRef.current = nameChoice; }, [nameChoice]);
  const [pinFocus, setPinFocus] = useState(false);   // only the field's highlight follows focus; the keypad is always there
  const [error, setError] = useState(null);
  // Admin (the co-op, 27 Nov 2026): signed in to the panel already → only "Open the admin panel";
  // else its name and password right here (the panel's own /login, which sets its cookie).
  const [adminS, setAdminS] = useState(null);      // null: asking; { setup, signedIn, name }; { missing: true }: no admin panel on this server
  const [adminName, setAdminName] = useState(() => { try { return localStorage.getItem("jerseyqc.admin.name") || ""; } catch { return ""; } });
  const [adminPw, setAdminPw] = useState("");
  useEffect(() => {
    if (role !== ADMIN_CHOICE.id) return;
    let on = true;
    fetch("/api/admin/session", { credentials: "same-origin" })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(String(r.status))))
      .then(j => { if (on) setAdminS(j && typeof j.setup === "boolean" ? j : { missing: true }); })
      .catch(() => { if (on) setAdminS({ missing: true }); });
    return () => { on = false; };
  }, [role]);
  const adminSignIn = async () => {
    if (!adminName.trim()) { setError("Type your name: it goes in the change log."); return; }
    if (!adminPw) { setError("Type the admin password."); return; }
    const r = await fetch("/api/admin/login", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: adminName.trim(), password: adminPw }) });
    let j = {}; try { j = await r.json(); } catch { /* empty */ }
    if (!r.ok) { setAdminPw(""); setError(j.error || `The server answered ${r.status}.`); return; }
    try { localStorage.setItem("jerseyqc.admin.name", adminName.trim()); } catch { /* fine */ }
    openAdminPanel();
  };
  useEffect(() => {
    let on = true;
    loadFloorConfig().then(c => {
      if (!on) return;
      const next = operatorsFrom(c, OPERATORS);
      setOperators(next);
      // The name picked is no longer on the list (and was not typed under Other): the first one.
      const ch = choiceRef.current;
      if (ch !== "other" && !next.includes(ch)) { setNameChoice(next[0] || "other"); setName(next[0] || ""); }
    }).catch(() => {});   // the hub is away: the names kept from last time, or .env.local's
    return () => { on = false; };
  }, []);
  // Which stations are live right now, and from where: refreshed every 5 s.
  const [use, setUse] = useState({});
  useEffect(() => {
    let on = true;
    const load = () => hub.stations().then(a => { if (on) setUse(stationUse(a)); }).catch(() => {});
    load(); const t = setInterval(load, 5000);
    return () => { on = false; clearInterval(t); };
  }, []);
  const busyBy = id => { const u = use["st-" + id]; return u && u.live && !u.mine ? (u.operator || "someone") : ""; };
  const roleDef = ROLE_CHOICES.find(r => r.id === role);
  const isAdmin = role === ADMIN_CHOICE.id;
  const stDef   = stationOf(station);
  const pinOwner = atStation(role) ? stDef : roleDef;      // whose PIN opens this page
  const target   = pageFor(role, station);                      // where the page should be for this choice
  // A new sign-in moves the page to the chosen station or board (reload, so the
  // saved order, the sign-in and the hub id follow); a take-over keeps it.
  const pickRole    = r  => { setRole(r.id); setError(null); if (r.id === ADMIN_CHOICE.id) return; const t = pageFor(r.id, station); if (!atStation(r.id) && t !== here && !onCancel) goToStation(t); };
  const pickStation = id => { setStation(id); if (id !== here && !onCancel) goToStation(id); };

  // The PIN is checked by the server (phase 7, checkPin in hub.js): the page holds none.
  const [checking, setChecking] = useState(false);
  const checkingRef = useRef(false);
  const submit = async () => {
    if (checkingRef.current) return;
    if (isAdmin) {
      if (!adminS || adminS.missing || !adminS.setup) return;
      if (adminS.signedIn) { openAdminPanel(); return; }
      checkingRef.current = true; setChecking(true);
      try { await adminSignIn(); } catch (e) { setError(`The server did not answer (${e.message}).`); } finally { checkingRef.current = false; setChecking(false); }
      return;
    }
    if (PIN_REQUIRED) {
      checkingRef.current = true; setChecking(true);
      const r = await checkPin(pinOwner.id, pin).finally(() => { checkingRef.current = false; setChecking(false); });
      if (!r.ok) { setError(r.error === "Wrong PIN." ? "Wrong PIN for " + pinOwner.label + "." : r.error); return; }
    }
    if (!name.trim()) { setError("Please enter your name."); return; }
    if (atStation(role) && !onCancel && busyBy(station)) { setError(`${stDef.label} is in use by ${busyBy(station)} on another PC. Pick a free station, or sign out on that PC first.`); return; }
    // The page is not on the chosen station yet (opened from the bare address):
    // it has to reload there. Save the sign-in for that station FIRST, or the
    // reload throws the name and PIN away and the operator has to do it twice.
    if (target !== here && !onCancel) { rememberName(name); saveSignIn({ role, name: name.trim() }, target); goToStation(target); return; }
    rememberName(name);
    onSignIn({ role, name: name.trim(), station: target });
  };
  const onEnter = e => { if (e.key === "Enter") submit(); };

  return (
    <div style={modalBg}>
      {/* Two columns, so the whole sign-in fits one screen with no scrolling:
          who and where on the left with the Sign in button, the PIN and its
          keypad on the right. On a narrow screen the columns stack. */}
      <div style={{ ...modalCard, padding: "24px 32px", width: 940, maxWidth: "94vw", maxHeight: "96%", overflowY: "auto", boxSizing: "border-box" }}>
        {/* The letterhead (the co-op, 27 Nov 2026): a white band across the card's top in both themes, a brand-blue rule
            under it, the logo on the left and the title on the right. The logo is a JPEG on white, so the white belongs to
            the band and dark mode shows no white patch around it. The band's colours are the light brand set on purpose. */}
        <div style={{ margin: "-24px -32px 20px", padding: "14px 32px", background: "#FFFFFF", borderBottom: "3px solid #00519B", borderRadius: "10px 10px 0 0", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px 24px", flexWrap: "wrap" }}>
          <img src={akLogo} alt="Athletic Knit" style={{ height: 44, width: "auto", display: "block", flexShrink: 0 }} />
          <div style={{ textAlign: "right", marginLeft: "auto" }}>
            <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 30, lineHeight: 1, color: "#00519B", whiteSpace: "nowrap" }}>Jersey QC Scanner</div>
            <div style={{ fontSize: 16, color: "#55607A", marginTop: 4 }}>{title || "Sign in once per shift"}</div>
          </div>
        </div>
        {/* The role row is the same on every choice (the co-op, 27 Nov 2026: switching roles must not move or
            resize what every choice shares): full width under the letterhead, so each tile has room for its word.
            The card keeps one width and one body height whatever is picked; only the part under the row changes. */}
        <div style={{ marginBottom: 18 }}>
          <label style={labelSt}>Role</label>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${ROLE_CHOICES.length},minmax(0,1fr))`, gap: 10 }}>
            {ROLE_CHOICES.map(r => {
              const blocked = BLOCKED_ROLES.includes(r.id);   // under development: nobody signs in as it
              const on = role === r.id;
              return (
              <button key={r.id} onClick={blocked ? undefined : () => pickRole(r)} disabled={!!onCancel && r.id !== role} aria-disabled={blocked || undefined} aria-pressed={on} title={blocked ? "Under development" : undefined}
                style={{ ...btnGhost, minHeight: 64, padding: "8px 12px", fontSize: 18, fontWeight: on ? 700 : 600, lineHeight: 1.15, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", borderWidth: on ? 2 : 1, borderColor: on ? "var(--k-blue)" : "var(--k-rule-2)", color: on ? "var(--k-strong)" : "var(--k-ink-2)", background: on ? "var(--k-tint-blue)" : "transparent", opacity: blocked || (onCancel && !on) ? 0.45 : 1, cursor: blocked ? "not-allowed" : "pointer" }}>
                {r.label}{blocked && <span style={{ fontSize: 12, fontWeight: 400, marginTop: 3 }}>under development</span>}
              </button>
              );
            })}
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "16px 32px", alignItems: "stretch", minHeight: SIGNIN_BODY_MIN }}>
        <div style={{ flex: "1 1 340px", minWidth: 0, display: "flex", flexDirection: "column" }}>
        {atStation(role) && (
          <div style={{ marginBottom: 12 }}>
            <label style={labelSt}>Which station?</label>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${STATIONS.length},1fr)`, gap: 10 }}>
              {STATIONS.map(s => { const by = busyBy(s.id); return (
                <button key={s.id} onClick={() => pickStation(s.id)} disabled={!!onCancel && s.id !== station} title={by ? `In use by ${by} on another PC` : ""}
                  style={{ ...btnGhost, minHeight: 56, padding: "8px 10px", fontSize: 17, fontWeight: station === s.id ? 700 : 600, borderWidth: station === s.id ? 2 : 1, borderColor: station === s.id ? (by ? "var(--k-red)" : "var(--k-blue-ink)") : by ? "var(--k-tint-red-line)" : "var(--k-rule-2)", color: station === s.id ? "var(--k-strong)" : by ? "var(--k-red-ink)" : "var(--k-ink-3)", background: station === s.id ? (by ? "var(--k-tint-red)" : "var(--k-tint-blue)") : "transparent", opacity: onCancel && s.id !== station ? 0.4 : 1 }}>
                  {s.label}{by && <div style={{ fontSize: 13, fontWeight: 400, color: "var(--k-red-ink)", marginTop: 2 }}>in use · {by}</div>}
                </button>
              ); })}
            </div>
            {busyBy(station) && <div style={{ fontSize: 14, color: "var(--k-red-ink)", marginTop: 6 }}>{stDef?.label} is in use by {busyBy(station)} on another PC right now.</div>}
          </div>
        )}
        {isAdmin && adminS && !adminS.missing && adminS.setup && adminS.signedIn && (
          <div style={{ marginBottom: 14, fontSize: 17, color: "var(--k-ink-2)" }}>Signed in as <strong style={{ color: "var(--k-strong)" }}>{adminS.name}</strong></div>
        )}
        {isAdmin && adminS && !adminS.missing && adminS.setup && !adminS.signedIn && (
          <div style={{ marginBottom: 14 }}>
            <label style={labelSt} htmlFor="adm-name">Your name</label>
            <input id="adm-name" value={adminName} onChange={e => setAdminName(e.target.value)} onKeyDown={onEnter} autoComplete="username" style={inputSt} />
          </div>
        )}
        {isAdmin && adminS && (adminS.missing || !adminS.setup) && (
          <div style={errSt}>{adminS.missing ? "This server has no admin panel." : "The admin panel is not set up on this server: JQC_ADMIN_PASSWORD is not in its .env.local."}</div>
        )}
        {!isAdmin && <div style={{ marginBottom: 14 }}>
          <label style={labelSt}>Your name</label>
          <select value={nameChoice} onChange={e => { const v = e.target.value; setNameChoice(v); setName(v === "other" ? "" : v); }} style={{ ...inputSt, cursor: "pointer" }}>
            {operators.map(n => <option key={n} value={n}>{n}</option>)}
            <option value="other">Other</option>
          </select>
          {/* "Other": the operator's own name, typed on the screen's keys (the stations have no keyboard).
              It used to sign them in as the literal name "Other" (code review, low finding). */}
          {nameChoice === "other" && (
            <>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Type your name" style={{ ...inputSt, marginTop: 8 }} />
              <div style={{ marginTop: 6 }}><ScreenKeys layout="search" onKey={k => setName(v => typeKey(v, k))} onEnter={submit} enterLabel="Sign in" /></div>
            </>
          )}
        </div>}
        <div style={{ marginTop: "auto" }} />
        {error && <div style={errSt}>{error}</div>}
        {(() => { const off = checking || (isAdmin && (!adminS || adminS.missing || !adminS.setup)); return (
        <button onClick={submit} disabled={off} style={off ? { ...bigBtn, opacity: 0.6 } : bigBtn}>{checking ? (isAdmin ? "Signing in…" : "Checking the PIN…") : isAdmin ? (adminS?.signedIn ? "Open the admin panel →" : "Sign in to the admin panel →") : onCancel ? "Take over →" : "Sign in →"}</button>
        ); })()}
        {onCancel && <button onClick={onCancel} style={{ ...btnGhost, width: "100%", marginTop: 8 }}>← Back, keep the current operator</button>}
        </div>
        {isAdmin && (
          <div style={{ flex: "1 1 300px", minWidth: 0 }}>
            {adminS && !adminS.missing && adminS.setup && !adminS.signedIn && <>
              <label style={labelSt} htmlFor="adm-pw">Admin password</label>
              <input id="adm-pw" type="password" value={adminPw} onChange={e => setAdminPw(e.target.value)} onKeyDown={onEnter} autoComplete="current-password" autoFocus style={inputSt} />
            </>}
          </div>
        )}
        {PIN_REQUIRED && !isAdmin && (
          <div style={{ flex: "1 1 300px", minWidth: 0 }}>
            <label style={labelSt}>PIN</label>
            <input type="password" inputMode="numeric" value={pin} onChange={e => setPin(e.target.value)} placeholder="••••" autoFocus onKeyDown={onEnter} onFocus={() => setPinFocus(true)} onBlur={() => setPinFocus(false)} style={{ ...inputSt, borderColor: pinFocus ? "var(--k-blue-ink)" : inputSt.borderColor }} />
            <ScreenKeys layout="digits" onKey={k => setPin(v => (k === "⌫" ? v.slice(0, -1) : (v + k).slice(0, 8)))} onEnter={submit} enterLabel="Sign in" />
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

// ── Order setup (every order; no PIN) ─────────────────────────────────────────
// How the order is sorted at the station: a bin per team, a bin per size, or none.
function BinByPicker({ value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {BIN_BY.map(t => (
        <button key={t.id} type="button" onClick={() => onChange(t.id)} title={t.hint}
          style={{ ...btnGhost, padding: "9px 14px", fontSize: 16, borderColor: value === t.id ? "var(--k-blue-ink)" : "var(--k-rule-3)", background: value === t.id ? "var(--k-tint-blue)" : "transparent", color: value === t.id ? "var(--k-blue-ink-2)" : "var(--k-ink-2)", fontWeight: value === t.id ? 700 : 400 }}>
          {t.label} <span style={{ fontSize: 14, color: "var(--k-ink-3)", fontWeight: 400 }}>· {t.hint}</span>
        </button>
      ))}
    </div>
  );
}

// ECHL / ECHL replica / Sublimated as buttons; "" = not set. The flag reasons
// follow the type; with none set the station offers every reason.
function JerseyTypePicker({ value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {JERSEY_TYPES.map(t => (
        <button key={t.id} type="button" onClick={() => onChange(value === t.id ? "" : t.id)} title={t.hint}
          style={{ ...btnGhost, padding: "9px 14px", fontSize: 16, borderColor: value === t.id ? "var(--k-blue-ink)" : "var(--k-rule-3)", background: value === t.id ? "var(--k-tint-blue)" : "transparent", color: value === t.id ? "var(--k-blue-ink-2)" : "var(--k-ink-2)", fontWeight: value === t.id ? 700 : 400 }}>
          {t.label} <span style={{ fontSize: 14, color: "var(--k-ink-3)", fontWeight: 400 }}>· {t.construction}</span>
        </button>
      ))}
    </div>
  );
}

// What the order's garments are, for the outline of the "where is the damage"
// step and the flag ticket (the plan, 23 Nov 2026): one button a kind, hockey
// by default. A roster whose rows mostly carry a known style picks it by itself.
function GarmentPicker({ value, onChange }) {
  const v = orderGarmentOf(value);
  // One row a group (Hockey, Basketball, Baseball, Apparel: the owner, 26 Nov 2026).
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {GARMENT_GROUPS.map(group => (
        <div key={group} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <span style={{ flex: "0 0 92px", paddingTop: 11, fontSize: 13, fontWeight: 700, color: "var(--k-ink-3)", textTransform: "uppercase", letterSpacing: 1 }}>{group}</span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {GARMENT_MENU.filter(g => g.group === group).map(g => (
            <button key={g.id} type="button" onClick={() => onChange(g.id)} aria-pressed={v === g.id}
              style={{ ...btnGhost, padding: "9px 14px", fontSize: 16, borderColor: v === g.id ? "var(--k-blue-ink)" : "var(--k-rule-3)", background: v === g.id ? "var(--k-tint-blue)" : "transparent", color: v === g.id ? "var(--k-blue-ink-2)" : "var(--k-ink-2)", fontWeight: v === g.id ? 700 : 400 }}>
              {g.label}
            </button>
          ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Unfinished orders (23, 24; the owner, 19 Nov 2026) ────────────────────
// Every order put aside with "Finish later", kept whole on the server: any
// station picks one up, one station at a time. The ones the supervisor gave to
// this station come first. Search by order number. What the supervisor checked
// off on the board is applied when the order is opened.
function UnfinishedOrders({ onPickUp, stationLabel, tall = false, role = "" }) {
  const mine = kindOfRole(role), me = stationId();
  const [list, setList] = useState(null);         // the server's entries (null: still asking)
  const [seenAt, setSeenAt] = useState(0);         // when the list came (a finished order is mentioned for a day only)
  const [q, setQ] = useState("");
  const [keys, setKeys] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const qRef = useRef(null);
  useEffect(() => {
    let on = true;
    const load = async () => {
      await moveLocalToServer(hub.parkOrder).catch(() => 0);   // any order still on this PC from before
      try { const r = await hub.unfinished({ all: true }); if (on) { setList(r.orders || []); setSeenAt(Date.now()); setErr(""); } }
      catch (e) { if (on) { setList(l => l || []); setErr(`The server did not answer (${e.message}). The unfinished orders are kept there: try again in a moment.`); } }
    };
    load(); const t = setInterval(load, 15000);
    return () => { on = false; clearInterval(t); };
  }, []);
  const term = q.trim();
  const match = e => !term || String(e.order).includes(term);
  const ofMine = (list || []).filter(e => kindOfEntry(e) === mine);
  const open = ofMine.filter(e => !e.closed && match(e))
    .sort((a, b) => ((b.assignedTo === me) - (a.assignedTo === me)) || ((b.updatedAt || 0) - (a.updatedAt || 0)));
  // An order the supervisor finished on the board is mentioned for a day, to the station that put it
  // aside or was given it, then no more (the owner, 20 Nov 2026: it showed every time, for 90 days).
  const closed = ofMine.filter(e => e.closed && match(e) && (e.station === me || e.assignedTo === me) && seenAt - (e.closed.at || 0) < 86400000);
  const other = (list || []).filter(e => !e.closed && kindOfEntry(e) !== mine).length;
  const pick = e => { setBusy(`Opening order ${e.order}…`); setErr(""); Promise.resolve(onPickUp({ hubEntry: e })).catch(x => setErr(x.message)).finally(() => setBusy("")); };
  const day = ms => new Date(ms).toLocaleDateString([], { day: "numeric", month: "short" });
  return (
    <div style={{ marginBottom: 12 }}>
      {!tall && <label style={labelSt}>Unfinished orders — pick one up again</label>}
      <input ref={qRef} value={q} onChange={e => setQ(e.target.value)} placeholder="Type an order number to find it" style={{ ...inputSt, width: "100%" }}
        onFocus={() => setKeys(true)} onBlur={() => setKeys(false)} />
      {keys && <ScreenKeys layout="digits" onKey={k => setQ(v => typeKey(v, k))} onEnter={() => qRef.current?.blur()} enterLabel="Done" />}
      {err && <div style={{ ...errSt, marginTop: 6 }}>{err}</div>}
      {busy && <div style={{ fontSize: 16, color: "var(--k-ink-3)", marginTop: 6 }}>{busy}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, ...(tall ? {} : { maxHeight: 190, overflowY: "auto" }), marginTop: 8 }}>
        {list === null && <div style={{ fontSize: 16, color: "var(--k-ink-3b)" }}>Asking the server…</div>}
        {open.map(e => {
          const busyElsewhere = e.openOn && e.openOn.station !== me;
          const givenHere = e.assignedTo === me;
          return (
            <button key={e.id} onClick={() => !busyElsewhere && pick(e)} disabled={busyElsewhere}
              style={{ ...btnGhost, textAlign: "left", padding: "10px 14px", borderColor: givenHere ? "var(--k-blue-ink)" : "var(--k-amber)", color: "var(--k-ink-1)", opacity: busyElsewhere ? 0.5 : 1, cursor: busyElsewhere ? "not-allowed" : "pointer" }}>
              <div style={{ fontSize: 20, fontWeight: 900 }}>Order {e.order} <span style={{ fontWeight: 700, color: "var(--k-green-ink)" }}>· {e.done} of {e.total} done</span></div>
              <div style={{ fontSize: 16, color: "var(--k-ink-2)", marginTop: 2 }}>
                {(() => {
                  const g = e.out ? outGroups(e.out) : null;
                  const n = { flag: g ? g.flag.length : e.flagged, missing: g ? g.missing.length : e.missing, extra: g ? g.extra.length : 0, todo: g ? g.todo.length : e.toScan };
                  const parts = [n.flag ? <span key="f" style={{ color: "var(--k-red-ink)" }}>{n.flag} waiting on repair</span> : null,
                    n.missing ? <span key="m" style={{ color: "var(--k-amber-ink)" }}>{n.missing} missing</span> : null,
                    n.extra ? <span key="x" style={{ color: "var(--k-pink-ink)" }}>{n.extra} extra (with the supervisor)</span> : null,
                    n.todo ? <span key="t">{n.todo} unscanned</span> : null].filter(Boolean);
                  const named = g ? [...g.flag, ...g.missing].slice(0, 4).map(j => jerseyWords(j) + (j.status === "flag" && j.reason ? ` (${j.reason})` : j.status !== "flag" ? " (missing)" : "")) : [];
                  return <>Still out: {parts.reduce((a, x) => a.length ? [...a, " · ", x] : [x], [])}{named.length ? <div style={{ fontSize: 14, color: "var(--k-ink-3)" }}>{named.join(", ")}{g.flag.length + g.missing.length > 4 ? " …" : ""}</div> : null}</>;
                })()}
              </div>
              <div style={{ fontSize: 14, color: "var(--k-ink-3)", marginTop: 2 }}>
                Put aside on {stationLabel(e.station)} by {e.operator || "—"}, {day(e.parkedAt)}
                {givenHere && <span style={{ color: "var(--k-blue-ink)", fontWeight: 800 }}> · Given to this station by {e.assignedBy || "the supervisor"}</span>}
                {busyElsewhere && <span style={{ color: "var(--k-amber-ink)", fontWeight: 800 }}> · Open on {stationLabel(e.openOn.station)} right now</span>}
              </div>
            </button>
          );
        })}
        {list && !open.length && <div style={{ fontSize: 16, color: "var(--k-ink-3b)" }}>{term ? `No unfinished order ${term}.` : "No unfinished orders."}</div>}
        {closed.length > 0 && <div style={{ fontSize: 15, color: "var(--k-green-ink)" }}>✓ Finished by the supervisor on the board: {closed.map(e => e.order).join(", ")}</div>}
        {other > 0 && <div style={{ fontSize: 15, color: "var(--k-ink-3b)" }}>{other} more {other === 1 ? "is" : "are"} for {mine === "sorter" ? "an inspector" : "a sorter"}: only {mine === "sorter" ? "an inspector" : "a sorter"} sees {other === 1 ? "it" : "them"}.</div>}
      </div>
    </div>
  );
}

// The order screen, before every order: the order number, the roster file (or
// an order the supervisor sent, behind "Assigned orders"), the jersey type, how
// it is sorted into boxes, the orders it ships with, and the way to an
// unfinished order or (development and testing only) a replay.
function OrderSetupModal({ operatorName, role, xlsxReady, onStart, onSignOut, onPrint, onPickUp, onReplay, stationLabel = id => String(id || "").replace(/^st-/, "") }) {
  const [showReplay, setShowReplay] = useState(false);   // development and testing only: replay a floor order
  const [order,   setOrder]   = useState("");
  const [notes,   setNotes]   = useState("");
  const [customer, setCustomer] = useState("");     // printed on the box's outside label and the sign-off ticket; empty: the box's team name
  const [customerKeys, setCustomerKeys] = useState(false);   // on-screen keys under the customer while the cursor is in it
  const customerRef = useRef(null);
  const [jerseyType, setJerseyType] = useState("");
  const [garment, setGarment] = useState(DEFAULT_ORDER_GARMENT);   // the outline of "where is the damage"; a roster of known styles picks it
  const garmentByHand = useRef(false);   // picked on the screen: a roster file chosen later leaves it alone
  const [binBy, setBinBy] = useState("team");       // bins by team, by size, or none — the supervisor's roster brings its own
  const [file,    setFile]    = useState(null);
  const [error,   setError]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [showUnfinished, setShowUnfinished] = useState(false);   // the unfinished orders, behind one button (the owner, 19 Nov 2026)
  const [showAssigned, setShowAssigned] = useState(false);       // the orders the supervisor sent, behind the button beside it
  useEffect(() => { if (!showAssigned) return; const h = e => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setShowAssigned(false); } }; window.addEventListener("keydown", h, true); return () => window.removeEventListener("keydown", h, true); }, [showAssigned]);
  const [unfinishedCount, setUnfinishedCount] = useState(0);
  useEffect(() => {
    if (!onPickUp) return;
    let on = true;
    const load = async () => {
      const n = await hub.unfinished().then(r => (r.orders || []).filter(e => kindOfEntry(e) === kindOfRole(role)).length).catch(() => null);
      if (on && n !== null) setUnfinishedCount(n);
    };
    load(); const t = setInterval(load, 15000);
    return () => { on = false; clearInterval(t); };
  }, [onPickUp, showUnfinished, role]);
  useEffect(() => { if (!showUnfinished) return; const h = e => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setShowUnfinished(false); } }; window.addEventListener("keydown", h, true); return () => window.removeEventListener("keydown", h, true); }, [showUnfinished]);
  const [orderKeys, setOrderKeys] = useState(false);   // on-screen keys under the order number while the cursor is in it: the stations have no keyboard
  const orderRef = useRef(null);
  const [hubRosters, setHubRosters] = useState([]);
  const [picked,  setPicked]  = useState(null);     // a roster the supervisor sent
  const [shipText, setShipText] = useState("");     // the orders this one ships with ("264248, 264249"), from the order form
  const fileRef = useRef(null);
  const loadRef = useRef(() => {});   // the roster list refresh, for after a refused start

  // Rosters the supervisor has sent to the hub, if a hub is running.
  useEffect(() => {
    let on = true;
    // Only rosters sent to this station, or to any station — checked every few
    // seconds, so an order the supervisor sends while this screen is open appears by itself.
    const mine = stationId();
    const load = () => hub.rosters().then(r => { if (on) setHubRosters((r.rosters || []).filter(x => !x.forStation || x.forStation === mine)); }).catch(() => {});
    load();
    const t = setInterval(load, 5000);
    loadRef.current = load;
    return () => { on = false; clearInterval(t); };
  }, []);
  // An order another station is working on is shown, not offered: one station per order.
  const takenElsewhere = r => !!r.takenBy && r.takenBy.station !== stationId();

  // A chosen file is read at once for the order number it may carry, so the
  // field fills itself; the operator can still type over it.
  const handleFile = (e) => {
    const f = e.target.files[0];
    if (f) {
      setFile(f); setPicked(null); setError(null);
      (async () => {
        try {
          const parsed = /\.(xlsx|xls)$/i.test(f.name) ? await parseExcel(f) : parseCSV(await f.text());
          const n = orderNumberOf(parsed);
          if (n) setOrder(o => o.trim() || n);
          const sw = shipWithOf(parsed);
          if (sw.length) setShipText(t => t.trim() || shipNorm(sw.join(", ")));
          const g = rosterGarment(parsed);
          if (!garmentByHand.current) setGarment(g || DEFAULT_ORDER_GARMENT);   // a second file with no known style does not keep the first file's kind
        } catch { /* the Start button reports a bad file */ }
      })();
    }
    e.target.value = "";
  };

  const pickRoster = async (summary) => {
    try {
      const full = await hub.roster(summary.id);
      setPicked(full); setFile(null); setError(null); setShipText(shipNorm((full.shipWith || []).join(", ")));
      setOrder(full.orderNumber || ""); setNotes(full.notes || ""); setCustomer(full.customer || ""); setJerseyType(full.jerseyType || ""); setBinBy(full.binBy || "team");
      setGarment(orderGarmentOf(full.garment || rosterGarment(full.rows)));
    } catch (e) { setError("Could not fetch that roster: " + e.message); }
  };

  const canSupervise = role === "supervisor";
  // One start at a time. Enter in the order field reaches here while the button is greyed, and
  // a second start found the ship-with boxes already taken by the first and replaced its
  // result with none (code review M14). A ref, not state: two presses in one moment both see
  // the old state.
  const starting = useRef(false);
  const handleStart = async () => {
    if (starting.current) return;
    if (!order.trim() && !picked) { setError("Enter the order number, or use a roster file that has it."); return; }
    if (!file && !picked) { setError(canSupervise ? "Upload a roster file, or pick one the supervisor sent." : "Pick the order the supervisor sent, or load a roster file."); return; }
    setLoading(true); starting.current = true;
    try {
      if (picked) {
        // Take the order on the hub first: if another station got there first, say who, and stop.
        try { await hub.takeRoster(picked.id, { station: stationId(), operator: operatorName }); }
        catch (e) {
          if (e.status === 409) { const t = e.body?.takenBy || {}; setError(`${stationLabel(t.station)} (${t.operator || "someone"}) is already working on order ${picked.orderNumber || ""}. One station works an order — ask the supervisor to release it from the board if that is wrong.`); setPicked(null); setLoading(false); starting.current = false; loadRef.current(); return; }
          /* no hub answer: start anyway, the station still works from the roster it has */
        }
        const rows = normaliseRosterRows(picked.rows), num = order.trim(), shipWith = orderList(shipText).filter(n => n !== num);
        const carried = await takeOpenBoxes({ order: num, shipWith, rows, binBy, station: stationId() });
        onStart({ roster: rows, orderNumber: num, notes: notes.trim(), customer: customer.trim(), jerseyType, garment, binBy, rosterFile: `${picked.fileName || "roster"} (from ${picked.by || "supervisor"})`, hubRosterId: picked.id, shipWith, carried }); return;
      }
      const isExcel = /\.(xlsx|xls)$/i.test(file.name);
      const parsed  = isExcel ? await parseExcel(file) : parseCSV(await file.text());
      if (parsed.length === 0) { setError("No valid rows found. The file needs a header row with name and/or number columns."); setLoading(false); starting.current = false; return; }
      const num = order.trim() || orderNumberOf(parsed) || file.name.replace(/\.[^.]+$/, ""), shipWith = orderList(shipText || shipWithOf(parsed).join(" ")).filter(n => n !== num);
      const carried = await takeOpenBoxes({ order: num, shipWith, rows: parsed, binBy, station: stationId() });
      onStart({ roster: parsed, orderNumber: num, notes: notes.trim(), customer: customer.trim(), jerseyType, garment, binBy, rosterFile: file.name, shipWith, carried });
    } catch (err) {
      setError("Failed to parse roster: " + err.message);
      setLoading(false); starting.current = false;
    }
  };
  const onEnter = e => { if (e.key === "Enter") handleStart(); };

  return (
    <div style={modalBg}>
      <div style={modalCard}>
        <div style={{ fontSize: 40, marginBottom: 6, textAlign: "center" }}>📋</div>
        <div style={{ ...titleBig, fontSize: 32, textAlign: "center", marginBottom: 4 }}>Set up the order</div>
        <div style={{ fontSize: 17, color: "var(--k-ink-3)", textAlign: "center", marginBottom: 24, display: "flex", gap: 8, justifyContent: "center", alignItems: "center", flexWrap: "wrap" }}>
          <span>{operatorName} · {cap(role || "")}</span>
          <button onClick={onSignOut} style={{ ...btnGhost, padding: "5px 12px", fontSize: 14 }}>Sign out</button>
          {onPrint && <button onClick={onPrint} title="Print the labels of an order done before: find it by its number" style={{ ...btnGhost, padding: "5px 12px", fontSize: 14 }}>🖨 Print</button>}
        </div>
        {/* The orders the supervisor sent are behind a button, beside Unfinished orders (the owner,
            19 Nov 2026: they used to fill the top of this screen). Picked, the order shows here. */}
        {picked && (
          <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 10, border: "2px solid var(--k-green)", background: "var(--k-tint-green)", display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1, fontSize: 18, fontWeight: 800, color: "var(--k-strong)" }}>✓ Order {picked.orderNumber || "—"} <span style={{ fontWeight: 400, color: "var(--k-ink-3)" }}>· {picked.rows.length} garments · from {picked.by || "the supervisor"}</span></div>
            <button onClick={() => setShowAssigned(true)} style={{ ...btnGhost, padding: "6px 14px", fontSize: 15 }}>Change</button>
          </div>
        )}
        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <button onClick={() => setShowAssigned(true)} title="The orders the supervisor sent to this station, or to any station" style={{ ...btnGhost, flex: 1, padding: "12px 14px", fontSize: 18, fontWeight: 800, borderColor: hubRosters.length ? "var(--k-blue-ink)" : "var(--k-rule-2)", color: hubRosters.length ? "var(--k-blue-ink-2)" : "var(--k-ink-3)" }}>📥 Assigned orders · {hubRosters.length}</button>
          {onReplay && <button onClick={() => setShowReplay(true)} title="Testing only: run a floor order again through these screens, from what the camera read then" style={{ ...btnGhost, flex: 1, padding: "12px 14px", fontSize: 18, fontWeight: 800, borderColor: "var(--k-purple-2)", borderStyle: "dashed", color: "var(--k-purple-ink)" }}>▶ Replay an order</button>}
          {onPickUp && <button onClick={() => setShowUnfinished(true)} title="Orders put aside with Finish later, and the ones the supervisor gave to this station" style={{ ...btnGhost, flex: 1, padding: "12px 14px", fontSize: 18, fontWeight: 800, borderColor: unfinishedCount ? "var(--k-amber)" : "var(--k-rule-2)", color: unfinishedCount ? "var(--k-amber-ink-2)" : "var(--k-ink-3)" }}>⏸ Unfinished orders · {unfinishedCount}</button>}
        </div>
        {showAssigned && (
          <div style={{ position: "fixed", inset: 0, background: "var(--k-scrim)", zIndex: 2300, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ background: "var(--k-card)", borderRadius: 16, border: "2px solid var(--k-blue-ink)", padding: 30, maxWidth: 900, width: "94vw", maxHeight: "94%", overflowY: "auto", boxSizing: "border-box" }}>
              <div style={STICKY_HEAD}>
                <div style={{ ...titleSt, fontSize: 32, flex: 1 }}>📥 Assigned orders</div>
                <button onClick={() => setShowAssigned(false)} style={{ ...btnGhost, fontSize: 15 }}>Close <Kbd light>Esc</Kbd></button>
              </div>
              {hubRosters.length === 0 && (
                <div style={{ marginTop: 16, padding: "18px 16px", borderRadius: 10, border: "1px dashed var(--k-rule-3)", color: "var(--k-ink-2)", fontSize: 19, textAlign: "center", lineHeight: 1.4 }}>
                  No orders sent to you yet. When the supervisor sends one, it shows up here by itself.
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
              {hubRosters.map(r => (
                <button key={r.id} onClick={() => { if (takenElsewhere(r)) return; pickRoster(r); setShowAssigned(false); }} disabled={takenElsewhere(r)}
                  title={takenElsewhere(r) ? `${stationLabel(r.takenBy.station)} is working on this order — one station per order` : undefined}
                  style={{ ...btnGhost, textAlign: "left", padding: "8px 12px", borderColor: picked?.id === r.id ? "var(--k-green)" : "var(--k-rule-2)", color: picked?.id === r.id ? "var(--k-strong)" : "var(--k-ink-3)", background: picked?.id === r.id ? "var(--k-tint-green)" : "transparent", opacity: takenElsewhere(r) ? 0.5 : 1, cursor: takenElsewhere(r) ? "not-allowed" : "pointer" }}>
                  <div style={{ fontSize: 17, fontWeight: 700 }}>Order {r.orderNumber || "—"} <span style={{ fontWeight: 400, color: "var(--k-ink-3)" }}>· {r.rowCount} garments · {r.fileName}{r.jerseyType ? ` · ${jerseyTypeLabel(r.jerseyType)}` : ""}{r.binBy && r.binBy !== "team" ? ` · ${BIN_BY.find(b => b.id === r.binBy)?.label.toLowerCase() || r.binBy}` : ""}</span>{r.forStation && !r.takenBy && <span style={{ fontWeight: 700, color: "var(--k-blue-ink)", marginLeft: 8 }}>for this station</span>}</div>
                  <div style={{ fontSize: 14, color: "var(--k-ink-3)" }}>{r.by ? `sent by ${r.by} · ` : ""}{new Date(r.createdAt).toLocaleString()}</div>
                  {r.takenBy && <div style={{ fontSize: 14, fontWeight: 700, color: takenElsewhere(r) ? "var(--k-amber-ink)" : "var(--k-green-ink)" }}>{takenElsewhere(r) ? `⛔ In progress on ${stationLabel(r.takenBy.station)} · ${r.takenBy.operator || "—"} · since ${new Date(r.takenBy.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "↻ Started on this station — pick it to continue"}</div>}
                </button>
              ))}
              </div>
            </div>
          </div>
        )}
        {showReplay && (
          <ReplayFinder stationLabel={stationLabel} onClose={() => setShowReplay(false)}
            onPick={run => {
              const when = new Date(run.lastSeen || run.firstSeen || Date.now()).toLocaleDateString();
              onReplay({ name: run.order, events: run.events });
              onStart({ roster: normaliseRosterRows(run.rows), orderNumber: run.order, notes: "", jerseyType: run.jerseyType || "", garment: run.garment || rosterGarment(run.rows), binBy: run.binBy || "team", rosterFile: `replay of ${run.order} (${stationLabel(run.station)}, ${when})` });
            }} />
        )}
        {showUnfinished && (
          <div style={{ position: "fixed", inset: 0, background: "var(--k-scrim)", zIndex: 2300, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ background: "var(--k-card)", borderRadius: 16, border: "2px solid var(--k-amber)", padding: 30, maxWidth: 900, width: "94vw", maxHeight: "94%", overflowY: "auto", boxSizing: "border-box" }}>
              <div style={STICKY_HEAD}>
                <div style={{ ...titleSt, fontSize: 32, flex: 1 }}>⏸ Unfinished orders</div>
                <button onClick={() => setShowUnfinished(false)} style={{ ...btnGhost, fontSize: 15 }}>Close <Kbd light>Esc</Kbd></button>
              </div>
              <div style={{ marginTop: 12 }}><UnfinishedOrders tall role={role} onPickUp={x => Promise.resolve(onPickUp(x)).then(() => setShowUnfinished(false))} stationLabel={stationLabel} /></div>
            </div>
          </div>
        )}
        <div style={{ marginBottom: 12 }}>
          <label style={labelSt}>Order number</label>
          <input ref={orderRef} value={order} onChange={e => setOrder(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="From the roster file, or tap to type it" onKeyDown={onEnter} style={inputSt}
            onFocus={() => setOrderKeys(true)} onBlur={() => setOrderKeys(false)} />
          {orderKeys && <ScreenKeys layout="digits" onKey={k => setOrder(v => typeKey(v, k))} onEnter={() => orderRef.current?.blur()} enterLabel="Done" />}   {/* order numbers are digits: a keypad, no letters (the owner, 17 Nov 2026) */}
        </div>
        <div style={{ marginBottom: 12 }}>
          {/* The customer is printed on the box's outside label and the sign-off ticket (the owner, 25 Nov 2026); the supervisor's roster brings it, the Paragon site will fill it later. Empty: the box's team name. */}
          <label style={labelSt}>Customer <span style={{ color: "var(--k-ink-3b)", fontWeight: 400 }}>— on the box's outside label; empty prints the team name{picked?.customer ? <span style={{ color: "var(--k-blue-ink)" }}> · set by the supervisor</span> : null}</span></label>
          <input ref={customerRef} value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Tap to type it" onKeyDown={e => { if (e.key === "Enter") customerRef.current?.blur(); }} style={inputSt}
            onFocus={() => setCustomerKeys(true)} onBlur={() => setCustomerKeys(false)} />
          {customerKeys && <ScreenKeys layout="search" onKey={k => setCustomer(v => typeKey(v, k))} onEnter={() => customerRef.current?.blur()} enterLabel="Done" />}
        </div>
        <div style={{ marginBottom: 12 }}>
          {/* Orders that ship together share boxes (the owner, 20 Nov 2026): a box that is not full is left open at Finish order for them. */}
          <label style={labelSt}>Ships with <span style={{ color: "var(--k-ink-3b)", fontWeight: 400 }}>— the other order numbers on the order form; empty when it ships alone</span></label>
          {/* A number keypad only (the owner, 20 Nov 2026); a comma goes in by itself after every six digits, and "Next number" ends a shorter one. Each number is a chip with an ✕ (25 Nov 2026). */}
          <ShipWithField value={shipText} onChange={setShipText} placeholder="e.g. 264248" />
        </div>
        <div style={{ marginBottom: 12 }}>
          {/* No order-notes box here (the owner, 17 Nov 2026): the notes come with the supervisor's roster, when there are any. */}
          <label style={labelSt}>Garment type <span style={{ color: "var(--k-ink-3b)", fontWeight: 400 }}>— sets the flag reasons and the reports; leave it unset to offer every reason</span></label>
          <JerseyTypePicker value={jerseyType} onChange={setJerseyType} />
          <label style={{ ...labelSt, marginTop: 12 }}>Garment <span style={{ color: "var(--k-ink-3b)", fontWeight: 400 }}>— the outline the operator taps to show where the damage is</span></label>
          <GarmentPicker value={garment} onChange={g => { garmentByHand.current = true; setGarment(g); }} />
          <label style={{ ...labelSt, marginTop: 12 }}>Boxes — how the order is sorted{picked?.binBy ? <span style={{ color: "var(--k-blue-ink)", fontWeight: 400 }}> · set by the supervisor</span> : null}</label>
          <BinByPicker value={binBy} onChange={setBinBy} />
        </div>
        <div style={{ marginBottom: 18 }}>
          <label style={labelSt}>{hubRosters.length ? "Or a roster file" : "Roster file"}</label>
          <div onClick={() => fileRef.current.click()}
            style={{ padding: "10px 12px", borderRadius: 8, border: `1px solid ${file ? "var(--k-green)" : "var(--k-rule-2)"}`, background: "var(--k-field)", color: file ? "var(--k-green)" : "var(--k-ink-3)", fontSize: 17, cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 20 }}>{file ? "✓" : "📂"}</span>
            <span>{file ? file.name : picked ? `Using the supervisor's roster (${picked.rows.length} garments)` : `Choose CSV${xlsxReady ? " or Excel" : ""} file…`}</span>
          </div>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.tsv,.txt" style={{ display: "none" }} onChange={handleFile} />
        </div>
        {error && <div style={errSt}>{error}</div>}
        <button onClick={handleStart} disabled={loading} style={{ ...bigBtn, cursor: loading ? "wait" : "pointer", opacity: loading ? 0.7 : 1 }}>
          {loading ? "Loading…" : "Start order →"}
        </button>
      </div>
    </div>
  );
}

// ── Live camera window on the result screens, so the next jersey can be lined
// up while the green/yellow/red screen is still up. Same stream, second <video>.
function LivePreview({ stream, rotation }) {
  const ref = useRef(null);
  useEffect(() => {
    const v = ref.current; if (!v || !stream) return;
    v.srcObject = stream; v.play().catch(() => {});
    return () => { v.srcObject = null; };
  }, [stream]);
  if (!stream) return null;
  const box = { position: "absolute", bottom: 12, right: 12, width: "clamp(220px, 26vw, 380px)", borderRadius: 10, overflow: "hidden", border: "2px solid rgba(255,255,255,0.35)", background: "#000", boxShadow: "0 8px 24px rgba(0,0,0,0.5)" };
  return (
    <div style={box}>
      <div style={{ aspectRatio: "4 / 3", overflow: "hidden" }}>
        <video ref={ref} autoPlay muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover", transform: `rotate(${rotation || 0}deg)`, display: "block" }} />
      </div>
      <div style={{ position: "absolute", top: 8, left: 10, fontSize: 14, fontWeight: 700, color: "#fff", background: "rgba(0,0,0,0.6)", padding: "4px 10px", borderRadius: 10 }}>● Live — line up the next garment</div>
    </div>
  );
}

// ── The live camera, big, where the damage photo will be (the co-op, 25 Nov 2026) ──
// The FLAGGED screen's framing view: the same stream as the camera panel, as large
// as the room allows, so the operator sees what the photo will show before taking it.
function LiveFrame({ stream, rotation, maxWidth = "100%" }) {
  const ref = useRef(null);
  useEffect(() => {
    const v = ref.current; if (!v || !stream) return;
    v.srcObject = stream; v.play().catch(() => {});
    return () => { v.srcObject = null; };
  }, [stream]);
  return (
    <div style={{ position: "relative", height: "100%", maxWidth, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {/* contain, never cover: the operator must see the whole frame the photo will keep */}
      <video ref={ref} autoPlay muted playsInline style={{ height: "100%", width: "auto", maxWidth: "100%", objectFit: "contain", transform: `rotate(${rotation || 0}deg)`, display: "block", borderRadius: 12, border: "3px solid var(--k-amber)", boxSizing: "border-box", background: "#000" }} />
      <div style={{ position: "absolute", top: 8, left: 10, fontSize: 16, fontWeight: 800, color: "#fff", background: "rgba(0,0,0,0.6)", padding: "4px 12px", borderRadius: 10 }}>● Live</div>
    </div>
  );
}

// ── A defect the reason list does not cover: the operator types it ───────────
// Reached only by a reason marked `custom`, and no reason in config.js is one now:
// "Others" flags at once, with nothing to type (the owner, 17 Nov 2026).
function ReasonTextForm({ match, onSubmit, onBack }) {
  const [text, setText] = useState("");
  const onKey = e => {
    if (e.key === "Enter")  { e.preventDefault(); if (text.trim()) onSubmit(text); }
    if (e.key === "Escape") { e.preventDefault(); onBack(); }
  };
  return (
    <div style={{ width: "100%", maxWidth: 560, padding: "0 24px", boxSizing: "border-box" }}>
      <div style={{ fontSize: 56, textAlign: "center", lineHeight: 1 }}>✎</div>
      <div style={{ fontSize: "clamp(26px, 4vw, 40px)", fontWeight: 900, color: "var(--k-violet)", textAlign: "center", marginBottom: 6 }}>What's wrong with it?</div>
      {match && <div style={{ fontSize: 18, color: "var(--k-violet-ink-2)", textAlign: "center", marginBottom: 10 }}>#{match.number}{match.name ? <> · <span style={{ fontFamily: FONT_READ }}>{match.name}</span></> : ""}{match.size ? ` · ${shortSize(match.size)}` : ""}</div>}
      <input value={text} onChange={e => setText(e.target.value)} onKeyDown={onKey} autoFocus placeholder="e.g. hole under the left arm" maxLength={120} style={{ ...inputSt, fontSize: 22, padding: "12px 14px", marginBottom: 14 }} />
      <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
        <button disabled={!text.trim()} onClick={() => onSubmit(text)} style={{ ...bigBtn, width: "auto", padding: "14px 30px", background: "var(--k-violet)", color: "var(--k-page)", opacity: text.trim() ? 1 : 0.5 }}>✓ Send to supervisor <Kbd>Enter</Kbd></button>
        <button onClick={onBack} style={{ ...btnGhost, fontSize: 18, padding: "14px 22px" }}>← Back <Kbd light>Esc</Kbd></button>
      </div>
    </div>
  );
}

// ── Manual entry: the camera could not read it, or it is not on the roster ───
function ManualEntryForm({ detected, initial = null, teams, onSubmit, onBack }) {
  const [number, setNumber] = useState(initial?.number ?? detected?.number ?? "");
  const [name,   setName]   = useState(initial?.name ?? detected?.name ?? "");
  const [team,   setTeam]   = useState(initial?.team || "");   // none until the operator picks one: a team narrows the search
  const [error,  setError]  = useState(null);
  const [field,  setField]  = useState("number");   // which field the on-screen keys write into
  const setters = { number: setNumber, name: setName };
  const press = k => setters[field](v => (k === "⌫" ? v.slice(0, -1) : v + k));

  const submit = () => {
    if (!number.trim() && !name.trim()) { setError("Enter at least a number or a name."); return; }
    onSubmit({ number: number.trim(), name: name.trim(), size: "", team: team.trim() });
  };
  const onKey = e => {
    if (e.key === "Enter")  { e.preventDefault(); submit(); }
    if (e.key === "Escape") { e.preventDefault(); onBack(); }
  };
  const fieldSt = { ...inputSt, fontSize: 22, padding: "12px 14px" };

  return (
    <div style={{ width: "100%", maxWidth: 560, padding: "0 24px", boxSizing: "border-box" }}>
      <div style={{ fontSize: 56, textAlign: "center", lineHeight: 1 }}>✍</div>
      <div style={{ fontSize: "clamp(26px, 4vw, 40px)", fontWeight: 900, color: "var(--k-amber)", textAlign: "center", marginBottom: 18 }}>Enter the garment by hand</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10, marginBottom: 10 }}>
        <div><label style={labelSt}>Number</label><input value={number} onChange={e => setNumber(e.target.value)} onKeyDown={onKey} onFocus={() => setField("number")} autoFocus inputMode="numeric" placeholder="##" style={{ ...fieldSt, borderColor: field === "number" ? "var(--k-amber)" : fieldSt.borderColor }} /></div>
        <div><label style={labelSt}>Name</label><input value={name} onChange={e => setName(e.target.value)} onKeyDown={onKey} onFocus={() => setField("name")} placeholder="as printed" style={{ ...fieldSt, fontFamily: FONT_READ, borderColor: field === "name" ? "var(--k-amber)" : fieldSt.borderColor }} /></div>
      </div>
      {teams.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <label style={labelSt}>Team</label>
          <select value={team} onChange={e => setTeam(e.target.value)} style={{ ...fieldSt, cursor: "pointer" }}>
            <option value="">Any team</option>
            {teams.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      )}
      {error && <div style={errSt}>{error}</div>}
      <ScreenKeys layout={field === "number" ? "digits" : "full"} onKey={press} onEnter={submit} enterLabel="Save" />
      <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 12 }}>
        <button onClick={submit} style={{ ...bigBtn, width: "auto", padding: "14px 30px", background: "var(--k-amber)", color: "var(--k-page)" }}>✓ Save <Kbd>Enter</Kbd></button>
        <button onClick={onBack} style={{ ...btnGhost, fontSize: 18, padding: "14px 22px" }}>← Back <Kbd light>Esc</Kbd></button>
      </div>
    </div>
  );
}

// ── Order view for the supervisor: the roster with every jersey's status, and
// the order's log, read from the hub's day ledger. Works for finished orders
// and for ones still running, without touching the station.
// The photos a flag carries: the scan (what the camera read) and the damage
// photos the operator took after flagging (red frame). Click to enlarge.
// Where the damage was marked (24 Nov 2026), beside a flag's photos on the
// board: the garment small, front and back, the spots numbered, read only; the
// words when the pointer rests on it. Nothing when no spot was marked.
function FlagMarks({ item, height = 40 }) {
  if (!Array.isArray(item?.spots) || !item.spots.length) return null;
  const words = spotWords(item.garment, item.spots);
  return <div data-flag-marks="" style={{ flexShrink: 0 }}><GarmentMap kind={item.garment} spots={item.spots} height={height} captions={false} title={words ? `Where: ${words}` : "Where the damage was marked"} /></div>;
}
function PhotoThumbs({ photo, damagePhotos = [], w = 80, h = 60, onOpen, caption = "" }) {
  const set = photoSet(photo, damagePhotos);
  if (!set.pics.length) return null;
  return (
    <div style={{ display: "flex", gap: 4, flexShrink: 0, flexWrap: "wrap" }}>
      {set.pics.map((p, i) => <img key={i} src={p.src} alt="" onClick={() => onOpen({ ...set, index: i, caption })} title={p.damage ? "Damage photo — click to enlarge" : "Click to enlarge"} style={{ width: w, height: h, objectFit: "cover", borderRadius: 4, cursor: "zoom-in", border: p.damage ? "2px solid var(--k-red)" : "1px solid color-mix(in srgb, var(--k-strong) 25%, transparent)" }} />)}
    </div>
  );
}

// A flag's photos, large (the owner, 25 Nov 2026: the supervisor could not see
// a small flaw). The picture is fitted to the screen; the mouse wheel or a
// pinch zooms about the pointer (1x to 6x), dragging moves it, a double click
// toggles fit / 2x, + − Fit and the arrow keys or ‹ › walk the flag's photos.
// Esc, ✕ or a click on the backdrop close it. `photo` is a photoSet() (or a
// single src, as the station's log passes). No library: one transform.
const ZOOM_MAX = 6;
const clampZoom = s => Math.min(ZOOM_MAX, Math.max(1, s));
export function PhotoLightbox({ photo, onClose }) {
  const set = typeof photo === "string" ? photoSet(photo) : photo;
  const pics = set.pics;
  const [idx, setIdx] = useState(Math.min(set.index || 0, Math.max(0, pics.length - 1)));
  const [view, setView] = useState({ s: 1, x: 0, y: 0 });   // scale and the picture's offset from the centre, in px
  const stage = useRef(null);
  const pointers = useRef(new Map());                          // the pointers down, by id
  const drag = useRef({ moved: false, dist: 0, onImg: false });
  const fit = () => setView({ s: 1, x: 0, y: 0 });
  const go = d => { if (pics.length < 2) return; setIdx(i => (i + d + pics.length) % pics.length); fit(); };
  // Zoom by `k` about the point (px, py), given from the stage's centre: the point under the pointer stays under it.
  // From the scale in the state, not the one drawn, so wheel or pinch events that come faster than a render all count.
  const zoomBy = (k, px = 0, py = 0) => setView(v => { const s = clampZoom(v.s * k); if (s === 1) return { s: 1, x: 0, y: 0 }; const f = s / v.s; return { s, x: px - (px - v.x) * f, y: py - (py - v.y) * f }; });
  const centre = (x, y) => { const r = stage.current.getBoundingClientRect(); return [x - r.left - r.width / 2, y - r.top - r.height / 2]; };
  useEffect(() => {
    const h = e => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
      else if (e.key === "ArrowLeft")  { e.stopPropagation(); go(-1); }
      else if (e.key === "ArrowRight") { e.stopPropagation(); go(1); }
      else if (e.key === "+" || e.key === "=") { e.stopPropagation(); zoomBy(1.5); }
      else if (e.key === "-") { e.stopPropagation(); zoomBy(1 / 1.5); }
    };
    window.addEventListener("keydown", h, true); return () => window.removeEventListener("keydown", h, true);
  });
  // The wheel needs a listener that may stop the page scrolling (React's is passive).
  useEffect(() => {
    const el = stage.current; if (!el) return;
    const w = e => { e.preventDefault(); zoomBy(Math.exp(-e.deltaY * 0.0015), ...centre(e.clientX, e.clientY)); };
    el.addEventListener("wheel", w, { passive: false }); return () => el.removeEventListener("wheel", w);
  });
  const down = e => { if (e.target.closest("[data-ctl]")) return; e.currentTarget.setPointerCapture?.(e.pointerId); pointers.current.set(e.pointerId, [e.clientX, e.clientY]); drag.current = { moved: false, dist: 0, onImg: e.target.tagName === "IMG" }; };
  const move = e => {
    const p = pointers.current; if (!p.has(e.pointerId)) return;
    const [ox, oy] = p.get(e.pointerId);
    p.set(e.pointerId, [e.clientX, e.clientY]);
    if (p.size === 1) {
      const dx = e.clientX - ox, dy = e.clientY - oy;
      if (Math.abs(dx) + Math.abs(dy) > 2) drag.current.moved = true;
      if (dx || dy) setView(v => v.s > 1 ? { ...v, x: v.x + dx, y: v.y + dy } : v);   // a fitted picture stays fitted
    } else if (p.size === 2) {                                  // a pinch: the distance between the two fingers is the zoom
      const [[ax, ay], [bx, by]] = [...p.values()];
      const after = Math.hypot(ax - bx, ay - by), before = drag.current.dist || after;
      drag.current.dist = after; drag.current.moved = true;
      zoomBy(after / before, ...centre((ax + bx) / 2, (ay + by) / 2));
    }
  };
  const up = e => { pointers.current.delete(e.pointerId); drag.current.dist = 0; };
  const onStageClick = e => { if (e.target.closest("[data-ctl]") || drag.current.onImg) return; if (!drag.current.moved) onClose(); };   // a click on the backdrop closes; one on the picture, or the end of a drag, does not
  const dbl = e => { if (e.target.closest("[data-ctl]")) return; if (view.s > 1) fit(); else zoomBy(2, ...centre(e.clientX, e.clientY)); };
  const pic = pics[idx];
  if (!pic) return null;
  const btn = { background: "rgba(21,29,51,0.92)", color: "#fff", border: "1px solid rgba(255,255,255,0.35)", borderRadius: 10, fontSize: 22, fontWeight: 800, padding: "8px 16px", cursor: "pointer", minWidth: 48 };
  const caption = [pic.damage ? `Damage photo ${pics.slice(0, idx + 1).filter(p => p.damage).length} of ${pics.filter(p => p.damage).length}` : "Scan photo", set.caption].filter(Boolean).join(" · ");
  return (
    <div ref={stage} onClick={onStageClick} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onDoubleClick={dbl}
      style={{ position: "fixed", inset: 0, zIndex: 3000, background: "rgba(0,0,0,0.88)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", touchAction: "none", cursor: view.s > 1 ? "grab" : "zoom-out", userSelect: "none" }}>
      <img src={pic.src} alt="Flagged garment" draggable={false} style={{ maxWidth: "92vw", maxHeight: "86vh", borderRadius: 8, boxShadow: "0 12px 48px rgba(0,0,0,0.8)", transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})`, transformOrigin: "center", cursor: view.s > 1 ? "grab" : "zoom-in" }} />
      <div data-ctl="1" style={{ position: "absolute", top: 12, left: 0, right: 0, display: "flex", justifyContent: "center", alignItems: "center", gap: 10, pointerEvents: "none" }}>
        <div style={{ background: "rgba(0,0,0,0.7)", color: "#fff", padding: "8px 16px", borderRadius: 10, fontSize: 18, fontWeight: 700, maxWidth: "70vw" }}>{caption}{pics.length > 1 ? ` · ${idx + 1}/${pics.length}` : ""}</div>
      </div>
      <div data-ctl="1" style={{ position: "absolute", top: 12, right: 12, display: "flex", gap: 8 }}>
        <button onClick={() => zoomBy(1 / 1.5)} title="Zoom out (-)" style={btn}>−</button>
        <button onClick={() => zoomBy(1.5)} title="Zoom in (+)" style={btn}>+</button>
        <button onClick={fit} title="Fit the screen" style={{ ...btn, fontSize: 16 }}>Fit</button>
        <button onClick={onClose} title="Close (Esc)" style={btn}>✕</button>
      </div>
      {pics.length > 1 && <>
        <button data-ctl="1" onClick={() => go(-1)} title="Previous photo (←)" style={{ ...btn, position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 34, padding: "12px 18px" }}>‹</button>
        <button data-ctl="1" onClick={() => go(1)} title="Next photo (→)" style={{ ...btn, position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 34, padding: "12px 18px" }}>›</button>
      </>}
    </div>
  );
}

// Which record is the order, which events are its, and whether it is finished: src/lib/ledgerview.js.
export function OrderView({ station, order, run = 0, stationLabel, onClose, onDownload, onPhoto = () => {}, date = "" }) {
  const [data, setData] = useState(null);     // { rec, events }
  const [tab,  setTab]  = useState("summary");   // the summary as the operator sees it comes first (the owner, 25 Nov 2026)
  const [err,  setErr]  = useState(null);
  useEffect(() => {
    let on = true;
    const load = () => hub.ledger(date).then(l => {
      if (!on) return;
      const runs = (l.orders || []).filter(x => x.station === station && x.order === order);
      const rec = pickRun(runs, run);   // the run asked for, else the newest (M12)
      const events = (l.events || []).filter(ofRun(rec)).sort((a, b) => String(b.t).localeCompare(String(a.t)));
      setData({ rec, events });
    }).catch(() => on && setErr("Could not fetch this order from the hub."));
    load();
    const t = setInterval(load, 5000);   // a running order keeps updating
    return () => { on = false; clearInterval(t); };
  }, [station, order, run, date]);
  useEffect(() => { const h = e => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]);

  const rec = data?.rec, rows = rec?.rows || [];
  const events = useMemo(() => data?.events || [], [data]);
  // The summary the operator sees (Passed with its box, Failed with its reason, Missing), from the hub's record of the order
  // and its flag events, through the same functions as the station's screen; the rates from the order's events.
  const sumView = useMemo(() => rec && rec.rows?.length ? {
    summary: orderSummary(packFromRecord({ ...rec, flags: events.filter(e => e.status === "flagged") })),
    stats: summarise(events),
  } : null, [rec, events]);
  const c = rec?.counts || {}; const total = c.total ?? rows.length; const done = total - (c.remaining ?? 0);
  const latestByRow = new Map(); [...events].reverse().forEach(e => { if (e.rowId !== undefined && e.rowId !== null) latestByRow.set(e.rowId, e); });
  const label = s => ({ pass: "PASS", flag: "FLAGGED", manual: "BY HAND", missing: "MISSING", short: "SHORT-SHIPPED" }[s] || "unscanned");
  const colour = s => s === "pass" ? "var(--k-green)" : s === "flag" ? "var(--k-red)" : s === "manual" ? "var(--k-amber-ink)" : s === "missing" || s === "short" ? "var(--k-amber-ink)" : "var(--k-ink-5)";
  const evColour = s => s === "pass" ? "var(--k-green)" : s === "flagged" ? "var(--k-red)" : s === "manual" ? "var(--k-amber-ink)" : s === "undo" ? "var(--k-amber-ink)" : "var(--k-ink-3)";
  const hm = t => t ? new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
  const flaggedRows = rows.filter(r => r.scanned === "flag"), byHandRows = rows.filter(r => r.scanned === "manual");
  const offRoster = events.filter(e => e.status === "flagged" && e.offRoster);
  const th = { textAlign: "left", fontSize: 10, color: "var(--k-ink-4)", textTransform: "uppercase", letterSpacing: 0.5, padding: "6px 8px", borderBottom: "1px solid var(--k-rule)", position: "sticky", top: 0, background: "var(--k-page)" };
  const td = { padding: "6px 8px", borderBottom: "1px solid var(--k-card)", fontSize: 13, verticalAlign: "top" };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1900, background: "var(--k-scrim-lite)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: "min(1100px, 100%)", height: "min(820px, 100%)", background: "var(--k-page)", border: "1px solid var(--k-rule-2)", borderRadius: 12, display: "flex", flexDirection: "column", overflow: "hidden", color: "var(--k-ink-1)" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--k-rule)", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 900, fontSize: 18 }}>Order {order} <span style={{ fontWeight: 400, color: "var(--k-ink-4)", fontSize: 14 }}>· {stationLabel(station)} · {rec?.operator || "—"}{rec?.jerseyType ? <span style={{ color: "var(--k-blue-ink-2)" }}> · {jerseyTypeLabel(rec.jerseyType)}</span> : null}</span></div>
            <div style={{ fontSize: 12, color: "var(--k-ink-3)", marginTop: 2 }}>
              {rec ? <>{done} / {total} done · {c.pass ?? 0} pass · <span style={{ color: c.flag ? "var(--k-red-ink)" : undefined }}>{c.flag ?? 0} with supervisor</span> · <span style={{ color: c.manual ? "var(--k-amber-ink-2)" : undefined }}>{c.manual ?? 0} by hand</span>{offRoster.length ? <> · <span style={{ color: "var(--k-red-ink)" }}>{offRoster.length} not on roster</span></> : null} · started {hm(rec.firstSeen)}{orderDone(rec) ? <> · <span style={{ color: "var(--k-green)", fontWeight: 700 }}>finished {hm(doneAt(rec))}</span>{c.remaining > 0 ? <span style={{ color: "var(--k-amber-ink-2)" }}> with {c.remaining} unscanned</span> : null}</> : <> · in progress</>}{rec.notes ? <> · notes: <span style={{ color: "var(--k-amber-ink-2)" }}>{rec.notes}</span></> : null}</> : err || "Loading…"}
            </div>
          </div>
          <button onClick={() => onDownload({ station, order, run: rec?.run || run, operator: rec?.operator, date })} style={{ ...btnGhost, padding: "6px 12px", borderColor: "var(--k-green)", color: "var(--k-green-ink)" }}>⬇ Order sheet (Excel)</button>
          {events.some(e => e.status === "flagged") && <button onClick={() => exportDamageReportXLSX(buildDamageRows(events, { stationLabel, typeLabel: jerseyTypeLabel }), { name: order, title: `Damage report — order ${order}` }).catch(e => setErr(e.message))} title="Every flagged garment of this order with its photo" style={{ ...btnGhost, padding: "6px 12px", borderColor: "var(--k-red)", color: "var(--k-red-ink)" }}>⬇ Damage report</button>}
          <button onClick={onClose} style={{ ...btnGhost, padding: "6px 12px" }}>✕ Close <Kbd light>Esc</Kbd></button>
        </div>
        <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--k-rule)", flexShrink: 0 }}>
          {[["summary", "Summary"], ["roster", `Roster (${rows.length})`], ["problems", `Problems (${flaggedRows.length + byHandRows.length + offRoster.length})`], ["log", `Log (${events.length})`]].map(([id, t]) => (
            <button key={id} onClick={() => setTab(id)} style={{ background: "transparent", border: 0, borderBottom: `2px solid ${tab === id ? "var(--k-blue)" : "transparent"}`, color: tab === id ? "var(--k-blue-ink)" : "var(--k-ink-3)", padding: "10px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{t}</button>
          ))}
        </div>
        <div style={{ flex: 1, overflow: "auto" }}>
          {rec && !rows.length && <div style={{ padding: 24, color: "var(--k-amber-ink-2)" }}>The hub has no garment list for this order — the station reported it before today's update. The station's Export has the sheet; reload the station page so future orders come through.</div>}
          {!rec && !err && <div style={{ padding: 24, color: "var(--k-ink-4)" }}>Loading…</div>}
          {!rec && err && <div style={{ padding: 24, color: "var(--k-red-ink)" }}>{err}</div>}
          {sumView && tab === "summary" && (
            <div style={{ padding: "14px 18px" }}>
              <div style={{ display: "flex" }}><SummaryCounts summary={sumView.summary} stats={sumView.stats} /></div>
              {c.flag > 0 && <div style={{ fontSize: 14, color: "var(--k-red-ink)", marginTop: 4 }}>{c.flag} flagged</div>}
              <OrderSummaryBody summary={sumView.summary} bins={rec.binSummary || []} />
            </div>
          )}
          {rec && rows.length > 0 && (tab === "roster" || tab === "problems") && (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th style={th}>Status</th><th style={th}>Name</th><th style={th}>Number</th><th style={th}>Team</th><th style={th}>Size</th><th style={th}>Box</th><th style={th}>What happened</th><th style={th}>Inspector · time</th>{tab === "problems" && <th style={th}>Photo</th>}</tr></thead>
              <tbody>
                {(tab === "roster" ? rows : rows.filter(r => r.scanned === "flag" || r.scanned === "manual")).map((r, i) => {
                  const e = latestByRow.get(r._id);
                  return (
                    <tr key={r._id ?? i} style={{ background: r.scanned === "flag" ? "var(--k-tint-red-faint)" : r.scanned === "manual" ? "var(--k-tint-amber-faint)" : "transparent" }}>
                      <td style={{ ...td, color: colour(r.scanned), fontWeight: 700, whiteSpace: "nowrap" }}>{label(r.scanned)}</td>
                      <td style={{ ...td, fontFamily: FONT_READ }}>{r.name || "—"}</td><td style={{ ...td, fontWeight: 700 }}>{r.number}</td><td style={td}>{r.team || ""}</td><td style={{ ...td, color: "var(--k-amber-ink-2)" }}>{shortSize(r.size) || ""}</td>
                      <td style={{ ...td, color: "var(--k-blue-ink)" }}>{rec.bins && binOfRow(rec.bins, rec.closedBins, r) !== null ? `Box ${binOfRow(rec.bins, rec.closedBins, r)}` : ""}</td>
                      <td style={{ ...td, color: "var(--k-ink-2)" }}>{e?.status === "flagged" && <><RouteTag item={e} /> </>}{e?.reason || ""}{e?.resolution ? <div style={{ color: "var(--k-ink-3)", fontSize: 12 }}>→ {e.resolution}</div> : null}</td>
                      <td style={{ ...td, color: "var(--k-ink-4)", fontSize: 12, whiteSpace: "nowrap" }}>{e ? `${e.operator || ""} · ${String(e.t).slice(11)}` : ""}</td>
                      {tab === "problems" && <td style={td}><div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}><PhotoThumbs photo={e?.photo} damagePhotos={e?.damagePhotos} onOpen={onPhoto} caption={photoCaption(r.number, r.name, e?.reason)} />{e?.status === "flagged" && <FlagMarks item={e} />}</div></td>}
                    </tr>
                  );
                })}
                {tab === "problems" && offRoster.map((e, i) => (
                  <tr key={"off" + i} style={{ background: "var(--k-tint-red-faint)" }}>
                    <td style={{ ...td, color: "var(--k-red)", fontWeight: 700, whiteSpace: "nowrap" }}>NOT ON ROSTER</td>
                    <td style={{ ...td, fontFamily: FONT_READ }}>{e.name || "—"}</td><td style={{ ...td, fontWeight: 700 }}>{e.number}</td><td style={td}>{e.team || ""}</td><td style={{ ...td, color: "var(--k-amber-ink-2)" }}>{shortSize(e.size) || ""}</td><td style={td}></td>
                    <td style={{ ...td, color: "var(--k-ink-2)" }}><RouteTag item={e} /> {e.reason}{e.resolution ? <div style={{ color: "var(--k-ink-3)", fontSize: 12 }}>→ {e.resolution}</div> : null}</td>
                    <td style={{ ...td, color: "var(--k-ink-4)", fontSize: 12, whiteSpace: "nowrap" }}>{e.operator || ""} · {String(e.t).slice(11)}</td>
                    <td style={td}><div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}><PhotoThumbs photo={e.photo} damagePhotos={e.damagePhotos} onOpen={onPhoto} caption={photoCaption(e.number, e.name, e.reason)} /><FlagMarks item={e} /></div></td>
                  </tr>
                ))}
                {tab === "problems" && flaggedRows.length + byHandRows.length + offRoster.length === 0 && <tr><td colSpan={9} style={{ ...td, color: "var(--k-green)", padding: 18 }}>No problems on this order — nothing went to the supervisor and nothing was entered by hand.</td></tr>}
              </tbody>
            </table>
          )}
          {rec && tab === "log" && (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th style={th}>Time</th><th style={th}>What</th><th style={th}>Garment</th><th style={th}>Reason / note</th><th style={th}>Resolution</th><th style={th}>Inspector</th></tr></thead>
              <tbody>
                {events.map((e, i) => (
                  <tr key={e.id ?? i}>
                    <td style={{ ...td, color: "var(--k-ink-4)", whiteSpace: "nowrap" }}>{String(e.t).slice(11)}</td>
                    <td style={{ ...td, color: evColour(e.status), fontWeight: 700, textTransform: "uppercase", fontSize: 11 }}>{e.status === "flagged" && e.offRoster ? "not on roster" : e.status === "undo" ? "un-checked" : e.status}</td>
                    <td style={td}>#{e.number}{e.name ? <> · <span style={{ fontFamily: FONT_READ }}>{e.name}</span></> : ""}{e.size ? ` · ${shortSize(e.size)}` : ""}</td>
                    <td style={{ ...td, color: "var(--k-ink-2)" }}>{e.reason}</td><td style={{ ...td, color: "var(--k-ink-3)" }}>{e.resolution}</td><td style={{ ...td, color: "var(--k-ink-3)" }}>{e.operator}</td>
                  </tr>
                ))}
                {events.length === 0 && <tr><td colSpan={6} style={{ ...td, color: "var(--k-ink-4)", padding: 18 }}>No scans recorded for this order on the hub.</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Supervisor view: every station live, and rosters to send ─────────────────
// "st-line2" (from ?station=line2) reads as "Line 2"; any other id as itself.
const stationLabel = id => { const n = String(id || "").replace(/^st-/, ""); const st = stationOf(n); if (st) return st.label; if (n === "packing") return "Packing"; const m = n.match(/^line[-_ ]?(\d+)$/i); return m ? `Line ${m[1]}` : n || "station"; };

// How an attention item looks on the board: by-hand and missing/short are
// amber questions, a flag is a red stop.
const attnIcon   = s => s === "manual" ? "✍" : s === "missing" ? "❓" : s === "short" ? "📦" : "🛑";
const attnColour = s => (s === "manual" || s === "missing" || s === "short") ? "var(--k-amber)" : "var(--k-red)";
// How much an item weighs: a flag by where it goes (REMAKE over DECORATION and
// STITCHER over CLEANING over DECIDE); by-hand, missing and short are light.
// Open items come before resolved ones, then the heavier, then the newer.
const attnSeverity = a => a.status === "flagged" ? severityOf(a.reason) : { tag: a.status === "manual" ? "SIGN OFF" : a.status === "missing" ? "MISSING" : "SHORT", weight: 1, colour: "var(--k-amber-ink)" };
const bySeverity = (a, b) => ((a.resolution ? 1 : 0) - (b.resolution ? 1 : 0)) || (attnSeverity(b).weight - attnSeverity(a).weight) || String(b.time || b.t || "").localeCompare(String(a.time || a.t || ""));
// The board's tag on an open item (REMAKE, STITCHER, SIGN OFF…), filled when it weighs most.
function RouteTag({ item, size = 10 }) {
  const s = attnSeverity(item);
  const hot = s.weight >= 4;
  return <span title={s.route || ""} style={{ fontSize: size, fontWeight: 800, letterSpacing: 0.5, padding: "1px 6px", borderRadius: 4, background: hot ? s.colour : `color-mix(in srgb, ${s.colour} 13.33%, transparent)`, color: hot ? "var(--k-strong)" : s.colour, border: `1px solid color-mix(in srgb, ${s.colour} 40%, transparent)`, whiteSpace: "nowrap", flexShrink: 0, verticalAlign: "middle" }}>{s.tag}</span>;
}
// A station that has not reported for this long steps back off the cards.
const GONE_MS = 2 * 3600 * 1000;
// Someone is "at the board" for this long after the last mouse or key.
// ── The unfinished pile, on the board (23–25; the owner, 19 Nov 2026) ──────
// Every order a station parked with "Finish later": search by order number,
// assign one to a station (it appears on that station's order screen), or
// check off the jerseys still out — ticked ones count as passed, "checked off
// by supervisor", in the order and the reports; with none left the order is
// closed. The whole order is on the server's disk; this lists the small entries.
function UnfinishedPile({ by, onClose }) {
  const [list, setList] = useState(null), [q, setQ] = useState(""), [err, setErr] = useState("");
  const [open, setOpen] = useState(null);           // the entry being checked off
  const [seenAt, setSeenAt] = useState(0);          // when the list was last loaded (how long each order has waited)
  const [ticked, setTicked] = useState(new Set());
  const [confirm, setConfirm] = useState(false);
  const load = useCallback(() => hub.unfinished(q.trim() ? { q: q.trim() } : {}).then(r => { setList(r.orders || []); setSeenAt(Date.now()); setErr(""); }).catch(e => setErr(`The hub did not answer: ${e.message}`)), [q]);
  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, [load]);
  useEffect(() => { const h = e => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); } }; window.addEventListener("keydown", h, true); return () => window.removeEventListener("keydown", h, true); }, [onClose]);
  const act = p => p.then(load).catch(e => setErr(e.message));
  const entry = (list || []).find(e => e.id === open);
  const statusWord = { flag: "at repair", missing: "missing", short: "short", todo: "unscanned", extra: "extra, not on the order" };
  const jkey = j => (j.rowId !== null && j.rowId !== undefined ? String(j.rowId) : "x" + j.xid);   // a row, or an extra jersey's log entry
  // confirm: "pass" (back and good) or "short" (the order ships without them)
  const checkOff = () => {
    const as = confirm === "short" ? "short" : "pass";
    const all = ticked.size === entry.out.length;
    act(hub.checkOffUnfinished(entry.id, all ? { all: true, by, as } : { ids: [...ticked], by, as }).then(() => { setConfirm(false); setTicked(new Set()); if (all) setOpen(null); }));
  };
  const waited = e => (e.parkedAt && seenAt ? Math.max(0, Math.floor((seenAt - e.parkedAt) / 86400000)) : 0);   // days since it was put aside, as of the last load
  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--k-scrim)", zIndex: 2100, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "var(--k-card)", borderRadius: 16, border: "2px solid var(--k-amber)", padding: 30, maxWidth: 1100, width: "96vw", maxHeight: "94%", overflowY: "auto", boxSizing: "border-box" }}>
        <div style={STICKY_HEAD}>
          <div style={{ ...titleSt, fontSize: 32 }}>⏸ Unfinished orders{list ? ` · ${list.length}` : ""}</div>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search order number" style={{ ...inputSt, flex: 1, minWidth: 160, fontSize: 16 }} />
          <button onClick={onClose} style={{ ...btnGhost, fontSize: 15 }}>Close <Kbd light>Esc</Kbd></button>
        </div>
        {err && <div style={{ ...errSt, marginTop: 10 }}>{err}</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
          {list === null && <div style={{ color: "var(--k-ink-3)" }}>Loading…</div>}
          {list && !list.length && <div style={{ color: "var(--k-ink-3b)", fontSize: 16, padding: 8 }}>{q.trim() ? "No unfinished order with that number." : "No unfinished orders."}</div>}
          {(list || []).map(e => (
            <div key={e.id} style={{ borderRadius: 12, border: `2px solid ${open === e.id ? "var(--k-amber)" : "var(--k-rule-2)"}`, background: "var(--k-field)", padding: "12px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={{ fontSize: 22, fontWeight: 900 }}>Order {e.order}</div>
                <div style={{ fontSize: 15, color: "var(--k-ink-2)", flex: 1, minWidth: 220 }}>
                  {e.done}/{e.total} done{e.flagged ? <> · <span style={{ color: "var(--k-red-ink)" }}>{e.flagged} flagged</span></> : null}{e.missing ? <> · <span style={{ color: "var(--k-amber-ink)" }}>{e.missing} missing</span></> : null}{e.toScan ? <> · {e.toScan} unscanned</> : null}
                  <div style={{ fontSize: 13, color: "var(--k-ink-3)" }}><span style={{ fontWeight: 800, color: waited(e) >= 5 ? "var(--k-red-ink)" : waited(e) >= 2 ? "var(--k-amber-ink)" : "var(--k-ink-3)" }}>{waited(e) ? `waiting ${waited(e)} day${waited(e) === 1 ? "" : "s"}` : "put aside today"}</span> · put aside on {stationLabel(e.station)} by {e.operator || "—"} · {new Date(e.parkedAt).toLocaleDateString()}{e.assignedTo ? <span style={{ color: "var(--k-blue-ink)", fontWeight: 700 }}> · assigned to {stationLabel(e.assignedTo)}</span> : null}{e.openOn ? <span style={{ color: "var(--k-green-ink)", fontWeight: 700 }}> · open on {stationLabel(e.openOn.station)} now <button onClick={() => act(hub.releaseUnfinished(e.id))} title="Free it, so another station can open it" style={{ ...btnGhost, fontSize: 12, padding: "1px 8px", marginLeft: 4 }}>Free it</button></span> : null}{e.checkedOff?.length ? ` · ${e.checkedOff.length} checked off` : ""}</div>
                </div>
                <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {STATIONS.map(s => (
                    <button key={s.id} onClick={() => act(e.assignedTo === "st-" + s.id ? hub.releaseUnfinished(e.id) : hub.assignUnfinished(e.id, "st-" + s.id, by))} title={e.assignedTo === "st-" + s.id ? "Take it back from this station" : `Send it to ${s.label}: it shows on that station's order screen`}
                      style={{ ...btnGhost, fontSize: 14, padding: "6px 10px", borderColor: e.assignedTo === "st-" + s.id ? "var(--k-blue-ink)" : "var(--k-rule-2)", color: e.assignedTo === "st-" + s.id ? "var(--k-strong)" : "var(--k-ink-3)", background: e.assignedTo === "st-" + s.id ? "var(--k-tint-blue)" : "transparent" }}>
                      → {s.label}
                    </button>
                  ))}
                  <button disabled={!!e.openOn && open !== e.id} onClick={() => { setOpen(o => (o === e.id ? null : e.id)); setTicked(new Set()); setConfirm(false); }} title={e.openOn ? `Open on ${stationLabel(e.openOn.station)} now: Free it first (the station may be passing these garments)` : "Settle the garments still out: back and good, or ship short"} style={{ ...btnGhost, fontSize: 14, padding: "6px 12px", borderColor: "var(--k-green)", color: "var(--k-green-ink-2)", opacity: e.openOn && open !== e.id ? 0.4 : 1 }}>{open === e.id ? "▲ Close" : "✓ Settle…"}</button>
                </span>
              </div>
              {open === e.id && entry && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 15, color: "var(--k-ink-2)", marginBottom: 8 }}>Tick garments, then: <strong>Back and good</strong> — they count as passed ("checked off by supervisor"). <strong>Ship short</strong> — the order goes without them. An extra garment (not on the order) is closed either way. When none is left the order is closed.</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 6 }}>
                    {entry.out.map(j => (
                      <label key={jkey(j)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, background: ticked.has(jkey(j)) ? "var(--k-tint-green)" : "var(--k-page)", border: `1px solid ${ticked.has(jkey(j)) ? "var(--k-green)" : "var(--k-rule)"}`, cursor: "pointer" }}>
                        <input type="checkbox" checked={ticked.has(jkey(j))} onChange={() => setTicked(t => { const n = new Set(t); if (n.has(jkey(j))) n.delete(jkey(j)); else n.add(jkey(j)); return n; })} style={{ width: 20, height: 20 }} />
                        <strong style={{ fontFamily: FONT_DISPLAY, fontSize: 20 }}>#{j.number || "—"}</strong>
                        {j.name && <span style={{ fontFamily: FONT_READ }}>{j.name}</span>}
                        {j.size && <span style={{ color: "var(--k-green-ink)", fontWeight: 700 }}>{shortSize(j.size)}</span>}
                        {j.team && <span style={{ color: "var(--k-ink-3)" }}>{j.team}</span>}
                        <span style={{ marginLeft: "auto", fontSize: 12, color: j.status === "flag" ? "var(--k-red-ink)" : j.status === "todo" ? "var(--k-ink-3)" : j.status === "extra" ? "var(--k-pink-ink)" : "var(--k-amber-ink)" }}>{statusWord[j.status] || j.status}{j.reason ? `: ${j.reason}` : ""}</span>
                      </label>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <button onClick={() => setTicked(t => (t.size === entry.out.length ? new Set() : new Set(entry.out.map(jkey))))} style={{ ...btnGhost, fontSize: 15 }}>{ticked.size === entry.out.length ? "Untick all" : "Tick all"}</button>
                    {!confirm && <button disabled={!ticked.size} onClick={() => setConfirm("pass")} style={{ ...btnPri, fontSize: 16, padding: "10px 18px", background: "var(--k-green)", color: "var(--k-page)", opacity: ticked.size ? 1 : 0.4 }}>✓ Back and good · {ticked.size}</button>}
                    {!confirm && <button disabled={!ticked.size} onClick={() => setConfirm("short")} style={{ ...btnGhost, fontSize: 16, padding: "10px 18px", borderColor: "var(--k-amber)", color: "var(--k-amber-ink-2)", opacity: ticked.size ? 1 : 0.4 }}>📦 Ship short · {ticked.size}</button>}
                    {confirm && (
                      <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ fontSize: 16, fontWeight: 800 }}>{confirm === "short" ? "Ship the order without" : "Check off"} {ticked.size} of {entry.out.length}{ticked.size === entry.out.length ? " and close the order" : ""}?</span>
                        <button onClick={checkOff} style={{ ...btnPri, fontSize: 16, padding: "10px 18px", background: "var(--k-green)", color: "var(--k-page)" }}>✓ Yes</button>
                        <button onClick={() => setConfirm(false)} style={{ ...btnGhost, fontSize: 15 }}>Cancel</button>
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// The supervisor board: a card per station (live), the items that need the
// supervisor, rosters to send, the orders of a chosen day with their sheets,
// the unfinished pile and the wall view. A supervisor's sign-in is this and
// nothing else.
function SupervisorPanel({ operatorName, onSignOut }) {
  const [showPile, setShowPile] = useState(false);   // the unfinished orders
  const [pileCount, setPileCount] = useState(0);
  useEffect(() => { let on = true; const load = () => hub.unfinished().then(r => { if (on) setPileCount((r.orders || []).length); }).catch(() => {}); load(); const t = setInterval(load, 15000); return () => { on = false; clearInterval(t); }; }, []);
  const [data,    setData]    = useState(() => ({ stations: [], now: Date.now() }));
  const [rosters, setRosters] = useState([]);
  const [orders,  setOrders]  = useState([]);     // every order any station worked on the chosen day (from the hub's ledger)
  const [openOrder, setOpenOrder] = useState(null);   // { station, order } shown in the order view
  // Looking back: "" is today; a date is a past day the hub still keeps (90
  // days; photos on the newest 14). The orders list, the order view, the day
  // sheet and the damage report all follow it. The station cards are always now.
  const [day,  setDay]  = useState("");
  const [days, setDays] = useState([]);
  // A range of days instead of one ({ from, to }, both included): the orders of every day in it,
  // from the hub's slim ledger (no rosters). Each order keeps its own day, so Open order and the
  // order sheet fetch that day.
  const [range, setRange] = useState(null);
  const [pickMode, setPickMode] = useState("");   // "" | "date" | "range": the date fields are showing
  const [pickFrom, setPickFrom] = useState(""), [pickTo, setPickTo] = useState("");
  useEffect(() => {
    // `on`: an answer for a day (or range) no longer picked is dropped. A slow answer for the day picked
    // before used to land after the new day's and replace its orders (code review, low finding).
    let on = true;
    const load = range
      ? () => hub.ledgerRange(range.from, range.to).then(r => {
          if (!on) return;
          const all = {};
          (r.days || []).forEach(d => (d.orders || []).forEach(o => { const k = `${o.station}|${o.order}|${o.run || 0}`; if (!all[k] || (o.lastSeen || 0) >= (all[k].lastSeen || 0)) all[k] = { ...o, date: d.date }; }));
          setOrders(Object.values(all)); if (r.known) setDays(r.known);
        }).catch(() => {})
      : () => hub.ledger(day).then(l => { if (!on) return; setOrders((l.orders || []).map(o => ({ ...o, date: day }))); setDays(l.days || []); }).catch(() => {});
    load();
    const t = setInterval(load, 20000);
    return () => { on = false; clearInterval(t); };
  }, [day, range]);
  const [fullScreen, setFullScreen] = useState(() => !!document.fullscreenElement);
  useEffect(() => { const h = () => setFullScreen(!!document.fullscreenElement); document.addEventListener("fullscreenchange", h); return () => document.removeEventListener("fullscreenchange", h); }, []);
  const toggleFull = () => { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); else document.documentElement.requestFullscreen?.()?.catch(() => {}); };
  // The same QC Results workbook the station exports, built from what the hub holds.
  // `o.date`: the day the order view or the orders list is showing ("" = today), never the
  // board's own day when the order came from a range of days (code review M11).
  const downloadOrderSheet = (o) => hub.ledger(o.date ?? day).then(l => {
    const rec = pickRun((l.orders || []).filter(x => x.station === o.station && x.order === o.order), o.run) || o;
    const rows = rec.rows || [];
    if (!rows.length) { setMsg(`The hub has no garment list for order ${o.order} on ${stationLabel(o.station)} — that station last reported before today's update, or the order was done before it. Press Export on the station for its sheet; reload the station page so future orders come through.`); return; }
    const log = eventsAsLog((l.events || []).filter(ofRun(rec)));   // status included: the Summary sheet counts by it (M10)
    exportRosterXLSX(rows, log, { orderNumber: rec.order, operatorName: rec.operator, notes: rec.notes || "", jerseyType: jerseyTypeLabel(rec.jerseyType), idleSpells: rec.idle?.spells || [], awaySpells: rec.away?.spells || [], bins: rec.binSummary || [], categoryOf: reasonCategory }, displayColumns(rows), row => binOfRow(rec.bins, rec.closedBins, row));
  }).catch(() => setMsg("Could not fetch that order from the hub."));
  const [order,   setOrder]   = useState("");
  const [notes,   setNotes]   = useState("");
  const [customer, setCustomer] = useState("");   // printed on the box's outside label and the sign-off ticket
  const [jerseyType, setJerseyType] = useState("");
  const [garment, setGarment] = useState(DEFAULT_ORDER_GARMENT);   // the outline of "where is the damage" at the station
  const garmentByHand = useRef(false);   // picked on the form: a roster file chosen later leaves it alone
  const [binBy,   setBinBy]   = useState("team");   // how the station sorts the order: a bin per team, per size, or none
  const [file,    setFile]    = useState(null);
  const [target,  setTarget]  = useState("");     // station id to send the roster to; "" = any station may take it
  const [shipText, setShipText] = useState("");   // the orders it ships with, from the order form
  const [msg,     setMsg]     = useState(null);
  const [bigPhoto, setBigPhoto] = useState(null); // a flag photo shown large
  const [hubDown, setHubDown] = useState(null);   // when the hub stopped answering, or null
  const fileRef = useRef(null);

  const refresh = useCallback(() => {
    hub.stations().then(d => {
      setData(d); setHubDown(null);
    }).catch(() => setHubDown(t => t || Date.now()));
    hub.rosters().then(r => setRosters(r.rosters || [])).catch(() => {});
  }, []);
  const markCarriedDone = (stationIdValue, key) => hub.clearCarried(stationIdValue, key).then(refresh).catch(() => setMsg("Could not update the hub."));
  const removeStation = s => { if (window.confirm(`Remove ${stationLabel(s.id)} · ${s.operatorName || "—"} from the board? It comes back by itself if that station reports again.`)) hub.removeStation(s.id).then(refresh).catch(() => setMsg("Could not update the hub.")); };
  useEffect(() => { refresh(); const t = setInterval(refresh, 4000); return () => clearInterval(t); }, [refresh]);
  // Wall view: one row per station in letters readable across the floor, for
  // a TV. ?view=wall opens straight into it; a click or Esc comes back.
  const [wall, setWall] = useState(() => { try { return new URLSearchParams(window.location.search).get("view") === "wall"; } catch { return false; } });
  useEffect(() => { if (!wall) return; const h = e => { if (e.key === "Escape") { e.stopPropagation(); setWall(false); } }; window.addEventListener("keydown", h, true); return () => window.removeEventListener("keydown", h, true); }, [wall]);
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => { if (!wall) return; const t = setInterval(() => setClock(Date.now()), 15000); return () => clearInterval(t); }, [wall]);

  // One send at a time: a double click sent the roster twice and every station was offered it twice (code review M14).
  const sending = useRef(false);
  const send = async () => {
    if (sending.current) return;
    if (!order.trim()) { setMsg("Type the order number first — stations list rosters by it."); return; }
    if (!file) { setMsg("Choose a roster file first."); return; }
    sending.current = true;
    try {
      const isExcel = /\.(xlsx|xls)$/i.test(file.name);
      const rows = isExcel ? await parseExcel(file) : parseCSV(await file.text());
      if (!rows.length) { setMsg("No valid rows in that file."); return; }
      await hub.sendRoster({ orderNumber: order.trim(), notes: notes.trim(), customer: customer.trim(), jerseyType, garment, binBy, fileName: file.name, rows, by: operatorName, forStation: target, shipWith: orderList(shipText || shipWithOf(rows).join(" ")).filter(n => n !== order.trim()) });
      const to = target ? `${stationLabel(target)} only` : "every station";
      setMsg(`Sent ${file.name} — ${rows.length} garments for order ${order.trim()} to ${to}. It shows on the order screen there.`);
      setFile(null); setOrder(""); setNotes(""); setCustomer(""); setJerseyType(""); setGarment(DEFAULT_ORDER_GARMENT); garmentByHand.current = false; setBinBy("team"); setShipText(""); refresh();
    } catch (e) { setMsg("Could not send: " + e.message); }
    finally { sending.current = false; }
  };

  const age = s => Math.round((data.now - s.updatedAt) / 1000);
  const openOn = s => (s.attention || []).filter(a => !a.resolution).length + (s.carried || []).length;
  // Stations gone for hours (a test PC, a station shut down for the day) step
  // back into one quiet strip, so the live ones stand out and their old open
  // items do not count against the day.
  const parked = data.stations.filter(s => age(s) * 1000 > GONE_MS);
  const active = data.stations.filter(s => age(s) * 1000 <= GONE_MS);
  const openCount = active.reduce((n, s) => n + openOn(s), 0);
  const parkedOpen = parked.reduce((n, s) => n + openOn(s), 0);
  const pct = s => s.counts?.total ? Math.round(((s.counts.total - s.counts.remaining) / s.counts.total) * 100) : 0;
  const todayStr   = data.today || new Date().toLocaleDateString("en-CA");
  const todayTotal = data.stations.reduce((n, s) => n + (s.day?.date === todayStr ? s.day.done : 0), 0);
  const liveCount  = active.filter(s => age(s) <= 30 && !s.signedOut).length;   // a station signed out is not live (M8)
  const fmtMin = m => m == null ? "—" : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
  const byName = (a, b) => stationLabel(a.id).localeCompare(stationLabel(b.id), undefined, { numeric: true });

  if (wall) {
    // Sized by container-query units, not vh: the page is zoomed on big
    // monitors, and cqh follows the box, not the screen.
    const rows = Math.max(active.length, 1), rowH = Math.min(18, 82 / rows);
    const f = k => `${(rowH * k).toFixed(2)}cqh`;
    return (
      <div onClick={() => setWall(false)} style={{ position: "fixed", inset: 0, zIndex: 1950, background: "#0D1424", color: "#fff", fontFamily: FONT_UI, display: "flex", flexDirection: "column", padding: "2cqh 2cqw", boxSizing: "border-box", containerType: "size", cursor: "pointer", userSelect: "none" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "1.5cqh", flexShrink: 0 }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: "7cqh", fontWeight: 900, lineHeight: 1, color: openCount > 0 ? "#FF6B75" : "#6FD08C" }}>{openCount > 0 ? `${openCount} NEED YOU` : "ALL CLEAR"}</div>
          <div style={{ fontSize: "3cqh", color: "#A2ADC6", display: "flex", alignItems: "center", gap: "1.5cqw" }}><img src={akLogo} alt="Athletic Knit" style={{ height: "4.5cqh", background: "#fff", padding: "0.5cqh 0.8cqh", borderRadius: "0.8cqh" }} /><span>{todayTotal} {todayTotal === 1 ? "garment" : "garments"} today · {liveCount} of {active.length} live · {new Date(clock).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></div>
        </div>
        {hubDown && <div style={{ background: "#3B1420", color: "#FFCDD1", fontSize: "3cqh", fontWeight: 700, padding: "1cqh 2cqw", borderRadius: "1cqh", marginBottom: "1.5cqh" }}>⚠ The hub stopped answering at {new Date(hubDown).toLocaleTimeString()} — nothing here is live.</div>}
        <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateRows: `repeat(${rows}, 1fr)`, gap: "1.2cqh" }}>
          {active.slice().sort(byName).map(s => {
            const open = openOn(s), stale = age(s) > 30, c = s.counts || {};
            const total = c.total ?? 0, done = total - (c.remaining ?? 0);
            const col = open ? "#FF6B75" : stale ? "#5B6C9C" : (c.manual > 0 || c.missing > 0 || c.short > 0) ? "#FFB547" : "#6FD08C";
            const top = (s.attention || []).filter(a => !a.resolution).sort(bySeverity)[0];
            const line = open
              ? (top ? <><RouteTag item={top} size={f(0.2)} /> {top.jersey} — {top.reason}{open > 1 ? ` · +${open - 1} more` : ""}</> : `${open} still open from earlier orders`)
              : s.signedOut ? `signed out · ${s.signedOut.operator || "—"}`
              : stale ? `not reporting · last seen ${fmtMin(Math.round(age(s) / 60))} ago`
              : total > 0 ? (orderDone(s) ? "order done" : s.lastScan ? `now at ${s.lastScan.text}` : "scanning") : "waiting for an order";
            return (
              <div key={s.id} style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr) auto", alignItems: "center", gap: "2cqw", background: `${col}26`, borderLeft: `2.5cqw solid ${col}`, borderRadius: "1cqh", padding: "0 2cqw", minHeight: 0, overflow: "hidden" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: FONT_DISPLAY, fontSize: f(0.46), fontWeight: 900, lineHeight: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{stationLabel(s.id)}</div>
                  <div style={{ fontSize: f(0.2), color: "#D2D8E8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.operatorName || "—"} · order {s.orderNumber || "—"}</div>
                </div>
                <div style={{ fontSize: f(0.26), fontWeight: 700, color: stale && !open ? "#A2ADC6" : "#fff", minWidth: 0, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{line}</div>
                <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <span style={{ fontFamily: FONT_DISPLAY, fontSize: f(0.5), fontWeight: 900, lineHeight: 1 }}>{total > 0 ? done : "—"}</span>
                  {total > 0 && <span style={{ fontSize: f(0.24), color: "#A2ADC6" }}> / {total}</span>}
                  {total > 0 && c.remaining > 0 && !stale && s.rate ? <div style={{ fontSize: f(0.18), color: "#A2ADC6" }}>{Math.round(s.rate)}/h · {fmtMin(s.etaMin)} left</div> : null}
                </div>
              </div>
            );
          })}
          {active.length === 0 && <div style={{ fontSize: "5cqh", color: "#A2ADC6", alignSelf: "center", textAlign: "center" }}>No station reporting</div>}
        </div>
        <div style={{ fontSize: "2cqh", color: "#5B6C9C", marginTop: "1cqh", textAlign: "right", flexShrink: 0 }}>Wall view{parked.length ? ` · ${parked.length} ${parked.length === 1 ? "station" : "stations"} not reporting` : ""} · click or press Esc to go back</div>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--k-page)", zIndex: 1800, display: "flex", flexDirection: "column", color: "var(--k-ink-1)", fontFamily: FONT_UI }}>
      <div style={{ background: "var(--k-card)", borderBottom: "1px solid var(--k-rule)", padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div><div style={{ display: "flex", alignItems: "center", gap: 12, fontWeight: 800, fontSize: 15 }}><BrandMark height={26} size={20} title="Supervisor" /> <span style={{ fontWeight: 700 }}>stations</span> {openCount > 0 && <Pill color="var(--k-red)">{openCount} need you</Pill>}</div><div style={{ fontSize: 13, color: "var(--k-ink-3)" }}><strong style={{ color: "var(--k-ink-1)", fontSize: 15 }}>{todayTotal}</strong> {todayTotal === 1 ? "garment" : "garments"} today · {liveCount} of {active.length} {active.length === 1 ? "station" : "stations"} live{parked.length ? ` · ${parked.length} not reporting` : ""}</div></div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={() => setShowPile(true)} title="Orders parked with Finish later: search, assign to a station, check off" style={{ ...btnGhost, padding: "6px 12px", borderColor: pileCount ? "var(--k-amber)" : "var(--k-rule-2)", color: pileCount ? "var(--k-amber-ink-2)" : "var(--k-blue)" }}>⏸ Unfinished · {pileCount}</button>
          <button onClick={toggleFull} title={fullScreen ? "Leave full screen (Esc also works)" : "Full screen: hides the browser's tabs and address bar (F11 does the same)"} style={{ ...btnGhost, padding: "6px 12px" }}>{fullScreen ? "⛶ Exit" : "⛶ Full screen"}</button>
          <button onClick={() => setWall(true)} title="One row per station in big letters, for a TV on the floor. Click or Esc comes back; ?view=wall in the address opens straight into it." style={{ ...btnGhost, padding: "6px 12px" }}>📺 Wall</button>
          <button onClick={onSignOut} title="End your shift on this PC" style={{ ...btnGhost, padding: "6px 14px" }}>Sign out</button>
        </div>
      </div>
      {showPile && <UnfinishedPile by={operatorName} onClose={() => setShowPile(false)} />}
      {hubDown && (
        <div style={{ background: "var(--k-red)", color: "var(--k-on-red)", padding: "10px 16px", fontSize: 14, fontWeight: 700, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <span>⚠ The hub stopped answering at {new Date(hubDown).toLocaleTimeString()} — nothing below is live. Stations keep scanning on their own. Is the server window still open on the host PC?</span>
          <button onClick={refresh} style={{ ...btnGhost, padding: "4px 10px", color: "var(--k-on-red)", borderColor: "var(--k-on-red)" }}>Retry</button>
        </div>
      )}
      {openOrder && <OrderView station={openOrder.station} order={openOrder.order} run={openOrder.run || 0} date={openOrder.date ?? day} stationLabel={stationLabel} onClose={() => setOpenOrder(null)} onDownload={downloadOrderSheet} onPhoto={setBigPhoto} />}
      {bigPhoto && <PhotoLightbox photo={bigPhoto} onClose={() => setBigPhoto(null)} />}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gridAutoRows: "max-content", gap: 12, alignContent: "start" }}>{/* max-content rows: the station cards were squeezed to a strip to fit the orders list (27 in board, 19 Nov 2026) */}
          {data.stations.length === 0 && <div style={{ color: "var(--k-ink-4)", padding: 24 }}>No station has reported yet. A station appears here within a few seconds of starting an order.</div>}
          {(orders.length > 0 || days.length > 1 || day || range) && (
            <div style={{ gridColumn: "1 / -1", order: 99, marginTop: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
                <div style={{ fontWeight: 800, fontSize: 14 }}>Orders {range ? `${range.from} to ${range.to}` : day ? `on ${day}` : "today"} ({orders.length})</div>
                <select value={range ? "__range" : pickMode === "date" ? "__date" : day} title="Look back at a day the hub still keeps (90 days; photos on the newest 14), a date you pick, or a range of dates"
                  onChange={e => { const v = e.target.value; if (v === "__date") { setPickMode("date"); setPickFrom(day || todayStr); } else if (v === "__range") { setPickMode("range"); setPickFrom(range?.from || todayStr); setPickTo(range?.to || todayStr); } else { setPickMode(""); setRange(null); setDay(v); } }}
                  style={{ ...inputSt, width: "auto", fontSize: 12, padding: "3px 8px" }}>
                  <option value="">Today</option>
                  {days.filter(d => d !== todayStr).slice().reverse().map(d => <option key={d} value={d}>{d}</option>)}
                  <option value="__date">Pick a date…</option>
                  <option value="__range">A range of dates…</option>
                </select>
                {pickMode === "date" && (
                  <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                    <input type="date" value={pickFrom} max={todayStr} onChange={e => setPickFrom(e.target.value)} style={{ ...inputSt, width: "auto", fontSize: 12, padding: "3px 8px" }} />
                    <button onClick={() => { if (pickFrom) { setRange(null); setDay(pickFrom === todayStr ? "" : pickFrom); setPickMode(""); } }} style={{ ...btnPri, padding: "3px 12px", fontSize: 12 }}>Show</button>
                  </span>
                )}
                {pickMode === "range" && (
                  <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <input type="date" value={pickFrom} max={todayStr} onChange={e => setPickFrom(e.target.value)} style={{ ...inputSt, width: "auto", fontSize: 12, padding: "3px 8px" }} />
                    <span style={{ fontSize: 12, color: "var(--k-ink-3)" }}>to</span>
                    <input type="date" value={pickTo} max={todayStr} onChange={e => setPickTo(e.target.value)} style={{ ...inputSt, width: "auto", fontSize: 12, padding: "3px 8px" }} />
                    <button onClick={() => { if (pickFrom && pickTo) { const [a, b] = pickFrom <= pickTo ? [pickFrom, pickTo] : [pickTo, pickFrom]; setRange({ from: a, to: b }); setPickMode(""); } }} style={{ ...btnPri, padding: "3px 12px", fontSize: 12 }}>Show</button>
                  </span>
                )}
                {(day || range) && <button onClick={() => { setDay(""); setRange(null); setPickMode(""); }} style={{ ...btnGhost, padding: "3px 10px", fontSize: 12 }}>Back to today</button>}
              </div>
              {orders.length === 0 && <div style={{ color: "var(--k-ink-4)", fontSize: 13, padding: "6px 0 10px" }}>No orders on this day.</div>}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {orders.slice().sort((a, b) => ((orderDone(a) ? 1 : 0) - (orderDone(b) ? 1 : 0)) || ((b.lastSeen || 0) - (a.lastSeen || 0))).map(o => {   /* in progress first, then the newest */
                  const c = o.counts || {}; const total = c.total ?? 0; const done = total - (c.remaining ?? 0); const finished = orderDone(o);
                  const hm = t => t ? new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
                  return (
                    <div key={`${o.station}|${o.order}|${o.run || 0}`} style={{ ...card, padding: "8px 12px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>Order {o.order} <span style={{ fontWeight: 400, color: "var(--k-ink-4)" }}>· {stationLabel(o.station)} · {o.operator || "—"}</span></div>
                        <div style={{ fontSize: 11, color: "var(--k-ink-3)" }}>
                          <strong style={{ color: "var(--k-ink-1)" }}>{done} / {total}</strong> done
                          {c.flag > 0 && <span style={{ color: "var(--k-red-ink)" }}> · {c.flag} with supervisor</span>}
                          {c.manual > 0 && <span style={{ color: "var(--k-amber-ink-2)" }}> · {c.manual} by hand</span>}
                          {" · "}{finished ? <span style={{ color: "var(--k-green)", fontWeight: 700 }}>finished {hm(doneAt(o))}{c.remaining > 0 ? ` · ${c.remaining} unscanned` : ""}</span> : `in progress · started ${hm(o.firstSeen)}`}
                        </div>
                      </div>
                      <button onClick={() => setOpenOrder({ station: o.station, order: o.order, run: o.run || 0, date: o.date })} title="Open this order: roster with statuses, problems, and the log" style={{ ...btnGhost, padding: "4px 10px", fontSize: 12, borderColor: "var(--k-blue-ink)", color: "var(--k-blue-ink-2)" }}>Open order</button>
                      <button onClick={() => downloadOrderSheet(o)} title="The QC Results workbook for this order: every garment with its status, reason, resolution, inspector and time" style={{ ...btnGhost, padding: "4px 10px", fontSize: 12, borderColor: "var(--k-green)", color: "var(--k-green-ink)" }}>⬇ Order sheet</button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {parked.length > 0 && (
            <div style={{ gridColumn: "1 / -1", order: 98, marginTop: 8, ...card, padding: "8px 12px", opacity: 0.75 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--k-ink-3)" }}>Not reporting for over {Math.round(GONE_MS / 3600000)} hours ({parked.length}) — stepped back so the live stations stand out{parkedOpen > 0 ? `; ${parkedOpen} old open ${parkedOpen === 1 ? "item" : "items"} on them` : ""}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                {parked.slice().sort(byName).map(s => (
                  <span key={s.id} style={{ fontSize: 12, color: "var(--k-ink-2)", display: "inline-flex", gap: 8, alignItems: "center", padding: "3px 4px 3px 10px", border: "1px solid var(--k-rule-2)", borderRadius: 6 }}>
                    {stationLabel(s.id)} · {s.operatorName || "—"} · order {s.orderNumber || "—"} · last seen {fmtMin(Math.round(age(s) / 60))} ago{openOn(s) > 0 && <span style={{ color: "var(--k-red-ink)" }}>· {openOn(s)} open</span>}
                    <button onClick={() => setOpenOrder({ station: s.id, order: s.orderNumber, run: s.orderRun || 0 })} disabled={!s.orderNumber} title="Open its last order" style={{ ...btnGhost, padding: "2px 8px", fontSize: 11, opacity: s.orderNumber ? 1 : 0.4 }}>Open</button>
                    <button onClick={() => removeStation(s)} title="Take it off the board" style={{ ...btnGhost, padding: "2px 8px", fontSize: 11 }}>Remove</button>
                  </span>
                ))}
              </div>
            </div>
          )}
          {active.slice().sort(byName).map(s => {   /* a fixed order: cards must not jump as reports arrive */
            const stale = age(s) > 30;
            return (
              <div key={s.id} id={"card-" + s.id} style={{ ...card, padding: 14, border: `1px solid ${stale ? "var(--k-rule-2)" : s.counts?.flag ? "var(--k-red)" : "var(--k-rule)"}`, opacity: stale ? 0.6 : 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div style={{ fontWeight: 800, fontSize: 17 }}><span style={{ color: "var(--k-blue-ink)" }}>{stationLabel(s.id)}</span> · {s.operatorName || "—"}</div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ fontSize: 11, color: s.signedOut ? "var(--k-ink-3)" : stale ? "var(--k-red-ink)" : "var(--k-green)" }}>{s.signedOut ? `signed out ${new Date(s.signedOut.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : stale ? `last seen ${fmtMin(Math.round(age(s) / 60))} ago` : "● live"}</div>
                    {(stale || orderDone(s)) && (
                      <button onClick={() => removeStation(s)}
                        title="Take this card off the board" style={{ ...btnGhost, padding: "5px 12px", fontSize: 14 }}>Remove</button>
                    )}
                  </div>
                </div>
                <div style={{ fontSize: 13, color: "var(--k-ink-3)", marginTop: 2, display: "flex", alignItems: "center", gap: 10 }}>
                  <span>Order <strong style={{ color: "var(--k-ink-1)" }}>{s.orderNumber || "—"}</strong></span>
                  {s.counts?.total > 0 && !stale && (
                    <button onClick={() => { const n = window.prompt(`Order number for ${stationLabel(s.id)} · ${s.operatorName || "—"}:`, /^\d+$/.test(s.orderNumber || "") ? s.orderNumber : ""); if (n && n.trim()) hub.setOrder(s.id, { orderNumber: n.trim(), by: operatorName }).then(() => { setMsg(`${stationLabel(s.id)} takes order number ${n.trim()} on its next report.`); refresh(); }).catch(() => setMsg("Could not update the hub.")); }}
                      title="Give the order running on this station its number (only the supervisor can)" style={{ ...btnGhost, padding: "5px 12px", fontSize: 14 }}>{s.orderNumber && s.setOrder ? `→ ${s.setOrder.orderNumber}…` : "Set number"}</button>
                  )}
                  {s.orderNumber && s.counts?.total > 0 && (
                    <button onClick={() => setOpenOrder({ station: s.id, order: s.orderNumber, run: s.orderRun || 0 })} title="Open this order: every garment with its status, what was flagged and why, and the log" style={{ ...btnGhost, padding: "5px 12px", fontSize: 14, borderColor: "var(--k-blue-ink)", color: "var(--k-blue-ink-2)" }}>Open order</button>
                  )}
                </div>
                <div style={{ height: 8, background: "var(--k-field)", borderRadius: 4, marginTop: 10, overflow: "hidden" }}><div style={{ height: "100%", width: `${pct(s)}%`, background: orderDone(s) ? "var(--k-green)" : "var(--k-blue)" }} /></div>
                <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
                  {s.counts?.total > 0
                    ? <div style={{ fontSize: 26, fontWeight: 900, lineHeight: 1, marginRight: 6 }}>{(s.counts?.total ?? 0) - (s.counts?.remaining ?? 0)}<span style={{ fontSize: 14, color: "var(--k-ink-4)", fontWeight: 600 }}> / {s.counts?.total ?? 0}</span></div>
                    : <div style={{ fontSize: 15, fontWeight: 700, color: "var(--k-blue-ink)", marginRight: 6 }}>Waiting for an order</div>}
                  <Pill color="var(--k-green)">{s.counts?.pass ?? 0} pass</Pill>
                  {s.counts?.flag > 0 && <Pill color="var(--k-red)">{s.counts.flag} with supervisor</Pill>}
                  {s.counts?.manual > 0 && <Pill color="var(--k-amber)">{s.counts.manual} by hand</Pill>}
                  {(s.counts?.missing > 0 || s.counts?.short > 0) && <Pill color="var(--k-amber)">{(s.counts.missing || 0) + (s.counts.short || 0)} missing/short</Pill>}
                </div>
                <div style={{ fontSize: 12, color: "var(--k-ink-3)", marginTop: 8 }}>
                  <strong style={{ color: "var(--k-ink-1)" }}>{s.day?.date === todayStr ? s.day.done : 0}</strong> today
                  {!(s.counts?.total > 0)
                    ? " · signed in, no order yet — send one with the form"
                    : orderDone(s)
                    ? <> · <span style={{ color: "var(--k-green)", fontWeight: 700 }}>order done</span></>
                    : stale ? " · pace unknown — not reporting"
                      : s.rate ? <> · <strong style={{ color: "var(--k-ink-1)" }}>{Math.round(s.rate)}</strong>/h · about {fmtMin(s.etaMin)} left</>
                        : " · pace shows after a few minutes"}
                </div>
                {s.lastScan && <div style={{ fontSize: 11, color: "var(--k-ink-4)", marginTop: 4 }}>Now at: {s.lastScan.text} · {s.lastScan.time.slice(11)}</div>}
                {s.attention?.length > 0 && (
                  <div style={{ marginTop: 10, borderTop: "1px solid var(--k-rule)", paddingTop: 8 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--k-red-ink)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Needs you ({s.attention.filter(a => !a.resolution).length || s.attention.length})</div>{/* open items; with none open (all accepted or fixed at the station) the number of items shown (review, 25 Nov 2026) */}
                    {s.attention.length > 3 && <div style={{ fontSize: 11, color: "var(--k-ink-4)", marginBottom: 3 }}>the three that weigh most — the rest are in the order</div>}
                    {s.attention.slice().sort(bySeverity).slice(0, 3).map((a, i) => (
                      <div key={i} style={{ fontSize: 12, marginBottom: 3, display: "flex", gap: 8, alignItems: "flex-start" }}>
                        <PhotoThumbs photo={a.photo} damagePhotos={a.damagePhotos} w={56} h={42} onOpen={setBigPhoto} caption={[a.jersey, a.reason].filter(Boolean).join(" · ")} />
                        {a.status === "flagged" && <FlagMarks item={a} height={36} />}
                        <div>
                          <RouteTag item={a} /> <span style={{ color: attnColour(a.status), fontWeight: 700 }}>{attnIcon(a.status)} {a.jersey}</span>
                          <span style={{ color: "var(--k-ink-3)" }}> — {a.reason}{a.resolution ? ` → ${a.resolution}` : ""}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {s.carried?.length > 0 && (
                  <div style={{ marginTop: 10, borderTop: "1px solid var(--k-rule)", paddingTop: 8 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--k-amber-ink)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Still open from earlier orders ({s.carried.length})</div>
                    <div style={{ maxHeight: 220, overflowY: "auto" }}>{/* up to 50: they scroll in the card, so one station does not stretch the whole row */}
                    {s.carried.map(c => (
                      <div key={c.key} style={{ fontSize: 12, marginBottom: 4, display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                        <span><span style={{ color: attnColour(c.status), fontWeight: 700 }}>{attnIcon(c.status)} {c.jersey}</span><span style={{ color: "var(--k-ink-3)" }}> — order {c.order} · {c.reason}</span></span>
                        <button onClick={() => markCarriedDone(s.id, c.key)} title="Dealt with — remove from this list" style={{ ...btnGhost, padding: "5px 12px", fontSize: 14, flexShrink: 0 }}>Done</button>
                      </div>
                    ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ width: 340, flexShrink: 0, borderLeft: "1px solid var(--k-rule)", padding: 14, overflowY: "auto" }}>
          <button onClick={() => hub.ledger(day).then(l => exportDaySheetXLSX(l, stationLabel, undefined, { categoryOf: reasonCategory })).catch(() => setMsg("Could not fetch the day's scans from the hub."))}
            title="One Excel file for the whole day, every station: garments per hour, time per garment, flag rate, each operator, defects by category, every scan" style={{ ...bigBtn, fontSize: 14, marginBottom: 8, background: "var(--k-green)", color: "var(--k-page)" }}>⬇ Day sheet (Excel) — {day ? day : `${todayTotal} ${todayTotal === 1 ? "garment" : "garments"} so far`}</button>
          <button onClick={() => hub.ledger(day).then(l => exportDamageReportXLSX(buildDamageRows(l.events || [], { stationLabel, typeLabel: jerseyTypeLabel }), { name: "day_" + (l.date || ""), title: `Damage report — ${l.date || "today"}, every station` })).catch(e => setMsg(e.message || "Could not fetch the day's flags from the hub."))}
            title="Every flagged garment of the day, every station, with its photo (photos are kept 14 days)" style={{ ...bigBtn, fontSize: 13, marginBottom: 16, background: "transparent", border: "1px solid var(--k-red)", color: "var(--k-red-ink)" }}>⬇ Damage report (Excel, with photos){day ? ` — ${day}` : ""}</button>
          <CompareDays days={days} stationLabel={stationLabel} onProblem={setMsg} />
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10 }}>Send a roster</div>
          <div style={{ marginBottom: 10 }}>
            <label style={labelSt}>Send to</label>
            <select value={target} onChange={e => setTarget(e.target.value)} style={{ ...inputSt, fontSize: 13 }}>
              <option value="">Any station — first to take it</option>
              {data.stations.slice().sort((a, b) => stationLabel(a.id).localeCompare(stationLabel(b.id), undefined, { numeric: true })).map(s => (
                <option key={s.id} value={s.id}>{stationLabel(s.id)} · {s.operatorName || "—"}{age(s) > 30 ? " (not reporting)" : !(s.counts?.total > 0) ? " (waiting for an order)" : ` (on order ${s.orderNumber || "—"})`}</option>
              ))}
            </select>
            {data.stations.length === 0 && <div style={{ fontSize: 11, color: "var(--k-ink-4)", marginTop: 4 }}>Stations appear here once they have signed in and started once today.</div>}
          </div>
          <div style={{ marginBottom: 10 }}><label style={labelSt}>Order number</label><input value={order} onChange={e => setOrder(e.target.value)} placeholder="e.g. 25" style={inputSt} /></div>
          <div style={{ marginBottom: 10 }}><label style={labelSt}>Ships with <span style={{ color: "var(--k-ink-3b)", fontWeight: 400 }}>— other order numbers on the order form; their boxes are filled together</span></label><ShipWithField value={shipText} onChange={setShipText} placeholder="e.g. 264248 (read from the file when it says)" /></div>
          <div style={{ marginBottom: 10 }}><label style={labelSt}>Customer <span style={{ color: "var(--k-ink-3b)", fontWeight: 400 }}>— on the box's outside label and the sign-off ticket; empty prints the team name</span></label><input value={customer} onChange={e => setCustomer(e.target.value)} placeholder="e.g. Source for Sports" style={inputSt} /></div>
          <div style={{ marginBottom: 10 }}><label style={labelSt}>Order notes</label><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="remarks from the order paper" style={{ ...inputSt, resize: "vertical", fontSize: 13 }} /></div>
          <div style={{ marginBottom: 10 }}><label style={labelSt}>Garment type <span style={{ color: "var(--k-ink-3b)", fontWeight: 400 }}>— sets the station's flag reasons; unset offers every reason</span></label><JerseyTypePicker value={jerseyType} onChange={setJerseyType} /></div>
          <div style={{ marginBottom: 10 }}><label style={labelSt}>Garment <span style={{ color: "var(--k-ink-3b)", fontWeight: 400 }}>— the outline the station marks the damage on</span></label><GarmentPicker value={garment} onChange={g => { garmentByHand.current = true; setGarment(g); }} /></div>
          <div style={{ marginBottom: 10 }}><label style={labelSt}>Boxes — how the station sorts it</label><BinByPicker value={binBy} onChange={setBinBy} /></div>
          <div style={{ marginBottom: 12 }}>
            <label style={labelSt}>Roster file</label>
            <div onClick={() => fileRef.current.click()} style={{ padding: "10px 12px", borderRadius: 8, border: `1px solid ${file ? "var(--k-green)" : "var(--k-rule-2)"}`, background: "var(--k-field)", color: file ? "var(--k-green)" : "var(--k-ink-4)", fontSize: 13, cursor: "pointer" }}>{file ? "✓ " + file.name : "📂 Choose CSV or Excel…"}</div>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.tsv,.txt" style={{ display: "none" }} onChange={e => {
              const f = e.target.files[0];
              if (f) {
                setFile(f);
                (async () => { try { const rows = /\.(xlsx|xls)$/i.test(f.name) ? await parseExcel(f) : parseCSV(await f.text()); const n = orderNumberOf(rows), sw = shipWithOf(rows), g = rosterGarment(rows); if (n) setOrder(o => o.trim() || n); if (sw.length) setShipText(t => t.trim() || shipNorm(sw.join(", "))); if (!garmentByHand.current) setGarment(g || DEFAULT_ORDER_GARMENT); } catch { /* Send reports a bad file */ } })();
              }
              e.target.value = "";
            }} />
          </div>
          <button onClick={send} style={{ ...bigBtn, fontSize: 14 }}>Send to stations</button>
          {msg && <div style={{ fontSize: 12, color: "var(--k-ink-3)", marginTop: 10 }}>{msg}</div>}
          <div style={{ fontWeight: 800, fontSize: 13, margin: "22px 0 8px" }}>Rosters sent ({rosters.length}) <span style={{ fontWeight: 400, color: "var(--k-ink-4)" }}>· one station per order; a finished order leaves this list</span></div>
          {rosters.map(r => (
            <div key={r.id} style={{ ...card, padding: "8px 10px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 17, fontWeight: 700 }}>Order {r.orderNumber || "—"} <span style={{ fontWeight: 400, color: "var(--k-ink-3)" }}>· {r.rowCount}</span>{r.takenBy ? <span style={{ fontWeight: 600, color: "var(--k-green-ink)", marginLeft: 6 }}>· on {stationLabel(r.takenBy.station)} · {r.takenBy.operator || "—"}</span> : r.forStation ? <span style={{ fontWeight: 600, color: "var(--k-blue-ink)", marginLeft: 6 }}>→ {stationLabel(r.forStation)}</span> : <span style={{ fontWeight: 400, color: "var(--k-ink-4)", marginLeft: 6 }}>· waiting · any station</span>}</div>
                <div style={{ fontSize: 11, color: "var(--k-ink-4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.fileName} · sent {new Date(r.createdAt).toLocaleTimeString()}{r.takenBy ? ` · started ${new Date(r.takenBy.at).toLocaleTimeString()}` : ""}</div>
              </div>
              <span style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                {r.takenBy && <button onClick={() => hub.releaseRoster(r.id).then(refresh).catch(() => {})} title="Let another station take this order (the station that has it keeps working until it finishes)" style={{ ...btnGhost, padding: "2px 8px", fontSize: 11, borderColor: "var(--k-amber)", color: "var(--k-amber-ink-2)" }}>Release</button>}
                <button onClick={() => hub.removeRoster(r.id).then(refresh).catch(() => {})} style={{ ...btnGhost, padding: "2px 8px", fontSize: 11 }}>Remove</button>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Scan overlay ──────────────────────────────────────────────────────────────
// Every screen is a list of options: the Confirm key selects the highlighted
// one, the Navigate key (or ↑↓) moves the highlight. The first option is always
// the safe default, so the Select key pressed again and again keeps the rhythm and a bad photo can always be
// retried without writing a record.

// Two columns, filled row by row, when there are
// more than three rows; the list uses the whole panel and scrolls only when
// both columns are full. The rows run in likelihood order reading left to
// right, top to bottom, and Down follows that reading order (9 Nov 2026).
function twoColumns(n) {
  return n > 3
    ? { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, alignItems: "stretch" }   // row by row: 1st and 2nd across the top, 3rd and 4th under them. The two tiles of a row are the same height: a one-line tile beside a two-line one used to leave a gap under it (17 Nov 2026)
    : { display: "flex", flexDirection: "column", gap: 8 };
}
// The arrow that marks the highlighted tile. Only the arrow: the key's name
// ("← Enter") took enough width to wrap long labels onto a second line (owner,
// 17 Nov 2026). It is on every tile and only hidden when the tile is not the
// highlighted one, so its room is kept and highlighting never changes how a
// label wraps. The highlighted tile grows a hair instead.
const hintSt = (on, accent, gap = 12) => ({ fontSize: 20, color: accent, fontWeight: 700, whiteSpace: "nowrap", marginLeft: gap, visibility: on ? "visible" : "hidden" });
const liftSt = on => ({ transform: on ? "scale(1.012)" : "none", transition: "transform 90ms ease-out", position: "relative", zIndex: on ? 1 : 0 });

// A tile of the pick list: ONE line (the owner, 24 Nov 2026, after two
// mockups: on a by-team order every row had the same number, so the team had
// become the big line and "#2" sat small and grey, and operators were lost; a
// tile with number, name, team and size all big was "a lot of information").
//   left    the NUMBER, always, as big as the SIZE box, white, on a fixed width
//           so the middles of the tiles line up ("—" for a jersey with no number);
//   middle  the name and the team on one modest line, "LEACH · 10U"; a row with
//           no name (a 500-jersey order was numbers only) is just the team. What
//           tells the rows apart (`diff`, differingFields) is amber, the number
//           never is. Extra columns small after it; the Flagged / Already passed
//           badge on the same line; a came-back row gets a small line above it;
//   right   the SIZE box, as big as the number: on a by-team order the size tag
//           is all the operator checks (the owner, 19 Nov 2026), then the arrow.
// `big`: a one-column list (three rows or fewer) draws its text a fifth
// bigger — the tiles are narrower there and the room is to spare (23 Nov 2026).
// Exported for its test (src/__tests__/candidate-row.test.jsx).
export function CandidateRow({ c, diff = [], extraCols = [], selected, disabled, accent, big = false, sizeBig = false, onClick, onHover }) {
  const number = String(c.number ?? "").trim();
  const name   = String(c.name ?? "").trim();
  const team   = String(c.team ?? "").trim();
  const extras = extraCols.filter(k => c[k]);
  const size   = shortSize(String(c.size || "").trim());
  const px  = n => Math.round(n * (big ? 1.2 : 1));
  // Amber on what tells the rows apart: the team when the teams differ (on a
  // by-team list the names differ too, some rows having none, and the team is
  // the one that matters); the name only when the teams are the same.
  const hue = f => disabled ? "var(--k-ink-4)" : diff.includes(f) && !(f === "name" && diff.includes("team")) ? accent : undefined;
  // Back from repair, or found after it was marked missing (the owner, 20 Nov 2026: two #35 on the list,
  // one not scanned and one back from repair, and nothing told them apart): a blue bar and a line.
  const back = !disabled && c.cameBack ? c.cameBack : null;
  const bigFont = big ? "clamp(41px, 4.3vw, 62px)" : "clamp(34px, 3.6vw, 52px)";   // the number and the size box
  // On a by-size order the size is what the operator picks by (the owner, 25 Nov 2026): its box is the biggest thing on the tile.
  const sizeFont = sizeBig ? (big ? "clamp(55px, 5.8vw, 84px)" : "clamp(46px, 4.9vw, 70px)") : bigFont;
  return (
    <div onClick={disabled ? undefined : onClick} onMouseEnter={disabled ? undefined : onHover} data-sel={selected ? "1" : undefined}
      style={{ display: "flex", alignItems: "center", gap: 12, padding: big ? "8px 16px 8px 18px" : "6px 14px 6px 16px", borderRadius: 14, minWidth: 0, border: `3px solid ${disabled ? "color-mix(in srgb, var(--k-strong) 8%, transparent)" : selected ? accent : "color-mix(in srgb, var(--k-strong) 12%, transparent)"}`, background: disabled ? "color-mix(in srgb, var(--k-strong) 2%, transparent)" : selected ? "var(--k-tint-amber)" : "color-mix(in srgb, var(--k-strong) 4%, transparent)", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.45 : 1, ...(back ? { boxShadow: "inset 10px 0 0 var(--k-sky)", paddingLeft: 24 } : {}), ...liftSt(selected && !disabled) }}>
      <span style={{ fontFamily: FONT_DISPLAY, fontSize: bigFont, fontWeight: 900, lineHeight: 1, color: disabled || !number ? "var(--k-ink-4)" : "var(--k-strong)", whiteSpace: "nowrap", minWidth: "1.4em", flexShrink: 0 }}>{/* 1.4em holds "#22", so the middles of two-digit tiles line up; a three-digit number widens its own zone (the middle is narrow beside the camera, so no room is kept for digits that are not there) */}
        {number ? <><span style={{ fontSize: "0.6em", fontWeight: 800, opacity: 0.7 }}>#</span>{number}</> : "—"}
      </span>
      <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 2 }}>
        {back && <span style={{ fontSize: px(17), fontWeight: 900, color: "var(--k-sky-ink)", lineHeight: 1.1 }}>{back.was === "flag" ? `🔧 Back from repair${back.reason ? " — was: " + back.reason : ""}` : "✓ Was marked missing — found"}</span>}
        {(name || team || extras.length > 0 || disabled) && (
          <span data-head={big ? "1" : undefined} style={{ fontSize: big ? "clamp(22px, 2vw, 29px)" : "clamp(18px, 1.7vw, 24px)", fontWeight: 700, lineHeight: 1.1, color: disabled ? "var(--k-ink-4)" : "var(--k-ink-1)", ...(big ? { whiteSpace: "nowrap", overflow: "hidden" } : { overflowWrap: "anywhere" }) }}>{/* beside the camera a two-column tile leaves the middle ~150 px: a long name then wraps at the dot, the team under it. big: one line, so the list's measurement can tell when the text no longer fits (ScanOverlay drops `big` then) */}
            {name && <span style={{ fontFamily: FONT_READ, color: hue("name") }}>{name}</span>}
            {name && team && " · "}
            {team && <span style={{ color: hue("team") }}>{team}</span>}
            {extras.map(k => <span key={k} style={{ fontSize: px(16), color: hue(k) || "var(--k-ink-2)", marginLeft: name || team ? 10 : 0 }}>{cap(k)}: {c[k]}</span>)}
            {disabled && (c.scanned === "flag"
              ? <span style={{ fontSize: px(17), color: "var(--k-red-ink)", marginLeft: name || team ? 12 : 0 }}>🚩 Flagged</span>
              : <span style={{ fontSize: px(17), color: "var(--k-green)", marginLeft: name || team ? 12 : 0 }}>✓ Already passed</span>)}
          </span>
        )}
      </div>
      {size && (
        <span style={{ fontFamily: FONT_DISPLAY, fontSize: sizeFont, fontWeight: 900, lineHeight: 1, letterSpacing: 1, whiteSpace: "nowrap", padding: "6px 14px", borderRadius: 12, border: `3px solid ${disabled ? "color-mix(in srgb, var(--k-strong) 10%, transparent)" : "var(--k-tint-amber-line)"}`, background: disabled ? "transparent" : "var(--k-tint-amber)", color: disabled ? "var(--k-ink-4)" : "var(--k-strong)", flexShrink: 0 }}>{size}</span>
      )}
      {!disabled && <span style={hintSt(selected, accent, 0)} aria-hidden="true">←</span>}
    </div>
  );
}

// ── The garment, front and back, with the damage marked ──────────────────────
// Drawn from src/lib/garments.js, the same shapes the flag ticket prints. On
// the "where is the damage" screen (`onTap`) a tap on the garment adds a spot
// and a tap on a spot takes it off; elsewhere (the FLAGGED screen, History, the
// last result) it only shows the marks. Spots are numbered 1–3 over both sides
// in the order they were marked, as on the ticket. Its size: `fit` { cqh, cqw }
// (each side at most that much of the screen's container) or `height` in px.
// `stackFit` { cqh, cqw }: the same for front ABOVE back; the map measures its
// container and stacks when that draws the garment bigger (the wide drawings,
// a hockey jersey or a hoodie with its arms out, the owner's SVGs of 26 Nov 2026).
// A component at module level, never inside ScanOverlay (see optionButton).
const LOCATE_QUIET_MS = 450;   // the Select key is ignored this long after the locate step opens or its highlight is moved
const DOUBLE_TAP_MS = 400;                         // see GarmentMap's `remove`
const SPOT_R = 7;                                  // a spot's radius, in viewBox units (the garment is 100 tall)
function GarmentMap({ kind, spots = [], onTap, onRemove, fit = null, stackFit = null, height = 120, captions = true, title }) {
  const g = garmentShape(kind), view = garmentView(g.id);
  const ratio = view.vbW / view.vbH;
  const boxRef = useRef(null);
  const [stacked, setStacked] = useState(false);
  useLayoutEffect(() => {
    if (!fit || !stackFit) return;
    let c = boxRef.current?.parentElement;
    while (c && getComputedStyle(c).containerType === "normal") c = c.parentElement;
    if (!c) return;
    const measure = () => {
      const W = c.clientWidth / 100, H = c.clientHeight / 100;
      const beside = Math.min(fit.cqh * H, fit.cqw * W / ratio), above = Math.min(stackFit.cqh * H, stackFit.cqw * W / ratio);
      setStacked(above > beside * 1.05);
    };
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);                // it reports once at once, then on every resize
    ro.observe(c);
    return () => ro.disconnect();
  }, [fit?.cqh, fit?.cqw, stackFit?.cqh, stackFit?.cqw, ratio]); // eslint-disable-line react-hooks/exhaustive-deps
  const stack = !!(stacked && fit && stackFit), f = stack ? stackFit : fit;
  const dims = f
    ? { height: `min(${f.cqh}cqh, ${(f.cqw / ratio).toFixed(2)}cqw)`, width: `min(${(f.cqh * ratio).toFixed(2)}cqh, ${f.cqw}cqw)` }
    : { height, width: Math.round(height * ratio) };
  const list = Array.isArray(spots) ? spots : [];
  const pts = poly => poly.map(p => toView(view, p).map(v => v.toFixed(1)).join(",")).join(" ");
  // Where a tap lands, in the garment's own 0–1, from the SVG's box on the screen
  // (the viewBox keeps its proportions: "meet", centred).
  // A double tap on one point must not add a spot and take it straight off again (review,
  // 24 Nov 2026): a tap on a spot within DOUBLE_TAP_MS of the tap that made it is ignored.
  const addedAt = useRef(-Infinity);
  const tap = (side, e) => {
    if (!onTap) return;
    const r = e.currentTarget.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const k = Math.min(r.width / view.vbW, r.height / view.vbH);
    const vx = (e.clientX - r.left - (r.width - view.vbW * k) / 2) / k, vy = (e.clientY - r.top - (r.height - view.vbH * k) / 2) / k;
    const [x, y] = fromView(view, vx, vy);
    const s = spotAt(g.id, side, x, y);
    if (s) { addedAt.current = e.timeStamp; onTap(s); }
  };
  const remove = (i, e) => { if (e.timeStamp - addedAt.current < DOUBLE_TAP_MS) return; onRemove(i); };
  // The tap screen is drawn big; a read-only map (FLAGGED, History) keeps small captions
  // and lines whatever its size.
  const big = !!onTap, gap = fit ? "3cqw" : 8;
  return (
    <div ref={boxRef} title={title} style={{ display: "flex", flexDirection: stack ? "column" : "row", gap: stack ? "1.2cqh" : gap, justifyContent: "center", alignItems: stack ? "center" : "flex-start" }}>
      {SIDES.map(side => (
        <div key={side} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: big ? 6 : 2 }}>
          {captions && <div style={{ fontSize: big ? "clamp(20px, 3.2cqh, 34px)" : 11, fontWeight: 900, letterSpacing: big ? 3 : 1, color: big ? "var(--k-violet-ink)" : "var(--k-ink-3)", lineHeight: 1 }}>{sideLabel(g.id, side).toUpperCase()}</div>}
          <svg viewBox={`0 0 ${view.vbW} ${view.vbH}`} data-side={side} onClick={onTap ? e => tap(side, e) : undefined}
            style={{ ...dims, display: "block", cursor: onTap ? "crosshair" : "default", touchAction: "manipulation", background: big ? "color-mix(in srgb, var(--k-strong) 3%, transparent)" : "transparent", borderRadius: big ? 14 : 4 }}>
            <polygon points={pts(g.outlines[side])} fill={big ? "color-mix(in srgb, var(--k-strong) 8%, transparent)" : "color-mix(in srgb, var(--k-strong) 6%, transparent)"} stroke="var(--k-ink-1)" strokeWidth={big ? 1.2 : 2} strokeLinejoin="round" />
            {(g.detail[side] || []).map((d, i) => <polyline key={i} points={pts(d)} fill="none" stroke="var(--k-ink-3)" strokeWidth={big ? 0.8 : 1.4} strokeLinejoin="round" strokeLinecap="round" />)}
            {list.map((s, i) => {
              if (s?.side !== side) return null;
              const [cx, cy] = toView(view, [s.x, s.y]);
              return (
                <g key={i} data-spot={i + 1} onClick={onRemove ? e => { e.stopPropagation(); remove(i, e); } : undefined} style={{ cursor: onRemove ? "pointer" : "default" }}>
                  <circle cx={cx} cy={cy} r={SPOT_R + 1.5} fill="none" stroke="#fff" strokeWidth={1.2} />
                  <circle cx={cx} cy={cy} r={SPOT_R} fill="var(--k-red)" />
                  <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={SPOT_R * 1.5} fontWeight={900} fill="#fff" style={{ pointerEvents: "none", fontFamily: FONT_DISPLAY }}>{i + 1}</text>
                </g>
              );
            })}
          </svg>
        </div>
      ))}
    </div>
  );
}

// Every result screen of a scan, by `state.mode`: the green confirm with its
// checklist, the yellow lists, red, ALREADY DONE, the reasons menu, Clean it
// now, FLAGGED, the by-hand form and the size picker. It draws and takes keys;
// what each choice does is in `actions` (App).
// tapOnly / holdBack (a flagged garment of an order not parked: a tap, never the pedal) are in src/lib/scanpolicy.js.

export function ScanOverlay({ state, actions, binMap, extraCols, notes, jerseyType = "", inspect = null, sorter = false, confirmKey, cancelKey, upKey = "ArrowUp", retryKey, byHandKey, stream, rotation, embedded, canPhoto = false, ticket = null, reprintTicket, listSort = "size", lastSize = "", paused = false }) {
  const reasons = reasonsFor(jerseyType);
  // Runs an option: a click, the Select key or the pedal.
  const fire = useCallback(o => o?.run(), []);
  const mode    = state.mode;
  const isGreen = mode === "confirm" || mode === "done";
  // The camera says the number it read is covered or cut off (it is asked to
  // say so only on evidence: a fold, a hand, a sleeve, the picture's edge
  // beside the digit) and the name settled it: still a
  // green, with a line telling the operator to look at the number. A stray
  // #12 LEACH with the 1 under a fold reads as the roster's #2 LEACH, and
  // only the operator can see that (11 Nov 2026). The matching is untouched.
  const seen = state.scan?.detected;
  const numberDoubt = mode === "confirm" && !!seen && String(state.match?.number ?? "") !== ""
    && seen.number_complete === false;   // only when the camera says the number itself is covered or cut off: not for a jersey that is merely not flat or a number off centre, or the line would show too often to be read
  // The checks to tick before Confirm works (the owner, 20 Nov 2026): all of
  // them on Inspect fully; on a quick look only the ones a flag added, while
  // Decoration and Size tag are shown big to look at and the rest small, with
  // nothing to tick (the owner, 23 Nov 2026). Tap a check to tick it; the
  // Select key ticks the next one while any is left, then confirms.
  const { required: mustCheck, look: lookAt, remind: alsoLook } = useMemo(() => checksFor(mode === "confirm" ? inspect : null, inspect?.checks || CHECKS), [mode, inspect]);
  const [ticked, setTicked] = useState(() => new Set());
  const toTick = mustCheck.filter(c => !ticked.has(c.id));
  const allTicked = toTick.length === 0;
  const toggleTick = useCallback(id => setTicked(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; }), []);
  const tickNext = useCallback(() => { if (toTick[0]) toggleTick(toTick[0].id); }, [toTick, toggleTick]);
  const isList  = mode === "pick" || mode === "close";
  const isSizePick = mode === "offSize" || mode === "listFlag";   // Flag on the list: what is wrong, then (duplicate, not on the roster) what size is it?
  const isRed   = mode === "flag" || mode === "duplicate" || mode === "supervisor";
  const isMenu  = mode === "reasons" || mode === "reasonText";
  const isManual = mode === "manual";
  const isClean = mode === "clean";   // "Dirt or mark", "Loose thread": fixed at the station, a flag resolved at once
  const fixIn = state.fixing?.inPlace;   // the words of that reason's screen (config.js `inPlace`); set whenever the mode is "clean"
  const isLocate = mode === "locate";  // where on the garment the damage is: drawn like the reasons menu it follows

  const bg     = isGreen ? "var(--k-bg-green)" : (isList || isManual || isSizePick) ? "var(--k-bg-amber)" : (isMenu || isLocate) ? "var(--k-bg-violet)" : isClean ? "var(--k-bg-sky)" : "var(--k-bg-red)";
  const accent = isGreen ? "var(--k-green)" : (isList || isManual || isSizePick) ? "var(--k-amber)" : (isMenu || isLocate) ? "var(--k-violet)" : isClean ? "var(--k-sky)" : "var(--k-red)";

  const match      = state.match || state.scan?.match || null;
  // By size unless the station says otherwise (Settings → Pick list); the last jersey's size first; on a
  // 6/9 list the number read before its twin (`twinOf`, the owner, 25 Nov 2026).
  const candidates = useMemo(() => sortCandidates(state.candidates || [], listSort, { lastSize, after: state.twinOf ? r => normNum(r.number) === state.twinOf : null }), [state.candidates, listSort, lastSize, state.twinOf]);
  // Why the list starts where it does: 0 when the first row is the last jersey's size ("L-S first"), 1 when
  // it is of its family ("L- sizes first"), 2 when the order is the plain one (nothing said).
  const lastRank = lastSize && candidates.length ? lastSizeRank(candidates[0].size, lastSize) : 2;
  const detected   = state.scan?.detected;
  // A one-column list (three rows or fewer) is drawn with bigger text, but only
  // while that leaves nothing to scroll (the owner, 23 Nov 2026) and every name
  // still fits on its line (a name broken in two, "MACDONA / LD", is harder to
  // read, not easier): each new list is tried big, measured once it is drawn,
  // and drawn again at the usual size when it ran past the bottom of its panel
  // or a name ran past its tile. `tooBig` remembers which list did (a new list
  // is tried big again); the second draw happens before the first is painted
  // (flushSync from a microtask), so nothing flickers.
  const listRef = useRef(null);
  const [tooBig, setTooBig] = useState(null);   // the `candidates` that did not fit big
  const oneColBig = candidates.length <= 3 && tooBig !== candidates;
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!oneColBig || !el) return;
    const scrolls = el.scrollHeight > el.clientHeight + 1;
    const cut = [...el.querySelectorAll("[data-head]")].some(h => h.scrollWidth > h.clientWidth + 1);
    if (scrolls || cut) queueMicrotask(() => flushSync(() => setTooBig(candidates)));
  }, [oneColBig, candidates]);

  // Damage photo on the supervisor screen: the scan photo only ever shows the
  // back, so the operator sets the problem under the camera, presses Enter, and
  // the live frame is kept on the flag for the supervisor at once (the owner,
  // 25 Nov 2026: the 3-2-1 hurried the operator and the photos were poor).
  const damagePhotos = state.damagePhotos || [];
  // Framing the damage photo (the co-op, 25 Nov 2026): the live camera fills the
  // screen where the photo will be, the operator sets the damage in it and presses
  // "Take photo"; the photo then shows in the same place (Retake and Take another
  // go back to the live view). A defect opens on the live view, a roster problem
  // on Continue with "Photo of the damage" to open it. `aim`: null until the
  // operator moves it, then true (live) or false (the photo).
  const [aim, setAim] = useState(null);
  const canFrame = mode === "supervisor" && canPhoto && !!stream;
  const framing = canFrame && (aim ?? (!!state.photoFirst && damagePhotos.length === 0));
  // FLAGGED with a damage photo, or framing one: the picture takes all the room
  // there is and the words share a line above it and a line below, so the
  // operator can see whether the shot shows the damage and nothing scrolls (the
  // owner, 17 Nov 2026: at a fixed height it was still small and the screen scrolled).
  const compact = mode === "supervisor" && (damagePhotos.length > 0 || framing);
  // The highlighted option: null until a key, a hover or a shot moves it, and
  // then the first option that can be picked (below, once the options exist).
  const [picked, setSelectedIdx] = useState(null);
  // The shot (Photo, Take another, Retake): the shutter, the live frame kept,
  // then the highlight back on the first option (Continue). `shooting` keeps a
  // second press from taking two, or a Retake from dropping one, while a photo
  // is on its way.
  const [shooting, setShooting] = useState(false);
  const takePhoto = useCallback((retake = false) => {
    if (shooting) return;
    if (retake) actions.dropDamagePhoto();
    setShooting(true);
    playTone("shutter");
    Promise.resolve(actions.damagePhoto()).finally(() => { setShooting(false); setAim(false); setSelectedIdx(0); });
  }, [shooting, actions]);
  // Back to the live view: "Photo of the damage" on a roster problem, Take another, and Retake (which drops the last photo first).
  const frameAgain = useCallback((retake = false) => {
    if (shooting) return;
    if (retake) actions.dropDamagePhoto();
    setAim(true); setSelectedIdx(0);
  }, [shooting, actions]);
  // The retry pedal on a green: the read is right, there is nothing to retry,
  // and a retry here looks exactly like a confirm from the operator's side
  // (both end on the camera screen) — a jersey went in the bin unchecked that
  // way on 5 Nov 2026. So the pedal only shows a nudge, laid over the screen
  // for 5 s with nothing moving underneath; the Retry button is a mouse click
  // only (no key reaches it: the arrows skip it, the Select key never runs it).
  const [nudge, setNudge] = useState("");
  const nudgeTimer = useRef(null);
  const showNudge = useCallback(() => {
    setNudge(`That's the retry pedal — ${formatKey(confirmKey)} confirms`);
    clearTimeout(nudgeTimer.current); nudgeTimer.current = setTimeout(() => setNudge(""), 5000);
  }, [confirmKey]);
  useEffect(() => () => clearTimeout(nudgeTimer.current), []);

  // What tells the rows apart (the team on a by-team order, the name when two
  // names share a number, an extra column): the tile draws it amber and the line
  // under the header names it. The number is the big text on every tile (the
  // owner, 24 Nov 2026; before, whatever differed became the big text).
  const fields = useMemo(() => [...CORE_COLUMNS.filter(f => f !== "size"), ...extraCols], [extraCols]);   // the size has its own place on every tile
  const diff   = useMemo(() => differingFields(candidates, fields), [candidates, fields]);

  const options = useMemo(() => {
    const retry    = { id: "retry",    label: "↻ Retry scan",    run: actions.retry };
    const notRight = { id: "notright", label: "🚩 Flag",          run: sorter ? actions.listFlag : actions.reasons };   // a sorter flags No size tag, Duplicate, Not on the roster only
    const byHand   = { id: "manual",   label: "⌨ Enter by hand", run: actions.manual };
    if (mode === "confirm")    return [{ id: allTicked ? "confirm" : "tick", label: allTicked ? "✓ Confirm" : `✓ Confirm · ${toTick.length} to check`, primary: true, locked: !allTicked, run: allTicked ? actions.confirm : tickNext }, ...(state.typed ? [{ id: "back", label: "← Back", run: actions.editTyped }] : state.fromList ? [{ id: "back", label: "← Back to the list", run: actions.backToList }] : [{ ...retry, mouseOnly: true }]), notRight];   // typed by hand: Back to the form, as typed   // Retry on a green is a mouse click only (see showNudge)
    if (isList) {
      const t = state.typed;
      const none = t
        ? { ...byHand, label: `🛑 #${t.number || "?"}${t.name ? " " + t.name : ""} — not on the roster` }
        : { ...byHand, label: "⌨ None of these" };
      const back = { id: "back", label: "← Back", run: actions.editTyped };   // mistyped: back to the form, as typed
      // No general Flag on a list: nobody has said yet which jersey this is (owner, 17 Nov
      // 2026). Two flags that need no row are here (the owner, 19 Nov 2026): a jersey with
      // NO SIZE TAG (nothing to pick a row by), and an EXTRA jersey that is not on the
      // roster, which asks the size first so the ticket carries it. Any other defect is
      // flagged from the screen that follows, or with "Flag it" on the last pass.
      // One Flag button (the owner, 19 Nov 2026): it opens No size tag, Duplicate and Not on
      // the roster. No Enter by hand here: it is beside the scan button. A list after a
      // number was typed has it too (the owner, 20 Nov 2026), and its flags take the typed
      // number, not the camera's read.
      const flag = { id: "listflag", label: "🚩 Flag", run: actions.listFlag };
      // A flagged garment offered back on an order that was not parked is a tap only (tapOnly): the pedal never passes it (H3).
      return [...candidates.map(c => ({ id: "c" + c._id, candidate: c, disabled: isDone(c), ...(tapOnly(c) ? { mouseOnly: true } : {}), run: () => actions.pick(c) })), ...(t ? [back, none, flag] : [retry, flag])];
    }
    if (mode === "listFlag")   return [{ id: "nosize", label: "🏷 No size tag", run: actions.noSizeTag }, { id: "dup", label: "🔁 Duplicate", run: () => actions.offRosterStart("dup") }, { id: "offroster", label: "🚩 Not on the roster", run: () => actions.offRosterStart("off") }, { id: "back", label: "← Back", run: actions.back }];
    if (mode === "offSize")    return [
      ...(state.sizes || []).flatMap((g, gi) => g.sizes.map(s => ({ id: "sz" + s.value, label: s.short, group: gi, run: () => actions.offRosterSize(s.value) }))),
      { id: "goalie", label: state.goalie ? "☑ Goalie garment" : "☐ Goalie garment", on: !!state.goalie, run: actions.toggleGoalie },
      { id: "notag", label: "🏷 No size tag", run: () => actions.offRosterSize("") },
      { id: "back", label: "← Back", run: actions.back }];
    if (mode === "flag")       return [{ ...retry, primary: true }, { id: "listflag", label: "🚩 Flag", run: actions.listFlag }];   // Retry and Flag only (the owner, 20 Nov 2026); Flag opens the yellow list's menu: No size tag, Duplicate, Not on the roster
    if (mode === "manual")     return [];
    if (mode === "clean")      return [{ id: "cleaned", label: fixIn?.done, primary: true, run: actions.cleaned }, { id: "stays", label: fixIn?.fail, run: actions.cleanFailed }, { id: "back", label: "← Back", run: actions.back }];
    if (mode === "duplicate")  return duplicateOptions({ match: state.match, actions, retry });   // a flagged jersey scanned again: Skip first, "Back from repair" a mouse click only (src/lib/dupoptions.js)
    if (mode === "reasons")    return [...reasons.map(r => ({ id: r.id, label: r.label, run: () => actions.chooseReason(r) })), { id: "back", label: "← Back", run: actions.back }];
    if (mode === "supervisor") {
      const cont   = { id: "cont",   label: "✓ Continue", run: actions.continueSupervisor };
      const photo  = { id: "photo",  label: damagePhotos.length ? "📷 Take another" : "📷 Photo of the damage", hint: damagePhotos.length ? "" : "set the garment, then press Enter", run: () => takePhoto() };
      const retake = { id: "retake", label: "↻ Retake", run: () => takePhoto(true) };
      // Flagged from the size screen: Back undoes the flag and asks the size again (the owner,
      // 19 Nov 2026: a wrong size tapped by mistake).
      const sizeBack = state.sizeBack ? [{ id: "sizeback", label: "← Back · wrong size", run: actions.backToSize }] : [];
      if (!canPhoto) return [{ ...cont, primary: true }, ...sizeBack];
      if (canFrame) {
        // The live view is up: Take photo first (the pedal), Continue to go on without one.
        if (framing) return [{ id: "shoot", label: shooting ? "📷 Taking…" : "📷 Take photo", primary: true, hint: "set the damage in the picture", run: () => takePhoto() }, { ...cont, label: damagePhotos.length ? "✓ Continue" : "✓ Continue without a photo" }, ...sizeBack];
        if (damagePhotos.length) return [{ ...cont, primary: true }, { ...photo, run: () => frameAgain() }, { ...retake, run: () => frameAgain(true) }, ...sizeBack];
        return [{ ...cont, primary: true }, { ...photo, hint: "", run: () => frameAgain() }, ...sizeBack];
      }
      if (damagePhotos.length) return [{ ...cont, primary: true }, photo, retake, ...sizeBack];
      // A defect wants a photo first; a roster problem is already in the scan photo.
      return state.photoFirst ? [{ ...photo, primary: true }, cont, ...sizeBack] : [{ ...cont, primary: true }, photo, ...sizeBack];
    }
    if (mode === "locate") {
      // Where is the damage (the plan, 23 Nov 2026): taps on the garment are the mouse's or the
      // finger's; the pedal can only Skip or, once something is marked, finish. The buttons never
      // move under the finger (review, 24 Nov 2026): always Done, Skip, Undo; only the highlight
      // moves. Nothing marked: Done and Undo are greyed and the highlight is on Skip (the Select
      // key runs it, so a station without a mouse never gets stuck).
      const n = (state.spots || []).length;
      const skip = { id: "skip", label: "Skip — no mark", run: actions.locateSkip };
      const done = { id: "locdone", label: n ? `✓ Done · ${n} marked` : "✓ Done · tap the damage", primary: n > 0, disabled: n === 0, run: actions.locateDone };
      const undo = { id: "undo", label: "↶ Undo last mark", disabled: n === 0, run: actions.locateUndo };
      return [done, skip, undo];
    }
    if (mode === "reasonText") return [];   // typing, not navigating
    return [];
  }, [state.spots, allTicked, toTick.length, tickNext, mode, isList, candidates, actions, state.typed, state.sizes, state.goalie, state.sizeBack, reasons, damagePhotos.length, canPhoto, state.photoFirst, takePhoto, frameAgain, canFrame, framing, shooting, sorter, state.match, state.fromList, fixIn]);

  const selectedIdx = picked ?? Math.max(0, options.findIndex(o => !o.disabled && !o.mouseOnly));
  const lastKeyRef = useRef(0);
  const locateQuietRef = useRef(0);   // until when the Select key is ignored on "where is the damage"

  // Auto-dismiss the green flash; the app then arms hands-free scanning.
  useEffect(() => {
    if (mode !== "done") return;
    const t = setTimeout(() => actions.dismissDone(), 700);
    return () => clearTimeout(t);
  }, [mode, actions]);

  useEffect(() => {
    const move = dir => {
      const n = options.length; if (!n) return;
      let next = selectedIdx, tries = 0;
      do { next = (next + dir + n) % n; tries++; } while ((options[next]?.disabled || options[next]?.mouseOnly) && tries < n);
      setSelectedIdx(next);
    };
    const onKey = (e) => {
      if (e.repeat) return;                       // a held key or pedal is one press, not many
      if (paused) return;   // a dialog is open over this result: the pedal must not pick, tick or confirm behind it (code review of 23 Nov 2026, H1)
      if (mode === "done") return;
      if (mode === "manual" || mode === "reasonText") { if (e.code === "Escape") { e.preventDefault(); actions.back(); } return; }   // typing, not navigating
      if ((mode === "offSize" || mode === "listFlag") && e.code === "Escape") { e.preventDefault(); actions.back(); return; }
      if (mode === "locate" && e.code === "Escape") { e.preventDefault(); actions.locateSkip(); return; }   // Esc = Skip: the flag stands, with no mark
      if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target?.tagName)) return;   // the Enter that submitted the form is still bubbling: it must not also pick the first row of the list it opened
      if (e.code === retryKey) { if (mode === "confirm") { e.preventDefault(); showNudge(); return; } const i = options.findIndex(x => x.id === "retry"); if (i >= 0) { e.preventDefault(); lastKeyRef.current = Date.now(); fire(options[i]); } return; }
      if (e.code === byHandKey) { const i = options.findIndex(x => x.id === "manual"); if (i >= 0) { e.preventDefault(); lastKeyRef.current = Date.now(); fire(options[i]); } return; }   // straight to the form, like R goes straight to retry
      if (e.code === confirmKey && mode === "locate" && Date.now() < locateQuietRef.current) { e.preventDefault(); return; }   // a second press meant for the screen before: see locateQuietRef
      if (e.code === confirmKey) { e.preventDefault(); lastKeyRef.current = Date.now(); const o = options[selectedIdx]; if (o && !o.disabled && !o.mouseOnly) fire(o); return; }
      // The assigned keys come first; a plain arrow only moves its own way when
      // it is not assigned to the other direction (a pedal board wired the
      // other way round sets Down = ArrowUp and Up = ArrowDown, 9 Nov 2026).
      if (e.code === cancelKey || e.code === upKey) { e.preventDefault(); lastKeyRef.current = Date.now(); move(e.code === cancelKey ? 1 : -1); return; }
      if (e.code === "ArrowDown") { e.preventDefault(); lastKeyRef.current = Date.now(); move(1); return; }
      if (e.code === "ArrowUp") { e.preventDefault(); lastKeyRef.current = Date.now(); move(-1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [options, selectedIdx, mode, confirmKey, cancelKey, upKey, retryKey, byHandKey, actions, showNudge, fire, paused]);

  // Where is the damage: the first spot puts the highlight on Done (the first
  // option), and taking the last one off puts it back on Skip (the second).
  // (Set while rendering, as React advises for state that follows a prop.)
  const hasSpots = isLocate && (state.spots || []).length > 0;
  const [hadSpots, setHadSpots] = useState(hasSpots);
  if (hadSpots !== hasSpots) { setHadSpots(hasSpots); setSelectedIdx(hasSpots ? 0 : 1); }
  // The Select key waits a moment (LOCATE_QUIET_MS) when the step opens and when the code moves
  // the highlight (first spot on, last spot off): a double press of Select on a reason, or a second
  // Undo, must not run Skip and lose the mark (review round 3, 24 Nov 2026). Touch stays immediate.
  useEffect(() => { if (mode === "locate") locateQuietRef.current = Date.now() + LOCATE_QUIET_MS; }, [mode, hasSpots]);

  // A bumped mouse never overrides a key press made in the last moment.
  const hover = useCallback(i => { if (Date.now() - lastKeyRef.current > 800) setSelectedIdx(i); }, []);

  // The highlighted option follows the key down a long list: the list scrolls
  // so the row the Select key would take is always on screen.
  useEffect(() => {
    if (Date.now() - lastKeyRef.current > 800) return;          // moved by the mouse: it is already in view
    document.querySelector('[data-sel="1"]')?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedIdx]);

  const binNum  = match ? binFor(binMap, match) : null;
  const hasSize = !!(match?.size);
  const extras  = match ? extraCols.filter(k => match[k]).map(k => `${cap(k)}: ${match[k]}`) : [];

  // A plain function, not a component: a component defined in here is a new type on every
  // render, so the hover that highlights a button remounted it and a quick press (a touch
  // screen, 19 Nov 2026) landed on the old one and did nothing.
  const optionButton = (o, i) => {
    const sel = i === selectedIdx;
    return (
      <button key={o.id} onClick={() => { if (!o.disabled) fire(o); }} onMouseEnter={() => { if (!o.disabled) hover(i); }} data-sel={sel ? "1" : undefined} disabled={!!o.disabled}
        style={{ padding: "13px 20px", borderRadius: 12, border: `3px solid ${sel ? accent : "color-mix(in srgb, var(--k-strong) 22%, transparent)"}`, background: o.primary ? (o.locked ? "var(--k-green-locked)" : accent) : "transparent", color: o.primary && !o.locked ? "var(--k-page)" : "var(--k-strong)", fontWeight: 700, fontSize: 20, cursor: o.disabled ? "default" : "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, boxShadow: sel ? `0 0 0 3px color-mix(in srgb, ${accent} 33%, transparent)` : "none", opacity: o.disabled ? 0.4 : sel || o.primary ? 1 : 0.85 }}>
        <span>{o.label} {o.id === "retry" && mode !== "confirm" ? <Kbd light>{formatKey(retryKey)}</Kbd> : o.id === "manual" ? <Kbd light>{formatKey(byHandKey)}</Kbd> : sel && <Kbd light={!o.primary}>{formatKey(confirmKey)}</Kbd>}</span>
        {o.hint && <span style={{ fontSize: 15, fontWeight: 400, opacity: 0.8 }}>{o.hint}</span>}
      </button>
    );
  };

  return (
    <div style={{ position: embedded ? "absolute" : "fixed", inset: 0, zIndex: 1000, background: bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "safe center", userSelect: "none", padding: compact ? "12px 0" : state.scan?.thumb && !isGreen && !isList && !isSizePick && !isLocate ? "16px 0 116px" : "16px 0", overflowY: "auto", containerType: "size" }}>

      {/* ── GREEN ── */}
      {nudge && (
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 5, padding: "18px 36px", borderRadius: 18, background: "var(--k-page)", color: "var(--k-amber-ink-2)", border: "4px solid var(--k-amber)", fontWeight: 900, fontSize: "clamp(24px, 3.4vw, 40px)", boxShadow: "0 12px 40px rgba(0,0,0,0.6)", maxWidth: "90%", textAlign: "center", boxSizing: "border-box", pointerEvents: "none" }}>
          ↻ {nudge}
        </div>
      )}
      {isGreen && match && (
        <>
          {/* Two halves that take the room above the buttons: the number and
              name on the left, SIZE and BIN on the right, each half a size
              container so its text is sized by the half itself. */}
          <div style={{ flex: 1, minHeight: 0, width: "100%", display: "grid", gridTemplateColumns: hasSize || binNum !== null ? "1fr 1fr" : "1fr", gap: 16, padding: "0 20px", boxSizing: "border-box", alignItems: "stretch" }}>
            <div style={{ containerType: "size", minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
              <div style={{ fontFamily: FONT_DISPLAY, fontSize: `min(${match.name ? 52 : 70}cqh, ${String(match.number ?? "").length > 2 ? 40 : 52}cqw)`, fontWeight: 900, color: accent, lineHeight: 0.9, maxWidth: "100%" }}>
                #{match.number}
              </div>
              {match.name && (
                <div style={{ fontFamily: FONT_DISPLAY, fontSize: `min(20cqh, ${Math.min(22, 170 / Math.max(6, String(match.name).length))}cqw)`, fontWeight: 800, color: "var(--k-strong)", lineHeight: 1, marginTop: "2cqh", maxWidth: "100%", overflowWrap: "anywhere", letterSpacing: 1 }}>
                  {match.name}
                </div>
              )}
              {match.team && <div style={{ fontSize: "min(9cqh, 8cqw)", color: "var(--k-green-ink-2)", marginTop: "2cqh", fontWeight: 700, lineHeight: 1.1, maxWidth: "100%", overflowWrap: "anywhere" }}>{match.team}</div>}
            </div>
            {(hasSize || binNum !== null) && (
              <div style={{ containerType: "size", minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", gap: "3cqh" }}>
                {hasSize && (
                  <div style={{ flex: 1, minHeight: 0, borderRadius: 24, border: "5px solid var(--k-green)", background: "var(--k-tint-green)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 4cqw", boxSizing: "border-box" }}>
                    <div style={{ fontSize: `min(${binNum !== null ? 7 : 12}cqh, ${binNum !== null ? 14 : 20}cqw)`, color: "var(--k-green-ink-2)", fontWeight: 900, letterSpacing: 3, lineHeight: 1 }}>SIZE</div>
                    <div style={{ fontFamily: FONT_DISPLAY, fontSize: `min(${binNum !== null ? 34 : 70}cqh, ${Math.min(80, Math.floor(130 / Math.max(1, String(shortSize(match.size)).length)))}cqw)`, fontWeight: 900, color: "var(--k-strong)", letterSpacing: 1, lineHeight: 1, whiteSpace: "nowrap" }}>{shortSize(match.size)}</div>{/* by width too: four letters (A-XL, A-XS) used to wrap onto two lines (the owner, 19 Nov 2026) */}
                  </div>
                )}
                {binNum !== null && (
                  <div style={{ flex: 1, minHeight: 0, borderRadius: 24, border: "5px solid var(--k-blue)", background: "var(--k-tint-blue)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 4cqw", boxSizing: "border-box" }}>
                    <div style={{ fontSize: `min(${hasSize ? 7 : 12}cqh, ${hasSize ? 14 : 20}cqw)`, color: "var(--k-blue-ink-2)", fontWeight: 900, letterSpacing: 3, lineHeight: 1 }}>BOX</div>
                    {/* The digit is limited by the box width: one digit may be wider than two, two than three (Barlow Condensed is about half an em a digit). */}
                    <div style={{ fontFamily: FONT_DISPLAY, fontSize: `min(${hasSize ? 36 : 72}cqh, ${String(binNum).length === 1 ? 120 : String(binNum).length === 2 ? 80 : String(binNum).length === 3 ? 58 : 44}cqw)`, fontWeight: 900, color: "var(--k-strong)", lineHeight: 0.95 }}>{binNum}</div>
                  </div>
                )}
              </div>
            )}
          </div>
          {extras.length > 0 && (
            <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap", justifyContent: "center", flexShrink: 0 }}>
              {extras.map(x => <span key={x} style={{ padding: "8px 18px", borderRadius: 12, border: "3px solid var(--k-amber)", background: "var(--k-tint-amber)", color: "var(--k-strong)", fontWeight: 900, fontSize: "clamp(20px, 3vw, 32px)" }}>{x}</span>)}
            </div>
          )}
          {state.note && <div style={{ marginTop: 12, fontSize: 20, color: "var(--k-amber-ink-2)" }}>✎ {state.note}</div>}
          {mode === "confirm" && (
            <>
              {match?.cameBack && (
                <div style={{ marginTop: 12, padding: "10px 26px", borderRadius: 14, background: "var(--k-page)", border: "4px solid var(--k-sky)", color: "var(--k-sky-ink)", fontWeight: 900, fontSize: "clamp(18px, 2.4vw, 28px)", textAlign: "center", maxWidth: "94%" }}>
                  {match.cameBack.was === "flag" ? `🔧 Back from repair${match.cameBack.reason ? " (" + match.cameBack.reason + ")" : ""} — check it is fixed` : "✓ Found — it was marked missing"}
                </div>
              )}
              {numberDoubt && (
                <div style={{ marginTop: 12, padding: "10px 26px", borderRadius: 14, background: "var(--k-page)", border: "4px solid var(--k-amber)", color: "var(--k-amber-ink-2)", fontWeight: 900, fontSize: "clamp(22px, 3vw, 32px)", textAlign: "center", maxWidth: "94%" }}>
                  ⚠ Camera could not see the whole number — check it is #{match.number}
                </div>
              )}
              {inspect && (
                <div style={{ marginTop: 12, padding: "8px 24px", borderRadius: 14, background: inspect.phase === "quick" ? "var(--k-rule-2)" : "var(--k-amber)", color: inspect.phase === "quick" ? "var(--k-strong)" : "var(--k-page)", fontWeight: 900, fontSize: "clamp(20px, 2.6vw, 26px)", letterSpacing: 0.5 }}>
                  🔍 {inspectLabel(inspect, inspect?.checks || CHECKS)}
                </div>
              )}
              {mustCheck.length > 0 && (
              <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", alignItems: "center", padding: "0 20px" }}>
                <span style={{ fontSize: 18, color: "var(--k-green-ink-2)", fontWeight: 700, marginRight: 6 }}>Tick each</span>
                {mustCheck.map(c => {
                  const on = ticked.has(c.id), next = !on && toTick[0]?.id === c.id;
                  return (
                    <button key={c.id} onClick={() => toggleTick(c.id)} aria-pressed={on}
                      style={{ padding: "7px 16px", borderRadius: 999, cursor: "pointer", border: `3px solid ${on ? "var(--k-green)" : next ? "var(--k-amber-ink-2)" : "var(--k-tint-green-line)"}`, background: on ? "var(--k-green)" : "var(--k-tint-green)", color: on ? "var(--k-page)" : "var(--k-strong)", fontWeight: 800, fontSize: "clamp(18px, 2.1vw, 23px)", whiteSpace: "nowrap", fontFamily: "inherit" }}>
                      {on ? "☑" : "☐"} {c.label}{inspect?.phase === "quick" && !c.quick ? " ⚠" : ""}
                    </button>
                  );
                })}
              </div>
              )}
              {lookAt.length > 0 && (
              <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center", alignItems: "center", padding: "0 20px" }}>{/* a quick look: the common faults, big, to look at, nothing to tick (the owner, 23 Nov 2026) */}
                <span style={{ fontSize: 18, color: "var(--k-green-ink-2)", fontWeight: 700, marginRight: 6 }}>Look at</span>
                {lookAt.map(c => (
                  <span key={c.id} style={{ padding: "8px 22px", borderRadius: 999, border: "3px solid var(--k-amber-ink-2)", background: "var(--k-tint-amber)", color: "var(--k-strong)", fontWeight: 900, fontSize: "clamp(22px, 2.6vw, 30px)", whiteSpace: "nowrap" }}>{c.label}</span>
                ))}
              </div>
              )}
              {alsoLook.length > 0 && (
                <div style={{ marginTop: 8, fontSize: "clamp(16px, 1.8vw, 20px)", color: "var(--k-teal-ink)", opacity: 0.85, textAlign: "center", padding: "0 20px" }}>
                  Also look for: {alsoLook.map(c => c.label).join(" · ")}
                </div>
              )}
              {notes && (
                <div style={{ marginTop: 12, padding: "8px 18px", borderRadius: 12, background: "var(--k-tint-amber)", border: "2px solid var(--k-tint-amber-line)", color: "var(--k-amber-ink-3)", fontWeight: 700, fontSize: "clamp(18px, 2vw, 24px)", textAlign: "center", maxWidth: 900 }}>
                  📝 {notes}
                </div>
              )}
              <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", padding: "0 6px" }}>
                {options.map((o, i) => optionButton(o, i))}
              </div>
            </>
          )}
          {mode === "done" && <div style={{ fontSize: 32, color: "var(--k-green-ink)", marginTop: 20, opacity: 0.85 }}>Next garment…</div>}
        </>
      )}

      {/* ── YELLOW: pick / close ── */}
      {isList && (
        <>
          {/* The number read, big, so the operator knows the read was right before the green
              screen (the owner, 19 Nov 2026); the typed number when the operator typed. */}
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: "clamp(56px, 13cqh, 128px)", fontWeight: 900, color: "var(--k-strong)", lineHeight: 0.95, textAlign: "center", padding: "0 24px", maxWidth: "100%", overflowWrap: "anywhere" }}>
            {state.typed
              ? `#${state.typed.number || "?"}${state.typed.name ? " · " + state.typed.name : ""}`
              : `#${detected?.number || "?"}${detected?.number && detected?.number_complete === false ? "?" : ""}${detected?.name ? " · " + detected.name + (detected.name_complete === false ? "…" : "") : ""}`}
          </div>

          {state.twinOf && !state.typed && <div style={{ fontSize: 17, color: "var(--k-stone-ink)", textAlign: "center", marginTop: 4 }}>{`${detected?.number || "?"} or ${state.twinOf}? both are listed · #${detected?.number || "?"} first`}</div>}
          {lastRank < 2 && <div style={{ fontSize: 17, color: "var(--k-stone-ink)", textAlign: "center", marginTop: 4 }}>{lastRank === 0 ? `${shortSize(lastSize)} first · the last garment` : `${lastSizeLetter(lastSize)} sizes first · the last garment was ${shortSize(lastSize)}`}</div>}
          <div style={{ fontSize: 20, color: "var(--k-stone-ink-2)", marginBottom: 16, textAlign: "center", fontFamily: FONT_READ }}>
            {/* Typed by hand: what was typed, not the camera's empty read ("Read: #? · no name"; code review, low finding). */}
            {state.typed ? `Typed: #${state.typed.number || "?"}${state.typed.name ? " · " + state.typed.name : ""}` : <>
            Read: #{detected?.number || "?"}{detected?.number && detected?.number_complete === false ? "?" : ""}{detected?.name ? ` · ${detected.name}${detected.name_complete === false ? "…" : ""}` : " · no name"}{detected?.jersey_colour ? ` · ${detected.jersey_colour} garment` : ""}
            </>}
            {diff.some(f => f !== "number" && f !== "name") && <span style={{ marginLeft: 12, color: accent }}>· differs by {diff.filter(f => f !== "number" && f !== "name").map(cap).join(" and ")}</span>}{/* the team (or an extra column), whether or not the names differ too (review, 24 Nov 2026); a number or a name that differs is plain to see on the tiles */}
          </div>
          <div ref={listRef} style={{ width: candidates.length > 3 ? "100%" : "calc(50% + 20px)", maxWidth: candidates.length > 3 ? 1600 : 820, padding: "0 24px", boxSizing: "border-box", flex: "0 1 auto", minHeight: 0, overflowY: "auto" }}>{/* the list takes all the room left on the screen (a 27 in panel shows far more than half), and scrolls only past that. One column (three rows or fewer) is exactly as wide as one column of the two-column list (half the panel less the gap: 50% + 20px of padding), centred, and its tiles' text is bigger (the owner, 23 Nov 2026: the one-column tiles were nearly twice as wide; three rows still fit without scrolling) */}
            {candidates.length === 0 && (
              <div style={{ textAlign: "center", color: "var(--k-amber-ink-2)", fontSize: 22, padding: 16 }}>{/* a typed number on no row: "#88 is not on the roster — check the number" (M18) */}{state.typed && state.reason ? state.reason : "No rows to choose from."}</div>
            )}
            {candidates.length > 0 && candidates.every(isDone) && (
              <div style={{ textAlign: "center", color: "var(--k-amber-ink-2)", fontSize: 20, padding: "8px 0 12px" }}>All of these already passed.</div>
            )}
            <div style={twoColumns(candidates.length)}>
              {options.map((o, i) => o.candidate && (
                <CandidateRow key={o.id} c={o.candidate} diff={diff} extraCols={extraCols} selected={i === selectedIdx} disabled={o.disabled} accent={accent} big={oneColBig} sizeBig={binFieldOf(binMap) === "size"}
                  onClick={() => fire(o)} onHover={() => hover(i)} />
              ))}
            </div>
          </div>
          <div style={{ marginTop: 14, display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
            {options.map((o, i) => !o.candidate && optionButton(o, i))}
          </div>
        </>
      )}

      {/* ── YELLOW: "Not on the roster" asks the size first, for the ticket ── */}
      {isSizePick && (
        <>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: "clamp(44px, 10cqh, 96px)", fontWeight: 900, color: "var(--k-strong)", lineHeight: 1, textAlign: "center", padding: "0 24px" }}>
            #{detected?.number || "?"}{detected?.name ? ` · ${detected.name}` : ""}
          </div>
          <div style={{ fontSize: "clamp(26px, 4vw, 44px)", fontWeight: 900, color: accent, margin: "8px 0 16px", textAlign: "center", padding: "0 24px", lineHeight: 1.1 }}>{mode === "listFlag" ? "What is wrong?" : state.kind === "dup" ? "Duplicate — what size is it?" : "Not on the roster — what size is it?"}</div>
          {state.threw && (
            <div style={{ fontSize: "clamp(20px, 2.4vw, 28px)", fontWeight: 800, color: "var(--k-red-ink-3)", background: "var(--k-tint-red)", border: "2px solid var(--k-red)", borderRadius: 12, padding: "8px 18px", marginBottom: 14, textAlign: "center" }}>
              🗑 Throw away the tickets that printed for {state.threw}. Pick the right size.
            </div>
          )}
          {mode === "offSize" ? (
            <div style={{ width: "100%", maxWidth: 1400, padding: "0 24px", boxSizing: "border-box", maxHeight: "72%", overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
              {(state.sizes || []).map((g, gi) => (
                <div key={g.label} style={{ display: "flex", alignItems: "stretch", gap: 10 }}>
                  <div style={{ width: 150, flexShrink: 0, display: "flex", alignItems: "center", fontSize: "clamp(22px, 2.4vw, 32px)", fontWeight: 900, color: "var(--k-amber-ink-3)" }}>{g.label}</div>
                  <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 10 }}>
                    {options.map((o, i) => o.group !== gi ? null : (
                      <button key={o.id} onClick={() => fire(o)} onMouseEnter={() => hover(i)} data-sel={i === selectedIdx ? "1" : undefined}
                        style={{ padding: "12px 6px", borderRadius: 14, border: `3px solid ${i === selectedIdx ? accent : "color-mix(in srgb, var(--k-strong) 14%, transparent)"}`, background: i === selectedIdx ? "var(--k-tint-amber)" : "color-mix(in srgb, var(--k-strong) 4%, transparent)", color: "var(--k-strong)", cursor: "pointer", fontFamily: FONT_DISPLAY, fontSize: "clamp(30px, 3.4vw, 50px)", fontWeight: 800, lineHeight: 1, ...liftSt(i === selectedIdx) }}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <div style={{ display: "flex", gap: 12, marginTop: 6, flexWrap: "wrap" }}>
                {options.map((o, i) => o.group !== undefined ? null : (
                  <button key={o.id} onClick={() => fire(o)} onMouseEnter={() => hover(i)} data-sel={i === selectedIdx ? "1" : undefined}
                    style={{ flex: 1, minWidth: 220, padding: "16px 20px", borderRadius: 14, border: `3px solid ${i === selectedIdx ? accent : o.on ? "var(--k-green)" : "color-mix(in srgb, var(--k-strong) 14%, transparent)"}`, background: o.on ? "var(--k-tint-green)" : i === selectedIdx ? "var(--k-tint-amber)" : "color-mix(in srgb, var(--k-strong) 4%, transparent)", color: "var(--k-strong)", cursor: "pointer", fontSize: "clamp(22px, 2.4vw, 30px)", fontWeight: 800, ...liftSt(i === selectedIdx) }}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
          <div style={{ width: "100%", maxWidth: 1200, padding: "0 24px", boxSizing: "border-box", maxHeight: "68%", overflowY: "auto", ...twoColumns(options.length) }}>
            {options.map((o, i) => {
              const sel = i === selectedIdx;
              return (
                <button key={o.id} onClick={() => fire(o)} onMouseEnter={() => hover(i)} data-sel={sel ? "1" : undefined}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderRadius: 14, border: `3px solid ${sel ? accent : "color-mix(in srgb, var(--k-strong) 14%, transparent)"}`, background: sel ? "var(--k-tint-amber)" : "color-mix(in srgb, var(--k-strong) 4%, transparent)", color: "var(--k-strong)", cursor: "pointer", textAlign: "left", ...liftSt(sel) }}>
                  <span style={{ fontFamily: o.id.startsWith("sz") ? FONT_DISPLAY : FONT_UI, fontSize: o.id.startsWith("sz") ? "clamp(34px, 3.6vw, 52px)" : 22, fontWeight: 800, lineHeight: 1 }}>{o.label}</span>
                  <span style={hintSt(sel, accent)} aria-hidden="true">←</span>
                </button>
              );
            })}
          </div>
          )}
        </>
      )}

      {/* ── CLEAN IT NOW / CUT IT NOW: dirt wiped off, a loose thread cut, at the station; the garment stays passed, the flag is on the record ── */}
      {isClean && (
        <>
          <div style={{ fontSize: 80, lineHeight: 1, marginBottom: 4 }}>{fixIn?.emoji}</div>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: "clamp(56px, 9vw, 120px)", fontWeight: 900, color: accent, textAlign: "center", padding: "0 24px", lineHeight: 0.95, marginTop: 4 }}>{fixIn?.title}</div>
          {match && (
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: "clamp(30px, 4.5vw, 52px)", fontWeight: 700, color: "var(--k-sky-ink-2)", marginTop: 14, textAlign: "center" }}>
              #{match.number}{match.name ? ` · ${match.name}` : ""}{match.size ? ` · ${shortSize(match.size)}` : ""}
            </div>
          )}
          <div style={{ fontSize: 26, color: "var(--k-sky-ink-3)", marginTop: 14, textAlign: "center", padding: "0 40px", maxWidth: 820, lineHeight: 1.4 }}>
            {fixIn?.text} It <strong>stays passed</strong>; the record keeps the flag.{/* fixed at the station is still a flag, resolved at once (the owner, 25 Nov 2026) */}
          </div>
          <div style={{ marginTop: 28, display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
            {options.map((o, i) => optionButton(o, i))}
          </div>
        </>
      )}

      {/* ── RED, flagged, with a damage photo: the photo fills the screen ── */}
      {compact && (
        <>
          <div style={{ flexShrink: 0, display: "flex", alignItems: "baseline", justifyContent: "center", flexWrap: "wrap", columnGap: "2cqw", rowGap: 4, padding: "0 20px", textAlign: "center" }}>
            <span style={{ fontFamily: FONT_DISPLAY, fontSize: "clamp(30px, 7cqh, 72px)", fontWeight: 900, color: accent, lineHeight: 1 }}>🛑 FLAGGED</span>
            {(match || detected) && (
              <span style={{ fontFamily: FONT_DISPLAY, fontSize: "clamp(24px, 5.5cqh, 56px)", fontWeight: 700, color: "var(--k-red-ink-2)", lineHeight: 1 }}>
                {match ? `#${match.number}${match.name ? ` · ${match.name}` : ""}${match.size ? ` · ${shortSize(match.size)}` : ""}` : `#${detected.number || "?"}${detected.name ? ` · ${detected.name}` : ""}`}
              </span>
            )}
            {state.reason && <span style={{ fontFamily: FONT_DISPLAY, fontSize: "clamp(24px, 5.5cqh, 56px)", fontWeight: 800, color: "var(--k-strong)", lineHeight: 1 }}>{state.reason}</span>}
          </div>
          <div style={{ flexShrink: 0, fontSize: "clamp(15px, 2.6cqh, 24px)", fontWeight: 700, color: "var(--k-red-ink-3)", marginTop: "0.8cqh", textAlign: "center", padding: "0 20px" }}>Stick a ticket on it and put it in the DAMAGED box.</div>
          <div style={{ flex: "1 1 0", minHeight: 0, width: "100%", display: "flex", justifyContent: "center", alignItems: "center", gap: 20, margin: "1cqh 0", padding: "0 20px", boxSizing: "border-box" }}>
            {state.spots?.length > 0 && <div style={{ flexShrink: 0, textAlign: "center" }}><GarmentMap kind={state.garment} spots={state.spots} fit={{ cqh: 26, cqw: 15 }} title={spotWords(state.garment, state.spots)} /><div style={{ fontSize: "clamp(14px, 2.2cqh, 20px)", color: "var(--k-amber-ink-3)", fontWeight: 700, marginTop: 4, maxWidth: "34cqw" }}>{spotWords(state.garment, state.spots)}</div></div>}
            {framing
              ? <LiveFrame stream={stream} rotation={rotation} maxWidth={state.spots?.length > 0 ? "58%" : "100%"} />
              : <img src={damagePhotos[damagePhotos.length - 1]} alt="" style={{ height: "100%", width: "auto", maxWidth: state.spots?.length > 0 ? "58%" : "100%", objectFit: "contain", borderRadius: 12, border: "3px solid var(--k-red-ink-2)", boxSizing: "border-box", background: "#000" }} />}
          </div>
          <div style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", flexWrap: "wrap", columnGap: 28, rowGap: 4, padding: "0 20px", fontSize: "clamp(15px, 2.4cqh, 21px)", color: "var(--k-red-ink-3)", fontWeight: 700 }}>
            <span>{framing
              ? `📷 Set the damage in the picture, then press Take photo${damagePhotos.length ? ` · ${damagePhotos.length} taken` : ""}`
              : `✓ ${damagePhotos.length > 1 ? `${damagePhotos.length} damage photos` : "Damage photo"} saved for the supervisor`}</span>
            {ticket && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 10, fontWeight: 400, color: ticket.status === "done" ? "var(--k-red-ink-3)" : ticket.status === "printing" ? "var(--k-red-ink-2)" : "var(--k-amber-ink)" }}>
                <span>{ticket.status === "printing" ? "🖨 Printing the flag ticket…" : ticket.status === "done" ? "🖨 2 flag tickets printed" : ticket.status === "none" ? "🖨 No label printer for this station — write the ticket by hand" : `🖨 Ticket not printed: ${ticket.message}`}</span>
                {ticket.status !== "printing" && <button onClick={() => reprintTicket?.(state.entryId)} title="Print this garment's flag ticket again" style={{ ...btnGhost, padding: "4px 10px", fontSize: 14, borderColor: "var(--k-red-ink-2)", color: "var(--k-red-ink-3)" }}>Reprint</button>}
              </span>
            )}
          </div>
          <div style={{ flexShrink: 0, marginTop: "1.2cqh", display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
            {options.map((o, i) => optionButton(o, i))}
          </div>
        </>
      )}

      {/* ── RED: not found / API error / duplicate / supervisor ── */}
      {isRed && !compact && (
        <>
          <div style={{ fontSize: 80, lineHeight: 1, marginBottom: 4 }}>{mode === "supervisor" ? "🛑" : mode === "duplicate" ? "⚠️" : "🚩"}</div>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: "clamp(56px, 9vw, 120px)", fontWeight: 900, color: accent, textAlign: "center", padding: "0 24px", lineHeight: 0.95, marginTop: 4 }}>
            {mode === "supervisor" ? "FLAGGED" : mode === "duplicate" ? (match?.scanned === "flag" ? "FLAGGED" : "ALREADY DONE") : state.title || "NOT FOUND"}
          </div>
          {(match || detected) && (
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: "clamp(30px, 4.5vw, 52px)", fontWeight: 700, color: "var(--k-red-ink-2)", marginTop: 14, textAlign: "center" }}>
              {match ? `#${match.number}${match.name ? ` · ${match.name}` : ""}${match.size ? ` · ${shortSize(match.size)}` : ""}` : `#${detected.number || "?"}${detected.name ? ` · ${detected.name}` : ""}`}
            </div>
          )}
          {state.reason && mode !== "supervisor" && (
            <div style={{ fontSize: 26, color: "var(--k-red-ink-2)", marginTop: 12, textAlign: "center", padding: "0 40px", maxWidth: 820, opacity: 0.95, lineHeight: 1.4 }}>
              {state.reason}
            </div>
          )}
          {mode === "supervisor" && (
            <>
              {(state.reason || state.spots?.length > 0) && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 24, flexWrap: "wrap", marginTop: 10, padding: "0 30px" }}>
                  {state.reason && <div style={{ fontFamily: FONT_DISPLAY, fontSize: "clamp(30px, 4.5vw, 52px)", fontWeight: 800, color: "var(--k-strong)", textAlign: "center" }}>{state.reason}</div>}
                  {/* Where it was marked: what the ticket prints (read only). */}
                  {state.spots?.length > 0 && <GarmentMap kind={state.garment} spots={state.spots} fit={{ cqh: 22, cqw: 20 }} title={spotWords(state.garment, state.spots)} />}
                </div>
              )}
              {state.spots?.length > 0 && <div style={{ fontSize: 20, fontWeight: 700, color: "var(--k-amber-ink-3)", marginTop: 6, textAlign: "center", padding: "0 30px" }}>{spotWords(state.garment, state.spots)}</div>}
              <div style={{ fontSize: 24, fontWeight: 700, color: "var(--k-red-ink-3)", marginTop: 10, textAlign: "center", padding: "0 40px", maxWidth: 820, lineHeight: 1.35 }}>Stick a ticket on it and put it in the DAMAGED box.</div>
            </>
          )}
          {mode === "supervisor" && damagePhotos.length > 0 && (
            <div style={{ marginTop: 10, textAlign: "center" }}>
              {/* Big enough to see whether the shot shows the damage (the owner, 17 Nov 2026: at 18vh it was too small to tell); the screen scrolls when it does not fit. */}
              <img src={damagePhotos[damagePhotos.length - 1]} alt="" style={{ height: "38cqh", maxWidth: "88cqw", aspectRatio: "4 / 3", objectFit: "cover", borderRadius: 12, border: "3px solid var(--k-red-ink-2)", display: "block", margin: "0 auto" }} />
              <div style={{ fontSize: 20, color: "var(--k-red-ink-3)", marginTop: 4, fontWeight: 700 }}>✓ {damagePhotos.length > 1 ? `${damagePhotos.length} damage photos` : "Damage photo"} saved for the supervisor</div>
            </div>
          )}
          {mode === "supervisor" && damagePhotos.length === 0 && canPhoto && (
            <div style={{ fontSize: 22, color: "var(--k-red-ink-3)", marginTop: 14, textAlign: "center", padding: "0 40px", maxWidth: 820, lineHeight: 1.35 }}>
              {state.photoFirst ? "Set the problem under the camera, then press Enter: the photo is taken at once, for the supervisor." : "The scan photo goes with it. If the problem is somewhere else — the front, a sleeve — take a photo of that."}
            </div>
          )}
          {mode === "supervisor" && ticket && (
            <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10, fontSize: 19, color: ticket.status === "done" ? "var(--k-red-ink-3)" : ticket.status === "printing" ? "var(--k-red-ink-2)" : "var(--k-amber-ink)" }}>
              <span>{ticket.status === "printing" ? "🖨 Printing the flag ticket…" : ticket.status === "done" ? "🖨 2 flag tickets printed" : ticket.status === "none" ? "🖨 No label printer for this station — write the ticket by hand" : `🖨 Ticket not printed: ${ticket.message}`}</span>
              {ticket.status !== "printing" && <button onClick={() => reprintTicket?.(state.entryId)} title="Print this garment's flag ticket again" style={{ ...btnGhost, padding: "4px 10px", fontSize: 14, borderColor: "var(--k-red-ink-2)", color: "var(--k-red-ink-3)" }}>Reprint</button>}
            </div>
          )}
          {mode === "flag" && state.title === "SCAN FAILED" && (
            <div style={{ fontSize: 21, color: "var(--k-orange-ink)", marginTop: 16, textAlign: "center" }}>Check the network.</div>
          )}
          <div style={{ marginTop: 28, display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
            {options.map((o, i) => optionButton(o, i))}
          </div>
        </>
      )}

      {/* ── A reason the list does not cover ── */}
      {mode === "reasonText" && (
        <ReasonTextForm match={match} onSubmit={actions.reasonSubmit} onBack={actions.back} />
      )}

      {/* ── MANUAL entry and its confirmation ── */}
      {mode === "manual" && (
        <ManualEntryForm detected={detected} initial={state.initial} teams={state.teams || []} onSubmit={actions.manualSubmit} onBack={actions.back} />
      )}
      {/* ── WHERE IS THE DAMAGE: tap it on the garment, front and back ── */}
      {isLocate && (
        <>
          <div style={{ flexShrink: 0, fontSize: "clamp(28px, 5.5cqh, 52px)", fontWeight: 900, color: accent, textAlign: "center", lineHeight: 1.05, padding: "0 24px" }}>Where is the damage?</div>
          <div style={{ flexShrink: 0, display: "flex", alignItems: "baseline", justifyContent: "center", flexWrap: "wrap", columnGap: 18, rowGap: 2, marginTop: 4, padding: "0 24px", textAlign: "center" }}>
            {(match || detected) && (
              <span style={{ fontFamily: FONT_DISPLAY, fontSize: "clamp(26px, 4.8cqh, 48px)", fontWeight: 800, color: "var(--k-strong)", lineHeight: 1 }}>
                {match ? `#${match.number}${match.name ? ` · ${match.name}` : ""}${match.size ? ` · ${match.size}` : ""}` : `#${detected.number || "?"}${detected.name ? ` · ${detected.name}` : ""}`}
              </span>
            )}
            {state.reason && <span style={{ fontFamily: FONT_DISPLAY, fontSize: "clamp(26px, 4.8cqh, 48px)", fontWeight: 800, color: "var(--k-red-ink-2)", lineHeight: 1 }}>{state.reason}</span>}
          </div>
          <div style={{ flexShrink: 0, fontSize: "clamp(17px, 2.4cqh, 24px)", color: "var(--k-violet-ink-2)", marginTop: 6, textAlign: "center", padding: "0 24px" }}>
            Tap where it is, up to {MAX_SPOTS} spots, front or back. Tap a spot to take it off.
          </div>
          <div style={{ flex: "1 1 auto", minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", margin: "1.2cqh 0", width: "100%" }}>
            <GarmentMap kind={state.garment} spots={state.spots || []} fit={{ cqh: 52, cqw: 44 }} stackFit={{ cqh: 22, cqw: 88 }}
              onTap={spot => actions.locateTap(spot)} onRemove={i => actions.locateRemove(i)} />
          </div>
          <div style={{ flexShrink: 0, minHeight: "1.3em", fontSize: "clamp(18px, 2.8cqh, 28px)", fontWeight: 800, color: (state.spots || []).length ? "var(--k-amber-ink-3)" : "var(--k-ink-3b)", textAlign: "center", padding: "0 24px" }}>
            {(state.spots || []).length ? spotWords(state.garment, state.spots) : "Nothing marked yet"}
          </div>
          <div style={{ flexShrink: 0, marginTop: "1.2cqh", display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
            {options.map((o, i) => optionButton(o, i))}
          </div>
        </>
      )}

      {/* ── REASONS menu ── */}
      {isMenu && (
        <>
          <div style={{ fontSize: 56, lineHeight: 1, marginBottom: 4 }}>✎</div>
          <div style={{ fontSize: "clamp(28px, 4.5vw, 44px)", fontWeight: 900, color: accent, marginBottom: 6, textAlign: "center" }}>What's wrong with it?</div>
          {match && <div style={{ fontSize: 22, color: "var(--k-violet-ink-2)", marginBottom: 16 }}>#{match.number}{match.name ? <> · <span style={{ fontFamily: FONT_READ }}>{match.name}</span></> : ""}{match.size ? ` · ${shortSize(match.size)}` : ""}</div>}
          <div style={{ width: "100%", maxWidth: 1200, padding: "0 24px", boxSizing: "border-box", maxHeight: "68%", overflowY: "auto", ...twoColumns(options.length) }}>
            {options.map((o, i) => {
              const sel = i === selectedIdx;
              return (
                <div key={o.id} onClick={() => fire(o)} onMouseEnter={() => hover(i)} data-sel={sel ? "1" : undefined}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 18px", borderRadius: 12, minWidth: 0, border: `3px solid ${sel ? accent : "color-mix(in srgb, var(--k-strong) 12%, transparent)"}`, background: sel ? "var(--k-tint-violet)" : "color-mix(in srgb, var(--k-strong) 4%, transparent)", cursor: "pointer", ...liftSt(sel) }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 24, fontWeight: 700, color: "var(--k-strong)" }}>{o.label}</div>
                  </div>
                  <span style={hintSt(sel, accent)} aria-hidden="true">←</span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Progress bar on the green flash */}
      {mode === "done" && (
        <div style={{ position: "absolute", bottom: 0, left: 0, height: 6, width: "100%", background: "var(--k-bg-green)" }}>
          <div ref={el => { if (el) { el.style.transition = "width 0.7s linear"; requestAnimationFrame(() => { el.style.width = "0%"; }); } }}
            style={{ height: "100%", background: "var(--k-green)", width: "100%" }} />
        </div>
      )}

      {state.scan?.thumb && mode !== "done" && !isMenu && !isLocate && !compact && !isList && !isSizePick && (   /* not on the pick list: the room goes to the list (owner, 19 Nov 2026) */   // not on the compact flagged screen: it sat under the buttons on a narrow window
        <div title="What the camera read" style={{ position: "absolute", ...(isGreen ? { top: 12 } : { bottom: 12 }), left: 12, opacity: isGreen ? 0.5 : 0.6 }}>
          <img src={state.scan.thumb} alt="" style={{ width: isGreen ? 80 : 120, height: isGreen ? 60 : 90, objectFit: "cover", borderRadius: 8 }} />
        </div>
      )}
      {!embedded && mode !== "manual" && mode !== "reasonText" && !compact && <LivePreview stream={stream} rotation={rotation} />}
    </div>
  );
}

// ── Result card (flag resolution) ─────────────────────────────────────────────
// `canResolve`: Accept / Reject / Note are the supervisor's call; the operator sees the flag without them.
function ResultCard({ result, onResolve, canResolve = true }) {
  const [note, setNote] = useState("");
  const isManual  = result.status === S_MANUAL && !result.resolution && !result.outcome;    // entered by hand, awaiting sign-off (an order saved before 20 Nov 2026)
  const isFlagged = (result.status === S_FLAGGED && !result.outcome) || isManual;           // accepted or rejected: resolved, still a flag in the reports (M6)
  return (
    <div style={{ ...card, border: `1px solid ${statusColor(result.status)}`, background: isFlagged ? "var(--k-tint-red-faint)" : "color-mix(in srgb, var(--k-ink-5) 8%, transparent)", padding: "6px 10px" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        {result.thumb && <img src={result.thumb} alt="" style={{ width: 44, height: 33, objectFit: "cover", borderRadius: 4, flexShrink: 0 }} />}
        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: statusColor(result.status), whiteSpace: "nowrap" }}>
            {isManual ? "✍ By hand" : isFlagged ? "🚩 Flagged" : "🔧 Resolved"}
          </span>
          <span style={{ fontFamily: FONT_DISPLAY, fontSize: 22, fontWeight: 800, lineHeight: 1 }}>
            {result.match ? `#${result.match.number}${result.match.name ? " · " + result.match.name : ""}` : `#${result.detected?.number || "?"}${result.detected?.name ? " · " + result.detected.name : ""}`}
          </span>
          {result.reason     && <span style={{ fontSize: 13, color: "var(--k-red-ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{result.reason}</span>}
          {result.spots?.length > 0 && <span style={{ fontSize: 13, color: "var(--k-amber-ink-3)" }}>{spotWords(result.garment, result.spots)}</span>}
          {result.resolution && <span style={{ fontSize: 13, color: "var(--k-ink-2)" }}>{result.resolution}</span>}
        </div>
        {result.spots?.length > 0 && <GarmentMap kind={result.garment} spots={result.spots} height={40} captions={false} title={spotWords(result.garment, result.spots)} />}
      </div>
      {isFlagged && canResolve && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--k-rule)" }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button onClick={() => onResolve(result.id, "accept", note)} style={{ ...btnSm, background: "var(--k-tint-green)",  color: "var(--k-green)", border: "1px solid var(--k-green)" }}>✓ Accept — counts as passed</button>
            <button onClick={() => onResolve(result.id, "reject", note)} style={{ ...btnSm, background: "var(--k-tint-red)",  color: "var(--k-red)", border: "1px solid var(--k-red)" }}>✗ Reject — sent for rework</button>
            <button onClick={() => onResolve(result.id, "note",   note)} style={{ ...btnSm, background: "var(--k-tint-violet)", color: "var(--k-indigo)", border: "1px solid var(--k-indigo)" }}>📝 Note only</button>
          </div>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="Optional note…"
            style={{ marginTop: 8, width: "100%", boxSizing: "border-box", padding: "8px 12px", borderRadius: 6, border: "1px solid var(--k-rule-3)", background: "var(--k-field)", color: "var(--k-ink-1)", fontSize: 15 }} />
        </div>
      )}
    </div>
  );
}

// ── Settings panel ────────────────────────────────────────────────────────────
function SettingsPanel({ settings, cameras, onSave, onClose }) {
  const [temp,      setTemp]      = useState(settings);
  const [listening, setListening] = useState(null);

  useEffect(() => {
    if (!listening) return;
    const h = e => { e.preventDefault(); setTemp(t => ({ ...t, [listening]: e.code })); setListening(null); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [listening]);

  useEffect(() => {
    const h = e => { if (e.key === "Escape" && !listening) onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, listening]);

  const keyRows = [
    { label: "Scan",       key: "scanKey" },
    { label: "Select",     key: "confirmKey" },
    { label: "Down",       key: "cancelKey" },
    { label: "Up",         key: "upKey" },
    { label: "Retry scan", key: "retryKey" },
    { label: "Enter by hand", key: "byHandKey" },
  ];
  const reserved = ["Escape", "Tab"];
  const problems = [];
  const onScreen = ["confirmKey", "cancelKey", "upKey", "retryKey", "byHandKey"];   // these act on the same screen, so they must differ
  const labelOf  = k => keyRows.find(r => r.key === k).label;
  onScreen.forEach((a, i) => onScreen.slice(i + 1).forEach(b => { if (temp[a] === temp[b]) problems.push(`${labelOf(a)} and ${labelOf(b)} cannot be the same key.`); }));
  keyRows.forEach(r => { if (reserved.includes(temp[r.key])) problems.push(`${r.label} cannot be ${temp[r.key]}.`); });

  const selSt = { ...inputSt, padding: "8px 12px", fontSize: 16 };

  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--k-scrim-lite)", zIndex: 2200, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "var(--k-card)", borderRadius: 12, border: "1px solid var(--k-rule)", padding: 28, width: 540, maxWidth: "92vw", maxHeight: "92%", overflowY: "auto", boxSizing: "border-box" }}>
        <div style={{ fontWeight: 700, fontSize: 22, marginBottom: 16 }}>⚙ Settings</div>

        <div style={{ marginBottom: 18 }}>
          <div style={labelSt}>Keyboard shortcuts</div>
          {keyRows.map(r => (
            <div key={r.key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <div style={{ fontSize: 16, color: "var(--k-ink-2)", width: 150, flexShrink: 0 }}>{r.label}</div>
              <div style={{ flex: 1, padding: "6px 10px", borderRadius: 8, border: `1px solid ${listening === r.key ? "var(--k-blue)" : "var(--k-rule-2)"}`, background: "var(--k-field)", color: "var(--k-ink-1)", fontSize: 17, fontWeight: 700, textAlign: "center" }}>
                {listening === r.key ? "Press any key…" : formatKey(temp[r.key])}
              </div>
              <button onClick={() => setListening(r.key)} style={{ ...btnGhost, whiteSpace: "nowrap", padding: "4px 10px" }}>Change</button>
            </div>
          ))}
          <div style={{ fontSize: 14, color: "var(--k-ink-3b)" }}>Select picks the highlighted option; Down and Up (or ↓ ↑) move it; Retry scan re-shoots from any screen with nothing recorded. Scan only works when no screen is open, so it may share a key with Select.</div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <div style={labelSt}>Camera</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <div style={{ fontSize: 16, color: "var(--k-ink-2)", width: 150, flexShrink: 0 }}>Mount rotation</div>
            <select value={temp.rotation} onChange={e => setTemp(t => ({ ...t, rotation: Number(e.target.value) }))} style={selSt}>
              {[0, 90, 180, 270].map(d => <option key={d} value={d}>{d}° {d === 180 ? "(upside-down mount)" : d === 0 ? "(upright)" : ""}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <div style={{ fontSize: 16, color: "var(--k-ink-2)", width: 150, flexShrink: 0 }}>Camera</div>
            <select value={temp.cameraId} onChange={e => setTemp(t => ({ ...t, cameraId: e.target.value }))} style={selSt}>
              <option value="">Browser default</option>
              {cameras.map(c => <option key={c.deviceId} value={c.deviceId}>{c.label || `Camera ${c.deviceId.slice(0, 6)}`}</option>)}
              {temp.cameraId && !cameras.some(c => c.deviceId === temp.cameraId) && <option value={temp.cameraId}>Saved camera (not on this PC)</option>}
            </select>
          </div>
          {cameras.length === 0 && <div style={{ fontSize: 14, color: "var(--k-ink-3b)" }}>Start the camera once to list the cameras on this machine.</div>}
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 16, color: "var(--k-ink-2)", cursor: "pointer" }}>
            <input type="checkbox" checked={!!temp.autoScan} onChange={e => setTemp(t => ({ ...t, autoScan: e.target.checked }))} />
            Hands-free: after a confirm, scan the next garment when it is placed and still
          </label>
          {temp.autoScan && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 16, color: "var(--k-ink-2)" }}>
              <div style={{ width: 150, flexShrink: 0 }}>Wait after a confirm</div>
              <input type="number" min={0} max={30} step={0.5} value={temp.autoScanDelay ?? 3} onChange={e => setTemp(t => ({ ...t, autoScanDelay: Math.max(0, Math.min(30, Number(e.target.value) || 0)) }))} style={{ ...selSt, width: 90 }} />
              <span>seconds</span>
            </div>
          )}
        </div>

        <div style={{ marginBottom: 18 }}>
          <div style={labelSt}>Pick list</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <div style={{ fontSize: 16, color: "var(--k-ink-2)", width: 150, flexShrink: 0 }}>Sort the list by</div>
            <select value={temp.listSort || "size"} onChange={e => setTemp(t => ({ ...t, listSort: e.target.value }))} style={selSt}>
              {LIST_SORTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <div style={{ fontSize: 14, color: "var(--k-ink-3b)" }}>The yellow "Which garment is this?" list. By size, the operator finds the row of the size tag at once; by team or number for an order that is sorted another way.</div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <div style={labelSt}>Screen</div>
          <div role="radiogroup" aria-label="Light or dark" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {THEMES.map(t => (
              <button key={t.id} role="radio" aria-checked={(temp.theme || "light") === t.id} onClick={() => setTemp(x => ({ ...x, theme: t.id }))}
                style={{ ...btnGhost, padding: "8px 14px", ...((temp.theme || "light") === t.id ? { background: "var(--k-blue)", borderColor: "var(--k-blue)", color: "var(--k-on-blue)" } : {}) }}>{t.label}</button>
            ))}
          </div>
          <div style={{ fontSize: 14, color: "var(--k-ink-3b)", marginTop: 6 }}>Light is easier to read under bright lights. Every screen follows it; the camera picture and the photo viewer stay dark.</div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <div style={labelSt}>Label printer</div>
          {[
            { on: "stickers", roll: "stickerRoll", text: "Print a sticker for every passed garment (its box, and the team or size)" },
            { on: "flagTickets", roll: "flagRoll", text: "Print a flag ticket for every flagged garment (where it goes and why)" },
            { on: "binLists", roll: "boxRoll", text: "Print what is in a box when it is closed (full, or the order finished): a count label and the garments in it (on 2 × 1 in, fourteen a label; twenty-one when no garment on the list has a name). Box labels print on this roll too" },
          ].map(o => (
            <div key={o.on} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 16, color: "var(--k-ink-2)", cursor: "pointer", flex: 1, minWidth: 0 }}>
                <input type="checkbox" checked={temp[o.on] !== false} onChange={e => setTemp(t => ({ ...t, [o.on]: e.target.checked }))} />
                {o.text}
              </label>
              <select aria-label="Roll" title="The label roll this prints on" value={temp[o.roll] || DEFAULT_SETTINGS[o.roll]} onChange={e => { setTemp(t => ({ ...t, [o.roll]: e.target.value })); e.target.blur(); }} style={{ ...selSt, width: "auto", flexShrink: 0 }}>
                {LABEL_ROLLS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </div>
          ))}
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 16, color: "var(--k-ink-2)", cursor: "pointer", marginBottom: 8 }}>
            <input type="checkbox" checked={temp.boxAutoPrint === true} onChange={e => setTemp(t => ({ ...t, boxAutoPrint: e.target.checked }))} />
            Print the box labels by themselves when an order starts (off: the set-out screen's button prints them) — on the box roll above
          </label>
          <div style={{ fontSize: 14, color: "var(--k-ink-3b)" }}>The roll in the printer: the label is laid out for it. A 1 × ½ in label goes to this station's sticker printer, the others to its ticket printer.</div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <div style={labelSt}>Packing</div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 16, color: "var(--k-ink-2)", cursor: "pointer", marginBottom: 8 }}>
            <input type="checkbox" checked={!!temp.boxWeights} onChange={e => setTemp(t => ({ ...t, boxWeights: e.target.checked }))} />
            Estimate each box's weight and warn near the limit (a guess from the sizes, until a scale is connected)
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 16, color: "var(--k-ink-2)", opacity: temp.boxWeights ? 1 : 0.45 }}>
            No box heavier than
            <input type="number" min={10} max={70} value={temp.boxWeightCap ?? 45} onChange={e => setTemp(t => ({ ...t, boxWeightCap: e.target.value }))} onBlur={e => setTemp(t => ({ ...t, boxWeightCap: Math.max(10, Math.min(70, Number(e.target.value) || 45)) }))} style={{ ...selSt, width: 76 }} />
            lb
          </label>
          <div style={{ fontSize: 14, color: "var(--k-ink-3b)", marginTop: 6 }}>How many garments fill a box is learnt: every Box full asks what size the box was, and all stations learn from the answers.</div>
        </div>

        {problems.length > 0 && (
          <div style={{ fontSize: 15, color: "var(--k-red-ink)", marginBottom: 12, padding: "10px 14px", background: "var(--k-tint-red-faint)", borderRadius: 6 }}>
            {problems.map(p => <div key={p}>{p}</div>)}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, position: "sticky", bottom: -28, margin: "0 -28px -28px", padding: "14px 28px 28px", background: "var(--k-card)", borderTop: "1px solid var(--k-rule)" }}>{/* Save and Cancel stay in view while the panel scrolls */}
          <button disabled={problems.length > 0} onClick={() => { const t = { ...temp, boxWeightCap: Math.max(10, Math.min(70, Number(temp.boxWeightCap) || 45)) }; onSave(t); onClose(t); }} style={{ ...btnPri, flex: 1, opacity: problems.length ? 0.5 : 1 }}>Save</button>
          <button onClick={onClose} style={btnGhost}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Bin setup modal ───────────────────────────────────────────────────────────
// The "Set out N boxes" screen: each team or size with how many boxes it is
// expected to fill (the box model). Opens when an order starts. The box labels
// print from its button (the owner, 25 Nov 2026); with `autoPrint` (a new order
// on a station whose Settings → Label printer switch is on, `boxAutoPrint`) they
// print as the screen opens, as they all did from 12 Nov 2026, and the button
// prints them again. Opened later from the Boxes dialog it only prints on the button.
function BinSetupModal({ entries, by = "team", labels = [], autoPrint = false, onPrinted, onConfirm, onBack = null }) {   // onBack: opened from Packing, it goes back there
  useEffect(() => {
    if (!onBack) return;
    const h = e => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onBack(); } };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, [onBack]);
  const [print, setPrint] = useState({ status: autoPrint && labels.length ? "printing" : "idle" });
  const fired = useRef(false);
  const send = useCallback(() => hub.printLabels(labels, { kind: "binticket", station: stationId() })   // the 2 x 1 in roll, like the label of a bin opened when another was full
    .then(r => { setPrint({ status: "done", printer: r.printer, count: r.count }); onPrinted?.(); })
    .catch(e => setPrint(e.status === 503 ? { status: "none" } : { status: "error", message: e.status ? e.message : "could not reach the server" })), [labels, onPrinted]);
  const doPrint = () => { if (labels.length) { setPrint({ status: "printing" }); send(); } };
  useEffect(() => { if (autoPrint && labels.length && !fired.current) { fired.current = true; send(); } }, [autoPrint, labels.length, send]);   // the state already says "printing"
  const printLine = {
    idle:     "",
    printing: "🖨 Printing the box labels…",
    done:     `🖨 Printed ${print.count} ${print.count === 1 ? "label" : "labels"} on ${print.printer}`,
    none:     "No label printer on the server — write the box numbers by hand",
    error:    `Could not print the labels: ${print.message}`,
  }[print.status];
  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--k-scrim)", zIndex: 1500, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {/* Fits any screen height: the title, words and buttons always show, only the list of boxes scrolls (it ran off a screen with the taskbar showing, 20 Nov 2026). */}
      <div style={{ background: "var(--k-card)", borderRadius: 16, border: "2px solid var(--k-blue)", padding: "28px 44px", maxWidth: 680, width: "90vw", maxHeight: "96%", display: "flex", flexDirection: "column", textAlign: "center", boxSizing: "border-box" }}>
        <div style={{ fontSize: 48, marginBottom: 4, flexShrink: 0 }}>🗂️</div>
        <div style={{ ...titleBig, fontSize: 40, marginBottom: 8 }}>Set out {labels.length || entries.length} {(labels.length || entries.length) === 1 ? "box" : "boxes"}</div>
        <div style={{ fontSize: 19, color: "var(--k-ink-2)", marginBottom: 26 }}>
          {by === "all"
            ? <>This order is <strong style={{ color: "var(--k-ink-1)" }}>not sorted</strong>: one run of boxes. </>
            : <>This order is sorted <strong style={{ color: "var(--k-ink-1)" }}>by {by}</strong>: {entries.length} {by === "size" ? (entries.length === 1 ? "size" : "sizes") : (entries.length === 1 ? "team" : "teams")}. </>}
          {autoPrint ? "The labels are printing: stick one inside each box before scanning." : "Print the box labels when the boxes are set out, and stick one inside each box before scanning."} How many boxes is an estimate; a box that fills sooner gets its next label at Box full.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 22, flex: "1 1 auto", minHeight: 120, overflowY: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18, padding: "12px 22px", borderRadius: 12, background: "var(--k-tint-red)", border: "1px solid var(--k-red)", order: 99 }}>
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 34, fontWeight: 900, color: "var(--k-red-ink)", minWidth: 150, flexShrink: 0, textAlign: "center", lineHeight: 1, whiteSpace: "nowrap" }}>DAMAGED</div>
            <div style={{ textAlign: "left", fontSize: 17, color: "var(--k-red-ink-3)" }}>One more box, off to the side, for flagged garments. It is the same box all day: print its label from the Print menu when you need one.</div>
          </div>
          {entries.map(({ label, bin, total = 0, boxes = 1, carried = 0, from = "" }) => (
            <div key={bin} style={{ display: "flex", alignItems: "center", gap: 18, padding: "14px 22px", borderRadius: 12, background: "var(--k-field)", border: "1px solid var(--k-rule-3)" }}>
              <div style={{ fontFamily: FONT_DISPLAY, fontSize: 44, fontWeight: 900, color: "var(--k-blue-ink)", minWidth: 150, textAlign: "center", lineHeight: 1, whiteSpace: "nowrap" }}>Box {bin}</div>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontSize: 26, fontWeight: 700, color: "var(--k-ink-1)" }}>{label}</div>
                <div style={{ fontSize: 16, color: "var(--k-ink-3)" }}>{total} {total === 1 ? "garment" : "garments"} to go · {boxes === 1 ? "1 box" : `${boxes} boxes: ${bin} to ${boxParts(bin)[0]}.${boxParts(bin)[1] + boxes - 1}`}</div>
                {carried > 0 && <div style={{ fontSize: 16, fontWeight: 800, color: "var(--k-sky-ink)" }}>📦 Already open: {carried} from order {from} in it. Use that box, no new label.</div>}
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
          <button onClick={onBack || onConfirm} style={{ padding: "16px 40px", borderRadius: 10, border: "none", background: "var(--k-blue)", color: "var(--k-on-blue)", fontWeight: 700, fontSize: 21, cursor: "pointer" }}>
            {onBack ? <>← Back to Packing <Kbd>Esc</Kbd></> : "Boxes ready — start scanning"}
          </button>
          {labels.length > 0 && (
            <button onClick={doPrint} disabled={print.status === "printing"} title="Print one label per box on the server's label printer"
              style={{ padding: "16px 28px", borderRadius: 10, border: "1px solid var(--k-ink-5)", background: "var(--k-field)", color: "var(--k-ink-1)", fontWeight: 700, fontSize: 19, cursor: print.status === "printing" ? "wait" : "pointer", opacity: print.status === "printing" ? 0.6 : 1 }}>
              🖨 {autoPrint || print.status === "done" ? "Print them again" : "Print box labels"}
            </button>
          )}
        </div>
        {printLine && (
          <div style={{ marginTop: 16, fontSize: 17, fontWeight: 600, color: print.status === "done" ? "var(--k-green-ink)" : print.status === "printing" ? "var(--k-ink-3)" : "var(--k-amber-ink)" }}>{printLine}</div>
        )}
      </div>
    </div>
  );
}

// ── Replay an order (development and testing only; the owner, 20 Nov 2026) ───────
// Type a floor order's number; every run of it the floor's data file has (a
// station, a start) is listed; tapping one starts that order here with its
// roster and loads its reads into the replay bar. Nothing is printed while a
// replay is loaded.
function ReplayFinder({ onPick, onClose, stationLabel }) {
  const [q, setQ] = useState("");
  const [state, setState] = useState({ busy: false, runs: null, error: "", sources: [] });
  const ref = useRef(null);
  useEffect(() => {
    const h = e => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, [onClose]);
  const find = () => {
    if (!q.trim()) return;
    setState(s => ({ ...s, busy: true, error: "" }));
    hub.replayRuns(q.trim()).then(r => setState({ busy: false, runs: r.runs || [], sources: r.sources || [], error: "" }))
      .catch(e => setState({ busy: false, runs: null, sources: [], error: e.status === 404 ? "This server has no replay (only the development and testing servers do)." : "Could not ask the server: " + e.message }));
  };
  const missing = state.sources.filter(s => s.label === "floor" && !s.found);
  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--k-scrim)", zIndex: 2300, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "var(--k-card)", borderRadius: 16, border: "2px dashed var(--k-purple-2)", padding: 30, maxWidth: 900, width: "94vw", maxHeight: "94%", overflowY: "auto", boxSizing: "border-box" }}>
        <div style={STICKY_HEAD}>
          <div style={{ ...titleSt, fontSize: 32, flex: 1 }}>▶ Replay an order</div>
          <button onClick={onClose} style={{ ...btnGhost, fontSize: 15 }}>Close <Kbd light>Esc</Kbd></button>
        </div>
        <div style={{ fontSize: 16, color: "var(--k-ink-2)", margin: "10px 0 12px", lineHeight: 1.45 }}>
          Runs a floor order again through these screens, from what the camera read then. No pictures, and <strong>nothing is printed</strong> while the replay is on (✕ on the replay bar ends it).
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <input ref={ref} autoFocus value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { e.stopPropagation(); if (e.key === "Enter") find(); }} placeholder="Order number" style={{ ...inputSt, flex: 1 }} />
          <button onClick={find} disabled={!q.trim() || state.busy} style={{ ...btnPri, padding: "10px 22px", fontSize: 18 }}>{state.busy ? "Looking…" : "Find"}</button>
        </div>
        <ScreenKeys layout="digits" onKey={k => setQ(v => typeKey(v, k))} onEnter={find} enterLabel="Find" />
        {state.error && <div style={{ ...errSt, marginTop: 12 }}>{state.error}</div>}
        {missing.length > 0 && <div style={{ marginTop: 10, color: "var(--k-amber-ink)", fontSize: 15 }}>The floor's data file was not found ({missing.map(m => m.file).join(", ")}): only this server's own orders are searched.</div>}
        {state.runs && state.runs.length === 0 && <div style={{ marginTop: 14, color: "var(--k-ink-2)", fontSize: 18 }}>No order {q.trim()} in the data. The floor keeps 90 days.</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
          {(state.runs || []).map(r => (
            <button key={`${r.source}|${r.station}|${r.run}`} onClick={() => onPick(r)} disabled={!r.rows.length}
              style={{ ...btnGhost, textAlign: "left", padding: "10px 14px", borderColor: "var(--k-purple-deep)", opacity: r.rows.length ? 1 : 0.5 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: "var(--k-strong)" }}>Order {r.order} <span style={{ fontWeight: 400, color: "var(--k-ink-3)" }}>· {r.total} garments · {r.done} done then · {r.events.length} scans</span></div>
              <div style={{ fontSize: 15, color: "var(--k-ink-3)" }}>{stationLabel(r.station)}{r.operator ? ` · ${r.operator}` : ""} · {new Date(r.firstSeen || r.lastSeen || 0).toLocaleString()} · from {r.source}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Still out, on a picked-up order (the owner, 20 Nov 2026: the loop was open) ──
// What the order is still waiting for, in plain words: jerseys back from repair,
// missing ones, extra ones with the supervisor, and how many are not scanned yet.
// A jersey that comes back is scanned (it goes green, saying so) or passed here.
function StillOutModal({ orderNumber, groups, rowOf, binOf, onPass, onClose }) {
  const [sure, setSure] = useState(null);   // the row whose Pass it was tapped once
  useEffect(() => {
    const h = e => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, [onClose]);
  const boxOf = j => { const r = rowOf(j.rowId); return r && binOf ? binOf(r) : null; };
  const row = (j, colour, passLabel) => (
    <div key={j.rowId ?? "x" + j.xid} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 10, background: "var(--k-page)", border: `1px solid color-mix(in srgb, ${colour} 33%, transparent)` }}>
      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 30, fontWeight: 900, minWidth: 64 }}>#{j.number || "?"}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 18, fontWeight: 800 }}><span style={{ fontFamily: FONT_READ }}>{j.name || "—"}</span> <span style={{ color: "var(--k-amber-ink)" }}>{shortSize(j.size)}</span> <span style={{ color: "var(--k-ink-3)", fontWeight: 400 }}>{j.team}</span></div>
        <div style={{ fontSize: 15, color: "var(--k-ink-2)" }}>{j.status === "flag" ? `Was flagged: ${j.reason || "—"}` : j.status === "extra" ? j.reason : "Marked missing"}{boxOf(j) ? <span style={{ color: "var(--k-blue-ink)", fontWeight: 800 }}> · goes in Box {boxOf(j)}</span> : null}</div>
      </div>
      {passLabel && (sure === j.rowId
        ? <span style={{ display: "flex", gap: 6 }}>
            <button onClick={() => onPass(j.rowId)} style={{ ...btnPri, padding: "10px 16px", fontSize: 16, background: "var(--k-green)", color: "var(--k-page)" }}>✓ Yes, pass #{j.number}</button>
            <button onClick={() => setSure(null)} style={{ ...btnGhost, fontSize: 15 }}>No</button>
          </span>
        : <button onClick={() => setSure(j.rowId)} style={{ ...btnGhost, padding: "10px 16px", fontSize: 16, fontWeight: 800, borderColor: "var(--k-green)", color: "var(--k-green-ink-2)" }}>{passLabel}</button>)}
    </div>
  );
  const section = (title, list, colour, passLabel, note) => (list.length ? (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 18, fontWeight: 900, color: colour, marginBottom: 6 }}>{title} · {list.length}</div>
      {note && <div style={{ fontSize: 15, color: "var(--k-ink-3)", marginBottom: 6 }}>{note}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{list.map(j => row(j, colour, passLabel))}</div>
    </div>
  ) : null);
  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--k-scrim)", zIndex: 1600, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "var(--k-card)", borderRadius: 16, border: "2px solid var(--k-sky)", padding: 28, maxWidth: 900, width: "94vw", maxHeight: "94%", overflowY: "auto", boxSizing: "border-box" }}>
        <div style={STICKY_HEAD}>
          <div style={{ ...titleSt, fontSize: 32, flex: 1 }}>🔧 Still out on order {orderNumber}</div>
          <button onClick={onClose} style={{ ...btnGhost, fontSize: 15 }}>Close <Kbd light>Esc</Kbd></button>
        </div>
        <div style={{ fontSize: 17, color: "var(--k-ink-2)", marginTop: 10, lineHeight: 1.45 }}>
          When a garment comes back, <strong>scan it</strong>: it goes green and into its box. If the camera cannot read it, tap <strong>Pass it</strong> here.
        </div>
        {section("Back from repair", groups.flag, "var(--k-red-ink)", "✓ It's back — pass it")}
        {section("Missing", groups.missing, "var(--k-amber-ink)", "✓ Found — pass it")}
        {section("Extra, not on this order", groups.extra, "var(--k-pink-ink)", null, "With the supervisor: they decide on the board.")}
        {groups.todo.length > 0 && <div style={{ marginTop: 16, fontSize: 17, color: "var(--k-ink-2)" }}><strong>Unscanned · {groups.todo.length}</strong> — scan them as usual.</div>}
        <div style={{ marginTop: 18, fontSize: 15, color: "var(--k-ink-3)", lineHeight: 1.45 }}>A garment that will not come back: the supervisor marks it <strong>Ship short</strong> on the board (Unfinished orders). When nothing is out, finish the order.</div>
      </div>
    </div>
  );
}

// ── Ship-with: the boxes an earlier order left open for this one ─────────────
// (the owner, 20 Nov 2026: orders that ship together share boxes; a half-full box
// waits for the ship-with order of the same team or customer.) At the start of an
// order: every box the hub keeps open for this order or one it ships with, of the
// same sort (team, size or the whole order) and a team or size this order has, is
// taken (one station each) and becomes this order's open box for that team or size.
async function takeOpenBoxes({ order, shipWith = [], rows = [], binBy = "team", station = "" }) {
  const want = [order, ...shipWith].map(String).filter(Boolean);
  if (!want.length) return [];
  let boxes = [];
  try { boxes = (await hub.openBoxes(want)).boxes || []; } catch { return []; }
  const field = binBy === "size" ? "size" : binBy === "team" ? "team" : "all";
  const keys = new Set(field === "all" ? [ALL_KEY] : rows.map(r => teamKey(r[field]) || BLANK_KEY));
  const out = [], used = new Set();
  for (const b of boxes) {
    const by = b.by === "size" ? "size" : b.by === "team" ? "team" : "all";
    if (by !== field || !keys.has(b.key) || used.has(b.key)) continue;
    try { const r = await hub.takeOpenBox(b.id, { station, order }); out.push(r.box); used.add(b.key); } catch { /* another station took it first */ }
  }
  return out;
}

// Who a flag from a list is about (No size tag, Duplicate, Not on the roster): the
// number the operator typed when a number was typed, else the camera's read.
function flaggedAs(o) {
  const d = o?.scan?.detected || {}, t = o?.typed;
  return { number: String((t ? t.number : d.number) || "").trim(), name: String((t ? t.name : d.name) || "").trim(), team: String(t?.team || "").trim() };
}

// ── Packing: the one screen from the last jersey to Finish order ────────────
// The owner, 25 Nov 2026: seven end-of-order screens were too many. One place
// with the summary and the boxes together, a "Now" strip that says what to do
// next, and a button that prints a box's list WITHOUT closing the box. Rows:
// every box, open then closed, then the DAMAGED box; under them the summary
// (folded), Excel and Print summary. Enter does nothing here (the pedal is Enter).
//   Print list   prints the list of what is in the open box now (asks what box it is in first,
//                and teaches the box model like Box full); nothing closes and no next label prints.
//   Box full     today's flow: the size question, closes the box, prints its list, opens X.2.
const BOX_CHOICES = BOXES;   // a box on the floor is one box: small, medium or large
// A plain function, not memo: `open` and `short` are rebuilt on every roster change, and an
// order has a handful of open boxes (review, 25 Nov 2026).
function PackingRow({ b, sh, cap, asking, unfolded, onAsk, onUnfold, onFull, onList }) {
  const toScan = sh?.toScan || 0, shortN = sh?.short?.length || 0, st = b.listState;
  const choices = (title, pick, cancel) => (
    <div style={{ flexBasis: "100%" }}>
      <div style={{ fontSize: 19, fontWeight: 800, color: "var(--k-amber-ink-2)", marginBottom: 8 }}>{title}</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {BOX_CHOICES.map(c => (
          <button key={c.id} onClick={() => { onAsk(null, null); pick(c.id); }}
            style={{ ...(c.id === b.boxId ? btnPri : btnGhost), fontSize: 18, padding: "12px 20px", ...(c.id === b.boxId ? { background: "var(--k-amber)", color: "var(--k-page)" } : {}) }}>
            {c.label}{c.id === b.boxId ? " · suggested" : ""}
          </button>
        ))}
        {asking === "list" && <button onClick={() => { onAsk(null, null); onList(b.bin, null); }} style={{ ...btnGhost, fontSize: 17, padding: "12px 18px" }}>Just print</button>}
        <button onClick={() => onAsk(null, null)} style={{ ...btnGhost, fontSize: 16, padding: "12px 16px", color: "var(--k-ink-3)" }}>{cancel}</button>
      </div>
    </div>
  );
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", padding: "12px 18px", borderRadius: 12, background: "var(--k-field)", border: `1px solid ${b.heavy >= 0.95 ? "var(--k-red)" : "var(--k-rule-3)"}` }}>
      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 44, fontWeight: 900, color: "var(--k-blue-ink)", minWidth: 120, lineHeight: 1 }}>Box {b.bin}</div>
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: "var(--k-ink-1)", overflowWrap: "anywhere" }}>{b.label}</div>
        <div style={{ fontSize: 18, color: "var(--k-ink-2)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span><strong style={{ color: "var(--k-green-ink)" }}>{b.count}</strong> scanned · <strong style={{ color: toScan > 0 ? "var(--k-amber-ink)" : "var(--k-green-ink)" }}>{toScan}</strong> to scan{b.count > 0 && cap ? ` · about ${Math.round(b.weight)} lb of ${cap}` : ""}</span>
          {b.box && <span title="The size of box this many garments fill" style={{ fontWeight: 800, color: "var(--k-amber-ink-2)", whiteSpace: "nowrap" }}>→ {b.box}</span>}
          {st === "printed" && <span style={{ fontSize: 16, fontWeight: 800, color: "var(--k-green-ink-2)", border: "1px solid var(--k-green)", borderRadius: 999, padding: "2px 12px", background: "var(--k-tint-green)", whiteSpace: "nowrap" }}>✓ List printed · {b.count} pcs</span>}
          {toScan > 0 && <button onClick={() => onUnfold(b.bin)} title="The garments still to scan for this box" style={{ ...btnGhost, fontSize: 15, padding: "4px 12px" }}>{unfolded ? "▲ Hide" : "▼ Show"} the {toScan} left</button>}
        </div>
        {unfolded && (sh?.waiting || []).length > 0 && (
          <div style={{ marginTop: 6, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 4 }}>
            {sh.waiting.map(r => (
              <div key={r._id} style={{ fontSize: 16, color: "var(--k-ink-1)", padding: "4px 8px", borderRadius: 6, background: "var(--k-page)" }}>
                <strong style={{ fontFamily: FONT_DISPLAY, fontSize: 20 }}>#{r.number || "—"}</strong>{r.name ? <span style={{ fontFamily: FONT_READ }}>{` ${r.name}`}</span> : ""}{r.size ? <span style={{ color: "var(--k-green-ink)", fontWeight: 700 }}> {shortSize(r.size)}</span> : null}{r.team ? <span style={{ color: "var(--k-ink-3)" }}> · {r.team}</span> : null}
              </div>
            ))}
          </div>
        )}
        {b.heavy >= 0.95 && <div style={{ fontSize: 16, fontWeight: 800, color: "var(--k-red-ink)" }}>At the weight limit — close it</div>}
        {shortN > 0 && (
          <div title="These garments are flagged or marked missing, so they will not arrive in this box by scanning on" style={{ fontSize: 16, fontWeight: 800, color: "var(--k-amber-ink)" }}>
            ⚠ Short {shortN}: {jerseyList(sh.short, 5)}{toScan === 0 ? " — nothing else is coming for this box" : ""}
          </div>
        )}
      </div>
      {!asking && (
        <>
          <button onClick={() => b.count <= 1 ? onList(b.bin, null) : onAsk(b.bin, "list")} disabled={b.count === 0} title={b.count === 0 ? "Nothing is in this box yet" : "Print the list of what is in this box now. The box stays open."}
            style={{ ...(st === "printed" ? btnGhost : btnPri), fontSize: 18, padding: "12px 20px", whiteSpace: "nowrap", ...(st === "changed" ? { background: "var(--k-amber)", color: "var(--k-page)" } : st === "printed" ? {} : { background: "var(--k-blue)", color: "var(--k-page)" }), opacity: b.count === 0 ? 0.4 : 1, cursor: b.count === 0 ? "not-allowed" : "pointer" }}>
            🖨 {st === "printed" ? "Print again" : st === "changed" ? "Print list (changed)" : "Print list"}
          </button>
          <button onClick={() => b.count <= 1 ? onFull(b.bin, null) : onAsk(b.bin, "full")} disabled={b.count === 0} title={b.count === 0 ? "Nothing is in this box yet" : "Close this box, print its list and carry on in the next box"}
            style={{ ...btnGhost, fontSize: 18, padding: "12px 20px", whiteSpace: "nowrap", borderColor: "var(--k-amber)", color: "var(--k-amber-ink-2)", opacity: b.count === 0 ? 0.4 : 1, cursor: b.count === 0 ? "not-allowed" : "pointer" }}>
            Box full
          </button>
        </>
      )}
      {asking === "full" && choices(`What size is Box ${b.bin}?`, id => onFull(b.bin, id), "Not full yet")}
      {asking === "list" && choices(`What box is Box ${b.bin} in?`, id => onList(b.bin, id), "Cancel")}
    </div>
  );
}

// `finished`: opened from the "Order N is done" screen; the Now strip only says so (the lists
// printed at Finish are not in `listPrinted`, and nothing is left to scan or finish).
function PackingScreen({ orderNumber, by = "team", open, closed, cap = 45, short = {}, damaged = [], toScan = 0, summary, stats, status, summaryLabels = 0, finished = false, startTab = "packing",
  onPrintList, onPrintAll, onFull, onReprint, onDamagedList, onLabels, onExport, onPrintSummary, onFinish, onClose }) {
  const [asking, setAsking] = useState(null);       // { bin, mode: "full" | "list" }
  const [unfolded, setUnfolded] = useState(null);   // the box whose jerseys still to scan are listed
  // Two tabs on one screen, "Packing / Summary" (the co-op, 27 Nov 2026): one place to find both, one Close.
  const [tab, setTab] = useState(startTab === "summary" ? "summary" : "packing");
  useEffect(() => {
    // Esc closes; Enter does nothing (the pedal is Enter: a reflex press must not print or finish anything).
    const h = e => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
      else if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, [onClose]);
  const onAsk = (bin, mode) => setAsking(bin === null ? null : { bin, mode });
  const onUnfold = bin => setUnfolded(u => (u === bin ? null : bin));
  const now = finished ? { step: "done", text: "The order is finished" }
    : nowStep({ toScan, openBoxes: open.map(b => ({ count: b.count, printed: b.listState === "printed" })) });
  const c = summary.counts, printing = status?.status === "printing";
  const tone = { scan: "var(--k-amber)", print: "var(--k-blue)", finish: "var(--k-green)", done: "var(--k-green)" }[now.step];
  const rowSt = { display: "flex", alignItems: "center", gap: 16, padding: "12px 18px", borderRadius: 12, background: "var(--k-field)", border: "1px solid var(--k-rule-3)" };
  const bigBtn = { ...btnPri, fontSize: 20, padding: "14px 28px", whiteSpace: "nowrap", background: tone, color: "var(--k-page)" };
  const pcs = n => `${n} ${n === 1 ? "garment" : "garments"}`;
  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--k-scrim)", zIndex: 2400, display: "flex", alignItems: "center", justifyContent: "center" }}>{/* above the done screen (2300) and the Finish confirm (1600), which open it; below the Print menu (2500) */}
      <div style={{ background: "var(--k-card)", borderRadius: 16, border: "2px solid var(--k-green)", padding: 30, maxWidth: 1100, width: "96vw", maxHeight: "94%", overflowY: "auto", boxSizing: "border-box" }}>
        <div style={{ ...STICKY_HEAD, alignItems: "center", gap: 12 }}>
          <div role="tablist" aria-label="Packing or summary" style={{ display: "flex", borderRadius: 12, border: "2px solid var(--k-blue)", overflow: "hidden" }}>
            {[["packing", "📦 Packing"], ["summary", "📋 Summary"]].map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
                style={{ border: "none", padding: "8px 22px", fontFamily: FONT_DISPLAY, fontSize: 28, fontWeight: 800, fontStyle: "italic", whiteSpace: "nowrap", cursor: "pointer", background: tab === id ? "var(--k-blue)" : "transparent", color: tab === id ? "var(--k-on-blue)" : "var(--k-blue-ink)" }}>{label}</button>
            ))}
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "var(--k-ink-2)", whiteSpace: "nowrap" }}>Order {orderNumber || "—"}</div>
          <div style={{ flex: 1 }} />
          {tab === "packing" && onLabels && <button onClick={onLabels} title="The box labels of this order, to print again" style={{ ...btnGhost, fontSize: 16, padding: "8px 16px", whiteSpace: "nowrap" }}>🖨 Box labels</button>}
          {tab === "summary" && onExport && <button onClick={onExport} style={{ ...btnGhost, fontSize: 16, padding: "8px 16px", whiteSpace: "nowrap" }}>⬇ Excel</button>}
          {tab === "summary" && <button onClick={() => onPrintSummary(false)} disabled={printing} title="The count label, the FAILED list and the MISSING list" style={{ ...btnGhost, fontSize: 16, padding: "8px 16px", whiteSpace: "nowrap", opacity: printing ? 0.5 : 1 }}>🖨 Print summary · {summaryLabels} {summaryLabels === 1 ? "label" : "labels"}</button>}
          <button onClick={onClose} style={{ ...btnGhost, fontSize: 16, padding: "8px 16px", whiteSpace: "nowrap" }}>Close <Kbd light>Esc</Kbd></button>
        </div>
        {tab === "summary" && (
          <div style={{ marginTop: 14 }}>
            {status && <div style={{ marginBottom: 10, fontSize: 17, fontWeight: 600, color: status.status === "done" ? "var(--k-green-ink)" : status.status === "printing" ? "var(--k-ink-3)" : "var(--k-amber-ink)" }}>{status.status === "printing" ? "🖨 Printing… " : "🖨 "}{status.text}</div>}
            <SummaryCounts summary={summary} stats={stats} />
            <OrderSummaryBody summary={summary} bins={[]} />{/* the boxes are the Packing tab's rows */}
          </div>
        )}
        {tab === "packing" && <>
        {/* The Now strip: one sentence, one button that does it. */}
        <div style={{ marginTop: 16, padding: "14px 20px", borderRadius: 14, border: `2px solid ${tone}`, background: "var(--k-tint-green-faint)", display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ fontSize: 26, fontWeight: 900, color: "var(--k-ink-1)" }}>{now.text}</div>
            <div style={{ fontSize: 18, color: "var(--k-ink-2)", marginTop: 2 }}>
              <strong style={{ color: "var(--k-green-ink)" }}>{c.passed}</strong> of {c.total} passed · <strong style={{ color: c.failed ? "var(--k-red-ink)" : "var(--k-ink-2)" }}>{c.failed}</strong> flagged · <strong style={{ color: c.notScanned ? "var(--k-amber-ink)" : "var(--k-ink-2)" }}>{c.notScanned}</strong> unscanned{c.marked > 0 && <> · <strong style={{ color: "var(--k-amber-ink)" }}>{c.marked}</strong> marked missing</>}
            </div>
          </div>
          {now.step === "print" && <button onClick={onPrintAll} disabled={printing} style={{ ...bigBtn, opacity: printing ? 0.5 : 1 }}>🖨 Print every list</button>}
          {now.step === "finish" && <button onClick={onFinish} style={bigBtn}>🏁 Finish order</button>}
        </div>
        {status && (
          <div style={{ marginTop: 12, fontSize: 18, fontWeight: 600, color: status.status === "done" ? "var(--k-green-ink)" : status.status === "printing" ? "var(--k-ink-3)" : "var(--k-amber-ink)" }}>
            {status.status === "printing" ? "🖨 Printing… " : "🖨 "}{status.text}
          </div>
        )}
        {open.length > 0 && <div style={{ fontSize: 16, color: "var(--k-ink-3)", margin: "14px 0 8px" }}>
          {by === "all" ? "The whole order, box after box" : `Sorted by ${by}`}. Print list prints what is in the box now. The box stays open. Box full closes the box and starts the next one (5.1, then 5.2).
        </div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {open.map(b => (
            <PackingRow key={b.bin} b={b} sh={short[b.bin]} cap={cap} asking={asking?.bin === b.bin ? asking.mode : null} unfolded={unfolded === b.bin}
              onAsk={onAsk} onUnfold={onUnfold} onFull={onFull} onList={onPrintList} />
          ))}
        </div>
        {damaged.length > 0 && (
          <div style={{ ...rowSt, marginTop: 10, borderColor: "var(--k-red)", background: "var(--k-tint-red-faint)" }}>
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 32, fontWeight: 900, color: "var(--k-red-ink)", minWidth: 120, lineHeight: 1 }}>DAMAGED</div>
            <div style={{ flex: 1, fontSize: 17, color: "var(--k-red-ink-3)" }}>{pcs(damaged.length)} flagged: {jerseyList(damaged, 8)}</div>
            {onDamagedList && <button onClick={onDamagedList} title="Print the list of what is in the DAMAGED box: number, name, team and why" style={{ ...btnGhost, fontSize: 17, padding: "10px 18px", borderColor: "var(--k-red)", color: "var(--k-red-ink-3)", whiteSpace: "nowrap" }}>🖨 Print list</button>}
          </div>
        )}
        {closed.length > 0 && (
          <>
            <div style={{ fontSize: 15, color: "var(--k-ink-3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, margin: "20px 0 8px" }}>Closed</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {closed.map(x => (
                <div key={x.bin} style={{ ...rowSt, padding: "8px 18px", background: "transparent" }}>
                  <div style={{ fontFamily: FONT_DISPLAY, fontSize: 30, fontWeight: 900, color: "var(--k-ink-3b)", minWidth: 120, lineHeight: 1 }}>Box {x.bin}</div>
                  <div style={{ flex: 1, fontSize: 18, color: "var(--k-ink-2)" }}>{x.label} · {pcs(x.count)}{x.box ? <span style={{ color: "var(--k-amber-ink-2)", fontWeight: 700 }}> → {x.box}</span> : null}</div>
                  <button onClick={() => onReprint(x.bin)} disabled={x.count === 0} title="Print this box's list again" style={{ ...btnGhost, fontSize: 16, padding: "8px 16px", opacity: x.count === 0 ? 0.4 : 1 }}>🖨 Print list again</button>
                </div>
              ))}
            </div>
          </>
        )}
        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 24 }}>
          {onFinish && <button onClick={onFinish} style={{ ...btnGhost, fontSize: 17, padding: "12px 24px", borderColor: "var(--k-green)", color: "var(--k-green-ink-2)" }}>🏁 Finish order</button>}
          <button onClick={onClose} style={{ ...btnGhost, fontSize: 17, padding: "12px 24px" }}>Close <Kbd light>Esc</Kbd></button>
        </div>
        </>}
      </div>
    </div>
  );
}

// ── Missing · Duplicate · Flagged ────────────────────────────────────────────
// Three lists behind one small button, so the station screen stays plain (the
// owner, 19 Nov 2026): what is missing, what came twice, what is flagged. Each
// line is the jersey (number, name, size, team), its box, and for a flag why.
function IssuesModal({ missing, dups, flagged, binOf, onClose }) {
  useEffect(() => { const h = e => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); } }; window.addEventListener("keydown", h, true); return () => window.removeEventListener("keydown", h, true); }, [onClose]);
  const line = (key, j, extra, colour) => {
    const box = j._id !== undefined ? binOf(j) : null;
    return (
      <div key={key} style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "6px 10px", borderRadius: 8, background: "var(--k-page)", flexWrap: "wrap" }}>
        <strong style={{ fontFamily: FONT_DISPLAY, fontSize: 24, lineHeight: 1 }}>#{j.number || "?"}</strong>
        {j.name && <span style={{ fontWeight: 700, fontFamily: FONT_READ }}>{j.name}</span>}
        {j.size && <span style={{ fontFamily: FONT_DISPLAY, fontSize: 20, color: "var(--k-green-ink)", fontWeight: 800 }}>{shortSize(j.size)}</span>}
        {j.team && <span style={{ color: "var(--k-ink-3)" }}>{j.team}</span>}
        {box !== null && <span style={{ fontFamily: FONT_DISPLAY, fontSize: 18, color: "var(--k-blue-ink)", fontWeight: 800 }}>Box {box}</span>}
        {extra && <span style={{ color: colour, fontSize: 15, marginLeft: "auto" }}>{extra}</span>}
      </div>
    );
  };
  const col = (title, colour, items, empty) => (
    <div style={{ flex: "1 1 260px", minWidth: 0 }}>
      <div style={{ fontSize: 22, fontWeight: 900, color: colour, marginBottom: 8 }}>{title} · {items.length}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {items.length ? items : <div style={{ color: "var(--k-ink-3b)", fontSize: 16, padding: "6px 2px" }}>{empty}</div>}
      </div>
    </div>
  );
  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--k-scrim)", zIndex: 1500, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "var(--k-card)", borderRadius: 16, border: "2px solid var(--k-amber)", padding: 30, maxWidth: 1300, width: "96vw", maxHeight: "94%", overflowY: "auto", boxSizing: "border-box" }}>
        <div style={STICKY_HEAD}>
          <div style={{ ...titleSt, fontSize: 34, flex: 1 }}>Missing · Duplicate · Flagged</div>
          <button onClick={onClose} style={{ ...btnGhost, fontSize: 15 }}>Close <Kbd light>Esc</Kbd></button>
        </div>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start", marginTop: 16 }}>
          {col("Missing", "var(--k-amber-ink)", missing.map(r => line("m" + r._id, r, r.scanned === "short" ? "short-shipped" : "", "var(--k-amber-ink)")), "Nothing is marked missing.")}
          {col("Duplicate", "var(--k-purple)", dups.map(l => line("d" + l.id, l.match || l.detected || {}, String(l.timestamp || "").slice(11, 16), "var(--k-ink-3)")), "No duplicates.")}
          {col("Flagged", "var(--k-red-ink)", flagged.map(f => line("f" + f.key, f.jersey, f.reason, "var(--k-red-ink-3)")), "Nothing is flagged.")}
        </div>
      </div>
    </div>
  );
}

// ── Order summary: passed, failed, missing (the owner, 24 Nov 2026) ─────────
// "Which jerseys are there and passed, which are there and failed, which are
// missing", the three side by side, the missing split into marked missing and
// not scanned yet next to each other ("easier to point out that way").
// The summary's body, shared by the station's summary screen and the board's
// order view (the owner, 25 Nov 2026: "the summary like the operator sees it"),
// so the two can never drift: the boxes of the order (`bins`: Box · label ·
// count · box size · open or closed), then Passed with its box, Failed with its
// reason and Missing.
function OrderSummaryBody({ summary, bins = [] }) {
  const c = summary.counts;
  const line = (key, j, extra, colour, box = null) => (
    <div key={key} style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "5px 10px", borderRadius: 8, background: "var(--k-page)", flexWrap: "wrap" }}>
      <strong style={{ fontFamily: FONT_DISPLAY, fontSize: 24, lineHeight: 1 }}>#{j.number || "?"}</strong>
      {j.name && <span style={{ fontWeight: 700, fontFamily: FONT_READ }}>{j.name}</span>}
      {j.team && <span style={{ color: "var(--k-ink-3)" }}>{j.team}</span>}
      {j.size && <span style={{ fontFamily: FONT_DISPLAY, fontSize: 20, color: "var(--k-green-ink)", fontWeight: 800 }}>{shortSize(j.size)}</span>}
      {box && <span style={{ fontFamily: FONT_DISPLAY, fontSize: 18, color: "var(--k-blue-ink)", fontWeight: 800, marginLeft: "auto" }}>Box {box}</span>}
      {extra && <span style={{ color: colour, fontSize: 15, marginLeft: box ? 0 : "auto" }}>{extra}</span>}
    </div>
  );
  const col = (title, colour, items, empty, children) => (
    <div style={{ flex: "1 1 300px", minWidth: 0, background: "var(--k-field)", borderRadius: 12, border: "1px solid var(--k-rule-3)", padding: "10px 12px" }}>
      <div style={{ fontSize: 22, fontWeight: 900, color: colour, marginBottom: 8 }}>{title}</div>
      {children || <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>{items.length ? items : <div style={{ color: "var(--k-ink-3b)", fontSize: 16, padding: "6px 2px" }}>{empty}</div>}</div>}
    </div>
  );
  const sub = (title, items, empty) => (
    <div style={{ flex: "1 1 140px", minWidth: 0 }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: "var(--k-ink-3)", margin: "2px 0 6px" }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>{items.length ? items : <div style={{ color: "var(--k-ink-3b)", fontSize: 15, padding: "4px 2px" }}>{empty}</div>}</div>
    </div>
  );
  return (
    <div>
      {bins.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
          {bins.map(b => (
            <div key={b.bin} style={{ background: "var(--k-field)", border: `1px solid ${b.open ? "var(--k-rule-3)" : "var(--k-green-deep)"}`, borderRadius: 10, padding: "6px 12px", fontSize: 15, color: "var(--k-ink-2)" }}>
              <strong style={{ fontFamily: FONT_DISPLAY, fontSize: 20, color: "var(--k-blue-ink)" }}>Box {b.bin}</strong> {b.label} · <strong style={{ color: "var(--k-green-ink)" }}>{b.count}</strong>{b.box ? <span style={{ color: "var(--k-amber-ink-2)" }}> · {b.box}</span> : null} · <span style={{ color: b.open ? "var(--k-amber-ink)" : "var(--k-green-ink)" }}>{b.open ? "open" : `closed${b.closedAt ? " " + String(b.closedAt).slice(11, 16) : ""}`}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-start", marginTop: 14 }}>
        {col(`Passed · ${c.passed}`, "var(--k-green-ink)", summary.passed.map(p => line("p" + p.row._id, p.row, "", "", p.bin)), "Nothing has passed yet.")}
        {col(`Failed · ${c.failed}`, "var(--k-red-ink)", summary.failed.map(f => line("f" + f._id, f, f.reason || "flagged", "var(--k-red-ink-3)")), "Nothing is flagged.", c.extra > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {summary.failed.map(f => line("f" + f._id, f, f.reason || "flagged", "var(--k-red-ink-3)"))}
            <div style={{ fontSize: 15, fontWeight: 800, color: "var(--k-ink-3)", margin: "6px 0 2px" }}>No roster row · {c.extra}</div>{/* not on the roster, a duplicate, no size tag: in the DAMAGED box, not among the order's jerseys */}
            {summary.extra.map((f, i) => line("x" + i, f, f.reason || "flagged", "var(--k-red-ink-3)"))}
          </div>
        ) : null)}
        {/* Unscanned (not scanned yet) and Missing (the operator's mark) are counted apart (the owner, 25 Nov 2026). */}
        {col(`Unscanned ${c.notScanned} · Missing ${c.marked}`, "var(--k-amber-ink)", [], "", (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {sub(`Unscanned · ${c.notScanned}`, summary.missing.notScanned.map(r => line("n" + r._id, r, "", "")), "None.")}
            {sub(`Marked missing · ${c.marked}`, summary.missing.marked.map(r => line("m" + r._id, r, "", "")), "None.")}
          </div>
        ))}
      </div>
    </div>
  );
}

// The counts and the rates on one line: jerseys, passed, failed, unscanned, marked missing, the
// extras, then pass rate, flag rate and pace (`stats`: summarise() of the order's
// events, src/lib/export.js). The Packing screen's summary and the board's
// order view both draw it.
function SummaryCounts({ summary, stats = null }) {
  const c = summary.counts, num = v => v !== "" && v !== null && v !== undefined;
  return (
    <div style={{ fontSize: 17, color: "var(--k-ink-2)", flex: 1 }}>
      {c.total} {c.total === 1 ? "garment" : "garments"} · <span style={{ color: "var(--k-green-ink)", fontWeight: 800 }}>{c.passed} passed</span> · <span style={{ color: "var(--k-red-ink)", fontWeight: 800 }}>{c.failed} failed</span> · <span style={{ color: "var(--k-amber-ink)", fontWeight: 800 }}>{c.notScanned} unscanned</span>{c.marked > 0 && <span style={{ color: "var(--k-amber-ink)", fontWeight: 800 }}> · {c.marked} marked missing</span>}{c.extra > 0 && <span style={{ color: "var(--k-red-ink-2)" }}> · +{c.extra} with no roster row</span>}
      {stats && (num(stats.passRate) || num(stats.flagRate) || num(stats.perHour)) && (
        <div style={{ fontSize: 14, color: "var(--k-ink-3)", marginTop: 2 }}>
          {num(stats.passRate) ? <>pass rate <strong style={{ color: "var(--k-ink-1)" }}>{stats.passRate}%</strong></> : null}
          {num(stats.flagRate) ? <> · flag rate <strong style={{ color: "var(--k-ink-1)" }}>{stats.flagRate}%</strong></> : null}
          {num(stats.perHour) ? <> · <strong style={{ color: "var(--k-ink-1)" }}>{stats.perHour}</strong> garments / hour</> : null}
          {num(stats.medianSec) ? <> · {stats.medianSec} s a garment</> : null}
        </div>
      )}
    </div>
  );
}

// ── History: every jersey scanned this order, latest first ──────────────────
// One line per jersey (its latest log entry). A passed jersey can be flagged
// from here when a problem is found later; a flagged one is with the
// supervisor. Esc or Close goes back to the camera.
function HistoryModal({ log, roster, binOf, onFlag, onClose }) {
  useEffect(() => { const h = e => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); } }; window.addEventListener("keydown", h, true); return () => window.removeEventListener("keydown", h, true); }, [onClose]);
  const seen = new Set();
  const rows = log.filter(l => l.match && l.match._id !== undefined && [S_PASS, S_FLAGGED, S_MANUAL].includes(l.status) && !seen.has(l.match._id) && seen.add(l.match._id));
  const stateOf = l => roster.find(r => r._id === l.match._id)?.scanned;
  return (
    <div style={modalBg} onClick={onClose}>
      <div style={{ ...modalCard, maxWidth: 780, width: "100%", maxHeight: "90%", display: "flex", flexDirection: "column" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <div style={{ ...titleSt, fontSize: 28 }}>Scanned this order</div>
          <span style={{ color: "var(--k-ink-3)", fontSize: 15 }}>{rows.length} · latest first</span>
          <button onClick={onClose} style={{ ...btnGhost, marginLeft: "auto", padding: "6px 14px", fontSize: 14 }}>Close <Kbd light>Esc</Kbd></button>
        </div>
        <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
          {rows.length === 0 && <div style={{ color: "var(--k-ink-3)", padding: 24, textAlign: "center", fontSize: 17 }}>Nothing scanned yet.</div>}
          {rows.map(l => { const st = stateOf(l); return (
            <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 14px", borderRadius: 10, background: st === "flag" ? "var(--k-tint-red-faint)" : "var(--k-tint-green-faint)", border: "1px solid var(--k-rule)" }}>
              {l.thumb && <img src={l.thumb} alt="" style={{ width: 56, height: 42, objectFit: "cover", borderRadius: 4, flexShrink: 0 }} />}
              <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 28, lineHeight: 1 }}>#{l.match.number}{l.match.name ? <span style={{ fontFamily: FONT_READ, fontWeight: 700 }}>{` · ${l.match.name}`}</span> : ""}</span>
              {l.match.size && <span style={{ fontFamily: FONT_DISPLAY, fontSize: 22, color: "var(--k-green-ink)", fontWeight: 800 }}>{shortSize(l.match.size)}</span>}
              {binOf(l.match) !== null && <span style={{ fontFamily: FONT_DISPLAY, fontSize: 22, color: "var(--k-blue-ink)", fontWeight: 800 }}>Box {binOf(l.match)}</span>}
              {/* A flag's reason and, when it was marked, where the damage is. */}
              {l.status === S_FLAGGED && (l.reason || l.spots?.length > 0) && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  {l.spots?.length > 0 && <GarmentMap kind={l.garment} spots={l.spots} height={44} captions={false} title={spotWords(l.garment, l.spots)} />}
                  <span style={{ fontSize: 14, color: "var(--k-red-ink-2)", lineHeight: 1.2 }}>{l.reason}{l.spots?.length > 0 ? <><br /><span style={{ color: "var(--k-amber-ink-3)" }}>{spotWords(l.garment, l.spots)}</span></> : null}</span>
                </span>
              )}
              <span style={{ marginLeft: "auto", fontSize: 14, color: "var(--k-ink-3b)", whiteSpace: "nowrap" }}>{l.timestamp}</span>
              {st === "flag"
                ? <Pill color="var(--k-red)">Flagged</Pill>
                : st === "pass" || st === "manual"
                  ? <button onClick={() => onFlag(l)} style={{ ...btnGhost, padding: "5px 12px", fontSize: 14, borderColor: "var(--k-red)", color: "var(--k-red-ink-2)", whiteSpace: "nowrap" }}>🚩 Flag it</button>
                  : <span style={{ fontSize: 14, color: "var(--k-ink-3b)" }}>Open</span>}
            </div>
          ); })}
        </div>
      </div>
    </div>
  );
}

// ── Blank jerseys: counted, not scanned ──────────────────────────────────────
// A jersey with no name and no number gives the camera nothing to read. The
// operator looks it over and presses the button of its team and size: that
// passes the next row of that kind, prints its sticker and puts it in its
// box, like a green confirmed. The scan key (the pedal) or Enter counts one
// more of the kind last pressed, so a stack of one size is one press each.
function BlanksModal({ groups, boxOf, last, sticker, scanKey, onCount, onFlag, onUndo, onClose }) {
  const [sel, setSel] = useState(null);
  const open = groups.filter(g => g.next);
  const current = groups.find(g => g.key === sel && g.next) || null;
  useEffect(() => {
    const h = e => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); return; }
      if (e.code === scanKey || e.key === "Enter") { e.preventDefault(); e.stopPropagation(); if (current && !e.repeat) onCount(current); }
    };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, [current, scanKey, onCount, onClose]);
  const name = g => [g.team, shortSize(g.size), g.style].filter(Boolean).join(" · ") || "Blank garment";
  const left = groups.reduce((t, g) => t + (g.total - g.done - g.flagged), 0);
  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--k-scrim)", zIndex: 1500, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "var(--k-card)", borderRadius: 16, border: "2px solid var(--k-blue)", padding: 30, maxWidth: 860, width: "94vw", maxHeight: "94%", overflowY: "auto", boxSizing: "border-box" }}>
        <div style={STICKY_HEAD}>
          <div style={{ ...titleBig, fontSize: 36 }}>Blank garments</div>
          <div style={{ fontSize: 17, color: "var(--k-ink-3)", flex: 1 }}>{left} still to count</div>
          <button onClick={onClose} style={{ ...btnGhost, fontSize: 15 }}>Close <Kbd light>Esc</Kbd></button>
        </div>
        <div style={{ fontSize: 16, color: "var(--k-ink-2)", margin: "8px 0 16px", lineHeight: 1.4 }}>
          Nothing is printed on these, so the camera has nothing to read. Look the garment over, then press the button of its {groups.some(g => g.team) ? "team and " : ""}size. Each press counts one, prints its sticker and puts it in its box. The pedal counts one more of the kind you pressed last.
        </div>
        {last && (
          <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 8, background: "var(--k-tint-green)", border: "1px solid var(--k-green)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", fontSize: 17, color: "var(--k-ink-1)" }}>
            <span style={{ flex: 1 }}><strong style={{ color: "var(--k-green-ink)" }}>Counted:</strong> {[last.match?.team, shortSize(last.match?.size), last.match?.style].filter(Boolean).join(" · ")}{boxOf(last.match) !== null ? <> → <strong style={{ color: "var(--k-blue-ink)" }}>Box {boxOf(last.match)}</strong></> : null}{sticker ? <span style={{ color: "var(--k-ink-3)" }}> · {sticker}</span> : null}</span>
            <button onClick={() => onUndo(last.match._id)} style={{ ...btnGhost, fontSize: 14, padding: "6px 12px" }}>Undo</button>
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {groups.map(g => {
            const rest = g.total - g.done - g.flagged, on = current?.key === g.key;
            return (
              <div key={g.key} style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 16px", borderRadius: 12, background: "var(--k-field)", border: `2px solid ${on ? "var(--k-green)" : "var(--k-rule-3)"}`, opacity: g.next ? 1 : 0.55, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: "var(--k-ink-1)" }}>{name(g)}</div>
                  <div style={{ fontSize: 15, color: "var(--k-ink-3)" }}>{g.done} of {g.total} counted{g.flagged ? ` · ${g.flagged} flagged` : ""}{rest ? ` · ${rest} to go` : " · done"}{g.next && boxOf(g.next) !== null ? ` · Box ${boxOf(g.next)}` : ""}</div>
                </div>
                <button onClick={() => { setSel(g.key); onCount(g); }} disabled={!g.next} style={{ ...btnPri, fontSize: 20, padding: "14px 26px", background: "var(--k-green)", color: "var(--k-page)", opacity: g.next ? 1 : 0.4 }}>✓ Count one{on ? <> <Kbd>pedal</Kbd></> : null}</button>
                <button onClick={() => { setSel(g.key); onFlag(g); }} disabled={!g.next} style={{ ...btnGhost, fontSize: 16, padding: "14px 16px", borderColor: "var(--k-red)", color: "var(--k-red-ink)", opacity: g.next ? 1 : 0.4 }}>🚩 Flag one</button>
              </div>
            );
          })}
        </div>
        {open.length === 0 && <div style={{ marginTop: 14, fontSize: 18, fontWeight: 800, color: "var(--k-green-ink)" }}>Every blank garment is counted.</div>}
      </div>
    </div>
  );
}

// ── Order done: the lists are out, the order is still here ───────────────────
// Finish order no longer drops straight back to the order screen (owner,
// 12 Nov 2026): the box lists print and this screen stays, with the lists to
// print again, the Print menu, and "New order" — which is what clears the
// order. Until then the order is still open on the station (a reload offers
// it again), so nothing is lost if the printer was out of labels. No key does
// anything here: the pedal must not start a new order.
// `unsent`: New order could not reach the server (M16): the order is kept, and starting a new
// one anyway (losing this one from the station) is a separate button, clicked, never a key.
function FinishedModal({ orderNumber, status, onReprint, onPrint, onPacking, onNew,onBack, onNewAnyway, unsent = "", sendingLast = false }) {
  const colour = { printing: "var(--k-ink-3)", done: "var(--k-green-ink)", error: "var(--k-red-ink)", none: "var(--k-amber-ink)" }[status?.status] || "var(--k-ink-3)";
  const busy = status?.status === "printing" || sendingLast;
  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--k-scrim)", zIndex: 2300, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "var(--k-card)", borderRadius: 16, border: "2px solid var(--k-green)", padding: 44, maxWidth: 680, width: "90vw", textAlign: "center", boxSizing: "border-box" }}>
        <div style={{ fontSize: 56, marginBottom: 10 }}>🏁</div>
        <div style={{ ...titleBig, fontSize: 40, marginBottom: 12 }}>Order {orderNumber || "—"} is done</div>
        <div style={{ fontSize: 19, fontWeight: 700, color: colour, marginBottom: 26, minHeight: 26 }}>{status?.status === "printing" ? "🖨 " : ""}{status?.text || ""}</div>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginBottom: 14 }}>
          <button onClick={onReprint} disabled={busy} style={{ ...btnGhost, fontSize: 18, padding: "14px 22px", opacity: busy ? 0.5 : 1 }}>🖨 Print the box lists again</button>
          {onPacking && <button onClick={onPacking} style={{ ...btnGhost, fontSize: 18, padding: "14px 22px", borderColor: "var(--k-green)", color: "var(--k-green-ink-2)" }}>📦 Packing</button>}
          <button onClick={onPrint} style={{ ...btnGhost, fontSize: 18, padding: "14px 22px" }}>🖨 Print something else…</button>
        </div>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <button onClick={onNew} disabled={busy} style={{ ...btnPri, fontSize: 21, padding: "16px 40px", background: "var(--k-green)", color: "var(--k-page)", opacity: busy ? 0.5 : 1 }}>{sendingLast ? "Saving on the server…" : "New order →"}</button>
          <button onClick={onBack} disabled={busy} title="The order is not closed yet: go back to it" style={{ ...btnGhost, fontSize: 16, padding: "14px 20px", opacity: busy ? 0.5 : 1 }}>← Back to this order</button>
        </div>
        {unsent && (
          <div style={{ marginTop: 18, padding: "12px 16px", borderRadius: 10, border: "2px solid var(--k-red)", background: "var(--k-tint-red)", textAlign: "left" }}>
            <div style={{ fontSize: 17, color: "var(--k-red-ink-2)", fontWeight: 700, marginBottom: 10 }}>⚠ {unsent}</div>
            <button onClick={onNewAnyway} onKeyDown={e => e.preventDefault()} title="Only when the server cannot be reached and the order is safe elsewhere" style={{ ...btnGhost, fontSize: 15, padding: "8px 14px", borderColor: "var(--k-red)", color: "var(--k-red-ink-2)" }}>Start a new order anyway — this order is deleted from this station</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Print: anything an order prints, again ───────────────────────────────────
// Everything that goes to the label printer, on request (printjobs.js): the
// box labels, the list of what is in a box, both, a jersey's sticker, a
// flag's ticket — for all of the order or for one box or jersey. It opens on
// the order on the station (`current`); "Another order" finds one done in the
// past by its number in the hub's records (90 days) and prints from that.
// Whatever the order, it prints on THIS station's printer.
function PrintModal({ current = null, tagOf, onClose }) {
  const [past,   setPast]   = useState(null);
  const [q,      setQ]      = useState("");
  const [found,  setFound]  = useState(null);   // { status: "searching" | "done" | "error", orders, message }
  const [status, setStatus] = useState(null);   // { kind: "printing" | "done" | "error", text }
  const [pick,   setPick]   = useState("");     // the sticker search
  const [keys,   setKeys]   = useState(null);   // which box the on-screen keys are under: "order" | "pick" | null (no keyboard at a station)
  const leave = () => document.activeElement?.blur?.();
  const pack = past || current;
  // The roll the box lists print on: a tall roll prints a list on fewer labels,
  // so the counts on the list buttons come from it. The roll chosen in Settings
  // (boxRoll), else the hub's ticket roll (GET /print; none until it answers).
  const chosenRoll = rollFor("binlist");
  const [roll, setRoll] = useState(() => (chosenRoll ? labelDots(chosenRoll) : null));
  useEffect(() => {
    let on = true;
    if (chosenRoll) return () => { on = false; };
    hub.printStatus(stationId()).then(r => { if (on) setRoll(labelDots(r?.flagLabelSize || DEFAULT_FLAG_LABEL_SIZE)); }).catch(() => {});
    return () => { on = false; };
  }, [chosenRoll]);
  useEffect(() => {
    const h = e => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, [onClose]);
  // jobs: [[labels, kind], …] sent one after the other, 50 labels a request.
  const send = (jobs, what) => {
    const parts = jobs.filter(([labels]) => labels.length), n = parts.reduce((t, [labels]) => t + labels.length, 0);
    if (!n) { setStatus({ kind: "error", text: `${what}: nothing to print` }); return; }
    setStatus({ kind: "printing", text: `Printing ${what}…` });
    const chunks = parts.flatMap(([labels, kind]) => kind === "binlist"   // a list is never cut in two: the hub re-pages it whole for a tall roll
      ? listChunks(labels, 50).map(c => [c, kind])
      : Array.from({ length: Math.ceil(labels.length / 50) }, (_, i) => [labels.slice(i * 50, i * 50 + 50), kind]));
    // The count is the hub's: the labels that came out (a tall roll's lists are re-paged).
    chunks.reduce((pr, [labels, kind]) => pr.then(t => hub.printLabels(labels, { kind, station: stationId() }).then(r => ({ printer: r?.printer, count: t.count + (Number.isFinite(r?.count) ? r.count : labels.length) }))), Promise.resolve({ count: 0 }))
      .then(r => setStatus({ kind: "done", text: `Printed ${what}: ${r.count} ${r.count === 1 ? "label" : "labels"}${copiesNote(parts.flatMap(([labels]) => labels))} on ${r.printer}` }))
      .catch(e => setStatus({ kind: "error", text: `${what} NOT printed: ${e.status === 503 ? "no label printer for this station" : e.status ? e.message : "could not reach the server"}` }));
  };
  const search = () => {
    const n = q.trim(); if (!n) return;
    setFound({ status: "searching" });
    hub.orders(n).then(r => setFound({ status: "done", orders: r.orders || [] }))
      .catch(e => setFound({ status: "error", message: e.status ? e.message : "could not reach the server" }));
  };
  const boxes    = useMemo(() => packBoxes(pack), [pack]);
  const stickers = useMemo(() => stickerRows(pack), [pack]);
  // A flag fixed at the station never had a ticket and its garment is in its box: no ticket to reprint (25 Nov 2026).
  const flags    = (pack?.flags || []).filter(f => f.resolution !== FIXED_AT_STATION);
  const inDamaged = useMemo(() => damagedItems(pack), [pack]);
  const needle   = pick.trim().toLowerCase();
  const picked   = needle ? stickers.filter(r => rosterMatches(r, pick)).slice(0, 8) : [];   // the same search as the roster table's
  const tall = roll ? isTallTicket(roll) : false;   // a tall roll prints a box's list as a table (printjobs.js boxListLabels)
  const allLabels = pack ? boxLabelJobs(pack) : [], allLists = pack ? boxListJobs(pack, undefined, { tall }) : [];
  const sum = pack ? orderSummary(pack) : null;
  const listCount = roll ? repageLists(allLists, roll).length : null;   // the list labels that come out on this station's roll
  const listN = listCount ?? allLists.length, countOf = n => (listCount === null ? "" : ` · ${n}`);
  const many = (n, what) => n <= 30 || window.confirm(`Print ${n} ${what}?`);
  const secSt  = { fontSize: 14, fontWeight: 800, color: "var(--k-ink-3)", letterSpacing: 1, textTransform: "uppercase", margin: "20px 0 8px" };
  const rowSt  = { display: "flex", alignItems: "center", gap: 12, padding: "8px 14px", borderRadius: 10, background: "var(--k-field)", border: "1px solid var(--k-rule-3)" };
  const bigBtn = { ...btnGhost, fontSize: 17, padding: "12px 18px", borderColor: "var(--k-blue)", color: "var(--k-blue-ink-2)" };
  const smBtn  = { ...btnGhost, fontSize: 15, padding: "6px 12px", whiteSpace: "nowrap" };
  const of = b => `Box ${b.bin}`;
  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--k-scrim)", zIndex: 2500, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "var(--k-card)", borderRadius: 16, border: "2px solid var(--k-blue)", padding: 30, maxWidth: 860, width: "94vw", maxHeight: "94%", overflowY: "auto", boxSizing: "border-box" }}>
        <div style={STICKY_HEAD}>
          <div style={{ ...titleBig, fontSize: 36 }}>🖨 Print</div>
          <div style={{ fontSize: 19, color: "var(--k-ink-1)", fontWeight: 700, flex: 1 }}>
            {pack ? <>Order {pack.orderNumber || "—"}{past ? <span style={{ color: "var(--k-amber-ink-2)", fontWeight: 400 }}> · a past order{pack.past?.date ? `, ${pack.past.date}` : ""}{pack.past?.station ? `, ${String(pack.past.station).replace(/^st-/, "")}` : ""}</span> : <span style={{ color: "var(--k-ink-3)", fontWeight: 400 }}> · the order on this station</span>}</> : <span style={{ color: "var(--k-ink-3)", fontWeight: 400 }}>No order is open: find one by its number</span>}
          </div>
          <button onClick={onClose} style={{ ...btnGhost, fontSize: 15 }}>Close <Kbd light>Esc</Kbd></button>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 14, flexWrap: "wrap" }}>
          <span style={{ fontSize: 15, color: "var(--k-ink-3)", fontWeight: 700 }}>Another order:</span>
          <input value={q} onChange={e => setQ(e.target.value)} onFocus={() => setKeys("order")} onBlur={() => setKeys(k => (k === "order" ? null : k))} onKeyDown={e => { e.stopPropagation(); if (e.key === "Enter") search(); }} placeholder="order number" style={{ ...inputSt, width: 220, padding: "8px 12px" }} />
          <button onClick={search} disabled={!q.trim()} style={{ ...smBtn, opacity: q.trim() ? 1 : 0.5 }}>🔎 Find</button>
          {past && current && <button onClick={() => { setPast(null); setStatus(null); }} style={smBtn}>← Back to order {current.orderNumber || "on this station"}</button>}
        </div>
        {keys === "order" && <div style={{ maxWidth: 560 }}><ScreenKeys layout="search" onKey={k => setQ(v => typeKey(v, k))} onEnter={() => { search(); leave(); }} enterLabel="Find" /></div>}
        {found?.status === "searching" && <div style={{ marginTop: 8, color: "var(--k-ink-3)" }}>Looking…</div>}
        {found?.status === "error" && <div style={{ marginTop: 8, color: "var(--k-red-ink)", fontWeight: 700 }}>Could not look it up: {found.message}</div>}
        {found?.status === "done" && found.orders.length === 0 && <div style={{ marginTop: 8, color: "var(--k-amber-ink)", fontWeight: 700 }}>No order with that number in the last 90 days.</div>}
        {found?.status === "done" && found.orders.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
            {found.orders.map(o => (
              <button key={`${o.station}|${o.order}|${o.run}`} onClick={() => { setPast(packFromRecord(o)); setStatus(null); setFound(null); setPick(""); }} style={{ ...rowSt, cursor: "pointer", color: "var(--k-ink-1)", fontSize: 16, textAlign: "left" }}>
                <strong>Order {o.order}</strong>
                <span style={{ color: "var(--k-ink-3)" }}>{o.date} · {String(o.station || "").replace(/^st-/, "")}{o.operator ? ` · ${o.operator}` : ""} · {o.rows.length} garments{o.counts ? `, ${(o.counts.pass || 0) + (o.counts.manual || 0)} passed` : ""}</span>
              </button>
            ))}
          </div>
        )}

        {status && <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 8, background: "var(--k-page)", fontSize: 17, fontWeight: 700, color: status.kind === "done" ? "var(--k-green-ink)" : status.kind === "error" ? "var(--k-red-ink)" : "var(--k-ink-3)" }}>{status.kind === "printing" ? "🖨 " : ""}{status.text}</div>}

        {pack && !pack.binMap && <div style={{ marginTop: 16, color: "var(--k-amber-ink)" }}>This order has no boxes on record.</div>}
        {pack && boxes.length > 0 && (
          <>
            <div style={secSt}>The whole order</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button style={bigBtn} onClick={() => many(allLabels.length, "box labels") && send([[allLabels, "binticket"]], "every box label")}>Box labels · {allLabels.length}</button>
              <button style={bigBtn} onClick={() => many(listN, "list labels") && send([[allLists, "binlist"]], "every box list")}>Box lists{countOf(listN)}</button>
              <button style={bigBtn} onClick={() => many(allLabels.length + listN, "labels") && send([[allLists, "binlist"], [allLabels, "binticket"]], "every box label and list")}>Both{countOf(allLabels.length + listN)}</button>
            </div>
            <div style={secSt}>One box</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {boxes.map(b => (
                <div key={b.bin} style={rowSt}>
                  <div style={{ fontFamily: FONT_DISPLAY, fontSize: 28, fontWeight: 900, color: b.open ? "var(--k-blue-ink)" : "var(--k-ink-3b)", minWidth: 110, lineHeight: 1, whiteSpace: "nowrap" }}>{of(b)}</div>
                  <div style={{ flex: 1, fontSize: 16, color: "var(--k-ink-1)" }}>{b.label} <span style={{ color: "var(--k-ink-3)" }}>· {b.count} {b.count === 1 ? "garment" : "garments"} · {b.open ? "open" : "closed"}</span></div>
                  <button style={smBtn} onClick={() => send([[boxLabelJobs(pack, b.bin), "binticket"]], `the ${of(b)} label`)}>Label</button>
                  <button style={{ ...smBtn, opacity: b.count ? 1 : 0.4 }} disabled={!b.count} onClick={() => send([[boxListJobs(pack, b.bin, { tall }), "binlist"]], `the ${of(b)} list`)}>List</button>
                  <button style={{ ...smBtn, opacity: b.count ? 1 : 0.4 }} disabled={!b.count} onClick={() => send([[boxListJobs(pack, b.bin, { tall }), "binlist"], [boxLabelJobs(pack, b.bin), "binticket"]], `the ${of(b)} label and list`)}>Both</button>
                  <button style={{ ...smBtn, opacity: b.count ? 1 : 0.4 }} disabled={!b.count} title="The shipping face of the box: order, customer, teams and sizes in it, Box 1 of N, a blank for the weight" onClick={() => send([[boxFaceJobs(pack, b.bin), "binlist"]], `the ${of(b)} outside label`)}>Outside label</button>
                </div>
              ))}
            </div>
          </>
        )}

        {pack && (
          <>
            <div style={secSt}>Garment stickers · {stickers.length} passed</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input value={pick} onChange={e => setPick(e.target.value)} onFocus={() => setKeys("pick")} onBlur={() => setKeys(k => (k === "pick" ? null : k))} onKeyDown={e => e.stopPropagation()} placeholder="garment number or name" style={{ ...inputSt, width: 260, padding: "8px 12px" }} />
              <button style={{ ...smBtn, opacity: stickers.length ? 1 : 0.4 }} disabled={!stickers.length} onClick={() => many(stickers.length, "stickers") && send([[stickerJobs(pack), "jersey"]], "every sticker")}>All {stickers.length} stickers</button>
            </div>
            {keys === "pick" && <div style={{ maxWidth: 560 }}><ScreenKeys layout="search" onKey={k => setPick(v => typeKey(v, k))} onEnter={leave} enterLabel="Done" /></div>}
            {needle && picked.length === 0 && <div style={{ marginTop: 6, color: "var(--k-amber-ink)" }}>No passed garment matches “{pick.trim()}”.</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
              {picked.map(r => (
                <div key={r._id} style={rowSt}>
                  <div style={{ flex: 1, fontSize: 16, color: "var(--k-ink-1)" }}><strong>#{r.number}</strong> <span style={{ fontFamily: FONT_READ }}>{r.name}</span> <span style={{ color: "var(--k-ink-3)" }}>{[r.team, shortSize(r.size)].filter(Boolean).join(" · ")}</span></div>
                  <button style={smBtn} onClick={() => send([[stickerJobs(pack, [r._id]), "jersey"]], `the sticker of #${r.number}`)}>Print sticker</button>
                </div>
              ))}
            </div>

            <div style={secSt}>Damaged box · {inDamaged.length} in it</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button style={{ ...smBtn, opacity: inDamaged.length ? 1 : 0.4 }} disabled={!inDamaged.length} onClick={() => send([[damagedListJobs(pack), "binlist"]], "the DAMAGED box list")}>Its list</button>
              <button style={smBtn} onClick={() => send([[[damagedBoxLabel(pack)], "binticket"]], "the DAMAGED box label")}>Its label</button>
            </div>
            <div style={secSt}>Order summary · {sum.counts.passed} passed · {sum.counts.failed} failed · {sum.counts.notScanned} unscanned{sum.counts.marked ? ` · ${sum.counts.marked} marked missing` : ""}</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>{/* the count label, FAILED, MISSING and UNSCANNED; the passed list on request (the owner, 24 Nov 2026) */}
              <button style={smBtn} onClick={() => { const l = summaryJobs(pack, { station: stationLabel(pack.station), date: localDateStamp() }); if (many(l.length, "summary labels")) send([[l, "binlist"]], "the order summary"); }}>Summary (failed, unscanned, missing) · {summaryJobs(pack).length}</button>
              <button style={smBtn} onClick={() => { const l = summaryJobs(pack, { withPassed: true, station: stationLabel(pack.station), date: localDateStamp() }); if (many(l.length, "summary labels")) send([[l, "binlist"]], "the order summary with the passed list"); }}>With the passed list · {summaryJobs(pack, { withPassed: true }).length}</button>
              {/* The sign-off ticket for the order paper (the owner, 25 Nov 2026): a past order from the hub prints the way it was finished. */}
              <button style={smBtn} title="The order, the passed garments per size, the totals, and two lines to sign: Operator and Supervisor" onClick={() => send([[signoffJobs({ ...pack, final: true }, { date: localDateStamp(), time: clockNow(), station: stationLabel(pack.station), operator: pack.operator || "" }), "binlist"]], "the sign-off ticket")}>Sign-off ticket</button>
            </div>
            <div style={secSt}>Flag tickets · {flags.length}</div>
            {flags.length === 0 ? <div style={{ color: "var(--k-ink-4)" }}>No flags on this order.</div> : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {flags.length > 1 && <div><button style={smBtn} onClick={() => many(flags.length, "flag tickets") && send([[flagJobs(pack, flags.map(f => f.id), tagOf), "flag"]], "every flag ticket")}>All {flags.length} tickets</button></div>}
                {flags.slice(0, 60).map(f => (
                  <div key={f.id} style={rowSt}>
                    <div style={{ flex: 1, fontSize: 16, color: "var(--k-ink-1)" }}><strong>#{f.match?.number ?? f.detected?.number ?? "?"}</strong> {f.match?.name ?? f.detected?.name ?? ""} <span style={{ color: "var(--k-red-ink-2)" }}>{f.reason}</span></div>
                    <button style={smBtn} onClick={() => send([[flagJobs(pack, [f.id], tagOf), "flag"]], `the ticket of #${f.match?.number ?? "?"}`)}>Print ticket</button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Finish order: one look at where it stands, then confirm ─────────────────
// Confirm clears the order and the station goes back to "waiting for an
// order"; the hub keeps the order's record and sheets. Keep going closes it.
function FinishOrderModal({ orderNumber, roster, offRosterFlags = 0, scans = 0, binLists = 0, bins = [], short = [], shipWith = [], onConfirm, onCancel, onSummary }) {
  const lacking = short.reduce((t, x) => t + x.toScan + x.short.length, 0);
  // Ships with another order (the owner, 20 Nov 2026): a box that is not full stays open for it
  // (its list prints when it is full); a full one is closed now. Suggested by the box model:
  // nearly a large box by room, or near the weight cap, is full.
  const openOnes = bins.filter(b => b.open && b.count > 0);
  const [keep, setKeep] = useState(() => new Set(shipWith.length ? openOnes.filter(b => !(b.room >= 0.85 && b.boxId === "large") && !(b.heavy >= 0.9) && b.boxId !== "more").map(b => b.bin) : []));
  const confirm = useCallback(() => onConfirm([...keep]), [onConfirm, keep]);
  const count = s => roster.filter(r => r.scanned === s).length;
  const remaining = roster.filter(r => !r.scanned).length;
  const open = count("flag") + offRosterFlags + count("manual") + count("missing") + count("short");
  useEffect(() => {
    // Enter does NOT finish the order: the pedal sends Enter (since 17 Nov 2026), so one reflex press
    // finished the order (code review, low finding). Finish is a click; Enter is swallowed so it
    // reaches nothing behind the dialog. Esc keeps going.
    const h = e => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onCancel(); } if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); } };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, [confirm, onCancel]);
  const stats = [
    { label: "Passed",    value: count("pass"), color: "var(--k-green)" },
    { label: "Open",      value: open,          color: open ? "var(--k-red)" : "var(--k-ink-4)" },
    { label: "Unscanned", value: remaining,  color: remaining ? "var(--k-amber)" : "var(--k-ink-4)" },
  ];
  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--k-scrim)", zIndex: 1600, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {/* Fits the screen whatever the order (the owner, 19 Nov 2026: on a 30-box order it ran off the
          bottom and Finish could not be reached): the title, the counts and the buttons always show,
          and only the lists in the middle scroll, as one. */}
      <div style={{ background: "var(--k-card)", borderRadius: 16, border: `2px solid ${remaining ? "var(--k-amber)" : "var(--k-green)"}`, padding: "24px 32px", maxWidth: 760, width: "92vw", maxHeight: "94%", display: "flex", flexDirection: "column", textAlign: "center", boxSizing: "border-box" }}>
        <div style={{ flexShrink: 0 }}>
        <div style={{ ...titleBig, fontSize: 38, marginBottom: 8 }}>🏁 Finish order {orderNumber || "—"}?</div>
        <div style={{ fontSize: 18, color: "var(--k-ink-2)", marginBottom: 14, lineHeight: 1.4 }}>
          {remaining
            ? `${remaining} ${remaining === 1 ? "garment is" : "garments are"} unscanned. You can finish anyway; the supervisor keeps this order's record and sheets.`
            : "Every garment is scanned. The supervisor keeps this order's record and sheets."}
          {scans === 0 ? " Nothing was scanned on it." : ""}
          {shipWith.length ? ` Ships with order ${shipWith.join(", ")}: a box that is not full stays open for it.` : binLists > 0 ? " Every open box is closed and its list prints." : ""}
        </div>
        </div>
        <div style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", margin: "0 -8px", padding: "0 8px" }}>
        {lacking > 0 && (
          <div style={{ marginBottom: 12, padding: "12px 16px", borderRadius: 10, border: "2px solid var(--k-amber)", background: "var(--k-tint-amber)", textAlign: "left" }}>
            <div style={{ fontSize: 19, fontWeight: 900, color: "var(--k-amber-ink)", marginBottom: 6 }}>⚠ Before the boxes are sealed: {lacking} {lacking === 1 ? "garment is" : "garments are"} in no box</div>
            {short.map(x => (
              <div key={x.bin} style={{ fontSize: 16, color: "var(--k-ink-1)", lineHeight: 1.45 }}>
                <strong style={{ color: "var(--k-blue-ink)" }}>Box {x.bin}</strong> · {x.label}:{" "}
                {x.toScan > 0 && <><span style={{ color: "var(--k-amber-ink-2)" }}>{x.toScan} unscanned</span> ({jerseyList(x.waiting, 5)}){x.short.length > 0 ? " · " : ""}</>}
                {x.short.length > 0 && <><span style={{ color: "var(--k-red-ink-2)" }}>{[x.flagged ? `${x.flagged} flagged` : "", x.missing ? `${x.missing} missing` : ""].filter(Boolean).join(", ")}</span> ({jerseyList(x.short, 5)})</>}
              </div>
            ))}
          </div>
        )}
        {shipWith.length > 0 && openOnes.length > 0 && (
          <div style={{ marginBottom: 12, padding: "12px 14px", borderRadius: 10, border: "2px solid var(--k-sky)", background: "var(--k-tint-sky-faint)", textAlign: "left" }}>
            <div style={{ fontSize: 19, fontWeight: 900, color: "var(--k-sky-ink)", marginBottom: 4 }}>📦 Ships with order {shipWith.join(", ")}</div>
            <div style={{ fontSize: 15, color: "var(--k-ink-2)", marginBottom: 8 }}>Leave a box open if it is not full: it waits for order {shipWith.join(", ")} of the same {bins[0]?.by === "size" ? "size" : "team"}, and its list prints when it is full. Close it if it is full (45–50 lb).</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {openOnes.map(b => {
                const open = keep.has(b.bin);
                return (
                  <div key={b.bin} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", borderRadius: 8, background: "var(--k-page)" }}>
                    <span style={{ fontWeight: 800, color: "var(--k-blue-ink)", minWidth: 70 }}>Box {b.bin}</span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 16 }}>{b.label} · {b.count} {b.count === 1 ? "garment" : "garments"}{b.box ? <span style={{ color: "var(--k-ink-3)" }}> · {b.box}</span> : null}</span>
                    <button onClick={() => setKeep(k => { const n = new Set(k); n.add(b.bin); return n; })} style={{ ...btnGhost, fontSize: 14, padding: "6px 10px", borderColor: open ? "var(--k-sky)" : "var(--k-rule-2)", color: open ? "var(--k-strong)" : "var(--k-ink-3)", background: open ? "var(--k-tint-sky)" : "transparent" }}>{open ? "✓ " : ""}Leave open</button>
                    <button onClick={() => setKeep(k => { const n = new Set(k); n.delete(b.bin); return n; })} style={{ ...btnGhost, fontSize: 14, padding: "6px 10px", borderColor: !open ? "var(--k-green)" : "var(--k-rule-2)", color: !open ? "var(--k-strong)" : "var(--k-ink-3)", background: !open ? "var(--k-tint-green)" : "transparent" }}>{!open ? "✓ " : ""}Full — close it</button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {bins.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, textAlign: "left", fontSize: 17, color: "var(--k-ink-2)" }}>
            {bins.map(b => (
              <div key={b.bin} style={{ display: "flex", gap: 12, padding: "5px 14px", borderRadius: 8, background: "var(--k-field)" }}>
                <span style={{ fontWeight: 800, color: "var(--k-blue-ink)", minWidth: 62 }}>Box {b.bin}</span>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.label} · {b.count} {b.count === 1 ? "garment" : "garments"}</span>
                <span style={{ fontWeight: 800, color: "var(--k-amber-ink-2)", whiteSpace: "nowrap" }}>{b.open ? "" : "closed · "}{b.box}</span>
              </div>
            ))}
          </div>
        )}
        </div>
        <div style={{ flexShrink: 0, borderTop: "1px solid var(--k-rule)", paddingTop: 14, marginTop: 10 }}>
        <div style={{ display: "flex", justifyContent: "center", gap: 28, marginBottom: 16 }}>
          {stats.map(s => (
            <div key={s.label}>
              <div style={{ fontFamily: FONT_DISPLAY, fontSize: 52, fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 15, color: "var(--k-ink-3)", marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <button onClick={confirm} style={{ ...btnPri, fontSize: 19, padding: "14px 32px", background: remaining ? "var(--k-amber)" : "var(--k-green)", color: "var(--k-page)" }}>✓ Finish order</button>
          {onSummary && <button onClick={onSummary} title="The Packing screen: the boxes, their lists and the summary, on screen before anything prints (the owner, 24 and 25 Nov 2026)" style={{ ...btnGhost, fontSize: 17, padding: "14px 22px", borderColor: "var(--k-blue)", color: "var(--k-blue-ink-2)" }}>📋 See the summary first</button>}
          <button onClick={onCancel} style={{ ...btnGhost, fontSize: 17, padding: "14px 22px" }}>← Keep going <Kbd light>Esc</Kbd></button>
        </div>
        </div>
      </div>
    </div>
  );
}

// ── Roster complete modal ─────────────────────────────────────────────────────
// Every roster row has a status: the order is complete, or every jersey is at
// least accounted for (some with the supervisor or missing). Offers the Excel
// export and Finish order.
function RosterCompleteModal({ roster, offRosterFlags = 0, canExport = true, onExport, onPacking, onDismiss, onFinish }) {
  const count = s => roster.filter(r => r.scanned === s).length;
  const stats = [
    { label: "Passed",        value: count("pass"),    color: "var(--k-green)" },
    { label: "By hand",       value: count("manual"),  color: "var(--k-amber)" },
    { label: "With supervisor", value: count("flag") + offRosterFlags,  color: "var(--k-red)" },
    { label: "Missing",       value: count("missing"), color: "var(--k-amber)" },
  ].filter(s => s.value > 0 || s.label === "Passed");
  const open = count("flag") + offRosterFlags + count("manual") + count("missing") + count("short");
  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--k-scrim)", zIndex: 1600, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "var(--k-card)", borderRadius: 16, border: `2px solid ${open ? "var(--k-amber)" : "var(--k-green)"}`, padding: 44, maxWidth: 640, width: "90vw", textAlign: "center", boxSizing: "border-box" }}>
        <div style={{ fontSize: 64, marginBottom: 12 }}>{open ? "📋" : "🎉"}</div>
        <div style={{ fontSize: 36, fontWeight: 900, color: open ? "var(--k-amber)" : "var(--k-green)", marginBottom: 10 }}>{open ? "Every garment accounted for" : "Order complete"}</div>
        <div style={{ fontSize: 18, color: "var(--k-ink-2)", marginBottom: 8, lineHeight: 1.4 }}>
          {open ? `${open} still open — with the supervisor, entered by hand, or missing. The box stays open until they are signed off or come back.` : `All ${roster.length} garments passed.`}
        </div>
        {canExport && <div style={{ fontSize: 16, color: "var(--k-ink-3)", marginBottom: 26 }}>Review the roster before exporting.</div>}
        <div style={{ display: "flex", justifyContent: "center", gap: 22, marginBottom: 28, flexWrap: "wrap" }}>
          {stats.map(s => (
            <div key={s.label}>
              <div style={{ fontFamily: FONT_DISPLAY, fontSize: 52, fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 15, color: "var(--k-ink-3)", marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          {/* Packing is what comes next, so it is the main button; Export stays (the owner, 25 Nov 2026). */}
          {onPacking && <button onClick={onPacking} style={{ ...btnPri, fontSize: 19, padding: "14px 32px", background: "var(--k-green)", color: "var(--k-page)" }}>📦 Packing</button>}
          {canExport && <button onClick={onExport}  style={{ ...btnGhost, fontSize: 17, padding: "14px 22px" }}>⬇ Export to Excel</button>}
          <button onClick={onDismiss} style={{ ...btnGhost, fontSize: 17, padding: "14px 22px" }}>{canExport ? "Review first" : "✓ Done"}</button>
          {onFinish && <button onClick={onFinish} title="Close this order and go back to waiting for the next" style={{ ...btnGhost, fontSize: 17, padding: "14px 22px", borderColor: "var(--k-green)", color: "var(--k-green-ink)" }}>🏁 Finish order</button>}
        </div>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
// A printer failure in words an operator can act on. PowerShell's own exception text (seen at the
// stations: "Exception calling ... CategoryInfo ...") is not shown; the server log keeps it
// (code review, low finding). The hub's own messages (no answer in 30 s, printing off) pass through.
const printWords = msg => (/exception|categoryinfo|fullyqualifiederrorid|at line:|\+ ~/i.test(String(msg)) || String(msg).length > 160
  ? "the printer did not take the labels: check it is on, has labels and is connected (the details are in the server log)"
  : msg);
// A failed print in the station's words; a PowerShell dump becomes one plain sentence.
const printProblem = e => e.status === 503 ? "No label printer for this station" : `Not printed: ${e.status ? printWords(e.message) : "could not reach the server"}`;

// The whole app: sign-in, then the supervisor board, or a station with its
// order, camera, scan flow, roster table and dialogs. Every piece of state
// lives here.
export default function App() {
  const videoRef        = useRef(null);
  const canvasRef       = useRef(null);
  const motionCanvasRef = useRef(null);
  const streamRef       = useRef(null);
  const rosterRef       = useRef(null);
  const addRef          = useRef(null);
  const photoRef        = useRef(null);
  const rosterVersion   = useRef(0);     // scans that started before a roster change are ignored
  const lastScanFrameRef = useRef(null); // what the camera saw at the last scan, for the hands-free gate
  const gateRef         = useRef(createMotionGate({ log: m => console.log("[hands-free] " + m) }));

  // Three layers (src/lib/floorsettings.js; the admin panel, phase 4): the app's defaults, the
  // floor's defaults from the admin panel (kept from the last fetch), what this station's
  // operator changed. Only the last is saved here, so an untouched setting follows the floor.
  // It starts from the floor's defaults this station was USING (kept), not the newest fetched,
  // so an order open across a reload keeps its settings; the newest are taken once no order is
  // open (floorPending below). Fable's review, H2.
  const baseRef = useRef(null), ownRef = useRef(null);
  const [settings, setSettings] = useState(() => {
    const inUse = loadFloorInUse();
    baseRef.current = baseSettings(DEFAULT_SETTINGS, inUse ?? (loadSession() ? {} : cachedFloorConfig()?.defaults));
    ownRef.current = loadOwn(DEFAULT_SETTINGS, loadSettings());
    return effectiveSettings(baseRef.current, ownRef.current, DEFAULT_SETTINGS);
  });
  // A change the operator makes (Settings, the hands-free switch): each setting changed is theirs
  // from now on, until they set it back to what the floor gives (recordOwn).
  const changeSettings = useCallback(update => setSettings(prev => {
    const next = typeof update === "function" ? update(prev) : update;
    ownRef.current = recordOwn(ownRef.current, prev, next, baseRef.current);
    return next;
  }), []);
  setPrintRolls(settings);   // every print sends the roll chosen for its kind (Settings → Label printer); set during render so the first print already has it
  useEffect(() => { gateRef.current.setGrace(Math.round((Number(settings.autoScanDelay) || 0) * 5)); }, [settings.autoScanDelay]);   // 200 ms ticks
  const { scanKey, confirmKey, cancelKey, upKey, retryKey, byHandKey } = settings;

  const [savedSession]  = useState(() => { const s = loadSession(); return s && s.sessionStarted && Array.isArray(s.roster) && s.roster.length ? s : null; });
  const [resumeDecided, setResumeDecided] = useState(false);

  const [savedSignIn]   = useState(() => loadSignIn());      // who is at this station outlives any one order
  const [signedIn,           setSignedIn]           = useState(() => !!savedSignIn);
  const [sessionStarted,     setSessionStarted]     = useState(false);
  const [orderRole,          setOrderRole]          = useState("");     // "sorter" | "inspector": who this order is for, set when it starts
  const [pickedUp,           setPickedUp]           = useState(null);   // { key, hubId } when this order was parked and picked up again: a flagged jersey that comes back passes
  // Orders put aside on this PC before the server kept them go to the server, whole, as soon as it answers.
  useEffect(() => { moveLocalToServer(hub.parkOrder).then(n => { if (n) console.log(`[unfinished] moved ${n} order(s) from this PC to the server`); }).catch(() => {}); }, []);
  const replayReadRef = useRef(null);   // a replayed read standing in for the camera (development only)
  const [role,               setRole]               = useState(() => savedSignIn?.role || "");
  const [roster,             setRoster]             = useState([]);
  const [rosterFile,         setRosterFile]         = useState(null);
  const [orderNumber,        setOrderNumber]        = useState("");
  const [orderRun,           setOrderRun]           = useState(0);      // when this order was started here; the hub keeps one record per run
  // When Finish order was pressed, or null while the order is open. Saved with the order and sent
  // to the hub, so the board shows an order finished with jerseys not scanned as finished, not
  // "in progress" for ever (code review M7). "Back to this order" opens it again.
  const [finishedAt,         setFinishedAt]         = useState(null);
  const [hubRosterId,        setHubRosterId]        = useState(null);   // the hub roster this order came from, taken by this station; Finish order removes it
  const [operatorName,       setOperatorName]       = useState(() => savedSignIn?.name || "");
  const [notes,              setNotes]              = useState("");
  const [jerseyType,         setJerseyType]         = useState("");   // echl | echl_replica | sublimated | "" 
  const [orderCustomer,      setOrderCustomer]      = useState("");   // the customer, for the box's outside label and the sign-off ticket (empty: the box's team name)
  const [orderGarment,       setOrderGarment]       = useState(DEFAULT_ORDER_GARMENT);   // the order's garment kind (garments.js): the outline of "where is the damage"
  const [cameraOn,           setCameraOn]           = useState(false);
  const [cameras,            setCameras]            = useState([]);
  const [scanning,           setScanning]           = useState(false);
  const [armed,              setArmed]              = useState(false);
  const [inputMode,          setInputMode]          = useState("camera");
  const [thumb,              setThumb]              = useState(null);
  const [overlay,            setOverlay]            = useState(null);
  const [lastResult,         setLastResult]         = useState(null);
  const [lastConfirmed,      setLastConfirmed]      = useState(null);
  const [log,                setLog]                = useState([]);
  const [view,               setView]               = useState("roster");
  const [rosterFilter,       setRosterFilter]       = useState(null);
  const [rosterSort,         setRosterSort]         = useState("size");   // the roster table's order; size (the rack order) by default
  const [doneFirst,          setDoneFirst]          = useState(true);     // the status sort: done on top, or still-to-do on top
  const [sizeFilter,         setSizeFilter]         = useState("");       // the table shows one size only ("" = all)
  const [teamFilter,         setTeamFilter]         = useState("");       // … or one team only
  const [boxFilter,          setBoxFilter]          = useState("");       // … or one box only: what is in it, and what is still to go in it
  const [doneFilter,         setDoneFilter]         = useState("");       // "" all · "done" in a box (passed or by hand) · "todo" still to scan
  const [showFilters,        setShowFilters]        = useState(false);    // the funnel button's panel is open
  const [rosterSearch,       setRosterSearch]       = useState("");       // the table's search box: a jersey number, a name, or both
  const [searchKeys,         setSearchKeys]         = useState(false);    // the on-screen keys under the bar, while the cursor is in the search box
  const searchRef = useRef(null);
  const [showIssues,         setShowIssues]         = useState(false);   // the Missing · Duplicate · Flagged lists
  const [showStillOut,       setShowStillOut]       = useState(false);   // a picked-up order: what is still out and how it comes back
  const [showPacking,        setShowPacking]        = useState(false);   // the Packing screen: boxes, their lists, the summary (one screen since 25 Nov 2026)
  const [showHistory,        setShowHistory]        = useState(false);   // every jersey scanned this order, latest first   // "pass" | "flag" | "manual" | null — set by clicking a header pill
  const filterRoster = useCallback(kind => { setRosterFilter(f => (f === kind ? null : kind)); setView("roster"); }, []);
  const [error,              setError]              = useState(null);
  const [xlsxReady,          setXlsxReady]          = useState(!!window.XLSX);
  const [showSettings,       setShowSettings]       = useState(false);
  const [bigPhoto,           setBigPhoto]           = useState(null);    // a flag photo from the log, shown large
  const [showRosterComplete, setShowRosterComplete] = useState(false);
  const [idleSpells,         setIdleSpells]         = useState([]);      // { start, end, minutes } — the station sat untouched
  const [awaySpells,         setAwaySpells]         = useState([]);      // { start, end, seconds, how } — the Jersey QC screen was hidden or another window was in front (src/lib/attention.js)
  const [saveOk, setSaveOk] = useState(true);     // did the last save of the order reach this PC's storage?
  const [hubOk, setHubOk] = useState(null);       // did the last progress report reach the hub? null = never tried
  const [newRosters, setNewRosters] = useState([]);   // rosters the supervisor sent while this order was running
  const [orderSetBy, setOrderSetBy] = useState(null); // { orderNumber, by } — the supervisor named this order from the board
  const knownRosterIds = useRef(null);                 // what was already waiting when this order started
  const [handsFreePaused, setHandsFreePaused] = useState(false);   // operator paused hands-free; camera stays on, the scan key still scans
  // After a flag the jersey is usually still on the table, and hands-free read
  // it again as soon as the flagged screen closed (the owner, 17 Nov 2026). So a
  // flag turns hands-free off until the operator scans the next jersey with the
  // pedal; that scan's confirm arms it again as usual.
  const [waitPedal, setWaitPedal] = useState(false);
  const waitPedalRef = useRef(false);
  const pedalNext = useCallback(() => { waitPedalRef.current = true; setWaitPedal(true); gateRef.current.disarm(); setArmed(false); }, []);
  const pedalDone = useCallback(() => { if (waitPedalRef.current) { waitPedalRef.current = false; setWaitPedal(false); } }, []);
  // Self-check: after the app is corrected, the next 5 jerseys are read twice
  // and must agree before a green (src/lib/vigilance.js). checksLeft mirrors
  // the counter for the badge and the saved session.
  const vigilRef = useRef(createVigilance({ log: m => console.log(m) }));
  const [checksLeft, setChecksLeft] = useState(0);
  const [noJersey, setNoJersey] = useState("");      // a scan-key press that read nothing: a quiet notice for a moment, no screen
  const [retried, setRetried] = useState(null);      // the last read dropped by Retry: { number, name }, shown until the next scan so a retry never passes for a pass
  const noJerseyTimer = useRef(null);
  const sortingRef = useRef(false);   // a sorter: no double-check after a mistake (kept in a ref for the scan's callbacks)
  const noteMistake = useCallback(kind => { if (sortingRef.current) return; vigilRef.current.noteMistake(kind); setChecksLeft(vigilRef.current.remaining); }, []);
  // The operator's own regime: full inspection of the next 5 after a defect,
  // a spot check after 10 clean (createInspection). `inspect` mirrors it for
  // the header pill and the green screen.
  const inspectRef = useRef(createInspection({ log: m => console.log(m) }));
  const [inspect, setInspect] = useState(() => inspectRef.current.current());
  const syncInspect = useCallback(() => setInspect(inspectRef.current.current()), []);
  // Browser full screen (hides tabs and address bar). Browsers allow it only
  // from a click, so it is a header button; F11 does the same in Chrome.
  const [isFullscreen, setIsFullscreen] = useState(() => typeof document !== "undefined" && !!document.fullscreenElement);
  useEffect(() => {
    const on = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  const [fsHint, setFsHint] = useState(null);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) { document.exitFullscreen?.().catch(() => {}); return; }
    const p = document.documentElement.requestFullscreen?.();
    if (!p) { setFsHint("Press F11 for full screen"); return; }
    p.catch(() => setFsHint("The browser refused — press F11 instead"));
    setTimeout(() => setFsHint(null), 6000);
  };
  const [showBinSetup,       setShowBinSetup]       = useState(false);
  // A supervisor's sign-in is the board and nothing else: no station, no scanning, no saved order to resume.
  const [showSupervisor,     setShowSupervisor]     = useState(() => savedSignIn?.role === "supervisor");
  const [binMap,             setBinMap]             = useState(null);
  const [firstScanTime,      setFirstScanTime]      = useState(null);

  // Bins closed as full: [{ bin, key, label, ids, closedAt }] (roster.js). The
  // bin map only says which bin is open for a team or size; a done row in a
  // closed bin stays in it.
  const [closedBins,         setClosedBins]         = useState([]);
  const [shipWith,           setShipWith]           = useState([]);   // the orders this one ships with (from the order form)
  const [carried,            setCarried]            = useState([]);   // boxes an earlier ship-with order left open, taken by this one: [{ bin, key, label, by, items, orders, from }]
  // Open boxes whose list was printed from the Packing screen: { [bin]: ids of the jerseys in it then }
  // (saved in the session, not sent to the hub). Finish order prints no list for an open box that has
  // not changed since, so the floor never gets a list twice.
  const [listPrinted,        setListPrinted]        = useState({});
  const [binPrint,           setBinPrint]           = useState(null);    // { status: "printing" | "done" | "error" | "off", text } — the last bin closed or list printed
  // The bin of a roster row, or of a log entry's match (a copy of the row from
  // when it was scanned): the live row decides, so a jersey in a closed bin
  // shows that bin everywhere.
  const rowById        = useMemo(() => new Map(roster.map(r => [r._id, r])), [roster]);
  const binOf          = useCallback(row => binOfRow(binMap, closedBins, row && typeof row === "object" ? rowById.get(row._id) || row : row), [binMap, closedBins, rowById]);
  // Every bin with what is in it and the box that many jerseys go in (boxes.js).
  // The box by room and weight (boxmodel.js). The model is the hub's, fitted
  // to every "which box did it go in" answer from every station; the last one
  // seen is kept on this PC for when the hub is away.
  const [boxModel, setBoxModel] = useState(() => { try { const m = JSON.parse(localStorage.getItem("jerseyqc.boxmodel") || "null"); return m?.units && m?.caps ? { ...BOX_PRIOR, ...m } : BOX_PRIOR; } catch { return BOX_PRIOR; } });
  // Fetched from the hub at sign-in and at every order start.
  useEffect(() => {
    if (!signedIn) return;
    hub.boxModel().then(r => { if (r?.model?.units && r.model.caps) { setBoxModel({ ...BOX_PRIOR, ...r.model }); try { localStorage.setItem("jerseyqc.boxmodel", JSON.stringify(r.model)); } catch { /* private window */ } } }).catch(() => {});
  }, [signedIn, sessionStarted]);
  // The weight is the operator's call until a scale is connected to the station
  // (owner, 11 Nov 2026): with `boxWeights` off there is no cap, no lb and no warning.
  const boxCap     = settings.boxWeights ? Number(settings.boxWeightCap) || BOX_PRIOR.weightCap : 0;
  const stitched   = jerseyTypeOf(jerseyType)?.construction !== "sublimated";   // no type set: the heavier guess
  const boxOf      = useCallback(rows => predictBox(binCounts(rows, stitched), { ...boxModel, weightCap: boxCap || Infinity }), [boxModel, boxCap, stitched]);
  // A carried box (left open by an earlier ship-with order) holds that order's jerseys too.
  const carriedIn  = useCallback(bin => carried.filter(c => c.bin === bin).flatMap(c => (c.items || []).map(x => ({ ...x, scanned: "pass", carried: true }))), [carried]);
  const inBox      = useCallback(bin => [...binContents(roster, binMap, closedBins, bin), ...carriedIn(bin)], [roster, binMap, closedBins, carriedIn]);
  // (The orders in a box, for its count label, "264247 (12) + 264248 (8)", come from printjobs.js ordersInBox.)
  const openBins   = useMemo(() => binEntries(roster, binMap).map(e => { const rows = inBox(e.bin), b = boxOf(rows), from = [...new Set(carried.filter(c => c.bin === e.bin).map(c => c.from))]; return { ...e, count: rows.length, box: b?.label || "", boxId: b?.id || "", weight: b?.weight || 0, heavy: b?.heavy || 0, room: b?.room ?? 0, by: b?.by || "", open: true, from, carriedCount: carriedIn(e.bin).length }; }), [roster, binMap, inBox, boxOf, carried, carriedIn]);
  const closedList = useMemo(() => closedBins.map(c => { const rows = binContents(roster, binMap, closedBins, c.bin), b = boxOf(rows); return { bin: c.bin, label: c.label, count: rows.length, box: c.box || b?.label || "", weight: b?.weight || 0, open: false, closedAt: c.closedAt }; }), [roster, binMap, closedBins, boxOf]);
  const heavyBin   = openBins.find(b => b.heavy >= 0.95) || null;   // an open bin at the weight limit
  // What each open box lacks before it is sealed (roster.js): for the Packing and Finish screens.
  const shortList  = useMemo(() => shortages(roster, binMap, closedBins), [roster, binMap, closedBins]);
  const shortByBox = useMemo(() => Object.fromEntries(shortList.map(x => [x.bin, x])), [shortList]);
  const flaggedRows = useMemo(() => roster.filter(r => r.scanned === "flag"), [roster]);   // what is in the DAMAGED box
  // What the matcher sees. A flagged garment is still out from its first flag (the co-op, 26 Nov
  // 2026; before, only on an order picked up again), so a garment back from repair is open again.
  // On an order picked up again it can go green (the owner, 19 Nov 2026); on an order that was
  // not parked it is `live`: offered on the list only, last and a tap only (tapOnly, holdBack),
  // because the garment just flagged is usually still under the camera and the pedal must
  // never pass it (code review H3). A missing garment that turns up is always open to the
  // matcher. Both carry `cameBack`, so the green and the list say so.
  const scanRoster = useMemo(() => {
    const why = id => String(log.find(l => l.status === S_FLAGGED && l.match?._id === id && !l.resolution)?.reason || "").replace(/ — found after it passed$/, "");
    return roster.map(r => (r.scanned === "flag" ? { ...r, scanned: false, cameBack: { was: "flag", reason: why(r._id), ...(pickedUp ? {} : { live: true }) } }
      : r.scanned === "missing" || r.scanned === "short" ? { ...r, cameBack: { was: "missing" } } : r));
  }, [roster, pickedUp, log]);
  // The three lists behind the "Missing · Duplicate · Flagged" button. A duplicate is a flag
  // whose reason says so; flagged is every roster row out for a flag (its newest reason) and
  // every open flag with no row (not on the roster, no size tag), duplicates apart.
  const issues = useMemo(() => {
    const open = log.filter(l => l.status === S_FLAGGED && !l.resolution);
    const isDup = l => /^duplicate/i.test(String(l.reason || ""));
    const dups = open.filter(isDup);
    const reasonOf = id => log.find(l => l.status === S_FLAGGED && l.match?._id === id)?.reason || "";
    const flagged = [
      ...flaggedRows.map(r => ({ key: "r" + r._id, jersey: r, reason: String(reasonOf(r._id)).replace(/ — found after it passed$/, "") })),
      ...open.filter(l => !isDup(l) && l.match && l.match._id === undefined).map(l => ({ key: "e" + l.id, jersey: l.match, reason: String(l.reason || "").replace(/ — operator typed.*$/, "") })),
    ];
    return { missing: roster.filter(r => r.scanned === "missing" || r.scanned === "short"), dups, flagged };
  }, [log, roster, flaggedRows]);
  const binSummary = useMemo(() => [...closedList, ...openBins].sort((a, b) => binOrder(a.bin, b.bin)), [closedList, openBins]);
  // How many boxes each team or size is expected to fill from its open box on
  // (the box model on every jersey of it not yet in a closed box), for the
  // labels printed when the order starts: BOX 5.1, 5.2, 5.3. An estimate; a
  // box whose label was not printed gets it at Box full (`boxLabelled`).
  const boxPlan    = useMemo(() => binEntries(roster, binMap).map(e => {
    const rows = roster.filter(r => r.scanned !== "flag" && binOfRow(binMap, closedBins, r) === e.bin);
    const prev = carried.filter(c => c.bin === e.bin);
    return { ...e, total: rows.filter(r => !r.scanned).length, boxes: Math.max(1, boxOf([...rows, ...carriedIn(e.bin)])?.boxes || 1), carried: prev.reduce((t, c) => t + (c.items || []).length, 0), from: prev.map(c => c.from).join(", ") };
  }), [roster, binMap, closedBins, boxOf, carried, carriedIn]);
  // A carried box has its label inside already: only the boxes after it print.
  const boxPlanLabels = useMemo(() => { const has = new Set(carried.map(c => c.bin)); return binLabels(roster, binMap, { orderNumber, boxes: Object.fromEntries(boxPlan.map(e => [e.bin, e.boxes])) }).filter(l => !has.has(String(l.bin))); }, [roster, binMap, orderNumber, boxPlan, carried]);
  // The box lists print as a table on a tall roll (boxRoll 2 x 3 in, 2 x 4 in) and as pages of rows on the others
  // (printjobs.js boxListLabels). Placed after boxPlan: the outside label reads the plan.
  const tallBoxRoll = useMemo(() => isTallTicket(labelDots(settings.boxRoll)), [settings.boxRoll]);
  // `final`: Finish order is printing, so the outside label's "of N" is the boxes that have garments, not the plan's.
  const listOf     = useCallback((bin, label, final = false) => {
    const p = { orderNumber, roster, binMap, closedBins, carried, customer: orderCustomer, plan: boxPlan, final };
    const b = packBoxes(p).find(x => x.bin === bin) || { bin, label, rows: inBox(bin) };
    return boxListLabels(p, { ...b, label: label ?? b.label }, { tall: tallBoxRoll });
  }, [orderNumber, roster, binMap, closedBins, carried, orderCustomer, boxPlan, inBox, tallBoxRoll]);
  const [boxAuto,     setBoxAuto]     = useState(false);   // the box screen is open for a new order on a station with boxAutoPrint on: its labels print by themselves
  const [showPrint,   setShowPrint]   = useState(false);   // the Print menu
  const [showBlanks,  setShowBlanks]  = useState(false);   // the blank-jersey counting screen
  const [boxLabelled, setBoxLabelled] = useState([]);   // the boxes whose label has been printed (saved in the session)
  const boxesLabelled = useCallback(() => setBoxLabelled(prev => [...new Set([...prev, ...boxPlanLabels.map(l => l.bin)])]), [boxPlanLabels]);

  // ── The sticker on every pass ─────────────────────────────────────────────
  // A pass (a green confirmed, a pick from the list, a by-hand pass) sets
  // `lastConfirmed`; each new one prints a sticker — the bin and the team or
  // size — on this station's label printer through the hub, without holding
  // the operator up. `sticker` is how the last one went, shown on the Last
  // passed strip with a Reprint button. Nothing prints on a flag, or on a
  // resumed order (lastConfirmed is not saved).
  const [sticker, setSticker] = useState(null);   // { id, status: "done" | "none" | "error", printer, message }
  const stickerPrinted = useRef(null);            // the log id of the last pass sent to the printer
  const printSticker = useCallback(entry => {
    if (!entry?.match) return Promise.resolve();
    const label = jerseyLabel(entry.match, binMap, { orderNumber });
    return hub.printLabels([label], { kind: "jersey", station: stationId() })
      .then(r => setSticker({ id: entry.id, status: "done", printer: r.printer }))
      .catch(e => setSticker({ id: entry.id, status: e.status === 503 ? "none" : "error", message: e.status ? e.message : "could not reach the server" }));
  }, [binMap, orderNumber]);
  // Each new pass prints its sticker once, when stickers are on.
  useEffect(() => {
    if (!settings.stickers || !lastConfirmed || stickerPrinted.current === lastConfirmed.id) return;
    stickerPrinted.current = lastConfirmed.id;
    printSticker(lastConfirmed);
  }, [lastConfirmed, settings.stickers, printSticker]);

  // ── The ticket on every flag ──────────────────────────────────────────────
  // The newest log entry, when it is a flag, prints a ticket — the mirror of
  // the sticker, black down the left so the packer never boxes it — once
  // (`ticketPrinted`); a resumed order starts with its last entry already
  // counted, so nothing reprints. `ticket` is how the last one went, shown on
  // the GO TO SUPERVISOR screen with a Reprint button. Its own switch in
  // Settings (`flagTickets`), apart from the stickers'.
  const [ticket, setTicket] = useState(null);      // { id, status: "done" | "none" | "error", printer, message }
  const ticketPrinted = useRef(new Set());       // the log ids of the flags sent to the printer
  const heldTickets = useRef(new Set());         // flags whose ticket waits on "where is the damage"
  const printTicket = useCallback(entry => {
    if (!entry) return Promise.resolve();
    // A flag that did not ask where (Others, No size tag, a sorter's…) still draws the order's
    // garment on a tall ticket, not a hockey jersey on a pants order (review, 24 Nov 2026).
    const label = flagLabel({ ...entry, garment: entry.garment || garmentOf(entry.match, orderGarment) }, binMap, { orderNumber, station: stationId(), tag: severityOf(entry.reason).tag });
    return hub.printLabels([label], { kind: "flag", station: stationId() })
      .then(r => setTicket({ id: entry.id, status: "done", printer: r.printer }))
      .catch(e => setTicket({ id: entry.id, status: e.status === 503 ? "none" : "error", message: e.status ? e.message : "could not reach the server" }));
  }, [binMap, orderNumber, orderGarment]);
  const newestEntry = log[0];
  const locatingUp = overlay?.mode === "locate";   // "where is the damage" is up: the left panel's ways out are greyed
  // Each new flag in the log prints its tickets once, when flag tickets are on.
  // A flag born resolved (fixed at the station, the owner, 25 Nov 2026) prints none:
  // the garment stays in its box with no ticket.
  useEffect(() => {
    // A flag still being located (where is the damage) waits: it prints when its spots are on it.
    if (!settings.flagTickets || !newestEntry || newestEntry.status !== S_FLAGGED || newestEntry.resolution || newestEntry.locating || ticketPrinted.current.has(newestEntry.id)) return;
    ticketPrinted.current.add(newestEntry.id);
    printTicket(newestEntry);
    // No DAMAGED box label on the first flag any more (the owner, 19 Nov 2026): the
    // DAMAGED box is the same box all day. It still prints from the Boxes dialog.
  }, [newestEntry, settings.flagTickets, printTicket]);
  // A flag held back while "where is the damage" is up prints when it is let go, wherever it
  // is in the log by then (review round 3, 24 Nov 2026: a Missing or Un-check from the roster
  // put a new log line on top of it and its ticket never printed). The ticket follows the
  // entry, not its place: every `locating` entry is remembered, and printed once when cleared.
  useEffect(() => {
    const held = heldTickets.current;
    for (const l of log) {
      if (!l) continue;
      if (l.locating) { held.add(l.id); continue; }
      if (!held.size || !held.has(l.id)) continue;
      held.delete(l.id);
      if (!settings.flagTickets || l.status !== S_FLAGGED || ticketPrinted.current.has(l.id)) continue;
      ticketPrinted.current.add(l.id);
      printTicket(l);
    }
  }, [log, settings.flagTickets, printTicket]);
  // A flag whose "where is the damage" screen was left any way but Done or Skip (another
  // button replaced it, a new scan came over it) is let go unmarked, so its ticket prints
  // through the effect above (review, 24 Nov 2026: "exactly one ticket per flag").
  useEffect(() => {
    const keep = overlay?.mode === "locate" ? overlay.entryId : null;
    const stale = log.filter(l => l?.locating && l.id !== keep);
    if (!stale.length) return;
    const ids = new Set(stale.map(l => l.id));
    const put = l => { if (!l || !ids.has(l.id)) return l; const { locating: _locating, ...rest } = l; return { ...rest, spots: [] }; };
    setLog(prev => prev.map(put)); setLastResult(put);
  }, [overlay, log]);
  // What the supervisor screen shows for its entry: how the ticket went, or that it is printing.
  const ticketFor = entryId => !settings.flagTickets || !entryId ? null : ticket?.id === entryId ? ticket : { id: entryId, status: "printing" };
  const reprintTicket = entryId => { const e = log.find(l => l.id === entryId); if (e) { setTicket(null); printTicket(e); } };
  const scannedRows    = roster.filter(r => r.scanned && r.scanned !== false);
  const remaining      = roster.filter(r => !r.scanned).length;
  // Hands-free runs only while it is on in Settings, not paused by the operator,
  // and the order still has jerseys to scan — a finished order must not keep
  // reading the empty table.
  const handsFree      = !!settings.autoScan && !handsFreePaused && remaining > 0;

  const triggerRef = useRef(null);
  const scanBusyRef = useRef(false);   // true from the first moment of a scan until its result is on screen (code review M1; see doRunScan)
  const armRef     = useRef(() => {});   // re-arm hands-free from inside a scan (set once armAutoScan exists)
  const passCount      = roster.filter(r => r.scanned === "pass").length;
  const offRosterList  = log.filter(l => l.status === S_FLAGGED && (l.match?.offRoster || l.match?.noRow) && !l.resolution);
  const offRosterFlags = offRosterList.length;
  // What a picked-up order is still waiting for, grouped (the Still out button and list).
  const stillOut = useMemo(() => { const g = outGroups(outList(roster, log)); return { ...g, total: g.flag.length + g.missing.length + g.extra.length }; }, [roster, log]);   // jerseys that are not on the roster, or flagged with no row (no size tag), have no row to count
  const flagCount      = roster.filter(r => r.scanned === "flag").length + offRosterFlags;
  const manualCount    = roster.filter(r => r.scanned === "manual").length;
  const teamNames      = useMemo(() => [...new Set(roster.map(r => r.team).filter(Boolean))], [roster]);
  const canSupervise   = role === "supervisor";
  const sorting        = role === "sorter";   // sorts only: no quick look, no full inspection, no double-check (the owner, 19 Nov 2026)
  useEffect(() => { sortingRef.current = sorting; }, [sorting]);
  const openCount      = roster.filter(r => r.scanned === "flag" || r.scanned === "missing" || r.scanned === "short").length;
  const rosterComplete = roster.length > 0 && remaining === 0;
  // The roster table: the header pill's status, then the size, team, box and
  // done / to do filters, in the chosen order. A box is the one the jersey is
  // IN (a closed box too), or the open one it will go in.
  const shownRows = useMemo(() => sortRoster(roster.filter(r =>
    (!rosterFilter || r.scanned === rosterFilter)
    && rosterMatches(r, rosterSearch)
    && (!sizeFilter || String(r.size ?? "").trim() === sizeFilter)
    && (!teamFilter || String(r.team ?? "").trim() === teamFilter)
    && (!boxFilter || String(binOf(r) ?? "") === boxFilter)
    && (!doneFilter || (doneFilter === "done" ? (r.scanned === "pass" || r.scanned === "manual") : !r.scanned))),
  rosterSort, binMap, { doneFirst, binOf }), [roster, rosterFilter, rosterSearch, sizeFilter, teamFilter, boxFilter, doneFilter, rosterSort, binMap, doneFirst, binOf]);
  // Rate and time left from working time (src/lib/pace.js): a night with the
  // order left open on screen is not working time, so a resumed order does not
  // come back with an ETA in the thousands.
  const rosterCols     = useMemo(() => displayColumns(roster), [roster]);
  // The same columns as one array for the whole order, so a pass (a new
  // roster array) does not rebuild every row of the table.
  const rosterColsKey  = rosterCols.join("\u0001");
  const rosterColsStable = useMemo(() => (rosterColsKey ? rosterColsKey.split("\u0001") : []), [rosterColsKey]);
  const extraCols      = useMemo(() => extraColumns(roster), [roster]);
  const keyLabel       = formatKey(scanKey);
  const showResume     = !!savedSession && !resumeDecided && !sessionStarted && !canSupervise;

  useEffect(() => { saveSettings(settings); saveOwn(ownRef.current); }, [settings]);
  // The floor's defaults changed (the admin panel; hub.js fetches them when a report's answer
  // carries a new version): taken at once when no order is open, else when it closes, never in
  // the middle of one. What the operator changed here stays.
  const [floorPending, setFloorPending] = useState(() => cachedFloorConfig()?.defaults ?? null);   // the newest fetched, taken once no order is open
  useEffect(() => {
    const on = e => setFloorPending(e.detail?.defaults || {});
    window.addEventListener("jqc-floorconfig", on);
    return () => window.removeEventListener("jqc-floorconfig", on);
  }, []);
  // An order is open while it runs AND while a saved one waits for Resume (Fable's review, H2:
  // the station reports, and so fetches, while the Resume question is up).
  const orderOpen = sessionStarted || (!!savedSession && !resumeDecided);
  useEffect(() => {
    if (!floorPending || orderOpen) return;
    const next = baseSettings(DEFAULT_SETTINGS, floorPending);
    saveFloorInUse(floorPending);
    if (JSON.stringify(next) !== JSON.stringify(baseRef.current)) {
      baseRef.current = next;
      setSettings(effectiveSettings(next, ownRef.current, DEFAULT_SETTINGS));
    }
    setFloorPending(null);
  }, [floorPending, orderOpen]);
  // Light or dark (settings.theme): every screen is built on the colour tokens since phase 8
  // (26 Nov 2026), so the theme is applied everywhere. What stays dark on purpose draws its own
  // colours: the camera picture and what is written on it, the photo viewer and the wall view.
  useEffect(() => { applyTheme(settings.theme || "light"); }, [settings.theme]);

  // SheetJS from the CDN, once, for reading Excel rosters and writing the exports.
  useEffect(() => {
    if (window.XLSX) return;
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    s.onload  = () => setXlsxReady(true);
    s.onerror = () => setError("Excel support could not be downloaded — CSV rosters still work.");
    document.head.appendChild(s);
  }, []);

  useEffect(() => { return () => { streamRef.current?.getTracks().forEach(t => t.stop()); }; }, []);

  // Persist the session after every change; warn before leaving mid-order.
  useEffect(() => {
    if (!sessionStarted) return;
    const saved = saveSession({ sessionStarted, role, roster, rosterFile, orderNumber, orderRun, hubRosterId, operatorName, notes, jerseyType, garment: orderGarment, customer: orderCustomer, log, binMap, closedBins, shipWith, carried, boxLabelled, listPrinted, firstScanTime, idleSpells, awaySpells, pickedUp, finishedAt, orderRole: orderRole || kindOfRole(role), vigil: vigilRef.current.state(), inspect: inspectRef.current.state() });
    const t = setTimeout(() => setSaveOk(prev => (prev === saved ? prev : saved)), 0);   // said in the header when it fails
    return () => clearTimeout(t);
  }, [sessionStarted, role, roster, rosterFile, orderNumber, orderRun, hubRosterId, operatorName, notes, jerseyType, orderGarment, orderCustomer, log, binMap, closedBins, shipWith, carried, boxLabelled, listPrinted, firstScanTime, idleSpells, awaySpells, pickedUp, finishedAt, orderRole, checksLeft, inspect]);

  // An order with scans in it asks "Leave site?" before the tab closes or reloads.
  useEffect(() => {
    if (!sessionStarted || log.length === 0) return;
    const h = e => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [sessionStarted, log.length]);

  // Report to the hub (if one is running) so a supervisor can see this station —
  // from sign-in on, so a station waiting for its first order is already on the
  // board and can be sent one. Supervisors on their own screen do not report.
  // What this station tells the hub, sent now. The 5-second report below uses it, and so does
  // New order, which waits for it to arrive before it clears the order (code review M16).
  const reportNow = useCallback(() => hub.report(stationId(), snapshotOf({ operatorName, role, orderNumber: sessionStarted ? orderNumber : "", orderRun: sessionStarted ? orderRun : 0, notes, jerseyType, garment: orderGarment, customer: orderCustomer, rosterFile: sessionStarted ? rosterFile : null, roster: sessionStarted ? roster : [], log: sessionStarted ? log : [], lastConfirmed: sessionStarted ? lastConfirmed : null, binMap, closedBins: sessionStarted ? closedBins : [], binSummary: sessionStarted ? binSummary : [], idleSpells, awaySpells, finishedAt: sessionStarted ? finishedAt : null })), [sessionStarted, operatorName, role, orderNumber, orderRun, notes, jerseyType, orderGarment, orderCustomer, rosterFile, roster, log, lastConfirmed, binMap, closedBins, binSummary, idleSpells, awaySpells, finishedAt]);
  useEffect(() => {
    if (!signedIn || (role === "supervisor" && !sessionStarted)) return;
    const send = () => reportNow()
      .then(r => {
        setHubOk(true);
        // The supervisor named this order from the board: take the number; the next report confirms it.
        if (sessionStarted && r?.setOrder?.orderNumber && r.setOrder.orderNumber !== orderNumber) { setOrderNumber(r.setOrder.orderNumber); setOrderSetBy(r.setOrder); }
      })
      .catch(() => setHubOk(false));
    send();
    const t = setInterval(send, 5000);
    return () => clearInterval(t);
  }, [signedIn, sessionStarted, role, orderNumber, reportNow]);

  // Open the complete modal once every row is accounted for (after at least one scan).
  useEffect(() => {
    if (!(roster.length > 0 && remaining === 0 && firstScanTime)) return;
    const t = setTimeout(() => setShowRosterComplete(true), 0);
    return () => clearTimeout(t);
  }, [remaining, roster.length, firstScanTime]);

  // ── Session lifecycle ─────────────────────────────────────────────────────
  const applyRoster = useCallback((parsed, fileName, { keepLog = false, binBy = "team", carried: boxesIn = [] } = {}) => {
    rosterVersion.current++;
    setRoster(parsed.map(r => ({ ...r, scanned: false })));
    setRosterFile(fileName);
    if (!keepLog) {
      setLog([]); setLastResult(null); setLastConfirmed(null); setFirstScanTime(null); setIdleSpells([]); setAwaySpells([]);
      // A new order takes the floor's inspection counts as they are now (the admin panel,
      // phase 7; blank = the app's own 5 / 10 / 5) and its checklist (none saved = CHECKS); the
      // order keeps them to its end, a resume too.
      const counts = cachedFloorConfig()?.inspection || {};
      inspectRef.current = createInspection({ full: counts.full, every: counts.every, checks: cachedFloorConfig()?.checks, log: m => console.log(m) }); syncInspect();
      const was = vigilRef.current.state();   // a self-check under way carries on into the new order, as before
      vigilRef.current = createVigilance({ checks: counts.selfCheck, log: m => console.log(m) });
      vigilRef.current.load({ ...was, remaining: Math.min(was.remaining, vigilRef.current.checks), checks: vigilRef.current.checks }); setChecksLeft(vigilRef.current.remaining);
    }
    setThumb(null); setOverlay(null); setShowRosterComplete(false); waitPedalRef.current = false; setWaitPedal(false);
    // Every order has a box: one team or size, or an order that is not
    // sorted, starts in Box 1.1. The box screen shows on every order, as the
    // box labels are printed from it.
    // A box an earlier ship-with order left open is this order's open box for its team or size
    // (it keeps its number: its BOX label is already inside it); the others number around it.
    const field = binBy === "size" ? "size" : binBy === "team" ? "team" : "all";
    const existing = boxesIn.length ? { ...Object.fromEntries(boxesIn.map(b => [b.key, b.bin])), ...(field === "size" ? { __by: "size" } : field === "all" ? { __by: "all" } : {}) } : {};
    const bins = buildBinMap(parsed, existing, binBy);
    setClosedBins([]); setBinPrint(null); setListPrinted({}); setBoxLabelled(boxesIn.map(b => b.bin));   // every roster row starts unscanned: no box is closed; a carried box has its label
    setBoxFilter(""); setDoneFilter(""); setRosterSearch("");    // the last order's box is not this order's
    setBinMap(binCount(bins) > 0 ? bins : null); setShowBinSetup(binCount(bins) > 0); setBoxAuto(settings.boxAutoPrint === true);   // only a station that switched it on prints the labels by itself (the owner, 25 Nov 2026)
  }, [syncInspect, settings.boxAutoPrint]);

  // The order belongs to the station, not to a person: whoever is signed in
  // here now continues it under their own name.
  const resumeSession = useCallback((from = null) => {
    const s = from || savedSession;
    setPickedUp(s.pickedUp || null); setOrderRole(kindOfSession(s));
    setRoster(s.roster); setRosterFile(s.rosterFile || null);
    setOrderNumber(s.orderNumber || ""); setOrderRun(s.orderRun || s.savedAt || 0); setFinishedAt(s.finishedAt || null); setHubRosterId(s.hubRosterId || null); setNotes(s.notes || ""); setJerseyType(s.jerseyType || "");
    // A flag left on "where is the damage" (the page reloaded there, or the order was parked)
    // is cleared, unmarked: its ticket never printed, so it prints now, once, wherever it is in
    // the log (the held-ticket effect). Every other flag printed when it happened.
    const wasLocating = (s.log || []).filter(l => l?.locating).map(l => l.id);
    const loaded = (s.log || []).map(l => { if (!l?.locating) return l; const { locating: _locating, ...rest } = l; return { ...rest, spots: [] }; });
    heldTickets.current = new Set(wasLocating);
    setLog(loaded); setOrderGarment(orderGarmentOf(s.garment)); setOrderCustomer(s.customer || ""); setBinMap(modernBins(s.binMap || null)); setClosedBins(s.closedBins || []); setShipWith(s.shipWith || []); setCarried(s.carried || []); setBoxLabelled(s.boxLabelled || []); setListPrinted(s.listPrinted || {}); setFirstScanTime(s.firstScanTime || null); setIdleSpells(s.idleSpells || []); setAwaySpells(s.awaySpells || []);
    ticketPrinted.current = new Set((s.log || []).filter(l => l && !l.locating).map(l => l.id));   // printed when they happened
    vigilRef.current.load(s.vigil); setChecksLeft(vigilRef.current.remaining);
    inspectRef.current.load(s.inspect); syncInspect();
    // An order that was finished (Finish order) and not yet cleared by New order comes back
    // on its done screen, so New order or "Back to this order" decides it: without it the
    // station scanned on while the board called the order finished (review of phase 2).
    if (s.finishedAt) setFinished({ status: "none", text: `This order was finished at ${new Date(s.finishedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}. Print the box lists again if they are missing, or start a new order.` });
    setSessionStarted(true); setResumeDecided(true);
  }, [savedSession, syncInspect]);

  const discardSession = useCallback(() => { clearSession(); setResumeDecided(true); }, []);
  // The saved order is of the other kind (a sorter's, and an inspector signed in, or the other way
  // round): it goes, whole, to the unfinished orders for its own role, and the station is free.
  const [asideErr, setAsideErr] = useState("");
  const setAsideSaved = useCallback(async () => {
    const s = savedSession; if (!s) return;
    const st = stationId(), summary = outOf(s.roster), kind = kindOfSession(s);
    const session = { ...s, orderRole: kind, hubRosterId: null, finishedAt: null };   // put aside unfinished: not finished
    setAsideErr("");
    try { await hub.parkOrder({ id: s.pickedUp?.hubId || undefined, station: st, order: s.orderNumber, run: s.orderRun || s.savedAt || 0, operator: s.operatorName || "", jerseyType: s.jerseyType || "", kind: kind === "sorter" ? "sorter" : "", ...summary, out: outList(s.roster, s.log), session }); }
    catch (e) { setAsideErr(`It could NOT be saved on the server (${e.message}). Nothing was lost: try again, or sign out.`); return; }   // kept here until the server has it
    if (s.hubRosterId) hub.removeRoster(s.hubRosterId).catch(() => {});
    clearSession(); setResumeDecided(true);
  }, [savedSession]);

  // Clears the order; the operator stays signed in and goes straight to order setup.
  // The camera pane unmounts with the roster, so the stream must be released too.
  const resetOrder = useCallback(() => {
    clearSession();
    streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null;   // stopCamera is declared below
    gateRef.current.disarm(); setArmed(false); setCameraOn(false);
    rosterVersion.current++;
    setSessionStarted(false); setResumeDecided(true); setPickedUp(null); setOrderRole("");
    setRoster([]); setRosterFile(null); setOrderNumber(""); setOrderRun(0); setFinishedAt(null); setHubRosterId(null); setNotes(""); setOrderGarment(DEFAULT_ORDER_GARMENT); setOrderCustomer(""); setLog([]); setBinMap(null); setClosedBins([]); setShipWith([]); setCarried([]); keptOpen.current = new Set(); setBoxLabelled([]); setListPrinted({}); setBinPrint(null); setShowPacking(false); setFirstScanTime(null); setIdleSpells([]); setAwaySpells([]); setNewRosters([]); setOrderSetBy(null); setHandsFreePaused(false);
    setLastResult(null); setLastConfirmed(null); setOverlay(null); setThumb(null); setShowRosterComplete(false); setRetried(null);
    // the Packing screen, opened on the done screen, must not come back over the next order (review, 24 Nov 2026; setShowPacking above)
    waitPedalRef.current = false; setWaitPedal(false);
  }, []);

  // Finish order: the confirm screen, then back to waiting for an order.
  // ── Bins: full, closed, listed ─────────────────────────────────────────────
  // The 2 x 1 in roll takes at most 100 labels a request: send them in turn,
  // cut between lists only, so the hub can re-page a whole list for a tall roll (listChunks).
  const printOnTicketRoll = useCallback((labels, kind) => {
    const chunks = kind === "binlist" ? listChunks(labels, 100) : Array.from({ length: Math.ceil(labels.length / 100) }, (_, i) => labels.slice(i * 100, i * 100 + 100));
    if (!chunks.length) return Promise.reject(new Error("nothing to print"));
    // → { printer, count }: `count` is the hub's, the labels that really came out
    // (on a tall roll a list prints on fewer labels than were sent).
    return chunks.reduce((p, c) => p.then(t => hub.printLabels(c, { kind, station: stationId() }).then(r => ({ ...r, count: t.count + (Number.isFinite(r?.count) ? r.count : c.length) }))), Promise.resolve({ count: 0 }));
  }, []);
  // The order as printjobs.js takes it, right now (the Print menu's `printPack` is the same with more).
  const packNow = useMemo(() => ({ orderNumber, roster, binMap, closedBins, flags: log.filter(l => l.status === S_FLAGGED) }), [orderNumber, roster, binMap, closedBins, log]);
  // What an open box's printed list carries (packing.js): its jerseys and, with `withNotIn`, the ones its
  // NOT IN BOX list names. Print list sends that list with the group's last box (isLastBox); Finish order
  // with every open box that has jerseys. Kept in `listPrinted` when it prints (review, 25 Nov 2026).
  const listIdsOf = useCallback((bin, withNotIn) => listIds(inBox(bin), withNotIn ? notInBox(packNow, bin) : []), [inBox, packNow]);
  // Each open box with the state of its list: "none" (never printed from Packing), "printed" (what
  // Print list would print now is what it printed) or "changed" (it would print something else now).
  const packOpen = useMemo(() => openBins.map(b => {
    const was = listPrinted[b.bin];
    return { ...b, listState: !Array.isArray(was) ? "none" : listUnchanged(was, listIdsOf(b.bin, isLastBox(packNow, b.bin))) ? "printed" : "changed" };
  }), [openBins, listPrinted, listIdsOf, packNow]);
  // What Finish order prints: the list of every bin still open with something in it, each with its
  // NOT IN BOX list (the open box is the group's last), the DAMAGED list, and the order summary
  // (count label, FAILED, MISSING; the owner, 24 Nov 2026: "print on request and after every order is finished").
  // `again` (the done screen's "Print the box lists again"): every list, the ones printed from Packing too
  // (the Fable check, 25 Nov 2026: "again" went through the skip and left those boxes out).
  const finishListsOf = useCallback(again => !settings.binLists || !binMap ? []
    : [...openBins.flatMap(b => !again && b.count > 0 && listUnchanged(listPrinted[b.bin], listIdsOf(b.bin, true)) ? []   // printed from the Packing screen and nothing on it changed since, its NOT IN BOX list included: not again (the owner, 25 Nov 2026)
         : [...finishNotInBoxJobs(packNow, b.bin, b.label, b.count), ...(b.count > 0 ? listOf(b.bin, b.label, true) : [])]),   // an empty open box: what its team lacks, under the name of the box on the floor, only when Box full did not print it already (printjobs.js; the third check, 24 Nov 2026). Before: an empty open box still says what its team lacks (review, 24 Nov 2026: a team flagged or marked missing after its last full box)
       ...damagedListJobs(packNow),   // and what is in the DAMAGED box
       ...summaryJobs(packNow, { station: stationLabel(stationId()), date: localDateStamp() }),
       // The sign-off ticket for the order paper goes LAST, so it comes off the printer first (the owner, 25 Nov 2026)
       ...signoffJobs({ ...packNow, carried, customer: orderCustomer, final: true }, { date: localDateStamp(), time: clockNow(), station: stationLabel(stationId()), operator: operatorName })],
  [settings.binLists, binMap, openBins, packNow, listOf, listPrinted, listIdsOf, carried, orderCustomer, operatorName]);
  const finishLists = useMemo(() => finishListsOf(false), [finishListsOf]);
  // The summary on the Packing screen and its printing.
  const summaryNow = useMemo(() => orderSummary(packNow), [packNow]);
  // Pass rate, flag rate and pace, as the order sheet's Summary has them. From the station's
  // own log; the board's order view takes them from the hub's events of the order, which are
  // this log as the snapshot sent it, so the two agree.
  const summaryStats = useMemo(() => summariseLog(log), [log]);
  const summaryLabelCount = useMemo(() => summaryJobs(packNow).length, [packNow]);
  const printSummary = useCallback(withPassed => {
    const labels = summaryJobs(packNow, { withPassed, station: stationLabel(stationId()), date: localDateStamp() });
    const what = withPassed ? "Order summary with the passed list" : "Order summary";
    if (labels.length > 30 && !window.confirm(`Print ${labels.length} labels?`)) return;   // a 500-jersey order is dozens of labels (review, 24 Nov 2026)
    setBinPrint({ status: "printing", text: what });
    printOnTicketRoll(labels, "binlist")
      .then(res => setBinPrint({ status: "done", text: `${what} printed: ${labels.length} ${labels.length === 1 ? "label" : "labels"} on ${res.printer}` }))
      .catch(e => setBinPrint({ status: "error", text: `${what}. ${printProblem(e)}` }));
  }, [packNow, printOnTicketRoll]);
  // What a box is in, said by the operator, teaches the box model (Box full and Print list both ask).
  const teachBox = useCallback((bin, rows, boxId, guess) => {
    if (!boxId || rows.length <= 1) return;
    hub.boxAnswer({ counts: binCounts(rows, stitched), box: boxId, suggested: guess?.id || "", station: stationId(), order: String(orderNumber || ""), bin })
      .then(res => { if (res?.model) { setBoxModel(res.model); try { localStorage.setItem("jerseyqc.boxmodel", JSON.stringify(res.model)); } catch { /* private window */ } } })
      .catch(() => {});   // the hub is away: this one answer is not learnt
  }, [stitched, orderNumber]);
  // `boxId`: the box the operator said the bin is going in (null for a
  // one-piece bin: a bag). It goes on the list, is kept with the closed bin,
  // and is the answer the box model learns from.
  const binFull = useCallback((bin, boxId = null) => {
    // Jerseys of this team or size still to scan: none, and the box just closed
    // is the last one it needs, so no next box's label (the owner, 19 Nov 2026).
    const left = roster.filter(x => !x.scanned && binOfRow(binMap, closedBins, x) === bin).length;
    const r = closeBin(roster, binMap, closedBins, bin); if (!r) return;
    const rows = [...binContents(roster, r.binMap, r.closed, bin), ...carriedIn(bin)], guess = boxOf(rows);
    const box  = BOX_CHOICES.find(c => c.id === boxId)?.label || guess?.label || "";
    setBinMap(r.binMap); setClosedBins(r.closed.map(c => c === r.entry ? { ...c, box } : c));
    teachBox(bin, rows, boxId, guess);   // the hub is away: the box is closed all the same, this one answer is not learnt
    setListPrinted(p => { if (!(bin in p)) return p; const n = { ...p }; delete n[bin]; return n; });   // closed: the closed entry prints its own list
    // The group's last box (nothing of it left to scan) carries what is NOT in it and why (the owner, 24 Nov 2026).
    // The closed entry keeps the rows that list named (`notIn`) once it has printed, so Finish order prints
    // it again only when it changed since (finishNotInBoxJobs in printjobs.js; the third check, 24 Nov 2026).
    const packAfter = { orderNumber, roster, binMap: r.binMap, closedBins: r.closed, flags: log.filter(l => l.status === S_FLAGGED) };
    const notInIds = left === 0 ? notInBox(packAfter, bin).map(x => x.row._id) : null;
    const notIn = left === 0 ? notInBoxJobs(packAfter, bin, r.entry.label) : [];
    // The order as it is after the close, so the outside label numbers the box as a closed one (printjobs.js boxFaceLabel).
    const lists = [...notIn, ...boxListLabels({ ...packAfter, carried, customer: orderCustomer, plan: boxPlan }, { bin, label: r.entry.label, rows }, { tall: tallBoxRoll })];
    const what  = `Box ${bin} closed with ${rows.length} ${rows.length === 1 ? "garment" : "garments"}${carriedIn(bin).length ? ` (${carriedIn(bin).length} from order ${[...new Set(carriedIn(bin).map(x => x.order))].join(", ")})` : ""}. ${left ? `${r.entry.label} now goes in Box ${r.newBin}` : `Nothing of ${r.entry.label} is left to scan`}`;
    if (!settings.binLists) { setBinPrint({ status: "off", text: `${what}. Box lists are switched off in Settings.` }); return; }
    setBinPrint({ status: "printing", text: what });
    // The next box's label prints here only when it was not among the ones
    // printed at the start (the order needed more boxes than estimated, or
    // the labels were never printed).
    const fresh = left > 0 && !boxLabelled.includes(r.newBin);
    printOnTicketRoll(lists, "binlist")
      .then(res => !fresh ? res : hub.printLabels([{ bin: r.newBin, label: r.entry.label, by: binFieldOf(r.binMap), count: 0, orderNumber: String(orderNumber || "") }], { kind: "binticket", station: stationId() })
        .then(res2 => { setBoxLabelled(prev => [...new Set([...prev, r.newBin])]); return { ...res2, count: res.count }; }))
      .then(res => {
        if (notInIds) setClosedBins(prev => prev.map(c => c.bin === bin ? { ...c, notIn: notInIds } : c));   // printed: Finish order need not print it again unless it changes
        setBinPrint({ status: "done", text: `${what}. Printed ${res.count} list ${res.count === 1 ? "label" : "labels"} for Box ${bin}${copiesNote(lists)}${fresh ? ` and the Box ${r.newBin} label` : ""} on ${res.printer}` });
      })
      .catch(e => setBinPrint({ status: "error", text: `${what}. ${printProblem(e)}` }));
  }, [roster, binMap, closedBins, orderNumber, settings.binLists, printOnTicketRoll, boxOf, teachBox, boxLabelled, carriedIn, carried, tallBoxRoll, orderCustomer, boxPlan, log]);
  // Print list (Packing screen): the list of what is in an OPEN box now, with its NOT IN BOX list when it is
  // the group's last box (as boxListJobs does). Nothing closes and no next label prints. `boxId` is what the
  // operator said the box is in (teaches the model, as Box full does); null: just print. The jerseys it
  // named are kept in `listPrinted`, so the row says "List printed" and Finish order skips it unless it changed.
  // `printOpenLists` prints the lists of `boxes` (open boxes from `packOpen`) in one job and keeps what each carried.
  const printOpenLists = useCallback((boxes, what) => {
    if (!settings.binLists) { setBinPrint({ status: "off", text: `${what}: box lists are switched off in Settings.` }); return; }
    const jobs = boxes.map(b => { const last = isLastBox(packNow, b.bin); return { bin: b.bin, ids: listIdsOf(b.bin, last), lists: [...(last ? notInBoxJobs(packNow, b.bin, b.label) : []), ...listOf(b.bin, b.label)] }; });
    const lists = jobs.flatMap(j => j.lists);
    setBinPrint({ status: "printing", text: what });
    printOnTicketRoll(lists, "binlist")
      .then(res => {
        setListPrinted(p => ({ ...p, ...Object.fromEntries(jobs.map(j => [j.bin, j.ids])) }));
        setBinPrint({ status: "done", text: `${what} printed: ${res.count} ${res.count === 1 ? "label" : "labels"}${copiesNote(lists)} on ${res.printer}. ${boxes.length === 1 ? "The box stays" : "The boxes stay"} open.` });
      })
      .catch(e => setBinPrint({ status: "error", text: `${what}. ${printProblem(e)}` }));
  }, [settings.binLists, packNow, listIdsOf, listOf, printOnTicketRoll]);
  const printBoxList = useCallback((bin, boxId = null) => {
    const b = packOpen.find(x => x.bin === bin); if (!b || b.count === 0) return;
    const rows = inBox(bin);
    teachBox(bin, rows, boxId, boxOf(rows));
    printOpenLists([b], `Box ${bin} list`);
  }, [packOpen, inBox, boxOf, teachBox, printOpenLists]);
  // "Print every list": every open box with jerseys whose list is not printed with what it would carry now.
  const printAllLists = useCallback(() => {
    const todo = packOpen.filter(b => b.count > 0 && b.listState !== "printed");
    if (todo.length) printOpenLists(todo, `${todo.length} box ${todo.length === 1 ? "list" : "lists"}`);
  }, [packOpen, printOpenLists]);
  const reprintBinList = useCallback(bin => {
    const c = closedBins.find(x => x.bin === bin); if (!c) return;
    const lists = [...(isLastBox(packNow, bin) ? notInBoxJobs(packNow, bin, c.label) : []), ...listOf(bin, c.label)];
    if (!lists.length) return;
    setBinPrint({ status: "printing", text: `Box ${bin} list` });
    printOnTicketRoll(lists, "binlist")
      .then(res => setBinPrint({ status: "done", text: `Box ${bin} list printed again: ${res.count} ${res.count === 1 ? "label" : "labels"}${copiesNote(lists)} on ${res.printer}` }))
      .catch(e => setBinPrint({ status: "error", text: `Box ${bin} list. ${printProblem(e)}` }));
  }, [closedBins, listOf, printOnTicketRoll, packNow]);

  const [showFinish, setShowFinish] = useState(false);
  // Finish order prints the list of every open box and then STAYS on the
  // "order is done" screen (`finished`: how the printing went). The order is
  // cleared by "New order" there, not before, so the lists can be printed
  // again and a reload still has the order.
  const [finished,   setFinished]   = useState(null);    // { status: "printing" | "done" | "error" | "none", text }
  // The end of "where is the damage" (Done or Skip): see actions.locateDone.
  const finishLocate = useCallback((o, spots) => {
    const marked = cleanSpots(spots);
    const put = l => { if (!l || l.id !== o.entryId) return l; const { locating: _locating, ...rest } = l; return { ...rest, garment: o.garment, spots: marked }; };
    setLog(prev => prev.map(put)); setLastResult(put);
    setOverlay({ ...o, mode: "supervisor", spots: marked });
  }, []);
  // A flag still on "where is the damage" is let go unmarked first (Skip), so its ticket
  // prints here before the order can be cleared (review round 3, 24 Nov 2026).
  const askFinish    = useCallback(() => { if (overlay?.mode === "locate") finishLocate(overlay, []); setShowRosterComplete(false); setShowFinish(true); }, [overlay, finishLocate]);
  // Boxes left open at Finish order for a ship-with order: their lists do not print (they are not full).
  const keptOpen = useRef(new Set());
  const printFinishLists = useCallback((note = "", again = false) => {
    const lists = (again ? finishListsOf(true) : finishLists).filter(l => !keptOpen.current.has(String(l.box ?? l.bin))).map(l => l.kind === "signoff" ? { ...l, date: localDateStamp(), time: clockNow() } : l);   // a box kept open for the ship-with order: neither its list nor its NOT IN BOX list (review, 24 Nov 2026); the sign-off ticket says when it is printed
    const n = lists.length, pre = note ? note + " " : "";
    if (!n) { setFinished({ status: "none", text: pre + (settings.binLists ? "No other box has anything in it: no list to print." : "Box lists are switched off in Settings.") }); return; }
    setFinished({ status: "printing", text: `${pre}Printing the box lists…` });
    printOnTicketRoll(lists, "binlist")
      .then(r => setFinished({ status: "done", text: `${pre}Box lists printed: ${r.count} ${r.count === 1 ? "label" : "labels"}${copiesNote(lists)} on ${r.printer}` }))
      .catch(e => setFinished({ status: "error", text: `${pre}The box lists were NOT printed. ${printProblem(e)}. Fix the printer and print them again.` }));
  }, [finishLists, finishListsOf, settings.binLists, printOnTicketRoll]);
  // `keep`: the boxes the operator left open for the ship-with order. They go to the hub
  // with everything in them (this order's and what they carried) and the orders they serve.
  const finishOrder  = useCallback(async (keep = []) => {
    setShowFinish(false);
    setFinishedAt(Date.now());
    const kept = new Set(keep.map(String));
    let note = "";
    // A ship-with order sends its whole set of open boxes at every Finish, also none, so a second
    // Finish replaces what the first left on the hub instead of adding to it (code review M15).
    if (kept.size || shipWith.length) {
      const boxes = openBins.filter(b => kept.has(String(b.bin))).map(b => {
        const prev = carried.filter(c => c.bin === b.bin), own = binContents(roster, binMap, closedBins, b.bin);
        return { orders: [...new Set([...prev.flatMap(c => c.orders || []), String(orderNumber), ...shipWith].map(String).filter(Boolean))], by: binFieldOf(binMap),
          key: Object.entries(binMap || {}).find(([k, v]) => k !== "__by" && v === b.bin)?.[0] || "", label: b.label, bin: b.bin,
          items: [...prev.flatMap(c => c.items || []), ...own.map(r => ({ order: String(orderNumber), number: r.number, name: r.name, size: r.size, team: r.team }))] };
      });
      // run: finished again, the same boxes are replaced on the hub, not added twice (M15).
      try {
        const r = await hub.leaveBoxesOpen({ boxes, station: stationId(), order: String(orderNumber), run: orderRun });
        const taken = r?.taken || [];   // taken by the next order since the last Finish: in that order's hands now
        if (kept.size) note = `${boxes.length} ${boxes.length === 1 ? "box is" : "boxes are"} left open for order ${shipWith.join(", ")} (${boxes.map(b => "Box " + b.bin).join(", ")}).`;
        if (taken.length) note += ` ${taken.map(t => `Box ${t.bin} was already taken by order ${t.order || "?"}`).join("; ")}: it is in that order's hands, nothing to do for it here.`;
      }
      catch (e) {
        if (kept.size) { kept.clear(); note = `The boxes could NOT be left open on the server (${e.message}): their lists print now, like a full box.`; }
        else note = `The server could not be told that no box is left open (${e.message}): boxes an earlier Finish of this order left open may still be offered to the next order.`;
      }
    }
    keptOpen.current = kept;
    printFinishLists(note);
  }, [printFinishLists, openBins, carried, roster, binMap, closedBins, orderNumber, orderRun, shipWith]);
  // New order clears the order from this station, so it first sends one last report and waits
  // for the hub to answer: with the hub away the station held the only full copy and New order
  // deleted it (code review M16; Finish later already waited the same way). The hub away, the
  // done screen says so and keeps the order; "Start a new order anyway" is a click, never a key.
  const [unsent, setUnsent] = useState("");
  const [sendingLast, setSendingLast] = useState(false);
  const newOrder     = useCallback(async (anyway = false) => {
    if (anyway !== true) {
      setSendingLast(true);
      // At most 10 s: a server that takes the call and never answers must not leave the screen stuck.
      try { await Promise.race([reportNow(), new Promise((_, no) => setTimeout(() => no(new Error("no answer in 10 s")), 10000))]); }
      catch (e) { setSendingLast(false); document.activeElement?.blur?.(); setUnsent(`The server did not answer (${e.message}), so it may not have this order's last scans. New order would delete the order from this station. Check the network and press New order again.`); return; }
      setSendingLast(false);
    }
    setUnsent("");
    setFinished(null); setShowPrint(false);
    if (hubRosterId) hub.removeRoster(hubRosterId).catch(() => {});   // the hub keeps the order's record and sheets in its ledger
    if (pickedUp) { dropOrder(pickedUp.key).catch(() => {}); if (pickedUp.hubId) hub.dropUnfinished(pickedUp.hubId).catch(() => {}); }   // finished: out of the unfinished pile, and its file off the server's disk
    resetOrder();
  }, [resetOrder, hubRosterId, pickedUp, reportNow]);
  // ── Finish later (23, 24): the order, whole, goes to the server's disk; any station picks it up ──
  const [showPark, setShowPark] = useState(false);
  const [parkErr,  setParkErr]  = useState("");
  const [parking,  setParking]  = useState(false);
  const parkOrder = useCallback(async () => {
    const st = stationId(), summary = outOf(roster);
    const kind = orderRole || kindOfRole(role);
    const session = { sessionStarted: true, role, orderRole: kind, roster, rosterFile, orderNumber, orderRun, hubRosterId: null, operatorName, notes, jerseyType, garment: orderGarment, customer: orderCustomer, log, binMap, closedBins, shipWith, carried, boxLabelled, listPrinted, firstScanTime, idleSpells, awaySpells, vigil: vigilRef.current.state(), inspect: inspectRef.current.state() };
    setParking(true); setParkErr("");
    try { await hub.parkOrder({ id: pickedUp?.hubId || undefined, station: st, order: orderNumber, run: orderRun, operator: operatorName, jerseyType, kind: kind === "sorter" ? "sorter" : "", ...summary, out: outList(roster, log), session }); }
    catch (e) { setParkErr(`The order could NOT be saved on the server (${e.message}). Nothing was lost: it is still open here. Try again, or call the supervisor.`); return; }
    finally { setParking(false); }
    if (pickedUp?.key) dropOrder(pickedUp.key).catch(() => {});   // an old copy on this PC, from before the server kept them
    if (hubRosterId) hub.removeRoster(hubRosterId).catch(() => {});
    setShowPark(false); setParkErr("");
    resetOrder();
  }, [roster, role, orderRole, rosterFile, orderNumber, orderRun, hubRosterId, operatorName, notes, jerseyType, orderGarment, orderCustomer, log, binMap, closedBins, shipWith, carried, boxLabelled, listPrinted, firstScanTime, idleSpells, awaySpells, pickedUp, resetOrder]);
  // Pick an unfinished order up again, at any station: the server says this station has it
  // now (another station gets "open on Station N"), then sends the whole order. One put
  // aside before the server kept them is taken from this PC, or rebuilt from the order's record.
  const pickUpOrder = useCallback(async ({ hubEntry }) => {
    const mine = kindOfRole(role);
    if (!hubEntry) return;
    if (kindOfEntry(hubEntry) !== mine) throw new Error(`Order ${hubEntry.order} is for ${mine === "sorter" ? "an inspector" : "a sorter"}.`);
    try { await hub.takeUnfinished(hubEntry.id, stationId(), operatorName); }
    catch (e) {
      if (e.status === 409) throw new Error(`Order ${hubEntry.order} is open on ${stationLabel(e.body?.openOn?.station)} right now (${e.body?.openOn?.operator || "someone"}). One station works an order: ask the supervisor to free it if that is wrong.`);
      throw new Error(`Could not reach the server (${e.message}). Try again in a moment.`);
    }
    try {
      const got = await hub.unfinishedOrder(hubEntry.id).catch(e => (e.status === 404 ? null : Promise.reject(e)));
      const entry = got?.entry || hubEntry;
      let session = got?.session ? applyCheckOff({ session: got.session }, entry).session : null;
      if (!session) {
        const old = await listOrders().then(a => a.find(r => r.key === entry.key)).catch(() => null);
        if (old) session = applyCheckOff(old, entry).session;
        else {
          const r = await hub.orders(entry.order);
          const o = (r.orders || []).find(x => `${x.station}|${x.order}|${x.run || 0}` === entry.key) || (r.orders || [])[0];
          if (!o) throw new Error("the server has no record of it any more");
          const p = packFromRecord(o);
          session = { sessionStarted: true, roster: p.roster, rosterFile: o.rosterFile || null, orderNumber: String(o.order), orderRun: o.run || Date.now(), notes: o.notes || "", jerseyType: o.jerseyType || "", garment: o.garment || rosterGarment(p.roster) || "", customer: o.customer || "",
            log: p.flags.map(f => ({ ...f, status: S_FLAGGED })), binMap: p.binMap, closedBins: p.closedBins, boxLabelled: [], firstScanTime: o.firstSeen || null, idleSpells: [], awaySpells: [] };
        }
      }
      resumeSession({ ...session, orderRole: kindOfSession(session) === "sorter" || entry.kind === "sorter" ? "sorter" : "inspector", pickedUp: { key: entry.key, hubId: entry.id } });
    } catch (e) {
      hub.releaseUnfinished(hubEntry.id).catch(() => {});   // not opened after all: free it for another station
      throw new Error(`Order ${hubEntry.order} could not be opened: ${e.message}`);
    }
  }, [resumeSession, role, operatorName]);
  // The order on this station, as the Print menu takes it (printjobs.js).
  const printPack = useMemo(() => !sessionStarted || !roster.length ? null
    : { orderNumber, roster, binMap, closedBins, carried, flags: log.filter(l => l.status === S_FLAGGED), station: stationId(), planLabels: boxPlanLabels, plan: boxPlan, finished: !!finishedAt, garment: orderGarment, customer: orderCustomer, operator: operatorName },   // finished: on the done screen a jersey never scanned is short (isLastBox)
  [sessionStarted, roster, orderNumber, binMap, closedBins, carried, log, boxPlanLabels, boxPlan, finishedAt, orderGarment, orderCustomer, operatorName]);
  const flagTag = useCallback(reason => severityOf(reason).tag, []);
  // The list of what is in the DAMAGED box, whenever the inspector asks for it.
  const printDamagedList = useCallback(() => {
    const lists = damagedListJobs(printPack);
    if (!lists.length) { setBinPrint({ status: "off", text: "Nothing is in the DAMAGED box." }); return; }
    setBinPrint({ status: "printing", text: "DAMAGED box list" });
    printOnTicketRoll(lists, "binlist")
      .then(res => setBinPrint({ status: "done", text: `DAMAGED box list printed: ${res.count} ${res.count === 1 ? "label" : "labels"} on ${res.printer}` }))
      .catch(e => setBinPrint({ status: "error", text: `DAMAGED box list. ${printProblem(e)}` }));
  }, [printPack, printOnTicketRoll]);

  // Sign out leaves the station, not the order: an unfinished order stays saved
  // on this PC and is offered to the next person who signs in here (a mistaken
  // Sign out mid-order used to wipe it). The page reloads so nothing of the
  // previous operator lingers in memory.
  const signOut = useCallback(() => {
    if (sessionStarted && log.length > 0 && !window.confirm(`Sign out? Order ${orderNumber || "—"} stays on this station — the next person to sign in here can resume it.`)) return;
    clearSignIn();
    // Free the station at once (another PC may sign in on it), but keep it on the board with its
    // day tally and the flags still on their way to the supervisor: deleting it lost both (code review M8).
    hub.signOutStation(stationId()).catch(() => {});
    window.location.reload();
  }, [sessionStarted, log.length, orderNumber]);

  // ── Camera ────────────────────────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    gateRef.current.disarm(); setArmed(false);
    setCameraOn(false);
  }, []);

  const startCamera = useCallback(async () => {
    setError(null);
    try {
      const size = { width: { ideal: 1280 }, height: { ideal: 720 } };
      const fallback = { facingMode: "environment", ...size };
      let stream;
      if (settings.cameraId) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: settings.cameraId }, ...size }, audio: false });
        } catch (e) {
          // The saved camera is not on this machine (another PC, unplugged, or the browser gave it a new id):
          // use whatever camera there is rather than refusing to start.
          if (e?.name !== "OverconstrainedError" && e?.name !== "NotFoundError") throw e;
          console.log(`[camera] saved camera not found (${e.name}) — using the default camera`);
          stream = await navigator.mediaDevices.getUserMedia({ video: fallback, audio: false });
        }
      } else {
        stream = await navigator.mediaDevices.getUserMedia({ video: fallback, audio: false });
      }
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      stream.getVideoTracks().forEach(t => { t.onended = () => { setError("Camera disconnected — check the USB cable, then press Start Camera."); stopCamera(); }; });
      setCameraOn(true);
      try { const devs = await navigator.mediaDevices.enumerateDevices(); setCameras(devs.filter(d => d.kind === "videoinput")); } catch { /* no device list; the dropdown stays on default */ }
    } catch (e) {
      setError(e?.name === "NotFoundError" || e?.name === "OverconstrainedError"
        ? "No camera found on this PC. Plug one in, or choose another in Settings."
        : "Camera access denied. Click the camera icon in your browser's address bar.");
      // List the cameras anyway so Settings can offer whatever is here.
      try { const devs = await navigator.mediaDevices.enumerateDevices(); setCameras(devs.filter(d => d.kind === "videoinput")); } catch { /* no device list */ }
    }
  }, [settings.cameraId, stopCamera]);

  // ── Core scan ─────────────────────────────────────────────────────────────
  const doRunScan = useCallback(async (base64, dataUrl, recapture = null, { auto = false } = {}) => {
    // One scan at a time (code review of 23 Nov 2026, M1). The `scanning` state only reaches doTriggerScan
    // after a re-render, so two presses in the same moment both saw "not scanning" and both scanned, and the
    // second result replaced the first without recording it. This ref is set at once and checked first.
    if (scanBusyRef.current) return;
    scanBusyRef.current = true;
    const version = rosterVersion.current;
    if (!firstScanTime) setFirstScanTime(Date.now());
    gateRef.current.disarm(); setArmed(false);
    setScanning(true); setRetried(null);
    setThumb(dataUrl);
    playTone("scan");

    const readOne = async (b64, url) => {
      if (REPLAY_ON && replayReadRef.current) return replayReadRef.current;   // replay: yesterday's read stands in for the camera (src/lib/replay.js)
      // Send a smaller frame than the camera gives: same read, faster answer.
      // The model settings: .env.local's (config.js), with the admin panel's on top on development
      // and testing (phase 6; /config never hands them to a production station). Read at each scan.
      const ai = { model: MODEL, effort: EFFORT, thinking: THINKING, maxPx: SEND_MAX_PX, ...(cachedFloorConfig()?.ai || {}) };
      const sendB64 = await frameForUpload(url, ai.maxPx).catch(() => b64);
      const t0 = Date.now();
      const r = await readJersey({ base64: sendB64, model: ai.model, effort: ai.effort, thinking: ai.thinking, station: stationId(), orderNumbers: scanRoster.filter(x => !isDone(x)).map(x => x.number) });
      console.log(`Read in ${Date.now() - t0} ms: #${r.number}${r.number_complete ? "" : "?"} ${r.name}${r.name_complete ? "" : "…"}${r.laid_flat ? "" : " [not flat]"} (${r.jersey_colour || "?"}${r.trim_colour ? "/" + r.trim_colour : ""}; sleeves: ${r.sleeve_numbers.join(",") || "—"}; number ${r.number_position || "?"}${r.obstruction ? "; " + r.obstruction : ""}) — tokens in ${r.usage?.input_tokens}, out ${r.usage?.output_tokens}`);
      return r;
    };
    const matchOf = d => holdBack(matchRead(scanRoster, d));   // the read as the matcher's options: src/lib/scanpolicy.js

    let detected = { name: "", number: "" };
    let apiError = null;
    let m = null;
    let check = null;   // { agreed, second } when this scan was double-checked
    try {
      detected = await readOne(base64, dataUrl);
      m = matchOf(detected);
      // A jersey that is not the right way up reads 6 as 9, 18 as 81. When the
      // number read has such a twin open on the roster, turn the frame upright
      // and read it again; the upright read wins when it is whole and differs
      // only the way a turn would, otherwise the operator is asked with both.
      // The model mixes up left and right, so a turn can land upside down:
      // keep turning by what the latest read says, up to two more times.
      if (uprightRotation(detected.orientation) && turnMatters(detected, scanRoster) && version === rosterVersion.current) {   // the rows the matcher sees (scanRoster), not the raw roster (code review, low finding)
        let frame = dataUrl, total = 0, d2 = detected;
        for (let i = 0; i < 3 && uprightRotation(d2.orientation); i++) {
          const turn = uprightRotation(d2.orientation); total = (total + turn) % 360;
          const turned = await rotateDataUrl(frame, turn); if (!turned) break;
          console.log(`[upright] #${d2.number} on a garment that is ${d2.orientation} — turning the frame ${turn}° and reading again`);
          frame = turned; d2 = await readOne(turned.split(",")[1], turned);
        }
        if (d2 !== detected) {
          const r = settleTurned(detected, m, d2, matchOf(d2));
          if (!r.agreed) console.log("[upright] the turned read is not settled — asking the operator");
          detected = r.read || d2; m = r.match;
        }
      }
      // Self-check: checks are owed after a mistake, so read a second frame and
      // let the two reads settle the screen between them — green only when
      // both say the same jersey. A silent empty-table read is left alone.
      if (!sortingRef.current && vigilRef.current.active && detected.jersey_present !== false && version === rosterVersion.current) {
        const again = recapture ? recapture() : null;
        console.log(`[self-check] ${vigilRef.current.remaining} to go — reading ${again ? "a second frame" : "the frame again"}`);
        const d2 = await readOne(again?.base64 || base64, again?.dataUrl || dataUrl);
        const r = reconcile(detected, m, d2, matchOf(d2));
        check = { agreed: r.agreed, second: d2 };
        if (!r.agreed) console.log("[self-check] the two reads disagree — asking the operator");
        m = r.match;
        // Agreed: the screen and the log take the read the match came from (reconcile's `read`, the
        // fuller one), and its picture. The second read used to be kept whichever matched (code review, low finding).
        if (r.agreed && r.read) { detected = r.read; if (r.read === d2 && again) dataUrl = again.dataUrl; }
      }
    } catch (e) {
      apiError = e.message;
    }

    if (version !== rosterVersion.current) { scanBusyRef.current = false; setScanning(false); return; }   // roster changed mid-flight
    let smallThumb, photo;
    try {
      setThumb(dataUrl);
      smallThumb = await shrinkDataUrl(dataUrl);
      // The photo a flag will carry to the supervisor: the frame cropped to the jersey.
      photo = await cropDataUrl(dataUrl, detected.jersey_box, 640);
    } finally {
      // The scan counts as busy until here, not before the two picture steps above (code review M1): "scanning"
      // used to go false first, and a pedal press or SCAN click while the pictures were made started a new scan
      // whose result replaced this one unrecorded. Nothing below waits, so this and the result screen
      // (setOverlay) land in the same render: there is no moment with neither a scan running nor a result up.
      scanBusyRef.current = false; setScanning(false);
    }
    // `shown` remembers what the app first put on the screen for this jersey,
    // so a correction later can be told apart from the operator answering a
    // question: a green overridden is a mistake, a pick from a list is not.
    const scanObj  = { id: Date.now(), detected, thumb: dataUrl, smallThumb, photo, check, shown: null };
    // Which screen this read gets: src/lib/scanpolicy.js (screenFor), shared with the operator simulation.
    const sc = screenFor({ error: apiError, read: detected, match: m });
    // Nothing readable at all — an empty table, or fabric and hands with no
    // name or number in view. There is nothing to enter, so never a red
    // screen: an empty table is learned for hands-free, a pedal press gets a
    // quiet notice for a moment, and the gate re-arms. Nothing in the log.
    if (sc.mode === null) {
      console.log(`[${auto ? "hands-free" : "scan"}] ${sc.empty ? "nothing on the table — learned it" : "no name or number in view"} — waiting for a garment`);
      if (sc.empty) gateRef.current.learnTable(lastScanFrameRef.current);
      if (!auto) { setNoJersey(sc.empty ? "No garment in view" : "No name or number in view"); clearTimeout(noJerseyTimer.current); noJerseyTimer.current = setTimeout(() => setNoJersey(""), 2200); }
      armRef.current();
      return;
    }
    // A jersey reached the screen: one of the owed checks is spent on it (not on a failed read).
    if (!apiError && vigilRef.current.scanDone()) setChecksLeft(vigilRef.current.remaining);
    scanObj.shown = sc.shown;
    setOverlay({ mode: sc.mode, scan: scanObj, ...(sc.match ? { match: sc.match } : {}), ...(sc.candidates ? { candidates: sc.candidates } : {}), ...(sc.reason !== undefined ? { reason: sc.reason } : {}), ...(sc.twinOf ? { twinOf: sc.twinOf } : {}), ...(sc.title ? { title: sc.title } : {}) });
    if (sc.tone) playTone(sc.tone);
  }, [scanRoster, firstScanTime]);

  // ── Camera scan trigger ───────────────────────────────────────────────────
  // The current camera frame as { base64, dataUrl }, rotated as the settings
  // say; null when the camera is not live. Used for the scan, the self-check's
  // second frame (doRunScan's `recapture`) and the damage photo.
  const captureFrame = useCallback(() => {
    const video = videoRef.current, canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth) return null;
    const track = streamRef.current?.getVideoTracks?.()[0];
    if (!track || track.readyState !== "live") return null;
    lastScanFrameRef.current = sampleFrame(video, motionCanvasRef.current);
    const w = video.videoWidth, h = video.videoHeight;
    const rot = Number(settings.rotation) || 0, swap = rot === 90 || rot === 270;
    canvas.width = swap ? h : w; canvas.height = swap ? w : h;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(rot * Math.PI / 180);
    ctx.drawImage(video, -w / 2, -h / 2, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    return { base64: dataUrl.split(",")[1], dataUrl };
  }, [settings.rotation]);

  // Is any dialog, full-screen panel or picker showing over the station? ONE list, so no screen is forgotten.
  // A NEW DIALOG MUST BE ADDED HERE (to dialogOverResult), or the pedal (Enter) and hands-free will scan behind it,
  // and the result would sit hidden under the dialog until the next pedal press confirmed a jersey nobody saw.
  // Rule: no scan while any dialog is open (code review of 23 Nov 2026, finding H1, and the floor's first rule:
  // no wrong green, no jersey passed unseen). The scan-result overlay is NOT in this list: it is the scan's own screen.
  // The pedal handler, hands-free and doTriggerScan stop on this list. A result already showing stops a new scan
  // too (doTriggerScan, the SCAN button; code review M1): Retry on the result screen is how a new read is asked for.
  // Found by listing every show* / dialog state of this component
  // (a test, no-scan-behind-dialog.test.js, re-checks the list against the source on every run).
  // Not listed on purpose: showFilters (a panel inside the roster table, no screen over the camera) and the
  // order-screen pickers (showUnfinished, showAssigned, showReplay), which only exist before an order is open.
  const dialogOverResult = showBinSetup     // "Set out the boxes" screen
    || showRosterComplete                   // all jerseys scanned: export / finish
    || showSettings                         // Settings
    || showResume                           // "resume the saved order?" at sign-in
    || showSupervisor                       // the supervisor board
    || showHistory                          // every jersey scanned this order
    || showFinish                           // Finish order confirm
    || !!finished                           // the "Order N is done" screen
    || showPrint                            // the Print menu
    || showPacking                          // the Packing screen: boxes, their lists, the summary
    || showStillOut                         // picked-up order: what is still out
    || showIssues                           // Missing / Duplicate / Flagged lists
    || showPark                             // "Finish later" dialog
    || !!bigPhoto;                          // a flag photo shown large
  // Blanks is the one dialog kept out of dialogOverResult: the Blanks screen is not drawn while a result is up
  // (`showBlanks && … && !overlay` below), so it can never sit over a result, and its own "Flag one" opens the
  // reasons menu while showBlanks stays true (that menu needs its keys).
  const anyDialogOpen = dialogOverResult || showBlanks;   // the blank-jersey counting screen is a dialog too
  // A result screen (green, yellow, red, flagged) that is up while a dialog is open must not take the pedal either:
  // the operator could tap History, Packing or Issues over a pick list, press the pedal, and pass a jersey unseen
  // (code review of 23 Nov 2026, H1, second half). ScanOverlay ignores its keys while this is true; the mouse still works.
  // showBlanks is deliberately not part of it (see above; a test checks it stays out).
  const overlayPaused = dialogOverResult;

  const doTriggerScan = useCallback((opts = {}) => {
    if (!videoRef.current || !canvasRef.current || scanning || !cameraOn || roster.length === 0 || inputMode !== "camera") return;
    if (anyDialogOpen) return;   // last line of defence: whatever calls this (pedal, SCAN button, hands-free), nothing scans behind a dialog
    // Nor over a result that is not recorded yet, nor while another scan is still reading (code review M1). A new
    // read is asked for with the result screen's own Retry, which closes the result first.
    if (overlay || scanBusyRef.current) return;
    if (opts?.auto !== true && waitPedalRef.current) { waitPedalRef.current = false; setWaitPedal(false); }   // the pedal (or the SCAN button) after a flag: hands-free may arm again after this one
    const video = videoRef.current;
    if (!video.videoWidth) { setError("Camera is still starting — try again in a second."); return; }
    // A dead track leaves the last frame frozen on screen; never scan that.
    const track = streamRef.current?.getVideoTracks?.()[0];
    if (!track || track.readyState !== "live") { setError("Camera disconnected — check the USB cable, then press Start Camera."); stopCamera(); return; }
    const f = captureFrame();
    if (f) doRunScan(f.base64, f.dataUrl, captureFrame, { auto: opts?.auto === true });
  }, [scanning, cameraOn, roster.length, inputMode, anyDialogOpen, overlay, captureFrame, doRunScan, stopCamera]);
  useEffect(() => { triggerRef.current = doTriggerScan; }, [doTriggerScan]);

  // ── Hands-free: after a confirm, scan when the picture changes and settles ─
  useEffect(() => {
    if (!cameraOn || inputMode !== "camera" || !handsFree) { gateRef.current.disarm(); return; }   // paused, or nothing left in the order: never scan the empty table
    const id = setInterval(() => {
      const gate = gateRef.current;
      if (anyDialogOpen) { if (gate.armed) { gate.disarm(); setArmed(false); } return; }   // never scan behind a dialog
      if (!gate.armed) { setArmed(a => a ? false : a); return; }
      if (overlay || scanning) return;
      const track = streamRef.current?.getVideoTracks?.()[0];
      if (!track || track.readyState !== "live") { gate.disarm(); setArmed(false); setError("Camera disconnected — check the USB cable, then press Start Camera."); stopCamera(); return; }
      const frame = sampleFrame(videoRef.current, motionCanvasRef.current);
      if (gate.tick(frame)) { setArmed(false); doTriggerScan({ auto: true }); }
      else if (!gate.armed) setArmed(false);
    }, 200);
    return () => clearInterval(id);
  }, [cameraOn, inputMode, handsFree, overlay, scanning, anyDialogOpen, doTriggerScan, stopCamera]);

  // A roster the supervisor sends while an order is running: say so quietly.
  // It is offered on the order screen when this order ends or on Finish order.
  useEffect(() => {
    if (!sessionStarted) { knownRosterIds.current = null; return; }
    const mine = stationId();
    const check = () => hub.rosters().then(r => {
      const list = (r.rosters || []).filter(x => !x.forStation || x.forStation === mine);   // sent to this station, or to any
      if (knownRosterIds.current === null) { knownRosterIds.current = new Set(list.map(x => x.id)); return; }
      const fresh = list.filter(x => !knownRosterIds.current.has(x.id));
      if (!fresh.length) return;
      fresh.forEach(f => knownRosterIds.current.add(f.id));
      setNewRosters(prev => { const have = new Set(prev.map(p => p.id)); return [...prev, ...fresh.filter(f => !have.has(f.id))]; });
    }).catch(() => {});
    check();
    const t = setInterval(check, 10000);
    return () => clearInterval(t);
  }, [sessionStarted]);

  const armAutoScan = useCallback(() => {
    if (!handsFree || !cameraOn || inputMode !== "camera" || anyDialogOpen || waitPedalRef.current) return;   // after a flag: the pedal scans the next one
    gateRef.current.arm(lastScanFrameRef.current); setArmed(true);
  }, [handsFree, cameraOn, inputMode, anyDialogOpen]);
  useEffect(() => { armRef.current = armAutoScan; }, [armAutoScan]);

  // Closing a dialog (complete modal, settings, supervisor view) hands the table
  // back to the operator: re-arm, so the next placement scans without the pedal. The
  // baseline is the last scan's frame, so the same jersey still lying there does
  // not scan again. `autoScan` overrides the setting when Settings just saved it.
  const closeDialog = useCallback((hide, autoScan = settings.autoScan) => {
    hide();
    if (overlay || !autoScan || handsFreePaused || remaining === 0 || !cameraOn || inputMode !== "camera" || waitPedalRef.current) return;
    gateRef.current.arm(lastScanFrameRef.current); setArmed(true);
  }, [overlay, settings.autoScan, handsFreePaused, remaining, cameraOn, inputMode]);
  // Pause/resume hands-free from the camera panel: the camera stays on and the scan key still scans.
  // One button, three states: off in Settings → turn it on; running → pause; paused → resume.
  // Resume is the operator's word that the table is ready, so it also ends the wait for the pedal after a flag.
  const toggleHandsFree = () => {
    if (!settings.autoScan) { changeSettings(s => ({ ...s, autoScan: true })); setHandsFreePaused(false); }
    else if (!handsFreePaused) { gateRef.current.disarm(); setArmed(false); setHandsFreePaused(true); return; }
    else setHandsFreePaused(false);
    pedalDone();
    if (cameraOn && inputMode === "camera" && !anyDialogOpen && !overlay && remaining > 0) { gateRef.current.arm(lastScanFrameRef.current); setArmed(true); }
  };

  // ── Photo upload ──────────────────────────────────────────────────────────
  const handlePhotoUpload = useCallback((e) => {
    const file = e.target.files[0]; if (!file) return;
    e.target.value = "";
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => { const dataUrl = downscaleImage(img, 1280); doRunScan(dataUrl.split(",")[1], dataUrl); };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }, [doRunScan]);

  // ── Roster replacement ────────────────────────────────────────────────────
  const handleRosterUpload = useCallback(async (e) => {
    const file = e.target.files[0]; if (!file) return;
    e.target.value = ""; setError(null);
    if (log.length > 0 && !window.confirm(`Replace the roster? The ${log.length} scans so far stay in the log, but every roster row starts unscanned. Export first if in doubt.`)) return;
    try {
      const isExcel = /\.(xlsx|xls)$/i.test(file.name);
      const parsed  = isExcel ? await parseExcel(file) : parseCSV(await file.text());
      if (parsed.length === 0) { setError("No valid rows found. The file needs a header row with name and/or number columns."); return; }
      // The new rows get ids past every id the order has used (roster and log), as Add roster does:
      // row ids are positions in the file, so the old log's passes and flags attached to whichever
      // new row landed in the same position (code review M13). The order keeps the way it is sorted
      // into boxes (by size stayed by size; it used to go back to by team).
      const offset = nextRowId(roster, log);
      applyRoster(parsed.map((r, i) => ({ ...r, _id: offset + i })), file.name, { keepLog: true, binBy: binMap ? binFieldOf(binMap) : "team" });
    } catch (err) { setError("Failed to parse roster: " + err.message); }
  }, [applyRoster, log, roster, binMap]);

  // ── Add a roster mid-session (another team sheet, a late file) ────────────
  // Appends rows; scans so far, bins and the log all stay as they are.
  // The order as it is NOW: the file is read first (an Excel file takes a moment), and a jersey
  // passed meanwhile must not be lost by adding the rows to the roster as it was before the read
  // (code review, low finding).
  const orderNow = useRef({});
  useEffect(() => { orderNow.current = { roster, log, binMap, closedBins }; }, [roster, log, binMap, closedBins]);
  const handleRosterAdd = useCallback(async (e) => {
    const file = e.target.files[0]; if (!file) return;
    e.target.value = ""; setError(null);
    try {
      const isExcel = /\.(xlsx|xls)$/i.test(file.name);
      const parsed  = isExcel ? await parseExcel(file) : parseCSV(await file.text());
      if (parsed.length === 0) { setError("No valid rows found in the added file. It needs a header row with name and/or number columns."); return; }
      const { roster, log, binMap, closedBins } = orderNow.current;
      const offset = nextRowId(roster, log);   // past the log's ids too: a replaced roster's old rows are only in the log
      const next   = [...roster, ...parsed.map((r, i) => ({ ...r, _id: offset + i, scanned: false }))];
      setRoster(next);
      setRosterFile(f => f ? `${f} + ${file.name}` : file.name);
      setShowRosterComplete(false);
      if (binMap) {   // the order has bins: the added rows join them, by the same field
        const bins = buildBinMap(next, binMap, undefined, closedBins.map(c => c.bin));   // a closed box's number is never handed out to another team or size
        const newBins = binCount(bins) > binCount(binMap);
        setBinMap(bins); if (newBins) setShowBinSetup(true);
      }
    } catch (err) { setError("Failed to parse roster: " + err.message); }
  }, []);

  // ── Overlay actions ───────────────────────────────────────────────────────
  const stamp = useCallback(() => ({ timestamp: localTimeStamp(), operator: operatorName }), [operatorName]);
  // Idle and away spells name no one: they say the station's screen sat
  // untouched, or was left, not who was signed in (owner's decision, 9 Nov 2026).
  const recordIdle = useCallback(spell => setIdleSpells(prev => [...prev, spell]), []);
  // Where the screen was while an order is open: hidden (minimised, another
  // tab, locked) or with another window in front. Kept with the order, on its
  // Excel export and on the hub's record; the page cannot see where the
  // operator went, only that this screen was left.
  useEffect(() => {
    if (!sessionStarted) return;
    const w = createAwayWatch({ onSpell: spell => setAwaySpells(prev => [...prev, spell].slice(-500)) });
    return () => w.stop();
  }, [sessionStarted]);

  const actions = useMemo(() => {
    // Commit a hand-typed jersey. On the roster: that row passes as MANUAL for
    // the supervisor to sign off. Not on the roster: nothing is added — the
    // roster is the order — it is flagged to the supervisor right away.
    const commitTyped = (o, { number, name, size, team }, exactRow, fromList = false) => {
      // What the app showed first for this jersey, against what the operator
      // says it is. The app was wrong when: a green was a different jersey (or
      // not on the roster); a list did not have it; it could not read a jersey
      // that is on the roster.
      const shown = o?.scan?.shown;
      if (shown?.mode === "confirm" && exactRow?._id !== shown.id) noteMistake("greenOverridden");
      else if ((shown?.mode === "pick" || shown?.mode === "close") && !(exactRow && shown.ids?.includes(exactRow._id)) && !fromList) noteMistake("notOnList");   // an extra jersey flagged from the list is not the app missing a row
      else if (shown?.mode === "flag" && exactRow) noteMistake("couldNotRead");
      // On the roster: the same green screen a scan gets (checklist, Confirm, Flag;
      // the owner, 20 Nov 2026). Confirm records a plain pass with "Entered by hand" as its reason.
      if (exactRow) {
        setOverlay({ mode: "confirm", scan: o.scan, match: exactRow, typed: { number, name, team }, note: "Entered by hand" });
        return;
      }
      const typedRow = { number, name, team, size, offRoster: true };   // no _id: never a roster row
      const label  = `#${number || "?"}${name ? " " + name : ""}${size ? " " + size : ""}${team ? " (" + team + ")" : ""}`;
      const reason = fromList ? `Not on the roster — ${label}` : `Not on the roster — operator typed ${label}`;   // from the pick list the size was picked at the station
      const entry  = { id: o.scan?.id || Date.now(), detected: o.scan?.detected, thumb: o.scan?.smallThumb, photo: o.scan?.photo || null, match: typedRow, status: S_FLAGGED, reason, ...stamp() };
      setLog(prev => [entry, ...prev]); setLastResult(entry);
      setOverlay({ mode: "supervisor", scan: o.scan, match: typedRow, reason: "Not on the roster.", route: "Supervisor → check the order", entryId: entry.id, photoFirst: false, damagePhotos: [] });
      playTone("flag");
    };
    return {
    confirm() {
      if (!overlay?.match) return;
      const scan  = overlay.scan || {};
      // A number typed by hand passes like a scan (the owner, 20 Nov 2026: no supervisor sign-off); its reason says it was typed.
      const { cameBack: back, ...row } = overlay.match;   // back from repair, or found: its open flag or missing line closes
      const entry = { id: scan.id || Date.now(), detected: scan.detected, ...(overlay.typed ? { typed: overlay.typed } : {}), thumb: scan.smallThumb, match: row, status: S_PASS, reason: [back ? backWords(back) : "", overlay.note || ""].filter(Boolean).join(" · "), ...stamp() };
      setRoster(prev => prev.map(r => r._id === row._id ? { ...r, scanned: "pass" } : r));
      setLog(prev => [entry, ...(back ? closeOpenFor(prev, row._id, back.was === "flag" ? "Back from repair — passed" : "Found — passed") : prev)]);
      setLastResult(entry); setLastConfirmed(entry);
      inspectRef.current.jerseyDone(); syncInspect();
      setOverlay({ mode: "done", scan, match: row });
      playTone("pass");
    },
    // Pass a jersey that came back without the camera (the Still out list, the roster's
    // Mark menu, the ALREADY DONE screen of a flagged one): a plain pass, said so in the log.
    passBack(id) {
      const row = roster.find(r => r._id === id); if (!row || !["flag", "missing", "short"].includes(row.scanned)) return;
      const why = String(log.find(l => l.status === S_FLAGGED && l.match?._id === id && !l.resolution)?.reason || "").replace(/ — found after it passed$/, "");
      const back = row.scanned === "flag" ? { was: "flag", reason: why } : { was: "missing" };
      const passed = { ...row, scanned: "pass" };
      const entry = { id: Date.now(), detected: null, thumb: null, match: passed, status: S_PASS, reason: `${backWords(back)} — passed by hand`, ...stamp() };
      setRoster(prev => prev.map(r => r._id === id ? { ...r, scanned: "pass" } : r));
      setLog(prev => [entry, ...closeOpenFor(prev, id, back.was === "flag" ? "Back from repair — passed by hand" : "Found — passed by hand")]);
      setLastResult(entry); setLastConfirmed(entry);
      inspectRef.current.jerseyDone(); syncInspect();
      setOverlay({ mode: "done", scan: {}, match: passed });
      playTone("pass");
    },
    retry()  {
      const read = overlay?.match || overlay?.scan?.detected || {};
      setRetried({ number: read.number || "", name: read.name || "" });
      setOverlay(null); playTone("retry"); armAutoScan();
    },
    // A row picked from a list, by key or by mouse. On a list the operator
    // typed for, the pick goes through commitTyped: the same green screen, then a pass "Entered by hand".
    pick(c)  {
      if (!overlay || !c || isDone(c)) return;
      if (overlay.typed) { commitTyped(overlay, overlay.typed, c); return; }
      // `fromList`: the list it was picked from, for "← Back to the list". A wrong pick had no way
      // back: Flag would have flagged the wrong row (code review, low finding).
      setOverlay({ mode: "confirm", scan: overlay.scan, match: c, note: overlay.note, fromList: overlay });
    },
    backToList() { const o = overlay; if (o?.fromList) setOverlay(o.fromList); },
    reasons() { setOverlay(o => ({ mode: "reasons", scan: o.scan, match: o.match || null, returnTo: o })); },
    // The jersey just passed turns out to have a problem: reopen it on the
    // reasons screen. The chosen reason flags it (its pass is taken back);
    // Back leaves it passed.
    reopen(c) {
      if (!c?.match || overlay?.mode === "locate") return;   // "where is the damage" is finished with Done or Skip first
      // also reached from the roster table (flagRow) and the history list
      const scan = { id: c.id, detected: c.detected, thumb: c.thumb, smallThumb: c.thumb, photo: null };
      // `late`: the jersey had passed before this flag. A blank jersey flagged from the
      // counting screen never passed, so its reason does not say "found after it passed".
      const now = roster.find(r => r._id === c.match._id);
      setOverlay({ mode: "reasons", scan, match: c.match, returnTo: null, reopened: true, late: !now || now.scanned === "pass" || now.scanned === "manual" });
    },
    reopenLast() { actions.reopen(lastConfirmed); },
    back()   { setOverlay(o => o.returnTo || null); },
    chooseReason(r) {
      const o = overlay; if (!o) return;
      if (!r.custom) { inspectRef.current.defect(checkOfReason(r.id, inspectRef.current.current().checks || CHECKS)); syncInspect(); }
      // Dirt or a mark is cleaned at the station (a flag resolved at once, 5j): say so, and ask.
      // (Before 17 Nov 2026 the menu just closed, and nobody could tell what had happened.)
      if (r.inPlace) { setOverlay({ mode: "clean", fixing: r, scan: o.scan, match: o.match || null, returnTo: o.returnTo || null, reopened: !!o.reopened, late: o.late }); return; }
      if (r.custom)  { setOverlay({ mode: "reasonText", scan: o.scan, match: o.match || null, returnTo: o }); return; }   // the list did not cover it: type it
      // A physical defect asks where on the garment it is (`where` in config.js; the plan,
      // 23 Nov 2026) before the FLAGGED screen. The flag is in the log at once, as before;
      // `locating` holds its ticket back until the spots are on it (Done) or Skip.
      const where = !!r.where && !sortingRef.current;
      const kind = garmentOf(o.match, orderGarment);
      const entry = { id: o.reopened ? Date.now() : (o.scan?.id || Date.now()), detected: o.scan?.detected, thumb: o.scan?.smallThumb, photo: o.scan?.photo || null, match: o.match || null, status: S_FLAGGED, reason: o.reopened && o.late !== false ? `${r.label} — found after it passed` : r.label, reasonId: r.id, ...(where ? { locating: true, garment: kind } : {}), ...stamp() };
      if (o.match) { setRoster(prev => prev.map(x => x._id === o.match._id ? { ...x, scanned: "flag" } : x)); setClosedBins(prev => dropFromClosed(prev, o.match._id)); }   // flagged: it is out of the bin it was in, closed or not
      setLog(prev => [entry, ...prev]); setLastResult(entry); if (o.reopened) setLastConfirmed(c => (c?.match?._id === o.match?._id ? null : c));
      const flagged = { mode: "supervisor", scan: o.scan, match: o.match || null, reason: r.label, route: r.route, entryId: entry.id, photoFirst: r.id !== "wrong_decoration", damagePhotos: [] };
      setOverlay(where ? { ...flagged, mode: "locate", garment: kind, spots: [] } : flagged);
      playTone("flag");
    },
    // Where is the damage: a tap on the garment adds a spot (at most MAX_SPOTS), a tap on a
    // spot takes it off, Undo takes the last one off.
    locateTap(spot) { setOverlay(o => (o?.mode === "locate" && spot && (o.spots || []).length < MAX_SPOTS ? { ...o, spots: [...(o.spots || []), spot] } : o)); },
    locateRemove(i) { setOverlay(o => (o?.mode === "locate" ? { ...o, spots: (o.spots || []).filter((_, k) => k !== i) } : o)); },
    locateUndo() { setOverlay(o => (o?.mode === "locate" ? { ...o, spots: (o.spots || []).slice(0, -1) } : o)); },
    // Done (with a spot or more) or Skip (none): the spots go on the flag, `locating` is
    // cleared, which prints its ticket (the effect on the newest entry), and the FLAGGED
    // screen follows exactly as it always did (the damage photo, Continue, the pedal).
    locateDone() { const o = overlay; if (o?.mode === "locate" && (o.spots || []).length) finishLocate(o, o.spots); },
    locateSkip() { const o = overlay; if (o?.mode === "locate") finishLocate(o, []); },
    // The "Clean it now" screen. Cleaned: the jersey carries on as it was — back
    // to the screen it came from, with a note for the record; one that had
    // already passed stays passed. Not cleaned: flagged like any other defect.
    cleaned() {
      const o = overlay; if (!o) return;
      // Fixed at the station is still a flag (the owner, 25 Nov 2026: "it should be flagged even
      // if it is resolved"): a flag entry, resolved at once, so the reports count it. The garment
      // itself stays as it was: its row is not set to flag, no ticket prints (the ticket effect
      // skips an entry born resolved), it stays in its box, and lastConfirmed / lastResult are left alone.
      if (o.fixing) {
        const f = o.fixing, entry = { id: Date.now(), detected: o.scan?.detected, thumb: o.scan?.smallThumb, photo: o.scan?.photo || null, match: o.match || null, status: S_FLAGGED, reason: f.label, reasonId: f.id, resolution: FIXED_AT_STATION, ...stamp() };
        setLog(prev => [entry, ...prev]);
      }
      if (o.reopened || !o.returnTo) { setOverlay(null); armAutoScan(); return; }
      setOverlay({ ...o.returnTo, note: o.fixing.inPlace.note });
    },
    cleanFailed() { if (overlay?.fixing) actions.chooseReason(overlay.fixing.inPlace.stays); },   // MARK_STAYS, THREAD_STAYS
    reasonSubmit(text) {
      const o = overlay; if (!o) return;
      const label = String(text || "").trim(); if (!label) return;
      inspectRef.current.defect(); syncInspect();
      const entry = { id: o.reopened ? Date.now() : (o.scan?.id || Date.now()), detected: o.scan?.detected, thumb: o.scan?.smallThumb, photo: o.scan?.photo || null, match: o.match || null, status: S_FLAGGED, reason: o.reopened && o.late !== false ? `${label} — found after it passed` : label, reasonId: "other", ...stamp() };
      if (o.match) { setRoster(prev => prev.map(x => x._id === o.match._id ? { ...x, scanned: "flag" } : x)); setClosedBins(prev => dropFromClosed(prev, o.match._id)); }
      setLog(prev => [entry, ...prev]); setLastResult(entry); if (o.reopened) setLastConfirmed(c => (c?.match?._id === o.match?._id ? null : c));
      setOverlay({ mode: "supervisor", scan: o.scan, match: o.match || null, reason: label, route: "Supervisor decides", entryId: entry.id, photoFirst: true, damagePhotos: [] });
      playTone("flag");
    },
    flagContinue() {
      const o = overlay; if (!o?.scan) return;
      const entry = { id: o.scan.id || Date.now(), detected: o.scan.detected, thumb: o.scan.smallThumb, photo: o.scan.photo || null, match: null, status: S_FLAGGED, reason: o.reason || "Flagged by operator", ...stamp() };
      setLog(prev => [entry, ...prev]); setLastResult(entry); setOverlay(null); playTone("flag"); pedalNext();
    },
    skipDuplicate() { setOverlay(null); armAutoScan(); },
    flagDuplicate() {
      const o = overlay; if (!o?.scan) return;
      const entry = { id: o.scan.id || Date.now(), detected: o.scan.detected, thumb: o.scan.smallThumb, photo: o.scan.photo || null, match: o.match || null, status: S_FLAGGED, reason: "Duplicate — scanned again after passing", ...stamp() };
      setLog(prev => [entry, ...prev]); setLastResult(entry); setOverlay(null); playTone("flag"); pedalNext();
    },
    // Off the flagged screen: the flagged jersey is most likely still under the
    // camera, so hands-free stays off until the pedal scans the next one.
    continueSupervisor() { setOverlay(null); pedalNext(); },
    // A photo of the damage itself for the supervisor: the live frame as the
    // operator framed it (no crop), kept on the flag's log entry. The scan
    // photo stays — it says which jersey; this one says what is wrong.
    async damagePhoto() {
      const o = overlay; if (o?.mode !== "supervisor") return false;
      const keep = lastScanFrameRef.current;              // the hands-free gate keeps comparing against the scan, not this frame
      const f = captureFrame(); lastScanFrameRef.current = keep;
      const photo = f ? await cropDataUrl(f.dataUrl, null, 640) : null;
      if (!photo) return false;
      setLog(prev => prev.map(l => l.id === o.entryId ? { ...l, damagePhotos: [...(l.damagePhotos || []), photo] } : l));
      setOverlay(cur => cur?.mode === "supervisor" && cur.entryId === o.entryId ? { ...cur, damagePhotos: [...(cur.damagePhotos || []), photo] } : cur);
      return true;
    },
    dropDamagePhoto() {   // Retake: the last damage photo goes
      const o = overlay; if (o?.mode !== "supervisor") return;
      setLog(prev => prev.map(l => l.id === o.entryId ? { ...l, damagePhotos: (l.damagePhotos || []).slice(0, -1) } : l));
      setOverlay(cur => cur?.mode === "supervisor" && cur.entryId === o.entryId ? { ...cur, damagePhotos: (cur.damagePhotos || []).slice(0, -1) } : cur);
    },
    dismissDone() { setOverlay(null); armAutoScan(); },
    // "No size tag" on the pick list (the owner, 19 Nov 2026): with no size to
    // read there is no row to pick, so the jersey is flagged as it is — the
    // number (and name) read, the team when every row on the list agrees, no
    // row marked — and goes to the stitcher for a tag.
    noSizeTag() {
      const o = overlay; if (!o) return;   // a number typed from By hand has no camera scan
      const d = o.scan?.detected || {};
      const who = flaggedAs(o);
      const teams = [...new Set((o.candidates || []).map(c => teamKey(c.team)).filter(Boolean))];
      const row = { number: who.number, name: who.name, team: o.typed ? who.team : teams.length === 1 ? (o.candidates.find(c => c.team)?.team || "") : "", size: "", noRow: true };
      inspectRef.current.defect(checkOfReason(NO_SIZE_TAG.id, inspectRef.current.current().checks || CHECKS)); syncInspect();   // Size tag (the check that names No size tag) is ticked on the next 5 garments
      const entry = { id: o.scan?.id || Date.now(), detected: d, thumb: o.scan?.smallThumb, photo: o.scan?.photo || null, match: row, status: S_FLAGGED, reason: NO_SIZE_TAG.label, reasonId: NO_SIZE_TAG.id, ...stamp() };
      setLog(prev => [entry, ...prev]); setLastResult(entry);
      setOverlay({ mode: "supervisor", scan: o.scan, match: row, reason: NO_SIZE_TAG.label, route: NO_SIZE_TAG.route, entryId: entry.id, photoFirst: false, damagePhotos: [] });
      playTone("flag");
    },
    // "Not on the roster" on the pick list: an extra jersey. The size is asked
    // first (the roster has no row to take it from) so the ticket carries it.
    listFlag() {
      const o = overlay; if (!o) return;   // a number typed from By hand has no camera scan
      setOverlay({ mode: "listFlag", scan: o.scan, candidates: o.candidates, typed: o.typed, returnTo: o });
    },
    offRosterStart(kind = "off") {
      const o = overlay; if (!o) return;   // a number typed from By hand has no camera scan
      setOverlay({ mode: "offSize", kind, scan: o.scan, candidates: o.candidates, typed: o.typed, sizes: sizeChoiceGroups(roster), goalie: false, returnTo: o });
    },
    // The goalie box on the size screen: off until ticked (the owner, 19 Nov 2026).
    toggleGoalie() { setOverlay(o => (o?.mode === "offSize" ? { ...o, goalie: !o.goalie } : o)); },
    offRosterSize(size) {
      const o = overlay; if (!o) return;   // a number typed from By hand has no camera scan
      const d = o.scan?.detected || {};
      const sizeText = [String(size || ""), o.goalie ? "Goalie" : ""].filter(Boolean).join(" ");   // the size as it reads on the ticket
      const sizeBack = { ...o, threw: "" };   // where Back on the flagged screen returns
      const who = flaggedAs(o);
      if (o.kind === "dup") {   // one more of a number and size that has passed: flagged with no row, the size on the ticket
        const row = { number: who.number, name: who.name, team: who.team, size: sizeText, goalie: !!o.goalie, noRow: true };
        const reason = `Duplicate — #${row.number || "?"}${row.size ? " " + shortSize(row.size) : ""}`;
        const entry = { id: o.scan?.id || Date.now(), detected: d, thumb: o.scan?.smallThumb, photo: o.scan?.photo || null, match: row, status: S_FLAGGED, reason, ...stamp() };
        setLog(prev => [entry, ...prev]); setLastResult(entry);
        setOverlay({ mode: "supervisor", scan: o.scan, match: row, reason: "Duplicate.", route: "Supervisor → check the order", entryId: entry.id, photoFirst: false, damagePhotos: [], sizeBack });
        playTone("flag"); return;
      }
      commitTyped(o, { number: who.number, name: who.name, size: sizeText, team: who.team }, null, true);
      setOverlay(cur => (cur?.mode === "supervisor" ? { ...cur, sizeBack } : cur));
    },
    // Back on the flagged screen of an extra jersey or a duplicate: the flag is taken
    // back and the size asked again; the tickets that printed are thrown away.
    backToSize() {
      const o = overlay; if (!o?.sizeBack) return;
      const wrong = shortSize(o.match?.size || "") || "no size";
      setLog(prev => prev.map(l => l.id === o.entryId && l.status === S_FLAGGED ? { ...l, status: "undo", reason: `Taken back — wrong size picked (${wrong})` } : l));
      setLastResult(r => (r?.id === o.entryId ? null : r));
      // A new id for the next try, on this screen and the ones behind it: the log, the ticket
      // printer (once per id) and the hub's ledger tell entries apart by it, so the right
      // size's ticket must not share the wrong one's id.
      const scan = { ...o.sizeBack.scan, id: Date.now() };
      const rescan = ov => (ov ? { ...ov, scan, returnTo: rescan(ov.returnTo) } : ov);
      setOverlay({ ...rescan(o.sizeBack), threw: settings.flagTickets ? wrong : "" });
    },
    // "Enter by hand". On a list the operator already typed for (overlay.typed),
    // "None of these" adds the typed row instead of reopening the form — the
    // typed value is the truth, and the screen can never loop back on itself.
    manual() {
      const o = overlay;
      if (o?.mode === "locate") return;   // "where is the damage" is finished with Done or Skip first
      if (o?.typed) { commitTyped(o, o.typed, null); return; }
      setOverlay({ mode: "manual", scan: o?.scan, match: null, teams: teamNames, returnTo: o });
    },
    manualSubmit({ number, name, size, team }) {
      const o = overlay; if (!o) return;
      const typed = { number, name, size, team };
      let m = findMatches(scanRoster, name, number, { typed: true });
      // The team the operator chose settles same-number rows: one row of that
      // team is the jersey (or a duplicate if it is done); several keep the list,
      // narrowed to that team.
      // Only a row whose number IS the number typed, digit for digit (or no number
      // typed): a typed 7 with a team must not pass #07 of that team, nor a typed
      // 40 pass #4 (code review of 23 Nov 2026, N2; the matcher's own typed-number
      // rule did not reach this shortcut).
      if ((m.type === "pick" || m.type === "close") && team.trim()) {
        const same = m.candidates.filter(c => teamKey(c.team) === teamKey(team));
        const numberFits = r => !normNum(number) || normNum(r.number) === normNum(number);
        // …and whose name is the name typed, when both have one: typed SMITH 12 with team Navy must not
        // pass #12 JONES of Navy (phase 6 review: the team shortcut undid the typed-name rule in match.js,
        // and a team must never decide a green, N5).
        const nameFits = r => !norm(name) || !norm(r.name) || nameMatches(name, r.name);
        if (m.type === "pick" && same.length === 1 && numberFits(same[0]) && nameFits(same[0])) m = isDone(same[0]) ? { type: "duplicate", match: same[0] } : { type: "exact", match: same[0] };
        else if (same.length >= 1) m = { ...m, candidates: same };
      }
      m = holdBack(m);   // a flagged garment of an order not parked: on the list, a tap only (H3)
      // (a flagged row is open in scanRoster, so "duplicate" here is a passed row; the "is flagged" words are a safety net)
      if (m.type === "duplicate") { setOverlay({ mode: "duplicate", scan: o.scan, match: m.match, reason: `#${m.match.number}${m.match.name ? " · " + m.match.name : ""}${m.match.scanned === "flag" ? " is flagged — with the supervisor." : " already passed this session."}` }); playTone("flag"); return; }
      if (m.type === "exact") { commitTyped(o, typed, m.match); return; }
      if (m.type === "pick" || m.type === "close") {
        // A near miss the operator has already rejected: they typed exactly what
        // the camera read, so the nearest rows were on the previous screen. Add it.
        const d = o.scan?.detected;
        const sameAsRead = d && String(d.number ?? "").trim() === number && String(d.name ?? "").trim().toLowerCase() === name.toLowerCase();
        if (m.type === "close" && sameAsRead) { commitTyped(o, typed, null); return; }
        setOverlay({ mode: "pick", scan: o.scan, candidates: m.candidates, typed,
          reason: m.type === "pick" ? "Which one?" : "Close to these — one of them?",
          note: "Typed by operator — the camera could not read it" });
        return;
      }
      // Nothing on the roster is like it: a check step before the flag. A typo (#400 for #40) went
      // straight to FLAGGED and printed a ticket, with no way back (code review M18). The typed
      // list's own screen is the step: "← Back" (first, so the pedal goes back to the form as typed),
      // "#N — not on the roster" to flag it as an extra jersey, and Flag.
      setOverlay({ mode: "pick", scan: o.scan, candidates: [], typed,
        reason: `#${number || "?"}${name ? " " + name : ""} is not on the roster — check the number`,
        note: "Typed by operator" });
    },
    // Back from a list the operator typed for: the form again, as it was typed.
    editTyped() {
      const o = overlay; if (!o?.typed) return;
      setOverlay({ mode: "manual", scan: o.scan, match: null, teams: teamNames, returnTo: null, initial: o.typed });
    },
    };
  }, [overlay, stamp, armAutoScan, pedalNext, roster, scanRoster, teamNames, noteMistake, lastConfirmed, syncInspect, captureFrame, settings.flagTickets, log, orderGarment, finishLocate]);

  // ── Flag resolution (from the result card) ────────────────────────────────
  const resolveFlag = useCallback((logId, decision, note) => {
    const entry = log.find(l => l.id === logId);
    const resolution = decision === "accept" ? `Accepted — manually verified${note ? ": " + note : ""}`
                     : decision === "reject" ? `Rejected — sent back for rework${note ? ": " + note : ""}`
                     : (note || "Note added");
    // The entry keeps its status (a flag stays a flag) and the decision goes in its
    // resolution and `outcome`. Accept and Reject used to rewrite a flag to "manual", and
    // the damage report, the defects sheet and the flag rate only count "flagged": the
    // flag vanished from every report (code review M6). The roster row still passes
    // (Accept) or opens again (Reject) below.
    const status = entry?.status || S_FLAGGED;
    const outcome = decision === "accept" ? "accepted" : decision === "reject" ? "rejected" : entry?.outcome;
    setLog(prev => prev.map(l => l.id === logId ? { ...l, status, resolution, ...(outcome ? { outcome } : {}) } : l));
    setLastResult(prev => prev?.id === logId ? { ...prev, status, resolution, ...(outcome ? { outcome } : {}) } : prev);
    // Accept: the jersey passes. Reject: it goes out for rework and comes back
    // through the camera, so its row opens again; until then a rescan shows FLAGGED.
    if (entry?.match?._id !== undefined && decision === "accept") {
      setRoster(prev => prev.map(r => r._id === entry.match._id ? { ...r, scanned: "pass" } : r));
    } else if (entry?.match?._id !== undefined && decision === "reject") {
      setRoster(prev => prev.map(r => r._id === entry.match._id && r.scanned === "flag" ? { ...r, scanned: false } : r));
    }
    if (entry?.match?._id !== undefined && decision === "reject") {
      setRoster(prev => prev.map(r => r._id === entry.match._id && r.scanned === "manual" ? { ...r, scanned: "flag" } : r));   // a rejected hand entry goes to the supervisor
    }
  }, [log]);

  // Manual marks on roster rows: missing / clear. A missing mark goes to the
  // log the moment it is made, so the supervisor's board hears about it like
  // a flag. Clearing the mark closes that line. ("short" is read everywhere a
  // status is, for orders saved before the Short-shipped mark was removed on
  // 9 Nov 2026, but it can no longer be chosen.)
  const markRow = useCallback((id, mark) => {
    const row = roster.find(r => r._id === id); if (!row) return;
    setRoster(prev => prev.map(r => r._id === id ? { ...r, scanned: mark } : r));
    const isMark = l => l.match?._id === id && (l.status === "missing" || l.status === "short") && !l.resolution;
    if (mark === "missing") {
      const reason = "Marked missing — not in the box";
      setLog(prev => [{ id: Date.now(), match: { ...row, scanned: mark }, status: mark, reason, ...stamp() }, ...prev.map(l => isMark(l) ? { ...l, resolution: "Mark changed" } : l)]);
    } else {
      const resolution = `Mark removed by ${operatorName || "operator"}`;
      setLog(prev => prev.map(l => isMark(l) ? { ...l, resolution } : l));
    }
  }, [roster, operatorName, stamp]);

  // Un-check a jersey that was confirmed by mistake: it goes back to Remaining
  // and must be scanned again. The earlier log lines stay; a new line says who
  // un-checked it, and any open flag or by-hand entry for it is closed so the
  // supervisor's list drops it.
  // Flag a jersey that already passed, from the roster table: the reasons menu
  // opens for it, as "Flag it" does for the last one. The scan is looked up in
  // the log for its picture; a row with no scan on record (an old session) is
  // flagged from the row itself.
  const markHandler = useRef(() => {});
  const onMarkRow = useCallback((r, v) => markHandler.current(r, v), []);
  // Blank jerseys (no name, no number): the groups to count, and one count —
  // the next row of that team and size is passed exactly as a confirmed green
  // is: a log entry, the last pass (so its sticker prints), the inspection count.
  const isBlank = r => !!r && !String(r.name ?? "").trim() && !String(r.number ?? "").trim();
  const blanks = useMemo(() => blankGroups(roster), [roster]);
  const countBlank = g => {
    const row = g?.next && roster.find(r => r._id === g.next._id && !r.scanned); if (!row) return;
    const entry = { id: Date.now(), detected: null, thumb: null, match: row, status: S_PASS, reason: "Counted — blank garment, nothing to read", ...stamp() };
    if (!firstScanTime) setFirstScanTime(Date.now());
    setRoster(prev => prev.map(r => r._id === row._id ? { ...r, scanned: "pass" } : r));
    setLog(prev => [entry, ...prev]);
    setLastResult(entry); setLastConfirmed(entry);
    inspectRef.current.jerseyDone(); syncInspect();
    playTone("pass");
  };
  const flagRow = (r) => {
    const l = log.find(x => x.match?._id === r._id && (x.status === S_PASS || x.status === S_MANUAL));
    actions.reopen(l || { id: Date.now(), match: r, detected: null, thumb: null });
  };
  // Un-check a row (the Mark menu), after a yes to "Un-check #N?": it is to scan again.
  const unscan = useCallback((id) => {
    const row = roster.find(r => r._id === id); if (!row || !row.scanned) return;
    const was = { pass: "passed", manual: "entered by hand", flag: "with the supervisor", missing: "marked missing", short: "marked short-shipped" }[row.scanned] || row.scanned;
    if (!window.confirm(`Un-check #${row.number}${row.name ? " · " + row.name : ""} (${was})?`)) return;
    if (row.scanned === "pass") noteMistake("unchecked");   // a pass taken back: the app, or the operator, got it wrong — check the next ones
    setRoster(prev => prev.map(r => r._id === id ? { ...r, scanned: false } : r));
    setClosedBins(prev => dropFromClosed(prev, id));   // taken back: it is no longer in the closed bin it was in
    const resolution = `Un-checked by ${operatorName || "operator"} — to be scanned again`;
    setLog(prev => [
      { id: Date.now(), match: { ...row, scanned: false }, status: "undo", reason: `Un-checked — was ${was}; scan it again`, ...stamp() },
      ...prev.map(l => l.match?._id === id && (l.status === S_FLAGGED || l.status === S_MANUAL || l.status === "missing" || l.status === "short") && !l.resolution ? { ...l, resolution } : l),
    ]);
    setLastResult(r => (r?.match?._id === id ? null : r)); setLastConfirmed(c => (c?.match?._id === id ? null : c));
  }, [roster, operatorName, stamp, noteMistake]);
  // What a row's Mark menu does, kept current for the one stable handler the rows share.
  useEffect(() => { markHandler.current = (r, v) => {
    if (v === "unscan") unscan(r._id);
    else if (v === "flag") flagRow(r);
    else if (v === "back") { if (window.confirm(`Pass #${r.number}${r.name ? " · " + r.name : ""}${r.size ? " · " + shortSize(r.size) : ""}? ${r.scanned === "flag" ? "It is back from repair and fixed." : "It was missing and is here now."}${binMap ? " It goes in Box " + binOf(r) + "." : ""}`)) actions.passBack(r._id); }
    else markRow(r._id, v || false);
  }; });

  // ── Global keyboard: the scan key, and the By hand key ──────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (e.repeat) return;
      if (overlay || anyDialogOpen || !sessionStarted) return;   // no scan behind any dialog; dialogs that use Enter themselves still get it (this handler never stops the key there)
      if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
      // The By hand key (W by default) on the camera screen opens the form, as the
      // ⌨ By hand button does (the co-op, 25 Nov 2026: the key was set in Settings
      // but only the result screens read it, and none of them offers By hand any more).
      if (byHandKey && e.code === byHandKey && e.code !== scanKey) {
        if (scanning || locatingUp) return;
        e.preventDefault();
        gateRef.current.disarm(); setArmed(false);
        actions.manual();
        return;
      }
      if (e.code !== scanKey) return;
      // The scan key is Enter by default, and Enter on a focused button clicks it
      // (the last button the mouse touched keeps the focus): the pedal must only
      // scan, so the button loses the focus and the default action is stopped.
      if (document.activeElement?.tagName === "BUTTON") document.activeElement.blur();
      e.preventDefault();
      gateRef.current.disarm(); setArmed(false);
      doTriggerScan();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [overlay, anyDialogOpen, sessionStarted, scanKey, byHandKey, scanning, locatingUp, actions, doTriggerScan]);

  // ── Replay (development only): yesterday's scans through today's screens ──
  // The station page with ?replay=<order> loads public/sim/replay-<order>.json
  // (the ledger's reads and what the operator did; the file stays out of git)
  // and, once that order is open, hands each read to the scan in place of the
  // camera, then acts as the operator did after a pause: confirms the green,
  // picks the same row on a list, flags the extra jersey. See src/lib/replay.js.
  // Or, on the development and testing servers, from the order screen's "Replay an order"
  // (the owner, 20 Nov 2026): a floor order found by its number (replay-plugin.js), no link.
  const replayName = REPLAY_ON ? replayRequested() : "";
  const blankReplay = name => ({ name, steps: [], i: 0, phase: "scan", playing: false, delay: 1500, seen: false, tally: {}, error: "" });
  const [replay, setReplay] = useState(() => { const r = REPLAY_ON && !replayName ? storedReplay() : null; if (r) holdPrints("Replay: nothing is printed"); return r ? { ...blankReplay(r.name), steps: replaySteps(r.events) } : null; });
  // The old way in: ?replay=<order> loads public/sim/replay-<order>.json.
  useEffect(() => {
    if (!replayName) return;
    fetch(`/sim/replay-${encodeURIComponent(replayName)}.json`).then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(d => setReplay({ ...blankReplay(replayName), steps: replaySteps(d.events) }))
      .catch(e => setReplay({ ...blankReplay(replayName), error: `No replay file for ${replayName} (${e.message})` }));
  }, [replayName]);
  const startReplay = useCallback(run => { holdPrints("Replay: nothing is printed"); storeReplay({ name: run.name, events: run.events }); setReplay({ ...blankReplay(run.name), steps: replaySteps(run.events) }); }, []);
  const endReplay = useCallback(() => { try { sessionStorage.removeItem("jerseyqc.replay"); } catch { /* fine */ } storeReplay(null); setReplay(null); }, []);
  // Nothing goes to a label printer while a replay is loaded (hub.js holdPrints). startReplay holds them at
  // once too: the set-out screen prints in its first effect, which runs before this one.
  useEffect(() => { holdPrints(replay ? "Replay: nothing is printed" : ""); }, [replay]);
  const replayStep = replay?.steps[replay.i] || null;
  // Skip ahead to `target` jerseys done (the station's Done count, 214 of 521; the
  // owner, 19 Nov 2026): the steps are done at once, as the operator did them,
  // with no screens — the passes land on their rows and in their boxes, the flags
  // and the marks in the log — until that many roster rows are done. Forward
  // only; the replay then carries on from there.
  const [replaySkip, setReplaySkip] = useState("");
  const replaySkipTo = useCallback(target => {
    if (!replay || !sessionStarted) return;
    const want = Math.min(roster.length, Math.floor(Number(target) || 0));
    const rows = roster.map(r => ({ ...r })), entries = [], base = Date.now();
    const doneNow = () => rows.filter(r => r.scanned).length;
    if (doneNow() >= want) return;
    const st = stamp();
    let to = replay.i;
    for (; to < replay.steps.length && doneNow() < want; to++) {
      const s = replay.steps[to], k = to - replay.i;
      const id = base + k, at = { ...st, id, detected: s.detected || null, thumb: null };
      if (s.kind === "undo")    { const r = findReplayRow(rows, s, true); if (r) { r.scanned = false; entries.push({ ...at, match: { ...r }, status: "undo", reason: "Un-checked — was passed; scan it again" }); } continue; }
      if (s.kind === "missing") { const r = findReplayRow(rows, s); if (r && !r.scanned) r.scanned = "missing"; continue; }
      if (s.kind !== "scan") continue;
      if (s.off) { entries.push({ ...at, match: { number: s.number, name: s.name || "", team: "", size: s.size || "", offRoster: true }, status: S_FLAGGED, reason: `Not on the roster — #${s.number || "?"}${s.size ? " " + s.size : ""}` }); continue; }
      if (s.dup) { entries.push({ ...at, match: { number: s.number, name: s.name || "", team: "", size: s.size || "", noRow: true }, status: S_FLAGGED, reason: `Duplicate — #${s.number || "?"}${s.size ? " " + s.size : ""}` }); continue; }
      const r = findReplayRow(rows, s); if (!r || r.scanned) continue;
      r.scanned = "pass"; entries.push({ ...at, match: { ...r }, status: S_PASS, reason: "" });
    }
    if (to === replay.i) return;
    replayReadRef.current = null;
    setOverlay(null);
    setRoster(rows);
    setLog(prev => [...entries.reverse(), ...prev]);
    if (!firstScanTime) setFirstScanTime(base);
    setReplay(r => ({ ...r, i: to, phase: "scan", seen: false, playing: false, tally: { ...r.tally, skipped: (r.tally.skipped || 0) + (to - r.i) } }));
    setReplaySkip("");
  }, [replay, sessionStarted, roster, stamp, firstScanTime]);
  // The replay's player: while Play is on, each step is a scan read from the
  // ledger, then the operator's choice on the screen it made, then the next.
  useEffect(() => {
    if (!replay || !replay.playing || !sessionStarted || !replayStep) return;
    const next = () => setReplay(r => ({ ...r, i: r.i + 1, phase: "scan", seen: false }));
    if (replay.phase === "scan") {
      if (scanning || overlay || anyDialogOpen) return;                  // the last screen is still up, or a dialog is open (same rule as the pedal)
      if (replayStep.kind === "scan") {
        replayReadRef.current = replayStep.detected;
        const frame = placeholderFrame(replayStep.detected.number, replayStep.detected.name);
        setReplay(r => ({ ...r, phase: "act" }));
        doRunScan(frame.split(",")[1], frame);
        return;
      }
      if (replayStep.kind === "undo")    { const row = findReplayRow(roster, replayStep, true); if (row) unscan(row._id); }
      if (replayStep.kind === "missing") { const row = findReplayRow(roster, replayStep); if (row) markRow(row._id, "missing"); }
      if (replayStep.kind === "skip")    setReplay(r => ({ ...r, tally: { ...r.tally, skipped: (r.tally.skipped || 0) + 1 } }));
      next(); return;
    }
    // "act": the screen is up (or came and went); after the pause, do what the operator did
    if (scanning) return;
    replayReadRef.current = null;
    if (!overlay) { const t = setTimeout(next, Math.min(400, replay.delay)); return () => clearTimeout(t); }   // the screen closed (or has not opened yet: the scan sets its state in two steps): on to the next scan after a moment
    if (!replay.seen) {                                                  // the first screen of this scan: count it
      const m = overlay.mode, list = m === "pick" || m === "close";
      setReplay(r => ({ ...r, seen: true, tally: { ...r.tally, screens: (r.tally.screens || 0) + 1, green: (r.tally.green || 0) + (m === "confirm" ? 1 : 0), list: (r.tally.list || 0) + (list ? 1 : 0), listRows: (r.tally.listRows || 0) + (list ? (overlay.candidates || []).length : 0), red: (r.tally.red || 0) + (m === "flag" ? 1 : 0), duplicate: (r.tally.duplicate || 0) + (m === "duplicate" ? 1 : 0) } }));
      return;
    }
    if (overlay.mode === "done") { if (replay.delay < 300) { const t = setTimeout(() => actions.dismissDone(), replay.delay); return () => clearTimeout(t); } return; }   // the green flash dismisses itself; super fast does not wait for it
    const t = setTimeout(() => {
      const o = overlay, s = replayStep, a = actions;
      switch (o.mode) {
        case "confirm":    if (s.off) a.manual(); else a.confirm(); break;
        case "pick": case "close": {
          if (s.off) { a.offRosterStart(); break; }
          const c = (o.candidates || []).find(x => !isDone(x) && sameReplayRow(x, s));
          if (c) a.pick(c); else a.manual();                            // yesterday's row is not on today's list: typed in, as the operator would
          break;
        }
        case "offSize":    a.offRosterSize(s.size || ""); break;
        case "manual":     a.manualSubmit({ number: s.number, name: s.name || "", size: s.off ? "" : s.size || "", team: s.off ? "" : s.team || "" }); break;
        case "duplicate":  if (s.dup) a.flagDuplicate(); else a.skipDuplicate(); break;
        case "flag":       a.manual(); break;                            // could not read / not found: typed in
        case "supervisor": a.continueSupervisor(); break;
        case "locate":     a.locateSkip(); break;                         // the ledger has no spots to replay
        case "reasons": case "clean": case "reasonText": a.back(); break;
        default: break;
      }
    }, replay.delay);
    return () => clearTimeout(t);
  }, [replay, replayStep, sessionStarted, scanning, overlay, anyDialogOpen, roster, actions, doRunScan, unscan, markRow]);

  const overlayKey = overlay ? `${overlay.mode}:${overlay.scan?.id}:${(overlay.candidates || []).map(c => c._id).join(",")}` : "";
  const exportMeta = { orderNumber, operatorName, notes, jerseyType: jerseyTypeLabel(jerseyType), idleSpells, awaySpells, bins: binSummary, categoryOf: reasonCategory };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: FONT_UI, background: "var(--k-page)", height: "100%", color: "var(--k-ink-1)", display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {!signedIn && (
        <SignInModal initial={savedSignIn}
          onSignIn={({ role, name }) => {
            setRole(role); setOperatorName(name); setSignedIn(true); saveSignIn({ role, name });
            if (role === "supervisor") { setShowSupervisor(true); return; }
            // An operator's station goes full screen by itself: no tabs, no address bar. (The kiosk launcher locks the browser down for good.)
            else if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
          }} />
      )}

      {signedIn && showResume && <ResumeModal session={savedSession} role={role} onResume={() => resumeSession()} onDiscard={discardSession} onSetAside={setAsideSaved} error={asideErr} onSignOut={signOut} />}


      {showSupervisor && <SupervisorPanel operatorName={operatorName} onSignOut={signOut} />}

      {sessionStarted && !showSupervisor && <IdleWatch pulse={log.filter(l => l.status === S_PASS || l.status === S_MANUAL || l.status === S_FLAGGED).length} onSpell={recordIdle} />}

      {!showResume && signedIn && !sessionStarted && !showSupervisor && (
        <OrderSetupModal operatorName={operatorName} role={role} xlsxReady={xlsxReady} onSignOut={signOut} onPrint={() => setShowPrint(true)} stationLabel={stationLabel} onPickUp={pickUpOrder}
          onReplay={REPLAY_ON ? startReplay : null}
          onStart={({ roster, orderNumber, notes, jerseyType, garment, customer = "", binBy, rosterFile, hubRosterId = null, shipWith: sw = [], carried: boxesIn = [] }) => {
            setBinMap(null);
            applyRoster(roster, rosterFile, { binBy: binBy || "team", carried: boxesIn });
            setShipWith(sw); setCarried(boxesIn);
            setOrderNumber(orderNumber); setOrderRun(Date.now()); setHubRosterId(hubRosterId); setNotes(notes); setJerseyType(jerseyType || ""); setOrderGarment(orderGarmentOf(garment)); setOrderCustomer(String(customer || "").trim()); setOrderRole(kindOfRole(role));
            setSessionStarted(true); setResumeDecided(true);
          }} />
      )}

      {showBinSetup && binMap && (
        <BinSetupModal entries={boxPlan} by={binFieldOf(binMap)} labels={boxPlanLabels} autoPrint={boxAuto} onPrinted={boxesLabelled} onConfirm={() => { setShowBinSetup(false); setBoxAuto(false); }}
          onBack={showBinSetup === "packing" ? () => { setShowBinSetup(false); setShowPacking(true); } : null} />
      )}


      {replay && replay.hidden && (
        <button onClick={() => setReplay(r => ({ ...r, hidden: false }))} title="Show the replay bar" style={{ position: "fixed", right: 10, bottom: 10, zIndex: 3000, background: "var(--k-page)", border: "2px solid var(--k-amber)", borderRadius: 10, padding: "4px 10px", color: "var(--k-amber-ink-2)", fontWeight: 800, fontSize: 13, cursor: "pointer", opacity: 0.85 }}>▲ Replay {Math.min(replay.i + 1, replay.steps.length)}/{replay.steps.length}{replay.playing ? " ▶" : " ⏸"}</button>
      )}
      {replay && !replay.hidden && (
        <div style={{ position: "fixed", left: "50%", bottom: 10, transform: "translateX(-50%)", zIndex: 3000, background: "var(--k-page)", border: "3px solid var(--k-amber)", borderRadius: 14, padding: "10px 16px", color: "var(--k-ink-1)", fontSize: 15, display: "flex", alignItems: "center", gap: 12, maxWidth: "96vw", boxShadow: "0 10px 30px rgba(0,0,0,0.6)" }}>
          <span style={{ fontWeight: 900, color: "var(--k-amber-ink-2)", whiteSpace: "nowrap" }}>▶ Replay {replay.name}</span>
          {replay.error ? <span style={{ color: "var(--k-red-ink)" }}>{replay.error}</span> : (<>
            <span style={{ whiteSpace: "nowrap", fontWeight: 800 }} title="Garments done, as on the station's Done tile">{roster.filter(r => r.scanned).length} / {roster.length}</span>
            <span style={{ whiteSpace: "nowrap", color: "var(--k-ink-3b)", fontSize: 13 }} title="Steps of yesterday’s record: every scan, flag and mark the operator made (flags, duplicates and marks are steps too)">step {Math.min(replay.i + 1, replay.steps.length)}/{replay.steps.length}</span>
            <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }} title="Skip until this many garments are done (as on the Done tile), with no screens; the roster list catches up">
              <input type="number" min={1} max={roster.length} value={replaySkip} placeholder="garments" onChange={e => setReplaySkip(e.target.value)} onKeyDown={e => { e.stopPropagation(); if (e.key === "Enter") { replaySkipTo(replaySkip); e.currentTarget.blur(); } }} style={{ ...inputSt, width: 78, padding: "4px 6px", fontSize: 14 }} />
              <button onClick={() => replaySkipTo(replaySkip)} disabled={!sessionStarted || !(Number(replaySkip) > roster.filter(r => r.scanned).length)} style={{ ...btnGhost, padding: "4px 10px", fontSize: 14, opacity: sessionStarted && Number(replaySkip) > roster.filter(r => r.scanned).length ? 1 : 0.5 }}>⏭ Skip to</button>
            </span>
            <span style={{ color: "var(--k-ink-3)", maxWidth: 340, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{replayStep ? replayStep.label : "done"}</span>
            <span style={{ color: "var(--k-ink-3)", whiteSpace: "nowrap" }}>green {replay.tally.green || 0} · lists {replay.tally.list || 0}{replay.tally.list ? ` (${(replay.tally.listRows / replay.tally.list).toFixed(1)} rows)` : ""} · red {replay.tally.red || 0} · dup {replay.tally.duplicate || 0}</span>
            {!sessionStarted && <span style={{ color: "var(--k-amber-ink-2)" }}>start order {replay.name} first</span>}
            <button onClick={() => setReplay(r => ({ ...r, playing: !r.playing }))} style={{ ...btnPri, padding: "6px 14px", fontSize: 15 }}>{replay.playing ? "⏸ Pause" : "▶ Play"}</button>
            <select value={replay.delay} onChange={e => setReplay(r => ({ ...r, delay: Number(e.target.value) }))} style={{ ...inputSt, padding: "4px 8px", fontSize: 14 }}>
              {[[120, "super fast"], [600, "fast"], [1500, "normal"], [3000, "slow"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </>)}
          <button onClick={() => setReplay(r => ({ ...r, hidden: true }))} title="Hide the replay bar (it keeps playing)" style={{ ...btnGhost, padding: "4px 10px" }}>▼ Hide</button>
          <button onClick={endReplay} title="End the replay (printing comes back on)" style={{ ...btnGhost, padding: "4px 10px" }}>✕</button>
        </div>
      )}
      {showSettings && (
        <SettingsPanel settings={settings} cameras={cameras} onSave={changeSettings} onClose={saved => closeDialog(() => setShowSettings(false), saved ? saved.autoScan : undefined)} />
      )}
      {bigPhoto && <PhotoLightbox photo={bigPhoto} onClose={() => closeDialog(() => setBigPhoto(null))} />}

      {retried && !overlay && !noJersey && (
        <div style={{ position: "fixed", top: 72, left: "50%", transform: "translateX(-50%)", zIndex: 1950, background: "var(--k-field)", color: "var(--k-amber-ink-2)", border: "2px solid var(--k-amber)", borderRadius: 999, padding: "10px 22px", fontSize: 20, fontWeight: 800, boxShadow: "0 8px 30px rgba(0,0,0,0.5)", whiteSpace: "nowrap" }}>
          ↻ Scanned again · {retried.number || retried.name ? `#${retried.number || "?"}${retried.name ? " " + retried.name : ""} is` : "that garment is"} NOT checked — no sticker, no box
        </div>
      )}
      {noJersey && (
        <div style={{ position: "fixed", top: 72, left: "50%", transform: "translateX(-50%)", zIndex: 1950, background: "var(--k-field)", color: "var(--k-amber-ink-2)", border: "2px solid var(--k-amber)", borderRadius: 999, padding: "10px 22px", fontSize: 20, fontWeight: 800, boxShadow: "0 8px 30px rgba(0,0,0,0.5)", pointerEvents: "none" }}>
          {noJersey}
        </div>
      )}
      {/* No Box labels on the done screen: the set-out screen (z 1500) would open under it; the Print menu has them (review, 25 Nov 2026). */}
      {showPacking && (
        <PackingScreen startTab={showPacking === "summary" ? "summary" : "packing"} orderNumber={orderNumber} by={binFieldOf(binMap)} open={packOpen} closed={closedList} cap={boxCap} short={shortByBox} damaged={flaggedRows}
          toScan={summaryNow.counts.notScanned} summary={summaryNow} stats={summaryStats} status={binPrint} summaryLabels={summaryLabelCount} finished={!!finished}
          onPrintList={printBoxList} onPrintAll={printAllLists} onFull={binFull} onReprint={reprintBinList} onDamagedList={printDamagedList}
          onLabels={finished ? null : () => { setShowPacking(false); setBoxAuto(false); setShowBinSetup("packing"); }}
          onExport={canSupervise ? () => exportRosterXLSX(roster, log, exportMeta, rosterCols, binOf) : null}
          onPrintSummary={printSummary}
          onFinish={finished ? null : () => { setShowPacking(false); askFinish(); }}
          onClose={() => closeDialog(() => setShowPacking(false))} />
      )}
      {showPark && (
        <div style={modalBg}>
          <div style={{ ...modalCard, maxWidth: 640, width: "92vw" }}>
            <div style={{ ...titleSt, fontSize: 32, marginBottom: 8 }}>⏸ Finish order {orderNumber} later?</div>
            {/* Plain words and big numbers (the owner, 19 Nov 2026: "Still out" was confusing). */}
            {(() => { const s = outOf(roster); const tiles = [
              { n: s.done, label: "Done", colour: "var(--k-green-ink)" },
              { n: s.toScan, label: "Unscanned", colour: "var(--k-ink-1)" },
              { n: s.flagged, label: "Flagged", colour: "var(--k-red-ink)" },
              { n: s.missing, label: "Missing", colour: "var(--k-amber-ink)" },
            ]; return (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 20, color: "var(--k-ink-1)", fontWeight: 700, marginBottom: 10 }}>{s.done} of {s.total} garments are done.</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 12 }}>
                  {tiles.map(t => (
                    <div key={t.label} style={{ borderRadius: 10, background: "var(--k-page)", border: "1px solid var(--k-rule-0)", padding: "10px 6px", textAlign: "center" }}>
                      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 40, fontWeight: 800, lineHeight: 1, color: t.n ? t.colour : "var(--k-ink-5)" }}>{t.n}</div>
                      <div style={{ fontSize: 15, color: "var(--k-ink-2)", marginTop: 4 }}>{t.label}</div>
                    </div>
                  ))}
                </div>
                {(() => {
                  const g = outGroups(outList(roster, log));
                  const line = (label, list, colour) => (list.length ? <div style={{ fontSize: 17, color: colour, marginBottom: 6, lineHeight: 1.4 }}><strong>{label}:</strong> {list.slice(0, 8).map(j => jerseyWords(j) + (j.status === "flag" && j.reason ? ` (${j.reason})` : "")).join(", ")}{list.length > 8 ? ` and ${list.length - 8} more` : ""}</div> : null);
                  return <div style={{ marginBottom: 10 }}>{line("Waiting on repair", g.flag, "var(--k-red-ink-2)")}{line("Missing", g.missing, "var(--k-amber-ink-2)")}{line("Extra, with the supervisor", g.extra, "var(--k-pink-ink)")}</div>;
                })()}
                <div style={{ fontSize: 17, color: "var(--k-ink-2)", lineHeight: 1.45 }}>
                  The order is saved on the server, with everything done so far. When the garments come back, at any station: <strong>Unfinished orders</strong> on the order screen, tap this order, and scan them. A garment that will not come back, the supervisor marks <strong>Ship short</strong> on the board.
                </div>
              </div>
            ); })()}
            {parkErr && <div style={{ ...errSt, marginBottom: 12 }}>{parkErr}</div>}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={parkOrder} disabled={parking} style={{ ...bigBtn, background: "var(--k-amber)", color: "var(--k-page)", flex: 1, opacity: parking ? 0.6 : 1 }}>{parking ? "Saving on the server…" : "⏸ Finish later"}</button>
              <button onClick={() => closeDialog(() => { setShowPark(false); setParkErr(""); })} style={{ ...btnGhost, fontSize: 17, padding: "14px 22px" }}>Keep going</button>
            </div>
          </div>
        </div>
      )}
      {showStillOut && <StillOutModal orderNumber={orderNumber} groups={stillOut} rowOf={id => roster.find(r => r._id === id)} binOf={binMap ? binOf : null}
        onPass={id => { setShowStillOut(false); actions.passBack(id); }} onClose={() => closeDialog(() => setShowStillOut(false))} />}
      {showIssues && <IssuesModal missing={issues.missing} dups={issues.dups} flagged={issues.flagged} binOf={binOf} onClose={() => closeDialog(() => setShowIssues(false))} />}
      {showHistory && (
        <HistoryModal log={log} roster={roster} binOf={binOf} onClose={() => closeDialog(() => setShowHistory(false))}
          onFlag={l => { setShowHistory(false); actions.reopen(l); }} />
      )}
      {showRosterComplete && (
        <RosterCompleteModal roster={roster} offRosterFlags={summaryNow.counts.extra} canExport={canSupervise}
          onExport={() => { exportRosterXLSX(roster, log, exportMeta, rosterCols, binOf); closeDialog(() => setShowRosterComplete(false)); }}
          onPacking={() => { setShowRosterComplete(false); setShowPacking(true); }}
          onDismiss={() => closeDialog(() => setShowRosterComplete(false))} onFinish={askFinish} />
      )}
      {finished && (
        <FinishedModal orderNumber={orderNumber} status={finished} onReprint={() => printFinishLists("", true)} onPrint={() => setShowPrint(true)} onPacking={() => setShowPacking(true)} onNew={() => newOrder()} onNewAnyway={() => newOrder(true)} unsent={unsent} sendingLast={sendingLast} onBack={() => closeDialog(() => { setFinished(null); setFinishedAt(null); setUnsent(""); })} />
      )}
      {showBlanks && blanks.length > 0 && !overlay && (
        <BlanksModal groups={blanks} boxOf={binOf} scanKey={scanKey} last={lastConfirmed && isBlank(lastConfirmed.match) ? lastConfirmed : null}
          sticker={lastConfirmed && sticker?.id === lastConfirmed.id ? (sticker.status === "done" ? "sticker printed" : sticker.status === "none" ? "no label printer" : "sticker NOT printed") : ""}
          onCount={countBlank} onFlag={g => { if (g.next) flagRow(g.next); }} onUndo={unscan} onClose={() => closeDialog(() => setShowBlanks(false))} />
      )}
      {showPrint && (
        <PrintModal current={printPack} tagOf={flagTag} onClose={() => closeDialog(() => setShowPrint(false))} />
      )}
      {showFinish && (
        <FinishOrderModal orderNumber={orderNumber} roster={roster} offRosterFlags={summaryNow.counts.extra} scans={log.length} binLists={finishLists.length} bins={binSummary.filter(b => b.count > 0)} short={shortList} shipWith={shipWith}
          onConfirm={finishOrder} onCancel={() => closeDialog(() => setShowFinish(false))} onSummary={() => { setShowFinish(false); setShowPacking("summary"); }} />
      )}

      {/* Header */}
      <div style={{ background: "var(--k-card)", borderBottom: "1px solid var(--k-rule)", padding: "0 16px", height: 58, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "nowrap", flexShrink: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
          <div>
            <BrandMark height={22} title="" />
            {rosterFile && (
              <div style={{ fontSize: 13, color: "var(--k-ink-3)", whiteSpace: "nowrap", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis" }}>
                {rosterFile}{operatorName ? ` · ${operatorName}` : ""}{role ? ` (${role})` : ""}
              </div>
            )}
          </div>
          <input value={orderNumber} onChange={e => setOrderNumber(e.target.value)} placeholder="Order number…" title="Order number"
            onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur(); }}
            style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid var(--k-rule-3)", background: "var(--k-field)", color: "var(--k-ink-1)", fontSize: 16, fontWeight: 700, width: 140 }} />
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "nowrap", flex: 1, minWidth: 0, overflow: "hidden", justifyContent: "flex-end" }}>
          <Pill color="var(--k-green)" active={rosterFilter === "pass"} onClick={() => filterRoster("pass")} title="Show the passed garments">{passCount} Pass</Pill>
          <Pill color="var(--k-red)" active={rosterFilter === "flag"} onClick={() => filterRoster("flag")} title="Show the flagged garments">{flagCount} Flag</Pill>
          {sorting && <span title="Signed in as a sorter: sorting only, no inspection"><Pill color="var(--k-violet)">Sorting</Pill></span>}
          {!sorting && checksLeft > 0 && <span title="After a mistake the next garments are read twice and must agree before a green"><Pill color="var(--k-blue-ink)">Checking · {checksLeft}</Pill></span>}
          {!sorting && sessionStarted && <span title={`After a defect, inspect the next ${inspect.full} fully; after ${inspect.every} clean, one spot check`}><Pill color={inspect.phase === "quick" ? "var(--k-ink-3)" : "var(--k-amber)"}>{inspectLabel(inspect, inspect.checks || CHECKS)}</Pill></span>}
          {manualCount > 0 && <Pill color="var(--k-amber)" active={rosterFilter === "manual"} onClick={() => filterRoster("manual")} title="Show the garments entered by hand">{manualCount} By hand</Pill>}
          {hubOk === false && <Pill alert color="var(--k-red-ink)" title="The supervisor's board cannot be reached; scanning still works">Board offline</Pill>}
          {saveOk === false && <Pill alert color="var(--k-red-ink)" title="This PC's storage is full or blocked: the order is not being saved, so a reload or a crash would lose the work since. Tell the supervisor; do not close or reload this page.">⚠ NOT SAVING — tell the supervisor</Pill>}
          {openCount - flagCount > 0 && <Pill color="var(--k-amber)">{openCount - flagCount} Missing</Pill>}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "nowrap", flexShrink: 0 }}>
          {sessionStarted && <button onClick={() => setShowPrint(true)} title="Print any label of this order again, or of an order done before" style={{ ...btnGhost, padding: "6px 12px", fontSize: 14 }}>🖨 Print</button>}
          {sessionStarted && <button onClick={() => setShowPark(true)} disabled={locatingUp} title="Put this order aside: it is saved on the server until the garments come back. Any station opens it again from Unfinished orders" style={{ ...btnGhost, padding: "6px 12px", fontSize: 14, borderColor: "var(--k-amber)", color: "var(--k-amber-ink-2)" }}>⏸ Finish later</button>}
          {sessionStarted && <button onClick={askFinish} disabled={locatingUp} title="Close this order, after a confirm, and go back to waiting for the next — no PIN needed" style={{ ...btnGhost, padding: "6px 12px", fontSize: 14, borderColor: "var(--k-green)", color: "var(--k-green-ink)" }}>🏁 Finish order</button>}
          {signedIn && <button onClick={signOut} title="End your shift at this station" style={{ ...btnGhost, padding: "6px 12px", fontSize: 14 }}>Sign out</button>}
          <button onClick={toggleFullscreen} title={isFullscreen ? "Leave full screen (Esc also works)" : "Full screen — hides the browser's tabs and address bar (F11 does the same)"} style={{ ...btnGhost, padding: "6px 12px", fontSize: 14 }}>{isFullscreen ? "⛶ Exit" : "⛶"}</button>
          {fsHint && <span style={{ fontSize: 14, color: "var(--k-amber-ink-2)" }}>{fsHint}</span>}
          <button onClick={() => setShowSettings(true)} title="Settings" style={{ ...btnGhost, padding: "6px 12px", fontSize: 16 }}>⚙</button>
        </div>
      </div>

      {(notes || jerseyType) && (
        <div style={{ background: "var(--k-tint-amber)", borderBottom: "1px solid var(--k-tint-amber-line)", padding: "9px 16px", fontSize: 16, color: "var(--k-amber-ink-2)", flexShrink: 0, display: "flex", gap: 14, alignItems: "center" }}>
          {jerseyType && <span style={{ border: "1px solid var(--k-blue-ink)", color: "var(--k-blue-ink-2)", borderRadius: 999, padding: "2px 12px", fontWeight: 700, whiteSpace: "nowrap" }}>{jerseyTypeLabel(jerseyType)} · {jerseyTypeOf(jerseyType)?.construction}</span>}
          {notes && <span><strong>Order notes:</strong> {notes}</span>}
        </div>
      )}

      {sessionStarted && orderSetBy && (
        <div style={{ background: "var(--k-tint-green)", borderBottom: "1px solid var(--k-tint-green-line)", padding: "9px 16px", fontSize: 16, color: "var(--k-green-ink-3)", flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <span>🔢 <strong>{orderSetBy.by || "The supervisor"} set this order's number to {orderSetBy.orderNumber}.</strong> Reports and the board use it from now on.</span>
          <button onClick={() => setOrderSetBy(null)} title="Hide" style={{ background: "transparent", border: 0, color: "var(--k-green-ink-3)", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "4px 8px" }}>✕</button>
        </div>
      )}
      {sessionStarted && newRosters.length > 0 && (
        <div style={{ background: "var(--k-tint-blue)", borderBottom: "1px solid var(--k-tint-blue-line)", padding: "9px 16px", fontSize: 16, color: "var(--k-blue-ink-3)", flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <span>📋 <strong>{newRosters.map(r => `Order ${r.orderNumber || "—"} from ${r.by || "the supervisor"} (${r.rowCount} ${r.rowCount === 1 ? "garment" : "garments"}${r.forStation ? ", for this station" : ""})`).join(" · ")}</strong> is waiting for you — it is offered when this order ends, or on Finish order.</span>
          <button onClick={() => setNewRosters([])} title="Hide" style={{ background: "transparent", border: 0, color: "var(--k-blue-ink-3)", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "4px 8px" }}>✕</button>
        </div>
      )}

      {roster.length > 0 && (
        <div style={{ height: 8, background: "var(--k-field)", flexShrink: 0 }}>
          <div style={{ height: "100%", background: rosterComplete ? "var(--k-green)" : "var(--k-blue)", width: `${(scannedRows.length / roster.length) * 100}%`, transition: "width 0.4s ease" }} />
        </div>
      )}

      {/* Main layout */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* LEFT: Camera */}
        <div style={{ width: "min(580px, 46vw)", flexShrink: 0, display: "flex", flexDirection: "column", borderRight: "1px solid var(--k-rule)", background: "var(--k-page)" }}>
          <canvas ref={canvasRef} style={{ display: "none" }} />
          <canvas ref={motionCanvasRef} style={{ display: "none" }} />

          {roster.length === 0 ? (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, textAlign: "center" }}>
              <div style={{ fontSize: 48, marginBottom: 10 }}>📋</div>
              <div style={{ fontWeight: 700, fontSize: 22, marginBottom: 8 }}>No roster loaded</div>
              <div style={{ fontSize: 15, color: "var(--k-ink-3)", marginBottom: 16 }}>
                CSV or Excel: <code style={codeSt}>name</code> <code style={codeSt}>number</code> <code style={codeSt}>team</code> <code style={codeSt}>size</code>
              </div>
              {error && <p style={{ fontSize: 15, color: "var(--k-red-ink)", marginTop: 10 }}>{error}</p>}
            </div>
          ) : (
            <>
              <div style={{ display: "flex", borderBottom: "1px solid var(--k-rule)" }}>
                {["camera", "upload"].map(m => (
                  <button key={m} onClick={() => { setInputMode(m); if (m === "upload") stopCamera(); }}
                    style={{ flex: 1, padding: "11px 0", border: "none", background: inputMode === m ? "var(--k-tint-blue)" : "transparent", color: inputMode === m ? "var(--k-blue-ink)" : "var(--k-ink-4)", fontWeight: 700, fontSize: 16, borderBottom: inputMode === m ? "2px solid var(--k-blue)" : "2px solid transparent", cursor: "pointer" }}>
                    {m === "camera" ? "📷 Webcam" : "🖼 Upload"}
                  </button>
                ))}
              </div>

              {inputMode === "camera" && (
                <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                  <div style={{ position: "relative", background: "#000", flex: 1, overflow: "hidden" }}>
                    <video ref={videoRef} autoPlay playsInline muted
                      style={{ width: "100%", height: "100%", objectFit: "cover", display: cameraOn ? "block" : "none", transform: `rotate(${settings.rotation || 0}deg)` }} />
                    {!cameraOn && (
                      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
                        <span style={{ fontSize: 52 }}>📷</span>
                        <span style={{ fontSize: 20, color: "#A2ADC6" }}>Camera off</span>
                      </div>
                    )}
                    {cameraOn && (
                      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                        <div style={{ width: 220, height: 132, border: "3px solid rgba(255,255,255,0.4)", borderRadius: 8, boxShadow: "0 0 0 9999px rgba(0,0,0,0.25)" }} />
                      </div>
                    )}
                    {scanning && (
                      <div style={{ position: "absolute", inset: 0, background: "var(--k-tint-blue)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <div style={{ color: "#fff", fontWeight: 700, fontSize: 26, background: "rgba(0,0,0,0.65)", padding: "14px 32px", borderRadius: 999 }}>⏳ Reading…</div>
                      </div>
                    )}
                    {cameraOn && !scanning && (
                      <>
                        <div style={{ position: "absolute", top: 10, right: 10, display: "flex", alignItems: "center", gap: 9, background: "rgba(0,0,0,0.65)", padding: "8px 16px", borderRadius: 999 }}>
                          <div style={{ width: 12, height: 12, borderRadius: "50%", background: armed && handsFree ? "#FFB547" : handsFreePaused || (waitPedal && handsFree) ? "#A2ADC6" : "#6FD08C", boxShadow: `0 0 5px ${armed && handsFree ? "#FFB547" : handsFreePaused || (waitPedal && handsFree) ? "#A2ADC6" : "#6FD08C"}` }} />
                          <span style={{ fontSize: 17, fontWeight: 700, color: "#EEF1F8" }}>{armed && handsFree ? "Waiting for the next garment…" : handsFreePaused ? `Hands-free paused — ${keyLabel} to scan` : !settings.autoScan ? `Hands-free off — ${keyLabel} to scan` : roster.length > 0 && remaining === 0 ? "Order done — hands-free off" : waitPedal ? `Flagged — press ${keyLabel} to scan the next garment` : "Ready"}</span>
                        </div>
                        {!sorting && checksLeft > 0 && (
                          <div title="After a mistake the next garments are read twice and must agree before a green" style={{ position: "absolute", top: 54, right: 10, display: "flex", alignItems: "center", gap: 9, background: "rgba(0,81,155,0.92)", padding: "8px 16px", borderRadius: 999 }}>
                            <span style={{ fontSize: 17, fontWeight: 700, color: "#fff" }}>Double-checking · {checksLeft} to go</span>
                          </div>
                        )}
                        <div style={{ position: "absolute", bottom: 10, left: "50%", transform: "translateX(-50%)", background: "rgba(0,0,0,0.65)", color: "#EEF1F8", fontSize: 15, padding: "6px 14px", borderRadius: 999, whiteSpace: "nowrap" }}>
                          Press <kbd style={{ background: "#2A3555", padding: "2px 7px", borderRadius: 4, fontSize: 15, fontWeight: 700 }}>{keyLabel}</kbd> to scan
                        </div>
                      </>
                    )}
                  </div>
                  <div style={{ padding: "12px 14px", display: "flex", gap: 10, borderTop: "1px solid var(--k-rule)" }}>
                    {!cameraOn
                      ? <button onClick={startCamera} style={{ ...btnPri, flex: 1, fontSize: 22, padding: "16px" }}>Start camera</button>
                      : <>
                          <button onClick={stopCamera} title="Stop the camera" style={{ ...btnGhost, width: 56, fontSize: 18 }}>■</button>
                          <button onClick={toggleHandsFree} title={!settings.autoScan ? "Turn hands-free scanning on" : handsFreePaused ? "Resume hands-free scanning" : `Pause hands-free — the camera stays on and ${keyLabel} still scans`}
                            style={{ ...btnGhost, padding: "0 14px", fontSize: 16, fontWeight: 700, borderColor: "var(--k-amber)", color: "var(--k-amber-ink-2)", background: handsFree ? "var(--k-tint-amber)" : "transparent", whiteSpace: "nowrap" }}>{handsFree ? "⏸ Pause scan" : "▶ Hands-free"}</button>
                          <button onClick={() => { gateRef.current.disarm(); setArmed(false); doTriggerScan(); }} disabled={scanning || anyDialogOpen || !!overlay}
                            style={{ ...btnPri, flex: 1, fontFamily: FONT_DISPLAY, fontSize: 30, fontWeight: 900, letterSpacing: 1, padding: "14px", opacity: scanning ? 0.4 : 1 }}>
                            {scanning ? "Reading…" : "⚡ SCAN"}
                          </button>
                        </>
                    }
                    <button onClick={() => { gateRef.current.disarm(); setArmed(false); actions.manual(); }} disabled={scanning || anyDialogOpen || locatingUp} title="Type the garment in — when the camera cannot read it"
                      style={{ ...btnGhost, padding: "0 14px", fontSize: 16, fontWeight: 700, whiteSpace: "nowrap" }}>⌨ By hand{byHandKey ? <> <Kbd>{formatKey(byHandKey)}</Kbd></> : null}</button>
                    {blanks.length > 0 && (
                      <button onClick={() => { gateRef.current.disarm(); setArmed(false); setShowBlanks(true); }} title="Garments with no name and no number: count them in by team and size"
                        style={{ ...btnGhost, padding: "0 14px", fontSize: 16, fontWeight: 700, whiteSpace: "nowrap", borderColor: "var(--k-green)", color: "var(--k-green-ink)" }}>Blanks · {blanks.reduce((t, g) => t + (g.total - g.done - g.flagged), 0)}</button>
                    )}
                  </div>
                  {error && <p style={{ padding: "0 14px 10px", fontSize: 15, color: "var(--k-red-ink)" }}>{error}</p>}
                </div>
              )}

              {inputMode === "upload" && (
                <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20, gap: 12 }}>
                  {thumb
                    ? <img src={thumb} alt="uploaded" style={{ width: "100%", borderRadius: 8, maxHeight: 300, minHeight: 0, flex: "0 1 auto", objectFit: "contain" }} />
                    : <div style={{ width: "100%", aspectRatio: "4/3", background: "var(--k-page)", borderRadius: 8, border: "2px dashed var(--k-rule-2)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, color: "var(--k-ink-5)" }}>
                        <span style={{ fontSize: 48 }}>🖼</span>
                        <span style={{ fontSize: 16 }}>No photo selected</span>
                      </div>
                  }
                  <input ref={photoRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePhotoUpload} />
                  <button onClick={() => photoRef.current.click()} disabled={scanning || locatingUp}
                    style={{ ...btnPri, width: "100%", fontSize: 20, padding: "14px", opacity: scanning ? 0.5 : 1 }}>
                    {scanning ? "⏳ Reading…" : "⚡ Upload & scan"}
                  </button>
                  {error && <p style={{ fontSize: 15, color: "var(--k-red-ink)" }}>{error}</p>}
                </div>
              )}

              {lastConfirmed && (
                <div style={{ padding: "10px 14px", borderTop: "1px solid var(--k-rule)", display: "flex", alignItems: "center", gap: 14, background: "var(--k-tint-green-faint)", flexShrink: 0, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 14, color: "var(--k-ink-3)", whiteSpace: "nowrap" }}>Last passed</span>
                  <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 30, lineHeight: 1 }}>#{lastConfirmed.match?.number}{lastConfirmed.match?.name ? <span style={{ fontFamily: FONT_READ, fontWeight: 700 }}>{` · ${lastConfirmed.match.name}`}</span> : ""}</span>
                  {lastConfirmed.match?.size && <span style={{ fontFamily: FONT_DISPLAY, fontSize: 26, lineHeight: 1, color: "var(--k-green-ink)", fontWeight: 800 }}>{shortSize(lastConfirmed.match.size)}</span>}
                  {binOf(lastConfirmed.match) !== null && <span style={{ fontFamily: FONT_DISPLAY, fontSize: 26, lineHeight: 1, color: "var(--k-blue-ink)", fontWeight: 800 }}>Box {binOf(lastConfirmed.match)}</span>}
                  {lastConfirmed.match?._id !== undefined && roster.some(r => r._id === lastConfirmed.match._id && r.scanned) && (
                    <button onClick={() => unscan(lastConfirmed.match._id)} title="Un-check it; it must be scanned again" style={{ ...btnGhost, padding: "5px 12px", fontSize: 14, borderColor: "var(--k-amber)", color: "var(--k-amber-ink-2)", whiteSpace: "nowrap" }}>↶ Undo</button>
                  )}
                  {lastConfirmed.match?._id !== undefined && roster.some(r => r._id === lastConfirmed.match._id && (r.scanned === "pass" || r.scanned === "manual")) && (
                    <button onClick={actions.reopenLast} disabled={locatingUp} title="Found a problem after confirming? Flag this garment" style={{ ...btnGhost, padding: "5px 12px", fontSize: 14, borderColor: "var(--k-red)", color: "var(--k-red-ink-2)", whiteSpace: "nowrap" }}>🚩 Flag it</button>
                  )}
                  {settings.stickers && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14, whiteSpace: "nowrap", color: sticker?.id === lastConfirmed.id && sticker.status === "done" ? "var(--k-green-ink)" : sticker?.id === lastConfirmed.id ? "var(--k-amber-ink)" : "var(--k-ink-3b)" }}>
                      {sticker?.id !== lastConfirmed.id ? "🖨 Printing the sticker…" : sticker.status === "done" ? "🖨 Sticker printed" : sticker.status === "none" ? "🖨 No label printer for this station" : `🖨 Sticker not printed: ${sticker.message}`}
                      {sticker?.id === lastConfirmed.id && (
                        <button onClick={() => { setSticker(null); printSticker(lastConfirmed); }} title="Print this garment's sticker again" style={{ ...btnGhost, padding: "4px 10px", fontSize: 13, whiteSpace: "nowrap" }}>Reprint</button>
                      )}
                    </span>
                  )}
                  <span style={{ fontSize: 14, color: "var(--k-ink-3b)", marginLeft: "auto" }}>{lastConfirmed.timestamp}</span>
                </div>
              )}

              {lastResult && lastResult.status !== S_PASS && !overlay && (
                <div style={{ padding: "0 10px 10px", flexShrink: 0 }}>
                  <ResultCard result={lastResult} onResolve={resolveFlag} canResolve={canSupervise} />
                </div>
              )}

              {/* Bottom-left, under the last pass: the order's history, where the hand already is. */}
              {sessionStarted && (
                <div style={{ padding: "8px 14px", borderTop: "1px solid var(--k-rule)", display: "flex", alignItems: "center", gap: 8, flexShrink: 0, minWidth: 0, overflow: "hidden" }}>{/* one line, short labels, never under the roster (the owner, 19 Nov 2026) */}
                  {stillOut.total > 0 && <button onClick={() => setShowStillOut(true)} title="The garments this order is waiting for: back from repair, missing, extra. Scan one when it comes back, or pass it here" style={{ ...btnGhost, padding: "7px 14px", fontSize: 15, fontWeight: 800, whiteSpace: "nowrap", borderColor: "var(--k-sky)", color: "var(--k-sky-ink)" }}>🔧 Still out · {stillOut.total}</button>}
                  <button onClick={() => setShowHistory(true)} title="Every garment scanned this order, latest first — flag one after the fact" style={{ ...btnGhost, padding: "7px 14px", fontSize: 15, fontWeight: 700, whiteSpace: "nowrap" }}>🕘 History · {new Set(log.filter(l => l.match && l.match._id !== undefined && (l.status === S_PASS || l.status === S_FLAGGED || l.status === S_MANUAL)).map(l => l.match._id)).size}</button>
                  <button onClick={() => setShowPacking(true)} title="Packing: what to do next, each box with its list (Print list, Box full), and the order summary" style={{ ...btnGhost, padding: "7px 14px", fontSize: 15, fontWeight: 700, whiteSpace: "nowrap", ...(heavyBin ? { background: "var(--k-red)", borderColor: "var(--k-red)", color: "var(--k-on-red)" } : { borderColor: "var(--k-green)", color: "var(--k-green-ink-2)" }) }}>{heavyBin ? `📦 Box ${heavyBin.bin} ~${Math.round(heavyBin.weight)} lb — close it` : "📦 Packing / Summary"}</button>
                  <button onClick={() => setShowIssues(true)} title="The lists of what is missing, what came twice and what is flagged" style={{ ...btnGhost, padding: "7px 14px", fontSize: 15, fontWeight: 700, whiteSpace: "nowrap", borderColor: issues.missing.length + issues.dups.length + issues.flagged.length ? "var(--k-amber)" : "var(--k-rule-2)" }}>
                    ⚠ Mis <span style={{ color: "var(--k-amber-ink)" }}>{issues.missing.length}</span> · Dup <span style={{ color: "var(--k-purple)" }}>{issues.dups.length}</span> · Flag <span style={{ color: "var(--k-red-ink)" }}>{issues.flagged.length}</span>
                  </button>
                </div>
              )}

            </>
          )}
        </div>

        {/* RIGHT: Info panel — the result screen takes this half so the camera stays in view */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0, position: "relative" }}>
          {overlay && (   /* the result screen takes this half, so the camera stays in view: one layout on every PC */
            <ScanOverlay key={overlayKey} inspect={sorting ? null : inspect} sorter={sorting} embedded state={overlay} actions={actions} binMap={binMap} extraCols={extraCols} notes={notes} jerseyType={jerseyType} confirmKey={confirmKey} cancelKey={cancelKey} upKey={upKey} retryKey={retryKey} byHandKey={byHandKey} ticket={overlay?.mode === "supervisor" ? ticketFor(overlay.entryId) : null} reprintTicket={reprintTicket} listSort={settings.listSort} lastSize={lastConfirmed?.match?.size || ""} paused={overlayPaused}
              stream={cameraOn ? streamRef.current : null} rotation={settings.rotation} canPhoto={cameraOn && inputMode === "camera" && !sorting} />
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", borderBottom: "1px solid var(--k-rule)", flexShrink: 0 }}>{/* no ETA here (the owner, 19 Nov 2026): it is on the board and the Wall */}
            {[
              { label: "Done",      value: `${scannedRows.length} / ${roster.length}`, color: "var(--k-ink-1)" },
              { label: "Remaining", value: remaining,  color: remaining === 0 ? "var(--k-green)" : "var(--k-amber)" },
              { label: "Open",      value: openCount,  color: openCount > 0 ? "var(--k-red)" : "var(--k-ink-4)" },
            ].map(s => (
              <div key={s.label} style={{ padding: "14px 0 12px", textAlign: "center", borderRight: "1px solid var(--k-rule)" }}>
                <div style={{ fontFamily: FONT_DISPLAY, fontSize: 54, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 15, color: "var(--k-ink-3)", marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", borderBottom: "1px solid var(--k-rule)", flexShrink: 0 }}>
            {["roster", "log"].map(v => (
              <button key={v} onClick={() => setView(v)} style={{ flex: 1, padding: "11px 0", border: "none", background: "transparent", color: view === v ? "var(--k-blue)" : "var(--k-ink-4)", fontWeight: 700, fontSize: 16, borderBottom: view === v ? "2px solid var(--k-blue)" : "2px solid transparent", cursor: "pointer", textTransform: "capitalize" }}>
                {v === "log" ? `Log (${log.length})` : `Roster (${roster.length})`}
              </button>
            ))}
            {canSupervise && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 12px", borderLeft: "1px solid var(--k-rule)", flexWrap: "wrap" }}>
              {roster.length > 0 && (
                <>
                  <button onClick={() => addRef.current.click()} title="Append another roster file to this order" style={{ ...btnGhost, padding: "6px 12px", fontSize: 14 }}>+ Add</button>
                  <input ref={addRef} type="file" accept=".csv,.xlsx,.xls,.tsv,.txt" style={{ display: "none" }} onChange={handleRosterAdd} />
                  <button onClick={() => rosterRef.current.click()} title="Replace the roster (scans stay in the log)" style={{ ...btnGhost, padding: "6px 12px", fontSize: 14 }}>Replace</button>
                  <input ref={rosterRef} type="file" accept=".csv,.xlsx,.xls,.tsv,.txt" style={{ display: "none" }} onChange={handleRosterUpload} />
                  <button onClick={() => exportRosterXLSX(roster, log, exportMeta, rosterCols, binOf)}
                    style={{ ...btnPri, padding: "6px 14px", fontSize: 14, background: rosterComplete ? "var(--k-green)" : "var(--k-blue)" }}>
                    {rosterComplete ? "✅ Export" : "⬇ Export"}
                  </button>
                  {log.some(l => l.status === S_FLAGGED) && (
                    <button onClick={() => exportDamageReportXLSX(buildDamageRows(log, { operatorName, orderNumber, jerseyType, typeLabel: jerseyTypeLabel }), { name: orderNumber || "order", title: `Damage report — order ${orderNumber || "—"}${jerseyType ? " · " + jerseyTypeLabel(jerseyType) : ""}` }).catch(e => setError(e.message))}
                      title="Every flagged garment of this order with its photo, as Excel" style={{ ...btnGhost, padding: "6px 14px", fontSize: 14, borderColor: "var(--k-red)", color: "var(--k-red-ink)" }}>⬇ Damage report</button>
                  )}
                </>
              )}
            </div>
            )}
          </div>

          {view === "roster" && (
            <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
              {/* Sort by / Show stay put above the list; only the table scrolls. */}
              {roster.length > 0 && (
                <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 10, padding: "6px 14px", background: "var(--k-card)", borderBottom: "1px solid var(--k-rule)", fontSize: 15, flexWrap: "wrap" }}>
                  {/* Search first: on a 500-jersey order, finding one jersey is the commonest thing asked of
                      this table. Enter or Esc leaves the box (Esc also empties it), so the pedal scans again:
                      while the cursor is in a box the scan key types, it does not scan. */}
                  <span style={{ position: "relative", display: "flex", alignItems: "center" }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--k-ink-3)" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true" style={{ position: "absolute", left: 9, pointerEvents: "none" }}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
                    <input ref={searchRef} value={rosterSearch} onChange={e => setRosterSearch(e.target.value)} onFocus={() => setSearchKeys(true)} onBlur={() => setSearchKeys(false)} placeholder="Number or name" aria-label="Find a garment by number or name" title="Find a garment: 57, smith, or 57 smith. Enter keeps it, Esc clears it."
                      onKeyDown={e => { e.stopPropagation(); if (e.key === "Escape") { setRosterSearch(""); e.currentTarget.blur(); } else if (e.key === "Enter") e.currentTarget.blur(); }}
                      style={{ width: 190, boxSizing: "border-box", padding: "5px 26px 5px 30px", borderRadius: 6, border: `1px solid ${rosterSearch ? "var(--k-blue-ink)" : "var(--k-rule-3)"}`, background: "var(--k-field)", color: "var(--k-ink-1)", fontSize: 15, fontWeight: rosterSearch ? 800 : 500 }} />
                    {rosterSearch && <button onMouseDown={e => e.preventDefault()} onClick={() => setRosterSearch("")} aria-label="Clear the search" title="Clear the search" style={{ position: "absolute", right: 4, border: "none", background: "transparent", color: "var(--k-ink-3)", fontSize: 16, lineHeight: 1, cursor: "pointer", padding: "2px 5px" }}>×</button>}
                  </span>
                  {/* The sort is one menu, not six buttons: fewer words on the bar. It lets go of the
                      keyboard as soon as something is chosen: a menu with the cursor in it would take the
                      station's keys as its own (a letter key jumps to a choice: B to "Box"). */}
                  <label style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--k-ink-3)", fontWeight: 700 }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3" /></svg>
                    <select value={rosterSort} onChange={e => { setRosterSort(e.target.value); e.currentTarget.blur(); }} aria-label="Sort the table by" title="Sort the table: Size is the rack order (youth before adult, XS before 3XL); Status puts the done ones first"
                      style={{ background: "var(--k-field)", color: "var(--k-ink-1)", border: "1px solid var(--k-rule-3)", borderRadius: 6, fontSize: 14, padding: "5px 8px", fontWeight: 700 }}>
                      {ROSTER_SORTS.filter(x => x.id !== "bin" || binMap).map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
                    </select>
                  </label>
                  {(rosterSort === "status" || rosterSort === "bin") && (
                    <button onClick={() => setDoneFirst(d => !d)} title="Which end the finished garments sit at" style={{ ...btnGhost, padding: "3px 10px", fontSize: 14, borderColor: "var(--k-amber)", color: "var(--k-amber-ink-2)" }}>⇅ {doneFirst ? "Done first" : "To do first"}</button>
                  )}
                  {(() => {
                    // The filters sit behind one funnel button, like a shop's search page: the
                    // row stays short, the button says how many are on, and the panel opens under it.
                    const on = [sizeFilter, teamFilter, boxFilter, doneFilter].filter(Boolean).length;
                    return (
                      <button onClick={() => setShowFilters(v => !v)} title="Show only one size, team or box, or only what is done or still to do" aria-expanded={showFilters}
                        style={{ ...btnGhost, marginLeft: 6, padding: "3px 12px", fontSize: 14, display: "flex", alignItems: "center", gap: 7, borderColor: on || showFilters ? "var(--k-blue-ink)" : "var(--k-rule-2)", color: on || showFilters ? "var(--k-strong)" : "var(--k-ink-3)", background: on ? "var(--k-tint-blue)" : "transparent", fontWeight: on ? 800 : 500 }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 5h18l-7 8.5V19l-4 2v-7.5L3 5z" /></svg>
                        Filters{on ? ` · ${on}` : ""} <span style={{ fontSize: 11 }}>{showFilters ? "▲" : "▼"}</span>
                      </button>
                    );
                  })()}
                  {searchKeys && (
                    <div style={{ flexBasis: "100%", borderTop: "1px solid var(--k-rule)", marginTop: 2, paddingBottom: 6 }}>
                      {/* The stations have no keyboard: the keys come up when the search box is clicked and go when
                          Done is pressed or anything else is clicked. The table under them filters as each key lands.
                          They sit BEFORE the "N shown" line, so that line appearing never moves the keys under the finger. */}
                      <ScreenKeys layout="search" onKey={k => setRosterSearch(v => typeKey(v, k))} onEnter={() => searchRef.current?.blur()} enterLabel="Done" />
                    </div>
                  )}
                  {(rosterFilter || rosterSearch.trim() || sizeFilter || teamFilter || boxFilter || doneFilter) && (
                    <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, fontWeight: 700, color: rosterFilter === "pass" ? "var(--k-green)" : rosterFilter === "flag" ? "var(--k-red-ink)" : rosterFilter ? "var(--k-amber-ink)" : "var(--k-ink-2)" }}>
                      <span>{shownRows.length + (rosterFilter === "flag" ? offRosterFlags : 0)} {rosterFilter === "pass" ? "passed" : rosterFilter === "flag" ? "flagged" : rosterFilter ? "by hand" : "shown"}{sizeFilter ? ` · ${sizeFilter}` : ""}{teamFilter ? ` · ${teamFilter}` : ""}{boxFilter ? ` · Box ${boxFilter}` : ""}{doneFilter === "done" ? " · done" : doneFilter === "todo" ? " · to do" : ""}{rosterSearch.trim() ? ` · “${rosterSearch.trim()}”` : ""}</span>
                      <button onClick={() => { setRosterFilter(null); setSizeFilter(""); setTeamFilter(""); setBoxFilter(""); setDoneFilter(""); setRosterSearch(""); }} style={{ ...btnGhost, padding: "3px 10px", fontSize: 13 }}>Show all</button>
                    </span>
                  )}
                  {showFilters && (() => {
                    const ch = rosterChoices(roster);
                    const selSt = (on, c, b) => ({ background: "var(--k-field)", color: on ? c : "var(--k-ink-2)", border: `1px solid ${on ? b : "var(--k-rule-3)"}`, borderRadius: 6, fontSize: 15, padding: "6px 10px", fontWeight: on ? 800 : 500 });
                    const field = (label, control) => <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 12, fontWeight: 700, color: "var(--k-ink-3)", letterSpacing: 0.5 }}>{label}{control}</label>;
                    return (
                      <div style={{ flexBasis: "100%", display: "flex", alignItems: "flex-end", gap: 14, flexWrap: "wrap", padding: "8px 2px 4px", borderTop: "1px solid var(--k-rule)", marginTop: 2 }}>
                        {binSummary.length > 0 && field("BOX",
                          <select value={boxFilter} onChange={e => { setBoxFilter(e.target.value); e.currentTarget.blur(); }} title="Only this box: what is in it, and what is still to go in it" style={selSt(boxFilter, "var(--k-blue-ink-2)", "var(--k-blue)")}>
                            <option value="">All boxes</option>
                            {binSummary.map(b => <option key={b.bin} value={String(b.bin)}>Box {b.bin} · {b.label} · {b.count} in it{b.open ? "" : " · closed"}</option>)}
                          </select>)}
                        {field("DONE OR TO DO",
                          <select value={doneFilter} onChange={e => { setDoneFilter(e.target.value); e.currentTarget.blur(); }} title="Done = passed or entered by hand, so in a box. To do = unscanned." style={selSt(doneFilter, "var(--k-green-ink-2)", "var(--k-green)")}>
                            <option value="">Both</option>
                            <option value="done">Done only</option>
                            <option value="todo">To do only</option>
                          </select>)}
                        {ch.sizes.length > 1 && field("SIZE",
                          <select value={sizeFilter} onChange={e => { setSizeFilter(e.target.value); e.currentTarget.blur(); }} title="Only this size" style={selSt(sizeFilter, "var(--k-amber-ink)", "var(--k-amber)")}>
                            <option value="">All sizes</option>
                            {ch.sizes.map(x => <option key={x} value={x}>{shortSize(x)}</option>)}
                          </select>)}
                        {ch.teams.length > 1 && field("TEAM",
                          <select value={teamFilter} onChange={e => { setTeamFilter(e.target.value); e.currentTarget.blur(); }} title="Only this team or colour" style={selSt(teamFilter, "var(--k-blue-ink-2)", "var(--k-blue)")}>
                            <option value="">All teams</option>
                            {ch.teams.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>)}
                      </div>
                    );
                  })()}
                </div>
              )}
              <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
              {roster.length === 0
                ? <div style={{ padding: 32, textAlign: "center", color: "var(--k-ink-3)", fontSize: 17 }}>No roster loaded.</div>
                : (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 18 }}>
                    <thead style={{ position: "sticky", top: 0, background: "var(--k-card)", zIndex: 1 }}>
                      <tr>
                        <th style={thSt}>Status</th>
                        {rosterCols.map(c => <th key={c} style={thSt}>{cap(c)}</th>)}
                        {binMap && <th style={thSt}>Box</th>}
                        <th style={thSt}>Mark</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shownRows.map(r => <RosterRow key={r._id} r={r} cols={rosterColsStable} hasBins={!!binMap} bin={binMap ? binOf(r) : null} canSupervise={canSupervise} onMark={onMarkRow} />)}
                      {shownRows.length === 0 && !(rosterFilter === "flag" && offRosterFlags > 0) && (
                        <tr><td colSpan={rosterColsStable.length + (binMap ? 3 : 2)} style={{ ...tdSt, textAlign: "center", color: "var(--k-ink-3)", padding: "28px 12px", fontSize: 17 }}>
                          No garment on this order matches{rosterSearch.trim() ? ` “${rosterSearch.trim()}”` : " these filters"}. Press Show all to see the whole roster.
                        </td></tr>
                      )}
                    </tbody>
                  </table>
                )
              }
              {/* Flags with no roster row (not on the roster, duplicate, no size tag) are in the
                  header's Flag count too, so the Flag filter lists them under the table (the owner,
                  20 Nov 2026: "4 Flag" showed 3 jerseys). */}
              {rosterFilter === "flag" && offRosterFlags > 0 && (
                <div style={{ padding: "12px 14px" }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "var(--k-red-ink-2)", letterSpacing: 0.5, marginBottom: 6 }}>NOT ON THE ROSTER · DUPLICATE · NO SIZE TAG ({offRosterFlags})</div>
                  {offRosterList.map(l => (
                    <div key={l.id} style={{ display: "flex", gap: 14, alignItems: "baseline", padding: "8px 4px", borderBottom: "1px solid var(--k-rule)", fontSize: 18 }}>
                      <span style={{ color: "var(--k-red-ink)" }}>🛑</span>
                      <span style={{ fontWeight: 800, color: "var(--k-strong)", minWidth: 60 }}>#{l.match?.number || "?"}</span>
                      {l.match?.name && <span style={{ color: "var(--k-ink-1)", fontFamily: FONT_READ }}>{l.match.name}</span>}
                      {l.match?.size && <span style={{ color: "var(--k-amber-ink)", fontWeight: 700 }}>{shortSize(l.match.size)}</span>}
                      <span style={{ color: "var(--k-red-ink-2)" }}>{l.reason}</span>
                      <span style={{ marginLeft: "auto", color: "var(--k-ink-4)", fontSize: 14 }}>{String(l.timestamp || "").slice(-8)}</span>
                    </div>
                  ))}
                </div>
              )}
              </div>
            </div>
          )}

          {view === "log" && (
            <div style={{ flex: 1, overflowY: "auto", padding: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 15, color: "var(--k-ink-3)" }}>{log.length} scans this session</span>
                {canSupervise && log.length > 0 && <button onClick={() => exportLogCSV(log, orderNumber, binOf)} style={{ ...btnGhost, fontSize: 14, padding: "6px 12px" }}>⬇ Export log</button>}
              </div>
              {log.length === 0
                ? <div style={{ textAlign: "center", padding: 28, color: "var(--k-ink-3)", fontSize: 17 }}>No scans yet.</div>
                : log.map(l => (
                  <div key={l.id} style={{ ...card, borderLeft: `3px solid ${statusColor(l.status)}`, padding: "10px 12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      {(l.photo || l.thumb) && <img src={l.photo || l.thumb} alt="" title={l.photo ? "Photo kept for the supervisor — click to enlarge" : ""} onClick={l.photo ? () => setBigPhoto(photoSet(l.photo, l.damagePhotos, 0, photoCaption(l.match?.number, l.match?.name, l.reason))) : undefined} style={{ width: l.photo ? 72 : 48, height: l.photo ? 54 : 36, objectFit: "cover", borderRadius: 4, flexShrink: 0, cursor: l.photo ? "zoom-in" : "default", border: l.photo ? "1px solid var(--k-red)" : "none" }} />}
                      {(l.damagePhotos || []).map((p, i) => <img key={i} src={p} alt="" title="Damage photo — click to enlarge" onClick={() => setBigPhoto(photoSet(l.photo, l.damagePhotos, (l.photo ? 1 : 0) + i, photoCaption(l.match?.number, l.match?.name, l.reason)))} style={{ width: 72, height: 54, objectFit: "cover", borderRadius: 4, flexShrink: 0, cursor: "zoom-in", border: "2px solid var(--k-red)" }} />)}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: statusColor(l.status) }}>{cap(l.status)}</span>
                        <div style={{ fontWeight: 700, fontSize: 18, marginTop: 2, fontFamily: FONT_READ }}>{l.typed ? `Typed: #${l.typed.number || "?"} · ${l.typed.name || "—"}` : `Read: #${l.detected?.number || "?"} · ${l.detected?.name || "—"}`}</div>
                        {l.match && (
                          <div style={{ fontSize: 15, color: "var(--k-ink-2)", marginTop: 2, fontFamily: FONT_READ }}>
                            Matched: {l.match.name || "—"} #{l.match.number}{l.match.size ? ` · ${shortSize(l.match.size)}` : ""}{l.match.team ? ` · ${l.match.team}` : ""}{binOf(l.match) !== null ? ` · Box ${binOf(l.match)}` : ""}
                          </div>
                        )}
                        {l.reason     && <div style={{ fontSize: 15, color: "var(--k-amber-ink)", marginTop: 3 }}>⚠ {l.reason}</div>}
                        {l.resolution && <div style={{ fontSize: 15, color: "var(--k-ink-2)", marginTop: 3 }}>Resolution: {l.resolution}</div>}
                      </div>
                      <div style={{ fontSize: 13, color: "var(--k-ink-3b)", whiteSpace: "nowrap", textAlign: "right", lineHeight: 1.5 }}>{l.timestamp}<br />{l.operator}</div>
                    </div>
                  </div>
                ))
              }
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
