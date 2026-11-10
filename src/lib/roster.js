// ── Roster files: CSV / Excel → rows the app can match against ───────────────
// Every column the file carries is kept; the four core ones are canonicalised.

// Excel "CSV UTF-8" starts the file with a byte-order mark; it would otherwise
// become part of the first header and hide the name column.
const BOM = String.fromCharCode(0xfeff);
const stripBOM = s => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);

const ALIASES = {
  name:         ["name", "player", "player name", "playername", "last name", "lastname", "surname", "last", "full name", "fullname"],
  number:       ["number", "no", "no.", "#", "num", "jersey", "jersey #", "jersey#", "jersey number", "jerseynumber", "jersey no", "jersey no.", "shirt number", "shirt"],
  team:         ["team", "team name", "teamname", "club", "squad"],
  order:        ["order", "order number", "order no", "order no.", "order #", "order#", "ordernumber", "order id", "po", "po number", "po #", "po#", "job", "job number", "work order", "wo"],
  size:         ["size"],
  "size range": ["size range", "sizerange", "range", "age group", "agegroup"],
};
export const CORE_COLUMNS = ["name", "number", "team", "size"];
const STATE_COLUMNS = ["_id", "scanned", "mark"];
// Columns this app writes into its own Excel export. A re-used export must not
// bring yesterday's results back as roster data ("Status: PASS" on unscanned rows).
const APP_COLUMNS = ["status", "bin", "reason", "resolution", "inspected by", "time", ...STATE_COLUMNS];

export function canonicalHeader(h) {
  const key = stripBOM(String(h ?? "")).trim().toLowerCase();
  for (const [canon, list] of Object.entries(ALIASES)) if (list.includes(key)) return canon;
  return key;
}

function looksLikeHeader(cells) {
  const canon = (cells || []).map(canonicalHeader);
  return canon.includes("name") || canon.includes("number");
}

// Split one CSV line honouring double quotes ("Smith, John" stays one cell).
export function splitCSVLine(line, delim) {
  const out = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === delim) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map(v => v.trim());
}

// Comma, tab or semicolon (European Excel), whichever the header uses most.
export function detectDelimiter(line) {
  const count = re => (line.match(re) || []).length;
  const c = count(/,/g), t = count(/\t/g), s = count(/;/g);
  if (t > c && t > s) return "\t";
  if (s > c && s >= t) return ";";
  return ",";
}

// "Order 55555", "Order no: 55555", "PO# 55555" in a title row above the header.
const ORDER_IN_TEXT = /\b(?:order|po|job|work order)\s*(?:no\.?|number|id|#)?\s*[:#-]?\s*([A-Za-z0-9][\w-]*)/i;

// rows: array of arrays of cell strings. Finds the header row (first row that
// looks like one, within the first 15) so title rows above it are skipped.
// The order number, when the file carries one (an "order" column, or a title
// row above the header), rides along as a non-enumerable `orderNumber` on
// the returned array: read it with orderNumberOf(). The column itself is not
// kept as roster data.
export function rowsToRoster(rows) {
  const limit = Math.min(rows.length, 15);
  let hIdx = -1;
  for (let i = 0; i < limit; i++) if (looksLikeHeader(rows[i])) { hIdx = i; break; }
  if (hIdx < 0) return [];
  const headers = rows[hIdx].map(canonicalHeader);
  let orderNumber = "";
  for (let i = 0; i < hIdx && !orderNumber; i++) {
    const m = (rows[i] || []).map(c => String(c ?? "")).join(" ").match(ORDER_IN_TEXT);
    if (m && !/^(no|number|id)$/i.test(m[1])) orderNumber = m[1];
  }
  const out = [];
  rows.slice(hIdx + 1).forEach(cells => {
    const row = {};
    headers.forEach((h, i) => {
      if (!h || APP_COLUMNS.includes(h)) return;
      const v = String(cells?.[i] ?? "").trim();
      if (h === "order") { if (v && !orderNumber) orderNumber = v; return; }
      row[h] = v;
    });
    if (row.name || row.number) out.push(row);
  });
  const result = normaliseRosterRows(out);
  Object.defineProperty(result, "orderNumber", { value: orderNumber, enumerable: false });
  return result;
}

// The order number a parsed roster carried, or "".
export function orderNumberOf(rows) { return (rows && rows.orderNumber) || ""; }

export function parseCSV(text) {
  const clean = stripBOM(String(text ?? ""));
  const lines = clean.split(/\r?\n/).filter(l => l.trim() !== "");
  if (lines.length < 2) return [];
  // The delimiter is judged over the first lines together, not the first line
  // alone: a title row above the header ("Order 4521 - Ravens") has none.
  const delim = detectDelimiter(lines.slice(0, 15).join("\n"));
  return rowsToRoster(lines.map(l => splitCSVLine(l, delim)));
}

// Excel via SheetJS. Picks the first sheet that has a header row.
// raw:false keeps "00" and "07" as the text Excel displays, not the number it stores.
export function parseExcel(file, XLSX = globalThis.XLSX) {
  return new Promise((resolve, reject) => {
    if (!XLSX) { reject(new Error("Excel library not loaded yet.")); return; }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "array" });
        for (const name of wb.SheetNames) {
          const rows   = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: "" });
          const roster = rowsToRoster(rows);
          if (roster.length) { resolve(roster); return; }
        }
        resolve([]);
      } catch (err) { reject(err); }
    };
    reader.readAsArrayBuffer(file);
  });
}

// Merges "Size Range" + "Size" → "A-L"; skips the join when either half is
// blank (so no "A-" or "-"). Adds _id. Keeps every other column for display.
export function normaliseRosterRows(rows) {
  return rows.map((r, idx) => {
    const out = { ...r, _id: idx };
    if ("size range" in out) {
      const range = (out["size range"] || "").trim(), size = (out.size || "").trim();
      out.size = range && size ? `${range}-${size}` : (size || range);
      delete out["size range"];
    }
    out.name   = (out.name   || "").trim();
    out.number = (out.number || "").trim();
    out.team   = (out.team   || "").trim();
    out.size   = (out.size   || "").trim();
    return out;
  });
}

// Team → bin number, keyed on a trimmed, case-folded team name so "Ravens"
// and "ravens " share a bin. `existing` pins bins already assigned this
// session, so replacing the roster never renumbers physical bins.
export function teamKey(t) { return String(t ?? "").trim().toLowerCase(); }

// ── Bins ──────────────────────────────────────────────────────────────────────
// The order is sorted into bins by team (the default) or by size, the
// supervisor's choice. A map keyed by team is flat, as it always was; a map
// keyed by size carries `__by: "size"`. Every lookup takes the roster row, so
// the caller never has to know which.
export const BIN_BY = [
  { id: "team", label: "By team", hint: "one bin per team or colour" },
  { id: "size", label: "By size", hint: "one bin per size" },
  { id: "none", label: "No bins", hint: "the order is not sorted at the station" },
];
export const binFieldOf = binMap => (binMap && binMap.__by === "size" ? "size" : "team");
export const binCount = binMap => Object.keys(binMap || {}).filter(k => k !== "__by").length;

// Sizes in the order they sit on a rack: youth before adult, XS … 3XL.
const SIZE_ORDER = ["xs", "s", "m", "l", "xl", "2xl", "xxl", "3xl", "xxxl", "4xl", "5xl"];
export function sizeRank(size) {
  const k = teamKey(size).replace(/\s+/g, "");
  const m = k.match(/^(y|a|youth|adult)?[-/]?(.*)$/);
  const group = /^y/.test(m?.[1] || "") ? 0 : /^a/.test(m?.[1] || "") ? 1 : 2;
  const i = SIZE_ORDER.indexOf(m?.[2] || k);
  return [group, i < 0 ? 99 : i, k];
}
export const bySize = (a, b) => { const x = sizeRank(a), y = sizeRank(b); return (x[0] - y[0]) || (x[1] - y[1]) || x[2].localeCompare(y[2]); };

// ── The roster table's sort ──────────────────────────────────────────────────
// Size is the default: the rack order (youth before adult, XS before 3XL), the
// numbers within a size. Status puts what is still to do first. Ties keep the
// file's order (the sort is stable).
export const ROSTER_SORTS = [
  { id: "size",   label: "Size" },
  { id: "status", label: "Status" },
  { id: "name",   label: "Name" },
  { id: "number", label: "Number" },
  { id: "team",   label: "Team" },
  { id: "bin",    label: "Bin" },
];
// Status, done first (the default): passed, by hand, flagged, missing, short,
// then what is still to scan. To-do first turns it round: to scan, flagged,
// by hand, missing, short, passed.
const DONE_FIRST = { pass: 0, manual: 1, flag: 2, missing: 3, short: 4, false: 5, undefined: 5, "": 5 };
const TODO_FIRST = { false: 0, undefined: 0, "": 0, flag: 1, manual: 2, missing: 3, short: 4, pass: 5 };
const numOf = r => { const n = parseInt(String(r.number ?? "").replace(/\D/g, ""), 10); return Number.isFinite(n) ? n : 1e9; };
const byNumber = (a, b) => numOf(a) - numOf(b) || String(a.number ?? "").localeCompare(String(b.number ?? ""));
const byText = k => (a, b) => String(a[k] ?? "").localeCompare(String(b[k] ?? ""), undefined, { sensitivity: "base" });
export function sortRoster(roster, by = "size", binMap = null, { doneFirst = true } = {}) {
  const order = doneFirst ? DONE_FIRST : TODO_FIRST;
  const cmp = {
    size:   (a, b) => bySize(a.size, b.size) || byNumber(a, b),
    status: (a, b) => (order[a.scanned] ?? 5) - (order[b.scanned] ?? 5) || bySize(a.size, b.size) || byNumber(a, b),
    name:   (a, b) => byText("name")(a, b) || byNumber(a, b),
    number: (a, b) => byNumber(a, b) || byText("name")(a, b),
    team:   (a, b) => byText("team")(a, b) || bySize(a.size, b.size) || byNumber(a, b),
    bin:    (a, b) => ((binFor(binMap, a) ?? 1e9) - (binFor(binMap, b) ?? 1e9)) || bySize(a.size, b.size) || byNumber(a, b),
  }[by];
  return cmp ? roster.slice().sort(cmp) : roster;
}

// The sizes and teams an order has, for the table's filter: sizes in rack order, teams as named.
export function rosterChoices(roster) {
  const uniq = k => [...new Set(roster.map(r => String(r[k] ?? "").trim()).filter(Boolean))];
  return { sizes: uniq("size").sort(bySize), teams: uniq("team").sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })) };
}

// `taken`: bin numbers that may not be handed out again (bins closed as full).
export function buildBinMap(roster, existing = {}, by, taken = []) {
  const field = by === "size" || by === "team" ? by : binFieldOf(existing);
  const keep  = binFieldOf(existing) === field ? existing : {};          // switching the field starts the bins over
  const map   = Object.fromEntries(Object.entries(keep).filter(([k]) => k !== "__by"));
  const used  = new Set([...Object.values(map), ...taken]);
  const keys  = [...new Set(roster.map(r => teamKey(r[field])).filter(Boolean))].sort(field === "size" ? bySize : undefined);
  let next = 1;
  for (const key of keys) {
    if (map[key] !== undefined) continue;
    while (used.has(next)) next++;
    map[key] = next; used.add(next);
  }
  return field === "size" ? { ...map, __by: "size" } : map;
}

// `row` is a roster row (or a match); a bare string is taken as the keyed field's value.
export function binFor(binMap, row) {
  if (!binMap || !row) return null;
  const v = typeof row === "object" ? row[binFieldOf(binMap)] : row;
  if (!v) return null;
  const b = binMap[teamKey(v)];
  return b === undefined ? null : b;
}

// ── A bin that is full ──────────────────────────────────────────────────────
// The bin map only ever says which bin is OPEN for a team or size. When the
// operator says a bin is full it is closed: `closed` keeps
// { bin, key, label, ids, closedAt } — the roster rows that were in it — and
// the team or size gets the next number nobody has used. A jersey in a bin is
// a row passed by the camera or by hand; a flagged one is with the supervisor.
export const inBin = r => !!r && (r.scanned === "pass" || r.scanned === "manual");

// The bin a row is in (a done row in a closed bin stays there), else the bin
// it will go in.
export function binOfRow(binMap, closed, row) {
  if (inBin(row)) { const c = (closed || []).find(c => c.ids.includes(row._id)); if (c) return c.bin; }
  return binFor(binMap, row);
}

export function nextBinNumber(binMap, closed = []) {
  const nums = [...Object.entries(binMap || {}).filter(([k]) => k !== "__by").map(([, b]) => b), ...closed.map(c => c.bin)];
  return nums.reduce((m, b) => Math.max(m, Number(b) || 0), 0) + 1;
}

// The rows in `bin` right now, open or closed.
export function binContents(roster, binMap, closed, bin) {
  return roster.filter(r => inBin(r) && binOfRow(binMap, closed, r) === bin);
}

// Close the open bin `bin`: → { binMap, closed, entry, newBin }, or null when
// `bin` is not an open bin. `now` stamps the closing.
export function closeBin(roster, binMap, closed = [], bin, now = Date.now()) {
  const hit = Object.entries(binMap || {}).find(([k, b]) => k !== "__by" && b === bin);
  if (!hit) return null;
  const key    = hit[0];
  const label  = binEntries(roster, binMap).find(e => e.bin === bin)?.label || key;
  const entry  = { bin, key, label, ids: binContents(roster, binMap, closed, bin).map(r => r._id), closedAt: now };
  const newBin = nextBinNumber(binMap, closed);
  return { binMap: { ...binMap, [key]: newBin }, closed: [...closed, entry], entry, newBin };
}

// A row taken back (un-checked) is no longer in the closed bin it was in.
export const dropFromClosed = (closed, id) => (closed || []).map(c => c.ids.includes(id) ? { ...c, ids: c.ids.filter(x => x !== id) } : c);

// [{ label, bin }] in bin order, using the roster's own spelling of each team or size.
export function binEntries(roster, binMap) {
  if (!binMap) return [];
  const field = binFieldOf(binMap), label = {};
  roster.forEach(r => { const k = teamKey(r[field]); if (k && !label[k]) label[k] = String(r[field]).trim(); });
  return Object.entries(binMap).filter(([k]) => k !== "__by").map(([k, bin]) => ({ label: label[k] || k, bin })).sort((a, b) => a.bin - b.bin);
}

// Columns to show in the roster table (everything the file had, minus state).
export function displayColumns(roster) {
  if (!roster.length) return [];
  const keys = [];
  roster.forEach(r => Object.keys(r).forEach(k => { if (!keys.includes(k)) keys.push(k); }));
  return keys.filter(k => !APP_COLUMNS.includes(k));   // also hides them on rosters that were loaded before this rule
}

// Columns beyond the core four (goalie, colourway, style…) shown as badges.
export function extraColumns(roster) {
  return displayColumns(roster).filter(k => !CORE_COLUMNS.includes(k));
}

export { BOM };
