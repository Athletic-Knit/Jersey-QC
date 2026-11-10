# Jersey QC Scanner

## What this project does

A React/Vite web app for quality-control scanning of sports jerseys in a manufacturing environment. An operator photographs each jersey with their device camera; Claude Haiku reads the player name and number from the image and matches it against an uploaded roster.

**Workflow:**
1. Operator enters their name, order number, and uploads a roster file (CSV/TSV or Excel). The jersey type (ECHL / ECHL replica, stitched; Sublimated, printed — `JERSEY_TYPES` in config.js) is picked on the station's setup form or the supervisor's send-roster form: the flag reasons follow it (`reasonsFor`), so an ECHL order is never offered "Sublimation error"; with no type set the station offers every reason from both lists (`ALL_REASONS_MENU`). The Mark menu on an unscanned roster row offers Missing only (Short-shipped was removed 9 Nov 2026; the `short` status is still read for old sessions).
2. Bins: the supervisor chooses on the send-roster form (and the station on its setup form) whether the order is sorted by team, by size, or not at all (`BIN_BY`, `binBy` on the hub roster). Every order has at least one bin, because packing boxes by the bin: one team or size is Bin 1, and an order that is not sorted (or has no team or size to sort by) is one bin for the whole order (`{ "*": 1, __by: "all" }`, `ALL_KEY`). With more than one team or size a bin screen appears (Bin 1 = Navy, Bin 2 = Red; or Bin 1 = Y-M, Bin 2 = A-L …). A size map carries `__by: "size"` (`binFieldOf`), a team map is flat; `binFor(binMap, row)` takes the roster row.
3. Camera feed is shown; operator presses a configurable key (default: `B`) to scan a jersey
4. Claude Haiku extracts name + number from the photo via the Anthropic API
5. Match result shows as a full-screen overlay:
   - **Green** = exact match → confirm with `B`, or edit with `A`
   - **Yellow** = multiple candidates or close match → pick from list
   - **Red** = not found or API error → flag and continue
6. Flagged items appear in the log and can be resolved (Accept / Reject / Note)
7. When all roster entries are scanned, a completion modal offers Excel export
8. "🏁 Finish order" (header, and on the completion modal) shows a confirm with passed / open / not-scanned counts; Enter or ✓ clears the order, removes the roster from the hub (no station is offered it again) and the station returns to "waiting for an order" (the hub keeps the order's record and sheets); Esc keeps going
9. One station per order: starting a sent roster takes it on the hub (`POST /rosters/:id/take`, `takenBy`); other stations see it greyed "In progress on Station 1" and get a 409 if they race; the board's "Rosters sent" list shows who has it with Release / Remove. Each start of an order on a station is a run (`orderRun`, saved in the session, reported in the snapshot and on events); the hub's ledger keeps one order record per run (`station|order|run`), so an order started again by mistake does not overwrite the finished one

## Tech stack

- React 19, Vite 8 (ESM)
- Single component file: `src/App.jsx` (~900+ lines, all inline styles, dark GitHub-like theme)
- Type and far-view scale: `src/index.css` ships two self-hosted typefaces (`@fontsource`): Atkinson Hyperlegible for UI text (`FONT_UI` in App.jsx) and Barlow Condensed for the big numerals — jersey number, size, bin, the counters (`FONT_DISPLAY`). The stations are 27" monitors read from 4–5 ft, so `#root` gets `zoom: 1.3` at ≥1600×800 and `1.7` at ≥2300×1200; everything is laid out in the smaller logical viewport and enlarged. Because of the zoom, full-height boxes use `100%`, not `100vh`.
- SheetJS loaded from CDN (`https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js`) for Excel read/write
- Anthropic API (Claude Haiku 5.5 `claude-haiku-5-5`, thinking off, low effort, 800 px frame; overrides below) called **directly from the browser** via `fetch("/api/anthropic/v1/messages")` — requires a Vite dev proxy or a hosting proxy in production

## Environment variables

| Variable | Purpose |
|---|---|
| `VITE_CLAUDE_API_KEY` | Anthropic API key — **never hardcode this** |
| `VITE_CLAUDE_MODEL` | Optional model override (default `claude-haiku-5-5`; `claude-sonnet-5-5` reads the same cases at ~1.9 s) |
| `VITE_CLAUDE_EFFORT` | Optional `low` / `medium` / `high` (default `low`) |
| `VITE_CLAUDE_THINKING` | Optional `off` / `adaptive` (default `off`) |
| `VITE_SEND_MAX_PX` | Longest side of the frame sent to the model (default `800`) |
| `VITE_OPERATORS` | Names offered in the sign-in dropdown, comma-separated (default `Person 1,Person 2,Person 3`); "Other" is always offered too |
| `VITE_PIN_STATION1` / `2` / `3` | Station PINs (defaults `1001`, `1002`, `1003`); `VITE_PIN_SUPERVISOR` default `3333` |
| `JERSEY_PRINTER_STATION1` / `2` / `3` | Print queue on the server PC for that station's stickers; a printer shared from the station PC works (`\\AK-NB-164\ZDesigner ZD411-203dpi ZPL`). The suffix is the station id after `st-`, case-insensitive |
| `JERSEY_PRINTER` | Queue for any station without its own (default: the first queue on the server PC whose name or driver matches `zebra`, `zd4` or `zdesigner`) |
| `JERSEY_LABEL_SIZE` | Sticker on the roll, inches, width x height (default `1x0.5`) |
| `JERSEY_FLAG_PRINTER_STATION1` / `2` / `3`, `JERSEY_FLAG_PRINTER` | The queue for that station's flag tickets, and the one for any station without its own, the same way; with neither set the tickets go to the station's sticker printer |
| `JERSEY_FLAG_LABEL_SIZE` | Flag ticket on the roll (default `2x1`) |

Create a `.env.local` file (already gitignored via `*.local`):
```
VITE_CLAUDE_API_KEY=sk-ant-...
```

## Running locally

```bash
npm install
npm run dev
```

The dev server starts at `http://localhost:5173`.

> **Note:** The Anthropic API is called via `/api/anthropic/...`. In dev, Vite must proxy this path to `https://api.anthropic.com`. Add a proxy in `vite.config.js` if not already present:
> ```js
> server: {
>   proxy: {
>     '/api/anthropic': {
>       target: 'https://api.anthropic.com',
>       changeOrigin: true,
>       rewrite: path => path.replace(/^\/api\/anthropic/, ''),
>     }
>   }
> }
> ```

## Roster file format

Supported: `.csv`, `.tsv`, `.txt`, `.xlsx`, `.xls`

Expected columns (case-insensitive, auto-detected):
- `name` — player name
- `number` — jersey number
- `team` — team name (optional, used for bin assignment)
- `size` — size (optional)
- `size range` + `size` — auto-merged into `A-XS` / `Y-M` style combined size
- `order` / `order number` / `PO` / `job` (optional) — fills the order number at setup; a title row above the header such as `Order 55555` works too. Not kept as a roster column (`orderNumberOf()` in roster.js).

## Key architecture notes

- All state lives in the top-level `App` component; no external state management
- `findMatches()` handles exact, conflict (same number, different players), close/fuzzy matching
- Keyboard shortcuts (scan/confirm/cancel keys) are fully configurable via Settings panel
- Designed for use with a barcode scanner or foot pedal mapped to keyboard keys (voice commands were removed on 5 Nov 2026)
- Audio feedback: ascending tone = pass, descending = flag, short beep = scan trigger, two flat blips = retry (the scan dropped, nothing recorded)
- Retry pedal (`retryKey`, default `R`): on a green screen it only lays "That's the retry pedal — B confirms" over the screen for 5 s and the green stays (a retry there looked exactly like a confirm and a jersey went in the bin unchecked, 5 Nov 2026); the Retry button on a green is a mouse click only (`mouseOnly`: the arrows skip it, B never runs it). A real retry (red, yellow, duplicate) keeps an amber "Scanned again · #N is NOT checked — no sticker, no bin" strip on the camera screen (`retried`) until the next scan. Floor rule: no sticker, no bin.
- Hands-free (`src/lib/motion.js`): after a confirm the gate waits for the picture to change and then sit still (~0.8 s); a still picture that is neither the jersey just scanned nor the empty table scans. Works for one jersey placed at a time and for a stack lifted jersey by jersey. After a confirm the gate holds for `autoScanDelay` seconds (Settings, default 3) before it may fire, so the operator can put the old jersey away and reach for the next. The empty table is learned, not guessed: the read returns `jersey_present`, and a read with no name and no number (an empty table, or fabric with no lettering in view) never shows a result screen: hands-free is silent, a B press shows "No jersey in view" for a moment; either way it teaches the gate the table and re-arms, with nothing in the log. A read with any name or number in it is never "no jersey", whatever the flag says.
- Turned jerseys: the read returns `orientation`; when it is not `upright` the app turns the frame (`rotateDataUrl`) and reads again, and the two reads reconcile (`src/lib/vigilance.js`). A nameless 6/9, 18/81, 66/99 on a turned jersey with the twin number open on the roster is a question (`rotated180` in match.js).
- Self-check after a mistake (`src/lib/vigilance.js`): when the operator corrects the app (a green typed over, a list without the jersey, a "could not read" then typed, a pass un-checked) the next 5 jerseys are read twice and must agree before a green; another mistake restarts the 5. A "Double-checking · N to go" pill shows in the header. The counter lives in the saved session (`vigil`). The operator simulation runs it too (`SIM_VIGIL=0` to compare).
- Operator inspection regime (`createInspection` in `src/lib/vigilance.js`): full inspection of the first 5 jerseys of an order and of the next 5 after any defect the operator flags; otherwise a quick look with a full spot check after every 10 clean. Shown as a header pill and a banner on the green screen (check pills only during a full inspection); saved in the session (`inspect`). Independent of the app's own double-check.
- Lone digits: the roster hint asks the model to flag a hidden second digit only on evidence (a fold, crease, sleeve, hand, tag or picture edge beside the digit), and an exact name + number match is green whatever the camera says about the digit unless the same name is open on a hidden-digit row.
- Damage photo: the flag photo (`photo`, the scan cropped to the jersey) only ever shows the back. On the GO TO SUPERVISOR screen a "Photo of the damage" button (primary for defect reasons, second to Continue for "wrong name, number or team" and "not on the roster") runs a 3-2-1 with a tick a second and a shutter, then keeps the live frame uncropped on the log entry as `damagePhotos[]`; Retake drops the last, Take another adds. B or the pedal triggers it too. Both photos go to the hub (the plugin keeps them once seen), the supervisor board and the Excel damage report ("Damage photo" column, more columns when a jersey has several); the saved-session photo budget counts them.
- Supervisor board weighting (`routeOfReason` / `severityOf` in config.js): every open item carries a tag from the route its reason implies (REMAKE over DECORATION / STITCHER over CLEANING / CHECK ORDER over SIGN OFF / DECIDE), the Needs-you list shows the three that weigh most, open before resolved. A station silent for over 2 hours (`GONE_MS`) steps back into one "Not reporting" strip and its old items leave the header count and the backlog banner. "📺 Wall" (or `?view=wall`) is one row per station in letters for a TV, sized in container-query units because of the page zoom; click or Esc returns. The board sends no notifications at all (no pop-ups, no desktop notifications, no tone, by the owner's decision on 4 Nov 2026): the header count and the cards' red lists are the whole story. A supervisor's sign-in is the board and nothing else: no station behind it, no scanning, no resume; its header button is Sign out. Look-back: the hub keeps 90 days of ledger (`pruneLedger` in hub-plugin.js), photos only on the newest 14 (`photosPruned: true` on the event afterwards); the board's Orders list has a day picker and the order view, order sheet, day sheet and damage report follow it. Station cards are always now.
- Roster table at the station: a Sort by row (Size · Status · Name · Number · Team · Bin, `sortRoster` / `ROSTER_SORTS` in roster.js); size (the rack order) by default; Status puts the done ones on top, with a "Done on top / To do on top" toggle (`doneFirst`). "Show" filters the table to one size and/or one team (`rosterChoices`). The Mark menu of a passed or by-hand row offers "🚩 Flag / damage" (`flagRow` → the reasons menu, like Flag it on the last pass) as well as Un-check. The order's History button sits bottom-left under the last pass, not in the header.
- Stickers (`src/lib/labels.js`, `tools/print-raw.ps1`): every passed jersey (a green confirmed, a pick from the list, a by-hand pass; never a flag) prints a 1 × 0.5 in sticker on a Zebra ZD411 (203 dpi, ZPL): BIN and the number in a left column, TEAM or SIZE and its value on the right, the order number small under it (`jerseyLabel` / `jerseyLabelZPL`). The inspector folds the jersey and sticks it on; the packer stacks by bin. The station posts it to the hub (`POST /api/hub/print { labels, kind: "jersey", station }`), which builds the ZPL and sends it raw to the Windows queue for that station (`JERSEY_PRINTER_<STATION>`, else `JERSEY_PRINTER`, else the first Zebra queue on the server PC); the printer is driven from the server PC, so a Zebra at a station is shared from the station PC and named in `.env.local`. Fire-and-forget on `lastConfirmed` (`stickerPrinted` ref, so once per pass and never on a resumed order); the Last passed strip shows "Sticker printed" / "No label printer for this station" with Reprint; Settings → Label printer turns it off (`stickers`). The Bin setup modal's "🖨 Print bin labels" prints one bin label per bin on request (`binLabels` / `binLabelZPL`), nothing automatic. Printing starts 2 mm below the label's top edge (`top` in `labelSize`): the ZD411 cut the first line in half otherwise.
- Flag tickets (`flagLabel` / `flagLabelZPL`, kind `"flag"` on the print route): every flag (a reason chosen, "not on the roster", a duplicate, a flag on a passed jersey) prints the mirror of the sticker on a **2 × 1 in** label (`DEFAULT_FLAG_LABEL_SIZE`, `JERSEY_FLAG_LABEL_SIZE`): a solid black column on the left with FLAG, the number and the name in white (so the packer never boxes it), and on the right the route tag from `severityOf` (STITCHER, REMAKE, DECORATION …), the reason on up to three lines, team · size · bin, and order · station · time. The layout is in fractions of the label, so it also comes out on the sticker roll. The hub sends it to the flag printer (`JERSEY_FLAG_PRINTER_<STATION>`, else `JERSEY_FLAG_PRINTER`), else to the station's sticker printer (`ticketPrinter` in hub-plugin.js). Printed once per log entry from the newest log entry (`ticketPrinted` ref; a resumed order counts its last entry as printed); the GO TO SUPERVISOR screen shows "Flag ticket printed" / "No label printer" with Reprint; its own switch under Settings → Label printer (`flagTickets`), apart from the stickers'. labels.js runs on the hub as well, so it never imports config.js: the station passes the tag in.
- Full bins and bin lists (`closeBin` / `binOfRow` / `binContents` in roster.js, `binListLabels` / `binListZPL` in labels.js): the bin map only says which bin is OPEN for a team or size. "📦 Bin full" (beside History, when the order has bins) lists the open bins with what is in each; closing one keeps `{ bin, key, label, ids, closedAt }` in `closedBins` (saved in the session), moves the team or size to the next number nobody has used (`nextBinNumber`; a closed number is never handed out again, also not by `buildBinMap`'s `taken`), and prints on the 2 × 1 in roll: the list of what was in the bin (kind `"binlist"`) and the new bin's label (kind `"binticket"`). A done row in a closed bin stays in it (`binOf` in App.jsx goes through `binOfRow`); an un-check takes it out (`dropFromClosed`). The list is every passed or by-hand jersey as `23-JAMES-AXL` (number, name, size without its hyphen), ten a label in two columns of five read down the left then down the right, in jersey-number order, with BIN, team or size, order, piece count and page in a header; 15 jerseys are 2 labels. Finish order prints the list of every bin still open with something in it (the dialog says how many labels). Closed bins can print their list again from the dialog. Switch: Settings → Label printer (`binLists`). An order with one team or size, or not sorted, is one bin, and Bin full works on it the same way.
- Boxes (`src/lib/boxes.js`): packing has a bag and a small, medium and large box. `boxFor(count, settings)` names the smallest that holds a bin's jerseys from the station's limits (Settings → Packing: `boxBag` 1, `boxSmall` 6, `boxMedium` 15, `boxLarge` 30 — the defaults are placeholders until the floor gives the real numbers); more than a large box holds is "2 large boxes". The box shows beside each bin in the Bin full dialog, in its closing message, on the Finish order dialog, in capitals at the top right of the bin's list label (`box` on `binListLabels`; the station passes it, labels.js does not know the limits), and on a "Bins" sheet of the order's Excel (`buildBinsSheet`: bin, what it holds, jerseys, box, open or closed, when). The station reports `closedBins` and `binSummary` in its snapshot, so the board's order view and order sheet show the same.
- Where the screen was (`src/lib/attention.js`): while an order is open the station records away spells — the page hidden (minimised, another tab, locked) or another window in front for 5 s or more (`awaySpells`, `createAwayWatch`) — beside the idle spells IdleWatch already kept (`idleSpells`: screen up, untouched 3 min+). A page can only see that its own window was left, never where the operator went or what was typed; the spells carry no operator name (owner's decision, 9 Nov 2026), only the station and the times. Both go in the saved session, to the hub snapshot (`idle`, `away` on the order record) and onto Excel: an "Attention" sheet on every order export (station and board), and "Idle spells" / "Screen left" columns on the day sheet's Orders tab.
- Lock-down: an operator's station goes full screen on sign-in; `Start Station (kiosk).bat` (or `Jersey QC Station.exe`, built from it by `tools/build-station-exe.ps1` with IExpress; the exe runs the launcher from a temp folder, so the browser is started with `/D %USERPROFILE%` and via `call .station-kiosk.bat`) opens Edge in kiosk mode (no address bar, tabs or menus; Alt+F4 closes it) on the station link, asking for the server address and station once and keeping them in `%APPDATA%\JerseyQC\station.cfg`. A web page cannot lock a browser by itself; a station that must not reach the internet needs the kiosk launcher or Windows kiosk mode / assigned access.
- Result screens are a size container (`containerType: "size"` on the overlay root). The green screen is two halves above the buttons: number, name and team on the left, SIZE and BIN stacked on the right; each column is its own size container and its text is sized in that column's `cqh`/`cqw` (the number shrinks for 3 digits, the name for long names), so the screen fills a 27" station panel and still fits 1080p with the inspection banner, check pills and order notes showing. The by-hand screen's SIZE and BIN boxes use the overlay's units.
- Rate and ETA at the station (`src/lib/pace.js`): from working time, not the clock. The gap between one scan and the next counts in full up to 10 minutes (`CAP_MIN`); a longer gap (a break, a shift end, a night with the order left on screen) counts as 10, and so does the gap from the last scan to now. The hub's board rate is a rolling 20-minute window of its own (hub-plugin.js).
- `exportRosterXLSX()` writes status + all roster columns to Excel; `exportLogCSV()` writes the scan event log

## Simulations

- `SIM_ORDERS=3000 npx vitest run operator-sim` works thousands of whole orders through the real libraries (roster files with Excel quirks, a camera that hides and misreads digits, an operator who picks, types, flags, un-checks) and fails on a wrong green, a wrong "already passed", an unfinishable order, a lost session or a broken export. `SIM_TRACE=<order>` prints one order step by step.
- Packing simulation: `SIM_BINS=3000 SIM_FACTORIES=30 npx vitest run box-sim` runs the box model that is to replace the flat limits (`src/lib/boxmodel.js`, not wired into the app yet: room per size class and stitched / sublimated in units of one adult 2XL stitched jersey, a capacity per box, a 45 lb weight cap, and `fitBoxModel` learning the room numbers from "which box did it really go in" answers) against factories whose real numbers are up to 30% off its starting estimates, with packing noise and wrong taps. It prints the share of right boxes by bins seen for the flat count, the size-and-weight table, the table with learning, and the best any rule could do. All its starting numbers (`PRIOR`) are estimates; only "34 adult 2XL in a large box" and "45-48 lb" came from the floor.
- Recognition stress test (live model, ~770 calls, ~4 min): `powershell -File tools/synth-jerseys.ps1` draws 103 synthetic jerseys (look-alike letters and digits, low-contrast colours, turned, sleeve numbers, plates, empty tables) into `public/sim/stress/synth`; `node tools/stress-distort.mjs <dir with node_modules/sharp>` makes 270 distorted variants (turned, tilted, small, blurred, dark, blown out, washed, heavy JPEG, grey, cropped) of real and synthetic frames; `SHARP_DIR=<same dir> node tools/recog-stress.mjs 2` runs everything through the current prompt, model and matcher and prints a table by category plus every failure with the raw read. Findings and the before/after numbers are in `tools/RECOGNITION-FINDINGS.md`; add a line there whenever a failure teaches something.
- Input trial (temporary, 9 Nov 2026 — mouse + pedal against up/down keys + pedal; see `tools/INPUT-TRIAL.md`, which also says how to remove it): `SIM_INPUT=1 npx vitest run operator-sim` prints the Keystroke-Level Model's cost of each setup over the sim's screens (`modelDecision` in `src/lib/trial.js`); `tools/input-trial.html` is a stand-alone page (no server) where a tester picks the jersey on the left out of the station's yellow list, and the damage out of the reasons menu, 50 jerseys per setup, only the pick timed; Settings → Input trial on a real station records every result-screen decision for the named setup in that browser (`trialMethod`, `onTrial`, `TrialPanel`), nothing to the hub.
- `node tools/hub-stress.mjs https://localhost:5173 30` hits a RUNNING hub: three stations at 20x the real rate plus a polling supervisor, then every board action (send roster, set number, carried flags, remove, oversize body). Restore `data/hub.json` from a copy afterwards to keep the day sheet clean.

## Security note

The API key was previously hardcoded in `src/App.jsx:4` and has been **revoked**. Always use `VITE_CLAUDE_API_KEY` from environment. GitHub push protection will block any future commit containing an Anthropic API key.

## Git authorship

Commits are authored by the person at the keyboard only (the configured git user, AK Co-op). Do **not** add a `Co-Authored-By` trailer, a "Generated with Claude Code" line, or any other AI attribution to commit messages or pull request descriptions. This is the owner's decision (29 Oct 2026) and overrides any default attribution guidance. Work on `phase-1-rostering`, and push to GitHub right after every commit without asking (the owner wants GitHub to always match the floor).
