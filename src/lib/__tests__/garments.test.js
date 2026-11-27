// The garment outlines (src/lib/garments.js, from the drawings in
// assets/garments/ through tools/svg-garments.mjs): every outline is a closed
// shape inside its box and holds its own named areas; a tap is on the garment
// or not; spots become words; a roster row's style picks the outline.
import { describe, it, expect } from "vitest";
import {
  GARMENTS, GARMENT_IDS, GARMENT_GROUPS, GARMENT_STYLES, SIDES, MAX_SPOTS, DEFAULT_GARMENT, sideLabel,
  garmentOf, insideGarment, spotWords, styleKind, regionOf, anchorOf,
  rosterGarment, orderGarmentOf, garmentView, toView, fromView, spotAt, VIEW_H,
} from "../garments.js";

const inBox = ([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1;
const centre = anchorOf;

describe("the thirteen garment kinds", () => {
  it("are the owner's first list (26 Nov 2026), hockey first and the default", () => {
    expect(GARMENT_IDS).toEqual(["hockey", "hockeypants", "socks", "basketball", "basketballpants", "baseball", "baseballpants",
      "hoodie", "jacket", "longtee", "pants", "shorts", "garmentbag"]);
    expect(GARMENT_GROUPS).toEqual(["Hockey", "Basketball", "Baseball", "Apparel"]);
    expect(DEFAULT_GARMENT).toBe("hockey");
    expect(SIDES).toEqual(["front", "back"]);
    expect(MAX_SPOTS).toBe(3);
  });

  for (const id of GARMENT_IDS) {
    describe(id, () => {
      const g = GARMENTS[id];
      it("has an id, a label, a group and a sensible aspect", () => {
        expect(g.id).toBe(id);
        expect(g.label).toBeTruthy();
        expect(GARMENT_GROUPS).toContain(g.group);
        expect(g.aspect).toBeGreaterThan(0.2);
        expect(g.aspect).toBeLessThan(2.5);
      });
      it("has a closed outline for each side inside 0–1; together they fill the box", () => {
        expect(g.outline).toBe(g.outlines.front);
        for (const side of SIDES) {
          const o = g.outlines[side];
          expect(o.length).toBeGreaterThanOrEqual(4);
          expect(o.every(inBox)).toBe(true);
          // Closed: no repeated last point needed, and no zero-length edge.
          o.forEach((p, i) => {
            const q = o[(i + 1) % o.length];
            expect(p[0] === q[0] && p[1] === q[1]).toBe(false);
          });
        }
        const all = SIDES.flatMap(s => g.outlines[s]), xs = all.map(p => p[0]), ys = all.map(p => p[1]);
        expect(Math.min(...xs)).toBeLessThan(0.01);
        expect(Math.max(...xs)).toBeGreaterThan(0.99);
        expect(Math.min(...ys)).toBeLessThan(0.01);
        expect(Math.max(...ys)).toBeGreaterThan(0.99);
      });
      it("has a caption for each side", () => {
        for (const side of SIDES) expect(sideLabel(id, side)).toBeTruthy();
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
          for (const s of r.side ? [r.side] : SIDES) expect(insideGarment(id, cx, cy, s), `${id} ${s} ${r.id}`).toBe(true);
          // …and a tap there is named after that area (on the front or the
          // back: the hoodie's pocket covers the front's lower middle).
          const named = (r.side ? [r.side] : SIDES).map(s => regionOf(id, s, cx, cy).id);
          expect(named).toContain(r.id);
        }
      });
      it("says a point off the garment is off it", () => {
        for (const s of SIDES) {
          expect(insideGarment(id, -0.1, 0.5, s)).toBe(false);
          expect(insideGarment(id, 0.5, 1.1, s)).toBe(false);
        }
      });
      it("puts one spot each side into words", () => {
        const r = g.regions.find(x => !x.side);
        const [cx, cy] = centre(r);
        expect(spotWords(id, [{ side: "front", x: cx, y: cy }, { side: "back", x: cx, y: cy }]))
          .toBe(`${sideLabel(id, "front")}: ${r.label} · ${sideLabel(id, "back")}: ${r.label}`);
      });
    });
  }
});

describe("insideGarment", () => {
  it("the hockey jersey: body and sleeve yes, under the sleeve and in the neck no", () => {
    expect(insideGarment("hockey", 0.5, 0.5)).toBe(true);
    expect(insideGarment("hockey", 0.12, 0.2)).toBe(true);       // left sleeve
    expect(insideGarment("hockey", 0.1, 0.8)).toBe(false);       // below the sleeve
    expect(insideGarment("hockey", 0.5, 0.01)).toBe(false);      // in the neck opening
  });
  it("pants and shorts: the gap between the legs is not the garment", () => {
    for (const k of ["pants", "basketballpants", "shorts", "hockeypants"]) {
      expect(insideGarment(k, 0.5, 0.97), k).toBe(false);
      expect(insideGarment(k, 0.25, 0.8), k).toBe(true);
    }
  });
  it("the basketball jersey has no sleeves", () => {
    expect(insideGarment("basketball", 0.05, 0.2)).toBe(false);
    expect(insideGarment("basketball", 0.3, 0.6)).toBe(true);
  });
  it("each side has its own outline: the hoodie's back is not its front", () => {
    expect(JSON.stringify(GARMENTS.hoodie.outlines.front)).not.toBe(JSON.stringify(GARMENTS.hoodie.outlines.back));
  });
  it("an unknown kind is drawn as hockey", () => {
    expect(insideGarment("cape", 0.12, 0.2)).toBe(insideGarment("hockey", 0.12, 0.2));
  });
});

describe("spotWords", () => {
  it("front first, left and right as the operator sees that side", () => {
    expect(spotWords("hockey", [
      { side: "back", x: 0.5, y: 0.9 },
      { side: "front", x: 0.12, y: 0.2 },
      { side: "front", x: 0.88, y: 0.2 },
    ])).toBe("Front: left sleeve, right sleeve · Back: lower middle");
  });
  it("the same words once; no spots, no words", () => {
    expect(spotWords("longtee", [{ side: "front", x: 0.1, y: 0.25 }, { side: "front", x: 0.12, y: 0.3 }])).toBe("Front: left sleeve");
    expect(spotWords("longtee", [])).toBe("");
    expect(spotWords("longtee", undefined)).toBe("");
  });
  it("areas that are on one side only", () => {
    expect(spotWords("hoodie", [{ side: "front", x: 0.5, y: 0.85 }])).toBe("Front: pouch pocket");
    expect(spotWords("hoodie", [{ side: "back", x: 0.5, y: 0.85 }])).toBe("Back: lower middle");
    expect(spotWords("hoodie", [{ side: "back", x: 0.5, y: 0.08 }])).toBe("Back: hood");
    expect(spotWords("baseball", [{ side: "front", x: 0.5, y: 0.5 }])).toBe("Front: button placket");
    expect(spotWords("baseball", [{ side: "back", x: 0.5, y: 0.5 }])).toBe("Back: centre");
    expect(spotWords("jacket", [{ side: "front", x: 0.5, y: 0.5 }])).toBe("Front: zip");
    expect(spotWords("jacket", [{ side: "back", x: 0.5, y: 0.5 }])).toBe("Back: centre");
    expect(spotWords("garmentbag", [{ side: "back", x: 0.5, y: 0.5 }])).toBe("Back: zip");
  });
  it("every kind's own words", () => {
    expect(spotWords("basketball", [{ side: "back", x: 0.27, y: 0.1 }])).toBe("Back: left shoulder");
    expect(spotWords("shorts", [{ side: "front", x: 0.8, y: 0.8 }])).toBe("Front: right lower leg");
    expect(spotWords("pants", [{ side: "back", x: 0.25, y: 0.55 }])).toBe("Back: left knee");
    expect(spotWords("hockeypants", [{ side: "front", x: 0.5, y: 0.3 }])).toBe("Front: centre panel");
    expect(spotWords("socks", [{ side: "front", x: 0.5, y: 0.04 }, { side: "back", x: 0.5, y: 0.85 }])).toBe("Front: top band · Back: lower (ankle)");
    expect(spotWords("garmentbag", [{ side: "front", x: 0.48, y: 0.04 }])).toBe("Front: hanger loop");
  });
  it("the baseball pants are drawn from the sides, and say so", () => {
    expect(spotWords("baseballpants", [{ side: "front", x: 0.5, y: 0.55 }, { side: "back", x: 0.5, y: 0.03 }]))
      .toBe("Right side: knee · Left side: waistband");
  });
  it("shoulders and cuff tips are named for what they are", () => {
    expect(spotWords("hockey", [{ side: "front", x: 0.38, y: 0.05 }])).toBe("Front: left shoulder");
    expect(spotWords("hockey", [{ side: "back", x: 0.62, y: 0.05 }])).toBe("Back: right shoulder");
    expect(spotWords("longtee", [{ side: "front", x: 0.02, y: 0.3 }])).toBe("Front: left sleeve");
    expect(spotWords("hoodie", [{ side: "front", x: 0.02, y: 0.38 }])).toBe("Front: left sleeve");
    expect(spotWords("jacket", [{ side: "front", x: 0.02, y: 0.35 }])).toBe("Front: left sleeve");
    expect(spotWords("jacket", [{ side: "front", x: 0.98, y: 0.35 }])).toBe("Front: right sleeve");
  });
  it("at most MAX_SPOTS spots are put into words", () => {
    expect(spotWords("hockey", [
      { side: "front", x: 0.5, y: 0.5 }, { side: "front", x: 0.6, y: 0.5 }, { side: "front", x: 0.4, y: 0.5 },
      { side: "back", x: 0.5, y: 0.9 },
    ])).toBe("Front: centre, middle right, middle left");
  });
});

describe("garmentOf: which outline a garment gets", () => {
  it("the catalogue's own styles", () => {
    expect(garmentOf({ style: "H550" })).toBe("hockey");
    expect(garmentOf({ style: "BA5500" })).toBe("baseball");
    expect(garmentOf({ style: "B1715" })).toBe("basketball");
    expect(garmentOf({ style: "HS2100" })).toBe("socks");
    expect(garmentOf({ style: "BA2690" })).toBe("baseballpants");
    expect(garmentOf({ style: "A3050" })).toBe("hoodie");
    expect(garmentOf({ style: "BS1700" })).toBe("shorts");
    expect(garmentOf({ style: "S1900" })).toBe("longtee");
  });
  it("custom-sublimation series by their prefix", () => {
    expect(styleKind("ZH101")).toBe("hockey");
    expect(styleKind("ZH702")).toBe("socks");
    expect(styleKind("ZH901")).toBe("hockeypants");
    expect(styleKind("ZBA71")).toBe("baseball");
    expect(styleKind("ZB11")).toBe("basketball");
    expect(styleKind("ZBP11")).toBe("basketballpants");
    expect(styleKind("ZBAP61")).toBe("baseballpants");
    expect(styleKind("ZAP9100P")).toBe("pants");
    expect(styleKind("ZBS91")).toBe("shorts");
    expect(styleKind("ZAL2010P")).toBe("hoodie");
    expect(styleKind("ZAT5010P")).toBe("jacket");
    expect(styleKind("ZVL11")).toBe("longtee");
  });
  it("kinds with no drawing yet say nothing: tees, football, other sports' tanks", () => {
    for (const code of ["ZS11", "ZF101", "ZBA11", "ZBA16", "ZV11", "ZLF16", "T220", "SV100", "A1810"]) expect(styleKind(code), code).toBe("");
  });
  it("case, spaces, dashes and a colour after the code do not matter", () => {
    expect(styleKind(" h550 ")).toBe("hockey");
    expect(styleKind("H550-Y")).toBe("hockey");
    expect(styleKind("ZH101 Black")).toBe("hockey");
    expect(styleKind("BA 5500")).toBe("baseball");
    expect(styleKind("ba1385l")).toBe("baseballpants");
  });
  it("an unknown style uses the order's garment; nothing at all is hockey", () => {
    expect(garmentOf({ style: "XYZ" }, "jacket")).toBe("jacket");
    expect(garmentOf({ style: "AH250" }, "hoodie")).toBe("hoodie");   // a cap is not a garment
    expect(garmentOf({}, "pants")).toBe("pants");
    expect(garmentOf({ style: "" })).toBe("hockey");
    expect(garmentOf(undefined)).toBe("hockey");
    expect(garmentOf({}, "cape")).toBe("hockey");
    expect(garmentOf({}, "tee")).toBe("hockey");                       // a kind that is gone
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
// The sleeved tops: a little inside the x of the body's side seam (sleeves left of it).
const BODY_EDGE = { hockey: 0.3, longtee: 0.29, baseball: 0.19, hoodie: 0.32, jacket: 0.32 };

describe("details and areas stay on the garment", () => {
  for (const id of GARMENT_IDS) {
    it(`${id}: every detail line lies inside the outline (or on its edge)`, () => {
      for (const side of SIDES) for (const line of GARMENTS[id].detail[side]) {
        const o = GARMENTS[id].outlines[side];
        for (let i = 0; i < line.length - 1; i++) for (let t = 0; t <= 1.0001; t += 0.05) {
          const p = [line[i][0] + (line[i + 1][0] - line[i][0]) * t, line[i][1] + (line[i + 1][1] - line[i][1]) * t];
          const ok = insideGarment(id, p[0], p[1], side) || edgeDist(o, p) <= 0.01;
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
        for (const side of SIDES) {
          if (!insideGarment(id, x, y, side)) continue;
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
// fails here. "" = no drawing for it (falls back to the order's garment).
describe("catalogue style codes", () => {
  const CODES = {
    // hockey (pp. 4–27, 85–86)
    H550: "hockey", H8000: "hockey", H686: "hockey", ZH101: "hockey", ZH305: "hockey", ZLB101: "hockey",
    HS630: "socks", HS2100: "socks", ZH702: "socks",
    H901: "hockeypants", ZH901: "hockeypants", ZH911: "hockeypants", ZH912: "hockeypants",
    // apparel (pp. 87, 91–92)
    ZAL2010P: "hoodie", ZAL3310: "hoodie", ZAL3320: "hoodie", A3050: "hoodie",
    ZAL2710: "jacket", ZAL2721: "jacket", ZAL2610: "jacket", ZAL2621: "jacket", ZAL3710: "jacket", ZAT5010P: "jacket",
    ZAL1210: "longtee", ZAL11: "longtee", ZAL21: "longtee", ZAL22: "longtee", ZAL41: "longtee", ZAL52: "longtee", ZALC21: "longtee",
    ZAS91: "shorts", ZAS91P: "shorts", ZAP9100P: "pants", ZAP9300P: "pants", ZAP9400P: "pants",
    A1830: "", ZAA101: "", ZAA409: "", ZAA412: "", ZAA318: "", ZAA336: "", ZAA102: "", ZAA501: "", BA101: "", AH250: "",
    ZA2010: "", ZA2020: "",                                      // short-sleeve hoodies: no drawing yet
    // baseball (pp. 93–94)
    BA5500: "baseball", ZBA71: "baseball", ZBA11: "", ZBA16: "", ZBA76: "",
    ZBAS41: "shorts", ZBAS41P: "shorts", ZBAS410: "shorts", ZBA901: "shorts", ZBA901P: "shorts",
    ZBAP61: "baseballpants", BA2690: "baseballpants",
    // basketball, football, lacrosse, volleyball, soccer, cycling (pp. 95–104)
    ZB11: "basketball", B1715: "basketball", ZBS91: "shorts", ZF101: "",
    ZBW11: "", ZBWL11: "longtee", ZLF11: "", ZLF16: "", ZLR302: "",
    ZV11: "", ZV16: "", ZVL11: "longtee", ZS11: "", ZCS550: "", ZCB750: "",
    // too short to be a catalogue code: no guess
    A1: "", S1: "", V2: "", B2: "", T1: "",
    // the custom codes under the in-stock products ("Available in custom …", pp. 4–75)
    H845: "hockey", H680: "hockey", H950: "hockeypants", HS640: "socks", HS925: "socks", SV80: "",
    A600: "hoodie", A500: "hoodie", A400: "hoodie", A100: "", AT200: "",
    AS200: "shorts", AS100: "shorts", BS200: "shorts", BS100: "shorts", LS200: "shorts", LS100: "shorts",
    VS200: "shorts", VS100: "shorts", SS200: "shorts", SS100: "shorts", BAS200: "shorts", BAS100: "shorts",
    BA400: "baseball", BA100: "", BA900: "baseballpants", BA750: "baseballpants",
    B500: "basketball", B200: "basketball", B100: "basketball", B300: "basketball", LF100: "", T200: "",
    // custom codes shared by products of different kinds: no guess
    A200: "", BA200: "", BA300: "", V200: "", S200: "",
  };
  for (const [code, kind] of Object.entries(CODES)) {
    it(`${code} → ${kind || "(the order's garment)"}`, () => expect(styleKind(code)).toBe(kind));
  }
  it("a code with no kind uses the order's garment", () => {
    for (const code of ["A1830", "BA101", "ZAA101"]) expect(garmentOf({ style: code }, "jacket")).toBe("jacket");
  });
});

describe("the order's garment and the station's drawing", () => {
  it("HS825 is a sock", () => {
    expect(styleKind("HS825")).toBe("socks");
    expect(garmentOf({ style: "HS825" }, "hockey")).toBe("socks");
  });
  it("rosterGarment: the kind more than half the rows have, else nothing", () => {
    const r = styles => styles.map(style => ({ name: "A", number: "1", style }));
    expect(rosterGarment(r(["BA5500", "BA5500", "BA5200", ""]))).toBe("baseball");
    expect(rosterGarment(r(["HS2100", "HS630", "H550", "H550"]))).toBe("");        // a tie: nothing picked
    expect(rosterGarment(r(["", "", "H550"]))).toBe("");                          // most rows say nothing
    expect(rosterGarment(r(["A1830", "A1830"]))).toBe("");                        // toques: no kind
    expect(rosterGarment([])).toBe("");
    expect(rosterGarment(null)).toBe("");
    expect(rosterGarment([{ name: "A" }, { name: "B" }])).toBe("");
  });
  it("orderGarmentOf: a known kind, else hockey", () => {
    expect(orderGarmentOf("pants")).toBe("pants");
    expect(orderGarmentOf("")).toBe("hockey");
    expect(orderGarmentOf("tee")).toBe("hockey");
    expect(orderGarmentOf("__proto__")).toBe("hockey");
    expect(orderGarmentOf(undefined)).toBe("hockey");
  });
  it("garmentView, toView and fromView agree, for every kind", () => {
    for (const kind of GARMENT_IDS) {
      const v = garmentView(kind);
      expect(v.kind).toBe(kind);
      expect(v.h).toBe(VIEW_H);
      expect(v.vbW / v.vbH).toBeCloseTo((v.w + 2 * v.pad) / (v.h + 2 * v.pad));
      expect(Math.abs(v.w / v.h - GARMENTS[kind].aspect)).toBeLessThan(0.01);
      for (const p of [[0, 0], [1, 1], [0.3, 0.7]]) {
        const [vx, vy] = toView(v, p), back = fromView(v, vx, vy);
        expect(back[0]).toBeCloseTo(p[0]); expect(back[1]).toBeCloseTo(p[1]);
      }
    }
    expect(garmentView("cape").kind).toBe("hockey");
  });
  it("spotAt: a tap on the garment is a spot rounded to 3 places; beside it, off the box or on no side, nothing", () => {
    expect(spotAt("hockey", "front", 0.50004, 0.5)).toEqual({ side: "front", x: 0.5, y: 0.5 });
    expect(spotAt("hockey", "back", 0.02, 0.98)).toBeNull();      // under the sleeve
    expect(spotAt("hockey", "front", 0.5, 0.01)).toBeNull();      // the neck opening
    expect(spotAt("pants", "front", 0.5, 0.97)).toBeNull();       // between the legs
    expect(spotAt("hockey", "front", 1.2, 0.5)).toBeNull();
    expect(spotAt("hockey", "inside", 0.5, 0.5)).toBeNull();
    expect(spotAt("hockey", "front", NaN, 0.5)).toBeNull();
    for (const kind of GARMENT_IDS) for (const r of GARMENTS[kind].regions) {
      const [x, y] = anchorOf(r), side = r.side || "front";
      if (insideGarment(kind, x, y, side)) expect(spotAt(kind, side, x, y)).not.toBeNull();
    }
  });
});
