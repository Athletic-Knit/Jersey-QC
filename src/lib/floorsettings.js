// A station's settings, in three layers (the admin panel, phase 4, 26 Nov 2026):
//   1. the app's own defaults (DEFAULT_SETTINGS in config.js),
//   2. the floor's defaults, set by a developer in the admin panel (no locks: the co-op,
//      "admins can make what is default for operators"),
//   3. what the operator changed on this station (Settings), which always wins.
// Only layer 3 is kept in this browser ("own"): a setting the operator never touched
// follows the floor's default when it changes. The camera and its rotation belong to the
// PC and are never taken from the floor.
export const PC_ONLY = ["rotation", "cameraId"];
export const OWN_KEY = "jerseyqc.settings.own.v1";

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// The app's defaults with the floor's on top: only settings the app knows, never the PC's own.
export function baseSettings(appDefaults, floor = {}) {
  const out = { ...appDefaults };
  for (const [k, v] of Object.entries(floor || {})) {
    if (k in appDefaults && !PC_ONLY.includes(k) && v !== undefined && v !== null && v !== "") out[k] = v;
  }
  return out;
}
// What the operator changed: every setting that is not what the base gives.
export function ownOf(settings, base) {
  return Object.fromEntries(Object.entries(settings || {}).filter(([k, v]) => !same(v, base[k])));
}
export const effectiveSettings = (base, own) => ({ ...base, ...(own || {}) });

// This browser's own settings. A station from before phase 4 has only the whole settings
// object (jerseyqc.settings.v3, `legacy`): what differs from the app's defaults is taken as
// its own, so nothing it set changes.
export function loadOwn(appDefaults, legacy, storage = globalThis.localStorage) {
  try { const v = storage?.getItem(OWN_KEY); if (v) { const o = JSON.parse(v); if (o && typeof o === "object") return o; } } catch { /* unreadable: from the old object */ }
  return legacy ? ownOf(legacy, appDefaults) : {};
}
export function saveOwn(own, storage = globalThis.localStorage) {
  try { storage?.setItem(OWN_KEY, JSON.stringify(own || {})); } catch { /* private window: this page only */ }
}
