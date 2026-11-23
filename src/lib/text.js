// ── Text normalisation shared by parsing and matching ────────────────────────

// Strip accents (Côté → Cote) without dropping the letters themselves:
// decompose, then drop the combining marks (Unicode category M).
export function stripAccents(s) {
  return String(s ?? "").normalize("NFD").replace(/\p{M}/gu, "");
}

// Lower-case, accent-free, alphanumerics only. For names and generic fields.
export function norm(s) {
  return stripAccents(s).toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Jersey numbers: the digits exactly as printed. Spaces, "#" and anything else
// that is not a digit are dropped; leading zeros are KEPT.
// Rule (Noam, code review of 23 Nov 2026, N2): 07 and 7 are different jerseys,
// just as 00 and 0 always were. Before that rule this function dropped leading
// zeros, so #07 and #7 counted as the same jersey.
// The owner's decision of 23 Nov 2026: when #7 and #07 are both on the roster,
// the camera's read is trusted (a clean "7" is #7); there is no extra question.
export function normNum(s) {
  return String(s ?? "").replace(/\D/g, "");
}

// Words of a name, normalised: "Jordan Blake" → ["jordan", "blake"]
export function nameWords(s) {
  return stripAccents(s).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

// True when the name read is the WHOLE roster name.
// Rule (Noam, code review of 23 Nov 2026, N4): the roster holds exactly the
// name printed on the jersey, and a green needs the whole name. Only capitals,
// accents and apostrophes may differ (O'NEIL = ONEIL, CÔTÉ = COTE), and spaces
// and hyphens are ignored (DE LA CRUZ = DELACRUZ = DE-LA-CRUZ; confirmed by the
// owner on 23 Nov 2026). All of that is what norm() does, so this is norm()
// equality. Missing letters (SMITH for SMITHE), one word of a longer name
// (DYK for VAN DYK, BLAKE for Jordan Blake) or extra words do NOT match: the
// matcher then shows a yellow list instead of a green.
// Before this rule any one word of the roster name matched.
// (Letters that do not decompose, such as ø, ł, ß, are dropped by norm() on
// both sides; the floor does not use them, so this is left as it is.)
export function nameMatches(read, roster) {
  const a = norm(read), b = norm(roster);
  return !!a && a === b;
}

// Levenshtein distance; strings here are short (names, numbers).
export function editDistance(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}
