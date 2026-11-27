// ── Floor configuration ───────────────────────────────────────────────────────
import { KEY_DEFAULTS } from "./lib/keydefaults.js";
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

// Shown on every green screen. On Inspect fully (the first 5 jerseys of an
// order, the 5 after a flag with no related check, a spot check) every one is
// ticked off by the operator before Confirm works (the owner, 20 Nov 2026).
// On a quick look nothing is ticked (the owner, 23 Nov 2026: "just mentioning
// them is fine"): the two `quick` checks, Decoration and Size tag, the common
// faults, are shown big as what to look at, the others small, and Confirm is
// one press; only a check a flag added (REASON_CHECK) must be ticked, for the
// next 5 jerseys. "Decoration" is one check for the name, the number, the
// logos and the crest (it was two, "Name & Number" and "Logos", until 23 Nov 2026).
// `reasons`: the flag reasons that ask for the check on the next garments (REASON_CHECK below).
// The admin panel's Floor rules can replace the whole list (src/lib/checks.js, the co-op, 27 Nov 2026).
export const CHECKS = [
  { id: "decoration", label: "Decoration",    quick: true, reasons: ["wrong_decoration", "logo", "print"] },   // the name, the number, a logo or crest, sublimated graphics
  { id: "size",       label: "Size tag",      quick: true, reasons: ["label", "no_size_tag"] },
  { id: "fabric",     label: "Fabric damage",              reasons: ["mark", "mark_stays"] },
  { id: "holes",      label: "Holes",                      reasons: ["fabric"] },
  { id: "thread",     label: "Thread damage",              reasons: ["twill", "stitching", "loose_thread", "thread_stays"] },
];
export const CHECKLIST = CHECKS.map(c => c.label);   // the words alone, for anything that only lists them
// The check a flag adds: the next INSPECT_FULL jerseys stay on a quick look
// and that check must be ticked on each of them (the owner, 20 Nov 2026 for
// the damage reasons; 23 Nov 2026 for every reason: "when we flag something it
// should ask for that flag to be checked off for the next 5 jerseys"). A
// reason with no check here (Others, a typed reason) restarts Inspect fully.
export const REASON_CHECK = Object.fromEntries(CHECKS.flatMap(c => c.reasons.map(r => [r, c.id])));

// The resolution of the flag written when dirt or a loose thread is dealt with at the
// station: still a flag, resolved at once (the owner, 25 Nov 2026).
export const FIXED_AT_STATION = "Fixed at the station";
// "Dirt or mark" is cleaned at the station. This is the flag when it will not come out.
// Both "stays" flags are physical defects, so they are asked where (`where: true`).
export const MARK_STAYS = { id: "mark_stays", label: "Dirt that will not come out", route: "Supervisor → back to cleaning", cat: "Cleaning", where: true };
// "Loose thread" is cut at the station. This is the flag when it needs the stitcher.
export const THREAD_STAYS = { id: "thread_stays", label: "Loose thread — to the stitcher", route: "Supervisor → stitcher", cat: "Sewing", where: true };

// One tap on the "not right" menu. `route` is where the jersey goes (the board
// weighs it, routeOfReason); every reason flags the jersey (the FLAGGED
// screen) but the two fixed at the station, which carry their screen in
// `inPlace` (the owner, 25 Nov 2026; Dirt or mark alone before): its emoji,
// title and words ("It stays passed; the record keeps the flag." is added on the screen), the
// two buttons, the note left on the green, and `stays`, the flag when the fix
// does not work.
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
  { id: "loose_thread", label: "Loose thread",   route: "Fix in place", cat: "Sewing",          // cut at the station, a flag resolved at once: the "Cut it now" screen (the owner, 25 Nov 2026); not asked where (fixed in place), its `stays` flag is
    inPlace: { emoji: "✂️", title: "CUT IT NOW", text: "Cut the loose thread off.", done: "✓ It is cut now", fail: "🚩 It needs the stitcher", note: "Loose thread, cut at the station", stays: THREAD_STAYS } },
  { id: "fabric",    label: "Holes",             route: "Supervisor → full remake",            cat: "Fabric", where: true },
  { id: "label",     label: "Size label",        route: "Supervisor → stitcher",               cat: "Label" },
  { id: "mark",      label: "Dirt or mark",      route: "Clean in place", cat: "Cleaning",       // cleaned at the station, a flag resolved at once: the "Clean it now" screen
    inPlace: { emoji: "🧽", title: "CLEAN IT NOW", text: "Wipe the dirt or mark off.", done: "✓ It is clean now", fail: "🚩 It will not come out", note: "Dirt or mark, cleaned at the station", stays: MARK_STAYS } },
  { id: "other",     label: "Others",            route: "Supervisor decides",                  cat: "Other" },      // flags at once, nothing to type (the owner, 17 Nov 2026; it was "Something else" with a text box)
];
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
export const GARMENT_MENU = GARMENT_IDS.map(id => ({ id, label: GARMENTS[id].label, group: GARMENTS[id].group }));
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

// Role gate, so a passer-by cannot use a station. The PINs are checked by the server
// (admin panel phase 7, src/lib/pins.js, POST /api/admin/pin): the page holds none. Set them
// in .env.local as JQC_PIN_INSPECTOR=… (no VITE_ prefix, so they never reach a browser; the
// old VITE_PIN_… names still work), and VITE_PIN_REQUIRED=false to switch the gate off.
const env = import.meta.env;
export const ROLES = [
  { id: "inspector",  label: "Inspector" },
  // A sorter only sorts (the owner, 19 Nov 2026): no cleaning, no inspection. Signs in at a
  // station with the station's PIN, like an inspector; no quick look, no full inspection, no
  // double-check, no damage photo, and the only flags are No size tag, Duplicate and Not on the roster.
  { id: "sorter",     label: "Sorter" },
  { id: "packer",     label: "Packer" },
  { id: "supervisor", label: "Supervisor" },
];
// There is no Admin role (removed 26 Nov 2026, the co-op): developers use the admin panel
// (?view=admin), signed in with a password the server checks (admin-plugin.js).
export const PIN_REQUIRED = (env.VITE_PIN_REQUIRED ?? "true") !== "false";

// The scanning stations. An operator picks their station at sign-in and
// enters that station's PIN; the page then runs as ?station=station1 so the
// supervisor's board, the saved order and the hub all know it as "Station 1".
// Their PINs: JQC_PIN_STATION1=… in .env.local (src/lib/pins.js).
export const STATIONS = [
  { id: "station1", label: "Station 1" },
  { id: "station2", label: "Station 2" },
  { id: "station3", label: "Station 3" },
];
export const stationOf = id => STATIONS.find(s => s.id === id) || null;

export const DEFAULT_SETTINGS = {
  ...KEY_DEFAULTS,        // scan Enter, select Enter, down A, up ↑, retry R, by hand W (src/lib/keydefaults.js, which the server reads too)
  rotation: 180,          // 0 | 90 | 180 | 270 — how the camera is mounted
  cameraId: "",           // "" = browser default
  autoScan: true,         // hands-free: scan when the jersey changes and settles
  autoScanDelay: 3,       // seconds after a confirm before hands-free may scan again
  stickers: false,        // print a sticker (bin + team or size) on the server's label printer for every passed jersey. Off unless a station turns it on (the owner, 17 Nov 2026)
  flagTickets: true,      // print a flag ticket (2 x 1 in: where it goes and why) for every flagged jersey
  binLists: true,         // print what is in a box (2 x 1 in: a count label, then fourteen jerseys a label) when it is closed: full, or the order finished
  // Which roll each kind of label prints on (Settings → Label printer; the owner, 26 Nov 2026: 2 x 3 for everything,
  // replacing 25 Nov's 2 x 4).
  // The station sends it with every print; the hub lays the label out for that roll and sends a 1 x 0.5 one to the
  // station's sticker printer, the others to its ticket printer (JERSEY_FLAG_PRINTER…, else the sticker printer).
  stickerRoll: "2x3",     // stickers on passed jerseys
  flagRoll: "2x3",        // flag tickets
  boxRoll: "2x3",         // box labels, box lists, count labels, the DAMAGED list
  boxAutoPrint: false,    // the set-out screen prints the box labels by itself when an order starts. Off: only its button prints them (the owner, 25 Nov 2026)
  boxWeights: false,      // estimate a bin's weight and warn near the cap. Off: the operator judges the weight until a scale is connected to the station
  boxWeightCap: 45,       // lb: no box heavier than this, when boxWeights is on (src/lib/boxmodel.js)
  listSort: "size",       // the pick list's order: "size" | "team" | "number" (LIST_SORTS in roster.js; the owner, 19 Nov 2026: by size, the tag is all the operator checks)
  theme: "light",         // "dark" | "light" | "system" (follow the PC). Light is the default (brand-ui, 27 Nov 2026); a station that chose Dark in Settings keeps it
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
const ALL_REASONS = [...REASONS, MARK_STAYS, THREAD_STAYS, NO_SIZE_TAG, ...OLD_REASONS];
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
  { id: "2x3",   label: "2 × 3 in" },
  { id: "2x4",   label: "2 × 4 in" },
  { id: "2x1",   label: "2 × 1 in" },
  { id: "1x0.5", label: "1 × ½ in" },
];
