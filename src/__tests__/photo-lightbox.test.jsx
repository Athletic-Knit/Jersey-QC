// @vitest-environment jsdom
// The supervisor's photo viewer (PhotoLightbox in App.jsx, 25 Nov 2026): fitted
// at first, zooms with the buttons and the keys, walks between a flag's photos
// with a caption, and closes on Esc, the cross or the backdrop.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { createElement } from "react";
import { PhotoLightbox } from "../App.jsx";
import { photoSet } from "../lib/photoset.js";

afterEach(cleanup);
const set = (index = 0) => photoSet("scan.jpg", ["d1.jpg", "d2.jpg"], index, "#12 LEACH · Twill peeling");
const draw = (photo = set(), onClose = vi.fn()) => { render(createElement(PhotoLightbox, { photo, onClose })); return onClose; };
const img = () => document.querySelector("img");

describe("the photo lightbox", () => {
  it("starts fitted on the photo opened, with a caption that says which it is", () => {
    draw(set(2));
    expect(img().getAttribute("src")).toBe("d2.jpg");
    expect(img().style.transform).toContain("scale(1)");
    expect(screen.getByText(/Damage photo 2 of 2 · #12 LEACH · Twill peeling/)).toBeTruthy();
  });
  it("the arrow keys and the buttons walk the flag's photos, round the end", () => {
    draw(set(0));
    expect(screen.getByText(/Scan photo/)).toBeTruthy();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(img().getAttribute("src")).toBe("d1.jpg");
    fireEvent.click(screen.getByTitle("Next photo (→)"));
    expect(img().getAttribute("src")).toBe("d2.jpg");
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(img().getAttribute("src")).toBe("scan.jpg");
  });
  it("+ and − zoom between 1x and 6x, Fit goes back", () => {
    draw();
    const scale = () => Number(/scale\(([\d.]+)\)/.exec(img().style.transform)[1]);
    fireEvent.click(screen.getByTitle("Zoom in (+)"));
    expect(scale()).toBeCloseTo(1.5);
    for (let i = 0; i < 12; i++) fireEvent.click(screen.getByTitle("Zoom in (+)"));
    expect(scale()).toBe(6);
    fireEvent.click(screen.getByTitle("Fit the screen"));
    expect(scale()).toBe(1);
    fireEvent.click(screen.getByTitle("Zoom out (-)"));
    expect(scale()).toBe(1);
  });
  it("a single photo has no arrows; Esc and ✕ close it", () => {
    const onClose = draw(photoSet("only.jpg"));
    expect(screen.queryByTitle("Next photo (→)")).toBeNull();
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(screen.getByTitle("Close (Esc)"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
  it("a plain src (the station's log) still opens", () => {
    draw("x.jpg");
    expect(img().getAttribute("src")).toBe("x.jpg");
  });
});
