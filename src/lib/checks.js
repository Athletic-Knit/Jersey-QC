// ── The inspector's checks, as the admin panel may set them (the co-op, 27 Nov 2026) ──────────
// The green screen's checklist is CHECKS in config.js unless the admin panel saved a list of its
// own (`settings.checks` in the admin file, served to the stations in /api/admin/config). Each
// check: `id` (never changes once made, so a running order's "+Holes" keeps its meaning),
// `label` (the words on the tick button), `quick` (on a quick look: shown big as "Look at"; else
// small under "Also look for") and `reasons` (the flag reasons that ask for this check on the
// next garments; a reason belongs to one check at most, and a reason on none restarts Inspect
// fully). Pure: runs in the browser, on the hub and in the tests; never imports config.js.
export const MAX_CHECKS = 12;
export const CHECK_LABEL_MAX = 30;
const ID = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const REASON_ID = /^[a-z0-9_]{1,40}$/;
const tidy = s => String(s ?? "").replace(/\s+/g, " ").trim();

// { list, error }: the list as it will be kept, or the first thing wrong with it in plain words.
export function cleanChecks(given) {
  if (!Array.isArray(given)) return { list: [], error: "The checks must be a list." };
  if (given.length < 1) return { list: [], error: "Keep at least one check: Confirm needs something to tick on Inspect fully." };
  if (given.length > MAX_CHECKS) return { list: [], error: `At most ${MAX_CHECKS} checks.` };
  const out = [], ids = new Set(), labels = new Set(), owner = new Map();
  for (const c of given) {
    if (!c || typeof c !== "object" || Array.isArray(c)) return { list: [], error: "Each check must have an id and a label." };
    const id = String(c.id ?? ""), label = tidy(c.label);
    if (!ID.test(id)) return { list: [], error: `"${id}" is not a check id (small letters, digits, - and _).` };
    if (ids.has(id)) return { list: [], error: `The check id "${id}" is there twice.` };
    if (!label) return { list: [], error: "A check has no name." };
    if (label.length > CHECK_LABEL_MAX) return { list: [], error: `"${label}" is longer than ${CHECK_LABEL_MAX} letters.` };
    if ([...label].some(ch => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 || ch === "<" || ch === ">")) return { list: [], error: `"${label}" has a character a check name cannot have.` };
    if (labels.has(label.toLowerCase())) return { list: [], error: `Two checks are called "${label}".` };
    const reasons = [];
    for (const r of Array.isArray(c.reasons) ? c.reasons : []) {
      const rid = String(r ?? "");
      if (!REASON_ID.test(rid)) return { list: [], error: `"${rid}" is not a reason id.` };
      if (owner.has(rid) && owner.get(rid) !== id) return { list: [], error: `A reason can ask for one check only: "${rid}" is on "${owner.get(rid)}" and "${id}".` };
      if (!reasons.includes(rid)) { reasons.push(rid); owner.set(rid, id); }
    }
    ids.add(id); labels.add(label.toLowerCase());
    out.push({ id, label, ...(c.quick === true ? { quick: true } : {}), reasons });
  }
  return { list: out, error: "" };
}

// A new check's id from its name: "Zip works" → "zip-works", made unique among `taken`.
export function checkIdFor(label, taken = []) {
  const base = tidy(label).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "check";
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) if (!used.has(`${base}-${n}`)) return `${base}-${n}`;
}

// The check a flag reason asks for, in these checks; undefined when none does.
export function checkOfReason(reasonId, checks) {
  return (Array.isArray(checks) ? checks : []).find(c => Array.isArray(c.reasons) && c.reasons.includes(reasonId))?.id;
}
