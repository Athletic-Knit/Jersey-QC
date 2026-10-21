// ── Voice commands ────────────────────────────────────────────────────────────
// The operator wears a headset and answers the result screens by voice. The
// recogniser is Vosk (Kaldi) running in a Web Worker in the browser, offline
// after a one-time ~40 MB model download, and it is given a GRAMMAR: it can
// only ever hear the command words below (plus "[unk]" for everything else),
// which is what makes it robust on a noisy floor with a boom microphone.
// Partial results stream as the operator speaks, so a word fires ~100–200 ms
// after it is said — nothing waits for end-of-sentence.
//
//   "next"   select the highlighted option   (green: confirm)
//   "down"   move to the next option
//   "again"  retry the scan                  (nothing recorded)
//   "flag"   not right — open the reasons
//   "type"   enter by hand
//   "one" … "five"  pick option 1–5 on a list (rows first, then the buttons)
//
// Words were chosen to sound unlike each other; "yes"/"no"/"go" were avoided.
//
// Misfire guards (createVoiceGate, pure, unit-tested):
//   only while a result screen is up (the hook gates firing; listening never stops)
//   a command must stand alone or end the utterance ("ok next" fires, "next door" does not)
//   cooldown after each fire; the same word cannot fire twice from one utterance

export const COMMAND_WORDS = {
  next: "select", down: "down", again: "retry", flag: "notright", type: "manual",
  one: "pick:1", two: "pick:2", three: "pick:3", four: "pick:4", five: "pick:5",
};
export const COMMAND_INFO = [
  { word: "next",  action: "Select / confirm" },
  { word: "down",  action: "Next option" },
  { word: "again", action: "Retry scan" },
  { word: "flag",  action: "Not right — reasons" },
  { word: "type",  action: "Enter by hand" },
  { word: "one … five", action: "Pick option 1–5" },
];
export const GRAMMAR = JSON.stringify([...Object.keys(COMMAND_WORDS), "[unk]"]);
export const MODEL_URL = "/models/vosk-model-small-en-us-0.15.tar.gz";

/**
 * Pure. Feed every partial and final transcript: hear(text, t, final) returns
 * the command that fires on this call, or null. Vosk partials grow across an
 * utterance ("next", "next next"); only tokens not yet handled are considered,
 * and only the LAST token of the text can fire, so a command inside a longer
 * phrase is ignored.
 */
export function createVoiceGate({ cooldownMs = 700 } = {}) {
  let handled = 0, lastFireAt = -Infinity, lastWord = null;
  return {
    reset() { handled = 0; },
    hear(text, t, final = false) {
      const tokens = String(text || "").trim().split(/\s+/).filter(Boolean);
      let fired = null;
      if (tokens.length > handled) {
        const last = tokens[tokens.length - 1];
        const cmd = COMMAND_WORDS[last] || null;
        const fresh = tokens.length === handled + 1;                 // exactly one new token, and it is a command on its own
        if (cmd && fresh && t - lastFireAt >= cooldownMs && !(last === lastWord && t - lastFireAt < 1500)) {
          fired = cmd; lastFireAt = t; lastWord = last;
        }
        handled = tokens.length;
      }
      if (final) handled = 0;
      return fired;
    },
  };
}

let modelPromise = null;
async function loadModel(url, log) {
  if (modelPromise) return modelPromise;
  modelPromise = (async () => {
    const { createModel } = await import("vosk-browser");
    const t0 = Date.now();
    const model = await createModel(url);
    log?.(`model ready in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    return model;
  })();
  modelPromise.catch(() => { modelPromise = null; });
  return modelPromise;
}

/**
 * Open the microphone and run the recogniser. onCommand(cmd, word) fires for
 * each command; onStatus({ level, heard, listening }) a few times a second
 * (level 0–1 for a meter, heard = the last words recognised). Returns
 * { stop }. isActive() false = hear, show, but do not fire.
 */
export async function startVoice({ deviceId = "", modelUrl = MODEL_URL, isActive = () => true, onCommand, onStatus, onError, log, cooldownMs = 700 }) {
  let stopped = false, stream = null, ctx = null, node = null, recognizer = null, model = null;
  const gate = createVoiceGate({ cooldownMs });
  let heard = "", level = 0, lastStatusAt = 0;
  const status = (force = false) => { const now = performance.now(); if (force || now - lastStatusAt > 150) { lastStatusAt = now; onStatus?.({ level, heard, listening: !stopped }); } };
  try {
    model = await loadModel(modelUrl, log);
    if (stopped) return { stop() {} };
    stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: { ...(deviceId ? { deviceId: { exact: deviceId } } : {}), echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    ctx = new AudioContext();
    recognizer = new model.KaldiRecognizer(ctx.sampleRate, GRAMMAR);
    recognizer.setWords(false);
    const handle = (text, final) => {
      if (text) { heard = text; status(true); }
      const cmd = gate.hear(text, performance.now(), final);
      if (cmd && isActive()) { log?.(`"${text}" → ${cmd}`); onCommand?.(cmd, text); }
    };
    recognizer.on("partialresult", m => handle(m.result?.partial || "", false));
    recognizer.on("result", m => handle(m.result?.text || "", true));
    recognizer.on("error", m => log?.(`recognizer error: ${m.error}`));
    node = ctx.createScriptProcessor(4096, 1, 1);
    node.onaudioprocess = e => {
      if (stopped) return;
      const buf = e.inputBuffer;
      const d = buf.getChannelData(0); let s = 0; for (let i = 0; i < d.length; i += 8) s += d[i] * d[i];
      level = Math.min(1, Math.sqrt(s / (d.length / 8)) * 6);
      try { recognizer.acceptWaveform(buf); } catch (err) { log?.(`acceptWaveform failed: ${err?.message || err}`); }
      status();
    };
    const src = ctx.createMediaStreamSource(stream);
    src.connect(node); node.connect(ctx.destination);   // a ScriptProcessor only runs when connected; it outputs silence
    if (ctx.state === "suspended") await ctx.resume();
    log?.(`listening on ${stream.getAudioTracks()[0]?.label || "microphone"} at ${ctx.sampleRate} Hz`);
    status(true);
  } catch (e) {
    onError?.(e);
  }
  return {
    stop() {
      stopped = true;
      try { node?.disconnect(); } catch { /* already gone */ }
      try { recognizer?.remove(); } catch { /* already gone */ }
      try { stream?.getTracks().forEach(t => t.stop()); } catch { /* already gone */ }
      try { ctx?.close(); } catch { /* already gone */ }
      onStatus?.({ level: 0, heard, listening: false });
    },
  };
}

// Spoken feedback through the headset. Short, and never queued behind itself.
export function speak(text, { rate = 1.15 } = {}) {
  try {
    if (!("speechSynthesis" in window) || !text) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(String(text));
    u.rate = rate; u.lang = "en-US";
    window.speechSynthesis.speak(u);
  } catch { /* no speech on this browser */ }
}
