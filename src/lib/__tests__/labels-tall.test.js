// The tall ticket rolls (2 x 3 in, 2 x 4 in; the owner, 23 Nov 2026): the flag
// ticket with the garment and the damage marked under it, box labels and count
// labels at the top, lists re-paged. And the rolls in use today must not
// change by one byte: the fixture is the output of labels.js before this work.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  labelSize, labelsZPL, flagLabelZPL, flagPanels, binLabelZPL, binListZPL, binListLabels, damagedListLabels, boxesListLabels,
  repageLists, rowsPerLabel, pagesPerLabel, isTallTicket, textUnits, FLAG_LIFT, listChunks,
} from "../labels.js";
import { GARMENT_IDS, garment } from "../garments.js";

const fixture = JSON.parse(readFileSync(fileURLToPath(new URL("./fixtures/labels-2x1.json", import.meta.url)), "utf8"));

describe("the 2 x 1 in and sticker rolls are exactly as before", () => {
  for (const c of fixture.cases) {
    it(`${c.name}: byte-identical`, () => {
      expect(labelsZPL(c.labels, labelSize(c.size), c.kind)).toBe(c.zpl);
    });
  }
  it("a garment and spots on a 2 x 1 in ticket change nothing", () => {
    const c = fixture.cases.find(x => x.name === "flag 2x1");
    const marked = c.labels.map(l => ({ ...l, garment: "pants", spots: [{ side: "front", x: 0.3, y: 0.3 }, { side: "back", x: 0.6, y: 0.8 }] }));
    expect(labelsZPL(marked, labelSize("2x1"), "flag")).toBe(c.zpl);
    const s = fixture.cases.find(x => x.name === "flag 1x0.5");
    expect(labelsZPL(marked, labelSize("1x0.5"), "flag")).toBe(s.zpl);
  });
  it("repageLists leaves a one-page-a-label roll alone", () => {
    const lists = fixture.cases.find(x => x.name === "lists 2x1").labels;
    expect(repageLists(lists, labelSize("2x1"))).toBe(lists);
    expect(repageLists(lists, labelSize("2.25x1.25"))).toBe(lists);
  });
});

// Every element of a label as a box in dots: { x, y, w, h, kind, line }.
function boxes(zpl) {
  return zpl.split("\n").filter(l => l.startsWith("^FO")).map(l => {
    const [, x, y] = l.match(/^\^FO(-?\d+),(-?\d+)/).map(Number);
    let m;
    if ((m = l.match(/\^GB(\d+),(\d+),(\d+)/))) return { x, y, w: +m[1], h: +m[2], kind: "GB", line: l };
    if ((m = l.match(/\^GD(\d+),(\d+),(\d+)/))) return { x, y, w: +m[1], h: +m[2], kind: "GD", line: l };
    if ((m = l.match(/\^GC(\d+),(\d+)/))) return { x, y, w: +m[1], h: +m[1], t: +m[2], kind: "GC", line: l };
    const f = l.match(/\^A0N,(\d+),(\d+)/), fb = l.match(/\^FB(\d+),(\d+)/), text = l.match(/\^FD(.*)\^FS$/)[1];
    const w = fb ? +fb[1] : Math.ceil(textUnits(text) * +f[2]);
    return { x, y, w, h: +f[1] * (fb ? +fb[2] : 1), kind: "text", text, line: l };
  });
}
const mm2 = size => Math.round(size.dpi * 2 / 25.4);
const spots3 = [{ side: "front", x: 0.3, y: 0.5 }, { side: "back", x: 0.7, y: 0.4 }, { side: "front", x: 0.6, y: 0.9 }];
const ticket = (garment, spots = []) => ({ number: "88", name: "VANDERMEULEN", reason: "Twill peeling", team: "Navy", size: "A-L", orderNumber: "264247", station: "St 1", garment, spots });

describe("the tall flag ticket", () => {
  it("is tall from 2.5 in on a roll at least 2 in wide", () => {
    expect(isTallTicket(labelSize("2x4"))).toBe(true);
    expect(isTallTicket(labelSize("2x3"))).toBe(true);
    expect(isTallTicket(labelSize("2x1"))).toBe(false);
    expect(isTallTicket(labelSize("1x4"))).toBe(false);
  });
  for (const spec of ["2x4", "2x3"]) {
    const size = labelSize(spec);
    for (const kind of GARMENT_IDS) {
      it(`${spec}, ${kind}: every element on the label and 2 mm clear of the left edge; the black column stops at the band`, () => {
        for (const spots of [[], spots3]) {
          const z = flagLabelZPL(ticket(kind, spots), size);
          expect(z).toContain(`^LL${size.h + FLAG_LIFT}`);
          expect(z).toContain(`^LT${-FLAG_LIFT}`);
          expect(z).toContain("^PQ2");
          const all = boxes(z), [black, ...rest] = all;
          expect(black.line).toMatch(/^\^FO0,0\^GB/);
          expect(black.y + black.h).toBe(size.dpi + FLAG_LIFT + 4);
          for (const b of rest) {
            expect(b.x, b.line).toBeGreaterThanOrEqual(mm2(size));
            expect(b.x + b.w, b.line).toBeLessThanOrEqual(size.w);
            expect(b.y, b.line).toBeGreaterThanOrEqual(0);
            expect(b.y + b.h, b.line).toBeLessThanOrEqual(size.h);
          }
          const below = rest.filter(b => b.y > black.y + black.h);   // the garment part
          expect(below.some(b => b.kind === "GD" || b.kind === "GB")).toBe(true);
          expect(below.find(b => b.kind === "text" && b.text.startsWith("FRONT · ")).text).toBe(`FRONT · ${garment(kind).label}`);
          expect(below.some(b => b.text === "BACK")).toBe(true);
          expect(below.some(b => b.text === "Not marked")).toBe(spots.length === 0);
          // the band's texts are all above the column's end
          for (const t of rest.filter(b => b.kind === "text" && !below.includes(b))) expect(t.y + t.h).toBeLessThanOrEqual(black.y + black.h);
        }
      });
    }
  }
  it("each spot is a filled ^GC with a ring and its number in white, in its own side's panel", () => {
    for (const [spec, kind] of [["2x4", "hockey"], ["2x4", "tank"], ["2x4", "pants"], ["2x3", "hockey"], ["2x3", "socks"]]) {
      const size = labelSize(spec), { panels } = flagPanels(kind, size);
      const z = flagLabelZPL(ticket(kind, spots3), size);
      const circles = boxes(z).filter(b => b.kind === "GC");
      const filled = circles.filter(c => c.t === c.w), rings = circles.filter(c => c.t !== c.w);
      expect(filled).toHaveLength(3);
      expect(rings).toHaveLength(3);
      spots3.forEach((s, i) => {
        const c = filled.find(f => {
          const cx = f.x + f.w / 2, cy = f.y + f.h / 2, p = panels[s.side];
          return Math.abs(cx - (p.dx + s.x * p.dw)) <= 1 && Math.abs(cy - (p.dy + s.y * p.dh)) <= 1;
        });
        expect(c, `${spec} ${kind} spot ${i + 1}`).toBeTruthy();
        const p = panels[s.side];
        expect(c.x).toBeGreaterThanOrEqual(p.x);
        expect(c.x + c.w).toBeLessThanOrEqual(p.x + p.w);
        expect(c.y).toBeGreaterThanOrEqual(p.y);
        expect(c.y + c.h).toBeLessThanOrEqual(p.y + p.h);
      });
      for (const n of ["1", "2", "3"]) expect(z).toMatch(new RegExp(`\\^FR\\^FD${n}\\^FS`));
    }
  });
  it("wide garments are stacked, tall ones side by side; the front is first (top or left)", () => {
    const size = labelSize("2x4");
    expect(flagPanels("hockey", size).across).toBe(false);
    expect(flagPanels("pants", size).across).toBe(true);
    expect(flagPanels("socks", size).across).toBe(true);
    const h = flagPanels("hockey", size).panels, p = flagPanels("pants", size).panels;
    expect(h.front.y).toBeLessThan(h.back.y);
    expect(p.front.x).toBeLessThan(p.back.x);
  });
  it("an unknown or empty garment draws the hockey jersey", () => {
    const size = labelSize("2x4");
    const hockey = flagLabelZPL(ticket("hockey"), size);
    expect(flagLabelZPL(ticket(""), size).replace("FRONT · Hockey jersey", "")).toBe(hockey.replace("FRONT · Hockey jersey", ""));
    expect(flagLabelZPL(ticket("cape"), size)).toBe(flagLabelZPL(ticket(""), size));
  });
  it("the top inch is today's ticket: the same texts as a 2 x 1 in ticket", () => {
    const texts = z => boxes(z).filter(b => b.kind === "text").map(b => b.line);
    const one = texts(flagLabelZPL(ticket("hockey"), labelSize("2x1")));
    expect(texts(flagLabelZPL(ticket("hockey"), labelSize("2x4"))).slice(0, one.length)).toEqual(one);
  });
});

describe("box label and count label on a tall roll", () => {
  const size = labelSize("2x4");
  it("lay out in a band at the top, the label as long as the roll", () => {
    const label = { bin: "5.1", label: "Navy", by: "team", count: 14, orderNumber: "264247" };
    const count = binListLabels([{ number: "7", name: "SMITH", size: "A-L", team: "Navy" }], { bin: "5.1", label: "Navy", orderNumber: "264247" }).at(-1);
    for (const z of [binLabelZPL(label, size), binListZPL(count, size)]) {
      expect(z).toContain(`^LL${size.h}`);
      for (const b of boxes(z)) {
        expect(b.x).toBeGreaterThanOrEqual(mm2(size));
        expect(b.y + b.h).toBeLessThanOrEqual(Math.round(size.w * 1.25 / 2));   // 1.25 in on a 2 in roll
      }
    }
  });
  it("BOX 5.1 is as big as on the 2 x 1 in roll", () => {
    const font = z => +z.split("\n").find(l => l.endsWith("^FDBOX 5.1^FS")).match(/\^A0N,(\d+)/)[1];
    const label = { bin: "5.1", label: "Navy", by: "team", orderNumber: "264247" };
    expect(font(binLabelZPL(label, size))).toBe(font(binLabelZPL(label, labelSize("2x1"))));
  });
});

describe("lists on a tall roll", () => {
  const rows = n => Array.from({ length: n }, (_, i) => ({ number: String(i + 1), name: `P${i + 1}`, size: "A-L", team: "Navy" }));
  it("pages a label: whole inches; rows a label: 56 on 2 x 4, 28 lines for the DAMAGED and boxes lists", () => {
    expect(pagesPerLabel(labelSize("2x4"))).toBe(4);
    expect(pagesPerLabel(labelSize("2x3"))).toBe(3);
    expect(pagesPerLabel(labelSize("2x1"))).toBe(1);
    expect(pagesPerLabel(labelSize("1x0.5"))).toBe(1);
    expect(rowsPerLabel(labelSize("2x4"))).toBe(56);
    expect(rowsPerLabel(labelSize("2x4"), true)).toBe(28);
  });
  it("a 70-jersey box list: two pages of 56 and 14, last page first, the count label last, in number order", () => {
    const size = labelSize("2x4");
    const out = repageLists(binListLabels(rows(70), { bin: "1.1", label: "Navy", orderNumber: "264247" }), size);
    expect(out.map(l => [l.page, l.pages, l.items.length, !!l.title])).toEqual([[2, 2, 14, false], [1, 2, 56, false], [0, 2, 0, true]]);
    expect(out[1].items[0]).toBe("1-P1-AL");
    expect(out[0].items.at(-1)).toBe("70-P70-AL");
    expect([...out[1].items, ...out[0].items]).toEqual(rows(70).map(r => `${r.number}-${r.name}-AL`));
  });
  it("two boxes' lists and a DAMAGED list in one print: each re-paged on its own, the order kept", () => {
    const size = labelSize("2x4");
    const a = binListLabels(rows(30), { bin: "1.1", label: "Navy", orderNumber: "1" });
    const b = binListLabels(rows(3), { bin: "2.1", label: "Red", orderNumber: "1" });
    const d = damagedListLabels(rows(30).map(r => ({ ...r, reason: "Holes" })), { orderNumber: "1" });
    const x = boxesListLabels(rows(9).map(r => `Box ${r.number}`), { title: "DONE BOXES" });
    const out = repageLists([...a, ...b, ...d, ...x], size);
    expect(out.map(l => [l.bin, l.page, l.pages, l.items.length, !!l.title])).toEqual([
      ["1.1", 1, 1, 30, false], ["1.1", 0, 1, 0, true],
      ["2.1", 1, 1, 3, false], ["2.1", 0, 1, 0, true],
      ["DAMAGED", 2, 2, 2, false], ["DAMAGED", 1, 2, 28, false],
      ["DONE BOXES", 1, 1, 9, false],
    ]);
  });
  it("labelsZPL re-pages: 30 jerseys are one list label and the count label; rows keep the 2 x 1 in height and stay on the label", () => {
    const size = labelSize("2x4");
    const z = labelsZPL(binListLabels(rows(30), { bin: "1.1", label: "Navy", orderNumber: "264247" }), size, "binlist");
    const blocks = z.split("^XZ").filter(s => s.includes("^XA"));
    expect(blocks).toHaveLength(2);
    const items = boxes(blocks[0]);
    expect(items).toHaveLength(30);
    const one = boxes(binListZPL(binListLabels(rows(14), { bin: "1.1" })[0], labelSize("2x1")));
    expect(items[1].y - items[0].y).toBe(one[1].y - one[0].y);
    expect(items[0].line.match(/\^A0N,\d+/)[0]).toBe(one[0].line.match(/\^A0N,\d+/)[0]);
    for (const b of items) { expect(b.x).toBeGreaterThanOrEqual(mm2(size)); expect(b.y + b.h).toBeLessThanOrEqual(size.h); }
    expect(items[28].x).toBeGreaterThan(items[27].x);   // the 29th jersey starts the right column
    const d = labelsZPL(damagedListLabels(rows(28).map(r => ({ ...r, reason: "Holes" }))), size, "binlist");
    const lines = boxes(d);
    expect(d.split("^XZ").filter(s => s.includes("^XA"))).toHaveLength(1);
    for (const b of lines) expect(b.y + b.h).toBeLessThanOrEqual(size.h);
  });
});

describe("the stage-2 review follow-ups", () => {
  it("isTallTicket and pagesPerLabel both count dots: a 300 dpi roll agrees with the same roll at 203 dpi", () => {
    for (const spec of ["2x4", "2x3", "2x2.5", "2x1", "1x4", "1.9x4"]) {
      expect(isTallTicket(labelSize(spec, 300))).toBe(isTallTicket(labelSize(spec)));
      expect(pagesPerLabel(labelSize(spec, 300))).toBe(pagesPerLabel(labelSize(spec)));
    }
    expect(isTallTicket(labelSize("2x2.5"))).toBe(true);
    expect(isTallTicket({ w: 406, h: 812, dpi: 203 })).toBe(true);   // dots alone, no inches
  });
  it("side by side, the drawing sits right under its caption; the outline (not its box) fills the panel's width or height", () => {
    const size = labelSize("2x4");
    for (const kind of ["pants", "socks", "tank"]) {
      const { across, panels } = flagPanels(kind, size);
      expect(across).toBe(true);
      const g = garment(kind), xs = g.outline.map(p => p[0]), ys = g.outline.map(p => p[1]);
      for (const side of ["front", "back"]) {
        const p = panels[side];
        const top = p.dy + Math.min(...ys) * p.dh, bottom = p.dy + Math.max(...ys) * p.dh;
        const left = p.dx + Math.min(...xs) * p.dw, right = p.dx + Math.max(...xs) * p.dw;
        expect(Math.abs(top - (p.y + p.cap + p.capGap)), `${kind} top`).toBeLessThanOrEqual(1);
        expect(left).toBeGreaterThanOrEqual(p.x - 1);
        expect(right).toBeLessThanOrEqual(p.x + p.w);
        expect(bottom).toBeLessThanOrEqual(p.y + p.h);
        // it touches the panel's sides or its bottom: nothing left over in both ways
        const roomX = p.w - (right - left), roomY = p.y + p.h - bottom;
        expect(Math.min(roomX, roomY), kind).toBeLessThanOrEqual(6);
      }
    }
  });
  it("a spot on the top edge is drawn under the caption, never over it", () => {
    for (const [spec, kind] of [["2x4", "pants"], ["2x4", "hockey"], ["2x3", "socks"]]) {
      const size = labelSize(spec), { panels } = flagPanels(kind, size);
      const z = flagLabelZPL(ticket(kind, [{ side: "front", x: 0.5, y: 0 }]), size);
      const ring = boxes(z).find(b => b.kind === "GC" && b.t !== b.w);
      expect(ring.y, `${spec} ${kind}`).toBeGreaterThanOrEqual(panels.front.y + panels.front.cap + panels.front.capGap);
    }
  });
  it("a box label and a count label on a short odd roll (not tall, one list page) use the whole label, as before", () => {
    const size = labelSize("1.5x1.8");
    const label = { bin: "5.1", label: "Navy", by: "team", count: 14, orderNumber: "264247" };
    const footer = boxes(binLabelZPL(label, size)).find(b => b.text?.startsWith("Order"));
    expect(footer.y + footer.h).toBeGreaterThan(size.h * 0.8);
  });
});

describe("listChunks: a long print is cut between lists, never inside one", () => {
  const rows = (n, team = "Navy") => Array.from({ length: n }, (_, i) => ({ number: String(i + 1), name: `P${i + 1}`, size: "A-L", team }));
  it("whole lists only, at most `max` labels a chunk, nothing lost or reordered", () => {
    const lists = [];
    for (let b = 1; b <= 12; b++) lists.push(...binListLabels(rows(100, `T${b}`), { bin: `${b}.1`, label: `T${b}`, orderNumber: "1" }));   // 8 labels each
    lists.push(...damagedListLabels(rows(30).map(r => ({ ...r, reason: "Holes" })), { orderNumber: "1" }));
    const chunks = listChunks(lists, 20);
    expect(chunks.flat()).toEqual(lists);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(20);
      // each chunk ends a list: a count label, or the DAMAGED list's first page (printed last)
      const last = c.at(-1);
      expect(last.title || (last.damaged && last.page === 1)).toBeTruthy();
    }
    expect(chunks.length).toBeGreaterThan(1);
  });
  it("a list longer than `max` is cut where it must; a short print is one chunk", () => {
    const one = binListLabels(rows(400), { bin: "1.1", label: "Navy", orderNumber: "1" });   // 29 pages + the count label
    expect(listChunks(one, 20).map(c => c.length)).toEqual([20, 10]);
    expect(listChunks(one.slice(0, 5), 100)).toEqual([one.slice(0, 5)]);
    expect(listChunks([], 100)).toEqual([]);
  });
});
