// ── Hub client: progress up, rosters down ─────────────────────────────────────
// The hub is optional: every call fails quietly if it is not there, and the
// station keeps working from files.
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
  for (const s of answer?.stations || []) out[s.id] = { operator: s.operatorName || "", live: now - (s.updatedAt || 0) < LIVE_MS, mine: !s.browserId || s.browserId === me };
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

export const hub = {
  report:        (id, snapshot) => call(`/api/hub/stations/${id}`, { method: "POST", body: JSON.stringify(snapshot) }),
  stations:      ()             => call("/api/hub/stations"),
  removeStation: id             => call(`/api/hub/stations/${id}`, { method: "DELETE" }),
  setOrder:      (id, body)     => call(`/api/hub/stations/${id}/order`, { method: "POST", body: JSON.stringify(body) }),   // supervisor names a station's running order
  clearCarried:  (id, key)      => call(`/api/hub/stations/${id}/carried?key=${encodeURIComponent(key)}`, { method: "DELETE" }),
  rosters:       ()             => call("/api/hub/rosters"),
  roster:        id             => call(`/api/hub/rosters/${id}`),
  sendRoster:    body           => call("/api/hub/rosters", { method: "POST", body: JSON.stringify(body) }),
  takeRoster:    (id, body)     => call(`/api/hub/rosters/${id}/take`, { method: "POST", body: JSON.stringify(body) }),     // a station starts it; throws "already taken" with .takenBy
  releaseRoster: id             => call(`/api/hub/rosters/${id}/release`, { method: "POST" }),                            // supervisor frees it for another station
  printStatus:   station       => call(`/api/hub/print${station ? "?station=" + encodeURIComponent(station) : ""}`),        // { printer, printers } — the label printer for this station
  printLabels:   (labels, o = {}) => call("/api/hub/print", { method: "POST", body: JSON.stringify({ labels, ...o }) }),    // o: { kind: "jersey" | "flag" | "bin", station }; throws 503 "no label printer"
  boxModel:      ()             => call("/api/hub/boxes"),                                                                // { model, answers } — the box model fitted to the floor's answers
  boxAnswer:     answer         => call("/api/hub/boxes", { method: "POST", body: JSON.stringify(answer) }),              // { counts, box, station, order, bin, suggested } → { model, answers }
  removeRoster:  id             => call(`/api/hub/rosters/${id}`, { method: "DELETE" }),
  orders:        q              => call(`/api/hub/orders?q=${encodeURIComponent(q)}`),                                    // { orders } — an order by its number, any day the ledger has: rows, boxes, flags
  ledger:        date           => call(`/api/hub/ledger${date ? "?date=" + encodeURIComponent(date) : ""}`),   // every scan event of a day, all stations
};

// What a station tells the hub: small. The only images are the photos of the
// newest few flagged jerseys (each ~40 KB; the scan, and any damage photos the
// operator took); the hub keeps a photo once it has seen it, so older flags
// keep theirs without being re-sent every 5 s.
const PHOTOS_PER_REPORT = 6;   // the newest log entries that carry their photo in each 5-second report
export function snapshotOf({ operatorName, role, orderNumber, orderRun = 0, notes, jerseyType = "", rosterFile, roster, log, lastConfirmed, binMap, closedBins = [], binSummary = [], idleSpells = [], awaySpells = [] }) {
  const count = s => roster.filter(r => r.scanned === s).length;
  const sum = (xs, f) => xs.reduce((t, x) => t + (f(x) || 0), 0);
  return {
    // Where the screen was: idle (up, untouched) and away (hidden or another
    // window in front). Counts for the day sheet, the spells for the order sheet.
    idle: { count: idleSpells.length, minutes: sum(idleSpells, s => s.minutes), spells: idleSpells.slice(-200) },
    away: { count: awaySpells.length, seconds: sum(awaySpells, s => s.seconds), spells: awaySpells.slice(-200) },
    // orderRun: when this order was started on this station. The same order
    // number started again is a new run with its own record on the hub.
    operatorName, role, orderNumber, orderRun, notes, jerseyType, rosterFile, browserId: browserId(),
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
        id: l.id, t: l.timestamp, status: l.status, order: orderNumber, run: orderRun, jerseyType, operator: l.operator || operatorName, rowId: l.match?._id,
        number: l.match?.number ?? l.detected?.number ?? "", name: l.match?.name ?? l.detected?.name ?? "", size: l.match?.size ?? "", team: l.match?.team ?? "",
        offRoster: !!l.match?.offRoster, reason: l.reason || "", resolution: l.resolution || "",
        read: l.detected ? `#${l.detected.number || "?"}${l.detected.number_complete === false ? "?" : ""}${l.detected.name ? " " + l.detected.name : ""}${l.detected.laid_flat === false ? " [not flat]" : ""}` : "",
      };
      if (l.status === "flagged" && i < PHOTOS_PER_REPORT) { if (l.photo) ev.photo = l.photo; if (l.damagePhotos?.length) ev.damagePhotos = l.damagePhotos; }
      return ev;
    }),
    // Open items first, then the resolved ones: on a big order the newest 25
    // could be all Missing marks and push every open flag off the board.
    attention: (a => [...a.filter(l => !l.resolution), ...a.filter(l => l.resolution)])(log.filter(l => l.status === "flagged" || l.status === "manual" || l.status === "missing" || l.status === "short")).slice(0, 100).map((l, i) => ({ id: l.id, time: l.timestamp, status: l.status, jersey: l.match ? `#${l.match.number}${l.match.name ? " " + l.match.name : ""}${l.match.size ? " · " + l.match.size : ""}` : `#${l.detected?.number ?? "?"} ${l.detected?.name ?? ""}`.trim(), reason: l.reason || "", resolution: l.resolution || "", ...(i < 3 && l.photo ? { photo: l.photo } : {}), ...(i < 3 && l.damagePhotos?.length ? { damagePhotos: l.damagePhotos } : {}) })),
  };
}
