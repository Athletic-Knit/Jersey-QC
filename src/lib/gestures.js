// ── Hand-gesture commands ─────────────────────────────────────────────────────
// The jersey camera doubles as the input device on the RESULT screens: after a
// scan, the operator answers the green/yellow/red screen with a gesture, and
// the app fires the SAME configured key the pedal or keyboard would, so every
// existing handler stays untouched.
//
//   Thumbs up 👍   → Select         Thumbs down 👎  → Next option
//   Victory ✌️     → Retry scan     Pointing up ☝️  → Enter by hand
//
// Scanning itself is never a gesture: the hands-free gate (motion.js) scans
// when a jersey is placed and still, or the operator presses the scan key.
// While no result screen is up the recogniser is OFF, so hands placing and
// removing jerseys can never be read as a command.
//
// Recognition is Google MediaPipe's GestureRecognizer, run in the browser
// (WASM, GPU when available). The model and WASM come from a CDN once, then the
// browser caches them. Nothing leaves the machine.
//
// Misfire guards (createGestureGate, pure, unit-tested):
//   arm       when a result screen opens, the hand must first be OUT of the
//             picture for `absentMs` — a hand still pulling back from the
//             jersey cannot answer the screen it just caused
//   hold      the same gesture must be seen steadily for `holdMs` before it fires
//   cooldown  after a fire nothing can fire for `cooldownMs`
//   release   the hand must drop the gesture (or leave) before the SAME gesture
//             can fire again — a thumb held up for ten seconds is one Select

export const GESTURE_TO_SETTING = {
  Thumb_Up:    "confirmKey",
  Thumb_Down:  "cancelKey",
  Victory:     "retryKey",
  Pointing_Up: "byHandKey",
};

export const GESTURE_INFO = [
  { gesture: "Thumb_Up",    icon: "👍", name: "Thumbs up",   setting: "confirmKey", action: "Select" },
  { gesture: "Thumb_Down",  icon: "👎", name: "Thumbs down", setting: "cancelKey",  action: "Next option" },
  { gesture: "Victory",     icon: "✌️", name: "Victory",     setting: "retryKey",   action: "Retry scan" },
  { gesture: "Pointing_Up", icon: "☝️", name: "Pointing up", setting: "byHandKey",  action: "Enter by hand" },
];

export const gestureInfo = g => GESTURE_INFO.find(i => i.gesture === g) || null;

/**
 * Pure state machine. Call tick({ gesture, score, hand, t }) for every
 * recognised frame — `gesture` is MediaPipe's categoryName ("None" or null =
 * no usable gesture), `hand` whether any hand is in the picture, `t` ms.
 * Returns a status object; `fired` is set on exactly the tick that fires.
 *
 *   phase:    arming | idle | holding | cooldown
 *   gesture:  the gesture being held / just fired
 *   progress: 0–1 hold progress while holding
 *   fired:    the gesture that fired on this tick, or null
 */
export function createGestureGate({ holdMs = 600, cooldownMs = 1500, absentMs = 300, minScore = 0.7 } = {}) {
  let phase = "arming", held = null, since = 0, cooldownUntil = 0, mustRelease = null, lastGesture = null, absentSince = 0;

  const status = (fired = null, progress = 0) => ({ phase, gesture: held || lastGesture, progress, fired });
  const fire = t => {
    const g = held;
    lastGesture = g; mustRelease = g; held = null;
    phase = "cooldown"; cooldownUntil = t + cooldownMs;
    return { phase, gesture: g, progress: 1, fired: g };
  };

  return {
    get phase() { return phase; },
    reset() { phase = "arming"; held = null; since = 0; cooldownUntil = 0; mustRelease = null; lastGesture = null; absentSince = 0; },
    tick({ gesture, score = 0, hand = !!gesture, t }) {
      const g = gesture && gesture !== "None" && score >= minScore && GESTURE_TO_SETTING[gesture] ? gesture : null;

      if (phase === "arming") {
        if (hand) { absentSince = 0; return status(null, 0); }
        if (!absentSince) absentSince = t;
        if (t - absentSince < absentMs) return status(null, 0);
        phase = "idle";
      }

      // The same gesture cannot fire twice in a row until it was let go.
      if (mustRelease && g !== mustRelease) mustRelease = null;

      if (phase === "cooldown") {
        if (t < cooldownUntil) return status(null, 0);
        phase = "idle";
      }

      if (!g || g === mustRelease) { phase = "idle"; held = null; return status(null, 0); }

      if (held !== g) { held = g; since = t; phase = "holding"; return status(null, 0); }
      const progress = Math.min(1, (t - since) / holdMs);
      if (progress < 1) return status(null, progress);
      return fire(t);
    },
  };
}

// ── MediaPipe runner ──────────────────────────────────────────────────────────
const MP_VERSION = "1.1.1";
const WASM_URL   = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
const MODEL_URL  = "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task";

let recognizerPromise = null;

async function loadRecognizer(log) {
  if (recognizerPromise) return recognizerPromise;
  recognizerPromise = (async () => {
    const { FilesetResolver, GestureRecognizer } = await import("@mediapipe/tasks-vision");
    const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
    const make = delegate => GestureRecognizer.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: "VIDEO",
      numHands: 1,
      minHandDetectionConfidence: 0.6,
      minHandPresenceConfidence: 0.6,
      minTrackingConfidence: 0.6,
    });
    try { const r = await make("GPU"); log?.("recognizer ready (GPU)"); return r; }
    catch (e) { log?.(`GPU delegate failed (${e?.message || e}) — using CPU`); const r = await make("CPU"); log?.("recognizer ready (CPU)"); return r; }
  })();
  recognizerPromise.catch(() => { recognizerPromise = null; });   // let a later start retry after a network failure
  return recognizerPromise;
}

/**
 * Watch `video` and call onStatus({ phase, gesture, progress, fired, fps, hand })
 * every frame; `fired` is the gesture that just fired. `isBusy()` true pauses
 * recognition (a scan in flight). `rotation()` is the camera mount rotation in
 * degrees clockwise, so an upside-down mount still reads thumbs up as up.
 * Returns { stop, simulate }. Loading errors arrive through onError.
 * The loop is a timer, not requestAnimationFrame: a browser throttles rAF
 * when it thinks the page is not visible, and `intervalMs` caps the CPU
 * spent on recognition on a weak station PC (40 ms = at most 25 fps).
 */
export function startGestures({ video, rotation = () => 0, isBusy = () => false, onStatus, onError, log, intervalMs = 40, ...gateOpts }) {
  const gate = createGestureGate(gateOpts);
  let stopped = false, timer = 0, lastTs = -1, frames = 0, fpsAt = 0, fps = 0, lastVideoTime = -1;

  loadRecognizer(log).then(rec => {
    if (stopped) return;
    const loop = () => {
      if (stopped) return;
      timer = setTimeout(loop, intervalMs);
      if (!video || !video.videoWidth || video.readyState < 2 || isBusy()) return;
      if (video.currentTime === lastVideoTime) return;       // no new frame yet
      lastVideoTime = video.currentTime;
      const now = performance.now();
      const ts = Math.max(now, lastTs + 1); lastTs = ts;       // MediaPipe wants strictly increasing timestamps
      let res;
      try { res = rec.recognizeForVideo(video, ts, { rotationDegrees: Number(rotation()) || 0 }); }
      catch (e) { log?.(`recognize failed: ${e?.message || e}`); return; }
      const hand = (res.landmarks?.length || 0) > 0;
      const top = res.gestures?.[0]?.[0];
      const st = gate.tick({ gesture: top?.categoryName || null, score: top?.score || 0, hand, t: now });
      frames++;
      if (now - fpsAt >= 1000) { fps = frames; frames = 0; fpsAt = now; }
      onStatus?.({ ...st, fps, hand, raw: top?.categoryName || null });
    };
    loop();
  }).catch(e => { if (!stopped) onError?.(e); });

  return {
    stop() { stopped = true; clearTimeout(timer); },
    reset() { gate.reset(); },
    // Test/demo hook: behave as if `gesture` had just fired (bypasses the camera and the gate).
    simulate(gesture) { if (!stopped && GESTURE_TO_SETTING[gesture]) onStatus?.({ phase: "cooldown", gesture, progress: 1, fired: gesture, fps, hand: true, raw: gesture }); },
  };
}
