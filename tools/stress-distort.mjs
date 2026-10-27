// Builds the distorted frames for the recognition stress test.
//   node tools/stress-distort.mjs <folder that has node_modules/sharp>
// Takes the real frames in public/sim and a slice of the synthetic ones in
// public/sim/stress/synth, and writes every variant to public/sim/stress/distort
// plus distort.json (source, variant, and how strict the judge should be).
// Variants: the camera turned (90/180/270 and a 20° tilt), far away (long side
// 400 and 250 px), out of focus (blur 2 and 5), too dark, blown out, washed
// out, heavy JPEG, black and white, zoomed on the number (name out of frame),
// and the top cut off (name cut).
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sharpDir = process.argv[2]; if (!sharpDir) { console.error("usage: node stress-distort.mjs <dir with node_modules/sharp>"); process.exit(1); }
const sharp = (await import(pathToFileURL(path.join(sharpDir, "node_modules/sharp/lib/index.js")).href)).default;

const OUT = path.join(ROOT, "public/sim/stress/distort");
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (f.endsWith(".jpg")) fs.unlinkSync(path.join(OUT, f));

// strict: the screen must be what the clean frame gives. soft: yellow with the right row is fine too.
const VARIANTS = {
  rot90:    { strict: true,  fn: s => s.rotate(90) },
  rot180:   { strict: true,  fn: s => s.rotate(180) },
  rot270:   { strict: true,  fn: s => s.rotate(270) },
  tilt20:   { strict: true,  fn: s => s.rotate(20, { background: "#8a7358" }) },
  small400: { strict: true,  fn: s => s.resize({ width: 400, height: 400, fit: "inside" }) },
  small250: { strict: false, fn: s => s.resize({ width: 250, height: 250, fit: "inside" }) },
  blur2:    { strict: true,  fn: s => s.blur(2) },
  blur5:    { strict: false, fn: s => s.blur(5) },
  dark:     { strict: false, fn: s => s.modulate({ brightness: 0.35 }) },
  blown:    { strict: false, fn: s => s.linear(1.9, 60) },
  washed:   { strict: false, fn: s => s.linear(0.35, 90) },
  jpeg15:   { strict: true,  fn: s => s.jpeg({ quality: 15 }) },
  grey:     { strict: true,  fn: s => s.greyscale() },
  zoomnum:  { strict: false, fn: (s, w, h) => s.extract({ left: Math.floor(w * 0.2), top: Math.floor(h * 0.35), width: Math.floor(w * 0.6), height: Math.floor(h * 0.55) }), nameGone: true },
  topcut:   { strict: false, fn: (s, w, h) => { const top = Math.floor(h * 0.3); return s.extract({ left: 0, top, width: w, height: h - top }); }, nameCut: true },
};

const REAL = ["f40_clean.jpg", "f54_clean.jpg", "frame_two.jpg", "f35_fold_real.jpg", "f40_cover4_hand.jpg"];
const synth = JSON.parse(fs.readFileSync(path.join(ROOT, "public/sim/stress/synth/synth.json"), "utf8").replace(/^﻿/, ""));   // PowerShell writes a BOM
const SYNTH = synth.filter(s => /^synth\/(name(0|3|5|9|10|14|17)-|num(1|7|13|21)-|low3-|sleeve1-)/.test(s.file)).map(s => s.file);

const out = [];
for (const src of [...REAL.map(f => ({ file: f, from: path.join(ROOT, "public/sim", f), real: true })), ...SYNTH.map(f => ({ file: f, from: path.join(ROOT, "public/sim/stress", f), real: false }))]) {
  const meta = await sharp(src.from).metadata();
  for (const [v, spec] of Object.entries(VARIANTS)) {
    const id = `${path.basename(src.file, ".jpg")}__${v}.jpg`;
    let s = sharp(src.from);
    s = spec.fn(s, meta.width, meta.height);
    await s.jpeg({ quality: v === "jpeg15" ? 15 : 82 }).toFile(path.join(OUT, id));
    out.push({ file: "distort/" + id, source: src.file, real: src.real, variant: v, strict: spec.strict, nameGone: !!spec.nameGone, nameCut: !!spec.nameCut });
  }
}
fs.writeFileSync(path.join(OUT, "distort.json"), JSON.stringify(out, null, 1));
console.log(`wrote ${out.length} distorted frames to ${OUT}`);
