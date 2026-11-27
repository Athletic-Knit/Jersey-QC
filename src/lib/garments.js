// ── Garment outlines: where on the jersey the damage is ──────────────────────
// When an operator flags a physical defect (a hole, twill peeling, a bad seam
// …) the station shows the garment from the FRONT and from the BACK and the
// operator taps up to three spots. The flag ticket prints the same outlines
// with the spots marked, so the repair department does not have to hunt for
// the damage (the owner, 23 Nov 2026).
//
// The floor makes many styles but only a handful of silhouettes, so there is
// one outline per garment KIND (hockey jersey, hoodie, pants, socks …), taken
// from the company's own flat drawings (assets/garments/*.svg, see "The
// thirteen kinds" below).
//
// Coordinates: every point is [x, y] in 0–1 of the garment's own box, x to the
// right and y DOWN (as on a screen and on the Zebra). The box is `aspect`
// times as wide as it is tall, so a drawing scales it to any room by
// multiplying x by the width and y by the height. The FRONT and the BACK each
// have their own outline (`outlines`) and lines (`detail`: seams, collar,
// hood, zip, pocket), in the same box.
//
// Left and right are always as the operator SEES that side: a spot on the
// left of the back view is "left", although it is the wearer's right. That is
// how the repairer looks at the jersey on the table.
//
// garments.js also runs on the hub (labels.js draws the outlines on the
// ticket), so it never imports config.js.

import { SHAPES } from "./garment-shapes.js";

export const SIDES = ["front", "back"];
export const SIDE_LABELS = { front: "Front", back: "Back" };
// The operator marks at most this many spots; then Done (the owner, 23 Nov 2026).
export const MAX_SPOTS = 3;
export const DEFAULT_GARMENT = "hockey";

const round = v => Math.round(v * 1000) / 1000;

// A named area, used to put a spot into words. `rect` is [x0, y0, x1, y1];
// `side` keeps it to one side (the pouch pocket is only on the front).
const area = (id, label, rect, side) => ({ id, label, rect, ...(side ? { side } : {}) });
// The body split three by three: "upper left" … "lower middle" … "lower right".
// Words, not numbers: the repairer reads them on the board and the report.
function bodyGrid(x0, y0, x1, y1) {
  const rows = ["upper", "middle", "lower"], cols = ["left", "middle", "right"];
  const w = (x1 - x0) / 3, h = (y1 - y0) / 3, out = [];
  rows.forEach((r, i) => cols.forEach((c, j) => {
    const label = r === "middle" && c === "middle" ? "centre" : r === "middle" ? `middle ${c}` : `${r} ${c}`;
    out.push(area(`${r}-${c}`, label, [round(x0 + j * w), round(y0 + i * h), round(x0 + (j + 1) * w), round(y0 + (i + 1) * h)]));
  }));
  return out;
}
// The sleeves run from the edge of the box (x = 0) to the body's side seam, so
// a tap on the very tip of a cuff is still "left sleeve". A long sleeve hangs
// on a slant, so the middle of its box is the gap under the arm: `at` is a
// point in the middle of the sleeve itself, used to place the words and to
// find the nearest area.
const sleeves = (x1, y0, y1, at) => [
  { ...area("left-sleeve", "left sleeve", [0, y0, x1, y1]), ...(at ? { at } : {}) },
  { ...area("right-sleeve", "right sleeve", [round(1 - x1), y0, 1, y1]), ...(at ? { at: [round(1 - at[0]), at[1]] } : {}) },
];
// The strip between the collar and the sleeve seam, above the body grid:
// shoulder seams are a common repair, and "collar" or "upper left" would send
// the repairer to the wrong place. Listed after the collar, so the collar keeps
// the neck itself.
const shoulders = (x0, x1, y0, y1) => [
  area("left-shoulder", "left shoulder", [x0, y0, x1, y1]),
  area("right-shoulder", "right shoulder", [round(1 - x1), y0, round(1 - x0), y1]),
];

// ── The thirteen kinds ───────────────────────────────────────────────────────
// The outlines and the lines on them are the company's own flat drawings
// (assets/garments/*.svg, the owner, 26 Nov 2026), turned into points by
// tools/svg-garments.mjs (src/lib/garment-shapes.js, generated). Each view has
// its own outline: the back of a hoodie is not the front of one. Here: the
// name, the menu group, the captions of the two views and the named areas,
// set against the generated shapes (0–1 of the garment's box).
// More kinds come from the same folder as they are needed (the owner: "we
// don't need all of them yet").
const kind = (id, label, group, regions, more = {}) => {
  const s = SHAPES[id];
  return { id, label, group, aspect: s.aspect, outlines: s.outline, outline: s.outline.front,
    detail: { front: [...s.detail.front, ...(more.extra?.front || [])], back: [...s.detail.back, ...(more.extra?.back || [])] },
    sides: more.sides || SIDE_LABELS, regions };
};
// A sleeved top: `seam` is the x of the body's left side seam (the sleeve is
// left of it), `armpit` the y under the arm, `neck` the collar's box, `at` a
// point in the middle of the left sleeve.
const top = ({ seam, armpit, neck, neckLabel = "collar", neckId = "collar", shoulderY = [0, 0.13], at }) => [
  area(neckId, neckLabel, neck),
  ...shoulders(seam, neck[0], shoulderY[0], shoulderY[1]),
  ...sleeves(seam, 0, armpit, at),
  ...bodyGrid(seam, neck[3], round(1 - seam), 1),        // from under the collar: the shoulders (before it) keep their corners
];
// Two legs, top to bottom in bands: [[id, label, y0, y1], …].
const legs = bands => bands.flatMap(([id, label, y0, y1]) => [
  area(`left-${id}`, `left ${label}`, [0, y0, 0.5, y1]), area(`right-${id}`, `right ${label}`, [0.5, y0, 1, y1])]);
// One piece seen from the side or flat (a sock, a pant leg from the side): bands top to bottom.
const bands = list => list.map(([id, label, y0, y1]) => area(id, label, [0, y0, 1, y1]));

const hockey = kind("hockey", "Hockey jersey", "Hockey",
  top({ seam: 0.316, armpit: 0.45, neck: [0.42, 0, 0.58, 0.1], shoulderY: [0, 0.15], at: [0.15, 0.2] }));
const hockeypants = kind("hockeypants", "Hockey pant shell", "Hockey", [
  area("waistband", "waistband", [0.15, 0, 0.85, 0.14]), area("centre", "centre panel", [0.44, 0.14, 0.56, 0.6]),
  ...legs([["upper", "upper leg", 0.14, 0.6], ["lower", "lower leg", 0.6, 1]])]);
const socks = kind("socks", "Hockey socks", "Hockey",
  bands([["top", "top band", 0, 0.08], ["upper", "upper", 0.08, 0.4], ["middle", "middle", 0.4, 0.7], ["lower", "lower (ankle)", 0.7, 1]]));
const basketball = kind("basketball", "Basketball jersey", "Basketball", [
  area("collar", "neck", [0.36, 0, 0.64, 0.12]), ...shoulders(0.18, 0.36, 0, 0.22), ...bodyGrid(0.001, 0.22, 0.999, 1)]);
const pantRegions = waist => [area("waistband", "waistband", waist),
  ...legs([["thigh", "thigh", 0.07, 0.4], ["knee", "knee", 0.4, 0.7], ["lower", "lower leg", 0.7, 1]])];
const basketballpants = kind("basketballpants", "Basketball pants", "Basketball", pantRegions([0.1, 0, 0.9, 0.07]));
const baseball = kind("baseball", "Baseball jersey", "Baseball", [
  area("buttons", "button placket", [0.475, 0.08, 0.525, 1], "front"),
  ...top({ seam: 0.204, armpit: 0.38, neck: [0.41, 0, 0.59, 0.12], shoulderY: [0, 0.12], at: [0.1, 0.2] })]);
// The two drawings are the legs seen from the side: the first has the back
// pocket on its left, so it is the wearer's right side.
const baseballpants = kind("baseballpants", "Baseball pants", "Baseball",
  bands([["waistband", "waistband", 0, 0.07], ["hip", "hip and thigh", 0.07, 0.4], ["knee", "knee", 0.4, 0.7], ["lower", "lower leg", 0.7, 1]]),
  { sides: { front: "Right side", back: "Left side" } });
const hoodie = kind("hoodie", "Hoodie", "Apparel", [
  area("pocket", "pouch pocket", [0.38, 0.66, 0.62, 1], "front"),
  ...top({ seam: 0.337, armpit: 0.46, neck: [0.41, 0, 0.59, 0.18], neckId: "hood", neckLabel: "hood", shoulderY: [0.1, 0.18], at: [0.17, 0.33] })]);
const jacket = kind("jacket", "Jacket", "Apparel", [
  area("zip", "zip", [0.48, 0.08, 0.52, 1], "front"),
  ...top({ seam: 0.337, armpit: 0.43, neck: [0.43, 0, 0.57, 0.1], shoulderY: [0.05, 0.14], at: [0.17, 0.3] })]);
const longtee = kind("longtee", "Long-sleeve shirt", "Apparel",
  top({ seam: 0.307, armpit: 0.4, neck: [0.43, 0, 0.57, 0.07], shoulderY: [0, 0.12], at: [0.15, 0.24] }));
const pants = kind("pants", "Pants", "Apparel", pantRegions([0.14, 0.02, 0.86, 0.07]));
const shorts = kind("shorts", "Shorts", "Apparel", [
  area("waistband", "waistband", [0.22, 0, 0.78, 0.11]),
  ...legs([["upper", "upper leg", 0.11, 0.55], ["lower", "lower leg", 0.55, 1]])]);
// The drawing's zip is a filled strip, not a line: drawn here.
const garmentbag = kind("garmentbag", "Garment bag", "Apparel", [
  area("loop", "hanger loop", [0.4, 0, 0.56, 0.092]), area("zip", "zip", [0.47, 0.1, 0.535, 1], "back"),
  ...bodyGrid(0.001, 0.092, 0.999, 1)], { extra: { back: [[[0.503, 0.1], [0.503, 0.99]]] } });

export const GARMENTS = { hockey, hockeypants, socks, basketball, basketballpants, baseball, baseballpants, hoodie, jacket, longtee, pants, shorts, garmentbag };
export const GARMENT_IDS = Object.keys(GARMENTS);
export const GARMENT_GROUPS = [...new Set(GARMENT_IDS.map(id => GARMENTS[id].group))];
// Object.hasOwn, not GARMENTS[kind]: the kind comes from roster files and hub
// request bodies, and "constructor" or "__proto__" must not pass as a kind.
const isKind = kind => typeof kind === "string" && Object.hasOwn(GARMENTS, kind);
// The shape of a kind; an unknown or empty kind is hockey.
export const garment = kind => GARMENTS[isKind(kind) ? kind : DEFAULT_GARMENT];
// The caption of one view ("Front", "Back"; the baseball pants' "Right side").
export const sideLabel = (kind, side) => garment(kind).sides[side] || SIDE_LABELS[side] || "";

// ── Style codes → kind ───────────────────────────────────────────────────────
// A roster may carry a "Style" column (kept as `style`). Exact codes first,
// read off the catalogue's product pages (pp. 4–75) and its pattern pages
// (pp. 85–104); then prefix rules for the custom-sublimation codes, which come
// in series (ZH101 … ZH305 are all hockey). A row's style beats the garment
// picked for the order, so a rule that guesses wrong does harm: the in-stock
// rules ask for the catalogue's own shape (a letter and four digits), never
// "any letter and a digit".
export const GARMENT_STYLES = {
  // Not garments that are inspected with an outline: toques, caps, a belt,
  // scarves, pennants, banners. They have no kind, so the row falls back to
  // the order's garment.
  none: {
    exact: ["A1830", "BA101", "AT200",                // hockey toque (p. 38) and its custom code; adjustable belt (p. 56)
      "ZBA76"],                                        // a sleeveless baseball top in the button series (p. 93): no drawing yet
    prefixes: [/^(ZAA|AH|BAH)/],                       // ZAA accessories (p. 91); caps and hats
  },
  // Only codes whose garment has a drawing (the 13 kinds, 26 Nov 2026). Tees,
  // tanks of other sports, football, volleyball, soccer and track have none
  // yet, so their rows use the order's garment.
  exact: {
    // Hockey jerseys (pp. 4–27).
    H550: "hockey", H8000: "hockey", H7500: "hockey", H7100: "hockey", H6500: "hockey", H6400: "hockey",
    H6100: "hockey", H6250: "hockey", H6000: "hockey", H686: "hockey",
    HS630: "socks", HS2100: "socks", HS1100: "socks", HS825: "socks",
    H901: "hockeypants",                               // pant shells (p. 23)
    // Apparel.
    A3050: "hoodie", A3025: "hoodie", A3087: "hoodie", A3000: "hoodie",
    A1845: "hoodie", A1840: "hoodie", A1835: "hoodie", A1834: "hoodie",
    A1900: "longtee", AS1700: "shorts",
    // Baseball.
    BA5500: "baseball", BA5200: "baseball", BA1900: "longtee",
    BA2650: "baseballpants", BA2655: "baseballpants", BA2690: "baseballpants", BA2695: "baseballpants",
    BA1391: "baseballpants", BA1390: "baseballpants", BA1380: "baseballpants", BA1385L: "baseballpants", BA1371: "baseballpants",
    BAS1700: "shorts",
    // Basketball; the other sports' shorts and long sleeves.
    B1715: "basketball", B2115: "basketball", BS1700: "shorts",
    LS1700: "shorts", V1900: "longtee", VS1700: "shorts", S1900: "longtee", SS1700: "shorts",
    // The custom codes printed under each in-stock product ("Available in
    // custom A600", pp. 4–75), where every product carrying the code is the
    // same kind. Left out because they cover more than one kind: A200, BA200,
    // BA300, V200 and S200: those rows use the order's garment.
    H845: "hockey", H680: "hockey", H950: "hockeypants", HS640: "socks", HS925: "socks",
    A600: "hoodie", A500: "hoodie", A400: "hoodie",
    AS200: "shorts", AS100: "shorts",
    BA400: "baseball", BA900: "baseballpants", BA750: "baseballpants", BAS200: "shorts", BAS100: "shorts",
    B500: "basketball", B200: "basketball", B100: "basketball", B300: "basketball", BS200: "shorts", BS100: "shorts",
    LS200: "shorts", LS100: "shorts", VS200: "shorts", VS100: "shorts", SS200: "shorts", SS100: "shorts",
  },
  // Checked in order, first match wins: the longer, more particular prefixes
  // come before the short ones they start with (ZH7 socks before ZH hockey,
  // ZBAS shorts before ZBA jerseys). A code no rule knows says nothing.
  prefixes: [
    [/^HS\d{3,4}/, "socks"], [/^ZH7/, "socks"],
    [/^(H9|ZH9)/, "hockeypants"],                       // pant shells (pp. 23, 86)
    [/^H\d{3,4}/, "hockey"], [/^ZH/, "hockey"], [/^ZLB/, "hockey"],   // box lacrosse jerseys are cut like hockey
    [/^ZBAP/, "baseballpants"], [/^ZBP/, "basketballpants"], [/^ZAP/, "pants"],
    [/^(AS|BS|LS|SS|VS|TS|BAS)\d{4}/, "shorts"],
    [/^(ZBS|ZVS|ZSS|ZTS|ZRS|ZS5|ZL9|ZLS|ZAS|ZBAS|ZBA9)/, "shorts"],
    [/^(ZBA7|ZBA8|BA5\d{3})/, "baseball"],
    [/^(ZB\d|ZBR|B\d{4})/, "basketball"],
    // Apparel (p. 87, 92): ZAL26xx/27xx are zip sweatshirts and ZAL37xx a zip
    // jacket; ZAL20xx and ZAL33xx are hoodies; every other ZAL has long sleeves.
    [/^ZAT/, "jacket"], [/^ZAL(26|27|37)\d\d/, "jacket"], [/^ZAL(20|33)\d\d/, "hoodie"], [/^ZAL/, "longtee"],
    [/^A3\d{3}/, "hoodie"],
    [/^(ZVL|ZBWL)/, "longtee"],
  ],
};

const hasOwn = (obj, key) => Object.hasOwn(obj, key);

// The garment kind of one style code, or "" when the code says nothing.
// Spaces and dashes are ignored, and a colour or size after the code
// ("H550-Y", "ZH101 BLACK") is cut off before the prefix rules.
export function styleKind(style) {
  const s = String(style ?? "").toUpperCase().replace(/[\s_-]+/g, "");
  if (!s) return "";
  const code = (String(style).toUpperCase().trim().match(/^[A-Z]+\s*-?\s*\d+[A-Z]?/) || [""])[0].replace(/[\s-]+/g, "");
  const bare = code.replace(/[A-Z]$/, "");
  const { none, exact, prefixes } = GARMENT_STYLES;
  for (const c of [s, code, bare]) {
    if (!c) continue;
    if (none.exact.includes(c)) return "";
    if (hasOwn(exact, c)) return exact[c];
  }
  const key = code || s;
  if (none.prefixes.some(re => re.test(key))) return "";
  for (const [re, kind] of prefixes) if (re.test(key)) return kind;
  return "";
}

// Which outline a jersey gets: its row's style when the table knows it, else
// the garment picked for the order, else hockey (the most common order, the
// owner, 24 Nov 2026). A mixed roster (jerseys and socks) gets each right.
export function garmentOf(row, orderGarment) {
  const fromStyle = styleKind(row?.style);
  if (fromStyle) return fromStyle;
  return isKind(orderGarment) ? orderGarment : DEFAULT_GARMENT;
}

// Is the point (0–1 coordinates) on the garment? Ray casting against the
// outline: a tap beside the garment is not a spot.
export function insideGarment(kind, x, y, side = "front") {
  const g = garment(kind), pts = g.outlines[side] || g.outline;
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Where an area is: its own `at` point when it has one, else the middle of its box.
export const anchorOf = r => r.at || [(r.rect[0] + r.rect[2]) / 2, (r.rect[1] + r.rect[3]) / 2];

// The words for one spot: the first area of that side holding it, else the
// nearest area's anchor (a tap right on the edge of a sleeve still says
// "left sleeve").
export function regionOf(kind, side, x, y) {
  const regs = garment(kind).regions.filter(r => !r.side || r.side === side);
  const hit = regs.find(({ rect: [x0, y0, x1, y1] }) => x >= x0 && x <= x1 && y >= y0 && y <= y1);
  if (hit) return hit;
  let best = null, bestD = Infinity;
  // Distance in the garment's own proportions: on a wide hockey jersey a step
  // across counts for more than the same 0–1 step down.
  const { aspect } = garment(kind);
  for (const r of regs) { const [cx, cy] = anchorOf(r); const d = ((cx - x) * aspect) ** 2 + (cy - y) ** 2; if (d < bestD) { bestD = d; best = r; } }
  return best;
}

// Spots in words for the board, the reports and the ticket:
// "Front: left sleeve · Back: lower middle". Front first, the spots of a side
// in the order they were marked, the same words once. "" with no spots.
export function spotWords(kind, spots) {
  const list = Array.isArray(spots) ? spots.slice(0, MAX_SPOTS) : [];
  return SIDES.map(side => {
    const words = [];
    for (const s of list) {
      if (s?.side !== side) continue;
      const r = regionOf(kind, side, Number(s.x), Number(s.y));
      if (r && !words.includes(r.label)) words.push(r.label);
    }
    return words.length ? `${sideLabel(kind, side)}: ${words.join(", ")}` : "";
  }).filter(Boolean).join(" · ");
}

// The kind most of a roster's rows are, by their `style` column, or "" when
// no kind has more than half the rows (no style column, a mixed order): the
// order screen and the supervisor's send form then pre-select it for the
// order (the plan, 23 Nov 2026). Each row still uses its own style.
export function rosterGarment(rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return "";
  const count = new Map();
  for (const r of list) { const k = styleKind(r?.style); if (k) count.set(k, (count.get(k) || 0) + 1); }
  let best = "", n = 0;
  for (const [k, c] of count) if (c > n) { best = k; n = c; }
  return n * 2 > list.length ? best : "";
}

// A garment kind the order may carry: a known kind, else the default.
export const orderGarmentOf = kind => (isKind(kind) ? kind : DEFAULT_GARMENT);

// ── Drawing a garment on screen ──────────────────────────────────────────────
// The station draws each side as an SVG whose viewBox is the garment's box
// (`aspect` × 1, scaled to VIEW_H units tall) with `pad` all round, so a spot
// on the edge of a sleeve still shows whole. `toView` and `fromView` turn a
// garment point (0–1) into viewBox units and back; the station's tap handler
// and its tests use them, so the two agree.
export const VIEW_H = 100;
export function garmentView(kind) {
  const g = garment(kind), pad = 8, w = Math.round(g.aspect * VIEW_H * 10) / 10, h = VIEW_H;
  return { kind: g.id, w, h, pad, vbW: w + 2 * pad, vbH: h + 2 * pad };
}
export const toView = (view, [x, y]) => [view.pad + x * view.w, view.pad + y * view.h];
export const fromView = (view, vx, vy) => [(vx - view.pad) / view.w, (vy - view.pad) / view.h];
// A tapped point as a spot: 0–1 rounded to three places, or null when the tap
// missed the garment (beside it, between the legs, under a sleeve).
export function spotAt(kind, side, x, y) {
  if (!SIDES.includes(side) || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const r = v => Math.round(v * 1000) / 1000;
  const sx = r(x), sy = r(y);
  if (sx < 0 || sx > 1 || sy < 0 || sy > 1 || !insideGarment(kind, sx, sy, side)) return null;
  return { side, x: sx, y: sy };
}
