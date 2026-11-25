// The Packing screen's guide (the owner, 25 Nov 2026): one sentence that says what
// the operator does next, from the state of the order. Pure functions, so the
// three steps can be tested without the screen.

// The ids of the jerseys in a box, as strings, in one fixed order: what a printed
// list named, and what the box holds now, are compared by this.
export const boxIds = rows => (rows || []).map(r => String(r._id ?? `${r.order ?? ""}:${r.number ?? ""}:${r.name ?? ""}`)).sort();

// Was a box's list printed with exactly the jerseys it holds now? `printedIds` is
// what was saved when it printed (undefined: never printed). Finish order skips
// a box whose list is unchanged, so no list prints twice.
export function listUnchanged(printedIds, currentIds) {
  if (!Array.isArray(printedIds)) return false;
  const was = printedIds.map(String), now = (currentIds || []).map(String);
  return was.length === now.length && now.every(id => was.includes(id));
}

// What to do now.
//   toScan      jerseys still to scan (every row with no status)
//   openBoxes   [{ bin, count, printed }]: the open boxes, how many jerseys each holds, and
//               whether its list is printed and unchanged
// → { step: "scan" | "print" | "finish", text, unprinted }
//   scan    jerseys are still to scan;
//   print   every jersey is accounted for and an open box with jerseys has no list yet
//           (a box with none never asks for a list; a changed list counts as not printed);
//   finish  every list is out (or nothing needs one): finish the order.
export function nowStep({ toScan = 0, openBoxes = [] } = {}) {
  if (toScan > 0) return { step: "scan", text: `Now: keep scanning · ${toScan} to go`, unprinted: 0 };
  const unprinted = openBoxes.filter(b => b.count > 0 && !b.printed).length;
  if (unprinted > 0) return { step: "print", text: "Now: print the box lists and seal the boxes", unprinted };
  return { step: "finish", text: "Now: finish the order", unprinted: 0 };
}
