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
// The names offered at sign-in (a dropdown, plus "Other" for anyone else): VITE_OPERATORS="Shiv,Priya,Arshil".
export const OPERATORS = String(import.meta.env.VITE_OPERATORS || "Person 1,Person 2,Person 3").split(",").map(s => s.trim()).filter(Boolean);

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

// The scanning stations. An operator picks their station at sign-in and
// enters that station's PIN; the page then runs as ?station=station1 so the
// supervisor's board, the saved order and the hub all know it as "Station 1".
// Set PINs in .env.local: VITE_PIN_STATION1=…  VITE_PIN_STATION2=…  VITE_PIN_STATION3=…
export const STATIONS = [
  { id: "station1", label: "Station 1", pin: env.VITE_PIN_STATION1 || "1001" },
  { id: "station2", label: "Station 2", pin: env.VITE_PIN_STATION2 || "1002" },
  { id: "station3", label: "Station 3", pin: env.VITE_PIN_STATION3 || "1003" },
];
export const stationOf = id => STATIONS.find(s => s.id === id) || null;

export const DEFAULT_SETTINGS = {
  scanKey: "KeyB",        // take a picture (only when no screen is open)
  confirmKey: "Enter",    // select the highlighted option on any screen
  cancelKey: "KeyA",      // move the highlight down (↓ also works)
  upKey: "ArrowUp",       // move the highlight up (↑ also works)
  retryKey: "KeyR",       // retry the scan wherever it is offered; nothing is recorded
  byHandKey: "KeyW",      // open "Enter by hand" wherever it is offered (a failed read, a pick list)
  rotation: 180,          // 0 | 90 | 180 | 270 — how the camera is mounted
  cameraId: "",           // "" = browser default
  autoScan: true,         // hands-free: scan when the jersey changes and settles
  autoScanDelay: 3,       // seconds after a confirm before hands-free may scan again
  stickers: true,         // print a sticker (bin + team or size) on the server's label printer for every passed jersey
  flagTickets: true,      // print a flag ticket (2 x 1 in: where it goes and why) for every flagged jersey
};

// ── Where a flagged jersey goes, from the reason the operator picked ────────
// The board weighs flags by their route: a full remake outranks a stitch,
// which outranks a clean. Works from the reason's label alone, so flags
// recorded before any route was kept on the entry still get a tag, and a
// "— found after it passed" suffix does not change where it goes.
const ALL_REASONS = [...REASONS, ...REASONS_BY_CONSTRUCTION.stitched, ...REASONS_BY_CONSTRUCTION.sublimated];
export function routeOfReason(reason) {
  const label = String(reason || "").replace(/ — found after it passed$/, "").trim().toLowerCase();
  if (!label) return "Supervisor decides";
  const r = ALL_REASONS.find(x => x.label.toLowerCase() === label);
  if (r) return r.route;
  if (/not on the roster|duplicate/.test(label)) return "Supervisor → check the order";
  if (/could not read|entered by operator/.test(label)) return "Supervisor → sign off";
  return "Supervisor decides";
}
// The tag the board shows for a route, its colour, and its weight (higher first).
export const SEVERITY = [
  { tag: "REMAKE",      weight: 4, colour: "#ef4444", test: /full remake/i },
  { tag: "DECORATION",  weight: 3, colour: "#f97316", test: /decoration/i },
  { tag: "STITCHER",    weight: 3, colour: "#f97316", test: /stitcher/i },
  { tag: "CLEANING",    weight: 2, colour: "#eab308", test: /cleaning/i },
  { tag: "CHECK ORDER", weight: 2, colour: "#eab308", test: /check the order/i },
  { tag: "SIGN OFF",    weight: 1, colour: "#94a3b8", test: /sign off/i },
  { tag: "DECIDE",      weight: 1, colour: "#94a3b8", test: /decides/i },
];
export function severityOf(reason) {
  const route = routeOfReason(reason);
  const s = SEVERITY.find(x => x.test.test(route)) || SEVERITY[SEVERITY.length - 1];
  return { tag: s.tag, weight: s.weight, colour: s.colour, route };
}
