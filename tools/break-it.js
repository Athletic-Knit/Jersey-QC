/* eslint-disable */
// ── Break-it suite ────────────────────────────────────────────────────────────
// Needs tools/browser-harness.js installed first (fake camera + fake network),
// the station signed in with the 100-row harness roster open and the camera on.
// Then:  __breakIt()  — results land in window.__breakItResults while it runs.
// Every step tries one way the app used to break (or never handled) and checks
// what the screen does now. The station keeps running; nothing here reloads.

window.__breakIt = async function () {
  const R = (window.__breakItResults = { steps: [], started: Date.now(), done: false });
  const w = ms => new Promise(r => setTimeout(r, ms));
  const body = () => document.body.innerText;
  const ov = () => [...document.querySelectorAll("div")].find(d => d.style.position === "fixed" && d.style.zIndex === "1000");
  const screen = () => {
    const o = ov();
    if (!o) { const b = body(); return (b.includes("Order Complete") || b.includes("Every jersey accounted")) ? "complete" : null; }
    const t = o.innerText;
    if (t.includes("Confirm — next jersey")) return "green";
    if (t.includes("Which jersey is this?") || t.includes("No exact match")) return "pick";
    if (t.includes("ALREADY DONE")) return "dup";
    if (t.includes("COULD NOT READ")) return "noread";
    if (t.includes("NOT FOUND")) return "notfound";
    if (t.includes("SCAN FAILED")) return "failed";
    if (t.includes("ENTERED BY HAND")) return "manualDone";
    if (t.includes("GO TO SUPERVISOR")) return "supervisor";
    if (t.includes("What's wrong")) return "reasons";
    if (t.includes("Enter the jersey by hand")) return "form";
    return "other:" + t.split("\n")[1];
  };
  const waitScreen = async (ms = 7000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const s = screen(); if (s) return s; await w(150); } return null; };
  const waitGone = async (ms = 3000) => { const t0 = Date.now(); while (ov() && Date.now() - t0 < ms) await w(150); return !ov(); };
  const highlighted = () => {
    const o = ov(); if (!o) return "";
    const lines = o.innerText.split("\n"); const i = lines.findIndex(l => l.trim() === "← Enter"); if (i > 0) return lines[i - 1];
    const b = [...o.querySelectorAll("button")].find(x => [...x.querySelectorAll("kbd")].some(k => k.textContent === "Enter")); return b ? b.textContent : "";
  };
  const navTo = async re => { for (let n = 0; n < 16; n++) { if (re.test(highlighted())) return true; __key("KeyA"); await w(140); } return false; };
  const press = async (c, ms = 450) => { __key(c); await w(ms); };
  const badge = () => (body().match(/Waiting for the next jersey…|Hands-free paused[^\n]*|Order done[^\n]*|Ready/) || ["?"])[0];
  const counts = () => (body().match(/(\d+) \/ (\d+)/) || [])[0];
  const done = () => Number((body().match(/(\d+) \/ (\d+)/) || [])[1] || 0);
  const flags = () => Number((body().match(/(\d+) Flag/) || [])[1] || 0);
  const byHand = () => Number((body().match(/(\d+) By hand/) || [])[1] || 0);
  const tableRows = () => document.querySelectorAll("table tr").length;
  const setVal = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); };
  const rows = window.__rows;
  const byName = n => rows.find(r => r.name === n);
  const place = async (read, name, num, opts = {}) => { __net.fake = read; __draw("table"); await w(opts.tableMs ?? 900); __draw("jersey", (name || "").toUpperCase(), num ?? "", opts.draw || {}); };
  const good = r => ({ name: r.name, number: r.number, sleeve_numbers: [] });
  const confirmGreen = async () => { await w(300); await press("Enter", 1000); return waitGone(); };
  const clear = async () => { for (let n = 0; n < 3 && ov(); n++) { if (screen() === "form") { await press("Escape", 400); } else if (["reasons"].includes(screen())) { await press("Escape", 300); await press("KeyR", 400); } else { await press("KeyR", 500); if (ov()) await press("Enter", 700); } } };
  const step = async (name, fn) => {
    const s = { name, ok: false, detail: "" }; R.steps.push(s);
    try { const r = await fn(); s.ok = !!r.ok; s.detail = r.detail || ""; } catch (e) { s.detail = "threw: " + e.message; }
    if (ov()) { s.detail += ` [overlay left: ${screen()}, cleared]`; await clear(); }
    return s;
  };
  let used = 0;
  const next = () => rows[[3, 17, 41, 58, 72, 90, 26, 64, 8, 33, 47, 81, 95, 12][used++ % 14]];

  // 1 — first jersey needs B, then green, Enter
  await step("First jersey: B → green → Enter", async () => {
    const r = next(); await place(good(r), r.name, r.number); await w(300); await press("KeyB", 0);
    const s = await waitScreen(); const ok = s === "green" && (await confirmGreen()) && done() === 1;
    return { ok, detail: `screen=${s} counts=${counts()}` };
  });
  // 2 — hands-free picks up the next placement with no key
  await step("Hands-free scans the next placement without a key", async () => {
    const r = next(); const c0 = __net.calls; await place(good(r), r.name, r.number);
    const s = await waitScreen(5000); const ok = s === "green" && (await confirmGreen()) && done() === 2;
    return { ok, detail: `screen=${s} scans=${__net.calls - c0} badge=${badge()}` };
  });
  // 3 — same jersey again: ALREADY DONE, skip records nothing
  await step("Same jersey twice → ALREADY DONE, skip records nothing", async () => {
    const r = rows[17]; await place(good(r), r.name, r.number); const s = await waitScreen(5000);
    const before = done(); await press("Enter", 900); return { ok: s === "dup" && done() === before && !ov(), detail: `screen=${s} counts=${counts()}` };
  });
  // 4 — sleeve merge 777 → pick list offering the #7 rows
  await step("Sleeve merge 777 → pick list with the #7 rows", async () => {
    const r = byName("Miller"); await place({ name: r.name, number: "777", sleeve_numbers: ["7", "7"] }, r.name, 7);
    const s = await waitScreen(5000); const offered = ov()?.innerText.includes("Miller"); const nav = await navTo(/Miller/); await press("Enter", 600);
    const g = screen(); const ok = s === "pick" && offered && nav && g === "green" && (await confirmGreen());
    return { ok, detail: `screen=${s} offered=${offered} then=${g}` };
  });
  // 5 — crumpled: empty read → COULD NOT READ with the tip → R → B → green
  await step("Crumpled (empty read) → COULD NOT READ + tip → R → rescan green", async () => {
    const r = next(); await place({ name: "", number: "", sleeve_numbers: [] }, "", ""); const s = await waitScreen(5000);
    const tip = ov()?.innerText.includes("Flatten the number"); __net.fake = good(r); await press("KeyR", 600); const gone = !ov(); await press("KeyB", 0);
    const s2 = await waitScreen(); const ok = s === "noread" && tip && gone && s2 === "green" && (await confirmGreen());
    return { ok, detail: `screen=${s} tip=${tip} afterR=${s2}` };
  });
  // 6 — right name, wrong number: never green, name's row offered first
  await step("Right name wrong number → never green; the name's row first", async () => {
    const r = byName("Lopez"); await place({ name: r.name, number: "21", sleeve_numbers: [] }, r.name, 21); const s = await waitScreen(5000);
    const first = highlighted(); await press("Enter", 600); const g = screen(); const shows = ov()?.innerText.includes(`#${r.number}`);
    const ok = s === "pick" && /Lopez/.test(first) && g === "green" && shows && (await confirmGreen());
    return { ok, detail: `screen=${s} first=${first.slice(0, 30)} green=${g} shows#${r.number}=${shows}` };
  });
  // 7 — nameless read, number shared by two teams → pick by team
  await step("Nameless read with a shared number → pick the team", async () => {
    const r = rows.find(x => x.number === "15" && x.team === "Hawks"); await place({ name: "", number: "15", sleeve_numbers: [] }, "", 15); const s = await waitScreen(5000);
    const two = (ov()?.innerText.match(/#15/g) || []).length >= 2; const nav = await navTo(/Hawks/); await press("Enter", 600); const g = screen();
    const ok = s === "pick" && two && nav && g === "green" && (await confirmGreen());
    return { ok, detail: `screen=${s} twoRows=${two} nav=${nav}` };
  });
  // 8 — near miss 88 (roster has 8): W → prefilled form → Save → GO TO SUPERVISOR, nothing added
  await step("Near miss 88 → W → Save → GO TO SUPERVISOR, roster unchanged", async () => {
    const rowsBefore = tableRows(); const f0 = flags(); await place({ name: "ZIELINSKI", number: "88", sleeve_numbers: [] }, "ZIELINSKI", 88); const s = await waitScreen(5000);
    await press("KeyW", 500); const form = screen(); const pre = document.querySelector("input")?.value; __btn("Save")?.click(); await w(900); const s2 = screen();
    const ok = s === "pick" && form === "form" && pre === "88" && s2 === "supervisor" && tableRows() === rowsBefore; await press("Enter", 800);
    return { ok: ok && flags() === f0 + 1, detail: `screen=${s} form=${form} prefilled=${pre} then=${s2} rows ${rowsBefore}→${tableRows()} flags ${f0}→${flags()}` };
  });
  // 9 — COULD NOT READ → W → type a roster jersey → MANUAL
  await step("COULD NOT READ → W → typed roster jersey → ENTERED BY HAND (MANUAL)", async () => {
    const r = byName("Fortin"); const h0 = byHand(); await place({ name: "", number: "", sleeve_numbers: [] }, "", ""); await waitScreen(5000);
    await press("KeyW", 500); const ins = [...document.querySelectorAll("input")]; setVal(ins[0], r.number); setVal(ins[1], r.name); __btn("Save")?.click(); await w(900);
    const s2 = screen(); const shows = ov()?.innerText.includes(r.name); await press("Enter", 900);
    return { ok: s2 === "manualDone" && shows && byHand() === h0 + 1, detail: `then=${s2} shows=${shows} byHand ${h0}→${byHand()}` };
  });
  // 10 — typed name with a wrong number → typed list → pick → green with the typed note
  await step("Typed name + wrong number → typed list → pick → green with 'Typed by operator'", async () => {
    const r = byName("Garcia"); await place({ name: "", number: "", sleeve_numbers: [] }, "", ""); await waitScreen(5000);
    await press("KeyW", 500); const ins = [...document.querySelectorAll("input")]; setVal(ins[0], "16"); setVal(ins[1], r.name); __btn("Save")?.click(); await w(900);
    const s2 = screen(); const notOnRoster = ov()?.innerText.includes("is not on the roster"); const nav = await navTo(/Garcia/); await press("Enter", 600);
    const g = screen(); const note = ov()?.innerText.includes("Typed by operator"); const ok = s2 === "pick" && notOnRoster && nav && g === "green" && note && (await confirmGreen());
    return { ok, detail: `list=${s2} escape=${notOnRoster} nav=${nav} green=${g} note=${note}` };
  });
  // 11 — defect: Not right → first reason → GO TO SUPERVISOR with the route
  await step("Defect: Not right → reason → GO TO SUPERVISOR", async () => {
    const r = next(); const f0 = flags(); await place(good(r), r.name, r.number); await waitScreen(5000);
    const nav = await navTo(/Not right/); await press("Enter", 500); const s = screen(); await press("Enter", 700); const s2 = screen(); const route = ov()?.innerText.includes("Supervisor →");
    await press("Enter", 800); return { ok: nav && s === "reasons" && s2 === "supervisor" && route && flags() === f0 + 1, detail: `reasons=${s} then=${s2} route=${route}` };
  });
  // 12 — free-text reason
  await step("Free-text reason: 'Something else' → typed → GO TO SUPERVISOR shows the words", async () => {
    const r = next(); const f0 = flags(); await place(good(r), r.name, r.number); await waitScreen(5000);
    await navTo(/Not right/); await press("Enter", 500);
    const item = [...ov().querySelectorAll("div")].filter(d => /Something else/.test(d.innerText) && d.innerText.length < 80).sort((a, b) => b.innerText.length - a.innerText.length)[0]; item?.click(); await w(500);
    const inp = ov()?.querySelector("input"); if (inp) { inp.focus(); setVal(inp, "hole under the left arm"); await w(100); inp.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); await w(800); }
    const s2 = screen(); const words = ov()?.innerText.includes("hole under the left arm"); await press("Enter", 800);
    return { ok: !!inp && s2 === "supervisor" && words && flags() === f0 + 1, detail: `form=${!!inp} then=${s2} words=${words}` };
  });
  // 13 — network down once → the read retries by itself → green
  await step("Network drops once → automatic retry → green", async () => {
    const r = next(); __net.mode = "down"; await place(good(r), r.name, r.number); const c0 = __net.calls; const s = await waitScreen(9000);
    return { ok: s === "green" && (await confirmGreen()), detail: `screen=${s} calls=${__net.calls - c0}` };
  });
  // 14 — 429 once → retry → green
  await step("API answers 429 once → automatic retry → green", async () => {
    const r = next(); __net.mode = "429once"; await place(good(r), r.name, r.number); const c0 = __net.calls; const s = await waitScreen(9000);
    return { ok: s === "green" && (await confirmGreen()), detail: `screen=${s} calls=${__net.calls - c0}` };
  });
  // 15 — hand pull-back after placing: no scan
  await step("Hand resting then pulled back → no scan", async () => {
    const r = rows[64]; const c0 = __net.calls; __draw("jersey", r.name.toUpperCase(), r.number, { hand: "right" }); await w(700); __draw("jersey", r.name.toUpperCase(), r.number); await w(2600);
    return { ok: __net.calls === c0 && !ov(), detail: `scans=${__net.calls - c0}` };
  });
  // 16 — nudge the jersey that was just scanned: should not scan again
  await step("Nudge the scanned jersey → no re-scan (threshold)", async () => {
    const r = rows[64]; const c0 = __net.calls; __draw("jersey", r.name.toUpperCase(), r.number, { dx: 18 }); await w(3000);
    const s = screen(); const ok = __net.calls === c0 && !ov(); return { ok, detail: ok ? "no scan" : `scanned → ${s} (threshold to tune on real fabric; safe)` };
  });
  // 17 — a dialog pauses hands-free; closing it re-arms
  await step("Settings open: placement does not scan; closing re-arms", async () => {
    [...document.querySelectorAll("button")].find(b => b.textContent.trim() === "⚙")?.click(); await w(400); const r = next(); const c0 = __net.calls;
    await place(good(r), r.name, r.number); await w(2500); const quiet = __net.calls === c0 && !ov(); __btn("Cancel")?.click(); await w(600); const b = badge();
    const s = await waitScreen(5000); const ok = quiet && b === "Waiting for the next jersey…" && s === "green" && (await confirmGreen());
    return { ok, detail: `quietBehindDialog=${quiet} badgeAfterClose=${b} then=${s}` };
  });
  // 18 — pause hands-free from the panel: no auto scan, B works, resume re-arms
  await step("Pause hands-free: no auto scan, B still works, resume re-arms", async () => {
    __btn("⏸ Hands-free")?.click(); await w(400); const b1 = badge(); const r = next(); const c0 = __net.calls; await place(good(r), r.name, r.number); await w(2500); const quiet = __net.calls === c0;
    await press("KeyB", 0); const s = await waitScreen(); const okB = s === "green" && (await confirmGreen()); __btn("▶ Hands-free")?.click(); await w(400); const b2 = badge();
    return { ok: /paused/.test(b1) && quiet && okB && b2 === "Waiting for the next jersey…", detail: `paused='${b1}' quiet=${quiet} B=${s} resumed='${b2}'` };
  });
  // 19 — Change operator keeps the order
  await step("Change operator keeps order, roster and log", async () => {
    const before = counts(); const logN = (body().match(/Log \((\d+)\)/) || [])[1]; __btn("Change operator")?.click(); await w(500);
    const modal = body().includes("Hand this station"); const pin = document.querySelector("input[type=password]"); const name = [...document.querySelectorAll("input")].find(i => /John Smith/.test(i.placeholder || ""));
    setVal(pin, "1111"); setVal(name, "Priya"); await w(100); __btn("Take over")?.click(); await w(800);
    const who = (body().match(/Priya \(inspector\)/) || [])[0]; const after = counts(); const logAfter = (body().match(/Log \((\d+)\)/) || [])[1];
    return { ok: modal && !!who && after === before && logAfter === logN, detail: `modal=${modal} who=${who} counts ${before}→${after} log ${logN}→${logAfter} badge=${badge()}` };
  });
  // 20 — key held down (repeat) fires once
  await step("Held key (repeat events) acts once", async () => {
    const r = next(); await place(good(r), r.name, r.number); await waitScreen(5000); const before = done();
    __key("Enter", true); __key("Enter", true); await w(300); const still = !!ov(); await press("Enter", 1000);
    return { ok: still && done() === before + 1, detail: `repeat ignored=${still} counts=${counts()}` };
  });
  // 21 — supervisor's roster arrived mid-order → banner (the supervisor tab sends it during the run)
  await step("Roster sent mid-order shows a banner on the station", async () => {
    let banner = null; const t0 = Date.now(); while (Date.now() - t0 < 15000) { banner = (body().match(/[^\n]*is waiting for you[^\n]*/) || [])[0]; if (banner) break; await w(500); }
    return { ok: !!banner, detail: banner || "no banner within 15 s (was a roster sent during the run?)" };
  });
  // 22 — dead camera: stop the track → scan refused with a clear message → Start Camera brings it back
  await step("Camera dies → scan refused with a message → Start Camera recovers", async () => {
    window.__stream?.getVideoTracks()[0]?.stop(); await w(500); await press("KeyB", 800); const msg = (body().match(/Camera disconnected[^\n]*/) || [])[0];
    const startBtn = __btn("Start Camera"); startBtn?.click(); await w(2200); const back = body().includes("Press B to scan") || body().includes("Waiting") || body().includes("Ready");
    return { ok: !!msg && !!startBtn && back, detail: `message=${!!msg} startCamera=${!!startBtn} back=${back}` };
  });
  R.done = true; R.finished = Date.now(); R.passed = R.steps.filter(s => s.ok).length;
  console.log("[break-it] done", R.passed + "/" + R.steps.length, R);
  return R;
};
console.log("[break-it] loaded — run __breakIt()");
