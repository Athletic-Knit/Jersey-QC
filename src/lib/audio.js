// ── Audio feedback: one AudioContext for the whole session ───────────────────
// Chrome caps live contexts; creating one per tone went silent mid-shift.
let ctx = null;
function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

export function playTone(type) {
  try {
    const c = getCtx(), t = c.currentTime;
    const osc = c.createOscillator(), gain = c.createGain();
    osc.connect(gain); gain.connect(c.destination);
    if (type === "pass") {
      osc.frequency.setValueAtTime(880, t); osc.frequency.setValueAtTime(1100, t + 0.1);
      gain.gain.setValueAtTime(0.3, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.start(t); osc.stop(t + 0.35);
    } else if (type === "flag") {
      osc.frequency.setValueAtTime(300, t); osc.frequency.setValueAtTime(220, t + 0.15);
      gain.gain.setValueAtTime(0.4, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      osc.start(t); osc.stop(t + 0.5);
    } else if (type === "count") {            // one tick per second of the damage-photo countdown
      osc.frequency.setValueAtTime(880, t);
      gain.gain.setValueAtTime(0.3, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      osc.start(t); osc.stop(t + 0.12);
    } else if (type === "shutter") {          // the photo is taken: two quick rising blips
      osc.frequency.setValueAtTime(1200, t); osc.frequency.setValueAtTime(1800, t + 0.08);
      gain.gain.setValueAtTime(0.35, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      osc.start(t); osc.stop(t + 0.25);
    } else {
      osc.frequency.setValueAtTime(660, t);
      gain.gain.setValueAtTime(0.15, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      osc.start(t); osc.stop(t + 0.1);
    }
  } catch { /* no audio on this machine; silence is fine */ }
}
