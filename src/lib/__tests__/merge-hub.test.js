// tools/merge-hub-data.mjs: several copies of the hub's data file → one.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { mergeHub, summary, ordersDirOf, bringOrders } from "../../../tools/merge-hub-data.mjs";

const full = {
  stations: { "st-station1": { id: "st-station1", updatedAt: 100, orderNumber: "25" } },
  rosters: { r1: { id: "r1", orderNumber: "25" } },
  ledger: {
    "2026-11-10": { events: { "st-station1|1": { id: 1, status: "pass", t: "2026-11-10 09:00:00" } }, orders: { "st-station1|25|1": { order: "25", lastSeen: 50, counts: { pass: 1 } } } },
    "2026-11-17": { events: { "st-station1|7": { id: 7, status: "flagged", reason: "Twill peeling", photo: "PHOTO" } }, orders: { "st-station1|25|9": { order: "25", lastSeen: 90, counts: { pass: 3 } } } },
  },
  boxAnswers: [{ at: 1, station: "st-station1", order: "25", bin: "1.1", box: "small" }],
};
const small = {
  stations: { "st-station1": { id: "st-station1", updatedAt: 200, orderNumber: "256021" }, "st-station3": { id: "st-station3", updatedAt: 150 } },
  rosters: {},
  ledger: {
    "2026-11-17": {
      events: { "st-station1|7": { id: 7, status: "flagged", reason: "Twill peeling", resolution: "Sent to decoration" }, "st-station3|2": { id: 2, status: "pass" } },
      orders: { "st-station1|25|9": { order: "25", lastSeen: 60, counts: { pass: 2 } }, "st-station3|256021|5": { order: "256021", lastSeen: 300 } },
    },
  },
  boxAnswers: [{ at: 1, station: "st-station1", order: "25", bin: "1.1", box: "small" }, { at: 2, station: "st-station3", order: "256021", bin: "4.1", box: "large" }],
};

describe("putting copies of the hub's data back into one", () => {
  const m = mergeHub([full, small]);
  it("keeps every day, every scan and every order from both copies", () => {
    expect(Object.keys(m.ledger)).toEqual(["2026-11-10", "2026-11-17"]);
    expect(Object.keys(m.ledger["2026-11-17"].events).sort()).toEqual(["st-station1|7", "st-station3|2"]);
    expect(Object.keys(m.ledger["2026-11-17"].orders).length).toBe(2);
    expect(m.ledger["2026-11-10"].events["st-station1|1"].status).toBe("pass");
  });
  it("the same scan in two copies: the later copy's words, the photo from whichever has it", () => {
    const ev = m.ledger["2026-11-17"].events["st-station1|7"];
    expect(ev.resolution).toBe("Sent to decoration");
    expect(ev.photo).toBe("PHOTO");
    const back = mergeHub([small, full]).ledger["2026-11-17"].events["st-station1|7"];
    expect(back.photo).toBe("PHOTO");
    expect(back.resolution).toBe("Sent to decoration");          // a resolution is never lost to a copy that lacks it
  });
  it("the same order or station in two copies: the one seen last", () => {
    expect(m.ledger["2026-11-17"].orders["st-station1|25|9"].counts.pass).toBe(3);
    expect(m.stations["st-station1"].orderNumber).toBe("256021");
    expect(Object.keys(m.stations).sort()).toEqual(["st-station1", "st-station3"]);
  });
  it("box answers once each, rosters kept, and odd input ignored", () => {
    expect(m.boxAnswers.map(a => a.at)).toEqual([1, 2]);
    expect(m.rosters.r1.orderNumber).toBe("25");
    expect(mergeHub([null, undefined, 7, full]).ledger["2026-11-10"]).toBeTruthy();
    expect(mergeHub([])).toEqual({ stations: {}, rosters: {}, ledger: {}, boxAnswers: [] });
  });
  it("says what a file holds in one line", () => {
    expect(summary(m)).toBe("2 days (2026-11-10 to 2026-11-17), 3 orders, 3 scans, 2 stations, 2 box answers");
  });
});

// Unfinished orders and open boxes came after the tool (code review, 23 Nov 2026).
describe("parts of the file newer than the tool", () => {
  const old = {
    stations: {}, ledger: {},
    unfinished: { u1: { id: "u1", order: "25", updatedAt: 500, done: 3 }, u2: { id: "u2", order: "26", updatedAt: 100 } },
    openBoxes: { b1: { id: "b1", bin: "1.1", at: 100 }, b2: { id: "b2", bin: "2.1", at: 100, takenBy: { station: "st-station2", at: 900 } } },
    settings: { from: "old" }, onlyOld: 1,
  };
  const live = {
    stations: {}, ledger: {},
    unfinished: { u1: { id: "u1", order: "25", updatedAt: 400, done: 1 }, u3: { id: "u3", order: "27", updatedAt: 50 } },
    openBoxes: { b2: { id: "b2", bin: "2.1", at: 100 }, b3: { id: "b3", bin: "3.1", at: 50 } },
    settings: { from: "live" },
  };
  const m = mergeHub([old, live]);
  it("unfinished orders: every id from every copy, the newest change winning", () => {
    expect(Object.keys(m.unfinished).sort()).toEqual(["u1", "u2", "u3"]);
    expect(m.unfinished.u1.done).toBe(3);
  });
  it("open boxes: every id, a box taken later winning over the same box still open", () => {
    expect(Object.keys(m.openBoxes).sort()).toEqual(["b1", "b2", "b3"]);
    expect(m.openBoxes.b2.takenBy.station).toBe("st-station2");
  });
  it("anything else: the latest copy's, and a part only an older copy has is kept", () => {
    expect(m.settings.from).toBe("live");
    expect(m.onlyOld).toBe(1);
  });
  it("a tie goes to the later copy (the live file is passed last)", () => {
    const a = { unfinished: { u: { id: "u", updatedAt: 1, who: "a" } } }, b = { unfinished: { u: { id: "u", updatedAt: 1, who: "b" } } };
    expect(mergeHub([a, b]).unfinished.u.who).toBe("b");
  });
  it("the one-line summary counts them", () => {
    expect(summary(m)).toBe("0 days, 0 orders, 0 scans, 0 stations, 0 box answers, 3 unfinished orders, 3 open boxes");
  });
});

describe("the whole orders beside the data file (hub-orders)", () => {
  const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "merge-orders-"));
  it("the folder is named after the data file, as the hub names it", () => {
    expect(path.basename(ordersDirOf("data/hub.json"))).toBe("hub-orders");
    expect(path.basename(ordersDirOf("data/hub-test.json"))).toBe("hub-test-orders");
  });
  it("merged in place: left where it is, and said so", () => {
    const d = tmp();
    fs.mkdirSync(path.join(d, "hub-orders")); fs.writeFileSync(path.join(d, "hub-orders", "a.json"), "{}");
    const lines = bringOrders([path.join(d, "hub-AK-NB-165-2.json"), path.join(d, "hub.json")], path.join(d, "hub.json"));
    expect(lines.join("\n")).toMatch(/merged in place, the 1 file in .* stay where they are/);
  });
  it("written to another folder: copied across, a newer file there kept", () => {
    const from = tmp(), to = tmp();
    fs.mkdirSync(path.join(from, "hub-orders")); fs.mkdirSync(path.join(to, "hub-orders"));
    fs.writeFileSync(path.join(from, "hub-orders", "a.json"), '{"a":1}');
    fs.writeFileSync(path.join(from, "hub-orders", "b.json"), '{"b":"old"}');
    fs.writeFileSync(path.join(from, "hub-orders", "c.json.tmp"), "half");
    fs.writeFileSync(path.join(to, "hub-orders", "b.json"), '{"b":"new"}');
    const past = new Date(Date.now() - 60000); fs.utimesSync(path.join(from, "hub-orders", "b.json"), past, past);
    const lines = bringOrders([path.join(from, "hub.json")], path.join(to, "hub.json"));
    expect(lines.join("\n")).toMatch(/1 file copied from .* \(1 already there as new or newer, kept\)/);
    expect(fs.readFileSync(path.join(to, "hub-orders", "a.json"), "utf8")).toBe('{"a":1}');
    expect(fs.readFileSync(path.join(to, "hub-orders", "b.json"), "utf8")).toBe('{"b":"new"}');
    expect(fs.existsSync(path.join(to, "hub-orders", "c.json.tmp"))).toBe(false);
  });
  it("no folder at all: says there is nothing to bring", () => {
    expect(bringOrders([path.join(tmp(), "hub.json")], path.join(tmp(), "hub.json"))[0]).toMatch(/nothing to bring over/);
  });
});
