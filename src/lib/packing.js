// The Packing screen's guide (the owner, 25 Nov 2026): one sentence that says what
// the operator does next, from the state of the order. Pure functions, so the
// three steps can be tested without the screen.

// What a box's printed labels carry, as strings in one fixed order: the jerseys in
// the box (`rows`) and, when its NOT IN BOX list goes with it, the jerseys that list
// names (`notIn`: notInBox() in printjobs.js, `out:` before each id). A jersey marked
// missing or flagged after the list printed changes the NOT IN BOX part, so the list
// counts as changed (review, 25 Nov 2026).
const idOf = r => String(r?._id ?? `${r?.order ?? ""}:${r?.number ?? ""}:${r?.name ?? ""}`);
export const listIds = (rows, notIn = []) => [...(rows || []).map(idOf), ...(notIn || []).map(x => `out:${idOf(x.row)}`)].sort();

// Was a box's list printed with exactly what it would carry now? `printedIds` is
// what was saved when it printed (undefined: never printed). Finish order skips
// a box whose list is unchanged, so no list prints twice.
export function listUnchanged(printedIds, currentIds) {
  if (!Array.isArray(printedIds)) return false;
  const was = printedIds.map(String), now = (currentIds || []).map(String);
  return was.length === now.length && now.every(id => was.includes(id));
}

// What to do now.
//   toScan      jerseys still to scan (every row with no status)
//   openBoxes   [{ count, printed }]: the open boxes, how many jerseys each holds, and
//               whether its list is printed and unchanged
// → { step: "scan" | "print" | "finish", text }
//   scan    jerseys are still to scan;
//   print   every jersey is accounted for and an open box with jerseys has no list yet
//           (a box with none never asks for a list; a changed list counts as not printed);
//   finish  every list is out (or nothing needs one): finish the order.
export function nowStep({ toScan = 0, openBoxes = [] } = {}) {
  if (toScan > 0) return { step: "scan", text: `Now: keep scanning · ${toScan} to go` };
  if (openBoxes.some(b => b.count > 0 && !b.printed)) return { step: "print", text: "Now: print the box lists and seal the boxes" };
  return { step: "finish", text: "Now: finish the order" };
}
