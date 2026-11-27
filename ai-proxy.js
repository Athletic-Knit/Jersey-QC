// ── The AI proxy: /api/anthropic (admin panel phase 6, 26 Nov 2026) ─────────
// The stations' reads go browser → this server → Anthropic, and the API key stays here
// (CLAUDE_API_KEY in .env.local). Before phase 6 Vite's proxy forwarded ANY request from
// any PC on the network with the key added: any model, any size, as often as asked (the
// co-op's decision 9: limit it to the app's own requests). Now, for a request that uses
// the server's key:
//   - only POST /v1/messages,
//   - a model on the allowed list (ALLOWED_MODELS, the .env.local model, the panel's),
//   - at most MAX_BODY bytes and max_tokens at most MAX_TOKENS, at most 4 messages,
//   - at most PER_PC_MIN requests a minute from one address and ALL_MIN from all;
// anything else gets an Anthropic-shaped error the station shows. A request that brings
// its own x-api-key (the test tools) spends its own key: from the server's own PC on every
// stage, from any PC only where `ownKeyFromAnyPc` is set (development and testing), so a
// floor PC with no internet cannot use the server as a way out (Fable's review of 5-8, L2).
// Every read with the server's key is counted (calls, failures, time, tokens, per day and
// per station) and kept in data/<hub data file>-ai.json, written at most once a minute.
import fs from "node:fs";
import path from "node:path";
import { Buffer } from "node:buffer";

export const ALLOWED_MODELS = ["claude-haiku-5-5", "claude-sonnet-5-5"];
// A real read is 100-400 KB (an 800 px JPEG; 1600 px at most from the panel) and asks for 300 or
// 4000 tokens (vision.js), so these leave room and no more (Fable's review of 5-8, L2).
export const MAX_BODY = 2 * 1024 * 1024, MAX_TOKENS = 4000, PER_PC_MIN = 120, ALL_MIN = 600, UPSTREAM_MS = 30000;
const KEEP_DAYS = 60, BUCKET_MS = 250, BUCKETS = 121;   // time taken, in 250 ms steps up to 30 s

const dayOf = t => new Date(t).toLocaleDateString("en-CA");
const error = (res, code, type, message) => { res.statusCode = code; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ type: "error", error: { type, message } })); };

// A station's name as the station sends it (st-station1): anything else counts under the PC's
// address. Never "__proto__" or "constructor", which would write into every object in the
// server (Fable's review of 5-8, M1).
export const stationName = (header, ip) => { const h = String(header || ""); return /^st-[a-z0-9-]{1,30}$/i.test(h) ? h : (ip || "?"); };
const LOOPBACK = new Set(["127.0.0.1", "::1", "localhost"]);
const isMap = o => !!o && typeof o === "object" && !Array.isArray(o);
// The counts as read from disk: only plain maps, with no inherited names, survive.
function cleanStats(o) {
  const days = Object.create(null);
  if (!isMap(o) || !isMap(o.days)) return { days };
  for (const [d, x] of Object.entries(o.days)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !isMap(x)) continue;
    const day = { ...x, ms: Array.isArray(x.ms) ? x.ms : [], stations: Object.create(null), models: Object.create(null) };
    for (const k of ["stations", "models"]) if (isMap(x[k])) for (const [n, v] of Object.entries(x[k])) if (isMap(v)) day[k][n] = v;
    days[d] = day;
  }
  return { days };
}

export function aiStatsFileFor(dataFile) { const { dir, name } = path.parse(path.resolve(dataFile)); return path.join(dir, `${name}-ai.json`); }

// The median time from a day's buckets.
export function medianMs(buckets = []) {
  const n = buckets.reduce((a, b) => a + (b || 0), 0); if (!n) return 0;
  let seen = 0; for (let i = 0; i < buckets.length; i++) { seen += buckets[i] || 0; if (seen >= n / 2) return (i + 0.5) * BUCKET_MS; }
  return 0;
}

export function createAiProxy({ env = {}, dataFile = path.resolve("data/hub.json"), now = () => Date.now(), fetchImpl = globalThis.fetch, log = true, panelModel = () => "", ownKeyFromAnyPc = false, upstreamMs = UPSTREAM_MS } = {}) {
  const key = env.CLAUDE_API_KEY || env.VITE_CLAUDE_API_KEY || "";
  const statsFile = aiStatsFileFor(dataFile);
  const allowed = () => new Set([...ALLOWED_MODELS, String(env.VITE_CLAUDE_MODEL || ""), String(panelModel() || "")].filter(Boolean));
  const stamp = () => new Date(now()).toLocaleTimeString("en-CA", { hour12: false });
  if (!key) console.log(`${stamp()} [anthropic] no API key in .env.local (CLAUDE_API_KEY): the stations cannot read garments`);

  // { days: { "2026-11-26": { calls, failed, refused, input, output, cacheRead, cacheWrite, ms: [buckets], stations: { id: { calls, failed } }, models: { m: { calls, input, output, cacheRead, cacheWrite } } } } }
  // A proxy on the same file before this one (Vite loading the server again) writes its
  // counts first, so they are read here and not written over (Fable's review of 5-8, L4).
  globalThis.__jqcAi?.get(path.resolve(dataFile))?.flush?.();
  let stats = { days: Object.create(null) };
  try { stats = cleanStats(JSON.parse(fs.readFileSync(statsFile, "utf8"))); } catch { /* none yet, or unreadable: start counting again */ }
  let dirty = false, timer = null;
  const writeNow = () => {
    clearTimeout(timer); timer = null; if (!dirty) return;
    const days = Object.keys(stats.days).sort(); for (const d of days.slice(0, Math.max(0, days.length - KEEP_DAYS))) delete stats.days[d];
    try { fs.mkdirSync(path.dirname(statsFile), { recursive: true }); fs.writeFileSync(statsFile + ".tmp", JSON.stringify(stats)); fs.renameSync(statsFile + ".tmp", statsFile); dirty = false; }
    catch (e) { console.error(`[anthropic] could not save the read counts: ${e.message}`); }
  };
  const touch = () => { dirty = true; if (!timer) timer = setTimeout(writeNow, 60000); };
  const day = () => { const d = dayOf(now()); return (stats.days[d] ||= { calls: 0, failed: 0, refused: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, ms: [], stations: Object.create(null), models: Object.create(null) }); };
  const count = (station, model, ok, ms, usage) => { try { countNow(station, model, ok, ms, usage); } catch (e) { console.error(`[anthropic] could not count a read: ${e.message}`); } };   // counting never fails a read
  const countNow = (station, model, ok, ms, usage) => {
    const d = day(); d.calls++; if (!ok) d.failed++;
    const b = Math.min(BUCKETS - 1, Math.floor(ms / BUCKET_MS)); d.ms[b] = (d.ms[b] || 0) + 1;
    const s = (d.stations[station] ||= { calls: 0, failed: 0 }); s.calls++; if (!ok) s.failed++;
    const m = (d.models[model] && typeof d.models[model] === "object") ? d.models[model] : (d.models[model] = { calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
    m.calls++;
    if (usage) for (const [k, u] of [["input", "input_tokens"], ["output", "output_tokens"], ["cacheRead", "cache_read_input_tokens"], ["cacheWrite", "cache_creation_input_tokens"]]) { const n = Number(usage[u]) || 0; d[k] += n; m[k] += n; }   // per model too: prices differ by model
    touch();
  };
  const refused = () => { day().refused++; touch(); };

  // Requests a minute: per address and in all.
  const recent = new Map(); let all = [];
  const overLimit = ip => {
    const t = now(), cut = t - 60000;
    all = all.filter(x => x > cut); const mine = (recent.get(ip) || []).filter(x => x > cut);
    if (mine.length >= PER_PC_MIN || all.length >= ALL_MIN) { recent.set(ip, mine); return true; }
    mine.push(t); all.push(t); recent.set(ip, mine); return false;
  };

  async function handle(req, res) {
    const route = new URL(req.url, "http://ai").pathname;
    const ip = String(req.socket?.remoteAddress || "").replace(/^::ffff:/, "");
    if (req.method !== "POST" || route !== "/v1/messages") return error(res, 404, "not_found_error", "Only reads (POST /v1/messages) pass through this server.");
    const chunks = []; let size = 0;
    try { for await (const c of req) { size += c.length; if (size > MAX_BODY) { refused(); return error(res, 413, "request_too_large", `A read may be at most ${MAX_BODY / 1048576} MB.`); } chunks.push(c); } }
    catch (e) { return error(res, 400, "invalid_request_error", e.message); }
    const raw = Buffer.concat(chunks);
    const ownKey = String(req.headers["x-api-key"] || "");
    if (ownKey && !ownKeyFromAnyPc && !LOOPBACK.has(ip)) { refused(); return error(res, 403, "permission_error", "A request with its own API key is taken only from this server's own PC."); }
    let body = null;
    try { body = JSON.parse(raw.toString("utf8")); } catch { /* checked below */ }
    if (!ownKey) {
      if (!key) return error(res, 503, "api_error", "No API key on this server (CLAUDE_API_KEY in .env.local).");
      if (!body || typeof body !== "object") { refused(); return error(res, 400, "invalid_request_error", "The read is not JSON."); }
      if (!allowed().has(String(body.model))) { refused(); return error(res, 403, "permission_error", `The model ${String(body.model).slice(0, 60)} is not allowed through this server.`); }
      if (!(Number(body.max_tokens) > 0 && Number(body.max_tokens) <= MAX_TOKENS)) { refused(); return error(res, 400, "invalid_request_error", `max_tokens must be 1 to ${MAX_TOKENS}.`); }
      if (!Array.isArray(body.messages) || body.messages.length > 4) { refused(); return error(res, 400, "invalid_request_error", "A read has at most 4 messages."); }
      if (body.stream) { refused(); return error(res, 400, "invalid_request_error", "Reads through this server are not streamed."); }
      if (overLimit(ip)) { refused(); return error(res, 429, "rate_limit_error", "Too many reads from this PC in the last minute: slow down and scan again."); }
    }
    const station = stationName(req.headers["x-jqc-station"], ip);
    const t0 = now();
    let status = 502, text = "";
    // Stopped after upstreamMs, or as soon as the station gives up (it retries after 25 s), so a
    // slow answer is never paid for twice (Fable's review of 5-8, L3).
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(new Error(`no answer from Anthropic after ${Math.round(upstreamMs / 1000)} s`)), upstreamMs);
    const gaveUp = () => ac.abort(new Error("the station stopped waiting"));
    res.on?.("close", () => { if (!res.writableEnded) gaveUp(); });   // the response closed before an answer: the station hung up (a request's own "close" fires once its body is read)
    try {
      const r = await fetchImpl("https://api.anthropic.com/v1/messages", {
        method: "POST",
        // anthropic-beta only with the sender's own key: the floor's key reads the plain API.
        headers: { "content-type": "application/json", "x-api-key": ownKey || key, "anthropic-version": String(req.headers["anthropic-version"] || "2023-06-01"), ...(ownKey && req.headers["anthropic-beta"] ? { "anthropic-beta": String(req.headers["anthropic-beta"]) } : {}) },
        body: raw,
        signal: ac.signal,
      });
      status = r.status; text = await r.text();
    } catch (e) {
      const why = ac.signal.aborted ? String(ac.signal.reason?.message || e.message) : e.message;
      status = ac.signal.aborted ? 504 : 502;
      text = JSON.stringify({ type: "error", error: { type: "api_error", message: `The server could not reach Anthropic: ${why}` } });
    } finally { clearTimeout(timer); }
    const ms = now() - t0;
    if (!ownKey) { let usage = null; try { usage = JSON.parse(text).usage || null; } catch { /* error body */ } count(station, String(body?.model || "?"), status >= 200 && status < 300, ms, usage); }
    if (log) console.log(`${stamp()} [anthropic] ${status} in ${ms} ms from ${ip || "?"}${station !== ip ? ` (${station})` : ""}${ownKey ? " (its own key)" : ""}`);
    if (res.writableEnded || res.destroyed) return;
    res.statusCode = status; res.setHeader("Content-Type", "application/json"); res.end(text);
  }
  const entry = { stats: () => stats, flush: writeNow, allowed: () => [...allowed()], limits: { maxBody: MAX_BODY, maxTokens: MAX_TOKENS, perPcMin: PER_PC_MIN, allMin: ALL_MIN } };
  (globalThis.__jqcAi ||= new Map()).set(path.resolve(dataFile), entry);
  if (!globalThis.__jqcAiExit) { globalThis.__jqcAiExit = true; globalThis.process?.on?.("exit", () => globalThis.__jqcAi?.forEach(e => e.flush())); }
  return { handle, ...entry };
}

export default function aiProxyPlugin(opts = {}) {
  const dataFile = path.resolve(opts.dataFile || "data/hub.json");
  // The panel's model (development and testing) is allowed too: read at each request.
  const panelModel = () => globalThis.__jqcAdminConfig?.get(dataFile)?.ai?.()?.model || "";
  const p = createAiProxy({ ...opts, dataFile, panelModel });
  return {
    name: "jersey-ai-proxy",
    configureServer(server) { server.middlewares.use("/api/anthropic", (req, res) => { p.handle(req, res).catch(e => error(res, 500, "api_error", e.message)); }); },
    buildEnd() { p.flush(); },
  };
}
