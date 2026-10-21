// ── Voice commands ────────────────────────────────────────────────────────────
// The operator wears a headset and answers the result screens by voice. The
// recogniser is Vosk (Kaldi) running in a Web Worker in the browser, offline
// after a one-time ~40 MB model download, and it is given a GRAMMAR: it can
// only ever hear the command words below (plus "[unk]" for everything else),
// which is what makes it robust on a noisy floor with a boom microphone.
// Partial results stream as the operator speaks, so a word fires ~100–200 ms
// after it is said — nothing waits for end-of-sentence.
//
//   "scan"       take the picture (when no result screen is up) — same as the Scan key
//   "next"       select the highlighted option (green: confirm)
//   "again"      retry the scan (nothing recorded)
//
// Three commands only, on purpose: the fewer words the recogniser knows, the
// less there is to confuse, and everything else is a mouse click. Voice never
// moves the highlight, so what the operator sees highlighted is what "next"
// picks. A grammar entry may be a phrase ("not right").
//
// Misfire guards (createVoiceGate, pure, unit-tested):
//   a command must END what was said ("ok next" fires, "next door" does not)
//   cooldown after each fire; the same command cannot fire twice from one utterance

export const COMMAND_WORDS = {
  "scan": "scan",
  "next": "select",
  "again": "retry",
};
export const COMMAND_INFO = [
  { word: "scan",  action: "Take the picture (no screen up)" },
  { word: "next",  action: "Select the highlighted option" },
  { word: "again", action: "Retry the scan, nothing recorded" },
];
export const GRAMMAR = JSON.stringify([...Object.keys(COMMAND_WORDS), "[unk]"]);
const PHRASES = Object.keys(COMMAND_WORDS).map(p => ({ phrase: p, tokens: p.split(" "), cmd: COMMAND_WORDS[p] })).sort((a, b) => b.tokens.length - a.tokens.length);
export const MODEL_URL = "/models/vosk-model-small-en-us-0.15.tar.gz";

/**
 * Pure. Feed every partial and final transcript: hear(text, t, final) returns
 * the command that fires on this call, or null. Vosk partials grow across an
 * utterance ("not", "not right"); a command fires when the text ENDS with one
 * of the phrases and that phrase starts after the last fire in this
 * utterance, so "not right" fires once when its second word lands, and a
 * command buried inside a longer phrase is ignored.
 */
export function createVoiceGate({ cooldownMs = 700 } = {}) {
  let firedEnd = 0, lastFireAt = -Infinity, lastCmd = null;
  return {
    reset() { firedEnd = 0; },
    hear(text, t, final = false) {
      const tokens = String(text || "").trim().split(/\s+/).filter(Boolean);
      let fired = null;
      for (const p of PHRASES) {
        const n = p.tokens.length;
        if (tokens.length < n || tokens.length - n < firedEnd) continue;
        if (tokens.slice(-n).join(" ") !== p.phrase) continue;
        if (t - lastFireAt >= cooldownMs && !(p.cmd === lastCmd && t - lastFireAt < 1500)) { fired = p.cmd; lastFireAt = t; lastCmd = p.cmd; }
        firedEnd = tokens.length;                       // this phrase is spent either way
        break;
      }
      if (final) firedEnd = 0;
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
