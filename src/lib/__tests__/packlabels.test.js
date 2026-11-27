// The packing paperwork on the tall rolls (the owner, 25 Nov 2026): the packing list as a
// table, the outside label and the sign-off ticket. The fixtures are the ZPL of the
// owner's walk-through order (U11 Tigers and U12 Bombers) on the 2 x 3 in roll, laid out
// as the hand-written labels the owner approved on paper. WRITE_FIXTURES=1 rewrites them.
import { describe, it, expect } from "vitest";
import process from "node:process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { labelSize, printJob, repageLists, listChunks, textUnits } from "../labels.js";
import { packListLabel, packListZPL, boxFaceZPL, signoffZPL, packListLayout, LIST_COPIES } from "../packlabels.js";
import { buildBinMap, closeBin } from "../roster.js";
import { packBoxes, boxFaceLabel, boxFaceJobs, boxListJobs, signoffLabel, signoffJobs, packFromRecord } from "../printjobs.js";
import { WALK, walkBox, walkRoster } from "./walk-order.js";

const fx = name => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
const same = (name, zpl) => {
  if (process.env.WRITE_FIXTURES || !existsSync(fx(name))) writeFileSync(fx(name), zpl);
  expect(zpl).toBe(readFileSync(fx(name), "utf8").split(String.fromCharCode(13)).join(""));   // git may check the fixture out with CRLF
};
const roll = labelSize("2x3"), tall4 = labelSize("2x4");
const pages = zpl => zpl.split("^XA").slice(1).map(p => "^XA" + p);
const at = (zpl, text) => { const m = zpl.match(new RegExp(`\\^FO(\\d+),(\\d+)\\^A0N,\\d+,\\d+(?:\\^FR)?\\^FD${text}\\^FS`)); return m ? [Number(m[1]), Number(m[2])] : null; };

describe("the packing list as a table (kind packlist)", () => {
  it("builds one label object a box: a group a team, a section a size in rack order, rows by number, short sizes", () => {
    const l = packListLabel(WALK.u12.rows, { bin: "2", label: "U12 Bombers", orderNumber: "123456" });
    expect(l).toMatchObject({ kind: "packlist", bin: "2", team: "U12 Bombers", orderNumber: "123456", pcs: 9, copies: 4 });
    expect(l.groups).toHaveLength(1);
    expect(l.groups[0].sizes.map(s => s.size)).toEqual(["A-S", "A-M", "A-L", "A-XL"]);
    expect(l.groups[0].sizes[2].rows.map(r => r.number)).toEqual(["11", "14", "23", "44"]);
  });
  it("U11 Tigers (#19 flagged out): one page, a column a size, the header on top", () => {
    const l = packListLabel(walkBox("u11"), { bin: "1", label: "U11 Tigers", orderNumber: "123456" });
    const z = packListZPL(l, roll);
    same("packlist-walk-u11.zpl", z);
    expect(pages(z)).toHaveLength(1);
    expect(z).toContain("^FDU11 TIGERS - BOX 1 - 10 pcs - 1/1^FS");
    expect(z).toContain("^FDOrder 123456^FS");
    expect(at(z, "A-S")).toEqual([20, 104]); expect(at(z, "A-M")).toEqual([150, 104]); expect(at(z, "A-L")).toEqual([280, 104]);
    expect(z).not.toMatch(/\^FD19\^FS/);   // the flagged garment is not in the box
    expect(z).toContain("^FDVANDE…^FS");   // #100 VANDERHOOGENBAND-SMITH is cut, never run into the next column
    expect(z).not.toContain("VANDERHOOGENBAND");
  });
  it("U12 Bombers (#44 missing out): ONE page, A-XL under A-S in the first column", () => {
    const l = packListLabel(walkBox("u12"), { bin: "2", label: "U12 Bombers", orderNumber: "123456" });
    const z = packListZPL(l, roll);
    same("packlist-walk-u12.zpl", z);
    expect(pages(z)).toHaveLength(1);
    expect(z).toContain("BOX 2 - 8 pcs - 1/1");
    const s = at(z, "A-S"), xl = at(z, "A-XL");
    expect(xl[0]).toBe(s[0]); expect(xl[1]).toBeGreaterThan(s[1] + 40);
    expect(at(z, "A-M")[0]).toBe(150); expect(at(z, "A-L")[0]).toBe(280);
  });
  it("the name never reaches the next column: cut with an ellipsis to the room the number leaves", () => {
    const z = packListZPL(packListLabel(walkBox("u11"), { bin: "1", label: "U11 Tigers", orderNumber: "1" }), roll);
    const names = [...z.matchAll(/\^FO(\d+),\d+\^A0N,24,19\^FD([^^]+)\^FS/g)].map(m => [Number(m[1]), m[2]]);
    expect(names.length).toBe(10);
    // each name ends inside its column (108 dots from the column's x), by the same estimate the layout uses
    const colX = x => [20, 150, 280].filter(c => c <= x).at(-1);
    for (const [x, n] of names) expect(x - colX(x) + Math.ceil(textUnits(n) * 19 * 0.85)).toBeLessThanOrEqual(108);
    expect(z).toContain("^FDEVANO…^FS"); expect(z).toContain("^FDKOVALE…^FS");
  });
  it("a three-digit number has narrower letters, so the name behind it keeps about five letters", () => {
    const z = packListZPL(packListLabel([{ number: "100", name: "VANDERHOOGENBAND-SMITH", size: "A-L", team: "T" }, { number: "12", name: "VANDERHOOGENBAND", size: "A-L", team: "T" }], { bin: "1", label: "T" }), roll);
    expect(z).toContain("^A0N,34,20^FD100^FS"); expect(z).toContain("^A0N,34,28^FD12^FS");
    expect(z).toContain("^FDVANDE…^FS");
    expect(packListZPL(packListLabel([{ number: "1000", name: "X", size: "A-L", team: "T" }], { bin: "1", label: "T" }), roll)).toContain("^A0N,34,15^FD1000^FS");
  });
  it("a long team name keeps the header on one line: squeezed, then the name cut, never the box, pieces or page", () => {
    const team = "U11 Greater Toronto Hockey League Select Tigers";
    const z = packListZPL(packListLabel([{ number: "1", name: "A", size: "A-S", team }], { bin: "12.3", label: team, orderNumber: "264247" }), roll);
    const m = z.match(/\^FO20,18\^A0N,24,(\d+)\^FD([^^]+)\^FS/);
    expect(Number(m[1])).toBeGreaterThanOrEqual(13);
    expect(m[2]).toMatch(/^U11 GREATER.*… - BOX 12\.3 - 1 pcs - 1\/1$/);
    expect(Math.ceil(textUnits(m[2]) * Number(m[1]) * 0.85)).toBeLessThanOrEqual(366);
    expect(z).toContain("^FO20,46^A0N,40,36^FDOrder 264247^FS");   // the order line under it, as always
  });
  it("overflow: more rows than a page holds go to the next page, headers again, the last page prints first", () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({ number: String(i + 1), name: `NAME${i}`, size: "A-S", team: "U11 Tigers" }));
    const l = packListLabel(rows, { bin: "1", label: "U11 Tigers", orderNumber: "123456" });
    const z = packListZPL(l, roll), p = pages(z);
    same("packlist-overflow.zpl", z);
    expect(p).toHaveLength(2);
    expect(p[0]).toContain("40 pcs - 2/2"); expect(p[1]).toContain("40 pcs - 1/2");
    expect(p[1].match(/\^FDA-S\^FS/g)).toHaveLength(3);   // 11 + 11 + 11 on the first page
    expect(p[0].match(/\^FDA-S\^FS/g)).toHaveLength(1);   // the last 7
  });
  it("a section that does not fit in a column's room moves on; 20 rows split over two columns", () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ number: String(i + 1), name: "X", size: "A-S", team: "T" }));
    const lay = packListLayout(packListLabel(rows, { bin: "1", label: "T" }), roll);
    expect(lay.pages).toHaveLength(1);
    expect(lay.pages[0].blocks[0].cols.map(c => c.reduce((n, s) => n + s.rows.length, 0))).toEqual([11, 9, 0]);
  });
  it("the rows a column holds follow the roll: 11 on 2 x 3 in, 16 on 2 x 4 in", () => {
    const rows = n => Array.from({ length: n }, (_, i) => ({ number: String(i + 1), name: "X", size: "A-M", team: "T" }));
    const colRows = (n, size) => packListLayout(packListLabel(rows(n), { bin: "1", label: "T" }), size).pages[0].blocks[0].cols.map(c => c.reduce((k, s) => k + s.rows.length, 0));
    expect(colRows(11, roll)).toEqual([11, 0, 0]); expect(colRows(12, roll)).toEqual([11, 1, 0]);
    expect(colRows(16, tall4)).toEqual([16, 0, 0]); expect(colRows(17, tall4)).toEqual([16, 1, 0]);
  });
  it("two teams: a black band a team ('U11 TIGERS - 8 pcs' in white), '2 TEAMS' in the header, a band that does not fit starts a page", () => {
    const rows = [...walkBox("u11").filter(x => x.size !== "A-L"), ...walkBox("u12").filter(x => x.size === "A-M" || x.size === "A-L")];   // the multi-team sample of the paper trial: 7 + 9 garments
    const l = packListLabel(rows, { bin: "1", label: "Shared", orderNumber: "123456" });
    expect(l.groups.map(g => g.team)).toEqual(["U11 Tigers", "U12 Bombers"]);
    const z = packListZPL(l, roll);
    same("packlist-two-teams.zpl", z);
    expect(z).toContain("2 TEAMS - BOX 1 - 14 pcs");
    expect(z).toMatch(/\^FDU11 TIGERS - 8 pcs\^FS/); expect(z).toMatch(/\^FDU12 BOMBERS - 6 pcs\^FS/);
    expect(z.match(/\^FR/g).length).toBe(2);
    expect(z).toContain("^GB366,30,30^FS");
    // a team too long for the room under the first goes to a second page, with its own band
    const long = Array.from({ length: 30 }, (_, i) => ({ number: String(i + 1), name: "X", size: "A-M", team: "Zebras" }));
    const two = packListLabel([...walkBox("u11"), ...long], { bin: "1", label: "Shared", orderNumber: "1" });
    const lay = packListLayout(two, roll);
    expect(lay.pages.length).toBeGreaterThanOrEqual(2);
    expect(lay.pages.every(p => p.blocks.every(b => b.band))).toBe(true);
    // a team longer than a page still prints whole: its own pages, split by the section rule, its band on each
    const huge = Array.from({ length: 80 }, (_, i) => ({ number: String(i + 1), name: "X", size: i % 2 ? "A-M" : "A-L", team: "Zebras" }));
    const big = packListLayout(packListLabel([...walkBox("u11"), ...huge], { bin: "1", label: "Shared", orderNumber: "1" }), roll);
    const placed = t => big.pages.flatMap(p => p.blocks.filter(b => b.team === t)).flatMap(b => b.cols.flat()).reduce((n, s) => n + s.rows.length, 0);
    expect(placed("Zebras")).toBe(80); expect(placed("U11 Tigers")).toBe(10);
    expect(big.pages.length).toBeGreaterThanOrEqual(3);
  });
  it("the same rows always lay out the same way", () => {
    const rows = [...walkBox("u11"), ...walkBox("u12")];
    expect(packListZPL(packListLabel(rows, { bin: "1", label: "Shared" }), roll)).toBe(packListZPL(packListLabel([...rows].reverse(), { bin: "1", label: "Shared" }), roll));
  });
  it("copies: every page prints four times (^PQ4), the label's own count when it says so", () => {
    const l = packListLabel(walkBox("u11"), { bin: "1", label: "U11 Tigers", orderNumber: "1" });
    expect(LIST_COPIES).toBe(4);
    expect(packListZPL(l, roll)).toContain("^PQ4");
    expect(packListZPL({ ...l, copies: 2 }, roll)).toContain("^PQ2");
    const over = packListZPL(packListLabel(Array.from({ length: 40 }, (_, i) => ({ number: String(i + 1), name: "X", size: "A-S", team: "T" })), { bin: "1", label: "T" }), roll);
    expect(over.match(/\^PQ4/g)).toHaveLength(2);
  });
  it("the hub: a packing list passes repageLists and listChunks untouched and counts its pages", () => {
    const l = packListLabel(walkBox("u11"), { bin: "1", label: "U11 Tigers", orderNumber: "1" });
    const list = [l];
    expect(repageLists(list, tall4)).toEqual(list);
    expect(repageLists(list, tall4)[0]).toBe(l);
    expect(listChunks([l, l, l], 2)).toEqual([[l, l], [l]]);
    // a cut never comes between a packing list and its box's count label and outside label
    const box2 = [{ ...l, bin: "2" }, { title: true, bin: "2" }, { kind: "boxface", bin: "2" }];
    expect(listChunks([l, { title: true, bin: "1" }, ...box2], 3).map(c => c.map(x => x.bin))).toEqual([["1", "1"], ["2", "2", "2"]]);
    const job = printJob([l], roll, "binlist");
    expect(job.count).toBe(1); expect(job.zpl).toContain("^PQ4");
  });
  it("on the 2 x 1 in roll it falls back to the rows list (no table), and an unknown label kind does not crash", () => {
    const l = packListLabel(walkBox("u11"), { bin: "1", label: "U11 Tigers", orderNumber: "1" });
    const job = printJob([l], labelSize("2x1"), "binlist");
    expect(job.zpl).not.toContain("^PQ4"); expect(job.zpl).toContain("LEACH"); expect(job.count).toBeGreaterThanOrEqual(1);
    expect(() => printJob([{ kind: "mystery", bin: "1" }, { items: null }], roll, "binlist")).not.toThrow();
  });
});

// The walk-through order at Finish order: U11 Tigers in box 1, U12 Bombers in box 2 (whole numbers, the co-op, 27 Nov 2026).
const roster = walkRoster();
const pack = { orderNumber: "123456", customer: "Source for Sports", roster, binMap: buildBinMap(roster, {}, "team"), closedBins: [], carried: [], finished: true };
const box = bin => packBoxes(pack).find(b => b.bin === bin);

describe("the outside label (kind boxface)", () => {
  it("box 1 of the walk-through: the teams and sizes as in box / of order, what is not in it, Box 1 of 2", () => {
    const l = boxFaceLabel(pack, box("1"));
    expect(l).toEqual({ kind: "boxface", bin: "1", boxNo: 1, boxes: 2, orderNumber: "123456", customer: "Source for Sports",
      teams: [{ team: "U11 Tigers", inBox: 10, ofOrder: 11 }],
      sizes: [{ size: "A-S", inBox: 5, ofOrder: 5 }, { size: "A-M", inBox: 3, ofOrder: 4 }, { size: "A-L", inBox: 2, ofOrder: 2 }],
      notIn: ["#19 A-M flagged"] });
    const z = boxFaceZPL(l, roll);
    same("boxface-walk-box1.zpl", z);
    expect(z).toContain("^FDORDER^FS"); expect(z).toContain("^FD123456^FS"); expect(z).toContain("^FDSource for Sports^FS");
    expect(z).toContain("^FD10 / 11^FS"); expect(z).toContain("^FDNot in this box: #19 A-M flagged^FS");
    expect(z).toContain("^FDBox 1 of 2^FS"); expect(z).toContain("^FDWEIGHT^FS");
    expect(z).not.toContain("LEACH");   // no garment names on the outside
    expect(z).toContain("^PQ1");
  });
  it("box 2 of the walk-through: #44 is missing", () => {
    const l = boxFaceLabel(pack, box("2"));
    expect(l).toMatchObject({ boxNo: 2, boxes: 2, teams: [{ team: "U12 Bombers", inBox: 8, ofOrder: 9 }], notIn: ["#44 A-L missing"] });
    expect(l.sizes).toEqual([{ size: "A-S", inBox: 1, ofOrder: 1 }, { size: "A-M", inBox: 3, ofOrder: 3 }, { size: "A-L", inBox: 3, ofOrder: 4 }, { size: "A-XL", inBox: 1, ofOrder: 1 }]);
    same("boxface-walk-box2.zpl", boxFaceZPL(l, roll));
  });
  it("no customer: the box's team name; before Finish 'of N' is the plan's count, at least the boxes with garments", () => {
    const open = { ...pack, customer: "", finished: false, plan: [{ bin: "1", boxes: 2, total: 0 }, { bin: "2", boxes: 1, total: 0 }] };
    const l = boxFaceLabel(open, packBoxes(open).find(b => b.bin === "1"));
    expect(l.customer).toBe("U11 Tigers");
    expect(l.boxes).toBe(3);   // box 1 may need a second box; box 2 one
    expect(boxFaceLabel({ ...open, plan: [] }, packBoxes(open).find(b => b.bin === "1")).boxes).toBe(2);
  });
  it("a sealed box keeps its number: closed boxes in the order they were closed, then the open ones", () => {
    // #2 LEACH not scanned yet; U12's box 2 is closed first (U12 goes on in box 3, the next free number),
    // then U11's box 1 (U11 goes on in box 4); LEACH then passes into box 4. Box 3 stays empty and has no number.
    const r0 = roster.map(x => x.number === "2" && x.team === "U11 Tigers" ? { ...x, scanned: undefined } : x), bins = buildBinMap(r0, {}, "team");
    const no = (p, bin) => boxFaceLabel(p, packBoxes(p).find(b => b.bin === bin)).boxNo;
    const c1 = closeBin(r0, bins, [], "2");
    expect(c1.newBin).toBe("3");
    expect(no({ ...pack, roster: r0, binMap: c1.binMap, closedBins: c1.closed }, "2")).toBe(1);
    const c2 = closeBin(r0, c1.binMap, c1.closed, "1");
    expect(c2.newBin).toBe("4");
    const later = { ...pack, roster: r0.map(x => x.scanned ? x : { ...x, scanned: "pass" }), binMap: c2.binMap, closedBins: c2.closed };
    expect(["2", "1", "4"].map(b => no(later, b))).toEqual([1, 2, 3]);
  });
  it("the outside label: 'Not in this box' never takes more than its three lines, 'Box 1 of 2' stays clear of the WEIGHT box", () => {
    const notIn = Array.from({ length: 30 }, (_, i) => `#${i + 10} A-M flagged`);
    const z = boxFaceZPL({ ...boxFaceLabel(pack, box("1")), notIn }, roll);
    const line = z.match(/\^FDNot in this box: ([^^]+)\^FS/)[1];
    expect(line).toMatch(/ \+\d+ more$/);
    expect(Math.ceil(textUnits(`Not in this box: ${line}`) * 18 * 0.85)).toBeLessThanOrEqual(3 * 366 * 0.8);
    const [, bx, , bw] = z.match(/\^FO(\d+),(\d+)\^A0N,44,(\d+)\^FDBox 1 of 2\^FS/).map(Number);
    const wx = Number(z.match(/\^FO(\d+),\d+\^GB116,70,3\^FS/)[1]);
    expect(bx + Math.ceil(textUnits("Box 1 of 2") * bw * 0.85)).toBeLessThan(wx);
  });
  it("the box lists of a tall roll end with the outside label, the Print menu can print it alone, and a short roll gets none", () => {
    const jobs = boxListJobs(pack, "1", { tall: true });
    expect(jobs.map(l => l.kind || (l.title ? "count" : "rows"))).toEqual(["rows", "packlist", "count", "boxface"]);   // the NOT IN BOX list first (#19 is out of this team)   // the outside label last: it comes off the printer on top
    expect(boxFaceJobs(pack).map(l => l.bin)).toEqual(["1", "2"]);
    expect(boxListJobs(pack, "1").some(l => l.kind === "boxface")).toBe(false);
  });
  it("the hub counts it as one label and lays a short roll out as one compact label", () => {
    const l = boxFaceLabel(pack, box("1"));
    const job = printJob([l], roll, "binlist");
    expect(job.count).toBe(1); expect(job.zpl).toContain("Box 1 of 2");
    expect(printJob([l], labelSize("2x1"), "binlist").zpl).toContain("^FDBox 1 of 2^FS");
  });
});

describe("the sign-off ticket (kind signoff)", () => {
  const meta = { date: "2026-11-25", time: "14:32", station: "Station 1", operator: "Person 1" };
  it("the walk-through order at Finish: passed per size in rack order, the totals, who and when", () => {
    const l = signoffLabel(pack, meta);
    expect(l).toEqual({ kind: "signoff", orderNumber: "123456", customer: "Source for Sports", teams: ["U11 Tigers", "U12 Bombers"], ...meta,
      bySize: [{ size: "A-S", passed: 6 }, { size: "A-M", passed: 6 }, { size: "A-L", passed: 5 }, { size: "A-XL", passed: 1 }],
      passed: 18, flagged: 1, missing: 1, total: 20, boxes: 2 });
    const z = signoffZPL(l, roll);
    same("signoff-walk.zpl", z);
    expect(pages(z)).toHaveLength(1);
    expect(z).toContain("^FD123456^FS"); expect(z).toContain("^FDSource for Sports - U11 Tigers - U12 Bombers^FS");
    expect(z).toContain("^FD2026-11-25 - 14:32 - Station 1 - Person 1^FS");
    expect(z).toContain("^FDPASSED^FS"); expect(z).toContain("^FD18^FS");
    expect(z).toContain("^FDFlagged 1 - Missing 1 - of 20 - Boxes 2^FS");
    expect(z).toContain("^FDOperator^FS"); expect(z).toContain("^FDSupervisor^FS");
    expect(z).not.toContain("LEACH");   // no garment names
  });
  it("a past order from the hub's record prints as it was finished", () => {
    const rec = { order: "123456", customer: "Source for Sports", station: "st-station1", operator: "Person 2", date: "2026-11-24", finishedAt: new Date(2026, 10, 24, 9, 5).getTime(), rows: roster, bins: pack.binMap, closedBins: [], counts: null, flags: [] };
    const l = signoffJobs(packFromRecord(rec), { date: "never", time: "never" })[0];
    expect(l).toMatchObject({ orderNumber: "123456", customer: "Source for Sports", date: "2026-11-24", time: "09:05", station: "st-station1", operator: "Person 2", passed: 18, total: 20 });
  });
  it("on a 2 x 1 in roll it is three labels, signatures printed first, so the strip reads header and sizes, totals, signatures", () => {
    const z = signoffZPL(signoffLabel(pack, meta), labelSize("2x1"));
    expect(pages(z)).toHaveLength(3);
    expect(pages(z)[2]).toContain("123456"); expect(pages(z)[2]).toContain("A-S 6");
    expect(pages(z)[1]).toContain("PASSED 18"); expect(pages(z)[1]).toContain("Flagged 1 - Missing 1 - of 20 - Boxes 2");
    expect(pages(z)[0]).toContain("Operator"); expect(pages(z)[0]).toContain("Supervisor");
    const job = printJob([signoffLabel(pack, meta)], labelSize("2x1"), "binlist");
    expect(job.count).toBe(3);
  });
  it("the hub counts the tall one as one label; a roster with no size does not crash it", () => {
    expect(printJob([signoffLabel(pack, meta)], roll, "binlist").count).toBe(1);
    const odd = signoffLabel({ ...pack, roster: [{ _id: 1, number: "1", name: "A", team: "", size: "", scanned: "pass" }], binMap: null }, {});
    expect(odd.bySize).toEqual([{ size: "No size", passed: 1 }]);
    expect(() => signoffZPL(odd, roll)).not.toThrow();
  });
  it("many sizes and teams still fit: the sizes go to two columns above PASSED, the teams line ends '+N more', the signatures at the bottom", () => {
    for (const n of [12, 15, 22]) {
      const many = { ...signoffLabel(pack, meta), teams: Array.from({ length: 9 }, (_, i) => `U${10 + i} Greater Toronto Select`), bySize: Array.from({ length: n }, (_, i) => ({ size: "S" + i, passed: i })) };
      const z = signoffZPL(many, roll);
      const ys = [...z.matchAll(/\^FO\d+,(\d+)\^A0N,(\d+),\d+\^FDS\d+\^FS/g)].map(m => Number(m[1]) + Number(m[2]));
      expect(ys).toHaveLength(n);
      const totals = z.match(/\^FO20,(\d+)\^A0N,22,\d+\^FDFlagged/);
      expect(Math.max(...ys)).toBeLessThan(Number(totals[1]));
      expect(Number(totals[1]) + 22).toBeLessThan(609 - 89);   // above the first signature line
      expect(z).toContain("^FO20,520^GB366,2,2^FS"); expect(z).toContain("^FO20,566^GB366,2,2^FS");
      expect(z).toMatch(/\^FDSource for Sports - U10 Greater Toronto Select.* \+\d+ more\^FS/);
    }
  });
});
