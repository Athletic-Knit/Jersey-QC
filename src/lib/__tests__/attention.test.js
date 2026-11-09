import { describe, it, expect } from "vitest";
import { createAwayWatch, awaySummary, buildAttentionSheet, awayLabel } from "../attention.js";

// A fake document and window: events fire by hand, time is a dial.
function fakes() {
  const mk = () => { const h = {}; return { addEventListener: (e, f) => (h[e] = f), removeEventListener: e => delete h[e], fire: e => h[e]?.(), h }; };
  const doc = Object.assign(mk(), { hidden: false }); const win = mk();
  let t = 1_000_000; const now = () => t; const tick = s => { t += s * 1000; };
  return { doc, win, now, tick };
}

describe("away watch", () => {
  it("a hidden screen is one spell from hidden to visible, with the seconds", () => {
    const { doc, win, now, tick } = fakes(); const spells = [];
    const w = createAwayWatch({ onSpell: s => spells.push(s), doc, win, now });
    doc.hidden = true; doc.fire("visibilitychange"); tick(42); doc.hidden = false; doc.fire("visibilitychange");
    expect(spells).toEqual([{ start: 1_000_000, end: 1_042_000, seconds: 42, how: "hidden" }]);
    expect(w.isAway()).toBe(false);
  });
  it("another window in front is 'unfocused'; a moment's blur (a file dialog) is dropped", () => {
    const { doc, win, now, tick } = fakes(); const spells = [];
    createAwayWatch({ onSpell: s => spells.push(s), doc, win, now });
    win.fire("blur"); tick(2); win.fire("focus");                 // too short
    win.fire("blur"); tick(90); win.fire("focus");
    expect(spells.map(s => [s.how, s.seconds])).toEqual([["unfocused", 90]]);
  });
  it("a blur followed by hiding is one spell, ended when the page is visible and focused again", () => {
    const { doc, win, now, tick } = fakes(); const spells = [];
    createAwayWatch({ onSpell: s => spells.push(s), doc, win, now });
    win.fire("blur"); tick(5); doc.hidden = true; doc.fire("visibilitychange"); tick(60);
    doc.hidden = false; doc.fire("visibilitychange");             // visible again but the spell began as a blur: focus ends it
    expect(spells).toHaveLength(0);
    win.fire("focus");
    expect(spells.map(s => [s.how, s.seconds])).toEqual([["unfocused", 65]]);
  });
  it("stop() closes an open spell and detaches", () => {
    const { doc, win, now, tick } = fakes(); const spells = [];
    const w = createAwayWatch({ onSpell: s => spells.push(s), doc, win, now });
    doc.hidden = true; doc.fire("visibilitychange"); tick(30); w.stop();
    expect(spells).toHaveLength(1); expect(Object.keys(doc.h)).toEqual([]); expect(Object.keys(win.h)).toEqual([]);
  });
});

describe("attention sheet", () => {
  it("sums the spells and lists them in time order", () => {
    const idle = [{ start: 3000, end: 243000, minutes: 4 }];
    const away = [{ start: 1000, end: 61000, seconds: 60, how: "hidden" }, { start: 500000, end: 509000, seconds: 9, how: "unfocused" }];
    expect(awaySummary(away)).toEqual({ count: 2, seconds: 69 });
    const sheet = buildAttentionSheet(idle, away, t => String(t));
    expect(sheet[1]).toEqual(["Idle spells (3 min or more untouched)", 1]);
    expect(sheet[2]).toEqual(["Times the screen was left", 2, "Minutes away", 1.2]);
    expect(sheet.slice(5).map(r => r[0])).toEqual([awayLabel("hidden"), "Idle — screen up, nobody touched it", awayLabel("unfocused")]);
    expect(buildAttentionSheet([], []).at(-1)).toEqual(["—", "nothing recorded"]);
    expect(sheet[4]).toEqual(["What", "From", "To", "Minutes"]);                      // no "Signed in" column: spells name no one
    expect(JSON.stringify(sheet)).not.toMatch(/Sam/);
  });
});
