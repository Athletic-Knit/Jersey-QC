// The floor's configuration (src/config.js): the stations and their PINs, the
// jersey types and the reasons menu each gets (one short list, Others flags at
// once, the owner, 17 Nov 2026), and where a flag goes and what it weighs on
// the supervisor board.
import { describe, it, expect } from "vitest";
import { JERSEY_TYPES, reasonsFor, jerseyTypeLabel, REASONS, MARK_STAYS, reasonCategory, routeOfReason, severityOf, STATIONS, stationOf, ROLES } from "../../config.js";

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
  // One short list for every order (17 Nov 2026): a stitched order leaves out
  // "Print or colour", a sublimated one leaves out "Twill peeling".
  const ALL_IDS = ["wrong_decoration", "logo", "twill", "print", "stitching", "fabric", "label", "mark", "other"];
  it("one short list: stitched orders get it without print, sublimated without twill", () => {
    const st = reasonsFor("echl").map(r => r.id), sub = reasonsFor("sublimated").map(r => r.id);
    expect(st).toEqual(ALL_IDS.filter(id => id !== "print"));
    expect(sub).toEqual(ALL_IDS.filter(id => id !== "twill"));
    expect(reasonsFor("echl_replica")).toBe(reasonsFor("echl"));
    expect(REASONS.find(r => r.id === "twill").only).toBe("stitched");
    expect(REASONS.find(r => r.id === "print").only).toBe("sublimated");
    expect(REASONS.filter(r => r.only).map(r => r.id)).toEqual(["twill", "print"]);   // the only two that belong to one way of making a jersey
    for (const gone of ["seam", "colour", "sublimation", "cleaning"]) expect(REASONS.map(r => r.id)).not.toContain(gone);   // the old ids
  });
  it("the wording of the menu", () => {
    expect(Object.fromEntries(REASONS.map(r => [r.id, r.label]))).toEqual({
      wrong_decoration: "Name or number", logo: "Logo or crest", twill: "Twill peeling", print: "Sublimation error",
      stitching: "Stitching or seam", fabric: "Holes", label: "Size label", mark: "Dirt or mark", other: "Others",
    });
  });
  it("every menu keeps the in-place option and ends with 'Others', which flags at once: nothing to type (the owner, 17 Nov 2026)", () => {
    for (const t of ["echl", "sublimated", ""]) {
      const rs = reasonsFor(t);
      expect(rs.at(-1).id).toBe("other");
      expect(rs.at(-1).custom).toBeFalsy();
      expect(rs.some(r => r.custom)).toBe(false);
      expect(rs.some(r => r.inPlace)).toBe(true);
      expect(rs.filter(r => r.inPlace).map(r => r.id)).toEqual(["mark"]);
    }
  });
  it("no type → all nine reasons, one per id, in-place and free-text last; labels resolve", () => {
    const all = reasonsFor("");
    expect(reasonsFor("nonsense")).toBe(all);
    const ids = all.map(r => r.id);
    expect(ids.length).toBe(9);
    expect(ids).toEqual(ALL_IDS);
    expect(new Set(ids).size).toBe(ids.length);
    for (const list of [reasonsFor("echl"), reasonsFor("sublimated"), REASONS]) for (const r of list) expect(ids).toContain(r.id);
    expect(ids.slice(-2)).toEqual(["mark", "other"]);
    for (const t of ["echl", "echl_replica"]) expect(reasonsFor(t).map(r => r.label)).not.toContain("Sublimation error");
    expect(reasonsFor("sublimated").map(r => r.label)).toContain("Sublimation error");   // the floor's word: a sublimated order must offer it
    expect(reasonsFor("sublimated").map(r => r.label)).not.toContain("Twill peeling");
    expect(jerseyTypeLabel("echl_replica")).toBe("ECHL replica");
    expect(jerseyTypeLabel("")).toBe("");
  });
  it("no two reasons on any menu share a label or an id", () => {
    for (const t of ["echl", "echl_replica", "sublimated", ""]) {
      const rs = reasonsFor(t);
      expect(new Set(rs.map(r => r.id)).size).toBe(rs.length);
      expect(new Set(rs.map(r => r.label.trim().toLowerCase())).size).toBe(rs.length);
    }
  });
  it("every label is at most 3 words", () => {
    const words = label => label.trim().split(/\s+/).length;
    expect(REASONS.filter(r => words(r.label) > 3).map(r => r.label)).toEqual([]);
  });
  it("dirt that will not come out (MARK_STAYS) is a flag of its own, not on the menu: Cleaning, back to cleaning", () => {
    expect(MARK_STAYS).toMatchObject({ label: "Dirt that will not come out", route: "Supervisor → back to cleaning", cat: "Cleaning" });
    expect(REASONS.map(r => r.label)).not.toContain(MARK_STAYS.label);
    expect(REASONS.map(r => r.id)).not.toContain(MARK_STAYS.id);
    expect(MARK_STAYS.inPlace).toBeFalsy();                         // "Dirt or mark" is cleaned at the station; this one is flagged
    expect(reasonCategory(MARK_STAYS.label)).toBe("Cleaning");
    expect(routeOfReason(MARK_STAYS.label)).toBe("Supervisor → back to cleaning");
    expect(severityOf(MARK_STAYS.label).tag).toBe("CLEANING");
    expect(reasonCategory(`${MARK_STAYS.label} — found after it passed`)).toBe("Cleaning");
  });
});

describe("where a flag goes, and its weight on the board", () => {
  it("maps every reason label of every jersey type to its route", async () => {
    const { REASONS_BY_CONSTRUCTION } = await import("../../config.js");
    expect(routeOfReason("Twill peeling")).toBe("Supervisor → pink slip → decoration");
    expect(routeOfReason("Sublimation error")).toBe("Supervisor → full remake");
    expect(routeOfReason("Print or colour")).toBe("Supervisor → full remake");   // a flag recorded on 17 Nov 2026, when it read so
    expect(routeOfReason("Something else")).toBe("Supervisor decides");
    expect(routeOfReason("Others")).toBe("Supervisor decides");
    expect(routeOfReason("Hole or snag — found after it passed")).toBe("Supervisor → full remake");
    expect(routeOfReason("Not on the roster — operator typed #77 KIM")).toBe("Supervisor → check the order");
    expect(routeOfReason("Duplicate — scanned again after passing")).toBe("Supervisor → check the order");
    expect(routeOfReason("a loose thread on the collar")).toBe("Supervisor decides");
    for (const list of Object.values(REASONS_BY_CONSTRUCTION)) for (const r of list) expect(routeOfReason(r.label)).toBe(r.route);
  });
  // A flag recorded before 17 Nov 2026 carries the old wording: it keeps its
  // route, its tag on the board and its category in the reports.
  it("the wordings used before the short menu still resolve: route, tag and category", () => {
    const old = [
      ["Wrong name, number or team",                 "Supervisor → pink slip → decoration", "DECORATION", "Decoration"],
      ["Missing or wrong logo",                      "Supervisor → pink slip → decoration", "DECORATION", "Decoration"],
      ["Missing, wrong or crooked crest or logo",    "Supervisor → pink slip → decoration", "DECORATION", "Decoration"],
      ["Twill lifting, peeling or torn",             "Supervisor → pink slip → decoration", "DECORATION", "Decoration"],
      ["Print or colour",                            "Supervisor → full remake",            "REMAKE",     "Artwork"],   // the sublimated menu's wording for one day; "Sublimation error" is on the menu again
      ["Something else",                             "Supervisor decides",                  "DECIDE",     "Other"],
      ["Missing, wrong or misplaced logo",           "Supervisor → full remake",            "REMAKE",     "Artwork"],
      ["Print error — ghosting, fading, misaligned", "Supervisor → full remake",            "REMAKE",     "Artwork"],
      ["Colour off, bleeding or streaked",           "Supervisor → full remake",            "REMAKE",     "Artwork"],
      ["Fabric flaw, snag or hole",                  "Supervisor → full remake",            "REMAKE",     "Fabric"],
      ["Loose, missing or broken stitching",         "Supervisor → stitcher",               "STITCHER",   "Sewing"],
      ["Seam, hem or construction",                  "Supervisor → stitcher",               "STITCHER",   "Sewing"],
      ["Wrong or missing size label",                "Supervisor → stitcher",               "STITCHER",   "Label"],
      ["Cleaning not done",                          "Supervisor → back to cleaning",       "CLEANING",   "Cleaning"],
    ];
    for (const [label, route, tag, cat] of old) {
      expect(REASONS.map(r => r.label)).not.toContain(label);       // off the menu …
      expect([label, routeOfReason(label)]).toEqual([label, route]);   // … and still understood
      expect([label, severityOf(label).tag]).toEqual([label, tag]);
      expect([label, reasonCategory(label)]).toEqual([label, cat]);
    }
    expect(routeOfReason("Print error — ghosting, fading, misaligned — found after it passed")).toBe("Supervisor → full remake");
    expect(reasonCategory("Seam, hem or construction — found after it passed")).toBe("Sewing");
    expect(routeOfReason("SUBLIMATION ERROR")).toBe("Supervisor → full remake");   // the label's case does not matter
  });
  it("weighs a remake over decoration over cleaning over a decision", () => {
    const w = r => severityOf(r).weight;
    expect(w("Print or colour")).toBeGreaterThan(w("Logo or crest"));
    expect(w("Logo or crest")).toBeGreaterThan(w("Dirt that will not come out"));
    expect(w("Dirt that will not come out")).toBeGreaterThan(w("something odd"));
    expect(severityOf("Print or colour").tag).toBe("REMAKE");
    expect(severityOf("Hole or snag").tag).toBe("REMAKE");
    expect(severityOf("Twill peeling").tag).toBe("DECORATION");
    expect(severityOf("Stitching or seam").tag).toBe("STITCHER");
    expect(severityOf("Size label").tag).toBe("STITCHER");
    expect(severityOf("").tag).toBe("DECIDE");
    // the same weights for the wordings used before 17 Nov 2026
    expect(w("Sublimation error")).toBeGreaterThan(w("Missing or wrong logo"));
    expect(w("Missing or wrong logo")).toBeGreaterThan(w("Cleaning not done"));
    expect(w("Cleaning not done")).toBeGreaterThan(w("something odd"));
    expect(severityOf("Sublimation error").tag).toBe("REMAKE");
  });
});
