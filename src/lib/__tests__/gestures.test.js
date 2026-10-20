import { describe, it, expect } from "vitest";
import { createGestureGate, GESTURE_TO_SETTING, GESTURE_INFO } from "../gestures.js";

const gate = (o = {}) => createGestureGate({ holdMs: 600, cooldownMs: 1500, absentMs: 300, minScore: 0.7, ...o });
// Feed the same gesture every 50 ms from t0 for `ms`; return the last status.
const hold   = (g, gesture, t0, ms, score = 0.9) => { let st; for (let t = t0; t <= t0 + ms; t += 50) st = g.tick({ gesture, score, hand: true, t }); return st; };
const noHand = (g, t0, ms) => { let st; for (let t = t0; t <= t0 + ms; t += 50) st = g.tick({ gesture: null, score: 0, hand: false, t }); return st; };
// A gate that has seen an empty picture and is ready for gestures from t = 1000.
const armed = (o) => { const g = gate(o); noHand(g, 0, 600); return g; };

describe("gesture map", () => {
  it("covers the four result-screen keys, never Scan", () => {
    expect(new Set(Object.values(GESTURE_TO_SETTING))).toEqual(new Set(["confirmKey", "cancelKey", "retryKey", "byHandKey"]));
    expect(GESTURE_INFO.map(i => i.gesture).sort()).toEqual(Object.keys(GESTURE_TO_SETTING).sort());
  });
});

describe("createGestureGate", () => {
  it("starts disarmed: a hand still in the picture cannot answer the screen it just caused", () => {
    const g = gate();
    expect(hold(g, "Thumb_Up", 0, 2000).fired).toBeNull();
    expect(g.phase).toBe("arming");
  });

  it("arms once the picture has been empty for absentMs", () => {
    const g = gate();
    noHand(g, 0, 200);
    expect(g.phase).toBe("arming");
    noHand(g, 250, 200);
    expect(g.phase).toBe("idle");
    expect(hold(g, "Thumb_Up", 1000, 600).fired).toBe("Thumb_Up");
  });

  it("a hand that comes back during arming restarts the absence clock", () => {
    const g = gate();
    noHand(g, 0, 200);
    g.tick({ gesture: null, score: 0, hand: true, t: 250 });
    noHand(g, 300, 200);
    expect(g.phase).toBe("arming");
  });

  it("fires thumbs up once after the hold time, not before", () => {
    const g = armed();
    const early = hold(g, "Thumb_Up", 1000, 500);
    expect(early.fired).toBeNull();
    expect(early.phase).toBe("holding");
    expect(early.progress).toBeGreaterThan(0.7);
    const st = g.tick({ gesture: "Thumb_Up", score: 0.9, hand: true, t: 1600 });
    expect(st.fired).toBe("Thumb_Up");
    expect(st.phase).toBe("cooldown");
  });

  it("a hand merely passing through does not fire", () => {
    const g = armed();
    let fired = 0;
    const seq = ["None", "Open_Palm", "Thumb_Up", "None", "Thumb_Up", "None", "Closed_Fist", "None"];
    seq.forEach((s, i) => { if (g.tick({ gesture: s, score: 0.9, hand: s !== "None", t: 1000 + i * 100 }).fired) fired++; });
    expect(fired).toBe(0);
  });

  it("ignores low-confidence gestures and gestures without a command", () => {
    const g = armed();
    expect(hold(g, "Thumb_Up", 1000, 1000, 0.5).fired).toBeNull();
    expect(hold(g, "Open_Palm", 3000, 1000).fired).toBeNull();
    expect(hold(g, "Closed_Fist", 5000, 1000).fired).toBeNull();
  });

  it("a thumb held up for ten seconds is one Select", () => {
    const g = armed();
    const fired = [];
    for (let t = 1000; t <= 11000; t += 50) { const st = g.tick({ gesture: "Thumb_Up", score: 0.9, hand: true, t }); if (st.fired) fired.push(t); }
    expect(fired).toEqual([1600]);
  });

  it("nothing fires during the cooldown after a fire", () => {
    const g = armed();
    expect(hold(g, "Thumb_Up", 1000, 600).fired).toBe("Thumb_Up");         // cooldown until 3100
    expect(hold(g, "Thumb_Down", 1650, 1200).fired).toBeNull();            // held well past holdMs, still inside the cooldown
    expect(hold(g, "Thumb_Down", 3100, 600).fired).toBe("Thumb_Down");     // first chance after it
  });

  it("the same gesture fires again only after it was let go", () => {
    const g = armed();
    expect(hold(g, "Thumb_Up", 1000, 600).fired).toBe("Thumb_Up");
    expect(hold(g, "Thumb_Up", 3200, 1000).fired).toBeNull();     // still up after the cooldown: no
    noHand(g, 4300, 200);
    expect(hold(g, "Thumb_Up", 4600, 600).fired).toBe("Thumb_Up");  // dropped and raised: yes
  });

  it("changing gesture mid-hold restarts the hold", () => {
    const g = armed();
    hold(g, "Thumb_Up", 1000, 400);
    const st = hold(g, "Thumb_Down", 1450, 400);
    expect(st.fired).toBeNull();
    expect(st.phase).toBe("holding");
    expect(st.gesture).toBe("Thumb_Down");
  });

  it("reset() disarms again, as when a new result screen opens", () => {
    const g = armed();
    hold(g, "Thumb_Up", 1000, 600);
    g.reset();
    expect(g.phase).toBe("arming");
    expect(hold(g, "Thumb_Down", 5000, 1000).fired).toBeNull();
  });
});
