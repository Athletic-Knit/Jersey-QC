// The station's keys as the app ships them, in a module with no import.meta.env, so the
// server (admin-plugin.js, adminstore.js) can check the floor's defaults against them too
// (Fable's review, 26 Nov 2026: a floor default "Retry = Enter" alone made Retry and Select
// the same key on every station). config.js builds DEFAULT_SETTINGS from these.
export const KEY_DEFAULTS = {
  scanKey: "Enter",       // take a picture (only when no screen is open). Enter, the same as Select, so one pedal does both (the owner, 17 Nov 2026; it was B)
  confirmKey: "Enter",    // select the highlighted option on any screen
  cancelKey: "KeyA",      // move the highlight down (↓ also works)
  upKey: "ArrowUp",       // move the highlight up (↑ also works)
  retryKey: "KeyR",       // retry the scan wherever it is offered; nothing is recorded
  byHandKey: "KeyW",      // open "Enter by hand" (the camera screen; the co-op, 25 Nov 2026)
};
// These act on the same screen, so no two may be the same key (SettingsPanel's rule). The
// scan key is not among them: it works only when no screen is up, so it may equal Select.
export const ON_SCREEN_KEYS = ["confirmKey", "cancelKey", "upKey", "retryKey", "byHandKey"];
export const keysClash = s => { const v = ON_SCREEN_KEYS.map(k => s[k]); return new Set(v).size !== v.length; };
