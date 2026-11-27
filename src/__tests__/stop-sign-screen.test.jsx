// @vitest-environment jsdom
// The STOP patch on the green (the co-op, 27 Nov 2026): picked for the order on
// the order screen; on, "STOP sign" is a tick check on every green. The camera
// seeing it ticks it by itself; not seen, unsure or typed by hand, the operator
// ticks it and the green turns dark yellow.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { createElement } from "react";

vi.mock("../lib/audio.js", () => ({ playTone: () => {} }));
import { ScanOverlay } from "../App.jsx";

afterEach(cleanup);
const match = { _id: 1, number: "31", name: "", team: "", size: "A-L" };
const quick = { phase: "quick", clean: 2, every: 10, focus: {}, checks: [{ id: "decoration", label: "Decoration", quick: true }] };
const draw = ({ stopSign, detected, inspect = quick, typed = false }) => {
  const confirm = vi.fn();
  const r = render(createElement(ScanOverlay, {
    state: { mode: "confirm", scan: detected ? { detected } : {}, match, ...(typed ? { typed: { number: "31" } } : {}) },
    actions: { confirm, retry: vi.fn(), flag: vi.fn(), editTyped: vi.fn() }, binMap: { "*": 1, __by: "all" }, extraCols: [],
    confirmKey: "Enter", cancelKey: "Escape", retryKey: "KeyR", byHandKey: "KeyH", stopSign, inspect,
  }));
  return { ...r, confirm };
};
const stopTick = () => screen.queryAllByRole("button").find(b => /STOP sign$/.test(b.textContent.trim())) || null;
const line = () => screen.queryByTestId("stop-sign")?.textContent || null;
const bgOf = container => container.innerHTML.includes("var(--k-bg-stop)") ? "yellow" : container.innerHTML.includes("var(--k-bg-green)") ? "green" : "?";

describe("the STOP sign tick on the green", () => {
  it("seen: ticked by itself, the green stays green, Confirm is one press on a quick look", () => {
    const { container, confirm } = draw({ stopSign: true, detected: { number: "31", stop_sign: "yes" } });
    expect(stopTick().getAttribute("aria-pressed")).toBe("true");
    expect(line()).toBe(null);
    expect(bgOf(container)).toBe("green");
    fireEvent.click(screen.getByText("✓ Confirm"));
    expect(confirm).toHaveBeenCalledTimes(1);
  });
  it("not seen: not ticked, dark yellow, Confirm locked until it is ticked", () => {
    const { container, confirm } = draw({ stopSign: true, detected: { number: "31", stop_sign: "no" } });
    expect(stopTick().getAttribute("aria-pressed")).toBe("false");
    expect(line()).toMatch(/No STOP sign seen/);
    expect(bgOf(container)).toBe("yellow");
    expect(screen.getByText(/Confirm · 1 to check/)).toBeTruthy();
    fireEvent.click(stopTick());
    expect(stopTick().getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByText("✓ Confirm"));
    expect(confirm).toHaveBeenCalledTimes(1);
  });
  it("collar not in view: not ticked, dark yellow", () => {
    const { container } = draw({ stopSign: true, detected: { number: "31", stop_sign: "" } });
    expect(stopTick().getAttribute("aria-pressed")).toBe("false");
    expect(line()).toMatch(/could not see the collar/);
    expect(bgOf(container)).toBe("yellow");
  });
  it("typed by hand (no camera read): not ticked, dark yellow", () => {
    const { container } = draw({ stopSign: true, detected: null, typed: true });
    expect(stopTick().getAttribute("aria-pressed")).toBe("false");
    expect(bgOf(container)).toBe("yellow");
  });
  it("on Inspect fully it is one more tick, first in the row", () => {
    draw({ stopSign: true, detected: { number: "31", stop_sign: "no" }, inspect: { phase: "full", remaining: 5, checks: [{ id: "decoration", label: "Decoration" }, { id: "size", label: "Size tag" }] } });
    expect(screen.getByText(/Confirm · 3 to check/)).toBeTruthy();
  });
  it("an order without the STOP sign: no tick, no line, green", () => {
    const { container } = draw({ stopSign: false, detected: { number: "31", stop_sign: "no" } });
    expect(stopTick()).toBe(null);
    expect(line()).toBe(null);
    expect(bgOf(container)).toBe("green");
  });
});
