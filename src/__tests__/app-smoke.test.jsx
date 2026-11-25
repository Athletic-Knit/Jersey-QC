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
import { garmentView, toView } from "../lib/garments.js";

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
async function resumeOrder(extra, role = "inspector") {
  saveSignIn({ role, name: "Pat" });
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

  // The Packing screen (the owner, 25 Nov 2026): the Now strip, Print list without closing, no second list at Finish.
  it("Packing: keep scanning, then Print list leaves the box open, says List printed and Finish prints no second list", async () => {
    await resumeOrder({ roster: [{ ...roster[0], scanned: "pass" }, roster[1]] });
    fireEvent.click(screen.getByRole("button", { name: /📦 Packing/ }));
    await screen.findByText(/Now: keep scanning · 1 to go/);
    pressEnter();   // the pedal does nothing here
    expect(screen.getByText(/Now: keep scanning/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: /^Close/ })[0]);
    // Jones passes: every jersey accounted for.
    cleanup(); hubCalls.length = 0;
    await resumeOrder({ roster: [{ ...roster[0], scanned: "pass" }, { ...roster[1], scanned: "pass" }] });
    fireEvent.click(screen.getByRole("button", { name: /📦 Packing/ }));
    await screen.findByText(/Now: print the box lists and seal the boxes/);
    fireEvent.click(screen.getByRole("button", { name: /🖨 Print list$/ }));
    fireEvent.click(await screen.findByRole("button", { name: /just print/i }));
    await screen.findByText(/✓ List printed · 2 pcs/);
    expect(screen.getByText(/Now: finish the order/)).toBeTruthy();
    const prints = hubCalls.filter(c => c.url.includes("/api/hub/print"));
    expect(prints.length).toBe(1);
    expect(prints[0].body.kind).toBe("binlist");
    expect(screen.getByRole("button", { name: /🖨 Print again/ })).toBeTruthy();   // the box is still open
    fireEvent.click(screen.getAllByRole("button", { name: /🏁 Finish order/ })[0]);
    fireEvent.click(await screen.findByRole("button", { name: /✓ Finish order/ }));
    await screen.findByText(/Order 999100 is done/);
    // Finish order printed the summary's count label and nothing of Box 1.1: its list was out already.
    const later = hubCalls.filter(c => c.url.includes("/api/hub/print")).slice(1).flatMap(c => c.body.labels);
    expect(later.length).toBeGreaterThan(0);
    expect(later.every(l => l.summary)).toBe(true);
  });

  // Fixed at the station is still a flag (the owner, 25 Nov 2026): the flag is written, resolved at once,
  // the garment stays as it was and no ticket prints.
  it("Dirt or mark cleaned on a passed jersey: a resolved flag in the log, the row still passed, no ticket", async () => {
    await resumeOrder({ roster: [{ ...roster[0], scanned: "pass" }, roster[1]] });
    const sel = screen.getByText("Smith").closest("tr").querySelector("select");
    fireEvent.change(sel, { target: { value: "flag" } });
    fireEvent.click(await screen.findByText(/Dirt or mark/));
    fireEvent.click(await screen.findByText(/It is clean now/));
    await waitFor(() => expect(screen.queryByText("CLEAN IT NOW")).toBeNull());
    expect(screen.getByText("Smith").closest("tr").querySelector("select").querySelector('option[value="flag"]')).toBeTruthy();   // still passed: it can still be flagged
    fireEvent.click(screen.getByRole("button", { name: /history/i }));
    expect(await screen.findByRole("button", { name: /Flag it/ })).toBeTruthy();   // History lists the garment, still passed
    expect(hubCalls.filter(c => c.url.includes("/api/hub/print") && c.body?.kind === "flag").length).toBe(0);
    const rep = hubCalls.filter(c => c.url.includes("/api/hub/stations/") && c.body?.events).pop();
    expect(rep.body.events.find(e => e.status === "flagged")).toMatchObject({ reason: "Dirt or mark", resolution: "Fixed at the station" });
    expect(rep.body.rows.find(r => r.number === "12")?.status ?? "pass").toMatch(/pass/);
  });

  it("Dirt or mark cleaned before the pass: a resolved flag in the log, then the green carries on and passes", async () => {
    await resumeOrder();
    reads.push(read("12", "SMITH"));
    fireEvent.click(screen.getByRole("button", { name: /upload/i }));
    const input = document.querySelector('input[type="file"][accept="image/*"]');
    await act(async () => { fireEvent.change(input, { target: { files: [new File(["x"], "jersey.jpg", { type: "image/jpeg" })] } }); });
    await screen.findByText(/Confirm · \d+ to check/);
    fireEvent.click(screen.getByRole("button", { name: /^🚩 Flag$/ }));
    fireEvent.click(await screen.findByText(/Dirt or mark/));
    fireEvent.click(await screen.findByText(/It is clean now/));
    await screen.findByText(/Confirm · \d+ to check/);                                   // back on the green
    for (let i = 0; i < 10 && screen.queryByText(/to check/); i++) await pressEnter();
    await pressEnter();
    await waitFor(() => expect(screen.getAllByText(/^1 Pass$/).length).toBeGreaterThan(0));
    expect(hubCalls.filter(c => c.url.includes("/api/hub/print") && c.body?.kind === "flag").length).toBe(0);
    const rep = hubCalls.filter(c => c.url.includes("/api/hub/stations/") && c.body?.events).pop();
    expect(rep.body.events.filter(e => e.status === "flagged")).toEqual([expect.objectContaining({ reason: "Dirt or mark", resolution: "Fixed at the station" })]);
    expect(rep.body.events.some(e => e.status === "pass")).toBe(true);
  });
});

// ── Where is the damage (the plan, 23 Nov 2026) ──────────────────────────────
// A jersey through the camera (the upload button stands in for the camera).
async function scan(r) {
  reads.push(r);
  fireEvent.click(screen.getByRole("button", { name: /upload/i }));
  const input = document.querySelector('input[type="file"][accept="image/*"]');
  await act(async () => { fireEvent.change(input, { target: { files: [new File(["x"], "jersey.jpg", { type: "image/jpeg" })] } }); });
}
// The flag tickets sent to the hub.
const flagPrints = () => hubCalls.filter(c => c.url.includes("/api/hub/print") && c.method === "POST" && c.body?.kind === "flag");
// A tap on the garment at its own 0–1 point: the SVG is given a box on the
// screen exactly its viewBox (a test browser lays nothing out).
function tapGarment(side, x, y, kind = "hockey") {
  const svg = document.querySelector(`svg[data-side="${side}"]`);
  const v = garmentView(kind);
  svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: v.vbW, height: v.vbH, right: v.vbW, bottom: v.vbH, x: 0, y: 0 });
  const [cx, cy] = toView(v, [x, y]);
  fireEvent.click(svg, { clientX: cx, clientY: cy });
}
// Scan #12 SMITH, Flag on the green, pick a reason from the menu.
async function flagWith(reason) {
  await scan(read("12", "SMITH"));
  await screen.findByText(/Confirm · \d+ to check/);
  fireEvent.click(screen.getByRole("button", { name: /🚩 Flag/ }));
  fireEvent.click(await screen.findByText(reason));
}
const wait = ms => act(() => new Promise(r => setTimeout(r, ms)));

describe("where is the damage", () => {
  it("Holes → tap two spots → Done: one flag ticket, with the spots and the garment", async () => {
    await resumeOrder();
    await flagWith("Holes");
    await screen.findByText("Where is the damage?");
    await wait(20);
    expect(flagPrints()).toHaveLength(0);                       // the ticket waits for the spots
    tapGarment("front", 0.5, 0.5);
    tapGarment("back", 0.4, 0.75);
    tapGarment("front", 0.02, 0.98);                            // beside the garment (under the sleeve): no spot
    await screen.findByRole("button", { name: /Done · 2 marked/ });
    expect(screen.getByText(/Front: centre · Back:/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Done · 2 marked/ }));
    await screen.findByText("FLAGGED");
    await waitFor(() => expect(flagPrints()).toHaveLength(1));
    const [label] = flagPrints()[0].body.labels;
    expect(label.garment).toBe("hockey");
    expect(label.spots).toEqual([{ side: "front", x: 0.5, y: 0.5 }, { side: "back", x: 0.4, y: 0.75 }]);
    expect(label.reason).toBe("Holes");
    // The FLAGGED screen shows the marks; Continue goes on as before, and nothing prints again.
    expect(document.querySelectorAll("[data-spot]").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    await wait(50);
    expect(flagPrints()).toHaveLength(1);
  });

  it("a tap on a spot takes it off; Undo takes the last off; at most three", async () => {
    await resumeOrder();
    await flagWith("Twill peeling");
    await screen.findByText("Where is the damage?");
    for (const y of [0.4, 0.5, 0.6, 0.7]) tapGarment("front", 0.5, y);
    await screen.findByRole("button", { name: /Done · 3 marked/ });
    await wait(450);                                            // past the double-tap guard
    fireEvent.click(document.querySelector('[data-spot="2"]'));
    await screen.findByRole("button", { name: /Done · 2 marked/ });
    fireEvent.click(screen.getByRole("button", { name: /Undo last mark/ }));
    await screen.findByRole("button", { name: /Done · 1 marked/ });
    fireEvent.click(screen.getByRole("button", { name: /Done · 1 marked/ }));
    await waitFor(() => expect(flagPrints()).toHaveLength(1));
    expect(flagPrints()[0].body.labels[0].spots).toEqual([{ side: "front", x: 0.5, y: 0.4 }]);
  });

  it("Skip (the pedal: it is highlighted first) → one ticket with no spots", async () => {
    await resumeOrder();
    await flagWith("Stitching or seam");
    await screen.findByText("Where is the damage?");
    expect(screen.getByRole("button", { name: /Done · tap the damage/ }).disabled).toBe(true);
    await wait(500);                                            // past the Select key's quiet moment
    await pressEnter();                                         // Select runs Skip
    await screen.findByText("FLAGGED");
    await waitFor(() => expect(flagPrints()).toHaveLength(1));
    expect(flagPrints()[0].body.labels[0].spots).toEqual([]);
    expect(flagPrints()[0].body.labels[0].garment).toBe("hockey");
  });

  it("Esc is Skip", async () => {
    await resumeOrder();
    await flagWith("Logo or crest");
    await screen.findByText("Where is the damage?");
    await act(() => { fireEvent.keyDown(window, { key: "Escape", code: "Escape" }); });
    await screen.findByText("FLAGGED");
    await waitFor(() => expect(flagPrints()).toHaveLength(1));
  });

  it("the pedal on the step never scans: it skips", async () => {
    await resumeOrder();
    await flagWith("Holes");
    await screen.findByText("Where is the damage?");
    reads.push(read("7", "JONES"));
    await pressEnter();                                         // at once: ignored (a double press on the reason), and no scan
    await wait(20);
    expect(screen.getByText("Where is the damage?")).toBeTruthy();
    await wait(500);
    await pressEnter();                                         // the scan key is the Select key: here it runs Skip
    await screen.findByText("FLAGGED");
    await wait(50);
    expect(reads).toHaveLength(1);                              // no read was asked for
  });

  it("Others never asks where, and its ticket still draws the order's garment", async () => {
    await resumeOrder({ garment: "pants" });
    await flagWith("Others");
    await screen.findByText("FLAGGED");
    expect(screen.queryByText("Where is the damage?")).toBeNull();
    await waitFor(() => expect(flagPrints()).toHaveLength(1));
    expect(flagPrints()[0].body.labels[0].spots).toEqual([]);
    expect(flagPrints()[0].body.labels[0].garment).toBe("pants");
  });

  it("a double tap on one point leaves the spot (the second tap does not take it off)", async () => {
    await resumeOrder();
    await flagWith("Holes");
    await screen.findByText("Where is the damage?");
    tapGarment("front", 0.5, 0.5);
    await screen.findByRole("button", { name: /Done · 1 marked/ });
    fireEvent.click(document.querySelector('[data-spot="1"]'));   // the second tap of a double tap lands on the new dot
    await wait(20);
    expect(screen.getByRole("button", { name: /Done · 1 marked/ })).toBeTruthy();
  });

  it("the buttons stay in place when the first spot goes on: Done, Skip, Undo", async () => {
    await resumeOrder();
    await flagWith("Holes");
    await screen.findByText("Where is the damage?");
    const names = () => screen.getAllByRole("button").map(b => b.textContent).map(t => (/Done ·/.test(t) ? "done" : /Skip — no mark/.test(t) ? "skip" : /Undo last mark/.test(t) ? "undo" : null)).filter(Boolean);
    expect(names()).toEqual(["done", "skip", "undo"]);
    expect(screen.getByRole("button", { name: /Undo last mark/ }).disabled).toBe(true);
    tapGarment("front", 0.5, 0.5);
    await screen.findByRole("button", { name: /Done · 1 marked/ });
    expect(names()).toEqual(["done", "skip", "undo"]);
    await wait(500);
    await pressEnter();                                         // the highlight moved to Done: the pedal finishes
    await waitFor(() => expect(flagPrints()).toHaveLength(1));
    expect(flagPrints()[0].body.labels[0].spots).toHaveLength(1);
  });

  it("while the step is up the left panel's ways out are greyed", async () => {
    await resumeOrder();
    await flagWith("Holes");
    await screen.findByText("Where is the damage?");
    expect(screen.getByRole("button", { name: /Upload & scan/ }).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /Skip — no mark/ }));
    await screen.findByText("FLAGGED");
    await waitFor(() => expect(flagPrints()).toHaveLength(1));
  });

  it("a flag whose step is left another way still prints its ticket, once", async () => {
    // #7 is missing; while #12's step is up, #7 is passed from the roster's Mark menu (Found — pass it):
    // the step is gone and a new entry is on top of the flag.
    await resumeOrder({ roster: [roster[0], { ...roster[1], scanned: "missing" }] });
    await flagWith("Holes");
    await screen.findByText("Where is the damage?");
    const confirm = window.confirm; window.confirm = () => true;
    try {
      const select = screen.getByText("Jones").closest("tr").querySelector("select");
      fireEvent.change(select, { target: { value: "back" } });
    } finally { window.confirm = confirm; }
    await waitFor(() => expect(screen.queryByText("Where is the damage?")).toBeNull());
    await waitFor(() => expect(flagPrints()).toHaveLength(1));
    expect(flagPrints()[0].body.labels[0]).toMatchObject({ reason: "Holes", spots: [], garment: "hockey" });
    await wait(50);
    expect(flagPrints()).toHaveLength(1);
  });

  it("Undo of the last spot, then a pedal press at once, does not Skip", async () => {
    await resumeOrder();
    await flagWith("Holes");
    await screen.findByText("Where is the damage?");
    tapGarment("front", 0.5, 0.5);
    await screen.findByRole("button", { name: /Done · 1 marked/ });
    fireEvent.click(screen.getByRole("button", { name: /Undo last mark/ }));   // the highlight goes back to Skip
    await screen.findByRole("button", { name: /Done · tap the damage/ });
    await pressEnter();                                                         // meant as another Undo: ignored
    await wait(20);
    expect(screen.getByText("Where is the damage?")).toBeTruthy();
    expect(flagPrints()).toHaveLength(0);
  });

  // The step stays up while a roster mark puts a new log line on top of the flag (review round 3).
  for (const [what, extra, pick, finish] of [
    ["Missing on another row, then a spot and Done", {}, "missing", "done"],
    ["Un-check on another passed row, then Skip", { roster: [roster[0], { ...roster[1], scanned: "pass" }] }, "unscan", "skip"],
  ]) {
    it(`${what}: the flag still prints one ticket, with its marks`, async () => {
      await resumeOrder(extra);
      await flagWith("Holes");
      await screen.findByText("Where is the damage?");
      const confirm = window.confirm; window.confirm = () => true;
      try {
        const select = screen.getByText("Jones").closest("tr").querySelector("select");
        fireEvent.change(select, { target: { value: pick } });
      } finally { window.confirm = confirm; }
      await wait(20);
      expect(flagPrints()).toHaveLength(0);
      if (finish === "done") {
        tapGarment("front", 0.5, 0.5);
        fireEvent.click(await screen.findByRole("button", { name: /Done · 1 marked/ }));
      } else fireEvent.click(screen.getByRole("button", { name: /Skip — no mark/ }));
      await screen.findByText("FLAGGED");
      await waitFor(() => expect(flagPrints()).toHaveLength(1));
      expect(flagPrints()[0].body.labels[0]).toMatchObject({ reason: "Holes", garment: "hockey", spots: finish === "done" ? [{ side: "front", x: 0.5, y: 0.5 }] : [] });
      await wait(50);
      expect(flagPrints()).toHaveLength(1);
    });
  }

  it("Finish order and Finish later are greyed while the step is up", async () => {
    await resumeOrder();
    await flagWith("Holes");
    await screen.findByText("Where is the damage?");
    expect(screen.getByRole("button", { name: /🏁 finish order/i }).disabled).toBe(true);
    expect(screen.getByRole("button", { name: /⏸ finish later/i }).disabled).toBe(true);
  });

  for (const [flag, size] of [["🏷 No size tag", null], ["🚩 Not on the roster", "L"], ["🔁 Duplicate", "L"]]) {
    it(`${flag} never asks where`, async () => {
      await resumeOrder();
      await scan(read("88", ""));                                // on no row: red, with Flag
      fireEvent.click(await screen.findByRole("button", { name: /🚩 Flag/ }));
      fireEvent.click(await screen.findByRole("button", { name: flag }));
      if (size) fireEvent.click((await screen.findAllByRole("button", { name: size }))[1]);   // Youth L, Adult L, …: the adult one
      await screen.findByText("FLAGGED");
      expect(screen.queryByText("Where is the damage?")).toBeNull();
      await waitFor(() => expect(flagPrints()).toHaveLength(1));
    });
  }

  it("a sorter never sees it: the only flags are No size tag, Duplicate and Not on the roster", async () => {
    await resumeOrder({ role: "sorter", orderRole: "sorter" }, "sorter");
    await scan(read("12", "SMITH"));
    fireEvent.click(await screen.findByRole("button", { name: /🚩 Flag/ }));
    await screen.findByText("What is wrong?");
    expect(screen.queryByText("Holes")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "🏷 No size tag" }));
    await screen.findByText("FLAGGED");
    expect(screen.queryByText("Where is the damage?")).toBeNull();
  });

  it("an order resumed on the step prints that flag's ticket once, unmarked", async () => {
    const flag = { id: 5000, status: "flagged", match: roster[0], detected: null, reason: "Holes", reasonId: "fabric", locating: true, garment: "hockey", timestamp: "10:00:00" };
    await resumeOrder({ roster: [{ ...roster[0], scanned: "flag" }, roster[1]], log: [flag] });
    await waitFor(() => expect(flagPrints()).toHaveLength(1));
    expect(flagPrints()[0].body.labels[0]).toMatchObject({ reason: "Holes", garment: "hockey", spots: [] });
    await wait(50);
    expect(flagPrints()).toHaveLength(1);
  });

  it("an order resumed with a flag still on the step under a newer line prints it once", async () => {
    const flag = { id: 5000, status: "flagged", match: roster[0], detected: null, reason: "Holes", reasonId: "fabric", locating: true, garment: "hockey", timestamp: "10:00:00" };
    const miss = { id: 5001, status: "undo", match: roster[1], detected: null, reason: "Un-checked", timestamp: "10:00:05" };
    await resumeOrder({ roster: [{ ...roster[0], scanned: "flag" }, roster[1]], log: [miss, flag] });
    await waitFor(() => expect(flagPrints()).toHaveLength(1));
    expect(flagPrints()[0].body.labels[0]).toMatchObject({ reason: "Holes", garment: "hockey", spots: [] });
    await wait(50);
    expect(flagPrints()).toHaveLength(1);
  });

  it("an order resumed with its flag already printed prints nothing", async () => {
    const flag = { id: 5000, status: "flagged", match: roster[0], detected: null, reason: "Holes", reasonId: "fabric", garment: "hockey", spots: [], timestamp: "10:00:00" };
    await resumeOrder({ roster: [{ ...roster[0], scanned: "flag" }, roster[1]], log: [flag] });
    await wait(50);
    expect(flagPrints()).toHaveLength(0);
  });

  it("the order's garment comes back on resume and draws the outline", async () => {
    await resumeOrder({ garment: "pants" });
    await flagWith("Holes");
    await screen.findByText("Where is the damage?");
    tapGarment("front", 0.3, 0.5, "pants");
    fireEvent.click(await screen.findByRole("button", { name: /Done · 1 marked/ }));
    await waitFor(() => expect(flagPrints()).toHaveLength(1));
    expect(flagPrints()[0].body.labels[0].garment).toBe("pants");
  });
});
