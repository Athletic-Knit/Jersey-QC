import { describe, it, expect } from "vitest";
import { frameDiff, texture, createMotionGate } from "../motion.js";

const W = 8, H = 4;
const flat = v => new Uint8Array(W * H).fill(v);                                    // a bare table: no texture
const busy = (v = 0) => Uint8Array.from({ length: W * H }, (_, i) => (i % 2 ? 200 : 0) + v); // fabric + number: lots of texture
const gate = () => createMotionGate({ changeAt: 10, stillBelow: 3, stillTicks: 2, minTexture: 5, placeWindowTicks: 2, timeoutTicks: 50, width: W, height: H });

describe("texture", () => {
  it("is near zero for a flat frame and high for a busy one", () => {
    expect(texture(flat(50), W, H)).toBe(0);
    expect(texture(busy(), W, H)).toBeGreaterThan(50);
  });
});

describe("motion gate", () => {
  it("lift, empty table still, place, still → scans on the placement, not the table", () => {
    const g = gate(); g.arm();
    g.tick(busy());                                   // reference: old jersey
    expect(g.tick(busy())).toBe(false);               // nothing yet
    expect(g.tick(flat(40))).toBe(false);             // lifted: big change
    expect(g.tick(flat(40))).toBe(false);             // table still 1
    expect(g.tick(flat(40))).toBe(false);             // table still 2 → flat → wait for placement
    expect(g.phase).toBe("place");
    expect(g.tick(flat(40))).toBe(false);             // still empty, however long
    expect(g.tick(busy(3))).toBe(false);              // new jersey placed
    expect(g.tick(busy(3))).toBe(false);              // settling 1
    expect(g.tick(busy(3))).toBe(true);               // settling 2 → scan
    expect(g.armed).toBe(false);
  });
  it("fast swap with no empty gap scans after a short window", () => {
    const g = gate(); g.arm();
    g.tick(busy());
    expect(g.tick(busy(60))).toBe(false);             // swapped in one motion
    expect(g.tick(busy(60))).toBe(false);             // still 1
    expect(g.tick(busy(60))).toBe(false);             // still 2 → textured → window
    expect(g.phase).toBe("window");
    expect(g.tick(busy(60))).toBe(false);             // window 1
    expect(g.tick(busy(60))).toBe(true);              // window 2 → scan
  });
  it("a lift with nothing put back never scans", () => {
    const g = gate(); g.arm();
    g.tick(busy());
    g.tick(flat(40));
    for (let i = 0; i < 60; i++) if (g.tick(flat(40))) throw new Error("scanned an empty table");
    expect(g.armed).toBe(false);                      // timed out instead
  });
  it("a hand passing over the table does not count as a jersey", () => {
    const g = gate(); g.arm();
    g.tick(busy()); g.tick(flat(40)); g.tick(flat(40)); g.tick(flat(40));   // lifted → place
    expect(g.phase).toBe("place");
    g.tick(flat(120));                                 // hand in frame
    expect(g.tick(flat(120))).toBe(false);
    expect(g.tick(flat(120))).toBe(false);             // settled but flat → back to place
    expect(g.phase).toBe("place");
  });
  it("frameDiff is the mean absolute difference", () => {
    expect(frameDiff(flat(0), flat(10))).toBe(10);
    expect(frameDiff(null, flat(1))).toBe(0);
  });
});
