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

## Key architecture notes

- All state lives in the top-level `App` component; no external state management
- `findMatches()` handles exact, conflict (same number, different players), close/fuzzy matching
- Keyboard shortcuts (scan/confirm/cancel keys) are fully configurable via Settings panel
- Designed for use with a barcode scanner or foot pedal mapped to keyboard keys; optional voice commands (Vosk in-browser, `src/lib/voice.js`, model in `public/models/`, downloaded by the launcher)
- Audio feedback: ascending tone = pass, descending = flag, short beep = scan trigger
- `exportRosterXLSX()` writes status + all roster columns to Excel; `exportLogCSV()` writes the scan event log

## Simulations

- `SIM_ORDERS=3000 npx vitest run operator-sim` works thousands of whole orders through the real libraries (roster files with Excel quirks, a camera that hides and misreads digits, an operator who picks, types, flags, un-checks) and fails on a wrong green, a wrong "already passed", an unfinishable order, a lost session or a broken export. `SIM_TRACE=<order>` prints one order step by step.
- `node tools/hub-stress.mjs https://localhost:5173 30` hits a RUNNING hub: three stations at 20x the real rate plus a polling supervisor, then every board action (send roster, set number, carried flags, remove, oversize body). Restore `data/hub.json` from a copy afterwards to keep the day sheet clean.

## Security note

The API key was previously hardcoded in `src/App.jsx:4` and has been **revoked**. Always use `VITE_CLAUDE_API_KEY` from environment. GitHub push protection will block any future commit containing an Anthropic API key.
