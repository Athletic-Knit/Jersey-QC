// A station's settings, in three layers (the admin panel, phase 4, 26 Nov 2026):
//   1. the app's own defaults (DEFAULT_SETTINGS in config.js),
//   2. the floor's defaults, set by a developer in the admin panel (no locks: the co-op,
//      "admins can make what is default for operators"),
//   3. what the operator changed on this station (Settings, the hands-free switch), which
//      always wins.
// Only layers 2 (as it was taken, `floorInUse`) and 3 (`own`) are kept in this browser.
// `own` holds exactly the settings the operator changed, and loses one only when the
// operator sets it back to what the base gives (Fable's review: recomputing it by
// difference forgot a choice whenever a floor default happened to equal it).
// The camera and its rotation belong to the PC and are never taken from the floor.
import { ON_SCREEN_KEYS, keysClash } from "./keydefaults.js";

export const PC_ONLY = ["rotation", "cameraId"];
export const OWN_KEY = "jerseyqc.settings.own.v1";
export const FLOOR_IN_USE_KEY = "jerseyqc.settings.floor.v1";

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// The app's defaults with the floor's on top: only settings the app knows, never the PC's own.
export function baseSettings(appDefaults, floor = {}) {
  const out = { ...appDefaults };
  for (const [k, v] of Object.entries(floor || {})) {
    if (has(appDefaults, k) && !PC_ONLY.includes(k) && v !== undefined && v !== null && v !== "") out[k] = v;
  }
  return out;
}
// What the operator changed: every setting that is not what the base gives. Used once, for
// a station from before phase 4; after that `own` is kept by recordOwn.
export function ownOf(settings, base) {
  return Object.fromEntries(Object.entries(settings || {}).filter(([k, v]) => !same(v, base[k])));
}
// One change by the operator, from `prev` to `next`: each setting that changed is theirs now,
// unless they set it back to what the base gives, which hands it back to the floor.
export function recordOwn(own, prev, next, base) {
  const out = { ...(own || {}) };
  for (const k of Object.keys(next || {})) {
    if (same(next[k], prev?.[k])) continue;
    if (same(next[k], base[k])) delete out[k]; else out[k] = next[k];
  }
  return out;
}
// The settings in use. Two on-screen keys may never be the same (Select would never fire):
// a key the floor gave that clashes goes back to the app's default; the operator's own stay.
export function effectiveSettings(base, own, appDefaults = null) {
  const out = { ...base, ...(own || {}) };
  if (appDefaults && keysClash(out)) for (const k of ON_SCREEN_KEYS) if (!has(own || {}, k)) out[k] = appDefaults[k];
  return out;
}

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
// The floor's defaults this station is using now. A reload starts from these, not from the
// newest ones fetched, so an order open across a reload keeps its settings (Fable's review,
// H2); the newest are taken once no order is open.
export function loadFloorInUse(storage = globalThis.localStorage) {
  try { const v = storage?.getItem(FLOOR_IN_USE_KEY); const o = v ? JSON.parse(v) : null; return o && typeof o === "object" ? o : null; } catch { return null; }
}
export function saveFloorInUse(floor, storage = globalThis.localStorage) {
  try { storage?.setItem(FLOOR_IN_USE_KEY, JSON.stringify(floor || {})); } catch { /* private window */ }
}
