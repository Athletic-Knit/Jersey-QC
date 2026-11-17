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
// One short menu for every order (17 Nov 2026, after the demo to the manager:
// the old menu showed near-twins side by side, "Missing or wrong logo" beside
// "Missing, wrong or crooked crest or logo", and its labels were sentences).
// A reason is two or three plain words. `only` keeps the two that belong to
// one way of making a jersey off the other's menu; `cat` is the defect
// category the reports count it under.
export const REASONS = [
  { id: "wrong_decoration", label: "Name or number",       route: "Supervisor → pink slip → decoration", cat: "Decoration" },
  { id: "logo",      label: "Logo or crest",     route: "Supervisor → pink slip → decoration", cat: "Decoration" },
  { id: "twill",     label: "Twill peeling",     route: "Supervisor → pink slip → decoration", cat: "Decoration", only: "stitched" },
  { id: "print",     label: "Sublimation error", route: "Supervisor → full remake",            cat: "Artwork",    only: "sublimated" },   // the floor's word for a print or colour fault (it read "Print or colour" for a day, 17 Nov 2026)
  { id: "stitching", label: "Stitching or seam", route: "Supervisor → stitcher",               cat: "Sewing" },
  { id: "fabric",    label: "Hole or snag",      route: "Supervisor → full remake",            cat: "Fabric" },
  { id: "label",     label: "Size label",        route: "Supervisor → stitcher",               cat: "Label" },
  { id: "mark",      label: "Dirt or mark",      route: "Clean in place", inPlace: true,       cat: "Cleaning" },   // cleaned at the station, not flagged: the "Clean it now" screen
  { id: "other",     label: "Others",            route: "Supervisor decides",                  cat: "Other" },      // flags at once, nothing to type (the owner, 17 Nov 2026; it was "Something else" with a text box)
];
// "Dirt or mark" is cleaned at the station. This is the flag when it will not come out.
export const MARK_STAYS = { id: "mark_stays", label: "Dirt that will not come out", route: "Supervisor → back to cleaning", cat: "Cleaning" };

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

export const REASONS_BY_CONSTRUCTION = {
  stitched:   REASONS.filter(r => !r.only || r.only === "stitched"),
  sublimated: REASONS.filter(r => !r.only || r.only === "sublimated"),
};
// The "not right" menu for an order: by its type (a stitched order is never
// offered "Sublimation error"). With no type set, the whole list: nothing is
// ruled out when nobody said what the order is made of.
export const ALL_REASONS_MENU = REASONS;
export function reasonsFor(jerseyType) {
  const t = jerseyTypeOf(jerseyType);
  return t ? REASONS_BY_CONSTRUCTION[t.construction] : ALL_REASONS_MENU;
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
  scanKey: "Enter",       // take a picture (only when no screen is open). Enter, the same as Select, so one pedal does both (the owner, 17 Nov 2026; it was B)
  confirmKey: "Enter",    // select the highlighted option on any screen
  cancelKey: "KeyA",      // move the highlight down (↓ also works)
  upKey: "ArrowUp",       // move the highlight up (↑ also works)
  retryKey: "KeyR",       // retry the scan wherever it is offered; nothing is recorded
  byHandKey: "KeyW",      // open "Enter by hand" wherever it is offered (a failed read, a pick list)
  rotation: 180,          // 0 | 90 | 180 | 270 — how the camera is mounted
  cameraId: "",           // "" = browser default
  autoScan: true,         // hands-free: scan when the jersey changes and settles
  autoScanDelay: 3,       // seconds after a confirm before hands-free may scan again
  stickers: false,        // print a sticker (bin + team or size) on the server's label printer for every passed jersey. Off unless a station turns it on (the owner, 17 Nov 2026)
  flagTickets: true,      // print a flag ticket (2 x 1 in: where it goes and why) for every flagged jersey
  binLists: true,         // print what is in a box (2 x 1 in: a count label, then fourteen jerseys a label) when it is closed: full, or the order finished
  boxWeights: false,      // estimate a bin's weight and warn near the cap. Off: the operator judges the weight until a scale is connected to the station
  boxWeightCap: 45,       // lb: no box heavier than this, when boxWeights is on (src/lib/boxmodel.js)
  trialMethod: "",        // input trial: "" | "mouse" | "keys" — which setup this station is timing (src/lib/trial.js)
};

// ── Where a flagged jersey goes, from the reason the operator picked ────────
// The board weighs flags by their route: a full remake outranks a stitch,
// which outranks a clean. Works from the reason's label alone, so flags
// recorded before any route was kept on the entry still get a tag, and a
// "— found after it passed" suffix does not change where it goes.
// The wordings used before 17 Nov 2026, so that a flag recorded then still
// has its route and its category on the board and in the reports.
const OLD_REASONS = [
  ["Wrong name, number or team", "Supervisor → pink slip → decoration", "Decoration"],
  ["Missing or wrong logo", "Supervisor → pink slip → decoration", "Decoration"],
  ["Missing, wrong or crooked crest or logo", "Supervisor → pink slip → decoration", "Decoration"],
  ["Twill lifting, peeling or torn", "Supervisor → pink slip → decoration", "Decoration"],
  ["Sublimation error", "Supervisor → full remake", "Artwork"],
  ["Missing, wrong or misplaced logo", "Supervisor → full remake", "Artwork"],
  ["Print error — ghosting, fading, misaligned", "Supervisor → full remake", "Artwork"],
  ["Colour off, bleeding or streaked", "Supervisor → full remake", "Artwork"],
  ["Fabric flaw, snag or hole", "Supervisor → full remake", "Fabric"],
  ["Loose, missing or broken stitching", "Supervisor → stitcher", "Sewing"],
  ["Seam, hem or construction", "Supervisor → stitcher", "Sewing"],
  ["Wrong or missing size label", "Supervisor → stitcher", "Label"],
  ["Cleaning not done", "Supervisor → back to cleaning", "Cleaning"],
  ["Mark or dirt — clean it here", "Clean in place", "Cleaning"],
  ["Something else — type it", "Supervisor decides", "Other"],
  ["Print or colour", "Supervisor → full remake", "Artwork"],     // the sublimated menu's wording for one day, 17 Nov 2026
  ["Something else", "Supervisor decides", "Other"],              // the last item of the menu that day, with a text box
].map(([label, route, cat]) => ({ label, route, cat }));
const ALL_REASONS = [...REASONS, MARK_STAYS, ...OLD_REASONS];
// The defect category of a flag, from its reason's label, for the reports'
// breakdown. A reason typed by the operator is "Other"; a jersey that is not
// on the roster, or a duplicate, is an order problem, not a defect.
export const DEFECT_CATEGORIES = ["Decoration", "Artwork", "Sewing", "Label", "Fabric", "Cleaning", "Order", "Other"];
export function reasonCategory(reason) {
  const label = String(reason || "").replace(/ — found after it passed$/, "").trim().toLowerCase();
  const r = ALL_REASONS.find(x => x.label.toLowerCase() === label);
  if (r) return r.cat || "Other";
  if (/not on the roster|duplicate/.test(label)) return "Order";
  return "Other";
}
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
