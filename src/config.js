// ── Floor configuration ───────────────────────────────────────────────────────
import { DEFAULT_MODEL, DEFAULT_EFFORT, DEFAULT_THINKING } from "./lib/vision.js";

export const MODEL = import.meta.env.VITE_CLAUDE_MODEL || DEFAULT_MODEL;
// Effort (low | medium | high) and thinking ("off" | "adaptive") for the read.
// The measured trade-offs are in src/lib/vision.js next to the defaults.
export const EFFORT   = import.meta.env.VITE_CLAUDE_EFFORT   || DEFAULT_EFFORT;
export const THINKING = import.meta.env.VITE_CLAUDE_THINKING || DEFAULT_THINKING;
// Longest side of the frame sent to the model, in pixels. 800 reads as well as
// full resolution and answers ~0.6 s sooner than a 1280 px frame.
export const SEND_MAX_PX = Number(import.meta.env.VITE_SEND_MAX_PX) || 800;

// Shown on every green screen. Zero taps when the jersey is good.
export const CHECKLIST = ["name & number", "size tag", "logos", "seams", "spots & threads"];

// One tap on the "not right" menu. `route` is where the jersey goes; in Phase 1
// everything except "mark" shows the same red "Go to supervisor".
export const REASONS = [
  { id: "wrong_decoration", label: "Wrong name, number or team",  route: "Supervisor → pink slip → decoration" },
  { id: "logo",             label: "Missing or wrong logo",        route: "Supervisor → pink slip → decoration" },
  { id: "sublimation",      label: "Sublimation error",            route: "Supervisor → full remake" },
  { id: "stitching",        label: "Stitching or seam",            route: "Supervisor → stitcher" },
  { id: "cleaning",         label: "Cleaning not done",            route: "Supervisor → back to cleaning" },
  { id: "mark",             label: "Mark or dirt — clean it here", route: "Clean in place", inPlace: true },
  { id: "other",            label: "Something else — type it",     route: "Supervisor decides", custom: true },   // free text, for what the list does not cover
];

// What the order is made of. ECHL and ECHL replica jerseys have the names,
// numbers and crests stitched on as twill; sublimated jerseys have them
// printed into the fabric. What can go wrong differs, so the "not right" menu
// follows the type, and the type lands in every report row.
export const JERSEY_TYPES = [
  { id: "echl",         label: "ECHL",         construction: "stitched",   hint: "twill names, numbers and crests, fully stitched" },
  { id: "echl_replica", label: "ECHL replica", construction: "stitched",   hint: "stitched, replica spec" },
  { id: "sublimated",   label: "Sublimated",   construction: "sublimated", hint: "names, numbers and graphics printed into the fabric" },
];
export const jerseyTypeOf = id => JERSEY_TYPES.find(t => t.id === id) || null;
export const jerseyTypeLabel = id => jerseyTypeOf(id)?.label || "";

const R = Object.fromEntries(REASONS.map(r => [r.id, r]));
export const REASONS_BY_CONSTRUCTION = {
  stitched: [
    R.wrong_decoration,
    { id: "logo",       label: "Missing, wrong or crooked crest or logo", route: "Supervisor → pink slip → decoration" },
    { id: "twill",      label: "Twill lifting, peeling or torn",           route: "Supervisor → pink slip → decoration" },
    { id: "stitching",  label: "Loose, missing or broken stitching",      route: "Supervisor → stitcher" },
    { id: "seam",       label: "Seam, hem or construction",                route: "Supervisor → stitcher" },
    R.cleaning, R.mark, R.other,
  ],
  sublimated: [
    R.wrong_decoration,
    { id: "logo",       label: "Missing, wrong or misplaced logo",         route: "Supervisor → full remake" },
    { id: "print",      label: "Print error — ghosting, fading, misaligned", route: "Supervisor → full remake" },
    { id: "colour",     label: "Colour off, bleeding or streaked",         route: "Supervisor → full remake" },
    { id: "fabric",     label: "Fabric flaw, snag or hole",                route: "Supervisor → full remake" },
    { id: "seam",       label: "Seam, hem or construction",                route: "Supervisor → stitcher" },
    R.cleaning, R.mark, R.other,
  ],
};
// The "not right" menu for an order: by its type, or the general list when
// the type was not set.
export function reasonsFor(jerseyType) {
  const t = jerseyTypeOf(jerseyType);
  return t ? REASONS_BY_CONSTRUCTION[t.construction] : REASONS;
}

// Role gate. This is a convenience gate so a passer-by cannot use a station,
// NOT security: anything in the browser bundle can be read by anyone on the
// network. Real sign-in arrives with the roster server. Set PINs in .env.local:
//   VITE_PIN_INSPECTOR=…  VITE_PIN_PACKER=…  VITE_PIN_SUPERVISOR=…  VITE_PIN_ADMIN=…
// and VITE_PIN_REQUIRED=false to switch the gate off.
const env = import.meta.env;
export const ROLES = [
  { id: "inspector",  label: "Inspector",  pin: env.VITE_PIN_INSPECTOR  || "1111" },
  { id: "packer",     label: "Packer",     pin: env.VITE_PIN_PACKER     || "2222" },
  { id: "supervisor", label: "Supervisor", pin: env.VITE_PIN_SUPERVISOR || "3333" },
  { id: "admin",      label: "Admin",      pin: env.VITE_PIN_ADMIN      || "9999" },
];
export const PIN_REQUIRED = (env.VITE_PIN_REQUIRED ?? "true") !== "false";

export const DEFAULT_SETTINGS = {
  scanKey: "KeyB",        // take a picture (only when no screen is open)
  confirmKey: "Enter",    // select the highlighted option on any screen
  cancelKey: "KeyA",      // move to the next option (↓ ↑ also work)
  retryKey: "KeyR",       // retry the scan wherever it is offered; nothing is recorded
  byHandKey: "KeyW",      // open "Enter by hand" wherever it is offered (a failed read, a pick list)
  rotation: 180,          // 0 | 90 | 180 | 270 — how the camera is mounted
  cameraId: "",           // "" = browser default
  autoScan: true,         // hands-free: scan when the jersey changes and settles
};
