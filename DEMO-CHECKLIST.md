# Demo checklist

Work for the demo to the big boss, from the notebook page dated 2026-10-27.
Tick a box when the item is on the `read-guard` branch and checked at a station.

## Already found, not yet done

- [x] **Single-digit fix.** An exact name + number match now goes green even when the camera doubts the lone digit (Seach #9, Evanovich #4). Committed (b2af187).
- [x] **Sign in works first time.** Opening the app without `?station=` on the address made the first Sign in click reload the page and wipe the name and PIN. The sign-in is now saved for the target station before the reload. Committed (b2af187).
- [x] **Recognition stress test and fixes.** 103 synthetic jerseys + 270 distorted frames + the 13 real ones through the live model (`tools/recog-stress.mjs`). Fixed: turned jerseys are turned upright and read again; lone digits are flagged only on evidence; a close-up number is never "no jersey"; 6/9-type numbers on a turned jersey ask. Findings in `tools/RECOGNITION-FINDINGS.md`. Committed (b2af187).
- [x] **Self-check after a mistake ("military grade").** After the operator corrects the app, the next 5 jerseys are read twice and must agree before a green; another mistake restarts the 5. Header pill shows "Double-checking · N to go". Verified in the browser; in the operator simulation too. Committed (b2af187).

- [x] **Operator inspection regime (the operator's "military testing").** The order opens with a full inspection of the first 5 jerseys; after that a quick look, with a full spot check after every 10 clean; any defect the operator flags starts the 5 again. Header pill "Inspect fully · N to go" / "Inspect fully · spot check" / "Quick look · N/10"; the green screen carries the same banner and shows the check pills only during a full inspection. Saved with the session; the app's own double-check runs independently.

- [x] **Reasons and supervisor screens, plain.** Reason rows are the label alone (no route under them, no jersey-type line, no thumbnail over the rows; the list scrolls inside the panel). The supervisor screen is GO TO SUPERVISOR and the jersey; the reason and route still go to the log and the board.
- [x] **Pass / Flag / By hand pills show their jerseys.** Clicking a header pill filters the roster table to those rows ("2 flagged · Show all"); clicking it again, or Show all, clears. Jerseys typed that are not on the roster have no row; they are in the Log.

- [x] **Operator sets the order number.** The order-number field is open to everyone at setup and in the header. A roster file that carries the number (an Order / Order Number / PO / Job column, or a title row such as "Order 55555" above the header) fills it in by itself; the operator can type over it. A supervisor-sent roster still brings its number.
- [x] **Packer blocked at sign-in.** The Packer role shows dimmed with "under development" and a not-allowed cursor; clicking it does nothing.

- [x] **No export or roster editing for operators.** Add, Replace, Export, Damage report and Export log show only to a supervisor or admin; the operator's completion screen ends with Done instead of Export to Excel. The supervisor's board keeps every export.

- [x] **Hands-free waits after a confirm.** The gate holds for 3 s (Settings → "Wait after a confirm", 0–30 s) before it may scan again, so the operator can put the old jersey away and reach for the next; a jersey placed inside the wait scans the moment it ends.

- [x] **Shorter yellow lists for nameless jerseys.** A jersey with no name printed no longer lists rows that have names (#40, #41, not #45 VARGHESE). Named rows still keep it a question. Gate 13/13, simulation 0 wrong greens; finding 17 in tools/RECOGNITION-FINDINGS.md.

- [x] **Flags are resolved by the supervisor only.** Accept / Reject / Note on a flagged jersey show only to a supervisor or admin; the operator sees the flag card without them. The server's day ledger keeps every event a station ever sent.

- [x] **A flagged jersey stays flagged.** Scanning it again shows FLAGGED ("with the supervisor"), never a green; on a list it is greyed as Flagged; only a supervisor can un-check a flagged row. The supervisor's Reject reopens the row for the rescan after rework; Accept passes it.

- [x] **Three recognition rules.** A name that pins the row makes the turn irrelevant (no re-read, green); the side of the cover trims hidden-digit lists (#40, #41, not #14, #54); two sizes are two numbers, and a small sleeve number inside a two-digit read puts it in doubt. Gate 13/13, simulation 0 wrong greens; the live subset rerun showed 5 wrong greens from older limits, written up as findings 18–19.

- [x] **Green screen fits a 1600×900 half panel; no duplicate line on the yellow screen.** Smaller headline and tiles, no check-mark icon, the result screen never clips its top (safe centering); measured 533/533 at 1600×900 and 717/717 at 1920×1080. The "No exact match — nearest rows" line under the same headline is gone.
- [x] **Mark column for everyone again.** Missing / Short-shipped / Un-check are back on every roster row (the operator asked for them); only un-checking a FLAGGED row stays the supervisor's.

- [x] **B on an empty table is not a failure.** When the camera says there is no jersey, a B press shows "No jersey in view" for two seconds and nothing else: no red screen, no Enter by hand, nothing in the log; the table is learned and hands-free re-arms, the same as it already did for an automatic look.

- [x] **Two navigation keys.** Settings has Down (default A) and Up (default ↑), each with Change; ↓ and ↑ always work too. The camera legend shows both.

- [x] **Sign-in: name dropdown and keypad on demand.** The name is picked from a list (Person 1, Person 2, Person 3 by default, set with VITE_OPERATORS) or "Other" (someone sent to the station for the day; no typing); the numeric pad appears only while the PIN field is active.

## Changes to the UI (from the notes)

1. [ ] **Sorting system.** Decide what the roster, log and remaining lists sort by (number, name, status, time) and give the operator a way to change it.
2. [x] **Fewer words.** Operator result screens done: hand-entry and free-text screens are headline only, every button is one or two words (Confirm, Retry scan, Flag, Skip, Continue, None of these), no hints under buttons, no key legend under the screens, no coaching paragraph on the red screen, "Press B to scan" only under the camera. The supervisor board and the settings panel keep their explanations.
3. [~] **Consistency.** Done so far: every button is a verb of one or two words with the same shape; red flags are red, confirms green, Back and Retry the same everywhere; the roster row's "Un-check — scan again" is "Un-check". The header is one fixed row (58 px) that never reflows: title and order on the left, pills in the middle shrinking and clipping before anything moves, buttons on the right; "Double-checking" is "Checking · N", the board pill "Board offline", full screen an icon. The result card under the camera is one compact line. The key legend under the camera is gone. Still open: red headlines shout in capitals while yellow ones do not.
4. [ ] **Clear and obvious.** Every screen should tell a new operator what to do next without training.
5. [ ] **Damage logic by order type.** The damage / flag reasons offered should depend on the type of order. Needs item 8 first.
6. [x] **Go back to the last scan.** The "Last passed" bar has "Flag it": it reopens the jersey on the reasons screen, the chosen reason takes its pass back and logs "— found after it passed"; Back leaves it passed. Any earlier jersey is item 7.
7. [x] **History button on top.** "History" in the header opens every jersey scanned this order, latest first, one line each with its photo, size and bin; a passed jersey has "Flag it" (reasons screen, pass taken back, "found after it passed" in the log), a flagged one shows Flagged. Esc closes.
8. [ ] **Ask Mahesh or Polina for every flag type.** Get the full list of flags that can come up on the floor, so the reasons menu and item 5 are complete.
9. [x] **On-screen keys.** A numeric pad under the PIN at sign-in (with Sign in on it); on the hand-entry form the keys follow the field that has focus, digits for the number and letters plus a dash for name, size and team, with Save on the pad; the form has no size field and the team is a dropdown of the roster's teams. The stations run on a mouse and four programmed keys (B, A, up, down), so "By hand" is also a button on the camera panel, camera on or off.
10. [ ] **Ask Polina for a real roster file.** Test with it without jerseys, and check whether the roster carries more about the order (order type, what to inspect for) that the app could read and use.

## Suggested order

- Start today, no one else needed: the two "already found" fixes, then 2, 3, 4, 6, 7, 9.
- Ask early, because other items wait on the answers: 8 and 10.
- After the answers come back: 5, then 1 once the order types and roster fields are known.
