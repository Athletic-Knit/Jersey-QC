import { describe, it, expect } from "vitest";
import { buildDamageRows, DAMAGE_COLUMNS } from "../damage.js";
import { normBox } from "../vision.js";
import { trimPhotos } from "../persist.js";

describe("damage report rows", () => {
  const ledger = [
    { id: 1, t: "2026-10-20 09:10:00", status: "pass",    station: "st-line1", order: "41", operator: "Sam", number: "5",  name: "" },
    { id: 2, t: "2026-10-20 09:12:30", status: "flagged", station: "st-line1", order: "41", operator: "Sam", number: "22", name: "HUNTER", team: "red", size: "Y-XL", reason: "Stitching or seam", photo: "data:image/jpeg;base64,AAA" },
    { id: 3, t: "2026-10-20 09:05:00", status: "flagged", station: "st-line2", order: "42", operator: "Lee", number: "88", name: "", team: "", size: "", reason: "Not on roster", offRoster: true, resolution: "Not ours" },
    { id: 4, t: "2026-10-20 09:20:00", status: "manual",  station: "st-line1", order: "41", operator: "Sam", number: "9",  name: "SEICH" },
  ];
  it("keeps flagged events only, oldest first, with station labels and the photo", () => {
    const rows = buildDamageRows(ledger, { stationLabel: id => id.replace("st-", "").toUpperCase() });
    expect(rows.map(r => r.number)).toEqual(["88", "22"]);
    expect(rows[1]).toMatchObject({ date: "2026-10-20", time: "09:12:30", station: "LINE1", order: "41", operator: "Sam", name: "HUNTER", team: "red", size: "Y-XL", status: "FLAGGED", reason: "Stitching or seam", photo: "data:image/jpeg;base64,AAA" });
    expect(rows[0]).toMatchObject({ status: "NOT ON ROSTER", resolution: "Not ours", photo: null });
  });
  it("reads a station log entry (match / detected / timestamp) too", () => {
    const log = [
      { id: 9, timestamp: "2026-10-20 10:00:00", status: "flagged", match: { number: "31", name: "RINE", team: "green", size: "A-3XL" }, reason: "Missing or wrong logo", photo: "data:image/jpeg;base64,BBB", operator: "Sam" },
      { id: 8, timestamp: "2026-10-20 09:59:00", status: "flagged", match: null, detected: { number: "7", name: "" }, reason: "Flagged by operator" },
    ];
    const rows = buildDamageRows(log, { operatorName: "Sam", orderNumber: "41" });
    expect(rows.map(r => r.number)).toEqual(["7", "31"]);
    expect(rows[1]).toMatchObject({ order: "41", operator: "Sam", name: "RINE", team: "green", photo: "data:image/jpeg;base64,BBB" });
  });
  it("has a column for every field", () => {
    expect(DAMAGE_COLUMNS.length).toBe(15);
  });
  it("carries the damage photos the operator took, from a ledger event or a station log entry", () => {
    const rows = buildDamageRows([
      { id: 1, t: "2026-10-20 09:00:00", status: "flagged", photo: "data:image/jpeg;base64,AAA", damagePhotos: ["data:image/jpeg;base64,D1", null, "data:image/jpeg;base64,D2"] },
      { id: 2, timestamp: "2026-10-20 09:01:00", status: "flagged", match: { number: "4" }, photo: null },
    ]);
    expect(rows[0].damagePhotos).toEqual(["data:image/jpeg;base64,D1", "data:image/jpeg;base64,D2"]);
    expect(rows[1]).toMatchObject({ photo: null, damagePhotos: [] });
  });
  it("carries the jersey type, from the event or the order, through a label", () => {
    const rows = buildDamageRows([{ id: 1, t: "2026-10-20 09:00:00", status: "flagged", jerseyType: "sublimated" }, { id: 2, t: "2026-10-20 09:01:00", status: "flagged" }], { jerseyType: "echl", typeLabel: t => ({ echl: "ECHL", sublimated: "Sublimated" })[t] || "" });
    expect(rows.map(r => r.type)).toEqual(["Sublimated", "ECHL"]);
  });
});

describe("station use from a hub answer", () => {
  it("live from another browser = in use; own browser or stale = free", async () => {
    const { stationUse } = await import("../hub.js");
    const now = 1_000_000;
    const a = { now, stations: [
      { id: "st-station1", operatorName: "Shiv",    updatedAt: now - 3000,  browserId: "b-other" },
      { id: "st-station2", operatorName: "Mansuri", updatedAt: now - 3000,  browserId: "b-me" },
      { id: "st-station3", operatorName: "Old",     updatedAt: now - 60000, browserId: "b-other" },
    ] };
    const u = stationUse(a, "b-me");
    expect(u["st-station1"]).toMatchObject({ live: true,  mine: false, operator: "Shiv" });
    expect(u["st-station2"]).toMatchObject({ live: true,  mine: true });
    expect(u["st-station3"]).toMatchObject({ live: false, mine: false });
  });
});

describe("order numbers hint", () => {
  it("lists the open numbers once, sorted, and says never to pick from the list", async () => {
    const { orderNumbersHint } = await import("../vision.js");
    const h = orderNumbersHint(["40", "5", "35", "5", "", null, "22"]);
    expect(h).toMatch(/Numbers on this order: 5, 22, 35, 40\./);
    expect(h).toMatch(/never pick from this list/);
    expect(orderNumbersHint([])).toBe("");
  });
});

describe("jersey box from the model", () => {
  it("accepts fractions, scales percentages, rejects nonsense", () => {
    expect(normBox([0.1, 0.2, 0.9, 0.95])).toEqual([0.1, 0.2, 0.9, 0.95]);
    expect(normBox([10, 20, 90, 95])).toEqual([0.1, 0.2, 0.9, 0.95]);
    expect(normBox([0.5, 0.5, 0.5, 0.5])).toBeNull();
    expect(normBox("whole")).toBeNull();
    expect(normBox([0, 0, 1.4, 1])).toEqual([0, 0, 1, 1]);
  });
});

describe("photo budget in the saved session", () => {
  it("keeps photos on the newest N flagged entries only", () => {
    const log = Array.from({ length: 5 }, (_, i) => ({ id: i, status: "flagged", photo: "p" + i }));
    const out = trimPhotos(log, 2);
    expect(out.map(l => l.photo)).toEqual(["p0", "p1", null, null, null]);
    expect(trimPhotos(log, 0).every(l => l.photo === null)).toBe(true);
  });
  it("counts an entry with only damage photos, and drops them with the scan photo", () => {
    const log = [{ id: 1, status: "flagged", photo: null, damagePhotos: ["d"] }, { id: 2, status: "flagged", photo: "p", damagePhotos: ["d", "d"] }, { id: 3, status: "pass" }];
    expect(trimPhotos(log, 1)).toEqual([{ id: 1, status: "flagged", photo: null, damagePhotos: ["d"] }, { id: 2, status: "flagged", photo: null, damagePhotos: [] }, { id: 3, status: "pass" }]);
  });
});
