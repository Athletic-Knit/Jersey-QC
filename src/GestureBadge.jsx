// ── Hand-gesture input: React glue ───────────────────────────────────────────
// GestureBadge is the on-screen feedback for useGestures.js: a ring that fills
// while a gesture is held, then flashes with the command that fired.
// GestureLegend is the cheat-sheet in Settings.
import { GESTURE_INFO, gestureInfo } from "./lib/gestures.js";

export function GestureBadge({ status, error, loading, settings, formatKey, idleText = "✋ Gestures wait for a result" }) {
  if (error)   return <Pill color="#f87171">✋ {error}</Pill>;
  if (loading) return <Pill color="#94a3b8">✋ Loading hand gestures…</Pill>;
  if (!status) return <Pill color="#64748b">{idleText}</Pill>;
  const { phase, gesture, progress, flash, fps, hand } = status;
  const info = gestureInfo(gesture);
  const keyLabel = info && formatKey ? formatKey(settings[info.setting]) : "";

  const active = phase === "holding" || flash;
  const color  = flash ? "#22c55e" : phase === "holding" ? "#60a5fa" : phase === "arming" ? "#f59e0b" : hand ? "#cbd5e1" : "#64748b";
  const text   = flash && info ? `${info.icon} ${info.action}${keyLabel ? ` (${keyLabel})` : ""}`
               : phase === "arming"  ? (hand ? "✋ Take your hand out of the picture first" : "✋ Getting ready…")
               : phase === "holding" && info ? `${info.icon} Hold for ${info.action}…`
               : phase === "cooldown" ? "…"
               : hand ? "Hand seen — show 👍 👎 ✌️ ☝️" : "✋ Show a gesture to answer";
  const ring = active ? Math.round((flash ? 1 : progress) * 100) : 0;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, background: "rgba(0,0,0,0.6)", padding: "4px 10px 4px 6px", borderRadius: 20, border: `1px solid ${active ? color : "transparent"}`, transition: "border-color 120ms" }}>
      <div style={{ width: 18, height: 18, borderRadius: "50%", background: `conic-gradient(${color} ${ring}%, rgba(255,255,255,0.15) 0)`, display: "grid", placeItems: "center", flexShrink: 0 }}>
        <div style={{ width: 11, height: 11, borderRadius: "50%", background: flash ? color : "#0d1117" }} />
      </div>
      <span style={{ fontSize: 11, color: active ? "#fff" : "#cbd5e1", fontWeight: active ? 700 : 500, whiteSpace: "nowrap" }}>{text}</span>
      {fps > 0 && <span style={{ fontSize: 9, color: "#64748b" }}>{fps} fps</span>}
    </div>
  );
}

function Pill({ color, children }) {
  return <div style={{ background: "rgba(0,0,0,0.6)", color, fontSize: 11, padding: "4px 10px", borderRadius: 20, whiteSpace: "nowrap" }}>{children}</div>;
}

// The legend shown in Settings beside the toggle.
export function GestureLegend({ settings, formatKey }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: "3px 10px", fontSize: 11, color: "#94a3b8", marginTop: 6, marginLeft: 24 }}>
      {GESTURE_INFO.map(i => (
        <div key={i.gesture} style={{ display: "contents" }}>
          <span style={{ fontSize: 14 }}>{i.icon}</span>
          <span>{i.name}</span>
          <span style={{ color: "#e2e8f0" }}>{i.action} <span style={{ color: "#64748b" }}>({formatKey(settings[i.setting])})</span></span>
        </div>
      ))}
    </div>
  );
}
