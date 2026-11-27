import { describe, it, expect } from "vitest";
import { normStopSign, parseModelText, PROMPT } from "../vision.js";

const answer = obj => ({ content: [{ type: "text", text: JSON.stringify(obj) }] });

describe("the STOP patch in the read", () => {
  it("the prompt asks for it", () => {
    expect(PROMPT).toMatch(/"stop_sign"/);
    expect(PROMPT).toMatch(/octagon/);
  });

  it("yes, no and not visible", () => {
    expect(normStopSign("yes")).toBe("yes");
    expect(normStopSign("YES")).toBe("yes");
    expect(normStopSign(true)).toBe("yes");
    expect(normStopSign("no")).toBe("no");
    expect(normStopSign(false)).toBe("no");
    expect(normStopSign("not_visible")).toBe("");
    expect(normStopSign("not visible")).toBe("");
    expect(normStopSign("Not-Visible")).toBe("");
  });

  it("anything else, or nothing, is unknown, never no", () => {
    expect(normStopSign(undefined)).toBe("");
    expect(normStopSign(null)).toBe("");
    expect(normStopSign("")).toBe("");
    expect(normStopSign("maybe")).toBe("");
  });

  it("is carried on the parsed read", () => {
    expect(parseModelText(answer({ name: "", number: "31", stop_sign: "yes" })).stop_sign).toBe("yes");
    expect(parseModelText(answer({ name: "", number: "31", stop_sign: "no" })).stop_sign).toBe("no");
    expect(parseModelText(answer({ name: "", number: "31" })).stop_sign).toBe("");
  });
});
