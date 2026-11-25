// The packing paperwork of a box, as ZPL for the tall rolls (the owner, 25 Nov 2026,
// settled on paper on the 2 x 3 in roll): the packing list as a table, the outside
// label and the sign-off ticket. The geometry is the hand-written ZPL the owner
// approved (406 x 609 dots), scaled to the roll: the width of the 2 in rolls is
// always 406, the height decides how many rows a column holds.
//
// Label objects (built at the station, laid out here by the hub):
//   { kind: "packlist", bin, team, orderNumber, pcs, copies,
//     groups: [{ team, pcs, sizes: [{ size, rows: [{ number, name }] }] }] }
//   { kind: "boxface", bin, boxNo, boxes, orderNumber, customer,
//     teams: [{ team, inBox, ofOrder }], sizes: [{ size, inBox, ofOrder }] }   (two labels: detail, then ID)
//   { kind: "signoff", orderNumber, customer, teams, date, time, station, operator,
//     bySize: [{ size, passed }], passed, flagged, missing, total, boxes }
// Each of them is laid out whole by its function below, which returns the ZPL of
// every label it needs (the list: every page, last page first).
// The tall rolls are the flag ticket's (`isTallTicket` in labels.js: 2 in wide, 2.5 in or more high).
import { textUnits, byNumber, isTallTicket } from "./labels.js";
import { bySize, shortSize } from "./roster.js";

// Every page of a packing list comes out this many times (the owner, 25 Nov 2026: "print 4 of this").
export const LIST_COPIES = 4;

const safe = s => String(s ?? "").replace(/[\^~]/g, " ");
// Every label of this module records the box of each field it lays out (the page is `{ PAGE_W, PAGE_H, boxes }`,
// boxes `{ kind, lx, ly, w, h, text }` in the page as it is READ: a landscape page is the roll's length wide), so a
// test can read what the printer will be given. `head` starts a page; `recorded` collects the pages of one call.
let sink = null, cur = null;
const head = (w, h, rec = { PAGE_W: w, PAGE_H: h, boxes: [] }) => {
  const z = ["^XA", "^CI28", `^PW${w}`, `^LL${h}`, "^LH0,0", "^LT0"];
  z.pg = rec; cur = rec; if (sink) sink.push(rec);
  return z;
};
const on = z => { cur = z.pg; return z; };   // the page the next fields belong to (a label made before another is filled)
const note = (kind, lx, ly, w, h, text) => { if (cur && w > 0 && h > 0) cur.boxes.push({ kind, lx, ly, w, h, ...(text === undefined ? {} : { text }) }); };
function recorded(build) {
  const was = sink; sink = []; cur = null;
  try { const zpl = build(); return { zpl, pages: sink }; } finally { sink = was; cur = null; }
}
// How many dots a text takes at letter width `fw`. labels.js's `textUnits` is the safe (wide)
// estimate; font 0 prints at about 0.85 of it (the paper trial of 25 Nov 2026: six capitals of
// the 24-dot name behind a two-digit number fitted the 108-dot column). Every width on these
// labels is measured with it.
const PRINTED = 0.85;
const dotsOf = (text, fw) => Math.ceil(textUnits(text) * fw * PRINTED);
// The widest letters (at most `fw`) at which `text` takes no more than `room` dots by `dotsOf`; 0 when not even 1 fits.
// The one place a letter width is worked out from a room: `txt` and `place` both squeeze through it.
const fwFor = (text, fw, room) => {
  let f = Math.max(0, Math.min(fw, Math.floor(room / (textUnits(text) * PRINTED))));
  while (f > 0 && dotsOf(text, f) > room) f--;   // the rounding up of dotsOf
  return f;
};
// `text` cut with "…" so that it takes at most `room` dots at letter width `fw` ("" when not even one letter fits).
function cutTo(text, fw, room) {
  const t = String(text ?? "").trim(), ch = [...t];
  if (dotsOf(t, fw) <= room) return t;
  // The longest start that fits: its width only grows with its length, so a halving search finds it.
  const at = k => ch.slice(0, k).join("").trimEnd() + "…";
  let lo = 0, hi = ch.length - 1;   // at(lo) fits (lo 0: nothing does yet), at(hi + 1) does not
  while (lo < hi) { const k = Math.ceil((lo + hi) / 2); if (dotsOf(at(k), fw) <= room) lo = k; else hi = k - 1; }
  return lo > 0 ? at(lo) : "";
}
// A name and what follows it on one line ("U11 TIGERS" + " - BOX 1.1 - 15 pcs - 1/2"): the name is cut
// so that the whole line still fits `width` at letter width `min`; the tail is never cut.
const named = (name, tail, min, width) => cutTo(name, min, width - dotsOf(tail, min)) + tail;
// As many of `items` as fit `room` dots at letter width `fw`, then "+3 more".
function fitList(items, fw, room, sep = ", ") {
  for (let k = items.length; k > 0; k--) {
    const s = items.slice(0, k).join(sep) + (k < items.length ? ` +${items.length - k} more` : "");
    if (dotsOf(s, fw) <= room) return s;
  }
  return items.length ? `${items.length} more` : "";
}
// One line of text, never wider than `width`: the letters get narrower (down from `fw`) until it fits.
const txt = (x, y, fh, fw, width, text, { reverse = false } = {}) => {
  const w = Math.max(6, fwFor(text, fw, width));
  note("text", x, y, dotsOf(text, w), fh, String(text)); if (reverse && cur?.boxes.length) cur.boxes.at(-1).rev = true;
  return `^FO${x},${y}^A0N,${fh},${w}${reverse ? "^FR" : ""}^FD${safe(text)}^FS`;
};
// A field at an exact letter width (the caller has measured it).
const tx = (x, y, fh, fw, text) => { note("text", x, y, dotsOf(text, fw), fh, String(text)); return `^FO${x},${y}^A0N,${fh},${fw}^FD${safe(text)}^FS`; };
const box = (x, y, w, h, t) => { note(Math.min(w, h) <= 3 ? "rule" : "fill", x, y, w, h); return `^FO${x},${y}^GB${w},${h},${t}^FS`; };
const sizeOf = size => ({ w: Number(size?.w) || 406, h: Number(size?.h) || 609 });

// ── The packing list ─────────────────────────────────────────────────────────
// The rows in a box → the label object the hub lays out. One group a team (a box
// of one team has one; the app cannot put two teams in a box yet, the layout
// can); in each group a section a size in rack order, the rows by number, the
// sizes in their short form. On a box sorted by SIZE every row has the same
// size, so the sections are the teams instead.
export function packListLabel(rows, { bin, label = "", orderNumber = "", by = "team", copies = LIST_COPIES } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return null;
  const sizeBox = by === "size", groups = new Map();
  for (const r of [...list].sort(byNumber)) {
    const team = sizeBox ? String(label || "") : String(r.team ?? "").trim() || String(label || ""), gk = team.toLowerCase();
    const g = groups.get(gk) || { team, sections: new Map() };
    const head = sizeBox ? String(r.team ?? "").trim() || "No team" : shortSize(String(r.size ?? "").trim()) || "No size", sk = head.toLowerCase();
    const s = g.sections.get(sk) || { size: head, rows: [] };
    s.rows.push({ number: String(r.number ?? "").trim(), name: String(r.name ?? "").trim() });
    g.sections.set(sk, s); groups.set(gk, g);
  }
  const order = sizeBox ? (a, b) => a.size.localeCompare(b.size, undefined, { sensitivity: "base" }) : (a, b) => bySize(a.size, b.size);
  const gs = [...groups.values()].sort((a, b) => a.team.localeCompare(b.team, undefined, { sensitivity: "base" }))
    .map(g => { const sizes = [...g.sections.values()].sort(order); return { team: g.team, pcs: sizes.reduce((n, s) => n + s.rows.length, 0), sizes }; });
  return { kind: "packlist", bin, team: String(label || gs[0].team), orderNumber: String(orderNumber ?? ""), pcs: list.length, copies, groups: gs };
}

const SEC_HEAD = 44;   // a size's header, the rule under it, and the gap before the first row
const ROW = 40, GAP = 8, BAND = 30, TOP = 104;
const NAME_FW = 19;    // the name's letter width (24 dots high)
const MIN_FW = 14;     // the narrowest letters of a header or band line; a longer team name is cut with "…"
// The number is 34 dots high, its letters 28 wide; past two digits they get narrower, so "100" takes
// about the room of "12" and the name behind it keeps about five letters (the co-op, 25 Nov 2026:
// at full width "#100 VAN…" was too short to be any use).
const numFw = num => (num.length > 2 ? Math.floor(60 / num.length) : 28);
// The sections of a packing list laid onto pages: { pages: [{ blocks: [{ team, pcs, band, top, colTop, colY, cols }] }] }.
// A section (a size's header and its rows) goes whole into the column with the
// least in it where it fits (so a fourth size with one row sits under another
// on the same label); a section longer than a column is split across columns,
// its header repeated; a section that fits nowhere on the page starts the next
// page, and a team's band is drawn again on every page its sections continue on.
export function packListLayout(l, size) {
  const { w, h } = sizeOf(size);
  // At least one row a column, whatever the roll (a short roll never gets here: printJob makes it rows), so the loop below always ends.
  const step = Math.floor((w - 16) / 3), bottom = Math.max(h - 9, TOP + BAND + 8 + SEC_HEAD + ROW);
  const groups = (l.groups || []).map(g => ({ ...g, sizes: (g.sizes || []).filter(s => s.rows?.length) })).filter(g => g.sizes.length);
  const band = groups.length > 1;
  const capAt = y => Math.floor((bottom - y - SEC_HEAD) / ROW);   // rows that fit under a header that starts at y
  const st = { pages: [], page: null, blk: null };
  const newBlock = (st, g, fresh) => {
    if (!st.page || fresh) { st.page = { blocks: [] }; st.pages.push(st.page); }
    const prev = st.page.blocks.at(-1);
    const top = prev ? Math.max(...prev.colY) + 6 : TOP;   // under the block above (its columns end a gap before colY)
    const colTop = top + (band ? BAND + 8 : 0);
    if (prev && capAt(colTop) < 1) return newBlock(st, g, true);   // the band and one row do not fit: the next page
    st.blk = { team: g.team, pcs: g.pcs, band, top, colTop, colY: [colTop, colTop, colTop], cols: [[], [], []] };
    st.page.blocks.push(st.blk);
  };
  const place = (st, g) => {
    newBlock(st, g, false);
    for (const s of g.sizes) {
      let rest = s.rows;
      while (rest.length) {
        const blk = st.blk, cap = c => capAt(blk.colY[c]);
        const fit = [0, 1, 2].filter(c => cap(c) >= rest.length).sort((a, b) => blk.colY[a] - blk.colY[b] || a - b)[0];
        if (fit !== undefined) {
          blk.cols[fit].push({ head: s.size, rows: rest, y: blk.colY[fit] });
          blk.colY[fit] += SEC_HEAD + rest.length * ROW + GAP; rest = [];
          continue;
        }
        const bare = [0, 1, 2].find(c => blk.colY[c] === blk.colTop && cap(c) >= 1);   // a column nothing is in yet: fill it, carry on
        if (bare === undefined) { newBlock(st, g, true); continue; }
        const take = cap(bare);
        blk.cols[bare].push({ head: s.size, rows: rest.slice(0, take), y: blk.colY[bare] });
        blk.colY[bare] += SEC_HEAD + take * ROW + GAP; rest = rest.slice(take);
      }
    }
  };
  for (const g of groups) {
    // A team goes under the one before it when ALL of it fits there; else it starts a page of its own
    // (a team split over two pages only when it is longer than a page).
    if (st.page?.blocks.length) { const t = structuredClone(st); place(t, g); if (t.pages.length > st.pages.length) { st.page = null; } }
    place(st, g);
  }
  return { pages: st.pages, step, bottom };
}

// Every page of the list as ZPL, the last page first; each page is printed `copies` times.
export const layoutPackList = (l, size) => recorded(() => packListBuild(l, size));
export const packListZPL = (l, size) => layoutPackList(l, size).zpl;
function packListBuild(l, size) {
  const { w, h } = sizeOf(size), { pages, step } = packListLayout(l, size);
  const colW = step - 22, copies = Math.max(1, Math.min(99, Math.round(Number(l.copies) || LIST_COPIES)));
  const groups = (l.groups || []).filter(g => (g.sizes || []).some(s => s.rows?.length));
  const title = groups.length > 1 ? `${groups.length} TEAMS` : String(l.team ?? groups[0]?.team ?? "").toUpperCase();
  const pcs = Number.isFinite(Number(l.pcs)) ? Number(l.pcs) : groups.reduce((t, g) => t + g.sizes.reduce((n, s) => n + s.rows.length, 0), 0);
  const out = [];
  for (let p = pages.length - 1; p >= 0; p--) {
    const z = head(w, h);
    // The header is one line whatever the team's name: squeezed, then the name cut (never the box, the pieces or the page).
    z.push(txt(20, 18, 24, 20, w - 40, named(title, ` - BOX ${l.bin ?? ""} - ${pcs} pcs - ${p + 1}/${pages.length}`, MIN_FW, w - 40)));
    z.push(txt(20, 46, 40, 36, w - 40, `Order ${l.orderNumber ?? ""}`), box(20, 92, w - 40, 3, 3));
    for (const b of pages[p].blocks) {
      if (b.band) {
        z.push(box(20, b.top, w - 40, BAND, BAND), txt(28, b.top + 4, 24, 20, w - 56, named(String(b.team ?? "").toUpperCase(), ` - ${b.pcs ?? ""} pcs`, MIN_FW, w - 56), { reverse: true }));
      }
      const end = Math.max(...b.colY) - GAP;
      b.cols.forEach((parts, c) => {
        if (!parts.length) return;
        const x = 20 + c * step;
        if (c > 0) z.push(box(x - 13, b.colTop, 3, end - b.colTop, 3));
        for (const sec of parts) {
          z.push(txt(x, sec.y, 30, 26, colW, named(sec.head || "-", "", MIN_FW, colW)), box(x, sec.y + 32, colW, 3, 3));
          sec.rows.forEach((r, i) => {
            // The name gets the room the number leaves in the column, so it never reaches the rule.
            const y = sec.y + SEC_HEAD + i * ROW, num = String(r.number ?? "").trim() || "-", fw = numFw(num), nw = dotsOf(num, fw) + 6;
            const nm = cutTo(r.name, NAME_FW, colW - nw);
            z.push(tx(x, y, 34, fw, num));
            if (nm) z.push(tx(x + nw, y + 8, 24, NAME_FW, nm));
          });
        }
      });
    }
    z.push(`^PQ${copies}`, "^XZ");
    out.push(z.join("\n"));
  }
  return out.join("\n");
}
// The rows of a packing list as the flat rows binListLabels takes, for a roll that is not tall.
export const packListRows = l => (l.groups || []).flatMap(g => (g.sizes || []).flatMap(s => (s.rows || []).map(r => ({ number: r.number, name: r.name, size: s.size, team: g.team }))));

// ── The outside label: a pair (ID and detail) ────────────────────────────────
// The shipping face of a box is TWO landscape labels on the tall rolls (the owner, 25 Nov 2026, after
// paper samples): the ID label, read from across the room (ORDER, the order number, a WEIGHT box for
// the hand, the customer's name, "Box 1 of 2"), and the detail label (order and box, the customer, the
// teams and the sizes in this box as "in box / of order"). They print together, the detail label first
// so that the ID label comes off the printer last and lies on top of the strip. No garment names, and
// nothing about flagged or missing garments (the NOT IN BOX list says that).
//
// Every field goes through `place` of a landscape page, which measures the text as the printer will
// print it (`dotsOf`), squeezes the letters down to a floor to fit the room it is given, then cuts it
// with "…", and RECORDS the field's box on the page (`layoutBoxFace(...).pages[].boxes`), so the test
// that tries a few hundred orders reads the same boxes that become the ZPL.
const ROLL_W = 406;   // the 2 in rolls are 406 dots wide; a tall roll is read turned a quarter turn clockwise
function landscapePage(LW) {
  const rec = { PAGE_W: LW, PAGE_H: ROLL_W, boxes: [] }, out = [];
  return {
    rec,
    // `text` at (lx, ly) in the page as it is READ, fh high, letters fw wide; `right`: lx is where the text ENDS.
    // Too wide for `maxW`: the letters get narrower (down to `floor`), then the text is cut with "…". null when nothing fits.
    place(text, lx, ly, fh, fw, { maxW = Infinity, floor = fw, right = false } = {}) {
      let t = String(text ?? "").trim(), f = fw;
      if (!t) return null;
      if (dotsOf(t, f) > maxW) {
        f = fwFor(t, fw, maxW);
        if (f < floor) { f = floor; t = cutTo(t, f, maxW); if (!t) return null; }
      }
      const w = dotsOf(t, f), x = right ? lx - w : lx, b = { kind: "text", lx: x, ly, w, h: fh, fw: f, text: t };
      rec.boxes.push(b); out.push(`^FO${ROLL_W - ly - fh},${x}^A0R,${fh},${f}^FD${safe(t)}^FS`);
      return b;
    },
    rule(lx, ly, len, th = 3) {
      rec.boxes.push({ kind: "rule", lx, ly, w: len, h: th }); out.push(`^FO${ROLL_W - ly - th},${lx}^GB${th},${len},${th}^FS`);
    },
    frame(lx, ly, w, h, th = 3) {
      const b = { kind: "frame", lx, ly, w, h }; rec.boxes.push(b); out.push(`^FO${ROLL_W - ly - h},${lx}^GB${h},${w},${th}^FS`); return b;
    },
    zpl() { return [...head(ROLL_W, LW, rec), ...out, "^PQ1", "^XZ"].join("\n"); },
  };
}
const boxText = (l, word = "Box") => `${word} ${l.boxNo ?? ""}${l.boxes ? ` of ${l.boxes}` : ""}`;
const upper = s => String(s ?? "").trim().toUpperCase();

// A customer name too long for one line, as two: the first line takes words while they fit at full letter
// width (then at the narrowest); the rest is the second line (which `place` squeezes and cuts).
function twoLines(name, room) {
  const words = name.split(/\s+/);
  for (const fw of [56, 44]) {
    let first = "";
    for (const wd of words) { const t = first ? first + " " + wd : wd; if (!first || dotsOf(t, fw) <= room) first = t; else break; }
    const rest = words.slice(first.split(/\s+/).length).join(" ");
    if (dotsOf(first, 44) > room) {   // one word wider than the line: break it by letters
      const cs = [...first]; let k = cs.length;
      while (k > 1 && dotsOf(cs.slice(0, k).join(""), 44) > room) k--;
      return [cs.slice(0, k).join(""), (cs.slice(k).join("") + " " + rest).trim()];
    }
    if (!rest || dotsOf(rest, 44) <= room || fw === 44) return [first, rest];
  }
}

// Label 1, the ID label.
function idLabel(l, LW) {
  const P = landscapePage(LW), M = 20, R = LW - M, full = R - M;
  P.place("ORDER", M, 8, 22, 20);
  const num = P.place(String(l.orderNumber ?? ""), M, 38, 110, 92, { maxW: full, floor: 40 });
  // The WEIGHT box takes the room the order number leaves (its edge + 24 to the margin, 220 at most: the owner's
  // paper sample, 25 Nov 2026); with under 120 dots left it goes on the bottom row, right of "Box 1 of 2", which
  // then leaves it at least 120 (WEIGHT_MIN), never over anything.
  const WEIGHT_MIN = 120, room = R - ((num ? num.lx + num.w : M) + 24);
  let weight = room >= WEIGHT_MIN ? [R - Math.min(room, 220), 38, Math.min(room, 220), 110] : null;
  // The customer: one line at 100 high when it fits (letters down to 44 wide); else two lines at 80 high split at
  // the last word that fits, each squeezed down to 44; else the second line cut with "…".
  const name = upper(l.customer);
  if (name) {
    if (dotsOf(name, 44) <= full) P.place(name, M, 200, 100, 64, { maxW: full, floor: 44 });
    else {
      const [a, b] = twoLines(name, full);
      P.place(a, M, 166, 80, 56, { maxW: full, floor: 44 }); P.place(b, M, 252, 80, 56, { maxW: full, floor: 44 });
    }
  }
  P.rule(M, 156, full);
  const bb = P.place(boxText(l), M, 350, 52, 46, { maxW: weight ? full : full - 24 - WEIGHT_MIN, floor: 24 });
  if (!weight) { const x = (bb ? bb.lx + bb.w : M) + 24, w = Math.min(220, R - x); weight = [R - w, 350, w, 52]; }
  const fr = P.frame(...weight);
  P.place("WEIGHT", fr.lx + 12, fr.ly + 8, 20, 18);
  return P;
}

// Label 2, the detail label.
const SIZE_HEIGHTS = [60, 54, 48, 40, 34, 28];
function detailLabel(l, LW) {
  const P = landscapePage(LW), M = 20, R = LW - M, full = R - M, GAP = 24, BOTTOM = 400;
  const rb = P.place(boxText(l, "BOX"), R, 8, 24, 22, { right: true, maxW: full, floor: 12 });
  P.place(`ORDER ${l.orderNumber ?? ""}`, M, 8, 24, 22, { maxW: full - (rb ? rb.w + 24 : 0), floor: 12 });
  P.place(upper(l.customer), M, 38, 44, 36, { maxW: full, floor: 28 });
  P.rule(M, 88, full);
  const colsAt = (n, cw) => Array.from({ length: n }, (_, c) => M + c * (cw + GAP));
  let y = 96;
  const teams = (l.teams || []).filter(t => String(t.team ?? "").trim());
  if (teams.length) {
    P.place("TEAMS", M, y, 22, 20); y += 28;
    const n = teams.length, nc = n <= 2 ? 1 : 2, fh = n <= 2 ? 40 : n <= 4 ? 36 : n <= 8 ? 28 : 24, fw = Math.round(fh * 0.8);
    const cells = n > 8 ? [...teams.slice(0, 7), { more: n - 7 }] : teams, cw = Math.floor((full - (nc - 1) * GAP) / nc), xs = colsAt(nc, cw), pitch = fh + 6;
    cells.forEach((t, i) => {
      const x = xs[i % nc], cy = y + Math.floor(i / nc) * pitch;
      if (t.more) { P.place(`+${t.more} more`, x, cy, fh, fw, { maxW: cw, floor: Math.round(fw * 0.8) }); return; }
      const cb = P.place(`${t.inBox}/${t.ofOrder}`, x + cw, cy, fh, fw, { right: true, maxW: cw, floor: 10 });
      P.place(upper(t.team), x, cy, fh, fw, { maxW: cw - (cb ? cb.w + 16 : 0), floor: Math.round(fw * 0.8) });
    });
    y += (Math.ceil(cells.length / nc) - 1) * pitch + fh + 8;
    P.rule(M, y, full); y += 9;
  }
  const sizes = (l.sizes || []).filter(s => String(s.size ?? "").trim());
  if (sizes.length) {
    P.place("SIZES", M, y, 22, 20); y += 28;
    const cells = sizes.length > 12 ? [...sizes.slice(0, 11), { more: sizes.length - 11 }] : sizes;
    const nc = sizes.length > 9 ? 4 : 3, cw = Math.floor((full - (nc - 1) * GAP) / nc), xs = colsAt(nc, cw), rows = Math.ceil(cells.length / nc);
    const plain = s => (s.more ? `+${s.more} more` : `${s.size} ${s.inBox}/${s.ofOrder}`);
    // The largest height at which every cell's text fits its width and the rows fit the room left on the page.
    let pick = null;
    for (const fh of SIZE_HEIGHTS) for (const gv of [10, 6]) {
      const fw = Math.round(fh * 0.74);
      if (!pick && cells.every(s => dotsOf(plain(s), fw) <= cw) && y + rows * (fh + gv) - gv <= BOTTOM) pick = { fh, fw, gv };
    }
    pick = pick || { fh: 28, fw: 21, gv: 6 };
    // Past the narrowest letters a size name is cut, never the count behind it.
    const cell = s => { const t = plain(s), count = ` ${s.inBox}/${s.ofOrder}`; return s.more || dotsOf(t, 12) <= cw ? t : cutTo(String(s.size).trim(), 12, cw - dotsOf(count, 12)) + count; };
    cells.forEach((s, i) => P.place(cell(s), xs[i % nc], y + Math.floor(i / nc) * (pick.fh + pick.gv), pick.fh, pick.fw, { maxW: cw, floor: 12 }));
  }
  return P;
}

// The outside label of a box: { zpl, pages } as laid out, the pages in print order (detail, then ID). The 2 x 1 in
// roll keeps the compact portrait label (a landscape 203 x 406 page would leave 26 dots a line). The layout fuzz
// (25 Nov 2026) moved its ORDER caption up and made it 22 high (it ran 2 dots into the order number; 2 dots clear
// now) and cuts a customer that would need letters under 12 wide (it was squeezed to 6 and still ran off the label).
export function layoutBoxFace(l, size) {
  const { w, h } = sizeOf(size), W = w - 40;
  if (!isTallTicket(size)) {
    return recorded(() => {
      const z = head(w, h);
      z.push(txt(20, 6, 22, 18, W, "ORDER"), txt(20, 30, Math.round(h * 0.32), Math.round(h * 0.28), W, String(l.orderNumber ?? "")));
      z.push(txt(20, Math.round(h * 0.62), 26, 22, W, cutTo(String(l.customer ?? ""), 12, W)), txt(20, Math.round(h * 0.8), 28, 24, W, boxText(l)), "^PQ1", "^XZ");
      return z.join("\n");
    });
  }
  const pair = [detailLabel(l, h), idLabel(l, h)];
  return { zpl: pair.map(P => P.zpl()).join("\n"), pages: pair.map(P => P.rec) };
}
export const boxFaceZPL = (l, size) => layoutBoxFace(l, size).zpl;

// ── The sign-off ticket ──────────────────────────────────────────────────────
// For the order paper at Finish order: the order, who and when, the passed
// garments per size, the totals, and two lines to sign. One label on a tall
// roll; three on a short one (header and sizes, totals, signatures), printed
// signatures first so that the strip reads header, totals, signatures.
export const layoutSignoff = (l, size) => recorded(() => signoffBuild(l, size));
export const signoffZPL = (l, size) => layoutSignoff(l, size).zpl;
// A ^FB block of `max` lines at letter width `fw`: the lines the printer will make of `text` (it wraps at spaces) and the block's box.
function fbBlock(x, y, fh, fw, width, max, text) {
  const words = String(text).split(" "), lines = []; let line = "";
  for (const wd of words) { const t = line ? line + " " + wd : wd; if (line && dotsOf(t, fw) > width) { lines.push(line); line = wd; } else line = t; }
  lines.push(line);
  note("text", x, y, Math.min(width, Math.max(...lines.map(t => dotsOf(t, fw)))), fh * Math.min(max, lines.length), String(text));
  cur.boxes.at(-1).lines = lines.length;
  return `^FO${x},${y}^A0N,${fh},${fw}^FB${width},${max},0,L^FD${safe(text)}^FS`;
}
function signoffBuild(l, size) {
  const { w, h } = sizeOf(size), W = w - 40;
  const sizes = l.bySize || [];
  const who = fitList([l.customer, ...(Array.isArray(l.teams) ? l.teams : [])].filter(Boolean), MIN_FW, W, " - ");   // a line: the teams that do not fit are "+3 more"
  const when = [l.date, l.time, l.station, l.operator].filter(Boolean).join(" - ");
  const totals = `Flagged ${l.flagged ?? 0} - Missing ${l.missing ?? 0} - of ${l.total ?? 0} - Boxes ${l.boxes ?? 0}`;
  if (!isTallTicket(size)) {
    const c = head(w, h), b = head(w, h), a = head(w, h);   // made in the order they print
    on(a).push(txt(20, 6, 20, 18, W, "ORDER"), txt(100, 4, 40, 36, W - 80, String(l.orderNumber ?? "")), txt(20, 48, 22, 18, W, who), txt(20, 72, 22, 18, W, when),
      fbBlock(20, 102, 24, 20, W, 3, fitList(sizes.map(s => `${s.size} ${s.passed}`), 20, Math.floor(3 * W * 0.8), "   ")), "^PQ1", "^XZ");
    on(b).push(txt(20, 20, 56, 46, W, `PASSED ${l.passed ?? 0}`), txt(20, 100, 24, 20, W, totals), "^PQ1", "^XZ");
    on(c).push(box(20, 70, W, 2, 2), txt(20, 76, 18, 16, W, "Operator"), box(20, 150, W, 2, 2), txt(20, 156, 18, 16, W, "Supervisor"), "^PQ1", "^XZ");
    return [c, b, a].map(z => z.join("\n")).join("\n");
  }
  const z = head(w, h);
  z.push(txt(20, 14, 20, 18, W, "ORDER"), txt(20, 34, 52, 46, W, String(l.orderNumber ?? "")));
  z.push(txt(20, 92, 22, 18, W, who), txt(20, 116, 22, 18, W, when), box(20, 144, W, 2, 2));
  // A line a size above PASSED and the totals, which end above the signature lines: the lines get closer
  // (38 dots down to 24) as sizes are added; past what one column holds at 24, two columns.
  const first = 154, limit = h - 89 - 80, fitRows = Math.floor((limit - first) / 24);
  const cols = sizes.length > fitRows ? 2 : 1, perCol = Math.min(fitRows, Math.ceil(sizes.length / cols)), colW = Math.floor(W / cols);
  const pitch = Math.max(24, Math.min(38, Math.floor((limit - first) / Math.max(1, perCol)))), fh = Math.min(30, pitch - 6);
  sizes.slice(0, cols * perCol).forEach((s, i) => {
    const x = 20 + Math.floor(i / perCol) * colW, y = first + (i % perCol) * pitch, nx = cols === 1 ? 300 : x + colW - 60;
    z.push(txt(x, y, fh, Math.min(26, fh), nx - x - 10, s.size), tx(nx, y, fh, Math.min(26, fh), s.passed), box(x, y + fh + 2, colW - (cols > 1 ? 10 : 0), 1, 1));
  });
  const y = first + perCol * pitch;
  z.push(txt(20, y + 6, 34, 30, 260, "PASSED"), tx(290, y + 6, 34, 30, l.passed ?? 0), txt(20, y + 46, 22, 18, W, totals));
  z.push(box(20, h - 89, W, 2, 2), txt(20, h - 83, 18, 16, W, "Operator"), box(20, h - 43, W, 2, 2), txt(20, h - 37, 18, 16, W, "Supervisor"), "^PQ1", "^XZ");
  return z.join("\n");
}
