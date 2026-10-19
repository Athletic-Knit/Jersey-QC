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
export function saveSession(s)  { quiet(() => localStorage.setItem(SESSION_KEY, JSON.stringify({ ...s, savedAt: Date.now() }))); }
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
export function downscaleImage(img, maxW = 1280) {
  const s = Math.min(1, maxW / img.width);
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.92);
}
