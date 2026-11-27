// @vitest-environment jsdom
// The STOP patch on the green (the co-op, 27 Nov 2026): picked for the order on
// the order screen; on, the green says what the camera saw below the collar.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { createElement } from "react";

vi.mock("../lib/audio.js", () => ({ playTone: () => {} }));
import { ScanOverlay } from "../App.jsx";

afterEach(cleanup);
const match = { _id: 1, number: "31", name: "", team: "", size: "A-L" };
const draw = ({ stopSign, detected }) => render(createElement(ScanOverlay, {
  state: { mode: "confirm", scan: detected ? { detected } : {}, match },
  actions: { confirm: vi.fn(), retry: vi.fn(), flag: vi.fn() }, binMap: { "*": 1, __by: "all" }, extraCols: [],
  confirmKey: "Enter", cancelKey: "Escape", retryKey: "KeyR", byHandKey: "KeyH", stopSign,
}));
const line = () => screen.queryByTestId("stop-sign")?.textContent || null;

describe("the STOP sign line on the green", () => {
  it("seen", () => { draw({ stopSign: true, detected: { number: "31", stop_sign: "yes" } }); expect(line()).toMatch(/STOP sign ✓/); });
  it("not there", () => { draw({ stopSign: true, detected: { number: "31", stop_sign: "no" } }); expect(line()).toMatch(/NO STOP sign/); });
  it("collar not in view", () => { draw({ stopSign: true, detected: { number: "31", stop_sign: "" } }); expect(line()).toMatch(/could not see the collar/); });
  it("an order without the STOP sign shows nothing", () => { draw({ stopSign: false, detected: { number: "31", stop_sign: "no" } }); expect(line()).toBe(null); });
  it("a typed entry (no camera read) shows nothing", () => { draw({ stopSign: true, detected: null }); expect(line()).toBe(null); });
});
