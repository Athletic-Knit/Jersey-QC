import { describe, it, expect } from "vitest";
import { frameDiff, texture, createMotionGate } from "../motion.js";

const W = 8, H = 4;
const flat = v => new Uint8Array(W * H).fill(v);                                    // a plain surface: no texture
const busy = (v = 0) => Uint8Array.from({ length: W * H }, (_, i) => (i % 2 ? 200 : 0) + v); // fabric + number: lots of texture
// A table with a mat and a cable on it: as much texture as a jersey, but a different picture.
const mat = Uint8Array.from({ length: W * H }, (_, i) => (i % 3 ? 90 : 160));
const gate = () => createMotionGate({ changeAt: 10, stillBelow: 3, stillTicks: 2, minTexture: 2, tableBelow: 4, timeoutTicks: 50, width: W, height: H });
const settle = (g, f, n = 3) => { let fired = false; for (let i = 0; i < n; i++) fired = g.tick(f) || fired; return fired; };

describe("texture", () => {
  it("is near zero for a flat frame and high for a busy one", () => {
    expect(texture(flat(50), W, H)).toBe(0);
    expect(texture(busy(), W, H)).toBeGreaterThan(50);
    expect(texture(mat, W, H)).toBeGreaterThan(20);
  });
});

describe("motion gate — one jersey at a time", () => {
  it("lift, featureless table, place, still → scans the placement, not the table", () => {
    const g = gate(); g.arm(busy());
    expect(g.tick(busy())).toBe(false);               // nothing yet
    expect(g.tick(flat(40))).toBe(false);             // lifted: big change
    expect(settle(g, flat(40))).toBe(false);          // table still → featureless → wait for a placement
    expect(g.phase).toBe("place");
    expect(g.hasTable).toBe(true);                    // and it learned what the table looks like
    expect(settle(g, flat(40), 10)).toBe(false);      // still empty, however long
    expect(g.tick(busy(3))).toBe(false);              // new jersey placed
    expect(settle(g, busy(3))).toBe(true);            // settled → scan
    expect(g.armed).toBe(false);
  });
  it("a textured table it has not learned yet is taken for a jersey (the model then says empty)", () => {
    const g = gate(); g.arm(busy());
    g.tick(busy());
    g.tick(mat);                                      // lifted: the mat is now in view
    expect(settle(g, mat)).toBe(true);                // scans it once …
  });
  it("… and after learnTable() the same table never scans again", () => {
    const g = gate(); g.learnTable(mat);
    g.arm(busy());
    g.tick(busy());
    g.tick(mat);
    expect(settle(g, mat)).toBe(false);               // looks like the table → wait
    expect(g.phase).toBe("place");
    expect(settle(g, mat, 20)).toBe(false);
    g.tick(busy(7));                                  // next jersey placed
    expect(settle(g, busy(7))).toBe(true);
  });
  it("a hand passing over the learned table does not count as a jersey", () => {
    const g = gate(); g.learnTable(mat);
    g.arm(busy());
    g.tick(busy()); g.tick(mat); settle(g, mat);      // lifted → place
    expect(g.phase).toBe("place");
    const hand = Uint8Array.from(mat); for (let i = 0; i < 10; i++) hand[i] = 255;
    g.tick(hand);                                     // hand in frame
    settle(g, hand, 1);
    expect(settle(g, mat)).toBe(false);               // hand gone, table again → still waiting
    expect(g.phase).toBe("place");
  });
  it("a lift with nothing put back never scans", () => {
    const g = gate(); g.arm(busy());
    g.tick(busy());
    g.tick(flat(40));
    for (let i = 0; i < 60; i++) if (g.tick(flat(40))) throw new Error("scanned an empty table");
    expect(g.armed).toBe(false);                      // timed out instead
  });
});

describe("motion gate — a stack lifted jersey by jersey", () => {
  it("the next jersey is already there after the lift: scans once it is still", () => {
    const g = gate(); g.learnTable(mat);
    g.arm(busy());
    g.tick(busy());
    expect(g.tick(busy(60))).toBe(false);             // top jersey off, the next one in view
    expect(g.tick(busy(60))).toBe(false);             // still 1
    expect(g.tick(busy(60))).toBe(true);              // still 2 → not the last jersey, not the table → scan
  });
  it("works before the table is ever learned", () => {
    const g = gate(); g.arm(busy());
    g.tick(busy()); g.tick(busy(60));
    expect(settle(g, busy(60))).toBe(true);
  });
  it("a same-team jersey that differs only by a few digits counts as a new jersey", () => {
    const scanned = busy();
    const g = gate(); g.arm(scanned);
    const nextNumber = busy(); for (let i = 0; i < 6; i++) nextNumber[i] = 255 - nextNumber[i];   // a few pixels of digit changed
    const d = frameDiff(scanned, nextNumber);
    expect(d).toBeGreaterThan(3); expect(d).toBeLessThan(60);
    g.tick(busy(60));                                 // motion while swapping
    expect(settle(g, nextNumber)).toBe(true);
  });
});

describe("motion gate — the jersey just scanned", () => {
  it("the hand pulling back from the jersey just scanned does not re-scan it", () => {
    const scanned = busy();                           // what the camera saw at scan time
    const g = gate(); g.arm(scanned);
    const withHand = busy(); for (let i = 0; i < 12; i++) withHand[i] = 255;   // hand over part of it
    expect(g.tick(withHand)).toBe(false);             // big change: hand moves in
    expect(g.tick(busy())).toBe(false);               // hand gone: big change back
    expect(settle(g, busy())).toBe(false);            // settled → identical to the scanned frame → wait
    expect(g.phase).toBe("lift");
    expect(g.armed).toBe(true);
  });
  it("a nudged jersey, then a hand over it, is still the same jersey", () => {
    const scanned = busy();
    const g = gate(); g.arm(scanned);
    const nudged = busy(5);                           // a small shift: every pixel moves a little
    const dN = frameDiff(scanned, nudged); expect(dN).toBeGreaterThanOrEqual(3); expect(dN).toBeLessThan(10);
    g.tick(nudged); g.tick(nudged); g.tick(nudged);   // small move, then it rests → new baseline
    expect(g.phase).toBe("lift");
    const withHand = Uint8Array.from(nudged); for (let i = 8; i < 20; i++) withHand[i] = 255;
    expect(g.tick(withHand)).toBe(false);             // hand in: big change
    expect(g.tick(nudged)).toBe(false);               // hand out
    expect(settle(g, nudged)).toBe(false);            // settled: identical to the new baseline → wait
    expect(g.phase).toBe("lift");
    expect(g.armed).toBe(true);
  });
  it("frameDiff is the mean absolute difference", () => {
    expect(frameDiff(flat(0), flat(10))).toBe(10);
    expect(frameDiff(null, flat(1))).toBe(0);
  });
});
