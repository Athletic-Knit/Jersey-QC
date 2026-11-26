// Turns the garment drawings in assets/garments/*.svg (the company's flat
// line drawings, exported from Illustrator, every file 1080 × 270 with the
// views side by side) into src/lib/garment-shapes.js: for each garment the
// FRONT and BACK view as
//   outline  the silhouette, one closed polygon (the union of everything drawn
//            in that view, holes filled, traced on a grid and simplified)
//   detail   the seams, collars, cuffs, pockets, zips: every solid line of the
//            view, flattened, with the parts that run along the outline taken
//            off (the outline is drawn already), the stitching (dashed lines)
//            and the very short lines (knit ribbing, the logo tag) left out
// in 0–1 of one box shared by both views (y down, as on the screen and the
// Zebra), and `aspect` = the box's width over its height.
//
//   node tools/svg-garments.mjs            writes src/lib/garment-shapes.js
//   node tools/svg-garments.mjs --preview  also writes data/garment-preview.html
//
// No packages: a small SVG reader that knows what Illustrator writes (path,
// polygon, polyline, line, rect, circle, ellipse; transforms; classes in one
// <style>). <defs>, <image> and <clipPath> are skipped.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "assets", "garments");

// Which views of each file are the FRONT and the BACK, counted from the left
// (the pant shell and the shorts have four: front, side, back, side).
const FILES = {
  hockey: [0, 1], hockeypants: [0, 2], socks: [0, 1],
  basketball: [0, 1], basketballpants: [0, 1],
  baseball: [0, 1], baseballpants: [0, 1],
  hoodie: [0, 1], jacket: [0, 1], longtee: [0, 1], pants: [0, 1], shorts: [0, 2],
  garmentbag: [0, 1],
};

// ── Reading the SVG ──────────────────────────────────────────────────────────
const attrsOf = s => { const a = {}; for (const m of s.matchAll(/([\w:-]+)="([^"]*)"/g)) a[m[1]] = m[2]; return a; };
function classStyles(svg) {
  const css = (svg.match(/<style>([\s\S]*?)<\/style>/) || ["", ""])[1], out = {};
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const props = {};
    for (const d of m[2].split(";")) { const [k, v] = d.split(":").map(t => t && t.trim()); if (k && v) props[k] = v; }
    for (const sel of m[1].split(",")) { const c = sel.trim().replace(/^\./, ""); out[c] = { ...(out[c] || {}), ...props }; }
  }
  return out;
}
const I = [1, 0, 0, 1, 0, 0];
const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
function parseTransform(t) {
  let m = I;
  for (const [, fn, args] of (t || "").matchAll(/(\w+)\(([^)]*)\)/g)) {
    const v = args.split(/[\s,]+/).filter(Boolean).map(Number);
    let n = I;
    if (fn === "matrix") n = v;
    else if (fn === "translate") n = [1, 0, 0, 1, v[0], v[1] || 0];
    else if (fn === "scale") n = [v[0], 0, 0, v[1] ?? v[0], 0, 0];
    else if (fn === "rotate") {
      const r = v[0] * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
      n = [c, s, -s, c, 0, 0];
      if (v.length > 2) n = mul(mul([1, 0, 0, 1, v[1], v[2]], n), [1, 0, 0, 1, -v[1], -v[2]]);
    }
    m = mul(m, n);
  }
  return m;
}
const apply = (m, [x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

// A path's d as subpaths of points (curves flattened).
function pathPoints(d) {
  const toks = d.match(/[a-zA-Z]|-?(?:\d*\.\d+|\d+\.?)(?:e-?\d+)?/g) || [];
  const subs = []; let cur = null, i = 0, cmd = "", x = 0, y = 0, sx = 0, sy = 0, lc = null, lq = null;
  const num = () => Number(toks[i++]);
  const push = p => { if (!cur) { cur = { pts: [[x, y]], closed: false }; subs.push(cur); } cur.pts.push(p); };
  const bez = (p0, p1, p2, p3) => { for (let k = 1; k <= 10; k++) { const t = k / 10, u = 1 - t;
    push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]); } };
  const quad = (p0, p1, p2) => { for (let k = 1; k <= 8; k++) { const t = k / 8, u = 1 - t;
    push([u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]); } };
  const arc = (rx, ry, rot, large, sweep, x2, y2) => {
    const x1 = x, y1 = y; rx = Math.abs(rx); ry = Math.abs(ry);
    if (!rx || !ry) { push([x2, y2]); return; }
    const ph = rot * Math.PI / 180, c = Math.cos(ph), s = Math.sin(ph);
    const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2, x1p = c * dx + s * dy, y1p = -s * dx + c * dy;
    const L = x1p * x1p / (rx * rx) + y1p * y1p / (ry * ry); if (L > 1) { rx *= Math.sqrt(L); ry *= Math.sqrt(L); }
    const sign = large === sweep ? -1 : 1;
    const num_ = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p, den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
    const co = sign * Math.sqrt(Math.max(0, num_ / den)), cxp = co * rx * y1p / ry, cyp = -co * ry * x1p / rx;
    const cx = c * cxp - s * cyp + (x1 + x2) / 2, cy = s * cxp + c * cyp + (y1 + y2) / 2;
    const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
    let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
    if (!sweep && dt > 0) dt -= 2 * Math.PI; if (sweep && dt < 0) dt += 2 * Math.PI;
    for (let k = 1; k <= 12; k++) { const t = t1 + dt * k / 12; push([cx + rx * Math.cos(t) * c - ry * Math.sin(t) * s, cy + rx * Math.cos(t) * s + ry * Math.sin(t) * c]); }
  };
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++];
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase(), ox = rel ? x : 0, oy = rel ? y : 0;
    if (C === "Z") { if (cur) { cur.closed = true; cur = null; } x = sx; y = sy; lc = lq = null; continue; }
    if (C === "M") { x = num() + ox; y = num() + oy; sx = x; sy = y; cur = { pts: [[x, y]], closed: false }; subs.push(cur); cmd = rel ? "l" : "L"; lc = lq = null; continue; }
    if (C === "L") { x = num() + ox; y = num() + oy; push([x, y]); lc = lq = null; }
    else if (C === "H") { x = num() + ox; push([x, y]); lc = lq = null; }
    else if (C === "V") { y = num() + oy; push([x, y]); lc = lq = null; }
    else if (C === "C" || C === "S") {
      const p1 = C === "C" ? [num() + ox, num() + oy] : lc ? [2 * x - lc[0], 2 * y - lc[1]] : [x, y];
      const p2 = [num() + ox, num() + oy], p3 = [num() + ox, num() + oy];
      bez([x, y], p1, p2, p3); lc = p2; lq = null; [x, y] = p3;
    } else if (C === "Q" || C === "T") {
      const p1 = C === "Q" ? [num() + ox, num() + oy] : lq ? [2 * x - lq[0], 2 * y - lq[1]] : [x, y];
      const p2 = [num() + ox, num() + oy];
      quad([x, y], p1, p2); lq = p1; lc = null; [x, y] = p2;
    } else if (C === "A") {
      const rx = num(), ry = num(), rot = num(), la = num(), sw = num(), x2 = num() + ox, y2 = num() + oy;
      arc(rx, ry, rot, la, sw, x2, y2); x = x2; y = y2; lc = lq = null;
    } else { i++; }
  }
  return subs.filter(s => s.pts.length > 1);
}

function shapesOf(svg) {
  const styles = classStyles(svg), out = [];
  const body = svg.replace(/<defs>[\s\S]*?<\/defs>/g, "").replace(/<clipPath[\s\S]*?<\/clipPath>/g, "").replace(/<style>[\s\S]*?<\/style>/g, "");
  const stack = [I];
  for (const m of body.matchAll(/<(\/?)([a-zA-Z]+)([^>]*?)(\/?)>/g)) {
    const [, close, tag, rest, self] = m;
    if (close) { if (tag === "g") stack.pop(); continue; }
    const a = attrsOf(rest), mtx = mul(stack[stack.length - 1], parseTransform(a.transform));
    if (tag === "g") { if (!self) stack.push(mtx); continue; }
    let subs = null;
    if (tag === "path") subs = pathPoints(a.d || "");
    else if (tag === "polygon" || tag === "polyline") {
      const v = (a.points || "").trim().split(/[\s,]+/).map(Number), pts = [];
      for (let k = 0; k + 1 < v.length; k += 2) pts.push([v[k], v[k + 1]]);
      subs = [{ pts, closed: tag === "polygon" }];
    } else if (tag === "line") subs = [{ pts: [[+a.x1 || 0, +a.y1 || 0], [+a.x2 || 0, +a.y2 || 0]], closed: false }];
    else if (tag === "rect") { const x = +a.x || 0, y = +a.y || 0, w = +a.width || 0, h = +a.height || 0;
      subs = [{ pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], closed: true }]; }
    else if (tag === "circle" || tag === "ellipse") { const cx = +a.cx || 0, cy = +a.cy || 0, rx = +(a.r || a.rx) || 0, ry = +(a.r || a.ry) || 0;
      subs = [{ pts: Array.from({ length: 16 }, (_, k) => [cx + rx * Math.cos(k * Math.PI / 8), cy + ry * Math.sin(k * Math.PI / 8)]), closed: true }]; }
    if (!subs || !subs.length) continue;
    const st = {};
    for (const c of (a.class || "").split(/\s+/)) Object.assign(st, styles[c] || {});
    for (const k of ["fill", "stroke", "stroke-width", "stroke-dasharray"]) if (a[k]) st[k] = a[k];
    const fill = st.fill !== "none", stroke = st.stroke && st.stroke !== "none";
    const sw = parseFloat(st["stroke-width"] ?? "1");
    out.push({ fill, stroke, sw, dashed: !!st["stroke-dasharray"], subs: subs.map(s => ({ closed: s.closed, pts: s.pts.map(p => apply(mtx, p)) })) });
  }
  return out;
}

// ── The silhouettes, on a grid ───────────────────────────────────────────────
const K = 3;                         // grid cells per SVG unit
const W = 1080 * K, H = 270 * K;
function fillPoly(mask, pts) {       // even-odd scanline fill of one closed ring
  let y0 = Infinity, y1 = -Infinity;
  for (const [, y] of pts) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  for (let gy = Math.max(0, Math.floor(y0 * K)); gy <= Math.min(H - 1, Math.ceil(y1 * K)); gy++) {
    const yy = (gy + 0.5) / K, xs = [];
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > yy) !== (yj > yy)) xs.push(xi + (yy - yi) * (xj - xi) / (yj - yi));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2)
      for (let gx = Math.max(0, Math.ceil(xs[k] * K - 0.5)); gx <= Math.min(W - 1, Math.floor(xs[k + 1] * K - 0.5)); gx++) mask[gy * W + gx] = 1;
  }
}
function strokeLine(mask, [xa, ya], [xb, yb], r) {
  const n = Math.max(1, Math.ceil(Math.hypot(xb - xa, yb - ya) * K * 2)), rr = Math.max(1, Math.round(r * K));
  for (let k = 0; k <= n; k++) {
    const gx = Math.round((xa + (xb - xa) * k / n) * K), gy = Math.round((ya + (yb - ya) * k / n) * K);
    for (let dy = -rr; dy <= rr; dy++) for (let dx = -rr; dx <= rr; dx++) {
      const x = gx + dx, y = gy + dy; if (x >= 0 && y >= 0 && x < W && y < H) mask[y * W + x] = 1;
    }
  }
}
// Connected parts of the mask (4-neighbour), each { cells: Int32Array-ish, x0, x1, y0, y1, n }.
function components(mask) {
  const lab = new Int32Array(W * H), comps = []; const q = new Int32Array(W * H);
  for (let s = 0; s < W * H; s++) {
    if (!mask[s] || lab[s]) continue;
    const id = comps.length + 1; let h = 0, t = 0; q[t++] = s; lab[s] = id;
    let x0 = W, x1 = 0, y0 = H, y1 = 0, n = 0;
    while (h < t) {
      const c = q[h++], x = c % W, y = (c / W) | 0; n++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const d of [c - 1, c + 1, c - W, c + W]) {
        if (d < 0 || d >= W * H || lab[d] || !mask[d]) continue;
        if ((d === c - 1 && x === 0) || (d === c + 1 && x === W - 1)) continue;
        lab[d] = id; q[t++] = d;
      }
    }
    comps.push({ id, x0, x1, y0, y1, n });
  }
  return { lab, comps };
}
// The outer boundary of one component as a ring of grid corners (holes ignored:
// the outside is flooded from the frame, and the boundary is traced between
// the flooded outside and everything else).
function outerRing(lab, id, box) {
  const pad = 2, x0 = box.x0 - pad, y0 = box.y0 - pad, w = box.x1 - box.x0 + 1 + 2 * pad, h = box.y1 - box.y0 + 1 + 2 * pad;
  const inside = (x, y) => { const gx = x + x0, gy = y + y0; return gx >= 0 && gy >= 0 && gx < W && gy < H && lab[gy * W + gx] === id; };
  const out = new Uint8Array(w * h), q = [0]; out[0] = 1;   // flood the outside from the corner
  while (q.length) { const c = q.pop(), x = c % w, y = (c / w) | 0;
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const d = ny * w + nx;
      if (out[d] || inside(nx, ny)) continue; out[d] = 1; q.push(d);
    } }
  const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && !out[y * w + x];
  // Moore-neighbour tracing round the solid, from its top-left cell, clockwise.
  let start = null;
  for (let y = 0; y < h && !start; y++) for (let x = 0; x < w; x++) if (solid(x, y)) { start = [x, y]; break; }
  const N = [[-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1]];   // W, NW, N, NE, E, SE, S, SW
  const sb = [start[0] - 1, start[1]];                        // the cell west of the start is outside
  const ring = [start]; let p = start, b = sb, guard = 0;
  while (guard++ < 2e6) {
    const idx = N.findIndex(([dx, dy]) => p[0] + dx === b[0] && p[1] + dy === b[1]);
    let q = null, nb = null;
    for (let k = 1; k <= 8; k++) {
      const d = (idx + k) % 8, c = [p[0] + N[d][0], p[1] + N[d][1]];
      if (solid(c[0], c[1])) { q = c; const e = (d + 7) % 8; nb = [p[0] + N[e][0], p[1] + N[e][1]]; break; }
    }
    if (!q) break;                                            // a single cell
    if (q[0] === start[0] && q[1] === start[1] && nb[0] === sb[0] && nb[1] === sb[1]) break;   // Jacob's stop
    if (!(q[0] === start[0] && q[1] === start[1])) ring.push(q);
    p = q; b = nb;
  }
  // Cell centres to SVG units.
  return ring.map(([x, y]) => [(x + x0 + 0.5) / K, (y + y0 + 0.5) / K]);

}

// Douglas–Peucker, for an open line; a ring is split at its farthest pair.
function rdp(pts, tol) {
  if (pts.length < 3) return pts.slice();
  const [a, b] = [pts[0], pts[pts.length - 1]];
  let md = -1, mi = 0;
  for (let i = 1; i < pts.length - 1; i++) { const d = distSeg(pts[i], a, b); if (d > md) { md = d; mi = i; } }
  if (md <= tol) return [a, b];
  return [...rdp(pts.slice(0, mi + 1), tol).slice(0, -1), ...rdp(pts.slice(mi), tol)];
}
function rdpRing(ring, tol) {
  let far = 0, fd = -1;
  for (let i = 0; i < ring.length; i++) { const d = Math.hypot(ring[i][0] - ring[0][0], ring[i][1] - ring[0][1]); if (d > fd) { fd = d; far = i; } }
  const a = rdp(ring.slice(0, far + 1), tol), b = rdp([...ring.slice(far), ring[0]], tol);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}
function distSeg(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
const ringDist = (ring, p) => { let d = Infinity; for (let i = 0; i < ring.length; i++) d = Math.min(d, distSeg(p, ring[i], ring[(i + 1) % ring.length])); return d; };
function inRing(ring, [x, y]) {
  let ins = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}
const lengthOf = pts => pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);
// A line resampled so no step is longer than `step` (so a long straight seam
// can be cut where it meets the outline).
function densify(pts, step) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
    for (let k = 1; k <= n; k++) out.push([ax + (bx - ax) * k / n, ay + (by - ay) * k / n]);
  }
  return out;
}

// ── One file ─────────────────────────────────────────────────────────────────
const ON_EDGE = 1.6;      // SVG units: a line this close to the outline is the outline
const MIN_LEN = 7;        // SVG units: shorter lines are texture (ribbing, a tag)
const TOL_OUT = 0.5, TOL_DET = 0.45;

function convert(id, [fi, bi]) {
  const svg = readFileSync(join(SRC, `${id}.svg`), "utf8");
  const shapes = shapesOf(svg);
  const mask = new Uint8Array(W * H);
  for (const s of shapes) for (const sub of s.subs) {
    if (s.fill && sub.pts.length > 2) fillPoly(mask, sub.pts);
    if (s.stroke) for (let i = 1; i < sub.pts.length; i++) strokeLine(mask, sub.pts[i - 1], sub.pts[i], Math.max(0.3, s.sw / 2));
  }
  const { lab, comps } = components(mask);
  // The views: the big parts, left to right. A small part (a hanger loop, a
  // drawstring end) belongs to the nearest big one.
  const bigN = Math.max(...comps.map(c => c.n));
  const big = comps.filter(c => c.n > bigN * 0.12).sort((a, b) => a.x0 - b.x0);
  for (const c of comps) {
    if (big.includes(c)) continue;
    const cx = (c.x0 + c.x1) / 2, cy = (c.y0 + c.y1) / 2;
    let best = big[0], bd = Infinity;
    for (const b of big) { const dx = Math.max(b.x0 - cx, 0, cx - b.x1), dy = Math.max(b.y0 - cy, 0, cy - b.y1), d = dx * dx + dy * dy; if (d < bd) { bd = d; best = b; } }
    if (bd > (12 * K) ** 2) continue;           // far from every view: not part of a garment
    // Join it: relabel and widen the box; bridge the gap with a line so the trace keeps it.
    for (let y = c.y0; y <= c.y1; y++) for (let x = c.x0; x <= c.x1; x++) if (lab[y * W + x] === c.id) lab[y * W + x] = best.id;
    best.x0 = Math.min(best.x0, c.x0); best.x1 = Math.max(best.x1, c.x1); best.y0 = Math.min(best.y0, c.y0); best.y1 = Math.max(best.y1, c.y1);
    c.joined = best;
  }
  if (big.length <= Math.max(fi, bi)) throw new Error(`${id}: ${big.length} views found`);
  const views = [fi, bi].map(vi => {
    const comp = big[vi];
    let ring = rdpRing(outerRing(lab, comp.id, comp), TOL_OUT);
    const x0 = comp.x0 / K, x1 = (comp.x1 + 1) / K;
    // Details: solid strokes whose middle is in this view.
    const det = [];
    for (const s of shapes) {
      if (!s.stroke || s.dashed || s.sw < 0.2) continue;
      for (const sub of s.subs) {
        const pts = sub.closed ? [...sub.pts, sub.pts[0]] : sub.pts;
        const mx = pts.reduce((t, p) => t + p[0], 0) / pts.length;
        if (mx < x0 - 1 || mx > x1 + 1) continue;
        // Cut off what runs along the outline or lies outside it.
        let run = [];
        const flush = () => { if (run.length > 1 && lengthOf(run) >= MIN_LEN) det.push(rdp(run, TOL_DET)); run = []; };
        for (const p of densify(pts, 0.8)) {
          if (ringDist(ring, p) <= ON_EDGE || !inRing(ring, p)) flush(); else run.push(p);
        }
        flush();
      }
    }
    // The same line drawn twice (a fill's edge and its stroke): keep one.
    const kept = [];
    for (const d of det.sort((a, b) => lengthOf(b) - lengthOf(a))) {
      if (kept.some(k => d.every(p => { let m = Infinity; for (let i = 1; i < k.length; i++) m = Math.min(m, distSeg(p, k[i - 1], k[i])); return m < 0.9; }))) continue;
      kept.push(d);
    }
    return { ring, det: kept, x0, x1, y0: comp.y0 / K, y1: (comp.y1 + 1) / K };
  });
  // One box for both views: the views' own widths centred in the widest, the
  // drawings' own heights (they stand on one baseline in the file).
  const bw = Math.max(...views.map(v => v.x1 - v.x0)), y0 = Math.min(...views.map(v => v.y0)), y1 = Math.max(...views.map(v => v.y1)), bh = y1 - y0;
  const r3 = v => Math.round(v * 1000) / 1000;
  const norm = v => { const ox = (v.x0 + v.x1) / 2 - bw / 2; return ([x, y]) => [r3((x - ox) / bw), r3((y - y0) / bh)]; };
  const clean = pts => pts.filter((p, i) => !i || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
  const out = { aspect: r3(bw / bh), outline: {}, detail: {} };
  ["front", "back"].forEach((side, i) => {
    const f = norm(views[i]);
    let ring = clean(views[i].ring.map(f));
    if (ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]) ring.pop();
    out.outline[side] = ring;
    out.detail[side] = views[i].det.map(d => clean(d.map(f))).filter(d => d.length > 1);
  });
  return out;
}

const result = {};
for (const [id, views] of Object.entries(FILES)) {
  result[id] = convert(id, views);
  const o = result[id];
  console.log(`${id.padEnd(16)} aspect ${o.aspect}  outline ${o.outline.front.length}/${o.outline.back.length} pts  detail ${o.detail.front.length}/${o.detail.back.length} lines, ${o.detail.front.flat().length + o.detail.back.flat().length} pts`);
}
const fmt = pts => `[${pts.map(([x, y]) => `[${x},${y}]`).join(",")}]`;
const lines = [
  "// GENERATED by tools/svg-garments.mjs from assets/garments/*.svg: do not edit by hand.",
  "// Each garment's FRONT and BACK view: `outline` (the silhouette, a closed polygon) and",
  "// `detail` (seams, collars, cuffs, pockets: open polylines), in 0–1 of one box shared",
  "// by both views, y down; `aspect` = the box's width over its height. The names,",
  "// areas and side captions are in garments.js.",
  "export const SHAPES = {",
  ...Object.entries(result).map(([id, o]) => [
    `  ${id}: {`,
    `    aspect: ${o.aspect},`,
    `    outline: {`,
    `      front: ${fmt(o.outline.front)},`,
    `      back: ${fmt(o.outline.back)},`,
    `    },`,
    `    detail: {`,
    `      front: [${o.detail.front.map(fmt).join(",\n        ")}],`,
    `      back: [${o.detail.back.map(fmt).join(",\n        ")}],`,
    `    },`,
    `  },`,
  ].join("\n")),
  "};",
  "",
];
writeFileSync(join(ROOT, "src", "lib", "garment-shapes.js"), lines.join("\n"));
console.log("wrote src/lib/garment-shapes.js");

if (process.argv.includes("--preview")) {
  const H = 300, cell = Object.entries(result).map(([id, o]) => {
    const w = Math.round(o.aspect * H);
    const pts = p => p.map(([x, y]) => `${(x * w).toFixed(1)},${(y * H).toFixed(1)}`).join(" ");
    return `<div style="display:inline-block;margin:8px;font:14px sans-serif"><b>${id}</b><br>` + ["front", "back"].map(s =>
      `<svg width="${w + 20}" height="${H + 20}" viewBox="-10 -10 ${w + 20} ${H + 20}" style="border:1px solid #ccc;margin:2px">
        <polygon points="${pts(o.outline[s])}" fill="#eef" stroke="#000" stroke-width="1.5"/>
        ${o.detail[s].map(d => `<polyline points="${pts(d)}" fill="none" stroke="#c00" stroke-width="1"/>`).join("")}
      </svg>`).join("") + "</div>";
  }).join("");
  mkdirSync(join(ROOT, "data"), { recursive: true });
  writeFileSync(join(ROOT, "data", "garment-preview.html"), `<html><body style="background:#fff">${cell}</body></html>`);
  console.log("wrote data/garment-preview.html");
}
