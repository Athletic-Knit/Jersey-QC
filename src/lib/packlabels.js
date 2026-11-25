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
//     teams: [{ team, inBox, ofOrder }], sizes: [{ size, inBox, ofOrder }], notIn: ["#19 A-M flagged"] }
//   { kind: "signoff", orderNumber, customer, teams, date, time, station, operator,
//     bySize: [{ size, passed }], passed, flagged, missing, total, boxes }
// Each of them is laid out whole by its function below, which returns the ZPL of
// every label it needs (the list: every page, last page first).
import { textUnits, byNumber } from "./labels.js";
import { bySize, shortSize } from "./roster.js";

// Every page of a packing list comes out this many times (the owner, 25 Nov 2026: "print 4 of this").
export const LIST_COPIES = 4;

const safe = s => String(s ?? "").replace(/[\^~]/g, " ");
const head = (w, h) => ["^XA", "^CI28", `^PW${w}`, `^LL${h}`, "^LH0,0", "^LT0"];
// One line of text, never wider than `width`: the letters get narrower (down from `fw`) until it fits.
const txt = (x, y, fh, fw, width, text, { reverse = false } = {}) => {
  const w = Math.max(6, Math.min(fw, Math.floor(width / textUnits(text))));
  return `^FO${x},${y}^A0N,${fh},${w}${reverse ? "^FR" : ""}^FD${safe(text)}^FS`;
};
const box = (x, y, w, h, t) => `^FO${x},${y}^GB${w},${h},${t}^FS`;
const dpiOf = size => Number(size?.dpi) || 203;
const sizeOf = size => ({ w: Number(size?.w) || 406, h: Number(size?.h) || 609 });
// The tall rolls: 2 in wide and 2.5 in or more high (the same rule as the flag ticket's).
export const isTallRoll = size => { const { w, h } = sizeOf(size); return h >= Math.round(2.5 * dpiOf(size)) && w >= Math.round(2 * dpiOf(size)); };

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
const NAME_FW = 19;    // the name's letter width
// The name, cut so that it never reaches the next column: about six letters in
// a column of 108 dots, fewer behind a three-digit number, then "…".
function cutName(number, name, colW) {
  // textUnits is the safe (wide) estimate; letters in the 24-dot name are about 0.8 of it. The room ends at
  // the rule between the columns, 13 dots before the next column.
  const n = String(name ?? "").trim(), room = colW + 2 - (String(number ?? "").length * 16 + 6);
  if (!n) return "";
  const wide = [...n].map(ch => textUnits(ch) * NAME_FW * 0.85);
  if (wide.reduce((a, b) => a + b, 0) <= room) return n;
  let used = 0, k = 0;   // cut: the "…" needs about 10 dots of its own
  for (const w of wide) { used += w; if (used > room - 10) break; k++; }
  return [...n].slice(0, Math.max(1, k)).join("").trimEnd() + "…";
}
// The sections of a packing list laid onto pages: { pages: [{ blocks: [{ team, pcs, band, top, colTop, colY, cols }] }] }.
// A section (a size's header and its rows) goes whole into the column with the
// least in it where it fits (so a fourth size with one row sits under another
// on the same label); a section longer than a column is split across columns,
// its header repeated; a section that fits nowhere on the page starts the next
// page, and a team's band is drawn again on every page its sections continue on.
export function packListLayout(l, size) {
  const { w, h } = sizeOf(size);
  const step = Math.floor((w - 16) / 3), bottom = h - 9;
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
  const pages = st.pages;
  return { pages, step, bottom };
}

// Every page of the list as ZPL, the last page first; each page is printed `copies` times.
export function packListZPL(l, size) {
  const { w, h } = sizeOf(size), { pages, step } = packListLayout(l, size);
  const colW = step - 22, copies = Math.max(1, Math.min(99, Math.round(Number(l.copies) || LIST_COPIES)));
  const groups = (l.groups || []).filter(g => (g.sizes || []).some(s => s.rows?.length));
  const title = groups.length > 1 ? `${groups.length} TEAMS` : String(l.team ?? groups[0]?.team ?? "").toUpperCase();
  const pcs = Number.isFinite(Number(l.pcs)) ? Number(l.pcs) : groups.reduce((t, g) => t + g.sizes.reduce((n, s) => n + s.rows.length, 0), 0);
  const out = [];
  for (let p = pages.length - 1; p >= 0; p--) {
    const z = head(w, h);
    z.push(txt(20, 18, 24, 20, w - 40, `${title} - BOX ${l.bin ?? ""} - ${pcs} pcs - ${p + 1}/${pages.length}`));
    z.push(txt(20, 46, 40, 36, w - 40, `Order ${l.orderNumber ?? ""}`), box(20, 92, w - 40, 3, 3));
    for (const b of pages[p].blocks) {
      if (b.band) {
        z.push(box(20, b.top, w - 40, BAND, BAND), txt(28, b.top + 4, 24, 20, w - 56, `${String(b.team ?? "").toUpperCase()} - ${b.pcs ?? ""} pcs`, { reverse: true }));
      }
      const end = Math.max(...b.colY) - GAP;
      b.cols.forEach((parts, c) => {
        if (!parts.length) return;
        const x = 20 + c * step;
        if (c > 0) z.push(box(x - 13, b.colTop, 3, end - b.colTop, 3));
        for (const sec of parts) {
          z.push(txt(x, sec.y, 30, 26, colW, sec.head || "-"), box(x, sec.y + 32, colW, 3, 3));
          sec.rows.forEach((r, i) => {
            const y = sec.y + SEC_HEAD + i * ROW, num = String(r.number ?? "").trim() || "-", nw = num.length * 16 + 6;
            z.push(`^FO${x},${y}^A0N,34,28^FD${safe(num)}^FS`);
            const nm = cutName(num, r.name, colW);
            if (nm) z.push(`^FO${x + nw},${y + 8}^A0N,24,${NAME_FW}^FD${safe(nm)}^FS`);
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

// ── The outside label ────────────────────────────────────────────────────────
// The shipping face of a box (one per box): ORDER, CUSTOMER, the teams and the
// sizes in it as "in this box / in the whole order", what is not in it, "Box 1
// of 2", and a blank WEIGHT box for the hand. No garment names.
export function boxFaceZPL(l, size) {
  const { w, h } = sizeOf(size), W = w - 40, right = w - 116;
  const z = head(w, h);
  if (!isTallRoll(size)) {   // a short roll: the order, the customer and the box, one label
    z.push(txt(20, 8, 24, 20, W, "ORDER"), txt(20, 30, Math.round(h * 0.32), Math.round(h * 0.28), W, String(l.orderNumber ?? "")));
    z.push(txt(20, Math.round(h * 0.62), 26, 22, W, String(l.customer ?? "")), txt(20, Math.round(h * 0.8), 28, 24, W, `Box ${l.boxNo ?? ""}${l.boxes ? ` of ${l.boxes}` : ""}`), "^PQ1", "^XZ");
    return z.join("\n");
  }
  z.push(txt(20, 14, 20, 18, W, "ORDER"), txt(20, 34, 52, 46, W, String(l.orderNumber ?? "")));
  z.push(txt(20, 94, 20, 18, W, "CUSTOMER"), txt(20, 114, 32, 28, W, String(l.customer ?? "")), box(20, 152, W, 2, 2));
  z.push(txt(20, 160, 20, 18, W, "TEAMS IN THIS BOX   in box / of order"));
  const pair = (y, name, a, b) => [txt(20, y, 30, 26, right - 30, name), `^FO${right},${y}^A0N,30,26^FD${a} / ${b}^FS`];
  const teams = l.teams || [], sizes = l.sizes || [];
  const notIn = (l.notIn || []).join(", ");
  const bottom = h - 100, rowsAvail = Math.max(2, Math.floor((bottom - 184 - 70 - (notIn ? 70 : 0)) / 36));
  const tShow = Math.min(teams.length, Math.max(1, rowsAvail - Math.min(sizes.length, Math.ceil(rowsAvail / 2))));
  const sShow = Math.min(sizes.length, Math.max(0, rowsAvail - tShow));
  let y = 184;
  teams.slice(0, tShow).forEach((t, i) => {
    const more = i === tShow - 1 && teams.length > tShow ? ` +${teams.length - tShow}` : "";
    z.push(...pair(y, `${t.team}${more}`, t.inBox, t.ofOrder)); y += 36;
  });
  z.push(box(20, y + 2, W, 2, 2), txt(20, y + 10, 20, 18, W, "SIZES"));
  y += 34;
  sizes.slice(0, sShow).forEach((s, i) => {
    const more = i === sShow - 1 && sizes.length > sShow ? ` +${sizes.length - sShow}` : "";
    z.push(...pair(y, `${s.size}${more}`, s.inBox, s.ofOrder)); y += 36;
  });
  if (notIn) z.push(`^FO20,${y + 4}^A0N,22,18^FB${W},3,0,L^FDNot in this box: ${safe(notIn)}^FS`);
  z.push(txt(20, h - 69, 44, 40, 240, `Box ${l.boxNo ?? ""}${l.boxes ? ` of ${l.boxes}` : ""}`));
  z.push(box(w - 136, h - 89, 116, 70, 3), `^FO${w - 128},${h - 83}^A0N,18,16^FDWEIGHT^FS`, "^PQ1", "^XZ");
  return z.join("\n");
}

// ── The sign-off ticket ──────────────────────────────────────────────────────
// For the order paper at Finish order: the order, who and when, the passed
// garments per size, the totals, and two lines to sign. One label on a tall
// roll; three on a short one (header and sizes, totals, signatures).
export function signoffZPL(l, size) {
  const { w, h } = sizeOf(size), W = w - 40;
  const sizes = l.bySize || [];
  const who = `${[l.customer, ...(Array.isArray(l.teams) ? l.teams : [])].filter(Boolean).join(" - ")}`;
  const when = [l.date, l.time, l.station, l.operator].filter(Boolean).join(" - ");
  const totals = `Flagged ${l.flagged ?? 0} - Missing ${l.missing ?? 0} - of ${l.total ?? 0} - Boxes ${l.boxes ?? 0}`;
  if (!isTallRoll(size)) {
    const a = head(w, h), b = head(w, h), c = head(w, h);
    a.push(txt(20, 6, 20, 18, W, "ORDER"), txt(100, 4, 40, 36, W - 80, String(l.orderNumber ?? "")), txt(20, 48, 22, 18, W, who), txt(20, 72, 22, 18, W, when),
      `^FO20,102^A0N,24,20^FB${W},3,0,L^FD${safe(sizes.map(s => `${s.size} ${s.passed}`).join("   "))}^FS`, "^PQ1", "^XZ");
    b.push(txt(20, 20, 56, 46, W, `PASSED ${l.passed ?? 0}`), txt(20, 100, 24, 20, W, totals), "^PQ1", "^XZ");
    c.push(box(20, 70, W, 2, 2), txt(20, 76, 18, 16, W, "Operator"), box(20, 150, W, 2, 2), txt(20, 156, 18, 16, W, "Supervisor"), "^PQ1", "^XZ");
    return [a, b, c].map(z => z.join("\n")).join("\n");
  }
  const z = head(w, h);
  z.push(txt(20, 14, 20, 18, W, "ORDER"), txt(20, 34, 52, 46, W, String(l.orderNumber ?? "")));
  z.push(txt(20, 92, 22, 18, W, who), txt(20, 116, 22, 18, W, when), box(20, 144, W, 2, 2));
  const first = 154, limit = h - 89 - 80, pitch = Math.max(24, Math.min(38, Math.floor((limit - first) / Math.max(1, sizes.length))));
  const fh = Math.min(30, pitch - 6);
  let y = first;
  for (const s of sizes) { z.push(txt(20, y, fh, 26, 200, s.size), `^FO300,${y}^A0N,${fh},26^FD${s.passed}^FS`, box(20, y + fh + 2, W, 1, 1)); y += pitch; }
  z.push(txt(20, y + 6, 34, 30, 260, "PASSED"), `^FO290,${y + 6}^A0N,34,30^FD${l.passed ?? 0}^FS`, txt(20, y + 46, 22, 18, W, totals));
  z.push(box(20, h - 89, W, 2, 2), txt(20, h - 83, 18, 16, W, "Operator"), box(20, h - 43, W, 2, 2), txt(20, h - 37, 18, 16, W, "Supervisor"), "^PQ1", "^XZ");
  return z.join("\n");
}
