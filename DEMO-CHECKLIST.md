# Demo checklist

Work for the demo to the big boss, from the notebook page dated 2026-10-27.
Tick a box when the item is on the `read-guard` branch and checked at a station.

## Already found, not yet done

- [x] **Single-digit fix.** An exact name + number match now goes green even when the camera doubts the lone digit (Seach #9, Evanovich #4). Done and tested; not committed yet.
- [x] **Sign in works first time.** Opening the app without `?station=` on the address made the first Sign in click reload the page and wipe the name and PIN. The sign-in is now saved for the target station before the reload. Verified in the browser; not committed yet.
- [x] **Recognition stress test and fixes.** 103 synthetic jerseys + 270 distorted frames + the 13 real ones through the live model (`tools/recog-stress.mjs`). Fixed: turned jerseys are turned upright and read again; lone digits are flagged only on evidence; a close-up number is never "no jersey"; 6/9-type numbers on a turned jersey ask. Findings in `tools/RECOGNITION-FINDINGS.md`. Not committed yet.
- [x] **Self-check after a mistake ("military grade").** After the operator corrects the app, the next 5 jerseys are read twice and must agree before a green; another mistake restarts the 5. Header pill shows "Double-checking · N to go". Verified in the browser; in the operator simulation too. Not committed yet.

## Changes to the UI (from the notes)

1. [ ] **Sorting system.** Decide what the roster, log and remaining lists sort by (number, name, status, time) and give the operator a way to change it.
2. [ ] **Fewer words.** Cut every label, hint and reason line to the shortest wording that still tells the operator what to do.
3. [ ] **Consistency.** Same words, colours, button shapes and positions for the same action on every screen (green / yellow / red, flag, confirm, pick).
4. [ ] **Clear and obvious.** Every screen should tell a new operator what to do next without training.
5. [ ] **Damage logic by order type.** The damage / flag reasons offered should depend on the type of order. Needs item 8 first.
6. [ ] **Go back to a previous scan or one already done.** A way to reopen the last scan, or any jersey already passed, and change its result.
7. [ ] **History button on top.** A button that lists all previously scanned jerseys, latest first, so any of them can be flagged after the fact. Builds on item 6.
8. [ ] **Ask Mahesh or Polina for every flag type.** Get the full list of flags that can come up on the floor, so the reasons menu and item 5 are complete.
9. [ ] **Virtual keyboard.** Put an on-screen keyboard wherever typing is needed (name, order number, edit number, note), and remove the need to type wherever a button or list can do the job instead.
10. [ ] **Ask Polina for a real roster file.** Test with it without jerseys, and check whether the roster carries more about the order (order type, what to inspect for) that the app could read and use.

## Suggested order

- Start today, no one else needed: the two "already found" fixes, then 2, 3, 4, 6, 7, 9.
- Ask early, because other items wait on the answers: 8 and 10.
- After the answers come back: 5, then 1 once the order types and roster fields are known.
