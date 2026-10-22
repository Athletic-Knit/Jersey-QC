// Supervisor-side stress and workflow test against a RUNNING hub (the dev
// server). Three simulated stations report many times faster than real ones,
// a simulated supervisor polls the board and the ledger meanwhile, and every
// board action is exercised: send a roster, set an order number, an order
// change with open flags (carried items), mark carried done, remove a
// station, a too-large body, a stale station, the day tally. Latency of the
// Anthropic proxy (the scan path) is measured idle and under load.
//
//   node tools/hub-stress.mjs [https://localhost:5173] [seconds=30]
//
// Uses station ids st-sim1..3 and order numbers SIM-*; cleans the stations up
// at the end. Today's ledger keeps the SIM-* orders: restore data/hub.json
// from a backup afterwards if the day sheet must stay clean.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const BASE = process.argv[2] || "https://localhost:5173";
const SECONDS = Number(process.argv[3]) || 30;
const H = BASE + "/api/hub";

const ms = () => performance.now();
const stats = {};
function rec(name, t, ok = true) { (stats[name] ||= { t: [], err: 0 }); stats[name].t.push(t); if (!ok) stats[name].err++; }
function q(arr, p) { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; }
const line = name => { const s = stats[name]; if (!s) return `${name}: —`; return `${name}: n=${s.t.length} p50=${q(s.t, 0.5).toFixed(0)}ms p95=${q(s.t, 0.95).toFixed(0)}ms max=${Math.max(...s.t).toFixed(0)}ms errors=${s.err}`; };

async function call(name, url, opts = {}) {
  const t0 = ms();
  try {
    const r = await fetch(url, { headers: { "content-type": "application/json" }, ...opts });
    const body = await r.text();
    rec(name, ms() - t0, r.ok);
    let j = null; try { j = JSON.parse(body); } catch { /* not json */ }
    return { status: r.status, body: j, text: body };
  } catch (e) { rec(name, ms() - t0, false); return { status: 0, error: e.message }; }
}

const photo = "data:image/jpeg;base64," + "A".repeat(40_000);
function snapshot(station, order, { rows = 150, events = 400, done = 60, flags = 8, photos = 6, operator = "Sim " + station } = {}) {
  const roster = Array.from({ length: rows }, (_, i) => ({ _id: i, name: i % 3 ? "Player " + i : "", number: String(i % 100), team: i % 2 ? "Red" : "Blue", size: "A-M", scanned: i < done ? "pass" : i < done + flags ? "flag" : false }));
  const evs = Array.from({ length: events }, (_, i) => ({ id: 1000 + i, t: `2026-10-22 09:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}`, status: i < flags ? "flagged" : "pass", order, operator, rowId: i % rows, number: String(i % 100), name: "Player " + i, size: "A-M", team: "Red", reason: i < flags ? "Sublimation error" : "", resolution: "", read: "#" + (i % 100), ...(i < photos ? { photo } : {}) }));
  return {
    operatorName: operator, role: "inspector", orderNumber: order, notes: "", jerseyType: "sublimated", rosterFile: "sim.csv", browserId: "b-" + station,
    rows: roster, bins: { red: 1, blue: 2 },
    counts: { total: rows, pass: done, flag: flags, manual: 0, missing: 0, short: 0, remaining: rows - done - flags },
    lastScan: { time: "2026-10-22 09:00:00", text: "#7 Player 7" },
    events: evs,
    attention: evs.filter(e => e.status === "flagged").slice(0, 25).map((e, i) => ({ id: e.id, time: e.t, status: e.status, jersey: `#${e.number} ${e.name}`, reason: e.reason, resolution: "", ...(i < 3 ? { photo } : {}) })),
  };
}

const sleep = t => new Promise(r => setTimeout(r, t));
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`); };

async function main() {
  console.log(`hub stress against ${BASE} for ${SECONDS}s`);
  const alive = await call("stations GET idle", H + "/stations");
  if (alive.status !== 200) { console.log("hub not reachable:", alive); process.exit(2); }

  // Baseline: board and ledger reads, and the scan path (the Anthropic proxy) when idle.
  for (let i = 0; i < 10; i++) await call("stations GET idle", H + "/stations");
  for (let i = 0; i < 5; i++) await call("ledger GET idle", H + "/ledger");
  for (let i = 0; i < 5; i++) await call("anthropic proxy idle", BASE + "/api/anthropic/v1/messages", { method: "POST", headers: { "content-type": "application/json", "x-api-key": "sk-ant-invalid", "anthropic-version": "2023-06-01" }, body: JSON.stringify({ model: "claude-haiku-5-5", max_tokens: 5, messages: [{ role: "user", content: "hi" }] }) });

  // Load: 3 stations every 250 ms (20x the real rate: like 60 stations) + a supervisor polling.
  const stations = ["st-sim1", "st-sim2", "st-sim3"];
  const until = Date.now() + SECONDS * 1000;
  const bodies = stations.map((s, i) => JSON.stringify(snapshot(s, "SIM-" + (i + 1))));
  console.log(`report body: ${(bodies[0].length / 1024).toFixed(0)} KB each`);
  let reports = 0;
  const reporter = async (s, body) => { while (Date.now() < until) { await call("station POST under load", `${H}/stations/${s}`, { method: "POST", body }); reports++; await sleep(250); } };
  const supervisor = async () => { while (Date.now() < until) { await call("stations GET under load", H + "/stations"); await sleep(300); } };
  const ledgerPoll = async () => { while (Date.now() < until) { await call("ledger GET under load", H + "/ledger"); await sleep(1000); } };
  const scanPath = async () => { while (Date.now() < until) { await call("anthropic proxy under load", BASE + "/api/anthropic/v1/messages", { method: "POST", headers: { "content-type": "application/json", "x-api-key": "sk-ant-invalid", "anthropic-version": "2023-06-01" }, body: JSON.stringify({ model: "claude-haiku-5-5", max_tokens: 5, messages: [{ role: "user", content: "hi" }] }) }); await sleep(1500); } };
  await Promise.all([...stations.map((s, i) => reporter(s, bodies[i])), supervisor(), ledgerPoll(), scanPath()]);
  console.log(`${reports} station reports in ${SECONDS}s`);

  // Ledger after load: every event once, photos kept, orders recorded with rows.
  const led = (await call("ledger GET", H + "/ledger")).body;
  const simEvents = led.events.filter(e => e.station === "st-sim1");
  check("ledger keeps each event once", simEvents.length === 400, `${simEvents.length} events for st-sim1`);
  check("ledger keeps flag photos", simEvents.filter(e => e.photo).length === 6, `${simEvents.filter(e => e.photo).length} photos`);
  const o1 = led.orders.find(o => o.station === "st-sim1" && o.order === "SIM-1");
  check("order record with rows and counts", !!o1 && o1.rows.length === 150 && o1.counts.total === 150, o1 ? `${o1.rows.length} rows` : "missing");
  const board = (await call("stations GET", H + "/stations")).body;
  const b1 = board.stations.find(s => s.id === "st-sim1");
  // The day tally counts jerseys handled: passed, by hand, or sent to the supervisor (total - remaining).
  check("board shows the station with its day tally", !!b1 && b1.day && b1.day.done === 68, b1 ? `day.done=${b1.day?.done} (60 passed + 8 flagged) rate=${b1.rate}` : "missing");
  check("history stays on the hub (not sent to the board)", !!b1 && !("history" in b1));

  // Day tally: more done → up; an un-check → down.
  await call("station POST", `${H}/stations/st-sim1`, { method: "POST", body: JSON.stringify(snapshot("st-sim1", "SIM-1", { done: 70 })) });
  let s1 = (await call("stations GET", H + "/stations")).body.stations.find(s => s.id === "st-sim1");
  check("day tally goes up with passes", s1.day.done === 78, `day.done=${s1.day.done}`);
  await call("station POST", `${H}/stations/st-sim1`, { method: "POST", body: JSON.stringify(snapshot("st-sim1", "SIM-1", { done: 69 })) });
  s1 = (await call("stations GET", H + "/stations")).body.stations.find(s => s.id === "st-sim1");
  check("day tally goes down on an un-check", s1.day.done === 77, `day.done=${s1.day.done}`);

  // Order change with open flags → carried; mark one done; the day tally continues.
  await call("station POST", `${H}/stations/st-sim1`, { method: "POST", body: JSON.stringify(snapshot("st-sim1", "SIM-1B", { done: 5, flags: 2, events: 20 })) });
  s1 = (await call("stations GET", H + "/stations")).body.stations.find(s => s.id === "st-sim1");
  check("open flags carried over to the next order", (s1.carried || []).length === 8 && s1.carried[0].order === "SIM-1", `${(s1.carried || []).length} carried, first from ${s1.carried?.[0]?.order}`);
  check("day tally continues across orders", s1.day.done === 77 + 7, `day.done=${s1.day.done}`);
  const key = s1.carried[0].key;
  await call("carried DELETE", `${H}/stations/st-sim1/carried?key=${encodeURIComponent(key)}`, { method: "DELETE" });
  s1 = (await call("stations GET", H + "/stations")).body.stations.find(s => s.id === "st-sim1");
  check("supervisor marks a carried item done", s1.carried.length === 7, `${s1.carried.length} left`);
  await call("station POST", `${H}/stations/st-sim1`, { method: "POST", body: JSON.stringify(snapshot("st-sim1", "SIM-1B", { done: 5, flags: 2, events: 20 })) });
  s1 = (await call("stations GET", H + "/stations")).body.stations.find(s => s.id === "st-sim1");
  check("carried items survive the next report", s1.carried.length === 7, `${s1.carried.length} left`);

  // Rosters: send to one station, list, fetch, remove.
  const rows = Array.from({ length: 200 }, (_, i) => ({ name: "P" + i, number: String(i % 100), team: "Red", size: "A-L" }));
  const sent = await call("roster POST", H + "/rosters", { method: "POST", body: JSON.stringify({ orderNumber: "SIM-R1", notes: "left sleeve logo", jerseyType: "echl", fileName: "sim.xlsx", rows, by: "Sim Supervisor", forStation: "st-sim2" }) });
  check("roster sent", sent.status === 200 && !!sent.body?.id, `id ${sent.body?.id}`);
  const list = (await call("rosters GET", H + "/rosters")).body.rosters;
  const mine = list.find(x => x.id === sent.body.id);
  check("roster listed with its station and count", !!mine && mine.forStation === "st-sim2" && mine.rowCount === 200 && mine.jerseyType === "echl");
  const full = (await call("roster GET one", `${H}/rosters/${sent.body.id}`)).body;
  check("roster fetched whole", full.rows?.length === 200 && full.notes === "left sleeve logo");
  const empty = await call("roster POST empty", H + "/rosters", { method: "POST", body: JSON.stringify({ orderNumber: "SIM-R2", rows: [] }) });
  check("an empty roster is refused", empty.status === 400);
  await call("roster DELETE", `${H}/rosters/${sent.body.id}`, { method: "DELETE" });
  check("roster removed", !((await call("rosters GET", H + "/rosters")).body.rosters.some(x => x.id === sent.body.id)));

  // Set order number from the board: delivered once, record renamed, nothing carried.
  await call("station POST", `${H}/stations/st-sim2`, { method: "POST", body: JSON.stringify(snapshot("st-sim2", "sim_file", { done: 10, flags: 1, events: 15 })) });
  const carriedBefore = ((await call("stations GET", H + "/stations")).body.stations.find(s => s.id === "st-sim2").carried || []).length;   // from the order change SIM-2 → sim_file
  const so = await call("order POST", `${H}/stations/st-sim2/order`, { method: "POST", body: JSON.stringify({ orderNumber: "SIM-2000", by: "Sim Supervisor" }) });
  check("set order accepted", so.status === 200);
  const r1 = await call("station POST", `${H}/stations/st-sim2`, { method: "POST", body: JSON.stringify(snapshot("st-sim2", "sim_file", { done: 10, flags: 1, events: 15 })) });
  check("station told the new number on its next report", r1.body?.setOrder?.orderNumber === "SIM-2000");
  const r2 = await call("station POST", `${H}/stations/st-sim2`, { method: "POST", body: JSON.stringify(snapshot("st-sim2", "SIM-2000", { done: 10, flags: 1, events: 15 })) });
  check("told only once", !r2.body?.setOrder);
  const led2 = (await call("ledger GET", H + "/ledger")).body;
  check("old file-named record replaced by the numbered one", !led2.orders.some(o => o.station === "st-sim2" && o.order === "sim_file") && led2.orders.some(o => o.station === "st-sim2" && o.order === "SIM-2000"));
  let s2 = (await call("stations GET", H + "/stations")).body.stations.find(s => s.id === "st-sim2");
  check("a rename carries nothing new", (s2.carried || []).length === carriedBefore, `${(s2.carried || []).length} carried, ${carriedBefore} before the rename`);
  const bad = await call("order POST empty", `${H}/stations/st-sim2/order`, { method: "POST", body: JSON.stringify({ orderNumber: "  " }) });
  check("an empty order number is refused", bad.status === 400);
  const nos = await call("order POST unknown", `${H}/stations/st-nobody/order`, { method: "POST", body: JSON.stringify({ orderNumber: "1" }) });
  check("unknown station refused", nos.status === 404);

  // A body over the limit is refused and the hub stays up.
  const huge = await call("station POST huge", `${H}/stations/st-sim3`, { method: "POST", body: JSON.stringify({ operatorName: "x", events: [{ id: 1, photo: "A".repeat(21_000_000) }] }) });
  check("21 MB body refused", huge.status === 400 || huge.status === 0, `status ${huge.status}`);
  const after = await call("stations GET", H + "/stations");
  check("hub still answers after it", after.status === 200);
  const garbage = await call("station POST garbage", `${H}/stations/st-sim3`, { method: "POST", body: "{not json" });
  check("bad JSON refused with 400", garbage.status === 400);
  const unknown = await call("unknown route", `${H}/nothing`);
  check("unknown route is 404", unknown.status === 404);

  // Stale: a station that stops reporting shows its age on the board.
  await sleep(1200);
  const st3 = (await call("stations GET", H + "/stations")).body;
  const age = st3.now - st3.stations.find(s => s.id === "st-sim3").updatedAt;
  check("a silent station ages on the board", age >= 1000, `${age} ms since its last report`);

  // Remove the simulated stations.
  for (const s of stations) await call("station DELETE", `${H}/stations/${s}`, { method: "DELETE" });
  const gone = (await call("stations GET", H + "/stations")).body.stations.some(s => stations.includes(s.id));
  check("stations removed from the board", !gone);

  console.log("\nLATENCY");
  for (const n of ["stations GET idle", "stations GET under load", "ledger GET idle", "ledger GET under load", "station POST under load", "anthropic proxy idle", "anthropic proxy under load"]) console.log("  " + line(n));
  const fails = results.filter(r => !r.ok);
  console.log(`\n${results.length - fails.length}/${results.length} checks passed${fails.length ? "; FAILED: " + fails.map(f => f.name).join(", ") : ""}`);
  process.exit(fails.length ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(2); });
