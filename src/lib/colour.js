// ── Jersey colour: the camera's words against the roster's words ─────────────
// The model reports the body colour it sees; a roster may have a colour column
// ("Colour", "Colourway", "Jersey colour"). Both are reduced to a colour family
// so "scarlet" meets "red" and "navy blue" meets "blue". Teal and cyan sit
// between blue and green and match either.
// The TEAM column is never read for colour (Noam, code review of 23 Nov 2026,
// N5): a team's name says nothing about the jersey's colour (Cherry Hill,
// Silver Lake and Forest Park are teams, not colours) and never decides a green.
// Twin rows (same number and name on two teams) are settled by the operator on
// the yellow list, or by the passed-twin rule in match.js.

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

// The colour words a roster row carries: its colour columns only. Not "team"
// (see the top of this file: N5).
export function rowColourText(row) {
  return ["colour", "color", "colourway", "colorway", "jersey colour", "jersey color", "body"]
    .map(k => row?.[k]).filter(Boolean).join(" ");
}

/**
 * Narrow candidate rows to the ones whose colour agrees with what the camera
 * saw. Returns { rows, narrowed, strong }: `rows` are the agreeing rows or
 * every row unchanged when the read has no usable colour, no row names a
 * colour, or nothing agrees. `strong` is true only when the BODY colour
 * agreed: trim colour (a red stripe on a white jersey) may order a list but
 * must never decide a green — a white #31 with red trim is not the "red" #31.
 *
 * Colour only rules OUT a row whose own colour is known and different. A row
 * with NO colour on the roster is unknown, not "different": it always stays in
 * `rows`, so it keeps competing and the read stays a question. (Code review of
 * 23 Nov 2026: once team names stopped counting as colours, a twin with a blank
 * colour cell was dropped as soon as the other twin's colour agreed, and the
 * other twin went green.)
 */
export function narrowByColour(rows, read = {}) {
  const main = colourFamilies(read.colour), trim = colourFamilies(read.trim);
  if (!main.length && !trim.length) return { rows, narrowed: false };
  const scored = rows.map(r => {
    const fam = colourFamilies(rowColourText(r));
    const score = !fam.length ? null : overlap(fam, main) ? 2 : overlap(fam, trim) ? 1 : 0;   // null: colour unknown
    return { r, score };
  });
  const best = Math.max(0, ...scored.map(s => s.score ?? 0));
  if (best === 0) return { rows, narrowed: false, strong: false };
  // The agreeing rows plus every row whose colour is unknown (it may be the one).
  // `agreeing`: only the rows whose KNOWN colour agrees (match.js settleTwins uses it
  // to see that the colour seen points at a passed twin).
  const kept = scored.filter(s => s.score === best || s.score === null).map(s => s.r);
  const agreeing = scored.filter(s => s.score === best).map(s => s.r);
  return { rows: kept, agreeing, narrowed: kept.length < rows.length, strong: best === 2 };
}
