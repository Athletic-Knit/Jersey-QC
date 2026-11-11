// A 500-jersey order must still save: thumbnails (~7 KB a scan) alone pass
// the budget, and a save that fails leaves an old copy of the order on disk.
import { describe, it, expect, beforeEach } from "vitest";

const store = new Map();
let quota = 5_200_000;
globalThis.window = { location: { search: "?station=station1" } };
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => {
    const others = [...store].filter(([x]) => x !== k).reduce((t, [x, y]) => t + x.length + y.length, 0);
    if (others + k.length + String(v).length > quota) throw new Error("QuotaExceededError");
    store.set(k, String(v));
  },
  removeItem: k => store.delete(k),
};
const { saveSession, loadSession, sessionBody, trimThumbs } = await import("../persist.js");

const thumb = "data:image/jpeg;base64," + "A".repeat(6700);
const photo = "data:image/jpeg;base64," + "B".repeat(47000);
const order = (n, flags = 40, run = 1) => {
  const roster = Array.from({ length: n }, (_, i) => ({ _id: i, name: `PLAYER ${i}`, number: String(i % 100), team: "Navy", size: "A-L", scanned: "pass" }));
  const log = Array.from({ length: n + flags }, (_, i) => ({
    id: 1e12 + i, status: i < flags ? "flagged" : "pass", timestamp: "2026-11-12 09:00:00", operator: "Pat", reason: i < flags ? "Loose stitching" : "",
    match: roster[i % n], thumb, ...(i < flags ? { photo, damagePhotos: [photo] } : {}),
    detected: { name: `PLAYER ${i}`, number: "7", usage: { input_tokens: 1158, output_tokens: 102, cache_creation: { ephemeral_5m_input_tokens: 1828 } } },
  }));
  return { sessionStarted: true, orderNumber: "500", orderRun: run, roster, log, binMap: { navy: 1 }, closedBins: [] };
};

describe("saving a big order", () => {
  beforeEach(() => { store.clear(); quota = 5_200_000; });
  it("a 500-jersey order with 40 flags saves, inside the budget, with every row and every log line", () => {
    const s = order(500);
    expect(JSON.stringify(s).length).toBeGreaterThan(5_200_000);          // as it is, it could not be stored
    expect(saveSession(s)).toBe(true);
    const back = loadSession();
    expect(sessionBody(s).length).toBeLessThanOrEqual(3_500_000);
    expect(back.roster.length).toBe(500);
    expect(back.log.length).toBe(540);
    expect(back.log.every(l => l.match && l.status && l.timestamp)).toBe(true);
    expect(back.log.filter(l => l.thumb).length).toBe(60);                // the newest 60 keep their thumbnail
    expect(back.log[0].thumb).toBe(thumb);
  });
  it("a small order keeps everything", () => {
    const s = order(30, 2, 2);
    expect(saveSession(s)).toBe(true);
    const back = loadSession();
    expect(back.log.every(l => l.thumb)).toBe(true);
    expect(back.log.filter(l => l.photo).length).toBe(2);
  });
  it("1200 jerseys still save", () => {
    expect(saveSession(order(1200, 60, 3))).toBe(true);
    expect(loadSession().log.length).toBe(1260);
  });
  it("says so when the storage is full, and keeps the last good copy", () => {
    expect(saveSession(order(30, 2, 4))).toBe(true);
    quota = 1000;
    expect(saveSession(order(31, 2, 4))).toBe(false);
    expect(loadSession().roster.length).toBe(30);
  });
  it("trimThumbs keeps what a resume needs", () => {
    const l = trimThumbs(order(3, 0).log, 1);
    expect(l[0].thumb).toBe(thumb);
    expect(l[2].thumb).toBe(null);
    expect(l[2].detected.usage).toBeUndefined();
    expect(l[2].detected.number).toBe("7");
    expect(l[2].match._id).toBe(2);
  });
});
