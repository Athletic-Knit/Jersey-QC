import { describe, it, expect } from "vitest";
import { JERSEY_TYPES, reasonsFor, jerseyTypeLabel, REASONS, STATIONS, stationOf, ROLES } from "../../config.js";

describe("stations", () => {
  it("three stations, each with its own PIN, none equal to the supervisor's", () => {
    expect(STATIONS.map(s => s.label)).toEqual(["Station 1", "Station 2", "Station 3"]);
    const pins = STATIONS.map(s => s.pin);
    expect(new Set(pins).size).toBe(3);
    expect(pins).not.toContain(ROLES.find(r => r.id === "supervisor").pin);
    expect(stationOf("station2").label).toBe("Station 2");
    expect(stationOf("line1")).toBeNull();
  });
});

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

describe("where a flag goes, and its weight on the board", () => {
  it("maps every reason label of every jersey type to its route", async () => {
    const { routeOfReason, severityOf, REASONS_BY_CONSTRUCTION } = await import("../../config.js");
    expect(routeOfReason("Sublimation error")).toBe("Supervisor → full remake");
    expect(routeOfReason("Loose, missing or broken stitching")).toBe("Supervisor → stitcher");
    expect(routeOfReason("Print error — ghosting, fading, misaligned — found after it passed")).toBe("Supervisor → full remake");
    expect(routeOfReason("Not on the roster — operator typed #77 KIM")).toBe("Supervisor → check the order");
    expect(routeOfReason("Duplicate — scanned again after passing")).toBe("Supervisor → check the order");
    expect(routeOfReason("a loose thread on the collar")).toBe("Supervisor decides");
    for (const list of Object.values(REASONS_BY_CONSTRUCTION)) for (const r of list) expect(routeOfReason(r.label)).toBe(r.route);
  });
  it("weighs a remake over decoration over cleaning over a decision", async () => {
    const { severityOf } = await import("../../config.js");
    const w = r => severityOf(r).weight;
    expect(w("Sublimation error")).toBeGreaterThan(w("Missing or wrong logo"));
    expect(w("Missing or wrong logo")).toBeGreaterThan(w("Cleaning not done"));
    expect(w("Cleaning not done")).toBeGreaterThan(w("something odd"));
    expect(severityOf("Sublimation error").tag).toBe("REMAKE");
    expect(severityOf("Stitching or seam").tag).toBe("STITCHER");
    expect(severityOf("").tag).toBe("DECIDE");
  });
});
