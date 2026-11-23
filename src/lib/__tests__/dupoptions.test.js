import { describe, it, expect, vi } from "vitest";
import { duplicateOptions } from "../dupoptions.js";

// Code review H3 (Noam, 23 Nov 2026): the pedal must never pass a flagged jersey.
const retry = { id: "retry", label: "Retry" };
const mk = scanned => {
  const actions = { passBack: vi.fn(), skipDuplicate: vi.fn(), flagDuplicate: vi.fn() };
  return { actions, opts: duplicateOptions({ match: { _id: 7, scanned }, actions, retry }) };
};

describe("ALREADY DONE options", () => {
  it("a flagged jersey: Skip is first and primary, so the pedal skips", () => {
    const { opts, actions } = mk("flag");
    expect(opts[0].id).toBe("skip");
    expect(opts[0].primary).toBe(true);
    opts[0].run();
    expect(actions.skipDuplicate).toHaveBeenCalled();
    expect(actions.passBack).not.toHaveBeenCalled();
  });
  it("a flagged jersey: Back from repair is mouse only and nothing else is", () => {
    const { opts, actions } = mk("flag");
    const back = opts.find(o => o.id === "back");
    expect(back.mouseOnly).toBe(true);
    expect(back.primary).toBeFalsy();
    back.run();
    expect(actions.passBack).toHaveBeenCalledWith(7);
    expect(opts.filter(o => o.mouseOnly)).toHaveLength(1);
  });
  it("a passed jersey keeps Skip, Retry, Duplicate", () => {
    const { opts } = mk("pass");
    expect(opts.map(o => o.id)).toEqual(["skip", "retry", "dup"]);
  });
});
