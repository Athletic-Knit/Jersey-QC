// The garment outlines (src/lib/garments.js): every outline is a closed shape
// inside its box and holds its own named areas; a tap is on the garment or
// not; spots become words; a roster row's style picks the outline.
import { describe, it, expect } from "vitest";
import {
  GARMENTS, GARMENT_IDS, GARMENT_STYLES, SIDES, MAX_SPOTS, DEFAULT_GARMENT,
  garmentOf, insideGarment, spotWords, styleKind, regionOf, anchorOf,
} from "../garments.js";

const inBox = ([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1;
const centre = anchorOf;

describe("the eleven garment kinds", () => {
  it("are the kinds of the plan, hockey first and the default", () => {
    expect(GARMENT_IDS).toEqual(["hockey", "tee", "longtee", "button", "tank", "football", "hoodie", "jacket", "shorts", "pants", "socks"]);
    expect(DEFAULT_GARMENT).toBe("hockey");
    expect(SIDES).toEqual(["front", "back"]);
    expect(MAX_SPOTS).toBe(3);
  });

  for (const id of GARMENT_IDS) {
    describe(id, () => {
      const g = GARMENTS[id];
      it("has an id, a label and a sensible aspect", () => {
        expect(g.id).toBe(id);
        expect(g.label).toBeTruthy();
        expect(g.aspect).toBeGreaterThan(0.2);
        expect(g.aspect).toBeLessThan(2);
      });
      it("has a closed outline inside 0–1 that touches every edge of its box", () => {
        expect(g.outline.length).toBeGreaterThanOrEqual(4);
        expect(g.outline.every(inBox)).toBe(true);
        // Closed: no repeated last point needed, and no zero-length edge.
        g.outline.forEach((p, i) => {
          const q = g.outline[(i + 1) % g.outline.length];
          expect(p[0] === q[0] && p[1] === q[1]).toBe(false);
        });
        const xs = g.outline.map(p => p[0]), ys = g.outline.map(p => p[1]);
        expect(Math.min(...xs)).toBeLessThan(0.15);
        expect(Math.max(...xs)).toBeGreaterThan(0.85);
        expect(Math.min(...ys)).toBe(0);
        expect(Math.max(...ys)).toBe(1);
      });
      it("is symmetric left to right", () => {
        const key = ([x, y]) => `${Math.round(x * 1000)},${Math.round(y * 1000)}`;
        const pts = new Set(g.outline.map(key));
        for (const [x, y] of g.outline) expect(pts.has(key([1 - x, y]))).toBe(true);
      });
      it("has front and back details, every point inside 0–1", () => {
        for (const side of SIDES) {
          expect(g.detail[side].length).toBeGreaterThan(0);
          for (const line of g.detail[side]) {
            expect(line.length).toBeGreaterThanOrEqual(2);
            expect(line.every(inBox)).toBe(true);
          }
        }
      });
      it("holds the centre of each of its own areas", () => {
        expect(g.regions.length).toBeGreaterThan(2);
        for (const r of g.regions) {
          const [cx, cy] = centre(r);
          expect(insideGarment(id, cx, cy), `${id} ${r.id}`).toBe(true);
          // …and a tap there is named after that area (on the front or the
          // back: the hoodie's pocket covers the front's lower middle).
          const named = (r.side ? [r.side] : SIDES).map(s => regionOf(id, s, cx, cy).id);
          expect(named).toContain(r.id);
        }
      });
      it("says a point off the garment is off it", () => {
        expect(insideGarment(id, -0.1, 0.5)).toBe(false);
        expect(insideGarment(id, 0.5, 1.1)).toBe(false);
        expect(insideGarment(id, 0.001, 0.999)).toBe(false);      // the bottom-left corner of the box
      });
      it("puts one spot each side into words", () => {
        const r = g.regions.find(x => !x.side);
        const [cx, cy] = centre(r);
        expect(spotWords(id, [{ side: "front", x: cx, y: cy }, { side: "back", x: cx, y: cy }]))
          .toBe(`Front: ${r.label} · Back: ${r.label}`);
      });
    });
  }
});

describe("insideGarment", () => {
  it("the hockey jersey: body and sleeve yes, under the sleeve and beside the neck no", () => {
    expect(insideGarment("hockey", 0.5, 0.5)).toBe(true);
    expect(insideGarment("hockey", 0.12, 0.4)).toBe(true);       // left sleeve
    expect(insideGarment("hockey", 0.1, 0.8)).toBe(false);       // below the sleeve
    expect(insideGarment("hockey", 0.5, 0.02)).toBe(false);      // in the neck opening
  });
  it("pants and shorts: the gap between the legs is not the garment", () => {
    expect(insideGarment("pants", 0.5, 0.9)).toBe(false);
    expect(insideGarment("pants", 0.3, 0.9)).toBe(true);
    expect(insideGarment("shorts", 0.5, 0.9)).toBe(false);
  });
  it("the tank has no sleeves", () => {
    expect(insideGarment("tank", 0.05, 0.4)).toBe(false);
    expect(insideGarment("tank", 0.3, 0.6)).toBe(true);
  });
  it("an unknown kind is drawn as hockey", () => {
    expect(insideGarment("cape", 0.12, 0.4)).toBe(insideGarment("hockey", 0.12, 0.4));
  });
});

describe("spotWords", () => {
  it("front first, left and right as the operator sees that side", () => {
    expect(spotWords("hockey", [
      { side: "back", x: 0.5, y: 0.9 },
      { side: "front", x: 0.12, y: 0.35 },
      { side: "front", x: 0.88, y: 0.35 },
    ])).toBe("Front: left sleeve, right sleeve · Back: lower middle");
  });
  it("the same words once; no spots, no words", () => {
    expect(spotWords("tee", [{ side: "front", x: 0.1, y: 0.25 }, { side: "front", x: 0.12, y: 0.3 }])).toBe("Front: left sleeve");
    expect(spotWords("tee", [])).toBe("");
    expect(spotWords("tee", undefined)).toBe("");
  });
  it("areas that are on one side only", () => {
    expect(spotWords("hoodie", [{ side: "front", x: 0.5, y: 0.82 }])).toBe("Front: pouch pocket");
    expect(spotWords("hoodie", [{ side: "back", x: 0.5, y: 0.82 }])).toBe("Back: lower middle");
    expect(spotWords("hoodie", [{ side: "back", x: 0.5, y: 0.08 }])).toBe("Back: hood");
    expect(spotWords("button", [{ side: "front", x: 0.5, y: 0.5 }])).toBe("Front: button placket");
    expect(spotWords("jacket", [{ side: "front", x: 0.5, y: 0.5 }])).toBe("Front: zip");
    expect(spotWords("jacket", [{ side: "back", x: 0.5, y: 0.5 }])).toBe("Back: centre");
  });
  it("every kind's own words", () => {
    expect(spotWords("longtee", [{ side: "front", x: 0.1, y: 0.6 }])).toBe("Front: left sleeve");
    expect(spotWords("tank", [{ side: "back", x: 0.35, y: 0.06 }])).toBe("Back: left shoulder");
    expect(spotWords("football", [{ side: "front", x: 0.06, y: 0.25 }])).toBe("Front: left sleeve");
    expect(spotWords("shorts", [{ side: "front", x: 0.8, y: 0.8 }])).toBe("Front: lower right leg");
    expect(spotWords("pants", [{ side: "back", x: 0.3, y: 0.5 }])).toBe("Back: left knee");
    expect(spotWords("socks", [{ side: "front", x: 0.5, y: 0.05 }, { side: "back", x: 0.5, y: 0.85 }])).toBe("Front: top band · Back: lower (ankle)");
  });
  it("shoulders and cuff tips are named for what they are", () => {
    expect(spotWords("hockey", [{ side: "front", x: 0.3, y: 0.03 }])).toBe("Front: left shoulder");
    expect(spotWords("hockey", [{ side: "back", x: 0.7, y: 0.06 }])).toBe("Back: right shoulder");
    expect(spotWords("longtee", [{ side: "front", x: 0.03, y: 0.8 }])).toBe("Front: left sleeve");
    expect(spotWords("hoodie", [{ side: "front", x: 0.03, y: 0.87 }])).toBe("Front: left sleeve");
    expect(spotWords("jacket", [{ side: "front", x: 0.04, y: 0.86 }])).toBe("Front: left sleeve");
    expect(spotWords("jacket", [{ side: "front", x: 0.96, y: 0.86 }])).toBe("Front: right sleeve");
  });
  it("at most MAX_SPOTS spots are put into words", () => {
    expect(spotWords("hockey", [
      { side: "front", x: 0.5, y: 0.5 }, { side: "front", x: 0.6, y: 0.5 }, { side: "front", x: 0.4, y: 0.5 },
      { side: "back", x: 0.5, y: 0.9 },
    ])).toBe("Front: centre, middle right, middle left");
  });
});

describe("garmentOf: which outline a jersey gets", () => {
  it("the catalogue's own styles", () => {
    expect(garmentOf({ style: "H550" })).toBe("hockey");
    expect(garmentOf({ style: "BA5500" })).toBe("button");
    expect(garmentOf({ style: "B1715" })).toBe("tank");
    expect(garmentOf({ style: "HS2100" })).toBe("socks");
    expect(garmentOf({ style: "BA2690" })).toBe("pants");
    expect(garmentOf({ style: "A3050" })).toBe("hoodie");
    expect(garmentOf({ style: "BS1700" })).toBe("shorts");
    expect(garmentOf({ style: "S1900" })).toBe("longtee");
  });
  it("custom-sublimation series by their prefix", () => {
    expect(styleKind("ZH101")).toBe("hockey");
    expect(styleKind("ZH702")).toBe("socks");
    expect(styleKind("ZH901")).toBe("shorts");
    expect(styleKind("ZF101")).toBe("football");
    expect(styleKind("ZBA71")).toBe("button");
    expect(styleKind("ZBA16")).toBe("tank");
    expect(styleKind("ZBA11")).toBe("tee");
    expect(styleKind("ZB11")).toBe("tank");
    expect(styleKind("ZBS91")).toBe("shorts");
    expect(styleKind("ZAL2010P")).toBe("hoodie");
    expect(styleKind("ZAT5010P")).toBe("jacket");
    expect(styleKind("ZVL11")).toBe("longtee");
    expect(styleKind("ZS11")).toBe("tee");
  });
  it("case, spaces, dashes and a colour after the code do not matter", () => {
    expect(styleKind(" h550 ")).toBe("hockey");
    expect(styleKind("H550-Y")).toBe("hockey");
    expect(styleKind("ZH101 Black")).toBe("hockey");
    expect(styleKind("BA 5500")).toBe("button");
    expect(styleKind("ba1385l")).toBe("pants");
  });
  it("an unknown style uses the order's garment; nothing at all is hockey", () => {
    expect(garmentOf({ style: "XYZ" }, "tee")).toBe("tee");
    expect(garmentOf({ style: "AH250" }, "hoodie")).toBe("hoodie");   // a cap is not a garment
    expect(garmentOf({}, "pants")).toBe("pants");
    expect(garmentOf({ style: "" })).toBe("hockey");
    expect(garmentOf(undefined)).toBe("hockey");
    expect(garmentOf({}, "cape")).toBe("hockey");
  });
  it("the row's style beats the order's garment (a mixed roster)", () => {
    expect(garmentOf({ style: "HS630" }, "hockey")).toBe("socks");
  });
  it("every exact style names a real kind", () => {
    for (const kind of Object.values(GARMENT_STYLES.exact)) expect(GARMENT_IDS).toContain(kind);
    for (const [, kind] of GARMENT_STYLES.prefixes) expect(GARMENT_IDS).toContain(kind);
  });
});

// ── Geometry checks over every kind ──────────────────────────────────────────
const distSeg = (p, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};
const edgeDist = (o, p) => Math.min(...o.map((a, i) => distSeg(p, a, o[(i + 1) % o.length])));
// The sleeved tops: the x of the body's side seam (sleeves left of it).
const BODY_EDGE = { hockey: 0.245, tee: 0.2, longtee: 0.25, button: 0.21, football: 0.17, hoodie: 0.25, jacket: 0.26 };

describe("details and areas stay on the garment", () => {
  for (const id of GARMENT_IDS) {
    it(`${id}: every detail line lies inside the outline (or on its edge)`, () => {
      const o = GARMENTS[id].outline;
      for (const side of SIDES) for (const line of GARMENTS[id].detail[side]) {
        for (let i = 0; i < line.length - 1; i++) for (let t = 0; t <= 1.0001; t += 0.05) {
          const p = [line[i][0] + (line[i + 1][0] - line[i][0]) * t, line[i][1] + (line[i + 1][1] - line[i][1]) * t];
          const ok = insideGarment(id, p[0], p[1]) || edgeDist(o, p) <= 0.005;
          expect(ok, `${id} ${side} detail at ${p.map(v => v.toFixed(3))}`).toBe(true);
        }
      }
    });
  }

  for (const [id, edge] of Object.entries(BODY_EDGE)) {
    it(`${id}: a tap left of the body is the left sleeve (or shoulder), never the collar far from it`, () => {
      const g = GARMENTS[id];
      const collar = g.regions.find(r => r.id === "collar" || r.id === "hood");
      for (let x = 0.005; x < 1; x += 0.01) for (let y = 0.005; y < 1; y += 0.01) {
        if (!insideGarment(id, x, y)) continue;
        for (const side of SIDES) {
          const label = regionOf(id, side, x, y).label;
          if (x < edge) expect(["left sleeve", "left shoulder"], `${id} ${side} ${x.toFixed(3)},${y.toFixed(3)}`).toContain(label);
          if (x > 1 - edge) expect(["right sleeve", "right shoulder"], `${id} ${side} ${x.toFixed(3)},${y.toFixed(3)}`).toContain(label);
          if (label === collar.label) {
            const [x0, y0, x1, y1] = collar.rect;
            const off = Math.max(x0 - x, x - x1, y0 - y, y - y1, 0);
            expect(off, `${id} ${x.toFixed(3)},${y.toFixed(3)} called ${label}`).toBeLessThanOrEqual(0.03);
          }
        }
      }
    });
  }

  it("a kind that is an Object prototype key is not a kind", () => {
    for (const k of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
      expect(garmentOf({}, k)).toBe("hockey");
      expect(insideGarment(k, 0.5, 0.5)).toBe(true);
      expect(spotWords(k, [{ side: "front", x: 0.5, y: 0.5 }])).toBe("Front: centre");
      expect(styleKind(k)).toBe("");
    }
  });
});

// ── The catalogue's codes, read off the pattern and product pages ────────────
// A regression table: a rule that sends one of these to the wrong outline
// fails here. "" = not a garment with an outline (falls back to the order's).
describe("catalogue style codes", () => {
  const CODES = {
    // hockey (pp. 4–27, 85–86)
    H550: "hockey", H8000: "hockey", H686: "hockey", ZH101: "hockey", ZH305: "hockey", ZLB101: "hockey",
    HS630: "socks", HS2100: "socks", ZH702: "socks",
    H901: "shorts", ZH901: "shorts", ZH911: "shorts", ZH912: "shorts",
    // apparel (pp. 87, 91–92)
    ZAL2010P: "hoodie", ZAL3310: "hoodie", ZAL3320: "hoodie", A3050: "hoodie",
    ZAL2710: "jacket", ZAL2721: "jacket", ZAL2610: "jacket", ZAL2621: "jacket", ZAL3710: "jacket", ZAT5010P: "jacket",
    ZAL1210: "longtee", ZAL11: "longtee", ZAL21: "longtee", ZAL22: "longtee", ZAL41: "longtee", ZAL52: "longtee", ZALC21: "longtee",
    ZAS91: "shorts", ZAS91P: "shorts",
    A1830: "", ZAA101: "", ZAA409: "", ZAA412: "", ZAA318: "", ZAA336: "", ZAA102: "", ZAA501: "", BA101: "", AH250: "",
    // baseball (pp. 93–94)
    BA5500: "button", ZBA71: "button", ZBA11: "tee", ZBA16: "tank", ZBA76: "tank",
    ZBAS41: "shorts", ZBAS41P: "shorts", ZBAS410: "shorts", ZBA901: "shorts", ZBA901P: "shorts",
    ZBAP61: "pants", BA2690: "pants",
    // basketball, football, lacrosse, volleyball, soccer, cycling (pp. 95–104)
    ZB11: "tank", B1715: "tank", ZBS91: "shorts", ZF101: "football",
    ZBW11: "tee", ZBWL11: "longtee", ZLF11: "tee", ZLF16: "tank", ZLF17: "tank", ZLR302: "tank",
    ZV11: "tee", ZV16: "tank", ZV17: "tank", ZV26: "tank", ZV27: "tank", ZVL11: "longtee",
    ZS11: "tee", ZCS550: "shorts", ZCB750: "shorts",
    // too short to be a catalogue code: no guess
    A1: "", S1: "", V2: "", B2: "", T1: "",
  };
  for (const [code, kind] of Object.entries(CODES)) {
    it(`${code} → ${kind || "(the order's garment)"}`, () => expect(styleKind(code)).toBe(kind));
  }
  it("a code with no kind uses the order's garment", () => {
    for (const code of ["A1830", "BA101", "ZAA101"]) expect(garmentOf({ style: code }, "tee")).toBe("tee");
  });
});
