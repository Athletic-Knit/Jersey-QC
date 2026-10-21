import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { parseCSV, parseExcel, buildBinMap, binFor, binEntries, displayColumns, extraColumns, CORE_COLUMNS } from "./lib/roster.js";
import { findMatches, differingFields, isDone } from "./lib/match.js";
import { exportRosterXLSX, exportLogCSV, exportDaySheetXLSX, localTimeStamp } from "./lib/export.js";
import { saveSession, loadSession, clearSession, saveSettings, loadSettings, saveSignIn, loadSignIn, clearSignIn, shrinkDataUrl, downscaleImage, frameForUpload, cropDataUrl } from "./lib/persist.js";
import { buildDamageRows, exportDamageReportXLSX } from "./lib/damage.js";
import { playTone } from "./lib/audio.js";
import { readJersey } from "./lib/vision.js";
import { sampleFrame, createMotionGate } from "./lib/motion.js";
import { hub, stationId, snapshotOf, stationUse } from "./lib/hub.js";
import { useVoice } from "./useVoice.js";
import { VoiceBadge, VoiceLegend } from "./VoiceBadge.jsx";
import { speak } from "./lib/voice.js";
const SECOND_LOOK = false;
import { MODEL, EFFORT, THINKING, SEND_MAX_PX, CHECKLIST, REASONS, JERSEY_TYPES, jerseyTypeOf, jerseyTypeLabel, reasonsFor, ROLES, STATIONS, stationOf, PIN_REQUIRED, DEFAULT_SETTINGS } from "./config.js";

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
const btnPri   = { padding: "8px 18px", borderRadius: 8, border: "none", background: "#3b82f6", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" };
const btnGhost = { padding: "6px 12px", borderRadius: 8, border: "1px solid #334155", background: "transparent", color: "#94a3b8", fontWeight: 600, fontSize: 12, cursor: "pointer" };
const btnSm    = { padding: "5px 12px", borderRadius: 6, fontWeight: 600, fontSize: 12, cursor: "pointer" };
const codeSt   = { background: "#1e293b", padding: "1px 6px", borderRadius: 4, fontSize: 12 };
const thSt     = { padding: "6px 8px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 };
const tdSt     = { padding: "6px 8px", color: "#e2e8f0", fontSize: 12 };
const inputSt  = { width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 8, border: "1px solid #334155", background: "#1e293b", color: "#e2e8f0", fontSize: 14 };
const labelSt  = { fontSize: 11, color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 5 };
const modalBg   = { position: "fixed", inset: 0, background: "#0d1117", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", overflowY: "auto" };
const modalCard = { background: "#161b22", borderRadius: 16, border: "1px solid #21262d", padding: 36, width: 440, maxWidth: "90vw" };
const errSt     = { fontSize: 12, color: "#f87171", marginBottom: 12, padding: "8px 12px", background: "rgba(239,68,68,0.08)", borderRadius: 6 };
const bigBtn    = { width: "100%", padding: "13px", borderRadius: 10, border: "none", background: "#3b82f6", color: "#fff", fontWeight: 700, fontSize: 16, cursor: "pointer" };

function statusColor(s) {
  if (s === S_PASS)    return "#22c55e";
  if (s === S_FLAGGED) return "#ef4444";
  if (s === S_MANUAL)  return "#94a3b8";
  if (s === "undo")    return "#f59e0b";
  return "#64748b";
}

function Pill({ color, children }) {
  return (
    <span style={{ background: `${color}22`, color, fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 20, border: `1px solid ${color}44` }}>
      {children}
    </span>
  );
}

function Kbd({ light, children }) {
  return (
    <kbd style={{ background: light ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.2)", padding: "2px 7px", borderRadius: 5, fontSize: 12, fontFamily: "monospace" }}>
      {children}
    </kbd>
  );
}

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

// ── Resume modal ──────────────────────────────────────────────────────────────
function ResumeModal({ session, onResume, onDiscard }) {
  const done = session.roster.filter(r => r.scanned && r.scanned !== false).length;
  return (
    <div style={{ position: "fixed", inset: 0, background: "#0d1117", zIndex: 2100, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#161b22", borderRadius: 16, border: "2px solid #3b82f6", padding: 36, width: 440, maxWidth: "90vw", textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>🔄</div>
        <div style={{ fontWeight: 900, fontSize: 22, marginBottom: 6 }}>Resume order {session.orderNumber || "—"}?</div>
        <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 4 }}>
          {done} of {session.roster.length} jerseys done · {session.log.length} scans · {session.operatorName || "unknown operator"}
        </div>
        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 24 }}>Saved {new Date(session.savedAt).toLocaleString()}</div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button onClick={onResume} style={{ ...btnPri, fontSize: 15, padding: "12px 28px" }}>▶ Resume</button>
          <button onClick={onDiscard} style={{ ...btnGhost, fontSize: 14, padding: "12px 20px" }}>Start a new order</button>
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
const roleOfStation = id => stationOf(id) ? "inspector" : id === "packing" ? "packer" : id === "supervisor" ? "supervisor" : "";
const pageFor = (role, station) => role === "inspector" ? station : role === "packer" ? "packing" : "supervisor";

function SignInModal({ onSignIn, initial, onCancel, title }) {   // onCancel + title: hand the station to another operator without losing the order
  const here = urlStation();
  const [role,    setRole]    = useState(roleOfStation(here) || initial?.role || "inspector");
  const [station, setStation] = useState(stationOf(here) ? here : STATIONS[0].id);
  const [pin,   setPin]   = useState("");
  const [name,  setName]  = useState(initial?.name || "");
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
    if (role === "inspector" && !onCancel && busyBy(station)) { setError(`${stDef.label} is in use by ${busyBy(station)} on another PC. Pick a free station — or use Change operator on that PC to take it over.`); return; }
    if (target !== here && !onCancel) { goToStation(target); return; }
    onSignIn({ role, name: name.trim(), station: target });
  };
  const onEnter = e => { if (e.key === "Enter") submit(); };

  return (
    <div style={modalBg}>
      <div style={modalCard}>
        <div style={{ fontSize: 32, marginBottom: 6, textAlign: "center" }}>🏭</div>
        <div style={{ fontWeight: 900, fontSize: 22, textAlign: "center", marginBottom: 2 }}>Jersey QC Scanner</div>
        <div style={{ fontSize: 13, color: "#64748b", textAlign: "center", marginBottom: 22 }}>{title || "Sign in once per shift"}</div>
        <div style={{ marginBottom: 12 }}>
          <label style={labelSt}>Role</label>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${ROLE_CHOICES.length},1fr)`, gap: 6 }}>
            {ROLE_CHOICES.map(r => (
              <button key={r.id} onClick={() => pickRole(r)} disabled={!!onCancel && r.id !== role}
                style={{ ...btnGhost, padding: "8px 4px", fontSize: 12, borderColor: role === r.id ? "#3b82f6" : "#334155", color: role === r.id ? "#fff" : "#94a3b8", background: role === r.id ? "rgba(59,130,246,0.18)" : "transparent", opacity: onCancel && r.id !== role ? 0.4 : 1 }}>
                {r.label}
              </button>
            ))}
          </div>
        </div>
        {role === "inspector" && (
          <div style={{ marginBottom: 12 }}>
            <label style={labelSt}>Which station?</label>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${STATIONS.length},1fr)`, gap: 6 }}>
              {STATIONS.map(s => { const by = busyBy(s.id); return (
                <button key={s.id} onClick={() => pickStation(s.id)} disabled={!!onCancel && s.id !== station} title={by ? `In use by ${by} on another PC` : ""}
                  style={{ ...btnGhost, padding: "8px 4px", fontSize: 12, borderColor: station === s.id ? (by ? "#ef4444" : "#60a5fa") : by ? "#7f1d1d" : "#334155", color: station === s.id ? "#fff" : by ? "#f87171" : "#94a3b8", background: station === s.id ? (by ? "rgba(239,68,68,0.14)" : "rgba(96,165,250,0.16)") : "transparent", opacity: onCancel && s.id !== station ? 0.4 : 1 }}>
                  {s.label}{by && <div style={{ fontSize: 10, fontWeight: 400, color: "#f87171", marginTop: 2 }}>in use · {by}</div>}
                </button>
              ); })}
            </div>
            <div style={{ fontSize: 11, color: "#475569", marginTop: 6 }}>{busyBy(station) ? <span style={{ color: "#f87171" }}>{stDef?.label} is in use by {busyBy(station)} on another PC right now.</span> : <>Each station has its own PIN. The supervisor's board shows this page as {stDef?.label}.</>}</div>
          </div>
        )}
        {PIN_REQUIRED && (
          <div style={{ marginBottom: 12 }}>
            <label style={labelSt}>PIN</label>
            <input type="password" inputMode="numeric" value={pin} onChange={e => setPin(e.target.value)} placeholder="••••" autoFocus onKeyDown={onEnter} style={inputSt} />
          </div>
        )}
        <div style={{ marginBottom: 18 }}>
          <label style={labelSt}>Your name</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. John Smith" autoFocus={!PIN_REQUIRED} onKeyDown={onEnter} style={inputSt} />
        </div>
        {error && <div style={errSt}>{error}</div>}
        <button onClick={submit} style={bigBtn}>{onCancel ? "Take over →" : "Sign in →"}</button>
        {onCancel && <button onClick={onCancel} style={{ ...btnGhost, width: "100%", marginTop: 8 }}>← Back, keep the current operator</button>}
      </div>
    </div>
  );
}

// ── Order setup (every order; no PIN) ─────────────────────────────────────────
// ECHL / ECHL replica / Sublimated as buttons; "" = not set.
function JerseyTypePicker({ value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {JERSEY_TYPES.map(t => (
        <button key={t.id} type="button" onClick={() => onChange(value === t.id ? "" : t.id)} title={t.hint}
          style={{ ...btnGhost, padding: "6px 12px", fontSize: 13, borderColor: value === t.id ? "#60a5fa" : "#30363d", background: value === t.id ? "rgba(96,165,250,0.15)" : "transparent", color: value === t.id ? "#93c5fd" : "#cbd5e1", fontWeight: value === t.id ? 700 : 400 }}>
          {t.label} <span style={{ fontSize: 11, color: "#64748b", fontWeight: 400 }}>· {t.construction}</span>
        </button>
      ))}
    </div>
  );
}

function OrderSetupModal({ operatorName, role, xlsxReady, onStart, onSignOut, onSupervisor }) {
  const [order,   setOrder]   = useState("");
  const [notes,   setNotes]   = useState("");
  const [jerseyType, setJerseyType] = useState("");
  const [file,    setFile]    = useState(null);
  const [error,   setError]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [hubRosters, setHubRosters] = useState([]);
  const [picked,  setPicked]  = useState(null);     // a roster the supervisor sent
  const fileRef = useRef(null);

  // Rosters the supervisor has sent to the hub, if a hub is running.
  useEffect(() => {
    let on = true;
    // Only rosters sent to this station, or to any station — checked every few
    // seconds, so an order the supervisor sends while this screen is open appears by itself.
    const mine = stationId();
    const load = () => hub.rosters().then(r => { if (on) setHubRosters((r.rosters || []).filter(x => !x.forStation || x.forStation === mine)); }).catch(() => {});
    load();
    const t = setInterval(load, 5000);
    return () => { on = false; clearInterval(t); };
  }, []);

  const handleFile = (e) => { const f = e.target.files[0]; if (f) { setFile(f); setPicked(null); setError(null); } e.target.value = ""; };

  const pickRoster = async (summary) => {
    try {
      const full = await hub.roster(summary.id);
      setPicked(full); setFile(null); setError(null);
      setOrder(full.orderNumber || ""); setNotes(full.notes || ""); setJerseyType(full.jerseyType || "");
    } catch (e) { setError("Could not fetch that roster: " + e.message); }
  };

  const canSupervise = role === "supervisor" || role === "admin";
  const handleStart = async () => {
    if (canSupervise && !order.trim()) { setError("Please enter an order number."); return; }
    if (!file && !picked) { setError(canSupervise ? "Upload a roster file, or pick one the supervisor sent." : "Pick the order the supervisor sent, or load a roster file."); return; }
    setLoading(true);
    try {
      if (picked) { onStart({ roster: picked.rows, orderNumber: order.trim(), notes: notes.trim(), jerseyType, rosterFile: `${picked.fileName || "roster"} (from ${picked.by || "supervisor"})` }); return; }
      const isExcel = /\.(xlsx|xls)$/i.test(file.name);
      const parsed  = isExcel ? await parseExcel(file) : parseCSV(await file.text());
      if (parsed.length === 0) { setError("No valid rows found. The file needs a header row with name and/or number columns."); setLoading(false); return; }
      onStart({ roster: parsed, orderNumber: order.trim(), notes: notes.trim(), jerseyType, rosterFile: file.name });
    } catch (err) {
      setError("Failed to parse roster: " + err.message);
      setLoading(false);
    }
  };
  const onEnter = e => { if (e.key === "Enter") handleStart(); };

  return (
    <div style={modalBg}>
      <div style={modalCard}>
        <div style={{ fontSize: 32, marginBottom: 6, textAlign: "center" }}>📋</div>
        <div style={{ fontWeight: 900, fontSize: 22, textAlign: "center", marginBottom: 2 }}>Set up the order</div>
        <div style={{ fontSize: 13, color: "#64748b", textAlign: "center", marginBottom: 22, display: "flex", gap: 8, justifyContent: "center", alignItems: "center", flexWrap: "wrap" }}>
          <span>{operatorName} · {cap(role || "")}</span>
          {canSupervise && <button onClick={onSupervisor} style={{ ...btnGhost, padding: "1px 8px", fontSize: 11, borderColor: "#f59e0b", color: "#fcd34d" }}>Supervisor view</button>}
          <button onClick={onSignOut} style={{ ...btnGhost, padding: "1px 8px", fontSize: 11 }}>Sign out</button>
        </div>
        {hubRosters.length === 0 && (
          <div style={{ marginBottom: 14, padding: "10px 12px", borderRadius: 8, border: "1px dashed #334155", color: "#94a3b8", fontSize: 13, textAlign: "center" }}>
            <span style={{ color: "#60a5fa" }}>●</span> Waiting for the supervisor to send an order — it will appear here by itself. Or load a roster file below.
          </div>
        )}
        {hubRosters.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <label style={labelSt}>From the supervisor</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 150, overflowY: "auto" }}>
              {hubRosters.map(r => (
                <button key={r.id} onClick={() => pickRoster(r)}
                  style={{ ...btnGhost, textAlign: "left", padding: "8px 12px", borderColor: picked?.id === r.id ? "#22c55e" : "#334155", color: picked?.id === r.id ? "#fff" : "#94a3b8", background: picked?.id === r.id ? "rgba(34,197,94,0.12)" : "transparent" }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>Order {r.orderNumber || "—"} <span style={{ fontWeight: 400, color: "#64748b" }}>· {r.rowCount} jerseys · {r.fileName}{r.jerseyType ? ` · ${jerseyTypeLabel(r.jerseyType)}` : ""}</span>{r.forStation && <span style={{ fontWeight: 700, color: "#60a5fa", marginLeft: 8 }}>for this station</span>}</div>
                  <div style={{ fontSize: 11, color: "#64748b" }}>{r.by ? `sent by ${r.by} · ` : ""}{new Date(r.createdAt).toLocaleString()}</div>
                </button>
              ))}
            </div>
          </div>
        )}
        <div style={{ marginBottom: 12 }}>
          <label style={labelSt}>Order number{!canSupervise && <span style={{ color: "#475569", textTransform: "none", fontWeight: 400 }}> — set by the supervisor</span>}</label>
          {canSupervise
            ? <input value={order} onChange={e => setOrder(e.target.value)} placeholder="e.g. 25" autoFocus onKeyDown={onEnter} style={inputSt} />
            : <div title="Only the supervisor can set the order number" style={{ ...inputSt, color: order ? "#e2e8f0" : "#64748b", cursor: "not-allowed", userSelect: "none" }}>{order || (picked || file ? "No order number" : "Pick the order the supervisor sent")}</div>}
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={labelSt}>Order notes <span style={{ color: "#475569", textTransform: "none", fontWeight: 400 }}>— remarks from the order paper, shown on every jersey</span></label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. sponsor logo left sleeve · captain C on #19" rows={2} style={{ ...inputSt, resize: "vertical", fontSize: 13 }} />
          <label style={{ ...labelSt, marginTop: 10 }}>Jersey type <span style={{ color: "#475569", textTransform: "none", fontWeight: 400 }}>— sets the "not right" menu and the reports</span></label>
          <JerseyTypePicker value={jerseyType} onChange={setJerseyType} />
        </div>
        <div style={{ marginBottom: 18 }}>
          <label style={labelSt}>{hubRosters.length ? "Or a roster file" : "Roster file"}</label>
          <div onClick={() => fileRef.current.click()}
            style={{ padding: "10px 12px", borderRadius: 8, border: `1px solid ${file ? "#22c55e" : "#334155"}`, background: "#1e293b", color: file ? "#22c55e" : "#64748b", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16 }}>{file ? "✓" : "📂"}</span>
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
function LivePreview({ stream, rotation }) {
  const ref = useRef(null);
  useEffect(() => {
    const v = ref.current; if (!v || !stream) return;
    v.srcObject = stream; v.play().catch(() => {});
    return () => { v.srcObject = null; };
  }, [stream]);
  if (!stream) return null;
  return (
    <div style={{ position: "absolute", bottom: 12, right: 12, width: "clamp(220px, 26vw, 380px)", borderRadius: 10, overflow: "hidden", border: "2px solid rgba(255,255,255,0.35)", background: "#000", boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }}>
      <div style={{ aspectRatio: "4 / 3", overflow: "hidden" }}>
        <video ref={ref} autoPlay muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover", transform: `rotate(${rotation || 0}deg)`, display: "block" }} />
      </div>
      <div style={{ position: "absolute", top: 6, left: 8, fontSize: 11, fontWeight: 700, color: "#fff", background: "rgba(0,0,0,0.55)", padding: "2px 7px", borderRadius: 10 }}>● Live — line up the next jersey</div>
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
      <div style={{ fontSize: 15, color: "#c4b5fd", textAlign: "center", marginBottom: 18, opacity: 0.9 }}>A few words — the supervisor reads exactly this and decides where it goes.</div>
      <input value={text} onChange={e => setText(e.target.value)} onKeyDown={onKey} autoFocus placeholder="e.g. hole under the left arm" maxLength={120} style={{ ...inputSt, fontSize: 22, padding: "12px 14px", marginBottom: 14 }} />
      <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
        <button disabled={!text.trim()} onClick={() => onSubmit(text)} style={{ ...bigBtn, width: "auto", padding: "12px 28px", background: "#a78bfa", color: "#0d1117", opacity: text.trim() ? 1 : 0.5 }}>✓ Send to supervisor <Kbd>Enter</Kbd></button>
        <button onClick={onBack} style={{ ...btnGhost, fontSize: 15, padding: "12px 20px" }}>← Back <Kbd light>Esc</Kbd></button>
      </div>
    </div>
  );
}

// ── Manual entry: the camera could not read it, or it is not on the roster ───
function ManualEntryForm({ detected, teams, onSubmit, onBack }) {
  const [number, setNumber] = useState(detected?.number || "");
  const [name,   setName]   = useState(detected?.name || "");
  const [size,   setSize]   = useState("");
  const [team,   setTeam]   = useState(teams[0] || "");
  const [error,  setError]  = useState(null);

  const submit = () => {
    if (!number.trim() && !name.trim()) { setError("Enter at least a number or a name."); return; }
    onSubmit({ number: number.trim(), name: name.trim(), size: size.trim(), team: team.trim() });
  };
  const onKey = e => {
    if (e.key === "Enter")  { e.preventDefault(); submit(); }
    if (e.key === "Escape") { e.preventDefault(); onBack(); }
  };
  const field = { ...inputSt, fontSize: 22, padding: "12px 14px" };

  return (
    <div style={{ width: "100%", maxWidth: 560, padding: "0 24px", boxSizing: "border-box" }}>
      <div style={{ fontSize: 56, textAlign: "center", lineHeight: 1 }}>✍</div>
      <div style={{ fontSize: "clamp(26px, 4vw, 40px)", fontWeight: 900, color: "#f59e0b", textAlign: "center", marginBottom: 6 }}>Enter the jersey by hand</div>
      <div style={{ fontSize: 15, color: "#fcd34d", textAlign: "center", marginBottom: 18, opacity: 0.9 }}>Type what is printed on the back. On the roster: it passes as MANUAL and the supervisor signs it off. Not on the roster: nothing is added — it goes to the supervisor now.</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10, marginBottom: 10 }}>
        <div><label style={labelSt}>Number</label><input value={number} onChange={e => setNumber(e.target.value)} onKeyDown={onKey} autoFocus inputMode="numeric" placeholder="##" style={field} /></div>
        <div><label style={labelSt}>Name</label><input value={name} onChange={e => setName(e.target.value)} onKeyDown={onKey} placeholder="as printed" style={field} /></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
        <div><label style={labelSt}>Size</label><input value={size} onChange={e => setSize(e.target.value)} onKeyDown={onKey} placeholder="e.g. A-L" style={field} /></div>
        <div>
          <label style={labelSt}>Team</label>
          <input list="manual-teams" value={team} onChange={e => setTeam(e.target.value)} onKeyDown={onKey} placeholder="team" style={field} />
          <datalist id="manual-teams">{teams.map(t => <option key={t} value={t} />)}</datalist>
        </div>
      </div>
      {error && <div style={errSt}>{error}</div>}
      <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
        <button onClick={submit} style={{ ...bigBtn, width: "auto", padding: "12px 28px", background: "#f59e0b", color: "#0d1117" }}>✓ Save <Kbd>Enter</Kbd></button>
        <button onClick={onBack} style={{ ...btnGhost, fontSize: 15, padding: "12px 20px" }}>← Back <Kbd light>Esc</Kbd></button>
      </div>
    </div>
  );
}

// ── Order view for the supervisor: the roster with every jersey's status, and
// the order's log, read from the hub's day ledger. Works for finished orders
// and for ones still running, without touching the station.
// A flag photo, large, until a click or Esc.
function PhotoLightbox({ src, onClose }) {
  useEffect(() => { const h = e => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }; window.addEventListener("keydown", h, true); return () => window.removeEventListener("keydown", h, true); }, [onClose]);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 3000, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "zoom-out" }}>
      <img src={src} alt="Flagged jersey" style={{ maxWidth: "92vw", maxHeight: "92vh", borderRadius: 8, boxShadow: "0 12px 48px rgba(0,0,0,0.8)" }} />
    </div>
  );
}

function OrderView({ station, order, stationLabel, onClose, onDownload, onPhoto = () => {} }) {
  const [data, setData] = useState(null);     // { rec, events }
  const [tab,  setTab]  = useState("roster");
  const [err,  setErr]  = useState(null);
  useEffect(() => {
    let on = true;
    const load = () => hub.ledger().then(l => {
      if (!on) return;
      const rec = (l.orders || []).find(x => x.station === station && x.order === order);
      const events = (l.events || []).filter(e => e.station === station && e.order === order).sort((a, b) => String(b.t).localeCompare(String(a.t)));
      setData({ rec, events });
    }).catch(() => on && setErr("Could not fetch this order from the hub."));
    load();
    const t = setInterval(load, 5000);   // a running order keeps updating
    return () => { on = false; clearInterval(t); };
  }, [station, order]);
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
                      <td style={{ ...td, color: "#60a5fa" }}>{rec.bins && binFor(rec.bins, r.team) !== null ? `Bin ${binFor(rec.bins, r.team)}` : ""}</td>
                      <td style={{ ...td, color: "#cbd5e1" }}>{e?.reason || ""}{e?.resolution ? <div style={{ color: "#94a3b8", fontSize: 12 }}>→ {e.resolution}</div> : null}</td>
                      <td style={{ ...td, color: "#64748b", fontSize: 12, whiteSpace: "nowrap" }}>{e ? `${e.operator || ""} · ${String(e.t).slice(11)}` : ""}</td>
                      {tab === "problems" && <td style={td}>{e?.photo && <img src={e.photo} alt="" onClick={() => onPhoto(e.photo)} title="Click to enlarge" style={{ width: 80, height: 60, objectFit: "cover", borderRadius: 4, cursor: "zoom-in" }} />}</td>}
                    </tr>
                  );
                })}
                {tab === "problems" && offRoster.map((e, i) => (
                  <tr key={"off" + i} style={{ background: "rgba(239,68,68,0.07)" }}>
                    <td style={{ ...td, color: "#ef4444", fontWeight: 700, whiteSpace: "nowrap" }}>NOT ON ROSTER</td>
                    <td style={td}>{e.name || "—"}</td><td style={{ ...td, fontWeight: 700 }}>{e.number}</td><td style={td}>{e.team || ""}</td><td style={{ ...td, color: "#fcd34d" }}>{e.size || ""}</td><td style={td}></td>
                    <td style={{ ...td, color: "#cbd5e1" }}>{e.reason}{e.resolution ? <div style={{ color: "#94a3b8", fontSize: 12 }}>→ {e.resolution}</div> : null}</td>
                    <td style={{ ...td, color: "#64748b", fontSize: 12, whiteSpace: "nowrap" }}>{e.operator || ""} · {String(e.t).slice(11)}</td>
                    <td style={td}>{e.photo && <img src={e.photo} alt="" onClick={() => onPhoto(e.photo)} title="Click to enlarge" style={{ width: 80, height: 60, objectFit: "cover", borderRadius: 4, cursor: "zoom-in" }} />}</td>
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

function SupervisorPanel({ operatorName, onClose }) {
  const [data,    setData]    = useState(() => ({ stations: [], now: Date.now() }));
  const [rosters, setRosters] = useState([]);
  const [orders,  setOrders]  = useState([]);     // every order any station worked today (from the hub's ledger)
  const [openOrder, setOpenOrder] = useState(null);   // { station, order } shown in the order view
  useEffect(() => {
    const load = () => hub.ledger().then(l => setOrders(l.orders || [])).catch(() => {});
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, []);
  // The same QC Results workbook the station exports, built from what the hub holds.
  const downloadOrderSheet = (o) => hub.ledger().then(l => {
    const rec = (l.orders || []).find(x => x.station === o.station && x.order === o.order) || o;
    const rows = rec.rows || [];
    if (!rows.length) { setMsg(`The hub has no jersey list for order ${o.order} on ${stationLabel(o.station)} — that station last reported before today's update, or the order was done before it. Press Export on the station for its sheet; reload the station page so future orders come through.`); return; }
    const log = (l.events || []).filter(e => e.station === rec.station && e.order === rec.order).map(e => ({ match: { _id: e.rowId }, reason: e.reason, resolution: e.resolution, operator: e.operator, timestamp: e.t }));
    exportRosterXLSX(rows, log, { orderNumber: rec.order, operatorName: rec.operator, notes: rec.notes || "", jerseyType: jerseyTypeLabel(rec.jerseyType) }, displayColumns(rows), team => binFor(rec.bins, team));
  }).catch(() => setMsg("Could not fetch that order from the hub."));
  const [order,   setOrder]   = useState("");
  const [notes,   setNotes]   = useState("");
  const [jerseyType, setJerseyType] = useState("");
  const [file,    setFile]    = useState(null);
  const [target,  setTarget]  = useState("");     // station id to send the roster to; "" = any station may take it
  const [msg,     setMsg]     = useState(null);
  const [alerts,  setAlerts]  = useState([]);     // toasts for flags that just happened; each shows ~12 s
  const TOAST_MS = 12000;
  useEffect(() => { const t = setInterval(() => setAlerts(a => a.some(x => Date.now() - x.at > TOAST_MS) ? a.filter(x => Date.now() - x.at <= TOAST_MS) : a), 1000); return () => clearInterval(t); }, []);
  const [bigPhoto, setBigPhoto] = useState(null); // a flag photo shown large
  const [backlog, setBacklog] = useState(null);   // what was already open when this view opened
  const [hubDown, setHubDown] = useState(null);   // when the hub stopped answering, or null
  const [desktop, setDesktop] = useState(() => (typeof Notification === "undefined" ? "unsupported" : Notification.permission));
  const seenRef = useRef(null);                   // keys already announced; null until the first report
  const fileRef = useRef(null);

  const refresh = useCallback(() => {
    hub.stations().then(d => {
      setData(d); setHubDown(null);
      // Announce every unresolved attention item that was not in the previous
      // report. The first report seeds the set and becomes the backlog banner.
      const keys = new Set(), fresh = [];
      d.stations.forEach(s => (s.attention || []).forEach(a => {
        if (a.resolution) return;
        const k = `${s.id}|${a.time}|${a.jersey}|${a.status}`;
        keys.add(k);
        if (seenRef.current && !seenRef.current.has(k)) fresh.push({ key: k, at: Date.now(), station: stationLabel(s.id), operator: s.operatorName || "—", status: a.status, jersey: a.jersey, reason: a.reason, time: a.time, photo: a.photo || null });
      }));
      if (!seenRef.current) {
        const stations = d.stations.filter(s => keys.size && [...keys].some(k => k.startsWith(s.id + "|")) || (s.carried || []).length);
        const items = keys.size + d.stations.reduce((n, s) => n + (s.carried || []).length, 0);
        setBacklog(items ? { items, stations: stations.length } : null);
      }
      // Remember every key ever announced, not just the ones in this report: a
      // station that drops out for a reload and comes back must not re-announce
      // the same flag, and an alert already on screen is never added twice.
      if (!seenRef.current) seenRef.current = keys; else keys.forEach(k => seenRef.current.add(k));
      if (fresh.length) {
        setAlerts(prev => [...fresh.reverse().filter(f => !prev.some(p => p.key === f.key)), ...prev].slice(0, 50));
        playTone("flag");
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          try {
            if (fresh.length <= 3) fresh.forEach(a => new Notification(`${a.station} · ${a.operator}`, { body: `${a.jersey} — ${a.reason}`, tag: a.key, requireInteraction: true }));
            else new Notification(`${fresh.length} jerseys need you`, { body: fresh.map(a => `${a.station}: ${a.jersey}`).join(" · "), tag: "batch-" + Date.now(), requireInteraction: true });
          } catch { /* the browser refused; the toast and tone still happened */ }
        }
      }
    }).catch(() => setHubDown(t => t || Date.now()));
    hub.rosters().then(r => setRosters(r.rosters || [])).catch(() => {});
  }, []);
  const dismiss = key => setAlerts(a => a.filter(x => x.key !== key));
  // A click unlocks the browser's audio and asks for desktop notifications,
  // which pop up even when this tab is hidden or the browser is behind a window.
  const enableDesktop = () => {
    playTone("scan");
    if (typeof Notification === "undefined") { setDesktop("unsupported"); return; }
    Notification.requestPermission().then(p => { setDesktop(p); if (p === "granted") new Notification("Jersey QC alerts are on", { body: "You will be told here when a station needs you." }); }).catch(() => {});
  };
  const markCarriedDone = (stationIdValue, key) => hub.clearCarried(stationIdValue, key).then(refresh).catch(() => setMsg("Could not update the hub."));
  useEffect(() => { refresh(); const t = setInterval(refresh, 4000); return () => clearInterval(t); }, [refresh]);

  const send = async () => {
    if (!order.trim()) { setMsg("Type the order number first — stations list rosters by it."); return; }
    if (!file) { setMsg("Choose a roster file first."); return; }
    try {
      const isExcel = /\.(xlsx|xls)$/i.test(file.name);
      const rows = isExcel ? await parseExcel(file) : parseCSV(await file.text());
      if (!rows.length) { setMsg("No valid rows in that file."); return; }
      await hub.sendRoster({ orderNumber: order.trim(), notes: notes.trim(), jerseyType, fileName: file.name, rows, by: operatorName, forStation: target });
      const to = target ? `${stationLabel(target)} only` : "every station";
      setMsg(`Sent ${file.name} — ${rows.length} jerseys for order ${order.trim()} to ${to}. It shows on the order screen there.`);
      setFile(null); setOrder(""); setNotes(""); setJerseyType(""); refresh();
    } catch (e) { setMsg("Could not send: " + e.message); }
  };

  const age = s => Math.round((data.now - s.updatedAt) / 1000);
  const openCount = data.stations.reduce((n, s) => n + (s.attention || []).filter(a => !a.resolution).length + (s.carried || []).length, 0);
  const pct = s => s.counts?.total ? Math.round(((s.counts.total - s.counts.remaining) / s.counts.total) * 100) : 0;
  const todayStr   = data.today || new Date().toLocaleDateString("en-CA");
  const todayTotal = data.stations.reduce((n, s) => n + (s.day?.date === todayStr ? s.day.done : 0), 0);
  const liveCount  = data.stations.filter(s => age(s) <= 30).length;
  const fmtMin = m => m == null ? "—" : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;

  return (
    <div style={{ position: "fixed", inset: 0, background: "#0d1117", zIndex: 1800, display: "flex", flexDirection: "column", color: "#e2e8f0", fontFamily: "system-ui,sans-serif" }}>
      <div style={{ background: "#161b22", borderBottom: "1px solid #21262d", padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div><div style={{ fontWeight: 800, fontSize: 15 }}>🧭 Supervisor — stations {openCount > 0 && <Pill color="#ef4444">{openCount} need you</Pill>}</div><div style={{ fontSize: 13, color: "#94a3b8" }}><strong style={{ color: "#e2e8f0", fontSize: 15 }}>{todayTotal}</strong> {todayTotal === 1 ? "jersey" : "jerseys"} today · {liveCount} of {data.stations.length} {data.stations.length === 1 ? "station" : "stations"} live</div></div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {desktop === "denied" && <span style={{ fontSize: 16 }} title="Desktop alerts are blocked — allow notifications for this site in the browser's address bar">🔕</span>}
          {desktop === "default" && <button onClick={enableDesktop} style={{ ...btnGhost, padding: "6px 12px", borderColor: "#f59e0b", color: "#fcd34d" }}>🔔 Turn on alerts</button>}
          <button onClick={onClose} style={{ ...btnGhost, padding: "6px 14px" }}>← Back to scanning</button>
        </div>
      </div>
      {hubDown && (
        <div style={{ background: "#7f1d1d", color: "#fff", padding: "10px 16px", fontSize: 14, fontWeight: 700, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <span>⚠ The hub stopped answering at {new Date(hubDown).toLocaleTimeString()} — nothing below is live. Stations keep scanning on their own. Is the server window still open on the host PC?</span>
          <button onClick={refresh} style={{ ...btnGhost, padding: "4px 10px", color: "#fff", borderColor: "#fff" }}>Retry</button>
        </div>
      )}
      {backlog && !hubDown && (
        <div style={{ background: "#422006", color: "#fde68a", padding: "8px 16px", fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <span><strong>{backlog.items} {backlog.items === 1 ? "jersey was" : "jerseys were"} already waiting for you</strong> across {backlog.stations} {backlog.stations === 1 ? "station" : "stations"} when this screen opened — see the red lists on the cards.</span>
          <button onClick={() => setBacklog(null)} style={{ background: "transparent", border: 0, color: "#fde68a", cursor: "pointer", fontSize: 15 }}>✕</button>
        </div>
      )}
      {openOrder && <OrderView station={openOrder.station} order={openOrder.order} stationLabel={stationLabel} onClose={() => setOpenOrder(null)} onDownload={downloadOrderSheet} onPhoto={setBigPhoto} />}
      {bigPhoto && <PhotoLightbox src={bigPhoto} onClose={() => setBigPhoto(null)} />}
      {alerts.length > 0 && (
        <div style={{ position: "absolute", top: 54, right: 16, width: 380, maxWidth: "calc(100% - 32px)", zIndex: 1900, display: "flex", flexDirection: "column", gap: 8 }}>
          {alerts.length > 2 && <div style={{ textAlign: "right", fontSize: 12, color: "#fca5a5" }}>{alerts.length - 2} more just now — see the cards</div>}
          {alerts.slice(0, 2).map(a => (
            <div key={a.key} role="alert" style={{ background: a.status === "manual" ? "#3b2a06" : "#4a0d0d", border: `1px solid ${a.status === "manual" ? "#f59e0b" : "#ef4444"}`, borderRadius: 10, padding: "10px 12px", boxShadow: "0 8px 24px rgba(0,0,0,0.55)", color: "#fff", fontSize: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                <div style={{ fontWeight: 800 }}>{a.status === "manual" ? "✍" : "🛑"} {a.station} · {a.operator}</div>
                <button onClick={() => dismiss(a.key)} title="Dismiss" style={{ background: "transparent", border: 0, color: "#94a3b8", cursor: "pointer", fontSize: 15, lineHeight: 1 }}>✕</button>
              </div>
              <div style={{ marginTop: 3, display: "flex", gap: 10, alignItems: "flex-start" }}>
                {a.photo && <img src={a.photo} alt="" onClick={() => setBigPhoto(a.photo)} title="Click to enlarge" style={{ width: 96, height: 72, objectFit: "cover", borderRadius: 6, cursor: "zoom-in", flexShrink: 0, border: "1px solid rgba(255,255,255,0.25)" }} />}
                <div><strong>{a.jersey}</strong> — {a.reason}</div>
              </div>
              <div style={{ fontSize: 11, color: "#cbd5e1", marginTop: 3 }}>{a.status === "manual" ? "Entered by hand — needs your sign-off" : "Jersey is on its way to you"} · {a.time}</div>
            </div>
          ))}
          {alerts.length > 1 && <button onClick={() => setAlerts([])} style={{ ...btnGhost, alignSelf: "flex-end", padding: "4px 10px", fontSize: 11 }}>Dismiss all</button>}
        </div>
      )}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12, alignContent: "start" }}>
          {data.stations.length === 0 && <div style={{ color: "#64748b", padding: 24 }}>No station has reported yet. A station appears here within a few seconds of starting an order.</div>}
          {orders.length > 0 && (
            <div style={{ gridColumn: "1 / -1", order: 99, marginTop: 8 }}>
              <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8 }}>Orders today ({orders.length})</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {orders.slice().sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0)).map(o => {
                  const c = o.counts || {}; const total = c.total ?? 0; const done = total - (c.remaining ?? 0); const finished = total > 0 && c.remaining === 0;
                  const hm = t => t ? new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
                  return (
                    <div key={`${o.station}|${o.order}`} style={{ ...card, padding: "8px 12px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>Order {o.order} <span style={{ fontWeight: 400, color: "#64748b" }}>· {stationLabel(o.station)} · {o.operator || "—"}</span></div>
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>
                          <strong style={{ color: "#e2e8f0" }}>{done} / {total}</strong> done
                          {c.flag > 0 && <span style={{ color: "#f87171" }}> · {c.flag} with supervisor</span>}
                          {c.manual > 0 && <span style={{ color: "#fcd34d" }}> · {c.manual} by hand</span>}
                          {" · "}{finished ? <span style={{ color: "#22c55e", fontWeight: 700 }}>finished {hm(o.lastSeen)}</span> : `in progress · started ${hm(o.firstSeen)}`}
                        </div>
                      </div>
                      <button onClick={() => setOpenOrder({ station: o.station, order: o.order })} title="Open this order: roster with statuses, problems, and the log" style={{ ...btnGhost, padding: "4px 10px", fontSize: 12, borderColor: "#60a5fa", color: "#93c5fd" }}>Open order</button>
                      <button onClick={() => downloadOrderSheet(o)} title="The QC Results workbook for this order: every jersey with its status, reason, resolution, inspector and time" style={{ ...btnGhost, padding: "4px 10px", fontSize: 12, borderColor: "#22c55e", color: "#4ade80" }}>⬇ Order sheet</button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {data.stations.slice().sort((a, b) => stationLabel(a.id).localeCompare(stationLabel(b.id), undefined, { numeric: true })).map(s => {   /* a fixed order: cards must not jump as reports arrive */
            const stale = age(s) > 30;
            return (
              <div key={s.id} style={{ ...card, padding: 14, border: `1px solid ${stale ? "#334155" : s.counts?.flag ? "#ef4444" : "#21262d"}`, opacity: stale ? 0.6 : 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div style={{ fontWeight: 800, fontSize: 17 }}><span style={{ color: "#60a5fa" }}>{stationLabel(s.id)}</span> · {s.operatorName || "—"}</div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ fontSize: 11, color: stale ? "#f87171" : "#22c55e" }}>{stale ? `last seen ${fmtMin(Math.round(age(s) / 60))} ago` : "● live"}</div>
                    {(stale || (s.counts?.total > 0 && s.counts?.remaining === 0)) && (
                      <button onClick={() => { if (window.confirm(`Remove ${stationLabel(s.id)} · ${s.operatorName || "—"} from the board? It comes back by itself if that station reports again.`)) hub.removeStation(s.id).then(refresh).catch(() => setMsg("Could not update the hub.")); }}
                        title="Take this card off the board" style={{ ...btnGhost, padding: "1px 8px", fontSize: 11 }}>Remove</button>
                    )}
                  </div>
                </div>
                <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 2, display: "flex", alignItems: "center", gap: 10 }}>
                  <span>Order <strong style={{ color: "#e2e8f0" }}>{s.orderNumber || "—"}</strong></span>
                  {s.orderNumber && s.counts?.total > 0 && (
                    <button onClick={() => setOpenOrder({ station: s.id, order: s.orderNumber })} title="Open this order: every jersey with its status, what was flagged and why, and the log" style={{ ...btnGhost, padding: "1px 8px", fontSize: 11, borderColor: "#60a5fa", color: "#93c5fd" }}>Open order</button>
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
                    {s.attention.length > 3 && <div style={{ fontSize: 11, color: "#64748b", marginBottom: 3 }}>newest three — the rest are in the station's log</div>}
                    {s.attention.slice(0, 3).map((a, i) => (
                      <div key={i} style={{ fontSize: 12, marginBottom: 3, display: "flex", gap: 8, alignItems: "flex-start" }}>
                        {a.photo && <img src={a.photo} alt="" onClick={() => setBigPhoto(a.photo)} title="Click to enlarge" style={{ width: 56, height: 42, objectFit: "cover", borderRadius: 4, cursor: "zoom-in", flexShrink: 0 }} />}
                        <div>
                          <span style={{ color: a.status === "manual" ? "#f59e0b" : "#ef4444", fontWeight: 700 }}>{a.status === "manual" ? "✍" : "🛑"} {a.jersey}</span>
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
                        <span><span style={{ color: c.status === "manual" ? "#f59e0b" : "#ef4444", fontWeight: 700 }}>{c.status === "manual" ? "✍" : "🛑"} {c.jersey}</span><span style={{ color: "#94a3b8" }}> — order {c.order} · {c.reason}</span></span>
                        <button onClick={() => markCarriedDone(s.id, c.key)} title="Dealt with — remove from this list" style={{ ...btnGhost, padding: "1px 8px", fontSize: 11, flexShrink: 0 }}>Done</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ width: 340, flexShrink: 0, borderLeft: "1px solid #21262d", padding: 14, overflowY: "auto" }}>
          <button onClick={() => hub.ledger().then(l => exportDaySheetXLSX(l, stationLabel)).catch(() => setMsg("Could not fetch the day's scans from the hub."))}
            title="One Excel file for the whole day, every station: jerseys per hour, time per jersey, flags, every scan" style={{ ...bigBtn, fontSize: 14, marginBottom: 8, background: "#22c55e", color: "#0d1117" }}>⬇ Day sheet (Excel) — {todayTotal} {todayTotal === 1 ? "jersey" : "jerseys"} so far</button>
          <button onClick={() => hub.ledger().then(l => exportDamageReportXLSX(buildDamageRows(l.events || [], { stationLabel, typeLabel: jerseyTypeLabel }), { name: "day_" + (l.date || ""), title: `Damage report — ${l.date || "today"}, every station` })).catch(e => setMsg(e.message || "Could not fetch the day's flags from the hub."))}
            title="Every flagged jersey today, every station, with its photo" style={{ ...bigBtn, fontSize: 13, marginBottom: 16, background: "transparent", border: "1px solid #ef4444", color: "#f87171" }}>⬇ Damage report (Excel, with photos)</button>
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
          <div style={{ marginBottom: 10 }}><label style={labelSt}>Jersey type</label><JerseyTypePicker value={jerseyType} onChange={setJerseyType} /></div>
          <div style={{ marginBottom: 12 }}>
            <label style={labelSt}>Roster file</label>
            <div onClick={() => fileRef.current.click()} style={{ padding: "10px 12px", borderRadius: 8, border: `1px solid ${file ? "#22c55e" : "#334155"}`, background: "#1e293b", color: file ? "#22c55e" : "#64748b", fontSize: 13, cursor: "pointer" }}>{file ? "✓ " + file.name : "📂 Choose CSV or Excel…"}</div>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.tsv,.txt" style={{ display: "none" }} onChange={e => { const f = e.target.files[0]; if (f) setFile(f); e.target.value = ""; }} />
          </div>
          <button onClick={send} style={{ ...bigBtn, fontSize: 14 }}>Send to stations</button>
          {msg && <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 10 }}>{msg}</div>}
          <div style={{ fontWeight: 800, fontSize: 13, margin: "22px 0 8px" }}>Rosters waiting ({rosters.length})</div>
          {rosters.map(r => (
            <div key={r.id} style={{ ...card, padding: "8px 10px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>Order {r.orderNumber || "—"} <span style={{ fontWeight: 400, color: "#64748b" }}>· {r.rowCount}</span>{r.forStation ? <span style={{ fontWeight: 600, color: "#60a5fa", marginLeft: 6 }}>→ {stationLabel(r.forStation)}</span> : <span style={{ fontWeight: 400, color: "#64748b", marginLeft: 6 }}>· any station</span>}</div>
                <div style={{ fontSize: 11, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.fileName} · {new Date(r.createdAt).toLocaleTimeString()}</div>
              </div>
              <button onClick={() => hub.removeRoster(r.id).then(refresh).catch(() => {})} style={{ ...btnGhost, padding: "2px 8px", fontSize: 11 }}>Remove</button>
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

function CandidateRow({ c, primary, secondary, extraCols, selected, disabled, accent, onClick, onHover, confirmKey }) {
  const head = primary.map(f => f === "number" ? `#${c.number}` : (c[f] || "")).filter(Boolean).join(" · ");
  const sub  = [...secondary.map(f => f === "number" ? `#${c.number}` : (c[f] || "")), ...extraCols.map(k => c[k] ? `${cap(k)}: ${c[k]}` : "")].filter(Boolean).join(" · ");
  return (
    <div onClick={disabled ? undefined : onClick} onMouseEnter={disabled ? undefined : onHover} data-sel={selected ? "1" : undefined}
      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", marginBottom: 8, borderRadius: 14, border: `3px solid ${disabled ? "rgba(255,255,255,0.08)" : selected ? accent : "rgba(255,255,255,0.12)"}`, background: disabled ? "rgba(255,255,255,0.02)" : selected ? "rgba(245,158,11,0.18)" : "rgba(255,255,255,0.04)", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.45 : 1 }}>
      <div>
        <span style={{ fontSize: "clamp(22px, 3vw, 30px)", fontWeight: 900, color: disabled ? "#64748b" : "#fff" }}>{head || "—"}</span>
        {sub && <span style={{ fontSize: 17, color: "#94a3b8", marginLeft: 14 }}>{sub}</span>}
        {disabled && <span style={{ fontSize: 13, color: "#22c55e", marginLeft: 12, fontWeight: 700 }}>✓ Already passed</span>}
      </div>
      {!disabled && selected && <span style={{ fontSize: 17, color: accent, fontWeight: 700, whiteSpace: "nowrap" }}>← {formatKey(confirmKey)}</span>}
    </div>
  );
}

function ScanOverlay({ state, actions, binMap, extraCols, notes, jerseyType = "", confirmKey, cancelKey, retryKey, byHandKey, stream, rotation, embedded }) {
  const reasons = reasonsFor(jerseyType);
  const mode    = state.mode;
  const isGreen = mode === "confirm" || mode === "done";
  const isList  = mode === "pick" || mode === "close";
  const isRed   = mode === "flag" || mode === "duplicate" || mode === "supervisor";
  const isMenu  = mode === "reasons" || mode === "reasonText";
  const isManual = mode === "manual" || mode === "manualDone";

  const bg     = isGreen ? "#052e16" : (isList || isManual) ? "#1c1a06" : isMenu ? "#1a1033" : "#450a0a";
  const accent = isGreen ? "#22c55e" : (isList || isManual) ? "#f59e0b" : isMenu ? "#a78bfa" : "#ef4444";

  const match      = state.match || state.scan?.match || null;
  const candidates = useMemo(() => state.candidates || [], [state.candidates]);
  const detected   = state.scan?.detected;

  // Adaptive headline: whatever differs between the candidates becomes the big text.
  const fields  = useMemo(() => [...CORE_COLUMNS, ...extraCols], [extraCols]);
  const diff    = useMemo(() => differingFields(candidates, fields), [candidates, fields]);
  const primary = diff.length && !diff.some(f => HEADLINE_FIELDS.includes(f)) ? diff : HEADLINE_FIELDS;
  const secondary = fields.filter(f => !primary.includes(f) && !extraCols.includes(f));

  const options = useMemo(() => {
    const retry    = { id: "retry",    label: "↻ Retry scan",             hint: "nothing is recorded", run: actions.retry };
    const notRight = { id: "notright", label: "✎ Not right — pick a reason", run: actions.reasons };
    const byHand   = { id: "manual",   label: "⌨ Enter by hand",          hint: "camera cannot read it, or not on the roster", run: actions.manual };
    if (mode === "confirm")    return [{ id: "confirm", label: "✓ Confirm — next jersey", primary: true, run: actions.confirm }, retry, notRight];
    if (isList) {
      const t = state.typed;
      const none = t
        ? { ...byHand, label: `🛑 None of these — #${t.number || "?"}${t.name ? " " + t.name : ""} is not on the roster`, hint: "nothing is added; the supervisor is told now" }
        : { ...byHand, label: "⌨ None of these — enter by hand" };
      return [...candidates.map(c => ({ id: "c" + c._id, candidate: c, disabled: isDone(c), run: () => actions.pick(c) })), retry, none, { ...notRight, label: "🚩 Bad jersey — pick a reason" }];
    }
    if (mode === "flag")       return [{ ...retry, primary: true }, byHand, { id: "flag", label: "🚩 Flag & continue", run: actions.flagContinue }, { ...notRight, label: "✎ Bad jersey — pick a reason" }];
    if (mode === "manualDone") return [{ id: "cont", label: "✓ Continue — next jersey", primary: true, run: actions.continueManual }];
    if (mode === "manual")     return [];
    if (mode === "duplicate")  return [{ id: "skip", label: "✓ Already done — skip", primary: true, hint: "nothing is recorded", run: actions.skipDuplicate }, retry, { id: "dup", label: "🚩 Log it as a duplicate", run: actions.flagDuplicate }];
    if (mode === "reasons")    return [...reasons.map(r => ({ id: r.id, label: r.label, hint: r.route, run: () => actions.chooseReason(r) })), { id: "back", label: "← Back", run: actions.back }];
    if (mode === "supervisor") return [{ id: "cont", label: "✓ Continue — next jersey", primary: true, run: actions.continueSupervisor }];
    if (mode === "reasonText") return [];   // typing, not navigating
    return [];
  }, [mode, isList, candidates, actions, state.typed, reasons]);

  const firstEnabled = Math.max(0, options.findIndex(o => !o.disabled));
  const [selectedIdx, setSelectedIdx] = useState(firstEnabled);
  const lastKeyRef = useRef(0);

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
      do { next = (next + dir + n) % n; tries++; } while (options[next]?.disabled && tries < n);
      setSelectedIdx(next);
    };
    const onKey = (e) => {
      if (e.repeat) return;                       // a held key or pedal is one press, not many
      if (mode === "done") return;
      if (mode === "manual" || mode === "reasonText") { if (e.code === "Escape") { e.preventDefault(); actions.back(); } return; }   // typing, not navigating
      if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
      if (e.code === retryKey) { const o = options.find(x => x.id === "retry"); if (o) { e.preventDefault(); lastKeyRef.current = Date.now(); o.run(); } return; }
      if (e.code === byHandKey) { const o = options.find(x => x.id === "manual"); if (o) { e.preventDefault(); lastKeyRef.current = Date.now(); o.run(); } return; }   // straight to the form, like R goes straight to retry
      if (e.code === confirmKey) { e.preventDefault(); lastKeyRef.current = Date.now(); const o = options[selectedIdx]; if (o && !o.disabled) o.run(); return; }
      if (e.code === cancelKey || e.code === "ArrowDown") { e.preventDefault(); lastKeyRef.current = Date.now(); move(1); return; }
      if (e.code === "ArrowUp") { e.preventDefault(); lastKeyRef.current = Date.now(); move(-1); }
    };
    // Voice on a result screen: "next" selects what is highlighted (the mouse
    // moves the highlight, voice never does); "again" retries the scan.
    const onVoice = (e) => {
      const c = e.detail?.command; if (!c || mode === "done") return;
      if (mode === "manual" || mode === "reasonText") return;        // typing
      if (c === "retry")    { const o = options.find(x => x.id === "retry");    if (o && !o.disabled) { lastKeyRef.current = Date.now(); o.run(); } return; }
      if (c === "select")   { const o = options[selectedIdx]; if (o && !o.disabled) { lastKeyRef.current = Date.now(); o.run(); } }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("jerseyqc:voice", onVoice);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("jerseyqc:voice", onVoice); };
  }, [options, selectedIdx, mode, confirmKey, cancelKey, retryKey, byHandKey, actions]);

  // A bumped mouse never overrides a key press made in the last moment.
  const hover = useCallback(i => { if (Date.now() - lastKeyRef.current > 800) setSelectedIdx(i); }, []);

  // The highlighted option follows the key down a long list: the list scrolls
  // so the row the Select key would take is always on screen.
  useEffect(() => {
    if (Date.now() - lastKeyRef.current > 800) return;          // moved by the mouse: it is already in view
    document.querySelector('[data-sel="1"]')?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedIdx]);

  const binNum  = match ? binFor(binMap, match.team) : null;
  const hasSize = !!(match?.size);
  const extras  = match ? extraCols.filter(k => match[k]).map(k => `${cap(k)}: ${match[k]}`) : [];

  const OptionButton = ({ o, i }) => {
    const sel = i === selectedIdx;
    return (
      <button onClick={o.run} onMouseEnter={() => hover(i)} data-sel={sel ? "1" : undefined}
        style={{ padding: "12px 22px", borderRadius: 12, border: `3px solid ${sel ? accent : "rgba(255,255,255,0.18)"}`, background: o.primary ? accent : "transparent", color: o.primary ? "#0d1117" : "#fff", fontWeight: 700, fontSize: 16, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, boxShadow: sel ? `0 0 0 3px ${accent}55` : "none", opacity: sel || o.primary ? 1 : 0.85 }}>
        <span>{o.label} {o.id === "retry" ? <Kbd light>{formatKey(retryKey)}</Kbd> : o.id === "manual" ? <Kbd light>{formatKey(byHandKey)}</Kbd> : sel && <Kbd light={!o.primary}>{formatKey(confirmKey)}</Kbd>}</span>
        {o.hint && <span style={{ fontSize: 11, fontWeight: 500, opacity: 0.7 }}>{o.hint}</span>}
      </button>
    );
  };

  const hintLine = `${formatKey(confirmKey)} select · ${formatKey(cancelKey)} or ↓ next option · ↑ previous · ${formatKey(retryKey)} retry scan · ${formatKey(byHandKey)} enter by hand`;

  return (
    <div style={{ position: embedded ? "absolute" : "fixed", inset: 0, zIndex: 1000, background: bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", userSelect: "none", padding: "20px 0", overflowY: "auto" }}>

      {/* ── GREEN ── */}
      {isGreen && match && (
        <>
          <div style={{ fontSize: 72, lineHeight: 1, marginBottom: 4 }}>✅</div>
          <div style={{ fontSize: "clamp(40px, 8vw, 88px)", fontWeight: 900, color: accent, letterSpacing: "-2px", textAlign: "center", padding: "0 24px", lineHeight: 1, marginTop: 4, maxWidth: "95vw", overflowWrap: "anywhere" }}>
            #{match.number}{match.name ? ` · ${match.name}` : ""}
          </div>
          {match.team && <div style={{ fontSize: "clamp(24px, 4vw, 42px)", color: "#86efac", marginTop: 8, fontWeight: 700, textAlign: "center" }}>{match.team}</div>}
          <div style={{ display: "flex", gap: 16, marginTop: 14, flexWrap: "wrap", justifyContent: "center" }}>
            {hasSize && (
              <div style={{ padding: "12px 40px", borderRadius: 20, border: "4px solid #22c55e", background: "rgba(34,197,94,0.12)", textAlign: "center", minWidth: 160 }}>
                <div style={{ fontSize: 16, color: "#86efac", fontWeight: 700, textTransform: "uppercase", letterSpacing: 3, marginBottom: 2 }}>Size</div>
                <div style={{ fontSize: "clamp(48px, 9vw, 96px)", fontWeight: 900, color: "#fff", letterSpacing: 4, lineHeight: 1 }}>{match.size}</div>
              </div>
            )}
            {binNum !== null && (
              <div style={{ padding: "12px 40px", borderRadius: 20, border: "4px solid #3b82f6", background: "rgba(59,130,246,0.12)", textAlign: "center", minWidth: 160 }}>
                <div style={{ fontSize: 16, color: "#93c5fd", fontWeight: 700, textTransform: "uppercase", letterSpacing: 3, marginBottom: 2 }}>Bin</div>
                <div style={{ fontSize: "clamp(48px, 9vw, 96px)", fontWeight: 900, color: "#fff", lineHeight: 1 }}>{binNum}</div>
              </div>
            )}
          </div>
          {extras.length > 0 && (
            <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap", justifyContent: "center" }}>
              {extras.map(x => <span key={x} style={{ padding: "8px 18px", borderRadius: 12, border: "3px solid #f59e0b", background: "rgba(245,158,11,0.15)", color: "#fff", fontWeight: 900, fontSize: "clamp(18px, 3vw, 30px)" }}>{x}</span>)}
            </div>
          )}
          {state.note && <div style={{ marginTop: 12, fontSize: 16, color: "#fcd34d" }}>✎ {state.note}</div>}
          {mode === "confirm" && (
            <>
              <div style={{ marginTop: 18, display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", alignItems: "center", padding: "0 20px" }}>
                <span style={{ fontSize: 14, color: "#86efac", fontWeight: 800, letterSpacing: 2, textTransform: "uppercase", marginRight: 4 }}>Check</span>
                {CHECKLIST.map(c => (
                  <span key={c} style={{ padding: "6px 14px", borderRadius: 999, border: "2px solid rgba(134,239,172,0.55)", background: "rgba(34,197,94,0.16)", color: "#fff", fontWeight: 700, fontSize: "clamp(15px, 2vw, 21px)", whiteSpace: "nowrap" }}>{c}</span>
                ))}
              </div>
              {notes && (
                <div style={{ marginTop: 12, padding: "8px 18px", borderRadius: 12, background: "rgba(245,158,11,0.16)", border: "2px solid rgba(245,158,11,0.55)", color: "#fde68a", fontWeight: 700, fontSize: "clamp(15px, 2vw, 21px)", textAlign: "center", maxWidth: 900 }}>
                  📝 {notes}
                </div>
              )}
              <div style={{ marginTop: 18, display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
                {options.map((o, i) => <OptionButton key={o.id} o={o} i={i} />)}
              </div>
            </>
          )}
          {mode === "done" && <div style={{ fontSize: 26, color: "#4ade80", marginTop: 20, opacity: 0.8 }}>Next jersey…</div>}
        </>
      )}

      {/* ── YELLOW: pick / close ── */}
      {isList && (
        <>
          <div style={{ fontSize: 52, lineHeight: 1, marginBottom: 4 }}>{mode === "pick" ? "⚠️" : "🔍"}</div>
          <div style={{ fontSize: "clamp(28px, 4.5vw, 48px)", fontWeight: 900, color: accent, marginBottom: 6, textAlign: "center", padding: "0 24px", lineHeight: 1.1 }}>
            {mode === "pick" ? "Which jersey is this?" : "No exact match"}
          </div>
          <div style={{ fontSize: 20, color: "#fcd34d", marginBottom: 4, opacity: 0.95, textAlign: "center", padding: "0 24px" }}>
            {state.reason}
          </div>
          <div style={{ fontSize: 16, color: "#a8a29e", marginBottom: 14, textAlign: "center" }}>
            Read: #{detected?.number || "?"}{detected?.number && detected?.number_complete === false ? "?" : ""}{detected?.name ? ` · ${detected.name}${detected.name_complete === false ? "…" : ""}` : " · no name"}{detected?.jersey_colour ? ` · ${detected.jersey_colour} jersey` : ""}
            {primary !== HEADLINE_FIELDS && <span style={{ marginLeft: 12, color: accent }}>· differs by {primary.map(cap).join(" and ")}</span>}
          </div>
          <div style={{ width: "100%", maxWidth: 760, padding: "0 24px", boxSizing: "border-box", maxHeight: "48vh", overflowY: "auto" }}>
            {candidates.length === 0 && (
              <div style={{ textAlign: "center", color: "#fcd34d", fontSize: 18, padding: 16 }}>No rows to choose from.</div>
            )}
            {candidates.length > 0 && candidates.every(isDone) && (
              <div style={{ textAlign: "center", color: "#fcd34d", fontSize: 16, padding: "8px 0 12px" }}>Every matching row has already passed — retry the scan, or flag it as a duplicate below.</div>
            )}
            {options.map((o, i) => o.candidate && (
              <CandidateRow key={o.id} c={o.candidate} primary={primary} secondary={secondary} extraCols={extraCols} selected={i === selectedIdx} disabled={o.disabled} accent={accent}
                onClick={o.run} onHover={() => hover(i)} confirmKey={confirmKey} />
            ))}
          </div>
          <div style={{ marginTop: 14, display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
            {options.map((o, i) => !o.candidate && <OptionButton key={o.id} o={o} i={i} />)}
          </div>
          <div style={{ marginTop: 10, fontSize: 13, color: "rgba(255,255,255,0.35)", textAlign: "center" }}>{hintLine}</div>
        </>
      )}

      {/* ── RED: not found / API error / duplicate / supervisor ── */}
      {isRed && (
        <>
          <div style={{ fontSize: 80, lineHeight: 1, marginBottom: 4 }}>{mode === "supervisor" ? "🛑" : mode === "duplicate" ? "⚠️" : "🚩"}</div>
          <div style={{ fontSize: "clamp(40px, 8vw, 84px)", fontWeight: 900, color: accent, textAlign: "center", padding: "0 24px", lineHeight: 1, marginTop: 4 }}>
            {mode === "supervisor" ? "GO TO SUPERVISOR" : mode === "duplicate" ? "ALREADY DONE" : state.title || "NOT FOUND"}
          </div>
          {(match || detected) && (
            <div style={{ fontSize: "clamp(24px, 4vw, 40px)", color: "#fca5a5", marginTop: 12, textAlign: "center" }}>
              {match ? `#${match.number}${match.name ? ` · ${match.name}` : ""}${match.size ? ` · ${match.size}` : ""}` : `#${detected.number || "?"}${detected.name ? ` · ${detected.name}` : ""}`}
            </div>
          )}
          {state.reason && (
            <div style={{ fontSize: 22, color: "#fca5a5", marginTop: 10, textAlign: "center", padding: "0 40px", maxWidth: 760, opacity: 0.9, lineHeight: 1.4 }}>
              {state.reason}
            </div>
          )}
          {state.route && <div style={{ fontSize: 18, color: "#fecaca", marginTop: 8, opacity: 0.8 }}>→ {state.route}</div>}
          {mode === "flag" && (
            <div style={{ fontSize: 17, color: "#fed7aa", marginTop: 14, textAlign: "center", padding: "0 40px", maxWidth: 760, lineHeight: 1.45 }}>
              {state.title === "COULD NOT READ"
                ? "Flatten the number area and tuck the sleeves under, then R to retry — or enter it by hand."
                : state.title === "SCAN FAILED"
                  ? "Check the network, then R to retry."
                  : "If the read looks wrong (sleeves can merge with the number), R to retry — otherwise enter it by hand."}
            </div>
          )}
          <div style={{ marginTop: 28, display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
            {options.map((o, i) => <OptionButton key={o.id} o={o} i={i} />)}
          </div>
          <div style={{ marginTop: 10, fontSize: 13, color: "rgba(255,255,255,0.35)", textAlign: "center" }}>{hintLine}</div>
        </>
      )}

      {/* ── A reason the list does not cover ── */}
      {mode === "reasonText" && (
        <ReasonTextForm match={match} onSubmit={actions.reasonSubmit} onBack={actions.back} />
      )}

      {/* ── MANUAL entry and its confirmation ── */}
      {mode === "manual" && (
        <ManualEntryForm detected={detected} teams={state.teams || []} onSubmit={actions.manualSubmit} onBack={actions.back} />
      )}
      {mode === "manualDone" && match && (
        <>
          <div style={{ fontSize: 72, lineHeight: 1, marginBottom: 4 }}>✍</div>
          <div style={{ fontSize: "clamp(30px, 6vw, 60px)", fontWeight: 900, color: accent, textAlign: "center", lineHeight: 1 }}>ENTERED BY HAND</div>
          <div style={{ fontSize: "clamp(28px, 5vw, 56px)", fontWeight: 900, color: "#fff", marginTop: 12, textAlign: "center" }}>#{match.number}{match.name ? ` · ${match.name}` : ""}</div>
          <div style={{ fontSize: 22, color: "#fcd34d", marginTop: 8, textAlign: "center" }}>{[match.team, match.size].filter(Boolean).join(" · ")}</div>
          {state.reason && <div style={{ fontSize: 18, color: "#fde68a", marginTop: 10, opacity: 0.9, textAlign: "center", padding: "0 24px" }}>{state.reason} — the supervisor will sign this off.</div>}
          <div style={{ marginTop: 28, display: "flex", gap: 14 }}>{options.map((o, i) => <OptionButton key={o.id} o={o} i={i} />)}</div>
        </>
      )}

      {/* ── REASONS menu ── */}
      {isMenu && (
        <>
          <div style={{ fontSize: 56, lineHeight: 1, marginBottom: 4 }}>✎</div>
          <div style={{ fontSize: "clamp(28px, 4.5vw, 44px)", fontWeight: 900, color: accent, marginBottom: 6, textAlign: "center" }}>What's wrong with it?</div>
          {jerseyType && <div style={{ fontSize: 14, color: "#a78bfa", marginBottom: 6 }}>{jerseyTypeLabel(jerseyType)} jersey · {jerseyTypeOf(jerseyType)?.construction}</div>}
          {match && <div style={{ fontSize: 18, color: "#c4b5fd", marginBottom: 14 }}>#{match.number}{match.name ? ` · ${match.name}` : ""}{match.size ? ` · ${match.size}` : ""}</div>}
          <div style={{ width: "100%", maxWidth: 640, padding: "0 24px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 8 }}>
            {options.map((o, i) => {
              const sel = i === selectedIdx;
              return (
                <div key={o.id} onClick={o.run} onMouseEnter={() => hover(i)}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderRadius: 12, border: `3px solid ${sel ? accent : "rgba(255,255,255,0.12)"}`, background: sel ? "rgba(167,139,250,0.18)" : "rgba(255,255,255,0.04)", cursor: "pointer" }}>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>{o.label}</div>
                    {o.hint && <div style={{ fontSize: 13, color: "#a78bfa", marginTop: 2 }}>{o.hint}</div>}
                  </div>
                  {sel && <span style={{ fontSize: 17, color: accent, fontWeight: 700 }}>← {formatKey(confirmKey)}</span>}
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 12, fontSize: 13, color: "rgba(255,255,255,0.35)", textAlign: "center" }}>{hintLine}</div>
        </>
      )}

      {/* Progress bar on the green flash */}
      {mode === "done" && (
        <div style={{ position: "absolute", bottom: 0, left: 0, height: 6, width: "100%", background: "#052e16" }}>
          <div ref={el => { if (el) { el.style.transition = "width 0.7s linear"; requestAnimationFrame(() => { el.style.width = "0%"; }); } }}
            style={{ height: "100%", background: "#22c55e", width: "100%" }} />
        </div>
      )}

      {state.scan?.thumb && mode !== "done" && (
        <div title="What the camera read" style={{ position: "absolute", bottom: 12, left: 12, opacity: 0.45 }}>
          <img src={state.scan.thumb} alt="" style={{ width: 96, height: 72, objectFit: "cover", borderRadius: 6 }} />
        </div>
      )}
      {!embedded && mode !== "manual" && mode !== "reasonText" && <LivePreview stream={stream} rotation={rotation} />}
    </div>
  );
}

// ── Result card (flag resolution) ─────────────────────────────────────────────
function ResultCard({ result, onResolve }) {
  const [note, setNote] = useState("");
  const isManual  = result.status === S_MANUAL && !result.resolution;    // entered by hand, awaiting sign-off
  const isFlagged = result.status === S_FLAGGED || isManual;
  return (
    <div style={{ ...card, border: `1px solid ${statusColor(result.status)}`, background: isFlagged ? "rgba(239,68,68,0.06)" : "rgba(148,163,184,0.06)", padding: "12px 14px" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        {result.thumb && <img src={result.thumb} alt="" style={{ width: 60, height: 45, objectFit: "cover", borderRadius: 5, flexShrink: 0 }} />}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: statusColor(result.status), textTransform: "uppercase", letterSpacing: 1 }}>
            {isManual ? "✍ Entered by hand — needs supervisor sign-off" : isFlagged ? "🚩 Flagged — with the supervisor" : "🔧 Resolved"}
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>
            {result.match ? `#${result.match.number} · ${result.match.name || "—"}` : `#${result.detected?.number || "?"} · ${result.detected?.name || "Not detected"}`}
          </div>
          {result.reason     && <div style={{ fontSize: 12, color: "#f87171", marginTop: 2 }}>{result.reason}</div>}
          {result.resolution && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>Resolution: {result.resolution}</div>}
        </div>
      </div>
      {isFlagged && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #21262d" }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button onClick={() => onResolve(result.id, "accept", note)} style={{ ...btnSm, background: "rgba(34,197,94,0.15)",  color: "#22c55e", border: "1px solid #22c55e" }}>✓ Accept — counts as passed</button>
            <button onClick={() => onResolve(result.id, "reject", note)} style={{ ...btnSm, background: "rgba(239,68,68,0.15)",  color: "#ef4444", border: "1px solid #ef4444" }}>✗ Reject — sent for rework</button>
            <button onClick={() => onResolve(result.id, "note",   note)} style={{ ...btnSm, background: "rgba(99,102,241,0.15)", color: "#818cf8", border: "1px solid #818cf8" }}>📝 Note only</button>
          </div>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="Optional note…"
            style={{ marginTop: 6, width: "100%", boxSizing: "border-box", padding: "5px 9px", borderRadius: 6, border: "1px solid #334155", background: "#1e293b", color: "#e2e8f0", fontSize: 12 }} />
        </div>
      )}
    </div>
  );
}

// ── Settings panel ────────────────────────────────────────────────────────────
function SettingsPanel({ settings, cameras, mics = [], onSave, onClose }) {
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
    { label: "Navigate",   key: "cancelKey" },
    { label: "Retry scan", key: "retryKey" },
    { label: "Enter by hand", key: "byHandKey" },
  ];
  const reserved = ["Escape", "Tab"];
  const problems = [];
  const onScreen = ["confirmKey", "cancelKey", "retryKey", "byHandKey"];   // these act on the same screen, so they must differ
  const labelOf  = k => keyRows.find(r => r.key === k).label;
  onScreen.forEach((a, i) => onScreen.slice(i + 1).forEach(b => { if (temp[a] === temp[b]) problems.push(`${labelOf(a)} and ${labelOf(b)} cannot be the same key.`); }));
  keyRows.forEach(r => { if (reserved.includes(temp[r.key])) problems.push(`${r.label} cannot be ${temp[r.key]}.`); });

  const selSt = { ...inputSt, padding: "6px 10px", fontSize: 13 };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 2200, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#161b22", borderRadius: 12, border: "1px solid #21262d", padding: 24, width: 400, maxWidth: "92vw", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 14 }}>⚙ Settings</div>

        <div style={{ marginBottom: 18 }}>
          <div style={labelSt}>Keyboard shortcuts</div>
          {keyRows.map(r => (
            <div key={r.key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: "#94a3b8", width: 120, flexShrink: 0 }}>{r.label}</div>
              <div style={{ flex: 1, padding: "6px 10px", borderRadius: 8, border: `1px solid ${listening === r.key ? "#3b82f6" : "#334155"}`, background: "#1e293b", color: "#e2e8f0", fontSize: 13, textAlign: "center" }}>
                {listening === r.key ? "Press any key…" : formatKey(temp[r.key])}
              </div>
              <button onClick={() => setListening(r.key)} style={{ ...btnGhost, whiteSpace: "nowrap", padding: "4px 10px" }}>Change</button>
            </div>
          ))}
          <div style={{ fontSize: 11, color: "#475569" }}>Select picks the highlighted option; Navigate (or ↓ ↑) moves it; Retry scan re-shoots from any screen with nothing recorded. Scan only works when no screen is open, so it may share a key with Select.</div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <div style={labelSt}>Camera</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <div style={{ fontSize: 12, color: "#94a3b8", width: 120, flexShrink: 0 }}>Mount rotation</div>
            <select value={temp.rotation} onChange={e => setTemp(t => ({ ...t, rotation: Number(e.target.value) }))} style={selSt}>
              {[0, 90, 180, 270].map(d => <option key={d} value={d}>{d}° {d === 180 ? "(upside-down mount)" : d === 0 ? "(upright)" : ""}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <div style={{ fontSize: 12, color: "#94a3b8", width: 120, flexShrink: 0 }}>Camera</div>
            <select value={temp.cameraId} onChange={e => setTemp(t => ({ ...t, cameraId: e.target.value }))} style={selSt}>
              <option value="">Browser default</option>
              {cameras.map(c => <option key={c.deviceId} value={c.deviceId}>{c.label || `Camera ${c.deviceId.slice(0, 6)}`}</option>)}
            </select>
          </div>
          {cameras.length === 0 && <div style={{ fontSize: 11, color: "#475569" }}>Start the camera once to list the cameras on this machine.</div>}
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 12, color: "#94a3b8", cursor: "pointer" }}>
            <input type="checkbox" checked={!!temp.autoScan} onChange={e => setTemp(t => ({ ...t, autoScan: e.target.checked }))} />
            Hands-free: after a confirm, scan the next jersey when it is placed and still
          </label>
        </div>

        <div style={{ marginBottom: 18 }}>
          <div style={labelSt}>Answer the result screen with</div>
          <div style={{ display: "flex", gap: 6 }}>
            {[[false, "⌨️ Keys or pedals", "Normal"], [true, "🎤 Voice", "Headset"]].map(([on, label, sub]) => (
              <button key={String(on)} onClick={() => setTemp(t => ({ ...t, voice: on }))}
                style={{ flex: 1, padding: "8px 10px", borderRadius: 8, cursor: "pointer", textAlign: "left", border: `1px solid ${!!temp.voice === on ? "#3b82f6" : "#334155"}`, background: !!temp.voice === on ? "rgba(59,130,246,0.14)" : "#1e293b", color: !!temp.voice === on ? "#e2e8f0" : "#94a3b8" }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{label}</div>
                <div style={{ fontSize: 11, color: "#64748b" }}>{sub}</div>
              </button>
            ))}
          </div>
          {!temp.voice && <div style={{ fontSize: 11, color: "#475569", marginTop: 8 }}>The keys above, or a foot pedal programmed to send them.</div>}
          {temp.voice && (
            <>
              <VoiceLegend />
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
                <div style={{ fontSize: 12, color: "#94a3b8", width: 120, flexShrink: 0 }}>Microphone</div>
                <select value={temp.micId || ""} onChange={e => setTemp(t => ({ ...t, micId: e.target.value }))} style={{ ...selSt, flex: 1 }}>
                  <option value="">Browser default</option>
                  {mics.map(m => <option key={m.deviceId} value={m.deviceId}>{m.label || `Microphone ${m.deviceId.slice(0, 6)}`}</option>)}
                </select>
              </div>
              {mics.length === 0 && <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>Turn voice on and save once to list the microphones; a headset with a boom mic works best.</div>}
              <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 12, color: "#94a3b8", cursor: "pointer" }}>
                <input type="checkbox" checked={temp.voiceSpeak !== false} onChange={e => setTemp(t => ({ ...t, voiceSpeak: e.target.checked }))} />
                Read the result back through the headset ("40, bin 2")
              </label>
              <div style={{ fontSize: 11, color: "#475569", marginTop: 8 }}>Runs on this PC: the ~40 MB model loads once, then nothing leaves the machine. It only knows these words, so talk is ignored. Commands work only while a result is on screen.</div>
            </>
          )}
        </div>

        {problems.length > 0 && (
          <div style={{ fontSize: 12, color: "#f87171", marginBottom: 12, padding: "8px 12px", background: "rgba(239,68,68,0.08)", borderRadius: 6 }}>
            {problems.map(p => <div key={p}>{p}</div>)}
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button disabled={problems.length > 0} onClick={() => { onSave(temp); onClose(temp); }} style={{ ...btnPri, flex: 1, opacity: problems.length ? 0.5 : 1 }}>Save</button>
          <button onClick={onClose} style={btnGhost}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Bin setup modal ───────────────────────────────────────────────────────────
function BinSetupModal({ entries, onConfirm }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 1500, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#161b22", borderRadius: 16, border: "2px solid #3b82f6", padding: 40, maxWidth: 560, width: "90vw", textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🗂️</div>
        <div style={{ fontSize: 26, fontWeight: 900, color: "#60a5fa", marginBottom: 8 }}>Prepare {entries.length} Bins</div>
        <div style={{ fontSize: 15, color: "#94a3b8", marginBottom: 24 }}>
          This order has <strong style={{ color: "#e2e8f0" }}>{entries.length} teams</strong>. Label your bins before scanning:
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 28, maxHeight: 320, overflowY: "auto" }}>
          {entries.map(({ team, bin }) => (
            <div key={team} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 18px", borderRadius: 10, background: "#1e293b", border: "1px solid #334155" }}>
              <div style={{ fontSize: 24, fontWeight: 900, color: "#60a5fa", minWidth: 72, textAlign: "center" }}>Bin {bin}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#e2e8f0", textAlign: "left" }}>{team}</div>
            </div>
          ))}
        </div>
        <button onClick={onConfirm} style={{ padding: "13px 36px", borderRadius: 10, border: "none", background: "#3b82f6", color: "#fff", fontWeight: 700, fontSize: 16, cursor: "pointer" }}>
          Bins ready — Start Scanning
        </button>
      </div>
    </div>
  );
}

// ── Roster complete modal ─────────────────────────────────────────────────────
function RosterCompleteModal({ roster, offRosterFlags = 0, onExport, onDismiss }) {
  const count = s => roster.filter(r => r.scanned === s).length;
  const stats = [
    { label: "Passed",        value: count("pass"),    color: "#22c55e" },
    { label: "By hand",       value: count("manual"),  color: "#f59e0b" },
    { label: "With supervisor", value: count("flag") + offRosterFlags,  color: "#ef4444" },
    { label: "Missing",       value: count("missing"), color: "#f59e0b" },
    { label: "Short-shipped", value: count("short"),   color: "#f59e0b" },
  ].filter(s => s.value > 0 || s.label === "Passed");
  const open = count("flag") + offRosterFlags + count("manual") + count("missing") + count("short");
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 1600, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#161b22", borderRadius: 16, border: `2px solid ${open ? "#f59e0b" : "#22c55e"}`, padding: 40, maxWidth: 520, width: "90vw", textAlign: "center" }}>
        <div style={{ fontSize: 56, marginBottom: 12 }}>{open ? "📋" : "🎉"}</div>
        <div style={{ fontSize: 28, fontWeight: 900, color: open ? "#f59e0b" : "#22c55e", marginBottom: 8 }}>{open ? "Every jersey accounted for" : "Order Complete!"}</div>
        <div style={{ fontSize: 15, color: "#94a3b8", marginBottom: 6 }}>
          {open ? `${open} still open — with the supervisor, entered by hand, missing, or short-shipped. The box stays open until they are signed off or come back.` : `All ${roster.length} jerseys passed.`}
        </div>
        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 24 }}>Review the roster before exporting.</div>
        <div style={{ display: "flex", justifyContent: "center", gap: 22, marginBottom: 28, flexWrap: "wrap" }}>
          {stats.map(s => (
            <div key={s.label}>
              <div style={{ fontSize: 32, fontWeight: 900, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 }}>{s.label}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button onClick={onExport}  style={{ ...btnPri, fontSize: 15, padding: "12px 28px", background: "#22c55e" }}>⬇ Export to Excel</button>
          <button onClick={onDismiss} style={{ ...btnGhost, fontSize: 14, padding: "12px 20px" }}>Review first</button>
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
  const { scanKey, confirmKey, cancelKey, retryKey, byHandKey } = settings;

  const [savedSession]  = useState(() => { const s = loadSession(); return s && s.sessionStarted && Array.isArray(s.roster) && s.roster.length ? s : null; });
  const [resumeDecided, setResumeDecided] = useState(false);

  const [savedSignIn]   = useState(() => loadSignIn());      // who is at this station outlives any one order
  const [signedIn,           setSignedIn]           = useState(() => !!savedSignIn);
  const [sessionStarted,     setSessionStarted]     = useState(false);
  const [role,               setRole]               = useState(() => savedSignIn?.role || "");
  const [roster,             setRoster]             = useState([]);
  const [rosterFile,         setRosterFile]         = useState(null);
  const [orderNumber,        setOrderNumber]        = useState("");
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
  const [error,              setError]              = useState(null);
  const [xlsxReady,          setXlsxReady]          = useState(!!window.XLSX);
  const [showSettings,       setShowSettings]       = useState(false);
  const [bigPhoto,           setBigPhoto]           = useState(null);    // a flag photo from the log, shown large
  const [mics,               setMics]               = useState([]);
  const [showRosterComplete, setShowRosterComplete] = useState(false);
  const [hubOk, setHubOk] = useState(null);       // did the last progress report reach the hub? null = never tried
  const [newRosters, setNewRosters] = useState([]);   // rosters the supervisor sent while this order was running
  const knownRosterIds = useRef(null);                 // what was already waiting when this order started
  const [showHandover, setShowHandover] = useState(false);   // another operator takes over; the order stays
  const [handsFreePaused, setHandsFreePaused] = useState(false);   // operator paused hands-free; camera stays on, B still scans
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
  const [showSupervisor,     setShowSupervisor]     = useState(() => (savedSignIn?.role === "supervisor" || savedSignIn?.role === "admin") && !savedSession);
  const [binMap,             setBinMap]             = useState(null);
  const [firstScanTime,      setFirstScanTime]      = useState(null);
  const [now,                setNow]                = useState(() => Date.now());

  const binOf          = useCallback(team => binFor(binMap, team), [binMap]);
  const scannedRows    = roster.filter(r => r.scanned && r.scanned !== false);
  const remaining      = roster.filter(r => !r.scanned).length;
  // Hands-free runs only while it is on in Settings, not paused by the operator,
  // and the order still has jerseys to scan — a finished order must not keep
  // reading the empty table.
  const handsFree      = !!settings.autoScan && !handsFreePaused && remaining > 0;

  // Voice commands: the headset listens all shift; a command fires only while a
  // result screen is up and nothing is scanning. Each fire acts on the screen
  // like the matching key would.
  const voice = useVoice({ enabled: !!settings.voice && signedIn && sessionStarted, active: !!overlay && !scanning, deviceId: settings.micId || "" });
  // "scan" by voice: only when no result screen is up, exactly like the Scan key.
  const triggerRef = useRef(null);
  useEffect(() => {
    const h = e => { if (e.detail?.command === "scan" && !overlay && !scanning) triggerRef.current?.(); };
    window.addEventListener("jerseyqc:voice", h);
    return () => window.removeEventListener("jerseyqc:voice", h);
  }, [overlay, scanning]);
  const voiceUp = voice.status !== null;   // once the mic is open the device list carries names
  useEffect(() => {
    if (!settings.voice || !signedIn) return;
    navigator.mediaDevices?.enumerateDevices?.().then(devs => setMics(devs.filter(d => d.kind === "audioinput"))).catch(() => {});
  }, [settings.voice, signedIn, voiceUp]);
  // What the headset says when a result screen appears.
  useEffect(() => {
    if (!settings.voice || settings.voiceSpeak === false || !overlay) return;
    const m = overlay.match, mode = overlay.mode;
    if (mode === "confirm" && m) { const b = binFor(binMap, m.team); speak(`${m.number}${m.name ? ", " + m.name : ""}${b !== null ? ", bin " + b : ""}`); }
    else if (mode === "pick" || mode === "close") speak("check it, which jersey");
    else if (mode === "flag") speak(overlay.title === "COULD NOT READ" ? "could not read" : overlay.title === "SCAN FAILED" ? "scan failed" : "not found");
    else if (mode === "duplicate") speak("already done");
    else if (mode === "supervisor") speak("go to supervisor");
    else if (mode === "reasons") speak("what is wrong");
  }, [overlay?.mode, overlay?.match?._id]);   // eslint-disable-line react-hooks/exhaustive-deps
  const passCount      = roster.filter(r => r.scanned === "pass").length;
  const offRosterFlags = log.filter(l => l.status === S_FLAGGED && l.match?.offRoster && !l.resolution).length;   // typed jerseys that are not on the roster have no row
  const flagCount      = roster.filter(r => r.scanned === "flag").length + offRosterFlags;
  const manualCount    = roster.filter(r => r.scanned === "manual").length;
  const teamNames      = useMemo(() => [...new Set(roster.map(r => r.team).filter(Boolean))], [roster]);
  const canSupervise   = role === "supervisor" || role === "admin";
  const openCount      = roster.filter(r => r.scanned === "flag" || r.scanned === "missing" || r.scanned === "short").length;
  const rosterComplete = roster.length > 0 && remaining === 0;
  const elapsedMin     = firstScanTime ? (now - firstScanTime) / 60000 : 0;
  const scanRate       = elapsedMin > 1 && passCount > 0 ? passCount / elapsedMin : null;
  const etaMin         = scanRate && remaining > 0 ? Math.ceil(remaining / scanRate) : null;
  const rosterCols     = useMemo(() => displayColumns(roster), [roster]);
  const extraCols      = useMemo(() => extraColumns(roster), [roster]);
  const keyLabel       = formatKey(scanKey);
  const showResume     = !!savedSession && !resumeDecided && !sessionStarted;

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
    saveSession({ sessionStarted, role, roster, rosterFile, orderNumber, operatorName, notes, jerseyType, log, binMap, firstScanTime });
  }, [sessionStarted, role, roster, rosterFile, orderNumber, operatorName, notes, jerseyType, log, binMap, firstScanTime]);

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
    const send = () => hub.report(id, snapshotOf({ operatorName, role, orderNumber: sessionStarted ? orderNumber : "", notes, jerseyType, rosterFile: sessionStarted ? rosterFile : null, roster: sessionStarted ? roster : [], log: sessionStarted ? log : [], lastConfirmed: sessionStarted ? lastConfirmed : null, binMap })).then(() => setHubOk(true)).catch(() => setHubOk(false));
    send();
    const t = setInterval(send, 5000);
    return () => clearInterval(t);
  }, [signedIn, sessionStarted, operatorName, role, orderNumber, notes, jerseyType, rosterFile, roster, log, lastConfirmed, binMap]);

  // Open the complete modal once every row is accounted for (after at least one scan).
  useEffect(() => {
    if (!(roster.length > 0 && remaining === 0 && firstScanTime)) return;
    const t = setTimeout(() => setShowRosterComplete(true), 0);
    return () => clearTimeout(t);
  }, [remaining, roster.length, firstScanTime]);

  // ── Session lifecycle ─────────────────────────────────────────────────────
  const applyRoster = useCallback((parsed, fileName, { keepLog = false } = {}) => {
    rosterVersion.current++;
    setRoster(parsed.map(r => ({ ...r, scanned: false })));
    setRosterFile(fileName);
    if (!keepLog) { setLog([]); setLastResult(null); setLastConfirmed(null); setFirstScanTime(null); }
    setThumb(null); setOverlay(null); setShowRosterComplete(false);
    const bins = buildBinMap(parsed, binMap || {});
    if (Object.keys(bins).length > 1) { setBinMap(bins); setShowBinSetup(true); }
    else { setBinMap(null); setShowBinSetup(false); }
  }, [binMap]);

  const resumeSession = useCallback(() => {
    const s = savedSession;
    setRole(s.role || ""); setRoster(s.roster); setRosterFile(s.rosterFile || null);
    setOrderNumber(s.orderNumber || ""); setOperatorName(s.operatorName || ""); setNotes(s.notes || ""); setJerseyType(s.jerseyType || "");
    setLog(s.log || []); setBinMap(s.binMap || null); setFirstScanTime(s.firstScanTime || null);
    setSignedIn(true); saveSignIn({ role: s.role || "", name: s.operatorName || "" });
    setSessionStarted(true); setResumeDecided(true);
  }, [savedSession]);

  const discardSession = useCallback(() => { clearSession(); setResumeDecided(true); }, []);

  // Clears the order; the operator stays signed in and goes straight to order setup.
  // The camera pane unmounts with the roster, so the stream must be released too.
  const resetOrder = useCallback(() => {
    clearSession();
    streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null;   // stopCamera is declared below
    gateRef.current.disarm(); setArmed(false); setCameraOn(false);
    rosterVersion.current++;
    setSessionStarted(false); setResumeDecided(true);
    setRoster([]); setRosterFile(null); setOrderNumber(""); setNotes(""); setLog([]); setBinMap(null); setFirstScanTime(null); setNewRosters([]); setHandsFreePaused(false);
    setLastResult(null); setLastConfirmed(null); setOverlay(null); setThumb(null); setShowRosterComplete(false);
  }, []);

  const startNewOrder = useCallback(() => {
    if (log.length > 0 && !window.confirm(`Start a new order? Export first if you need the ${log.length} scans from order ${orderNumber || "—"}.`)) return;
    resetOrder();
  }, [log.length, orderNumber, resetOrder]);

  const signOut = useCallback(() => {
    if (log.length > 0 && !window.confirm(`Sign out? Export first if you need the ${log.length} scans from order ${orderNumber || "—"}.`)) return;
    resetOrder();
    clearSignIn();
    hub.removeStation(stationId()).catch(() => {});   // free the station on the board at once, not after it goes stale
    setSignedIn(false); setRole(""); setOperatorName("");
  }, [log.length, orderNumber, resetOrder]);

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
      const video = settings.cameraId
        ? { deviceId: { exact: settings.cameraId }, width: { ideal: 1280 }, height: { ideal: 720 } }
        : { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } };
      const stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      stream.getVideoTracks().forEach(t => { t.onended = () => { setError("Camera disconnected — check the USB cable, then press Start Camera."); stopCamera(); }; });
      setCameraOn(true);
      try { const devs = await navigator.mediaDevices.enumerateDevices(); setCameras(devs.filter(d => d.kind === "videoinput")); setMics(devs.filter(d => d.kind === "audioinput")); } catch { /* no device list; the dropdown stays on default */ }
    } catch (e) {
      setError(e?.name === "OverconstrainedError" ? "That camera is not available — choose another in Settings." : "Camera access denied. Click the camera icon in your browser's address bar.");
    }
  }, [settings.cameraId, stopCamera]);

  // ── Core scan ─────────────────────────────────────────────────────────────
  const doRunScan = useCallback(async (base64, dataUrl, recapture = null) => {
    const version = rosterVersion.current;
    if (!firstScanTime) setFirstScanTime(Date.now());
    gateRef.current.disarm(); setArmed(false);
    setScanning(true);
    setThumb(dataUrl);
    playTone("scan");

    const readOne = async (b64, url) => {
      // Send a smaller frame than the camera gives: same read, faster answer.
      const sendB64 = await frameForUpload(url, SEND_MAX_PX).catch(() => b64);
      const r = await readJersey({ base64: sendB64, apiKey: CLAUDE_API_KEY, model: MODEL, effort: EFFORT, thinking: THINKING, orderNumbers: roster.filter(x => !isDone(x)).map(x => x.number) });
      console.log(`Read #${r.number}${r.number_complete ? "" : "?"} ${r.name}${r.name_complete ? "" : "…"}${r.laid_flat ? "" : " [not flat]"} (${r.jersey_colour || "?"}${r.trim_colour ? "/" + r.trim_colour : ""}; sleeves: ${r.sleeve_numbers.join(",") || "—"}; number ${r.number_position || "?"}${r.obstruction ? "; " + r.obstruction : ""}) — tokens in ${r.usage?.input_tokens}, out ${r.usage?.output_tokens}`);
      return r;
    };
    const matchOf = d => (!d.name && !d.number) ? null : findMatches(roster, d.name, d.number, {
      nameComplete: d.name_complete, numberComplete: d.number_complete,
      position: d.number_position, obstruction: d.obstruction,
      colour: d.jersey_colour, trim: d.trim_colour, laidFlat: d.laid_flat,
    });

    let detected = { name: "", number: "" };
    let apiError = null;
    let m = null;
    try {
      detected = await readOne(base64, dataUrl);
      m = matchOf(detected);
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
    const scanObj  = { id: Date.now(), detected, thumb: dataUrl, smallThumb, photo };
    const showFlag = (reason, title) => { setOverlay({ mode: "flag", scan: scanObj, reason, title }); playTone("flag"); };

    if (apiError) { showFlag("API error: " + apiError, "SCAN FAILED"); return; }
    if (m === null) { showFlag("No name or number could be read. Check the jersey is in frame, flat, and lit.", "COULD NOT READ"); return; }

    if (m.type === "exact")          setOverlay({ mode: "confirm", scan: scanObj, match: m.match });
    else if (m.type === "duplicate") { setOverlay({ mode: "duplicate", scan: scanObj, match: m.match, reason: `#${m.match.number}${m.match.name ? " · " + m.match.name : ""}${m.match.size ? " · " + m.match.size : ""} already passed this session.` }); playTone("flag"); }
    else if (m.type === "pick" || m.type === "close") { setOverlay({ mode: m.type, scan: scanObj, candidates: m.candidates, reason: m.reason }); }
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

  const doTriggerScan = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || scanning || !cameraOn || roster.length === 0 || inputMode !== "camera") return;
    const video = videoRef.current;
    if (!video.videoWidth) { setError("Camera is still starting — try again in a second."); return; }
    // A dead track leaves the last frame frozen on screen; never scan that.
    const track = streamRef.current?.getVideoTracks?.()[0];
    if (!track || track.readyState !== "live") { setError("Camera disconnected — check the USB cable, then press Start Camera."); stopCamera(); return; }
    const f = captureFrame();
    if (f) doRunScan(f.base64, f.dataUrl, captureFrame);
  }, [scanning, cameraOn, roster.length, inputMode, captureFrame, doRunScan, stopCamera]);
  useEffect(() => { triggerRef.current = doTriggerScan; }, [doTriggerScan]);

  // ── Hands-free: after a confirm, scan when the picture changes and settles ─
  const modalOpen = showBinSetup || showRosterComplete || showSettings || showResume || showSupervisor || showHandover;
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
      if (gate.tick(frame)) { setArmed(false); doTriggerScan(); }
      else if (!gate.armed) setArmed(false);
    }, 200);
    return () => clearInterval(id);
  }, [cameraOn, inputMode, handsFree, overlay, scanning, modalOpen, doTriggerScan, stopCamera]);

  // A roster the supervisor sends while an order is running: say so quietly.
  // It is offered on the order screen when this order ends or on New order.
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
      const bins = buildBinMap(next, binMap || {});
      const newTeams = Object.keys(bins).length > Object.keys(binMap || {}).length;
      if (Object.keys(bins).length > 1) { setBinMap(bins); if (newTeams) setShowBinSetup(true); }
    } catch (err) { setError("Failed to parse roster: " + err.message); }
  }, [roster, binMap]);

  // ── Overlay actions ───────────────────────────────────────────────────────
  const stamp = useCallback(() => ({ timestamp: localTimeStamp(), operator: operatorName }), [operatorName]);

  const actions = useMemo(() => {
    // Commit a hand-typed jersey. On the roster: that row passes as MANUAL for
    // the supervisor to sign off. Not on the roster: nothing is added — the
    // roster is the order — it is flagged to the supervisor right away.
    const commitTyped = (o, { number, name, size, team }, exactRow) => {
      if (exactRow) {
        const reason = "Entered by operator — the camera could not read it";
        setRoster(prev => prev.map(r => r._id === exactRow._id ? { ...r, scanned: "manual" } : r));
        const entry = { id: o.scan?.id || Date.now(), detected: o.scan?.detected, thumb: o.scan?.smallThumb, match: exactRow, status: S_MANUAL, reason, ...stamp() };
        setLog(prev => [entry, ...prev]); setLastResult(entry); setLastConfirmed(entry);
        setOverlay({ mode: "manualDone", scan: o.scan, match: exactRow, reason });
        playTone("pass");
        return;
      }
      const typedRow = { number, name, team, size, offRoster: true };   // no _id: never a roster row
      const label  = `#${number || "?"}${name ? " " + name : ""}${team ? " (" + team + ")" : ""}`;
      const reason = `Not on the roster — operator typed ${label}`;
      const entry  = { id: o.scan?.id || Date.now(), detected: o.scan?.detected, thumb: o.scan?.smallThumb, photo: o.scan?.photo || null, match: typedRow, status: S_FLAGGED, reason, ...stamp() };
      setLog(prev => [entry, ...prev]); setLastResult(entry);
      setOverlay({ mode: "supervisor", scan: o.scan, match: typedRow, reason: "This jersey is not on the order's roster. Nothing was added — take it to the supervisor to check against the order paper.", route: "Supervisor → check the order" });
      playTone("flag");
    };
    return {
    confirm() {
      if (!overlay?.match) return;
      const scan  = overlay.scan;
      const entry = { id: scan.id || Date.now(), detected: scan.detected, thumb: scan.smallThumb, match: overlay.match, status: S_PASS, reason: overlay.note || "", ...stamp() };
      setRoster(prev => prev.map(r => r._id === overlay.match._id ? { ...r, scanned: "pass" } : r));
      setLog(prev => [entry, ...prev]);
      setLastResult(entry); setLastConfirmed(entry);
      setOverlay({ mode: "done", scan, match: overlay.match });
      playTone("pass");
    },
    retry()  { setOverlay(null); armAutoScan(); },
    pick(c)  { if (!overlay?.scan || !c || isDone(c)) return; setOverlay({ mode: "confirm", scan: overlay.scan, match: c, note: overlay.note }); },
    reasons() { setOverlay(o => ({ mode: "reasons", scan: o.scan, match: o.match || null, returnTo: o })); },
    back()   { setOverlay(o => o.returnTo || null); },
    chooseReason(r) {
      const o = overlay; if (!o) return;
      if (r.inPlace) { setOverlay({ ...(o.returnTo || { mode: "flag", scan: o.scan }), note: r.label }); return; }
      if (r.custom)  { setOverlay({ mode: "reasonText", scan: o.scan, match: o.match || null, returnTo: o }); return; }   // the list did not cover it: type it
      const entry = { id: o.scan.id || Date.now(), detected: o.scan.detected, thumb: o.scan.smallThumb, photo: o.scan.photo || null, match: o.match || null, status: S_FLAGGED, reason: r.label, reasonId: r.id, ...stamp() };
      if (o.match) setRoster(prev => prev.map(x => x._id === o.match._id ? { ...x, scanned: "flag" } : x));
      setLog(prev => [entry, ...prev]); setLastResult(entry);
      setOverlay({ mode: "supervisor", scan: o.scan, match: o.match || null, reason: r.label, route: r.route });
      playTone("flag");
    },
    reasonSubmit(text) {
      const o = overlay; if (!o) return;
      const label = String(text || "").trim(); if (!label) return;
      const entry = { id: o.scan.id || Date.now(), detected: o.scan.detected, thumb: o.scan.smallThumb, photo: o.scan.photo || null, match: o.match || null, status: S_FLAGGED, reason: label, reasonId: "other", ...stamp() };
      if (o.match) setRoster(prev => prev.map(x => x._id === o.match._id ? { ...x, scanned: "flag" } : x));
      setLog(prev => [entry, ...prev]); setLastResult(entry);
      setOverlay({ mode: "supervisor", scan: o.scan, match: o.match || null, reason: label, route: "Supervisor decides" });
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
      const m = findMatches(roster, name, number, { typed: true });
      if (m.type === "duplicate") { setOverlay({ mode: "duplicate", scan: o.scan, match: m.match, reason: `#${m.match.number}${m.match.name ? " · " + m.match.name : ""} already passed this session.` }); playTone("flag"); return; }
      if (m.type === "exact") { commitTyped(o, typed, m.match); return; }
      if (m.type === "pick" || m.type === "close") {
        // A near miss the operator has already rejected: they typed exactly what
        // the camera read, so the nearest rows were on the previous screen. Add it.
        const d = o.scan?.detected;
        const sameAsRead = d && String(d.number ?? "").trim() === number && String(d.name ?? "").trim().toLowerCase() === name.toLowerCase();
        if (m.type === "close" && sameAsRead) { commitTyped(o, typed, null); return; }
        setOverlay({ mode: "pick", scan: o.scan, candidates: m.candidates, typed,
          reason: m.type === "pick" ? "What you typed matches these rows — which one?" : "What you typed is close to these rows — one of them, or not on the roster?",
          note: "Typed by operator — the camera could not read it" });
        return;
      }
      commitTyped(o, typed, null);
    },
    continueManual() { setOverlay(null); armAutoScan(); },
    };
  }, [overlay, stamp, armAutoScan, roster, teamNames]);

  // ── Flag resolution (from the result card) ────────────────────────────────
  const resolveFlag = useCallback((logId, decision, note) => {
    const entry = log.find(l => l.id === logId);
    const resolution = decision === "accept" ? `Accepted — manually verified${note ? ": " + note : ""}`
                     : decision === "reject" ? `Rejected — sent back for rework${note ? ": " + note : ""}`
                     : (note || "Note added");
    const status = decision === "note" ? entry?.status || S_FLAGGED : S_MANUAL;
    setLog(prev => prev.map(l => l.id === logId ? { ...l, status, resolution } : l));
    setLastResult(prev => prev?.id === logId ? { ...prev, status, resolution } : prev);
    if (entry?.match?._id !== undefined && decision === "accept") {
      setRoster(prev => prev.map(r => r._id === entry.match._id ? { ...r, scanned: "pass" } : r));
    }
    if (entry?.match?._id !== undefined && decision === "reject") {
      setRoster(prev => prev.map(r => r._id === entry.match._id && r.scanned === "manual" ? { ...r, scanned: "flag" } : r));   // a rejected hand entry goes to the supervisor
    }
  }, [log]);

  // Manual marks on roster rows: missing / short-shipped / clear.
  const markRow = useCallback((id, mark) => {
    setRoster(prev => prev.map(r => r._id === id ? { ...r, scanned: mark } : r));
  }, []);

  // Un-check a jersey that was confirmed by mistake: it goes back to Remaining
  // and must be scanned again. The earlier log lines stay; a new line says who
  // un-checked it, and any open flag or by-hand entry for it is closed so the
  // supervisor's list drops it.
  const unscan = useCallback((id) => {
    const row = roster.find(r => r._id === id); if (!row || !row.scanned) return;
    const was = { pass: "passed", manual: "entered by hand", flag: "with the supervisor", missing: "marked missing", short: "marked short-shipped" }[row.scanned] || row.scanned;
    if (!window.confirm(`Un-check #${row.number}${row.name ? " · " + row.name : ""} (${was})?\n\nIt goes back to Remaining and must be scanned again.`)) return;
    setRoster(prev => prev.map(r => r._id === id ? { ...r, scanned: false } : r));
    const resolution = `Un-checked by ${operatorName || "operator"} — to be scanned again`;
    setLog(prev => [
      { id: Date.now(), match: { ...row, scanned: false }, status: "undo", reason: `Un-checked — was ${was}; scan it again`, ...stamp() },
      ...prev.map(l => l.match?._id === id && (l.status === S_FLAGGED || l.status === S_MANUAL) && !l.resolution ? { ...l, resolution } : l),
    ]);
    setLastResult(r => (r?.match?._id === id ? null : r)); setLastConfirmed(c => (c?.match?._id === id ? null : c));
  }, [roster, operatorName, stamp]);

  // ── Global keyboard: scan trigger only ───────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (e.repeat) return;
      if (overlay || showBinSetup || showRosterComplete || showSettings || showResume || !sessionStarted) return;
      if (e.code !== scanKey) return;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
      e.preventDefault();
      gateRef.current.disarm(); setArmed(false);
      doTriggerScan();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [overlay, showBinSetup, showRosterComplete, showSettings, showResume, sessionStarted, scanKey, doTriggerScan]);

  const overlayKey = overlay ? `${overlay.mode}:${overlay.scan?.id}:${(overlay.candidates || []).map(c => c._id).join(",")}` : "";
  const exportMeta = { orderNumber, operatorName, notes, jerseyType: jerseyTypeLabel(jerseyType) };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "system-ui,sans-serif", background: "#0d1117", height: "100vh", color: "#e2e8f0", display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {showResume && <ResumeModal session={savedSession} onResume={resumeSession} onDiscard={discardSession} />}

      {!showResume && !signedIn && (
        <SignInModal initial={savedSignIn}
          onSignIn={({ role, name }) => { setRole(role); setOperatorName(name); setSignedIn(true); saveSignIn({ role, name }); setResumeDecided(true); if (role === "supervisor" || role === "admin") setShowSupervisor(true); }} />
      )}

      {showHandover && (
        <SignInModal title="Hand this station to another operator — the order, roster and log stay as they are" initial={{ role }}
          onCancel={() => closeDialog(() => setShowHandover(false))}
          onSignIn={({ role: r, name }) => { setRole(r); setOperatorName(name); saveSignIn({ role: r, name }); closeDialog(() => setShowHandover(false)); }} />
      )}

      {showSupervisor && <SupervisorPanel operatorName={operatorName} onClose={() => closeDialog(() => setShowSupervisor(false))} />}

      {!showResume && signedIn && !sessionStarted && !showSupervisor && (
        <OrderSetupModal operatorName={operatorName} role={role} xlsxReady={xlsxReady} onSignOut={signOut} onSupervisor={() => setShowSupervisor(true)}
          onStart={({ roster, orderNumber, notes, jerseyType, rosterFile }) => {
            setBinMap(null);
            applyRoster(roster, rosterFile);
            setOrderNumber(orderNumber); setNotes(notes); setJerseyType(jerseyType || "");
            setSessionStarted(true); setResumeDecided(true);
          }} />
      )}

      {showBinSetup && binMap && (
        <BinSetupModal entries={binEntries(roster, binMap)} onConfirm={() => setShowBinSetup(false)} />
      )}

      {overlay && !wide && (
        <ScanOverlay key={overlayKey} state={overlay} actions={actions} binMap={binMap} extraCols={extraCols} notes={notes} jerseyType={jerseyType} confirmKey={confirmKey} cancelKey={cancelKey} retryKey={retryKey} byHandKey={byHandKey}
          stream={cameraOn && inputMode === "camera" ? streamRef.current : null} rotation={settings.rotation} />
      )}

      {showSettings && (
        <SettingsPanel settings={settings} cameras={cameras} mics={mics} onSave={setSettings} onClose={saved => closeDialog(() => setShowSettings(false), saved ? saved.autoScan : undefined)} />
      )}
      {bigPhoto && <PhotoLightbox src={bigPhoto} onClose={() => setBigPhoto(null)} />}

      {showRosterComplete && (
        <RosterCompleteModal roster={roster} offRosterFlags={offRosterFlags}
          onExport={() => { exportRosterXLSX(roster, log, exportMeta, rosterCols, binOf); closeDialog(() => setShowRosterComplete(false)); }}
          onDismiss={() => closeDialog(() => setShowRosterComplete(false))} />
      )}

      {/* Header */}
      <div style={{ background: "#161b22", borderBottom: "1px solid #21262d", padding: "8px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 14 }}>🏭 Jersey QC Scanner</div>
            {rosterFile && (
              <div style={{ fontSize: 10, color: "#64748b" }}>
                {rosterFile}{operatorName ? ` · ${operatorName}` : ""}{role ? ` (${role})` : ""}
              </div>
            )}
          </div>
          {canSupervise
            ? <input value={orderNumber} onChange={e => setOrderNumber(e.target.value)} placeholder="Order number…"
                onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur(); }}
                style={{ padding: "4px 9px", borderRadius: 6, border: "1px solid #334155", background: "#1e293b", color: "#e2e8f0", fontSize: 12, width: 140 }} />
            : <div title="Only the supervisor can change the order number" style={{ padding: "4px 9px", borderRadius: 6, border: "1px solid #21262d", background: "#0d1117", color: orderNumber ? "#e2e8f0" : "#64748b", fontSize: 12, fontWeight: 700, userSelect: "none" }}>Order {orderNumber || "—"}</div>}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <Pill color="#22c55e">{passCount} Pass</Pill>
          <Pill color="#ef4444">{flagCount} Flag</Pill>
          {manualCount > 0 && <Pill color="#f59e0b">{manualCount} By hand</Pill>}
          {hubOk === false && <Pill color="#f87171">Supervisor screen not reachable — scanning still works</Pill>}
          {openCount - flagCount > 0 && <Pill color="#f59e0b">{openCount - flagCount} Missing</Pill>}
          {canSupervise && <button onClick={() => setShowSupervisor(true)} title="See every station and send rosters" style={{ ...btnGhost, padding: "3px 9px", fontSize: 11, borderColor: "#f59e0b", color: "#fcd34d" }}>Stations</button>}
          {sessionStarted && <button onClick={startNewOrder} title="Finish this order and set up the next one — no PIN needed" style={{ ...btnGhost, padding: "3px 9px", fontSize: 11 }}>New order</button>}
          {signedIn && sessionStarted && <button onClick={() => setShowHandover(true)} title="Another operator takes over this station — the order keeps going" style={{ ...btnGhost, padding: "3px 9px", fontSize: 11 }}>Change operator</button>}
          {signedIn && <button onClick={signOut} title="End your shift at this station" style={{ ...btnGhost, padding: "3px 9px", fontSize: 11 }}>Sign out</button>}
          <button onClick={toggleFullscreen} title={isFullscreen ? "Leave full screen (Esc also works)" : "Full screen — hides the browser's tabs and address bar (F11 does the same)"} style={{ ...btnGhost, padding: "3px 9px", fontSize: 11 }}>{isFullscreen ? "⤢ Exit full screen" : "⛶ Full screen"}</button>
          {fsHint && <span style={{ fontSize: 11, color: "#fcd34d" }}>{fsHint}</span>}
          <button onClick={() => setShowSettings(true)} style={{ ...btnGhost, padding: "3px 9px" }}>⚙</button>
        </div>
      </div>

      {(notes || jerseyType) && (
        <div style={{ background: "rgba(245,158,11,0.10)", borderBottom: "1px solid rgba(245,158,11,0.35)", padding: "6px 16px", fontSize: 12, color: "#fcd34d", flexShrink: 0, display: "flex", gap: 14, alignItems: "center" }}>
          {jerseyType && <span style={{ border: "1px solid #60a5fa", color: "#93c5fd", borderRadius: 999, padding: "1px 10px", fontWeight: 700, whiteSpace: "nowrap" }}>{jerseyTypeLabel(jerseyType)} · {jerseyTypeOf(jerseyType)?.construction}</span>}
          {notes && <span><strong>Order notes:</strong> {notes}</span>}
        </div>
      )}

      {sessionStarted && newRosters.length > 0 && (
        <div style={{ background: "rgba(59,130,246,0.12)", borderBottom: "1px solid rgba(59,130,246,0.4)", padding: "6px 16px", fontSize: 12, color: "#bfdbfe", flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <span>📋 <strong>{newRosters.map(r => `Order ${r.orderNumber || "—"} from ${r.by || "the supervisor"} (${r.rowCount} ${r.rowCount === 1 ? "jersey" : "jerseys"}${r.forStation ? ", for this station" : ""})`).join(" · ")}</strong> is waiting for you — it is offered when this order ends, or on New order.</span>
          <button onClick={() => setNewRosters([])} title="Hide" style={{ background: "transparent", border: 0, color: "#bfdbfe", cursor: "pointer", fontSize: 14, lineHeight: 1 }}>✕</button>
        </div>
      )}

      {roster.length > 0 && (
        <div style={{ height: 4, background: "#1e293b", flexShrink: 0 }}>
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
              <div style={{ fontSize: 36, marginBottom: 10 }}>📋</div>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>No Roster Loaded</div>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 16 }}>
                CSV or Excel: <code style={codeSt}>name</code> <code style={codeSt}>number</code> <code style={codeSt}>team</code> <code style={codeSt}>size</code>
              </div>
              {error && <p style={{ fontSize: 12, color: "#f87171", marginTop: 10 }}>{error}</p>}
            </div>
          ) : (
            <>
              <div style={{ display: "flex", borderBottom: "1px solid #21262d" }}>
                {["camera", "upload"].map(m => (
                  <button key={m} onClick={() => { setInputMode(m); if (m === "upload") stopCamera(); }}
                    style={{ flex: 1, padding: "8px 0", border: "none", background: inputMode === m ? "rgba(59,130,246,0.1)" : "transparent", color: inputMode === m ? "#60a5fa" : "#64748b", fontWeight: 600, fontSize: 12, borderBottom: inputMode === m ? "2px solid #3b82f6" : "2px solid transparent", cursor: "pointer" }}>
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
                        <span style={{ fontSize: 40 }}>📷</span>
                        <span style={{ fontSize: 13, color: "#64748b" }}>Camera off</span>
                      </div>
                    )}
                    {cameraOn && (
                      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                        <div style={{ width: 200, height: 120, border: "2px solid rgba(255,255,255,0.35)", borderRadius: 6, boxShadow: "0 0 0 9999px rgba(0,0,0,0.25)" }} />
                      </div>
                    )}
                    {scanning && (
                      <div style={{ position: "absolute", inset: 0, background: "rgba(59,130,246,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <div style={{ color: "#fff", fontWeight: 700, background: "rgba(0,0,0,0.6)", padding: "8px 20px", borderRadius: 20 }}>⏳ Reading…</div>
                      </div>
                    )}
                    {cameraOn && !scanning && (
                      <>
                        {settings.voice && <div style={{ position: "absolute", top: 8, left: 8 }}><VoiceBadge status={voice.status} error={voice.error} loading={voice.loading} active={!!overlay && !scanning} /></div>}
                        <div style={{ position: "absolute", top: 8, right: 8, display: "flex", alignItems: "center", gap: 5, background: "rgba(0,0,0,0.55)", padding: "3px 9px", borderRadius: 20 }}>
                          <div style={{ width: 7, height: 7, borderRadius: "50%", background: armed && handsFree ? "#f59e0b" : handsFreePaused ? "#94a3b8" : "#22c55e", boxShadow: `0 0 5px ${armed && handsFree ? "#f59e0b" : handsFreePaused ? "#94a3b8" : "#22c55e"}` }} />
                          <span style={{ fontSize: 10, color: "#e2e8f0" }}>{armed && handsFree ? "Waiting for the next jersey…" : handsFreePaused ? "Hands-free paused — B to scan" : !settings.autoScan ? "Hands-free off — B to scan" : roster.length > 0 && remaining === 0 ? "Order done — hands-free off" : "Ready"}</span>
                        </div>
                        <div style={{ position: "absolute", bottom: 8, left: "50%", transform: "translateX(-50%)", background: "rgba(0,0,0,0.55)", color: "#94a3b8", fontSize: 10, padding: "3px 9px", borderRadius: 12, whiteSpace: "nowrap" }}>
                          Lay it flat, fully open, no folds · Press <kbd style={{ background: "#1e293b", padding: "1px 4px", borderRadius: 3, fontSize: 10 }}>{keyLabel}</kbd> to scan
                        </div>
                      </>
                    )}
                  </div>
                  <div style={{ padding: "10px 12px", display: "flex", gap: 8, borderTop: "1px solid #21262d" }}>
                    {!cameraOn
                      ? <button onClick={startCamera} style={{ ...btnPri, flex: 1, fontSize: 15, padding: "12px" }}>Start Camera</button>
                      : <>
                          <button onClick={stopCamera} title="Stop the camera" style={{ ...btnGhost, width: 42 }}>■</button>
                          <button onClick={toggleHandsFree} title={!settings.autoScan ? "Turn hands-free scanning on" : handsFreePaused ? "Resume hands-free scanning" : "Pause hands-free — the camera stays on and B still scans"}
                            style={{ ...btnGhost, padding: "0 12px", fontSize: 13, fontWeight: 700, borderColor: "#f59e0b", color: "#fcd34d", background: handsFree ? "rgba(245,158,11,0.14)" : "transparent" }}>{handsFree ? "⏸ Pause scan" : "▶ Hands-free"}</button>
                          <button onClick={() => { gateRef.current.disarm(); setArmed(false); doTriggerScan(); }} disabled={scanning}
                            style={{ ...btnPri, flex: 1, fontSize: 18, padding: "12px", opacity: scanning ? 0.4 : 1 }}>
                            {scanning ? "Reading…" : "⚡ SCAN"}
                          </button>
                        </>
                    }
                  </div>
                  {error && <p style={{ padding: "0 12px 8px", fontSize: 11, color: "#f87171" }}>{error}</p>}
                </div>
              )}

              {inputMode === "upload" && (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20, gap: 12 }}>
                  {thumb
                    ? <img src={thumb} alt="uploaded" style={{ width: "100%", borderRadius: 8, maxHeight: 300, objectFit: "contain" }} />
                    : <div style={{ width: "100%", aspectRatio: "4/3", background: "#0d1117", borderRadius: 8, border: "2px dashed #334155", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, color: "#475569" }}>
                        <span style={{ fontSize: 36 }}>🖼</span>
                        <span style={{ fontSize: 12 }}>No photo selected</span>
                      </div>
                  }
                  <input ref={photoRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePhotoUpload} />
                  <button onClick={() => photoRef.current.click()} disabled={scanning}
                    style={{ ...btnPri, width: "100%", fontSize: 16, padding: "12px", opacity: scanning ? 0.5 : 1 }}>
                    {scanning ? "⏳ Reading…" : "⚡ Upload & Scan"}
                  </button>
                  {error && <p style={{ fontSize: 11, color: "#f87171" }}>{error}</p>}
                </div>
              )}

              {lastConfirmed && (
                <div style={{ padding: "7px 12px", borderTop: "1px solid #21262d", display: "flex", alignItems: "center", gap: 10, background: "rgba(34,197,94,0.05)", flexShrink: 0 }}>
                  <span style={{ fontSize: 10, color: "#64748b", whiteSpace: "nowrap" }}>Last:</span>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>#{lastConfirmed.match?.number}{lastConfirmed.match?.name ? ` · ${lastConfirmed.match.name}` : ""}</span>
                  {lastConfirmed.match?.size && <span style={{ fontSize: 11, color: "#22c55e", fontWeight: 700 }}>{lastConfirmed.match.size}</span>}
                  {binOf(lastConfirmed.match?.team) !== null && <span style={{ fontSize: 11, color: "#60a5fa", fontWeight: 700 }}>Bin {binOf(lastConfirmed.match?.team)}</span>}
                  {lastConfirmed.match?._id !== undefined && roster.some(r => r._id === lastConfirmed.match._id && r.scanned) && (
                    <button onClick={() => unscan(lastConfirmed.match._id)} title="Wrong jersey? Un-check it — it goes back to Remaining and must be scanned again" style={{ ...btnGhost, padding: "1px 8px", fontSize: 11, borderColor: "#f59e0b", color: "#fcd34d" }}>↶ Undo — scan again</button>
                  )}
                  <span style={{ fontSize: 10, color: "#475569", marginLeft: "auto" }}>{lastConfirmed.timestamp}</span>
                </div>
              )}

              {lastResult && lastResult.status !== S_PASS && !overlay && (
                <div style={{ padding: "0 10px 10px", flexShrink: 0 }}>
                  <ResultCard result={lastResult} onResolve={resolveFlag} />
                </div>
              )}

              <div style={{ padding: "7px 12px", borderTop: "1px solid #21262d", background: "#0d1117", flexShrink: 0 }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px" }}>
                  {[["scan", keyLabel, "Scan"], ["confirm", formatKey(confirmKey), "Select"], ["nav", formatKey(cancelKey), "Next option"], ["retry", formatKey(retryKey), "Retry scan"], ["byhand", formatKey(byHandKey), "Enter by hand"], ["arrows", "↑↓", "Move"]].map(([id, k, d]) => (
                    <div key={id} style={{ display: "flex", gap: 5, alignItems: "center" }}>
                      <kbd style={{ background: "#1e293b", border: "1px solid #334155", padding: "1px 6px", borderRadius: 4, fontSize: 10 }}>{k}</kbd>
                      <span style={{ fontSize: 10, color: "#64748b" }}>{d}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* RIGHT: Info panel — on a wide screen the result screen takes this half so the camera stays in view */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0, position: "relative" }}>
          {overlay && wide && (
            <ScanOverlay key={overlayKey} embedded state={overlay} actions={actions} binMap={binMap} extraCols={extraCols} notes={notes} jerseyType={jerseyType} confirmKey={confirmKey} cancelKey={cancelKey} retryKey={retryKey} byHandKey={byHandKey}
              stream={null} rotation={settings.rotation} />
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", borderBottom: "1px solid #21262d", flexShrink: 0 }}>
            {[
              { label: "Done",      value: `${scannedRows.length} / ${roster.length}`, color: "#e2e8f0" },
              { label: "Remaining", value: remaining,  color: remaining === 0 ? "#22c55e" : "#f59e0b" },
              { label: "Open",      value: openCount,  color: openCount > 0 ? "#ef4444" : "#64748b" },
              { label: "ETA",       value: etaMin ? `${etaMin}m` : "—", color: "#64748b" },
            ].map(s => (
              <div key={s.label} style={{ padding: "10px 0", textAlign: "center", borderRight: "1px solid #21262d" }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: s.color, lineHeight: 1.2 }}>{s.value}</div>
                <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 }}>{s.label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", borderBottom: "1px solid #21262d", flexShrink: 0 }}>
            {["roster", "log"].map(v => (
              <button key={v} onClick={() => setView(v)} style={{ flex: 1, padding: "8px 0", border: "none", background: "transparent", color: view === v ? "#3b82f6" : "#64748b", fontWeight: 600, fontSize: 12, borderBottom: view === v ? "2px solid #3b82f6" : "2px solid transparent", cursor: "pointer", textTransform: "capitalize" }}>
                {v === "log" ? `Log (${log.length})` : `Roster (${roster.length})`}
              </button>
            ))}
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 10px", borderLeft: "1px solid #21262d" }}>
              {roster.length > 0 && (
                <>
                  <button onClick={() => addRef.current.click()} title="Append another roster file to this order" style={{ ...btnGhost, padding: "3px 8px", fontSize: 11 }}>+ Add</button>
                  <input ref={addRef} type="file" accept=".csv,.xlsx,.xls,.tsv,.txt" style={{ display: "none" }} onChange={handleRosterAdd} />
                  <button onClick={() => rosterRef.current.click()} title="Replace the roster (scans stay in the log)" style={{ ...btnGhost, padding: "3px 8px", fontSize: 11 }}>Replace</button>
                  <input ref={rosterRef} type="file" accept=".csv,.xlsx,.xls,.tsv,.txt" style={{ display: "none" }} onChange={handleRosterUpload} />
                  <button onClick={() => exportRosterXLSX(roster, log, exportMeta, rosterCols, binOf)}
                    style={{ ...btnPri, padding: "3px 10px", fontSize: 11, background: rosterComplete ? "#22c55e" : "#3b82f6" }}>
                    {rosterComplete ? "✅ Export" : "⬇ Export"}
                  </button>
                  {log.some(l => l.status === S_FLAGGED) && (
                    <button onClick={() => exportDamageReportXLSX(buildDamageRows(log, { operatorName, orderNumber, jerseyType, typeLabel: jerseyTypeLabel }), { name: orderNumber || "order", title: `Damage report — order ${orderNumber || "—"}${jerseyType ? " · " + jerseyTypeLabel(jerseyType) : ""}` }).catch(e => setError(e.message))}
                      title="Every flagged jersey of this order with its photo, as Excel" style={{ ...btnGhost, padding: "3px 10px", fontSize: 11, borderColor: "#ef4444", color: "#f87171" }}>⬇ Damage report</button>
                  )}
                </>
              )}
            </div>
          </div>

          {view === "roster" && (
            <div style={{ flex: 1, overflowY: "auto" }}>
              {roster.length === 0
                ? <div style={{ padding: 32, textAlign: "center", color: "#64748b" }}>No roster loaded.</div>
                : (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead style={{ position: "sticky", top: 0, background: "#161b22", zIndex: 1 }}>
                      <tr>
                        <th style={thSt}>Status</th>
                        {rosterCols.map(c => <th key={c} style={thSt}>{c}</th>)}
                        {binMap && <th style={thSt}>Bin</th>}
                        <th style={thSt}>Mark</th>
                      </tr>
                    </thead>
                    <tbody>
                      {roster.map(r => (
                        <tr key={r._id} style={{
                          background: r.scanned === "pass" ? "rgba(34,197,94,0.07)" : r.scanned === "flag" ? "rgba(239,68,68,0.07)" : r.scanned ? "rgba(245,158,11,0.07)" : "transparent",
                          borderBottom: "1px solid #1e293b",
                        }}>
                          <td style={{ ...tdSt, textAlign: "center" }}>
                            {r.scanned === "pass" ? "✅" : r.scanned === "flag" ? "🛑" : r.scanned === "manual" ? "✍" : r.scanned === "missing" ? "❓" : r.scanned === "short" ? "📦" : <span style={{ color: "#475569" }}>—</span>}
                          </td>
                          {rosterCols.map(c => (
                            <td key={c} style={{ ...tdSt, fontWeight: c === "size" ? 700 : 400, color: c === "size" ? "#f59e0b" : "#e2e8f0" }}>{r[c]}</td>
                          ))}
                          {binMap && <td style={{ ...tdSt, color: "#60a5fa", fontWeight: 700 }}>{binOf(r.team) !== null ? `Bin ${binOf(r.team)}` : "—"}</td>}
                          <td style={{ ...tdSt, padding: "2px 6px" }}>
                            <select value={["missing", "short"].includes(r.scanned) ? r.scanned : ""}
                              onChange={e => { const v = e.target.value; if (v === "unscan") unscan(r._id); else markRow(r._id, v || false); }}
                              style={{ background: "#1e293b", color: "#94a3b8", border: "1px solid #334155", borderRadius: 4, fontSize: 10, padding: "2px 4px" }}>
                              <option value="">—</option>
                              {(!r.scanned || ["missing", "short"].includes(r.scanned))
                                ? <><option value="missing">Missing</option><option value="short">Short-shipped</option></>
                                : <option value="unscan">Un-check — scan again</option>}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              }
            </div>
          )}

          {view === "log" && (
            <div style={{ flex: 1, overflowY: "auto", padding: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: "#94a3b8" }}>{log.length} scans this session</span>
                {log.length > 0 && <button onClick={() => exportLogCSV(log, orderNumber, binOf)} style={{ ...btnGhost, fontSize: 11 }}>⬇ Export Log</button>}
              </div>
              {log.length === 0
                ? <div style={{ textAlign: "center", padding: 28, color: "#64748b" }}>No scans yet.</div>
                : log.map(l => (
                  <div key={l.id} style={{ ...card, borderLeft: `3px solid ${statusColor(l.status)}`, padding: "10px 12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      {(l.photo || l.thumb) && <img src={l.photo || l.thumb} alt="" title={l.photo ? "Photo kept for the supervisor — click to enlarge" : ""} onClick={l.photo ? () => setBigPhoto(l.photo) : undefined} style={{ width: l.photo ? 72 : 48, height: l.photo ? 54 : 36, objectFit: "cover", borderRadius: 4, flexShrink: 0, cursor: l.photo ? "zoom-in" : "default", border: l.photo ? "1px solid #ef4444" : "none" }} />}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: statusColor(l.status), textTransform: "uppercase", letterSpacing: 1 }}>{l.status}</span>
                        <div style={{ fontWeight: 700, fontSize: 14, marginTop: 1 }}>Read: #{l.detected?.number || "?"} · {l.detected?.name || "—"}</div>
                        {l.match && (
                          <div style={{ fontSize: 11, color: "#94a3b8" }}>
                            Matched: {l.match.name || "—"} #{l.match.number}{l.match.size ? ` · ${l.match.size}` : ""}{l.match.team ? ` · ${l.match.team}` : ""}{binOf(l.match.team) !== null ? ` · Bin ${binOf(l.match.team)}` : ""}
                          </div>
                        )}
                        {l.reason     && <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 2 }}>⚠ {l.reason}</div>}
                        {l.resolution && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>Resolution: {l.resolution}</div>}
                      </div>
                      <div style={{ fontSize: 10, color: "#475569", whiteSpace: "nowrap", textAlign: "right" }}>{l.timestamp}<br />{l.operator}</div>
                    </div>
                  </div>
                ))
              }
            </div>
          )}

          {remaining > 0 && roster.length > 0 && (
            <div style={{ borderTop: "1px solid #21262d", padding: "8px 12px", maxHeight: 110, overflowY: "auto", flexShrink: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 }}>Remaining ({remaining})</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {roster.filter(r => !r.scanned).map(r => (
                  <div key={r._id} style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 5, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>
                    #{r.number}{r.name ? ` ${r.name}` : ""}{r.size ? ` (${r.size})` : ""}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
