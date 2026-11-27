// The developers' admin panel (phase 1, 26 Nov 2026): the station app opened with
// ?view=admin. It signs a developer in with the shared password (checked by the
// server, admin-plugin.js), shows how this server is doing, the server's own log and
// the change log, and has the light / dark switch for this browser. It changes nothing
// on the floor yet. Every colour comes from the tokens in index.css, so it is the first
// screen that works in both themes.
import { useCallback, useEffect, useState } from "react";
import { THEMES, loadTheme, saveTheme } from "../lib/theme.js";
import { DEFAULT_SETTINGS, MODEL, EFFORT, THINKING, SEND_MAX_PX, CHECKS, REASONS, MARK_STAYS, THREAD_STAYS, NO_SIZE_TAG } from "../config.js";
import { cleanChecks, checkIdFor, MAX_CHECKS, CHECK_LABEL_MAX } from "../lib/checks.js";

const api = async (path, opts = {}) => {
  const r = await fetch(`/api/admin${path}`, { credentials: "same-origin", headers: { "Content-Type": "application/json" }, ...opts });
  let body = {}; try { body = await r.json(); } catch { /* empty */ }
  if (!r.ok) { const e = new Error(body.error || `The server answered ${r.status}`); e.status = r.status; e.body = body; throw e; }
  return body;
};

const STAGE_LOOK = {
  production:  { name: "PRODUCTION", note: "The floor's server", bg: "var(--fail)" },
  testing:     { name: "TESTING", note: "Try things here before the floor", bg: "var(--warn)" },
  development: { name: "DEVELOPMENT", note: "This laptop's test server", bg: "var(--accent)" },
};
const when = ms => (ms ? new Date(ms).toLocaleString("en-CA", { hour12: false, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "");
const ago = (ms, now = Date.now()) => { const s = Math.max(0, Math.round((now - ms) / 1000)); return s < 90 ? `${s} s ago` : s < 5400 ? `${Math.round(s / 60)} min ago` : s < 129600 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} days ago`; };
const mb = n => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

const st = {
  page: { height: "100%", overflowY: "auto", background: "var(--bg)", color: "var(--text)" },
  wrap: { maxWidth: 1100, margin: "0 auto", padding: "20px max(16px, env(safe-area-inset-left, 0px)) 48px", display: "flex", flexDirection: "column", gap: 16 },
  card: { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, padding: "14px 16px", minWidth: 0 },
  h2: { margin: "0 0 10px", fontSize: 18, fontWeight: 700 },
  dl: { display: "grid", gridTemplateColumns: "minmax(140px, max-content) 1fr", gap: "6px 14px", margin: 0, fontSize: 15 },
  dt: { color: "var(--text-dim)" },
  dd: { margin: 0, minWidth: 0, overflowWrap: "anywhere" },
  btn: { background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--line-strong)", borderRadius: 8, padding: "8px 14px", fontSize: 15, fontWeight: 700, cursor: "pointer" },
  pri: { background: "var(--accent)", color: "var(--on-accent)", border: "1px solid var(--accent)", borderRadius: 8, padding: "10px 18px", fontSize: 16, fontWeight: 700, cursor: "pointer" },
  input: { background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--line-strong)", borderRadius: 8, padding: "10px 12px", fontSize: 16, width: "100%", boxSizing: "border-box" },
};
const Pill = ({ tone = "info", children }) => (
  <span style={{ display: "inline-block", padding: "1px 10px", borderRadius: 999, fontSize: 13, fontWeight: 700, background: `var(--${tone}-bg)`, color: `var(--${tone}-text)`, border: `1px solid var(--${tone})`, whiteSpace: "nowrap" }}>{children}</span>
);

function StageBar({ s }) {
  const look = STAGE_LOOK[s?.stage] || { name: (s?.stage || "?").toUpperCase(), note: "", bg: "var(--line-strong)" };
  return (
    <div style={{ background: look.bg, color: "#fff", padding: "10px max(16px, env(safe-area-inset-left, 0px))", display: "flex", flexWrap: "wrap", gap: "4px 18px", alignItems: "baseline", fontWeight: 700 }}>
      <span style={{ fontSize: 20, letterSpacing: 1 }}>{look.name}</span>
      <span style={{ opacity: 0.92 }}>{look.note}</span>
      <span style={{ opacity: 0.92 }}>port {s?.port || "?"} · {s?.host || "?"}</span>
      <span style={{ marginLeft: "auto", display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
        {s && !s.writable && <span style={{ background: "rgba(0,0,0,0.25)", padding: "2px 10px", borderRadius: 999 }}>Read only</span>}
        {/* Back to the stations' app, on the sign-in page and signed in (the co-op, 27 Nov 2026): a kiosk has no address bar. */}
        <a href="/" style={{ color: "#fff", background: "rgba(0,0,0,0.25)", padding: "4px 12px", borderRadius: 8, textDecoration: "none", whiteSpace: "nowrap" }}>← Back to the app</a>
      </span>
    </div>
  );
}

function SignIn({ onDone }) {
  const [name, setName] = useState(() => { try { return localStorage.getItem("jerseyqc.admin.name") || ""; } catch { return ""; } });
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async e => {
    e.preventDefault(); if (busy) return;
    setBusy(true); setErr("");
    try { const r = await api("/login", { method: "POST", body: JSON.stringify({ name, password: pw }) }); try { localStorage.setItem("jerseyqc.admin.name", name); } catch { /* fine */ } onDone(r); }
    catch (x) { setErr(x.message); setPw(""); }
    finally { setBusy(false); }
  };
  return (
    <form onSubmit={go} style={{ ...st.card, maxWidth: 420, margin: "40px auto", display: "flex", flexDirection: "column", gap: 12 }}>
      <h1 style={{ margin: 0, fontSize: 24 }}>Admin panel</h1>
      <p style={{ margin: 0, color: "var(--text-dim)" }}>For developers. Your name goes in the change log.</p>
      <label htmlFor="adm-name" style={{ fontWeight: 700 }}>Your name</label>
      <input id="adm-name" style={st.input} value={name} onChange={e => setName(e.target.value)} autoComplete="username" required />
      <label htmlFor="adm-pw" style={{ fontWeight: 700 }}>Admin password</label>
      <input id="adm-pw" type="password" style={st.input} value={pw} onChange={e => setPw(e.target.value)} autoComplete="current-password" required />
      {err && <div role="alert" style={{ color: "var(--fail-text)", background: "var(--fail-bg)", border: "1px solid var(--fail)", borderRadius: 8, padding: "8px 10px" }}>{err}</div>}
      <button type="submit" style={st.pri} disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}

function Health({ h, onRefresh }) {
  if (!h) return <div style={st.card}>Loading…</div>;
  const g = h.git || {};
  const problems = [
    h.hub.blocked && `The hub is not saving anything: ${h.hub.blocked}`,
    !h.hub.found && "No hub is running for this data file on this server.",
    h.data.missing && `The data file ${h.data.file} is not there yet.`,
    h.data.unreadable.length && `Set-aside data files: ${h.data.unreadable.join(", ")}`,
    h.data.conflictCopies.length && `OneDrive conflict copies: ${h.data.conflictCopies.join(", ")}`,
    !h.ai.keyPresent && "No API key: the stations cannot read garments (CLAUDE_API_KEY in .env.local).",
    h.ai.keyOnPage && "The key is set as VITE_CLAUDE_API_KEY, which hands it to every browser: rename it CLAUDE_API_KEY.",
    h.data.adminError && `The change log cannot be saved: ${h.data.adminError}`,
  ].filter(Boolean);
  return (
    <>
      <div style={{ ...st.card, borderColor: problems.length ? "var(--fail)" : "var(--pass)", background: problems.length ? "var(--fail-bg)" : "var(--pass-bg)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <strong style={{ fontSize: 18, color: problems.length ? "var(--fail-text)" : "var(--pass-text)" }}>{problems.length ? `${problems.length} ${problems.length === 1 ? "problem" : "problems"}` : "Everything looks fine"}</strong>
          <span style={{ color: "var(--text-dim)", fontSize: 14 }}>Checked {when(h.server.now)} · <button style={{ ...st.btn, padding: "4px 10px" }} onClick={onRefresh}>Check again</button></span>
        </div>
        {problems.length > 0 && <ul style={{ margin: "8px 0 0", paddingLeft: 20 }}>{problems.map(p => <li key={p}>{p}</li>)}</ul>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
        <section style={st.card}>
          <h2 style={st.h2}>Server</h2>
          <dl style={st.dl}>
            <dt style={st.dt}>Stage</dt><dd style={st.dd}>{h.server.stage}, port {h.server.port}</dd>
            <dt style={st.dt}>PC</dt><dd style={st.dd}>{h.server.host}</dd>
            <dt style={st.dt}>Running since</dt><dd style={st.dd}>{when(h.server.startedAt)} ({ago(h.server.startedAt, h.server.now)})</dd>
            <dt style={st.dt}>Code</dt><dd style={st.dd}>{g.error ? g.error : <>{g.branch} · <code>{g.commit}</code> · {g.date?.slice(0, 16)}<br /><span style={{ color: "var(--text-dim)" }}>{g.subject}</span></>}</dd>
            <dt style={st.dt}>Node</dt><dd style={st.dd}>{h.server.node}</dd>
            <dt style={st.dt}>Admin changes</dt><dd style={st.dd}>{h.server.stage === "production" ? (h.server.writable ? <Pill tone="warn">allowed (JQC_ADMIN_WRITE=1)</Pill> : <Pill>read only</Pill>) : <Pill tone="pass">allowed</Pill>}</dd>
          </dl>
        </section>
        <section style={st.card}>
          <h2 style={st.h2}>Hub and data</h2>
          <dl style={st.dl}>
            <dt style={st.dt}>Hub</dt><dd style={st.dd}>{!h.hub.found ? <Pill tone="fail">not found</Pill> : h.hub.blocked ? <Pill tone="fail">blocked</Pill> : <Pill tone="pass">saving</Pill>}</dd>
            <dt style={st.dt}>Data file</dt><dd style={st.dd}>{h.data.file}{!h.data.missing && <> · {mb(h.data.size)} · saved {ago(h.data.modified, h.server.now)}</>}</dd>
            <dt style={st.dt}>Unfinished orders</dt><dd style={st.dd}>{h.data.unfinishedOrderFiles} on disk</dd>
            <dt style={st.dt}>Backups</dt><dd style={st.dd}>{h.data.backups ? <>{h.data.backups}, newest {h.data.newestBackup}</> : "none yet (made at each promotion)"}</dd>
            <dt style={st.dt}>Change log</dt><dd style={st.dd}>{h.data.adminFile} · {h.data.auditEntries} entries</dd>
          </dl>
        </section>
        <section style={st.card}>
          <h2 style={st.h2}>Stations</h2>
          <dl style={st.dl}>
            <dt style={st.dt}>Live now</dt><dd style={st.dd}>{h.stations.live.length ? h.stations.live.join(", ") : "none"}</dd>
            <dt style={st.dt}>Known to the hub</dt><dd style={st.dd}>{h.stations.total}</dd>
            <dt style={st.dt}>Silent over 2 h</dt><dd style={st.dd}>{h.stations.silent}</dd>
          </dl>
        </section>
        <section style={st.card}>
          <h2 style={st.h2}>AI reads and printing</h2>
          <dl style={st.dl}>
            <dt style={st.dt}>API key</dt><dd style={st.dd}>{h.ai.keyPresent ? <Pill tone={h.ai.keyOnPage ? "warn" : "pass"}>present ({h.ai.keyName})</Pill> : <Pill tone="fail">missing</Pill>}</dd>
            <dt style={st.dt}>Printing</dt><dd style={st.dd}>{h.printing.stagePrint === "always" ? "on (production)" : h.printing.stagePrint === "on" ? <Pill tone="warn">on (JQC_STAGE_PRINT=1)</Pill> : "off on this server"}</dd>
          </dl>
          <p style={{ margin: "10px 0 0", color: "var(--text-dim)", fontSize: 14 }}>The key itself is never shown here.</p>
        </section>
      </div>
    </>
  );
}

function ServerLog() {
  const [lines, setLines] = useState(null);
  const [err, setErr] = useState("");
  const load = useCallback(() => api("/log").then(r => { setLines(r.lines); setErr(""); }).catch(e => setErr(e.message)), []);
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, [load]);
  return (
    <section style={st.card}>
      <h2 style={st.h2}>Server log <span style={{ fontWeight: 400, fontSize: 14, color: "var(--text-dim)" }}>· the last 200 lines since this server started, every 5 s</span></h2>
      {err && <div role="alert" style={{ color: "var(--fail-text)" }}>{err}</div>}
      <div style={{ overflowX: "auto", maxHeight: "60vh", overflowY: "auto", background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 8 }}>
        <pre style={{ margin: 0, padding: 10, fontSize: 13, lineHeight: 1.45, fontFamily: "Consolas, 'Cascadia Mono', monospace" }}>
          {(lines || []).slice().reverse().map((l, i) => (
            <div key={i} style={{ color: l.level === "error" ? "var(--fail-text)" : l.level === "warn" ? "var(--warn-text)" : "var(--text)" }}>
              <span style={{ color: "var(--text-faint)" }}>{when(l.at).split(", ").pop()} </span>{l.text}
            </div>
          ))}
          {lines && !lines.length && "Nothing yet."}
        </pre>
      </div>
    </section>
  );
}

function ChangeLog() {
  const [r, setR] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => { api("/audit").then(setR).catch(e => setErr(e.message)); }, []);
  return (
    <section style={st.card}>
      <h2 style={st.h2}>Change log <span style={{ fontWeight: 400, fontSize: 14, color: "var(--text-dim)" }}>· every sign-in and every change made here, newest first; it cannot be cleared from the panel</span></h2>
      {(err || r?.error) && <div role="alert" style={{ color: "var(--fail-text)" }}>{err || r.error}</div>}
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 15 }}>
          <thead><tr>{["When", "Who", "From", "What", "Before → after"].map(h => <th key={h} style={{ textAlign: "left", padding: "6px 8px", borderBottom: "2px solid var(--line-strong)", color: "var(--text-dim)" }}>{h}</th>)}</tr></thead>
          <tbody>
            {(r?.entries || []).map((e, i) => (
              <tr key={i}>
                <td style={{ padding: "6px 8px", borderBottom: "1px solid var(--line)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{when(e.at)}</td>
                <td style={{ padding: "6px 8px", borderBottom: "1px solid var(--line)" }}>{e.who}</td>
                <td style={{ padding: "6px 8px", borderBottom: "1px solid var(--line)", color: "var(--text-dim)" }}>{e.ip}</td>
                <td style={{ padding: "6px 8px", borderBottom: "1px solid var(--line)", color: e.what.startsWith("wrong") ? "var(--fail-text)" : "var(--text)" }}>{e.what}</td>
                <td style={{ padding: "6px 8px", borderBottom: "1px solid var(--line)", color: "var(--text-dim)", fontSize: 14, minWidth: 200 }}>{e.before !== undefined || e.after !== undefined ? <>{[e.before].flat().join(", ")} <strong style={{ color: "var(--text)" }}>→</strong> {[e.after].flat().join(", ")}</> : ""}</td>
              </tr>
            ))}
            {r && !r.entries.length && <tr><td colSpan={5} style={{ padding: 8, color: "var(--text-dim)" }}>Nothing yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// The names offered at sign-in (phase 2). An empty list means the .env.local list
// (VITE_OPERATORS) as before. Saved names reach a station the next time its sign-in
// screen opens; a station that cannot reach the server keeps the last names it got.
function Operators() {
  const [cfg, setCfg] = useState(null);
  const [list, setList] = useState([]);
  const [add, setAdd] = useState("");
  const [msg, setMsg] = useState({ tone: "", text: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => { api("/settings").then(c => { setCfg(c); setList(c.operators.length ? c.operators : c.fallbackOperators); }).catch(e => setMsg({ tone: "fail", text: e.message })); }, []);
  if (!cfg) return <section style={st.card}>{msg.text ? <span style={{ color: "var(--fail-text)" }}>{msg.text}</span> : "Loading…"}</section>;
  const saved = cfg.operators.length ? cfg.operators : cfg.fallbackOperators;
  const changed = JSON.stringify(list) !== JSON.stringify(saved);
  const move = (i, d) => setList(l => { const n = [...l]; const j = i + d; if (j < 0 || j >= n.length) return l; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const addName = e => { e.preventDefault(); const n = add.replace(/\s+/g, " ").trim(); if (!n) return; if (list.some(x => x.toLowerCase() === n.toLowerCase())) { setMsg({ tone: "warn", text: `${n} is on the list already.` }); return; } setList(l => [...l, n]); setAdd(""); setMsg({ tone: "", text: "" }); };
  const save = async (names, label) => {
    setBusy(true); setMsg({ tone: "", text: "" });
    try { const c = await api("/settings/operators", { method: "PUT", body: JSON.stringify({ operators: names, configVersion: cfg.configVersion }) }); setCfg(c); setList(c.operators.length ? c.operators : c.fallbackOperators); setMsg({ tone: "pass", text: c.unchanged ? "Nothing to save." : label }); }
    catch (e) { setMsg({ tone: "fail", text: e.message }); }
    finally { setBusy(false); }
  };
  return (
    <section style={st.card}>
      <h2 style={st.h2}>Operators</h2>
      <p style={{ margin: "0 0 12px", color: "var(--text-dim)" }}>
        The names offered on the stations' sign-in screen, in this order; "Other" is always there too. {cfg.operators.length ? "Set here." : <>Now from <code>.env.local</code> (VITE_OPERATORS). Saving here takes over from it.</>} A station shows the new names the next time its sign-in screen opens.
      </p>
      <ol style={{ listStyle: "none", padding: 0, margin: "0 0 12px", display: "flex", flexDirection: "column", gap: 6, maxWidth: 520 }}>
        {list.map((n, i) => (
          <li key={n} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 8, padding: "6px 8px" }}>
            <span style={{ color: "var(--text-faint)", minWidth: 22, fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>
            <span style={{ flex: 1, fontWeight: 700, minWidth: 0, overflowWrap: "anywhere" }}>{n}</span>
            <button style={{ ...st.btn, padding: "4px 10px" }} aria-label={`Move ${n} up`} disabled={!cfg.writable || i === 0} onClick={() => move(i, -1)}>↑</button>
            <button style={{ ...st.btn, padding: "4px 10px" }} aria-label={`Move ${n} down`} disabled={!cfg.writable || i === list.length - 1} onClick={() => move(i, 1)}>↓</button>
            <button style={{ ...st.btn, padding: "4px 10px", color: "var(--fail-text)" }} aria-label={`Remove ${n}`} disabled={!cfg.writable} onClick={() => setList(l => l.filter(x => x !== n))}>Remove</button>
          </li>
        ))}
        {!list.length && <li style={{ color: "var(--text-dim)" }}>No names: the stations would offer the .env.local list.</li>}
      </ol>
      {cfg.writable && (
        <form onSubmit={addName} style={{ display: "flex", gap: 8, flexWrap: "wrap", maxWidth: 520, marginBottom: 12 }}>
          <label htmlFor="adm-add" style={{ position: "absolute", left: -9999 }}>New name</label>
          <input id="adm-add" style={{ ...st.input, flex: 1, minWidth: 180 }} value={add} onChange={e => setAdd(e.target.value)} placeholder="New name" maxLength={40} />
          <button type="submit" style={st.btn}>Add</button>
        </form>
      )}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        {cfg.writable ? <>
          <button style={changed ? st.pri : { ...st.pri, opacity: 0.45, cursor: "not-allowed" }} disabled={!changed || busy} onClick={() => save(list, "Saved. The stations show these names the next time their sign-in screen opens.")}>{busy ? "Saving…" : "Save"}</button>
          {changed && <button style={st.btn} onClick={() => { setList(saved); setMsg({ tone: "", text: "" }); }}>Undo changes</button>}
          {cfg.operators.length > 0 && <button style={st.btn} disabled={busy} onClick={() => save([], "Back to the .env.local list.")}>Use the .env.local list ({cfg.fallbackOperators.length})</button>}
        </> : <Pill>Read only on this server</Pill>}
        {msg.text && <span role="status" style={{ color: msg.tone ? `var(--${msg.tone}-text)` : "var(--text)" }}>{msg.text}</span>}
      </div>
    </section>
  );
}

// Printers (phase 3): which queue each station's stickers and tickets go to, and why; the
// queues this server PC has; the last print; a test label on any queue and roll. A queue set
// here is used before .env.local (the station's own, then "every station"); a blank box
// means .env.local as before. Changes take effect with the next print, no restart.
const ROLLS = [{ id: "2x3", label: "2 × 3 in" }, { id: "2x4", label: "2 × 4 in" }, { id: "2x1", label: "2 × 1 in" }, { id: "1x0.5", label: "1 × ½ in" }];
function Printers() {
  const [p, setP] = useState(null);
  const [draft, setDraft] = useState({});
  const [msg, setMsg] = useState({ tone: "", text: "" });
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState({ queue: "", roll: "2x3" });
  const [unknown, setUnknown] = useState([]);   // printer names the server did not find on its list: "Save anyway"
  const load = useCallback(() => api("/printers").then(r => { setP(r); setDraft(r.overrides || {}); setTest(t => ({ ...t, queue: t.queue || r.stations[0]?.ticket?.name || r.queues.find(q => q.zebra)?.name || "" })); }).catch(e => setMsg({ tone: "fail", text: e.message })), []);
  useEffect(() => { load(); }, [load]);
  if (!p) return <section style={st.card}>{msg.text ? <span style={{ color: "var(--fail-text)" }}>{msg.text}</span> : "Loading…"}</section>;
  const rows = [{ id: "*", label: "Every station" }, ...p.stations.map(s => ({ id: s.id, label: s.label }))];
  const val = (id, which) => draft[id]?.[which] || "";
  const set = (id, which, v) => setDraft(d => { const n = { ...d, [id]: { ...(d[id] || {}), [which]: v } }; if (!v) delete n[id][which]; if (!Object.keys(n[id]).length) delete n[id]; return n; });
  const changed = JSON.stringify(draft) !== JSON.stringify(p.overrides || {});
  const save = async (force = false) => {
    setBusy(true); setMsg({ tone: "", text: "" }); setUnknown([]);
    try { const r = await api("/settings/printers", { method: "PUT", body: JSON.stringify({ printers: draft, configVersion: p.configVersion, force }) }); setMsg({ tone: "pass", text: r.unchanged ? "Nothing to save." : "Saved. The next print uses it." }); await load(); }
    catch (e) { setMsg({ tone: "fail", text: e.message }); setUnknown(e.body?.unknown || []); }
    finally { setBusy(false); }
  };
  const sendTest = async () => {
    setBusy(true); setMsg({ tone: "", text: "" });
    try { await api("/printers/test", { method: "POST", body: JSON.stringify(test) }); setMsg({ tone: "pass", text: `Test label sent to ${test.queue}.` }); }
    catch (e) { setMsg({ tone: "fail", text: e.message }); }
    finally { setBusy(false); load(); }
  };
  const cell = { padding: "8px", borderBottom: "1px solid var(--line)", verticalAlign: "top" };
  const Who = ({ w }) => <><strong style={{ overflowWrap: "anywhere" }}>{w?.name || "none"}</strong><div style={{ color: "var(--text-dim)", fontSize: 13 }}>{w?.why}</div></>;
  return (
    <>
      {msg.text && <div role="status" style={{ ...st.card, borderColor: `var(--${msg.tone || "info"})`, background: `var(--${msg.tone || "info"}-bg)`, color: `var(--${msg.tone || "info"}-text)` }}>{msg.text}</div>}
      <section style={st.card}>
        <h2 style={st.h2}>Where each station prints now</h2>
        <p style={{ margin: "0 0 10px", color: "var(--text-dim)" }}>Stickers are the 1 × ½ in roll; tickets are the flag tickets, box labels and lists (any taller roll). Printing on this server: <strong style={{ color: "var(--text)" }}>{p.printing}</strong>{p.printing === "off" && " (JQC_STAGE_PRINT=1 in .env.local turns it on)"}.</p>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 15 }}>
            <thead><tr>{["Station", "Stickers", "Tickets and lists"].map(h => <th key={h} style={{ ...cell, textAlign: "left", color: "var(--text-dim)", borderBottom: "2px solid var(--line-strong)" }}>{h}</th>)}</tr></thead>
            <tbody>{p.stations.map(s => <tr key={s.id}><td style={{ ...cell, fontWeight: 700 }}>{s.label}</td><td style={cell}><Who w={s.sticker} /></td><td style={cell}><Who w={s.ticket} /></td></tr>)}</tbody>
          </table>
        </div>
        {p.last && <p style={{ margin: "10px 0 0" }}>Last print: {when(p.last.at)} on <strong>{p.last.printer}</strong> ({p.last.what}{p.last.station ? `, ${p.last.station.replace(/^st-station/, "Station ")}` : ""}) {p.last.ok ? <Pill tone="pass">printed</Pill> : <><Pill tone="fail">failed</Pill> <span style={{ color: "var(--fail-text)" }}>{p.last.error}</span></>}</p>}
      </section>

      <section style={st.card}>
        <h2 style={st.h2}>Choose the printers</h2>
        <p style={{ margin: "0 0 10px", color: "var(--text-dim)" }}>Pick a queue to use it before .env.local; leave a box blank for .env.local as before. "Every station" is for any station without its own. A printer shared from another PC is written \\PC\Name.</p>
        <datalist id="adm-queues">{p.queues.map(q => <option key={q.name} value={q.name} />)}</datalist>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(120px, max-content) minmax(0, 1fr) minmax(0, 1fr)", gap: "8px 12px", alignItems: "center", maxWidth: 820 }}>
          <span /><strong style={{ color: "var(--text-dim)" }}>Stickers</strong><strong style={{ color: "var(--text-dim)" }}>Tickets and lists</strong>
          {rows.map(r => (
            <div key={r.id} style={{ display: "contents" }}>
              <label style={{ fontWeight: 700 }} htmlFor={`pr-${r.id}-sticker`}>{r.label}</label>
              {["sticker", "ticket"].map(w => (
                <input key={w} id={`pr-${r.id}-${w}`} list="adm-queues" style={st.input} value={val(r.id, w)} disabled={!p.writable} placeholder={r.id === "*" ? "(.env.local)" : "(every station / .env.local)"} onChange={e => set(r.id, w, e.target.value)} aria-label={`${r.label} ${w === "sticker" ? "stickers" : "tickets and lists"}`} />
              ))}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
          {p.writable ? <>
            <button style={changed ? st.pri : { ...st.pri, opacity: 0.45, cursor: "not-allowed" }} disabled={!changed || busy} onClick={() => save(false)}>{busy ? "Saving…" : "Save"}</button>
            {unknown.length > 0 && changed && <button style={{ ...st.btn, borderColor: "var(--warn)", color: "var(--warn-text)" }} disabled={busy} onClick={() => save(true)}>Save anyway</button>}
            {changed && <button style={st.btn} onClick={() => { setDraft(p.overrides || {}); setUnknown([]); }}>Undo changes</button>}
            {Object.keys(p.overrides || {}).length > 0 && !changed && <button style={st.btn} onClick={() => setDraft({})}>Clear all (back to .env.local)</button>}
          </> : <Pill>Read only on this server</Pill>}
        </div>
      </section>

      <section style={st.card}>
        <h2 style={st.h2}>Test label</h2>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 260px", minWidth: 0 }}>
            <label htmlFor="adm-test-q" style={{ fontWeight: 700 }}>Printer</label>
            <input id="adm-test-q" list="adm-queues" style={st.input} value={test.queue} onChange={e => setTest(t => ({ ...t, queue: e.target.value }))} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label htmlFor="adm-test-r" style={{ fontWeight: 700 }}>Roll</label>
            <select id="adm-test-r" style={{ ...st.input, width: "auto" }} value={test.roll} onChange={e => setTest(t => ({ ...t, roll: e.target.value }))}>{ROLLS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}</select>
          </div>
          <button style={st.pri} disabled={!p.writable || busy || !test.queue} onClick={sendTest}>Print a test label</button>
        </div>
        <p style={{ margin: "8px 0 0", color: "var(--text-dim)", fontSize: 14 }}>One small label: "Jersey QC test", the printer, the roll and the time. It goes in the change log.</p>
      </section>

      <section style={st.card}>
        <h2 style={st.h2}>Print queues on {p.stage === "production" ? "the server PC" : "this server's PC"}</h2>
        {p.queueError && <div role="alert" style={{ color: "var(--fail-text)" }}>Could not list them: {p.queueError}</div>}
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14 }}>
            <thead><tr>{["Name", "Driver", "Port", "Status"].map(h => <th key={h} style={{ ...cell, textAlign: "left", color: "var(--text-dim)", borderBottom: "2px solid var(--line-strong)" }}>{h}</th>)}</tr></thead>
            <tbody>{p.queues.map(q => <tr key={q.name}><td style={cell}><strong>{q.name}</strong> {q.zebra && <Pill tone="pass">label printer</Pill>}</td><td style={cell}>{q.driver}</td><td style={cell}>{q.port}</td><td style={cell}>{String(q.status ?? "")}</td></tr>)}</tbody>
          </table>
        </div>
        <p style={{ margin: "10px 0 0", color: "var(--text-dim)", fontSize: 14 }}>From .env.local: JERSEY_PRINTER {p.env.printer || "(not set)"}, JERSEY_FLAG_PRINTER {p.env.flagPrinter || "(not set)"}{Object.keys(p.env.stations).length ? `, per station: ${Object.entries(p.env.stations).map(([k, v]) => `${k} ${v}`).join(", ")}` : ""}.</p>
      </section>
    </>
  );
}

// Station defaults (phase 4): what a station uses for each setting its operator has not
// changed there (the co-op: no locks, admins set the defaults). Blank = the app's own default.
// A station takes them at its next sign-in, or as soon as no order is open; never mid-order.
const ROLL_OPTS = [["2x3", "2 × 3 in"], ["2x4", "2 × 4 in"], ["2x1", "2 × 1 in"], ["1x0.5", "1 × ½ in"]];
const DEFAULT_ROWS = [
  { group: "Keys and the pedal" },
  { k: "scanKey", label: "Scan", type: "key" },
  { k: "confirmKey", label: "Select", type: "key" },
  { k: "cancelKey", label: "Highlight down", type: "key" },
  { k: "upKey", label: "Highlight up", type: "key" },
  { k: "retryKey", label: "Retry", type: "key" },
  { k: "byHandKey", label: "By hand", type: "key" },
  { group: "Hands-free" },
  { k: "autoScan", label: "Hands-free on", type: "bool" },
  { k: "autoScanDelay", label: "Wait after a confirm (seconds)", type: "num", min: 0, max: 30 },
  { group: "Label printer" },
  { k: "stickers", label: "Sticker on every passed garment", type: "bool" },
  { k: "stickerRoll", label: "Sticker roll", type: "pick", opts: ROLL_OPTS },
  { k: "flagTickets", label: "Flag ticket on every flag", type: "bool" },
  { k: "flagRoll", label: "Flag ticket roll", type: "pick", opts: ROLL_OPTS },
  { k: "binLists", label: "Box lists at Box full and Finish", type: "bool" },
  { k: "boxRoll", label: "Box labels and lists roll", type: "pick", opts: ROLL_OPTS },
  { k: "boxAutoPrint", label: "Box labels print by themselves when an order starts", type: "bool" },
  { group: "Packing" },
  { k: "boxWeights", label: "Weight estimate", type: "bool" },
  { k: "boxWeightCap", label: "Weight cap (lb)", type: "num", min: 10, max: 100 },
  { group: "Screens" },
  { k: "listSort", label: "Pick list order", type: "pick", opts: [["size", "Size"], ["team", "Team"], ["number", "Number"]] },
  { k: "theme", label: "Light or dark", type: "pick", opts: [["dark", "Dark"], ["light", "Light"], ["system", "Follow the PC"]] },
];
const showVal = (row, v) => row.type === "bool" ? (v ? "On" : "Off") : row.type === "key" ? keyName(v) : row.type === "pick" ? (row.opts.find(o => o[0] === v)?.[1] || String(v)) : String(v);
function keyName(code) {
  const s = String(code || "");
  return s.startsWith("Key") ? s.slice(3) : s.startsWith("Digit") ? s.slice(5) : s === "ArrowUp" ? "↑" : s === "ArrowDown" ? "↓" : s === "ArrowLeft" ? "←" : s === "ArrowRight" ? "→" : s;
}
function StationDefaults() {
  const [cfg, setCfg] = useState(null);
  const [draft, setDraft] = useState({});
  const [listen, setListen] = useState(null);
  const [msg, setMsg] = useState({ tone: "", text: "" });
  const [busy, setBusy] = useState(false);
  const [writable, setWritable] = useState(false);
  useEffect(() => { api("/settings").then(c => { setCfg(c); setDraft(c.defaults || {}); setWritable(!!c.writable); }).catch(e => setMsg({ tone: "fail", text: e.message })); }, []);
  useEffect(() => {
    if (!listen) return;
    const h = e => { e.preventDefault(); e.stopPropagation(); setDraft(d => ({ ...d, [listen]: e.code })); setListen(null); };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, [listen]);
  if (!cfg) return <section style={st.card}>{msg.text ? <span style={{ color: "var(--fail-text)" }}>{msg.text}</span> : "Loading…"}</section>;
  const set = (k, v) => setDraft(d => { const n = { ...d }; if (v === "" || v === undefined) delete n[k]; else n[k] = v; return n; });
  const saved = cfg.defaults || {};
  const changed = JSON.stringify(draft) !== JSON.stringify(saved);
  const save = async () => {
    setBusy(true); setMsg({ tone: "", text: "" });
    try { const c = await api("/settings/defaults", { method: "PUT", body: JSON.stringify({ defaults: draft, configVersion: cfg.configVersion }) }); setCfg(x => ({ ...x, ...c })); setDraft(c.defaults || {}); setMsg({ tone: "pass", text: c.unchanged ? "Nothing to save." : "Saved. Each station takes them at its next sign-in, or as soon as it has no order open." }); }
    catch (e) { setMsg({ tone: "fail", text: e.message }); }
    finally { setBusy(false); }
  };
  const cell = { padding: "7px 8px", borderBottom: "1px solid var(--line)", verticalAlign: "middle" };
  const control = row => {
    const v = draft[row.k], dis = !writable;
    if (row.type === "bool") return <select aria-label={row.label} style={{ ...st.input, width: "auto", padding: "6px 10px" }} disabled={dis} value={v === undefined ? "" : v ? "on" : "off"} onChange={e => set(row.k, e.target.value === "" ? "" : e.target.value === "on")}><option value="">App default</option><option value="on">On</option><option value="off">Off</option></select>;
    if (row.type === "pick") return <select aria-label={row.label} style={{ ...st.input, width: "auto", padding: "6px 10px" }} disabled={dis} value={v ?? ""} onChange={e => set(row.k, e.target.value)}><option value="">App default</option>{row.opts.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select>;
    if (row.type === "num") return <input aria-label={row.label} type="number" min={row.min} max={row.max} style={{ ...st.input, width: 110, padding: "6px 10px" }} disabled={dis} value={v ?? ""} placeholder="App default" onChange={e => set(row.k, e.target.value === "" ? "" : Number(e.target.value))} />;
    return (
      <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
        <button style={{ ...st.btn, padding: "5px 12px", minWidth: 120, ...(listen === row.k ? { borderColor: "var(--warn)", color: "var(--warn-text)" } : {}) }} disabled={dis} onClick={() => setListen(listen === row.k ? null : row.k)}>{listen === row.k ? "Press a key…" : v ? keyName(v) : "App default"}</button>
        {v && <button style={{ ...st.btn, padding: "5px 10px" }} disabled={dis} onClick={() => set(row.k, "")} aria-label={`${row.label}: back to the app default`}>✕</button>}
      </span>
    );
  };
  return (
    <section style={st.card}>
      <h2 style={st.h2}>Station defaults</h2>
      <p style={{ margin: "0 0 12px", color: "var(--text-dim)" }}>What every station uses for a setting its operator has not changed on that station. An operator can still change any of them in the station's Settings; their choice stays. Leave "App default" to keep the app's own. A station takes new defaults at its next sign-in, or as soon as it has no order open, never in the middle of an order. The camera and its rotation stay with each PC.</p>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 15 }}>
          <thead><tr>{["Setting", "App default", "Floor default"].map(h => <th key={h} style={{ ...cell, textAlign: "left", color: "var(--text-dim)", borderBottom: "2px solid var(--line-strong)" }}>{h}</th>)}</tr></thead>
          <tbody>
            {DEFAULT_ROWS.map(row => row.group
              ? <tr key={row.group}><td colSpan={3} style={{ ...cell, fontWeight: 700, paddingTop: 14, color: "var(--text)" }}>{row.group}</td></tr>
              : <tr key={row.k} style={draft[row.k] !== undefined ? { background: "var(--info-bg)" } : undefined}>
                  <td style={cell}>{row.label}</td>
                  <td style={{ ...cell, color: "var(--text-dim)" }}>{showVal(row, DEFAULT_SETTINGS[row.k])}</td>
                  <td style={cell}>{control(row)}</td>
                </tr>)}
          </tbody>
        </table>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 12 }}>
        {writable ? <>
          <button style={changed ? st.pri : { ...st.pri, opacity: 0.45, cursor: "not-allowed" }} disabled={!changed || busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
          {changed && <button style={st.btn} onClick={() => setDraft(saved)}>Undo changes</button>}
          {!changed && Object.keys(saved).length > 0 && <button style={st.btn} onClick={() => setDraft({})}>Clear all (the app's own defaults)</button>}
        </> : <Pill>Read only on this server</Pill>}
        {msg.text && <span role="status" style={{ color: msg.tone ? `var(--${msg.tone}-text)` : "var(--text)" }}>{msg.text}</span>}
      </div>
    </section>
  );
}

// Data (phase 5): what the hub is holding (rosters sent, unfinished orders and their files,
// boxes left open, backups), "Back up now", and the fixes for something stuck: a roster or an
// unfinished order still marked as taken by a station, an open box no order will take. Each
// goes through the hub's own routes and into the change log. On the development and testing
// servers only: clear the test data (a backup first, and the stage's name typed to confirm).
function DataTools() {
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState({ tone: "", text: "" });
  const [busy, setBusy] = useState("");
  const [confirm, setConfirm] = useState("");
  const load = useCallback(() => api("/data").then(setD).catch(e => setMsg({ tone: "fail", text: e.message })), []);
  useEffect(() => { load(); }, [load]);
  if (!d) return <section style={st.card}>{msg.text ? <span style={{ color: "var(--fail-text)" }}>{msg.text}</span> : "Loading…"}</section>;
  const act = async (what, route, body, done) => {
    setBusy(what); setMsg({ tone: "", text: "" });
    try { const r = await api(route, { method: "POST", body: JSON.stringify(body || {}) }); setMsg({ tone: "pass", text: done(r) }); setConfirm(""); await load(); }
    catch (e) { setMsg({ tone: "fail", text: e.message }); }
    finally { setBusy(""); }
  };
  const cell = { padding: "6px 8px", borderBottom: "1px solid var(--line)", verticalAlign: "middle" };
  const head = cols => <thead><tr>{cols.map(h => <th key={h} style={{ ...cell, textAlign: "left", color: "var(--text-dim)", borderBottom: "2px solid var(--line-strong)" }}>{h}</th>)}</tr></thead>;
  const small = { ...st.btn, padding: "4px 10px", fontSize: 14 };
  const stName = s => String(s || "").replace(/^st-station/i, "Station ");
  const want = `clear ${d.stage}`;
  return (
    <>
      {msg.text && <div role="status" style={{ ...st.card, borderColor: `var(--${msg.tone || "info"})`, background: `var(--${msg.tone || "info"}-bg)`, color: `var(--${msg.tone || "info"}-text)` }}>{msg.text}</div>}
      <section style={st.card}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <h2 style={{ ...st.h2, margin: 0 }}>What the hub holds</h2>
          <button style={st.pri} disabled={!d.writable || !!busy} onClick={() => act("backup", "/data/backup", {}, r => `Backup made: data\\backups\\${r.name} (${r.files} files).`)}>{busy === "backup" ? "Backing up…" : "Back up now"}</button>
        </div>
        <p style={{ margin: "8px 0 0", color: "var(--text-dim)" }}>{d.stations} stations known · {d.ledgerDays} days of ledger · {d.boxAnswers} box answers teaching the box model · {d.backups.length} backups{d.backups[0] ? `, newest ${d.backups[0].name}` : ""}. A backup copies the data file, the unfinished orders and the admin file into data\backups (the newest 20 are kept), the same copy a promotion makes.</p>
      </section>

      <section style={st.card}>
        <h2 style={st.h2}>Rosters sent to stations <span style={{ fontWeight: 400, color: "var(--text-dim)", fontSize: 14 }}>· {d.rosters.length}</span></h2>
        <div style={{ overflowX: "auto" }}><table style={{ borderCollapse: "collapse", width: "100%", fontSize: 15 }}>{head(["Order", "Garments", "Sent", "Taken by", ""])}<tbody>
          {d.rosters.map(r => <tr key={r.id}><td style={{ ...cell, fontWeight: 700 }}>{r.orderNumber || r.id}</td><td style={cell}>{r.rows}</td><td style={cell}>{when(r.createdAt)}{r.by ? ` · ${r.by}` : ""}</td><td style={cell}>{r.takenBy ? `${stName(r.takenBy.station)}${r.takenBy.operator ? " · " + r.takenBy.operator : ""}` : <span style={{ color: "var(--text-dim)" }}>waiting</span>}</td>
            <td style={cell}>{r.takenBy && <button style={small} disabled={!d.writable || !!busy} onClick={() => act(r.id, "/data/release-roster", { id: r.id }, () => `Roster ${r.orderNumber || r.id} released: any station can take it.`)}>Release</button>}</td></tr>)}
          {!d.rosters.length && <tr><td colSpan={5} style={{ ...cell, color: "var(--text-dim)" }}>None.</td></tr>}
        </tbody></table></div>
      </section>

      <section style={st.card}>
        <h2 style={st.h2}>Unfinished orders <span style={{ fontWeight: 400, color: "var(--text-dim)", fontSize: 14 }}>· {d.unfinished.filter(u => !u.closed).length} open, {d.unfinished.filter(u => u.closed).length} closed</span></h2>
        <div style={{ overflowX: "auto" }}><table style={{ borderCollapse: "collapse", width: "100%", fontSize: 15 }}>{head(["Order", "Parked by", "Still out", "Open on", "File", "Changed", ""])}<tbody>
          {d.unfinished.map(u => <tr key={u.id} style={u.closed ? { color: "var(--text-dim)" } : undefined}><td style={{ ...cell, fontWeight: 700 }}>{u.order}{u.kind === "sorter" ? " (sorter)" : ""}{u.closed ? " · closed" : ""}</td><td style={cell}>{stName(u.station)}</td><td style={cell}>{u.out}</td><td style={cell}>{u.openOn ? stName(u.openOn.station) : u.assignedTo ? `given to ${stName(u.assignedTo)}` : "—"}</td>
            <td style={cell}>{u.file ? "on disk" : u.stored ? <Pill tone="fail">missing</Pill> : "—"}</td><td style={cell}>{when(u.updatedAt)}</td>
            <td style={cell}>{(u.openOn || u.assignedTo) && <button style={small} disabled={!d.writable || !!busy} onClick={() => act(u.id, "/data/release-unfinished", { id: u.id }, () => `Order ${u.order} taken off its station: any station can pick it up.`)}>Take off station</button>}</td></tr>)}
          {!d.unfinished.length && <tr><td colSpan={7} style={{ ...cell, color: "var(--text-dim)" }}>None.</td></tr>}
        </tbody></table></div>
        {d.orphanFiles.length > 0 && <p style={{ margin: "8px 0 0", color: "var(--warn-text)" }}>Order files with no entry (left in data\{"<"}hub{">"}-orders, not shown to stations): {d.orphanFiles.join(", ")}</p>}
      </section>

      <section style={st.card}>
        <h2 style={st.h2}>Boxes left open for ship-with orders <span style={{ fontWeight: 400, color: "var(--text-dim)", fontSize: 14 }}>· {d.openBoxes.length}</span></h2>
        <div style={{ overflowX: "auto" }}><table style={{ borderCollapse: "collapse", width: "100%", fontSize: 15 }}>{head(["Box", "From order", "For orders", "Garments", "Left", "Taken by", ""])}<tbody>
          {d.openBoxes.map(b => <tr key={b.id}><td style={{ ...cell, fontWeight: 700 }}>{b.bin} {b.label}</td><td style={cell}>{b.order} · {stName(b.station)}</td><td style={cell}>{b.orders.join(", ")}</td><td style={cell}>{b.items}</td><td style={cell}>{when(b.at)}</td><td style={cell}>{b.takenBy ? `${b.takenBy.order || ""} ${stName(b.takenBy.station)}` : <span style={{ color: "var(--text-dim)" }}>waiting</span>}</td>
            <td style={cell}><button style={small} disabled={!d.writable || !!busy} onClick={() => act(b.id, "/data/drop-openbox", { id: b.id }, () => `Box ${b.bin} given up: no order will take it.`)}>Give up</button></td></tr>)}
          {!d.openBoxes.length && <tr><td colSpan={7} style={{ ...cell, color: "var(--text-dim)" }}>None.</td></tr>}
        </tbody></table></div>
      </section>

      <section style={{ ...st.card, borderColor: d.canClear ? "var(--fail)" : "var(--line)" }}>
        <h2 style={st.h2}>Clear test data</h2>
        {d.canClear ? <>
          <p style={{ margin: "0 0 10px", color: "var(--text-dim)" }}>Takes the stations, rosters, ledger, unfinished orders (and their files) and open boxes off this {d.stage} server, after a backup. The box model's answers stay. Only the development and testing servers have this; never production. Type <strong style={{ color: "var(--text)" }}>{want}</strong> to confirm.</p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <label htmlFor="adm-clear" style={{ position: "absolute", left: -9999 }}>Type {want}</label>
            <input id="adm-clear" style={{ ...st.input, maxWidth: 280 }} value={confirm} onChange={e => setConfirm(e.target.value)} placeholder={want} autoComplete="off" />
            <button style={{ ...st.pri, background: "var(--fail)", borderColor: "var(--fail)", color: "#fff", ...(confirm.trim().toLowerCase() === want ? {} : { opacity: 0.45, cursor: "not-allowed" }) }} disabled={confirm.trim().toLowerCase() !== want || !d.writable || !!busy} onClick={() => act("clear", "/data/clear", { confirm }, r => `Test data cleared (${r.files} order files). The backup is data\\backups\\${r.backup}.`)}>{busy === "clear" ? "Clearing…" : "Back up, then clear"}</button>
          </div>
        </> : <p style={{ margin: 0, color: "var(--text-dim)" }}>Not on this server: clearing test data is only for the development and testing servers.</p>}
      </section>

      <section style={st.card}>
        <h2 style={st.h2}>Backups <span style={{ fontWeight: 400, color: "var(--text-dim)", fontSize: 14 }}>· data\backups</span></h2>
        <p style={{ margin: "0 0 8px", color: "var(--text-dim)" }}>Restoring one needs the server stopped, so it stays a job on the server PC (copy the files back into data\, or tools\merge-hub-data.mjs).</p>
        <div style={{ overflowX: "auto" }}><table style={{ borderCollapse: "collapse", width: "100%", fontSize: 15 }}>{head(["Backup", "Size"])}<tbody>
          {d.backups.map(b => <tr key={b.name}><td style={cell}>{b.name}</td><td style={cell}>{mb(b.size)}</td></tr>)}
          {!d.backups.length && <tr><td colSpan={2} style={{ ...cell, color: "var(--text-dim)" }}>None yet.</td></tr>}
        </tbody></table></div>
      </section>
    </>
  );
}

// AI reads (phase 6): the model the stations read with (changed here on development and
// testing only), what the server lets through (ai-proxy.js), and the reads it counted: calls,
// failures, refusals, time, tokens and, once prices are typed in, what they cost.
const AI_LABEL = { model: "Model", effort: "Effort", thinking: "Thinking", maxPx: "Frame size (longest side, px)" };
const AI_OPTS = { effort: [["low", "Low"], ["medium", "Medium"], ["high", "High"]], thinking: [["off", "Off"], ["adaptive", "Adaptive"]], maxPx: [[640, "640"], [800, "800"], [1024, "1024"], [1280, "1280"]] };
const tok = n => (n >= 1e6 ? `${(n / 1e6).toFixed(2)} M` : n >= 1e3 ? `${Math.round(n / 1e3)} k` : String(n || 0));
const medianOf = (b = []) => { const n = b.reduce((a, x) => a + (x || 0), 0); if (!n) return 0; let s = 0; for (let i = 0; i < b.length; i++) { s += b[i] || 0; if (s >= n / 2) return (i + 0.5) * 250; } return 0; };
// { total, partial }: what the day's reads cost at the prices typed in; `partial` when reads on
// a model with no price are left out (Fable's review of 5-8, L6). null when nothing is priced.
const costOf = (day, prices) => {
  let total = 0, priced = false, partial = false;
  for (const [m, u] of Object.entries(day.models || {})) {
    if (!u || typeof u !== "object" || !u.calls) continue;
    const p = prices[m]; if (!p) { partial = true; continue; }
    priced = true;
    total += ((u.input || 0) * (p.input || 0) + (u.output || 0) * (p.output || 0) + (u.cacheRead || 0) * (p.cacheRead || 0) + (u.cacheWrite || 0) * (p.cacheWrite || 0)) / 1e6;
  }
  return priced ? { total, partial } : null;
};
// Floor rules (phase 7): the inspection counts (the co-op's decision 6), and where each sign-in
// PIN comes from (checked by the server; the PIN itself is never shown or changed here).
const COUNT_ROWS = [
  ["full", "Inspect fully", "The first garments of an order, and the next ones after a defect, are inspected fully. A flag's related check (Decoration, Size tag …) is asked on that many too.", 5, 1, 20],
  ["every", "Spot check after", "Clean garments on a quick look before one is inspected fully.", 10, 1, 50],
  ["selfCheck", "Camera self-check", "After the operator corrects the app, the next garments are read twice and must agree before a green.", 5, 1, 20],
];
const PIN_LABEL = { inspector: "Inspector", sorter: "Sorter", packer: "Packer", supervisor: "Supervisor", station1: "Station 1", station2: "Station 2", station3: "Station 3" };
// The inspector's checks (the co-op, 27 Nov 2026): the tick buttons on the green screen. Add,
// rename, remove, put in order; "Look at" = shown big on a quick look; the flag reasons that ask
// for the check on the next garments (a reason on one check at most: picking it here takes it off
// the other). Saved whole in the admin file (`settings.checks`); a station takes it at its next order.
const FLAG_REASONS = [...REASONS, MARK_STAYS, THREAD_STAYS, NO_SIZE_TAG];
const APP_CHECKS = CHECKS.map(c => ({ id: c.id, label: c.label, ...(c.quick ? { quick: true } : {}), reasons: [...c.reasons] }));
function CheckEditor({ cfg, onSaved, setMsg }) {
  const saved = cfg.checks?.length ? cfg.checks : APP_CHECKS;
  const [draft, setDraft] = useState(saved);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setDraft(cfg.checks?.length ? cfg.checks : APP_CHECKS); }, [cfg]);
  const changed = JSON.stringify(draft) !== JSON.stringify(saved);
  const { error } = cleanChecks(draft);
  const ro = !cfg.writable;
  const put = (i, patch) => setDraft(d => d.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const move = (i, by) => setDraft(d => { const n = [...d], j = i + by; if (j < 0 || j >= n.length) return d; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const toggleReason = (i, rid) => setDraft(d => d.map((c, j) => {
    if (j === i) return { ...c, reasons: c.reasons.includes(rid) ? c.reasons.filter(r => r !== rid) : [...c.reasons, rid] };
    return c.reasons.includes(rid) ? { ...c, reasons: c.reasons.filter(r => r !== rid) } : c;   // a reason asks for one check
  }));
  const add = () => {
    const label = name.replace(/\s+/g, " ").trim();
    if (!label) return;
    setDraft(d => [...d, { id: checkIdFor(label, d.map(c => c.id)), label, reasons: [] }]); setName("");
  };
  const save = async body => {
    setBusy(true); setMsg({ tone: "", text: "" });
    try { const r = await api("/settings/checks", { method: "PUT", body: JSON.stringify({ ...body, configVersion: cfg.configVersion }) }); setMsg({ tone: "pass", text: r.unchanged ? "Nothing to save." : "Saved. Each station uses the new checks from its next order; an order already open keeps its own." }); await onSaved(); }
    catch (e) { setMsg({ tone: "fail", text: e.message }); }
    finally { setBusy(false); }
  };
  const cell = { padding: "8px", borderBottom: "1px solid var(--line)", verticalAlign: "top" };
  const owner = rid => draft.find(c => c.reasons.includes(rid));
  return (
    <section style={st.card}>
      <h2 style={st.h2}>Inspector checks</h2>
      <p style={{ margin: "0 0 10px", color: "var(--text-dim)" }}>
        The tick buttons on the green screen. On Inspect fully every check is ticked before Confirm; on a quick look nothing is ticked: the ones marked <strong>Look at</strong> show big, the rest small under "Also look for". A flag for one of a check's reasons makes that check a tick on the next garments; a flag whose reason is on no check starts Inspect fully again.
        {cfg.checks?.length ? "" : " Showing the app's own checks (nothing saved)."} {ro ? "Read only on this server." : ""}
      </p>
      <div style={{ overflowX: "auto" }}><table style={{ borderCollapse: "collapse", width: "100%", fontSize: 15 }}>
        <thead><tr style={{ textAlign: "left", color: "var(--text-dim)" }}><th style={cell}>Order</th><th style={cell}>Name on the button</th><th style={cell}>Look at</th><th style={cell}>Asked after a flag for</th><th style={cell}></th></tr></thead>
        <tbody>
          {draft.map((c, i) => (
            <tr key={c.id}>
              <td style={{ ...cell, whiteSpace: "nowrap" }}>
                <button aria-label={`Move ${c.label} up`} style={{ ...st.btn, padding: "4px 10px" }} disabled={ro || i === 0} onClick={() => move(i, -1)}>↑</button>{" "}
                <button aria-label={`Move ${c.label} down`} style={{ ...st.btn, padding: "4px 10px" }} disabled={ro || i === draft.length - 1} onClick={() => move(i, 1)}>↓</button>
              </td>
              <td style={{ ...cell, minWidth: 180 }}><input aria-label={`Name of ${c.label || "the check"}`} maxLength={CHECK_LABEL_MAX} style={{ ...st.input, padding: "6px 8px" }} disabled={ro} value={c.label} onChange={e => put(i, { label: e.target.value })} /></td>
              <td style={cell}><input type="checkbox" aria-label={`${c.label}: look at on a quick look`} style={{ width: 20, height: 20 }} disabled={ro} checked={!!c.quick} onChange={e => { const { quick: _q, ...rest } = c; setDraft(d => d.map((x, j) => (j === i ? (e.target.checked ? { ...rest, quick: true } : rest) : x))); }} /></td>
              <td style={cell}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {FLAG_REASONS.map(r => {
                    const on = c.reasons.includes(r.id), other = !on && owner(r.id);
                    return <button key={r.id} disabled={ro} aria-pressed={on} title={other ? `Now on "${other.label}"; picking it here moves it` : undefined} onClick={() => toggleReason(i, r.id)}
                      style={{ ...st.btn, padding: "3px 10px", fontSize: 13, fontWeight: on ? 700 : 400, ...(on ? { background: "var(--accent)", color: "var(--on-accent)", borderColor: "var(--accent)" } : other ? { opacity: 0.55 } : {}) }}>{r.label}</button>;
                  })}
                </div>
              </td>
              <td style={cell}><button aria-label={`Remove ${c.label}`} style={st.btn} disabled={ro || draft.length <= 1} onClick={() => setDraft(d => d.filter((_, j) => j !== i))}>Remove</button></td>
            </tr>
          ))}
        </tbody>
      </table></div>
      {!ro && <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
        <input aria-label="Name of a new check" placeholder="A new check, e.g. Zip works" maxLength={CHECK_LABEL_MAX} style={{ ...st.input, width: 280 }} value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") add(); }} />
        <button style={name.trim() && draft.length < MAX_CHECKS ? st.btn : { ...st.btn, opacity: 0.45, cursor: "not-allowed" }} disabled={!name.trim() || draft.length >= MAX_CHECKS} onClick={add}>+ Add check</button>
      </div>}
      {changed && error && <p style={{ margin: "8px 0 0", color: "var(--fail-text)" }}>{error}</p>}
      {!ro && <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
        <button style={changed && !error ? st.pri : { ...st.pri, opacity: 0.45, cursor: "not-allowed" }} disabled={!changed || !!error || busy} onClick={() => save({ checks: draft })}>Save checks</button>
        {changed && <button style={st.btn} onClick={() => setDraft(saved)}>Undo changes</button>}
        {cfg.checks?.length > 0 && <button style={st.btn} disabled={busy} onClick={() => save({ checks: null })}>Use the app's own checks</button>}
      </div>}
    </section>
  );
}

function FloorRules() {
  const [cfg, setCfg] = useState(null);
  const [pins, setPins] = useState([]);
  const [counts, setCounts] = useState({});
  const [msg, setMsg] = useState({ tone: "", text: "" });
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => Promise.all([api("/settings"), api("/health")]).then(([c, h]) => { setCfg(c); setCounts(c.inspection || {}); setPins(h.pins || []); }).catch(e => setMsg({ tone: "fail", text: e.message })), []);
  useEffect(() => { load(); }, [load]);
  if (!cfg) return <section style={st.card}>{msg.text ? <span style={{ color: "var(--fail-text)" }}>{msg.text}</span> : "Loading…"}</section>;
  const changed = JSON.stringify(counts) !== JSON.stringify(cfg.inspection || {});
  const bad = COUNT_ROWS.find(([k, , , , lo, hi]) => counts[k] !== undefined && !(Number.isInteger(counts[k]) && counts[k] >= lo && counts[k] <= hi));
  const save = async () => {
    setBusy(true); setMsg({ tone: "", text: "" });
    try { const r = await api("/settings/inspection", { method: "PUT", body: JSON.stringify({ inspection: counts, configVersion: cfg.configVersion }) }); setMsg({ tone: "pass", text: r.unchanged ? "Nothing to save." : "Saved. Each station uses the new counts from its next order; an order already open keeps its own." }); await load(); }
    catch (e) { setMsg({ tone: "fail", text: e.message }); }
    finally { setBusy(false); }
  };
  const cell = { padding: "8px", borderBottom: "1px solid var(--line)", verticalAlign: "top" };
  const onPage = pins.filter(p => p.from.startsWith("VITE_")), byDefault = pins.filter(p => p.from === "default");
  return (
    <>
      {msg.text && <div role="status" style={{ ...st.card, borderColor: `var(--${msg.tone || "info"})`, background: `var(--${msg.tone || "info"}-bg)`, color: `var(--${msg.tone || "info"}-text)` }}>{msg.text}</div>}
      <CheckEditor cfg={cfg} onSaved={load} setMsg={setMsg} />
      <section style={st.card}>
        <h2 style={st.h2}>Inspection counts</h2>
        <p style={{ margin: "0 0 10px", color: "var(--text-dim)" }}>Blank means the app's own number. {cfg.writable ? "A station takes a change at its next order, never in the middle of one." : "Read only on this server."}</p>
        <div style={{ overflowX: "auto" }}><table style={{ borderCollapse: "collapse", width: "100%", fontSize: 15 }}><tbody>
          {COUNT_ROWS.map(([k, label, help, app, lo, hi]) => (
            <tr key={k} style={counts[k] !== undefined ? { background: "var(--info-bg)" } : undefined}>
              <td style={{ ...cell, fontWeight: 700, whiteSpace: "nowrap" }}>{label}</td>
              <td style={cell}><input aria-label={label} type="number" min={lo} max={hi} step="1" inputMode="numeric" style={{ ...st.input, width: 90, padding: "6px 8px" }} disabled={!cfg.writable} placeholder={String(app)} value={counts[k] ?? ""} onChange={e => setCounts(c => { const n = { ...c }; if (e.target.value === "") delete n[k]; else n[k] = Number(e.target.value); return n; })} /></td>
              <td style={{ ...cell, color: "var(--text-dim)" }}>{help} <span style={{ color: "var(--text-faint)" }}>App's own: {app}. {lo} to {hi}.</span></td>
            </tr>
          ))}
        </tbody></table></div>
        {bad && <p style={{ margin: "8px 0 0", color: "var(--fail-text)" }}>{bad[1]}: a whole number from {bad[4]} to {bad[5]}.</p>}
        {cfg.writable && <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
          <button style={changed && !bad ? st.pri : { ...st.pri, opacity: 0.45, cursor: "not-allowed" }} disabled={!changed || !!bad || busy} onClick={save}>Save</button>
          {changed && <button style={st.btn} onClick={() => setCounts(cfg.inspection || {})}>Undo changes</button>}
        </div>}
      </section>
      <section style={st.card}>
        <h2 style={st.h2}>Sign-in PINs</h2>
        <p style={{ margin: "0 0 10px", color: "var(--text-dim)" }}>Checked by the server: the stations' pages hold no PIN. Each comes from <code>.env.local</code> (JQC_PIN_… first, then the old VITE_PIN_…), else the app's default. The PINs themselves are never shown here and are changed only in <code>.env.local</code>.</p>
        <div style={{ overflowX: "auto" }}><table style={{ borderCollapse: "collapse", width: "100%", fontSize: 15 }}><tbody>
          {pins.map(p => <tr key={p.id}><td style={{ ...cell, fontWeight: 700 }}>{PIN_LABEL[p.id] || p.id}</td><td style={cell}>{p.from === "default" ? <Pill tone="warn">the app's default</Pill> : p.from.startsWith("VITE_") ? <Pill tone="warn">{p.from}</Pill> : <Pill tone="pass">{p.from}</Pill>}</td></tr>)}
        </tbody></table></div>
        {onPage.length > 0 && <p style={{ margin: "10px 0 0", color: "var(--warn-text)" }}>A VITE_ name still reaches every browser (Vite hands VITE_ variables to the page). Rename {onPage.map(p => p.from).join(", ")} to JQC_PIN_… with the same value.</p>}
        {byDefault.length > 0 && <p style={{ margin: "6px 0 0", color: "var(--warn-text)" }}>{byDefault.map(p => PIN_LABEL[p.id]).join(", ")}: the app's default PIN, which anyone who has read the code knows.</p>}
      </section>
    </>
  );
}

function AiReads() {
  const [d, setD] = useState(null);
  const [ai, setAi] = useState({});
  const [prices, setPrices] = useState({});
  const [msg, setMsg] = useState({ tone: "", text: "" });
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api("/ai").then(r => { setD(r); setAi(r.ai || {}); setPrices(r.prices || {}); }).catch(e => setMsg({ tone: "fail", text: e.message })), []);
  useEffect(() => { load(); const t = setInterval(() => api("/ai").then(r => setD(x => ({ ...r, ai: x?.ai ?? r.ai, prices: x?.prices ?? r.prices }))).catch(() => {}), 15000); return () => clearInterval(t); }, [load]);
  if (!d) return <section style={st.card}>{msg.text ? <span style={{ color: "var(--fail-text)" }}>{msg.text}</span> : "Loading…"}</section>;
  const envOf = k => (k === "maxPx" ? (d.envModel.maxPx || SEND_MAX_PX) : (d.envModel[k] || { model: MODEL, effort: EFFORT, thinking: THINKING }[k]));
  const save = async (route, body, label) => {
    setBusy(true); setMsg({ tone: "", text: "" });
    try { const r = await api(route, { method: "PUT", body: JSON.stringify({ ...body, configVersion: d.configVersion }) }); setMsg({ tone: "pass", text: r.unchanged ? "Nothing to save." : label }); await load(); }
    catch (e) { setMsg({ tone: "fail", text: e.message }); }
    finally { setBusy(false); }
  };
  const days = Object.entries(d.days || {}).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 14);
  const priceModels = [...new Set([...d.models, ...Object.values(d.days || {}).flatMap(x => Object.keys(x.models || {})).filter(m => /^claude-[a-z0-9.-]{1,60}$/.test(m))])];
  const today = days[0]?.[1];
  const cell = { padding: "6px 8px", borderBottom: "1px solid var(--line)", verticalAlign: "middle", fontVariantNumeric: "tabular-nums" };
  const head = cols => <thead><tr>{cols.map(h => <th key={h} style={{ ...cell, textAlign: "left", color: "var(--text-dim)", borderBottom: "2px solid var(--line-strong)" }}>{h}</th>)}</tr></thead>;
  const aiChanged = JSON.stringify(ai) !== JSON.stringify(d.ai || {});
  const pricesChanged = JSON.stringify(prices) !== JSON.stringify(d.prices || {});
  const setPrice = (m, k, v) => setPrices(p => { const n = { ...p, [m]: { ...(p[m] || {}) } }; if (v === "") delete n[m][k]; else n[m][k] = Number(v); if (!Object.keys(n[m]).length) delete n[m]; return n; });
  return (
    <>
      {msg.text && <div role="status" style={{ ...st.card, borderColor: `var(--${msg.tone || "info"})`, background: `var(--${msg.tone || "info"}-bg)`, color: `var(--${msg.tone || "info"}-text)` }}>{msg.text}</div>}
      <section style={st.card}>
        <h2 style={st.h2}>The model the stations read with</h2>
        <p style={{ margin: "0 0 10px", color: "var(--text-dim)" }}>{d.modelEditable ? "Changed here, it is used from each station's next scan on this server. A different model changes what goes green: try it on testing with the recognition stress test before the floor gets it." : d.stage === "production" ? "On production the model stays what .env.local says: it is not changed from the panel." : "Read only on this server."}</p>
        <div style={{ overflowX: "auto" }}><table style={{ borderCollapse: "collapse", width: "100%", fontSize: 15 }}>{head(["Setting", ".env.local / app", "Here"])}<tbody>
          {Object.keys(AI_LABEL).map(k => (
            <tr key={k} style={ai[k] !== undefined ? { background: "var(--info-bg)" } : undefined}>
              <td style={cell}>{AI_LABEL[k]}</td>
              <td style={{ ...cell, color: "var(--text-dim)" }}>{String(envOf(k))}</td>
              <td style={cell}>
                <select aria-label={AI_LABEL[k]} style={{ ...st.input, width: "auto", padding: "6px 10px" }} disabled={!d.modelEditable} value={ai[k] ?? ""} onChange={e => setAi(a => { const n = { ...a }; const v = e.target.value; if (v === "") delete n[k]; else n[k] = k === "maxPx" ? Number(v) : v; return n; })}>
                  <option value="">.env.local / app</option>
                  {(k === "model" ? d.models.map(m => [m, m]) : AI_OPTS[k]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </td>
            </tr>
          ))}
        </tbody></table></div>
        {d.modelEditable && <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
          <button style={aiChanged ? st.pri : { ...st.pri, opacity: 0.45, cursor: "not-allowed" }} disabled={!aiChanged || busy} onClick={() => save("/settings/ai", { ai }, "Saved. Each station reads with it from its next scan.")}>Save</button>
          {aiChanged && <button style={st.btn} onClick={() => setAi(d.ai || {})}>Undo changes</button>}
        </div>}
      </section>

      <section style={st.card}>
        <h2 style={st.h2}>Reads <span style={{ fontWeight: 400, color: "var(--text-dim)", fontSize: 14 }}>· with this server's key, per day</span></h2>
        <div style={{ overflowX: "auto" }}><table style={{ borderCollapse: "collapse", width: "100%", fontSize: 15 }}>{head(["Day", "Reads", "Failed", "Refused", "Median time", "Input", "Output", "Cache read", "Cache write", "Cost"])}<tbody>
          {days.map(([day, x]) => { const c = costOf(x, d.prices || {}); return (
            <tr key={day}><td style={{ ...cell, fontWeight: 700 }}>{day}</td><td style={cell}>{x.calls}</td><td style={{ ...cell, color: x.failed ? "var(--fail-text)" : undefined }}>{x.failed}</td><td style={{ ...cell, color: x.refused ? "var(--warn-text)" : undefined }}>{x.refused}</td><td style={cell}>{(medianOf(x.ms) / 1000).toFixed(1)} s</td><td style={cell}>{tok(x.input)}</td><td style={cell}>{tok(x.output)}</td><td style={cell}>{tok(x.cacheRead)}</td><td style={cell}>{tok(x.cacheWrite)}</td><td style={cell} title={c?.partial ? "Some reads were on a model with no price: they are not in this sum" : undefined}>{c === null ? "—" : `$${c.total.toFixed(2)}${c.partial ? " + ?" : ""}`}</td></tr>); })}
          {!days.length && <tr><td colSpan={10} style={{ ...cell, color: "var(--text-dim)" }}>No reads counted yet on this server (counting started with phase 6).</td></tr>}
        </tbody></table></div>
        {today && <p style={{ margin: "10px 0 0" }}>Today by station: {Object.entries(today.stations || {}).map(([s, v]) => `${s.replace(/^st-station/i, "Station ")} ${v.calls}${v.failed ? ` (${v.failed} failed)` : ""}`).join(" · ") || "none"}. Refused means the server stopped a read that was not the app's own, or one too many from one PC in a minute.</p>}
      </section>

      <section style={st.card}>
        <h2 style={st.h2}>What the server lets through</h2>
        {d.proxy ? <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li>Models: {d.proxy.allowed.join(", ")}</li>
          <li>At most {d.proxy.limits.maxBody / 1048576} MB a read and {d.proxy.limits.maxTokens} tokens of answer</li>
          <li>At most {d.proxy.limits.perPcMin} reads a minute from one PC and {d.proxy.limits.allMin} from all</li>
          <li>A request that brings its own API key (the test tools) spends its own key and is not counted</li>
        </ul> : <p style={{ margin: 0, color: "var(--text-dim)" }}>The AI proxy is not running on this server.</p>}
      </section>

      <section style={st.card}>
        <h2 style={st.h2}>Token prices <span style={{ fontWeight: 400, color: "var(--text-dim)", fontSize: 14 }}>· dollars per million tokens, from Anthropic's price page, for the cost column</span></h2>
        <div style={{ overflowX: "auto" }}><table style={{ borderCollapse: "collapse", width: "100%", fontSize: 15 }}>{head(["Model", "Input", "Output", "Cache read", "Cache write"])}<tbody>
          {priceModels.map(m => <tr key={m}><td style={{ ...cell, fontWeight: 700 }}>{m}</td>{["input", "output", "cacheRead", "cacheWrite"].map(k => <td key={k} style={cell}><input aria-label={`${m} ${k}`} type="number" min="0" step="any" style={{ ...st.input, width: 100, padding: "6px 8px" }} disabled={!d.writable} value={prices[m]?.[k] ?? ""} onChange={e => setPrice(m, k, e.target.value)} placeholder="—" /></td>)}</tr>)}
        </tbody></table></div>
        {d.writable && <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
          <button style={pricesChanged ? st.pri : { ...st.pri, opacity: 0.45, cursor: "not-allowed" }} disabled={!pricesChanged || busy} onClick={() => save("/settings/prices", { prices }, "Prices saved.")}>Save prices</button>
          {pricesChanged && <button style={st.btn} onClick={() => setPrices(d.prices || {})}>Undo changes</button>}
        </div>}
      </section>
    </>
  );
}

function Appearance() {
  const [choice, setChoice] = useState(loadTheme);
  const pick = id => { setChoice(id); saveTheme(id); };
  return (
    <section style={st.card}>
      <h2 style={st.h2}>Light or dark</h2>
      <p style={{ margin: "0 0 12px", color: "var(--text-dim)" }}>For this browser. Each station has the same choice in its Settings (Screen), and its default is under Station defaults; on the stations every screen follows it (the camera picture, the photo viewer and the wall view stay dark).</p>
      <div role="radiogroup" aria-label="Light or dark" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {THEMES.map(t => (
          <button key={t.id} role="radio" aria-checked={choice === t.id} onClick={() => pick(t.id)} style={choice === t.id ? st.pri : st.btn}>{t.label}</button>
        ))}
      </div>
    </section>
  );
}

const TABS = [{ id: "health", label: "Health" }, { id: "operators", label: "Operators" }, { id: "printers", label: "Printers" }, { id: "defaults", label: "Station defaults" }, { id: "data", label: "Data" }, { id: "rules", label: "Floor rules" }, { id: "ai", label: "AI reads" }, { id: "log", label: "Server log" }, { id: "changes", label: "Change log" }, { id: "look", label: "Light / dark" }];

export default function AdminPanel() {
  const [s, setS] = useState(null);         // the session answer: stage, setup, signedIn …
  const [err, setErr] = useState("");
  const [tab, setTab] = useState("health");
  const [h, setH] = useState(null);
  const loadSession = useCallback(() => api("/session").then(r => { setS(r); setErr(""); }).catch(e => setErr(e.message)), []);
  const loadHealth = useCallback(() => api("/health").then(setH).catch(e => { if (e.status === 401) loadSession(); else setErr(e.message); }), [loadSession]);
  useEffect(() => { document.title = "Jersey QC admin"; loadSession(); }, [loadSession]);
  useEffect(() => { if (!s?.signedIn) return; loadHealth(); const t = setInterval(loadHealth, 15000); return () => clearInterval(t); }, [s?.signedIn, loadHealth]);
  const signOut = async () => { try { await api("/logout", { method: "POST", body: "{}" }); } catch { /* signed out anyway */ } setH(null); loadSession(); };

  return (
    <div style={st.page}>
      <StageBar s={s} />
      <div style={st.wrap}>
        {err && <div role="alert" style={{ ...st.card, borderColor: "var(--fail)", color: "var(--fail-text)", background: "var(--fail-bg)" }}>{err}</div>}
        {!s ? <div style={st.card}>Loading…</div>
          : !s.setup ? (
            <div style={{ ...st.card, maxWidth: 640 }}>
              <h1 style={{ marginTop: 0, fontSize: 22 }}>The admin panel is not set up on this server</h1>
              <p>Add one line to <code>.env.local</code> in this server's folder, then the server restarts by itself:</p>
              <pre style={{ background: "var(--surface-2)", padding: 10, borderRadius: 8, overflowX: "auto" }}>JQC_ADMIN_PASSWORD=the shared admin password</pre>
              <p style={{ color: "var(--text-dim)", marginBottom: 0 }}>No <code>VITE_</code> in front: that would send it to every browser. On production, saving .env.local puts every station on Resume, so do it on a break.</p>
            </div>
          ) : !s.signedIn ? <SignIn onDone={() => loadSession()} />
          : (
            <>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                <h1 style={{ margin: 0, fontSize: 24, marginRight: "auto" }}>Admin panel</h1>
                <span style={{ color: "var(--text-dim)" }}>Signed in as <strong style={{ color: "var(--text)" }}>{s.name}</strong></span>
                <button style={st.btn} onClick={signOut}>Sign out</button>
              </div>
              <nav aria-label="Sections" style={{ display: "flex", gap: 8, flexWrap: "wrap", borderBottom: "1px solid var(--line)", paddingBottom: 10 }}>
                {TABS.map(t => <button key={t.id} onClick={() => setTab(t.id)} aria-current={tab === t.id ? "page" : undefined} style={tab === t.id ? st.pri : st.btn}>{t.label}</button>)}
              </nav>
              {tab === "health" && <Health h={h} onRefresh={loadHealth} />}
              {tab === "operators" && <Operators />}
              {tab === "printers" && <Printers />}
              {tab === "defaults" && <StationDefaults />}
              {tab === "data" && <DataTools />}
              {tab === "rules" && <FloorRules />}
              {tab === "ai" && <AiReads />}
              {tab === "log" && <ServerLog />}
              {tab === "changes" && <ChangeLog />}
              {tab === "look" && <Appearance />}
            </>
          )}
      </div>
    </div>
  );
}
