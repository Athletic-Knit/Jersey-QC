import { describe, it, expect } from "vitest";
import { frameDiff, createMotionGate } from "../motion.js";

const flat = v => new Uint8Array(16).fill(v);

describe("motion gate", () => {
  it("fires only after a change followed by stillness", () => {
    const g = createMotionGate({ changeAt: 10, stillBelow: 3, stillTicks: 2 });
    g.arm();
    expect(g.tick(flat(10))).toBe(false);   // baseline
    expect(g.tick(flat(10))).toBe(false);   // still, but nothing has changed yet
    expect(g.tick(flat(60))).toBe(false);   // jersey swapped
    expect(g.tick(flat(61))).toBe(false);   // settling 1
    expect(g.tick(flat(61))).toBe(true);    // settling 2 → scan
    expect(g.armed).toBe(false);
  });
  it("gives up after the timeout", () => {
    const g = createMotionGate({ timeoutTicks: 3 });
    g.arm();
    g.tick(flat(1)); g.tick(flat(1)); g.tick(flat(1)); g.tick(flat(1));
    expect(g.armed).toBe(false);
  });
  it("frameDiff is the mean absolute difference", () => {
    expect(frameDiff(flat(0), flat(10))).toBe(10);
    expect(frameDiff(null, flat(1))).toBe(0);
  });
});
