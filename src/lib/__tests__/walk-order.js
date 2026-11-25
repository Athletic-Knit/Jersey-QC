// The owner's walk-through order of 25 Nov 2026 (not a test file): U11 Tigers and U12 Bombers
// in 123456, with #19 flagged and #44 missing, as the label tests use it.
const r = (team, size, number, name) => ({ team, size, number, name });
const T1 = [
  r("U11 Tigers", "A-S", "2", "LEACH"), r("U11 Tigers", "A-S", "4", "KOVALENKO"), r("U11 Tigers", "A-S", "9", "JONES"), r("U11 Tigers", "A-S", "15", "BROWN"), r("U11 Tigers", "A-S", "17", "SMITH"),
  r("U11 Tigers", "A-M", "7", "SMITH"), r("U11 Tigers", "A-M", "12", "EVANOVITCH"), r("U11 Tigers", "A-M", "13", "RUBY"), r("U11 Tigers", "A-M", "19", "TAYLOR"),
  r("U11 Tigers", "A-L", "11", "MACDONALD"), r("U11 Tigers", "A-L", "100", "VANDERHOOGENBAND-SMITH"),
];
const T2 = [
  r("U12 Bombers", "A-S", "1", "ABBOTT"),
  r("U12 Bombers", "A-M", "3", "WILSON"), r("U12 Bombers", "A-M", "8", "TAYLOR"), r("U12 Bombers", "A-M", "10", "MOORE"),
  r("U12 Bombers", "A-L", "11", "MACDONALD"), r("U12 Bombers", "A-L", "14", "RUBY"), r("U12 Bombers", "A-L", "23", "CLARK"), r("U12 Bombers", "A-L", "44", "HALL"),
  r("U12 Bombers", "A-XL", "66", "ZIMMERMAN"),
];
export const WALK = {
  u11: { rows: T1, flagged: ["19"], missing: [] },
  u12: { rows: T2, flagged: [], missing: ["44"] },
};
// The garments that are in the box: the team less its flagged and missing ones.
export const walkBox = k => WALK[k].rows.filter(x => !WALK[k].flagged.includes(x.number) && !WALK[k].missing.includes(x.number));

// The whole order as the station holds it at Finish order: every garment scanned, #19 flagged, #44 marked missing.
// Needs the roster helpers, so it is built where it is used.
export function walkRoster() {
  let id = 0;
  return [...WALK.u11.rows.map(x => ({ ...x, k: "u11" })), ...WALK.u12.rows.map(x => ({ ...x, k: "u12" }))].map(x => {
    const w = WALK[x.k], { k: _k, ...row } = x;
    return { ...row, _id: id++, scanned: w.flagged.includes(x.number) ? "flag" : w.missing.includes(x.number) ? "missing" : "pass" };
  });
}
