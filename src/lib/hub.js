// ── Hub client: progress up, rosters down ─────────────────────────────────────
// The hub is optional: every call fails quietly if it is not there, and the
// station keeps working from files.
import { cleanSpots } from "./labels.js";

const STATION_KEY = "jerseyqc.station.v1";
const BROWSER_KEY = "jerseyqc.browser.v1";

// This browser's own id, made once. It rides along in every report so a
// station can tell "live from this PC" (fine to sign back in) from "live
// from another PC" (someone else is on it).
export function browserId() {
  try {
    let id = localStorage.getItem(BROWSER_KEY);
    if (!id) { id = "b-" + Math.random().toString(36).slice(2, 10); localStorage.setItem(BROWSER_KEY, id); }
    return id;
  } catch { return "b-local"; }
}

// How long after its last report a station still counts as live (it reports every 5 s).
export const LIVE_MS = 20000;

// From a hub /stations answer: { "st-station1": { operator, live, mine } … }.
// `live` = reported within LIVE_MS; `mine` = from this browser.
export function stationUse(answer, me = browserId()) {
  const now = answer?.now || Date.now();
  const out = {};
  for (const s of answer?.stations || []) out[s.id] = { operator: s.operatorName || "", live: !s.signedOut && now - (s.updatedAt || 0) < LIVE_MS, mine: !s.browserId || s.browserId === me };   // signed out = free at once
  return out;
}

// A station is normally identified per browser (stored once). `?station=line2`
// in the URL names it instead — a fixed label on a floor PC's shortcut, or
// several demo stations in one browser.
export function stationId() {
  try {
    const named = new URLSearchParams(window.location.search).get("station");
    if (named) return "st-" + named.replace(/[^\w-]/g, "").slice(0, 24);
    let id = localStorage.getItem(STATION_KEY);
    if (!id) { id = "st-" + Math.random().toString(36).slice(2, 8); localStorage.setItem(STATION_KEY, id); }
    return id;
  } catch { return "st-local"; }
}

async function call(url, opts = {}) {
  const r = await fetch(url, { headers: { "Content-Type": "application/json" }, ...opts });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(body.error || `hub ${r.status}`); e.status = r.status; e.body = body; throw e; }
  return body;
}

// While a replay runs (development and testing only) nothing goes to a label
// printer: a 500-jersey replay would print a ticket a flag and a label a box
// on the real Zebra (the owner, 20 Nov 2026).
let printsHeld = "";
// Holds every print: printLabels fails at once with `reason` (status 423). "" lets prints through again.
export function holdPrints(reason = "") { printsHeld = String(reason || ""); }

// The roll each kind of label prints on, from the station's Settings (stickerRoll,
// flagRoll, boxRoll; the owner, 25 Nov 2026). App sets it whenever the settings
// change; every print sends it as `roll`, unless the caller gave one.
let printRolls = {};
export function setPrintRolls(s = {}) { printRolls = { stickerRoll: s.stickerRoll, flagRoll: s.flagRoll, boxRoll: s.boxRoll }; }
export function rollFor(kind) {
  return kind === "flag" ? printRolls.flagRoll : kind === "binlist" || kind === "binticket" ? printRolls.boxRoll : printRolls.stickerRoll;
}

// The floor's settings from the admin panel (phase 2, 26 Nov 2026): the operator names for
// now. Kept in this browser, so a station whose hub is away still shows the last names it
// was given. Every station report's answer carries the settings' version; when it is not
// the one kept here, they are fetched again (GET /api/admin/config, public, no secrets).
const FLOOR_KEY = "jerseyqc.floorconfig";
export function cachedFloorConfig() {
  try { const c = JSON.parse(localStorage.getItem(FLOOR_KEY) || "null"); return c && typeof c === "object" ? c : null; } catch { return null; }
}
export async function loadFloorConfig() {
  const c = await call("/api/admin/config");
  const kept = { configVersion: c.configVersion || 0, operators: Array.isArray(c.operators) ? c.operators : [], defaults: c.defaults && typeof c.defaults === "object" ? c.defaults : {} };
  try { localStorage.setItem(FLOOR_KEY, JSON.stringify(kept)); } catch { /* private window: this page only */ }
  try { window.dispatchEvent(new CustomEvent("jqc-floorconfig", { detail: kept })); } catch { /* not a browser (tests) */ }   // the station takes the defaults when no order is open (App)
  return c;
}
let fetchingConfig = null;
export function noteConfigVersion(v) {
  if (!v || v === cachedFloorConfig()?.configVersion || fetchingConfig) return;
  fetchingConfig = loadFloorConfig().catch(() => null).finally(() => { fetchingConfig = null; });
}
// The names to offer: the panel's list when it has one, else the .env.local list (config.js).
export const operatorsFrom = (config, fallback) => (Array.isArray(config?.operators) && config.operators.length ? config.operators : fallback);

export const hub = {
  report:        (id, snapshot) => call(`/api/hub/stations/${id}`, { method: "POST", body: JSON.stringify(snapshot) }).then(r => { noteConfigVersion(r?.configVersion); return r; }),
  stations:      ()             => call("/api/hub/stations"),
  removeStation: id             => call(`/api/hub/stations/${id}`, { method: "DELETE" }),          // the supervisor's Remove
  signOutStation: id            => call(`/api/hub/stations/${id}/signout`, { method: "POST" }),    // the operator signed out: kept on the board, marked (M8)
  setOrder:      (id, body)     => call(`/api/hub/stations/${id}/order`, { method: "POST", body: JSON.stringify(body) }),   // supervisor names a station's running order
  clearCarried:  (id, key)      => call(`/api/hub/stations/${id}/carried?key=${encodeURIComponent(key)}`, { method: "DELETE" }),
  rosters:       ()             => call("/api/hub/rosters"),
  roster:        id             => call(`/api/hub/rosters/${id}`),
  sendRoster:    body           => call("/api/hub/rosters", { method: "POST", body: JSON.stringify(body) }),
  takeRoster:    (id, body)     => call(`/api/hub/rosters/${id}/take`, { method: "POST", body: JSON.stringify(body) }),     // a station starts it; throws "already taken" with .takenBy
  releaseRoster: id             => call(`/api/hub/rosters/${id}/release`, { method: "POST" }),                            // supervisor frees it for another station
  printStatus:   station       => call(`/api/hub/print${station ? "?station=" + encodeURIComponent(station) : ""}`),        // { printer, printers } — the label printer for this station
  printLabels:   (labels, o = {}) => (printsHeld ? Promise.reject(Object.assign(new Error(printsHeld), { status: 423 })) : call("/api/hub/print", { method: "POST", body: JSON.stringify({ labels, ...(rollFor(o.kind) ? { roll: rollFor(o.kind) } : {}), ...o }) })),    // o: { kind: "jersey" | "flag" | "binlist" | "binticket" | "bin", station, roll }; throws 503 "no label printer"
  replayRuns:    q              => call(`/api/replay?q=${encodeURIComponent(q)}`),                                        // development and testing only: the runs of a floor order, to replay (replay-plugin.js)
  openBoxes:     orders         => call(`/api/hub/openboxes?orders=${encodeURIComponent([].concat(orders || []).join(","))}`),   // boxes left open for orders that ship together → { boxes }
  leaveBoxesOpen: body          => call("/api/hub/openboxes", { method: "POST", body: JSON.stringify(body) }),          // { boxes, station, order } → { ids }
  takeOpenBox:   (id, body)     => call(`/api/hub/openboxes/${id}/take`, { method: "POST", body: JSON.stringify(body) }),   // → { box }; 404 when already taken
  dropOpenBox:   id             => call(`/api/hub/openboxes/${id}`, { method: "DELETE" }),
  boxModel:      ()             => call("/api/hub/boxes"),                                                                // { model, answers } — the box model fitted to the floor's answers
  boxAnswer:     answer         => call("/api/hub/boxes", { method: "POST", body: JSON.stringify(answer) }),              // { counts, box, station, order, bin, suggested } → { model, answers }
  removeRoster:  id             => call(`/api/hub/rosters/${id}`, { method: "DELETE" }),
  orders:        q              => call(`/api/hub/orders?q=${encodeURIComponent(q)}`),                                    // { orders } — an order by its number, any day the ledger has: rows, boxes, flags
  ledgerRange:   (from, to)     => call(`/api/hub/ledger?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),      // { days: [{ date, events, orders }] } — slim, for comparing days
  ledger:        date           => call(`/api/hub/ledger${date ? "?date=" + encodeURIComponent(date) : ""}`),   // every scan event of a day, all stations
  // Unfinished orders (the owner, 19 Nov 2026): parked at a station, listed on the board, kept 90 days.
  unfinished:    ({ q, station, all } = {}) => call(`/api/hub/unfinished${(s => s ? "?" + s : "")(new URLSearchParams({ ...(q ? { q } : {}), ...(station ? { station } : {}), ...(all ? { all: "1" } : {}) }).toString())}`),   // { orders } — open ones, newest first; all: the closed ones too
  parkOrder:     entry          => call("/api/hub/unfinished", { method: "POST", body: JSON.stringify(entry) }),          // { id?, station, order, run, operator, jerseyType, kind, total, done, flagged, missing, toScan, out, session } → { id, entry }; 507 when the server could not write it
  assignUnfinished:   (id, station, by) => call(`/api/hub/unfinished/${id}/assign`, { method: "POST", body: JSON.stringify({ station, by }) }),   // → { entry }
  releaseUnfinished:  id        => call(`/api/hub/unfinished/${id}/release`, { method: "POST" }),                         // → { entry }
  checkOffUnfinished: (id, { ids = [], all = false, by = "", as = "pass" } = {}) => call(`/api/hub/unfinished/${id}/checkoff`, { method: "POST", body: JSON.stringify({ ids, all, by, as }) }),   // the jerseys still out count as passed → { entry }
  dropUnfinished:     id        => call(`/api/hub/unfinished/${id}`, { method: "DELETE" }),                               // the station finished it the normal way
  unfinishedOrder:    id        => call(`/api/hub/unfinished/${id}/order`),                                             // { session, entry } — the whole order, kept on the server's disk; 404 when it is not there
  takeUnfinished:     (id, station, operator) => call(`/api/hub/unfinished/${id}/take`, { method: "POST", body: JSON.stringify({ station, operator }) }),   // a station opens it; 409 { openOn } while another station has it open
};

// What a station tells the hub: small. The only images are the photos of the
// newest few flagged jerseys (each ~40 KB; the scan, and any damage photos the
// operator took); the hub keeps a photo once it has seen it, so older flags
// keep theirs without being re-sent every 5 s.
const PHOTOS_PER_REPORT = 6;   // the newest log entries that carry their photo in each 5-second report
// A flag's garment and damage spots, as the hub keeps them: only what is there.
const marksOf = l => ({ ...(l.garment ? { garment: l.garment } : {}), ...(cleanSpots(l.spots).length ? { spots: cleanSpots(l.spots) } : {}) });
export function snapshotOf({ operatorName, role, orderNumber, orderRun = 0, notes, jerseyType = "", garment = "", customer = "", rosterFile, roster, log, lastConfirmed, binMap, closedBins = [], binSummary = [], idleSpells = [], awaySpells = [], finishedAt = null }) {
  const count = s => roster.filter(r => r.scanned === s).length;
  const sum = (xs, f) => xs.reduce((t, x) => t + (f(x) || 0), 0);
  return {
    // Where the screen was: idle (up, untouched) and away (hidden or another
    // window in front). Counts for the day sheet, the spells for the order sheet.
    idle: { count: idleSpells.length, minutes: sum(idleSpells, s => s.minutes), spells: idleSpells.slice(-200) },
    away: { count: awaySpells.length, seconds: sum(awaySpells, s => s.seconds), spells: awaySpells.slice(-200) },
    // orderRun: when this order was started on this station. The same order
    // number started again is a new run with its own record on the hub.
    operatorName, role, orderNumber, orderRun, notes, jerseyType, garment, customer, rosterFile, browserId: browserId(),
    // When Finish order was pressed (null while the order is open): the board shows
    // the order finished even with jerseys not scanned (code review M7).
    finishedAt: finishedAt || null,
    // The roster with each jersey's status, so the supervisor can download an
    // order's QC Results sheet without the station. Bins travel with it.
    rows: roster.map(r => ({ ...r, scanned: r.scanned || false })),
    bins: binMap || null,
    // The bins closed as full (which rows were in each), and one line per bin
    // with its count and box, for the board's order view and its Bins sheet.
    closedBins, binSummary,
    counts: { total: roster.length, pass: count("pass"), flag: count("flag"), manual: count("manual"), missing: count("missing"), short: count("short"), remaining: roster.filter(r => !r.scanned).length },
    lastScan: lastConfirmed ? { time: lastConfirmed.timestamp, text: `#${lastConfirmed.match?.number ?? "?"}${lastConfirmed.match?.name ? " " + lastConfirmed.match.name : ""}` } : null,
    // Every scan event of this order, compact (no images), for the hub's day
    // ledger — the end-of-day sheet is built from these across all stations.
    // All of them: a flag from the start of a 500-jersey order that is
    // resolved at its end must still reach the ledger (~300 bytes an event).
    events: log.map((l, i) => {
      const ev = {
        // A supervisor's check-off line carries the id the hub already filed it under
        // (`ledgerId`, applyCheckOff), so it is not counted twice (code review M5).
        id: l.ledgerId ?? l.id, t: l.timestamp, status: l.status, order: orderNumber, run: orderRun, jerseyType, operator: l.operator || operatorName, rowId: l.match?._id,
        number: l.match?.number ?? l.detected?.number ?? "", name: l.match?.name ?? l.detected?.name ?? "", size: l.match?.size ?? "", team: l.match?.team ?? "",
        offRoster: !!l.match?.offRoster, reason: l.reason || "", resolution: l.resolution || "",
        // What the operator typed for a hand entry, beside what the camera read (`read` stays the camera's:
        // the replay re-runs the scan from it).
        ...(l.typed ? { typed: `#${l.typed.number || "?"}${l.typed.name ? " " + l.typed.name : ""}` } : {}),
        read: l.detected ? `#${l.detected.number || "?"}${l.detected.number_complete === false ? "?" : ""}${l.detected.name ? " " + l.detected.name : ""}${l.detected.laid_flat === false ? " [not flat]" : ""}` : "",
      };
      // Where the damage is (24 Nov 2026): the garment and the spots, on every flag and in
      // every report (a few bytes, not tied to the photos). A flag still being marked
      // (`locating`) waits for its spots: the hub keeps the newest that are not empty.
      if (l.status === "flagged" && !l.locating) Object.assign(ev, marksOf(l));
      if (l.status === "flagged" && i < PHOTOS_PER_REPORT) { if (l.photo) ev.photo = l.photo; if (l.damagePhotos?.length) ev.damagePhotos = l.damagePhotos; }
      return ev;
    }),
    // Open items first, then the resolved ones: on a big order the newest 25
    // could be all Missing marks and push every open flag off the board.
    attention: (a => [...a.filter(l => !l.resolution), ...a.filter(l => l.resolution)])(log.filter(l => l.status === "flagged" || l.status === "manual" || l.status === "missing" || l.status === "short")).slice(0, 100).map((l, i) => ({ id: l.id, time: l.timestamp, status: l.status, jersey: l.match ? `#${l.match.number}${l.match.name ? " " + l.match.name : ""}${l.match.size ? " · " + l.match.size : ""}` : `#${l.detected?.number ?? "?"} ${l.detected?.name ?? ""}`.trim(), reason: l.reason || "", resolution: l.resolution || "", ...(l.status === "flagged" && !l.locating ? marksOf(l) : {}), ...(i < 3 && l.photo ? { photo: l.photo } : {}), ...(i < 3 && l.damagePhotos?.length ? { damagePhotos: l.damagePhotos } : {}) })),
  };
}
