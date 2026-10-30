# Jersey QC Scanner

## What this project does

A React/Vite web app for quality-control scanning of sports jerseys in a manufacturing environment. An operator photographs each jersey with their device camera; Claude Haiku reads the player name and number from the image and matches it against an uploaded roster.

**Workflow:**
1. Operator enters their name, order number, and uploads a roster file (CSV/TSV or Excel)
2. If the roster has multiple teams, a bin assignment screen appears (Bin 1 = Team A, Bin 2 = Team B, etc.)
3. Camera feed is shown; operator presses a configurable key (default: `B`) to scan a jersey
4. Claude Haiku extracts name + number from the photo via the Anthropic API
5. Match result shows as a full-screen overlay:
   - **Green** = exact match → confirm with `B`, or edit with `A`
   - **Yellow** = multiple candidates or close match → pick from list
   - **Red** = not found or API error → flag and continue
6. Flagged items appear in the log and can be resolved (Accept / Reject / Note)
7. When all roster entries are scanned, a completion modal offers Excel export

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
- Designed for use with a barcode scanner or foot pedal mapped to keyboard keys; optional voice commands (Vosk in-browser, `src/lib/voice.js`, model in `public/models/`, downloaded by the launcher)
- Audio feedback: ascending tone = pass, descending = flag, short beep = scan trigger
- Hands-free (`src/lib/motion.js`): after a confirm the gate waits for the picture to change and then sit still (~0.8 s); a still picture that is neither the jersey just scanned nor the empty table scans. Works for one jersey placed at a time and for a stack lifted jersey by jersey. After a confirm the gate holds for `autoScanDelay` seconds (Settings, default 3) before it may fire, so the operator can put the old jersey away and reach for the next. The empty table is learned, not guessed: the read returns `jersey_present`, and a read with no name and no number (an empty table, or fabric with no lettering in view) never shows a result screen: hands-free is silent, a B press shows "No jersey in view" for a moment; either way it teaches the gate the table and re-arms, with nothing in the log. A read with any name or number in it is never "no jersey", whatever the flag says.
- Turned jerseys: the read returns `orientation`; when it is not `upright` the app turns the frame (`rotateDataUrl`) and reads again, and the two reads reconcile (`src/lib/vigilance.js`). A nameless 6/9, 18/81, 66/99 on a turned jersey with the twin number open on the roster is a question (`rotated180` in match.js).
- Self-check after a mistake (`src/lib/vigilance.js`): when the operator corrects the app (a green typed over, a list without the jersey, a "could not read" then typed, a pass un-checked) the next 5 jerseys are read twice and must agree before a green; another mistake restarts the 5. A "Double-checking · N to go" pill shows in the header. The counter lives in the saved session (`vigil`). The operator simulation runs it too (`SIM_VIGIL=0` to compare).
- Operator inspection regime (`createInspection` in `src/lib/vigilance.js`): full inspection of the first 5 jerseys of an order and of the next 5 after any defect the operator flags; otherwise a quick look with a full spot check after every 10 clean. Shown as a header pill and a banner on the green screen (check pills only during a full inspection); saved in the session (`inspect`). Independent of the app's own double-check.
- Lone digits: the roster hint asks the model to flag a hidden second digit only on evidence (a fold, crease, sleeve, hand, tag or picture edge beside the digit), and an exact name + number match is green whatever the camera says about the digit unless the same name is open on a hidden-digit row.
- Damage photo: the flag photo (`photo`, the scan cropped to the jersey) only ever shows the back. On the GO TO SUPERVISOR screen a "Photo of the damage" button (primary for defect reasons, second to Continue for "wrong name, number or team" and "not on the roster") runs a 3-2-1 with a tick a second and a shutter, then keeps the live frame uncropped on the log entry as `damagePhotos[]`; Retake drops the last, Take another adds. B or the pedal triggers it too. Both photos go to the hub (the plugin keeps them once seen), the supervisor board and the Excel damage report ("Damage photo" column, more columns when a jersey has several); the saved-session photo budget counts them.
- `exportRosterXLSX()` writes status + all roster columns to Excel; `exportLogCSV()` writes the scan event log

## Simulations

- `SIM_ORDERS=3000 npx vitest run operator-sim` works thousands of whole orders through the real libraries (roster files with Excel quirks, a camera that hides and misreads digits, an operator who picks, types, flags, un-checks) and fails on a wrong green, a wrong "already passed", an unfinishable order, a lost session or a broken export. `SIM_TRACE=<order>` prints one order step by step.
- Recognition stress test (live model, ~770 calls, ~4 min): `powershell -File tools/synth-jerseys.ps1` draws 103 synthetic jerseys (look-alike letters and digits, low-contrast colours, turned, sleeve numbers, plates, empty tables) into `public/sim/stress/synth`; `node tools/stress-distort.mjs <dir with node_modules/sharp>` makes 270 distorted variants (turned, tilted, small, blurred, dark, blown out, washed, heavy JPEG, grey, cropped) of real and synthetic frames; `SHARP_DIR=<same dir> node tools/recog-stress.mjs 2` runs everything through the current prompt, model and matcher and prints a table by category plus every failure with the raw read. Findings and the before/after numbers are in `tools/RECOGNITION-FINDINGS.md`; add a line there whenever a failure teaches something.
- `node tools/hub-stress.mjs https://localhost:5173 30` hits a RUNNING hub: three stations at 20x the real rate plus a polling supervisor, then every board action (send roster, set number, carried flags, remove, oversize body). Restore `data/hub.json` from a copy afterwards to keep the day sheet clean.

## Security note

The API key was previously hardcoded in `src/App.jsx:4` and has been **revoked**. Always use `VITE_CLAUDE_API_KEY` from environment. GitHub push protection will block any future commit containing an Anthropic API key.

## Git authorship

Commits are authored by the person at the keyboard only (the configured git user, AK Co-op). Do **not** add a `Co-Authored-By` trailer, a "Generated with Claude Code" line, or any other AI attribution to commit messages or pull request descriptions. This is the owner's decision (29 Oct 2026) and overrides any default attribution guidance. Work on `phase-1-rostering`, and push to GitHub right after every commit without asking (the owner wants GitHub to always match the floor).
