// @vitest-environment jsdom
// Smoke tests of the whole station screen (App.jsx), the way an operator uses
// it: the code review of 23 Nov 2026 found App.jsx had no tests at all. Only
// what a browser in a test cannot do is stood in for: the camera's read (the
// model), the sounds, the image resizing and the hub server. Everything else is
// the real app: the matcher, the result screens, the checklist, the roster.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act, cleanup } from "@testing-library/react";

// The camera's read: each scan takes the next one queued here.
const reads = [];
vi.mock("../lib/vision.js", async orig => ({
  ...(await orig()),
  readJersey: vi.fn(async () => reads.shift() || { jersey_present: false, name: "", number: "" }),
}));
vi.mock("../lib/audio.js", () => ({ playTone: () => {} }));
// No canvas in a test browser: pictures pass through unchanged.
vi.mock("../lib/persist.js", async orig => ({
  ...(await orig()),
  shrinkDataUrl: async u => u, cropDataUrl: async u => u, frameForUpload: async u => String(u).split(",")[1],
  rotateDataUrl: async u => u, downscaleImage: () => "data:image/jpeg;base64,AAAA",
}));

import { createElement } from "react";
import App from "../App.jsx";
import { saveSignIn, saveSession } from "../lib/persist.js";

// The hub: every call answers, and is remembered.
let hubCalls = [];
beforeEach(() => {
  localStorage.clear(); reads.length = 0; hubCalls = [];
  globalThis.fetch = vi.fn(async (url, opts = {}) => {
    hubCalls.push({ url: String(url), method: opts.method || "GET", body: opts.body ? JSON.parse(opts.body) : null });
    return { ok: true, status: 200, json: async () => ({ ok: true, ids: [], taken: [], stations: [], rosters: [], orders: [], boxes: [] }) };
  });
  // A picture "loads" at once (a test browser never loads one).
  globalThis.Image = class { set src(v) { this._src = v; setTimeout(() => this.onload?.(), 0); } get src() { return this._src; } };
  Element.prototype.scrollIntoView = () => {};
  document.documentElement.requestFullscreen = () => Promise.resolve();
});
afterEach(() => cleanup());

const roster = [
  { _id: 0, name: "Smith", number: "12", team: "Navy", size: "A-L", scanned: false },
  { _id: 1, name: "Jones", number: "7", team: "Navy", size: "A-M", scanned: false },
];
const order = (extra = {}) => ({ sessionStarted: true, role: "inspector", roster, rosterFile: "smoke.csv", orderNumber: "999100", orderRun: 1000, operatorName: "Pat", notes: "", jerseyType: "", log: [], binMap: { "*": "1.1", __by: "all" }, closedBins: [], shipWith: [], carried: [], boxLabelled: ["1.1"], ...extra });
const read = (number, name) => ({ jersey_present: true, orientation: "upright", name, number, jersey_colour: "navy", trim_colour: "", obstruction: "", laid_flat: true, number_position: "centre", name_complete: true, number_complete: true, sleeve_numbers: [] });
const pressEnter = () => act(() => { fireEvent.keyDown(window, { key: "Enter", code: "Enter" }); });

// Signed in at this station with an order left open: the app offers to resume it.
async function resumeOrder(extra) {
  saveSignIn({ role: "inspector", name: "Pat" });
  saveSession(order(extra));
  render(createElement(App));
  fireEvent.click(await screen.findByRole("button", { name: /resume/i }));
  await screen.findByText("Smith");
}

describe("the station screen", () => {
  it("resumes an order left open on this station", async () => {
    await resumeOrder();
    expect(screen.getByText("Jones")).toBeTruthy();
    expect(screen.getByDisplayValue("999100")).toBeTruthy();
  });

  it("scan → green → the checklist → Confirm passes the jersey", async () => {
    await resumeOrder();
    reads.push(read("12", "SMITH"));
    fireEvent.click(screen.getByRole("button", { name: /upload/i }));
    const input = document.querySelector('input[type="file"][accept="image/*"]');
    await act(async () => { fireEvent.change(input, { target: { files: [new File(["x"], "jersey.jpg", { type: "image/jpeg" })] } }); });
    // The green screen, with the checks to tick before Confirm (the first jerseys of an order are inspected fully).
    await screen.findByText(/Confirm · \d+ to check/);
    for (let i = 0; i < 10 && screen.queryByText(/to check/); i++) await pressEnter();   // the Select key (the pedal) ticks the next check
    await pressEnter();                                                                // …then confirms
    await waitFor(() => expect(screen.getAllByText(/^1 Pass$/).length).toBeGreaterThan(0));
  });

  it("Finish order on a ship-with order leaves the box open on the hub, and New order waits for the hub", async () => {
    // One jersey passed, so Box 1.1 has something in it to leave open.
    await resumeOrder({ shipWith: ["999101"], roster: [{ ...roster[0], scanned: "pass" }, roster[1]] });
    fireEvent.click(screen.getByRole("button", { name: /🏁 finish order/i }));
    // Leave the box open for the order it ships with, then finish.
    const leave = await screen.findAllByRole("button", { name: /leave open/i });
    fireEvent.click(leave[0]);
    fireEvent.click(screen.getByRole("button", { name: /✓ Finish order/ }));
    await screen.findByText(/Order 999100 is done/);
    const left = hubCalls.find(c => c.url.includes("/api/hub/openboxes") && c.method === "POST");
    expect(left?.body).toMatchObject({ order: "999100", run: 1000, station: expect.any(String), boxes: [expect.objectContaining({ bin: "1.1", orders: expect.arrayContaining(["999100", "999101"]) })] });
    const reportsBefore = hubCalls.filter(c => c.url.includes("/api/hub/stations/")).length;
    fireEvent.click(screen.getByRole("button", { name: /new order/i }));
    await screen.findByText(/Set up the order/);
    expect(hubCalls.filter(c => c.url.includes("/api/hub/stations/")).length).toBeGreaterThan(reportsBefore);   // the last report went first (M16)
  });
});
