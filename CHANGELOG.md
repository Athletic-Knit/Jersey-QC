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
- **Commit:** see the commit that adds this entry ("Matching rules")
