// ── Station hub: a tiny in-process service inside the dev server ─────────────
// Stations report their progress; supervisors post rosters for stations to
// pick up. State lives in data/hub.json on the host PC. The routes are the
// shape a real roster server can adopt later:
//   GET    /api/hub/stations            every station's latest snapshot
//   POST   /api/hub/stations/:id        a station reports (body = snapshot)
//   DELETE /api/hub/stations/:id
//   DELETE /api/hub/stations/:id/carried?key=…   supervisor marks an item from an earlier order done
//   GET    /api/hub/ledger?date=YYYY-MM-DD   every scan event and order of that day (default today) — the day sheet;
//                                            `days` lists every day still kept (90; photos only on the newest 14);
//                                            `days` lists every day still kept (90; photos only on the newest 14)
//   GET    /api/hub/rosters             rosters waiting for stations (summaries)
//   GET    /api/hub/rosters/:id         one roster, with rows
//   POST   /api/hub/rosters             { orderNumber, notes, jerseyType, fileName, rows, by }
//   POST   /api/hub/rosters/:id/take    { station, operator } — a station starts it; 409 if another station already has it
//   POST   /api/hub/rosters/:id/release the supervisor frees it for another station
//   DELETE /api/hub/rosters/:id         the station finished it, or the supervisor removes it
//   GET    /api/hub/print?station=…     { printer, printers, labelSize, flagPrinter, flagLabelSize } — the label printer for that station (JERSEY_PRINTER_<STATION>), else the hub's (JERSEY_PRINTER, else the first Zebra queue); the flag-ticket printer likewise (JERSEY_FLAG_PRINTER_<STATION>, JERSEY_FLAG_PRINTER), else the label printer
//   POST   /api/hub/print               { labels, kind, station } — prints one label per entry (labels.js: kind "jersey" = the sticker on a pass, "flag" = the ticket on a flag, on the flag printer and its 2 x 1 in roll, "bin" = a bin label); 503 when there is no label printer
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { labelsZPL, labelSize as labelDots, DEFAULT_LABEL_SIZE, DEFAULT_FLAG_LABEL_SIZE } from "./src/lib/labels.js";

// ── Bin labels: the Zebra on the hub PC ──────────────────────────────────────
// The ZPL goes to a Windows print queue as raw bytes through tools/print-raw.ps1
// (no driver rendering). Both steps are injectable so the routes can be tested
// without a printer.
const PRINT_PS1 = path.join(path.dirname(fileURLToPath(import.meta.url)), "tools", "print-raw.ps1");
const runPs1 = args => new Promise((resolve, reject) =>
  execFile("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", PRINT_PS1, ...args], { windowsHide: true, timeout: 30000 },
    (err, stdout, stderr) => err ? reject(new Error(String(stderr || err.message).trim().split(/\r?\n/)[0] || "powershell failed")) : resolve(String(stdout))));

// The print queues on this PC: [{ name, driver, port, status }].
export async function listPrintersWindows() {
  const out = JSON.parse((await runPs1(["-List"])).trim() || "[]");
  return (Array.isArray(out) ? out : [out]).filter(p => p?.Name).map(p => ({ name: p.Name, driver: p.DriverName || "", port: p.PortName || "", status: p.PrinterStatus }));
}
export async function printRawWindows(printer, zpl) {
  const tmp = path.join(os.tmpdir(), `jerseyqc-labels-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}.zpl`);
  fs.writeFileSync(tmp, zpl, "utf8");   // ^CI28: the printer reads the data as UTF-8
  try { await runPs1(["-Printer", printer, "-File", tmp]); }
  finally { try { fs.unlinkSync(tmp); } catch { /* already gone */ } }
}
export const isLabelPrinter = p => /zebra|zd4|zdesigner/i.test(`${p?.name || ""} ${p?.driver || ""}`);

// The ledger keeps `keepDays` of days; the photos (the weight, ~40 KB each)
// only on the newest `photoDays`. An event whose photos went says so.
export function pruneLedger(led, { keepDays = 90, photoDays = 14 } = {}) {
  const days = Object.keys(led || {}).sort();
  days.slice(0, Math.max(0, days.length - keepDays)).forEach(d => delete led[d]);
  days.slice(0, Math.max(0, days.length - photoDays)).filter(d => led[d]).forEach(d => Object.values(led[d].events || {}).forEach(ev => {
    if (ev && (ev.photo || ev.damagePhotos)) { delete ev.photo; delete ev.damagePhotos; ev.photosPruned = true; }
  }));
  return led;
}

export function createHub({ file = path.resolve("data/hub.json"), now = () => Date.now(), printer = "", printers: stationPrinters = {}, labelSize = "", flagPrinter = "", flagPrinters: stationFlagPrinters = {}, flagLabelSize = "", print = printRawWindows, listPrinters = listPrintersWindows } = {}) {
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
  const now_ = now;
  const json = (res, code, body) => { res.statusCode = code; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(body)); };
  const readBody = req => new Promise((resolve, reject) => {
    let s = "";
    req.on("data", c => { s += c; if (s.length > 20e6) reject(new Error("body too large")); });
    req.on("end", () => { try { resolve(s ? JSON.parse(s) : {}); } catch (e) { reject(e); } });
    req.on("error", reject);
  });
  // The label printer: the station's own (JERSEY_PRINTER_STATION1 = a queue on
  // this PC, which may be a shared printer on the station PC, \\AK-NB-164\Zebra),
  // else JERSEY_PRINTER, else the first Zebra queue on this PC. The flag
  // tickets go on a 2 x 1 in roll, so they have their own printer the same
  // way (JERSEY_FLAG_PRINTER_STATION1, else JERSEY_FLAG_PRINTER) and fall
  // back to the label printer when none is set. The queue list costs a
  // PowerShell start, so it is kept for a minute.
  const printerName = String(printer || "").trim(), labelSpec = String(labelSize || "").trim() || DEFAULT_LABEL_SIZE;
  const flagName = String(flagPrinter || "").trim(), flagSpec = String(flagLabelSize || "").trim() || DEFAULT_FLAG_LABEL_SIZE;
  const byStation = map => Object.fromEntries(Object.entries(map || {}).filter(([, v]) => String(v || "").trim()).map(([k, v]) => [String(k).trim().toLowerCase(), String(v).trim()]));
  const perStation = byStation(stationPrinters), perStationFlag = byStation(stationFlagPrinters);
  let printers = { at: -Infinity, list: [] };
  const printerList = async () => {
    if (now_() - printers.at < 60000) return printers.list;
    let list = [];
    try { list = await listPrinters(); } catch (e) { console.error("[hub] could not list printers:", e.message); }
    printers = { at: now_(), list };
    return list;
  };
  const labelPrinter = async station => perStation[String(station || "").trim().toLowerCase()] || printerName || (await printerList()).find(isLabelPrinter)?.name || null;
  const ticketPrinter = async station => perStationFlag[String(station || "").trim().toLowerCase()] || flagName || labelPrinter(station);
  const summary = r => ({ id: r.id, orderNumber: r.orderNumber, notes: r.notes, jerseyType: r.jerseyType || "", binBy: r.binBy || "", fileName: r.fileName, rowCount: r.rows.length, by: r.by, forStation: r.forStation || "", createdAt: r.createdAt, takenBy: r.takenBy || null });

  async function handle(req, res) {
    const parts = new URL(req.url, "http://hub").pathname.split("/").filter(Boolean);
    const [kind, id] = parts;
    try {
      if (kind === "stations") {
        if (req.method === "GET" && !id) return json(res, 200, { now: now_(), today: new Date(now_()).toLocaleDateString("en-CA"), stations: Object.values(state.stations).map(s => Object.fromEntries(Object.entries(s).filter(([k]) => k !== "history"))).sort((a, b) => b.updatedAt - a.updatedAt) });   // history stays on the hub
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
          // One start of an order on a station is a run (`orderRun`, the time it
          // was started). The same number started again is another run: its own
          // record in the ledger, the finished one kept as it was.
          const sameRun = !!prev && (prev.orderRun || 0) === (body.orderRun || 0);
          if (prev && prev.orderNumber && !renamed && (body.orderNumber !== prev.orderNumber || !sameRun)) {
            // Key without the order number: if the order is renamed twice the same jersey must not be listed twice.
            const open = (prev.attention || []).filter(a => !a.resolution).map(a => ({ ...a, order: prev.orderNumber, key: `${a.time}|${a.jersey}|${a.status}` }));
            const seen = new Set(carried.map(c => c.key));
            carried = [...open.filter(c => !seen.has(c.key)), ...carried].slice(0, 50);
          }
          // Day tally: jerseys done (pass or by hand) since the station's first report
          // today, across orders. Rate and time left come from the last 20 minutes.
          const now   = now_();
          const today = new Date(now).toLocaleDateString("en-CA");            // YYYY-MM-DD, local
          const doneOf = c => Math.max(0, (c?.total || 0) - (c?.remaining || 0));
          const done  = doneOf(body.counts);
          const sameOrder = !!prev && ((prev.orderNumber === body.orderNumber && sameRun) || renamed);
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
          // A photo arrives with the first few reports after a flag (the damage photos a little later, once taken); keep them when later reports leave them out.
          events.forEach(ev => { if (ev && ev.id !== undefined) { const k = `${id}|${ev.id}`; const old = dayLed.events[k]; dayLed.events[k] = { ...ev, station: id, ...(ev.photo ? {} : old?.photo ? { photo: old.photo } : {}), ...(ev.damagePhotos?.length ? {} : old?.damagePhotos?.length ? { damagePhotos: old.damagePhotos } : {}) }; } });
          const okey = (order, run) => `${id}|${order}${run ? "|" + run : ""}`;
          if (renamed && prev.orderNumber) delete dayLed.orders[okey(prev.orderNumber, prev.orderRun)];
          if (body.orderNumber) {
            // The order record keeps the latest roster with each jersey's status, so the
            // supervisor can download the order's QC Results sheet at any time.
            const ok = okey(body.orderNumber, body.orderRun); const o = dayLed.orders[ok] || { station: id, order: body.orderNumber, run: body.orderRun || 0, operator: body.operatorName, firstSeen: now };
            dayLed.orders[ok] = { ...o, operator: body.operatorName || o.operator, lastSeen: now, counts: body.counts || o.counts, rosterFile: body.rosterFile || o.rosterFile, notes: body.notes ?? o.notes ?? "", jerseyType: body.jerseyType || o.jerseyType || "", rows: rows.length ? rows : (o.rows || []), bins: bins || o.bins || null };
          }
          pruneLedger(led);   // 90 days; photos on the newest 14
          const setOrder = renamed ? undefined : prev?.setOrder;          // pending until the station reports it
          state.stations[id] = { ...rest, id, carried, day, history, rate, etaMin, updatedAt: now, ...(setOrder ? { setOrder } : {}) }; save();
          return json(res, 200, { ok: true, ...(setOrder ? { setOrder } : {}) });
        }
        // The supervisor gives a station's running order its number from the board.
        if (req.method === "POST" && id && parts[2] === "order") {
          const body = await readBody(req);
          const s = state.stations[id]; if (!s) return json(res, 404, { error: "no such station" });
          const orderNumber = String(body.orderNumber ?? "").trim(); if (!orderNumber) return json(res, 400, { error: "order number required" });
          s.setOrder = { orderNumber, by: String(body.by ?? ""), at: now_() }; save();
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
        const date = new URL(req.url, "http://hub").searchParams.get("date") || new Date(now_()).toLocaleDateString("en-CA");
        const d = (state.ledger || {})[date] || { events: {}, orders: {} };
        return json(res, 200, { date, events: Object.values(d.events).sort((a, b) => String(a.t).localeCompare(String(b.t))), orders: Object.values(d.orders), days: Object.keys(state.ledger || {}).sort() });
      }
      if (kind === "rosters") {
        if (req.method === "GET" && !id)  return json(res, 200, { rosters: Object.values(state.rosters).map(summary).sort((a, b) => b.createdAt - a.createdAt) });
        if (req.method === "GET" && id)   { const r = state.rosters[id]; return r ? json(res, 200, r) : json(res, 404, { error: "no such roster" }); }
        if (req.method === "POST" && !id) {
          const body = await readBody(req);
          if (!Array.isArray(body.rows) || body.rows.length === 0) return json(res, 400, { error: "rows required" });
          const newId = now_().toString(36) + Math.random().toString(36).slice(2, 6);
          // forStation: a station id ("st-line1") when the supervisor sends it to one station; "" = any station may take it.
          state.rosters[newId] = { id: newId, orderNumber: String(body.orderNumber ?? ""), notes: String(body.notes ?? ""), jerseyType: String(body.jerseyType ?? ""), binBy: String(body.binBy ?? ""), fileName: String(body.fileName ?? ""), rows: body.rows, by: String(body.by ?? ""), forStation: String(body.forStation ?? ""), createdAt: now_() };
          save();
          return json(res, 200, { id: newId });
        }
        // One station works an order. The first station to start it takes it;
        // another station asking gets 409 and who has it. The same station may
        // take it again (its page reloaded, or the saved session was discarded).
        if (req.method === "POST" && id && parts[2] === "take") {
          const body = await readBody(req);
          const r = state.rosters[id]; if (!r) return json(res, 404, { error: "no such roster" });
          const station = String(body.station ?? "").trim(); if (!station) return json(res, 400, { error: "station required" });
          if (r.takenBy && r.takenBy.station !== station) return json(res, 409, { error: "already taken", takenBy: r.takenBy });
          r.takenBy = { station, operator: String(body.operator ?? ""), at: now_() }; save();
          console.log(`[hub] ${new Date().toLocaleTimeString()} ${station}: took order ${r.orderNumber || r.id}`);
          return json(res, 200, { ok: true, takenBy: r.takenBy });
        }
        if (req.method === "POST" && id && parts[2] === "release") {
          const r = state.rosters[id]; if (!r) return json(res, 404, { error: "no such roster" });
          delete r.takenBy; save();
          return json(res, 200, { ok: true });
        }
        if (req.method === "DELETE" && id) { delete state.rosters[id]; save(); return json(res, 200, { ok: true }); }
      }
      if (kind === "print" && !id) {
        if (req.method === "GET") { const station = new URL(req.url, "http://hub").searchParams.get("station"); return json(res, 200, { printer: await labelPrinter(station), printers: await printerList(), labelSize: labelSpec, flagPrinter: await ticketPrinter(station), flagLabelSize: flagSpec }); }
        if (req.method === "POST") {
          const body = await readBody(req);
          const labels = Array.isArray(body.labels) ? body.labels.slice(0, 100) : [];
          if (!labels.length) return json(res, 400, { error: "labels required" });
          const kind = body.kind === "jersey" || body.kind === "flag" ? body.kind : "bin";
          const name = await (kind === "flag" ? ticketPrinter : labelPrinter)(body.station); if (!name) return json(res, 503, { error: "no label printer" });
          try { await print(name, labelsZPL(labels, labelDots(kind === "flag" ? flagSpec : labelSpec), kind)); }
          catch (e) { console.error(`[hub] print on ${name} failed: ${e.message}`); return json(res, 502, { error: `print failed: ${e.message}` }); }
          const what = kind === "jersey" ? (labels.length === 1 ? `sticker bin ${labels[0].bin || "—"} ${labels[0].value || ""}` : `${labels.length} stickers`)
            : kind === "flag" ? (labels.length === 1 ? `flag ticket #${labels[0].number || "?"} ${labels[0].tag || ""}` : `${labels.length} flag tickets`)
            : `${labels.length} bin label${labels.length === 1 ? "" : "s"}`;
          console.log(`[hub] ${new Date().toLocaleTimeString()} ${body.station ? body.station + ": " : ""}printed ${what} on ${name}${labels[0]?.orderNumber ? ` for order ${labels[0].orderNumber}` : ""}`);
          return json(res, 200, { ok: true, printer: name, count: labels.length });
        }
      }
      return json(res, 404, { error: "unknown hub route" });
    } catch (e) {
      return json(res, 400, { error: e.message });
    }
  }

  // An address typed without https:// sends plain HTTP to the TLS port. Node
  // reports that as a TLS client error; answer it on the raw socket with a
  // redirect to the same address over https, instead of a blank page.
  const redirectPlainHttp = httpServer => {
    httpServer?.on?.("tlsClientError", (err, tlsSocket) => {
      if (err?.code !== "ERR_SSL_HTTP_REQUEST") return;
      const raw = tlsSocket?._parent || tlsSocket;
      try {
        const a = String(raw.localAddress || "").replace(/^::ffff:/, "");            // IPv4 arrives as ::ffff:192.168.0.189
        const host = a === "::1" ? "localhost" : a.includes(":") ? `[${a}]` : a;
        const to = `https://${host}:${raw.localPort}/`;
        raw.write(`HTTP/1.1 302 Found
Location: ${to}
Content-Type: text/html
Connection: close

<a href="${to}">Use ${to}</a>
`);
        raw.end();
      } catch { /* the socket is already gone */ }
    });
  };

  return { handle, redirectPlainHttp, state: () => state, flush: writeNow };
}

export default function hubPlugin(opts = {}) {
  const { handle, redirectPlainHttp } = createHub(opts);
  return {
    name: "jersey-hub",
    configureServer(server) {
      server.middlewares.use("/api/hub", (req, res) => { handle(req, res); });
      redirectPlainHttp(server.httpServer);
    },
  };
}
