import { describe, it, expect } from "vitest";
import { createVoiceGate, COMMAND_WORDS, GRAMMAR, COMMAND_INFO } from "../voice.js";

describe("voice vocabulary", () => {
  it("three commands: scan, select, retry; the grammar ends with [unk]", () => {
    expect(new Set(Object.values(COMMAND_WORDS))).toEqual(new Set(["scan", "select", "retry"]));
    expect(COMMAND_WORDS["again"]).toBe("retry");
    const g = JSON.parse(GRAMMAR);
    expect(g.at(-1)).toBe("[unk]");
    expect(g.length).toBe(Object.keys(COMMAND_WORDS).length + 1);
    expect(COMMAND_INFO.length).toBe(3);
  });
});

describe("createVoiceGate", () => {
  it("fires on the first partial that ends with a command word, once", () => {
    const g = createVoiceGate();
    expect(g.hear("next", 1000)).toBe("select");
    expect(g.hear("next", 1100)).toBeNull();          // same partial repeated
    expect(g.hear("next", 1300, true)).toBeNull();    // the final for the same utterance
  });
  it("a command inside a longer phrase does not fire; one alone does", () => {
    const g = createVoiceGate();
    expect(g.hear("[unk]", 1000)).toBeNull();
    expect(g.hear("[unk] next", 1100)).toBe("select");      // "ok next" style: the new token stands alone
    g.hear("[unk] next [unk]", 1200, true);
    const g2 = createVoiceGate();
    expect(g2.hear("next [unk]", 1000)).toBeNull();          // two new tokens at once, not a clean command
  });
  it("respects the cooldown, then fires again", () => {
    const g = createVoiceGate({ cooldownMs: 700 });
    expect(g.hear("scan", 1000)).toBe("scan");
    g.hear("scan", 1200, true);
    expect(g.hear("again", 1400)).toBeNull();          // 400 ms after the last fire
    g.hear("again", 1450, true);
    expect(g.hear("again", 1800)).toBe("retry");       // 800 ms after
  });
  it("words outside the list, like 'not right', never fire", () => {
    const g = createVoiceGate();
    expect(g.hear("[unk]", 1000)).toBeNull();
    expect(g.hear("[unk] [unk]", 1100)).toBeNull();
  });
  it("the same word said twice quickly is one command; after 1.5 s it is two", () => {
    const g = createVoiceGate({ cooldownMs: 300 });
    expect(g.hear("next", 1000)).toBe("select");
    g.hear("next", 1050, true);
    expect(g.hear("next", 1400)).toBeNull();           // echo / stutter
    g.hear("next", 1450, true);
    expect(g.hear("next", 2700)).toBe("select");
  });
  it("scan fires on its own word; again retries", () => {
    const g = createVoiceGate();
    expect(g.hear("scan", 1000)).toBe("scan");
    g.hear("scan", 1100, true);
    expect(g.hear("again", 2000)).toBe("retry");
  });
  it("unknown words never fire", () => {
    const g = createVoiceGate();
    expect(g.hear("[unk]", 1000)).toBeNull();
    expect(g.hear("[unk] [unk]", 1100)).toBeNull();
    expect(g.hear("[unk] [unk]", 1200, true)).toBeNull();
  });
});
