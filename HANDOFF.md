# Jersey QC Scanner — hand-off (20 Oct 2026)

Read this first in a new chat. It is the state of the project, how to run and test it, what exists, and what is next. The chat before this one ran out of context on 19 Oct after a very long day of changes; everything below is current as of commit `7ad063c` on branch `phase-1-rostering`.

## What this is

A React/Vite web app for Athletic Knit's finishing floor. An overhead camera photographs the back of a jersey; Claude Haiku reads the name and number; the app matches it against the order's roster and tells the operator the size and bin. A supervisor on another PC sees every station live, sends orders to stations, gets alerts, and pulls reports. Three co-op students: the user (aerospace) and another aerospace co-op own this app; a comp-sci co-op is building the roster/order server. Phases: **1 rostering (done, this work)** → 2 reporting (partly done: day sheet, order view) → 3 packing (weigh scale) → supervisor commands.

## Repo and GitHub

- Local repo in this folder. `master` = the prototype as floor-tested on 15 Oct (`17df521`, the zip snapshot). **`phase-1-rostering`** = all new work, 36 commits, working tree clean.
- **GitHub:** `https://github.com/Athletic-Knit/Jersey-QC`, remote `origin`. The branch is pushed (`git push` from this checkout updates it). GitHub's `master` was NOT touched and still sits at `c37729a` "Add sample roster CSV". The two histories are unrelated (the zip had no history), so a pull request will show the whole app as changed and the merge needs `--allow-unrelated-histories`; GitHub's master also has a `samples/sample-roster.csv` and had removed the .bat — keep both when merging. No PR has been opened, on purpose.
- Checks: `npx eslint src/ hub-plugin.js` must be clean; `npx vitest run` = 56 unit tests in `src/lib/__tests__`. Both passed at hand-off.

## How to run

- **Floor / demo:** double-click `Start Jersey QC.bat`. HTTPS on 5173, bound to all interfaces, self-signed certificate (other PCs click Advanced → Proceed once; the camera needs HTTPS). The console window IS the server; it prints `Other PCs: https://<ip>:5173`. **The IP changes when the Wi-Fi reconnects** (it went from 192.168.0.209 to 10.61.28.136 on 19 Oct) — the window's line is the truth.
- **From a terminal:** `npm.cmd run dev` (PowerShell's script policy blocks the plain `npm` wrapper on this PC). A server started from Claude's browser pane dies when the pane closes — use the .bat or a terminal tab.
- **Firewall:** other PCs cannot reach 5173 until a person with admin rights runs once:
  `netsh advfirewall firewall add rule name="Jersey QC 5173" dir=in action=allow protocol=TCP localport=5173 profile=domain,private`
  Never done yet.
- **Testing in Claude's browser pane:** the pane cannot accept the self-signed cert, so use `npx vite --config vite.config.diag.js` (or the `jersey-qc-test` entry in `.claude/launch.json`) → plain HTTP on 5174 with its own hub file `data/hub-test.json`, so tests never touch the live hub. `vite.config.diag.js` is gitignored.
- **Links:** supervisor `https://localhost:5173/?station=supervisor`; operator `https://<ip>:5173/?station=line1`. `?station=<name>` fixes the station's label on the supervisor's board ("Line 1") and keeps that station's saved session and sign-in separate — without it the card shows a random id.
- **API key:** `.env.local` → `VITE_CLAUDE_API_KEY` (works, ~$0.001 per jersey on Haiku 4.5). Never print it; the dev server serves it inside `/src/App.jsx` (known, deployment item C6). Role PINs default `1111/2222/3333/9999` (inspector/packer/supervisor/admin) in `src/config.js`, overridable with `VITE_PIN_*`; soft gate only.
- **Hub state:** `data/hub.json` (gitignored) — stations, rosters, and a per-day ledger of every scan and order (two weeks kept). Changing `hub-plugin.js` restarts the dev server (pages reload; the supervisor sees "hub stopped answering" for two seconds).

## Demo runbook (two PCs)

Host PC = server + supervisor; operator PC = station. The full runbook with the break-it table is a Claude doc: https://claude.ai/code/artifact/63871e44-5a8b-4149-97a5-51ee96f8bf12. Short form:

1. Host: start the .bat; firewall rule once; Chrome → supervisor link → Supervisor, PIN 3333 → Supervisor view → bell button for sound and desktop alerts (Chrome prompts after the click).
2. Operator: Chrome → operator link → Proceed past the certificate → allow camera → Full screen button (or F11) → Inspector, PIN 1111. The station appears on the supervisor's board at once as "Waiting for an order".
3. Supervisor: Send to → that station (or any) → order number (required) → notes → roster file → Send to stations. It appears on the station's order screen within 5 s, tagged "for this station". Operator taps it, Start order, bins, Start Camera.
4. Scan. Supervisor watches the card (live count, today's total, pace, needs-you list), gets toasts for flags and by-hand entries, opens any order on screen (Open order), downloads an order's QC Results sheet, and at the end of the day the Day sheet.

## Code map

- `src/App.jsx` (2,100 lines, one file by design): `SignInModal` (also used for Change operator), `OrderSetupModal` (supervisor rosters polled every 5 s, or a file), `LivePreview`, `ReasonTextForm`, `ManualEntryForm`, `OrderView` (supervisor's roster/problems/log for one order), `SupervisorPanel`, `ScanOverlay` (the green/yellow/red/pick/by-hand screens; option-list model; `embedded` on wide screens), `ResultCard`, `SettingsPanel`, `BinSetupModal`, `RosterCompleteModal`, `App`.
- `src/lib/match.js` — `findMatches` (exact / duplicate / pick / close / none), sleeve-merge guard, name-overrides-number, one-digit fuzzy; `isDone`.
- `src/lib/roster.js` — CSV/Excel parsing, aliases, header/sheet detection, size merge, bins, extra columns; **drops the app's own export columns** (Status, Bin, Reason, Resolution, Inspected By, Time) so a re-used export is a roster, not results.
- `src/lib/motion.js` — hands-free gate: lift → settle → texture → place → scan; thresholds measured on the 32×18 sample (`sameBelow 2.5`, `changeAt 10`, `minTexture 5`); re-baselines on a nudge; logs `[hands-free] …` to the console.
- `src/lib/vision.js` — the camera prompt (loose plates allowed, any orientation, read the largest item, never empty out of caution, G/C O/Q B/8 hints, JSON only), 25 s timeout, one retry on network/429/5xx.
- `src/lib/persist.js` — session, settings (v2), sign-in; keyed by `?station=` when present.
- `src/lib/export.js` — QC Results workbook (`buildRosterSheet`/`exportRosterXLSX`), log CSV, **day sheet** (`buildDaySheets`/`exportDaySheetXLSX`).
- `src/lib/hub.js` — hub client; `stationId()` (URL name or stored id); `snapshotOf()` = what a station reports every 5 s: counts, last scan, attention items, **every scan event (compact), the roster with each jersey's status, bins**.
- `hub-plugin.js` — Vite plugin, the hub: `GET/POST/DELETE /api/hub/stations[/:id]`, `DELETE /api/hub/stations/:id/carried?key=`, `GET/POST/DELETE /api/hub/rosters[/:id]` (rosters carry `forStation`), `GET /api/hub/ledger?date=`. Per station it keeps carried items across order changes, a day tally, a 20-minute pace history; per day a ledger of events and orders. Same shape for the comp-sci co-op's server to adopt.
- `src/config.js` — model, CHECKLIST chips, REASONS (incl. "Something else — type it"), ROLES/PINs, DEFAULT_SETTINGS (keys: B scan, Enter select, A/arrows next, R retry, W enter by hand; rotation; camera; autoScan).
- `tools/browser-harness.js` — fake camera + controllable network + 100-jersey driver for the pane. `tools/break-it.js` — 22-scenario suite (`__breakIt()`, results in `window.__breakItResults`).

## What the station does (operator)

- Sign in once per shift by role + PIN. **Change operator** hands the station over without losing the order. Sign out clears the order (after a confirm). Saved session resumes after a reload.
- Order screen: rosters from the supervisor (only those sent to this station or to anyone; polled every 5 s; "Waiting for the supervisor to send an order" when empty) or a file. Bins per team. Order notes shown on every jersey.
- Scan with B; after the first confirmed jersey hands-free scans each placement (lift → place → scan). **Hands-free is off once the order has nothing left**, pauses behind any dialog and re-arms when it closes, and the **⏸ Pause scan / ▶ Hands-free** button beside SCAN turns it on, pauses it (camera stays on, B still works) or resumes it.
- Result screens: green (confirm / retry / not right), yellow pick list (shared numbers, near misses, sleeve merges), red (NOT FOUND, COULD NOT READ, SCAN FAILED, ALREADY DONE, GO TO SUPERVISOR) with tips. On screens ≥ 1000 px the result takes the **right half and the camera stays in view**; narrower screens get the full-screen version with a live camera window.
- Keys everywhere: Enter select, A/↓ next, R retry (nothing recorded), **W enter by hand**; all configurable; a held key fires once.
- **Enter by hand:** on the roster → that row passes as MANUAL for the supervisor's sign-off; **not on the roster → nothing is added**, GO TO SUPERVISOR, the supervisor is told at once. A list reached after typing has "None of these — #88 X is not on the roster" (W).
- **Defects:** Not right → reason (with route) or "Something else — type it" → GO TO SUPERVISOR; supervisor's toast carries the words.
- **Un-check:** "↶ Undo — scan again" on the last-jersey line, or "Un-check — scan again" in the roster's Mark dropdown; one confirm; an `undo` log line; open flags for that row are closed.
- Missing / short-shipped marks; Accept / Reject / note on flagged and by-hand items; Add or Replace roster mid-order with confirm; Excel export (every row with status) and log CSV; camera picker, rotation, liveness check ("Camera disconnected"); Full screen button; a pill when the hub is unreachable (scanning continues); a banner when the supervisor sends a roster mid-order.

## What the supervisor sees

- One screen, `Supervisor view`: header `447 jerseys today · 2 of 3 stations live`; a card per station in a fixed order with the live count big, today's tally, pace and time left, the jersey it is on, a Needs-you list (newest three), items still open from earlier orders with Done, Open order and Remove (stale or finished cards only). A signed-in station with no order shows "Waiting for an order".
- **Alerts:** red toast for a flag or a not-on-roster jersey, amber for a by-hand entry, with station · operator · jersey · reason; tone; "N need you" until Mark all seen; desktop notifications after one click (Chrome prompts; blocked in Claude's pane); amber backlog banner when the view opens late; red "hub stopped answering" bar with Retry.
- **Send a roster:** Send to (any station, or one by name — stations are listed as soon as they sign in), order number (required), notes, CSV/Excel. Rosters waiting list with Remove.
- **Orders today:** every order any station worked today, finished or in progress, each with **Open order** (roster with every jersey's status, Problems tab, Log tab, refreshes while running) and **⬇ Order sheet** (the same QC Results workbook the station exports). An order a station worked before its page was reloaded on 19 Oct has no jersey list on the hub; the view says so and points to the station's Export.
- **⬇ Day sheet (Excel):** Summary per station and all (passed, by hand, to supervisor, not on roster, un-checked, first/last scan, active minutes with gaps > 10 min left out, jerseys per active hour (blank under 2 active minutes), median seconds per jersey), Orders, Flags by reason, Every scan. This is the "is the app helping" sheet: compare pace against the same order by hand.
- Latency: a station reports every 5 s, the view polls every 4 s, so ≤ 9 s. The view closes only through its Back button.

## Testing

- **Unit:** `npx vitest run` (56). **Lint:** eslint; note the rule `react-hooks/set-state-in-effect` — re-arms and similar live in event handlers, not effects.
- **Pane:** start the 5174 test server; in the station tab run `(0, eval)(await fetch('/tools/browser-harness.js').then(r => r.text()))` before Start Camera (no `?raw`). Then `(0, eval)(await fetch('/tools/break-it.js').then(r => r.text())); __breakIt()` with the harness roster open. Editing the harness or the suite reloads the page. **After editing anything in `src/lib`, hard-reload open station pages** (Fast Refresh keeps old objects in refs; the prompt and the gate are examples).
- Driver lessons (in `tools/break-it.js` comments too): an "empty read" must still draw text on the fake jersey; pull-back must redraw the last scanned jersey; read form inputs from the overlay, because the page's first input is the header's order-number box.
- `scratchpad` scripts from 19 Oct (not in the repo): `prompt-compare.mjs` sends a photo through the real API with old and new prompts — the seed of the evidence loop.
- **Results on record:** 100-jersey driver run 107/107 (16 Oct); three-station simulation 100/200/300 (19 Oct); break-it suite 22/22 on the app side (19 Oct); real-fabric test by the user on 19 Oct found: loose name plates read empty with the old prompt (fixed), G read as C sometimes (hints added; near-miss list and the number carry it), hands-free kept scanning the empty table after the last jersey (fixed), a re-used export showed stale PASS marks (fixed), orders invented without numbers (fixed).

## Branch `read-guard` (20 Oct, after the demo)

The demo showed a covered digit going green (#40 with the 0 hidden read as #4 and matched the roster's #4). On this branch: green needs a name and a number read in full (a nameless read on a row that has a name is yellow; a row with no name of its own stays green); the model reports `name_complete`, `number_complete`, `number_position` and `obstruction`, and any partial or off-centre read is yellow with the reason and every row the read could be a piece of; the model is **Sonnet 5.5 with thinking off at low effort**, on an **800 px frame** (`src/lib/vision.js`, `src/config.js`), chosen from a 9-frame × 5-run bench through the real API (`tools/bench-results-2026-10-20*.json`): Haiku 4.5 misses a fold (16/35 caught, 0.8 s, $1.66/1000); Haiku 5.5 catches it only while thinking (29/35 at medium, 4.1 s, $0.47/1000) and flags every clean jersey with thinking off; Sonnet 5.5 without thinking catches 35/35 and passes 10/10 clean at ~1.5 s one at a time ($4.09/1000). Env overrides: `VITE_CLAUDE_MODEL`, `VITE_CLAUDE_EFFORT`, `VITE_CLAUDE_THINKING`, `VITE_SEND_MAX_PX`. Then: colour settles same-number rows (`src/lib/colour.js`; the team column is the jersey colour on orders 41/42), "no alternative, no yellow", a silent second look before any yellow, and **damage photos**: every flag keeps the frame cropped to the jersey (`jersey_box` from the model, `cropDataUrl`), travels to the hub with the flag (newest 6 per report; the hub keeps a photo once seen, writes coalesced to 1.5 s), shows on the supervisor's toast, Needs-you list and the order's Problems tab (click to enlarge), and exports as a **Damage report** workbook with the photos embedded (`src/lib/damage.js`, ExcelJS from the CDN on first use; buttons on the station next to Export, on the supervisor under the Day sheet, and in Open order). The chart was dropped by decision. **Jersey type** (ECHL, ECHL replica = stitched; Sublimated = printed; `JERSEY_TYPES` in `src/config.js`): picked by the supervisor when sending a roster and on the station's order screen, shown as a pill in the station header and the reason menu, and the "not right" menu follows it (`reasonsFor`): twill / stitching for stitched, print / colour / fabric for sublimated; the type is in the QC Results header, the day sheet's Orders tab and every damage-report row. The result screen is half-and-half at every width now (the <1000 px full-screen mode is gone); supervisor toasts last 12 s, two at most, with the standing count in the header. **Folds** (20 Oct, late): the model reports `laid_flat` and is given the order's open numbers in the prompt ("a lone 5 on an order with a 35: look for a fold"); a not-flat or possibly-folded read is doubtful → yellow only when another open row could be the jersey. The fixed prompt is cached server-side (`cache_control`), sleeve_numbers and jersey_box were dropped from the answer for speed (the photo is the whole 640 px frame). Measured 20 Oct afternoon, one at a time: median ~1.5–1.8 s, 35/35 covered frames caught incl. two seamless folds, 10/10 clean; ~$2.9 per 1000 jerseys. **Hand gestures were built (e97af9d) and reverted (c30061d) by decision.** The simulation (`public/sim/` frames, gitignored) runs by drawing real photos onto the harness canvas with `window.fetch = window.__origFetch` for the real model. Tests: `src/lib/__tests__/readguard.test.js`, `damage.test.js`. Untested so far: a hidden digit on a number-only roster where the remaining digit lands dead centre.

## Open items / next

1. **Supervisor commands** (agreed with the user, not started): on an alert, resolve from the laptop — defect: department buttons (decoration / stitcher / cleaning / remake) pre-selected from the reason + Reject + Note, recording "out to stitcher since 10:42 by Sam" and generating a **printable pink slip** (the pink copy of the order paper that travels with one jersey); by-hand: Accept / Reject / Note; not on roster: Add to order / Not ours / Note. Plus a one-line message to a station. Mechanism: a command queue per station on the hub, delivered in the 5-second report's response. The user was going to describe/photograph a real pink slip.
2. **Hands-free thresholds on real fabric** (`changeAt` etc. in `motion.js`, console numbers). A jersey swapped while a dialog is open is not scanned on close if it looks too like the previous one (lift and re-place, or B).
3. **Deployment** (by decision not done): firewall rule (needs admin), fixed address/hostname, real certificate, API key off the page onto the server, production build instead of the dev server, Windows service, rate limit, no authentication on the hub, Windows kiosk launcher (user liked the idea, declined for now).
4. Untested on real hardware: USB unplug, rotation on the real mount, two cameras.
5. Nice-to-haves noted: Day sheet for a past date (the ledger has two weeks); 52 s before a dead API reports (25 s × 2); a hand resting still on the empty table can read as a jersey.
6. Later phases: evidence loop (save scan image + outcome → replay set → A/B models), pink-slip printing proper, packing with the weigh scale.

## Docs (Claude docs, living)

- Monday demo runbook: https://claude.ai/code/artifact/63871e44-5a8b-4149-97a5-51ee96f8bf12
- What's new since the floor test (for the manager): https://claude.ai/code/artifact/ada35bf5-8608-4daf-9f0e-9f2c6acd9643
- Common Review and Phase 1 Plan (issue list): https://claude.ai/code/artifact/dc9f84d9-4ee7-46d2-8376-fec43e07832a
- Phase 1 Findings & Fixes: https://claude.ai/code/artifact/921a053f-0ea6-4c07-9994-2ec510eed72f

## Tooling quirks on this machine

Write/Edit tools decode `\uXXXX` in file content into the literal character — never put `\u` escapes in source. Bash heredocs containing single quotes fail here; write such files with the Write tool. GNU sed treats `\u` as uppercase-next. Claude's browser pane: cannot accept the self-signed cert, blocks notifications and full screen, and a server started from it stops when the pane closes.
