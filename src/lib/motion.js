// ── Motion detection for hands-free scanning ──────────────────────────────────
// A tiny grayscale sample of the camera feed, compared frame to frame. After a
// confirm the gate waits for the old jersey to go, then for something with
// TEXTURE (fabric, a printed number) to sit still — an empty table is flat and
// never triggers a scan, no matter how still it is.

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

// Mean absolute difference between neighbouring pixels: a bare table is near 0,
// a jersey with a number is well above it.
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
 *   lift     wait for the picture to change at all (old jersey picked up)
 *   settle1  first stillness: flat → it's the table, go to `place`;
 *            textured → probably the next jersey, give the hand a moment (`window`)
 *   place    empty table: wait for something to be put down
 *   settle2  stillness after the placement: textured → scan; flat → back to `place`
 * Thresholds are the floor's to tune: `minTexture` decides table vs jersey.
 */
// Measured on a 32×18 sample: identical frame 0.0, same jersey with one digit changed 3.7,
// the jersey nudged 18 px 8.5, a different player 12.4, a hand over the jersey 29.6, the bare table 60.
// So: `sameBelow` sits under the one-digit change, `changeAt` between a nudge and a swap.
export function createMotionGate({ changeAt = 10, stillBelow = 4, sameBelow = 2.5, stillTicks = 3, minTexture = 5, placeWindowTicks = 6, timeoutTicks = 150, width = 32, height = 18, log } = {}) {
  let armed = false, phase = "idle", prev = null, ref = null, still = 0, ticks = 0, windowLeft = 0, drifted = false;
  const reset = () => { prev = null; ref = null; still = 0; ticks = 0; windowLeft = 0; drifted = false; phase = "lift"; };
  const fire  = () => { armed = false; phase = "idle"; return true; };
  return {
    // `refFrame` is the frame that was just scanned: anything that still looks
    // like it (the same jersey after the hand pulls back) is not a new jersey.
    arm(refFrame = null) { reset(); ref = refFrame || null; prev = refFrame || null; armed = true; },
    disarm() { armed = false; phase = "idle"; },
    get armed() { return armed; },
    get phase() { return phase; },
    tick(frame) {
      if (!armed || !frame) return false;
      if (++ticks > timeoutTicks) { armed = false; phase = "idle"; log?.("timed out"); return false; }
      if (!ref) { ref = frame; prev = frame; return false; }          // the old jersey, before anything moves
      const d = frameDiff(prev, frame);
      prev = frame;
      const isStill = () => { still = d < stillBelow ? still + 1 : 0; return still >= stillTicks; };

      if (phase === "lift") {
        if (d >= changeAt) { phase = "settle1"; still = 0; drifted = false; return false; }
        // The jersey was nudged (a small move) and came to rest: that resting
        // position is the new "same picture", or the next hand-wave would read
        // as a different jersey.
        if (d >= stillBelow) { drifted = true; still = 0; return false; }
        if (drifted && ++still >= stillTicks) { ref = frame; drifted = false; still = 0; log?.("nudged — new baseline"); }
        return false;
      }
      if (phase === "settle1") {
        if (!isStill()) return false;
        // Only an essentially identical picture (the hand pulled back, nothing moved)
        // is "the same jersey": same-team jerseys differ by a few digits, and that
        // must count as new.
        if (frameDiff(ref, frame) < sameBelow) { log?.("same picture as the last scan — waiting"); phase = "lift"; still = 0; return false; }
        const t = texture(frame, width, height);
        log?.(`settled, texture ${t.toFixed(1)}`);
        if (t < minTexture) { phase = "place"; still = 0; return false; }
        phase = "window"; windowLeft = placeWindowTicks; still = 0;
        return false;
      }
      if (phase === "window") {
        if (d >= changeAt) { phase = "settle2"; still = 0; return false; }
        if (--windowLeft <= 0) { log?.("scan (fast swap)"); return fire(); }
        return false;
      }
      if (phase === "place") {
        if (d >= changeAt) { phase = "settle2"; still = 0; }
        return false;
      }
      if (phase === "settle2") {
        if (!isStill()) return false;
        const t = texture(frame, width, height);
        log?.(`placed, texture ${t.toFixed(1)}`);
        if (t < minTexture) { phase = "place"; still = 0; return false; }
        log?.("scan");
        return fire();
      }
      return false;
    },
  };
}
