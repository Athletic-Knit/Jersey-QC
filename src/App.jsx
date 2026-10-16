import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { parseCSV, parseExcel, buildBinMap, binFor, binEntries, displayColumns, extraColumns, CORE_COLUMNS } from "./lib/roster.js";
import { findMatches, differingFields, isDone } from "./lib/match.js";
import { exportRosterXLSX, exportLogCSV, localTimeStamp } from "./lib/export.js";
import { saveSession, loadSession, clearSession, saveSettings, loadSettings, saveSignIn, loadSignIn, clearSignIn, shrinkDataUrl, downscaleImage } from "./lib/persist.js";
import { playTone } from "./lib/audio.js";
import { readJersey } from "./lib/vision.js";
import { sampleFrame, createMotionGate } from "./lib/motion.js";
import { hub, stationId, snapshotOf } from "./lib/hub.js";
import { MODEL, CHECKLIST, REASONS, ROLES, PIN_REQUIRED, DEFAULT_SETTINGS } from "./config.js";

const CLAUDE_API_KEY = import.meta.env.VITE_CLAUDE_API_KEY;

const S_PASS    = "pass";
const S_FLAGGED = "flagged";
const S_MANUAL  = "manual";

function formatKey(code) {
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
function SignInModal({ onSignIn, initial }) {
  const [role,  setRole]  = useState(initial?.role || ROLES[0].id);
  const [pin,   setPin]   = useState("");
  const [name,  setName]  = useState(initial?.name || "");
  const [error, setError] = useState(null);

  const submit = () => {
    const roleDef = ROLES.find(r => r.id === role);
    if (PIN_REQUIRED && pin !== roleDef.pin) { setError("Wrong PIN for " + roleDef.label + "."); return; }
    if (!name.trim()) { setError("Please enter your name."); return; }
    onSignIn({ role, name: name.trim() });
  };
  const onEnter = e => { if (e.key === "Enter") submit(); };

  return (
    <div style={modalBg}>
      <div style={modalCard}>
        <div style={{ fontSize: 32, marginBottom: 6, textAlign: "center" }}>🏭</div>
        <div style={{ fontWeight: 900, fontSize: 22, textAlign: "center", marginBottom: 2 }}>Jersey QC Scanner</div>
        <div style={{ fontSize: 13, color: "#64748b", textAlign: "center", marginBottom: 22 }}>Sign in once per shift</div>
        <div style={{ marginBottom: 12 }}>
          <label style={labelSt}>Role</label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6 }}>
            {ROLES.map(r => (
              <button key={r.id} onClick={() => setRole(r.id)}
                style={{ ...btnGhost, padding: "8px 4px", fontSize: 12, borderColor: role === r.id ? "#3b82f6" : "#334155", color: role === r.id ? "#fff" : "#94a3b8", background: role === r.id ? "rgba(59,130,246,0.18)" : "transparent" }}>
                {r.label}
              </button>
            ))}
          </div>
        </div>
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
        <button onClick={submit} style={bigBtn}>Sign in →</button>
      </div>
    </div>
  );
}

// ── Order setup (every order; no PIN) ─────────────────────────────────────────
function OrderSetupModal({ operatorName, role, xlsxReady, onStart, onSignOut, onSupervisor }) {
  const [order,   setOrder]   = useState("");
  const [notes,   setNotes]   = useState("");
  const [file,    setFile]    = useState(null);
  const [error,   setError]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [hubRosters, setHubRosters] = useState([]);
  const [picked,  setPicked]  = useState(null);     // a roster the supervisor sent
  const fileRef = useRef(null);

  // Rosters the supervisor has sent to the hub, if a hub is running.
  useEffect(() => {
    let on = true;
    hub.rosters().then(r => { if (on) setHubRosters(r.rosters || []); }).catch(() => {});
    return () => { on = false; };
  }, []);

  const handleFile = (e) => { const f = e.target.files[0]; if (f) { setFile(f); setPicked(null); setError(null); } e.target.value = ""; };

  const pickRoster = async (summary) => {
    try {
      const full = await hub.roster(summary.id);
      setPicked(full); setFile(null); setError(null);
      setOrder(full.orderNumber || ""); setNotes(full.notes || "");
    } catch (e) { setError("Could not fetch that roster: " + e.message); }
  };

  const handleStart = async () => {
    if (!order.trim()) { setError("Please enter an order number."); return; }
    if (!file && !picked) { setError("Upload a roster file, or pick one the supervisor sent."); return; }
    setLoading(true);
    try {
      if (picked) { onStart({ roster: picked.rows, orderNumber: order.trim(), notes: notes.trim(), rosterFile: `${picked.fileName || "roster"} (from ${picked.by || "supervisor"})` }); return; }
      const isExcel = /\.(xlsx|xls)$/i.test(file.name);
      const parsed  = isExcel ? await parseExcel(file) : parseCSV(await file.text());
      if (parsed.length === 0) { setError("No valid rows found. The file needs a header row with name and/or number columns."); setLoading(false); return; }
      onStart({ roster: parsed, orderNumber: order.trim(), notes: notes.trim(), rosterFile: file.name });
    } catch (err) {
      setError("Failed to parse roster: " + err.message);
      setLoading(false);
    }
  };
  const onEnter = e => { if (e.key === "Enter") handleStart(); };
  const canSupervise = role === "supervisor" || role === "admin";

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
        {hubRosters.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <label style={labelSt}>From the supervisor</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 150, overflowY: "auto" }}>
              {hubRosters.map(r => (
                <button key={r.id} onClick={() => pickRoster(r)}
                  style={{ ...btnGhost, textAlign: "left", padding: "8px 12px", borderColor: picked?.id === r.id ? "#22c55e" : "#334155", color: picked?.id === r.id ? "#fff" : "#94a3b8", background: picked?.id === r.id ? "rgba(34,197,94,0.12)" : "transparent" }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>Order {r.orderNumber || "—"} <span style={{ fontWeight: 400, color: "#64748b" }}>· {r.rowCount} jerseys · {r.fileName}</span></div>
                  <div style={{ fontSize: 11, color: "#64748b" }}>{r.by ? `sent by ${r.by} · ` : ""}{new Date(r.createdAt).toLocaleString()}</div>
                </button>
              ))}
            </div>
          </div>
        )}
        <div style={{ marginBottom: 12 }}>
          <label style={labelSt}>Order number</label>
          <input value={order} onChange={e => setOrder(e.target.value)} placeholder="e.g. 25" autoFocus onKeyDown={onEnter} style={inputSt} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={labelSt}>Order notes <span style={{ color: "#475569", textTransform: "none", fontWeight: 400 }}>— remarks from the order paper, shown on every jersey</span></label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. sponsor logo left sleeve · captain C on #19" rows={2} style={{ ...inputSt, resize: "vertical", fontSize: 13 }} />
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
      <div style={{ fontSize: 15, color: "#fcd34d", textAlign: "center", marginBottom: 18, opacity: 0.9 }}>Type what is printed on the back. It passes as MANUAL and the supervisor signs it off.</div>
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

// ── Supervisor view: every station live, and rosters to send ─────────────────
function SupervisorPanel({ operatorName, onClose }) {
  const [data,    setData]    = useState(() => ({ stations: [], now: Date.now() }));
  const [rosters, setRosters] = useState([]);
  const [order,   setOrder]   = useState("");
  const [notes,   setNotes]   = useState("");
  const [file,    setFile]    = useState(null);
  const [msg,     setMsg]     = useState(null);
  const fileRef = useRef(null);

  const refresh = useCallback(() => {
    hub.stations().then(setData).catch(() => setMsg("The hub is not reachable — is the server running?"));
    hub.rosters().then(r => setRosters(r.rosters || [])).catch(() => {});
  }, []);
  useEffect(() => { refresh(); const t = setInterval(refresh, 4000); return () => clearInterval(t); }, [refresh]);

  const send = async () => {
    if (!file) { setMsg("Choose a roster file first."); return; }
    try {
      const isExcel = /\.(xlsx|xls)$/i.test(file.name);
      const rows = isExcel ? await parseExcel(file) : parseCSV(await file.text());
      if (!rows.length) { setMsg("No valid rows in that file."); return; }
      await hub.sendRoster({ orderNumber: order.trim(), notes: notes.trim(), fileName: file.name, rows, by: operatorName });
      setMsg(`Sent ${file.name} — ${rows.length} jerseys for order ${order.trim() || "—"}. Stations see it on their order screen.`);
      setFile(null); setOrder(""); setNotes(""); refresh();
    } catch (e) { setMsg("Could not send: " + e.message); }
  };

  const age = s => Math.round((data.now - s.updatedAt) / 1000);
  const pct = s => s.counts?.total ? Math.round(((s.counts.total - s.counts.remaining) / s.counts.total) * 100) : 0;

  return (
    <div style={{ position: "fixed", inset: 0, background: "#0d1117", zIndex: 1800, display: "flex", flexDirection: "column", color: "#e2e8f0", fontFamily: "system-ui,sans-serif" }}>
      <div style={{ background: "#161b22", borderBottom: "1px solid #21262d", padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div><div style={{ fontWeight: 800, fontSize: 15 }}>🧭 Supervisor — stations</div><div style={{ fontSize: 11, color: "#64748b" }}>{operatorName} · refreshes every 4 s</div></div>
        <button onClick={onClose} style={{ ...btnGhost, padding: "6px 14px" }}>← Back to scanning</button>
      </div>
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12, alignContent: "start" }}>
          {data.stations.length === 0 && <div style={{ color: "#64748b", padding: 24 }}>No station has reported yet. A station appears here within a few seconds of starting an order.</div>}
          {data.stations.map(s => {
            const stale = age(s) > 30;
            return (
              <div key={s.id} style={{ ...card, padding: 14, border: `1px solid ${stale ? "#334155" : s.counts?.flag ? "#ef4444" : "#21262d"}`, opacity: stale ? 0.6 : 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div style={{ fontWeight: 800, fontSize: 15 }}>{s.operatorName || "—"} <span style={{ fontWeight: 400, color: "#64748b", fontSize: 12 }}>· {cap(s.role || "")}</span></div>
                  <div style={{ fontSize: 11, color: stale ? "#f87171" : "#64748b" }}>{stale ? `last seen ${age(s)} s ago` : "live"}</div>
                </div>
                <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 2 }}>Order <strong style={{ color: "#e2e8f0" }}>{s.orderNumber || "—"}</strong> · {s.rosterFile || "no roster"}</div>
                <div style={{ height: 8, background: "#1e293b", borderRadius: 4, marginTop: 10, overflow: "hidden" }}><div style={{ height: "100%", width: `${pct(s)}%`, background: s.counts?.remaining === 0 ? "#22c55e" : "#3b82f6" }} /></div>
                <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                  <Pill color="#e2e8f0">{(s.counts?.total ?? 0) - (s.counts?.remaining ?? 0)} / {s.counts?.total ?? 0} done</Pill>
                  <Pill color="#22c55e">{s.counts?.pass ?? 0} pass</Pill>
                  {s.counts?.flag > 0 && <Pill color="#ef4444">{s.counts.flag} with supervisor</Pill>}
                  {s.counts?.manual > 0 && <Pill color="#f59e0b">{s.counts.manual} by hand</Pill>}
                  {(s.counts?.missing > 0 || s.counts?.short > 0) && <Pill color="#f59e0b">{(s.counts.missing || 0) + (s.counts.short || 0)} missing/short</Pill>}
                </div>
                {s.lastScan && <div style={{ fontSize: 11, color: "#64748b", marginTop: 8 }}>Last: {s.lastScan.text} · {s.lastScan.time}</div>}
                {s.notes && <div style={{ fontSize: 11, color: "#fcd34d", marginTop: 4 }}>Notes: {s.notes}</div>}
                {s.attention?.length > 0 && (
                  <div style={{ marginTop: 10, borderTop: "1px solid #21262d", paddingTop: 8 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Needs you</div>
                    {s.attention.slice(0, 6).map((a, i) => (
                      <div key={i} style={{ fontSize: 12, marginBottom: 3 }}>
                        <span style={{ color: a.status === "manual" ? "#f59e0b" : "#ef4444", fontWeight: 700 }}>{a.status === "manual" ? "✍" : "🛑"} {a.jersey}</span>
                        <span style={{ color: "#94a3b8" }}> — {a.reason}{a.resolution ? ` → ${a.resolution}` : ""}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ width: 340, flexShrink: 0, borderLeft: "1px solid #21262d", padding: 14, overflowY: "auto" }}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10 }}>Send a roster to the stations</div>
          <div style={{ marginBottom: 10 }}><label style={labelSt}>Order number</label><input value={order} onChange={e => setOrder(e.target.value)} placeholder="e.g. 25" style={inputSt} /></div>
          <div style={{ marginBottom: 10 }}><label style={labelSt}>Order notes</label><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="remarks from the order paper" style={{ ...inputSt, resize: "vertical", fontSize: 13 }} /></div>
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
                <div style={{ fontSize: 13, fontWeight: 700 }}>Order {r.orderNumber || "—"} <span style={{ fontWeight: 400, color: "#64748b" }}>· {r.rowCount}</span></div>
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
    <div onClick={disabled ? undefined : onClick} onMouseEnter={disabled ? undefined : onHover}
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

function ScanOverlay({ state, actions, binMap, extraCols, notes, confirmKey, cancelKey, retryKey }) {
  const mode    = state.mode;
  const isGreen = mode === "confirm" || mode === "done";
  const isList  = mode === "pick" || mode === "close";
  const isRed   = mode === "flag" || mode === "duplicate" || mode === "supervisor";
  const isMenu  = mode === "reasons";
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
    if (isList)                return [...candidates.map(c => ({ id: "c" + c._id, candidate: c, disabled: isDone(c), run: () => actions.pick(c) })), retry, { ...byHand, label: "⌨ None of these — enter by hand" }, { ...notRight, label: "🚩 Bad jersey — pick a reason" }];
    if (mode === "flag")       return [{ ...retry, primary: true }, byHand, { id: "flag", label: "🚩 Flag & continue", run: actions.flagContinue }, { ...notRight, label: "✎ Bad jersey — pick a reason" }];
    if (mode === "manualDone") return [{ id: "cont", label: "✓ Continue — next jersey", primary: true, run: actions.continueManual }];
    if (mode === "manual")     return [];
    if (mode === "duplicate")  return [{ id: "skip", label: "✓ Already done — skip", primary: true, hint: "nothing is recorded", run: actions.skipDuplicate }, retry, { id: "dup", label: "🚩 Log it as a duplicate", run: actions.flagDuplicate }];
    if (mode === "reasons")    return [...REASONS.map(r => ({ id: r.id, label: r.label, hint: r.route, run: () => actions.chooseReason(r) })), { id: "back", label: "← Back", run: actions.back }];
    if (mode === "supervisor") return [{ id: "cont", label: "✓ Continue — next jersey", primary: true, run: actions.continueSupervisor }];
    return [];
  }, [mode, isList, candidates, actions]);

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
      if (mode === "manual") { if (e.code === "Escape") { e.preventDefault(); actions.back(); } return; }   // typing, not navigating
      if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
      if (e.code === retryKey) { const o = options.find(x => x.id === "retry"); if (o) { e.preventDefault(); lastKeyRef.current = Date.now(); o.run(); } return; }
      if (e.code === confirmKey) { e.preventDefault(); lastKeyRef.current = Date.now(); const o = options[selectedIdx]; if (o && !o.disabled) o.run(); return; }
      if (e.code === cancelKey || e.code === "ArrowDown") { e.preventDefault(); lastKeyRef.current = Date.now(); move(1); return; }
      if (e.code === "ArrowUp") { e.preventDefault(); lastKeyRef.current = Date.now(); move(-1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [options, selectedIdx, mode, confirmKey, cancelKey, retryKey, actions]);

  // A bumped mouse never overrides a key press made in the last moment.
  const hover = useCallback(i => { if (Date.now() - lastKeyRef.current > 800) setSelectedIdx(i); }, []);

  const binNum  = match ? binFor(binMap, match.team) : null;
  const hasSize = !!(match?.size);
  const extras  = match ? extraCols.filter(k => match[k]).map(k => `${cap(k)}: ${match[k]}`) : [];

  const OptionButton = ({ o, i }) => {
    const sel = i === selectedIdx;
    return (
      <button onClick={o.run} onMouseEnter={() => hover(i)}
        style={{ padding: "12px 22px", borderRadius: 12, border: `3px solid ${sel ? accent : "rgba(255,255,255,0.18)"}`, background: o.primary ? accent : "transparent", color: o.primary ? "#0d1117" : "#fff", fontWeight: 700, fontSize: 16, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, boxShadow: sel ? `0 0 0 3px ${accent}55` : "none", opacity: sel || o.primary ? 1 : 0.85 }}>
        <span>{o.label} {o.id === "retry" ? <Kbd light>{formatKey(retryKey)}</Kbd> : sel && <Kbd light={!o.primary}>{formatKey(confirmKey)}</Kbd>}</span>
        {o.hint && <span style={{ fontSize: 11, fontWeight: 500, opacity: 0.7 }}>{o.hint}</span>}
      </button>
    );
  };

  const hintLine = `${formatKey(confirmKey)} select · ${formatKey(cancelKey)} or ↓ next option · ↑ previous · ${formatKey(retryKey)} retry scan`;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", userSelect: "none", padding: "20px 0", overflowY: "auto" }}>

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
            Read: #{detected?.number || "?"}{detected?.name ? ` · ${detected.name}` : ""}
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
        <div style={{ position: "absolute", bottom: 12, right: 12, opacity: 0.35 }}>
          <img src={state.scan.thumb} alt="" style={{ width: 96, height: 72, objectFit: "cover", borderRadius: 6 }} />
        </div>
      )}
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
    { label: "Navigate",   key: "cancelKey" },
    { label: "Retry scan", key: "retryKey" },
  ];
  const reserved = ["Escape", "Tab"];
  const problems = [];
  const onScreen = ["confirmKey", "cancelKey", "retryKey"];   // these three act on the same screen, so they must differ
  const labelOf  = k => keyRows.find(r => r.key === k).label;
  onScreen.forEach((a, i) => onScreen.slice(i + 1).forEach(b => { if (temp[a] === temp[b]) problems.push(`${labelOf(a)} and ${labelOf(b)} cannot be the same key.`); }));
  keyRows.forEach(r => { if (reserved.includes(temp[r.key])) problems.push(`${r.label} cannot be ${temp[r.key]}.`); });

  const selSt = { ...inputSt, padding: "6px 10px", fontSize: 13 };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center" }}>
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

        {problems.length > 0 && (
          <div style={{ fontSize: 12, color: "#f87171", marginBottom: 12, padding: "8px 12px", background: "rgba(239,68,68,0.08)", borderRadius: 6 }}>
            {problems.map(p => <div key={p}>{p}</div>)}
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button disabled={problems.length > 0} onClick={() => { onSave(temp); onClose(); }} style={{ ...btnPri, flex: 1, opacity: problems.length ? 0.5 : 1 }}>Save</button>
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
function RosterCompleteModal({ roster, onExport, onDismiss }) {
  const count = s => roster.filter(r => r.scanned === s).length;
  const stats = [
    { label: "Passed",        value: count("pass"),    color: "#22c55e" },
    { label: "By hand",       value: count("manual"),  color: "#f59e0b" },
    { label: "With supervisor", value: count("flag"),  color: "#ef4444" },
    { label: "Missing",       value: count("missing"), color: "#f59e0b" },
    { label: "Short-shipped", value: count("short"),   color: "#f59e0b" },
  ].filter(s => s.value > 0 || s.label === "Passed");
  const open = count("flag") + count("manual") + count("missing") + count("short");
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>
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
  const { scanKey, confirmKey, cancelKey, retryKey } = settings;

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
  const [showRosterComplete, setShowRosterComplete] = useState(false);
  const [showBinSetup,       setShowBinSetup]       = useState(false);
  const [showSupervisor,     setShowSupervisor]     = useState(false);
  const [binMap,             setBinMap]             = useState(null);
  const [firstScanTime,      setFirstScanTime]      = useState(null);
  const [now,                setNow]                = useState(() => Date.now());

  const binOf          = useCallback(team => binFor(binMap, team), [binMap]);
  const scannedRows    = roster.filter(r => r.scanned && r.scanned !== false);
  const remaining      = roster.filter(r => !r.scanned).length;
  const passCount      = roster.filter(r => r.scanned === "pass").length;
  const flagCount      = roster.filter(r => r.scanned === "flag").length;
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
    saveSession({ sessionStarted, role, roster, rosterFile, orderNumber, operatorName, notes, log, binMap, firstScanTime });
  }, [sessionStarted, role, roster, rosterFile, orderNumber, operatorName, notes, log, binMap, firstScanTime]);

  useEffect(() => {
    if (!sessionStarted || log.length === 0) return;
    const h = e => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [sessionStarted, log.length]);

  // Report to the hub (if one is running) so a supervisor can see this station.
  useEffect(() => {
    if (!sessionStarted) return;
    const id = stationId();
    const send = () => hub.report(id, snapshotOf({ operatorName, role, orderNumber, notes, rosterFile, roster, log, lastConfirmed })).catch(() => {});
    send();
    const t = setInterval(send, 5000);
    return () => clearInterval(t);
  }, [sessionStarted, operatorName, role, orderNumber, notes, rosterFile, roster, log, lastConfirmed]);

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
    setOrderNumber(s.orderNumber || ""); setOperatorName(s.operatorName || ""); setNotes(s.notes || "");
    setLog(s.log || []); setBinMap(s.binMap || null); setFirstScanTime(s.firstScanTime || null);
    setSignedIn(true); saveSignIn({ role: s.role || "", name: s.operatorName || "" });
    setSessionStarted(true); setResumeDecided(true);
  }, [savedSession]);

  const discardSession = useCallback(() => { clearSession(); setResumeDecided(true); }, []);

  // Clears the order; the operator stays signed in and goes straight to order setup.
  const resetOrder = useCallback(() => {
    clearSession();
    rosterVersion.current++;
    setSessionStarted(false); setResumeDecided(true);
    setRoster([]); setRosterFile(null); setOrderNumber(""); setNotes(""); setLog([]); setBinMap(null); setFirstScanTime(null);
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
      try { const devs = await navigator.mediaDevices.enumerateDevices(); setCameras(devs.filter(d => d.kind === "videoinput")); } catch { /* no device list; the dropdown stays on default */ }
    } catch (e) {
      setError(e?.name === "OverconstrainedError" ? "That camera is not available — choose another in Settings." : "Camera access denied. Click the camera icon in your browser's address bar.");
    }
  }, [settings.cameraId, stopCamera]);

  // ── Core scan ─────────────────────────────────────────────────────────────
  const doRunScan = useCallback(async (base64, dataUrl) => {
    const version = rosterVersion.current;
    if (!firstScanTime) setFirstScanTime(Date.now());
    gateRef.current.disarm(); setArmed(false);
    setScanning(true);
    setThumb(dataUrl);
    playTone("scan");

    let detected = { name: "", number: "" };
    let apiError = null;
    try {
      const r = await readJersey({ base64, apiKey: CLAUDE_API_KEY, model: MODEL });
      detected = r;
      console.log(`Read #${r.number} ${r.name} (sleeves: ${r.sleeve_numbers.join(",") || "—"}) — tokens in ${r.usage?.input_tokens}, out ${r.usage?.output_tokens}`);
    } catch (e) {
      apiError = e.message;
    }

    if (version !== rosterVersion.current) { setScanning(false); return; }   // roster changed mid-flight
    setScanning(false);
    const smallThumb = await shrinkDataUrl(dataUrl);
    const scanObj  = { id: Date.now(), detected, thumb: dataUrl, smallThumb };
    const showFlag = (reason, title) => { setOverlay({ mode: "flag", scan: scanObj, reason, title }); playTone("flag"); };

    if (apiError) { showFlag("API error: " + apiError, "SCAN FAILED"); return; }
    if (!detected.name && !detected.number) { showFlag("No name or number could be read. Check the jersey is in frame, flat, and lit.", "COULD NOT READ"); return; }

    const m = findMatches(roster, detected.name, detected.number);
    if (m.type === "exact")          setOverlay({ mode: "confirm", scan: scanObj, match: m.match });
    else if (m.type === "duplicate") { setOverlay({ mode: "duplicate", scan: scanObj, match: m.match, reason: `#${m.match.number}${m.match.name ? " · " + m.match.name : ""}${m.match.size ? " · " + m.match.size : ""} already passed this session.` }); playTone("flag"); }
    else if (m.type === "pick" || m.type === "close") { setOverlay({ mode: m.type, scan: scanObj, candidates: m.candidates, reason: m.reason }); }
    else showFlag(`"${detected.name || "?"}" #${detected.number || "?"} is not on this roster.`, "NOT FOUND");
  }, [roster, firstScanTime]);

  // ── Camera scan trigger ───────────────────────────────────────────────────
  const doTriggerScan = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || scanning || !cameraOn || roster.length === 0 || inputMode !== "camera") return;
    const video = videoRef.current;
    if (!video.videoWidth) { setError("Camera is still starting — try again in a second."); return; }
    // A dead track leaves the last frame frozen on screen; never scan that.
    const track = streamRef.current?.getVideoTracks?.()[0];
    if (!track || track.readyState !== "live") { setError("Camera disconnected — check the USB cable, then press Start Camera."); stopCamera(); return; }
    lastScanFrameRef.current = sampleFrame(video, motionCanvasRef.current);
    const canvas = canvasRef.current;
    const w = video.videoWidth, h = video.videoHeight;
    const rot = Number(settings.rotation) || 0, swap = rot === 90 || rot === 270;
    canvas.width = swap ? h : w; canvas.height = swap ? w : h;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(rot * Math.PI / 180);
    ctx.drawImage(video, -w / 2, -h / 2, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    doRunScan(dataUrl.split(",")[1], dataUrl);
  }, [scanning, cameraOn, roster.length, inputMode, settings.rotation, doRunScan, stopCamera]);

  // ── Hands-free: after a confirm, scan when the picture changes and settles ─
  const modalOpen = showBinSetup || showRosterComplete || showSettings || showResume || showSupervisor;
  useEffect(() => {
    if (!cameraOn || inputMode !== "camera" || !settings.autoScan) return;
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
  }, [cameraOn, inputMode, settings.autoScan, overlay, scanning, modalOpen, doTriggerScan, stopCamera]);

  const armAutoScan = useCallback(() => {
    if (!settings.autoScan || !cameraOn || inputMode !== "camera" || modalOpen) return;
    gateRef.current.arm(lastScanFrameRef.current); setArmed(true);
  }, [settings.autoScan, cameraOn, inputMode, modalOpen]);

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

  const actions = useMemo(() => ({
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
      const entry = { id: o.scan.id || Date.now(), detected: o.scan.detected, thumb: o.scan.smallThumb, match: o.match || null, status: S_FLAGGED, reason: r.label, reasonId: r.id, ...stamp() };
      if (o.match) setRoster(prev => prev.map(x => x._id === o.match._id ? { ...x, scanned: "flag" } : x));
      setLog(prev => [entry, ...prev]); setLastResult(entry);
      setOverlay({ mode: "supervisor", scan: o.scan, match: o.match || null, reason: r.label, route: r.route });
      playTone("flag");
    },
    flagContinue() {
      const o = overlay; if (!o?.scan) return;
      const entry = { id: o.scan.id || Date.now(), detected: o.scan.detected, thumb: o.scan.smallThumb, match: null, status: S_FLAGGED, reason: o.reason || "Flagged by operator", ...stamp() };
      setLog(prev => [entry, ...prev]); setLastResult(entry); setOverlay(null); playTone("flag"); armAutoScan();
    },
    skipDuplicate() { setOverlay(null); armAutoScan(); },
    flagDuplicate() {
      const o = overlay; if (!o?.scan) return;
      const entry = { id: o.scan.id || Date.now(), detected: o.scan.detected, thumb: o.scan.smallThumb, match: o.match || null, status: S_FLAGGED, reason: "Duplicate — scanned again after passing", ...stamp() };
      setLog(prev => [entry, ...prev]); setLastResult(entry); setOverlay(null); playTone("flag"); armAutoScan();
    },
    continueSupervisor() { setOverlay(null); armAutoScan(); },
    dismissDone() { setOverlay(null); armAutoScan(); },
    manual() { setOverlay(o => ({ mode: "manual", scan: o?.scan, match: null, teams: teamNames, returnTo: o })); },
    manualSubmit({ number, name, size, team }) {
      const o = overlay; if (!o) return;
      const m = findMatches(roster, name, number);
      if (m.type === "duplicate") { setOverlay({ mode: "duplicate", scan: o.scan, match: m.match, reason: `#${m.match.number}${m.match.name ? " · " + m.match.name : ""} already passed this session.` }); playTone("flag"); return; }
      if (m.type === "pick" || m.type === "close") { setOverlay({ mode: "pick", scan: o.scan, candidates: m.candidates, reason: "What you typed matches these rows — which one?", note: "Typed by operator — the camera could not read it" }); return; }
      let row, reason;
      if (m.type === "exact") {
        row = m.match; reason = "Entered by operator — the camera could not read it";
        setRoster(prev => prev.map(r => r._id === row._id ? { ...r, scanned: "manual" } : r));
      } else {
        row = { _id: roster.reduce((mx, r) => Math.max(mx, r._id), -1) + 1, name, number, team, size, scanned: "manual", added: "operator" };
        reason = "Not on the roster — added by operator";
        setRoster(prev => [...prev, row]);
      }
      const entry = { id: o.scan?.id || Date.now(), detected: o.scan?.detected, thumb: o.scan?.smallThumb, match: row, status: S_MANUAL, reason, ...stamp() };
      setLog(prev => [entry, ...prev]); setLastResult(entry); setLastConfirmed(entry);
      setOverlay({ mode: "manualDone", scan: o.scan, match: row, reason });
      playTone("pass");
    },
    continueManual() { setOverlay(null); armAutoScan(); },
  }), [overlay, stamp, armAutoScan, roster, teamNames]);

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
  const exportMeta = { orderNumber, operatorName, notes };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "system-ui,sans-serif", background: "#0d1117", height: "100vh", color: "#e2e8f0", display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {showResume && <ResumeModal session={savedSession} onResume={resumeSession} onDiscard={discardSession} />}

      {!showResume && !signedIn && (
        <SignInModal initial={savedSignIn}
          onSignIn={({ role, name }) => { setRole(role); setOperatorName(name); setSignedIn(true); saveSignIn({ role, name }); setResumeDecided(true); }} />
      )}

      {showSupervisor && <SupervisorPanel operatorName={operatorName} onClose={() => setShowSupervisor(false)} />}

      {!showResume && signedIn && !sessionStarted && !showSupervisor && (
        <OrderSetupModal operatorName={operatorName} role={role} xlsxReady={xlsxReady} onSignOut={signOut} onSupervisor={() => setShowSupervisor(true)}
          onStart={({ roster, orderNumber, notes, rosterFile }) => {
            setBinMap(null);
            applyRoster(roster, rosterFile);
            setOrderNumber(orderNumber); setNotes(notes);
            setSessionStarted(true); setResumeDecided(true);
          }} />
      )}

      {showBinSetup && binMap && (
        <BinSetupModal entries={binEntries(roster, binMap)} onConfirm={() => setShowBinSetup(false)} />
      )}

      {overlay && (
        <ScanOverlay key={overlayKey} state={overlay} actions={actions} binMap={binMap} extraCols={extraCols} notes={notes} confirmKey={confirmKey} cancelKey={cancelKey} retryKey={retryKey} />
      )}

      {showSettings && (
        <SettingsPanel settings={settings} cameras={cameras} onSave={setSettings} onClose={() => setShowSettings(false)} />
      )}

      {showRosterComplete && (
        <RosterCompleteModal roster={roster}
          onExport={() => { exportRosterXLSX(roster, log, exportMeta, rosterCols, binOf); setShowRosterComplete(false); }}
          onDismiss={() => setShowRosterComplete(false)} />
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
          <input value={orderNumber} onChange={e => setOrderNumber(e.target.value)} placeholder="Order number…"
            onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur(); }}
            style={{ padding: "4px 9px", borderRadius: 6, border: "1px solid #334155", background: "#1e293b", color: "#e2e8f0", fontSize: 12, width: 140 }} />
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <Pill color="#22c55e">{passCount} Pass</Pill>
          <Pill color="#ef4444">{flagCount} Flag</Pill>
          {manualCount > 0 && <Pill color="#f59e0b">{manualCount} By hand</Pill>}
          {openCount - flagCount > 0 && <Pill color="#f59e0b">{openCount - flagCount} Missing</Pill>}
          {canSupervise && <button onClick={() => setShowSupervisor(true)} title="See every station and send rosters" style={{ ...btnGhost, padding: "3px 9px", fontSize: 11, borderColor: "#f59e0b", color: "#fcd34d" }}>Stations</button>}
          {sessionStarted && <button onClick={startNewOrder} title="Finish this order and set up the next one — no PIN needed" style={{ ...btnGhost, padding: "3px 9px", fontSize: 11 }}>New order</button>}
          {signedIn && <button onClick={signOut} title="End your shift at this station" style={{ ...btnGhost, padding: "3px 9px", fontSize: 11 }}>Sign out</button>}
          <button onClick={() => setShowSettings(true)} style={{ ...btnGhost, padding: "3px 9px" }}>⚙</button>
        </div>
      </div>

      {notes && (
        <div style={{ background: "rgba(245,158,11,0.10)", borderBottom: "1px solid rgba(245,158,11,0.35)", padding: "6px 16px", fontSize: 12, color: "#fcd34d", flexShrink: 0 }}>
          <strong>Order notes:</strong> {notes}
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
                        <div style={{ position: "absolute", top: 8, right: 8, display: "flex", alignItems: "center", gap: 5, background: "rgba(0,0,0,0.55)", padding: "3px 9px", borderRadius: 20 }}>
                          <div style={{ width: 7, height: 7, borderRadius: "50%", background: armed ? "#f59e0b" : "#22c55e", boxShadow: `0 0 5px ${armed ? "#f59e0b" : "#22c55e"}` }} />
                          <span style={{ fontSize: 10, color: "#e2e8f0" }}>{armed ? "Waiting for the next jersey…" : "Ready"}</span>
                        </div>
                        <div style={{ position: "absolute", bottom: 8, left: "50%", transform: "translateX(-50%)", background: "rgba(0,0,0,0.55)", color: "#94a3b8", fontSize: 10, padding: "3px 9px", borderRadius: 12, whiteSpace: "nowrap" }}>
                          Press <kbd style={{ background: "#1e293b", padding: "1px 4px", borderRadius: 3, fontSize: 10 }}>{keyLabel}</kbd> to scan
                        </div>
                      </>
                    )}
                  </div>
                  <div style={{ padding: "10px 12px", display: "flex", gap: 8, borderTop: "1px solid #21262d" }}>
                    {!cameraOn
                      ? <button onClick={startCamera} style={{ ...btnPri, flex: 1, fontSize: 15, padding: "12px" }}>Start Camera</button>
                      : <>
                          <button onClick={stopCamera} style={{ ...btnGhost, width: 42 }}>■</button>
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
                  {[["scan", keyLabel, "Scan"], ["confirm", formatKey(confirmKey), "Select"], ["nav", formatKey(cancelKey), "Next option"], ["retry", formatKey(retryKey), "Retry scan"], ["arrows", "↑↓", "Move"]].map(([id, k, d]) => (
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

        {/* RIGHT: Info panel */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

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
                            {r.scanned !== "pass" && (
                              <select value={["missing", "short"].includes(r.scanned) ? r.scanned : ""} onChange={e => markRow(r._id, e.target.value || false)}
                                style={{ background: "#1e293b", color: "#94a3b8", border: "1px solid #334155", borderRadius: 4, fontSize: 10, padding: "2px 4px" }}>
                                <option value="">—</option>
                                <option value="missing">Missing</option>
                                <option value="short">Short-shipped</option>
                              </select>
                            )}
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
                      {l.thumb && <img src={l.thumb} alt="" style={{ width: 48, height: 36, objectFit: "cover", borderRadius: 4, flexShrink: 0 }} />}
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
