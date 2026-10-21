// ── Voice commands: on-screen feedback ───────────────────────────────────────
// VoiceBadge sits on the camera panel: a level meter, the last words heard,
// and a flash with the command that fired. VoiceLegend is the word list in
// Settings.
import { COMMAND_INFO } from "./lib/voice.js";

export function VoiceBadge({ status, error, loading, active }) {
  if (error)   return <Pill color="#f87171">🎤 {error}</Pill>;
  if (loading) return <Pill color="#94a3b8">🎤 Loading voice…</Pill>;
  if (!status) return null;
  const { level = 0, heard = "", fired, flash, listening } = status;
  const color = flash ? "#22c55e" : active ? "#60a5fa" : "#64748b";
  const text  = flash ? `"${fired}" ✓` : !listening ? "🎤 off" : heard ? `heard: ${heard}` : active ? "say next · flag · again" : "say scan";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, background: "rgba(0,0,0,0.6)", padding: "4px 10px 4px 6px", borderRadius: 20, border: `1px solid ${flash ? color : "transparent"}`, maxWidth: 320 }}>
      <div title="microphone level" style={{ width: 6, height: 18, borderRadius: 3, background: "rgba(255,255,255,0.15)", position: "relative", flexShrink: 0 }}>
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: `${Math.round(Math.min(1, level) * 100)}%`, background: color, borderRadius: 3, transition: "height 80ms" }} />
      </div>
      <span style={{ fontSize: 11, color: flash ? "#fff" : "#cbd5e1", fontWeight: flash ? 700 : 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{text}</span>
    </div>
  );
}

function Pill({ color, children }) {
  return <div style={{ background: "rgba(0,0,0,0.6)", color, fontSize: 11, padding: "4px 10px", borderRadius: 20, whiteSpace: "nowrap" }}>{children}</div>;
}

export function VoiceLegend() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "3px 12px", fontSize: 11, color: "#94a3b8", marginTop: 6, marginLeft: 4 }}>
      {COMMAND_INFO.map(i => (
        <div key={i.word} style={{ display: "contents" }}>
          <span style={{ color: "#e2e8f0", fontWeight: 700 }}>"{i.word}"</span>
          <span>{i.action}</span>
        </div>
      ))}
    </div>
  );
}
