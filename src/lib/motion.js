// ── Motion detection for hands-free scanning ──────────────────────────────────
// A tiny grayscale sample of the camera feed, compared frame to frame. After a
// confirm the gate waits for the picture to change (the old jersey goes), then
// for it to sit still. A still picture that is not the jersey just scanned and
// not the empty table is the next jersey, so it scans. That covers both ways
// the floor works: one jersey placed at a time (lift → empty table → place →
// scan) and a stack lifted jersey by jersey (lift → the next one is already
// there → scan).
//
// What the empty table looks like is LEARNED, not guessed: a bare table with a
// mat, a bag or a cable on it has as much texture as a jersey, so texture alone
// cannot tell them apart. The first time the gate scans an empty table the
// model answers "no jersey", the app hands that frame back with learnTable(),
// and from then on the gate waits through anything that looks like it without
// calling the model. A near-featureless picture is taken as the table without
// asking.

export function sampleFrame(video, canvas, w = 32, h = 18) {
  if (!video || !video.videoWidth) return null;
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(video, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const gray = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) gray[j] = (data[i] * 77 + data[i + 1] * 151 + data[i + 2] * 28) >> 8;
  return gray;
}

// Mean absolute difference between two frames, 0–255.
export function frameDiff(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

// Mean absolute difference between neighbouring pixels: a plain surface is near
// 0, a jersey with a number is well above it.
export function texture(gray, w = 32, h = 18) {
  if (!gray) return 0;
  let sum = 0, n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w - 1; x++) { sum += Math.abs(gray[y * w + x] - gray[y * w + x + 1]); n++; }
  for (let y = 0; y < h - 1; y++) for (let x = 0; x < w; x++) { sum += Math.abs(gray[y * w + x] - gray[(y + 1) * w + x]); n++; }
  return n ? sum / n : 0;
}

/**
 * Call tick(frame) every ~200 ms while armed. Returns true exactly once, when
 * it is time to scan. Phases:
 *   lift    wait for the picture to change at all (old jersey picked up)
 *   settle  wait for stillness, then decide what is there:
 *             the jersey just scanned (hand pulled back)  → lift
 *             the learned table, or a featureless picture → place
 *             anything else                               → scan
 *   place   empty table: wait for something to be put down, then settle
 * The gate keeps the learned table across arms; learnTable() sets it.
 */
// Measured on a 32×18 sample: identical frame 0.0, same jersey with one digit changed 3.7,
// the jersey nudged 18 px 8.5, a different player 12.4, a hand over the jersey 29.6, a jersey vs the bare table 60.
// So: `sameBelow` sits under the one-digit change, `changeAt` between a nudge and a swap,
// `tableBelow` allows for sensor noise and a shadow on an otherwise unchanged table.
export function createMotionGate({ changeAt = 10, stillBelow = 4, sameBelow = 2.5, tableBelow = 4, stillTicks = 4, minTexture = 2, timeoutTicks = 300, width = 32, height = 18, log } = {}) {
  let armed = false, phase = "idle", prev = null, ref = null, table = null, still = 0, ticks = 0, drifted = false;
  const reset = () => { prev = null; ref = null; still = 0; ticks = 0; drifted = false; phase = "lift"; };
  const fire  = () => { armed = false; phase = "idle"; return true; };
  return {
    // `refFrame` is the frame that was just scanned: anything that still looks
    // like it (the same jersey after the hand pulls back) is not a new jersey.
    arm(refFrame = null) { reset(); ref = refFrame || null; prev = refFrame || null; armed = true; },
    disarm() { armed = false; phase = "idle"; },
    // What the empty table looks like, from a scan the model answered "no jersey".
    learnTable(frame) { if (frame) { table = frame; log?.("learned the empty table"); } },
    forgetTable() { table = null; },
    get armed() { return armed; },
    get phase() { return phase; },
    get hasTable() { return !!table; },
    tick(frame) {
      if (!armed || !frame) return false;
      if (++ticks > timeoutTicks) { armed = false; phase = "idle"; log?.("timed out"); return false; }
      if (!ref) { ref = frame; prev = frame; return false; }          // the old jersey, before anything moves
      const d = frameDiff(prev, frame);
      prev = frame;
      const isStill = () => { still = d < stillBelow ? still + 1 : 0; return still >= stillTicks; };

      if (phase === "lift") {
        if (d >= changeAt) { phase = "settle"; still = 0; drifted = false; return false; }
        // The jersey was nudged (a small move) and came to rest: that resting
        // position is the new "same picture", or the next hand-wave would read
        // as a different jersey.
        if (d >= stillBelow) { drifted = true; still = 0; return false; }
        if (drifted && ++still >= stillTicks) { ref = frame; drifted = false; still = 0; log?.("nudged — new baseline"); }
        return false;
      }
      if (phase === "settle") {
        if (!isStill()) return false;
        // Only an essentially identical picture (the hand pulled back, nothing moved)
        // is "the same jersey": same-team jerseys differ by a few digits, and that
        // must count as new.
        if (frameDiff(ref, frame) < sameBelow) { log?.("same picture as the last scan — waiting"); phase = "lift"; still = 0; return false; }
        if (table && frameDiff(table, frame) < tableBelow) { log?.("empty table — waiting for a jersey"); phase = "place"; still = 0; return false; }
        const t = texture(frame, width, height);
        if (t < minTexture) { if (!table) table = frame; log?.(`featureless (texture ${t.toFixed(1)}) — waiting for a jersey`); phase = "place"; still = 0; return false; }
        log?.(`settled, texture ${t.toFixed(1)} — scan`);
        return fire();
      }
      if (phase === "place") {
        if (d >= changeAt) { phase = "settle"; still = 0; }
        return false;
      }
      return false;
    },
  };
}
