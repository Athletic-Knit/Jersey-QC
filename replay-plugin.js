// ── Replay source: a floor order, for the testing and development servers ─────
// The owner (20 Nov 2026) wants the replay (src/lib/replay.js) on the testing
// server without a special link: the station's order screen has "Replay an
// order", the operator types an order number, and this route finds that order
// in the hub data files it is given — the floor's (C:\JerseyQC\data\hub.json
// on the server PC) and this server's own — read only, never written. Every run
// of the order (a station, a start) comes back with its roster (each jersey's
// row, statuses taken off) and its scan events (no photos), which is all the
// replay needs. Only vite.config.stage.js loads this; the floor never does.
//   GET /api/replay?q=264247   → { runs: [{ source, date, station, operator, run, order, jerseyType, binBy, total, done, rows, events }], sources }
import fs from "node:fs";

const cache = new Map();   // file → { mtimeMs, state } (the floor's file is a few MB; read again only when it changed)
export function readHubFile(file) {
  try {
    const st = fs.statSync(file);
    const hit = cache.get(file);
    if (hit && hit.mtimeMs === st.mtimeMs) return hit.state;
    const state = JSON.parse(fs.readFileSync(file, "utf8"));
    cache.set(file, { mtimeMs: st.mtimeMs, state });
    return state;
  } catch { return null; }
}

const binByOf = bins => (bins?.__by === "size" ? "size" : bins?.__by === "all" ? "all" : "team");
const slimEvent = ev => { const e = { ...ev }; delete e.photo; delete e.damagePhotos; delete e.thumb; return e; };
const rosterRow = r => { const o = { ...r }; delete o.scanned; delete o._id; return o; };

// Every run of order `q` in the given hub states: [{ label, state }].
export function replayRuns(sources, q) {
  const want = String(q || "").trim().toLowerCase();
  if (!want) return [];
  const runs = {};
  for (const { label, state } of sources) {
    const days = Object.entries(state?.ledger || {}).sort(([a], [b]) => a.localeCompare(b));
    for (const [date, d] of days) {
      for (const o of Object.values(d.orders || {})) {
        if (String(o.order ?? "").trim().toLowerCase() !== want) continue;
        const k = `${label}|${o.station}|${o.order}|${o.run || 0}`;
        const before = runs[k];
        runs[k] = {
          source: label, date: before?.date || date, lastDate: date, station: o.station, operator: o.operator || before?.operator || "",
          run: o.run || 0, order: String(o.order), jerseyType: o.jerseyType || before?.jerseyType || "", binBy: o.bins ? binByOf(o.bins) : before?.binBy || "team",   // a later day's record may not repeat them
          firstSeen: before?.firstSeen ?? o.firstSeen, lastSeen: o.lastSeen || 0, counts: o.counts || null,
          rows: (o.rows && o.rows.length ? o.rows : before?.rows || []), events: before?.events || {},
        };
      }
    }
    // The events of each run, from every day it ran.
    for (const r of Object.values(runs).filter(r => r.source === label)) {
      for (const [, d] of days) {
        for (const ev of Object.values(d.events || {})) {
          // The run's scans wherever they were scanned (the hub keeps on each event the station that
          // scanned it, and a run picked up at another station keeps its run); by station without a run.
          if (String(ev?.order ?? "") !== r.order || (r.run && ev.run ? ev.run !== r.run : (ev.station !== r.station || (ev.run || 0) !== r.run))) continue;
          r.events[`${ev.station}|${ev.id}`] = slimEvent(ev);
        }
      }
    }
  }
  // The floor's runs first (the first source), then newest first; a run with no scans has nothing to replay.
  const order = new Map(sources.map((x, i) => [x.label, i]));
  return Object.values(runs)
    .filter(r => Object.keys(r.events).length)
    .sort((a, b) => (order.get(a.source) - order.get(b.source)) || ((b.lastSeen || 0) - (a.lastSeen || 0))).slice(0, 12)
    .map(r => {
      const rows = r.rows.map(rosterRow);
      const done = r.rows.filter(x => x.scanned === "pass" || x.scanned === "manual").length;
      return { ...r, rows, total: rows.length, done, events: Object.values(r.events).sort((a, b) => String(a.t).localeCompare(String(b.t))) };
    });
}

export default function replayPlugin({ files = [] } = {}) {
  return {
    name: "jerseyqc-replay",
    configureServer(server) {
      server.middlewares.use("/api/replay", (req, res) => {
        const q = new URL(req.url, "http://replay").searchParams.get("q") || "";
        const sources = files.map(f => ({ ...f, state: readHubFile(f.file) }));
        const body = { runs: replayRuns(sources.filter(s => s.state), q), sources: sources.map(s => ({ label: s.label, file: s.file, found: !!s.state })) };
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(body));
      });
    },
  };
}
