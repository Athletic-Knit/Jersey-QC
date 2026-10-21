// ── Voice commands: the React hook ───────────────────────────────────────────
// Keeps the microphone and recogniser open for the whole shift while the
// setting is on (opening the mic takes a moment, so it is not toggled per
// screen). A command FIRES only while a result screen is up and no scan is
// in flight ("scan" is the exception: it fires when NO screen is up). Each
// fire is a "jerseyqc:voice" event on window; the result screen acts on
// "select" and "notright", the app on "scan".
import { useState, useRef, useEffect } from "react";
import { startVoice } from "./lib/voice.js";

const log = msg => console.log(`[voice] ${msg}`);

/**
 * @param enabled  the Settings toggle, and the operator is signed in
 * @param active   a result screen is up and nothing is scanning → commands fire
 * @param deviceId microphone id from Settings ("" = default)
 * @returns { status, error, loading }  status = { level, heard, listening, fired, flash }
 */
export function useVoice({ enabled, active, deviceId }) {
  const [status, setStatus] = useState(null);
  const [error,  setError]  = useState(null);
  const live = useRef({ active });
  useEffect(() => { live.current = { active }; });

  useEffect(() => {
    if (!enabled) return;
    let runner = null, gone = false, flashTimer = 0;
    startVoice({
      deviceId,
      isActive: () => true,                               // the listeners decide what applies on the current screen
      log,
      onError: e => { log(`failed to start: ${e?.message || e}`); setError(e?.name === "NotAllowedError" ? "Microphone access denied — allow it in the browser's address bar" : e?.name === "NotFoundError" || e?.name === "OverconstrainedError" ? "That microphone is not available — choose another in Settings" : "Voice could not start (model download? see the console)"); },
      onStatus: st => { if (!gone) setStatus(s => ({ ...st, fired: s?.fired, flash: s?.flash })); },
      onCommand: (cmd, word) => {
        window.dispatchEvent(new CustomEvent("jerseyqc:voice", { detail: { command: cmd, word } }));
        setStatus(s => ({ ...(s || {}), fired: word, flash: true }));
        clearTimeout(flashTimer); flashTimer = setTimeout(() => setStatus(s => (s ? { ...s, flash: false } : s)), 900);
      },
    }).then(r => { if (gone) r.stop(); else runner = r; });
    if (import.meta.env.DEV) window.__voice = word => window.dispatchEvent(new CustomEvent("jerseyqc:voice", { detail: { command: ({ scan: "scan", next: "select", flag: "notright", "not right": "notright", again: "retry", retry: "retry" })[word] || word, word } }));
    return () => { gone = true; runner?.stop(); clearTimeout(flashTimer); setStatus(null); if (import.meta.env.DEV) delete window.__voice; };
  }, [enabled, deviceId]);

  return { status, error, loading: enabled && !status && !error };
}
