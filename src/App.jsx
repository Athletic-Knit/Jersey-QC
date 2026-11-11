import { useState, useRef, useCallback, useEffect, useMemo, memo, Fragment } from "react";
import { parseCSV, parseExcel, normaliseRosterRows, buildBinMap, binFor, binEntries, binCount, binFieldOf, binOfRow, binContents, closeBin, dropFromClosed, BIN_BY, displayColumns, extraColumns, CORE_COLUMNS, orderNumberOf , teamKey, sortRoster, ROSTER_SORTS, rosterChoices } from "./lib/roster.js";
import { findMatches, differingFields, isDone } from "./lib/match.js";
import { exportRosterXLSX, exportLogCSV, exportDaySheetXLSX, localTimeStamp, localDateStamp } from "./lib/export.js";
import { saveSession, loadSession, clearSession, saveSettings, loadSettings, saveSignIn, loadSignIn, clearSignIn, rememberName, shrinkDataUrl, downscaleImage, frameForUpload, cropDataUrl, rotateDataUrl } from "./lib/persist.js";
import { buildDamageRows, exportDamageReportXLSX } from "./lib/damage.js";
import { createAwayWatch } from "./lib/attention.js";
import { playTone } from "./lib/audio.js";
import { readJersey, uprightRotation } from "./lib/vision.js";
import { sampleFrame, createMotionGate } from "./lib/motion.js";
import { createVigilance, reconcile, turnMatters, settleTurned, createInspection, inspectLabel } from "./lib/vigilance.js";
import { hub, stationId, snapshotOf, stationUse } from "./lib/hub.js";
import { pace } from "./lib/pace.js";
import { PRIOR as BOX_PRIOR, BOXES, MORE, predictBox, binCounts } from "./lib/boxmodel.js";
import { binLabels, jerseyLabel, flagLabel, binListLabels } from "./lib/labels.js";
const SECOND_LOOK = false;
import { TRIAL_METHODS, trialMethodLabel, SCREEN_KINDS, loadTrial, appendTrial, clearTrial, summariseTrial, trialVerdict, trialCSV } from "./lib/trial.js";
import { MODEL, EFFORT, THINKING, SEND_MAX_PX, OPERATORS, CHECKLIST, REASONS, JERSEY_TYPES, jerseyTypeOf, jerseyTypeLabel, reasonsFor, ROLES, STATIONS, stationOf, PIN_REQUIRED, DEFAULT_SETTINGS, severityOf } from "./config.js";

const CLAUDE_API_KEY = import.meta.env.VITE_CLAUDE_API_KEY;

const S_PASS    = "pass";
const S_FLAGGED = "flagged";
const S_MANUAL  = "manual";

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
const card     = { background: "#161b22", borderRadius: 10, border: "1px solid #21262d", marginBottom: 10, overflow: "hidden" };
const FONT_UI      = '"Atkinson Hyperlegible", system-ui, sans-serif';          // text the operator reads
const FONT_DISPLAY = '"Barlow Condensed", "Arial Narrow", system-ui, sans-serif'; // the big numerals: number, size, bin, counters
const btnPri   = { padding: "10px 20px", borderRadius: 8, border: "none", background: "#3b82f6", color: "#fff", fontWeight: 700, fontSize: 16, cursor: "pointer" };
const btnGhost = { padding: "8px 14px", borderRadius: 8, border: "1px solid #3f4b5c", background: "transparent", color: "#cbd5e1", fontWeight: 700, fontSize: 14, cursor: "pointer" };
const btnSm    = { padding: "7px 14px", borderRadius: 6, fontWeight: 700, fontSize: 14, cursor: "pointer" };
const codeSt   = { background: "#1e293b", padding: "2px 8px", borderRadius: 4, fontSize: 14 };
const thSt     = { padding: "10px 12px", textAlign: "left", fontSize: 14, fontWeight: 700, color: "#94a3b8" };
const tdSt     = { padding: "10px 12px", color: "#e2e8f0", fontSize: 18 };
const inputSt  = { width: "100%", boxSizing: "border-box", padding: "11px 14px", borderRadius: 8, border: "1px solid #3f4b5c", background: "#1e293b", color: "#e2e8f0", fontSize: 17 };
const labelSt  = { fontSize: 14, color: "#94a3b8", fontWeight: 700, display: "block", marginBottom: 6 };
const modalBg   = { position: "fixed", inset: 0, background: "#0d1117", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", overflowY: "auto" };
const modalCard = { background: "#161b22", borderRadius: 16, border: "1px solid #21262d", padding: 40, width: 560, maxWidth: "90vw" };
const errSt     = { fontSize: 15, color: "#f87171", marginBottom: 12, padding: "10px 14px", background: "rgba(239,68,68,0.08)", borderRadius: 6 };
const bigBtn    = { width: "100%", padding: "15px", borderRadius: 10, border: "none", background: "#3b82f6", color: "#fff", fontWeight: 700, fontSize: 19, cursor: "pointer" };

function statusColor(s) {
  if (s === S_PASS)    return "#22c55e";
  if (s === S_FLAGGED) return "#ef4444";
  if (s === S_MANUAL)  return "#94a3b8";
  if (s === "undo" || s === "missing" || s === "short") return "#f59e0b";
  return "#64748b";
}

function Pill({ color, children, onClick, active = false, title }) {
  return (
    <span onClick={onClick} title={title} style={{ background: active ? color : `${color}22`, color: active ? "#0d1117" : color, fontSize: 14, fontWeight: 700, padding: "4px 11px", borderRadius: 20, border: `1px solid ${color}55`, whiteSpace: "nowrap", cursor: onClick ? "pointer" : "default", userSelect: "none" }}>
      {children}
    </span>
  );
}

// ── On-screen keys ───────────────────────────────────────────────────────────
// The stations have a mouse and four programmed keys, no keyboard. Anything
// that must be typed (the PIN, a jersey entered by hand) gets these keys under
// the field. "digits" is a numeric pad; "full" adds the letters and a dash for
// names and sizes. Presses do not steal focus from the field.
const KEY_ROWS = {
  digits: [["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"], ["⌫", "0", "⏎"]],
  full:   [["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"], ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"], ["A", "S", "D", "F", "G", "H", "J", "K", "L", "-"], ["Z", "X", "C", "V", "B", "N", "M", "⌫", "⏎"]],
};
function ScreenKeys({ layout = "digits", onKey, onEnter, enterLabel = "OK" }) {
  const rows = KEY_ROWS[layout] || KEY_ROWS.digits;
  const wide = layout === "digits";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10, userSelect: "none" }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "flex", gap: 6, justifyContent: "center" }}>
          {r.map(k => (
            <button key={k} type="button" onMouseDown={e => e.preventDefault()} onClick={() => (k === "⏎" ? onEnter?.() : onKey(k))}
              style={{ flex: wide ? 1 : "0 0 auto", minWidth: wide ? 0 : 44, padding: wide ? "12px 0" : "10px 0", borderRadius: 8, border: "1px solid #3f4b5c", background: k === "⏎" ? "#3b82f6" : k === "⌫" ? "#334155" : "#1e293b", color: "#f1f5f9", fontSize: k === "⏎" ? 15 : 20, fontWeight: 700, cursor: "pointer" }}>
              {k === "⏎" ? enterLabel : k}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

function Kbd({ light, children }) {
  return (
    <kbd style={{ background: light ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.3)", padding: "3px 9px", borderRadius: 6, fontSize: 15, fontWeight: 700 }}>
      {children}
    </kbd>
  );
}

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

// ── Resume modal ──────────────────────────────────────────────────────────────
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
    <div style={{ position: "fixed", inset: 0, zIndex: 2500, background: "#f59e0b", color: "#1c1917", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none", fontFamily: FONT_UI, textAlign: "center", padding: 24 }}>
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
      background: r.scanned === "pass" ? "rgba(34,197,94,0.07)" : r.scanned === "flag" ? "rgba(239,68,68,0.07)" : r.scanned ? "rgba(245,158,11,0.07)" : "transparent",
      borderBottom: "1px solid #1e293b",
    }}>
      <td style={{ ...tdSt, textAlign: "center" }}>
        {r.scanned === "pass" ? "✅" : r.scanned === "flag" ? "🛑" : r.scanned === "manual" ? "✍" : r.scanned === "missing" ? "❓" : r.scanned === "short" ? "📦" : <span style={{ color: "#475569" }}>—</span>}
      </td>
      {cols.map(c => (
        <td key={c} style={{ ...tdSt, fontWeight: c === "size" || c === "number" ? 700 : 400, color: c === "size" ? "#fbbf24" : "#e2e8f0" }}>{r[c]}</td>
      ))}
      {hasBins && <td style={{ ...tdSt, color: "#60a5fa", fontWeight: 700 }}>{bin !== null ? `Bin ${bin}` : "—"}</td>}
      <td style={{ ...tdSt, padding: "2px 6px" }}>
        <select value={["missing", "short"].includes(r.scanned) ? "missing" : ""}
          onChange={e => onMark(r, e.target.value)}
          style={{ background: "#1e293b", color: "#cbd5e1", border: "1px solid #3f4b5c", borderRadius: 6, fontSize: 14, padding: "5px 8px" }}>
          <option value="">—</option>
          {(!r.scanned || ["missing", "short"].includes(r.scanned))
            ? <option value="missing">Missing</option>
            : <>
                {(r.scanned === "pass" || r.scanned === "manual") && <option value="flag">🚩 Flag / damage</option>}
                {(r.scanned !== "flag" || canSupervise) && <option value="unscan">Un-check</option>}
              </>}
        </select>
      </td>
    </tr>
  );
});

function ResumeModal({ session, onResume, onDiscard }) {
  const done = session.roster.filter(r => r.scanned && r.scanned !== false).length;
  return (
    <div style={{ position: "fixed", inset: 0, background: "#0d1117", zIndex: 2100, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#161b22", borderRadius: 16, border: "2px solid #3b82f6", padding: 40, width: 560, maxWidth: "90vw", textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>🔄</div>
        <div style={{ fontWeight: 900, fontSize: 28, marginBottom: 6 }}>Resume order {session.orderNumber || "—"}?</div>
        <div style={{ fontSize: 17, color: "#cbd5e1", marginBottom: 4 }}>
          {done} of {session.roster.length} jerseys done · {session.log.length} scans · started by {session.operatorName || "an unknown operator"}
        </div>
        <div style={{ fontSize: 15, color: "#94a3b8", marginBottom: 24 }}>Saved {new Date(session.savedAt).toLocaleString()}</div>
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
// Switch this page to a station: the address changes and the page reloads, so
// the saved order, the sign-in and the hub id all follow the station.
const goToStation = id => { const u = new URL(window.location.href); u.searchParams.set("station", id); window.location.href = u.toString(); };

// Sign-in is two steps: the role, then — for an inspector — which station.
// Each inspection station has its own PIN; packer and supervisor have a role
// PIN. The page's ?station= says where it is: station1..3 for inspectors,
// "packing" for the packer, "supervisor" for the supervisor's board.
const ROLE_CHOICES = ROLES.filter(r => r.id !== "admin");
const BLOCKED_ROLES = ["packer"];   // shown, but not signable: the packer side is not built yet
const roleOfStation = id => stationOf(id) ? "inspector" : id === "packing" ? "packer" : id === "supervisor" ? "supervisor" : "";
const pageFor = (role, station) => role === "inspector" ? station : role === "packer" ? "packing" : "supervisor";

function SignInModal({ onSignIn, initial, onCancel, title }) {   // onCancel + title: hand the station to another operator without losing the order
  const here = urlStation();
  const [role,    setRole]    = useState(roleOfStation(here) || initial?.role || "inspector");
  const [station, setStation] = useState(stationOf(here) ? here : STATIONS[0].id);
  const [pin,   setPin]   = useState("");
  const [name, setName] = useState(() => (initial?.name || "") || OPERATORS[0] || "");
  const [nameChoice, setNameChoice] = useState(() => (initial?.name && !OPERATORS.includes(initial.name) ? "other" : (initial?.name || OPERATORS[0] || "other")));   // "Other": someone sent to this station for the day   // a name from the list, or "other" with the field below
  const [pinFocus, setPinFocus] = useState(false);   // only the field's highlight follows focus; the keypad is always there
  const [error, setError] = useState(null);
  // Which stations are live right now, and from where: refreshed every 5 s.
  const [use, setUse] = useState({});
  useEffect(() => {
    let on = true;
    const load = () => hub.stations().then(a => { if (on) setUse(stationUse(a)); }).catch(() => {});
    load(); const t = setInterval(load, 5000);
    return () => { on = false; clearInterval(t); };
  }, []);
  const busyBy = id => { const u = use["st-" + id]; return u && u.live && !u.mine ? (u.operator || "someone") : ""; };
  const roleDef = ROLES.find(r => r.id === role);
  const stDef   = stationOf(station);
  const pinOwner = role === "inspector" ? stDef : roleDef;      // whose PIN opens this page
  const target   = pageFor(role, station);                      // where the page should be for this choice
  // A new sign-in moves the page to the chosen station or board (reload, so the
  // saved order, the sign-in and the hub id follow); a take-over keeps it.
  const pickRole    = r  => { setRole(r.id); const t = pageFor(r.id, station); if (r.id !== "inspector" && t !== here && !onCancel) goToStation(t); };
  const pickStation = id => { setStation(id); if (id !== here && !onCancel) goToStation(id); };

  const submit = () => {
    if (PIN_REQUIRED && pin !== pinOwner.pin) { setError("Wrong PIN for " + pinOwner.label + "."); return; }
    if (!name.trim()) { setError("Please enter your name."); return; }
    if (role === "inspector" && !onCancel && busyBy(station)) { setError(`${stDef.label} is in use by ${busyBy(station)} on another PC. Pick a free station, or sign out on that PC first.`); return; }
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
      <div style={{ ...modalCard, padding: "24px 32px", width: PIN_REQUIRED ? 940 : 560, maxWidth: "94vw", maxHeight: "96%", overflowY: "auto", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
          <div style={{ fontWeight: 900, fontSize: 26 }}>🏭 Jersey QC Scanner</div>
          <div style={{ fontSize: 16, color: "#94a3b8" }}>{title || "Sign in once per shift"}</div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px 32px", alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 340px", minWidth: 0 }}>
        <div style={{ marginBottom: 12 }}>
          <label style={labelSt}>Role</label>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${ROLE_CHOICES.length},1fr)`, gap: 6 }}>
            {ROLE_CHOICES.map(r => {
              const blocked = BLOCKED_ROLES.includes(r.id);   // under development: nobody signs in as it
              return (
              <button key={r.id} onClick={blocked ? undefined : () => pickRole(r)} disabled={!!onCancel && r.id !== role} aria-disabled={blocked || undefined} title={blocked ? "Under development" : undefined}
                style={{ ...btnGhost, padding: "12px 6px", fontSize: 16, borderColor: role === r.id ? "#3b82f6" : "#334155", color: role === r.id ? "#fff" : "#94a3b8", background: role === r.id ? "rgba(59,130,246,0.18)" : "transparent", opacity: blocked || (onCancel && r.id !== role) ? 0.4 : 1, cursor: blocked ? "not-allowed" : "pointer" }}>
                {r.label}{blocked && <div style={{ fontSize: 12, fontWeight: 400, marginTop: 2 }}>under development</div>}
              </button>
              );
            })}
          </div>
        </div>
        {role === "inspector" && (
          <div style={{ marginBottom: 12 }}>
            <label style={labelSt}>Which station?</label>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${STATIONS.length},1fr)`, gap: 6 }}>
              {STATIONS.map(s => { const by = busyBy(s.id); return (
                <button key={s.id} onClick={() => pickStation(s.id)} disabled={!!onCancel && s.id !== station} title={by ? `In use by ${by} on another PC` : ""}
                  style={{ ...btnGhost, padding: "12px 6px", fontSize: 16, borderColor: station === s.id ? (by ? "#ef4444" : "#60a5fa") : by ? "#7f1d1d" : "#334155", color: station === s.id ? "#fff" : by ? "#f87171" : "#94a3b8", background: station === s.id ? (by ? "rgba(239,68,68,0.14)" : "rgba(96,165,250,0.16)") : "transparent", opacity: onCancel && s.id !== station ? 0.4 : 1 }}>
                  {s.label}{by && <div style={{ fontSize: 13, fontWeight: 400, color: "#f87171", marginTop: 2 }}>in use · {by}</div>}
                </button>
              ); })}
            </div>
            <div style={{ fontSize: 14, color: "#7c8ba1", marginTop: 6 }}>{busyBy(station) ? <span style={{ color: "#f87171" }}>{stDef?.label} is in use by {busyBy(station)} on another PC right now.</span> : <>Each station has its own PIN. The supervisor's board shows this page as {stDef?.label}.</>}</div>
          </div>
        )}
        <div style={{ marginBottom: 14 }}>
          <label style={labelSt}>Your name</label>
          <select value={nameChoice} onChange={e => { const v = e.target.value; setNameChoice(v); setName(v === "other" ? "Other" : v); }} style={{ ...inputSt, cursor: "pointer" }}>
            {OPERATORS.map(n => <option key={n} value={n}>{n}</option>)}
            <option value="other">Other</option>
          </select>
        </div>
        {error && <div style={errSt}>{error}</div>}
        <button onClick={submit} style={bigBtn}>{onCancel ? "Take over →" : "Sign in →"}</button>
        {onCancel && <button onClick={onCancel} style={{ ...btnGhost, width: "100%", marginTop: 8 }}>← Back, keep the current operator</button>}
        </div>
        {PIN_REQUIRED && (
          <div style={{ flex: "1 1 300px", minWidth: 0 }}>
            <label style={labelSt}>PIN</label>
            <input type="password" inputMode="numeric" value={pin} onChange={e => setPin(e.target.value)} placeholder="••••" autoFocus onKeyDown={onEnter} onFocus={() => setPinFocus(true)} onBlur={() => setPinFocus(false)} style={{ ...inputSt, borderColor: pinFocus ? "#60a5fa" : inputSt.borderColor }} />
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
          style={{ ...btnGhost, padding: "9px 14px", fontSize: 16, borderColor: value === t.id ? "#60a5fa" : "#3f4b5c", background: value === t.id ? "rgba(96,165,250,0.15)" : "transparent", color: value === t.id ? "#93c5fd" : "#cbd5e1", fontWeight: value === t.id ? 700 : 400 }}>
          {t.label} <span style={{ fontSize: 14, color: "#94a3b8", fontWeight: 400 }}>· {t.hint}</span>
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
          style={{ ...btnGhost, padding: "9px 14px", fontSize: 16, borderColor: value === t.id ? "#60a5fa" : "#3f4b5c", background: value === t.id ? "rgba(96,165,250,0.15)" : "transparent", color: value === t.id ? "#93c5fd" : "#cbd5e1", fontWeight: value === t.id ? 700 : 400 }}>
          {t.label} <span style={{ fontSize: 14, color: "#94a3b8", fontWeight: 400 }}>· {t.construction}</span>
        </button>
      ))}
    </div>
  );
}

function OrderSetupModal({ operatorName, role, xlsxReady, onStart, onSignOut, stationLabel = id => String(id || "").replace(/^st-/, "") }) {
  const [order,   setOrder]   = useState("");
  const [notes,   setNotes]   = useState("");
  const [jerseyType, setJerseyType] = useState("");
  const [binBy, setBinBy] = useState("team");       // bins by team, by size, or none — the supervisor's roster brings its own
  const [file,    setFile]    = useState(null);
  const [error,   setError]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [hubRosters, setHubRosters] = useState([]);
  const [picked,  setPicked]  = useState(null);     // a roster the supervisor sent
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
        } catch { /* the Start button reports a bad file */ }
      })();
    }
    e.target.value = "";
  };

  const pickRoster = async (summary) => {
    try {
      const full = await hub.roster(summary.id);
      setPicked(full); setFile(null); setError(null);
      setOrder(full.orderNumber || ""); setNotes(full.notes || ""); setJerseyType(full.jerseyType || ""); setBinBy(full.binBy || "team");
    } catch (e) { setError("Could not fetch that roster: " + e.message); }
  };

  const canSupervise = role === "supervisor" || role === "admin";
  const handleStart = async () => {
    if (!order.trim() && !picked) { setError("Enter the order number, or use a roster file that has it."); return; }
    if (!file && !picked) { setError(canSupervise ? "Upload a roster file, or pick one the supervisor sent." : "Pick the order the supervisor sent, or load a roster file."); return; }
    setLoading(true);
    try {
      if (picked) {
        // Take the order on the hub first: if another station got there first, say who, and stop.
        try { await hub.takeRoster(picked.id, { station: stationId(), operator: operatorName }); }
        catch (e) {
          if (e.status === 409) { const t = e.body?.takenBy || {}; setError(`${stationLabel(t.station)} (${t.operator || "someone"}) is already working on order ${picked.orderNumber || ""}. One station works an order — ask the supervisor to release it from the board if that is wrong.`); setPicked(null); setLoading(false); loadRef.current(); return; }
          /* no hub answer: start anyway, the station still works from the roster it has */
        }
        onStart({ roster: normaliseRosterRows(picked.rows), orderNumber: order.trim(), notes: notes.trim(), jerseyType, binBy, rosterFile: `${picked.fileName || "roster"} (from ${picked.by || "supervisor"})`, hubRosterId: picked.id }); return;
      }
      const isExcel = /\.(xlsx|xls)$/i.test(file.name);
      const parsed  = isExcel ? await parseExcel(file) : parseCSV(await file.text());
      if (parsed.length === 0) { setError("No valid rows found. The file needs a header row with name and/or number columns."); setLoading(false); return; }
      onStart({ roster: parsed, orderNumber: order.trim() || orderNumberOf(parsed) || file.name.replace(/\.[^.]+$/, ""), notes: notes.trim(), jerseyType, binBy, rosterFile: file.name });
    } catch (err) {
      setError("Failed to parse roster: " + err.message);
      setLoading(false);
    }
  };
  const onEnter = e => { if (e.key === "Enter") handleStart(); };

  return (
    <div style={modalBg}>
      <div style={modalCard}>
        <div style={{ fontSize: 40, marginBottom: 6, textAlign: "center" }}>📋</div>
        <div style={{ fontWeight: 900, fontSize: 28, textAlign: "center", marginBottom: 4 }}>Set up the order</div>
        <div style={{ fontSize: 17, color: "#94a3b8", textAlign: "center", marginBottom: 24, display: "flex", gap: 8, justifyContent: "center", alignItems: "center", flexWrap: "wrap" }}>
          <span>{operatorName} · {cap(role || "")}</span>
          <button onClick={onSignOut} style={{ ...btnGhost, padding: "5px 12px", fontSize: 14 }}>Sign out</button>
        </div>
        {hubRosters.length === 0 && (
          <div style={{ marginBottom: 14, padding: "10px 12px", borderRadius: 8, border: "1px dashed #3f4b5c", color: "#cbd5e1", fontSize: 16, textAlign: "center", lineHeight: 1.4 }}>
            <span style={{ color: "#60a5fa" }}>●</span> Waiting for the supervisor to send an order — it will appear here by itself. Or load a roster file below.
          </div>
        )}
        {hubRosters.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <label style={labelSt}>From the supervisor</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 150, overflowY: "auto" }}>
              {hubRosters.map(r => (
                <button key={r.id} onClick={() => !takenElsewhere(r) && pickRoster(r)} disabled={takenElsewhere(r)}
                  title={takenElsewhere(r) ? `${stationLabel(r.takenBy.station)} is working on this order — one station per order` : undefined}
                  style={{ ...btnGhost, textAlign: "left", padding: "8px 12px", borderColor: picked?.id === r.id ? "#22c55e" : "#334155", color: picked?.id === r.id ? "#fff" : "#94a3b8", background: picked?.id === r.id ? "rgba(34,197,94,0.12)" : "transparent", opacity: takenElsewhere(r) ? 0.5 : 1, cursor: takenElsewhere(r) ? "not-allowed" : "pointer" }}>
                  <div style={{ fontSize: 17, fontWeight: 700 }}>Order {r.orderNumber || "—"} <span style={{ fontWeight: 400, color: "#94a3b8" }}>· {r.rowCount} jerseys · {r.fileName}{r.jerseyType ? ` · ${jerseyTypeLabel(r.jerseyType)}` : ""}{r.binBy && r.binBy !== "team" ? ` · ${BIN_BY.find(b => b.id === r.binBy)?.label.toLowerCase() || r.binBy}` : ""}</span>{r.forStation && !r.takenBy && <span style={{ fontWeight: 700, color: "#60a5fa", marginLeft: 8 }}>for this station</span>}</div>
                  <div style={{ fontSize: 14, color: "#94a3b8" }}>{r.by ? `sent by ${r.by} · ` : ""}{new Date(r.createdAt).toLocaleString()}</div>
                  {r.takenBy && <div style={{ fontSize: 14, fontWeight: 700, color: takenElsewhere(r) ? "#f59e0b" : "#4ade80" }}>{takenElsewhere(r) ? `⛔ In progress on ${stationLabel(r.takenBy.station)} · ${r.takenBy.operator || "—"} · since ${new Date(r.takenBy.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "↻ Started on this station — pick it to continue"}</div>}
                </button>
              ))}
            </div>
          </div>
        )}
        <div style={{ marginBottom: 12 }}>
          <label style={labelSt}>Order number</label>
          <input value={order} onChange={e => setOrder(e.target.value)} placeholder="From the roster file, or type it" autoFocus onKeyDown={onEnter} style={inputSt} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={labelSt}>Order notes <span style={{ color: "#7c8ba1", fontWeight: 400 }}>— remarks from the order paper, shown on every jersey</span></label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. sponsor logo left sleeve · captain C on #19" rows={2} style={{ ...inputSt, resize: "vertical", fontSize: 16 }} />
          <label style={{ ...labelSt, marginTop: 10 }}>Jersey type <span style={{ color: "#7c8ba1", fontWeight: 400 }}>— sets the flag reasons and the reports; leave it unset to offer every reason</span></label>
          <JerseyTypePicker value={jerseyType} onChange={setJerseyType} />
          <label style={{ ...labelSt, marginTop: 12 }}>Bins — how the order is sorted{picked?.binBy ? <span style={{ color: "#60a5fa", fontWeight: 400 }}> · set by the supervisor</span> : null}</label>
          <BinByPicker value={binBy} onChange={setBinBy} />
        </div>
        <div style={{ marginBottom: 18 }}>
          <label style={labelSt}>{hubRosters.length ? "Or a roster file" : "Roster file"}</label>
          <div onClick={() => fileRef.current.click()}
            style={{ padding: "10px 12px", borderRadius: 8, border: `1px solid ${file ? "#22c55e" : "#334155"}`, background: "#1e293b", color: file ? "#22c55e" : "#94a3b8", fontSize: 17, cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 20 }}>{file ? "✓" : "📂"}</span>
            <span>{file ? file.name : picked ? `Using the supervisor's roster (${picked.rows.length} jerseys)` : `Choose CSV${xlsxReady ? " or Excel" : ""} file…`}</span>
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
// `big`: in the middle of the screen, with whatever is passed as children
// laid over it — the damage-photo countdown, so the operator sees what the
// camera sees while the numbers run.
function LivePreview({ stream, rotation, big = false, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const v = ref.current; if (!v || !stream) return;
    v.srcObject = stream; v.play().catch(() => {});
    return () => { v.srcObject = null; };
  }, [stream]);
  if (!stream) return null;
  const box = big
    ? { position: "relative", width: "clamp(300px, 52vw, 640px)", maxWidth: "calc(100% - 32px)", borderRadius: 14, overflow: "hidden", border: "3px solid rgba(255,255,255,0.5)", background: "#000", boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }
    : { position: "absolute", bottom: 12, right: 12, width: "clamp(220px, 26vw, 380px)", borderRadius: 10, overflow: "hidden", border: "2px solid rgba(255,255,255,0.35)", background: "#000", boxShadow: "0 8px 24px rgba(0,0,0,0.5)" };
  return (
    <div style={box}>
      <div style={{ aspectRatio: "4 / 3", overflow: "hidden" }}>
        <video ref={ref} autoPlay muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover", transform: `rotate(${rotation || 0}deg)`, display: "block" }} />
      </div>
      {big
        ? <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>{children}</div>
        : <div style={{ position: "absolute", top: 8, left: 10, fontSize: 14, fontWeight: 700, color: "#fff", background: "rgba(0,0,0,0.6)", padding: "4px 10px", borderRadius: 10 }}>● Live — line up the next jersey</div>}
    </div>
  );
}

// The 3-2-1 of the damage photo; 0 is the shot itself.
function Countdown({ n }) {
  return (
    <div style={{ fontFamily: FONT_DISPLAY, fontSize: n ? "clamp(140px, 24vw, 280px)" : "clamp(90px, 14vw, 170px)", fontWeight: 900, color: "#fff", lineHeight: 1, textAlign: "center", textShadow: "0 4px 24px rgba(0,0,0,0.85)" }}>
      {n || "📸"}
    </div>
  );
}

// ── A defect the reason list does not cover: the operator types it ───────────
function ReasonTextForm({ match, onSubmit, onBack }) {
  const [text, setText] = useState("");
  const onKey = e => {
    if (e.key === "Enter")  { e.preventDefault(); if (text.trim()) onSubmit(text); }
    if (e.key === "Escape") { e.preventDefault(); onBack(); }
  };
  return (
    <div style={{ width: "100%", maxWidth: 560, padding: "0 24px", boxSizing: "border-box" }}>
      <div style={{ fontSize: 56, textAlign: "center", lineHeight: 1 }}>✎</div>
      <div style={{ fontSize: "clamp(26px, 4vw, 40px)", fontWeight: 900, color: "#a78bfa", textAlign: "center", marginBottom: 6 }}>What's wrong with it?</div>
      {match && <div style={{ fontSize: 18, color: "#c4b5fd", textAlign: "center", marginBottom: 10 }}>#{match.number}{match.name ? ` · ${match.name}` : ""}{match.size ? ` · ${match.size}` : ""}</div>}
      <input value={text} onChange={e => setText(e.target.value)} onKeyDown={onKey} autoFocus placeholder="e.g. hole under the left arm" maxLength={120} style={{ ...inputSt, fontSize: 22, padding: "12px 14px", marginBottom: 14 }} />
      <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
        <button disabled={!text.trim()} onClick={() => onSubmit(text)} style={{ ...bigBtn, width: "auto", padding: "14px 30px", background: "#a78bfa", color: "#0d1117", opacity: text.trim() ? 1 : 0.5 }}>✓ Send to supervisor <Kbd>Enter</Kbd></button>
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
      <div style={{ fontSize: "clamp(26px, 4vw, 40px)", fontWeight: 900, color: "#f59e0b", textAlign: "center", marginBottom: 18 }}>Enter the jersey by hand</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10, marginBottom: 10 }}>
        <div><label style={labelSt}>Number</label><input value={number} onChange={e => setNumber(e.target.value)} onKeyDown={onKey} onFocus={() => setField("number")} autoFocus inputMode="numeric" placeholder="##" style={{ ...fieldSt, borderColor: field === "number" ? "#f59e0b" : fieldSt.borderColor }} /></div>
        <div><label style={labelSt}>Name</label><input value={name} onChange={e => setName(e.target.value)} onKeyDown={onKey} onFocus={() => setField("name")} placeholder="as printed" style={{ ...fieldSt, borderColor: field === "name" ? "#f59e0b" : fieldSt.borderColor }} /></div>
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
        <button onClick={submit} style={{ ...bigBtn, width: "auto", padding: "14px 30px", background: "#f59e0b", color: "#0d1117" }}>✓ Save <Kbd>Enter</Kbd></button>
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
function PhotoThumbs({ photo, damagePhotos = [], w = 80, h = 60, onOpen }) {
  const pics = [...(photo ? [{ src: photo, damage: false }] : []), ...(damagePhotos || []).filter(Boolean).map(src => ({ src, damage: true }))];
  if (!pics.length) return null;
  return (
    <div style={{ display: "flex", gap: 4, flexShrink: 0, flexWrap: "wrap" }}>
      {pics.map((p, i) => <img key={i} src={p.src} alt="" onClick={() => onOpen(p.src)} title={p.damage ? "Damage photo — click to enlarge" : "Click to enlarge"} style={{ width: w, height: h, objectFit: "cover", borderRadius: 4, cursor: "zoom-in", border: p.damage ? "2px solid #ef4444" : "1px solid rgba(255,255,255,0.25)" }} />)}
    </div>
  );
}

// A flag photo, large, until a click or Esc.
function PhotoLightbox({ src, onClose }) {
  useEffect(() => { const h = e => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }; window.addEventListener("keydown", h, true); return () => window.removeEventListener("keydown", h, true); }, [onClose]);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 3000, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "zoom-out" }}>
      <img src={src} alt="Flagged jersey" style={{ maxWidth: "92vw", maxHeight: "92vh", borderRadius: 8, boxShadow: "0 12px 48px rgba(0,0,0,0.8)" }} />
    </div>
  );
}

// The same record and the same events: one run of an order on a station.
// Events from before runs existed carry none and match any run.
const sameRun = (a, b) => !a || !b || a === b;
function OrderView({ station, order, run = 0, stationLabel, onClose, onDownload, onPhoto = () => {}, date = "" }) {
  const [data, setData] = useState(null);     // { rec, events }
  const [tab,  setTab]  = useState("roster");
  const [err,  setErr]  = useState(null);
  useEffect(() => {
    let on = true;
    const load = () => hub.ledger(date).then(l => {
      if (!on) return;
      const runs = (l.orders || []).filter(x => x.station === station && x.order === order);
      const rec = runs.find(x => sameRun(x.run, run)) || runs.sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0))[0];
      const events = (l.events || []).filter(e => e.station === station && e.order === order && sameRun(e.run, rec?.run)).sort((a, b) => String(b.t).localeCompare(String(a.t)));
      setData({ rec, events });
    }).catch(() => on && setErr("Could not fetch this order from the hub."));
    load();
    const t = setInterval(load, 5000);   // a running order keeps updating
    return () => { on = false; clearInterval(t); };
  }, [station, order, run, date]);
  useEffect(() => { const h = e => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]);

  const rec = data?.rec, events = data?.events || [], rows = rec?.rows || [];
  const c = rec?.counts || {}; const total = c.total ?? rows.length; const done = total - (c.remaining ?? 0);
  const latestByRow = new Map(); [...events].reverse().forEach(e => { if (e.rowId !== undefined && e.rowId !== null) latestByRow.set(e.rowId, e); });
  const label = s => ({ pass: "PASS", flag: "FLAGGED", manual: "BY HAND", missing: "MISSING", short: "SHORT-SHIPPED" }[s] || "not scanned");
  const colour = s => s === "pass" ? "#22c55e" : s === "flag" ? "#ef4444" : s === "manual" ? "#f59e0b" : s === "missing" || s === "short" ? "#f59e0b" : "#475569";
  const evColour = s => s === "pass" ? "#22c55e" : s === "flagged" ? "#ef4444" : s === "manual" ? "#f59e0b" : s === "undo" ? "#f59e0b" : "#94a3b8";
  const hm = t => t ? new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
  const flaggedRows = rows.filter(r => r.scanned === "flag"), byHandRows = rows.filter(r => r.scanned === "manual");
  const offRoster = events.filter(e => e.status === "flagged" && e.offRoster);
  const th = { textAlign: "left", fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, padding: "6px 8px", borderBottom: "1px solid #21262d", position: "sticky", top: 0, background: "#0d1117" };
  const td = { padding: "6px 8px", borderBottom: "1px solid #161b22", fontSize: 13, verticalAlign: "top" };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1900, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: "min(1100px, 100%)", height: "min(820px, 100%)", background: "#0d1117", border: "1px solid #334155", borderRadius: 12, display: "flex", flexDirection: "column", overflow: "hidden", color: "#e2e8f0" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #21262d", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 900, fontSize: 18 }}>Order {order} <span style={{ fontWeight: 400, color: "#64748b", fontSize: 14 }}>· {stationLabel(station)} · {rec?.operator || "—"}{rec?.jerseyType ? <span style={{ color: "#93c5fd" }}> · {jerseyTypeLabel(rec.jerseyType)}</span> : null}</span></div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
              {rec ? <>{done} / {total} done · {c.pass ?? 0} pass · <span style={{ color: c.flag ? "#f87171" : undefined }}>{c.flag ?? 0} with supervisor</span> · <span style={{ color: c.manual ? "#fcd34d" : undefined }}>{c.manual ?? 0} by hand</span>{offRoster.length ? <> · <span style={{ color: "#f87171" }}>{offRoster.length} not on roster</span></> : null} · started {hm(rec.firstSeen)}{total > 0 && c.remaining === 0 ? <> · <span style={{ color: "#22c55e", fontWeight: 700 }}>finished {hm(rec.lastSeen)}</span></> : <> · in progress</>}{rec.notes ? <> · notes: <span style={{ color: "#fcd34d" }}>{rec.notes}</span></> : null}</> : err || "Loading…"}
            </div>
          </div>
          <button onClick={() => onDownload({ station, order, operator: rec?.operator })} style={{ ...btnGhost, padding: "6px 12px", borderColor: "#22c55e", color: "#4ade80" }}>⬇ Order sheet (Excel)</button>
          {events.some(e => e.status === "flagged") && <button onClick={() => exportDamageReportXLSX(buildDamageRows(events, { stationLabel, typeLabel: jerseyTypeLabel }), { name: order, title: `Damage report — order ${order}` }).catch(e => setErr(e.message))} title="Every flagged jersey of this order with its photo" style={{ ...btnGhost, padding: "6px 12px", borderColor: "#ef4444", color: "#f87171" }}>⬇ Damage report</button>}
          <button onClick={onClose} style={{ ...btnGhost, padding: "6px 12px" }}>✕ Close <Kbd light>Esc</Kbd></button>
        </div>
        <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #21262d", flexShrink: 0 }}>
          {[["roster", `Roster (${rows.length})`], ["problems", `Problems (${flaggedRows.length + byHandRows.length + offRoster.length})`], ["log", `Log (${events.length})`]].map(([id, t]) => (
            <button key={id} onClick={() => setTab(id)} style={{ background: "transparent", border: 0, borderBottom: `2px solid ${tab === id ? "#3b82f6" : "transparent"}`, color: tab === id ? "#60a5fa" : "#94a3b8", padding: "10px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{t}</button>
          ))}
        </div>
        <div style={{ flex: 1, overflow: "auto" }}>
          {rec && !rows.length && <div style={{ padding: 24, color: "#fcd34d" }}>The hub has no jersey list for this order — the station reported it before today's update. The station's Export has the sheet; reload the station page so future orders come through.</div>}
          {!rec && !err && <div style={{ padding: 24, color: "#64748b" }}>Loading…</div>}
          {!rec && err && <div style={{ padding: 24, color: "#f87171" }}>{err}</div>}
          {rec && rows.length > 0 && (tab === "roster" || tab === "problems") && (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th style={th}>Status</th><th style={th}>Name</th><th style={th}>Number</th><th style={th}>Team</th><th style={th}>Size</th><th style={th}>Bin</th><th style={th}>What happened</th><th style={th}>Inspector · time</th>{tab === "problems" && <th style={th}>Photo</th>}</tr></thead>
              <tbody>
                {(tab === "roster" ? rows : rows.filter(r => r.scanned === "flag" || r.scanned === "manual")).map((r, i) => {
                  const e = latestByRow.get(r._id);
                  return (
                    <tr key={r._id ?? i} style={{ background: r.scanned === "flag" ? "rgba(239,68,68,0.07)" : r.scanned === "manual" ? "rgba(245,158,11,0.07)" : "transparent" }}>
                      <td style={{ ...td, color: colour(r.scanned), fontWeight: 700, whiteSpace: "nowrap" }}>{label(r.scanned)}</td>
                      <td style={td}>{r.name || "—"}</td><td style={{ ...td, fontWeight: 700 }}>{r.number}</td><td style={td}>{r.team || ""}</td><td style={{ ...td, color: "#fcd34d" }}>{r.size || ""}</td>
                      <td style={{ ...td, color: "#60a5fa" }}>{rec.bins && binOfRow(rec.bins, rec.closedBins, r) !== null ? `Bin ${binOfRow(rec.bins, rec.closedBins, r)}` : ""}</td>
                      <td style={{ ...td, color: "#cbd5e1" }}>{e?.status === "flagged" && <><RouteTag item={e} /> </>}{e?.reason || ""}{e?.resolution ? <div style={{ color: "#94a3b8", fontSize: 12 }}>→ {e.resolution}</div> : null}</td>
                      <td style={{ ...td, color: "#64748b", fontSize: 12, whiteSpace: "nowrap" }}>{e ? `${e.operator || ""} · ${String(e.t).slice(11)}` : ""}</td>
                      {tab === "problems" && <td style={td}><PhotoThumbs photo={e?.photo} damagePhotos={e?.damagePhotos} onOpen={onPhoto} /></td>}
                    </tr>
                  );
                })}
                {tab === "problems" && offRoster.map((e, i) => (
                  <tr key={"off" + i} style={{ background: "rgba(239,68,68,0.07)" }}>
                    <td style={{ ...td, color: "#ef4444", fontWeight: 700, whiteSpace: "nowrap" }}>NOT ON ROSTER</td>
                    <td style={td}>{e.name || "—"}</td><td style={{ ...td, fontWeight: 700 }}>{e.number}</td><td style={td}>{e.team || ""}</td><td style={{ ...td, color: "#fcd34d" }}>{e.size || ""}</td><td style={td}></td>
                    <td style={{ ...td, color: "#cbd5e1" }}><RouteTag item={e} /> {e.reason}{e.resolution ? <div style={{ color: "#94a3b8", fontSize: 12 }}>→ {e.resolution}</div> : null}</td>
                    <td style={{ ...td, color: "#64748b", fontSize: 12, whiteSpace: "nowrap" }}>{e.operator || ""} · {String(e.t).slice(11)}</td>
                    <td style={td}><PhotoThumbs photo={e.photo} damagePhotos={e.damagePhotos} onOpen={onPhoto} /></td>
                  </tr>
                ))}
                {tab === "problems" && flaggedRows.length + byHandRows.length + offRoster.length === 0 && <tr><td colSpan={9} style={{ ...td, color: "#22c55e", padding: 18 }}>No problems on this order — nothing went to the supervisor and nothing was entered by hand.</td></tr>}
              </tbody>
            </table>
          )}
          {rec && tab === "log" && (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th style={th}>Time</th><th style={th}>What</th><th style={th}>Jersey</th><th style={th}>Reason / note</th><th style={th}>Resolution</th><th style={th}>Inspector</th></tr></thead>
              <tbody>
                {events.map((e, i) => (
                  <tr key={e.id ?? i}>
                    <td style={{ ...td, color: "#64748b", whiteSpace: "nowrap" }}>{String(e.t).slice(11)}</td>
                    <td style={{ ...td, color: evColour(e.status), fontWeight: 700, textTransform: "uppercase", fontSize: 11 }}>{e.status === "flagged" && e.offRoster ? "not on roster" : e.status === "undo" ? "un-checked" : e.status}</td>
                    <td style={td}>#{e.number}{e.name ? ` · ${e.name}` : ""}{e.size ? ` · ${e.size}` : ""}</td>
                    <td style={{ ...td, color: "#cbd5e1" }}>{e.reason}</td><td style={{ ...td, color: "#94a3b8" }}>{e.resolution}</td><td style={{ ...td, color: "#94a3b8" }}>{e.operator}</td>
                  </tr>
                ))}
                {events.length === 0 && <tr><td colSpan={6} style={{ ...td, color: "#64748b", padding: 18 }}>No scans recorded for this order on the hub.</td></tr>}
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
const attnColour = s => (s === "manual" || s === "missing" || s === "short") ? "#f59e0b" : "#ef4444";
// How much an item weighs: a flag by where it goes (REMAKE over DECORATION and
// STITCHER over CLEANING over DECIDE); by-hand, missing and short are light.
// Open items come before resolved ones, then the heavier, then the newer.
const attnSeverity = a => a.status === "flagged" ? severityOf(a.reason) : { tag: a.status === "manual" ? "SIGN OFF" : a.status === "missing" ? "MISSING" : "SHORT", weight: 1, colour: "#f59e0b" };
const bySeverity = (a, b) => ((a.resolution ? 1 : 0) - (b.resolution ? 1 : 0)) || (attnSeverity(b).weight - attnSeverity(a).weight) || String(b.time || b.t || "").localeCompare(String(a.time || a.t || ""));
function RouteTag({ item, size = 10 }) {
  const s = attnSeverity(item);
  const hot = s.weight >= 4;
  return <span title={s.route || ""} style={{ fontSize: size, fontWeight: 800, letterSpacing: 0.5, padding: "1px 6px", borderRadius: 4, background: hot ? s.colour : `${s.colour}22`, color: hot ? "#fff" : s.colour, border: `1px solid ${s.colour}66`, whiteSpace: "nowrap", flexShrink: 0, verticalAlign: "middle" }}>{s.tag}</span>;
}
// A station that has not reported for this long steps back off the cards.
const GONE_MS = 2 * 3600 * 1000;
// Someone is "at the board" for this long after the last mouse or key.
function SupervisorPanel({ operatorName, onSignOut }) {
  const [data,    setData]    = useState(() => ({ stations: [], now: Date.now() }));
  const [rosters, setRosters] = useState([]);
  const [orders,  setOrders]  = useState([]);     // every order any station worked on the chosen day (from the hub's ledger)
  const [openOrder, setOpenOrder] = useState(null);   // { station, order } shown in the order view
  // Looking back: "" is today; a date is a past day the hub still keeps (90
  // days; photos on the newest 14). The orders list, the order view, the day
  // sheet and the damage report all follow it. The station cards are always now.
  const [day,  setDay]  = useState("");
  const [days, setDays] = useState([]);
  useEffect(() => {
    const load = () => hub.ledger(day).then(l => { setOrders(l.orders || []); setDays(l.days || []); }).catch(() => {});
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [day]);
  // The same QC Results workbook the station exports, built from what the hub holds.
  const downloadOrderSheet = (o) => hub.ledger(day).then(l => {
    const rec = (l.orders || []).find(x => x.station === o.station && x.order === o.order && sameRun(x.run, o.run)) || o;
    const rows = rec.rows || [];
    if (!rows.length) { setMsg(`The hub has no jersey list for order ${o.order} on ${stationLabel(o.station)} — that station last reported before today's update, or the order was done before it. Press Export on the station for its sheet; reload the station page so future orders come through.`); return; }
    const log = (l.events || []).filter(e => e.station === rec.station && e.order === rec.order && sameRun(e.run, rec.run)).map(e => ({ match: { _id: e.rowId }, reason: e.reason, resolution: e.resolution, operator: e.operator, timestamp: e.t }));
    exportRosterXLSX(rows, log, { orderNumber: rec.order, operatorName: rec.operator, notes: rec.notes || "", jerseyType: jerseyTypeLabel(rec.jerseyType), idleSpells: rec.idle?.spells || [], awaySpells: rec.away?.spells || [], bins: rec.binSummary || [] }, displayColumns(rows), row => binOfRow(rec.bins, rec.closedBins, row));
  }).catch(() => setMsg("Could not fetch that order from the hub."));
  const [order,   setOrder]   = useState("");
  const [notes,   setNotes]   = useState("");
  const [jerseyType, setJerseyType] = useState("");
  const [binBy,   setBinBy]   = useState("team");   // how the station sorts the order: a bin per team, per size, or none
  const [file,    setFile]    = useState(null);
  const [target,  setTarget]  = useState("");     // station id to send the roster to; "" = any station may take it
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

  const send = async () => {
    if (!order.trim()) { setMsg("Type the order number first — stations list rosters by it."); return; }
    if (!file) { setMsg("Choose a roster file first."); return; }
    try {
      const isExcel = /\.(xlsx|xls)$/i.test(file.name);
      const rows = isExcel ? await parseExcel(file) : parseCSV(await file.text());
      if (!rows.length) { setMsg("No valid rows in that file."); return; }
      await hub.sendRoster({ orderNumber: order.trim(), notes: notes.trim(), jerseyType, binBy, fileName: file.name, rows, by: operatorName, forStation: target });
      const to = target ? `${stationLabel(target)} only` : "every station";
      setMsg(`Sent ${file.name} — ${rows.length} jerseys for order ${order.trim()} to ${to}. It shows on the order screen there.`);
      setFile(null); setOrder(""); setNotes(""); setJerseyType(""); setBinBy("team"); refresh();
    } catch (e) { setMsg("Could not send: " + e.message); }
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
  const liveCount  = active.filter(s => age(s) <= 30).length;
  const fmtMin = m => m == null ? "—" : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
  const byName = (a, b) => stationLabel(a.id).localeCompare(stationLabel(b.id), undefined, { numeric: true });

  if (wall) {
    // Sized by container-query units, not vh: the page is zoomed on big
    // monitors, and cqh follows the box, not the screen.
    const rows = Math.max(active.length, 1), rowH = Math.min(18, 82 / rows);
    const f = k => `${(rowH * k).toFixed(2)}cqh`;
    return (
      <div onClick={() => setWall(false)} style={{ position: "fixed", inset: 0, zIndex: 1950, background: "#000", color: "#fff", fontFamily: FONT_UI, display: "flex", flexDirection: "column", padding: "2cqh 2cqw", boxSizing: "border-box", containerType: "size", cursor: "pointer", userSelect: "none" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "1.5cqh", flexShrink: 0 }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: "7cqh", fontWeight: 900, lineHeight: 1, color: openCount > 0 ? "#f87171" : "#4ade80" }}>{openCount > 0 ? `${openCount} NEED YOU` : "ALL CLEAR"}</div>
          <div style={{ fontSize: "3cqh", color: "#94a3b8" }}>{todayTotal} {todayTotal === 1 ? "jersey" : "jerseys"} today · {liveCount} of {active.length} live · {new Date(clock).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
        </div>
        {hubDown && <div style={{ background: "#7f1d1d", fontSize: "3cqh", fontWeight: 700, padding: "1cqh 2cqw", borderRadius: "1cqh", marginBottom: "1.5cqh" }}>⚠ The hub stopped answering at {new Date(hubDown).toLocaleTimeString()} — nothing here is live.</div>}
        <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateRows: `repeat(${rows}, 1fr)`, gap: "1.2cqh" }}>
          {active.slice().sort(byName).map(s => {
            const open = openOn(s), stale = age(s) > 30, c = s.counts || {};
            const total = c.total ?? 0, done = total - (c.remaining ?? 0);
            const col = open ? "#ef4444" : stale ? "#475569" : (c.manual > 0 || c.missing > 0 || c.short > 0) ? "#f59e0b" : "#22c55e";
            const top = (s.attention || []).filter(a => !a.resolution).sort(bySeverity)[0];
            const line = open
              ? (top ? <><RouteTag item={top} size={f(0.2)} /> {top.jersey} — {top.reason}{open > 1 ? ` · +${open - 1} more` : ""}</> : `${open} still open from earlier orders`)
              : stale ? `not reporting · last seen ${fmtMin(Math.round(age(s) / 60))} ago`
              : total > 0 ? (c.remaining === 0 ? "order done" : s.lastScan ? `now at ${s.lastScan.text}` : "scanning") : "waiting for an order";
            return (
              <div key={s.id} style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr) auto", alignItems: "center", gap: "2cqw", background: `${col}26`, borderLeft: `2.5cqw solid ${col}`, borderRadius: "1cqh", padding: "0 2cqw", minHeight: 0, overflow: "hidden" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: FONT_DISPLAY, fontSize: f(0.46), fontWeight: 900, lineHeight: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{stationLabel(s.id)}</div>
                  <div style={{ fontSize: f(0.2), color: "#cbd5e1", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.operatorName || "—"} · order {s.orderNumber || "—"}</div>
                </div>
                <div style={{ fontSize: f(0.26), fontWeight: 700, color: stale && !open ? "#94a3b8" : "#fff", minWidth: 0, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{line}</div>
                <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <span style={{ fontFamily: FONT_DISPLAY, fontSize: f(0.5), fontWeight: 900, lineHeight: 1 }}>{total > 0 ? done : "—"}</span>
                  {total > 0 && <span style={{ fontSize: f(0.24), color: "#94a3b8" }}> / {total}</span>}
                  {total > 0 && c.remaining > 0 && !stale && s.rate ? <div style={{ fontSize: f(0.18), color: "#94a3b8" }}>{Math.round(s.rate)}/h · {fmtMin(s.etaMin)} left</div> : null}
                </div>
              </div>
            );
          })}
          {active.length === 0 && <div style={{ fontSize: "5cqh", color: "#64748b", alignSelf: "center", textAlign: "center" }}>No station reporting</div>}
        </div>
        <div style={{ fontSize: "2cqh", color: "#475569", marginTop: "1cqh", textAlign: "right", flexShrink: 0 }}>Wall view{parked.length ? ` · ${parked.length} ${parked.length === 1 ? "station" : "stations"} not reporting` : ""} · click or press Esc to go back</div>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "#0d1117", zIndex: 1800, display: "flex", flexDirection: "column", color: "#e2e8f0", fontFamily: FONT_UI }}>
      <div style={{ background: "#161b22", borderBottom: "1px solid #21262d", padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div><div style={{ fontWeight: 800, fontSize: 15 }}>🧭 Supervisor — stations {openCount > 0 && <Pill color="#ef4444">{openCount} need you</Pill>}</div><div style={{ fontSize: 13, color: "#94a3b8" }}><strong style={{ color: "#e2e8f0", fontSize: 15 }}>{todayTotal}</strong> {todayTotal === 1 ? "jersey" : "jerseys"} today · {liveCount} of {active.length} {active.length === 1 ? "station" : "stations"} live{parked.length ? ` · ${parked.length} not reporting` : ""}</div></div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={() => setWall(true)} title="One row per station in big letters, for a TV on the floor. Click or Esc comes back; ?view=wall in the address opens straight into it." style={{ ...btnGhost, padding: "6px 12px" }}>📺 Wall</button>
          <button onClick={onSignOut} title="End your shift on this PC" style={{ ...btnGhost, padding: "6px 14px" }}>Sign out</button>
        </div>
      </div>
      {hubDown && (
        <div style={{ background: "#7f1d1d", color: "#fff", padding: "10px 16px", fontSize: 14, fontWeight: 700, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <span>⚠ The hub stopped answering at {new Date(hubDown).toLocaleTimeString()} — nothing below is live. Stations keep scanning on their own. Is the server window still open on the host PC?</span>
          <button onClick={refresh} style={{ ...btnGhost, padding: "4px 10px", color: "#fff", borderColor: "#fff" }}>Retry</button>
        </div>
      )}
      {openOrder && <OrderView station={openOrder.station} order={openOrder.order} run={openOrder.run || 0} date={day} stationLabel={stationLabel} onClose={() => setOpenOrder(null)} onDownload={downloadOrderSheet} onPhoto={setBigPhoto} />}
      {bigPhoto && <PhotoLightbox src={bigPhoto} onClose={() => setBigPhoto(null)} />}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12, alignContent: "start" }}>
          {data.stations.length === 0 && <div style={{ color: "#64748b", padding: 24 }}>No station has reported yet. A station appears here within a few seconds of starting an order.</div>}
          {(orders.length > 0 || days.length > 1 || day) && (
            <div style={{ gridColumn: "1 / -1", order: 99, marginTop: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
                <div style={{ fontWeight: 800, fontSize: 14 }}>Orders {day ? `on ${day}` : "today"} ({orders.length})</div>
                <select value={day} onChange={e => setDay(e.target.value)} title="Look back at a day the hub still keeps (90 days; photos on the newest 14)" style={{ ...inputSt, width: "auto", fontSize: 12, padding: "3px 8px" }}>
                  <option value="">Today</option>
                  {days.filter(d => d !== todayStr).slice().reverse().map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                {day && <button onClick={() => setDay("")} style={{ ...btnGhost, padding: "3px 10px", fontSize: 12 }}>Back to today</button>}
              </div>
              {orders.length === 0 && <div style={{ color: "#64748b", fontSize: 13, padding: "6px 0 10px" }}>No orders on this day.</div>}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {orders.slice().sort((a, b) => ((((a.counts?.total ?? 0) > 0 && a.counts?.remaining === 0) ? 1 : 0) - (((b.counts?.total ?? 0) > 0 && b.counts?.remaining === 0) ? 1 : 0)) || ((b.lastSeen || 0) - (a.lastSeen || 0))).map(o => {   /* in progress first, then the newest */
                  const c = o.counts || {}; const total = c.total ?? 0; const done = total - (c.remaining ?? 0); const finished = total > 0 && c.remaining === 0;
                  const hm = t => t ? new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
                  return (
                    <div key={`${o.station}|${o.order}|${o.run || 0}`} style={{ ...card, padding: "8px 12px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>Order {o.order} <span style={{ fontWeight: 400, color: "#64748b" }}>· {stationLabel(o.station)} · {o.operator || "—"}</span></div>
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>
                          <strong style={{ color: "#e2e8f0" }}>{done} / {total}</strong> done
                          {c.flag > 0 && <span style={{ color: "#f87171" }}> · {c.flag} with supervisor</span>}
                          {c.manual > 0 && <span style={{ color: "#fcd34d" }}> · {c.manual} by hand</span>}
                          {" · "}{finished ? <span style={{ color: "#22c55e", fontWeight: 700 }}>finished {hm(o.lastSeen)}</span> : `in progress · started ${hm(o.firstSeen)}`}
                        </div>
                      </div>
                      <button onClick={() => setOpenOrder({ station: o.station, order: o.order, run: o.run || 0 })} title="Open this order: roster with statuses, problems, and the log" style={{ ...btnGhost, padding: "4px 10px", fontSize: 12, borderColor: "#60a5fa", color: "#93c5fd" }}>Open order</button>
                      <button onClick={() => downloadOrderSheet(o)} title="The QC Results workbook for this order: every jersey with its status, reason, resolution, inspector and time" style={{ ...btnGhost, padding: "4px 10px", fontSize: 12, borderColor: "#22c55e", color: "#4ade80" }}>⬇ Order sheet</button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {parked.length > 0 && (
            <div style={{ gridColumn: "1 / -1", order: 98, marginTop: 8, ...card, padding: "8px 12px", opacity: 0.75 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8" }}>Not reporting for over {Math.round(GONE_MS / 3600000)} hours ({parked.length}) — stepped back so the live stations stand out{parkedOpen > 0 ? `; ${parkedOpen} old open ${parkedOpen === 1 ? "item" : "items"} on them` : ""}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                {parked.slice().sort(byName).map(s => (
                  <span key={s.id} style={{ fontSize: 12, color: "#cbd5e1", display: "inline-flex", gap: 8, alignItems: "center", padding: "3px 4px 3px 10px", border: "1px solid #334155", borderRadius: 6 }}>
                    {stationLabel(s.id)} · {s.operatorName || "—"} · order {s.orderNumber || "—"} · last seen {fmtMin(Math.round(age(s) / 60))} ago{openOn(s) > 0 && <span style={{ color: "#f87171" }}>· {openOn(s)} open</span>}
                    <button onClick={() => setOpenOrder({ station: s.id, order: s.orderNumber })} disabled={!s.orderNumber} title="Open its last order" style={{ ...btnGhost, padding: "2px 8px", fontSize: 11, opacity: s.orderNumber ? 1 : 0.4 }}>Open</button>
                    <button onClick={() => removeStation(s)} title="Take it off the board" style={{ ...btnGhost, padding: "2px 8px", fontSize: 11 }}>Remove</button>
                  </span>
                ))}
              </div>
            </div>
          )}
          {active.slice().sort(byName).map(s => {   /* a fixed order: cards must not jump as reports arrive */
            const stale = age(s) > 30;
            return (
              <div key={s.id} id={"card-" + s.id} style={{ ...card, padding: 14, border: `1px solid ${stale ? "#334155" : s.counts?.flag ? "#ef4444" : "#21262d"}`, opacity: stale ? 0.6 : 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div style={{ fontWeight: 800, fontSize: 17 }}><span style={{ color: "#60a5fa" }}>{stationLabel(s.id)}</span> · {s.operatorName || "—"}</div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ fontSize: 11, color: stale ? "#f87171" : "#22c55e" }}>{stale ? `last seen ${fmtMin(Math.round(age(s) / 60))} ago` : "● live"}</div>
                    {(stale || (s.counts?.total > 0 && s.counts?.remaining === 0)) && (
                      <button onClick={() => removeStation(s)}
                        title="Take this card off the board" style={{ ...btnGhost, padding: "5px 12px", fontSize: 14 }}>Remove</button>
                    )}
                  </div>
                </div>
                <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 2, display: "flex", alignItems: "center", gap: 10 }}>
                  <span>Order <strong style={{ color: "#e2e8f0" }}>{s.orderNumber || "—"}</strong></span>
                  {s.counts?.total > 0 && !stale && (
                    <button onClick={() => { const n = window.prompt(`Order number for ${stationLabel(s.id)} · ${s.operatorName || "—"}:`, /^\d+$/.test(s.orderNumber || "") ? s.orderNumber : ""); if (n && n.trim()) hub.setOrder(s.id, { orderNumber: n.trim(), by: operatorName }).then(() => { setMsg(`${stationLabel(s.id)} takes order number ${n.trim()} on its next report.`); refresh(); }).catch(() => setMsg("Could not update the hub.")); }}
                      title="Give the order running on this station its number (only the supervisor can)" style={{ ...btnGhost, padding: "5px 12px", fontSize: 14 }}>{s.orderNumber && s.setOrder ? `→ ${s.setOrder.orderNumber}…` : "Set number"}</button>
                  )}
                  {s.orderNumber && s.counts?.total > 0 && (
                    <button onClick={() => setOpenOrder({ station: s.id, order: s.orderNumber })} title="Open this order: every jersey with its status, what was flagged and why, and the log" style={{ ...btnGhost, padding: "5px 12px", fontSize: 14, borderColor: "#60a5fa", color: "#93c5fd" }}>Open order</button>
                  )}
                </div>
                <div style={{ height: 8, background: "#1e293b", borderRadius: 4, marginTop: 10, overflow: "hidden" }}><div style={{ height: "100%", width: `${pct(s)}%`, background: s.counts?.remaining === 0 ? "#22c55e" : "#3b82f6" }} /></div>
                <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
                  {s.counts?.total > 0
                    ? <div style={{ fontSize: 26, fontWeight: 900, lineHeight: 1, marginRight: 6 }}>{(s.counts?.total ?? 0) - (s.counts?.remaining ?? 0)}<span style={{ fontSize: 14, color: "#64748b", fontWeight: 600 }}> / {s.counts?.total ?? 0}</span></div>
                    : <div style={{ fontSize: 15, fontWeight: 700, color: "#60a5fa", marginRight: 6 }}>Waiting for an order</div>}
                  <Pill color="#22c55e">{s.counts?.pass ?? 0} pass</Pill>
                  {s.counts?.flag > 0 && <Pill color="#ef4444">{s.counts.flag} with supervisor</Pill>}
                  {s.counts?.manual > 0 && <Pill color="#f59e0b">{s.counts.manual} by hand</Pill>}
                  {(s.counts?.missing > 0 || s.counts?.short > 0) && <Pill color="#f59e0b">{(s.counts.missing || 0) + (s.counts.short || 0)} missing/short</Pill>}
                </div>
                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 8 }}>
                  <strong style={{ color: "#e2e8f0" }}>{s.day?.date === todayStr ? s.day.done : 0}</strong> today
                  {!(s.counts?.total > 0)
                    ? " · signed in, no order yet — send one with the form"
                    : s.counts?.remaining === 0
                    ? <> · <span style={{ color: "#22c55e", fontWeight: 700 }}>order done</span></>
                    : stale ? " · pace unknown — not reporting"
                      : s.rate ? <> · <strong style={{ color: "#e2e8f0" }}>{Math.round(s.rate)}</strong>/h · about {fmtMin(s.etaMin)} left</>
                        : " · pace shows after a few minutes"}
                </div>
                {s.lastScan && <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>Now at: {s.lastScan.text} · {s.lastScan.time.slice(11)}</div>}
                {s.attention?.length > 0 && (
                  <div style={{ marginTop: 10, borderTop: "1px solid #21262d", paddingTop: 8 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#f87171", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Needs you ({s.attention.length})</div>
                    {s.attention.length > 3 && <div style={{ fontSize: 11, color: "#64748b", marginBottom: 3 }}>the three that weigh most — the rest are in the order</div>}
                    {s.attention.slice().sort(bySeverity).slice(0, 3).map((a, i) => (
                      <div key={i} style={{ fontSize: 12, marginBottom: 3, display: "flex", gap: 8, alignItems: "flex-start" }}>
                        <PhotoThumbs photo={a.photo} damagePhotos={a.damagePhotos} w={56} h={42} onOpen={setBigPhoto} />
                        <div>
                          <RouteTag item={a} /> <span style={{ color: attnColour(a.status), fontWeight: 700 }}>{attnIcon(a.status)} {a.jersey}</span>
                          <span style={{ color: "#94a3b8" }}> — {a.reason}{a.resolution ? ` → ${a.resolution}` : ""}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {s.carried?.length > 0 && (
                  <div style={{ marginTop: 10, borderTop: "1px solid #21262d", paddingTop: 8 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#f59e0b", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Still open from earlier orders</div>
                    {s.carried.map(c => (
                      <div key={c.key} style={{ fontSize: 12, marginBottom: 4, display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                        <span><span style={{ color: attnColour(c.status), fontWeight: 700 }}>{attnIcon(c.status)} {c.jersey}</span><span style={{ color: "#94a3b8" }}> — order {c.order} · {c.reason}</span></span>
                        <button onClick={() => markCarriedDone(s.id, c.key)} title="Dealt with — remove from this list" style={{ ...btnGhost, padding: "5px 12px", fontSize: 14, flexShrink: 0 }}>Done</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ width: 340, flexShrink: 0, borderLeft: "1px solid #21262d", padding: 14, overflowY: "auto" }}>
          <button onClick={() => hub.ledger(day).then(l => exportDaySheetXLSX(l, stationLabel)).catch(() => setMsg("Could not fetch the day's scans from the hub."))}
            title="One Excel file for the whole day, every station: jerseys per hour, time per jersey, flags, every scan" style={{ ...bigBtn, fontSize: 14, marginBottom: 8, background: "#22c55e", color: "#0d1117" }}>⬇ Day sheet (Excel) — {day ? day : `${todayTotal} ${todayTotal === 1 ? "jersey" : "jerseys"} so far`}</button>
          <button onClick={() => hub.ledger(day).then(l => exportDamageReportXLSX(buildDamageRows(l.events || [], { stationLabel, typeLabel: jerseyTypeLabel }), { name: "day_" + (l.date || ""), title: `Damage report — ${l.date || "today"}, every station` })).catch(e => setMsg(e.message || "Could not fetch the day's flags from the hub."))}
            title="Every flagged jersey of the day, every station, with its photo (photos are kept 14 days)" style={{ ...bigBtn, fontSize: 13, marginBottom: 16, background: "transparent", border: "1px solid #ef4444", color: "#f87171" }}>⬇ Damage report (Excel, with photos){day ? ` — ${day}` : ""}</button>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10 }}>Send a roster</div>
          <div style={{ marginBottom: 10 }}>
            <label style={labelSt}>Send to</label>
            <select value={target} onChange={e => setTarget(e.target.value)} style={{ ...inputSt, fontSize: 13 }}>
              <option value="">Any station — first to take it</option>
              {data.stations.slice().sort((a, b) => stationLabel(a.id).localeCompare(stationLabel(b.id), undefined, { numeric: true })).map(s => (
                <option key={s.id} value={s.id}>{stationLabel(s.id)} · {s.operatorName || "—"}{age(s) > 30 ? " (not reporting)" : !(s.counts?.total > 0) ? " (waiting for an order)" : ` (on order ${s.orderNumber || "—"})`}</option>
              ))}
            </select>
            {data.stations.length === 0 && <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>Stations appear here once they have signed in and started once today.</div>}
          </div>
          <div style={{ marginBottom: 10 }}><label style={labelSt}>Order number</label><input value={order} onChange={e => setOrder(e.target.value)} placeholder="e.g. 25" style={inputSt} /></div>
          <div style={{ marginBottom: 10 }}><label style={labelSt}>Order notes</label><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="remarks from the order paper" style={{ ...inputSt, resize: "vertical", fontSize: 13 }} /></div>
          <div style={{ marginBottom: 10 }}><label style={labelSt}>Jersey type <span style={{ color: "#7c8ba1", fontWeight: 400 }}>— sets the station's flag reasons; unset offers every reason</span></label><JerseyTypePicker value={jerseyType} onChange={setJerseyType} /></div>
          <div style={{ marginBottom: 10 }}><label style={labelSt}>Bins — how the station sorts it</label><BinByPicker value={binBy} onChange={setBinBy} /></div>
          <div style={{ marginBottom: 12 }}>
            <label style={labelSt}>Roster file</label>
            <div onClick={() => fileRef.current.click()} style={{ padding: "10px 12px", borderRadius: 8, border: `1px solid ${file ? "#22c55e" : "#334155"}`, background: "#1e293b", color: file ? "#22c55e" : "#64748b", fontSize: 13, cursor: "pointer" }}>{file ? "✓ " + file.name : "📂 Choose CSV or Excel…"}</div>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.tsv,.txt" style={{ display: "none" }} onChange={e => { const f = e.target.files[0]; if (f) setFile(f); e.target.value = ""; }} />
          </div>
          <button onClick={send} style={{ ...bigBtn, fontSize: 14 }}>Send to stations</button>
          {msg && <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 10 }}>{msg}</div>}
          <div style={{ fontWeight: 800, fontSize: 13, margin: "22px 0 8px" }}>Rosters sent ({rosters.length}) <span style={{ fontWeight: 400, color: "#64748b" }}>· one station per order; a finished order leaves this list</span></div>
          {rosters.map(r => (
            <div key={r.id} style={{ ...card, padding: "8px 10px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 17, fontWeight: 700 }}>Order {r.orderNumber || "—"} <span style={{ fontWeight: 400, color: "#94a3b8" }}>· {r.rowCount}</span>{r.takenBy ? <span style={{ fontWeight: 600, color: "#4ade80", marginLeft: 6 }}>· on {stationLabel(r.takenBy.station)} · {r.takenBy.operator || "—"}</span> : r.forStation ? <span style={{ fontWeight: 600, color: "#60a5fa", marginLeft: 6 }}>→ {stationLabel(r.forStation)}</span> : <span style={{ fontWeight: 400, color: "#64748b", marginLeft: 6 }}>· waiting · any station</span>}</div>
                <div style={{ fontSize: 11, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.fileName} · sent {new Date(r.createdAt).toLocaleTimeString()}{r.takenBy ? ` · started ${new Date(r.takenBy.at).toLocaleTimeString()}` : ""}</div>
              </div>
              <span style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                {r.takenBy && <button onClick={() => hub.releaseRoster(r.id).then(refresh).catch(() => {})} title="Let another station take this order (the station that has it keeps working until it finishes)" style={{ ...btnGhost, padding: "2px 8px", fontSize: 11, borderColor: "#f59e0b", color: "#fcd34d" }}>Release</button>}
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
// the safe default, so B-B-B keeps the rhythm and a bad photo can always be
// retried without writing a record.
const HEADLINE_FIELDS = ["number", "name"];

// Two columns, filled row by row, when there are
// more than three rows; the list uses the whole panel and scrolls only when
// both columns are full. The rows run in likelihood order reading left to
// right, top to bottom, and Down follows that reading order (9 Nov 2026).
function twoColumns(n) {
  return n > 3
    ? { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, alignItems: "start" }   // row by row: 1st and 2nd across the top, 3rd and 4th under them
    : { display: "flex", flexDirection: "column", gap: 8 };
}

function CandidateRow({ c, primary, secondary, extraCols, selected, disabled, accent, onClick, onHover, confirmKey }) {
  const head = primary.map(f => f === "number" ? `#${c.number}` : (c[f] || "")).filter(Boolean).join(" · ");
  const sub  = [...secondary.map(f => f === "number" ? `#${c.number}` : (c[f] || "")), ...extraCols.map(k => c[k] ? `${cap(k)}: ${c[k]}` : "")].filter(Boolean).join(" · ");
  return (
    <div onClick={disabled ? undefined : onClick} onMouseEnter={disabled ? undefined : onHover} data-sel={selected ? "1" : undefined}
      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 18px", borderRadius: 14, minWidth: 0, border: `3px solid ${disabled ? "rgba(255,255,255,0.08)" : selected ? accent : "rgba(255,255,255,0.12)"}`, background: disabled ? "rgba(255,255,255,0.02)" : selected ? "rgba(245,158,11,0.18)" : "rgba(255,255,255,0.04)", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.45 : 1 }}>
      <div style={{ minWidth: 0 }}>
        <span style={{ fontFamily: FONT_DISPLAY, fontSize: "clamp(28px, 3vw, 42px)", fontWeight: 800, lineHeight: 1, color: disabled ? "#64748b" : "#fff" }}>{head || "—"}</span>
        {sub && <span style={{ fontSize: 20, color: "#cbd5e1", marginLeft: 14, display: "inline-block", whiteSpace: "nowrap" }}>{sub}</span>}
        {disabled && (c.scanned === "flag"
          ? <span style={{ fontSize: 17, color: "#f87171", marginLeft: 12, fontWeight: 700 }}>🚩 Flagged</span>
          : <span style={{ fontSize: 17, color: "#22c55e", marginLeft: 12, fontWeight: 700 }}>✓ Already passed</span>)}
      </div>
      {!disabled && selected && <span style={{ fontSize: 20, color: accent, fontWeight: 700, whiteSpace: "nowrap", marginLeft: 10 }}>← {formatKey(confirmKey)}</span>}
    </div>
  );
}

function ScanOverlay({ state, actions, binMap, extraCols, notes, jerseyType = "", inspect = null, confirmKey, cancelKey, upKey = "ArrowUp", retryKey, byHandKey, stream, rotation, embedded, canPhoto = false, ticket = null, reprintTicket, onTrial = null }) {
  const reasons = reasonsFor(jerseyType);
  // Input trial (src/lib/trial.js): the overlay is mounted anew for every
  // screen (its key is the mode and the scan), so "shown" is the mount; every
  // option that runs goes through `fire`, which says how it was reached.
  const shownAt = useRef(0);
  useEffect(() => { shownAt.current = Date.now(); }, []);   // when the screen mounts (a clock read in render is impure for the linter)
  const trialMoves = useRef(0), trialHovers = useRef(0);
  const fire = useCallback((o, i, via, key = "", opts = null) => {
    if (onTrial && o) onTrial({ screen: state.mode, n: opts ? opts.length : null, idx: i, id: o.id, via, key, ms: Date.now() - shownAt.current, moves: trialMoves.current, hovers: trialHovers.current });
    o.run();
  }, [onTrial, state.mode]);
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
  const isList  = mode === "pick" || mode === "close";
  const isRed   = mode === "flag" || mode === "duplicate" || mode === "supervisor";
  const isMenu  = mode === "reasons" || mode === "reasonText";
  const isManual = mode === "manual" || mode === "manualDone";

  const bg     = isGreen ? "#052e16" : (isList || isManual) ? "#1c1a06" : isMenu ? "#1a1033" : "#450a0a";
  const accent = isGreen ? "#22c55e" : (isList || isManual) ? "#f59e0b" : isMenu ? "#a78bfa" : "#ef4444";

  const match      = state.match || state.scan?.match || null;
  const candidates = useMemo(() => state.candidates || [], [state.candidates]);
  const detected   = state.scan?.detected;

  // Damage photo on the supervisor screen: the scan photo only ever shows the
  // back, so the operator holds the problem under the camera, 3-2-1 ticks, and
  // the live frame is kept on the flag for the supervisor. `count` is 3, 2, 1,
  // then 0 while the shot is taken; null when nothing is running.
  const [count, setCount] = useState(null);
  const damagePhotos = state.damagePhotos || [];
  const startCount = useCallback(() => { setCount(3); playTone("count"); }, []);
  // The retry pedal on a green: the read is right, there is nothing to retry,
  // and a retry here looks exactly like a confirm from the operator's side
  // (both end on the camera screen) — a jersey went in the bin unchecked that
  // way on 5 Nov 2026. So the pedal only shows a nudge, laid over the screen
  // for 5 s with nothing moving underneath; the Retry button is a mouse click
  // only (no key reaches it: the arrows skip it, B never runs it).
  const [nudge, setNudge] = useState("");
  const nudgeTimer = useRef(null);
  const showNudge = useCallback(() => {
    setNudge(`That's the retry pedal — ${formatKey(confirmKey)} confirms`);
    clearTimeout(nudgeTimer.current); nudgeTimer.current = setTimeout(() => setNudge(""), 5000);
  }, [confirmKey]);
  useEffect(() => () => clearTimeout(nudgeTimer.current), []);
  const actionsRef = useRef(actions);
  useEffect(() => { actionsRef.current = actions; }, [actions]);

  // Adaptive headline: whatever differs between the candidates becomes the big text.
  const fields  = useMemo(() => [...CORE_COLUMNS, ...extraCols], [extraCols]);
  const diff    = useMemo(() => differingFields(candidates, fields), [candidates, fields]);
  const primary = diff.length && !diff.some(f => HEADLINE_FIELDS.includes(f)) ? diff : HEADLINE_FIELDS;
  const secondary = fields.filter(f => !primary.includes(f) && !extraCols.includes(f));

  const options = useMemo(() => {
    const retry    = { id: "retry",    label: "↻ Retry scan",    run: actions.retry };
    const notRight = { id: "notright", label: "🚩 Flag",          run: actions.reasons };
    const byHand   = { id: "manual",   label: "⌨ Enter by hand", run: actions.manual };
    if (mode === "confirm")    return [{ id: "confirm", label: "✓ Confirm", primary: true, run: actions.confirm }, { ...retry, mouseOnly: true }, notRight];   // Retry on a green is a mouse click only (see showNudge)
    if (isList) {
      const t = state.typed;
      const none = t
        ? { ...byHand, label: `🛑 #${t.number || "?"}${t.name ? " " + t.name : ""} — not on the roster` }
        : { ...byHand, label: "⌨ None of these" };
      const back = { id: "back", label: "← Back", run: actions.editTyped };   // mistyped: back to the form, as typed
      return [...candidates.map(c => ({ id: "c" + c._id, candidate: c, disabled: isDone(c), run: () => actions.pick(c) })), ...(t ? [back] : [retry]), none, notRight];
    }
    if (mode === "flag")       return [{ ...retry, primary: true }, byHand, { id: "flag", label: "🚩 Flag & continue", run: actions.flagContinue }, { ...notRight, label: "🚩 Bad jersey" }];
    if (mode === "manualDone") return [{ id: "cont", label: "✓ Continue", primary: true, run: actions.continueManual }, { id: "back", label: "← Back", run: actions.undoManual }, { ...notRight, run: actions.reopenLast }];
    if (mode === "manual")     return [];
    if (mode === "duplicate")  return [{ id: "skip", label: "✓ Skip", primary: true, run: actions.skipDuplicate }, retry, { id: "dup", label: "🚩 Duplicate", run: actions.flagDuplicate }];
    if (mode === "reasons")    return [...reasons.map(r => ({ id: r.id, label: r.label, run: () => actions.chooseReason(r) })), { id: "back", label: "← Back", run: actions.back }];
    if (mode === "supervisor") {
      if (count !== null) return [];                         // counting down: nothing to pick, no key does anything
      const cont   = { id: "cont",   label: "✓ Continue", run: actions.continueSupervisor };
      const photo  = { id: "photo",  label: damagePhotos.length ? "📷 Take another" : "📷 Photo of the damage", hint: damagePhotos.length ? "" : "hold the problem under the camera", run: startCount };
      const retake = { id: "retake", label: "↻ Retake", run: () => { actions.dropDamagePhoto(); startCount(); } };
      if (!canPhoto) return [{ ...cont, primary: true }];
      if (damagePhotos.length) return [{ ...cont, primary: true }, photo, retake];
      // A defect wants a photo first; a roster problem is already in the scan photo.
      return state.photoFirst ? [{ ...photo, primary: true }, cont] : [{ ...cont, primary: true }, photo];
    }
    if (mode === "reasonText") return [];   // typing, not navigating
    return [];
  }, [mode, isList, candidates, actions, state.typed, reasons, count, damagePhotos.length, canPhoto, state.photoFirst, startCount]);

  const firstEnabled = Math.max(0, options.findIndex(o => !o.disabled));
  const [selectedIdx, setSelectedIdx] = useState(firstEnabled);
  const lastKeyRef = useRef(0);

  // The countdown: a tick a second, the shutter on the last, then the shot.
  // Afterwards the highlight goes back to the first option (Continue).
  useEffect(() => {
    if (count === null) return;
    if (count > 0) { const t = setTimeout(() => { setCount(count - 1); playTone(count > 1 ? "count" : "shutter"); }, 1000); return () => clearTimeout(t); }
    Promise.resolve(actionsRef.current.damagePhoto()).finally(() => { setCount(null); setSelectedIdx(0); });
  }, [count]);

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
      trialMoves.current++;
      setSelectedIdx(next);
    };
    const onKey = (e) => {
      if (e.repeat) return;                       // a held key or pedal is one press, not many
      if (mode === "done") return;
      if (mode === "manual" || mode === "reasonText") { if (e.code === "Escape") { e.preventDefault(); actions.back(); } return; }   // typing, not navigating
      if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target?.tagName)) return;   // the Enter that submitted the form is still bubbling: it must not also pick the first row of the list it opened
      if (e.code === retryKey) { if (mode === "confirm") { e.preventDefault(); showNudge(); return; } const i = options.findIndex(x => x.id === "retry"); if (i >= 0) { e.preventDefault(); lastKeyRef.current = Date.now(); fire(options[i], i, "key", e.code, options); } return; }
      if (e.code === byHandKey) { const i = options.findIndex(x => x.id === "manual"); if (i >= 0) { e.preventDefault(); lastKeyRef.current = Date.now(); fire(options[i], i, "key", e.code, options); } return; }   // straight to the form, like R goes straight to retry
      if (e.code === confirmKey) { e.preventDefault(); lastKeyRef.current = Date.now(); const o = options[selectedIdx]; if (o && !o.disabled && !o.mouseOnly) fire(o, selectedIdx, "key", e.code, options); return; }
      // The assigned keys come first; a plain arrow only moves its own way when
      // it is not assigned to the other direction (a pedal board wired the
      // other way round sets Down = ArrowUp and Up = ArrowDown, 9 Nov 2026).
      if (e.code === cancelKey || e.code === upKey) { e.preventDefault(); lastKeyRef.current = Date.now(); move(e.code === cancelKey ? 1 : -1); return; }
      if (e.code === "ArrowDown") { e.preventDefault(); lastKeyRef.current = Date.now(); move(1); return; }
      if (e.code === "ArrowUp") { e.preventDefault(); lastKeyRef.current = Date.now(); move(-1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [options, selectedIdx, mode, confirmKey, cancelKey, upKey, retryKey, byHandKey, actions, showNudge, fire]);

  // A bumped mouse never overrides a key press made in the last moment.
  const hover = useCallback(i => { if (Date.now() - lastKeyRef.current > 800) { trialHovers.current++; setSelectedIdx(i); } }, []);

  // The highlighted option follows the key down a long list: the list scrolls
  // so the row the Select key would take is always on screen.
  useEffect(() => {
    if (Date.now() - lastKeyRef.current > 800) return;          // moved by the mouse: it is already in view
    document.querySelector('[data-sel="1"]')?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedIdx]);

  const binNum  = match ? binFor(binMap, match) : null;
  const hasSize = !!(match?.size);
  const extras  = match ? extraCols.filter(k => match[k]).map(k => `${cap(k)}: ${match[k]}`) : [];

  const OptionButton = ({ o, i }) => {
    const sel = i === selectedIdx;
    return (
      <button onClick={() => fire(o, i, "pointer", "", options)} onMouseEnter={() => hover(i)} data-sel={sel ? "1" : undefined}
        style={{ padding: "13px 20px", borderRadius: 12, border: `3px solid ${sel ? accent : "rgba(255,255,255,0.22)"}`, background: o.primary ? accent : "transparent", color: o.primary ? "#0d1117" : "#fff", fontWeight: 700, fontSize: 20, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, boxShadow: sel ? `0 0 0 3px ${accent}55` : "none", opacity: sel || o.primary ? 1 : 0.85 }}>
        <span>{o.label} {o.id === "retry" && mode !== "confirm" ? <Kbd light>{formatKey(retryKey)}</Kbd> : o.id === "manual" ? <Kbd light>{formatKey(byHandKey)}</Kbd> : sel && <Kbd light={!o.primary}>{formatKey(confirmKey)}</Kbd>}</span>
        {o.hint && <span style={{ fontSize: 15, fontWeight: 400, opacity: 0.8 }}>{o.hint}</span>}
      </button>
    );
  };

  return (
    <div style={{ position: embedded ? "absolute" : "fixed", inset: 0, zIndex: 1000, background: bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "safe center", userSelect: "none", padding: state.scan?.thumb && !isGreen ? "16px 0 116px" : "16px 0", overflowY: "auto", containerType: "size" }}>

      {/* ── GREEN ── */}
      {nudge && (
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 5, padding: "18px 36px", borderRadius: 18, background: "#0d1117", color: "#fcd34d", border: "4px solid #f59e0b", fontWeight: 900, fontSize: "clamp(24px, 3.4vw, 40px)", boxShadow: "0 12px 40px rgba(0,0,0,0.6)", maxWidth: "90%", textAlign: "center", boxSizing: "border-box", pointerEvents: "none" }}>
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
                <div style={{ fontFamily: FONT_DISPLAY, fontSize: `min(20cqh, ${Math.min(22, 170 / Math.max(6, String(match.name).length))}cqw)`, fontWeight: 800, color: "#fff", lineHeight: 1, marginTop: "2cqh", maxWidth: "100%", overflowWrap: "anywhere", letterSpacing: 1 }}>
                  {match.name}
                </div>
              )}
              {match.team && <div style={{ fontSize: "min(9cqh, 8cqw)", color: "#86efac", marginTop: "2cqh", fontWeight: 700, lineHeight: 1.1, maxWidth: "100%", overflowWrap: "anywhere" }}>{match.team}</div>}
            </div>
            {(hasSize || binNum !== null) && (
              <div style={{ containerType: "size", minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", gap: "3cqh" }}>
                {hasSize && (
                  <div style={{ flex: 1, minHeight: 0, borderRadius: 24, border: "5px solid #22c55e", background: "rgba(34,197,94,0.14)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 4cqw", boxSizing: "border-box" }}>
                    <div style={{ fontSize: `min(${binNum !== null ? 7 : 12}cqh, ${binNum !== null ? 14 : 20}cqw)`, color: "#86efac", fontWeight: 900, letterSpacing: 3, lineHeight: 1 }}>SIZE</div>
                    <div style={{ fontFamily: FONT_DISPLAY, fontSize: `min(${binNum !== null ? 34 : 70}cqh, ${String(match.size).length > 4 ? 38 : String(match.size).length > 2 ? 55 : 80}cqw)`, fontWeight: 900, color: "#fff", letterSpacing: 2, lineHeight: 1 }}>{match.size}</div>
                  </div>
                )}
                {binNum !== null && (
                  <div style={{ flex: 1, minHeight: 0, borderRadius: 24, border: "5px solid #3b82f6", background: "rgba(59,130,246,0.16)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 4cqw", boxSizing: "border-box" }}>
                    <div style={{ fontSize: `min(${hasSize ? 7 : 12}cqh, ${hasSize ? 14 : 20}cqw)`, color: "#93c5fd", fontWeight: 900, letterSpacing: 3, lineHeight: 1 }}>BIN</div>
                    {/* The digit is limited by the box width: one digit may be wider than two, two than three (Barlow Condensed is about half an em a digit). */}
                    <div style={{ fontFamily: FONT_DISPLAY, fontSize: `min(${hasSize ? 36 : 72}cqh, ${String(binNum).length === 1 ? 120 : String(binNum).length === 2 ? 80 : 55}cqw)`, fontWeight: 900, color: "#fff", lineHeight: 0.95 }}>{binNum}</div>
                  </div>
                )}
              </div>
            )}
          </div>
          {extras.length > 0 && (
            <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap", justifyContent: "center", flexShrink: 0 }}>
              {extras.map(x => <span key={x} style={{ padding: "8px 18px", borderRadius: 12, border: "3px solid #f59e0b", background: "rgba(245,158,11,0.15)", color: "#fff", fontWeight: 900, fontSize: "clamp(20px, 3vw, 32px)" }}>{x}</span>)}
            </div>
          )}
          {state.note && <div style={{ marginTop: 12, fontSize: 20, color: "#fcd34d" }}>✎ {state.note}</div>}
          {mode === "confirm" && (
            <>
              {numberDoubt && (
                <div style={{ marginTop: 12, padding: "10px 26px", borderRadius: 14, background: "#0d1117", border: "4px solid #f59e0b", color: "#fcd34d", fontWeight: 900, fontSize: "clamp(22px, 3vw, 32px)", textAlign: "center", maxWidth: "94%" }}>
                  ⚠ Camera could not see the whole number — check it is #{match.number}
                </div>
              )}
              {inspect && inspect.phase !== "quick" && (
                <div style={{ marginTop: 12, padding: "8px 24px", borderRadius: 14, background: "#f59e0b", color: "#0d1117", fontWeight: 900, fontSize: "clamp(20px, 2.6vw, 26px)", letterSpacing: 0.5 }}>
                  🔍 {inspectLabel(inspect)}
                </div>
              )}
              {inspect && inspect.phase !== "quick" && (
              <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", alignItems: "center", padding: "0 20px" }}>
                <span style={{ fontSize: 18, color: "#86efac", fontWeight: 700, marginRight: 6 }}>Check</span>
                {CHECKLIST.map(c => (
                  <span key={c} style={{ padding: "5px 13px", borderRadius: 999, border: "2px solid rgba(134,239,172,0.55)", background: "rgba(34,197,94,0.16)", color: "#fff", fontWeight: 700, fontSize: "clamp(17px, 2vw, 21px)", whiteSpace: "nowrap" }}>{c}</span>
                ))}
              </div>
              )}
              {notes && (
                <div style={{ marginTop: 12, padding: "8px 18px", borderRadius: 12, background: "rgba(245,158,11,0.16)", border: "2px solid rgba(245,158,11,0.55)", color: "#fde68a", fontWeight: 700, fontSize: "clamp(18px, 2vw, 24px)", textAlign: "center", maxWidth: 900 }}>
                  📝 {notes}
                </div>
              )}
              <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", padding: "0 6px" }}>
                {options.map((o, i) => <OptionButton key={o.id} o={o} i={i} />)}
              </div>
            </>
          )}
          {mode === "done" && <div style={{ fontSize: 32, color: "#4ade80", marginTop: 20, opacity: 0.85 }}>Next jersey…</div>}
        </>
      )}

      {/* ── YELLOW: pick / close ── */}
      {isList && (
        <>
          <div style={{ fontSize: 52, lineHeight: 1, marginBottom: 4 }}>{mode === "pick" ? "⚠️" : "🔍"}</div>
          <div style={{ fontSize: "clamp(28px, 4.5vw, 48px)", fontWeight: 900, color: accent, marginBottom: 6, textAlign: "center", padding: "0 24px", lineHeight: 1.1 }}>
            {mode === "pick" ? "Which jersey is this?" : "No exact match"}
          </div>
          {state.reason && (
            <div style={{ fontSize: 24, color: "#fcd34d", marginBottom: 6, opacity: 0.95, textAlign: "center", padding: "0 24px" }}>
              {state.reason}
            </div>
          )}
          <div style={{ fontSize: 20, color: "#d6d3d1", marginBottom: 16, textAlign: "center" }}>
            Read: #{detected?.number || "?"}{detected?.number && detected?.number_complete === false ? "?" : ""}{detected?.name ? ` · ${detected.name}${detected.name_complete === false ? "…" : ""}` : " · no name"}{detected?.jersey_colour ? ` · ${detected.jersey_colour} jersey` : ""}
            {primary !== HEADLINE_FIELDS && <span style={{ marginLeft: 12, color: accent }}>· differs by {primary.map(cap).join(" and ")}</span>}
          </div>
          <div style={{ width: "100%", maxWidth: candidates.length > 3 ? 1200 : 820, padding: "0 24px", boxSizing: "border-box", maxHeight: "52%", overflowY: "auto" }}>
            {candidates.length === 0 && (
              <div style={{ textAlign: "center", color: "#fcd34d", fontSize: 22, padding: 16 }}>No rows to choose from.</div>
            )}
            {candidates.length > 0 && candidates.every(isDone) && (
              <div style={{ textAlign: "center", color: "#fcd34d", fontSize: 20, padding: "8px 0 12px" }}>All of these already passed.</div>
            )}
            <div style={twoColumns(candidates.length)}>
              {options.map((o, i) => o.candidate && (
                <CandidateRow key={o.id} c={o.candidate} primary={primary} secondary={secondary} extraCols={extraCols} selected={i === selectedIdx} disabled={o.disabled} accent={accent}
                  onClick={() => fire(o, i, "pointer", "", options)} onHover={() => hover(i)} confirmKey={confirmKey} />
              ))}
            </div>
          </div>
          <div style={{ marginTop: 14, display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
            {options.map((o, i) => !o.candidate && <OptionButton key={o.id} o={o} i={i} />)}
          </div>
        </>
      )}

      {/* ── RED, taking the damage photo: the live picture with 3-2-1 over it ── */}
      {isRed && count !== null && (
        <>
          <div style={{ fontSize: "clamp(26px, 3.2vw, 38px)", fontWeight: 800, color: "#fecaca", textAlign: "center", padding: "0 24px", marginBottom: 14 }}>📷 Hold the damage under the camera</div>
          {!embedded && stream
            ? <LivePreview stream={stream} rotation={rotation} big><Countdown n={count} /></LivePreview>
            : <Countdown n={count} />}
        </>
      )}

      {/* ── RED: not found / API error / duplicate / supervisor ── */}
      {isRed && count === null && (
        <>
          <div style={{ fontSize: 80, lineHeight: 1, marginBottom: 4 }}>{mode === "supervisor" ? "🛑" : mode === "duplicate" ? "⚠️" : "🚩"}</div>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: "clamp(56px, 9vw, 120px)", fontWeight: 900, color: accent, textAlign: "center", padding: "0 24px", lineHeight: 0.95, marginTop: 4 }}>
            {mode === "supervisor" ? "GO TO SUPERVISOR" : mode === "duplicate" ? (match?.scanned === "flag" ? "FLAGGED" : "ALREADY DONE") : state.title || "NOT FOUND"}
          </div>
          {(match || detected) && (
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: "clamp(30px, 4.5vw, 52px)", fontWeight: 700, color: "#fca5a5", marginTop: 14, textAlign: "center" }}>
              {match ? `#${match.number}${match.name ? ` · ${match.name}` : ""}${match.size ? ` · ${match.size}` : ""}` : `#${detected.number || "?"}${detected.name ? ` · ${detected.name}` : ""}`}
            </div>
          )}
          {state.reason && mode !== "supervisor" && (
            <div style={{ fontSize: 26, color: "#fca5a5", marginTop: 12, textAlign: "center", padding: "0 40px", maxWidth: 820, opacity: 0.95, lineHeight: 1.4 }}>
              {state.reason}
            </div>
          )}
          {mode === "supervisor" && damagePhotos.length > 0 && (
            <div style={{ marginTop: 10, textAlign: "center" }}>
              <img src={damagePhotos[damagePhotos.length - 1]} alt="" style={{ height: "clamp(120px, 18vh, 196px)", aspectRatio: "4 / 3", objectFit: "cover", borderRadius: 12, border: "3px solid #fca5a5", display: "block", margin: "0 auto" }} />
              <div style={{ fontSize: 20, color: "#fecaca", marginTop: 4, fontWeight: 700 }}>✓ {damagePhotos.length > 1 ? `${damagePhotos.length} damage photos` : "Damage photo"} saved for the supervisor</div>
            </div>
          )}
          {mode === "supervisor" && damagePhotos.length === 0 && canPhoto && (
            <div style={{ fontSize: 22, color: "#fecaca", marginTop: 14, textAlign: "center", padding: "0 40px", maxWidth: 820, lineHeight: 1.35 }}>
              {state.photoFirst ? "Hold the problem under the camera and take a photo for the supervisor." : "The scan photo goes with it. If the problem is somewhere else — the front, a sleeve — take a photo of that."}
            </div>
          )}
          {mode === "supervisor" && ticket && (
            <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10, fontSize: 19, color: ticket.status === "done" ? "#fecaca" : ticket.status === "printing" ? "#fca5a5" : "#fbbf24" }}>
              <span>{ticket.status === "printing" ? "🖨 Printing the flag ticket…" : ticket.status === "done" ? "🖨 Flag ticket printed — stick it on the jersey" : ticket.status === "none" ? "🖨 No label printer for this station — write the ticket by hand" : `🖨 Ticket not printed: ${ticket.message}`}</span>
              {ticket.status !== "printing" && <button onClick={() => reprintTicket?.(state.entryId)} title="Print this jersey's flag ticket again" style={{ ...btnGhost, padding: "4px 10px", fontSize: 14, borderColor: "#fca5a5", color: "#fecaca" }}>Reprint</button>}
            </div>
          )}
          {mode === "flag" && state.title === "SCAN FAILED" && (
            <div style={{ fontSize: 21, color: "#fed7aa", marginTop: 16, textAlign: "center" }}>Check the network.</div>
          )}
          <div style={{ marginTop: 28, display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
            {options.map((o, i) => <OptionButton key={o.id} o={o} i={i} />)}
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
      {mode === "manualDone" && match && (
        <>
          <div style={{ fontSize: 72, lineHeight: 1, marginBottom: 4 }}>✍</div>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: "clamp(40px, 6vw, 72px)", fontWeight: 900, color: accent, textAlign: "center", lineHeight: 1 }}>ENTERED BY HAND</div>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: "clamp(40px, min(12cqh, 14cqw), 96px)", fontWeight: 800, color: "#fff", marginTop: 12, textAlign: "center", lineHeight: 1, padding: "0 24px", overflowWrap: "anywhere" }}>#{match.number}{match.name ? ` · ${match.name}` : ""}</div>
          {match.team && <div style={{ fontSize: "clamp(22px, 4cqh, 36px)", color: "#fcd34d", marginTop: 8, textAlign: "center", fontWeight: 700 }}>{match.team}</div>}
          <div style={{ display: "flex", gap: 18, marginTop: 12, flexWrap: "wrap", justifyContent: "center" }}>
            {hasSize && (
              <div style={{ padding: "6px 36px 10px", borderRadius: 22, border: "5px solid #f59e0b", background: "rgba(245,158,11,0.14)", textAlign: "center", minWidth: 180 }}>
                <div style={{ fontSize: "clamp(18px, 3cqh, 26px)", color: "#fcd34d", fontWeight: 800, marginBottom: 2, letterSpacing: 1 }}>SIZE</div>
                <div style={{ fontFamily: FONT_DISPLAY, fontSize: "clamp(48px, min(13cqh, 18cqw), 120px)", fontWeight: 900, color: "#fff", letterSpacing: 2, lineHeight: 1 }}>{match.size}</div>
              </div>
            )}
            {binNum !== null && (
              <div style={{ padding: "6px 36px 10px", borderRadius: 22, border: "5px solid #3b82f6", background: "rgba(59,130,246,0.16)", textAlign: "center", minWidth: 180 }}>
                <div style={{ fontSize: "clamp(18px, 3cqh, 26px)", color: "#93c5fd", fontWeight: 800, marginBottom: 2, letterSpacing: 1 }}>BIN</div>
                <div style={{ fontFamily: FONT_DISPLAY, fontSize: "clamp(48px, min(13cqh, 18cqw), 120px)", fontWeight: 900, color: "#fff", lineHeight: 1 }}>{binNum}</div>
              </div>
            )}
          </div>
          {state.reason && <div style={{ fontSize: 21, color: "#fde68a", marginTop: 10, opacity: 0.9, textAlign: "center", padding: "0 24px" }}>{state.reason}</div>}
          <div style={{ marginTop: 28, display: "flex", gap: 14 }}>{options.map((o, i) => <OptionButton key={o.id} o={o} i={i} />)}</div>
        </>
      )}

      {/* ── REASONS menu ── */}
      {isMenu && (
        <>
          <div style={{ fontSize: 56, lineHeight: 1, marginBottom: 4 }}>✎</div>
          <div style={{ fontSize: "clamp(28px, 4.5vw, 44px)", fontWeight: 900, color: accent, marginBottom: 6, textAlign: "center" }}>What's wrong with it?</div>
          {match && <div style={{ fontSize: 22, color: "#c4b5fd", marginBottom: 16 }}>#{match.number}{match.name ? ` · ${match.name}` : ""}{match.size ? ` · ${match.size}` : ""}</div>}
          <div style={{ width: "100%", maxWidth: 1200, padding: "0 24px", boxSizing: "border-box", maxHeight: "68%", overflowY: "auto", ...twoColumns(options.length) }}>
            {options.map((o, i) => {
              const sel = i === selectedIdx;
              return (
                <div key={o.id} onClick={() => fire(o, i, "pointer", "", options)} onMouseEnter={() => hover(i)} data-sel={sel ? "1" : undefined}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 18px", borderRadius: 12, minWidth: 0, border: `3px solid ${sel ? accent : "rgba(255,255,255,0.12)"}`, background: sel ? "rgba(167,139,250,0.18)" : "rgba(255,255,255,0.04)", cursor: "pointer" }}>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: "#fff" }}>{o.label}</div>
                  </div>
                  {sel && <span style={{ fontSize: 20, color: accent, fontWeight: 700, whiteSpace: "nowrap", marginLeft: 12 }}>← {formatKey(confirmKey)}</span>}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Progress bar on the green flash */}
      {mode === "done" && (
        <div style={{ position: "absolute", bottom: 0, left: 0, height: 6, width: "100%", background: "#052e16" }}>
          <div ref={el => { if (el) { el.style.transition = "width 0.7s linear"; requestAnimationFrame(() => { el.style.width = "0%"; }); } }}
            style={{ height: "100%", background: "#22c55e", width: "100%" }} />
        </div>
      )}

      {state.scan?.thumb && mode !== "done" && !isMenu && (
        <div title="What the camera read" style={{ position: "absolute", ...(isGreen ? { top: 12 } : { bottom: 12 }), left: 12, opacity: isGreen ? 0.5 : 0.6 }}>
          <img src={state.scan.thumb} alt="" style={{ width: isGreen ? 80 : 120, height: isGreen ? 60 : 90, objectFit: "cover", borderRadius: 8 }} />
        </div>
      )}
      {!embedded && mode !== "manual" && mode !== "reasonText" && count === null && <LivePreview stream={stream} rotation={rotation} />}
    </div>
  );
}

// ── Result card (flag resolution) ─────────────────────────────────────────────
// `canResolve`: Accept / Reject / Note are the supervisor's call; the operator sees the flag without them.
function ResultCard({ result, onResolve, canResolve = true }) {
  const [note, setNote] = useState("");
  const isManual  = result.status === S_MANUAL && !result.resolution;    // entered by hand, awaiting sign-off
  const isFlagged = result.status === S_FLAGGED || isManual;
  return (
    <div style={{ ...card, border: `1px solid ${statusColor(result.status)}`, background: isFlagged ? "rgba(239,68,68,0.06)" : "rgba(148,163,184,0.06)", padding: "6px 10px" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        {result.thumb && <img src={result.thumb} alt="" style={{ width: 44, height: 33, objectFit: "cover", borderRadius: 4, flexShrink: 0 }} />}
        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: statusColor(result.status), whiteSpace: "nowrap" }}>
            {isManual ? "✍ By hand" : isFlagged ? "🚩 Flagged" : "🔧 Resolved"}
          </span>
          <span style={{ fontFamily: FONT_DISPLAY, fontSize: 22, fontWeight: 800, lineHeight: 1 }}>
            {result.match ? `#${result.match.number}${result.match.name ? " · " + result.match.name : ""}` : `#${result.detected?.number || "?"}${result.detected?.name ? " · " + result.detected.name : ""}`}
          </span>
          {result.reason     && <span style={{ fontSize: 13, color: "#f87171", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{result.reason}</span>}
          {result.resolution && <span style={{ fontSize: 13, color: "#cbd5e1" }}>{result.resolution}</span>}
        </div>
      </div>
      {isFlagged && canResolve && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #21262d" }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button onClick={() => onResolve(result.id, "accept", note)} style={{ ...btnSm, background: "rgba(34,197,94,0.15)",  color: "#22c55e", border: "1px solid #22c55e" }}>✓ Accept — counts as passed</button>
            <button onClick={() => onResolve(result.id, "reject", note)} style={{ ...btnSm, background: "rgba(239,68,68,0.15)",  color: "#ef4444", border: "1px solid #ef4444" }}>✗ Reject — sent for rework</button>
            <button onClick={() => onResolve(result.id, "note",   note)} style={{ ...btnSm, background: "rgba(99,102,241,0.15)", color: "#818cf8", border: "1px solid #818cf8" }}>📝 Note only</button>
          </div>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="Optional note…"
            style={{ marginTop: 8, width: "100%", boxSizing: "border-box", padding: "8px 12px", borderRadius: 6, border: "1px solid #3f4b5c", background: "#1e293b", color: "#e2e8f0", fontSize: 15 }} />
        </div>
      )}
    </div>
  );
}

// ── Settings panel ────────────────────────────────────────────────────────────
function SettingsPanel({ settings, cameras, onSave, onClose }) {
  const [temp,      setTemp]      = useState(settings);
  const [listening, setListening] = useState(null);
  const [showTrial, setShowTrial] = useState(false);

  useEffect(() => {
    if (!listening) return;
    const h = e => { e.preventDefault(); setTemp(t => ({ ...t, [listening]: e.code })); setListening(null); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [listening]);

  useEffect(() => {
    const h = e => { if (e.key === "Escape" && !listening && !showTrial) onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, listening, showTrial]);

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
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 2200, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#161b22", borderRadius: 12, border: "1px solid #21262d", padding: 28, width: 540, maxWidth: "92vw", maxHeight: "92%", overflowY: "auto", boxSizing: "border-box" }}>
        <div style={{ fontWeight: 700, fontSize: 22, marginBottom: 16 }}>⚙ Settings</div>

        <div style={{ marginBottom: 18 }}>
          <div style={labelSt}>Keyboard shortcuts</div>
          {keyRows.map(r => (
            <div key={r.key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <div style={{ fontSize: 16, color: "#cbd5e1", width: 150, flexShrink: 0 }}>{r.label}</div>
              <div style={{ flex: 1, padding: "6px 10px", borderRadius: 8, border: `1px solid ${listening === r.key ? "#3b82f6" : "#334155"}`, background: "#1e293b", color: "#e2e8f0", fontSize: 17, fontWeight: 700, textAlign: "center" }}>
                {listening === r.key ? "Press any key…" : formatKey(temp[r.key])}
              </div>
              <button onClick={() => setListening(r.key)} style={{ ...btnGhost, whiteSpace: "nowrap", padding: "4px 10px" }}>Change</button>
            </div>
          ))}
          <div style={{ fontSize: 14, color: "#7c8ba1" }}>Select picks the highlighted option; Down and Up (or ↓ ↑) move it; Retry scan re-shoots from any screen with nothing recorded. Scan only works when no screen is open, so it may share a key with Select.</div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <div style={labelSt}>Camera</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <div style={{ fontSize: 16, color: "#cbd5e1", width: 150, flexShrink: 0 }}>Mount rotation</div>
            <select value={temp.rotation} onChange={e => setTemp(t => ({ ...t, rotation: Number(e.target.value) }))} style={selSt}>
              {[0, 90, 180, 270].map(d => <option key={d} value={d}>{d}° {d === 180 ? "(upside-down mount)" : d === 0 ? "(upright)" : ""}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <div style={{ fontSize: 16, color: "#cbd5e1", width: 150, flexShrink: 0 }}>Camera</div>
            <select value={temp.cameraId} onChange={e => setTemp(t => ({ ...t, cameraId: e.target.value }))} style={selSt}>
              <option value="">Browser default</option>
              {cameras.map(c => <option key={c.deviceId} value={c.deviceId}>{c.label || `Camera ${c.deviceId.slice(0, 6)}`}</option>)}
              {temp.cameraId && !cameras.some(c => c.deviceId === temp.cameraId) && <option value={temp.cameraId}>Saved camera (not on this PC)</option>}
            </select>
          </div>
          {cameras.length === 0 && <div style={{ fontSize: 14, color: "#7c8ba1" }}>Start the camera once to list the cameras on this machine.</div>}
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 16, color: "#cbd5e1", cursor: "pointer" }}>
            <input type="checkbox" checked={!!temp.autoScan} onChange={e => setTemp(t => ({ ...t, autoScan: e.target.checked }))} />
            Hands-free: after a confirm, scan the next jersey when it is placed and still
          </label>
          {temp.autoScan && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 16, color: "#cbd5e1" }}>
              <div style={{ width: 150, flexShrink: 0 }}>Wait after a confirm</div>
              <input type="number" min={0} max={30} step={0.5} value={temp.autoScanDelay ?? 3} onChange={e => setTemp(t => ({ ...t, autoScanDelay: Math.max(0, Math.min(30, Number(e.target.value) || 0)) }))} style={{ ...selSt, width: 90 }} />
              <span>seconds</span>
            </div>
          )}
        </div>

        <div style={{ marginBottom: 18 }}>
          <div style={labelSt}>Label printer</div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 16, color: "#cbd5e1", cursor: "pointer", marginBottom: 8 }}>
            <input type="checkbox" checked={temp.stickers !== false} onChange={e => setTemp(t => ({ ...t, stickers: e.target.checked }))} />
            Print a sticker for every passed jersey (its bin, and the team or size) — the 1 × ½ in roll
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 16, color: "#cbd5e1", cursor: "pointer" }}>
            <input type="checkbox" checked={temp.flagTickets !== false} onChange={e => setTemp(t => ({ ...t, flagTickets: e.target.checked }))} />
            Print a flag ticket for every flagged jersey (where it goes and why) — the 2 × 1 in roll
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 16, color: "#cbd5e1", cursor: "pointer", marginTop: 8 }}>
            <input type="checkbox" checked={temp.binLists !== false} onChange={e => setTemp(t => ({ ...t, binLists: e.target.checked }))} />
            Print what is in a bin when it is closed (full, or the order finished), ten jerseys a label — the 2 × 1 in roll
          </label>
        </div>

        <div style={{ marginBottom: 18 }}>
          <div style={labelSt}>Packing</div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 16, color: "#cbd5e1", cursor: "pointer", marginBottom: 8 }}>
            <input type="checkbox" checked={!!temp.boxWeights} onChange={e => setTemp(t => ({ ...t, boxWeights: e.target.checked }))} />
            Estimate each bin's weight and warn near the limit (a guess from the sizes, until a scale is connected)
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 16, color: "#cbd5e1", opacity: temp.boxWeights ? 1 : 0.45 }}>
            No box heavier than
            <input type="number" min={10} max={70} value={temp.boxWeightCap ?? 45} onChange={e => setTemp(t => ({ ...t, boxWeightCap: Math.max(10, Math.min(70, Number(e.target.value) || 45)) }))} style={{ ...selSt, width: 76 }} />
            lb
          </label>
          <div style={{ fontSize: 14, color: "#7c8ba1", marginTop: 6 }}>Which box a bin goes in is learnt: every Bin full asks which box it went in, and all stations learn from the answers.</div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <div style={labelSt}>Input trial — which setup is this station trying?</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            {TRIAL_METHODS.map(m => (
              <button key={m.id} type="button" onClick={() => setTemp(t => ({ ...t, trialMethod: m.id }))} title={m.hint}
                style={{ ...btnGhost, padding: "8px 12px", fontSize: 15, borderColor: (temp.trialMethod || "") === m.id ? "#c084fc" : "#3f4b5c", background: (temp.trialMethod || "") === m.id ? "rgba(192,132,252,0.15)" : "transparent", color: (temp.trialMethod || "") === m.id ? "#e9d5ff" : "#cbd5e1", fontWeight: (temp.trialMethod || "") === m.id ? 700 : 400 }}>
                {m.label}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 14, color: "#7c8ba1", marginBottom: 8 }}>With a setup named, every decision on a result screen is timed (which screen, by click or by key, how many steps, how long) and kept in this browser across orders. Nothing goes to the board.</div>
          <button type="button" onClick={() => setShowTrial(true)} style={{ ...btnGhost, padding: "8px 14px", fontSize: 15 }}>📊 Compare the setups</button>
        </div>

        {problems.length > 0 && (
          <div style={{ fontSize: 15, color: "#f87171", marginBottom: 12, padding: "10px 14px", background: "rgba(239,68,68,0.08)", borderRadius: 6 }}>
            {problems.map(p => <div key={p}>{p}</div>)}
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button disabled={problems.length > 0} onClick={() => { onSave(temp); onClose(temp); }} style={{ ...btnPri, flex: 1, opacity: problems.length ? 0.5 : 1 }}>Save</button>
          <button onClick={onClose} style={btnGhost}>Cancel</button>
        </div>
      </div>
      {showTrial && <TrialPanel onClose={() => setShowTrial(false)} />}
    </div>
  );
}

// ── Input trial: the comparison ──────────────────────────────────────────────
// Per setup, what the records in this browser say: passes, screen time per
// pass, and the median by screen kind; the verdict in words; the CSV.
function TrialPanel({ onClose }) {
  const [records, setRecords] = useState(() => loadTrial());
  const sum = useMemo(() => summariseTrial(records), [records]);
  const verdict = useMemo(() => trialVerdict(sum), [sum]);
  const methods = TRIAL_METHODS.filter(m => m.id);
  useEffect(() => {
    const h = e => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, [onClose]);
  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([String.fromCharCode(0xfeff) + trialCSV(records)], { type: "text/csv;charset=utf-8" }));
    a.download = `input-trial_${localDateStamp()}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const wipe = () => { if (window.confirm(`Delete all ${records.length} trial records in this browser? Export first if anyone wants them.`)) { clearTrial(); setRecords([]); } };
  const td = { padding: "6px 10px", borderBottom: "1px solid #21262d", fontSize: 15, textAlign: "right", whiteSpace: "nowrap" };
  const th = { ...td, color: "#94a3b8", fontWeight: 600 };
  const secs = v => v == null ? "—" : `${v}s`;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 2300, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#161b22", borderRadius: 12, border: "1px solid #21262d", padding: 28, width: 900, maxWidth: "94vw", maxHeight: "92%", overflowY: "auto", boxSizing: "border-box" }}>
        <div style={{ fontWeight: 700, fontSize: 22, marginBottom: 4 }}>📊 Mouse + pedal against up/down keys + pedal</div>
        <div style={{ fontSize: 14, color: "#7c8ba1", marginBottom: 14 }}>{records.length} decisions recorded in this browser. Screen time runs from a screen appearing to the operator's choice on it; the scan trigger is shown but not counted, it is the pedal either way.</div>
        <div style={{ padding: "12px 16px", borderRadius: 8, background: "rgba(192,132,252,0.10)", border: "1px solid rgba(192,132,252,0.4)", color: "#e9d5ff", fontSize: 16, lineHeight: 1.45, marginBottom: 16 }}>{verdict}</div>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr><th style={{ ...th, textAlign: "left" }}></th>{methods.map(m => <th key={m.id} style={th} colSpan={2}>{m.label}</th>)}</tr>
            <tr><th style={{ ...th, textAlign: "left" }}>Screen</th>{methods.map(m => <Fragment key={m.id}><th style={th}>decisions</th><th style={th}>median</th></Fragment>)}</tr>
          </thead>
          <tbody>
            <tr style={{ fontWeight: 700 }}><td style={{ ...td, textAlign: "left" }}>Every screen · passes · screen time per pass</td>
              {methods.map(m => { const s = sum[m.id]; return <Fragment key={m.id}><td style={td}>{s.all.n} · {s.passes}</td><td style={td}>{secs(s.secondsPerPass)}</td></Fragment>; })}</tr>
            {SCREEN_KINDS.map(k => (
              <tr key={k.id}><td style={{ ...td, textAlign: "left", color: "#cbd5e1" }}>{k.label}</td>
                {methods.map(m => { const c = sum[m.id].byKind[k.id]; return <Fragment key={m.id}><td style={td}>{c.n || "—"}{c.n && c.movesPer ? <span style={{ color: "#94a3b8" }}> · {c.movesPer} steps</span> : null}{c.n && c.pointerShare ? <span style={{ color: "#94a3b8" }}> · {c.pointerShare}% click</span> : null}</td><td style={td}>{secs(c.medianS)}</td></Fragment>; })}</tr>
            ))}
            <tr><td style={{ ...td, textAlign: "left", color: "#94a3b8" }}>Orders · operators</td>{methods.map(m => <Fragment key={m.id}><td style={td} colSpan={2}>{sum[m.id].orders} · {sum[m.id].operators}</td></Fragment>)}</tr>
          </tbody>
        </table>
        <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
          <button onClick={download} disabled={!records.length} style={{ ...btnPri, opacity: records.length ? 1 : 0.5 }}>⬇ Export CSV</button>
          <button onClick={wipe} disabled={!records.length} style={{ ...btnGhost, borderColor: "#ef4444", color: "#f87171", opacity: records.length ? 1 : 0.5 }}>Delete the records</button>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={btnGhost}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ── Bin setup modal ───────────────────────────────────────────────────────────
// Opens when an order with bins starts. The button prints one bin label per
// bin on the hub's Zebra (on request only: the roll holds the per-jersey
// stickers, and a bin may not need a label at all); `autoPrint` would print
// them as the screen opens.
function BinSetupModal({ entries, by = "team", labels = [], autoPrint = false, onPrinted, onConfirm }) {
  const [print, setPrint] = useState({ status: autoPrint && labels.length ? "printing" : "idle" });
  const fired = useRef(false);
  const send = useCallback(() => hub.printLabels(labels, { kind: "binticket", station: stationId() })   // the 2 x 1 in roll, like the label of a bin opened when another was full
    .then(r => { setPrint({ status: "done", printer: r.printer, count: r.count }); onPrinted?.(); })
    .catch(e => setPrint(e.status === 503 ? { status: "none" } : { status: "error", message: e.status ? e.message : "could not reach the server" })), [labels, onPrinted]);
  const doPrint = () => { if (labels.length) { setPrint({ status: "printing" }); send(); } };
  useEffect(() => { if (autoPrint && labels.length && !fired.current) { fired.current = true; send(); } }, [autoPrint, labels.length, send]);   // the state already says "printing"
  const printLine = {
    idle:     "",
    printing: "🖨 Printing the bin labels…",
    done:     `🖨 Printed ${print.count} ${print.count === 1 ? "label" : "labels"} on ${print.printer}`,
    none:     "No label printer on the server — write the bin numbers by hand",
    error:    `Could not print the labels: ${print.message}`,
  }[print.status];
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 1500, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#161b22", borderRadius: 16, border: "2px solid #3b82f6", padding: 44, maxWidth: 680, width: "90vw", textAlign: "center", boxSizing: "border-box" }}>
        <div style={{ fontSize: 56, marginBottom: 12 }}>🗂️</div>
        <div style={{ fontSize: 36, fontWeight: 900, color: "#60a5fa", marginBottom: 8 }}>Prepare {entries.length} bins</div>
        <div style={{ fontSize: 19, color: "#cbd5e1", marginBottom: 26 }}>
          This order is sorted <strong style={{ color: "#e2e8f0" }}>by {by}</strong>: {entries.length} {by === "size" ? "sizes" : "teams"}. Label your bins before scanning:
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 30, maxHeight: 400, overflowY: "auto" }}>
          {entries.map(({ label, bin }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 18, padding: "14px 22px", borderRadius: 12, background: "#1e293b", border: "1px solid #3f4b5c" }}>
              <div style={{ fontFamily: FONT_DISPLAY, fontSize: 44, fontWeight: 900, color: "#60a5fa", minWidth: 120, textAlign: "center", lineHeight: 1 }}>Bin {bin}</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: "#e2e8f0", textAlign: "left" }}>{label}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
          <button onClick={onConfirm} style={{ padding: "16px 40px", borderRadius: 10, border: "none", background: "#3b82f6", color: "#fff", fontWeight: 700, fontSize: 21, cursor: "pointer" }}>
            Bins ready — start scanning
          </button>
          {labels.length > 0 && (
            <button onClick={doPrint} disabled={print.status === "printing"} title="Print one label per bin on the server's label printer"
              style={{ padding: "16px 28px", borderRadius: 10, border: "1px solid #475569", background: "#1e293b", color: "#e2e8f0", fontWeight: 700, fontSize: 19, cursor: print.status === "printing" ? "wait" : "pointer", opacity: print.status === "printing" ? 0.6 : 1 }}>
              🖨 Print bin labels
            </button>
          )}
        </div>
        {printLine && (
          <div style={{ marginTop: 16, fontSize: 17, fontWeight: 600, color: print.status === "done" ? "#4ade80" : print.status === "printing" ? "#94a3b8" : "#fbbf24" }}>{printLine}</div>
        )}
      </div>
    </div>
  );
}

// ── Bins: which one is full ──────────────────────────────────────────────────
// Every open bin with what is in it so far. "Bin full" closes it: its list
// prints (what is in it, ten jerseys a label), the team or size moves to a
// new bin number and that bin's label prints. Closed bins stay listed, with
// their list to print again.
const BOX_CHOICES = [...BOXES, { id: MORE, label: "More than one box" }];
function BinsModal({ open, closed, by = "team", cap = 45, status, onFull, onReprint, onClose }) {
  const [asking, setAsking] = useState(null);   // the bin whose box is being asked
  useEffect(() => {
    const h = e => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, [onClose]);
  const pcs = n => `${n} ${n === 1 ? "jersey" : "jerseys"}`;
  const rowSt = { display: "flex", alignItems: "center", gap: 16, padding: "12px 18px", borderRadius: 12, background: "#1e293b", border: "1px solid #3f4b5c" };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", zIndex: 1500, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#161b22", borderRadius: 16, border: "2px solid #3b82f6", padding: 32, maxWidth: 760, width: "92vw", maxHeight: "92%", overflowY: "auto", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 6 }}>
          <div style={{ fontSize: 32, fontWeight: 900, color: "#60a5fa" }}>📦 Bins</div>
          <div style={{ fontSize: 17, color: "#94a3b8" }}>{by === "all" ? "one bin for the whole order" : `sorted by ${by}`} — which bin is full?</div>
        </div>
        <div style={{ fontSize: 16, color: "#cbd5e1", marginBottom: 18 }}>
          A full bin is closed: the list of what is in it prints with the box to pack it in, and {by === "all" ? "the order" : `its ${by}`} carries on in a new bin, whose label prints too.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {open.map(b => (
            <div key={b.bin} style={{ ...rowSt, flexWrap: "wrap", borderColor: b.heavy >= 0.95 ? "#ef4444" : "#3f4b5c" }}>
              <div style={{ fontFamily: FONT_DISPLAY, fontSize: 40, fontWeight: 900, color: "#60a5fa", minWidth: 110, lineHeight: 1 }}>Bin {b.bin}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#e2e8f0", overflowWrap: "anywhere" }}>{b.label}</div>
                <div style={{ fontSize: 15, color: "#94a3b8" }}>{pcs(b.count)} in it{b.count > 0 && cap ? ` · about ${Math.round(b.weight)} lb of ${cap}` : ""}</div>
                {b.heavy >= 0.95 && <div style={{ fontSize: 15, fontWeight: 800, color: "#f87171" }}>At the weight limit — close it</div>}
              </div>
              {b.box && asking !== b.bin && <div title="The box this bin goes in if it is closed now" style={{ fontSize: 17, fontWeight: 800, color: "#fcd34d", whiteSpace: "nowrap" }}>→ {b.box}</div>}
              {asking === b.bin && (
                <div style={{ flexBasis: "100%" }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#fcd34d", marginBottom: 8 }}>Which box is Bin {b.bin} going in?</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {BOX_CHOICES.map(c => (
                      <button key={c.id} onClick={() => { setAsking(null); onFull(b.bin, c.id); }}
                        style={{ ...(c.id === b.boxId ? btnPri : btnGhost), fontSize: 17, padding: "12px 18px", ...(c.id === b.boxId ? { background: "#f59e0b", color: "#0d1117" } : {}) }}>
                        {c.label}{c.id === b.boxId ? " · suggested" : ""}
                      </button>
                    ))}
                    <button onClick={() => setAsking(null)} style={{ ...btnGhost, fontSize: 15, padding: "12px 16px", color: "#94a3b8" }}>Not full yet</button>
                  </div>
                </div>
              )}
              {asking !== b.bin && <button onClick={() => b.count <= 1 ? onFull(b.bin, null) : setAsking(b.bin)} disabled={b.count === 0} title={b.count === 0 ? "Nothing is in this bin yet" : "Close this bin, print its list and open a new bin"}
                style={{ ...btnPri, fontSize: 18, padding: "12px 22px", background: "#f59e0b", color: "#0d1117", opacity: b.count === 0 ? 0.4 : 1, cursor: b.count === 0 ? "not-allowed" : "pointer" }}>
                Bin full
              </button>}
            </div>
          ))}
        </div>
        {closed.length > 0 && (
          <>
            <div style={{ fontSize: 14, color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, margin: "20px 0 8px" }}>Closed</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {closed.map(c => (
                <div key={c.bin} style={{ ...rowSt, padding: "8px 18px", background: "transparent" }}>
                  <div style={{ fontFamily: FONT_DISPLAY, fontSize: 28, fontWeight: 900, color: "#7c8ba1", minWidth: 110, lineHeight: 1 }}>Bin {c.bin}</div>
                  <div style={{ flex: 1, fontSize: 17, color: "#cbd5e1" }}>{c.label} · {pcs(c.count)}{c.box ? <span style={{ color: "#fcd34d", fontWeight: 700 }}> → {c.box}</span> : null}</div>
                  <button onClick={() => onReprint(c.bin)} disabled={c.count === 0} title="Print this bin's list again" style={{ ...btnGhost, fontSize: 15, padding: "7px 14px", opacity: c.count === 0 ? 0.4 : 1 }}>🖨 Print list again</button>
                </div>
              ))}
            </div>
          </>
        )}
        {status && (
          <div style={{ marginTop: 18, fontSize: 17, fontWeight: 600, color: status.status === "done" ? "#4ade80" : status.status === "printing" ? "#94a3b8" : "#fbbf24" }}>
            {status.status === "printing" ? "🖨 Printing… " : "🖨 "}{status.text}
          </div>
        )}
        <div style={{ marginTop: 22, textAlign: "right" }}>
          <button onClick={onClose} style={{ ...btnGhost, fontSize: 17, padding: "12px 24px" }}>Close <Kbd light>Esc</Kbd></button>
        </div>
      </div>
    </div>
  );
}

// ── Roster complete modal ─────────────────────────────────────────────────────
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
          <div style={{ fontWeight: 900, fontSize: 26 }}>Scanned this order</div>
          <span style={{ color: "#94a3b8", fontSize: 15 }}>{rows.length} · latest first</span>
          <button onClick={onClose} style={{ ...btnGhost, marginLeft: "auto", padding: "6px 14px", fontSize: 14 }}>Close <Kbd light>Esc</Kbd></button>
        </div>
        <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
          {rows.length === 0 && <div style={{ color: "#94a3b8", padding: 24, textAlign: "center", fontSize: 17 }}>Nothing scanned yet.</div>}
          {rows.map(l => { const st = stateOf(l); return (
            <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 14px", borderRadius: 10, background: st === "flag" ? "rgba(239,68,68,0.08)" : "rgba(34,197,94,0.06)", border: "1px solid #21262d" }}>
              {l.thumb && <img src={l.thumb} alt="" style={{ width: 56, height: 42, objectFit: "cover", borderRadius: 4, flexShrink: 0 }} />}
              <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 28, lineHeight: 1 }}>#{l.match.number}{l.match.name ? ` · ${l.match.name}` : ""}</span>
              {l.match.size && <span style={{ fontFamily: FONT_DISPLAY, fontSize: 22, color: "#4ade80", fontWeight: 800 }}>{l.match.size}</span>}
              {binOf(l.match) !== null && <span style={{ fontFamily: FONT_DISPLAY, fontSize: 22, color: "#60a5fa", fontWeight: 800 }}>Bin {binOf(l.match)}</span>}
              <span style={{ marginLeft: "auto", fontSize: 14, color: "#7c8ba1", whiteSpace: "nowrap" }}>{l.timestamp}</span>
              {st === "flag"
                ? <Pill color="#ef4444">Flagged</Pill>
                : st === "pass" || st === "manual"
                  ? <button onClick={() => onFlag(l)} style={{ ...btnGhost, padding: "5px 12px", fontSize: 14, borderColor: "#ef4444", color: "#fca5a5", whiteSpace: "nowrap" }}>🚩 Flag it</button>
                  : <span style={{ fontSize: 14, color: "#7c8ba1" }}>Open</span>}
            </div>
          ); })}
        </div>
      </div>
    </div>
  );
}

// ── Finish order: one look at where it stands, then confirm ─────────────────
// Confirm clears the order and the station goes back to "waiting for an
// order"; the hub keeps the order's record and sheets. Keep going closes it.
function FinishOrderModal({ orderNumber, roster, offRosterFlags = 0, scans = 0, binLists = 0, bins = [], onConfirm, onCancel }) {
  const count = s => roster.filter(r => r.scanned === s).length;
  const remaining = roster.filter(r => !r.scanned).length;
  const open = count("flag") + offRosterFlags + count("manual") + count("missing") + count("short");
  useEffect(() => {
    const h = e => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onCancel(); } if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); onConfirm(); } };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, [onConfirm, onCancel]);
  const stats = [
    { label: "Passed",    value: count("pass"), color: "#22c55e" },
    { label: "Open",      value: open,          color: open ? "#ef4444" : "#64748b" },
    { label: "Not scanned", value: remaining,   color: remaining ? "#f59e0b" : "#64748b" },
  ];
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 1600, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#161b22", borderRadius: 16, border: `2px solid ${remaining ? "#f59e0b" : "#22c55e"}`, padding: 44, maxWidth: 640, width: "90vw", textAlign: "center", boxSizing: "border-box" }}>
        <div style={{ fontSize: 56, marginBottom: 10 }}>🏁</div>
        <div style={{ fontSize: 36, fontWeight: 900, color: "#e2e8f0", marginBottom: 10 }}>Finish order {orderNumber || "—"}?</div>
        <div style={{ fontSize: 18, color: "#cbd5e1", marginBottom: 22, lineHeight: 1.4 }}>
          {remaining
            ? `${remaining} ${remaining === 1 ? "jersey is" : "jerseys are"} not scanned yet. Finish anyway and the station goes back to waiting for an order; the supervisor keeps this order's record and sheets.`
            : "Every jersey is scanned. The station goes back to waiting for an order; the supervisor keeps this order's record and sheets."}
          {scans === 0 ? " Nothing was scanned on it." : ""}
          {binLists > 0 ? ` Every open bin is closed and its list prints: ${binLists} ${binLists === 1 ? "label" : "labels"}.` : ""}
        </div>
        {bins.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 22, maxHeight: "22cqh", overflowY: "auto", textAlign: "left", fontSize: 17, color: "#cbd5e1" }}>
            {bins.map(b => (
              <div key={b.bin} style={{ display: "flex", gap: 12, padding: "5px 14px", borderRadius: 8, background: "#1e293b" }}>
                <span style={{ fontWeight: 800, color: "#60a5fa", minWidth: 62 }}>Bin {b.bin}</span>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.label} · {b.count} {b.count === 1 ? "jersey" : "jerseys"}</span>
                <span style={{ fontWeight: 800, color: "#fcd34d", whiteSpace: "nowrap" }}>{b.open ? "" : "closed · "}{b.box}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "center", gap: 28, marginBottom: 30 }}>
          {stats.map(s => (
            <div key={s.label}>
              <div style={{ fontFamily: FONT_DISPLAY, fontSize: 52, fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 15, color: "#94a3b8", marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <button onClick={onConfirm} style={{ ...btnPri, fontSize: 19, padding: "14px 32px", background: remaining ? "#f59e0b" : "#22c55e", color: "#0d1117" }}>✓ Finish order <Kbd>Enter</Kbd></button>
          <button onClick={onCancel} style={{ ...btnGhost, fontSize: 17, padding: "14px 22px" }}>← Keep going <Kbd light>Esc</Kbd></button>
        </div>
      </div>
    </div>
  );
}

function RosterCompleteModal({ roster, offRosterFlags = 0, canExport = true, onExport, onDismiss, onFinish }) {
  const count = s => roster.filter(r => r.scanned === s).length;
  const stats = [
    { label: "Passed",        value: count("pass"),    color: "#22c55e" },
    { label: "By hand",       value: count("manual"),  color: "#f59e0b" },
    { label: "With supervisor", value: count("flag") + offRosterFlags,  color: "#ef4444" },
    { label: "Missing",       value: count("missing"), color: "#f59e0b" },
  ].filter(s => s.value > 0 || s.label === "Passed");
  const open = count("flag") + offRosterFlags + count("manual") + count("missing") + count("short");
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 1600, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#161b22", borderRadius: 16, border: `2px solid ${open ? "#f59e0b" : "#22c55e"}`, padding: 44, maxWidth: 640, width: "90vw", textAlign: "center", boxSizing: "border-box" }}>
        <div style={{ fontSize: 64, marginBottom: 12 }}>{open ? "📋" : "🎉"}</div>
        <div style={{ fontSize: 36, fontWeight: 900, color: open ? "#f59e0b" : "#22c55e", marginBottom: 10 }}>{open ? "Every jersey accounted for" : "Order complete"}</div>
        <div style={{ fontSize: 18, color: "#cbd5e1", marginBottom: 8, lineHeight: 1.4 }}>
          {open ? `${open} still open — with the supervisor, entered by hand, or missing. The box stays open until they are signed off or come back.` : `All ${roster.length} jerseys passed.`}
        </div>
        {canExport && <div style={{ fontSize: 16, color: "#94a3b8", marginBottom: 26 }}>Review the roster before exporting.</div>}
        <div style={{ display: "flex", justifyContent: "center", gap: 22, marginBottom: 28, flexWrap: "wrap" }}>
          {stats.map(s => (
            <div key={s.label}>
              <div style={{ fontFamily: FONT_DISPLAY, fontSize: 52, fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 15, color: "#94a3b8", marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          {canExport && <button onClick={onExport}  style={{ ...btnPri, fontSize: 19, padding: "14px 32px", background: "#22c55e" }}>⬇ Export to Excel</button>}
          <button onClick={onDismiss} style={canExport ? { ...btnGhost, fontSize: 17, padding: "14px 22px" } : { ...btnPri, fontSize: 19, padding: "14px 32px" }}>{canExport ? "Review first" : "✓ Done"}</button>
          {onFinish && <button onClick={onFinish} title="Close this order and go back to waiting for the next" style={{ ...btnGhost, fontSize: 17, padding: "14px 22px", borderColor: "#22c55e", color: "#4ade80" }}>🏁 Finish order</button>}
        </div>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
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

  const [settings, setSettings] = useState(() => ({ ...DEFAULT_SETTINGS, ...(loadSettings() || {}) }));
  useEffect(() => { gateRef.current.setGrace(Math.round((Number(settings.autoScanDelay) || 0) * 5)); }, [settings.autoScanDelay]);   // 200 ms ticks
  const { scanKey, confirmKey, cancelKey, upKey, retryKey, byHandKey } = settings;

  const [savedSession]  = useState(() => { const s = loadSession(); return s && s.sessionStarted && Array.isArray(s.roster) && s.roster.length ? s : null; });
  const [resumeDecided, setResumeDecided] = useState(false);

  const [savedSignIn]   = useState(() => loadSignIn());      // who is at this station outlives any one order
  const [signedIn,           setSignedIn]           = useState(() => !!savedSignIn);
  const [sessionStarted,     setSessionStarted]     = useState(false);
  const [role,               setRole]               = useState(() => savedSignIn?.role || "");
  const [roster,             setRoster]             = useState([]);
  const [rosterFile,         setRosterFile]         = useState(null);
  const [orderNumber,        setOrderNumber]        = useState("");
  const [orderRun,           setOrderRun]           = useState(0);      // when this order was started here; the hub keeps one record per run
  const [hubRosterId,        setHubRosterId]        = useState(null);   // the hub roster this order came from, taken by this station; Finish order removes it
  const [operatorName,       setOperatorName]       = useState(() => savedSignIn?.name || "");
  const [notes,              setNotes]              = useState("");
  const [jerseyType,         setJerseyType]         = useState("");   // echl | echl_replica | sublimated | "" 
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
  const [handsFreePaused, setHandsFreePaused] = useState(false);   // operator paused hands-free; camera stays on, B still scans
  // Self-check: after the app is corrected, the next 5 jerseys are read twice
  // and must agree before a green (src/lib/vigilance.js). checksLeft mirrors
  // the counter for the badge and the saved session.
  const vigilRef = useRef(createVigilance({ log: m => console.log(m) }));
  const [checksLeft, setChecksLeft] = useState(0);
  const [noJersey, setNoJersey] = useState("");      // a B press that read nothing: a quiet notice for a moment, no screen
  const [retried, setRetried] = useState(null);      // the last read dropped by Retry: { number, name }, shown until the next scan so a retry never passes for a pass
  const noJerseyTimer = useRef(null);
  const noteMistake = useCallback(kind => { vigilRef.current.noteMistake(kind); setChecksLeft(vigilRef.current.remaining); }, []);
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
  // The result screen always takes the right half and the camera stays where
  // it is, whatever the screen size: one layout to learn, on every PC.
  const wide = true;
  const [showBinSetup,       setShowBinSetup]       = useState(false);
  // A supervisor's sign-in is the board and nothing else: no station, no scanning, no saved order to resume.
  const [showSupervisor,     setShowSupervisor]     = useState(() => savedSignIn?.role === "supervisor" || savedSignIn?.role === "admin");
  const [binMap,             setBinMap]             = useState(null);
  const [firstScanTime,      setFirstScanTime]      = useState(null);
  const [now,                setNow]                = useState(() => Date.now());

  // Bins closed as full: [{ bin, key, label, ids, closedAt }] (roster.js). The
  // bin map only says which bin is open for a team or size; a done row in a
  // closed bin stays in it.
  const [closedBins,         setClosedBins]         = useState([]);
  const [showBins,           setShowBins]           = useState(false);
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
  useEffect(() => {
    if (!signedIn) return;
    hub.boxModel().then(r => { if (r?.model?.units && r.model.caps) { setBoxModel({ ...BOX_PRIOR, ...r.model }); try { localStorage.setItem("jerseyqc.boxmodel", JSON.stringify(r.model)); } catch { /* private window */ } } }).catch(() => {});
  }, [signedIn, sessionStarted]);
  // The weight is the operator's call until a scale is connected to the station
  // (owner, 11 Nov 2026): with `boxWeights` off there is no cap, no lb and no warning.
  const boxCap     = settings.boxWeights ? Number(settings.boxWeightCap) || BOX_PRIOR.weightCap : 0;
  const stitched   = jerseyTypeOf(jerseyType)?.construction !== "sublimated";   // no type set: the heavier guess
  const boxOf      = useCallback(rows => predictBox(binCounts(rows, stitched), { ...boxModel, weightCap: boxCap || Infinity }), [boxModel, boxCap, stitched]);
  const openBins   = useMemo(() => binEntries(roster, binMap).map(e => { const rows = binContents(roster, binMap, closedBins, e.bin), b = boxOf(rows); return { ...e, count: rows.length, box: b?.label || "", boxId: b?.id || "", weight: b?.weight || 0, heavy: b?.heavy || 0, open: true }; }), [roster, binMap, closedBins, boxOf]);
  const closedList = useMemo(() => closedBins.map(c => { const rows = binContents(roster, binMap, closedBins, c.bin), b = boxOf(rows); return { bin: c.bin, label: c.label, count: rows.length, box: c.box || b?.label || "", weight: b?.weight || 0, open: false, closedAt: c.closedAt }; }), [roster, binMap, closedBins, boxOf]);
  const heavyBin   = openBins.find(b => b.heavy >= 0.95) || null;   // an open bin at the weight limit
  const binSummary = useMemo(() => [...closedList, ...openBins].sort((a, b) => a.bin - b.bin), [closedList, openBins]);

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
  const ticketPrinted = useRef(0);                 // the log id of the last flag sent to the printer
  const printTicket = useCallback(entry => {
    if (!entry) return Promise.resolve();
    const label = flagLabel(entry, binMap, { orderNumber, station: stationId(), tag: severityOf(entry.reason).tag });
    return hub.printLabels([label], { kind: "flag", station: stationId() })
      .then(r => setTicket({ id: entry.id, status: "done", printer: r.printer }))
      .catch(e => setTicket({ id: entry.id, status: e.status === 503 ? "none" : "error", message: e.status ? e.message : "could not reach the server" }));
  }, [binMap, orderNumber]);
  const newestEntry = log[0];
  useEffect(() => {
    if (!settings.flagTickets || !newestEntry || newestEntry.status !== S_FLAGGED || ticketPrinted.current === newestEntry.id) return;
    ticketPrinted.current = newestEntry.id;
    printTicket(newestEntry);
  }, [newestEntry, settings.flagTickets, printTicket]);
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
  const armRef     = useRef(() => {});   // re-arm hands-free from inside a scan (set once armAutoScan exists)
  const passCount      = roster.filter(r => r.scanned === "pass").length;
  const offRosterFlags = log.filter(l => l.status === S_FLAGGED && l.match?.offRoster && !l.resolution).length;   // typed jerseys that are not on the roster have no row
  const flagCount      = roster.filter(r => r.scanned === "flag").length + offRosterFlags;
  const manualCount    = roster.filter(r => r.scanned === "manual").length;
  const teamNames      = useMemo(() => [...new Set(roster.map(r => r.team).filter(Boolean))], [roster]);
  const canSupervise   = role === "supervisor" || role === "admin";
  const openCount      = roster.filter(r => r.scanned === "flag" || r.scanned === "missing" || r.scanned === "short").length;
  const rosterComplete = roster.length > 0 && remaining === 0;
  // The roster table: the header pill's status, then the size and team filters, in the chosen order.
  const shownRows = useMemo(() => sortRoster(roster.filter(r => (!rosterFilter || r.scanned === rosterFilter) && (!sizeFilter || String(r.size ?? "").trim() === sizeFilter) && (!teamFilter || String(r.team ?? "").trim() === teamFilter)), rosterSort, binMap, { doneFirst }), [roster, rosterFilter, sizeFilter, teamFilter, rosterSort, binMap, doneFirst]);
  // Rate and time left from working time (src/lib/pace.js): a night with the
  // order left open on screen is not working time, so a resumed order does not
  // come back with an ETA in the thousands.
  const { etaMin }     = useMemo(() => pace(log, passCount, remaining, now, { start: firstScanTime }), [log, passCount, remaining, now, firstScanTime]);
  const rosterCols     = useMemo(() => displayColumns(roster), [roster]);
  // The same columns as one array for the whole order, so a pass (a new
  // roster array) does not rebuild every row of the table.
  const rosterColsKey  = rosterCols.join("\u0001");
  const rosterColsStable = useMemo(() => (rosterColsKey ? rosterColsKey.split("\u0001") : []), [rosterColsKey]);
  const extraCols      = useMemo(() => extraColumns(roster), [roster]);
  const keyLabel       = formatKey(scanKey);
  const showResume     = !!savedSession && !resumeDecided && !sessionStarted && !canSupervise;

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  useEffect(() => { saveSettings(settings); }, [settings]);

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
    const saved = saveSession({ sessionStarted, role, roster, rosterFile, orderNumber, orderRun, hubRosterId, operatorName, notes, jerseyType, log, binMap, closedBins, firstScanTime, idleSpells, awaySpells, vigil: vigilRef.current.state(), inspect: inspectRef.current.state() });
    const t = setTimeout(() => setSaveOk(prev => (prev === saved ? prev : saved)), 0);   // said in the header when it fails
    return () => clearTimeout(t);
  }, [sessionStarted, role, roster, rosterFile, orderNumber, orderRun, hubRosterId, operatorName, notes, jerseyType, log, binMap, closedBins, firstScanTime, idleSpells, awaySpells, checksLeft, inspect]);

  useEffect(() => {
    if (!sessionStarted || log.length === 0) return;
    const h = e => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [sessionStarted, log.length]);

  // Report to the hub (if one is running) so a supervisor can see this station —
  // from sign-in on, so a station waiting for its first order is already on the
  // board and can be sent one. Supervisors on their own screen do not report.
  useEffect(() => {
    if (!signedIn || (role === "supervisor" && !sessionStarted)) return;
    const id = stationId();
    const send = () => hub.report(id, snapshotOf({ operatorName, role, orderNumber: sessionStarted ? orderNumber : "", orderRun: sessionStarted ? orderRun : 0, notes, jerseyType, rosterFile: sessionStarted ? rosterFile : null, roster: sessionStarted ? roster : [], log: sessionStarted ? log : [], lastConfirmed: sessionStarted ? lastConfirmed : null, binMap, closedBins: sessionStarted ? closedBins : [], binSummary: sessionStarted ? binSummary : [], idleSpells, awaySpells }))
      .then(r => {
        setHubOk(true);
        // The supervisor named this order from the board: take the number; the next report confirms it.
        if (sessionStarted && r?.setOrder?.orderNumber && r.setOrder.orderNumber !== orderNumber) { setOrderNumber(r.setOrder.orderNumber); setOrderSetBy(r.setOrder); }
      })
      .catch(() => setHubOk(false));
    send();
    const t = setInterval(send, 5000);
    return () => clearInterval(t);
  }, [signedIn, sessionStarted, operatorName, role, orderNumber, orderRun, notes, jerseyType, rosterFile, roster, log, lastConfirmed, binMap, closedBins, binSummary, idleSpells, awaySpells]);

  // Open the complete modal once every row is accounted for (after at least one scan).
  useEffect(() => {
    if (!(roster.length > 0 && remaining === 0 && firstScanTime)) return;
    const t = setTimeout(() => setShowRosterComplete(true), 0);
    return () => clearTimeout(t);
  }, [remaining, roster.length, firstScanTime]);

  // ── Session lifecycle ─────────────────────────────────────────────────────
  const applyRoster = useCallback((parsed, fileName, { keepLog = false, binBy = "team" } = {}) => {
    rosterVersion.current++;
    setRoster(parsed.map(r => ({ ...r, scanned: false })));
    setRosterFile(fileName);
    if (!keepLog) { setLog([]); setLastResult(null); setLastConfirmed(null); setFirstScanTime(null); setIdleSpells([]); setAwaySpells([]); inspectRef.current.reset(); syncInspect(); }
    setThumb(null); setOverlay(null); setShowRosterComplete(false);
    // Every order has a bin, as packing boxes by the bin: one team or size, or
    // an order that is not sorted, is Bin 1. The bin screen only shows when
    // there is more than one to set out.
    const bins = buildBinMap(parsed, {}, binBy);
    setClosedBins([]); setBinPrint(null);   // every roster row starts unscanned: no bin is closed
    setBinMap(binCount(bins) > 0 ? bins : null); setShowBinSetup(binCount(bins) > 1);
  }, [syncInspect]);

  // The order belongs to the station, not to a person: whoever is signed in
  // here now continues it under their own name.
  const resumeSession = useCallback(() => {
    const s = savedSession;
    setRoster(s.roster); setRosterFile(s.rosterFile || null);
    setOrderNumber(s.orderNumber || ""); setOrderRun(s.orderRun || s.savedAt || 0); setHubRosterId(s.hubRosterId || null); setNotes(s.notes || ""); setJerseyType(s.jerseyType || "");
    setLog(s.log || []); setBinMap(s.binMap || null); setClosedBins(s.closedBins || []); setFirstScanTime(s.firstScanTime || null); setIdleSpells(s.idleSpells || []); setAwaySpells(s.awaySpells || []);
    ticketPrinted.current = (s.log || [])[0]?.id ?? 0;             // its last flag's ticket was printed when it happened
    vigilRef.current.load(s.vigil); setChecksLeft(vigilRef.current.remaining);
    inspectRef.current.load(s.inspect); syncInspect();
    setSessionStarted(true); setResumeDecided(true);
  }, [savedSession, syncInspect]);

  const discardSession = useCallback(() => { clearSession(); setResumeDecided(true); }, []);

  // Clears the order; the operator stays signed in and goes straight to order setup.
  // The camera pane unmounts with the roster, so the stream must be released too.
  const resetOrder = useCallback(() => {
    clearSession();
    streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null;   // stopCamera is declared below
    gateRef.current.disarm(); setArmed(false); setCameraOn(false);
    rosterVersion.current++;
    setSessionStarted(false); setResumeDecided(true);
    setRoster([]); setRosterFile(null); setOrderNumber(""); setOrderRun(0); setHubRosterId(null); setNotes(""); setLog([]); setBinMap(null); setClosedBins([]); setBinPrint(null); setShowBins(false); setFirstScanTime(null); setIdleSpells([]); setAwaySpells([]); setNewRosters([]); setOrderSetBy(null); setHandsFreePaused(false);
    setLastResult(null); setLastConfirmed(null); setOverlay(null); setThumb(null); setShowRosterComplete(false); setRetried(null);
  }, []);

  // Finish order: the confirm screen, then back to waiting for an order.
  // ── Bins: full, closed, listed ─────────────────────────────────────────────
  // The 2 x 1 in roll takes at most 100 labels a request: send them in turn.
  const printOnTicketRoll = useCallback((labels, kind) => {
    const chunks = [];
    for (let i = 0; i < labels.length; i += 100) chunks.push(labels.slice(i, i + 100));
    return chunks.reduce((p, c) => p.then(() => hub.printLabels(c, { kind, station: stationId() })), Promise.resolve(null));
  }, []);
  const printProblem = e => e.status === 503 ? "No label printer for this station" : `Not printed: ${e.status ? e.message : "could not reach the server"}`;
  // What Finish order prints: the list of every bin still open with something in it.
  const finishLists = useMemo(() => !settings.binLists || !binMap ? []
    : openBins.filter(b => b.count > 0).flatMap(b => binListLabels(binContents(roster, binMap, closedBins, b.bin), { bin: b.bin, label: b.label, orderNumber, box: b.box })),
  [settings.binLists, binMap, openBins, roster, closedBins, orderNumber]);
  // `boxId`: the box the operator said the bin is going in (null for a
  // one-piece bin: a bag). It goes on the list, is kept with the closed bin,
  // and is the answer the box model learns from.
  const binFull = useCallback((bin, boxId = null) => {
    const r = closeBin(roster, binMap, closedBins, bin); if (!r) return;
    const rows = binContents(roster, r.binMap, r.closed, bin), guess = boxOf(rows);
    const box  = BOX_CHOICES.find(c => c.id === boxId)?.label || guess?.label || "";
    setBinMap(r.binMap); setClosedBins(r.closed.map(c => c === r.entry ? { ...c, box } : c));
    if (boxId && rows.length > 1) hub.boxAnswer({ counts: binCounts(rows, stitched), box: boxId, suggested: guess?.id || "", station: stationId(), order: String(orderNumber || ""), bin })
      .then(res => { if (res?.model) { setBoxModel(res.model); try { localStorage.setItem("jerseyqc.boxmodel", JSON.stringify(res.model)); } catch { /* private window */ } } })
      .catch(() => {});   // the hub is away: the bin is closed all the same, this one answer is not learnt
    const lists = binListLabels(rows, { bin, label: r.entry.label, orderNumber, box });
    const what  = `Bin ${bin} closed with ${r.entry.ids.length} ${r.entry.ids.length === 1 ? "jersey" : "jerseys"}${box ? ` — ${box.toUpperCase()}` : ""}. ${r.entry.label} now goes in Bin ${r.newBin}`;
    if (!settings.binLists) { setBinPrint({ status: "off", text: `${what}. Bin lists are switched off in Settings.` }); return; }
    setBinPrint({ status: "printing", text: what });
    printOnTicketRoll(lists, "binlist")
      .then(() => hub.printLabels([{ bin: r.newBin, label: r.entry.label, by: binFieldOf(r.binMap), count: 0, orderNumber: String(orderNumber || "") }], { kind: "binticket", station: stationId() }))
      .then(res => setBinPrint({ status: "done", text: `${what}. Printed ${lists.length} list ${lists.length === 1 ? "label" : "labels"} and the Bin ${r.newBin} label on ${res.printer}` }))
      .catch(e => setBinPrint({ status: "error", text: `${what}. ${printProblem(e)}` }));
  }, [roster, binMap, closedBins, orderNumber, settings.binLists, printOnTicketRoll, boxOf, stitched]);
  const reprintBinList = useCallback(bin => {
    const c = closedBins.find(x => x.bin === bin); if (!c) return;
    const rows  = binContents(roster, binMap, closedBins, bin);
    const lists = binListLabels(rows, { bin, label: c.label, orderNumber, box: c.box || boxOf(rows)?.label || "" });
    if (!lists.length) return;
    setBinPrint({ status: "printing", text: `Bin ${bin} list` });
    printOnTicketRoll(lists, "binlist")
      .then(res => setBinPrint({ status: "done", text: `Bin ${bin} list printed again: ${lists.length} ${lists.length === 1 ? "label" : "labels"} on ${res.printer}` }))
      .catch(e => setBinPrint({ status: "error", text: `Bin ${bin} list. ${printProblem(e)}` }));
  }, [roster, binMap, closedBins, orderNumber, printOnTicketRoll, boxOf]);

  const [showFinish, setShowFinish] = useState(false);
  const [finishing,  setFinishing]  = useState(false);   // Finish order is printing the bin lists
  const askFinish    = useCallback(() => { setShowRosterComplete(false); setShowFinish(true); }, []);
  const finishOrder  = useCallback(() => {
    setShowFinish(false);
    const done = () => {
      if (hubRosterId) hub.removeRoster(hubRosterId).catch(() => {});   // the hub keeps the order's record and sheets in its ledger
      resetOrder();
    };
    if (!finishLists.length) { done(); return; }
    // The order is finished: every bin still open is closed, and its list
    // prints. The order is cleared only once the lists are out, because after
    // that nothing here can print them again; if they fail the operator
    // chooses: finish without them, or keep the order open and try again.
    setFinishing(true);
    printOnTicketRoll(finishLists, "binlist")
      .then(() => { setFinishing(false); done(); })
      .catch(e => {
        setFinishing(false);
        const why = e.status === 503 ? "no label printer for this station" : e.status ? e.message : "could not reach the server";
        if (window.confirm(`The bin lists were NOT all printed: ${why}.\n\nOK = finish the order anyway, without the lists.\nCancel = keep the order open, fix the printer and press Finish order again.`)) done();
      });
  }, [resetOrder, hubRosterId, finishLists, printOnTicketRoll]);

  // Sign out leaves the station, not the order: an unfinished order stays saved
  // on this PC and is offered to the next person who signs in here (a mistaken
  // Sign out mid-order used to wipe it). The page reloads so nothing of the
  // previous operator lingers in memory.
  const signOut = useCallback(() => {
    if (sessionStarted && log.length > 0 && !window.confirm(`Sign out? Order ${orderNumber || "—"} stays on this station — the next person to sign in here can resume it.`)) return;
    clearSignIn();
    hub.removeStation(stationId()).catch(() => {});   // free the station on the board at once, not after it goes stale
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
    const version = rosterVersion.current;
    if (!firstScanTime) setFirstScanTime(Date.now());
    gateRef.current.disarm(); setArmed(false);
    setScanning(true); setRetried(null);
    setThumb(dataUrl);
    playTone("scan");

    const readOne = async (b64, url) => {
      // Send a smaller frame than the camera gives: same read, faster answer.
      const sendB64 = await frameForUpload(url, SEND_MAX_PX).catch(() => b64);
      const t0 = Date.now();
      const r = await readJersey({ base64: sendB64, apiKey: CLAUDE_API_KEY, model: MODEL, effort: EFFORT, thinking: THINKING, orderNumbers: roster.filter(x => !isDone(x)).map(x => x.number) });
      console.log(`Read in ${Date.now() - t0} ms: #${r.number}${r.number_complete ? "" : "?"} ${r.name}${r.name_complete ? "" : "…"}${r.laid_flat ? "" : " [not flat]"} (${r.jersey_colour || "?"}${r.trim_colour ? "/" + r.trim_colour : ""}; sleeves: ${r.sleeve_numbers.join(",") || "—"}; number ${r.number_position || "?"}${r.obstruction ? "; " + r.obstruction : ""}) — tokens in ${r.usage?.input_tokens}, out ${r.usage?.output_tokens}`);
      return r;
    };
    const matchOf = d => (!d.name && !d.number) ? null : findMatches(roster, d.name, d.number, {
      nameComplete: d.name_complete, numberComplete: d.number_complete,
      position: d.number_position, obstruction: d.obstruction,
      colour: d.jersey_colour, trim: d.trim_colour, laidFlat: d.laid_flat, orientation: d.orientation,
    });

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
      if (uprightRotation(detected.orientation) && turnMatters(detected, roster) && version === rosterVersion.current) {
        let frame = dataUrl, total = 0, d2 = detected;
        for (let i = 0; i < 3 && uprightRotation(d2.orientation); i++) {
          const turn = uprightRotation(d2.orientation); total = (total + turn) % 360;
          const turned = await rotateDataUrl(frame, turn); if (!turned) break;
          console.log(`[upright] #${d2.number} on a jersey that is ${d2.orientation} — turning the frame ${turn}° and reading again`);
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
      if (vigilRef.current.active && detected.jersey_present !== false && version === rosterVersion.current) {
        const again = recapture ? recapture() : null;
        console.log(`[self-check] ${vigilRef.current.remaining} to go — reading ${again ? "a second frame" : "the frame again"}`);
        const d2 = await readOne(again?.base64 || base64, again?.dataUrl || dataUrl);
        const r = reconcile(detected, m, d2, matchOf(d2));
        check = { agreed: r.agreed, second: d2 };
        if (!r.agreed) console.log("[self-check] the two reads disagree — asking the operator");
        m = r.match;
        if (r.agreed && again) { detected = d2; dataUrl = again.dataUrl; }
      }
      // Second look, off by default: a doubtful first read used to be re-shot
      // 0.7 s later before anything showed, which turned a 1.5 s yellow into a
      // 4 s one. The operator can say "scan" or press R instead.
      if (SECOND_LOOK && recapture && (m === null || m.soft) && version === rosterVersion.current) {
        await new Promise(r => setTimeout(r, 700));
        const again = recapture();
        if (again) {
          console.log("[second look] first read was doubtful — reading a fresh frame");
          const d2 = await readOne(again.base64, again.dataUrl);
          const m2 = matchOf(d2);
          if (m2 && (m2.type === "exact" || m2.type === "duplicate" || !m2.soft || m === null)) { detected = d2; m = m2; dataUrl = again.dataUrl; }
        }
      }
    } catch (e) {
      apiError = e.message;
    }

    if (version !== rosterVersion.current) { setScanning(false); return; }   // roster changed mid-flight
    setScanning(false);
    setThumb(dataUrl);
    const smallThumb = await shrinkDataUrl(dataUrl);
    // The photo a flag will carry to the supervisor: the frame cropped to the jersey.
    const photo = await cropDataUrl(dataUrl, detected.jersey_box, 640);
    // `shown` remembers what the app first put on the screen for this jersey,
    // so a correction later can be told apart from the operator answering a
    // question: a green overridden is a mistake, a pick from a list is not.
    const scanObj  = { id: Date.now(), detected, thumb: dataUrl, smallThumb, photo, check, shown: null };
    const showFlag = (reason, title) => { scanObj.shown = { mode: "flag" }; setOverlay({ mode: "flag", scan: scanObj, reason, title }); playTone("flag"); };

    if (apiError) { showFlag("API error: " + apiError, "SCAN FAILED"); return; }
    // The camera looked at an empty table. Hands-free (the jersey was lifted,
    // nothing put down yet): remember what the table looks like so the gate
    // waits through it, arm again, say nothing. A B press: the same, plus a
    // quiet "No jersey in view" for a moment. Never a red screen, never a
    // form, nothing in the log — there is no jersey to enter.
    // Nothing readable at all — an empty table, or fabric and hands with no
    // name or number in view. Either way there is nothing to enter, so never a
    // red screen: an empty table is learned for hands-free, a B press gets a
    // quiet notice for a moment, and the gate re-arms. Nothing in the log.
    if (detected.jersey_present === false || (!String(detected.number || "").trim() && !String(detected.name || "").trim())) {
      const empty = detected.jersey_present === false;
      console.log(`[${auto ? "hands-free" : "scan"}] ${empty ? "nothing on the table — learned it" : "no name or number in view"} — waiting for a jersey`);
      if (empty) gateRef.current.learnTable(lastScanFrameRef.current);
      if (!auto) { setNoJersey(empty ? "No jersey in view" : "No name or number in view"); clearTimeout(noJerseyTimer.current); noJerseyTimer.current = setTimeout(() => setNoJersey(""), 2200); }
      armRef.current();
      return;
    }
    // A jersey reached the screen: one of the owed checks is spent on it.
    if (vigilRef.current.scanDone()) setChecksLeft(vigilRef.current.remaining);
    if (m === null) { showFlag("No name or number could be read.", "COULD NOT READ"); return; }

    if (m.type === "exact")          { scanObj.shown = { mode: "confirm", id: m.match._id }; setOverlay({ mode: "confirm", scan: scanObj, match: m.match }); }
    else if (m.type === "duplicate") { scanObj.shown = { mode: "duplicate", id: m.match._id }; setOverlay({ mode: "duplicate", scan: scanObj, match: m.match, reason: `#${m.match.number}${m.match.name ? " · " + m.match.name : ""}${m.match.size ? " · " + m.match.size : ""}${m.match.scanned === "flag" ? " is flagged — with the supervisor." : " already passed this session."}` }); playTone("flag"); }
    else if (m.type === "pick" || m.type === "close") { scanObj.shown = { mode: m.type, ids: m.candidates.map(c => c._id) }; setOverlay({ mode: m.type, scan: scanObj, candidates: m.candidates, reason: m.reason }); }
    else showFlag(`"${detected.name || "?"}" #${detected.number || "?"} is not on this roster.${m.reason ? ` Camera: ${m.reason}.` : ""}`, "NOT FOUND");
  }, [roster, firstScanTime]);

  // ── Camera scan trigger ───────────────────────────────────────────────────
  // The current camera frame as { base64, dataUrl }, rotated as the settings
  // say; null when the camera is not live. Used for the scan and for the
  // second look.
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

  const doTriggerScan = useCallback((opts = {}) => {
    if (!videoRef.current || !canvasRef.current || scanning || !cameraOn || roster.length === 0 || inputMode !== "camera") return;
    const video = videoRef.current;
    if (!video.videoWidth) { setError("Camera is still starting — try again in a second."); return; }
    // A dead track leaves the last frame frozen on screen; never scan that.
    const track = streamRef.current?.getVideoTracks?.()[0];
    if (!track || track.readyState !== "live") { setError("Camera disconnected — check the USB cable, then press Start Camera."); stopCamera(); return; }
    const f = captureFrame();
    if (f) doRunScan(f.base64, f.dataUrl, captureFrame, { auto: opts?.auto === true });
  }, [scanning, cameraOn, roster.length, inputMode, captureFrame, doRunScan, stopCamera]);
  useEffect(() => { triggerRef.current = doTriggerScan; }, [doTriggerScan]);

  // ── Hands-free: after a confirm, scan when the picture changes and settles ─
  const modalOpen = showBinSetup || showRosterComplete || showSettings || showResume || showSupervisor || showHistory || showFinish || showBins;
  useEffect(() => {
    if (!cameraOn || inputMode !== "camera" || !handsFree) { gateRef.current.disarm(); return; }   // paused, or nothing left in the order: never scan the empty table
    const id = setInterval(() => {
      const gate = gateRef.current;
      if (modalOpen) { if (gate.armed) { gate.disarm(); setArmed(false); } return; }   // never scan behind a dialog
      if (!gate.armed) { setArmed(a => a ? false : a); return; }
      if (overlay || scanning) return;
      const track = streamRef.current?.getVideoTracks?.()[0];
      if (!track || track.readyState !== "live") { gate.disarm(); setArmed(false); setError("Camera disconnected — check the USB cable, then press Start Camera."); stopCamera(); return; }
      const frame = sampleFrame(videoRef.current, motionCanvasRef.current);
      if (gate.tick(frame)) { setArmed(false); doTriggerScan({ auto: true }); }
      else if (!gate.armed) setArmed(false);
    }, 200);
    return () => clearInterval(id);
  }, [cameraOn, inputMode, handsFree, overlay, scanning, modalOpen, doTriggerScan, stopCamera]);

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
    if (!handsFree || !cameraOn || inputMode !== "camera" || modalOpen) return;
    gateRef.current.arm(lastScanFrameRef.current); setArmed(true);
  }, [handsFree, cameraOn, inputMode, modalOpen]);
  useEffect(() => { armRef.current = armAutoScan; }, [armAutoScan]);

  // Closing a dialog (complete modal, settings, supervisor view) hands the table
  // back to the operator: re-arm, so the next placement scans without B. The
  // baseline is the last scan's frame, so the same jersey still lying there does
  // not scan again. `autoScan` overrides the setting when Settings just saved it.
  const closeDialog = useCallback((hide, autoScan = settings.autoScan) => {
    hide();
    if (overlay || !autoScan || handsFreePaused || remaining === 0 || !cameraOn || inputMode !== "camera") return;
    gateRef.current.arm(lastScanFrameRef.current); setArmed(true);
  }, [overlay, settings.autoScan, handsFreePaused, remaining, cameraOn, inputMode]);
  // Pause/resume hands-free from the camera panel: the camera stays on and B still scans.
  // One button, three states: off in Settings → turn it on; running → pause; paused → resume.
  const toggleHandsFree = () => {
    if (!settings.autoScan) { setSettings(s => ({ ...s, autoScan: true })); setHandsFreePaused(false); }
    else if (!handsFreePaused) { gateRef.current.disarm(); setArmed(false); setHandsFreePaused(true); return; }
    else setHandsFreePaused(false);
    if (cameraOn && inputMode === "camera" && !modalOpen && !overlay && remaining > 0) { gateRef.current.arm(lastScanFrameRef.current); setArmed(true); }
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
      applyRoster(parsed, file.name, { keepLog: true });
    } catch (err) { setError("Failed to parse roster: " + err.message); }
  }, [applyRoster, log.length]);

  // ── Add a roster mid-session (another team sheet, a late file) ────────────
  // Appends rows; scans so far, bins and the log all stay as they are.
  const handleRosterAdd = useCallback(async (e) => {
    const file = e.target.files[0]; if (!file) return;
    e.target.value = ""; setError(null);
    try {
      const isExcel = /\.(xlsx|xls)$/i.test(file.name);
      const parsed  = isExcel ? await parseExcel(file) : parseCSV(await file.text());
      if (parsed.length === 0) { setError("No valid rows found in the added file. It needs a header row with name and/or number columns."); return; }
      const offset = roster.reduce((m, r) => Math.max(m, r._id), -1) + 1;
      const next   = [...roster, ...parsed.map((r, i) => ({ ...r, _id: offset + i, scanned: false }))];
      setRoster(next);
      setRosterFile(f => f ? `${f} + ${file.name}` : file.name);
      setShowRosterComplete(false);
      if (binMap) {   // the order has bins: the added rows join them, by the same field
        const bins = buildBinMap(next, binMap, undefined, closedBins.map(c => c.bin));   // a closed bin's number is never handed out again
        const newBins = binCount(bins) > binCount(binMap);
        setBinMap(bins); if (newBins) setShowBinSetup(true);
      }
    } catch (err) { setError("Failed to parse roster: " + err.message); }
  }, [roster, binMap, closedBins]);

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
    const commitTyped = (o, { number, name, size, team }, exactRow) => {
      // What the app showed first for this jersey, against what the operator
      // says it is. The app was wrong when: a green was a different jersey (or
      // not on the roster); a list did not have it; it could not read a jersey
      // that is on the roster.
      const shown = o?.scan?.shown;
      if (shown?.mode === "confirm" && exactRow?._id !== shown.id) noteMistake("greenOverridden");
      else if ((shown?.mode === "pick" || shown?.mode === "close") && !(exactRow && shown.ids?.includes(exactRow._id))) noteMistake("notOnList");
      else if (shown?.mode === "flag" && exactRow) noteMistake("couldNotRead");
      if (exactRow) {
        const reason = "Entered by operator — the camera could not read it";
        setRoster(prev => prev.map(r => r._id === exactRow._id ? { ...r, scanned: "manual" } : r));
        const entry = { id: o.scan?.id || Date.now(), detected: o.scan?.detected, thumb: o.scan?.smallThumb, match: exactRow, status: S_MANUAL, reason, ...stamp() };
        setLog(prev => [entry, ...prev]); setLastResult(entry); setLastConfirmed(entry);
        inspectRef.current.jerseyDone(); syncInspect();
        setOverlay({ mode: "manualDone", scan: o.scan, match: exactRow, reason, typed: { number, name, team }, entryId: entry.id });
        playTone("pass");
        return;
      }
      const typedRow = { number, name, team, size, offRoster: true };   // no _id: never a roster row
      const label  = `#${number || "?"}${name ? " " + name : ""}${team ? " (" + team + ")" : ""}`;
      const reason = `Not on the roster — operator typed ${label}`;
      const entry  = { id: o.scan?.id || Date.now(), detected: o.scan?.detected, thumb: o.scan?.smallThumb, photo: o.scan?.photo || null, match: typedRow, status: S_FLAGGED, reason, ...stamp() };
      setLog(prev => [entry, ...prev]); setLastResult(entry);
      setOverlay({ mode: "supervisor", scan: o.scan, match: typedRow, reason: "Not on the roster.", route: "Supervisor → check the order", entryId: entry.id, photoFirst: false, damagePhotos: [] });
      playTone("flag");
    };
    return {
    confirm() {
      if (!overlay?.match) return;
      const scan  = overlay.scan || {};
      const entry = { id: scan.id || Date.now(), detected: scan.detected, thumb: scan.smallThumb, match: overlay.match, status: S_PASS, reason: overlay.note || "", ...stamp() };
      setRoster(prev => prev.map(r => r._id === overlay.match._id ? { ...r, scanned: "pass" } : r));
      setLog(prev => [entry, ...prev]);
      setLastResult(entry); setLastConfirmed(entry);
      inspectRef.current.jerseyDone(); syncInspect();
      setOverlay({ mode: "done", scan, match: overlay.match });
      playTone("pass");
    },
    retry()  {
      const read = overlay?.match || overlay?.scan?.detected || {};
      setRetried({ number: read.number || "", name: read.name || "" });
      setOverlay(null); playTone("retry"); armAutoScan();
    },
    // A row picked from a list, by key or by mouse. On a list the operator
    // typed for, the pick IS the hand entry: it goes in as entered by hand.
    pick(c)  {
      if (!overlay || !c || isDone(c)) return;
      if (overlay.typed) { commitTyped(overlay, overlay.typed, c); return; }
      setOverlay({ mode: "confirm", scan: overlay.scan, match: c, note: overlay.note });
    },
    reasons() { setOverlay(o => ({ mode: "reasons", scan: o.scan, match: o.match || null, returnTo: o })); },
    // The jersey just passed turns out to have a problem: reopen it on the
    // reasons screen. The chosen reason flags it (its pass is taken back);
    // Back leaves it passed.
    reopen(c) {
      if (!c?.match) return;
      // also reached from the roster table (flagRow) and the history list
      const scan = { id: c.id, detected: c.detected, thumb: c.thumb, smallThumb: c.thumb, photo: null };
      setOverlay({ mode: "reasons", scan, match: c.match, returnTo: null, reopened: true });
    },
    reopenLast() { actions.reopen(lastConfirmed); },
    back()   { setOverlay(o => o.returnTo || null); },
    chooseReason(r) {
      const o = overlay; if (!o) return;
      if (!r.custom) { inspectRef.current.defect(); syncInspect(); }
      if (r.inPlace) { if (o.reopened) { setOverlay(null); armAutoScan(); return; } setOverlay({ ...(o.returnTo || { mode: "flag", scan: o.scan }), note: r.label }); return; }
      if (r.custom)  { setOverlay({ mode: "reasonText", scan: o.scan, match: o.match || null, returnTo: o }); return; }   // the list did not cover it: type it
      const entry = { id: o.reopened ? Date.now() : (o.scan.id || Date.now()), detected: o.scan.detected, thumb: o.scan.smallThumb, photo: o.scan.photo || null, match: o.match || null, status: S_FLAGGED, reason: o.reopened ? `${r.label} — found after it passed` : r.label, reasonId: r.id, ...stamp() };
      if (o.match) { setRoster(prev => prev.map(x => x._id === o.match._id ? { ...x, scanned: "flag" } : x)); setClosedBins(prev => dropFromClosed(prev, o.match._id)); }   // flagged: it is out of the bin it was in, closed or not
      setLog(prev => [entry, ...prev]); setLastResult(entry); if (o.reopened) setLastConfirmed(c => (c?.match?._id === o.match?._id ? null : c));
      setOverlay({ mode: "supervisor", scan: o.scan, match: o.match || null, reason: r.label, route: r.route, entryId: entry.id, photoFirst: r.id !== "wrong_decoration", damagePhotos: [] });
      playTone("flag");
    },
    reasonSubmit(text) {
      const o = overlay; if (!o) return;
      const label = String(text || "").trim(); if (!label) return;
      inspectRef.current.defect(); syncInspect();
      const entry = { id: o.reopened ? Date.now() : (o.scan.id || Date.now()), detected: o.scan.detected, thumb: o.scan.smallThumb, photo: o.scan.photo || null, match: o.match || null, status: S_FLAGGED, reason: o.reopened ? `${label} — found after it passed` : label, reasonId: "other", ...stamp() };
      if (o.match) { setRoster(prev => prev.map(x => x._id === o.match._id ? { ...x, scanned: "flag" } : x)); setClosedBins(prev => dropFromClosed(prev, o.match._id)); }
      setLog(prev => [entry, ...prev]); setLastResult(entry); if (o.reopened) setLastConfirmed(c => (c?.match?._id === o.match?._id ? null : c));
      setOverlay({ mode: "supervisor", scan: o.scan, match: o.match || null, reason: label, route: "Supervisor decides", entryId: entry.id, photoFirst: true, damagePhotos: [] });
      playTone("flag");
    },
    flagContinue() {
      const o = overlay; if (!o?.scan) return;
      const entry = { id: o.scan.id || Date.now(), detected: o.scan.detected, thumb: o.scan.smallThumb, photo: o.scan.photo || null, match: null, status: S_FLAGGED, reason: o.reason || "Flagged by operator", ...stamp() };
      setLog(prev => [entry, ...prev]); setLastResult(entry); setOverlay(null); playTone("flag"); armAutoScan();
    },
    skipDuplicate() { setOverlay(null); armAutoScan(); },
    flagDuplicate() {
      const o = overlay; if (!o?.scan) return;
      const entry = { id: o.scan.id || Date.now(), detected: o.scan.detected, thumb: o.scan.smallThumb, photo: o.scan.photo || null, match: o.match || null, status: S_FLAGGED, reason: "Duplicate — scanned again after passing", ...stamp() };
      setLog(prev => [entry, ...prev]); setLastResult(entry); setOverlay(null); playTone("flag"); armAutoScan();
    },
    continueSupervisor() { setOverlay(null); armAutoScan(); },
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
    // "Enter by hand". On a list the operator already typed for (overlay.typed),
    // "None of these" adds the typed row instead of reopening the form — the
    // typed value is the truth, and the screen can never loop back on itself.
    manual() {
      const o = overlay;
      if (o?.typed) { commitTyped(o, o.typed, null); return; }
      setOverlay({ mode: "manual", scan: o?.scan, match: null, teams: teamNames, returnTo: o });
    },
    manualSubmit({ number, name, size, team }) {
      const o = overlay; if (!o) return;
      const typed = { number, name, size, team };
      let m = findMatches(roster, name, number, { typed: true });
      // The team the operator chose settles same-number rows: one row of that
      // team is the jersey (or a duplicate if it is done); several keep the list,
      // narrowed to that team.
      if ((m.type === "pick" || m.type === "close") && team.trim()) {
        const same = m.candidates.filter(c => teamKey(c.team) === teamKey(team));
        if (m.type === "pick" && same.length === 1) m = isDone(same[0]) ? { type: "duplicate", match: same[0] } : { type: "exact", match: same[0] };
        else if (same.length >= 1) m = { ...m, candidates: same };
      }
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
      commitTyped(o, typed, null);
    },
    continueManual() { setOverlay(null); armAutoScan(); },
    // Back from a list the operator typed for: the form again, as it was typed.
    editTyped() {
      const o = overlay; if (!o?.typed) return;
      setOverlay({ mode: "manual", scan: o.scan, match: null, teams: teamNames, returnTo: null, initial: o.typed });
    },
    // Back from "entered by hand": the entry is already in the log and on the
    // row, so take it back (the log line stays, marked taken back; the row
    // opens again) and reopen the form with what was typed.
    undoManual() {
      const o = overlay; if (!o?.match) return;
      setRoster(prev => prev.map(r => r._id === o.match._id && r.scanned === "manual" ? { ...r, scanned: false } : r));
      setLog(prev => prev.map(l => l.id === o.entryId ? { ...l, status: "undo", reason: "Taken back — re-entered by hand" } : l));
      setLastResult(r => (r?.id === o.entryId ? null : r)); setLastConfirmed(c => (c?.id === o.entryId ? null : c));
      setOverlay({ mode: "manual", scan: o.scan, match: null, teams: teamNames, returnTo: null, initial: o.typed });
    },
    };
  }, [overlay, stamp, armAutoScan, roster, teamNames, noteMistake, lastConfirmed, syncInspect, captureFrame]);

  // ── Flag resolution (from the result card) ────────────────────────────────
  const resolveFlag = useCallback((logId, decision, note) => {
    const entry = log.find(l => l.id === logId);
    const resolution = decision === "accept" ? `Accepted — manually verified${note ? ": " + note : ""}`
                     : decision === "reject" ? `Rejected — sent back for rework${note ? ": " + note : ""}`
                     : (note || "Note added");
    const status = decision === "note" ? entry?.status || S_FLAGGED : S_MANUAL;
    setLog(prev => prev.map(l => l.id === logId ? { ...l, status, resolution } : l));
    setLastResult(prev => prev?.id === logId ? { ...prev, status, resolution } : prev);
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
  const flagRow = (r) => {
    const l = log.find(x => x.match?._id === r._id && (x.status === S_PASS || x.status === S_MANUAL));
    actions.reopen(l || { id: Date.now(), match: r, detected: null, thumb: null });
  };
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
  useEffect(() => { markHandler.current = (r, v) => { if (v === "unscan") unscan(r._id); else if (v === "flag") flagRow(r); else markRow(r._id, v || false); }; });

  // Input trial: while Settings → Input trial names a setup, every decision on
  // a result screen (and every scan trigger) is kept in this browser, across
  // orders, with the setup's name on it. Compare under Settings.
  const trialMethod = settings.trialMethod || "";
  const lastScreenClosed = useRef(Date.now());
  useEffect(() => { if (!overlay) lastScreenClosed.current = Date.now(); }, [overlay]);
  const onTrial = useCallback(rec => {
    if (!trialMethod) return;
    appendTrial({ t: Date.now(), method: trialMethod, station: stationId(), operator: operatorName, order: orderNumber, run: orderRun, ...rec });
  }, [trialMethod, operatorName, orderNumber, orderRun]);
  // ── Global keyboard: scan trigger only ───────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (e.repeat) return;
      if (overlay || showBinSetup || showRosterComplete || showSettings || showResume || showFinish || showBins || !sessionStarted) return;
      if (e.code !== scanKey) return;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
      e.preventDefault();
      gateRef.current.disarm(); setArmed(false);
      onTrial({ screen: "camera", n: 1, idx: 0, id: "scan", via: "key", key: e.code, ms: Date.now() - lastScreenClosed.current, moves: 0, hovers: 0 });
      doTriggerScan();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [overlay, showBinSetup, showRosterComplete, showSettings, showResume, showFinish, showBins, sessionStarted, scanKey, doTriggerScan, onTrial]);

  const overlayKey = overlay ? `${overlay.mode}:${overlay.scan?.id}:${(overlay.candidates || []).map(c => c._id).join(",")}` : "";
  const exportMeta = { orderNumber, operatorName, notes, jerseyType: jerseyTypeLabel(jerseyType), idleSpells, awaySpells, bins: binSummary };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: FONT_UI, background: "#0d1117", height: "100%", color: "#e2e8f0", display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {!signedIn && (
        <SignInModal initial={savedSignIn}
          onSignIn={({ role, name }) => {
            setRole(role); setOperatorName(name); setSignedIn(true); saveSignIn({ role, name });
            if (role === "supervisor" || role === "admin") { setShowSupervisor(true); return; }
            // An operator's station goes full screen by itself: no tabs, no address bar. (The kiosk launcher locks the browser down for good.)
            else if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
          }} />
      )}

      {signedIn && showResume && <ResumeModal session={savedSession} onResume={resumeSession} onDiscard={discardSession} />}


      {showSupervisor && <SupervisorPanel operatorName={operatorName} onSignOut={signOut} />}

      {sessionStarted && !showSupervisor && <IdleWatch pulse={log.filter(l => l.status === S_PASS || l.status === S_MANUAL || l.status === S_FLAGGED).length} onSpell={recordIdle} />}

      {!showResume && signedIn && !sessionStarted && !showSupervisor && (
        <OrderSetupModal operatorName={operatorName} role={role} xlsxReady={xlsxReady} onSignOut={signOut} stationLabel={stationLabel}
          onStart={({ roster, orderNumber, notes, jerseyType, binBy, rosterFile, hubRosterId = null }) => {
            setBinMap(null);
            applyRoster(roster, rosterFile, { binBy: binBy || "team" });
            setOrderNumber(orderNumber); setOrderRun(Date.now()); setHubRosterId(hubRosterId); setNotes(notes); setJerseyType(jerseyType || "");
            setSessionStarted(true); setResumeDecided(true);
          }} />
      )}

      {showBinSetup && binMap && (
        <BinSetupModal entries={binEntries(roster, binMap)} by={binFieldOf(binMap)} labels={binLabels(roster, binMap, { orderNumber })} onConfirm={() => setShowBinSetup(false)} />
      )}

      {overlay && !wide && (
        <ScanOverlay key={overlayKey} inspect={inspect} state={overlay} actions={actions} binMap={binMap} extraCols={extraCols} notes={notes} jerseyType={jerseyType} confirmKey={confirmKey} cancelKey={cancelKey} upKey={upKey} retryKey={retryKey} byHandKey={byHandKey} ticket={overlay?.mode === "supervisor" ? ticketFor(overlay.entryId) : null} reprintTicket={reprintTicket} onTrial={onTrial}
          stream={cameraOn && inputMode === "camera" ? streamRef.current : null} rotation={settings.rotation} canPhoto={cameraOn && inputMode === "camera"} />
      )}

      {showSettings && (
        <SettingsPanel settings={settings} cameras={cameras} onSave={setSettings} onClose={saved => closeDialog(() => setShowSettings(false), saved ? saved.autoScan : undefined)} />
      )}
      {bigPhoto && <PhotoLightbox src={bigPhoto} onClose={() => setBigPhoto(null)} />}

      {retried && !overlay && !noJersey && (
        <div style={{ position: "fixed", top: 72, left: "50%", transform: "translateX(-50%)", zIndex: 1950, background: "#1e293b", color: "#fcd34d", border: "2px solid #f59e0b", borderRadius: 999, padding: "10px 22px", fontSize: 20, fontWeight: 800, boxShadow: "0 8px 30px rgba(0,0,0,0.5)", whiteSpace: "nowrap" }}>
          ↻ Scanned again · {retried.number || retried.name ? `#${retried.number || "?"}${retried.name ? " " + retried.name : ""} is` : "that jersey is"} NOT checked — no sticker, no bin
        </div>
      )}
      {noJersey && (
        <div style={{ position: "fixed", top: 72, left: "50%", transform: "translateX(-50%)", zIndex: 1950, background: "#1e293b", color: "#e2e8f0", border: "1px solid #3f4b5c", borderRadius: 999, padding: "10px 22px", fontSize: 20, fontWeight: 700, boxShadow: "0 8px 30px rgba(0,0,0,0.5)", pointerEvents: "none" }}>
          {noJersey}
        </div>
      )}
      {showHistory && (
        <HistoryModal log={log} roster={roster} binOf={binOf} onClose={() => closeDialog(() => setShowHistory(false))}
          onFlag={l => { setShowHistory(false); actions.reopen(l); }} />
      )}
      {showRosterComplete && (
        <RosterCompleteModal roster={roster} offRosterFlags={offRosterFlags} canExport={canSupervise}
          onExport={() => { exportRosterXLSX(roster, log, exportMeta, rosterCols, binOf); closeDialog(() => setShowRosterComplete(false)); }}
          onDismiss={() => closeDialog(() => setShowRosterComplete(false))} onFinish={askFinish} />
      )}
      {showBins && binMap && (
        <BinsModal open={openBins} closed={closedList} by={binFieldOf(binMap)} cap={boxCap} status={binPrint}
          onFull={binFull} onReprint={reprintBinList} onClose={() => closeDialog(() => setShowBins(false))} />
      )}
      {finishing && (
        <div style={{ position: "fixed", inset: 0, zIndex: 2400, background: "rgba(0,0,0,0.88)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 800, color: "#e2e8f0", textAlign: "center", padding: 24 }}>
          🖨 Printing the bin lists… the order closes when they are out
        </div>
      )}
      {showFinish && (
        <FinishOrderModal orderNumber={orderNumber} roster={roster} offRosterFlags={offRosterFlags} scans={log.length} binLists={finishLists.length} bins={binSummary.filter(b => b.count > 0)}
          onConfirm={finishOrder} onCancel={() => closeDialog(() => setShowFinish(false))} />
      )}

      {/* Header */}
      <div style={{ background: "#161b22", borderBottom: "1px solid #21262d", padding: "0 16px", height: 58, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "nowrap", flexShrink: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18, whiteSpace: "nowrap" }}>🏭 Jersey QC</div>
            {rosterFile && (
              <div style={{ fontSize: 13, color: "#94a3b8", whiteSpace: "nowrap", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis" }}>
                {rosterFile}{operatorName ? ` · ${operatorName}` : ""}{role ? ` (${role})` : ""}
              </div>
            )}
          </div>
          <input value={orderNumber} onChange={e => setOrderNumber(e.target.value)} placeholder="Order number…" title="Order number"
            onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur(); }}
            style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #3f4b5c", background: "#1e293b", color: "#e2e8f0", fontSize: 16, fontWeight: 700, width: 140 }} />
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "nowrap", flex: 1, minWidth: 0, overflow: "hidden", justifyContent: "flex-end" }}>
          <Pill color="#22c55e" active={rosterFilter === "pass"} onClick={() => filterRoster("pass")} title="Show the passed jerseys">{passCount} Pass</Pill>
          <Pill color="#ef4444" active={rosterFilter === "flag"} onClick={() => filterRoster("flag")} title="Show the flagged jerseys">{flagCount} Flag</Pill>
          {checksLeft > 0 && <span title="After a mistake the next jerseys are read twice and must agree before a green"><Pill color="#60a5fa">Checking · {checksLeft}</Pill></span>}
          {sessionStarted && <span title="After a defect, inspect the next 5 fully; after 10 clean, one spot check"><Pill color={inspect.phase === "quick" ? "#94a3b8" : "#f59e0b"}>{inspectLabel(inspect)}</Pill></span>}
          {manualCount > 0 && <Pill color="#f59e0b" active={rosterFilter === "manual"} onClick={() => filterRoster("manual")} title="Show the jerseys entered by hand">{manualCount} By hand</Pill>}
          {hubOk === false && <Pill color="#f87171" title="The supervisor's board cannot be reached; scanning still works">Board offline</Pill>}
          {saveOk === false && <Pill color="#f87171" title="This PC's storage is full or blocked: the order is not being saved, so a reload or a crash would lose the work since. Tell the supervisor; do not close or reload this page.">⚠ NOT SAVING — tell the supervisor</Pill>}
          {trialMethod && <span title="Input trial: every decision on a result screen is being timed for this setup (Settings → Input trial)"><Pill color="#c084fc" onClick={() => setShowSettings(true)}>⏱ {trialMethodLabel(trialMethod)}</Pill></span>}
          {openCount - flagCount > 0 && <Pill color="#f59e0b">{openCount - flagCount} Missing</Pill>}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "nowrap", flexShrink: 0 }}>
          {sessionStarted && <button onClick={askFinish} title="Close this order, after a confirm, and go back to waiting for the next — no PIN needed" style={{ ...btnGhost, padding: "6px 12px", fontSize: 14, borderColor: "#22c55e", color: "#4ade80" }}>🏁 Finish order</button>}
          {signedIn && <button onClick={signOut} title="End your shift at this station" style={{ ...btnGhost, padding: "6px 12px", fontSize: 14 }}>Sign out</button>}
          <button onClick={toggleFullscreen} title={isFullscreen ? "Leave full screen (Esc also works)" : "Full screen — hides the browser's tabs and address bar (F11 does the same)"} style={{ ...btnGhost, padding: "6px 12px", fontSize: 14 }}>{isFullscreen ? "⛶ Exit" : "⛶"}</button>
          {fsHint && <span style={{ fontSize: 14, color: "#fcd34d" }}>{fsHint}</span>}
          <button onClick={() => setShowSettings(true)} title="Settings" style={{ ...btnGhost, padding: "6px 12px", fontSize: 16 }}>⚙</button>
        </div>
      </div>

      {(notes || jerseyType) && (
        <div style={{ background: "rgba(245,158,11,0.10)", borderBottom: "1px solid rgba(245,158,11,0.35)", padding: "9px 16px", fontSize: 16, color: "#fcd34d", flexShrink: 0, display: "flex", gap: 14, alignItems: "center" }}>
          {jerseyType && <span style={{ border: "1px solid #60a5fa", color: "#93c5fd", borderRadius: 999, padding: "2px 12px", fontWeight: 700, whiteSpace: "nowrap" }}>{jerseyTypeLabel(jerseyType)} · {jerseyTypeOf(jerseyType)?.construction}</span>}
          {notes && <span><strong>Order notes:</strong> {notes}</span>}
        </div>
      )}

      {sessionStarted && orderSetBy && (
        <div style={{ background: "rgba(34,197,94,0.12)", borderBottom: "1px solid rgba(34,197,94,0.4)", padding: "9px 16px", fontSize: 16, color: "#bbf7d0", flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <span>🔢 <strong>{orderSetBy.by || "The supervisor"} set this order's number to {orderSetBy.orderNumber}.</strong> Reports and the board use it from now on.</span>
          <button onClick={() => setOrderSetBy(null)} title="Hide" style={{ background: "transparent", border: 0, color: "#bbf7d0", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "4px 8px" }}>✕</button>
        </div>
      )}
      {sessionStarted && newRosters.length > 0 && (
        <div style={{ background: "rgba(59,130,246,0.12)", borderBottom: "1px solid rgba(59,130,246,0.4)", padding: "9px 16px", fontSize: 16, color: "#bfdbfe", flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <span>📋 <strong>{newRosters.map(r => `Order ${r.orderNumber || "—"} from ${r.by || "the supervisor"} (${r.rowCount} ${r.rowCount === 1 ? "jersey" : "jerseys"}${r.forStation ? ", for this station" : ""})`).join(" · ")}</strong> is waiting for you — it is offered when this order ends, or on Finish order.</span>
          <button onClick={() => setNewRosters([])} title="Hide" style={{ background: "transparent", border: 0, color: "#bfdbfe", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "4px 8px" }}>✕</button>
        </div>
      )}

      {roster.length > 0 && (
        <div style={{ height: 8, background: "#1e293b", flexShrink: 0 }}>
          <div style={{ height: "100%", background: rosterComplete ? "#22c55e" : "#3b82f6", width: `${(scannedRows.length / roster.length) * 100}%`, transition: "width 0.4s ease" }} />
        </div>
      )}

      {/* Main layout */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* LEFT: Camera */}
        <div style={{ width: "min(580px, 46vw)", flexShrink: 0, display: "flex", flexDirection: "column", borderRight: "1px solid #21262d", background: "#0d1117" }}>
          <canvas ref={canvasRef} style={{ display: "none" }} />
          <canvas ref={motionCanvasRef} style={{ display: "none" }} />

          {roster.length === 0 ? (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, textAlign: "center" }}>
              <div style={{ fontSize: 48, marginBottom: 10 }}>📋</div>
              <div style={{ fontWeight: 700, fontSize: 22, marginBottom: 8 }}>No roster loaded</div>
              <div style={{ fontSize: 15, color: "#94a3b8", marginBottom: 16 }}>
                CSV or Excel: <code style={codeSt}>name</code> <code style={codeSt}>number</code> <code style={codeSt}>team</code> <code style={codeSt}>size</code>
              </div>
              {error && <p style={{ fontSize: 15, color: "#f87171", marginTop: 10 }}>{error}</p>}
            </div>
          ) : (
            <>
              <div style={{ display: "flex", borderBottom: "1px solid #21262d" }}>
                {["camera", "upload"].map(m => (
                  <button key={m} onClick={() => { setInputMode(m); if (m === "upload") stopCamera(); }}
                    style={{ flex: 1, padding: "11px 0", border: "none", background: inputMode === m ? "rgba(59,130,246,0.1)" : "transparent", color: inputMode === m ? "#60a5fa" : "#64748b", fontWeight: 700, fontSize: 16, borderBottom: inputMode === m ? "2px solid #3b82f6" : "2px solid transparent", cursor: "pointer" }}>
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
                        <span style={{ fontSize: 20, color: "#94a3b8" }}>Camera off</span>
                      </div>
                    )}
                    {cameraOn && (
                      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                        <div style={{ width: 220, height: 132, border: "3px solid rgba(255,255,255,0.4)", borderRadius: 8, boxShadow: "0 0 0 9999px rgba(0,0,0,0.25)" }} />
                      </div>
                    )}
                    {scanning && (
                      <div style={{ position: "absolute", inset: 0, background: "rgba(59,130,246,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <div style={{ color: "#fff", fontWeight: 700, fontSize: 26, background: "rgba(0,0,0,0.65)", padding: "14px 32px", borderRadius: 999 }}>⏳ Reading…</div>
                      </div>
                    )}
                    {cameraOn && !scanning && (
                      <>
                        <div style={{ position: "absolute", top: 10, right: 10, display: "flex", alignItems: "center", gap: 9, background: "rgba(0,0,0,0.65)", padding: "8px 16px", borderRadius: 999 }}>
                          <div style={{ width: 12, height: 12, borderRadius: "50%", background: armed && handsFree ? "#f59e0b" : handsFreePaused ? "#94a3b8" : "#22c55e", boxShadow: `0 0 5px ${armed && handsFree ? "#f59e0b" : handsFreePaused ? "#94a3b8" : "#22c55e"}` }} />
                          <span style={{ fontSize: 17, fontWeight: 700, color: "#f1f5f9" }}>{armed && handsFree ? "Waiting for the next jersey…" : handsFreePaused ? "Hands-free paused — B to scan" : !settings.autoScan ? "Hands-free off — B to scan" : roster.length > 0 && remaining === 0 ? "Order done — hands-free off" : "Ready"}</span>
                        </div>
                        {checksLeft > 0 && (
                          <div title="After a mistake the next jerseys are read twice and must agree before a green" style={{ position: "absolute", top: 54, right: 10, display: "flex", alignItems: "center", gap: 9, background: "rgba(37,99,235,0.85)", padding: "8px 16px", borderRadius: 999 }}>
                            <span style={{ fontSize: 17, fontWeight: 700, color: "#fff" }}>Double-checking · {checksLeft} to go</span>
                          </div>
                        )}
                        <div style={{ position: "absolute", bottom: 10, left: "50%", transform: "translateX(-50%)", background: "rgba(0,0,0,0.65)", color: "#e2e8f0", fontSize: 15, padding: "6px 14px", borderRadius: 999, whiteSpace: "nowrap" }}>
                          Press <kbd style={{ background: "#1e293b", padding: "2px 7px", borderRadius: 4, fontSize: 15, fontWeight: 700 }}>{keyLabel}</kbd> to scan
                        </div>
                      </>
                    )}
                  </div>
                  <div style={{ padding: "12px 14px", display: "flex", gap: 10, borderTop: "1px solid #21262d" }}>
                    {!cameraOn
                      ? <button onClick={startCamera} style={{ ...btnPri, flex: 1, fontSize: 22, padding: "16px" }}>Start camera</button>
                      : <>
                          <button onClick={stopCamera} title="Stop the camera" style={{ ...btnGhost, width: 56, fontSize: 18 }}>■</button>
                          <button onClick={toggleHandsFree} title={!settings.autoScan ? "Turn hands-free scanning on" : handsFreePaused ? "Resume hands-free scanning" : "Pause hands-free — the camera stays on and B still scans"}
                            style={{ ...btnGhost, padding: "0 14px", fontSize: 16, fontWeight: 700, borderColor: "#f59e0b", color: "#fcd34d", background: handsFree ? "rgba(245,158,11,0.14)" : "transparent", whiteSpace: "nowrap" }}>{handsFree ? "⏸ Pause scan" : "▶ Hands-free"}</button>
                          <button onClick={() => { gateRef.current.disarm(); setArmed(false); onTrial({ screen: "camera", n: 1, idx: 0, id: "scan", via: "pointer", key: "", ms: Date.now() - lastScreenClosed.current, moves: 0, hovers: 0 }); doTriggerScan(); }} disabled={scanning}
                            style={{ ...btnPri, flex: 1, fontFamily: FONT_DISPLAY, fontSize: 30, fontWeight: 900, letterSpacing: 1, padding: "14px", opacity: scanning ? 0.4 : 1 }}>
                            {scanning ? "Reading…" : "⚡ SCAN"}
                          </button>
                        </>
                    }
                    <button onClick={() => { gateRef.current.disarm(); setArmed(false); actions.manual(); }} disabled={scanning} title="Type the jersey in — when the camera cannot read it"
                      style={{ ...btnGhost, padding: "0 14px", fontSize: 16, fontWeight: 700, whiteSpace: "nowrap" }}>⌨ By hand</button>
                  </div>
                  {error && <p style={{ padding: "0 14px 10px", fontSize: 15, color: "#f87171" }}>{error}</p>}
                </div>
              )}

              {inputMode === "upload" && (
                <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20, gap: 12 }}>
                  {thumb
                    ? <img src={thumb} alt="uploaded" style={{ width: "100%", borderRadius: 8, maxHeight: 300, minHeight: 0, flex: "0 1 auto", objectFit: "contain" }} />
                    : <div style={{ width: "100%", aspectRatio: "4/3", background: "#0d1117", borderRadius: 8, border: "2px dashed #334155", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, color: "#475569" }}>
                        <span style={{ fontSize: 48 }}>🖼</span>
                        <span style={{ fontSize: 16 }}>No photo selected</span>
                      </div>
                  }
                  <input ref={photoRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePhotoUpload} />
                  <button onClick={() => photoRef.current.click()} disabled={scanning}
                    style={{ ...btnPri, width: "100%", fontSize: 20, padding: "14px", opacity: scanning ? 0.5 : 1 }}>
                    {scanning ? "⏳ Reading…" : "⚡ Upload & scan"}
                  </button>
                  {error && <p style={{ fontSize: 15, color: "#f87171" }}>{error}</p>}
                </div>
              )}

              {lastConfirmed && (
                <div style={{ padding: "10px 14px", borderTop: "1px solid #21262d", display: "flex", alignItems: "center", gap: 14, background: "rgba(34,197,94,0.06)", flexShrink: 0, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 14, color: "#94a3b8", whiteSpace: "nowrap" }}>Last passed</span>
                  <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 30, lineHeight: 1 }}>#{lastConfirmed.match?.number}{lastConfirmed.match?.name ? ` · ${lastConfirmed.match.name}` : ""}</span>
                  {lastConfirmed.match?.size && <span style={{ fontFamily: FONT_DISPLAY, fontSize: 26, lineHeight: 1, color: "#4ade80", fontWeight: 800 }}>{lastConfirmed.match.size}</span>}
                  {binOf(lastConfirmed.match) !== null && <span style={{ fontFamily: FONT_DISPLAY, fontSize: 26, lineHeight: 1, color: "#60a5fa", fontWeight: 800 }}>Bin {binOf(lastConfirmed.match)}</span>}
                  {lastConfirmed.match?._id !== undefined && roster.some(r => r._id === lastConfirmed.match._id && r.scanned) && (
                    <button onClick={() => unscan(lastConfirmed.match._id)} title="Un-check it; it must be scanned again" style={{ ...btnGhost, padding: "5px 12px", fontSize: 14, borderColor: "#f59e0b", color: "#fcd34d", whiteSpace: "nowrap" }}>↶ Undo</button>
                  )}
                  {lastConfirmed.match?._id !== undefined && roster.some(r => r._id === lastConfirmed.match._id && (r.scanned === "pass" || r.scanned === "manual")) && (
                    <button onClick={actions.reopenLast} title="Found a problem after confirming? Flag this jersey" style={{ ...btnGhost, padding: "5px 12px", fontSize: 14, borderColor: "#ef4444", color: "#fca5a5", whiteSpace: "nowrap" }}>🚩 Flag it</button>
                  )}
                  {settings.stickers && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14, whiteSpace: "nowrap", color: sticker?.id === lastConfirmed.id && sticker.status === "done" ? "#4ade80" : sticker?.id === lastConfirmed.id ? "#fbbf24" : "#7c8ba1" }}>
                      {sticker?.id !== lastConfirmed.id ? "🖨 Printing the sticker…" : sticker.status === "done" ? "🖨 Sticker printed" : sticker.status === "none" ? "🖨 No label printer for this station" : `🖨 Sticker not printed: ${sticker.message}`}
                      {sticker?.id === lastConfirmed.id && (
                        <button onClick={() => { setSticker(null); printSticker(lastConfirmed); }} title="Print this jersey's sticker again" style={{ ...btnGhost, padding: "4px 10px", fontSize: 13, whiteSpace: "nowrap" }}>Reprint</button>
                      )}
                    </span>
                  )}
                  <span style={{ fontSize: 14, color: "#7c8ba1", marginLeft: "auto" }}>{lastConfirmed.timestamp}</span>
                </div>
              )}

              {lastResult && lastResult.status !== S_PASS && !overlay && (
                <div style={{ padding: "0 10px 10px", flexShrink: 0 }}>
                  <ResultCard result={lastResult} onResolve={resolveFlag} canResolve={canSupervise} />
                </div>
              )}

              {/* Bottom-left, under the last pass: the order's history, where the hand already is. */}
              {sessionStarted && (
                <div style={{ padding: "8px 14px", borderTop: "1px solid #21262d", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                  <button onClick={() => setShowHistory(true)} title="Every jersey scanned this order, latest first — flag one after the fact" style={{ ...btnGhost, padding: "7px 16px", fontSize: 15, fontWeight: 700 }}>🕘 History ({log.filter(l => l.match && (l.status === S_PASS || l.status === S_FLAGGED || l.status === S_MANUAL)).length})</button>
                  {binMap && <button onClick={() => setShowBins(true)} title="A bin is full: close it, print the list of what is in it, and carry on in a new bin" style={{ ...btnGhost, padding: "7px 16px", fontSize: 15, fontWeight: 700, whiteSpace: "nowrap", ...(heavyBin ? { background: "#b91c1c", borderColor: "#ef4444", color: "#fff" } : { borderColor: "#f59e0b", color: "#fcd34d" }) }}>{heavyBin ? `📦 Bin ${heavyBin.bin} ~${Math.round(heavyBin.weight)} lb — close it` : "📦 Bin full"}</button>}
                  <span style={{ fontSize: 13, color: "#7c8ba1" }}>Every jersey scanned this order — flag one after the fact</span>
                </div>
              )}

            </>
          )}
        </div>

        {/* RIGHT: Info panel — on a wide screen the result screen takes this half so the camera stays in view */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0, position: "relative" }}>
          {overlay && wide && (
            <ScanOverlay key={overlayKey} inspect={inspect} embedded state={overlay} actions={actions} binMap={binMap} extraCols={extraCols} notes={notes} jerseyType={jerseyType} confirmKey={confirmKey} cancelKey={cancelKey} upKey={upKey} retryKey={retryKey} byHandKey={byHandKey} ticket={overlay?.mode === "supervisor" ? ticketFor(overlay.entryId) : null} reprintTicket={reprintTicket} onTrial={onTrial}
              stream={null} rotation={settings.rotation} canPhoto={cameraOn && inputMode === "camera"} />
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", borderBottom: "1px solid #21262d", flexShrink: 0 }}>
            {[
              { label: "Done",      value: `${scannedRows.length} / ${roster.length}`, color: "#e2e8f0" },
              { label: "Remaining", value: remaining,  color: remaining === 0 ? "#22c55e" : "#f59e0b" },
              { label: "Open",      value: openCount,  color: openCount > 0 ? "#ef4444" : "#64748b" },
              { label: "ETA",       value: etaMin ? `${etaMin}m` : "—", color: "#64748b" },
            ].map(s => (
              <div key={s.label} style={{ padding: "14px 0 12px", textAlign: "center", borderRight: "1px solid #21262d" }}>
                <div style={{ fontFamily: FONT_DISPLAY, fontSize: 54, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 15, color: "#94a3b8", marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", borderBottom: "1px solid #21262d", flexShrink: 0 }}>
            {["roster", "log"].map(v => (
              <button key={v} onClick={() => setView(v)} style={{ flex: 1, padding: "11px 0", border: "none", background: "transparent", color: view === v ? "#3b82f6" : "#64748b", fontWeight: 700, fontSize: 16, borderBottom: view === v ? "2px solid #3b82f6" : "2px solid transparent", cursor: "pointer", textTransform: "capitalize" }}>
                {v === "log" ? `Log (${log.length})` : `Roster (${roster.length})`}
              </button>
            ))}
            {canSupervise && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 12px", borderLeft: "1px solid #21262d", flexWrap: "wrap" }}>
              {roster.length > 0 && (
                <>
                  <button onClick={() => addRef.current.click()} title="Append another roster file to this order" style={{ ...btnGhost, padding: "6px 12px", fontSize: 14 }}>+ Add</button>
                  <input ref={addRef} type="file" accept=".csv,.xlsx,.xls,.tsv,.txt" style={{ display: "none" }} onChange={handleRosterAdd} />
                  <button onClick={() => rosterRef.current.click()} title="Replace the roster (scans stay in the log)" style={{ ...btnGhost, padding: "6px 12px", fontSize: 14 }}>Replace</button>
                  <input ref={rosterRef} type="file" accept=".csv,.xlsx,.xls,.tsv,.txt" style={{ display: "none" }} onChange={handleRosterUpload} />
                  <button onClick={() => exportRosterXLSX(roster, log, exportMeta, rosterCols, binOf)}
                    style={{ ...btnPri, padding: "6px 14px", fontSize: 14, background: rosterComplete ? "#22c55e" : "#3b82f6" }}>
                    {rosterComplete ? "✅ Export" : "⬇ Export"}
                  </button>
                  {log.some(l => l.status === S_FLAGGED) && (
                    <button onClick={() => exportDamageReportXLSX(buildDamageRows(log, { operatorName, orderNumber, jerseyType, typeLabel: jerseyTypeLabel }), { name: orderNumber || "order", title: `Damage report — order ${orderNumber || "—"}${jerseyType ? " · " + jerseyTypeLabel(jerseyType) : ""}` }).catch(e => setError(e.message))}
                      title="Every flagged jersey of this order with its photo, as Excel" style={{ ...btnGhost, padding: "6px 14px", fontSize: 14, borderColor: "#ef4444", color: "#f87171" }}>⬇ Damage report</button>
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
                <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 10, padding: "6px 14px", background: "#161b22", borderBottom: "1px solid #21262d", fontSize: 15, flexWrap: "wrap" }}>
                  <span style={{ color: "#94a3b8", fontWeight: 700 }}>Sort by</span>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {ROSTER_SORTS.filter(s => s.id !== "bin" || binMap).map(s => (
                      <button key={s.id} onClick={() => setRosterSort(s.id)} title={s.id === "size" ? "Rack order: youth before adult, XS before 3XL" : s.id === "status" ? "Done on top: passed, by hand, flagged, missing, short, then still to scan — the toggle turns it round" : undefined}
                        style={{ ...btnGhost, padding: "3px 12px", fontSize: 14, borderColor: rosterSort === s.id ? "#60a5fa" : "#334155", color: rosterSort === s.id ? "#fff" : "#94a3b8", background: rosterSort === s.id ? "rgba(96,165,250,0.15)" : "transparent", fontWeight: rosterSort === s.id ? 800 : 500 }}>{s.label}</button>
                    ))}
                  </div>
                  {rosterSort === "status" && (
                    <button onClick={() => setDoneFirst(d => !d)} title="Which end of the list the finished jerseys sit at" style={{ ...btnGhost, padding: "3px 12px", fontSize: 14, borderColor: "#f59e0b", color: "#fcd34d" }}>{doneFirst ? "✓ Done on top" : "— To do on top"} ⇅</button>
                  )}
                  {(() => { const ch = rosterChoices(roster); return (ch.sizes.length > 1 || ch.teams.length > 1) && (
                    <span style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 6 }}>
                      <span style={{ color: "#94a3b8", fontWeight: 700 }}>Show</span>
                      {ch.sizes.length > 1 && (
                        <select value={sizeFilter} onChange={e => setSizeFilter(e.target.value)} title="Only this size" style={{ background: "#1e293b", color: sizeFilter ? "#fbbf24" : "#cbd5e1", border: `1px solid ${sizeFilter ? "#f59e0b" : "#3f4b5c"}`, borderRadius: 6, fontSize: 14, padding: "4px 8px", fontWeight: sizeFilter ? 800 : 500 }}>
                          <option value="">All sizes</option>
                          {ch.sizes.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      )}
                      {ch.teams.length > 1 && (
                        <select value={teamFilter} onChange={e => setTeamFilter(e.target.value)} title="Only this team or colour" style={{ background: "#1e293b", color: teamFilter ? "#93c5fd" : "#cbd5e1", border: `1px solid ${teamFilter ? "#3b82f6" : "#3f4b5c"}`, borderRadius: 6, fontSize: 14, padding: "4px 8px", fontWeight: teamFilter ? 800 : 500 }}>
                          <option value="">All teams</option>
                          {ch.teams.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      )}
                    </span>
                  ); })()}
                  {(rosterFilter || sizeFilter || teamFilter) && (
                    <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, fontWeight: 700, color: rosterFilter === "pass" ? "#22c55e" : rosterFilter === "flag" ? "#f87171" : rosterFilter ? "#fbbf24" : "#cbd5e1" }}>
                      <span>{shownRows.length} {rosterFilter === "pass" ? "passed" : rosterFilter === "flag" ? "flagged" : rosterFilter ? "by hand" : "shown"}{sizeFilter ? ` · ${sizeFilter}` : ""}{teamFilter ? ` · ${teamFilter}` : ""}</span>
                      <button onClick={() => { setRosterFilter(null); setSizeFilter(""); setTeamFilter(""); }} style={{ ...btnGhost, padding: "3px 10px", fontSize: 13 }}>Show all</button>
                    </span>
                  )}
                </div>
              )}
              <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
              {roster.length === 0
                ? <div style={{ padding: 32, textAlign: "center", color: "#94a3b8", fontSize: 17 }}>No roster loaded.</div>
                : (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 18 }}>
                    <thead style={{ position: "sticky", top: 0, background: "#161b22", zIndex: 1 }}>
                      <tr>
                        <th style={thSt}>Status</th>
                        {rosterCols.map(c => <th key={c} style={thSt}>{cap(c)}</th>)}
                        {binMap && <th style={thSt}>Bin</th>}
                        <th style={thSt}>Mark</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shownRows.map(r => <RosterRow key={r._id} r={r} cols={rosterColsStable} hasBins={!!binMap} bin={binMap ? binOf(r) : null} canSupervise={canSupervise} onMark={onMarkRow} />)}
                    </tbody>
                  </table>
                )
              }
              </div>
            </div>
          )}

          {view === "log" && (
            <div style={{ flex: 1, overflowY: "auto", padding: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 15, color: "#94a3b8" }}>{log.length} scans this session</span>
                {canSupervise && log.length > 0 && <button onClick={() => exportLogCSV(log, orderNumber, binOf)} style={{ ...btnGhost, fontSize: 14, padding: "6px 12px" }}>⬇ Export log</button>}
              </div>
              {log.length === 0
                ? <div style={{ textAlign: "center", padding: 28, color: "#94a3b8", fontSize: 17 }}>No scans yet.</div>
                : log.map(l => (
                  <div key={l.id} style={{ ...card, borderLeft: `3px solid ${statusColor(l.status)}`, padding: "10px 12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      {(l.photo || l.thumb) && <img src={l.photo || l.thumb} alt="" title={l.photo ? "Photo kept for the supervisor — click to enlarge" : ""} onClick={l.photo ? () => setBigPhoto(l.photo) : undefined} style={{ width: l.photo ? 72 : 48, height: l.photo ? 54 : 36, objectFit: "cover", borderRadius: 4, flexShrink: 0, cursor: l.photo ? "zoom-in" : "default", border: l.photo ? "1px solid #ef4444" : "none" }} />}
                      {(l.damagePhotos || []).map((p, i) => <img key={i} src={p} alt="" title="Damage photo — click to enlarge" onClick={() => setBigPhoto(p)} style={{ width: 72, height: 54, objectFit: "cover", borderRadius: 4, flexShrink: 0, cursor: "zoom-in", border: "2px solid #ef4444" }} />)}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: statusColor(l.status) }}>{cap(l.status)}</span>
                        <div style={{ fontWeight: 700, fontSize: 18, marginTop: 2 }}>Read: #{l.detected?.number || "?"} · {l.detected?.name || "—"}</div>
                        {l.match && (
                          <div style={{ fontSize: 15, color: "#cbd5e1", marginTop: 2 }}>
                            Matched: {l.match.name || "—"} #{l.match.number}{l.match.size ? ` · ${l.match.size}` : ""}{l.match.team ? ` · ${l.match.team}` : ""}{binOf(l.match) !== null ? ` · Bin ${binOf(l.match)}` : ""}
                          </div>
                        )}
                        {l.reason     && <div style={{ fontSize: 15, color: "#fbbf24", marginTop: 3 }}>⚠ {l.reason}</div>}
                        {l.resolution && <div style={{ fontSize: 15, color: "#cbd5e1", marginTop: 3 }}>Resolution: {l.resolution}</div>}
                      </div>
                      <div style={{ fontSize: 13, color: "#7c8ba1", whiteSpace: "nowrap", textAlign: "right", lineHeight: 1.5 }}>{l.timestamp}<br />{l.operator}</div>
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
