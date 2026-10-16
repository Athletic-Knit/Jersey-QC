// ── Hub client: progress up, rosters down ─────────────────────────────────────
// The hub is optional: every call fails quietly if it is not there, and the
// station keeps working from files.
const STATION_KEY = "jerseyqc.station.v1";

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
  if (!r.ok) throw new Error(body.error || `hub ${r.status}`);
  return body;
}

export const hub = {
  report:        (id, snapshot) => call(`/api/hub/stations/${id}`, { method: "POST", body: JSON.stringify(snapshot) }),
  stations:      ()             => call("/api/hub/stations"),
  removeStation: id             => call(`/api/hub/stations/${id}`, { method: "DELETE" }),
  rosters:       ()             => call("/api/hub/rosters"),
  roster:        id             => call(`/api/hub/rosters/${id}`),
  sendRoster:    body           => call("/api/hub/rosters", { method: "POST", body: JSON.stringify(body) }),
  removeRoster:  id             => call(`/api/hub/rosters/${id}`, { method: "DELETE" }),
};

// What a station tells the hub: small, no images.
export function snapshotOf({ operatorName, role, orderNumber, notes, rosterFile, roster, log, lastConfirmed }) {
  const count = s => roster.filter(r => r.scanned === s).length;
  return {
    operatorName, role, orderNumber, notes, rosterFile,
    counts: { total: roster.length, pass: count("pass"), flag: count("flag"), manual: count("manual"), missing: count("missing"), short: count("short"), remaining: roster.filter(r => !r.scanned).length },
    lastScan: lastConfirmed ? { time: lastConfirmed.timestamp, text: `#${lastConfirmed.match?.number ?? "?"}${lastConfirmed.match?.name ? " " + lastConfirmed.match.name : ""}` } : null,
    attention: log.filter(l => l.status === "flagged" || l.status === "manual").slice(0, 25).map(l => ({ time: l.timestamp, status: l.status, jersey: l.match ? `#${l.match.number}${l.match.name ? " " + l.match.name : ""}${l.match.size ? " · " + l.match.size : ""}` : `#${l.detected?.number ?? "?"} ${l.detected?.name ?? ""}`.trim(), reason: l.reason || "", resolution: l.resolution || "" })),
  };
}
