// The developers' admin panel (phase 1, 26 Nov 2026): the station app opened with
// ?view=admin. It signs a developer in with the shared password (checked by the
// server, admin-plugin.js), shows how this server is doing, the server's own log and
// the change log, and has the light / dark switch for this browser. It changes nothing
// on the floor yet. Every colour comes from the tokens in index.css, so it is the first
// screen that works in both themes.
import { useCallback, useEffect, useState } from "react";
import { THEMES, loadTheme, saveTheme } from "../lib/theme.js";

const api = async (path, opts = {}) => {
  const r = await fetch(`/api/admin${path}`, { credentials: "same-origin", headers: { "Content-Type": "application/json" }, ...opts });
  let body = {}; try { body = await r.json(); } catch { /* empty */ }
  if (!r.ok) { const e = new Error(body.error || `The server answered ${r.status}`); e.status = r.status; throw e; }
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
          <thead><tr>{["When", "Who", "From", "What"].map(h => <th key={h} style={{ textAlign: "left", padding: "6px 8px", borderBottom: "2px solid var(--line-strong)", color: "var(--text-dim)" }}>{h}</th>)}</tr></thead>
          <tbody>
            {(r?.entries || []).map((e, i) => (
              <tr key={i}>
                <td style={{ padding: "6px 8px", borderBottom: "1px solid var(--line)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{when(e.at)}</td>
                <td style={{ padding: "6px 8px", borderBottom: "1px solid var(--line)" }}>{e.who}</td>
                <td style={{ padding: "6px 8px", borderBottom: "1px solid var(--line)", color: "var(--text-dim)" }}>{e.ip}</td>
                <td style={{ padding: "6px 8px", borderBottom: "1px solid var(--line)", color: e.what.startsWith("wrong") ? "var(--fail-text)" : "var(--text)" }}>{e.what}</td>
              </tr>
            ))}
            {r && !r.entries.length && <tr><td colSpan={4} style={{ padding: 8, color: "var(--text-dim)" }}>Nothing yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Appearance() {
  const [choice, setChoice] = useState(loadTheme);
  const pick = id => { setChoice(id); saveTheme(id); };
  return (
    <section style={st.card}>
      <h2 style={st.h2}>Light or dark</h2>
      <p style={{ margin: "0 0 12px", color: "var(--text-dim)" }}>For this browser. The stations get the same switch in a later phase (sign-in and the board first, then the station screens).</p>
      <div role="radiogroup" aria-label="Light or dark" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {THEMES.map(t => (
          <button key={t.id} role="radio" aria-checked={choice === t.id} onClick={() => pick(t.id)} style={choice === t.id ? st.pri : st.btn}>{t.label}</button>
        ))}
      </div>
    </section>
  );
}

const TABS = [{ id: "health", label: "Health" }, { id: "log", label: "Server log" }, { id: "changes", label: "Change log" }, { id: "look", label: "Light / dark" }];

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
              {tab === "log" && <ServerLog />}
              {tab === "changes" && <ChangeLog />}
              {tab === "look" && <Appearance />}
            </>
          )}
      </div>
    </div>
  );
}
