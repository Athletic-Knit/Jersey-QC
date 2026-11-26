// @vitest-environment jsdom
// The pick list's tile (CandidateRow in App.jsx): one line, the number first
// and big on every tile, the name and team modest between it and the size,
// and the field that tells the rows apart in amber (the owner, 24 Nov 2026).
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { createElement } from "react";
import { CandidateRow } from "../App.jsx";

afterEach(cleanup);
const AMBER = "#f59e0b";
const tile = (c, diff = [], more = {}) =>
  render(createElement(CandidateRow, { c, diff, extraCols: [], selected: false, disabled: false, accent: AMBER, onClick: () => {}, onHover: () => {}, ...more })).container.firstChild;

describe("CandidateRow", () => {
  it("a nameless row: the number first, the team alone on one line, the size on the right", () => {
    const el = tile({ _id: 1, number: "2", name: "", team: "8U A", size: "Y-S" }, ["team"]);
    expect(el.children[0].textContent).toBe("#2");          // the left zone
    expect(el.children[1].childElementCount).toBe(1);        // the middle: one line, no name
    expect(screen.getByText("8U A").style.color).toBe("rgb(245, 158, 11)");   // what differs is amber
    expect(el.children[2].textContent).toBe("Y-S");
  });
  it("a named row reads NAME · TEAM; when the teams differ only the team is amber, else the name", () => {
    const el = tile({ _id: 2, number: "2", name: "LEACH", team: "10U", size: "Y-L" }, ["name", "team"]);   // a by-team list: some rows named, some not
    expect(el.children[1].textContent).toBe("LEACH · 10U");
    expect(screen.getByText("LEACH").style.color).toBe("");               // the tile's own colour, not amber
    expect(screen.getByText("10U").style.color).toBe("rgb(245, 158, 11)");
    cleanup();
    tile({ _id: 5, number: "2", name: "SMITH", team: "Navy", size: "A-L" }, ["name"]);   // two names on one team
    expect(screen.getByText("SMITH").style.color).toBe("rgb(245, 158, 11)");
    expect(screen.getByText("Navy").style.color).toBe("");
  });
  it("on a by-size order the size box is bigger than the number; on a by-team order they are equal", () => {
    const c = { _id: 6, number: "12", name: "", team: "", size: "L-S" };
    const px = el => el.style.fontSize;
    const by = tile(c, [], { sizeBig: true });
    expect(px(by.children[2])).not.toBe(px(by.children[0]));
    cleanup();
    const team = tile(c);
    expect(px(team.children[2])).toBe(px(team.children[0]));
  });
  it("a passed row is grey with its badge, nothing amber; no number shows a dash", () => {
    const el = tile({ _id: 3, number: "100", name: "", team: "Navy", size: "A-M", scanned: "pass" }, ["team"], { disabled: true });
    expect(el.children[1].textContent).toContain("Already passed");
    expect(screen.getByText("Navy").style.color).toBe("var(--k-ink-4)");   // #64748b in dark (phase 8 tokens)
    const blank = tile({ _id: 4, number: "", name: "", team: "", size: "Y-M" });
    expect(blank.children[0].textContent).toBe("—");
  });
});
