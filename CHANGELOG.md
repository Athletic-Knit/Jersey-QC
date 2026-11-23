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
