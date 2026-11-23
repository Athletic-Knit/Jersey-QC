# Demo checklist

Work for the demo to the big boss, from the notebook page dated 2026-10-27. Kept as a record.

The work was done on the `read-guard` branch at the time. Everything here has since moved on to `development` (and from there to `testing` and `production`); new work goes on `development` only. Updated 23 Nov 2026: where a later decision changed an item, a **Since then** note says so, and `CLAUDE.md` and `CHANGELOG.md` describe how it works now.

## Already found, now done

- [x] **Single-digit fix.** An exact name + number match went green even when the camera doubted the lone digit (Seach #9, Evanovich #4). Committed (b2af187).
  **Since then:** reversed on 23 Nov 2026 (Noam's rule N1): a doubtful read is always yellow, even when name and number match exactly.
- [x] **Sign in works first time.** The sign-in is saved for the target station before the page reloads. Committed (b2af187).
- [x] **Recognition stress test and fixes.** Synthetic and distorted frames through the live model (`tools/recog-stress.mjs`); findings in `tools/RECOGNITION-FINDINGS.md`. Committed (b2af187).
- [x] **Self-check after a mistake.** After the operator corrects the app, the next 5 jerseys are read twice and must agree before a green. Header pill "Checking · N". Committed (b2af187).
- [x] **Operator inspection regime.** Full inspection of the first 5 jerseys, then a quick look with a spot check after every 10; a defect starts the 5 again.
  **Since then:** every check is a tick button and Confirm waits for them (20 Nov 2026); some flag reasons keep the quick look and add one check instead of restarting.
- [x] **Reasons and supervisor screens, plain.**
  **Since then:** the screen after a flag says FLAGGED and "put it in the DAMAGED box", not GO TO SUPERVISOR (17 Nov 2026).
- [x] **Pass / Flag / By hand pills show their jerseys.** Clicking a header pill filters the roster table.
- [x] **Operator sets the order number.** From the roster file when it carries one; digits only.
- [x] **Packer blocked at sign-in.** Still shown as "under development".
- [x] **No export or roster editing for operators.**
- [x] **Hands-free waits after a confirm.** 3 s by default (Settings → "Wait after a confirm").
- [x] **Shorter yellow lists for nameless jerseys.**
- [x] **Flags are resolved by the supervisor only.**
- [x] **A flagged jersey stays flagged.**
  **Since then:** a flagged jersey that comes back from repair can be passed, deliberately: on an unfinished order picked up again, or by a mouse click on the ALREADY DONE screen (never the pedal).
- [x] **Three recognition rules.**
- [x] **Green screen fits a 1600×900 half panel.**
  **Since then:** the screens were enlarged for 27-inch monitors read from 4–5 ft.
- [x] **Mark column for everyone again.**
  **Since then:** Short-shipped was removed from the Mark menu (9 Nov 2026); a supervisor ships an order short from the Unfinished pile instead.
- [x] **A read with nothing in it is not a failure.** "No jersey in view" is a short yellow notice; nothing is logged.
- [x] **Two navigation keys.** Down (default A) and Up (default ↑).
- [x] **Sign-in: name dropdown and keypad.**
  **Since then:** "Other" asks for the name on the screen's keys.
- [x] **Typed list rows pick by mouse.**
  **Since then:** a typed jersey on the roster goes to the same green screen as a scan (20 Nov 2026).

## Changes to the UI (from the notes)

1. [x] **Sorting system.** The roster table has one sort menu (Size, Status, Name, Number, Team, Box) with "Done first / To do first", a search box and filters; the yellow pick list sorts by size, team or number (Settings → Pick list).
2. [x] **Fewer words.**
3. [~] **Consistency.** Done: buttons, colours, the fixed header. Still open: the red screens' titles are in capitals (NOT FOUND, COULD NOT READ, SCAN FAILED) while the yellow ones are not.
4. [ ] **Clear and obvious.** Every screen should tell a new operator what to do next without training. An ongoing aim, not a single task.
5. [x] **Damage logic by order type.** The flag reasons follow the jersey type: a stitched order (ECHL, ECHL replica) is offered "Twill peeling", a sublimated one "Sublimation error"; with no type set, every reason is offered.
6. [x] **Go back to the last scan.** "Flag it" on the Last passed bar.
7. [x] **History button.** Every jersey of the order, with "Flag it".
   **Since then:** History sits bottom-left under the last pass, not in the header.
8. [ ] **Ask Mahesh or Polina for every flag type.** Not recorded as done. The reasons menu was rewritten after the demo of 17 Nov 2026 (`REASONS` in `src/config.js`); whether it is the floor's complete list is for the owner to confirm.
9. [x] **On-screen keys.** Keypads and letter keys wherever an operator types.
   **Since then:** the pedal and the scan key are Enter (17 Nov 2026), not B.
10. [ ] **Ask Polina for a real roster file.** Not recorded as done. Real floor orders have been run since (a 521-jersey sort on 18 Nov 2026), so real rosters exist; whether the roster carries more the app could use is still open.
