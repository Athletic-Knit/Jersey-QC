// The roll each kind of label prints on, chosen at the station (Settings →
// Label printer; the owner, 25 Nov 2026): 2 x 4, 2 x 3, 2 x 1 or 1 x 0.5 for
// stickers, flag tickets and box labels and lists, 2 x 4 by default. The station
// sends it with every print; the hub lays the label out for it and sends a
// 1 x 0.5 one to the sticker printer, the others to the ticket printer.
import { describe, it, expect, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { createHub, LABEL_ROLLS as HUB_ROLLS } from "../../../hub-plugin.js";
import { setPrintRolls, rollFor } from "../hub.js";
import { DEFAULT_SETTINGS, LABEL_ROLLS } from "../../config.js";

function makeHub(opts = {}) {
  const hub = createHub({ file: path.join(os.tmpdir(), `hub-rolls-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}.json`), ...opts });
  return (method, url, body) => new Promise(resolve => {
    const req = new EventEmitter(); req.method = method; req.url = url;
    const res = { statusCode: 200, setHeader() {}, end(s) { resolve({ status: res.statusCode, body: JSON.parse(s) }); } };
    hub.handle(req, res);
    if (body !== undefined) req.emit("data", JSON.stringify(body));
    req.emit("end");
  });
}
const fakes = () => {
  const printed = [];
  return { printed, opts: { printer: "Sticker Zebra", flagPrinter: "Ticket Zebra", listPrinters: async () => [], print: async (printer, zpl) => { printed.push({ printer, zpl }); } } };
};
const TICKET = [{ number: "7", name: "SMITH", reason: "Holes", team: "Navy", size: "A-L", orderNumber: "264247", garment: "hockey", spots: [{ side: "front", x: 0.4, y: 0.5 }] }];
const STICKER = [{ bin: "1.1", by: "team", value: "Navy", orderNumber: "264247" }];

afterEach(() => setPrintRolls({}));

describe("the rolls", () => {
  it("four rolls, the same at the station and the hub; 2 x 4 for every kind by default", () => {
    expect(LABEL_ROLLS.map(r => r.id)).toEqual(HUB_ROLLS);
    expect(HUB_ROLLS).toEqual(["2x4", "2x3", "2x1", "1x0.5"]);
    expect([DEFAULT_SETTINGS.stickerRoll, DEFAULT_SETTINGS.flagRoll, DEFAULT_SETTINGS.boxRoll]).toEqual(["2x4", "2x4", "2x4"]);
  });
  it("each kind of print takes its own setting", () => {
    setPrintRolls({ stickerRoll: "1x0.5", flagRoll: "2x3", boxRoll: "2x1" });
    expect(rollFor("jersey")).toBe("1x0.5");
    expect(rollFor("flag")).toBe("2x3");
    expect(rollFor("binlist")).toBe("2x1");
    expect(rollFor("binticket")).toBe("2x1");
    expect(rollFor("bin")).toBe("1x0.5");
  });
});

describe("POST /print with the station's roll", () => {
  it("lays the label out for that roll", async () => {
    const f = fakes(), call = makeHub(f.opts);
    await call("POST", "/print", { kind: "flag", station: "st-station1", roll: "2x3", labels: TICKET });
    await call("POST", "/print", { kind: "flag", station: "st-station1", roll: "2x1", labels: TICKET });
    expect(f.printed[0].zpl).toContain("^LL613");          // 3 in, with the ticket's lift
    expect(f.printed[0].zpl).toMatch(/\^GC/);               // the spot, under the band
    expect(f.printed[1].zpl).toContain("^LL207");
    expect(f.printed[1].zpl).not.toMatch(/\^GC/);
  });
  it("a 1 x 0.5 label goes to the sticker printer, every other roll to the ticket printer", async () => {
    const f = fakes(), call = makeHub(f.opts);
    await call("POST", "/print", { kind: "jersey", station: "st-station1", roll: "2x4", labels: STICKER });
    await call("POST", "/print", { kind: "flag", station: "st-station1", roll: "1x0.5", labels: TICKET });
    expect(f.printed.map(p => p.printer)).toEqual(["Ticket Zebra", "Sticker Zebra"]);
    expect(f.printed[0].zpl).toContain("^PW406");
    expect(f.printed[1].zpl).toContain("^PW203");
  });
  it("no roll, or one it does not know: as before (sizes and printers from .env.local)", async () => {
    const f = fakes(), call = makeHub({ ...f.opts, flagLabelSize: "2x1" });
    await call("POST", "/print", { kind: "flag", station: "st-station1", labels: TICKET });
    await call("POST", "/print", { kind: "jersey", station: "st-station1", roll: "3x5", labels: STICKER });
    expect(f.printed.map(p => p.printer)).toEqual(["Ticket Zebra", "Sticker Zebra"]);
    expect(f.printed[0].zpl).toContain("^LL207");
    expect(f.printed[1].zpl).toContain("^PW203");
  });
});
