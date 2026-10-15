// ── Motion detection for hands-free scanning ──────────────────────────────────
// A tiny grayscale sample of the camera feed, compared frame to frame. After a
// confirm the app waits for the picture to CHANGE (jersey swapped) and then go
// STILL before it scans — so it never photographs an empty table or a hand.

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

// Mean absolute difference, 0–255.
export function frameDiff(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

/**
 * Drives the "changed, then settled" cycle. Call tick(frame) every ~200 ms.
 * Returns true exactly once, when it is time to scan.
 */
export function createMotionGate({ changeAt = 14, stillBelow = 4, stillTicks = 4, timeoutTicks = 100 } = {}) {
  let prev = null, moved = false, still = 0, ticks = 0, armed = false;
  return {
    arm()    { prev = null; moved = false; still = 0; ticks = 0; armed = true; },
    disarm() { armed = false; },
    get armed() { return armed; },
    tick(frame) {
      if (!armed || !frame) return false;
      ticks++;
      if (ticks > timeoutTicks) { armed = false; return false; }
      const d = prev ? frameDiff(prev, frame) : 0;
      prev = frame;
      if (!moved) { if (d >= changeAt) moved = true; return false; }
      if (d < stillBelow) still++; else still = 0;
      if (still >= stillTicks) { armed = false; return true; }
      return false;
    },
  };
}
