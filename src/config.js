// ── Floor configuration ───────────────────────────────────────────────────────
import { DEFAULT_MODEL } from "./lib/vision.js";

export const MODEL = import.meta.env.VITE_CLAUDE_MODEL || DEFAULT_MODEL;

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
];

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
  rotation: 180,          // 0 | 90 | 180 | 270 — how the camera is mounted
  cameraId: "",           // "" = browser default
  autoScan: true,         // hands-free: scan when the jersey changes and settles
};
