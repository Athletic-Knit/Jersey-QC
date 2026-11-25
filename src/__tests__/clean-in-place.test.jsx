// @vitest-environment jsdom
// The fix-it-here screens (the owner, 25 Nov 2026): Dirt or mark opens CLEAN IT
// NOW, Loose thread opens CUT IT NOW; each reason carries its own words and the
// flag it falls back to (MARK_STAYS, THREAD_STAYS).
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { createElement } from "react";

vi.mock("../lib/audio.js", () => ({ playTone: () => {} }));
import { ScanOverlay } from "../App.jsx";
import { REASONS, MARK_STAYS, THREAD_STAYS } from "../config.js";

afterEach(cleanup);
const match = { _id: 1, number: "12", name: "LEACH", team: "", size: "L-S" };
const draw = (reasonId, actions) => render(createElement(ScanOverlay, {
  state: { mode: "clean", fixing: REASONS.find(r => r.id === reasonId), scan: {}, match },
  actions, binMap: { "*": 1, __by: "all" }, extraCols: [], confirmKey: "Enter", cancelKey: "Escape", retryKey: "KeyR", byHandKey: "KeyH",
}));

describe("the fix-it-here screen", () => {
  it("Dirt or mark: the words are today's", () => {
    draw("mark", { cleaned: vi.fn(), cleanFailed: vi.fn(), back: vi.fn() });
    expect(screen.getByText("CLEAN IT NOW")).toBeTruthy();
    expect(screen.getByText(/Wipe the dirt or mark off\./)).toBeTruthy();
    expect(screen.getByText("not flagged").tagName).toBe("STRONG");
    expect(screen.getByText(/It is clean now/)).toBeTruthy();
    expect(screen.getByText(/It will not come out/)).toBeTruthy();
  });
  it("Loose thread: CUT IT NOW with its own words; 'It needs the stitcher' runs the fail action", () => {
    const cleanFailed = vi.fn(), cleaned = vi.fn();
    draw("loose_thread", { cleaned, cleanFailed, back: vi.fn() });
    expect(screen.getByText("CUT IT NOW")).toBeTruthy();
    expect(screen.getByText(/Cut the loose thread off\./)).toBeTruthy();
    expect(screen.getByText(/It is cut now/)).toBeTruthy();
    fireEvent.click(screen.getByText(/It needs the stitcher/));
    expect(cleanFailed).toHaveBeenCalledTimes(1);
    expect(REASONS.find(r => r.id === "loose_thread").inPlace.stays).toBe(THREAD_STAYS);
    expect(REASONS.find(r => r.id === "mark").inPlace.stays).toBe(MARK_STAYS);
  });
});
