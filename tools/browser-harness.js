/* eslint-disable */
// ── Browser test harness ──────────────────────────────────────────────────────
// Paste into the DevTools console (or run via the browser tool) on a page where
// the app is signed in and an order is open, e.g. http://localhost:5174.
// It installs: a FAKE CAMERA (canvas streamed as a webcam), a CONTROLLABLE
// NETWORK for the Anthropic call, helpers, and a 100-jersey self-driving run.
//
//   __draw('table')                       bare table on the camera
//   __draw('jersey', 'SMITH', 12)         a jersey; opts { dx: 18 } nudge, { hand: 'right'|'left' }
//   __net.fake = { name, number, sleeve_numbers }   what the "model" reads next
//   __net.mode = 'ok' | 'down' | '429once' | 'timeout'; __net.delay = ms
//   __key('KeyB') / __key('Enter') / __key('KeyA') / __key('KeyR')
//   __startRun()                          launches the 100-jersey run; progress in window.__run
//
// After editing any src/lib/* file, HARD-RELOAD the page before trusting results:
// React Fast Refresh keeps old objects alive inside useRef (the motion gate).

(function install() {
  const cam = document.createElement("canvas"); cam.width = 640; cam.height = 480;
  const cx = cam.getContext("2d");
  window.__cam = cam;
  window.__draw = (kind, name = "", num = "", opts = {}) => {
    const dx = opts.dx || 0;
    if (kind === "table") { cx.fillStyle = "#6e6a60"; cx.fillRect(0, 0, 640, 480); }
    else {
      cx.fillStyle = "#14324f"; cx.fillRect(0, 0, 640, 480);
      for (let i = 0; i < 600; i++) { cx.fillStyle = `rgba(255,255,255,${0.05 + ((i * 7919) % 100) / 700})`; cx.fillRect((i * 97) % 640, (i * 131) % 480, 4, 4); }   // fabric texture, deterministic
      cx.fillStyle = "#fff"; cx.textAlign = "center";
      if (name) { cx.font = "bold 64px Arial"; cx.fillText(name, 320 + dx, 150); }
      cx.font = "bold 220px Arial"; cx.fillText(String(num), 320 + dx, 400);
    }
    if (opts.hand) { cx.fillStyle = "#c9a27e"; cx.fillRect(opts.hand === "left" ? 0 : 380, 120, 260, 300); }
  };
  __draw("table");
  setInterval(() => cx.drawImage(cam, 0, 0), 100);                 // keep frames flowing
  navigator.mediaDevices.getUserMedia = async () => { window.__stream = cam.captureStream(10); return window.__stream; };
  navigator.mediaDevices.enumerateDevices = async () => [{ kind: "videoinput", deviceId: "fake1", label: "Fake overhead cam" }];

  window.__net = { mode: "ok", delay: 0, fake: { name: "", number: "", sleeve_numbers: [] }, calls: 0 };
  window.__origFetch = window.__origFetch || window.fetch;
  window.fetch = function (url, opts) {
    if (!String(url).includes("/api/anthropic")) return window.__origFetch.apply(this, arguments);
    const n = window.__net; n.calls++;
    return new Promise((resolve, reject) => {
      if (opts?.signal) opts.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
      setTimeout(() => {
        if (n.mode === "timeout") return;
        if (n.mode === "down")    { n.mode = "ok"; return reject(new TypeError("Failed to fetch")); }
        if (n.mode === "429once") { n.mode = "ok"; return resolve(new Response(JSON.stringify({ type: "error", error: { type: "rate_limit_error", message: "rate limited" } }), { status: 429 })); }
        resolve(new Response(JSON.stringify({ content: [{ type: "text", text: JSON.stringify(n.fake) }], usage: { input_tokens: 900, output_tokens: 24 } }), { status: 200, headers: { "Content-Type": "application/json" } }));
      }, n.delay);
    });
  };
  window.__key  = (code, repeat = false) => window.dispatchEvent(new KeyboardEvent("keydown", { code, repeat, bubbles: true }));
  window.__text = n => document.body.innerText.slice(0, n || 120).replace(/\n/g, " | ");
  window.__btn  = t => [...document.querySelectorAll("button")].find(b => b.textContent.includes(t));
  window.confirm = () => true;
  console.log("[harness] installed: fake camera, controllable network, helpers");
})();

// A 100-row roster CSV (two teams, numbers 1–50 each, accents, an apostrophe, a 00 goalie).
window.__rosterCSV = (() => {
  const E = ["Smith","Johnson","Williams","Brown","Jones","Garcia","Miller","Davis","Rodriguez","Martinez","Hernandez","Lopez","Gonzalez","Wilson","Anderson","Thomas","Taylor","Moore","Jackson","Martin","Lee","Perez","Thompson","White","Harris","Sanchez","Clark","Ramirez","Lewis","Côté","Walker","Young","Allen","King","Wright","Scott","Torres","Nguyen","Hill","Flores","Green","Adams","Nelson","Baker","Hall","Rivera","Campbell","Mitchell","Carter","Roberts"];
  const H = ["Tremblay","Gagnon","Roy","Bouchard","Gauthier","Morin","O'Brien","Lavoie","Fortin","Gagné","Ouellet","Pelletier","Bélanger","Lévesque","Bergeron","Leblanc","Paquette","Girard","Simard","Boucher","Caron","Beaulieu","Cloutier","Dubé","Poirier","Fournier","Lapointe","Leclerc","Lefebvre","Poulin","Thibault","St-Pierre","Nadeau","Martel","Landry","Bédard","Grenier","Lessard","Bernier","Richard","Michaud","Hébert","Desjardins","Couture","Turcotte","Lachance","Parent","Blais","Gosselin","Dion"];
  const sizes = ["A-S","A-M","A-L","A-XL","Y-M","Y-L"]; const rows = [];
  E.forEach((n, i) => rows.push({ name: n, number: String(i + 1), team: "Eagles", size: sizes[i % 6], goalie: i === 0 ? "Y" : "" }));
  H.forEach((n, i) => rows.push({ name: n, number: i === 12 ? "00" : String(i + 1), team: "Hawks", size: sizes[(i + 2) % 6], goalie: i === 12 ? "Y" : "" }));
  window.__rows = rows;
  return "Name,Number,Team,Size,Goalie\n" + rows.map(r => `${r.name},${r.number},${r.team},${r.size},${r.goalie}`).join("\n") + "\n";
})();

// The 100-jersey run. Needs the order open with the roster above and the camera started.
// Event mix per jersey: normal, nameless read, sleeve-merged number, crumpled (empty read),
// one digit misread with the right name, network down, 429, defect → supervisor (and the
// jersey returning later), hand pull-back and nudge (must NOT scan), 3 not-on-roster (enter
// by hand), 2 duplicates.
window.__startRun = () => (async () => {
  const w = ms => new Promise(r => setTimeout(r, ms));
  // Read the scan overlay when one is up, else the page: the result card under
  // the camera repeats "ENTERED BY HAND" after a by-hand entry and must not
  // look like a live screen.
  const text = () => { const ov = [...document.querySelectorAll("div")].find(d => d.style.position === "fixed" && d.style.zIndex === "1000"); return (ov || document.body).innerText; };
  const key = window.__key, btn = window.__btn;
  const setVal = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); };
  const run = window.__run = { i: 0, total: 0, results: [], started: Date.now(), done: false, errors: [] };
  const rows = window.__rows; const order = rows.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = (i * 7919) % (i + 1); [order[i], order[j]] = [order[j], order[i]]; }
  const ev = [];
  order.forEach((ri, k) => { const r = rows[ri]; let type = "normal"; if (k % 12 === 5) type = "nameless"; else if (k % 20 === 7) type = "sleeve"; else if (k % 25 === 9) type = "crumpled"; else if (k % 33 === 11) type = "digit"; else if (k === 30) type = "netdown"; else if (k === 60) type = "net429"; else if (k === 15 || k === 70) type = "defect"; else if (k === 40) type = "pullback"; else if (k === 80) type = "nudge"; ev.push({ type, row: r }); });
  ev.splice(22, 0, { type: "notOnRoster", row: { name: "ZIELINSKI", number: "88", team: "Eagles", size: "A-L" } });
  ev.splice(50, 0, { type: "notOnRoster", row: { name: "", number: "77", team: "Hawks", size: "A-M" } });
  ev.splice(77, 0, { type: "notOnRoster", row: { name: "ORTIZ", number: "53", team: "Eagles", size: "A-S" } });
  ev.splice(35, 0, { type: "duplicate", row: ev[3].row });
  ev.splice(90, 0, { type: "duplicate", row: ev[10].row });
  const defects = ev.filter(e => e.type === "defect"); ev.push({ type: "return", row: defects[0].row }); ev.push({ type: "return", row: defects[1].row });
  run.total = ev.length;
  const screen = () => { const t = text(); if (t.includes("Confirm — next jersey")) return "green"; if (t.includes("Which jersey is this?") || t.includes("No exact match")) return "pick"; if (t.includes("ALREADY DONE")) return "dup"; if (t.includes("COULD NOT READ")) return "noread"; if (t.includes("NOT FOUND")) return "notfound"; if (t.includes("SCAN FAILED")) return "failed"; if (t.includes("ENTERED BY HAND")) return "manualDone"; if (t.includes("GO TO SUPERVISOR")) return "supervisor"; if (t.includes("What's wrong")) return "reasons"; if (t.includes("Enter the jersey by hand")) return "form"; if (t.includes("Order Complete") || t.includes("Every jersey accounted")) return "complete"; return null; };
  const waitScreen = async (ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (screen()) return screen(); await w(150); } return null; };
  const highlighted = () => { const lines = text().split("\n"); const i = lines.findIndex(l => l.trim() === "← Enter"); if (i > 0) return lines[i - 1]; const b = [...document.querySelectorAll("button")].find(x => [...x.querySelectorAll("kbd")].some(k => k.textContent === "Enter")); return b ? b.textContent : ""; };
  const navigateTo = async pred => { await w(300); for (let n = 0; n < 16; n++) { if (pred(highlighted())) { key("Enter"); return true; } key("KeyA"); await w(120); } return false; };
  const byHand = async r => { const ok = await navigateTo(h => /enter by hand/i.test(h)); await w(500); if (!ok) return false; const ins = [...document.querySelectorAll("input")]; if (ins.length >= 4) { setVal(ins[2], r.size || ""); setVal(ins[3], r.team || ""); } btn("Save")?.click(); await w(600); let s = screen(); if (s === "pick") { await navigateTo(h => /as typed/i.test(h)); await w(600); s = screen(); } key("Enter"); await w(1100); return s === "manualDone"; };
  const place = async (r, read) => { __net.fake = read; __draw("table"); await w(1300); __draw("jersey", (r.name || "").toUpperCase(), r.number); };
  let first = true, prev = null;
  for (const e of ev) {
    const r = e.row, t0 = Date.now(), c0 = __net.calls;
    const res = { k: run.i, type: e.type, jersey: `#${r.number} ${r.name}`.trim(), screens: [], ok: false, handsFree: null };
    try {
      const good = { name: r.name, number: r.number, sleeve_numbers: [] };
      let read = good;
      if (e.type === "nameless") read = { name: "", number: r.number, sleeve_numbers: [] };
      if (e.type === "sleeve")   read = { name: r.name, number: r.number + r.number, sleeve_numbers: [r.number, r.number] };
      if (e.type === "crumpled") read = { name: "", number: "", sleeve_numbers: [] };
      if (e.type === "digit")    read = { name: r.name, number: String((Number(r.number) % 50) + 1), sleeve_numbers: [] };
      if (e.type === "netdown")  __net.mode = "down";
      if (e.type === "net429")   __net.mode = "429once";
      if ((e.type === "pullback" || e.type === "nudge") && prev) { const cb = __net.calls; __draw("jersey", (prev.name || "").toUpperCase(), prev.number, e.type === "nudge" ? { dx: 18 } : { hand: "right" }); await w(600); if (e.type === "pullback") __draw("jersey", (prev.name || "").toUpperCase(), prev.number); await w(2300); res.falseScan = __net.calls > cb; if (res.falseScan) res.screens.push("FALSE-SCAN"); if (screen()) { key("KeyR"); await w(300); } }
      await place(r, read);
      if (first) { await w(400); key("KeyB"); }
      let s = await waitScreen(4500);
      res.handsFree = !first && !!s; first = false;
      if (!s) { key("KeyB"); s = await waitScreen(5000); res.screens.push("B-fallback"); }
      res.screens.push(s);
      const finish = async () => {
        s = screen();
        if (s === "green")    { await w(250); key("Enter"); await w(1100); res.ok = true; return; }
        if (s === "pick")     { if (e.type === "notOnRoster") { res.ok = await byHand(r); res.screens.push(res.ok ? "byHand" : "BYHAND-MISS"); return; } const target = r.name ? r.name : r.team; const found = await navigateTo(h => h.includes(target)); await w(600); if (!found) { res.screens.push("PICK-MISS"); key("KeyR"); await w(400); return; } res.screens.push(screen()); if (screen() === "green") { await w(250); key("Enter"); await w(1100); res.ok = true; } return; }
        if (s === "dup")      { await w(250); key("Enter"); await w(500); res.ok = true; return; }
        if (s === "noread" || s === "failed") { await w(250); key("KeyR"); await w(500); __net.fake = good; __net.mode = "ok"; key("KeyB"); await waitScreen(5000); res.screens.push(screen()); await finish(); return; }
        if (s === "notfound") { res.ok = await byHand(r); res.screens.push(res.ok ? "byHand" : "BYHAND-MISS"); return; }
        if (s === "complete") { btn("Review first")?.click(); await w(300); res.ok = true; return; }
        res.screens.push("UNHANDLED:" + s);
      };
      if (e.type === "defect" && s === "green") { await w(250); key("KeyA"); await w(150); key("KeyA"); await w(150); key("Enter"); await w(500); res.screens.push(screen()); key("KeyA"); await w(120); key("KeyA"); await w(120); key("KeyA"); await w(120); key("Enter"); await w(600); res.screens.push(screen()); key("Enter"); await w(800); res.ok = screen() === null; }
      else if (e.type === "duplicate") { if (s === "dup") { await w(250); key("Enter"); await w(500); res.ok = true; } else { res.screens.push("EXPECTED-DUP"); await finish(); } }
      else await finish();
      prev = r;
      res.scans = __net.calls - c0; res.ms = Date.now() - t0; res.armedAfter = text().includes("Waiting for the next jersey");
    } catch (err) { res.error = String(err); run.errors.push(String(err)); }
    run.results.push(res); run.i++;
    if (screen() && screen() !== "complete") { key("KeyR"); await w(300); if (screen()) { key("Enter"); await w(300); } }
  }
  run.done = true; run.finished = Date.now();
  console.log("[run] done", run);
})();
