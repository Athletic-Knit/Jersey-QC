// The developers' admin panel (phase 1, 26 Nov 2026): the station app opened with
// ?view=admin. It signs a developer in with the shared password (checked by the
// server, admin-plugin.js), shows how this server is doing, the server's own log and
// the change log, and has the light / dark switch for this browser. It changes nothing
// on the floor yet. Every colour comes from the tokens in index.css, so it is the first
// screen that works in both themes.
import { useCallback, useEffect, useState } from "react";
import { THEMES, loadTheme, saveTheme } from "../lib/theme.js";
import { DEFAULT_SETTINGS } from "../config.js";

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
      {s && !s.writable && <span style={{ marginLeft: "auto", background: "rgba(0,0,0,0.25)", padding: "2px 10px", borderRadius: 999 }}>Read only</span>}
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
            <dt style={st.dt}>Uncommitted files</dt><dd style={st.dd}>{g.error ? "?" : g.dirty ? <Pill tone="warn">{g.dirty}</Pill> : "none"}</dd>
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
const ROLLS = [{ id: "2x4", label: "2 × 4 in" }, { id: "2x3", label: "2 × 3 in" }, { id: "2x1", label: "2 × 1 in" }, { id: "1x0.5", label: "1 × ½ in" }];
function Printers() {
  const [p, setP] = useState(null);
  const [draft, setDraft] = useState({});
  const [msg, setMsg] = useState({ tone: "", text: "" });
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState({ queue: "", roll: "2x4" });
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
const ROLL_OPTS = [["2x4", "2 × 4 in"], ["2x3", "2 × 3 in"], ["2x1", "2 × 1 in"], ["1x0.5", "1 × ½ in"]];
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

function Appearance() {
  const [choice, setChoice] = useState(loadTheme);
  const pick = id => { setChoice(id); saveTheme(id); };
  return (
    <section style={st.card}>
      <h2 style={st.h2}>Light or dark</h2>
      <p style={{ margin: "0 0 12px", color: "var(--text-dim)" }}>For this browser. Each station has the same choice in its Settings (Screen), and its default is under Station defaults; on the stations the sign-in screen and the supervisor board follow it, the scanning screens later.</p>
      <div role="radiogroup" aria-label="Light or dark" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {THEMES.map(t => (
          <button key={t.id} role="radio" aria-checked={choice === t.id} onClick={() => pick(t.id)} style={choice === t.id ? st.pri : st.btn}>{t.label}</button>
        ))}
      </div>
    </section>
  );
}

const TABS = [{ id: "health", label: "Health" }, { id: "operators", label: "Operators" }, { id: "printers", label: "Printers" }, { id: "defaults", label: "Station defaults" }, { id: "data", label: "Data" }, { id: "log", label: "Server log" }, { id: "changes", label: "Change log" }, { id: "look", label: "Light / dark" }];

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
              {tab === "log" && <ServerLog />}
              {tab === "changes" && <ChangeLog />}
              {tab === "look" && <Appearance />}
            </>
          )}
      </div>
    </div>
  );
}
