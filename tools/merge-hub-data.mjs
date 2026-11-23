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
// Unfinished orders and open boxes (19-20 Nov 2026) came after this tool: they
// are put together by id, the newest change winning, and every other part of
// the file it does not merge itself is kept from the latest copy that has it
// (setup-production.ps1 passes the live file last), so nothing newer is lost
// (code review, 23 Nov 2026). The whole orders sit beside the data file in
// <name>-orders\ (hub-orders\ for hub.json): a merge in place leaves them
// there; written to another folder, they are copied across.
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const newer = (a, b, field) => ((Number(b?.[field]) || 0) >= (Number(a?.[field]) || 0) ? b : a);
// When an unfinished order or an open box last changed: an open box has no
// updatedAt, its "at" is when it was left open and takenBy.at when the next
// order took it.
const stamp = x => Math.max(Number(x?.updatedAt) || 0, Number(x?.at) || 0, Number(x?.takenBy?.at) || 0);
const BY_ID = ["unfinished", "openBoxes"];
const MERGED = ["stations", "rosters", "ledger", "boxAnswers", ...BY_ID];

export function mergeHub(states) {
  const out = { stations: {}, rosters: {}, ledger: {}, boxAnswers: [] };
  for (const s of (states || []).filter(x => x && typeof x === "object")) {
    for (const [k, v] of Object.entries(s)) if (!MERGED.includes(k)) out[k] = v;   // anything this tool does not merge: the latest copy's
    for (const k of BY_ID) {
      if (!s[k] || typeof s[k] !== "object") continue;
      const pool = (out[k] ||= {});
      for (const [id, x] of Object.entries(s[k])) pool[id] = pool[id] && stamp(pool[id]) > stamp(x) ? pool[id] : x;   // a tie: the later copy
    }
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
  const more = [["unfinished", "unfinished orders"], ["openBoxes", "open boxes"]].filter(([k]) => s[k] && Object.keys(s[k]).length).map(([k, w]) => `, ${Object.keys(s[k]).length} ${w}`).join("");
  return `${days.length} days${days.length ? ` (${days[0]} to ${days[days.length - 1]})` : ""}, ${orders} orders, ${events} scans, ${Object.keys(s.stations || {}).length} stations, ${(s.boxAnswers || []).length} box answers${more}`;
};

// The folder of whole orders the hub keeps beside a data file (createHub in
// hub-plugin.js): data\hub.json -> data\hub-orders.
export const ordersDirOf = file => path.join(path.dirname(path.resolve(file)), path.basename(file, path.extname(file)) + "-orders");

// Brings the whole orders of the copies to the merged file's folder. Only a
// copy's own folder counts (a conflict copy or a set-aside copy has none: the
// hub never wrote one under that name). A file already there is replaced only
// by a newer one. Returns the lines to print.
export function bringOrders(inputs, outFile) {
  const dest = ordersDirOf(outFile), lines = [];
  const sources = [...new Set(inputs.map(ordersDirOf))].filter(d => fs.existsSync(d));
  if (!sources.length) return [`  hub-orders: no folder of unfinished orders beside the copies; nothing to bring over`];
  for (const src of sources) {
    const files = fs.readdirSync(src).filter(f => !f.endsWith(".tmp") && fs.statSync(path.join(src, f)).isFile());
    if (src === dest) { lines.push(`  hub-orders: merged in place, the ${files.length} file${files.length === 1 ? "" : "s"} in ${src} stay where they are`); continue; }
    fs.mkdirSync(dest, { recursive: true });
    let copied = 0, kept = 0;
    for (const f of files) {
      const from = path.join(src, f), to = path.join(dest, f);
      if (fs.existsSync(to) && fs.statSync(to).mtimeMs >= fs.statSync(from).mtimeMs) { kept++; continue; }
      fs.copyFileSync(from, to); copied++;
    }
    lines.push(`  hub-orders: ${copied} file${copied === 1 ? "" : "s"} copied from ${src} to ${dest}${kept ? ` (${kept} already there as new or newer, kept)` : ""}`);
  }
  return lines;
}

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
  for (const l of bringOrders(inputs, outFile)) console.log(l);
}
