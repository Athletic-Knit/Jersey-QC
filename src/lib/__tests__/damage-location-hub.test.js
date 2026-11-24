// Where the damage is, after the station (stage 4 of the damage location, 24 Nov
// 2026): the garment and the spots of a flag reach the hub in every report, the
// ledger keeps them across re-sends, the merge tool and the hub's start-up
// clean-up keep them, the Print menu reprints them, the damage report says
// them; and each station has its own ticket roll, with the hub saying how many
// labels really came out.
import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { createHub, fileEvent, normaliseLedger, withMarks } from "../../../hub-plugin.js";
import { mergeHub } from "../../../tools/merge-hub-data.mjs";
import { printerEnv } from "../../../vite.config.js";
import { snapshotOf } from "../hub.js";
import { buildDamageRows, DAMAGE_COLUMNS } from "../damage.js";
import { flagJobs, packFromRecord } from "../printjobs.js";
import { binListLabels, printJob, labelSize } from "../labels.js";

function makeHub(opts = {}) {
  const t = new Date(2026, 10, 24, 10, 0, 0).getTime();
  const hub = createHub({ file: path.join(os.tmpdir(), `hub-marks-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}.json`), now: () => t, ...opts });
  const call = (method, url, body) => new Promise(resolve => {
    const req = new EventEmitter(); req.method = method; req.url = url;
    const res = { statusCode: 200, setHeader() {}, end(s) { resolve({ status: res.statusCode, body: JSON.parse(s) }); } };
    hub.handle(req, res);
    if (body !== undefined) req.emit("data", JSON.stringify(body));
    req.emit("end");
  });
  return { call, state: hub.state };
}
const zebra = [{ name: "ZDesigner ZD411-203dpi ZPL", driver: "ZDesigner ZD411-203dpi ZPL", port: "USB001", status: 0 }];
const fakes = () => {
  const printed = [];
  return { printed, opts: { listPrinters: async () => zebra, print: async (printer, zpl) => { printed.push({ printer, zpl }); } } };
};
const SPOTS = [{ side: "front", x: 0.2, y: 0.3 }, { side: "back", x: 0.5, y: 0.6 }];

describe("each station's ticket roll (JERSEY_FLAG_LABEL_SIZE_STATION1 …)", () => {
  it("printerEnv reads it per station, the id in small letters", () => {
    const env = printerEnv({ JERSEY_FLAG_LABEL_SIZE: "2x1", JERSEY_FLAG_LABEL_SIZE_STATION2: "2x4", JERSEY_FLAG_LABEL_SIZE_Station3: "2x3", JERSEY_FLAG_PRINTER_STATION2: "Zebra 2" });
    expect(env.flagLabelSize).toBe("2x1");
    expect(env.flagLabelSizes).toEqual({ "st-station2": "2x4", "st-station3": "2x3" });
    expect(env.flagPrinters).toEqual({ "st-station2": "Zebra 2" });   // not taken for a printer, nor the other way round
    expect(env.printers).toEqual({});
  });
  it("GET /print says the station's roll, else the hub's; the station id's case does not matter", async () => {
    const { call } = makeHub({ ...fakes().opts, flagLabelSize: "2x1", flagLabelSizes: { "st-station2": "2x4", "ST-Station3": " 2x3 ", "st-station1": "" } });
    expect((await call("GET", "/print?station=st-station2")).body.flagLabelSize).toBe("2x4");
    expect((await call("GET", "/print?station=st-STATION2")).body.flagLabelSize).toBe("2x4");
    expect((await call("GET", "/print?station=st-station3")).body.flagLabelSize).toBe("2x3");
    expect((await call("GET", "/print?station=st-station1")).body.flagLabelSize).toBe("2x1");   // empty: the hub's
    expect((await call("GET", "/print")).body.flagLabelSize).toBe("2x1");
    const plain = makeHub(fakes().opts);
    expect((await plain.call("GET", "/print?station=st-station2")).body.flagLabelSize).toBe("2x1");   // nothing set: the 2 x 1 in roll
  });
  it("a mistyped station roll is left out: that station keeps the hub's roll", async () => {
    const { call } = makeHub({ ...fakes().opts, flagLabelSize: "2x1", flagLabelSizes: { "st-station2": "2by4", "st-station3": "2x3" } });
    expect((await call("GET", "/print?station=st-station2")).body.flagLabelSize).toBe("2x1");
    expect((await call("GET", "/print?station=st-station3")).body.flagLabelSize).toBe("2x3");
  });
  it("POST /print drops labels that are not labels; none left is a 400 and nothing prints", async () => {
    const f = fakes();
    const { call } = makeHub(f.opts);
    expect((await call("POST", "/print", { kind: "flag", station: "st-station1", labels: [null, 3] })).status).toBe(400);
    expect(f.printed).toHaveLength(0);
    const r = await call("POST", "/print", { kind: "binticket", station: "st-station1", labels: [null, { bin: "1.1", label: "Navy", by: "team", count: 0, orderNumber: "264247" }] });
    expect(r.body).toMatchObject({ ok: true, count: 1 });
  });
  it("POST /print lays the ticket roll's labels out on the station's roll; the stickers keep theirs", async () => {
    const f = fakes();
    const { call } = makeHub({ ...f.opts, flagLabelSizes: { "st-station2": "2x4" } });
    const ticket = [{ number: "7", name: "SMITH", reason: "Holes", team: "Navy", size: "A-L", orderNumber: "264247", station: "station2", garment: "hockey", spots: SPOTS }];
    await call("POST", "/print", { kind: "flag", station: "st-station2", labels: ticket });
    await call("POST", "/print", { kind: "flag", station: "st-station1", labels: ticket });
    await call("POST", "/print", { kind: "binticket", station: "st-Station2", labels: [{ bin: "1.1", label: "Navy", by: "team", count: 0, orderNumber: "264247" }] });
    await call("POST", "/print", { kind: "jersey", station: "st-station2", labels: [{ bin: "1.1", by: "team", value: "Navy", orderNumber: "264247" }] });
    expect(f.printed[0].zpl).toContain("^LL816");      // 4 in at 203 dpi, and the ticket's lift
    expect(f.printed[0].zpl).toMatch(/\^GC/);          // the spots, drawn under the band
    expect(f.printed[1].zpl).toContain("^LL207");      // station 1: the 2 x 1 in roll, no garment
    expect(f.printed[1].zpl).not.toMatch(/\^GC/);
    expect(f.printed[2].zpl).toContain("^LL812");      // a box label on station 2's tall roll
    expect(f.printed[3].zpl).toContain("^PW203");      // the sticker roll is untouched
  });
  it("POST /print answers with the labels that came out: a list re-paged for a tall roll is fewer", async () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ _id: i, number: String(i + 1), name: `P${i}`, size: "A-L", team: "Navy", scanned: "pass" }));
    const lists = binListLabels(rows, { bin: "1.1", label: "Navy", orderNumber: "264247", by: "team", of: 30 });
    expect(lists.length).toBe(4);                      // 3 pages of 14 and the count label, as the station builds them
    const f = fakes();
    const { call } = makeHub({ ...f.opts, flagLabelSizes: { "st-station2": "2x4" } });
    expect((await call("POST", "/print", { kind: "binlist", station: "st-station1", labels: lists })).body.count).toBe(4);
    expect((await call("POST", "/print", { kind: "binlist", station: "st-station2", labels: lists })).body.count).toBe(2);   // one page of 56 and the count label
    expect((f.printed[1].zpl.match(/\^XA/g) || []).length).toBe(2);
    expect(printJob(lists, labelSize("2x4"), "binlist").count).toBe(2);
    expect(printJob(lists, labelSize("2x1"), "binlist").count).toBe(4);
  });
});

describe("the spots in the station's report (snapshotOf)", () => {
  const roster = [{ _id: 0, number: "7", name: "SMITH", team: "Navy", size: "A-L", scanned: "flag" }, { _id: 1, number: "9", name: "JONES", scanned: "flag" }, { _id: 2, number: "4", name: "LEE", scanned: false }];
  const log = [
    ...Array.from({ length: 8 }, (_, i) => ({ id: 100 + i, timestamp: "2026-11-24 10:00:00", status: "pass", match: roster[2] })),
    { id: 3, timestamp: "2026-11-24 09:03:00", status: "flagged", match: roster[1], reason: "Holes", garment: "tee" },   // asked, skipped
    { id: 2, timestamp: "2026-11-24 09:02:00", status: "flagged", match: roster[0], reason: "Holes", garment: "hockey", spots: [...SPOTS, { side: "front", x: 0.4, y: 0.4 }, { side: "back", x: 0.1, y: 0.1 }], photo: "data:image/jpeg;base64,AAA" },
    { id: 1, timestamp: "2026-11-24 09:01:00", status: "flagged", match: roster[0], reason: "Others" },
    { id: 4, timestamp: "2026-11-24 09:04:00", status: "flagged", match: roster[1], reason: "Holes", garment: "hockey", locating: true },   // still being marked
  ];
  const snap = snapshotOf({ operatorName: "Pat", orderNumber: "264247", orderRun: 1000, roster, log, binMap: null });
  const ev = id => snap.events.find(e => e.id === id);
  it("every flag carries its garment and spots, even past the photos' reach; at most three spots", () => {
    expect(ev(2).photo).toBeUndefined();               // the 10th entry: no photo in this report …
    expect(ev(2).garment).toBe("hockey");              // … but its marks are always sent
    expect(ev(2).spots).toHaveLength(3);
    expect(ev(2).spots[0]).toEqual(SPOTS[0]);
    expect(ev(3)).toMatchObject({ garment: "tee" });
    expect(ev(3).spots).toBeUndefined();
    expect(ev(1).garment).toBeUndefined();
    expect(ev(4).garment).toBeUndefined();             // not until the operator is done marking
    expect(ev(100).garment).toBeUndefined();
  });
  it("the board's attention items too", () => {
    const a = snap.attention.find(x => x.id === 2);
    expect(a).toMatchObject({ garment: "hockey" });
    expect(a.spots).toHaveLength(3);
    expect(snap.attention.find(x => x.id === 4).spots).toBeUndefined();
  });
});

describe("the ledger keeps the spots", () => {
  const flag = (extra = {}) => ({ id: 5, t: "2026-11-24 09:00:00", status: "flagged", order: "264247", run: 1000, number: "7", reason: "Holes", ...extra });
  it("withMarks: the newest spots that are not empty win, with their garment; junk is left out", () => {
    expect(withMarks(flag({ garment: "hockey", spots: SPOTS }), undefined)).toMatchObject({ garment: "hockey", spots: SPOTS });
    expect(withMarks(flag(), { garment: "hockey", spots: SPOTS })).toMatchObject({ garment: "hockey", spots: SPOTS });
    expect(withMarks(flag({ garment: "tee", spots: [] }), { garment: "hockey", spots: SPOTS })).toMatchObject({ garment: "hockey", spots: SPOTS });
    expect(withMarks(flag({ garment: "tee", spots: [SPOTS[1]] }), { garment: "hockey", spots: SPOTS })).toMatchObject({ garment: "tee", spots: [SPOTS[1]] });
    const bad = withMarks(flag({ garment: "__proto__", spots: [{ side: "inside", x: 0.5, y: 0.5 }, { side: "front", x: 2, y: 0 }, "x"] }));
    expect(bad.garment).toBeUndefined();
    expect(bad.spots).toBeUndefined();
    expect(withMarks(flag({ garment: "tee" }), {}).garment).toBe("tee");   // skipped: the garment alone ("Not marked")
  });
  it("fileEvent: a re-send without them never wipes them; a photo is kept as before", () => {
    const led = {};
    fileEvent(led, flag({ garment: "hockey", spots: SPOTS, photo: "data:image/jpeg;base64,AAA" }), "st-station1", "2026-11-24");
    fileEvent(led, flag({ resolution: "Accepted" }), "st-station2", "2026-11-24");
    const [e] = Object.values(led["2026-11-24"].events);
    expect(e).toMatchObject({ garment: "hockey", spots: SPOTS, resolution: "Accepted", station: "st-station1", photo: "data:image/jpeg;base64,AAA" });
  });
  it("through the routes: the report, a re-send without them, the day's ledger and the Print menu's order", async () => {
    const { call } = makeHub();
    const rows = [{ _id: 0, number: "7", name: "SMITH", scanned: "flag" }];
    const report = events => ({ operatorName: "Pat", orderNumber: "264247", orderRun: 1000, counts: { total: 1, remaining: 0, flag: 1 }, rows, events, attention: [] });
    await call("POST", "/stations/st-station1", report([flag({ rowId: 0, garment: "hockey", spots: SPOTS })]));
    await call("POST", "/stations/st-station1", report([flag({ rowId: 0 })]));   // an older station, or the next report without them
    const day = (await call("GET", "/ledger?date=2026-11-24")).body;
    expect(day.events.find(e => e.id === 5)).toMatchObject({ garment: "hockey", spots: SPOTS });
    const { orders } = (await call("GET", "/orders?q=264247")).body;
    expect(orders[0].flags[0]).toMatchObject({ garment: "hockey", spots: SPOTS });
    const pack = packFromRecord(orders[0]);
    expect(pack.flags[0]).toMatchObject({ garment: "hockey", spots: SPOTS });
    const [ticket] = flagJobs(pack);
    expect(ticket).toMatchObject({ garment: "hockey", spots: SPOTS, copies: 1 });
  });
  it("a reprinted ticket for a flag never asked where draws the order's garment, as the first ticket did", async () => {
    // By the row's style (BA2690 is pants), and by the order's garment when the row has no style.
    const pack = { orderNumber: "264247", garment: "pants", binMap: null, flags: [
      { id: 1, reason: "Others", match: { number: "7", name: "SMITH", style: "BA2690" } },
      { id: 2, reason: "No size tag", match: { number: "9", name: "JONES" } },
      { id: 3, reason: "Holes", garment: "tee", spots: [SPOTS[0]], match: { number: "4", style: "BA2690" } },   // its own garment wins
    ] };
    expect(flagJobs(pack).map(t => t.garment)).toEqual(["pants", "pants", "tee"]);
    expect(flagJobs({ ...pack, garment: "" })[1].garment).toBe("hockey");   // no order garment: the default
    // From "Another order": /orders gives the order's garment and packFromRecord carries it.
    const { call } = makeHub();
    await call("POST", "/stations/st-station1", { operatorName: "Pat", orderNumber: "264250", orderRun: 2000, garment: "pants", counts: { total: 1, remaining: 0, flag: 1 }, rows: [{ _id: 0, number: "9", name: "JONES", scanned: "flag" }], events: [{ id: 6, t: "2026-11-24 09:00:00", status: "flagged", order: "264250", run: 2000, rowId: 0, number: "9", reason: "Others" }], attention: [] });
    const { orders } = (await call("GET", "/orders?q=264250")).body;
    expect(orders[0].garment).toBe("pants");
    const past = packFromRecord(orders[0]);
    expect(past.garment).toBe("pants");
    expect(flagJobs(past)[0].garment).toBe("pants");
  });
  it("normaliseLedger: copies of one scan keep the spots, whichever copy has them", () => {
    const led = {
      "2026-11-23": { events: { "a": { ...flag({ garment: "hockey", spots: SPOTS }), station: "st-station1" } }, orders: {} },
      "2026-11-24": { events: { "b": { ...flag({ resolution: "Accepted" }), station: "st-station2" } }, orders: {} },
    };
    expect(normaliseLedger(led)).toBe(1);
    const all = Object.values(led).flatMap(d => Object.values(d.events));
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ garment: "hockey", spots: SPOTS, resolution: "Accepted", station: "st-station1" });
    expect(normaliseLedger(led)).toBe(0);
  });
  it("merge-hub-data: a later copy without them keeps the earlier copy's", () => {
    const copy = ev => ({ stations: {}, rosters: {}, ledger: { "2026-11-24": { events: { "1000|5": ev }, orders: {} } } });
    const out = mergeHub([copy(flag({ garment: "hockey", spots: SPOTS })), copy(flag({ spots: [], garment: "", resolution: "Accepted" }))]);
    expect(out.ledger["2026-11-24"].events["1000|5"]).toMatchObject({ garment: "hockey", spots: SPOTS, resolution: "Accepted" });
    const newer = mergeHub([copy(flag({ garment: "hockey", spots: SPOTS })), copy(flag({ garment: "tee", spots: [SPOTS[1]] }))]);
    expect(newer.ledger["2026-11-24"].events["1000|5"]).toMatchObject({ garment: "tee", spots: [SPOTS[1]] });
  });
});

describe("the damage report says where", () => {
  it("Where and Garment columns, before Resolution; the photos stay last", () => {
    expect(DAMAGE_COLUMNS.slice(11, 15)).toEqual(["Reason", "Where", "Garment", "Resolution"]);
    expect(DAMAGE_COLUMNS.slice(-2)).toEqual(["Photo", "Damage photo"]);
  });
  it("from ledger events and station log entries: the words, Not marked when skipped, nothing when never asked", () => {
    const rows = buildDamageRows([
      { id: 1, t: "2026-11-24 09:00:00", status: "flagged", reason: "Holes", garment: "hockey", spots: [{ side: "front", x: 0.5, y: 0.5 }] },
      { id: 2, timestamp: "2026-11-24 09:01:00", status: "flagged", reason: "Holes", garment: "pants", match: { number: "4" } },
      { id: 3, t: "2026-11-24 09:02:00", status: "flagged", reason: "Not on the roster" },
      { id: 4, timestamp: "2026-11-24 09:03:00", status: "flagged", reason: "Twill peeling", match: { number: "8" }, garment: "socks", spots: [{ side: "back", x: 0.5, y: 0.2 }] },
    ]);
    expect(rows[0].where).toMatch(/^Front: /);
    expect(rows[0].garment).toBe("Hockey jersey");
    expect(rows[1]).toMatchObject({ where: "Not marked", garment: "Pants" });
    expect(rows[2]).toMatchObject({ where: "", garment: "" });
    expect(rows[3].where).toMatch(/^Back: /);
    expect(rows[3].garment).toBe("Socks");
  });
});
