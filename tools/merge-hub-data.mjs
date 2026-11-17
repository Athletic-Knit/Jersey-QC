// Puts several copies of the hub's data file back into one.
// Two PCs ran a server out of one OneDrive folder and both wrote data\hub.json,
// so the history ended up spread over the file itself, OneDrive's conflict
// copies (hub-AK-NB-165-216.json) and a copy the hub set aside when it could
// not read the file (hub.json.unreadable-…). Nothing was lost; this makes the
// one file that has all of it.
//   node tools/merge-hub-data.mjs --out data/hub.json  old1.json old2.json …
// Later files win where two copies disagree about the same thing; a photo is
// kept from whichever copy has it. Files that are missing or do not parse are
// skipped with a line saying so. The output is written to a temporary file
// and renamed, never half-written.
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const newer = (a, b, field) => ((Number(b?.[field]) || 0) >= (Number(a?.[field]) || 0) ? b : a);

export function mergeHub(states) {
  const out = { stations: {}, rosters: {}, ledger: {}, boxAnswers: [] };
  for (const s of (states || []).filter(x => x && typeof x === "object")) {
    for (const [k, v] of Object.entries(s)) if (!(k in out)) out[k] = v;          // anything this tool does not know about: kept
    for (const [id, st] of Object.entries(s.stations || {})) out.stations[id] = out.stations[id] ? newer(out.stations[id], st, "updatedAt") : st;
    for (const [id, r] of Object.entries(s.rosters || {})) out.rosters[id] = r;
    for (const [day, d] of Object.entries(s.ledger || {})) {
      const t = (out.ledger[day] ||= { events: {}, orders: {} });
      for (const [k, ev] of Object.entries(d.events || {})) {
        const old = t.events[k];
        t.events[k] = !old ? ev : {
          ...old, ...ev,
          ...(ev.photo || old.photo ? { photo: ev.photo || old.photo } : {}),
          ...((ev.damagePhotos?.length || 0) >= (old.damagePhotos?.length || 0) ? {} : { damagePhotos: old.damagePhotos }),
          ...(ev.resolution || !old.resolution ? {} : { resolution: old.resolution }),
        };
      }
      for (const [k, o] of Object.entries(d.orders || {})) t.orders[k] = t.orders[k] ? newer(t.orders[k], o, "lastSeen") : o;
    }
    out.boxAnswers.push(...(Array.isArray(s.boxAnswers) ? s.boxAnswers : []));
  }
  const seen = new Set();
  out.boxAnswers = out.boxAnswers
    .filter(a => { const k = JSON.stringify([a?.at, a?.station, a?.order, a?.bin, a?.box]); if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => (Number(a?.at) || 0) - (Number(b?.at) || 0)).slice(-3000);
  out.ledger = Object.fromEntries(Object.entries(out.ledger).sort(([a], [b]) => a.localeCompare(b)));
  return out;
}

export const summary = s => {
  const days = Object.keys(s.ledger || {}).sort();
  const events = days.reduce((t, d) => t + Object.keys(s.ledger[d].events || {}).length, 0);
  const orders = days.reduce((t, d) => t + Object.keys(s.ledger[d].orders || {}).length, 0);
  return `${days.length} days${days.length ? ` (${days[0]} to ${days[days.length - 1]})` : ""}, ${orders} orders, ${events} scans, ${Object.keys(s.stations || {}).length} stations, ${(s.boxAnswers || []).length} box answers`;
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), i = args.indexOf("--out");
  const outFile = i >= 0 ? args[i + 1] : "";
  const inputs = args.filter((a, n) => n !== i && n !== i + 1);
  if (!outFile || !inputs.length) { console.log("Usage: node tools/merge-hub-data.mjs --out <file> <copy> [<copy> …]"); process.exit(2); }
  const states = [];
  for (const f of inputs) {
    try { const s = JSON.parse(fs.readFileSync(f, "utf8")); states.push(s); console.log(`  read   ${path.basename(f)}: ${summary(s)}`); }
    catch (e) { console.log(`  SKIPPED ${path.basename(f)}: ${e.code === "ENOENT" ? "not there" : "could not be read (" + String(e.message).slice(0, 60) + ")"}`); }
  }
  if (!states.length) { console.log("None of the copies could be read: nothing written."); process.exit(1); }
  const merged = mergeHub(states);
  fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
  const tmp = outFile + ".merge.tmp";
  fs.writeFileSync(tmp, JSON.stringify(merged));
  fs.renameSync(tmp, outFile);
  console.log(`  wrote  ${outFile}: ${summary(merged)}`);
}
