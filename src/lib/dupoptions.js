// The buttons of the ALREADY DONE screen (mode "duplicate"), kept out of App.jsx so a
// test can read them.
//
// The "Back from repair" button is on this screen because a flagged jersey that is scanned
// again may have come back from repair (the owner, 20 Nov 2026).
//
// WHY: a flagged jersey is often still under the camera when the operator presses the
// pedal again. "Back from repair — pass it" used to be the first, pre-selected button, so
// one reflex press passed a damaged jersey (code review H3; Noam, review of 23 Nov 2026).
// Now "Skip" is first and pre-selected, and passing it is a deliberate mouse click:
// `mouseOnly` is the same flag the green screen's Retry button uses (the arrow keys skip
// it and the Select key never runs it; see the key handler in ScanOverlay).
//
//   match    the roster row that was scanned again (match.scanned === "flag" when flagged)
//   actions  { passBack(id), skipDuplicate, flagDuplicate }
//   retry    the shared Retry button
export function duplicateOptions({ match, actions, retry }) {
  if (match?.scanned === "flag") {
    return [
      { id: "skip", label: "Skip", primary: true, run: actions.skipDuplicate },
      { id: "back", label: "🔧 Back from repair — pass it", mouseOnly: true, run: () => actions.passBack(match._id) },   // mouse click only, never a key, the pedal or hands-free
      retry,
    ];
  }
  return [{ id: "skip", label: "✓ Skip", primary: true, run: actions.skipDuplicate }, retry, { id: "dup", label: "🚩 Duplicate", run: actions.flagDuplicate }];
}
