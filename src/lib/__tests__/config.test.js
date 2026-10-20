import { describe, it, expect } from "vitest";
import { JERSEY_TYPES, reasonsFor, jerseyTypeLabel, REASONS } from "../../config.js";

describe("jersey types and their reason menus", () => {
  it("three types: two stitched, one sublimated", () => {
    expect(JERSEY_TYPES.map(t => t.id)).toEqual(["echl", "echl_replica", "sublimated"]);
    expect(JERSEY_TYPES.map(t => t.construction)).toEqual(["stitched", "stitched", "sublimated"]);
  });
  it("stitched orders get twill and stitching reasons, sublimated get print and fabric", () => {
    const st = reasonsFor("echl").map(r => r.id), sub = reasonsFor("sublimated").map(r => r.id);
    expect(st).toEqual(expect.arrayContaining(["twill", "stitching"]));
    expect(st).not.toEqual(expect.arrayContaining(["print"]));
    expect(sub).toEqual(expect.arrayContaining(["print", "colour", "fabric"]));
    expect(sub).not.toEqual(expect.arrayContaining(["twill"]));
    expect(reasonsFor("echl_replica")).toBe(reasonsFor("echl"));
  });
  it("every menu keeps the free-text and in-place options and ends with 'other'", () => {
    for (const t of ["echl", "sublimated", ""]) {
      const rs = reasonsFor(t);
      expect(rs.at(-1).custom).toBe(true);
      expect(rs.some(r => r.inPlace)).toBe(true);
    }
  });
  it("no type → the general list; labels resolve", () => {
    expect(reasonsFor("")).toBe(REASONS);
    expect(reasonsFor("nonsense")).toBe(REASONS);
    expect(jerseyTypeLabel("echl_replica")).toBe("ECHL replica");
    expect(jerseyTypeLabel("")).toBe("");
  });
});
