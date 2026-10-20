// ── Session + settings persistence (localStorage) ─────────────────────────────
// A refresh, a crash or a closed tab must not cost an order's work.
// A station named in the URL (?station=line2) keeps its own saved session and
// sign-in, so several stations in one browser never resume each other's order.
// Settings stay per browser. Without ?station= nothing changes.
const suffix = (() => { try { const s = new URLSearchParams(window.location.search).get("station"); return s ? "." + s.replace(/[^\w-]/g, "").slice(0, 24) : ""; } catch { return ""; } })();
const SESSION_KEY  = "jerseyqc.session.v1" + suffix;
const SETTINGS_KEY = "jerseyqc.settings.v2";   // v2: Enter selects, R retries
const SIGNIN_KEY   = "jerseyqc.signin.v1" + suffix;

// localStorage can be full, blocked, or absent (private window); never let that throw.
const quiet = fn => { try { return fn(); } catch { return undefined; } };
// Flag photos (~40 KB each) live in the log. localStorage holds ~5 MB, so a
// long order keeps photos on the newest flagged entries only, and drops them
// all rather than lose the session.
const PHOTO_BUDGET = 3_500_000;
export function trimPhotos(log, keep = 20) {
  if (!Array.isArray(log)) return log;
  let seen = 0;
  return log.map(l => { if (!l?.photo) return l; seen++; return seen <= keep ? l : { ...l, photo: null }; });
}
export function saveSession(s)  {
  quiet(() => {
    let body = JSON.stringify({ ...s, savedAt: Date.now() });
    if (body.length > PHOTO_BUDGET && s.log) body = JSON.stringify({ ...s, log: trimPhotos(s.log, 20), savedAt: Date.now() });
    if (body.length > PHOTO_BUDGET && s.log) body = JSON.stringify({ ...s, log: trimPhotos(s.log, 0), savedAt: Date.now() });
    localStorage.setItem(SESSION_KEY, body);
  });
}
export function loadSession()   { return quiet(() => { const v = localStorage.getItem(SESSION_KEY); return v ? JSON.parse(v) : null; }) ?? null; }
export function clearSession()  { quiet(() => localStorage.removeItem(SESSION_KEY)); }
export function saveSettings(s) { quiet(() => localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))); }
export function loadSettings()  { return quiet(() => { const v = localStorage.getItem(SETTINGS_KEY); return v ? JSON.parse(v) : null; }) ?? null; }
// Who is signed in at this station outlives any one order.
export function saveSignIn(s)   { quiet(() => localStorage.setItem(SIGNIN_KEY, JSON.stringify(s))); }
export function loadSignIn()    { return quiet(() => { const v = localStorage.getItem(SIGNIN_KEY); return v ? JSON.parse(v) : null; }) ?? null; }
export function clearSignIn()   { quiet(() => localStorage.removeItem(SIGNIN_KEY)); }

// Shrink a data URL to a small thumbnail. The log keeps hundreds of these;
// full 1280×720 frames would hold 100 MB+ on a long order.
export function shrinkDataUrl(dataUrl, maxW = 160) {
  return new Promise(resolve => {
    if (!dataUrl) { resolve(null); return; }
    const img = new Image();
    img.onload = () => {
      try {
        const s = Math.min(1, maxW / img.width);
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.width * s)); c.height = Math.max(1, Math.round(img.height * s));
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", 0.7));
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

// Downscale an uploaded photo so a 12 MP phone picture fits the API limits.
// The photo kept for the supervisor when a jersey is flagged: the frame
// cropped to the jersey's box (fractions [l, t, r, b], a little padding),
// longest side at most maxSide. No box → the whole frame, downscaled.
export function cropDataUrl(dataUrl, box, maxSide = 640, quality = 0.75, pad = 0.04) {
  return new Promise(resolve => {
    if (!dataUrl) { resolve(null); return; }
    const img = new Image();
    img.onload = () => {
      try {
        const W = img.width, H = img.height;
        let [l, t, r, b] = box || [0, 0, 1, 1];
        l = Math.max(0, l - pad); t = Math.max(0, t - pad); r = Math.min(1, r + pad); b = Math.min(1, b + pad);
        const sx = Math.round(l * W), sy = Math.round(t * H), sw = Math.max(1, Math.round((r - l) * W)), sh = Math.max(1, Math.round((b - t) * H));
        const s = Math.min(1, maxSide / Math.max(sw, sh));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(sw * s)); c.height = Math.max(1, Math.round(sh * s));
        c.getContext("2d").drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", quality));
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

// The frame as sent to the model: longest side at most maxSide, as base64 JPEG.
export function frameForUpload(dataUrl, maxSide = 800, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, maxSide / Math.max(img.width, img.height));
      if (s === 1) { resolve(dataUrl.split(",")[1]); return; }
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL("image/jpeg", quality).split(",")[1]);
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

export function downscaleImage(img, maxW = 1280) {
  const s = Math.min(1, maxW / img.width);
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.92);
}
