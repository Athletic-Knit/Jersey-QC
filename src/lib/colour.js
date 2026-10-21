// ── Jersey colour: the camera's words against the roster's words ─────────────
// A roster's "team" column is often the jersey colour ("red", "sky blue",
// "forest green"), and the model reports the body colour it sees. Both are
// reduced to a colour family so "scarlet" meets "red" and "navy blue" meets
// "blue". Teal and cyan sit between blue and green and match either.

const FAMILIES = [
  ["black",  /\b(black|charcoal|jet)\b/],
  ["white",  /\b(white|cream|ivory|off-white)\b/],
  ["grey",   /\b(grey|gray|silver|slate|graphite|heather)\b/],
  ["red",    /\b(red|scarlet|crimson|maroon|burgundy|cardinal|cherry|wine|garnet)\b/],
  ["orange", /\b(orange|tangerine|rust|burnt orange)\b/],
  ["yellow", /\b(yellow|gold|golden|mustard|amber|maize)\b/],
  ["green",  /\b(green|lime|kelly|forest|olive|emerald|mint|hunter|sage)\b/],
  ["blue",   /\b(blue|navy|royal|sky|cobalt|indigo|columbia|powder)\b/],
  ["cyan",   /\b(teal|cyan|turquoise|aqua|aquamarine)\b/],
  ["purple", /\b(purple|violet|lavender|plum|lilac)\b/],
  ["pink",   /\b(pink|magenta|fuchsia|rose)\b/],
  ["brown",  /\b(brown|tan|khaki|beige|chocolate|sand)\b/],
];
const NEAR = { cyan: ["blue", "green"], blue: ["cyan"], green: ["cyan"] };

// The colour families named in a piece of text, e.g. "sky blue" → ["blue"],
// "black and gold" → ["black", "yellow"], "Ravens" → [].
export function colourFamilies(text) {
  const t = String(text ?? "").toLowerCase();
  return FAMILIES.filter(([, re]) => re.test(t)).map(([f]) => f);
}

function overlap(a, b) {
  return a.some(x => b.includes(x) || (NEAR[x] || []).some(n => b.includes(n)));
}

// The colour words a roster row carries: the team column and any colour-ish
// extra column.
export function rowColourText(row) {
  return ["team", "colour", "color", "colourway", "colorway", "jersey colour", "jersey color", "body"]
    .map(k => row?.[k]).filter(Boolean).join(" ");
}

/**
 * Narrow candidate rows to the ones whose colour agrees with what the camera
 * saw. Returns { rows, narrowed, strong }: `rows` are the agreeing rows or
 * every row unchanged when the read has no usable colour, no row names a
 * colour, or nothing agrees — colour only ever helps, it never rules a jersey
 * out. `strong` is true only when the BODY colour agreed: trim colour (a red
 * stripe on a white jersey) may order a list but must never decide a green —
 * a white #31 with red trim is not the "red" #31.
 */
export function narrowByColour(rows, read = {}) {
  const main = colourFamilies(read.colour), trim = colourFamilies(read.trim);
  if (!main.length && !trim.length) return { rows, narrowed: false };
  const scored = rows.map(r => {
    const fam = colourFamilies(rowColourText(r));
    const score = !fam.length ? 0 : overlap(fam, main) ? 2 : overlap(fam, trim) ? 1 : 0;
    return { r, score };
  });
  const best = Math.max(0, ...scored.map(s => s.score));
  if (best === 0) return { rows, narrowed: false, strong: false };
  return { rows: scored.filter(s => s.score === best).map(s => s.r), narrowed: true, strong: best === 2 };
}
