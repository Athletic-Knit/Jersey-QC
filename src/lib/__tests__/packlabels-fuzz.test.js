// A combinations test for the packing paperwork (the owner, 25 Nov 2026): a few hundred random orders go through
// the real chain (printjobs.js builds the label objects, packlabels.js lays them out and records the box of every
// field it prints), on the 2 x 3, 2 x 4 and 2 x 1 in rolls, and the recorded boxes are checked: every field inside
// its page, no two text fields touching, no rule through a text, the WEIGHT box over nothing, every garment on the
// packing list once, the outside label's counts equal to what is in the box, the sign-off's totals adding up.
// Seeded, so a failure repeats: the message says the seed, the order and the roll. FUZZ_ORDERS=2000 runs more.
import { describe, it, expect } from "vitest";
import process from "node:process";
import { labelSize } from "../labels.js";
import { packListLabel, layoutPackList, layoutBoxFace, layoutSignoff } from "../packlabels.js";
import { buildBinMap, closeBin, shortSize } from "../roster.js";
import { packBoxes, boxFaceLabel, signoffLabel } from "../printjobs.js";

const ORDERS = Number(process.env.FUZZ_ORDERS) || 300;
const ROLLS = [["2x3", labelSize("2x3")], ["2x4", labelSize("2x4")], ["2x1", labelSize("2x1")]];

// ── a seeded random order ─────────────────────────────────────────────────────
function prng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const RACK = ["Y-XS", "Y-S", "Y-M", "Y-L", "Y-XL", "A-XS", "A-S", "A-M", "A-L", "A-XL", "A-2XL", "A-3XL"], ODD = ["OSFA", "4XL"];
const SPECIAL_TEAMS = ["U11 Tigers", "Mississauga Minor Hockey Association", "A", "WWWWWWWWWWWWWWWWWWWWWWWWWWMMMM", "U15 AA Thunder Bay Kings"];
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
function make(seed) {
  const r = prng(seed), int = (a, b) => a + Math.floor(r() * (b - a + 1)), pick = list => list[Math.floor(r() * list.length)];
  const word = n => Array.from({ length: n }, () => LETTERS[Math.floor(r() * LETTERS.length)]).join("");
  const phrase = n => { let s = ""; while (s.length < n) s += (s ? " " : "") + word(int(1, 9)); return s.slice(0, n).trim(); };
  const nSizes = r() < 0.08 ? int(13, 16) : int(1, 12), pool = [...RACK, ...ODD, "5XL", "6XL", "XXS", "LT"].sort(() => r() - 0.5), sizes = pool.slice(0, nSizes);
  const nTeams = int(1, 9), teams = new Set();
  while (teams.size < nTeams) teams.add(r() < 0.35 ? pick(SPECIAL_TEAMS) : phrase(int(2, 30)));
  const by = r() < 0.25 ? "size" : "team";
  const customer = r() < 0.15 ? "" : phrase(int(1, 45));
  const orderNumber = r() < 0.1 ? String(int(0, 9999)).padEnd(int(10, 18), "7") : String(int(0, 9999));
  const rows = []; let id = 0;
  for (const team of teams) {
    const n = Math.floor(3 + Math.pow(r(), 4) * 297), split = r() < 0.4 ? int(1, n - 1) : n;
    for (let i = 0; i < n; i++) rows.push({ _id: id++, team, size: pick(sizes), number: String(int(0, 9999)), name: r() < 0.1 ? "" : r() < 0.2 ? word(int(20, 30)).toUpperCase() : word(int(2, 14)).toUpperCase(), scanned: i < split ? "pass" : "later", _split: split < n && i === split - 1 });
  }
  // flagged and missing ones, and a few with nothing in the team or size column
  for (const x of rows) { const q = r(); if (q < 0.03) x.scanned = "flag"; else if (q < 0.05) x.scanned = "missing"; if (r() < 0.01) x.team = ""; }
  return { seed, by, customer, orderNumber, rows, teams: [...teams], sizes };
}
// The order as the station holds it at Finish: every box with its garments, a team's first box closed when it was split.
function pack(o) {
  let roster = o.rows.map(x => ({ ...x })), binMap = buildBinMap(roster, {}, o.by), closed = [];
  if (!Object.keys(binMap).filter(k => k !== "__by").length) return null;
  if (o.by === "team") {
    for (const t of o.teams) {
      const mine = roster.filter(x => x.team === t);
      if (mine.some(x => x.scanned === "later")) {
        const bin = Object.entries(binMap).find(([k]) => k.toLowerCase() === t.toLowerCase())?.[1];
        if (bin !== undefined) { const c = closeBin(roster, binMap, closed, String(bin)); binMap = c.binMap; closed = c.closed; }
      }
    }
  }
  roster = roster.map(x => (x.scanned === "later" ? { ...x, scanned: "pass" } : x));
  return { orderNumber: o.orderNumber, customer: o.customer, roster, binMap, closedBins: closed, carried: [], finished: true };
}

// ── geometry ──────────────────────────────────────────────────────────────────
const right = b => b.lx + b.w, bottom = b => b.ly + b.h;
const apart = (a, b, gap) => right(a) + gap <= b.lx || right(b) + gap <= a.lx || bottom(a) + gap <= b.ly || bottom(b) + gap <= a.ly;
const inside = (a, f) => a.lx >= f.lx && right(a) <= right(f) && a.ly >= f.ly && bottom(a) <= bottom(f);
const where = (ctx, p, b) => `${ctx} page ${p} box ${JSON.stringify(b)}`;
// `textGap`: the least space between two texts (the landscape labels keep 6; the portrait packing list and sign-off
// were fixed on paper with a header 4 dots over the line below it, which the byte-for-byte fixtures pin).
function check(pages, ctx, { textGap = 6 } = {}) {
  pages.forEach((pg, p) => {
    const { PAGE_W, PAGE_H, boxes } = pg;
    for (const b of boxes) {
      const bad = b.lx < 0 || b.ly < 0 || right(b) > PAGE_W || bottom(b) > PAGE_H;
      if (bad) throw new Error(`outside the page ${PAGE_W}x${PAGE_H}: ${where(ctx, p, b)}`);
    }
    const texts = boxes.filter(b => b.kind === "text"), rules = boxes.filter(b => b.kind === "rule"), fills = boxes.filter(b => b.kind === "fill"), frames = boxes.filter(b => b.kind === "frame");
    for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i], b = texts[j];
      if (a.rev || b.rev) continue;   // white on a black band: checked against its band below
      if (frames.length && frames.some(f => inside(a, f) && inside(b, f))) continue;   // two texts in one frame
      if (!apart(a, b, textGap)) throw new Error(`texts touch: ${where(ctx, p, a)} and ${JSON.stringify(b)}`);
    }
    for (const rl of rules) for (const t of texts) if (!apart(rl, t, 0)) throw new Error(`a rule crosses a text: ${JSON.stringify(rl)} and ${where(ctx, p, t)}`);
    for (const t of texts) {
      if (t.rev) { if (!fills.some(f => inside(t, f))) throw new Error(`white text outside every band: ${where(ctx, p, t)}`); }
      else for (const f of fills) if (!apart(f, t, 0)) throw new Error(`a band and a text: ${JSON.stringify(f)} and ${where(ctx, p, t)}`);
    }
    for (const f of frames) {
      for (const o of boxes) { if (o === f) continue; if (o.kind === "text" && inside(o, f)) continue; if (!apart(o, f, 6)) throw new Error(`the frame ${JSON.stringify(f)} touches ${where(ctx, p, o)}`); }
    }
  });
}
const texts = pg => pg.boxes.filter(b => b.kind === "text");
// What the random orders reached, so that the test proves it tried every branch of the layouts.
const seen = { oneLineName: 0, twoLineName: 0, cutName: 0, weightBeside: 0, weightBelow: 0, teamsMore: 0, sizesMore: 0, fourColSizes: 0, cutTeam: 0, squeezedOrderNo: 0, bands: 0, listPages2: 0 };
function saw(face, pages) {
  const id = pages[1].boxes, big = id.filter(b => b.kind === "text" && (b.h === 100 || b.h === 80));
  if (big.length === 1) seen.oneLineName++;
  if (big.length === 2) seen.twoLineName++;
  if (big.some(b => b.text.endsWith("…"))) seen.cutName++;
  if (id.find(b => b.kind === "frame").ly === 38) seen.weightBeside++; else seen.weightBelow++;
  if (face.teams.length > 8) seen.teamsMore++;
  if (face.sizes.length > 12) seen.sizesMore++;
  if (face.sizes.length > 9) seen.fourColSizes++;
  if (texts(pages[0]).some(b => b.text.endsWith("…") && b.h < 40)) seen.cutTeam++;
  if (id.some(b => b.kind === "text" && b.h === 110 && b.fw < 92)) seen.squeezedOrderNo++;
}

// The packing list of `rows`: every garment once, a name inside its column, pages 1..N printed last first.
function listChecks(rows, bin, label, orderNumber, by, size, ctx) {
  const pl = layoutPackList(packListLabel(rows, { bin, label, orderNumber, by }), size);
  const step = Math.floor((size.w - 16) / 3), colW = step - 22;
  check(pl.pages, `${ctx} box ${bin} list`, { textGap: 0 });
  const numbers = pl.pages.flatMap(pg => texts(pg).filter(t => t.h === 34 && t.ly >= 104)).map(t => t.text).sort();
  expect(numbers, `${ctx} box ${bin} every garment once`).toEqual(rows.map(x => String(x.number ?? "").trim() || "-").sort());
  for (const pg of pl.pages) for (const t of texts(pg).filter(t => t.h === 24 && t.ly >= 104 && !t.rev)) {
    const c0 = 20 + Math.floor((t.lx - 20) / step) * step;
    expect(right(t), `${ctx} box ${bin} a name ends inside its column: ${t.text}`).toBeLessThanOrEqual(c0 + colW);
  }
  const n = pl.pages.length, nos = pl.pages.map(pg => (texts(pg).find(t => t.h === 24 && t.ly === 18)?.text || "").match(/ - (\d+)\/(\d+)$/));
  expect(nos.every(Boolean), `${ctx} page header`).toBe(true);
  expect(nos.map(m => Number(m[1])), `${ctx} pages last first`).toEqual(Array.from({ length: n }, (_, i) => n - i));
  expect(nos.every(m => Number(m[2]) === n)).toBe(true);
  if (n > 1) seen.listPages2++;
  if (pl.pages.some(pg => pg.boxes.some(x => x.kind === "fill"))) seen.bands++;
}

describe("packing labels: random orders", () => {
  const meta = { date: "2026-11-25", time: "14:32", station: "Station 1", operator: "Person 1" };
  for (let k = 0; k < ORDERS; k++) {
    const seed = 1000 + k * 7919;
    it(`order ${k} (seed ${seed})`, () => {
      const o = make(seed), pk = pack(o);
      if (!pk) return;
      const boxes = packBoxes(pk).filter(b => b.count > 0), by = o.by;
      expect(boxes.length).toBeGreaterThan(0);
      // The sign-off's totals add up.
      const so = signoffLabel(pk, meta), faces = boxes.map(b => boxFaceLabel(pk, b));
      expect(so.bySize.reduce((n, s) => n + s.passed, 0), `seed ${seed} sign-off per size`).toBe(so.passed);
      expect(so.passed + so.flagged + so.missing, `seed ${seed} sign-off totals`).toBe(so.total);
      for (const [rollName, size] of ROLLS) {
        const tall = rollName !== "2x1", ctx = `seed ${seed} roll ${rollName}`;
        // ── the sign-off ticket
        const lay = layoutSignoff(so, size);
        check(lay.pages, `${ctx} signoff`, { textGap: 0 });
        const all = lay.pages.flatMap(texts).map(b => b.text);
        if (tall) { expect(all, `${ctx} passed shown`).toContain(String(so.passed)); for (const s of so.bySize) expect(all.some(t => t === String(s.passed)), `${ctx} size ${s.size} count`).toBe(true); }
        else expect(all, `${ctx} passed shown`).toContain(`PASSED ${so.passed}`);
        expect(all, `${ctx} totals line`).toContain(`Flagged ${so.flagged} - Missing ${so.missing} - of ${so.total} - Boxes ${so.boxes}`);
        boxes.forEach((b, bi) => {
          // ── the outside label
          const face = faces[bi], fl = layoutBoxFace(face, size);
          expect(fl.pages.length, `${ctx} pages of the outside label`).toBe(tall ? 2 : 1);
          expect((fl.zpl.match(/\^XA/g) || []).length).toBe(fl.pages.length);
          check(fl.pages, `${ctx} box ${b.bin} outside`, { textGap: tall ? 6 : 0 });
          // what the label is built from equals what is in the box
          const teamOf = x => String(x.team ?? "").trim() || String(b.label || ""), sizeOf = x => shortSize(String(x.size ?? "").trim());
          const tally = (list, f) => { const m = new Map(); list.forEach(x => { const key = f(x).toLowerCase(); m.set(key, (m.get(key) || 0) + 1); }); return m; };
          const tm = tally(b.rows, teamOf), sm = tally(b.rows, sizeOf);
          expect(face.teams.reduce((n, t) => n + t.inBox, 0), `${ctx} teams in box`).toBe(b.rows.length);
          expect(face.sizes.reduce((n, t) => n + t.inBox, 0), `${ctx} sizes in box`).toBe(b.rows.length);
          for (const t of face.teams) expect(t.inBox, `${ctx} team ${t.team}`).toBe(tm.get(t.team.toLowerCase()));
          for (const t of face.sizes) expect(t.inBox, `${ctx} size ${t.size}`).toBe(sm.get(t.size.toLowerCase()));
          if (tall) {
            // ... and what is printed is that: every count whole, "+N more" when cells are left out
            const detail = texts(fl.pages[0]).map(x => x.text), id = texts(fl.pages[1]).map(x => x.text);
            expect(id, `${ctx} ID label says the box`).toContain(`Box ${face.boxNo} of ${face.boxes}`);
            expect(id).toContain("WEIGHT");
            expect(detail.some(t => t.startsWith("BOX ")), `${ctx} detail says the box`).toBe(true);
            expect(detail.some(t => t.startsWith("ORDER ")), `${ctx} detail says the order`).toBe(true);
            const cnt = detail.map(t => t.match(/(?:^| )(\d+)\/(\d+)$/)).filter(Boolean).map(m => `${m[1]}/${m[2]}`).sort();
            const shown = [...(face.teams.length > 8 ? face.teams.slice(0, 7) : face.teams), ...(face.sizes.length > 12 ? face.sizes.slice(0, 11) : face.sizes)].map(t => `${t.inBox}/${t.ofOrder}`).sort();
            expect(cnt, `${ctx} box ${b.bin} detail counts`).toEqual(shown);
            if (face.teams.length > 8) expect(detail, `${ctx} +N more teams`).toContain(`+${face.teams.length - 7} more`);
            if (face.sizes.length > 12) expect(detail, `${ctx} +N more sizes`).toContain(`+${face.sizes.length - 11} more`);
            // the ID label: the order number (squeezed, cut only when absurd), the customer in capitals (a cut keeps its start), on one or two lines
            expect(id.some(t => t === String(face.orderNumber) || (t.endsWith("…") && String(face.orderNumber).startsWith(t.slice(0, -1)))), `${ctx} order number`).toBe(true);
            const nm = fl.pages[1].boxes.filter(t => t.kind === "text" && (t.h === 100 || t.h === 80)).map(t => t.text), want = String(face.customer).toUpperCase().replace(/\s+/g, "");
            if (want) { const got = nm.join("").replace(/\s+/g, ""); expect(got === want || (got.endsWith("…") && want.startsWith(got.slice(0, -1))), `${ctx} customer ${got}`).toBe(true); }
            saw(face, fl.pages);
          }
          // ── the packing list (tall rolls only: the short roll prints rows)
          if (tall) listChecks(b.rows, b.bin, b.label, pk.orderNumber, by, size, ctx);
          // a box of several teams (the app cannot make one yet, the layout can): a band a team
          if (tall && bi === 0 && boxes.length > 1) listChecks(boxes.slice(0, 4).flatMap(x => x.rows.slice(0, 30)), "9.9", "Mixed", pk.orderNumber, "team", size, ctx);
        });
      }
    });
  }
  it("the random orders reached every layout branch", () => {
    for (const [name, n] of Object.entries(seen)) expect(n, name).toBeGreaterThan(0);
  });
});
