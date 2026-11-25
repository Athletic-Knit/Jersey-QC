// @vitest-environment jsdom
// The board's order view has the summary as the operator sees it (25 Nov 2026):
// a Summary tab, first, drawn by the same OrderSummaryBody as the station's
// summary screen, from the hub's record of the order and its flag events.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { createElement } from "react";

const rec = {
  station: "st-1", order: "264247", run: 1, operator: "Ann", lastSeen: 2, counts: { total: 4, pass: 2, flag: 1, manual: 0, remaining: 1 },
  rows: [
    { _id: 1, number: "7",  name: "SMITH", team: "Navy", size: "A-L", scanned: "pass" },
    { _id: 2, number: "12", name: "LEACH", team: "Navy", size: "A-M", scanned: "pass" },
    { _id: 3, number: "23", name: "JONES", team: "Navy", size: "A-S", scanned: "flag" },
    { _id: 4, number: "30", name: "DAVIS", team: "Navy", size: "A-XL", scanned: "" },
  ],
  bins: { Navy: "1.1", __by: "all" }, closedBins: [],
  binSummary: [{ bin: "1.1", label: "Navy", count: 2, box: "Small box", open: true }],
};
const events = [
  { id: 1, t: "2026-11-25T09:00:00", station: "st-1", order: "264247", run: 1, status: "pass", rowId: 1 },
  { id: 2, t: "2026-11-25T09:00:30", station: "st-1", order: "264247", run: 1, status: "pass", rowId: 2 },
  { id: 3, t: "2026-11-25T09:01:00", station: "st-1", order: "264247", run: 1, status: "flagged", rowId: 3, number: "23", name: "JONES", reason: "Twill peeling" },
];
vi.mock("../lib/hub.js", async orig => { const m = await orig(); return { ...m, hub: { ...m.hub, ledger: async () => ({ orders: [rec], events }) } }; });
import { OrderView } from "../App.jsx";

afterEach(cleanup);
describe("the board's order view: Summary tab", () => {
  it("is the first tab and shows Passed with its box, Failed with its reason, Unscanned, the boxes and the rates", async () => {
    render(createElement(OrderView, { station: "st-1", order: "264247", run: 1, stationLabel: s => s, onClose: () => {}, onDownload: () => {} }));
    await waitFor(() => expect(screen.getByText(/Passed · 2/)).toBeTruthy());
    const tabs = screen.getAllByRole("button").map(b => b.textContent).filter(t => /^(Summary|Roster|Problems|Log)/.test(t));
    expect(tabs[0]).toBe("Summary");
    expect(tabs[1]).toMatch(/^Roster/);
    expect(screen.getByText(/Failed · 1/)).toBeTruthy();
    expect(screen.getByText("Twill peeling")).toBeTruthy();
    expect(screen.getByText("Unscanned 1 · Missing 0")).toBeTruthy();   // the column: unscanned and marked missing counted apart (the owner, 25 Nov 2026)
    expect(screen.getByText(/Unscanned · 1/)).toBeTruthy();             // its unscanned half
    expect(screen.getByText(/1 unscanned/)).toBeTruthy();               // the counts line; nothing marked, so no "marked missing"
    expect(screen.queryByText(/marked missing/)).toBeNull();
    expect(screen.getAllByText(/Box 1\.1/).length).toBeGreaterThan(0);   // the boxes strip and the passed rows' box
    expect(screen.getByText(/pass rate/)).toBeTruthy();
    expect(screen.getByText(/1 with the supervisor/)).toBeTruthy();
  });
});
