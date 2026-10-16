# Jersey QC Scanner — hand-off (16 Oct 2026)

Read this first in a new chat. It is the state of the project, how to run and test it, and what is next.

## What this is

A React/Vite web app for Athletic Knit's finishing floor. An overhead camera photographs the back of a jersey; Claude Haiku reads the name and number; the app matches it against the order's roster and tells the operator the size and bin. Three co-op students: the user (aerospace) and another aerospace co-op own this app; a comp-sci co-op is building the roster/order server. Phases: **1 rostering (this work)** → 2 reporting → 3 packing (weigh scale) → 5 supervisor view.

## Repo state

- Local git repo in this folder. `master` = the prototype as floor-tested on 15 Oct (`17df521`). **`phase-1-rostering`** = all new work (`git log --oneline master..phase-1-rostering`; working tree clean at hand-off).
- **No GitHub remote is configured.** The manager wants this branch pushed to the repo the zip came from:
  `git remote add origin <url>` then `git push -u origin phase-1-rostering`.
- `npm test` = 54 vitest unit tests (`src/lib/__tests__`). `npx eslint src/ hub-plugin.js` must be clean.

## How to run

- **Floor / LAN:** double-click `Start Jersey QC.bat` (HTTPS on 5173, bound to all interfaces, self-signed cert; other PCs click Advanced → Proceed once). The console window IS the server. Other PCs still need an inbound firewall rule for TCP 5173 (Domain profile) — never added yet; must be run as Administrator by a person.
- **Testing in Claude's browser pane:** `npx vite --config vite.config.diag.js` → plain HTTP on 5174 (the pane cannot accept the self-signed cert). `vite.config.diag.js` is gitignored; it is the same as `vite.config.js` minus `basicSsl()`.
- API key: `.env.local` → `VITE_CLAUDE_API_KEY` (present, confirmed working, ~$0.001/jersey on Haiku 4.5). Never print it; `/src/App.jsx` served by the dev server contains it (known issue C6).
- Role PINs: defaults `1111/2222/3333/9999` (inspector/packer/supervisor/admin) in `src/config.js`; override with `VITE_PIN_*` in `.env.local`. Soft gate only.
- Hub state: `data/hub.json` (gitignored).

## Code map

- `src/App.jsx` — the whole UI: SignInModal, OrderSetupModal (file or supervisor roster), ManualEntryForm, SupervisorPanel, ScanOverlay (option-list model), ResultCard, SettingsPanel, BinSetupModal, RosterCompleteModal, App.
- `src/lib/match.js` — `findMatches` (exact / duplicate / pick / close / none), sleeve-merge guard, name-overrides-number, one-digit fuzzy; `isDone` = pass or manual.
- `src/lib/roster.js` — CSV/Excel parsing (BOM, quotes, delimiters, aliases, header/sheet detection), size merge, bins (case-folded, pinned), extra columns.
- `src/lib/motion.js` — hands-free gate: lift → settle → texture → place → scan. Thresholds measured on the 32×18 sample: identical 0.0, one digit changed 3.7, nudged 8.5, different player 12.4, hand 29.6, bare table 60 → `sameBelow 2.5`, `changeAt 10`, `minTexture 5`. Re-baselines on a nudge. Logs phases to the console as `[hands-free] …`.
- `src/lib/vision.js` — sleeve-aware prompt, 25 s timeout, one retry on network/429/5xx, string coercion.
- `src/lib/persist.js` — session (resume on reload), settings (v2), sign-in. `src/lib/export.js` — CSV quoting, local dates, statuses incl. MANUAL. `src/lib/audio.js`, `src/lib/hub.js`.
- `hub-plugin.js` — Vite plugin: `/api/hub/stations` (POST snapshot every 5 s from each station), `/api/hub/rosters` (supervisor sends, stations pick). Same shape for the comp-sci co-op's server to adopt.
- `src/config.js` — model, CHECKLIST chips, REASONS (routing), ROLES/PINs, DEFAULT_SETTINGS (keys: B scan, Enter select, A/arrows navigate, R retry; rotation; camera; autoScan).

## Implemented (Phase 1)

Matching hardening (accents, surname vs full name, `00`, shared numbers, colour-only twins, sleeve 777→pick, right-name-wrong-number never green, duplicate on number-only rosters); every screen is an option list (Enter selects, A/↓ navigates, R retries anywhere, e.repeat ignored, hover can't override a key); adaptive headline (what differs is big); extra roster columns as badges; CHECK chips + order notes on the green screen; reasons → red GO TO SUPERVISOR with reason logged; **Enter by hand** (manual rows, supervisor sign-off); persistence + resume + leave warning; sign-in once per shift, New order without PIN, Sign out; Add roster mid-session; Replace with confirm; manual marks (missing/short-shipped); Accept vs Reject; rotation/camera picker/hands-free settings; export hygiene; camera liveness check; hands-free pauses behind dialogs; station hub + supervisor view.

## Testing approach that works

Claude's browser pane has no camera; `tools/browser-harness.js` fakes one (a canvas streamed via `captureStream`) and a controllable network, and includes the 100-jersey driver. Paste it into the console at `http://localhost:5174` after signing in and starting an order — or load it without pasting: `(0, eval)(await fetch('/tools/browser-harness.js').then(r => r.text()))` (no `?raw`: Vite wraps that in `export default`). Install it before pressing Start Camera. Vite serves the harness through its pipeline, so editing the harness file reloads the page and drops the install. Results land in `window.__run`. Caveat learned the hard way: after editing a `src/lib/*` file, **hard-reload the page** — React Fast Refresh keeps old objects alive inside `useRef` (the motion gate).

Break-it drill (16 Oct): 16 cases, all pass after fixes (dead-camera scan, gate behind modals).

100-jersey simulated run (16 Oct, 107 events, at 70/107 when the chat was handed off): 0 errors, 0 false scans, hands-free fired on 99% of placements, ~3.9 s per normal jersey, 4.5–5.6 s for the awkward ones. Per type (ok/n): normal 49/49, nameless 6/6, sleeve-merged 3/3, crumpled 3/3 (R + rescan), one-digit misread 2/2, defect→supervisor 1/1, network down 1/1 (one retry), 429 1/1, duplicate 1/1, hand pull-back 1/1 (no scan). The only misses were the 2 of 2 "None of these — enter by hand" from a *near-miss* screen. **Root cause found and fixed (16 Oct, later session): it was the app, not the driver.** Saving the form re-ran the matcher on the typed values; typed 88 is still "near" roster 8, so the app bounced back to a pick screen whose "None of these" reopened the form — an endless loop with no way to add the jersey. Now what the operator types is the truth: a list reached *after typing* carries `overlay.typed`, its escape reads "None of these — add #88 ZIELINSKI as typed" and adds the row directly; and when the typed value equals what the camera read on a near miss (the operator already rejected those rows), the row is added with no second list. Verified by hand in the browser pane on order 77 (roster 12/7/9/15): read 77 → No exact match (Jones #7) → A, A, Enter → form prefilled → Save → ENTERED BY HAND, row added; COULD NOT READ → by hand → typed 99 → list offers Kim #9 and "add #99 as typed" → Enter → row added; read 17 → near Patel → by hand, corrected to 15 → Save → Patel marked by hand. `tools/browser-harness.js` updated to follow the new list and to read the overlay's text rather than the page (the result card under the camera repeats "ENTERED BY HAND" and fooled `screen()`). The 100-jersey driver has **not** been re-run since; the three not-on-roster events should now pass.

## Known gaps / next

- Deployment items not done by decision: bundle xlsx (C5), key to server (C6), production build instead of dev server (C7), proxy rate limit (C11), Windows service (D9), DHCP reservation (D10), firewall rule (D11), real cert (D12). B12 (roster names in the prompt) deliberately not done.
- Untested on real hardware: USB unplug `ended` event, rotation on the real mount, camera picker with two devices, hands-free thresholds on real fabric (console logs give the numbers to tune).
- A hand resting still on the empty table can read as a jersey (COULD NOT READ, R clears it).
- 52 s before a dead API reports (25 s × 2); consider 15 s + a "retrying…" label.
- Next phase per the user: evidence loop (save scan image + outcome → replay set → A/B Haiku 5.5), pink-slip printing, then packing with a weigh scale.

## Docs (Claude docs, living)

- Common Review and Phase 1 Plan (master issue list with Round dropdowns, drill results): https://claude.ai/code/artifact/dc9f84d9-4ee7-46d2-8376-fec43e07832a
- Phase 1 Findings & Fixes: https://claude.ai/code/artifact/921a053f-0ea6-4c07-9994-2ec510eed72f

## Tooling quirks on this machine

Write/Edit tools decode `\uXXXX` in file content into the literal character — never put `\u` escapes in source (use `String.fromCharCode(0xfeff)`, `/\p{M}/gu`). Bash heredocs containing single quotes fail here; write files with the Write tool. GNU sed treats `\u` as uppercase-next.
