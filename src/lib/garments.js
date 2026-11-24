// ── Garment outlines: where on the jersey the damage is ──────────────────────
// When an operator flags a physical defect (a hole, twill peeling, a bad seam
// …) the station shows the garment from the FRONT and from the BACK and the
// operator taps up to three spots. The flag ticket prints the same outlines
// with the spots marked, so the repair department does not have to hunt for
// the damage (the owner, 23 Nov 2026).
//
// The floor makes many styles but only a handful of silhouettes, so there is
// one outline per garment KIND (hockey, tee, tank, hoodie, pants, socks …).
// The outlines are our own simplified polygons, drawn by hand against the flat
// line drawings in the company catalogue (2026 catalogue, pages 85–104, the
// "custom sublimation patterns"). The catalogue's pictures are not copied here.
//
// Coordinates: every point is [x, y] in 0–1 of the garment's own box, x to the
// right and y DOWN (as on a screen and on the Zebra). The box is `aspect`
// times as wide as it is tall, so a drawing scales it to any room by
// multiplying x by the width and y by the height. The outline is the same
// shape seen from the front and from the back; the details (neck, placket,
// hood, zip, pocket, waistband) differ and are open polylines.
//
// Left and right are always as the operator SEES that side: a spot on the
// left of the back view is "left", although it is the wearer's right. That is
// how the repairer looks at the jersey on the table.
//
// garments.js also runs on the hub (labels.js draws the outlines on the
// ticket), so it never imports config.js.

export const SIDES = ["front", "back"];
export const SIDE_LABELS = { front: "Front", back: "Back" };
// The operator marks at most this many spots; then Done (the owner, 23 Nov 2026).
export const MAX_SPOTS = 3;
export const DEFAULT_GARMENT = "hockey";

// ── Drawing helpers ──────────────────────────────────────────────────────────
// Garments are symmetric, so each outline is written as its LEFT half, from
// the top of the centre line round the left edge to the bottom of the centre
// line, and mirrored. Writing half the points keeps both sides identical.
function mirrorOutline(leftHalf) {
  const right = leftHalf.slice().reverse()
    .filter(([x]) => x !== 0.5)                       // the centre points are shared
    .map(([x, y]) => [round(1 - x), y]);
  return [...leftHalf, ...right];
}
const round = v => Math.round(v * 1000) / 1000;
// A detail line and its mirror image (a cuff on each sleeve, a pocket each side).
const both = line => [line, line.map(([x, y]) => [round(1 - x), y])];
const hline = (x0, x1, y) => [[x0, y], [x1, y]];

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

// ── The eleven kinds ─────────────────────────────────────────────────────────
// Each traced from the flat named beside it (page of the 2026 catalogue).
// Shapes are drawn as if the garment lies flat and square on the table, so
// the catalogue's three-quarter sleeves are straightened out. A cuff line is
// the sleeve's opening moved a little up the sleeve, both ends on its edges.

// Hockey (ZH101, p. 85; H550 and the other hockey jerseys): square shoulders,
// wide sleeves angled down, a wide straight body, a yoke seam across the chest
// in front, V-neck (or lace neck) in front and a round neck behind.
const hockey = {
  id: "hockey", label: "Hockey jersey", aspect: 1.5,
  outline: mirrorOutline([[0.5, 0.07], [0.43, 0.03], [0.4, 0], [0.27, 0.02], [0, 0.5], [0.11, 0.64], [0.245, 0.4], [0.245, 1], [0.5, 1]]),
  detail: {
    front: [[[0.43, 0.03], [0.5, 0.16], [0.57, 0.03]], [[0.45, 0.041], [0.5, 0.12], [0.55, 0.041]], hline(0.245, 0.755, 0.2),
      ...both([[0.02, 0.465], [0.13, 0.605]]), hline(0.245, 0.755, 0.95)],
    back: [[[0.43, 0.03], [0.47, 0.085], [0.5, 0.095], [0.53, 0.085], [0.57, 0.03]],
      ...both([[0.02, 0.465], [0.13, 0.605]]), hline(0.245, 0.755, 0.95)],
  },
  regions: [area("collar", "collar", [0.4, 0.04, 0.6, 0.16]), ...shoulders(0.245, 0.43, 0, 0.12),
    ...sleeves(0.245, 0, 0.7), ...bodyGrid(0.245, 0.12, 0.755, 1)],
};

// Short-sleeve jersey or tee (ZS11, p. 101): set-in short sleeves, V or crew neck.
const tee = {
  id: "tee", label: "Short-sleeve jersey", aspect: 1.1,
  outline: mirrorOutline([[0.5, 0.07], [0.42, 0.02], [0.38, 0], [0.22, 0.05], [0, 0.28], [0.1, 0.4], [0.2, 0.31], [0.2, 1], [0.5, 1]]),
  detail: {
    front: [[[0.42, 0.02], [0.5, 0.18], [0.58, 0.02]], ...both([[0.03, 0.255], [0.125, 0.375]]), hline(0.2, 0.8, 0.96)],
    back: [[[0.42, 0.02], [0.46, 0.08], [0.5, 0.095], [0.54, 0.08], [0.58, 0.02]], ...both([[0.03, 0.255], [0.125, 0.375]]), hline(0.2, 0.8, 0.96)],
  },
  regions: [area("collar", "collar", [0.38, 0.04, 0.62, 0.14]), ...shoulders(0.2, 0.42, 0, 0.12),
    ...sleeves(0.2, 0, 0.42), ...bodyGrid(0.2, 0.12, 0.8, 1)],
};

// Long-sleeve shirt (ZVL11, p. 100; A1900, warm-up shirts): long sleeves
// hanging down beside the body, crew or V neck.
const longtee = {
  id: "longtee", label: "Long-sleeve shirt", aspect: 1.35,
  outline: mirrorOutline([[0.5, 0.07], [0.42, 0.02], [0.38, 0], [0.25, 0.04], [0.02, 0.8], [0.12, 0.84], [0.25, 0.38], [0.25, 1], [0.5, 1]]),
  detail: {
    front: [[[0.42, 0.02], [0.45, 0.08], [0.5, 0.1], [0.55, 0.08], [0.58, 0.02]], ...both([[0.035, 0.755], [0.13, 0.79]]), hline(0.25, 0.75, 0.96)],
    back: [[[0.42, 0.02], [0.46, 0.06], [0.5, 0.07], [0.54, 0.06], [0.58, 0.02]], ...both([[0.035, 0.755], [0.13, 0.79]]), hline(0.25, 0.75, 0.96)],
  },
  regions: [area("collar", "collar", [0.38, 0.04, 0.62, 0.14]), ...shoulders(0.25, 0.42, 0, 0.12),
    ...sleeves(0.25, 0, 0.86, [0.16, 0.5]), ...bodyGrid(0.25, 0.12, 0.75, 1)],
};

// Baseball full-button jersey (ZBA71, p. 93; BA5500): short sleeves, a
// placket of buttons down the front and a rounded shirt-tail hem.
const button = {
  id: "button", label: "Button jersey", aspect: 1.15,
  outline: mirrorOutline([[0.5, 0.06], [0.42, 0.02], [0.38, 0], [0.21, 0.04], [0, 0.3], [0.1, 0.42], [0.21, 0.32], [0.21, 0.92], [0.3, 0.98], [0.5, 1]]),
  detail: {
    front: [[[0.42, 0.02], [0.48, 0.13]], [[0.58, 0.02], [0.52, 0.13]], [[0.48, 0.13], [0.48, 0.997]], [[0.52, 0.13], [0.52, 0.997]],
      ...[0.24, 0.4, 0.56, 0.72, 0.88].map(y => hline(0.49, 0.51, y)), ...both([[0.03, 0.275], [0.125, 0.395]])],
    back: [[[0.42, 0.02], [0.46, 0.07], [0.5, 0.085], [0.54, 0.07], [0.58, 0.02]], ...both([[0.03, 0.275], [0.125, 0.395]])],
  },
  regions: [area("collar", "collar", [0.38, 0.03, 0.62, 0.13]), area("buttons", "button placket", [0.47, 0.1, 0.53, 1], "front"),
    ...shoulders(0.21, 0.42, 0, 0.1), ...sleeves(0.21, 0, 0.44), ...bodyGrid(0.21, 0.1, 0.79, 1)],
};

// Tank or singlet (ZB11, p. 95; basketball, track, scrimmage vests): no
// sleeves, flat shoulder straps, deep armholes and a round scoop neck. The
// front has a double binding round the neck (the trim of the sublimated
// tanks), the back a single one, so the two views differ at a glance.
const tank = {
  id: "tank", label: "Tank / singlet", aspect: 0.75,
  outline: mirrorOutline([[0.5, 0.16], [0.43, 0.14], [0.39, 0.07], [0.38, 0], [0.28, 0], [0.27, 0.1], [0.24, 0.22], [0.19, 0.3], [0.13, 0.34], [0.13, 1], [0.5, 1]]),
  detail: {
    front: [[[0.37, 0.005], [0.375, 0.075], [0.42, 0.16], [0.5, 0.18], [0.58, 0.16], [0.625, 0.075], [0.63, 0.005]],
      [[0.36, 0.005], [0.363, 0.08], [0.412, 0.175], [0.5, 0.198], [0.588, 0.175], [0.637, 0.08], [0.64, 0.005]],
      ...both([[0.29, 0.005], [0.282, 0.1], [0.253, 0.228], [0.2, 0.313], [0.135, 0.355]]), hline(0.13, 0.87, 0.96)],
    back: [[[0.37, 0.005], [0.375, 0.075], [0.42, 0.16], [0.5, 0.18], [0.58, 0.16], [0.625, 0.075], [0.63, 0.005]],
      ...both([[0.29, 0.005], [0.282, 0.1], [0.253, 0.228], [0.2, 0.313], [0.135, 0.355]]), hline(0.13, 0.87, 0.96)],
  },
  regions: [area("collar", "neck", [0.4, 0.12, 0.6, 0.24]), ...shoulders(0.13, 0.43, 0, 0.2), ...bodyGrid(0.13, 0.2, 0.87, 1)],
};

// Football jersey (ZF101, p. 97): very wide shoulders, short sleeves, a long
// body and a yoke seam across the chest.
const football = {
  id: "football", label: "Football jersey", aspect: 1.2,
  outline: mirrorOutline([[0.5, 0.07], [0.42, 0.02], [0.38, 0], [0.14, 0.06], [0, 0.22], [0.04, 0.36], [0.17, 0.3], [0.17, 1], [0.5, 1]]),
  detail: {
    front: [[[0.42, 0.02], [0.5, 0.15], [0.58, 0.02]], hline(0.17, 0.83, 0.24), ...both([[0.025, 0.2], [0.065, 0.345]]), hline(0.17, 0.83, 0.96)],
    back: [[[0.42, 0.02], [0.46, 0.07], [0.5, 0.085], [0.54, 0.07], [0.58, 0.02]], hline(0.17, 0.83, 0.24), ...both([[0.025, 0.2], [0.065, 0.345]]), hline(0.17, 0.83, 0.96)],
  },
  regions: [area("collar", "collar", [0.38, 0.04, 0.62, 0.14]), ...shoulders(0.17, 0.42, 0, 0.12),
    ...sleeves(0.17, 0, 0.37), ...bodyGrid(0.17, 0.12, 0.83, 1)],
};

// Hoodie (ZAL2010P, p. 87; A3050 and the other hoodies): a hood above the
// shoulders, long sleeves, a pouch pocket and a ribbed waist in front.
const hoodie = {
  id: "hoodie", label: "Hoodie", aspect: 1.25,
  outline: mirrorOutline([[0.5, 0], [0.41, 0.01], [0.35, 0.06], [0.33, 0.15], [0.24, 0.19], [0.02, 0.87], [0.13, 0.9], [0.25, 0.43], [0.25, 1], [0.5, 1]]),
  detail: {
    front: [[[0.38, 0.17], [0.39, 0.08], [0.44, 0.04], [0.5, 0.035], [0.56, 0.04], [0.61, 0.08], [0.62, 0.17]],
      [[0.38, 0.17], [0.5, 0.2], [0.62, 0.17]], ...both([[0.46, 0.195], [0.455, 0.32]]),
      [[0.33, 0.93], [0.36, 0.72], [0.64, 0.72], [0.67, 0.93]], hline(0.25, 0.75, 0.93), ...both([[0.035, 0.83], [0.13, 0.86]])],
    back: [[[0.5, 0], [0.5, 0.18]], [[0.34, 0.15], [0.42, 0.18], [0.5, 0.19], [0.58, 0.18], [0.66, 0.15]],
      hline(0.25, 0.75, 0.93), ...both([[0.035, 0.83], [0.13, 0.86]])],
  },
  regions: [area("hood", "hood", [0.33, 0, 0.67, 0.19]), area("pocket", "pouch pocket", [0.34, 0.72, 0.66, 0.93], "front"),
    area("waistband", "waistband", [0.25, 0.93, 0.75, 1]), ...shoulders(0.25, 0.34, 0.15, 0.25),
    ...sleeves(0.25, 0.15, 0.92, [0.17, 0.55]), ...bodyGrid(0.25, 0.19, 0.75, 0.93)],
};

// Zip jacket or tracksuit top (ZAL2710, p. 87; ZAT jackets): a stand-up
// collar, a zip from collar to hem, long sleeves and a waistband.
const jacket = {
  id: "jacket", label: "Zip jacket", aspect: 1.25,
  outline: mirrorOutline([[0.5, 0.01], [0.4, 0], [0.38, 0.05], [0.26, 0.07], [0.03, 0.86], [0.13, 0.9], [0.26, 0.42], [0.26, 1], [0.5, 1]]),
  detail: {
    front: [[[0.5, 0.01], [0.5, 1]], [[0.385, 0.05], [0.44, 0.075], [0.5, 0.08], [0.56, 0.075], [0.615, 0.05]],
      hline(0.26, 0.74, 0.94), ...both([[0.045, 0.82], [0.135, 0.855]])],
    back: [[[0.385, 0.05], [0.44, 0.07], [0.5, 0.075], [0.56, 0.07], [0.615, 0.05]], hline(0.26, 0.74, 0.94), ...both([[0.045, 0.82], [0.135, 0.855]])],
  },
  regions: [area("collar", "collar", [0.38, 0, 0.62, 0.11]), area("zip", "zip", [0.47, 0.11, 0.53, 0.94], "front"),
    area("waistband", "waistband", [0.26, 0.94, 0.74, 1]), ...shoulders(0.26, 0.38, 0.03, 0.14),
    ...sleeves(0.26, 0.03, 0.92, [0.17, 0.55]), ...bodyGrid(0.26, 0.11, 0.74, 0.94)],
};

// Shorts (ZBS91, p. 96; every *S1700 short; the H901 / ZH9xx hockey pant
// shells, which are knee length): a straight waistband, legs flaring a
// little, the crotch about two thirds down.
const shorts = {
  id: "shorts", label: "Shorts", aspect: 1.35,
  outline: mirrorOutline([[0.5, 0], [0.12, 0], [0.02, 0.97], [0.46, 1], [0.5, 0.66]]),
  detail: {
    front: [hline(0.11, 0.89, 0.1), ...both([[0.47, 0.1], [0.46, 0.22]]), ...both([[0.025, 0.92], [0.45, 0.95]])],
    back: [hline(0.11, 0.89, 0.1), [[0.5, 0.1], [0.5, 0.66]], ...both([[0.025, 0.92], [0.45, 0.95]])],
  },
  regions: [area("waistband", "waistband", [0.1, 0, 0.9, 0.1]),
    area("left-upper", "upper left leg", [0.05, 0.1, 0.5, 0.5]), area("right-upper", "upper right leg", [0.5, 0.1, 0.95, 0.5]),
    area("left-lower", "lower left leg", [0, 0.5, 0.5, 1]), area("right-lower", "lower right leg", [0.5, 0.5, 1, 1])],
};

// Pants (ZBAP61, p. 94; baseball and track pants): two long legs tapering
// to the hem, a waistband and a fly in front, pockets behind.
const pants = {
  id: "pants", label: "Pants", aspect: 0.55,
  outline: mirrorOutline([[0.5, 0], [0.14, 0], [0.08, 0.3], [0.12, 1], [0.46, 1], [0.5, 0.3]]),
  detail: {
    front: [hline(0.136, 0.864, 0.05), [[0.54, 0.05], [0.54, 0.2], [0.5, 0.25]], ...both([[0.115, 0.97], [0.46, 0.97]])],
    back: [hline(0.136, 0.864, 0.05), ...both([[0.24, 0.11], [0.4, 0.11]]), ...both([[0.115, 0.97], [0.46, 0.97]])],
  },
  regions: [area("waistband", "waistband", [0.1, 0, 0.9, 0.06]),
    area("left-thigh", "left thigh", [0.08, 0.06, 0.5, 0.35]), area("right-thigh", "right thigh", [0.5, 0.06, 0.92, 0.35]),
    area("left-knee", "left knee", [0.08, 0.35, 0.5, 0.7]), area("right-knee", "right knee", [0.5, 0.35, 0.92, 0.7]),
    area("left-lower", "lower left leg", [0.08, 0.7, 0.5, 1]), area("right-lower", "lower right leg", [0.5, 0.7, 0.92, 1])],
};

// Socks (ZH702, p. 85; HS630, HS2100): one sock, an open tube wide at the
// top and narrowing to the ankle. Front and back are the two faces of it.
const socks = {
  id: "socks", label: "Socks", aspect: 0.35,
  outline: mirrorOutline([[0.5, 0], [0.08, 0], [0.12, 0.55], [0.22, 1], [0.5, 1]]),
  detail: {
    front: [hline(0.085, 0.915, 0.07), hline(0.21, 0.79, 0.96)],
    back: [hline(0.085, 0.915, 0.07), [[0.5, 0.07], [0.5, 0.96]], hline(0.21, 0.79, 0.96)],
  },
  regions: [area("top", "top band", [0, 0, 1, 0.1]), area("upper", "upper", [0, 0.1, 1, 0.4]),
    area("middle", "middle", [0, 0.4, 1, 0.7]), area("lower", "lower (ankle)", [0, 0.7, 1, 1])],
};

export const GARMENTS = { hockey, tee, longtee, button, tank, football, hoodie, jacket, shorts, pants, socks };
export const GARMENT_IDS = Object.keys(GARMENTS);
// Object.hasOwn, not GARMENTS[kind]: the kind comes from roster files and hub
// request bodies, and "constructor" or "__proto__" must not pass as a kind.
const isKind = kind => typeof kind === "string" && Object.hasOwn(GARMENTS, kind);
// The shape of a kind; an unknown or empty kind is hockey.
export const garment = kind => GARMENTS[isKind(kind) ? kind : DEFAULT_GARMENT];

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
  // scarves, pennants, banners, garment bags. They have no kind, so the row
  // falls back to the order's garment.
  none: {
    exact: ["A1830", "BA101", "AT200"],                // hockey toque (p. 38) and its custom code; adjustable belt (p. 56)
    prefixes: [/^(ZAA|AH|BAH)/],                       // ZAA accessories (p. 91); caps and hats
  },
  exact: {
    // Hockey jerseys (pp. 4–27).
    H550: "hockey", H8000: "hockey", H7500: "hockey", H7100: "hockey", H6500: "hockey", H6400: "hockey",
    H6100: "hockey", H6250: "hockey", H6000: "hockey", H686: "hockey",
    SV100: "tank",                                     // scrimmage vest
    HS630: "socks", HS2100: "socks", HS1100: "socks", BA90: "socks",
    H901: "shorts",                                    // pant shells (p. 23): knee length, shaped like shorts
    // Apparel.
    A3050: "hoodie", A3025: "hoodie", A3087: "hoodie", A3000: "hoodie",
    A1845: "hoodie", A1840: "hoodie", A1835: "hoodie", A1834: "hoodie",
    A1810: "tee", A1375: "tee", A1800: "tee", A2500: "tee", A1900: "longtee",
    AS1700: "shorts",
    // Baseball.
    BA5500: "button", BA5200: "button",
    BA1763: "tee", BA1343: "tee", BA1344: "tee", BA1347: "tee", BA1333: "tee", BA1375: "tee", BA1800: "tee",
    BA1900: "longtee", BA601L: "tank",
    BA2650: "pants", BA2655: "pants", BA2690: "pants", BA2695: "pants",
    BA1391: "pants", BA1390: "pants", BA1380: "pants", BA1385L: "pants", BA1371: "pants",
    BAS1700: "shorts",
    // Basketball, lacrosse, volleyball, soccer, track.
    B1715: "tank", B2115: "tank", BS1700: "shorts",
    LF302: "tank", LF601L: "tank", LS1700: "shorts",
    V1333: "tee", V1375: "tee", V1800: "tee", V1900: "longtee", V601L: "tank", VS1700: "shorts",
    S1333: "tee", S1375: "tee", S1800: "tee", S1900: "longtee", SS1700: "shorts",
    T220: "tank", T205: "tank", T101: "tank",
    // Sleeveless custom jerseys among sleeved series: baseball (p. 93), field
    // lacrosse (p. 98), volleyball (p. 100).
    ZBA16: "tank", ZBA17: "tank", ZBA26: "tank", ZBA27: "tank", ZBA36: "tank", ZBA76: "tank",
    ZLF16: "tank", ZLF17: "tank", ZV16: "tank", ZV17: "tank", ZV26: "tank", ZV27: "tank",
    // The custom codes printed under each in-stock product ("Available in
    // custom A600", pp. 4–75), where every product carrying the code is the
    // same kind. Left out because they cover more than one kind: A200 (A1810
    // polo, A1900 long sleeve), BA200 (tees, BA1900 long sleeve, BA601L
    // tank), BA300 (BA5200 full button, BA1763 and BA1343 tees), V200 and
    // S200 (tees, a long sleeve, V601L tank): those rows use the order's garment.
    H845: "hockey", H680: "hockey", H950: "shorts", HS640: "socks", HS925: "socks", SV80: "tank",
    A600: "hoodie", A500: "hoodie", A400: "hoodie", A100: "tee",
    AS200: "shorts", AS100: "shorts",
    BA400: "button", BA100: "tee", BA900: "pants", BA750: "pants", BAS200: "shorts", BAS100: "shorts",
    B500: "tank", B200: "tank", B100: "tank", B300: "tank", BS200: "shorts", BS100: "shorts",
    LF100: "tank", LF200: "tank", LS200: "shorts", LS100: "shorts",
    V100: "tee", VS200: "shorts", VS100: "shorts",
    S100: "tee", SS200: "shorts", SS100: "shorts",
    T200: "tank", T100: "tank",
  },
  // Checked in order, first match wins: the longer, more particular prefixes
  // come before the short ones they start with (ZH7 socks before ZH hockey,
  // ZBAS shorts before ZBA tees).
  prefixes: [
    [/^HS\d{3,4}/, "socks"], [/^ZH7/, "socks"],
    [/^(H9|ZH9)/, "shorts"],                            // pant shells (pp. 23, 86)
    [/^H\d{3,4}/, "hockey"], [/^ZH/, "hockey"],
    [/^(ZAP|ZBP|ZBAP|ZF9)/, "pants"],
    [/^(AS|BS|LS|SS|VS|TS|BAS)\d{4}/, "shorts"],
    [/^(ZBS|ZVS|ZSS|ZTS|ZRS|ZS5|ZL9|ZLS|ZAS|ZBAS|ZBA9|ZCS|ZCB)/, "shorts"],
    [/^ZLR/, "tank"],                                   // reversible lacrosse pinnie (p. 98)
    [/^ZLF/, "tee"], [/^ZLB/, "hockey"],                // field lacrosse shirts; box lacrosse jerseys
    [/^ZF/, "football"],
    [/^(ZBA7|ZBA8|BA5\d{3})/, "button"],
    // Apparel (p. 87, 92): ZAL26xx/27xx are zip sweatshirts and ZAL37xx a zip
    // jacket; ZAL20xx and ZAL33xx are hoodies; every other ZAL has long sleeves.
    [/^ZAT/, "jacket"], [/^ZAL(26|27|37)\d\d/, "jacket"], [/^ZAL(20|33)\d\d/, "hoodie"], [/^ZAL/, "longtee"],
    [/^A3\d{3}/, "hoodie"],
    [/^(ZVL|ZBWL)/, "longtee"],
    [/^ZTC/, "tee"], [/^ZT\d/, "tank"],
    [/^(ZBR|ZB\d|BR\d{4}|B\d{4}|SV\d{3}|LF\d{3}|T\d{3})/, "tank"],
    [/^(ZBA|ZBW|ZS|ZV|ZA|ZR|ZC|BA\d{4}|[SV]\d{4}|A\d{4})/, "tee"],
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
export function insideGarment(kind, x, y) {
  const pts = garment(kind).outline;
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
    return words.length ? `${SIDE_LABELS[side]}: ${words.join(", ")}` : "";
  }).filter(Boolean).join(" · ");
}
