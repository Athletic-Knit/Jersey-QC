// ── Station hub: a tiny in-process service inside the dev server ─────────────
// Stations report their progress; supervisors post rosters for stations to
// pick up. State lives in data/hub.json on the host PC. The routes are the
// shape a real roster server can adopt later:
//   GET    /api/hub/stations            every station's latest snapshot
//   POST   /api/hub/stations/:id        a station reports (body = snapshot)
//   DELETE /api/hub/stations/:id
//   DELETE /api/hub/stations/:id/carried?key=…   supervisor marks an item from an earlier order done
//   GET    /api/hub/ledger?date=YYYY-MM-DD   every scan event and order of that day (default today) — the day sheet
//   GET    /api/hub/rosters             rosters waiting for stations (summaries)
//   GET    /api/hub/rosters/:id         one roster, with rows
//   POST   /api/hub/rosters             { orderNumber, notes, jerseyType, fileName, rows, by }
//   DELETE /api/hub/rosters/:id
import fs from "node:fs";
import path from "node:path";

export default function hubPlugin({ file = path.resolve("data/hub.json") } = {}) {
  let state = { stations: {}, rosters: {} };
  try { state = { ...state, ...JSON.parse(fs.readFileSync(file, "utf8")) }; } catch { /* first run */ }

  // Writes are coalesced: with flag photos in the ledger the file is a few MB,
  // and every station reports every 5 s.
  let saveTimer = null;
  const writeNow = () => {
    saveTimer = null;
    try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(state)); }
    catch (e) { console.error("[hub] could not save:", e.message); }
  };
  const save = () => { if (!saveTimer) saveTimer = setTimeout(writeNow, 1500); };
  globalThis.process?.on?.("exit", () => { if (saveTimer) { clearTimeout(saveTimer); writeNow(); } });   // flush a pending write when the dev server stops
  const json = (res, code, body) => { res.statusCode = code; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(body)); };
  const readBody = req => new Promise((resolve, reject) => {
    let s = "";
    req.on("data", c => { s += c; if (s.length > 20e6) reject(new Error("body too large")); });
    req.on("end", () => { try { resolve(s ? JSON.parse(s) : {}); } catch (e) { reject(e); } });
    req.on("error", reject);
  });
  const summary = r => ({ id: r.id, orderNumber: r.orderNumber, notes: r.notes, jerseyType: r.jerseyType || "", fileName: r.fileName, rowCount: r.rows.length, by: r.by, forStation: r.forStation || "", createdAt: r.createdAt });

  async function handle(req, res) {
    const parts = new URL(req.url, "http://hub").pathname.split("/").filter(Boolean);
    const [kind, id] = parts;
    try {
      if (kind === "stations") {
        if (req.method === "GET" && !id) return json(res, 200, { now: Date.now(), today: new Date().toLocaleDateString("en-CA"), stations: Object.values(state.stations).map(s => Object.fromEntries(Object.entries(s).filter(([k]) => k !== "history"))).sort((a, b) => b.updatedAt - a.updatedAt) });   // history stays on the hub
        if (req.method === "POST" && id && parts.length === 2) {   // a station report
          const body = await readBody(req);
          const prev = state.stations[id];
          // The station moved to another order: its unresolved items are still
          // physically on their way to the supervisor, so they stay listed
          // under the station until the supervisor marks them done.
          let carried = prev?.carried || [];
          // The supervisor renamed the running order from the board: the station
          // now reports the new number. Same order, so nothing is carried and the
          // day tally continues; the record under the old name goes.
          const renamed = !!prev?.setOrder && body.orderNumber === prev.setOrder.orderNumber;
          if (prev && prev.orderNumber && body.orderNumber !== prev.orderNumber && !renamed) {
            // Key without the order number: if the order is renamed twice the same jersey must not be listed twice.
            const open = (prev.attention || []).filter(a => !a.resolution).map(a => ({ ...a, order: prev.orderNumber, key: `${a.time}|${a.jersey}|${a.status}` }));
            const seen = new Set(carried.map(c => c.key));
            carried = [...open.filter(c => !seen.has(c.key)), ...carried].slice(0, 50);
          }
          // Day tally: jerseys done (pass or by hand) since the station's first report
          // today, across orders. Rate and time left come from the last 20 minutes.
          const now   = Date.now();
          const today = new Date(now).toLocaleDateString("en-CA");            // YYYY-MM-DD, local
          const doneOf = c => Math.max(0, (c?.total || 0) - (c?.remaining || 0));
          const done  = doneOf(body.counts);
          const sameOrder = !!prev && (prev.orderNumber === body.orderNumber || renamed);
          const day = prev?.day?.date === today ? { ...prev.day } : { date: today, done: 0 };
          day.done = Math.max(0, day.done + (sameOrder ? done - doneOf(prev.counts) : done));   // an un-checked jersey takes one off again
          let history = (sameOrder && prev.history) || [];
          history = [...history, { t: now, done }].filter(h => now - h.t <= 20 * 60000).slice(-300);
          const first = history[0], span = now - first.t;
          const rate   = span >= 2 * 60000 && done > first.done ? (done - first.done) / span * 3600000 : null;   // jerseys per hour
          const etaMin = rate ? Math.round((body.counts?.remaining || 0) / rate * 60) : null;
          // Day ledger: every scan event from every station, keyed so a re-sent
          // event (same id) updates in place — a resolution added later lands too.
          const { events = [], rows = [], bins = null, ...rest } = body;
          const led = (state.ledger ||= {}); const dayLed = (led[today] ||= { events: {}, orders: {} });
          // A photo arrives with the first few reports after a flag; keep it when later reports leave it out.
          events.forEach(ev => { if (ev && ev.id !== undefined) { const k = `${id}|${ev.id}`; const old = dayLed.events[k]; dayLed.events[k] = { ...ev, station: id, ...(ev.photo ? {} : old?.photo ? { photo: old.photo } : {}) }; } });
          if (renamed && prev.orderNumber) delete dayLed.orders[`${id}|${prev.orderNumber}`];
          if (body.orderNumber) {
            // The order record keeps the latest roster with each jersey's status, so the
            // supervisor can download the order's QC Results sheet at any time.
            const ok = `${id}|${body.orderNumber}`; const o = dayLed.orders[ok] || { station: id, order: body.orderNumber, operator: body.operatorName, firstSeen: now };
            dayLed.orders[ok] = { ...o, operator: body.operatorName || o.operator, lastSeen: now, counts: body.counts || o.counts, rosterFile: body.rosterFile || o.rosterFile, notes: body.notes ?? o.notes ?? "", jerseyType: body.jerseyType || o.jerseyType || "", rows: rows.length ? rows : (o.rows || []), bins: bins || o.bins || null };
          }
          Object.keys(led).sort().slice(0, -14).forEach(d => delete led[d]);   // keep two weeks
          const setOrder = renamed ? undefined : prev?.setOrder;          // pending until the station reports it
          state.stations[id] = { ...rest, id, carried, day, history, rate, etaMin, updatedAt: now, ...(setOrder ? { setOrder } : {}) }; save();
          return json(res, 200, { ok: true, ...(setOrder ? { setOrder } : {}) });
        }
        // The supervisor gives a station's running order its number from the board.
        if (req.method === "POST" && id && parts[2] === "order") {
          const body = await readBody(req);
          const s = state.stations[id]; if (!s) return json(res, 404, { error: "no such station" });
          const orderNumber = String(body.orderNumber ?? "").trim(); if (!orderNumber) return json(res, 400, { error: "order number required" });
          s.setOrder = { orderNumber, by: String(body.by ?? ""), at: Date.now() }; save();
          console.log(`[hub] ${new Date().toLocaleTimeString()} ${id}: supervisor set the order number to ${orderNumber}`);
          return json(res, 200, { ok: true });
        }
        if (req.method === "DELETE" && id && parts[2] === "carried") {
          const key = new URL(req.url, "http://hub").searchParams.get("key");
          const s = state.stations[id]; if (s) { s.carried = (s.carried || []).filter(c => c.key !== key); save(); console.log(`[hub] ${new Date().toLocaleTimeString()} ${id}: supervisor marked done — ${key}`); }
          return json(res, 200, { ok: true });
        }
        if (req.method === "DELETE" && id) { delete state.stations[id]; save(); return json(res, 200, { ok: true }); }
      }
      if (kind === "ledger" && req.method === "GET") {
        const date = new URL(req.url, "http://hub").searchParams.get("date") || new Date().toLocaleDateString("en-CA");
        const d = (state.ledger || {})[date] || { events: {}, orders: {} };
        return json(res, 200, { date, events: Object.values(d.events).sort((a, b) => String(a.t).localeCompare(String(b.t))), orders: Object.values(d.orders), days: Object.keys(state.ledger || {}).sort() });
      }
      if (kind === "rosters") {
        if (req.method === "GET" && !id)  return json(res, 200, { rosters: Object.values(state.rosters).map(summary).sort((a, b) => b.createdAt - a.createdAt) });
        if (req.method === "GET" && id)   { const r = state.rosters[id]; return r ? json(res, 200, r) : json(res, 404, { error: "no such roster" }); }
        if (req.method === "POST" && !id) {
          const body = await readBody(req);
          if (!Array.isArray(body.rows) || body.rows.length === 0) return json(res, 400, { error: "rows required" });
          const newId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
          // forStation: a station id ("st-line1") when the supervisor sends it to one station; "" = any station may take it.
          state.rosters[newId] = { id: newId, orderNumber: String(body.orderNumber ?? ""), notes: String(body.notes ?? ""), jerseyType: String(body.jerseyType ?? ""), fileName: String(body.fileName ?? ""), rows: body.rows, by: String(body.by ?? ""), forStation: String(body.forStation ?? ""), createdAt: Date.now() };
          save();
          return json(res, 200, { id: newId });
        }
        if (req.method === "DELETE" && id) { delete state.rosters[id]; save(); return json(res, 200, { ok: true }); }
      }
      return json(res, 404, { error: "unknown hub route" });
    } catch (e) {
      return json(res, 400, { error: e.message });
    }
  }

  return { name: "jersey-hub", configureServer(server) { server.middlewares.use("/api/hub", (req, res) => { handle(req, res); }); } };
}
