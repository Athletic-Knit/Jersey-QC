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
//     teams: [{ team, inBox, ofOrder }], sizes: [{ size, inBox, ofOrder }] }
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
const head = (w, h) => ["^XA", "^CI28", `^PW${w}`, `^LL${h}`, "^LH0,0", "^LT0"];
// How many dots a text takes at letter width `fw`. labels.js's `textUnits` is the safe (wide)
// estimate; font 0 prints at about 0.85 of it (the paper trial of 25 Nov 2026: six capitals of
// the 24-dot name behind a two-digit number fitted the 108-dot column). Every width on these
// labels is measured with it.
const PRINTED = 0.85;
const dotsOf = (text, fw) => Math.ceil(textUnits(text) * fw * PRINTED);
// `text` cut with "…" so that it takes at most `room` dots at letter width `fw` ("" when not even one letter fits).
function cutTo(text, fw, room) {
  const t = String(text ?? "").trim(), ch = [...t];
  if (dotsOf(t, fw) <= room) return t;
  for (let k = ch.length - 1; k > 0; k--) { const s = ch.slice(0, k).join("").trimEnd() + "…"; if (dotsOf(s, fw) <= room) return s; }
  return "";
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
  const w = Math.max(6, Math.min(fw, Math.floor(width / (textUnits(text) * PRINTED))));
  return `^FO${x},${y}^A0N,${fh},${w}${reverse ? "^FR" : ""}^FD${safe(text)}^FS`;
};
const box = (x, y, w, h, t) => `^FO${x},${y}^GB${w},${h},${t}^FS`;
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
export function packListZPL(l, size) {
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
            z.push(`^FO${x},${y}^A0N,34,${fw}^FD${safe(num)}^FS`);
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
// The shipping face of a box (one per box), LANDSCAPE on the tall rolls: ORDER and
// CUSTOMER, the customer's name as the biggest line, a line a team ("10/10": in this
// box / in the team's whole order), one line of sizes with their counts in this box,
// "Box 1 of 2" and a blank WEIGHT box for the hand. No garment names, and nothing
// about flagged or missing garments (the NOT IN BOX list says that).
export function boxFaceZPL(l, size) {
  const { w, h } = sizeOf(size), W = w - 40;
  const z = head(w, h);
  if (!isTallTicket(size)) {   // a short roll (2 x 1 in: the compact portrait label, as before; a landscape 203 x 406 page would leave 26 dots a line): the order, the customer and the box, one label
    z.push(txt(20, 8, 24, 20, W, "ORDER"), txt(20, 30, Math.round(h * 0.32), Math.round(h * 0.28), W, String(l.orderNumber ?? "")));
    z.push(txt(20, Math.round(h * 0.62), 26, 22, W, String(l.customer ?? "")), txt(20, Math.round(h * 0.8), 28, 24, W, `Box ${l.boxNo ?? ""}${l.boxes ? ` of ${l.boxes}` : ""}`), "^PQ1", "^XZ");
    return z.join("\n");
  }
  // The tall rolls print the label LANDSCAPE (the owner, 25 Nov 2026): every field is ^A0R (turned a quarter
  // turn clockwise), so the paper is read as a page LW wide (the roll's length) and `w` (406) high. (lx, ly)
  // are landscape coordinates; the 2 x 4 in roll is the same page, wider.
  const LW = h, M = 20, full = LW - 2 * M;
  const rt = (lx, ly, fh, fw, text) => `^FO${w - ly - fh},${lx}^A0R,${fh},${fw}^FD${safe(text)}^FS`;
  const hr = (lx, ly, len) => `^FO${w - ly - 3},${lx}^GB3,${len},3^FS`;
  // `text` at letter width `fw`, squeezed down to `minFw` to fit `room` dots, then cut with "…": [text, width].
  const fit = (text, fw, minFw, room) => {
    const f = Math.min(fw, Math.floor(room / (Math.max(1, textUnits(text)) * PRINTED)));
    return f >= minFw ? [String(text), f] : [cutTo(text, minFw, room), minFw];
  };
  const put = (lx, ly, fh, fw, minFw, room, text) => { const [t, f] = fit(text, fw, minFw, room); return t ? rt(lx, ly, fh, f, t) : ""; };
  const weightX = LW - 173, clearRoom = weightX - 10 - M;   // nothing at the bottom right reaches the WEIGHT box
  const teams = l.teams || [], sizes = l.sizes || [];
  // The sizes: one line at 40 high, "S 10   M 10   L 10"; many sizes squeeze, then wrap to a second line.
  const toks = sizes.map(s => `${s.size} ${s.inBox}`), SEP = "   ";
  let sLines = [toks.join(SEP)];
  if (fit(sLines[0], 34, 24, clearRoom)[1] < 28 && toks.length > 1) {
    const a = []; let cur = "";
    for (const t of toks) { const next = cur ? cur + SEP + t : t; if (cur && dotsOf(next, 28) > clearRoom && a.length < 1) { a.push(cur); cur = t; } else cur = next; }
    sLines = [...a, cur];
  }
  // The rows between the first rule and the one above "Box 1 of 2" share 126 dots: 42 a row, closer when there are many.
  const m = sLines.length, tShow = Math.min(teams.length, Math.max(1, 5 - m));
  const pitch = Math.min(42, Math.floor(126 / Math.max(1, tShow + m))), fh = Math.min(40, pitch - 2), fw = Math.min(34, Math.round(fh * 0.85));
  z.push(rt(M, 12, 20, 18, "ORDER"), put(M, 32, 70, 60, 30, LW - 309 - M - 10, String(l.orderNumber ?? "")), rt(LW - 309, 12, 20, 18, "CUSTOMER"));
  z.push(put(M, 110, 78, 54, 36, full, String(l.customer ?? "").toUpperCase()), hr(M, 196, LW - 39));
  teams.slice(0, tShow).forEach((t, i) => {
    const more = i === tShow - 1 && teams.length > tShow ? ` +${teams.length - tShow}` : "", y = 206 + i * pitch, cnt = `${t.inBox}/${t.ofOrder}`;
    const cx = Math.min(LW - 279, LW - M - dotsOf(cnt, fw));
    z.push(put(M, y, fh, fw, 16, cx - M - 16, `${String(t.team ?? "").toUpperCase()}${more}`), rt(cx, y, fh, fw, cnt));
  });
  const rule1 = 206 + pitch * tShow + 4;
  z.push(hr(M, rule1, LW - 39));
  sLines.forEach((s, i) => z.push(put(M, rule1 + 8 + i * pitch, fh, fw, 16, clearRoom, s)));
  z.push(hr(M, 348, LW - 209));   // the rule stops before the WEIGHT box
  z.push(put(M, 356, 48, 42, 24, clearRoom, `Box ${l.boxNo ?? ""}${l.boxes ? ` of ${l.boxes}` : ""}`));
  z.push(`^FO${w - 318 - 84},${weightX}^GB84,164,3^FS`, rt(weightX + 6, 324, 18, 16, "WEIGHT"), "^PQ1", "^XZ");
  return z.filter(Boolean).join("\n");
}

// ── The sign-off ticket ──────────────────────────────────────────────────────
// For the order paper at Finish order: the order, who and when, the passed
// garments per size, the totals, and two lines to sign. One label on a tall
// roll; three on a short one (header and sizes, totals, signatures), printed
// signatures first so that the strip reads header, totals, signatures.
export function signoffZPL(l, size) {
  const { w, h } = sizeOf(size), W = w - 40;
  const sizes = l.bySize || [];
  const who = fitList([l.customer, ...(Array.isArray(l.teams) ? l.teams : [])].filter(Boolean), MIN_FW, W, " - ");   // a line: the teams that do not fit are "+3 more"
  const when = [l.date, l.time, l.station, l.operator].filter(Boolean).join(" - ");
  const totals = `Flagged ${l.flagged ?? 0} - Missing ${l.missing ?? 0} - of ${l.total ?? 0} - Boxes ${l.boxes ?? 0}`;
  if (!isTallTicket(size)) {
    const a = head(w, h), b = head(w, h), c = head(w, h);
    a.push(txt(20, 6, 20, 18, W, "ORDER"), txt(100, 4, 40, 36, W - 80, String(l.orderNumber ?? "")), txt(20, 48, 22, 18, W, who), txt(20, 72, 22, 18, W, when),
      `^FO20,102^A0N,24,20^FB${W},3,0,L^FD${safe(fitList(sizes.map(s => `${s.size} ${s.passed}`), 20, Math.floor(3 * W * 0.8), "   "))}^FS`, "^PQ1", "^XZ");
    b.push(txt(20, 20, 56, 46, W, `PASSED ${l.passed ?? 0}`), txt(20, 100, 24, 20, W, totals), "^PQ1", "^XZ");
    c.push(box(20, 70, W, 2, 2), txt(20, 76, 18, 16, W, "Operator"), box(20, 150, W, 2, 2), txt(20, 156, 18, 16, W, "Supervisor"), "^PQ1", "^XZ");
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
    z.push(txt(x, y, fh, Math.min(26, fh), nx - x - 10, s.size), `^FO${nx},${y}^A0N,${fh},${Math.min(26, fh)}^FD${s.passed}^FS`,box(x, y + fh + 2, colW - (cols > 1 ? 10 : 0), 1, 1));
  });
  const y = first + perCol * pitch;
  z.push(txt(20, y + 6, 34, 30, 260, "PASSED"), `^FO290,${y + 6}^A0N,34,30^FD${l.passed ?? 0}^FS`, txt(20, y + 46, 22, 18, W, totals));
  z.push(box(20, h - 89, W, 2, 2), txt(20, h - 83, 18, 16, W, "Operator"), box(20, h - 43, W, 2, 2), txt(20, h - 37, 18, 16, W, "Supervisor"), "^PQ1", "^XZ");
  return z.join("\n");
}
