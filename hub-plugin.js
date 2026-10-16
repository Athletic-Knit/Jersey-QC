// ── Station hub: a tiny in-process service inside the dev server ─────────────
// Stations report their progress; supervisors post rosters for stations to
// pick up. State lives in data/hub.json on the host PC. The routes are the
// shape a real roster server can adopt later:
//   GET    /api/hub/stations            every station's latest snapshot
//   POST   /api/hub/stations/:id        a station reports (body = snapshot)
//   DELETE /api/hub/stations/:id
//   DELETE /api/hub/stations/:id/carried?key=…   supervisor marks an item from an earlier order done
//   GET    /api/hub/rosters             rosters waiting for stations (summaries)
//   GET    /api/hub/rosters/:id         one roster, with rows
//   POST   /api/hub/rosters             { orderNumber, notes, fileName, rows, by }
//   DELETE /api/hub/rosters/:id
import fs from "node:fs";
import path from "node:path";

export default function hubPlugin({ file = path.resolve("data/hub.json") } = {}) {
  let state = { stations: {}, rosters: {} };
  try { state = { ...state, ...JSON.parse(fs.readFileSync(file, "utf8")) }; } catch { /* first run */ }

  const save = () => {
    try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(state)); }
    catch (e) { console.error("[hub] could not save:", e.message); }
  };
  const json = (res, code, body) => { res.statusCode = code; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(body)); };
  const readBody = req => new Promise((resolve, reject) => {
    let s = "";
    req.on("data", c => { s += c; if (s.length > 20e6) reject(new Error("body too large")); });
    req.on("end", () => { try { resolve(s ? JSON.parse(s) : {}); } catch (e) { reject(e); } });
    req.on("error", reject);
  });
  const summary = r => ({ id: r.id, orderNumber: r.orderNumber, notes: r.notes, fileName: r.fileName, rowCount: r.rows.length, by: r.by, createdAt: r.createdAt });

  async function handle(req, res) {
    const parts = new URL(req.url, "http://hub").pathname.split("/").filter(Boolean);
    const [kind, id] = parts;
    try {
      if (kind === "stations") {
        if (req.method === "GET" && !id) return json(res, 200, { now: Date.now(), stations: Object.values(state.stations).sort((a, b) => b.updatedAt - a.updatedAt) });
        if (req.method === "POST" && id) {
          const body = await readBody(req);
          const prev = state.stations[id];
          // The station moved to another order: its unresolved items are still
          // physically on their way to the supervisor, so they stay listed
          // under the station until the supervisor marks them done.
          let carried = prev?.carried || [];
          if (prev && prev.orderNumber && body.orderNumber !== prev.orderNumber) {
            const open = (prev.attention || []).filter(a => !a.resolution).map(a => ({ ...a, order: prev.orderNumber, key: `${prev.orderNumber}|${a.time}|${a.jersey}|${a.status}` }));
            const seen = new Set(carried.map(c => c.key));
            carried = [...open.filter(c => !seen.has(c.key)), ...carried].slice(0, 50);
          }
          state.stations[id] = { ...body, id, carried, updatedAt: Date.now() }; save(); return json(res, 200, { ok: true });
        }
        if (req.method === "DELETE" && id && parts[2] === "carried") {
          const key = new URL(req.url, "http://hub").searchParams.get("key");
          const s = state.stations[id]; if (s) { s.carried = (s.carried || []).filter(c => c.key !== key); save(); }
          return json(res, 200, { ok: true });
        }
        if (req.method === "DELETE" && id) { delete state.stations[id]; save(); return json(res, 200, { ok: true }); }
      }
      if (kind === "rosters") {
        if (req.method === "GET" && !id)  return json(res, 200, { rosters: Object.values(state.rosters).map(summary).sort((a, b) => b.createdAt - a.createdAt) });
        if (req.method === "GET" && id)   { const r = state.rosters[id]; return r ? json(res, 200, r) : json(res, 404, { error: "no such roster" }); }
        if (req.method === "POST" && !id) {
          const body = await readBody(req);
          if (!Array.isArray(body.rows) || body.rows.length === 0) return json(res, 400, { error: "rows required" });
          const newId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
          state.rosters[newId] = { id: newId, orderNumber: String(body.orderNumber ?? ""), notes: String(body.notes ?? ""), fileName: String(body.fileName ?? ""), rows: body.rows, by: String(body.by ?? ""), createdAt: Date.now() };
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
