// ── Roster files: CSV / Excel → rows the app can match against ───────────────
// Every column the file carries is kept; the four core ones are canonicalised.
// Also the rules about the rows once read, shared by the station, the board and
// the hub (which runs this file too): boxes ("bins" in the code), sizes in rack
// order, the roster table's search, sort and filters, blank jerseys, shortages.

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
  // Blank jerseys (no decoration) come as lines of "40 of Navy A-L": the
  // quantity makes that many rows; the style is kept as a column.
  quantity:     ["quantity", "qty", "qty.", "count", "pieces", "pcs", "units", "how many"],
  style:        ["style", "style number", "style no", "style no.", "style #", "style#", "sku"],
};
export const CORE_COLUMNS = ["name", "number", "team", "size"];
const STATE_COLUMNS = ["_id", "scanned", "mark"];
// Columns this app writes into its own Excel export. A re-used export must not
// bring yesterday's results back as roster data ("Status: PASS" on unscanned rows).
const APP_COLUMNS = ["status", "bin", "box", "reason", "resolution", "inspected by", "time", ...STATE_COLUMNS];

// A header cell → its canonical column ("Player Name" → "name"), else the
// header as written, lower-cased.
export function canonicalHeader(h) {
  const key = stripBOM(String(h ?? "")).trim().toLowerCase();
  for (const [canon, list] of Object.entries(ALIASES)) if (list.includes(key)) return canon;
  return key;
}

// A header row names the players (name or number), or, for an order of blank
// jerseys, the sizes with how many or which team.
function looksLikeHeader(cells) {
  const canon = (cells || []).map(canonicalHeader);
  return canon.includes("name") || canon.includes("number") || (canon.includes("size") && (canon.includes("quantity") || canon.includes("team")));
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
// The value must have a digit in it: a title "Order Form" is not order "Form"
// (code review of 23 Nov 2026). Order numbers are numbers, sometimes with a
// letter or dash ("A-55555").
const ORDER_IN_TEXT = /\b(?:order|po|job|work order)\s*(?:no\.?|number|id|#)?\s*[:#-]?\s*((?=[\w-]*\d)[A-Za-z0-9][\w-]*)/i;
// Orders that ship together (the owner, 20 Nov 2026: "it says on the order form"):
// "Ship with 264248", "Ships with: 264248, 264249", "Ship w/ #264248 & 264249" in a
// title row, or a "ship with" column. Their boxes may be filled together.
const SHIP_WITH_IN_TEXT = /\bship(?:s|ping)?\s*(?:with|w\/)\s*(?:order)?s?\s*[:#-]?\s*((?:#?\s*\d{3,}[\s,;&+/]*(?:and\s+)?)+)/i;
const SHIP_WITH_HEADER = /^ship(?:s|ping)?\s*(?:with|w\/)/i;
// "264248, 264249 & #264250" → ["264248", "264249", "264250"] (numbers of three digits or more).
// Order numbers are six digits (the owner, 20 Nov 2026): a run of 12, 18 … digits typed with
// nothing between is that many orders.
export const orderList = text => [...new Set((String(text ?? "").match(/\d{3,}/g) || []).flatMap(n => (n.length > 6 && n.length % 6 === 0 ? n.match(/\d{6}/g) : [n])))];

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
  const shipCol = rows[hIdx].map(h => SHIP_WITH_HEADER.test(stripBOM(String(h ?? "")).trim()));
  // Two columns that mean the same field: the last one is the field, as it always was,
  // except that a duplicate column which is empty, or (for the number) is not jersey
  // numbers — a "Jersey" column of Home / Away, a 1, 2, 3 … line count — is not taken
  // for it and is kept under its own header. The last column used to win whatever it
  // held and turned every number into "Home" (code review M17). The order column is
  // left alone: the first order number found wins, as before.
  const raw = rows[hIdx].map(h => stripBOM(String(h ?? "")).trim().toLowerCase());
  const data = rows.slice(hIdx + 1);
  const cellsOf = i => data.map(r => String(r?.[i] ?? "").trim()).filter(Boolean);
  const isLineCount = vals => vals.length >= 2 && vals.every((v, k) => v === String(k + 1));
  const looksLikeNumbers = vals => vals.filter(v => /^\d{1,3}$/.test(v)).length >= 0.8 * vals.length;
  for (const canon of Object.keys(ALIASES)) {
    if (canon === "order") continue;
    const cols = headers.map((h, i) => (h === canon ? i : -1)).filter(i => i >= 0);
    if (cols.length < 2) continue;
    let fit = cols.filter(i => cellsOf(i).length);
    if (canon === "number") {
      const numeric = fit.filter(i => looksLikeNumbers(cellsOf(i)));
      if (numeric.length) fit = numeric;
      const notCount = fit.filter(i => !isLineCount(cellsOf(i)));
      if (notCount.length) fit = notCount;
    }
    const keep = (fit.length ? fit : cols).at(-1);
    cols.filter(i => i !== keep).forEach(i => {
      let key = raw[i] !== canon ? raw[i] : `${canon} 2`, n = 2;
      while (headers.includes(key) || ALIASES[key]) key = `${raw[i]} ${++n}`;
      headers[i] = key;
    });
  }
  let orderNumber = "", shipWith = [];
  for (let i = 0; i < hIdx; i++) {
    let text = (rows[i] || []).map(c => String(c ?? "")).join(" ");
    const sw = text.match(SHIP_WITH_IN_TEXT);
    if (sw) { shipWith.push(...orderList(sw[1])); text = text.replace(sw[0], " "); }   // "Ship with order 264248" is not this order's number
    const m = !orderNumber && text.match(ORDER_IN_TEXT);
    if (m && !/^(no|number|id)$/i.test(m[1])) orderNumber = m[1];
  }
  // A line with no name and no number is a blank jersey (no decoration). It is
  // kept when the file is a blanks order (no name and no number column at
  // all) or the line says how many; otherwise it is the stray or empty line it
  // always was, and is dropped. A quantity makes that many rows, so each
  // jersey is still one row to pass, flag, box and sticker.
  const blanksFile = !headers.includes("name") && !headers.includes("number");
  const out = [];
  rows.slice(hIdx + 1).forEach(cells => {
    const row = {}; let qty = null;
    headers.forEach((h, i) => {
      if (shipCol[i]) { shipWith.push(...orderList(cells?.[i])); return; }
      if (!h || APP_COLUMNS.includes(h)) return;
      const v = String(cells?.[i] ?? "").trim();
      if (h === "order") { if (v && !orderNumber) orderNumber = v; return; }
      if (h === "quantity") { const n = parseInt(v.replace(/[^\d-]/g, ""), 10); qty = Number.isFinite(n) ? n : null; return; }
      row[h] = v;
    });
    const named = !!(row.name || row.number);
    const blank = !named && (qty > 0 || (blanksFile && qty === null && !!(row.size || row["size range"] || row.team)));
    if (!named && !blank) return;
    const copies = Math.max(1, Math.min(qty > 0 ? qty : 1, MAX_QUANTITY, MAX_ROSTER - out.length));
    for (let i = 0; i < copies && out.length < MAX_ROSTER; i++) out.push({ ...row });
  });
  const result = normaliseRosterRows(out);
  Object.defineProperty(result, "orderNumber", { value: orderNumber, enumerable: false });
  Object.defineProperty(result, "shipWith", { value: [...new Set(shipWith)].filter(n => n !== orderNumber), enumerable: false });
  return result;
}

// One line may stand for at most this many jerseys, and a roster for this many
// rows: a quantity typed as 40000 must not freeze the station.
export const MAX_QUANTITY = 1000, MAX_ROSTER = 5000;

// ── Blank jerseys ───────────────────────────────────────────────────────────
// A row with no name and no number has nothing for the camera to read. The
// station counts them instead: the operator looks the jersey over and presses
// the button of its team and size, and the next row of that kind is passed.
export const isBlankRow = r => !!r && !String(r.name ?? "").trim() && !String(r.number ?? "").trim();
// The blank rows grouped by team, size and style: [{ key, team, size, style,
// total, done, flagged, next }] — `next` is the row a count would pass, null
// when the group is done. In team order, sizes in rack order.
export function blankGroups(roster) {
  const groups = new Map();
  (roster || []).filter(isBlankRow).forEach(r => {
    const team = String(r.team ?? "").trim(), size = String(r.size ?? "").trim(), style = String(r.style ?? "").trim();
    const key = [team, size, style].map(x => x.toLowerCase()).join("|");
    const g = groups.get(key) || { key, team, size, style, total: 0, done: 0, flagged: 0, next: null };
    g.total++;
    if (r.scanned === "pass" || r.scanned === "manual") g.done++;
    else if (r.scanned === "flag") g.flagged++;
    else if (!r.scanned && !g.next) g.next = r;
    groups.set(key, g);
  });
  return [...groups.values()].sort((a, b) => a.team.localeCompare(b.team, undefined, { sensitivity: "base" }) || bySize(a.size, b.size) || a.style.localeCompare(b.style));
}

// The order number a parsed roster carried, or "".
export function orderNumberOf(rows) { return (rows && rows.orderNumber) || ""; }
// The order numbers it ships with (a "Ship with" title row or column), or [].
export function shipWithOf(rows) { return (rows && rows.shipWith) || []; }

// The records of a CSV text: a line break inside a quoted cell ("Smith
// <newline> Jr", which Excel writes for a cell with Alt+Enter in it) belongs to
// the cell and does not start a new row (code review of 23 Nov 2026). The break
// becomes a space: a roster cell is one line on the screen and on a label.
// A quote opens a quoted cell only at the start of a cell, so a stray inch
// mark (12") cannot swallow the lines after it; a quote never closed means the
// file was not quoted that way, and the plain lines are used as before.
export function splitCSVRecords(text, delim) {
  // A stray quote at the start of a cell ("6 in) can pair with a real one lines later and swallow
  // every row between them (phase 6 review). A roster cell is never more than a few lines, so a
  // record that took in more than two line breaks means the quotes were not CSV quoting: the
  // plain lines are used instead, as before.
  const MAX_BREAKS_IN_A_CELL = 2;
  const out = [];
  let cur = "", inQ = false, atStart = true, breaks = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '""'; i++; continue; } inQ = false; cur += ch; }
      else if (ch === "\r" && text[i + 1] === "\n") { cur += " "; i++; breaks++; }
      else if (ch === "\n" || ch === "\r") { cur += " "; breaks++; }
      else cur += ch;
      if (breaks > MAX_BREAKS_IN_A_CELL) return text.split(/\r?\n/);
      continue;
    }
    if (ch === "\n" || (ch === "\r" && text[i + 1] === "\n")) {
      out.push(cur); cur = ""; atStart = true; breaks = 0;
      if (ch === "\r") i++;
      continue;
    }
    if (ch === '"' && atStart) inQ = true;
    cur += ch;
    if (ch === delim) atStart = true;
    else if (ch !== " " && ch !== "\t") atStart = false;
  }
  if (inQ) return text.split(/\r?\n/);
  out.push(cur);
  return out;
}

// A CSV, TSV or text file's contents → roster rows (as rowsToRoster makes them).
export function parseCSV(text) {
  const clean = stripBOM(String(text ?? ""));
  const plain = clean.split(/\r?\n/).filter(l => l.trim() !== "");
  if (plain.length < 2) return [];
  // The delimiter is judged over the first lines together, not the first line
  // alone: a title row above the header ("Order 4521 - Ravens") has none.
  const delim = detectDelimiter(plain.slice(0, 15).join("\n"));
  const lines = splitCSVRecords(clean, delim).filter(l => l.trim() !== "");
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

// The first row id no row and no log entry of the order has used. Rows added or
// replaced mid-order are numbered from here: ids are positions in the file, and a
// replaced roster numbered from 0 again took over the old log's passes and flags
// (code review M13).
export const nextRowId = (roster = [], log = []) =>
  Math.max(-1, ...roster.map(r => Number(r?._id)).filter(Number.isFinite), ...log.map(l => Number(l?.match?._id)).filter(Number.isFinite)) + 1;

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
    // A number cell formatted with decimals in Excel ("0.0") reads as "12.0" or
    // "7.00"; normNum would drop the dot and make it 120. Digits and a dot with
    // only zeros after it are the digits; leading zeros stay ("07.0" is 07, as
    // 07 and 7 are different jerseys, N2). Code review of 23 Nov 2026.
    if (/^\d+\.0+$/.test(out.number)) out.number = out.number.replace(/\.0+$/, "");
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
// the caller never has to know which. Every order has at least one bin, as
// packing boxes by the bin: an order that is not sorted (the "none" choice, or
// a roster with no team or size to sort by) is one bin for the whole order,
// `{ "*": 1, __by: "all" }`.
export const BIN_BY = [
  { id: "team", label: "By team", hint: "boxes per team or colour" },
  { id: "size", label: "By size", hint: "boxes per size" },
  { id: "none", label: "Not sorted", hint: "the whole order in one run of boxes" },
];
// On the floor a bin is a box, and it has a name of two numbers: "5.2" is the
// second box of sort 5 (a team, a size, or the whole order). The first number
// never changes for a team or size; the second counts its boxes as they fill
// (owner, 12 Nov 2026). The code still says "bin" for the thing itself.
// An older saved order has plain numbers (3): they read as box 3, no second number.
export const boxParts = b => { const m = String(b ?? "").trim().match(/^(\d+)(?:\.(\d+))?$/); return m ? [Number(m[1]), Number(m[2] || 0)] : [1e9, 0]; };
// Box order for sorting: 2.1 before 2.2 before 10.1.
export const binOrder = (a, b) => { const x = boxParts(a), y = boxParts(b); return (x[0] - y[0]) || (x[1] - y[1]); };
const groupOf = b => boxParts(b)[0];
// An order saved before the boxes had two numbers: its open bin 3 becomes box
// 3.1, so a resumed order shows and prints box names like every new one.
export const modernBins = binMap => !binMap ? binMap
  : Object.fromEntries(Object.entries(binMap).map(([k, b]) => [k, k !== "__by" && boxParts(b)[1] === 0 && boxParts(b)[0] < 1e9 ? `${boxParts(b)[0]}.1` : b]));
export const ALL_KEY = "*";
export const ALL_LABEL = "Whole order";
// Rows with nothing in the field the order is sorted by (a blank team on a
// by-team order) share one bin of their own, so every jersey is in a bin, on
// a bin list and in the Bins sheet's total.
export const BLANK_KEY = "?";
export const blankLabel = field => (field === "size" ? "No size" : "No team");
// What a box map sorts by: "size", "all" (not sorted: one box for the whole
// order) or "team" (a team map carries no `__by`). binCount: how many boxes it names.
export const binFieldOf = binMap => (binMap && binMap.__by === "size" ? "size" : binMap && binMap.__by === "all" ? "all" : "team");
export const binCount = binMap => Object.keys(binMap || {}).filter(k => k !== "__by").length;

// Sizes in the order they sit on a rack: youth before adult before ladies, XS … 3XL.
// Ladies is "L-" with the dash ("L-M" is ladies medium; a bare "L" is large).
const SIZE_ORDER = ["xs", "s", "m", "l", "xl", "2xl", "xxl", "3xl", "xxxl", "4xl", "5xl"];
// A size → [group (0 youth, 1 adult, 2 ladies, 3 other), place in SIZE_ORDER, its key].
export function sizeRank(size) {
  const k = teamKey(size).replace(/\s+/g, "");
  const m = k.match(/^(youth|adult|ladies|women|y|a|l(?=[-/])|w(?=[-/]))?[-/]?(.*)$/);
  const p = m?.[1] || "";
  const group = /^y/.test(p) ? 0 : /^a/.test(p) ? 1 : /^[lw]/.test(p) ? 2 : 3;
  const i = SIZE_ORDER.indexOf(m?.[2] || k);
  return [group, i < 0 ? 99 : i, k];
}
// Two sizes in rack order (for sort).
export const bySize = (a, b) => { const x = sizeRank(a), y = sizeRank(b); return (x[0] - y[0]) || (x[1] - y[1]) || x[2].localeCompare(y[2]); };

// The sizes a station may pick for a jersey that is on no roster row (an extra
// jersey or a duplicate, flagged from the pick list). Every size there is, not
// only the roster's (the owner, 19 Nov 2026: an extra jersey can be any size):
// youth XS-XL, adult XS-3XL, ladies XS-XL, and any other size this roster has
// (A-4XL, OSFA …) on a row of its own.
export const SIZE_GROUPS = [
  { key: "Y", label: "Youth",  sizes: ["XS", "S", "M", "L", "XL"] },
  { key: "A", label: "Adult",  sizes: ["XS", "S", "M", "L", "XL", "2XL", "3XL"] },
  { key: "L", label: "Ladies", sizes: ["XS", "S", "M", "L", "XL"] },
];
export const DEFAULT_SIZES = SIZE_GROUPS.flatMap(g => g.sizes.map(s => `${g.key}-${s}`));
// [{ label: "Youth", sizes: [{ value: "Y-XS", short: "XS" }, …] }, …, { label: "Also on this order", sizes: […] }]
export function sizeChoiceGroups(roster) {
  const known = new Set(DEFAULT_SIZES.map(s => teamKey(s)));
  const groups = SIZE_GROUPS.map(g => ({ label: g.label, sizes: g.sizes.map(s => ({ value: `${g.key}-${s}`, short: s })) }));
  const other = rosterChoices(roster || []).sizes.filter(s => s && !known.has(teamKey(s).replace(/\s+/g, "")));
  if (other.length) groups.push({ label: "Also on this order", sizes: [...other].sort(bySize).map(s => ({ value: s, short: s })) });
  return groups;
}
// The same sizes as one flat list of values.
export const sizeChoices = roster => sizeChoiceGroups(roster).flatMap(g => g.sizes.map(s => s.value));

// The pick list's order (the owner, 19 Nov 2026): by size, so the operator
// finds the row of the size tag at once — on a by-team order the same number
// comes up on several teams and the size tag is all they check. A station
// can choose team or number instead (Settings → Pick list). Ties keep the
// matcher's order (Array.prototype.sort is stable).
export const LIST_SORTS = [{ id: "size", label: "Size" }, { id: "team", label: "Team" }, { id: "number", label: "Number" }];
// A size's family: the part before the hyphen ("L-S" → "L", "A-XL" → "A"); a
// size without a hyphen is its own family ("XL" → "XL"); "" → "".
export const sizeFamily = size => { const s = String(size || "").trim().toUpperCase().replace(/\s+/g, ""); return s.split(/[-/]/)[0] || s; };
const sameSize = (a, b) => String(a || "").trim().toUpperCase().replace(/\s+/g, "") === String(b || "").trim().toUpperCase().replace(/\s+/g, "");
// `lastSize` (the owner, 25 Nov 2026: jerseys come in bundles of one size, and
// on a numbers-only roster the list for #12 has every size's #12): before the
// chosen order, the rows of the last confirmed jersey's size come first, then
// its family (L-S, L-M, L-L), then the rest; within a rank the order is as chosen.
export function sortCandidates(rows, by = "size", { lastSize = "" } = {}) {
  const fam  = sizeFamily(lastSize);
  const rank = r => !fam ? 0 : sameSize(r.size, lastSize) ? 0 : sizeFamily(r.size) === fam && String(r.size || "").trim() ? 1 : 2;
  const num  = r => { const n = parseInt(String(r.number ?? "").replace(/[^0-9]/g, ""), 10); return Number.isFinite(n) ? n : 999; };
  const team = (a, b) => String(a.team || "").localeCompare(String(b.team || ""), undefined, { sensitivity: "base", numeric: true });
  const size = (a, b) => bySize(a.size || "", b.size || "");
  const cmp = by === "team"   ? (a, b) => team(a, b) || size(a, b) || num(a) - num(b)
            : by === "number" ? (a, b) => num(a) - num(b) || size(a, b) || team(a, b)
            :                   (a, b) => size(a, b) || team(a, b) || num(a) - num(b);
  return [...rows].sort((a, b) => rank(a) - rank(b) || cmp(a, b));
}

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
  { id: "bin",    label: "Box" },
];
// Status, done first (the default): passed, by hand, flagged, missing, short,
// then what is still to scan. To-do first turns it round: to scan, flagged,
// by hand, missing, short, passed.
const DONE_FIRST = { pass: 0, manual: 1, flag: 2, missing: 3, short: 4, false: 5, undefined: 5, "": 5 };
const TODO_FIRST = { false: 0, undefined: 0, "": 0, flag: 1, manual: 2, missing: 3, short: 4, pass: 5 };
const numOf = r => { const n = parseInt(String(r.number ?? "").replace(/\D/g, ""), 10); return Number.isFinite(n) ? n : 1e9; };
const byNumber = (a, b) => numOf(a) - numOf(b) || String(a.number ?? "").localeCompare(String(b.number ?? ""));
const byText = k => (a, b) => String(a[k] ?? "").localeCompare(String(b[k] ?? ""), undefined, { sensitivity: "base" });
// `binOf(row)`: the box a row is in or will go in (the station passes its own,
// which knows the closed boxes); without it, the open box of the row's team or size.
export function sortRoster(roster, by = "size", binMap = null, { doneFirst = true, binOf = row => binFor(binMap, row) } = {}) {
  const order = doneFirst ? DONE_FIRST : TODO_FIRST;
  const cmp = {
    size:   (a, b) => bySize(a.size, b.size) || byNumber(a, b),
    status: (a, b) => (order[a.scanned] ?? 5) - (order[b.scanned] ?? 5) || bySize(a.size, b.size) || byNumber(a, b),
    name:   (a, b) => byText("name")(a, b) || byNumber(a, b),
    number: (a, b) => byNumber(a, b) || byText("name")(a, b),
    team:   (a, b) => byText("team")(a, b) || bySize(a.size, b.size) || byNumber(a, b),
    bin:    (a, b) => binOrder(binOf(a), binOf(b)) || (order[a.scanned] ?? 5) - (order[b.scanned] ?? 5) || bySize(a.size, b.size) || byNumber(a, b),
  }[by];
  return cmp ? roster.slice().sort(cmp) : roster;
}

// The roster table's search box: "57", "#57", "smith", "57 smith", "navy 9".
// Every word must match the row: a word of digits is the jersey number,
// exactly (00 and 0 are two different jerseys); any other word is a part of
// the name or of the team. Nothing typed matches every row.
export function rosterMatches(row, query) {
  const words = String(query ?? "").toLowerCase().split(/\s+/).map(w => w.replace(/^#/, "")).filter(Boolean);
  if (!words.length) return true;
  const number = String(row?.number ?? "").trim().toLowerCase(), name = String(row?.name ?? "").toLowerCase(), team = String(row?.team ?? "").toLowerCase();
  return words.every(w => /^\d+$/.test(w) ? number === w : name.includes(w) || team.includes(w));
}

// The sizes and teams an order has, for the table's filter: sizes in rack order, teams as named.
export function rosterChoices(roster) {
  const uniq = k => [...new Set(roster.map(r => String(r[k] ?? "").trim()).filter(Boolean))];
  return { sizes: uniq("size").sort(bySize), teams: uniq("team").sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })) };
}

// `taken`: boxes whose first number may not be handed out again (boxes closed as full).
export function buildBinMap(roster, existing = {}, by, taken = []) {
  const gone = taken.map(groupOf);
  const field = by === "size" || by === "team" ? by : by === "none" || by === "all" ? "all" : binFieldOf(existing);
  // One bin for the whole order: the one it already has, else the first number free.
  const whole = () => {
    if (!roster.length) return {};
    let n = 1; while (gone.includes(n)) n++;
    return { [ALL_KEY]: binFieldOf(existing) === "all" && existing[ALL_KEY] !== undefined ? existing[ALL_KEY] : `${n}.1`, __by: "all" };
  };
  if (field === "all") return whole();
  const keep  = binFieldOf(existing) === field ? existing : {};          // switching the field starts the bins over
  const map   = Object.fromEntries(Object.entries(keep).filter(([k]) => k !== "__by"));
  const used  = new Set([...Object.values(map).map(groupOf), ...gone]);
  const keys  = [...new Set(roster.map(r => teamKey(r[field])).filter(Boolean))].sort(field === "size" ? bySize : undefined);
  let next = 1;
  for (const key of keys) {
    if (map[key] !== undefined) continue;
    while (used.has(next)) next++;
    map[key] = `${next}.1`; used.add(next);
  }
  if (!Object.keys(map).length) return whole();                          // nothing to sort by: one bin
  if (map[BLANK_KEY] === undefined && roster.some(r => !teamKey(r[field]))) {
    while (used.has(next)) next++;
    map[BLANK_KEY] = `${next}.1`;
  }
  return field === "size" ? { ...map, __by: "size" } : map;
}

// `row` is a roster row (or a match); a bare string is taken as the keyed field's value.
export function binFor(binMap, row) {
  if (!binMap || !row) return null;
  if (binFieldOf(binMap) === "all") return binMap[ALL_KEY] ?? null;
  const v = typeof row === "object" ? row[binFieldOf(binMap)] : row;
  const b = binMap[teamKey(v) || BLANK_KEY];
  return b === undefined ? null : b;
}

// ── A bin that is full ──────────────────────────────────────────────────────
// The bin map only ever says which bin is OPEN for a team or size. When the
// operator says a bin is full it is closed: `closed` keeps
// { bin, key, label, ids, closedAt } — the roster rows that were in it — and
// the team or size carries on in its next box (5.1 → 5.2). A jersey in a bin is
// a row passed by the camera or by hand; a flagged one is with the supervisor.
export const inBin = r => !!r && (r.scanned === "pass" || r.scanned === "manual");

// The bin a row is in (a done row in a closed bin stays there), else the bin
// it will go in.
export function binOfRow(binMap, closed, row) {
  if (inBin(row)) { const c = (closed || []).find(c => c.ids.includes(row._id)); if (c) return c.bin; }
  return binFor(binMap, row);
}

// The box that follows `bin` for the same team or size: 5.1 → 5.2. The second
// number is one more than any box of that sort has had, open or closed.
export function nextBinNumber(binMap, closed = [], bin) {
  const g = groupOf(bin);
  const all = [...Object.entries(binMap || {}).filter(([k]) => k !== "__by").map(([, b]) => b), ...closed.map(c => c.bin)];
  const last = all.filter(b => groupOf(b) === g).reduce((m, b) => Math.max(m, boxParts(b)[1]), 0);
  return `${g}.${Math.max(1, last) + 1}`;
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
  const newBin = nextBinNumber(binMap, closed, bin);
  return { binMap: { ...binMap, [key]: newBin }, closed: [...closed, entry], entry, newBin };
}

// ── What a box is short of, before it is sealed ─────────────────────────────
// For every open box: the jerseys of its team or size that are in no box.
// `toScan` are simply not scanned yet (they will go in this box); `short` are
// the ones that will NOT arrive by scanning on: flagged (with the supervisor)
// or marked missing. A box with nothing still to scan and something short is
// about to be sealed incomplete, which is what the operator and the packer
// must be told. → [{ bin, label, toScan, flagged, missing, short: rows, waiting: rows }]
// for the boxes that lack anything, in box order.
export function shortages(roster, binMap, closed = []) {
  if (!binMap) return [];
  return binEntries(roster, binMap).map(({ bin, label }) => {
    const out = roster.filter(r => !inBin(r) && binOfRow(binMap, closed, r) === bin);
    const waiting = out.filter(r => !r.scanned), short = out.filter(r => r.scanned);
    return { bin, label, toScan: waiting.length, flagged: short.filter(r => r.scanned === "flag").length, missing: short.filter(r => r.scanned !== "flag").length, short, waiting };
  }).filter(s => s.toScan + s.short.length > 0);
}
// "#5, #12, #40 and 2 more": the jerseys of a shortage, for a screen line. A
// jersey with no number goes by its name; a blank one by its size.
export const jerseyList = (rows, max = 6) => {
  const one = r => { const n = String(r.number ?? "").trim(), name = String(r.name ?? "").trim(), size = String(r.size ?? "").trim(); return n ? `#${n}` : name || (size ? `${size} blank` : "blank"); };
  return rows.slice(0, max).map(one).join(", ") + (rows.length > max ? ` and ${rows.length - max} more` : "");
};

// How many jerseys the team (or size) of a box has on the roster in all, for
// the box list's "36/50 pcs" (the owner, 19 Nov 2026). `rows`: what is in the
// box; an order that is not sorted is the whole roster.
export function groupSize(roster, binMap, rows) {
  const field = binFieldOf(binMap);
  if (field === "all" || !rows?.length) return field === "all" ? (roster || []).length : 0;
  const k = teamKey(rows[0][field]);
  return (roster || []).filter(r => teamKey(r[field]) === k).length;
}

// A row taken back (un-checked) is no longer in the closed bin it was in.
export const dropFromClosed = (closed, id) => (closed || []).map(c => c.ids.includes(id) ? { ...c, ids: c.ids.filter(x => x !== id) } : c);

// [{ label, bin }] in bin order, using the roster's own spelling of each team or size.
export function binEntries(roster, binMap) {
  if (!binMap) return [];
  const field = binFieldOf(binMap), label = {};
  roster.forEach(r => { const k = teamKey(r[field]); if (k && !label[k]) label[k] = String(r[field]).trim(); });
  return Object.entries(binMap).filter(([k]) => k !== "__by").map(([k, bin]) => ({ label: field === "all" ? ALL_LABEL : k === BLANK_KEY ? blankLabel(field) : label[k] || k, bin })).sort((a, b) => binOrder(a.bin, b.bin));
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
