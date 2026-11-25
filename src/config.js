// ── Floor configuration ───────────────────────────────────────────────────────
import { DEFAULT_MODEL, DEFAULT_EFFORT, DEFAULT_THINKING } from "./lib/vision.js";
import { DEFAULT_GARMENT, GARMENTS, GARMENT_IDS } from "./lib/garments.js";

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
// Shown on every green screen, and each one is ticked off by the operator before
// Confirm works (the owner, 20 Nov 2026). Inspect fully ticks all six; a quick
// look ticks the first three (`quick`) and is reminded of the other three.
export const CHECKS = [
  { id: "namenum", label: "Name & Number", quick: true },
  { id: "size",    label: "Size tag",      quick: true },
  { id: "logos",   label: "Logos",         quick: true },
  { id: "fabric",  label: "Fabric damage" },
  { id: "holes",   label: "Holes" },
  { id: "thread",  label: "Thread damage" },
];
export const CHECKLIST = CHECKS.map(c => c.label);   // the words alone, for anything that only lists them
// A flag for one of these reasons does not restart Inspect fully: the next
// INSPECT_FULL jerseys stay on a quick look and tick the related check as well
// (the owner, 20 Nov 2026). Any other flag restarts Inspect fully.
export const REASON_CHECK = { mark: "fabric", mark_stays: "fabric", fabric: "holes", twill: "thread", stitching: "thread" };

// One tap on the "not right" menu. `route` is where the jersey goes (the board
// weighs it, routeOfReason); every reason but "mark" flags the jersey (the
// FLAGGED screen), and "mark" opens the Clean it now screen.
// One short menu for every order (17 Nov 2026, after the demo to the manager:
// the old menu showed near-twins side by side, "Missing or wrong logo" beside
// "Missing, wrong or crooked crest or logo", and its labels were sentences).
// A reason is two or three plain words. `where: true` marks a physical
// defect: after it is picked the station asks where on the garment the damage
// is (the owner, 23 Nov 2026; not for No size tag, Duplicate, Not on the
// roster or Others). `only` keeps the two that belong to
// one way of making a jersey off the other's menu; `cat` is the defect
// category the reports count it under.
export const REASONS = [
  { id: "wrong_decoration", label: "Name or number",       route: "Supervisor → pink slip → decoration", cat: "Decoration", where: true },
  { id: "logo",      label: "Logo or crest",     route: "Supervisor → pink slip → decoration", cat: "Decoration", where: true },
  { id: "twill",     label: "Twill peeling",     route: "Supervisor → pink slip → decoration", cat: "Decoration", where: true, only: "stitched" },
  { id: "print",     label: "Sublimation error", route: "Supervisor → full remake",            cat: "Artwork",    where: true, only: "sublimated" },   // the floor's word for a print or colour fault (it read "Print or colour" for a day, 17 Nov 2026)
  { id: "stitching", label: "Stitching or seam", route: "Supervisor → stitcher",               cat: "Sewing", where: true },
  { id: "fabric",    label: "Holes",             route: "Supervisor → full remake",            cat: "Fabric", where: true },
  { id: "label",     label: "Size label",        route: "Supervisor → stitcher",               cat: "Label" },
  { id: "mark",      label: "Dirt or mark",      route: "Clean in place", inPlace: true,       cat: "Cleaning" },   // cleaned at the station, not flagged: the "Clean it now" screen
  { id: "other",     label: "Others",            route: "Supervisor decides",                  cat: "Other" },      // flags at once, nothing to type (the owner, 17 Nov 2026; it was "Something else" with a text box)
];
// "Dirt or mark" is cleaned at the station. This is the flag when it will not come out.
export const MARK_STAYS = { id: "mark_stays", label: "Dirt that will not come out", route: "Supervisor → back to cleaning", cat: "Cleaning", where: true };
// A jersey with no size tag, flagged from the pick list (the owner, 19 Nov
// 2026): with no size to read there is no row to pick, so it is flagged as it
// is — the number read, no row — and goes to the stitcher for a tag.
export const NO_SIZE_TAG = { id: "no_size_tag", label: "No size tag", route: "Supervisor → stitcher", cat: "Label" };

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

// What the order's garments are, for the outline on the "where is the damage"
// step and on the flag ticket: the ids and labels straight from
// src/lib/garments.js, which holds the shapes. Hockey by default: the most common order (the owner,
// 24 Nov 2026). A row whose `style` the catalogue table knows uses its own kind.
export const GARMENT_MENU = GARMENT_IDS.map(id => ({ id, label: GARMENTS[id].label }));
export const DEFAULT_ORDER_GARMENT = DEFAULT_GARMENT;

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
  // A sorter only sorts (the owner, 19 Nov 2026): no cleaning, no inspection. Signs in at a
  // station with the station's PIN, like an inspector; no quick look, no full inspection, no
  // double-check, no damage photo, and the only flags are No size tag, Duplicate and Not on the roster.
  { id: "sorter",     label: "Sorter",     pin: env.VITE_PIN_SORTER     || "4444" },
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
  // Which roll each kind of label prints on (Settings → Label printer; the owner, 25 Nov 2026: 2 x 4 for all by default).
  // The station sends it with every print; the hub lays the label out for that roll and sends a 1 x 0.5 one to the
  // station's sticker printer, the others to its ticket printer (JERSEY_FLAG_PRINTER…, else the sticker printer).
  stickerRoll: "2x4",     // stickers on passed jerseys
  flagRoll: "2x4",        // flag tickets
  boxRoll: "2x4",         // box labels, box lists, count labels, the DAMAGED list
  boxWeights: false,      // estimate a bin's weight and warn near the cap. Off: the operator judges the weight until a scale is connected to the station
  boxWeightCap: 45,       // lb: no box heavier than this, when boxWeights is on (src/lib/boxmodel.js)
  listSort: "size",       // the pick list's order: "size" | "team" | "number" (LIST_SORTS in roster.js; the owner, 19 Nov 2026: by size, the tag is all the operator checks)
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
  ["Hole or snag", "Supervisor → full remake", "Fabric"],         // renamed "Holes" 20 Nov 2026
].map(([label, route, cat]) => ({ label, route, cat }));
const ALL_REASONS = [...REASONS, MARK_STAYS, NO_SIZE_TAG, ...OLD_REASONS];
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

// The label rolls a station can choose in Settings → Label printer (the owner, 25 Nov 2026).
// The hub accepts the same four (LABEL_ROLLS in hub-plugin.js).
export const LABEL_ROLLS = [
  { id: "2x4",   label: "2 × 4 in" },
  { id: "2x3",   label: "2 × 3 in" },
  { id: "2x1",   label: "2 × 1 in" },
  { id: "1x0.5", label: "1 × ½ in" },
];
