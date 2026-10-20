// ── Hand-gesture input: the React hook ───────────────────────────────────────
// Runs the recogniser against the live <video> ONLY while a result screen is
// up, and fires the configured key for each gesture as a synthetic keydown on
// window, so the app's existing key handlers do all the work.
import { useState, useRef, useEffect } from "react";
import { startGestures, GESTURE_TO_SETTING } from "./lib/gestures.js";

const log = msg => console.log(`[gestures] ${msg}`);

/**
 * @param enabled   the Settings toggle, the camera is live, and a result screen is up
 * @param videoRef  ref to the live <video>
 * @param settings  the app settings (keys, rotation, gestureHoldMs, gestureCooldownMs)
 * @param busy      true while a scan is in flight (recognition pauses)
 * @returns { status, error, loading }  status = { phase, gesture, progress, fired, fps, hand, flash } or null
 */
export function useGestures({ enabled, videoRef, settings, busy }) {
  const [status, setStatus] = useState(null);
  const [error,  setError]  = useState(null);
  const live      = useRef({ settings, busy });                 // read by the runner between renders
  const lastShown = useRef("");
  useEffect(() => { live.current = { settings, busy }; });

  const holdMs = Number(settings.gestureHoldMs) || 600, cooldownMs = Number(settings.gestureCooldownMs) || 1500;

  useEffect(() => {
    if (!enabled || !videoRef.current) return;
    let flashTimer = 0;                                             // status stays null until the first frame = "loading"
    const runner = startGestures({
      video: videoRef.current,
      rotation: () => live.current.settings.rotation,
      isBusy:   () => !!live.current.busy,
      holdMs, cooldownMs, log,
      onError: e => { log(`failed to start: ${e?.message || e}`); setError("Hand gestures could not load (no internet for the model?)"); },
      onStatus: st => {
        if (st.fired) {
          const code = live.current.settings[GESTURE_TO_SETTING[st.fired]];
          log(`${st.fired} → ${code}`);
          if (code) window.dispatchEvent(new KeyboardEvent("keydown", { code, key: code, bubbles: true, cancelable: true }));
          setStatus({ ...st, flash: true });
          clearTimeout(flashTimer); flashTimer = setTimeout(() => setStatus(s => (s ? { ...s, flash: false } : s)), 700);
          lastShown.current = "";
          return;
        }
        // Re-render only when something visible changed (progress in 5 % steps).
        const key = `${st.phase}|${st.gesture}|${Math.round(st.progress * 20)}|${st.hand ? 1 : 0}|${st.fps}`;
        if (key === lastShown.current) return;
        lastShown.current = key;
        setStatus(s => ({ ...st, flash: s?.flash && st.phase === "cooldown" }));
      },
    });
    if (import.meta.env.DEV) window.__gesture = g => runner.simulate(g);   // console/harness: __gesture("Thumb_Up")
    return () => { runner.stop(); clearTimeout(flashTimer); setStatus(null); setError(null); if (import.meta.env.DEV) delete window.__gesture; };
  }, [enabled, videoRef, holdMs, cooldownMs]);

  return { status, error, loading: enabled && !status && !error };
}

