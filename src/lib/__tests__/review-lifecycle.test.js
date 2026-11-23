// Phase 3 of the code review of 23 Nov 2026: the order's life on a station,
// from start to New order. One block per finding (M13–M18). Some rules live in
// App.jsx; their tests read its source, as no-scan-behind-dialog.test.js does.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { parseCSV, nextRowId, orderNumberOf } from "../roster.js";
import { createHub } from "../../../hub-plugin.js";

const APP = fs.readFileSync(new URL("../../App.jsx", import.meta.url), "utf8");
const between = (from, to) => { const i = APP.indexOf(from); expect(i, from).toBeGreaterThan(-1); return APP.slice(i, APP.indexOf(to, i + from.length)); };

describe("M13: Replace roster never hands the old log's passes and flags to new rows", () => {
  it("new ids start past every id of the roster and of the log", () => {
    expect(nextRowId([{ _id: 0 }, { _id: 1 }], [{ match: { _id: 7 } }])).toBe(8);
    expect(nextRowId([], [])).toBe(0);
    expect(nextRowId([{ _id: 4 }], [{ match: {} }, {}])).toBe(5);   // log lines with no row (an extra jersey)
  });
  it("Replace roster numbers its rows from there and keeps the order's box sorting", () => {
    const up = between("const handleRosterUpload = useCallback", "const handleRosterAdd");
    expect(up).toMatch(/nextRowId\(roster, log\)/);
    expect(up).toMatch(/binBy: binMap \? binFieldOf\(binMap\)/);
  });
});

describe("M14: Start order and Send roster run once", () => {
  it("Start order: a second press (Enter in the order field) while the first is running does nothing", () => {
    const start = between("const handleStart = async () => {", "const onEnter");
    expect(start.indexOf("if (starting.current) return;")).toBeGreaterThan(-1);
    expect(start.indexOf("if (starting.current) return;")).toBeLessThan(start.indexOf("await"));
  });
  it("the supervisor's Send roster: the same", () => {
    const send = between("const send = async () => {", "\n  };");
    expect(send.indexOf("if (sending.current) return;")).toBeLessThan(send.indexOf("await"));
    expect(send).toMatch(/finally \{ sending\.current = false; \}/);
  });
});

describe("M15: finishing a ship-with order again does not leave its boxes open twice", () => {
  const makeHub = () => {
    const file = path.join(os.tmpdir(), `hub-life-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}.json`);
    const hub = createHub({ file, now: () => 1_795_000_000_000 });
    return (method, url, body) => new Promise(resolve => {
      const req = new EventEmitter(); req.method = method; req.url = url;
      const res = { statusCode: 200, setHeader() {}, end(s) { resolve({ status: res.statusCode, body: JSON.parse(s) }); } };
      hub.handle(req, res);
      if (body !== undefined) req.emit("data", JSON.stringify(body));
      req.emit("end");
    });
  };
  const box = (n = 1) => ({ orders: ["264247", "264248"], by: "team", key: "navy", label: "Navy", bin: "1.1", items: Array.from({ length: n }, (_, i) => ({ order: "264247", number: String(i) })) });
  it("the same order, run and box replaces its entry and keeps its id", async () => {
    const call = makeHub();
    const a = (await call("POST", "/openboxes", { boxes: [box(2)], station: "st-station1", order: "264247", run: 1000 })).body.ids;
    const b = (await call("POST", "/openboxes", { boxes: [box(3)], station: "st-station1", order: "264247", run: 1000 })).body.ids;
    expect(b).toEqual(a);
    const { boxes } = (await call("GET", "/openboxes?orders=264248")).body;
    expect(boxes.length).toBe(1);
    expect(boxes[0].items.length).toBe(3);
  });
  it("another run of the order, or another box, is its own entry", async () => {
    const call = makeHub();
    await call("POST", "/openboxes", { boxes: [box()], station: "st-station1", order: "264247", run: 1000 });
    await call("POST", "/openboxes", { boxes: [box(), { ...box(), bin: "2.1", key: "red" }], station: "st-station1", order: "264247", run: 2000 });   // a Finish sends its whole set
    expect((await call("GET", "/openboxes")).body.boxes.length).toBe(3);
  });
  it("a box left open and closed at the next Finish goes from the hub", async () => {
    const call = makeHub();
    await call("POST", "/openboxes", { boxes: [box()], station: "st-station1", order: "264247", run: 1000 });
    const r = await call("POST", "/openboxes", { boxes: [], station: "st-station1", order: "264247", run: 1000 });
    expect(r.status).toBe(200);
    expect((await call("GET", "/openboxes")).body.boxes.length).toBe(0);
  });
  it("a box the next order took is not made again by another Finish, and the station is told", async () => {
    const call = makeHub();
    const [id] = (await call("POST", "/openboxes", { boxes: [box(2)], station: "st-station1", order: "264247", run: 1000 })).body.ids;
    const took = (await call("POST", `/openboxes/${id}/take`, { station: "st-station2", order: "264248" })).body.box;
    expect(took.items.length).toBe(2);   // the taking station gets everything in it
    const again = (await call("POST", "/openboxes", { boxes: [box(3)], station: "st-station1", order: "264247", run: 1000 })).body;
    expect(again.ids).toEqual([]);
    expect(again.taken).toEqual([{ bin: "1.1", order: "264248", station: "st-station2" }]);
    expect((await call("GET", "/openboxes")).body.boxes.length).toBe(0);
    expect((await call("POST", `/openboxes/${id}/take`, { station: "st-station3", order: "264249" })).status).toBe(404);
  });
  it("the station sends the whole set at every Finish of a ship-with order, also none", () => {
    expect(between("const finishOrder  = useCallback", "const newOrder")).toMatch(/if \(kept\.size \|\| shipWith\.length\)/);
  });
  it("the station sends its run", () => {
    expect(between("const finishOrder  = useCallback", "const newOrder")).toMatch(/leaveBoxesOpen\(\{[^}]*run: orderRun/);
  });
});

describe("M16: New order keeps the order until the hub has it", () => {
  it("New order sends one last report and stops if it fails; only the separate button goes on anyway", () => {
    const fn = between("const newOrder     = useCallback(async (anyway = false) => {", "}, [resetOrder");
    const wait = fn.indexOf("await Promise.race([reportNow()"), stop = fn.indexOf("return; }"), reset = fn.indexOf("resetOrder()");
    expect(wait).toBeGreaterThan(-1);
    expect(stop).toBeGreaterThan(wait);
    expect(reset).toBeGreaterThan(stop);
    expect(APP).toMatch(/onNewAnyway=\{\(\) => newOrder\(true\)\}/);
    expect(APP).toMatch(/onNew=\{\(\) => newOrder\(\)\}/);   // never the click event as `anyway`
  });
});

describe("M17: two roster columns for one field do not overwrite each other", () => {
  it("Number, Name and a Jersey column of Home / Away: the number stays the number, whatever the column order", () => {
    const r = parseCSV("Number,Name,Jersey\n12,Smith,Home\n7,Jones,Away\n");
    expect(r.map(x => x.number)).toEqual(["12", "7"]);
    expect(r.map(x => x.jersey)).toEqual(["Home", "Away"]);
    expect(parseCSV("Jersey,Name,Number\nHome,Smith,12\n")[0]).toMatchObject({ number: "12", jersey: "Home" });
  });
  // The cases the review found would have broken with "the plainer header wins" (each reads as before):
  it("a line-number column and a jersey-number column: the jersey number", () => {
    expect(parseCSV("#,Name,Jersey Number,Size\n1,Smith,23,A-L\n2,Jones,7,A-M\n").map(x => x.number)).toEqual(["23", "7"]);
    expect(parseCSV("No.,Player,Jersey #,Size\n1,Smith,23,A-L\n2,Jones,7,A-M\n").map(x => x.number)).toEqual(["23", "7"]);
  });
  it("an empty Number column beside a filled Jersey Number column: the filled one", () => {
    expect(parseCSV("Number,Jersey Number,Name\n,23,Smith\n,7,Jones\n").map(x => x.number)).toEqual(["23", "7"]);
  });
  it("Name and Last Name: the last name, as before", () => {
    expect(parseCSV("Name,Last Name,Number\nJohn Smith,SMITH,5\n")[0].name).toBe("SMITH");
  });
  it("Order and PO with the order empty: the PO is the order number, as before", () => {
    const r = parseCSV("Order,PO,Name,Number\n,555,Smith,5\n");
    expect(orderNumberOf(r)).toBe("555");
    expect(r[0].po).toBeUndefined();
  });
});

describe("M18: a typed number not on the roster gets a check step before it is flagged", () => {
  it("manualSubmit shows the typed list with no rows (Back first) instead of flagging at once", () => {
    const fn = between("    manualSubmit({ number, name, size, team }) {", "    continueManual()");
    expect(fn).toMatch(/candidates: \[\], typed,/);
    expect(fn.trimEnd().endsWith("commitTyped(o, typed, null);\n    },")).toBe(false);
    // The typed list's first option is Back (to the form as typed), so a pedal press goes back, not to a flag.
    expect(APP).toMatch(/\.\.\.\(t \? \[back, none, flag\]/);
  });
});
