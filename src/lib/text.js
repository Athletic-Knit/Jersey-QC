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

// Jersey numbers: digits only, leading zeros dropped — except an all-zero
// number: "00" is a real goalie number and must stay distinct from "0".
export function normNum(s) {
  const digits = String(s ?? "").replace(/\D/g, "");
  if (digits === "") return "";
  if (/^0+$/.test(digits)) return digits;
  return digits.replace(/^0+/, "");
}

// Words of a name, normalised: "Jordan Blake" → ["jordan", "blake"]
export function nameWords(s) {
  return stripAccents(s).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

// True when the read name agrees with the roster name: exact, or the read
// name is one whole word of the roster name (shirt says BLAKE, roster says
// Jordan Blake), or the other way round, or the read name is the roster
// name's last words (shirt says SMITH-JONES or DE LA CRUZ, roster says
// Jamie Smith-Jones or Chris De La Cruz).
export function nameMatches(read, roster) {
  const a = norm(read), b = norm(roster);
  if (!a || !b) return false;
  if (a === b) return true;
  const aw = nameWords(read), bw = nameWords(roster);
  if (aw.length === 1 && bw.includes(aw[0])) return true;
  if (bw.length === 1 && aw.includes(bw[0])) return true;
  if (aw.length > 1 && bw.length > aw.length && bw.slice(-aw.length).join("") === aw.join("")) return true;
  if (bw.length > 1 && aw.length > bw.length && aw.slice(-bw.length).join("") === bw.join("")) return true;
  return false;
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
