// @vitest-environment jsdom
// The damage photo on the FLAGGED screen has no countdown (the owner, 25 Nov
// 2026): Enter on "Photo of the damage" takes the photo at once.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { createElement } from "react";

vi.mock("../lib/audio.js", () => ({ playTone: () => {} }));
import { ScanOverlay } from "../App.jsx";

afterEach(cleanup);
const flagged = more => ({ mode: "supervisor", reason: "Twill peeling", entryId: "e1", photoFirst: true, damagePhotos: [], match: { _id: 1, number: "12", name: "LEACH", team: "", size: "L-S" }, ...more });
const draw = (state, actions) => render(createElement(ScanOverlay, { state, actions, binMap: { "*": 1, __by: "all" }, extraCols: [], canPhoto: true, confirmKey: "Enter", cancelKey: "Escape", retryKey: "KeyR", byHandKey: "KeyH" }));

describe("the damage photo", () => {
  it("Enter on the first option takes the photo at once, with no countdown", () => {
    const damagePhoto = vi.fn(() => Promise.resolve());
    draw(flagged(), { damagePhoto, dropDamagePhoto: vi.fn(), continueSupervisor: vi.fn() });
    expect(screen.getByText(/Photo of the damage/)).toBeTruthy();
    fireEvent.keyDown(window, { code: "Enter", key: "Enter" });
    expect(damagePhoto).toHaveBeenCalledTimes(1);   // synchronously: nothing waited for a 3-2-1
    expect(screen.queryByText(/Hold the damage under the camera/)).toBeNull();
  });
  it("a second press while the photo is on its way takes no second one", () => {
    const damagePhoto = vi.fn(() => new Promise(() => {}));   // never finishes
    draw(flagged(), { damagePhoto, dropDamagePhoto: vi.fn(), continueSupervisor: vi.fn() });
    fireEvent.keyDown(window, { code: "Enter", key: "Enter" });
    fireEvent.keyDown(window, { code: "Enter", key: "Enter" });
    expect(damagePhoto).toHaveBeenCalledTimes(1);
  });
  it("Retake drops the last photo and takes a new one at once; not while one is on its way", () => {
    const damagePhoto = vi.fn(() => new Promise(() => {}));
    const dropDamagePhoto = vi.fn();
    draw(flagged({ damagePhotos: ["p1.jpg"] }), { damagePhoto, dropDamagePhoto, continueSupervisor: vi.fn() });
    fireEvent.click(screen.getByText(/Retake/));
    expect(dropDamagePhoto).toHaveBeenCalledTimes(1);
    expect(damagePhoto).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText(/Retake/));
    expect(dropDamagePhoto).toHaveBeenCalledTimes(1);   // the first is still on its way: the photo it replaced is not dropped too
  });
});
