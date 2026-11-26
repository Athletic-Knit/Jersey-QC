# Changelog

Every change made from the code review of 23 Nov 2026, one entry per change, newest last. Written by Sonnet, reviewed by Opus, signed off by Fable.

## 2026-11-23 · F5 · A pedal press never passes a flagged jersey (review H3)
- **Finding:** when a jersey that had been flagged was scanned again, the ALREADY DONE screen opened with "Back from repair — pass it" as the first, pre-selected button. After a flag the jersey is usually still under the camera, so one reflex press of the pedal passed a damaged jersey (code review H3).
- **Rule:** review fix, agreed with Noam in the review of 23 Nov 2026: passing a flagged jersey must be a deliberate choice, never a key, the pedal or hands-free. The button itself stays (the owner, 20 Nov 2026: a flagged jersey scanned again may be back from repair).
- **What changed and why:** on that screen "Skip" is now the first, highlighted button, so the pedal skips. "Back from repair — pass it" is still there but works by a mouse click or a tap only: the arrow keys step over it and the Select key or pedal does nothing on it. It uses the same `mouseOnly` flag as the green screen's Retry button, so there is no second mechanism. The buttons of a jersey that had already passed (Skip, Retry, Duplicate) are unchanged, and matching is untouched. The buttons of this screen moved into a small file of their own so a test can read them. Files: `src/lib/dupoptions.js` (new), `src/App.jsx` (the two "duplicate" lines replaced by one call), `src/lib/__tests__/dupoptions.test.js` (new).
- **Tests added:** `src/lib/__tests__/dupoptions.test.js`, 3 tests: a flagged jersey has Skip first and primary; "Back from repair" is the only mouse-only button and is not primary; a passed jersey keeps Skip, Retry, Duplicate.
- **Checks:** lint clean; 436 tests pass (33 files). The operator simulation was not run: no matching code changed. The reviewer also tried every arrow sequence up to 6 presses followed by the Select key against the screen's key logic: 0 passes of a flagged jersey. Not clicked through on the test server.
- **Left open, for the owner and Noam:** (1) when the mouse rests on the "Back from repair" button it still shows the Enter hint, although Enter does nothing there (the green screen's Retry does the same); (2) on a picked-up order a jersey flagged a moment ago is open to the matcher and goes to the green "Back from repair — check it is fixed" screen when scanned again; the checklist stands in the way (at least 4 ticks), so it is not a one-press pass, but it is a reflex path; (3) the roster Mark menu's "Back from repair — pass it" asks with a Windows confirm box, which Enter accepts, after a deliberate menu choice; (4) the CLAUDE.md note on the ALREADY DONE screen does not yet say Skip is first and the pass is a mouse click only.
- **Written by** Sonnet · **reviewed by** Opus (approved in round 1) · **signed off by** Fable.
- **Commit:** a5978f4

> From here on, the workflow (Sonnet writes, Opus reviews, Fable signs off) was stopped: the four matching rules each failed three rounds because they change the same code and were reviewed one at a time. The remaining phase 1 changes are finished in the Claude session itself (Opus 5.5) and reviewed by a separate Opus agent; each entry says who did what.

## 2026-11-23 · F6 · No scan while any dialog is open (review H1)
- **Finding:** scanning was stopped by two hand-written lists of open dialogs, and neither had Packing, Still out, Issues, Finish later or the big photo. With one of those open, the pedal (Enter) or hands-free still scanned, the result sat hidden under the dialog, and the next pedal press confirmed a jersey nobody saw (code review H1).
- **Rule:** review fix. The floor's first rule: no jersey is passed unseen.
- **What changed and why:** App.jsx now has ONE list of every dialog (`dialogOverResult`, and `anyDialogOpen` = that list plus Blanks), with a comment that a new dialog must be added there. The pedal, hands-free, the SCAN and By hand buttons, the scan itself (`doTriggerScan`) and the replay all use it; the two old lists are gone. A result screen already up when a dialog opens over it ignores the pedal and keys until the dialog closes (`paused` on ScanOverlay); the mouse still works. Closing the big photo or "Keep going" on Finish later now re-arms hands-free like every other dialog. Blanks is kept out of the pause because its screen is never drawn over a result. Files: `src/App.jsx`, `src/lib/__tests__/no-scan-behind-dialog.test.js` (new).
- **Tests added:** `no-scan-behind-dialog.test.js`: reads App.jsx and fails if any dialog state is missing from the one list, if the pedal handler, hands-free, SCAN or By hand use anything else, or if the result screen does not pause under a dialog.
- **Checks:** lint clean; 443 tests pass. Not yet clicked through on the test server (5174).
- **Left open:** inside Packing, Still out, Issues, Finish later and the big photo, Enter now clicks the focused button of that dialog (before, the scan handler took it); to be tried on the test server. The roster Mark menu's "Back from repair — pass it" / "Found — pass it" ask with a Windows confirm box that Enter accepts (also noted under F5).
- **Written by** Sonnet (3 rounds) · **reviewed by** Opus (round 2: "nearly ready", one hole; round 3 was stopped mid-review) · **finished and checked by** the Claude session (Opus 5.5): read the round-3 change, corrected one comment, lint and tests.
- **Commit:** 204ec84

## 2026-11-23 · F7 · A second scan cannot replace a result that is not recorded (review M1)
- **Finding:** "scanning" went false before the result screen was set (two picture steps ran in between), and the SCAN button only checked "scanning". A pedal press or SCAN click in that gap, or two presses in the same moment, or SCAN with a result already up, started a new read whose result replaced the first without recording it (code review M1, and the low finding "SCAN and By hand replace a pending result").
- **Rule:** review fix.
- **What changed and why:** a scan is now busy from its first moment (a ref, `scanBusyRef`, set before anything else, so two presses in one moment cannot both start) until its result is on screen: "scanning" goes false only after the pictures are made, in the same render as the result screen. `doTriggerScan` (pedal, SCAN, hands-free) refuses while a result is up or a scan is reading, and the SCAN button is greyed while a result is up; Retry on the result screen is how a new read is asked for, as before. By hand is unchanged: with a result up it opens the form with Back to that result, so nothing is lost. Files: `src/App.jsx`, `src/lib/__tests__/no-scan-behind-dialog.test.js`.
- **Tests added:** "one scan at a time, and none over a result on screen" in `no-scan-behind-dialog.test.js` (reads App.jsx: the busy check comes first, nothing waits between "not busy" and the result screen, doTriggerScan refuses over a result).
- **Checks:** lint clean; 444 tests pass. Not yet clicked through on the test server (5174).
- **Written by** the Claude session (Opus 5.5) directly; the workflow was stopped before F7 started. Reviewed together with the matching rules (see below).
- **Commit:** 45bee4b

## 2026-11-23 · F1–F4 + owner's rule · The matching rules, as one change (review H2, M4; Noam N1, N2, N4, N5; the owner's no-name rule)
- **Finding:** the matcher could go green on a doubtful read (review H2: a "4" the camera called covered went green as #4 on a roster with #14 and #40); counted 07 and 7 as one jersey; matched one word of a name; read team names such as Cherry Hill or Silver Lake as jersey colours (review M4); and went green on a nameless row when the jersey showed a name.
- **Rules applied:**
  - **N1 (Noam):** a doubtful read is always yellow, also when name and number match exactly, and also when the doubtful field came back empty.
  - **N2 (Noam):** 07 and 7 are different jerseys. The owner, 23 Nov 2026: when both are on the roster the camera's read is trusted.
  - **N4 (Noam):** green needs the whole name; capitals, accents, apostrophes, spaces and hyphens do not count (spaces and hyphens: the owner, 23 Nov 2026).
  - **N5 (Noam):** a team's name never decides a green.
  - **The owner, 23 Nov 2026:** a name read where the roster row has no name is always yellow, also on a roster with no names.
- **What changed and why:**
  - `normNum` (text.js) keeps leading zeros. `nameMatches` (text.js) is whole-name equality.
  - colour.js no longer reads the team column. A row with no colour on the roster is "unknown", never ruled out: without this, twins with a blank colour lost to the other twin and went green (988 wrong greens in Opus's first fuzz test).
  - match.js:
    - the suspect path never returns green, and marks its lists `doubtful`;
    - a last check (`isDoubtfulRead`) turns any green from a doubtful camera read into a one-row list;
    - the one-item-list shortcut needs the number digit for digit and the whole name, and never agrees a nameless row with a name read or a numberless row with a number read;
    - a read of 07 offers #7 as a near miss;
    - an upside-down 60 can be #09.
  - App.jsx: the typed team shortcut no longer passes #07 for a typed 7, or #4 for a typed 40. Typed SAMUEL 9 no longer passes a numberless Samuel.
  - CLAUDE.md states the rules in the roster format section and corrects the notes they replace.
  - Files: `src/lib/text.js`, `src/lib/colour.js`, `src/lib/match.js`, `src/App.jsx`, `CLAUDE.md`, tests.
- **Tests added:**
  - `src/lib/__tests__/review-rules.test.js` (new): one block per rule, with the decided examples.
  - `invariants.test.js`: rewritten. New invariants: a doubtful read is never green; the team column never changes the result; green on a nameless row only when no name was read; twins need a known colour.
  - readguard, match, text and vigilance tests: updated to the new rules. The colour tests now use a colour column.
- **Checks:** lint clean; 465 tests pass. 3000-order simulation: WRONG GREEN 0, green 74.0% → 70.9%, yellow 19.8% → 23.5%, by hand 1.0% → 1.6% of jerseys. Opus's fuzz test, run before the last fix: 430,801 reads and 101,159 greens checked; the only failures were the empty-field doubt and the typed numberless row, and both are fixed in this change.
- **Accepted risks, decided or for Noam:**
  - With #7 and #07 both open, a camera that drops a printed 0 goes green on #7. This is the owner's call.
  - With Smith #2 and Smithe #2 both open, a SMITHE jersey read as a complete "SMITH" goes green on Smith.
  - If the live model marks name_complete false on jerseys with no name printed, number-only orders will go mostly yellow. A short live test on blank-name jerseys would settle it.
- **Not done:**
  - The vision prompt is unchanged (a "keep a printed 0" line needs the live recognition test first).
  - The green screen's "camera could not see the whole number" line and its simulation counter are now unreachable and can be removed.
  - The operator simulation no longer exercises colour-column twins (its camera reports the team as the colour).
- **Written by** Sonnet (four separate attempts, each rejected after 3 rounds because the rules overlap) and then by the Claude session (Opus 5.5) as one change, building on those attempts and on Opus's findings · **reviewed by** Opus (one review, blockers only: one blocker, the empty-field doubt, now fixed).
- **Commit:** 696c313

## 2026-11-23 · Phase 2 · Reports and the supervisor board (review M5–M12)
- **Findings:**
  - **M5:** the day sheet and Compare days counted the same scans more than once. An order past midnight, a parked order picked up at another station, a renamed order and a supervisor's check-off each added the same scans again.
  - **M6:** Accept or Reject turned a flag into "manual", so the flag left every damage report.
  - **M7:** an order finished with jerseys not scanned showed "in progress" for ever.
  - **M8:** Sign out deleted the station from the hub, with its day tally and the flags on their way to the supervisor.
  - **M9:** each keystroke in the header's order number opened a new order record and added the done count again.
  - **M10:** the board's order sheet dropped each event's status, so its Summary counted nothing.
  - **M11:** the order view's order sheet ignored the day being viewed.
  - **M12:** a station card's "Open order" opened the oldest run of the order.
- **Rule:** review fixes. Nothing on the floor changes for the operator except that Sign out leaves the station on the board, marked "signed out".
- **What changed and why:**
  - **The ledger** (hub-plugin.js):
    - A scan is filed under its own day, from its stamp, keyed by the order's run and its own id (`eventKey`, `fileEvent`), so a re-send from any station lands on the same entry. The station that scanned it is kept.
    - The existing ledger is put right once when the hub starts (`normaliseLedger`): copies are merged, keeping the newest content, the first station and any photo. Order records are untouched. On the test hub this merged 1,523 copies: its reports counted 4,043 passes for 2,574 real scans.
    - A check-off line carries the hub's id (`ledgerId`), so it is one pass, not two.
    - For a new order on a station, the day tally adds only passes the hub has not seen.
    - The same run under another number is a rename: one record, its start kept.
  - **The station** (App.jsx):
    - Accept and Reject keep the flag's status and record `outcome`.
    - Finish order sets `finishedAt` (saved, reported). "Back to this order" clears it.
    - A reload on the done screen brings the done screen back.
    - Finish later never parks an order as finished.
    - Sign out calls the new `POST /stations/:id/signout`, which marks the station and frees it at once. The supervisor's Remove still deletes.
  - **The board:** the rules moved to a new file, `src/lib/ledgerview.js`:
    - `orderDone`: finished by Finish order, or with nothing left to scan;
    - `pickRun`: the run asked for, else the newest;
    - `ofRun`: every event of the run, wherever it was scanned;
    - `eventsAsLog`: status kept.
  - The order sheet takes the day and run being viewed.
  - The day sheet's order rows match the run.
  - The Print menu's "Another order" and the replay find a run's scans wherever they were scanned.
  - **Files:** `hub-plugin.js`, `replay-plugin.js`, `src/App.jsx`, `src/lib/hub.js`, `src/lib/orderstore.js`, `src/lib/export.js`, `src/lib/ledgerview.js` (new), `CLAUDE.md`, tests.
- **Tests added:** `src/lib/__tests__/review-reports.test.js` (new, 15 tests: one block per finding, plus the two review follow-ups). The check-off test in `hub-unfinished.test.js` was changed to the new key.
- **Checks:**
  - Lint is clean and all 480 tests pass.
  - The 3000-order simulation shows WRONG GREEN 0, unchanged; matching was not touched.
  - On the test server (5174) a test station's rename, `finishedAt`, sign-out and one-scan filing were tried and are right. The test station was removed afterwards.
  - The board's screens were not looked at in the browser. They need a supervisor sign-in.
- **Review:** Opus, one review, blockers only. It found one blocker: a reload on the done screen left the order "finished" on the board while the station scanned on. That is fixed, with a test. It also checked `normaliseLedger` on a copy of the test data: nothing lost, and a second run changes nothing. Two of its notes were fixed too: the Print menu and the replay matched a run's scans by station only, and a renamed record now takes the new run.
- **Left open (non-blocking, from the review):**
  - A new order's first report counts passes and by-hand jerseys only, while later reports count every jersey done, including flags and missing.
  - The supervisor's Remove now restarts a station's day tally at 0.
  - Emptying the header's order number mid-edit still lists the order's open flags as "earlier order" items. This was already so before this change.
  - Two stations with the same run open at once overwrite each other's entries.
  - The sign-out call can race the page reload, as the old delete did.
- **Written by** the Claude session (Opus 5.5) · **reviewed by** Opus (one blocker, fixed).
- **Commit:** 6603876

## 2026-11-23 · Phase 3 · An order's life at a station (review M13–M18)
- **Findings:**
  - **M13:** Replace roster numbered the new rows from 0, so the old log's passes and flags attached to whichever new row landed in the same place. It also re-sorted a by-size order by team.
  - **M14:** Start order could run twice (Enter in the order field), and the second run lost the ship-with boxes. The supervisor's Send could send a roster twice.
  - **M15:** finishing a ship-with order again left its open boxes on the hub twice.
  - **M16:** New order deleted the order even when the hub had never received it.
  - **M17:** two roster columns for one field overwrote each other: Number plus a Home/Away "Jersey" column turned every number into "Home".
  - **M18:** a typed number not on the roster went straight to FLAGGED and printed a ticket, with no way back.
- **Rule:** review fixes.
- **What changed and why:**
  - **Replace roster** and **Add roster** number new rows past every id the order has used (`nextRowId` in roster.js). Replace keeps the order's box sorting.
  - **Start order** and **Send** run once at a time (the `starting` and `sending` refs).
  - **Finish order** of a ship-with order sends its whole set of open boxes, also none. The hub replaces what an earlier Finish of the same station, order and run left. A box the next order took stays as a mark (`takenBy`), is never offered or made again, and the station's note names the order that has it.
  - **New order** sends one last report (`reportNow`, taken out of the 5-second report) and waits up to 10 s. If the hub does not answer, the done screen keeps the order and says so. "Start a new order anyway" is a click only, and the focus leaves New order so the pedal cannot press it again.
  - **Duplicate roster columns:** the last column still wins, but a duplicate that is empty, or (for the number) is not jersey numbers or is a 1, 2, 3 … line count, is passed over and kept under its own header. The order column keeps its first-found rule.
  - **A typed number on no row** shows a check step first: "#88 is not on the roster — check the number", with ← Back first (the pedal goes back to the form), then "#88 — not on the roster", then Flag.
  - **Files:** `src/App.jsx`, `src/lib/roster.js`, `hub-plugin.js`, `CLAUDE.md`, tests.
- **Tests added:** `src/lib/__tests__/review-lifecycle.test.js` (new, 17 tests: one block per finding, the review's roster cases and the open-box cases).
- **Checks:**
  - Lint is clean and all 497 tests pass.
  - The 3000-order simulation shows WRONG GREEN 0, 0 roster rows lost in parsing, and the same green, yellow and by-hand shares as before.
  - The check step (M18) was tried on the test server (5174) as Station 3: #400 gives the existing "close to these" list with #40, #88 gives the new step, and Back goes back to the form.
  - Starting that test order printed one box label on the development server's Zebra (`\AK-NB-164\Zebra`). Finish order and New order were not tried in the browser, as they print box lists.
- **Review:** Opus, blockers only. It found two blockers in my first version, both fixed and re-checked by Opus:
  - the first rule for duplicate columns ("the plainer header wins") would have read a "#" line count as the jersey number, and changed Name + Last Name and Order + PO files. It now reads the same as before on 16 layouts, except the Home/Away case it fixes.
  - a second Finish only cleaned up when it left the same boxes open.
- **Left open (non-blocking):**
  - An order with no run (a very old session) can still leave duplicate boxes.
  - "Back to this order" does not take back boxes already left open, so the next order can take one while this order still adds to it. This was already so before.
  - A station with no hub at all needs the "anyway" click at every New order.
  - Replace roster still rebuilds the boxes from scratch and prints the set-out labels again.
  - A column passed over now shows as an extra column in the roster table.
- **Written by** the Claude session (Opus 5.5) · **reviewed by** Opus (two blockers, fixed and re-checked).
- **Commit:** c8d066f

## 2026-11-23 · Phase 4 · The hub's data file and the stages (review M19–M21)
- **Findings:**
  - **M19:** a data file that could not be read and could not be set aside (OneDrive holding it) was written over with an empty hub: 90 days of ledger gone.
  - **M20:** each reload of the server (any saved server file, a promotion) made a new hub while the old one's pending write (1.5 s) still fired, so old state could land over new.
  - **M21:** development and testing used production's packages through a link, so an install on either changed the floor's packages; a promoted package change was never installed; backups copied hub.json but not the unfinished orders (data\hub-orders).
- **Rule:** review fixes. The owner's: nothing is changed on the floor without a promotion.
- **What changed and why:**
  - **The data file** (hub-plugin.js):
    - A read that fails is tried three more times, half a second apart.
    - A file that still cannot be read is left as it is, and the hub is `blocked`: it writes nothing and answers every request, reads too, with a 503 that stations and the board show.
    - A file that does not parse is set aside as before. If it cannot be set aside, the hub is blocked.
  - **One hub per data file** (a map on `globalThis`):
    - A new hub closes the old one first: its pending write goes to disk, then the new hub reads the file.
    - The old hub then reads each request's whole body and hands it to the newest hub. A request mid-upload during a reload, or one reaching the old server when the new server fails to start, lands in the new hub.
    - One exit listener flushes every hub.
  - **The stages** (`tools/stagelib.ps1`, new, used by stage.ps1, promote.ps1 and pull-testing.ps1):
    - **Own packages:** each stage folder has its own packages (`npm ci`). A folder that still links another folder's packages gets its own; the link is removed with `rmdir` alone, which never touches the folder it points to. Only a real junction or symbolic link counts as a link: a OneDrive folder does not.
    - **Changed packages:** a stamp in node_modules records which package-lock.json the packages were made from. When it changes:
      - `promote.ps1 -Production` stops the "Jersey QC server" task and port 5173. It stops with nothing changed if the task does not stop. It then installs and starts the task again; a failed install says how to recover or go back.
      - `pull-testing.ps1` stops the testing server for the install.
      - `stage.ps1` does it for development and testing.
    - **Backups:** promotion and the testing pull copy `data\hub*.json` and `data\hub*-orders\` into `data\backups\<date_time>\`, keeping the newest 20.
  - **Files:** `hub-plugin.js`, `tools/stagelib.ps1` (new), `tools/stage.ps1`, `tools/promote.ps1`, `tools/pull-testing.ps1`, `CLAUDE.md`, tests.
- **Tests added:** `src/lib/__tests__/review-hub.test.js` (new, 9 tests):
  - an unreadable file is never written;
  - a bad file is set aside;
  - a new hub starts from the old one's unwritten changes;
  - a request mid-upload lands in the new hub;
  - the old server works through the new hub;
  - the scripts never link packages, back up the orders, and use `rmdir` without /s.
- **Checks:**
  - Lint is clean and all 506 tests pass.
  - The four scripts parse.
  - `stagelib.ps1` was run on throwaway folders: a linked folder got its own packages and the linked folder's file was untouched; a changed lock file was noticed; a failed `npm ci` returned failure; backups kept 20.
  - The test server (5174) reloaded on the new hub code without losing its data.
  - promote.ps1, pull-testing.ps1 and stage.ps1 were NOT run (they move branches and stop servers); nothing was run on the server PC.
- **Review:** Opus, blockers only. It found two blockers in my first version, both fixed and re-checked by Opus:
  - a request mid-upload during a reload answered 200 but its change was lost (a "Finish later" could vanish);
  - a new server that failed to start left the floor answering 503 to everything.
- **Left open (non-blocking):**
  - A missing stamp in a real node_modules is taken as current. A production folder whose packages are already stale stays so until the next package change.
  - The first promotion that brings these scripts runs the OLD promote.ps1 on the server PC, so it backs up hub.json only and installs nothing. This change has no package changes.
  - Development's own folder (this PC) still links production's packages until `Development server.bat` is next run, which makes its own.
- **Written by** the Claude session (Opus 5.5) · **reviewed by** Opus (two blockers, fixed and re-checked).
- **Commit:** 9760346

## 2026-11-23 · Phase 5 · Consolidation (review: "App.jsx has no tests", the experiments and dead code, one dialog state)
- **Findings:**
  - App.jsx (about 5,300 lines of screens and state) had no tests.
  - The operator simulation re-stated the result-screen rules by hand.
  - Experiments and dead branches stayed in the scan path: the input trial, SECOND_LOOK, the always-true `wide` layout, and the unreachable "entered by hand" screen.
  - About 19 dialog flags were read in two hand-written lists.
- **Rule:** review fixes. The input trial was taken out as `tools/INPUT-TRIAL.md` itself said to ("Removing it"), as part of the phase plan the owner approved. Nothing an operator uses changes.
- **What changed and why:**
  - **Removed (commit 6ed62ca, 874 lines):**
    - the input trial: its model, page, Settings section, header pill and simulation report;
    - SECOND_LOOK;
    - the `wide` flag and the full-screen result it never used;
    - the "entered by hand" screen (`manualDone`), unreachable since 20 Nov 2026.
  - **What a read becomes** is now `src/lib/scanpolicy.js` (`screenFor`, `matchRead`, `readOptions`, `nothingRead`). `doRunScan` in App.jsx and the operator simulation both call it, so the simulation tests the station's real rule.
    - Doing so showed that the old copy differed in one case. A blank first read with a good second (self-check) read went on in the simulation, but the station shows "No name or number in view" and the operator scans again.
    - The simulation's numbers moved by that: green 70.9% → 70.8%, retry 3.1% → 3.3%. WRONG GREEN is still 0.
  - **App smoke tests** (`src/__tests__/app-smoke.test.jsx`, jsdom and Testing Library): the whole station is rendered with stand-ins only for the model's read, the sounds, the canvas and the hub. Three tests:
    - resume an order;
    - scan → green → checklist → Confirm passes the jersey;
    - Finish of a ship-with order leaves Box 1.1 open on the hub, and New order sends its last report first.
  - **`vitest.config.js`** (new): tests compile JSX the modern way and no longer load the server plugins (the hub plugin opened data/hub.json on every test run).
  - **The development folder** got its own packages (`npm ci` through `tools/stagelib.ps1`; the link to production's packages was removed, production's folder untouched: 150 package folders before and after). The test packages went in as devDependencies: jsdom 25.0.1, @testing-library/react 16.1.0.
  - **One dialog state: not refactored.** Phase 1 (F6) already made ONE list of dialogs (`anyDialogOpen`) that the pedal, hands-free, SCAN and the result screen read, with a test that fails when a dialog state is missing from it. A single variable cannot hold the screens that stack (Print over the done screen, a photo over History) and would have touched about 60 places for no gain. The review agreed.
  - **Files:**
    - changed: `src/App.jsx`, `src/config.js`, `CLAUDE.md`, `package.json`, `package-lock.json`, the simulation and dialog tests;
    - new: `src/lib/scanpolicy.js`, `vitest.config.js`, tests;
    - deleted: `src/lib/trial.js` with its test, `tools/input-trial.html`, `tools/INPUT-TRIAL.md`.
- **Tests added:**
  - `src/lib/__tests__/scanpolicy.test.js` (7 tests);
  - `src/__tests__/app-smoke.test.jsx` (3 tests).
  - The trial's 10 tests went with it.
- **Checks:**
  - Lint is clean and all 506 tests pass.
  - The 3000-order simulation shows WRONG GREEN 0 and findings 0.
  - The test server (5174) started on the development folder's own packages, offered the saved order, and drew the station screen with no console errors.
- **Review:** Opus, blockers only: no blockers. It confirmed that `screenFor` reproduces the old `doRunScan` exactly (order of checks, the self-check count, tones, every overlay field) and that the simulation's change is the case described above. Two of its notes were taken: the Finish smoke test checks that Box 1.1 is sent, and the test config says why it sets JSX twice.
- **Left open (non-blocking):**
  - `tools/break-it.js` and `tools/browser-harness.js` still look for the "ENTERED BY HAND" screen, gone since 20 Nov 2026. Their by-hand checks need to expect the green screen.
  - The New order smoke test checks that a report was sent, not that it went before the order was cleared.
  - The package change means the next promotion to production runs `npm ci` with the floor's server stopped, once the new promote.ps1 is on the server PC.
- **Written by** the Claude session (Opus 5.5) · **reviewed by** Opus (no blockers).
- **Commits:** 6ed62ca (dead code), 8ebc5f7

## 2026-11-23 · Phase 6 · The small fixes (review, low findings)
- **Sorted:** of the 60 low findings, about 25 were fixed here, about 10 had already been fixed in phases 1–5, and about 15 (documents) go to phase 7. About 8 design points that need the owner (one data file, the whole log every 5 s, stations hard-coded, status words) are left for a decision, together with the letters the owner said are not used (ø, ł, ß).
- **Done in three parallel pieces, merged:** the station (App.jsx, by the Claude session), the libraries (a helper), and the hub and scripts (another helper), each on its own copy of the code.
- **Station (8791077, and the review's blocker):**
  - **Finish order** is a click: Enter (the pedal) no longer finishes an order. This changes the owner's 12 Nov note; to confirm with the owner.
  - **After a pick from a list**, "← Back to the list": a wrong pick had no way back.
  - **Other at sign-in** asks for the name on the screen's keys (it used to sign in as "Other").
  - **The resume screen** counts done as passed or by hand.
  - **The box weight field** can be typed in.
  - **The board's day picker** drops answers for a day no longer picked.
  - **Add roster** adds to the roster as it is after the file is read.
  - **The self-check** logs the read its match came from.
  - **The turn check** uses the rows the matcher sees.
  - **Hand entries** keep what was typed ("Typed: #N · NAME"; `typed` on the hub event).
  - **The order number field** takes digits only.
  - **Printer errors** are in plain words (PowerShell's text stays in the server log).
  - **Typed name and team:** choosing a team in the hand form no longer passes a row whose name differs from the name typed.
- **Libraries (13df31a, and the review's note):**
  - A typed name that is not the row's name is a question.
  - A title row's order number needs a digit.
  - "12.0" and "7.00" are 12 and 7.
  - A line break inside a quoted CSV cell is a space, and a record that takes in more than two line breaks falls back to plain lines (a stray quote no longer swallows rows).
  - The day sheet's Passed is lowered only by an undo of a pass.
  - Ladies sizes are one box class below adult (an estimate).
  - A past order's flags keep their resolution.
- **Hub and scripts (126ecfb):**
  - No printing on development or testing unless `JQC_STAGE_PRINT=1` in their `.env.local`. To tell the owner: the testing server no longer prints by default.
  - An unreadable order file is kept aside before a park writes over it.
  - `merge-hub-data.mjs` keeps unfinished orders, open boxes and every newer part of the file, and says what it did with `hub-orders`.
  - `hub-stress.mjs` needs an address and refuses 5173.
  - `serve-hidden.vbs` keeps the last run's log as `server-previous.log`.
  - `promote.ps1` says when the push of production failed, and lists the stage config and the replay plugin among the files that reload the server.
- **Tests added:** 24, in `review-rules`, `typed-number`, `roster`, `export`, `box-sim`, `damaged`, `merge-hub` and a new `hub-order-file`.
- **Checks:**
  - Lint is clean and all 530 tests pass.
  - The 3000-order simulation shows WRONG GREEN 0, WRONG DUPLICATE 0 and 0 roster rows lost in parsing; green is 70.8%.
  - The `.ps1` files parse; the `.vbs` was run in a scratch copy.
  - Not tried in the browser.
- **Review:** Opus, blockers only. One blocker, fixed: the hand form's team shortcut passed #12 JONES when SMITH 12 was typed with team Navy.
- **Left open (non-blocking):**
  - `merge-hub-data.mjs` cannot remove an unfinished order that an older copy still has.
  - `serve-hidden.vbs` loses the older previous log if `server.log` is held open.
  - `vite.config.diag.js` (the development test server, not in git) still prints on the Zebra.
- **Written by** the Claude session (Opus 5.5) and two helpers · **reviewed by** Opus (one blocker, fixed).
- **Commits:** 8791077, 13df31a, 126ecfb (merged in 168a94a, ae06d5e), 160c295

## 2026-11-23 · Phase 7 · Maintainability: documents and comments
- **Goal:** anyone new (an intern, IT, a manager) can find out what the app does, how to use it, how it is deployed, and why each rule is there.
- **What changed:**
  - **Front door and guides:**
    - `README.md`, rewritten as the front door: what the app does, the three stages, how to run and test it, a map of the code, and ONE complete table of settings.
    - `docs/OPERATOR-GUIDE.md` (new): the station and the supervisor board, task by task, with what to do when something goes wrong.
    - `docs/DEPLOY.md` (new), for IT: the PCs, stages, the bat files, promotion and how to undo it, the scheduled task and its logs, the move out of OneDrive, data files, printers, firewall, kiosk, troubleshooting.
  - **`CLAUDE.md`,** rewritten as a current reference by topic:
    - every rule is kept with who decided it and when;
    - the history is left to git and this changelog;
    - the READ FIRST rules, "Which PC is which" and git authorship are kept intact;
    - 20 places where the old text contradicted the code were corrected to the code. For example: the API key is `CLAUDE_API_KEY`; there is no "edit with A" on the green screen; Box full is under 📦 Packing; Skip comes first on a flagged jersey's ALREADY DONE screen.
  - **Old documents:**
    - `HANDOFF.md` is retired: what was still true moved into the guides, and its open ideas into the roadmap.
    - `DEMO-CHECKLIST.md` and `ROADMAP.md` are brought up to date.
  - **Comments** (code unchanged; checked line by line):
    - a header on every file that had none (App.jsx with a map of its components, main.jsx, vite.config.js, eslint.config.js, 14 test files);
    - a comment on every exported function and every screen component;
    - stale comments fixed: the model named in `vision.js`, `boxes.js` (only the simulation's baseline now), contradicting comments in `match.js`, B as the scan key (it is Enter), and the removed screens and flags.
  - **On screen:** the set-out screen said the DAMAGED box's label prints "from Boxes". It prints from the Print menu.
- **Corrections to earlier entries in this changelog:**
  - The green screen's amber "Camera could not see the whole number" line is NOT unreachable: it shows on the green that follows a pick from a doubtful list (phases 1 and 5 said otherwise).
  - The DAMAGED box label prints only on request (the owner, 19 Nov 2026), not with the first flag.
- **Review:** Opus checked the guides and CLAUDE.md against the code for wrong instructions; no owner's rule was lost. Five wrong instructions were found and corrected:
  - **the DAMAGED label:** where it prints from;
  - **Box full:** the button names;
  - **stopping the server:** ending the task alone does not stop it; port 5173 must be stopped too;
  - **undoing the move out of OneDrive:** the steps were incomplete;
  - **checking the printer:** see first which queue the hub really uses.

  The PIN values were also taken out of CLAUDE.md (only "defaults in src/config.js, real ones in .env.local").
- **For the owner:**
  - **The PINs.** The station and supervisor PINs are the defaults in the code unless `.env.local` sets them, and no `.env.local` seen here sets them. Set real ones.
  - **Facts the writers could not confirm from the code:**
    - whether `setup-production.ps1` has been run;
    - which PC runs the testing server;
    - whether checklist items 8 and 10 (the flag list, a real roster file) were ever done.
- **Left open:**
  - `tools/break-it.js` and `tools/browser-harness.js` are out of date: they use B, look for the old full-screen result and expect the removed "entered by hand" screen.
  - `setup-production.ps1`'s closing message names `promote.ps1` without `-Production`.
  - `Start Jersey QC.bat` runs `npm install` (not `npm ci`) and shows the PINs on screen.
  - `.claude/launch.json` says http for the 5174 server, which answers on https.
  - Unreachable code noted in comments, to remove later: `ReasonTextForm` and the custom reason, ScanOverlay's `!embedded` branches, and `putOrder`, `getOrder` and `orderKey` in `orderstore.js`.
- **Written by** three helpers in parallel (guides; CLAUDE.md; comments) and the Claude session (review, fixes, merge) · **reviewed by** Opus (five wrong instructions and the PINs, fixed).
- **Commits:** 2417099 and the next (documents), b4d29e0 (comments, merged), 95da5c7

## 2026-11-23 · Result screens: Decoration, a quick look with nothing to tick, the one-column list (the owner's notes of 23 Nov 2026)
- **Asked for:** (1) on the yellow screen a list of three rows or fewer had one column and its tiles were nearly twice as wide as a two-column tile: give it the width of one column, centred, and bigger text when that leaves nothing to scroll; (2) the green screen's "Name & Number" and "Logos" checks become one, "Decoration"; (3) on a quick look nothing is ticked: the common faults, Decoration and Size tag, are shown big to look at, the others small, and Confirm is one press; after a flag the related check is still ticked on the next 5 jerseys.
- **What changed:** `CHECKS` in config.js is Decoration, Size tag, Fabric damage, Holes, Thread damage. `checksFor` (vigilance.js) now returns `required` (ticked), `look` (big, not ticked) and `remind` (small): on Inspect fully every check is required; on a quick look only the checks a flag added are required, the `quick` ones are `look`, the rest `remind`. `REASON_CHECK` has a check for every reason but Others: Name or number, Logo or crest and Sublimation error → Decoration; Size label and No size tag → Size tag (the No size tag flag on the pick list used to restart Inspect fully); the damage reasons as before. The green draws "Look at" pills for `look`. The pick list's container is `calc(50% + 20px)` wide (one column of the two-column list) for three rows or fewer, with `big` on `CandidateRow` (text a fifth bigger) tried first and dropped, before paint, when the list would scroll or a name would not fit on its line (`tooBig`, a layout effect with flushSync; a name broken in two is harder to read, not easier). Files: `src/config.js`, `src/lib/vigilance.js`, `src/App.jsx`, `src/lib/__tests__/vigilance.test.js`, `CLAUDE.md`, `docs/OPERATOR-GUIDE.md`.
- **Tests:** `vigilance.test.js` covers the three kinds on Inspect fully, on a quick look, and after a flag added Fabric damage.
- **Checks:** lint clean; 530 tests pass. Clicked through on the development server on AK-NB-165 at 1920×1080: Inspect fully shows five tick buttons with Decoration; the quick look shows "Look at Decoration · Size tag" and Confirm at once; after a Name or number flag the next green has "Tick each ☐ Decoration", "Look at Size tag" and the pill "+Decoration"; a three-row #7 list sits in one half-width column, centred, at the usual size (the bigger text made "KOVALENKO" wrap and the list scroll, so it was dropped).
- **Left open:** at the panel's width beside the camera a 9-letter name wraps onto a second line in the half-width tile, as it does in the two-column list. The "Flag it" button on the Last passed strip still opens the reasons menu over a result screen that is up, replacing it (seen while testing; not changed here).
- **Branch:** `feature/result-screens`, off `development`; the order summary and box-list printing of the same notes are on a co-worker's branch.

## 2026-11-24 · The pick list's tile: one line, the number always big (the owner, 24 Nov 2026)
- **Asked for:** on a by-team order every row of the yellow list has the same number, so the tile made the team the big line and "#2" sat small and grey under it; operators were confused. The number is the important information. A first mockup with number, name, team and size all big was "a lot of information": the owner chose one line a tile, only the number and the size big.
- **What changed:** `CandidateRow` is one row of three zones: the number on the left in the size box's font and size, on a fixed width so the tiles line up ("—" for a jersey with no number); the name and team on one modest line in the middle, "LEACH · 10U" (a nameless row is just the team); the SIZE box and the arrow on the right as before. The adaptive headline is gone (`HEADLINE_FIELDS`, `primary`, `secondary`): what `differingFields` finds is coloured amber on the tile instead (the team, a name, an extra column), and the "· differs by Team" line under the header is unchanged. The blue came-back bar and line, the Flagged / Already passed badges, `big` and its measurement (`data-head` now on the middle line) are kept. Padding 6px 14px 6px 16px: a tile is the size box's height. Files: `src/App.jsx`, `src/lib/match.js` (comment), `src/__tests__/candidate-row.test.jsx` (new), `CLAUDE.md`, `docs/OPERATOR-GUIDE.md`.
- **Tests:** `candidate-row.test.jsx`: a nameless row has the number first, the team alone on one line in amber and the size on the right; a named row reads "LEACH · 10U" with the name white and the team amber; a passed row is grey with its badge, and a row with no number shows a dash.
- **Checks:** lint clean; 533 tests pass (41 files). Clicked through on the development server (5174, HTTPS) on AK-NB-165 at 1920×1080 with a by-team roster: a four-row #2 list is two columns of one-line tiles, every tile the size box's height (86 px logical), "#2" big and white on the left, "8U A" alone or "LEACH · 10U" in the middle with only the team amber, a long name ("KOVALENKO · 12U") wrapping at the dot, nothing scrolling; a #7 list of two is one half-width column; a #100 list draws the three digits on a wider number zone. Number zone 1.4em, middle text clamp(18px, 1.7vw, 24px): the middle beside the camera is ~150 px, so 2.1em and 28 px broke names in two.
- **Left open:** the size box sets the tile's height, so a tile cannot be shorter than the box; a shorter list would need a smaller size box.
- **Branch:** `feature/result-screens`.

## 2026-11-24 · The order summary and what is NOT in a box (the owner's notes of 23–24 Nov 2026)
- **Asked for:** "The order summary should have: which jerseys are there and passed, which are there and failed, which are missing. Each box should have: what's there, what isn't there and why (failed + missing)." The owner's answers: missing and not-scanned side by side; print on request and after every finished order, with a way for the operator to see the list before it prints; the "not in this box" part on a team's last box. (First meant for a co-worker, who is on the damage tickets with the jersey outline instead.)
- **What changed:** `orderSummary(pack)` and `summaryJobs(pack, { withPassed, station, date })` in printjobs.js; `listLabels` in labels.js (the DAMAGED list's layout for any titled list; `boxesListLabels` is now a wrapper) and `summaryCountZPL` (a `summary` label in `binListZPL`); `damagedItems` carries `_id` and `size`. `notInBox` / `notInBoxJobs` / `isLastBox` in printjobs.js: `boxListJobs` puts a box's NOT IN BOX list before its rows when the box is the last of its group; the station's Box full does the same when nothing of the group is left to scan, Finish order for every open box, the Boxes dialog's reprint when the box is the last. `OrderSummaryModal` in App.jsx (three columns, the missing column split in two; Print summary, With the passed list, Finish order…), opened from a "📋 Summary" button on the bottom bar, "📋 See the summary first" on the Finish order confirm and "📋 Order summary" on the done screen; Finish order's print run adds the summary after the box lists and the DAMAGED list; the Print menu has an "Order summary" section (a past order too). `showSummary` is in `dialogOverResult`. Files: `src/lib/printjobs.js`, `src/lib/labels.js`, `src/App.jsx`, `src/lib/__tests__/printjobs.test.js`, `src/lib/__tests__/damaged.test.js`, `CLAUDE.md`, `docs/OPERATOR-GUIDE.md`.
- **Tests:** printjobs.test.js: the summary's three lists and counts; its labels in print order (MISSING, FAILED, count label; PASSED first on request) and the count label's ZPL; NOT IN BOX lines with their reasons, only on the group's last box, before the box's own list.
- **Checks:** lint clean; 537 tests pass (41 files). Clicked through on the development server (5174) on AK-NB-165: one jersey passed, one flagged (Name or number), one marked missing; the Summary screen showed Passed · 1 with its box, Failed · 1 with the reason, Missing · 6 as Marked missing · 1 beside Not scanned yet · 5; Print summary reached the hub (refused, as printing is off on that server, and said so on the screen); the Finish confirm offered "See the summary first" and counted 6 labels (the box list, the DAMAGED list and the summary's three).
- **Left open:** a team whose open box is empty at Finish order (every jersey of it flagged or missing) prints no box list and so no NOT IN BOX list; the summary's MISSING and FAILED lists cover it. The supervisor board does not show the summary yet.
- **Branch:** `feature/result-screens`.

## 2026-11-24 · Review of feature/result-screens (a fresh Fable agent; fixes in two stages)
- **Stage 1 (floor-breakers), commit a56e272:** (1) the order summary opened from the done screen was drawn UNDER it (z 1500 against 2300) and, not being cleared with the order, came back over the next order's screen: it now sits at z 2400 and `resetOrder` clears `showSummary` / `summaryPrint`. (2) At Finish on a ship-with order a box kept open had its list held back but its NOT IN BOX list printed, saying a box that is open on purpose is short: the NOT IN BOX labels carry `box`, and `printFinishLists` holds them back by it.
- **Stage 2, this commit:** (3) `isLastBox` also requires that nothing of the group is left to scan (Box full's rule), unless the order is finished (`pack.finished` on the done screen, `pack.past` for a hub record): a reprint of a closed 1.1 with an empty 1.2 no longer lists jerseys that are simply going into 1.2 later. (4) the summary's Failed list comes from the roster (every row flagged now; "flagged" when its log entry is gone) and the flags with no row are `extra`, shown as "Not on the roster · N" in the Failed column and "+N extra" on the count label, so the arithmetic holds. (5) the summary's print buttons say how many labels and ask above 30 (the Print menu's `many`; a confirm on the summary screen). (6) the NOT IN BOX header has no order number: a long team name squeezed it to 1.4 mm type. (7) "· differs by Team" shows whenever the team (or an extra column) differs, names differing too or not; CLAUDE.md says so.
- **Not changed:** (8) the one-column `big` text is measured once per list (a resize while a list is up, fonts not yet loaded on a cold start); (9) "Dirt or mark" counts as a defect before the jersey is cleaned (pre-existing; for the owner to decide).
- **Tests:** printjobs.test.js: NOT IN BOX labels carry their box and are held back with it; a closed box with jerseys still to scan is not last, a finished order's is; a flagged row with no flag entry is failed, a flag with no row is extra and on the count label as "+1 extra"; the NOT IN BOX header keeps the order number off.
- **Checks:** lint clean; 540 tests pass (41 files). Stage 1 clicked through on the development server (5174): Finish order, then "📋 Order summary" on the done screen shows the summary above it (z 2400), Close and "Back to this order" return to the order.
- **Stage 3 (the second check's findings), commit below:** (6, fully) the DAMAGED / NOT IN BOX / list header never goes below two thirds of its height: a long title is cut with "…" to what fits (`damagedListZPL`). (A) Finish order prints a NOT IN BOX list for an open box that is empty too, when its team lacks something (a team flagged or marked missing after its last full box closed): the strip and the Print menu now agree. (B) a duplicate flagged from the ALREADY DONE screen (its row stays passed) is an extra in `damagedItems`, so it is on the DAMAGED list, the summary and the FAILED list; a resolved one is out. (C) the extras are headed "No roster row · N" on the summary screen and carry no suffix on the FAILED list (their reasons say Duplicate / Not on the roster / No size tag). (D) "+N extra" sits on the count label's SUMMARY line, so the passed · failed · missing line keeps its size. Not changed: (E) on a picked-up order a flagged jersey may still come back, but the last-box rule (and Box full's `left`, pre-existing) counts it as gone.
- **Tests:** a duplicate on a passed row is an extra (and out when resolved); a long NOT IN BOX title keeps a 14-dot header and ends in "…", a short one is untouched; the extra on the SUMMARY line.
- **Checks:** lint clean; 542 tests pass (41 files).
- **Stage 4 (the third check's findings), commit below:** (1) the header trim tested the title against the wrong width (`lw * 0.7` for `lw / 0.7`), so titles that fit once the letters are squeezed ("NOT IN BOX 2.1 Lightning") were cut; the floor is 14 dots on the 2 x 1 in roll, not the 16 written. (2) Stage 3's Finish change printed a second NOT IN BOX list under the empty next box that Box full always opens (1.1 closed with nothing left → 1.2, where a jersey that comes back would go): the same jerseys as the list Box full printed for 1.1, under a box that is not on the floor, and the Finish confirm's label count was up by it. Now the closed entry keeps the rows its NOT IN BOX list named once it has printed (`notIn`, set after the print succeeds; in the saved session and the hub snapshot), and Finish order prints for an empty open box only what `finishNotInBoxJobs` says: nothing when the closed last box's list is unchanged; the whole list again under the CLOSED box's name when a jersey was flagged or un-checked since, or the box closed before the record existed or with jerseys still to scan; and under its own name when the team has no closed box at all (every jersey flagged or missing). The Print menu's every-box list prints that lone empty box's NOT IN BOX list too, so the two agree. The next box is still opened: it is where a jersey that comes back goes. (3) a duplicate copy is decided from its reason alone in `damagedItems`, so it stays in the DAMAGED box and the summary when its row is later flagged for damage itself. (4) the Finish confirm and the roster-complete screen count the extras as the summary does (`summaryNow.counts.extra`), duplicate copies included; the roster table's "NOT ON THE ROSTER · DUPLICATE · NO SIZE TAG" section still lists the off-roster flags only.
- **Tests:** a nine-letter team title is not cut; the three Finish cases for an empty open box and the unchanged-list case; the Print menu names the closed last box and the lone empty box, never the empty next box; a duplicate copy with its row flagged later.
- **Checks:** lint clean; 547 tests pass (41 files). Not tried on the Zebra or in the browser.
- **The fourth check (on stage 4), commit below:** the trim test still skipped the printer's flooring of the width setting, so most cut titles printed at 12 dots: `heightOf` in `damagedListZPL` now mirrors `tight()` step for step, and the test tries four long team names. Left as notes: the Print menu's per-box List button stays off for an empty box (its NOT IN BOX list comes with "every box list"); a closed box emptied after closing gets no NOT IN BOX list from the Print menu (Finish prints it); un-checking a passed row resolves its duplicate copy too (pre-existing), so the copy leaves the DAMAGED list though the second jersey is still in the box.

## 2026-11-24 · Damage location on the flag ticket (2 x 3 in and 2 x 4 in rolls)
- **Goal:** the repair department should not have to hunt for the damage. The floor is getting 2 x 3 in and 2 x 4 in labels; today's 2 x 1 in ticket only says WHAT is wrong.
- **Rules:**
  - **The owner, 23 Nov 2026:** the tall roll replaces the 2 x 1 in roll on the ticket printer, so box labels and lists print on it too. Only physical defects ask where (Name or number, Logo or crest, Twill peeling, Sublimation error, Stitching or seam, Holes, Dirt that will not come out); not Size label, Others, No size tag, Duplicate or Not on the roster. Up to 3 spots. Skip is allowed, so the pedal never gets stuck.
  - **The owner, 24 Nov 2026:** two tickets a flag still; box labels and the count label keep today's size on a tall roll, blank under them; hockey is the default garment; the 11 garment kinds; four calls on the catalogue's codes: pant shells are shorts, the ZA2010 / ZA2020 short-sleeve hoodies are tees, the ZATS short-sleeve jackets are jackets, ZBA76 is a tank, and the BA101 belt is no garment.
- **What changed:**
  - **Garments** (`src/lib/garments.js`, new): 11 outlines (hockey, tee, long-sleeve, button, tank, football, hoodie, zip jacket, shorts, pants, socks), traced by hand against the 2026 catalogue's flat drawings (pages 85–104; the catalogue is not in git), with front and back details and named areas for the words ("Front: left sleeve · Back: lower middle"). The catalogue's style codes map to a kind (`GARMENT_STYLES`); a row's style beats the order's garment, which beats hockey (`garmentOf`).
  - **The station:** a Garment picker on the order screen and the supervisor's send form (picked from the Style column when most rows have a known one). After a defect reason, "Where is the damage": the garment front and back, tap up to 3 spots, Done / Skip / Undo; Esc skips; the pedal skips while nothing is marked. The flag is logged at once; its ticket prints when the step ends. The FLAGGED screen, History and the Last result card show the marks.
  - **The ticket** (`src/lib/labels.js`): on a roll 2.5 in tall or more, today's ticket in the top inch and the garment's front and back under it with numbered spots ("Not marked" without). Box and count labels keep today's look at the top. Lists are re-paged at the hub to fill a tall label (56 jerseys a 2 x 4 in box-list label). On the 2 x 1 in and sticker rolls every label is byte for byte as before (fixture).
  - **Hub, board, reports:** flag events carry `garment` and `spots`, kept across re-sends and data-file merges; the board shows the marks beside the photos; the damage report has Where and Garment columns; Print menu reprints, also of past orders, keep the marks; a ticket roll per station (`JERSEY_FLAG_LABEL_SIZE_STATIONn`); `POST /print` answers with the labels that really came out.
  - **Documents:** CLAUDE.md ("Where is the damage", "Garments", the tall labels, the settings, routes, reports and tests), `docs/OPERATOR-GUIDE.md` (the step, the picker, what the ticket shows), `docs/DEPLOY.md` (switching a station to the tall roll: load, calibrate, set the size, test print), `README.md` (settings).
  - Files: `src/lib/garments.js` (new), `src/lib/labels.js`, `src/config.js`, `src/App.jsx`, `src/lib/hub.js`, `hub-plugin.js`, `vite.config.js`, `vite.config.stage.js`, `src/lib/printjobs.js`, `src/lib/damage.js`, `tools/merge-hub-data.mjs`, the documents.
- **Tests added:** `garments.test.js`, `labels-tall.test.js` with `fixtures/labels-2x1.json` (today's 2 x 1 in and sticker labels, byte for byte), `damage-location-hub.test.js`, "where is the damage" in `app-smoke.test.jsx`, and additions to `hub-routes`, `config` and `no-scan-behind-dialog`.
- **Checks:** lint clean; 858 tests pass (43 files); the operator simulation shows WRONG GREEN 0 and WRONG DUPLICATE 0. Not yet printed on a real 2 x 3 in or 2 x 4 in roll; not yet clicked through on the test server (5174).
- **Left open:**
  - The first real print on a tall roll: the sloped garment lines are 2 to 3 dots thick; check they print unbroken (`docs/DEPLOY.md`).
  - Two tickets a flag on 2 x 4 in is 8 in of label a flag (the owner kept two tickets, 24 Nov 2026); worth watching how fast the rolls go.
  - The branch `feature/damage-location` is to be merged into `development` when tested, then promoted only when the owner says so.
- **Written by** the Claude session (Opus 5.5) in five stages, each by a helper · **reviewed by** Opus after every stage (the documents: one blocker, a wrong printer requirement in `docs/DEPLOY.md`, fixed).
- **Commits:** c10678f, 0afaca1, 1629041, 1325790, and the documents' commit.

## 2026-11-25 · Label rolls at the station, the box label turned, the count label and its list on one label (the co-op, 25 Nov 2026)
- **Asked for:** choose in Settings which roll each print uses (2 x 4, 2 x 3, 2 x 1, 1 x 0.5; 2 x 4 by default for all three, kept after being told it changes every station at promotion); on a tall roll turn the box label 90 degrees and fill the label; start a box list right under its count label instead of on a new label.
- **What changed:** Settings -> Label printer has a roll beside stickers, flag tickets and box lists (`stickerRoll`, `flagRoll`, `boxRoll`; `LABEL_ROLLS`); every print sends `roll` and the hub lays the label out for it, a 1 x 0.5 label to the sticker printer, the others to the ticket printer; with no roll the `.env.local` sizes as before. On 2 x 3 and 2 x 4 the box label is turned (`binLabelTurnedZPL`, `^A0R`) and spread over the label; a box list's count label takes the top inch of its first label with the rows under it (`repageLists`, `listRows`).
- **Tests:** `label-rolls.test.js`; `labels-tall.test.js` (the turned box label, the count label with its rows, 2 x 3 paging). 2 x 1 and the sticker roll are byte for byte as before (fixture).
- **Checks:** lint clean; all tests pass. Printed on the Zebra on AK-NB-164 on 2 x 4 and 2 x 3: three flag tickets, sticker, box label, box lists, DAMAGED, DONE BOXES and NOT DONE lists; the co-op: "They look good" (2 x 3 preferred).
- **Left open:** the order summary's count label (merged from `development`) is laid out on the whole label on a tall roll; not printed on a tall roll yet. When promoted, every station's Settings start at 2 x 4: a station still on the 2 x 1 or sticker roll must pick its roll.
- **Commits:** a8caa14, 4bfdc6f, 6b3b324 on `feature/damage-location`, merged into `development`.

## 2026-11-25 · The yellow list follows the last jersey's size (the owner, after the run of 24 Nov 2026)
- **Asked for:** jerseys come in bundles of 10-12 of one size. On a numbers-only roster the pick list for #12 has every size's #12 in rack order, so for a bundle of ladies small the operator scrolled to the bottom on every jersey.
- **What changed:** `sortCandidates(rows, by, { lastSize })` ranks the rows before the chosen order: the same size as the last confirmed jersey, then its family (youth, adult or ladies: the group `sizeRank` already gives the rack order; a size with no family, XL or OSFA, brings up only its own rows), then the rest; within a rank the Settings sort stays. `sameSize` compares two sizes however they are written. `ScanOverlay` takes `lastSize` from `lastConfirmed.match.size` (empty after a resume) and shows a grey line under the number read: "L-S first · the last jersey" when the list has a row of that size, "Ladies sizes first · the last jersey was L-S" when only its family is on it (`lastSizeRank`, `lastSizeFamily`; the Fable check, 25 Nov 2026: the line was missing when the same size had all passed and only the family moved up). On a by-size order the size box of each tile is the biggest text on it (`sizeBig`); a by-team tile is as before.
- **Tests:** roster-sort.test.js: the same size, then the family, then rack order, whatever the sort; a size no row has leaves the order alone; `sameSize` and the family across spellings ("Youth M" is youth). candidate-row.test.jsx: size font larger on a by-size tile, equal on a by-team tile.
- **Checks:** clicked through on the test server (25 Nov 2026): a by-size order of #12 in eight sizes; after L-S passed, typing 12 listed L-M, L-L first, then rack order, the size box the biggest text on the tile; after L-M, the family line.
- **Branch:** `feature/result-screens`.

## 2026-11-25 · The damage photo without a countdown (the owner, after the run of 24 Nov 2026)
- **Asked for:** the 3-2-1 hurried the operator and the photos were poor. Wanted: the operator sets the jersey, presses Enter, the photo is taken at once.
- **What changed:** the countdown is gone (`count`, the ticking effect, `Countdown`, the countdown screen and `LivePreview`'s big mode). Photo of the damage, Take another and Retake now play the shutter and keep the live frame at once (`takePhoto`, called straight from the button; one at a time: a second press, or a Retake, while one is on its way does nothing); the highlight goes back to Continue afterwards. Enter already fires the highlighted option and Photo is first for a defect, so Enter takes the photo. The hint reads "set the jersey, then press Enter". The countdown's "count" tone is gone from audio.js. `ScanOverlay` is exported for its test.
- **Tests:** damage-photo.test.jsx: Enter on the first option of the FLAGGED screen calls `damagePhoto` at once, no countdown screen; a second press while the photo is on its way takes no second one; Retake drops one and takes one, and does not drop another while that one is on its way.
- **Checks:** lint clean; 553 tests pass (42 files). Not clicked through in a browser (no server started in this session).
- **Left open:** the corner live preview is small: the operator no longer sees a big view while the photo is taken.
- **Branch:** `feature/result-screens`.

## 2026-11-25 · The supervisor's photos zoom, and the order's summary is on the board (the owner, after the run of 24 Nov 2026)
- **Asked for:** (a) zoom on the damage photos, so a small flaw can be seen; (b) "the summary like the operator sees it" on the supervisor board.
- **What changed:** (a) `PhotoLightbox` fits the picture to the screen; the wheel or a pinch zooms about the pointer (1x to 6x), dragging pans, a double click toggles fit / 2x, + − Fit and ✕ buttons (and the + − keys), ‹ › and the arrow keys walk the flag's photos with a caption ("Damage photo 2 of 3 · #12 LEACH · Twill peeling"); Esc and the backdrop close it (a click on the picture does not); a fitted picture does not move when dragged. `PhotoThumbs` now hands the lightbox the whole set (`photoSet`, `photoCaption`, src/lib/photoset.js) and the index; the station's log opens it the same way. No library. (b) The order view has a first tab, Summary (the default): counts, pass rate, flag rate and pace, the order's boxes from `rec.binSummary`, then Passed with its box, Failed with its reason and Missing, from `orderSummary(packFromRecord(...))`. The body moved out of `OrderSummaryModal` into `OrderSummaryBody` and `SummaryCounts`, which the station's summary screen and the board both draw; the station's screen gained the boxes strip and the rates (`summariseLog` of its own log, the board's from the hub's events of the order, which are that log as the station sent it). `summarise` and `summariseLog` in export.js are exported for it.
- **Tests:** photo-lightbox.test.jsx (starts fitted with the caption, arrows and buttons walk round the end, + − zoom between 1x and 6x and Fit resets, Esc and ✕ close, the backdrop closes and the picture does not, a plain src opens, the caption); order-summary-view.test.jsx (Summary is the first tab and shows Passed, Failed with the reason, Missing, the boxes, the rates and the supervisor count).
- **Checks:** lint clean; 559 tests pass (44 files). Not clicked through in a browser: the wheel, drag and pinch are untested by machine (no server started in this session).
- **Left open:** stage 3 (one Packing screen) will replace `OrderSummaryModal` at the station; `OrderSummaryBody` is what it will draw. The pinch code is for touch screens and has not been tried on one.
- **Branch:** `feature/result-screens`.

## 2026-11-25 · Clean-up of the three entries above (no change on the floor)
- **What changed:** the damage photo is taken straight from the button (no counter and effect between the press and the shot; the highlight is null until moved, then the first option that can be picked, so the setter exists before the options). The lightbox zooms from the scale in its state, so wheel and pinch events that come faster than a render all count. The pick list's family is `sizeRank`'s group instead of a second size parser (`sizeFamily` removed). One `photoCaption` for the four captions; the station's rates through `summariseLog`, the same mapping the order sheet's Summary uses. The summary's comments sit above what they explain; `OrderSummaryBody` is indented. CHANGELOG.md is CRLF throughout.
- **Checks:** lint clean; 562 tests pass (44 files). Not clicked through in a browser.
- **Branch:** `feature/result-screens`.

## 2026-11-25 · One Packing screen that says what to do next (the owner approved the mockup, 25 Nov 2026)
- **Asked for:** seven end-of-order screens were too many, and to get a box's list the operator had to use Box full (which also closes the box and opens X.2) or find the Print menu. One place for the boxes and the summary, a button that prints a box's list without closing it, and each step pointing to the next.
- **What changed:** `PackingScreen` (App.jsx) replaces the Boxes dialog (`BinsModal`), the team-by-team `PackingModal` and `OrderSummaryModal`; the header's "📦 Packing" and "📋 Summary" are one "📦 Packing" button. A green Now strip (`nowStep` in the new `src/lib/packing.js`) gives one sentence and its button: keep scanning (Close), print the box lists and seal the boxes ("Print every list": one job, nothing closed), finish the order (→ the confirm), with "39 of 41 passed · 2 with the supervisor · 0 missing" under it. Enter does nothing on the screen. One row per box, open then closed: Print list (asks "What box is it in?" and teaches the model through `hub.boxAnswer`, as Box full does; closes nothing, prints no next label; "Print again" / "Print list (changed)") and Box full as before; the DAMAGED row prints its list; a folded Summary with Excel and Print summary. `listPrinted` (the ids in a box when its list printed) is kept in the session, not the hub; `listUnchanged` is the one test behind the "List printed" tag, the Now step and Finish order, which no longer prints a list (nor its NOT IN BOX list) for an open box that has not changed since. Box full clears the entry. The completion pop-up's main button is Packing (Export stays), the done screen's "Order summary" is "Packing", "See the summary first" opens this screen. The "Done / not done boxes" lists of the old Packing view are not printed from anywhere now (`boxesListLabels` stays in labels.js); "With the passed list" is only in the Print menu.
- **Tests:** packing.test.js (the three steps, a box with no jerseys never asks for a list, a changed list counts as unprinted, `listUnchanged`, `listPrinted` survives the smallest session body); app-smoke.test.jsx: Now says keep scanning and Enter does nothing, then Print list sends one `binlist` job, the box stays open with "List printed · 2 pcs" and "Now: finish the order", and Finish order prints only the summary's count label.
- **Checks:** lint clean; 572 tests pass (45 files). Not clicked through in a browser by this session.
- **Left open:** a jersey marked missing after a list printed did not change the list's ids, so Finish order skipped its NOT IN BOX list too (fixed in the clean-up below). The summary fold leaves the boxes out (the rows above are them).
- **Branch:** `feature/result-screens`.

## 2026-11-25 · Clean-up of the Packing screen (review, 25 Nov 2026)
- **Asked for:** the builder's own report: the skip rule missed a jersey marked missing after a list printed; check the rest.
- **What changed:** `listPrinted[bin]` keeps what the printed labels carried: the box's jerseys and the ids its NOT IN BOX list named (`listIds(rows, notIn)` in packing.js, replacing `boxIds`; `listIdsOf` in App). The row's tag and the Now step compare with what Print list would print now, Finish order with what it prints (the NOT IN BOX list always goes with an open box that has jerseys), so a jersey marked missing or flagged after the list printed makes it "Print list (changed)" and Finish prints both again. Print list and "Print every list" share `printOpenLists`, and "Print every list" takes the boxes from the row states, so the two cannot disagree. `PackingRow` is a plain function (its props are rebuilt on every roster change, so `memo` saved nothing). Opened from the done screen the Now strip says "The order is finished" with no button (it offered "Print every list" for lists Finish had just printed) and "Box labels" is not offered (the set-out screen opened under the done screen). `boxesListLabels` removed (nothing used it); the hub still draws a `unit: "box"` list from a station page not reloaded since. `nowStep` no longer returns an unused `unprinted`. The "Show the N left" button is 15 px; the explanation line is in short sentences.
- **Tests:** packing.test.js: a jersey marked missing after the list printed makes it changed, with the real `notInBox` / `isLastBox`.
- **Checks:** lint clean; 573 tests pass (45 files). The Fable check (25 Nov 2026) clicked it through on the test server: the Now strip, the rows, the disabled buttons on an empty box, Print list on a box with a jersey (refused on the development server, the row stays unprinted). It found one thing: the done screen's "Print the box lists again" went through the skip rule and left out the boxes printed from Packing; now `printFinishLists(note, again)` with `finishListsOf(true)` prints every list there.
- **Branch:** `feature/result-screens`.

## 2026-11-25 · 5·0 · "Jersey" becomes "garment" in everything a person reads
- **Asked for:** the owner, 25 Nov 2026: the orders are jerseys, hoodies, T-shirts, polos, quarter-zips, shorts and socks, so the app says "garment".
- **What changed:** every word a person reads (screens, buttons, hints and titles in `App.jsx`; the sticker, ticket, list and DAMAGED labels; the printed summary and lists; the Excel sheet names, headers and rows; the hub's log lines; the match and double-check reasons; `docs/OPERATOR-GUIDE.md`) says garment, garments, Garment. The type picker reads "Garment type". Done by one script that changed only text inside string literals and JSX text and printed every change to review. Not renamed: identifiers and files, `kind: "jersey"`, `jerseyType` and its ids, the localStorage keys, env names, stored data and API fields, the roster column detection, `vision.js` and the camera prompt, comments, the app's own name "Jersey QC" (tab title, sign-in header, kiosk launcher, server task), the "24 pcs" count label, the reasons. CLAUDE.md has a line saying so.
- **Tests:** the test strings the rename touches were updated (boxes, damaged, export, printjobs, reports, labels, vigilance); no new tests.
- **Checks:** lint clean; 573 tests pass. A grep of `jersey` in `App.jsx` shows only comments, `.jersey` fields, `jersey:` keys and `kind: "jersey"`.
- **Branch:** `feature/result-screens`.

## 2026-11-25 · 5a · The ship-with field: a keypad on the supervisor's form, a Next number key, numbers as chips
- **Asked for:** the owner, 25 Nov 2026: typing several ship-with numbers.
- **What changed:** both order forms (the station's and the supervisor's send-roster form, which had a plain box with no keypad) use one `ShipWithField`. Each finished number is a chip with an ✕ that takes it out; the number being typed is in the box; the keypad (`shipdigits`) has digits, ⌫ and a "Next number" key, and a comma still goes in by itself after every six digits. Numbers read from a roster file or a sent roster arrive as chips. The text the field holds, and so what `orderList` reads and what is sent, is the same as before. The helpers (`shipParts`, `shipNorm`, `shipPress`, `shipRemove`) are in roster.js; `sixes` is gone.
- **Tests:** `ship-with-field.test.js`, 7 tests: six digits make a chip, the number being typed is not one, Next number, three numbers are three chips and `orderList` reads them, backspace, ✕, a pasted text is cleaned.
- **Checks:** lint clean; all tests pass. Not clicked through in a browser by this session.
- **Branch:** `feature/result-screens`.

## 2026-11-25 · 5b · The box labels no longer print by themselves when an order starts
- **Asked for:** the owner, 25 Nov 2026: do not print the box labels beforehand from order entry.
- **What changed:** `applyRoster` set `boxAuto(true)`, so the "Set out N boxes" screen printed every label as it opened. It now follows a new setting, `boxAutoPrint` (off by default; a station saved before it existed reads it as off): Settings → Label printer → "Box labels print by themselves when an order starts". With it off the screen says "Print the box labels when the boxes are set out, and stick one inside each box before scanning." and prints only from its button. `boxLabelled` is as it was: Box full prints the next box's label only when it was never printed. CLAUDE.md and the guide say so.
- **Tests:** `box-auto-print.test.js`: the default is off and an older saved setting reads off; `applyRoster` opens the screen from the setting.
- **Checks:** lint clean; 582 tests pass. Not clicked through in a browser by this session.
- **Branch:** `feature/result-screens`.

## 2026-11-25 · 5e · "Unscanned" instead of "not scanned yet" and of the summary's "missing"
- **Asked for:** the owner, 25 Nov 2026: unscanned instead of missing.
- **What changed:** what is not in a box for want of a scan says "Unscanned": the Packing summary's column ("Unscanned · N" with "Marked missing" and "Unscanned" beside each other), its counts line and the Print-menu line, the count label's tally, the printed MISSING list (now UNSCANNED, its lines "marked missing" and "unscanned"), the box lists' NOT IN BOX line, the Finish order tiles and text, the Finish later tiles, the Still out list, the board's order view and cards, the sheets' "Unscanned" row and the roster sheet's UNSCANNED status. The operator's Mark menu "Missing", "Marked missing", the Missing pill and the Missing · Duplicate · Flagged list stay: that is a different fact (the operator says it is not here). The stored status `missing` is not renamed. The guide and CLAUDE.md follow.
- **Tests:** the strings in export, printjobs, reports and the board's order-view tests.
- **Checks:** lint clean; 582 tests pass.
- **Branch:** `feature/result-screens`.

## 2026-11-25 · 5f · Three columns on a box list when no row has a name
- **Asked for:** the owner, 25 Nov 2026: three columns on the box list when the order is numbers only.
- **What changed:** `binListLabels` gives a list in which no row has a name `cols: 3` and 21 items a label (`BIN_LIST_PER_LABEL_NUMBERS`); a list with any name stays at two columns and 14 (`BIN_LIST_PER_LABEL`, unchanged). `binListZPL` lays the rows out in `cols` columns of seven (the column width is the label's width divided by `cols`), each line squeezed to its column by the same `tight` rule. A 15-garment numbers-only box is one label of rows and the count label; a named one is two and the count label. The count label, the NOT IN BOX and the other lists are untouched. The Settings line says twenty-one.
- **Tests:** labels.test.js: 15 numbers-only rows are one label (a named list two), 22 are 21 and 1, one name makes the list two columns; the ZPL of a three-column page has three x positions and 21 lines.
- **Checks:** lint clean; 584 tests pass. Left open: the brief names `repageLists` in hub-plugin.js, which this branch does not have (it is not in `feature/result-screens`; nothing in the hub re-pages lists), so there was nothing to change there. If it arrives from another branch it must carry `cols` over.
- **Branch:** `feature/result-screens`.

## 2026-11-25 · 5h · One open row of the number goes green on a numbers-only roster, whatever name was read
- **Asked for:** the owner, 25 Nov 2026: by size, one size left, green on the number alone even if teams differ. The plan said to ask for the order and number where it stayed yellow; the cause found in the code is rule NN (a name read on a numbers-only roster went to the pick list), so that is what is changed.
- **What changed:** in `findMatchesInner`, when the roster has no names at all and the read is not doubtful (`isDoubtfulRead` false, which includes `number_complete`), a number with exactly one OPEN row is green (`exact`) whatever name or team the camera read; the name is noise on such a roster. Two open rows of the number, a doubtful read, a typed entry, and a roster with names are as before (rule NN stays there). The last-word check in `findMatches` still turns a doubtful green yellow. The invariant "a name was read but the row has none" no longer applies on a roster with no names at all.
- **Tests:** review-rules.test.js: a name read on a numbers-only roster is green on the one open row; a doubtful read (number covered, one digit not laid flat), two open rows, and a number not on the roster are not made green; one open and one passed row of the number is green; invariants.test.js relaxed for that case.
- **Checks:** lint clean; 585 tests pass; `SIM_ORDERS=300 npx vitest run operator-sim` passes (its invariants hold). Risk, as the owner accepted: a stray garment of another order with a number that has one open row goes green on a numbers-only order.
- **Branch:** `feature/result-screens`.

## 2026-11-25 · 5i · Sizes shown and printed in the short form
- **Asked for:** the owner, 25 Nov 2026: "L-S not Ladies-S".
- **What changed:** `shortSize(size)` in roster.js: "Ladies-S", "Ladies S", "ladies small" give L-S; "Youth M" gives Y-M; "Adult 2XL" gives A-2XL; a size already short, XL, OSFA, an empty one and one it cannot read are unchanged. It is applied where a size is drawn or printed: the roster table's size cell and size filter, the pick-list tiles, the green SIZE box, the Last passed strip, the confirm and flag texts, the Packing and board lists, the board's order view, the box label (`binEntries`, by size), the count label's mix (Ladies-S and L-S are one count), the list lines (`binListItem`), the sticker, the flag ticket and the summary lines. Matching (`sameSize`), the stored rows, the hub and the Excel sheets keep the file's own spelling. The pick list's grey line says "L- sizes first · the last garment was L-S" (`lastSizeLetter`). Not changed: a size the operator typed in the by-hand form is shown as typed on its confirm line.
- **Tests:** `short-size.test.js`, 8 tests: the conversions, the cases left alone, `sameSize` unchanged, `lastSizeLetter`, the box label, sticker, ticket, list line, count label mix and summary lines.
- **Checks:** lint clean; 593 tests pass. The Fable check (25 Nov 2026) clicked stage 5 through on the test server: the ship-with chips and keypad, "Garment type", the set-out screen printing nothing by itself, the Packing summary's "Unscanned 10 · Missing 0" and the short sizes in every row; it made `shortSize` write a lower-case short form upper ("l-s" → L-S, "w-m" → L-M).
- **Branch:** `feature/result-screens`.

## 2026-11-25 · Clean-up of stage 5 (5·0, 5a, 5b, 5e, 5f, 5h, 5i)
- **Why:** a second read of the seven commits above.
- **5e, Unscanned and Missing kept apart:** the owner's rule is that "Unscanned" means not scanned yet and the operator's mark stays "Missing", but `counts.missing` (the two added together) was shown as "N unscanned". Now the summary column reads "Unscanned N · Missing M" with its two halves, unscanned first; the counts line, the Packing screen's Now line and the Print menu's line say "7 unscanned · 2 marked missing" (the second part only when something is marked); the count label's tally is "5 passed   1 failed   7 unscanned   2 missing" (a label from a page loaded before keeps its old "N missing"); the printed list is two lists, UNSCANNED and MISSING, the title saying which, so the lines carry no suffix. The Print menu's button says "Summary (failed, unscanned, missing)" and got its space back.
- **5·0:** the station header and the sign-in screen said "🏭 Garment QC": the app's name is Jersey QC again there. A comment's "no jersey" follows its string.
- **5a:** `ShipWithField` uses `shipJoin` (now exported) instead of a copy of it; Enter or Esc in its box leaves the box and puts the keypad away, as in the search box.
- **5b:** the set-out screen's comment and `boxAuto` say the labels print from the button unless `boxAutoPrint` is on; the Settings line is worded like its neighbours; a comment's alignment in config.js.
- **5f:** `binListLabels` takes the per-label count from `BIN_LIST_PER_LABEL` / `BIN_LIST_PER_LABEL_NUMBERS` and the columns from it, so the constants are what decides. CLAUDE.md: "15 named jerseys are 3 labels, 15 numbers-only 2", and a label without `cols` prints two columns.
- **5h:** the comment names the owner's accepted risk (a stray garment of another order with that number); the comments of rule NN say where 5h applies. Invariant 8 is as narrow as the rule: a name read on a nameless row only on a roster with no names AND one open row of the number.
- **5i:** `lastSizeFamily` was used only by a test: removed, the test reads `lastSizeLetter`; CLAUDE.md's pick-list line says "L- sizes first".
- **Tests:** printjobs (the UNSCANNED and MISSING lists, the tally, an old label's word), the board's order-view summary, roster-sort, short-size.
- **Checks:** lint clean; 593 tests pass. Not clicked through in a browser.
- **Branch:** `feature/result-screens`.

## 2026-11-25 · The size biggest on a by-size box label (5c)
- **Asked for:** the owner, 25 Nov 2026: on a box sorted by size the size is what the packer looks for, so it should be the biggest text on the label.
- **What changed:** `binLabelZPL` draws a by-size label with the size in the big line (fitted to the width, so A-2XL fits) and "BOX 6.1" in the middle line under it; a by-team label and the DAMAGED label are as before. The footer is unchanged.
- **Tests:** labels.test.js: by size the size field is drawn first and larger than the box field; by team and DAMAGED keep their order.
- **Checks:** lint clean; 594 tests pass. Not printed on the Zebra.
- **Branch:** `feature/result-screens`.

## 2026-11-25 · Loose thread: fix it right there (5d)
- **Asked for:** the owner, 25 Nov 2026: a loose thread is cut at the station, as dirt is wiped off, and the garment is not flagged unless the thread needs the stitcher.
- **What changed:** an `inPlace` reason now carries its own screen (`inPlace: { emoji, title, text, done, fail, note, stays }` in config.js); "Dirt or mark" has today's words, and the new "Loose thread" (after Stitching or seam on both menus) opens CUT IT NOW with "It is cut now" and "It needs the stitcher", which flags `THREAD_STAYS` ("Loose thread — to the stitcher", stitcher, Sewing). Both check "Thread damage" on the next garments (`REASON_CHECK`). The overlay keeps the chosen reason as `fixing` (`reason` is already the flag text on other screens). The route "Fix in place" is weighed like "Clean in place".
- **Tests:** config.test.js (menu, words, THREAD_STAYS route, category, check); clean-in-place.test.jsx (both screens, the fail button runs its action).
- **Left open:** the whole path through App (choose Loose thread, press the fail button, see the flag) is not driven by a test; only the screen and the config are.
- **Checks:** lint clean; 597 tests pass.
- **Branch:** `feature/result-screens`.

## 2026-11-25 · 6 and 9: both on the list (5g)
- **Asked for:** the owner, 25 Nov 2026: a 6 and a 9 look the same from the other side, so the app should never go green on one of them while the other is still open.
- **What changed:** `findMatchesInner` (match.js): on a camera read with no name anchoring a row and a number that has a 180 degree twin (6/9, 18/81, 66/99, 68/89 ...), when both numbers have open rows the list shows the number read first, then the twin, `soft` (no doubt flag), with `twins: true` (the one-row shortcut cannot turn it green) and `twinOf`. The yellow screen says "6 or 9? both are listed · #6 first" under the number (`screenFor` passes `twinOf` to the overlay). A twin with no open row, a typed read and a read with a name on the roster are as before. The turned-jersey path is kept inside the same block: it needs only the twin open (the number read may have no open row) and keeps its own wording.
- **Tests:** readguard.test.js (6 lists 6 then 9, 9 then 6, 18/81, no open 9 is green as before, typed unchanged, a name anchors, a turned read still lists both). Two existing tests changed because the rule changes their answer: an upright 6 with a 9 open was green in readguard.test.js and in vigilance.test.js (the re-read of a turned jersey), now a list; and the invariants' `related` counts a 180 degree twin as related to the read (invariant 6 would otherwise call the twin an unrelated row). No invariant was weakened beyond that definition.
- **Checks:** lint clean; 598 tests pass; `SIM_ORDERS=300 operator-sim` passes. Not clicked through in a browser.
- **Branch:** `feature/result-screens`.

## 2026-11-25 · Clean-up of 5c, 5d, 5g
- **Why:** a second read of the three commits above.
- **5g:** the "6 or 9? both are listed · #6 first" line said so on a turned read whose own number had passed (only the twin was listed): `twinOf` is now set only when both numbers are on the list. The list was re-sorted by size on the screen, so "#6 first" was not true either: `sortCandidates` takes `after` (a row test), and the overlay puts the twin's rows after the number read's, each part in the station's order with the last size first inside it; the grey "L-S first" line now speaks of the first row. One comment above the rule in match.js instead of two that half-contradicted each other; `settleTurned`'s comment says why a turned 9 re-read upright as 6 is a list (once, from the upright read) and not a green. The old upright green was not an owner decision (RECOGNITION-FINDINGS item 9 is about not asking when the two reads differ only by the turn), so the owner's 25 Nov rule stands. Invariant 6's `related` counted every numberless row as the twin of a 2, 3, 4, 5 or 7 read (`rotated180` gives "" there): it needs a row number now.
- **5d:** the clean screen no longer splits its text on "not flagged": `inPlace.text` is the first sentence and the screen adds "The garment is **not flagged**." (Dirt or mark reads as it did). The fallbacks to the Dirt-or-mark words are gone (the clean screen is only opened with `fixing` set), and so is App's `MARK_STAYS` import. The comment above `REASONS` says what `inPlace` holds, and `MARK_STAYS` / `THREAD_STAYS` sit above it. Operator guide: Loose thread after Stitching or seam, as on the menu. "Fix in place" and "Clean in place" both take the default DECIDE tag, which no flag ever carries (the jersey is not flagged); THREAD_STAYS is STITCHER.
- **5c:** `binLabelZPL` picks the two lines once (`head`, `sub`) instead of two copies of the drawing; the test checks the by-team, DAMAGED and by-size labels byte for byte (the first two against what 438f67a printed).
- **Checks:** lint clean; 599 tests pass; `SIM_ORDERS=300 operator-sim` passes (wrong green 0). The Fable check (25 Nov 2026) clicked the Loose thread path through on the test server: the reason on the menu after Stitching or seam, the CUT IT NOW screen with its three buttons, "It needs the stitcher" flagging "Loose thread — to the stitcher" with the DAMAGED box line and the ticket. The 6/9 list needs a camera read, so it is covered by its tests only; the by-size label has not been printed on the Zebra.
- **Branch:** `feature/result-screens`.

## 2026-11-25 · 5j · Fixed at the station is still a flag
- **Asked for:** the owner, 25 Nov 2026: "it should be flagged even if it is resolved". Dirt wiped off or a thread cut at the station used to leave no trace in the log.
- **What changed:** `cleaned()` (App.jsx) writes a flag log entry for the garment in every case, also when it had already passed: status flagged, the reason ("Dirt or mark" / "Loose thread"), `resolution: "Fixed at the station"` (`FIXED_AT_STATION`, config.js). The garment stays as it was: the roster row is not set to flag, no ticket prints (`ticketPrinted` is set to the entry), it stays in its box, `lastConfirmed` and `lastResult` are untouched. Then, as before, the green returns with the note, or the overlay closes for a garment that had passed. The hub, the board's Problems list (resolved, so not in Needs you or the carried flags), the Defects sheet, the flag rate and the damage report already take a resolved flag as it comes; `damagedItems` and the order summary leave it out because its row is not flagged.
- **Tests:** app-smoke (both cases: before the pass, and on a passed garment: the entry with its resolution on the hub report, no ticket, the row still passed); printjobs (`damagedItems` and `orderSummary().failed` leave it out); reports (the Defects sheet and the flag rate count it).
- **Checks:** lint clean; 603 tests pass. Not clicked through in a browser.
- **Branch:** `feature/result-screens`.

## 2026-11-25 · 5j clean-up
- **Ticket skip:** the ticket effect now skips a flag born with a resolution (one check where the ticket is decided) instead of `cleaned()` setting `ticketPrinted` to the new entry. Same result today, but it does not depend on the order of the ref write and the log update, and `ticketPrinted` keeps meaning "the last flag sent to the printer". The app-smoke tests fail without the check.
- **Print menu:** its flag tickets (one, or All N) leave out a flag fixed at the station: that garment never had a ticket and is in its box, and "All tickets" would have printed one for it.
- **History:** the dialog already shows one line per garment (its newest entry; a garment fixed after it passed shows its fixed flag there with 🚩 Flag it, as its row is still passed). The History button's count now counts garments too, not log entries, so a cleaned garment does not add one.
- **Order sheet:** the Status column comes from the roster row (`rosterStatusLabel`), so a garment fixed after it passed reads PASS beside "Dirt or mark" / "Fixed at the station" in the Reason / Resolution columns; kept, with a comment in export.js.
- **Board:** the order view shows the fixed flag on the garment's row (Roster tab, PASS, "→ Fixed at the station") and in its Log; its Problems tab lists flagged and by-hand rows, so it is not there (the 5j entry above said it was). The station card's list shows it after the open items; the header count and the carried flags leave it out. New test in order-summary-view.test.jsx.
- **Checks:** lint clean; 604 tests pass. The Fable check (25 Nov 2026) clicked it through on the test server: Dirt or mark on a passed #12, "It is clean now": the log shows the flag with "Resolution: Fixed at the station", #12 stays passed in Box 1.1, the hub's attention list carries it after the open item. It changed the screen's last sentence to "It stays passed; the record keeps the flag." (it said "not flagged", no longer true) and made the station card's "Needs you (N)" count the open items.
- **Branch:** `feature/result-screens`.

## 2026-11-25 · Merge of `feature/result-screens` into `development` (after `feature/damage-location`)
- **What it is:** the co-worker's damage location work (garment outlines, "where is the damage", tall label rolls, rolls chosen in Settings, the Garment picker) and the result-screens branch (the Packing screen, the yellow list's last-size order, the photo without countdown, the lightbox and the board's Summary tab, "garment" wording, ship-with chips, `boxAutoPrint`, three-column numbers-only box lists, the by-size box label, Loose thread fixed in place, the 6/9 twin list, flags fixed at the station) are now one branch. Nothing of either side was dropped, except what the result-screens branch had itself removed (the Done / Not done boxes lists, with the old Packing view).
- **How the two were combined:**
  - **Reasons** (config.js): every defect keeps `where: true`; Loose thread (after Stitching or seam) and Dirt or mark keep their `inPlace` screen and are NOT asked where (fixed at the station); `MARK_STAYS` and `THREAD_STAYS` are defined once, before `REASONS`, and both carry `where: true`, so "It will not come out" / "It needs the stitcher" flags it and then asks where. Settings keep the three rolls (`stickerRoll`, `flagRoll`, `boxRoll`) and `boxAutoPrint`.
  - **The station** (App.jsx): `chooseReason` sends an `inPlace` reason to the clean screen first; `cleanFailed` → `chooseReason(stays)` → the where-step → FLAGGED. "It is clean / cut now" writes the resolved flag (`FIXED_AT_STATION`), which prints no ticket: the ticket effect skips an entry with a `resolution` as well as one still `locating`. The session, Finish later and resume carry both `garment` and `listPrinted`. Settings → Label printer: the three switches with their roll, then "Print the box labels by themselves" (on the box roll). The board's photos carry the lightbox caption and the garment marks side by side. The co-worker's new strings say "garment".
  - **Labels** (labels.js): `listRows` takes the list's columns (`cols: 3` → three columns of seven an inch), `rowsPerLabel(size, damaged, cols)` counts 21 an inch for a numbers-only list, and `repageLists` / `listChunks` treat `cols` as part of what makes pages one list; the count label's first inch on a tall roll leaves 63 numbers-only rows under it on 2 x 4. The by-size box label (the size big, "BOX 6.1" under it) applies on the 2 x 1 in label and on the turned tall-roll label. The 2 x 1 in by-team label and the flag tickets are byte for byte as on `development`.
  - **Damage report:** HEAD's columns with "Jersey type" → "Garment type", Where and Garment kept.
- **Tests changed:** `fixtures/labels-2x1.json`: the by-size label of the two "box label" cases is the new layout (size first); the by-team labels and every other case are unchanged (checked line by line). `labels-tall.test.js`: the re-paging test used `boxesListLabels` (DONE BOXES), which went with the Packing screen; it now uses the summary's `listLabels` (FAILED). Added: the turned by-size label, a numbers-only list on 2 x 4 (84 a label, `cols` carried, three columns), and in `config.test.js` that the in-place reasons are not asked where and their stays flags are.
- **Checks:** lint clean; 943 tests pass (53 files); the operator simulation (300 orders): WRONG GREEN 0, WRONG DUPLICATE 0, findings 0. Not clicked through or printed after the merge.
- **For the owner:** "Garment" (the outline kind: hockey jersey, hoodie, socks …) and "Garment type" (the construction: ECHL, ECHL replica, Sublimated) now sit next to each other on the order screen, the send form and the damage report. Both labels are kept as they are; a clearer pair of names is the owner's call.

## 2026-11-25 · The co-op's notes after test 2: the 6/9 list's order, one garment green, the damage photo framed live
- **6 and 9:** a list with both numbers keeps the number read first; inside each number the last confirmed size comes first, then every other size in rack order, whatever the station's sort and without the family step (read #6 after a Y-L: #6 Y-L, the other #6 sizes, then every #9 the same way). `sortCandidates` with `after`; a list with no twin keeps the family step.
- **One garment:** on a roster with no names, the open rows of the number read that are all one size (and one colour, with a colour column) are the same garment for different teams' players, so a clean camera read is green on the first open one, in its box (`oneGarment` in match.js, `sameGarment`). "When we scan #10 and it lists 6 different #10, all different teams but the same size, it doesn't matter which one we select." Two sizes, a doubtful read, a typed entry or a roster with names stay a list.
- **Damage photo:** with the camera on, the FLAGGED screen shows the live camera big where the photo goes (`LiveFrame`, whole frame, never cropped); "📷 Take photo" takes it and shows it in the same place, Take another and Retake go back to the live view. A defect opens on the live view; Name or number, Not on the roster and No size tag open on Continue with "Photo of the damage". The ScanOverlay now gets the camera stream (it was passed null). The photo buttons still need the camera on: a station working by hand or from uploads has none.
- **Tests changed:** `review-rules` (5h: two open #23 now of two sizes; a new block for one garment), `readguard` (three lists of nameless same-number rows on different teams now differ in size, as one size is now green), `roster-sort` (the 6/9 order), `operator-sim` (a green on a row of the same number and size, `sameGarment`, counts as right; the garment's own row stays open).
- **Checks:** lint clean; 947 tests pass; the operator simulation, 3000 orders: WRONG GREEN 0, WRONG DUPLICATE 0. On the test server (5174, a drawn stand-in camera as the browser pane blocks the camera): a read of #10 with six Y-L #10 on six teams went green on Hawks, Box 3.1; Flag, Holes, a spot, Done opened the live view; Take photo showed the photo in its place; Retake went back to the live view. Nothing printed (flag tickets off in that station's Settings).

## 2026-11-25 · The By hand key (W) opens the form from the camera screen
- **Finding (the co-op):** W was set as the By hand key in Settings but did nothing: only the result screens read it, and since 20 Nov none of them offers By hand.
- **What changed:** the station's global key handler (the one the scan key uses, after the same dialog check) opens the By hand form on the By hand key when no result screen or dialog is up, no read is running and "where is the damage" is not open; the ⌨ By hand button shows the key.
- **Tests:** `no-scan-behind-dialog` follows the handler's new heading and checks the key opens the form after the dialog check. Lint clean; 948 tests pass. On the test server (5174): W on the camera screen opened "Enter the garment by hand" with an empty number box.
## 2026-11-25 · Packing labels 1 · The packing list as a table
- **Asked for:** the owner, 25 Nov 2026, after six labels printed on the 2 x 3 in roll: the list inside the box is a table, a column a size, with the header on top, four copies, and "build this into the app".
- **What changed:** on a tall box roll (2 x 3 in, 2 x 4 in; Settings → Label printer → box roll) a box's list is ONE label object, `kind: "packlist"`, that the hub lays out (`src/lib/packlabels.js`, `packListZPL`): the header on every page ("TEAM - BOX 1 - 15 pcs - 1/2", "Order N" big, a rule); the sizes in rack order as sections (size header, rule, a row a garment: the number, the name smaller and cut with "…" so it never reaches the next column) flowed into three columns, a section going into the column with the least in it where it fits (so a fourth size with one row sits under another), a section longer than a column split over columns with its header repeated, a section that fits nowhere starting the next page; a rule between the columns; 11 rows a column on 2 x 3 in, 16 on 2 x 4 in. A box with several teams (the layout takes it, the app cannot do it yet) gets a black band a team ("U11 TIGERS - 9 pcs", white) and a team that does not fit whole under the one before starts a page of its own. Every page prints `LIST_COPIES` = 4 times (`^PQ4`), pages last first. The count label stays the customer's label and still follows the list. The 2 x 1 in roll and the sticker roll keep today's pages of rows (`boxListLabels` in printjobs.js picks by the roll; a packing list that reaches the hub for a roll that is not tall is turned into rows there). The hub's request is unchanged (kind `binlist`): `repageLists` and `listChunks` pass a packing list through untouched, and a label kind the hub does not know is laid out as before. The station sends the table from Box full, Print list, Print list again, Finish order, and the Print menu. The NOT IN BOX list and the DAMAGED list are as they were.
- **Tests:** `packlabels.test.js` (12): the walk-through order of 25 Nov (U11 Tigers with #19 flagged out, U12 Bombers with #44 out and A-XL under A-S on ONE page) against ZPL fixtures, the overflow case (40 A-S: two pages, 2/2 first), 20 rows split over two columns, the rows a column holds on 2 x 3 and 2 x 4, two teams with bands, `^PQ4` and a label's own copies, `repageLists` / `listChunks` leaving it alone, the fallback on 2 x 1 and an unknown kind; `printjobs.test.js`: a box's list on a tall roll.
- **Checks:** lint clean; all tests pass. NOT printed (the Zebra on this PC prints for the floor).
- **Note:** an overflow of 20 rows of one size is one page of two columns by the owner's own rule (columns are filled, a section is split over columns); the case "two pages" needs more than a page of rows (40 in the test).
- **Branch:** `feature/packing-labels`.

## 2026-11-25 · Packing labels 2 · The outside label of a box
- **Asked for:** the owner, 25 Nov 2026, with a photo of the handwritten outside label: the name list goes INSIDE the box; the OUTSIDE label is the shipping face.
- **What changed:** a new label, `kind: "boxface"`, one per box, printed WITH the box's list on a tall roll (after the count label, so it comes off the printer last, on top of the strip) at Box full, Print list, Print list again and Finish order, and by itself from the Print menu ("Outside label" on a box's row). It says ORDER (big), CUSTOMER, "TEAMS IN THIS BOX   in box / of order" one line a team, SIZES one line a size the same way, "Not in this box: #19 A-M flagged, #44 A-L missing" (only on the last box of its team, as the NOT IN BOX list), "Box 1 of 2" (big) and a blank WEIGHT box for the hand; no garment names (`boxFaceLabel` / `boxFaceJobs` in printjobs.js, `boxFaceZPL` in packlabels.js, the geometry of the approved paper label). "Of order" is counted within the box's own team, as on the paper trial (a Tigers box reads "A-M 3 / 4", the Tigers' A-M). "Box 1 of N": this box's place among the order's boxes that have garments; before Finish N is the box plan's count (at least the boxes with garments), at Finish and on a finished order the boxes that have garments. NEW FIELD `customer` on the roster record: `POST /api/hub/rosters { customer }` (kept, trimmed, 80 characters, returned in the list and the roster), a "Customer" box on the supervisor's send-roster form and on the station's order setup form (with the on-screen keys), kept in the session, on the parked order, on the station's report and on the hub's order record (`customer`, so a past order prints it too); empty prints the box's team name; the Paragon site will fill it later. On a 2 x 1 in roll no outside label goes with the list; the Print menu's button still prints one, as one compact label.
- **Tests:** `packlabels.test.js`: both boxes of the walk-through (the label object and its ZPL against fixtures), no customer, the plan's count before Finish, the list ending with the outside label, the hub counting it and laying a short roll out; `hub-routes.test.js`: the customer on a roster and on the order's record; `printjobs.test.js`: the tall list now ends with the outside label.
- **Checks:** lint clean; all tests pass. NOT printed.
- **Branch:** `feature/packing-labels`.

## 2026-11-25 · Packing labels 3 · The sign-off ticket at Finish order
- **Asked for:** the owner, 25 Nov 2026: a ticket for the order paper with "Operator sign ___ / Supervisor sign ___" and the order summary by size.
- **What changed:** a new label, `kind: "signoff"` (`signoffLabel` / `signoffJobs` in printjobs.js, `signoffZPL` in packlabels.js; the geometry of the approved paper ticket): ORDER big, the customer and teams, date - time - station - operator, the passed garments of each size in rack order (the lines shrink to fit above the signatures when there are many sizes), PASSED, "Flagged 1 - Missing 1 - of 20 - Boxes 2", two signature lines (Operator, Supervisor). No garment names. It prints LAST in the Finish order strip (`finishListsOf`), so it comes off the printer first; it prints again with the done screen's "Print the box lists again" (stamped with the time of that print), and from the Print menu ("Sign-off ticket"), also for a past order found through "Another order": `packFromRecord` now carries `past.finishedAt` and the hub's order search returns `finishedAt` (and `customer`), so the ticket shows when that order was finished, at which station, by whom. On a 2 x 1 in roll it is three labels (header and sizes, totals, signatures). It travels in a `binlist` request like the other box paper, so the hub's contract is unchanged.
- **Tests:** `packlabels.test.js`: the walk-through order (label object and ZPL fixture: A-S 6, A-M 6, A-L 5, A-XL 1, PASSED 18, flagged 1, missing 1, of 20, boxes 2), a past order from the hub record, the three labels on 2 x 1, one label counted on 2 x 3, twelve sizes above the signature lines; `app-smoke.test.jsx`: Finish order prints the summary and then exactly one sign-off ticket, last.
- **Checks:** lint clean; all tests pass. NOT printed; the three ZPL files of the walk-through were written for the reviewer to print.
- **Branch:** `feature/packing-labels`.

## 2026-11-25 · Packing labels 4 · Clean-up of the three label kinds
- **Asked for:** the co-op, 25 Nov 2026: a clean-up pass on packing labels 1-3 before review, without changing what the owner settled on paper.
- **What changed:** (1) A three-digit number has narrower letters (34 high, 20 wide instead of 28; four digits 15), so "#100" takes about the room of "#12" and the name behind it reads "VANDE…" instead of "VAN…". The name is cut to the room the number leaves in its 108-dot column, and every width on the three labels is measured one way (`dotsOf`: `textUnits` × letter width × 0.85), the number's included (it was a flat 16 dots a digit). (2) The header, a team band and a section header stay one line for a long team name: squeezed down to letters 14 wide, then the NAME is cut with "…" (never the box, the pieces or the page). (3) The outside label numbers the closed boxes first, in the order they were closed, then the open ones: by box order alone, a sealed 2.1 printed as "Box 2" became "Box 3" on a reprint once 1.2 had garments. Box full now builds the outside label from the order as it is after the close. Customer empty: the box's teams (on a by-size box it printed the size). "Not in this box" is cut at its three lines ("+N more"; a fourth line of ^FB prints over the third). (4) The sign-off ticket: past 11 sizes the size lines go to two columns (15 sizes ran into the signature lines); the customer-and-teams line ends "+N more" instead of squeezing to unreadable; on the 2 x 1 in roll the three labels print signatures first, so the strip reads header, totals, signatures like every other list. (5) `listChunks` keeps a packing list with its box's count label and outside label in one request. (6) The status lines of Box full, Print list, Print list again, Finish order and the Print menu say "the packing list 4 copies"; Print list counted the label objects it sent, now the labels that came out. (7) `isTallRoll` was a copy of labels.js's `isTallTicket`: removed. A tiny roll can no longer make the layout loop for ever.
- **Tests:** `packlabels.test.js`: the walk-through fixtures rewritten (names start 1-2 dots further left, VANDE…, ZIMME…, the header and the sign-off lines a little wider); new: the name ends inside its column, a three- and four-digit number, a long team header, a team longer than a page placed whole over pages, the same layout for the rows in any order, a cut that keeps a box's paper together, a sealed box's number after another box opens, "Not in this box" at three lines and "Box 1 of 2" clear of WEIGHT, 12 / 15 / 22 sizes and nine teams on the sign-off (the old twelve-sizes test matched nothing and passed whatever the layout did), the 2 x 1 order.
- **Checks:** lint clean; all tests pass. NOT printed. The fixtures are written with LF; git keeps them as text and the test drops CR, so a CRLF checkout compares the same.
- **Branch:** `feature/packing-labels`.

## 2026-11-25 · Merge of feature/packing-labels into development
- **What:** the three packing label kinds (packing labels 1-4) merged onto the co-op's notes after test 2 and the By hand key. Only this file conflicted (two entries added at the end on each side; both kept). The code merged by itself; 976 tests pass on the result. The owner saw one copy of each label from the branch on the 2 x 3 in roll on AK-NB-165 and said merge (25 Nov 2026).


## 2026-11-25 · One garment: the number typed by hand goes green too
- **Finding (the co-op, order 2555 on the test server):** #3 typed by hand with two U16 MENS and two U18 MENS A-M #3 open still showed the list; typed entries had been left out of the one-garment rule.
- **What changed:** `oneGarment` takes a typed number as it takes a clean camera read; the row colour is read with `rowColourText` (the colour column, whatever its header). A doubtful camera read still stays a list (N1): the #1 scan on the same order was read as off-centre or not laid flat ("a digit may be hidden").
- **Checks:** lint clean; 949 tests pass; operator simulation (1500 orders) WRONG GREEN 0. On the test server: #10 typed with five open Y-L #10 on five teams went green on Eagles, Box 2.1.

## 2026-11-26 · Still out from the first flag, and still-out rows last on the list
- **Asked for (the co-op):** the garments still out (damaged) showed only after Finish later, and so did the 🔧 Still out button: both from the first flag. On the yellow list, the still-out rows at the very end.
- **What changed:** the 🔧 Still out button shows on any order with something still out. A flagged row is open to the matcher from its first flag (`scanRoster`). On an order not parked it is `cameBack.live`: offered on the list only, its tile a tap (`mouseOnly`, never the first highlight), and a read that would make it green becomes that list (`holdBack`, camera and typed), because the pedal must never pass a flagged garment (code review H3, Noam: the garment just flagged is usually still under the camera). On a picked-up order it goes green as before. `sortCandidates` puts every row still out (back from repair, found) after all the others; `oneGarment` prefers a row not yet scanned.
- **Tests:** `roster-sort` (still-out rows last, the last size first among them), `no-scan-behind-dialog` (tapOnly, holdBack on camera reads and typed entries, the tile mouse-only, never the first highlight). Lint clean; 979 tests pass; operator simulation (1000 orders) WRONG GREEN 0. On the test server (order 999003, printing off): #12 typed and flagged Size label, "🔧 Still out · 1" at once; #12 typed again listed it with the blue back-from-repair bar and the highlight on Back; a tap opened the green "Back from repair (Size label) — check it is fixed".
