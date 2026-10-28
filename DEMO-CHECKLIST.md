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

## Changes to the UI (from the notes)

1. [ ] **Sorting system.** Decide what the roster, log and remaining lists sort by (number, name, status, time) and give the operator a way to change it.
2. [x] **Fewer words.** Operator result screens done: hand-entry and free-text screens are headline only, every button is one or two words (Confirm, Retry scan, Flag, Skip, Continue, None of these), no hints under buttons, no key legend under the screens, no coaching paragraph on the red screen, "Press B to scan" only under the camera. The supervisor board and the settings panel keep their explanations.
3. [ ] **Consistency.** Same words, colours, button shapes and positions for the same action on every screen (green / yellow / red, flag, confirm, pick).
4. [ ] **Clear and obvious.** Every screen should tell a new operator what to do next without training.
5. [ ] **Damage logic by order type.** The damage / flag reasons offered should depend on the type of order. Needs item 8 first.
6. [x] **Go back to the last scan.** The "Last passed" bar has "Flag it": it reopens the jersey on the reasons screen, the chosen reason takes its pass back and logs "— found after it passed"; Back leaves it passed. Any earlier jersey is item 7.
7. [ ] **History button on top.** A button that lists all previously scanned jerseys, latest first, so any of them can be flagged after the fact. Builds on item 6.
8. [ ] **Ask Mahesh or Polina for every flag type.** Get the full list of flags that can come up on the floor, so the reasons menu and item 5 are complete.
9. [ ] **Virtual keyboard.** Put an on-screen keyboard wherever typing is needed (name, order number, edit number, note), and remove the need to type wherever a button or list can do the job instead.
10. [ ] **Ask Polina for a real roster file.** Test with it without jerseys, and check whether the roster carries more about the order (order type, what to inspect for) that the app could read and use.

## Suggested order

- Start today, no one else needed: the two "already found" fixes, then 2, 3, 4, 6, 7, 9.
- Ask early, because other items wait on the answers: 8 and 10.
- After the answers come back: 5, then 1 once the order types and roster fields are known.
