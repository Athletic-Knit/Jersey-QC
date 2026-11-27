// ── What the server may hand out (Fable's reviews of the admin panel, 26 Nov 2026) ──────────
// Vite serves every file under the project folder to anyone who asks: the hub's data file
// (every order, with its photos), the admin change log, the server log, and .env.local (the API
// key, the admin password). A list of what to block could not keep up with what Windows and Vite
// accept for the same file: "/./data/…", "/api/../data/…", a ".." inside the query, NTFS stream
// names ("/data::$INDEX_ALLOCATION/…"), 8.3 short names ("/ENV~1.LOC" is .env.local, and gets
// past Vite's own deny list too), "/@id/" followed by any of these. So this is an ALLOW-list:
// only what the app loads is served, and anything else gets 404 before Vite looks. It is the
// FIRST plugin in vite.config.js and vite.config.stage.js so nothing is served ahead of it.
//
// What the app loads (the station, the board and the admin panel, measured on 5174):
//   /, /index.html, /?view=…              the page
//   /src/…                                the app's own modules and CSS
//   /node_modules/…                       Vite's client and the fonts (@fontsource); of the dot
//                                         folders only .vite (production's prebundled packages)
//   /.vite-development/…, /.vite-testing/…, /.vite-dev/…   the stages' prebundled packages
//   /@vite/…, /@react-refresh, /@id/__x00__…   Vite's own modules
//   /api/…                                the hub, the admin panel, the AI proxy (not files)
//   the files in public/ (favicon.svg, icons.svg, sim/…)
// And never, whatever the folder: "..", a ":" or "~1"-style short name, a name ending in "." or
// a space, .env…, *.local, .log, .ps1, .bat, .vbs.
import fs from "node:fs";
import path from "node:path";

const TOP = new Set(["", "index.html", "src", "node_modules", "@vite", "@react-refresh", "api"]);
const STAGE_CACHE = /^\.vite-(dev|development|testing)$/;
export const PUBLIC_DEFAULT = ["favicon.svg", "icons.svg", "sim"];
const BAD_SEGMENT = /[:\0]|~\d|[. ]$/;   // NTFS streams, 8.3 short names, Windows dropping a trailing dot or space

export function blockedPath(url, { publicNames = PUBLIC_DEFAULT } = {}, depth = 0) {
  // The path and the query are split on the RAW address, then each decoded: an encoded "?"
  // (%3f) is part of the path, never the start of the query.
  const raw = String(url || "/"), cut = raw.search(/[?#]/);
  let pathPart, query;
  try { pathPart = decodeURIComponent(cut < 0 ? raw : raw.slice(0, cut)); query = cut < 0 ? "" : decodeURIComponent(raw.slice(cut + 1)); }
  catch { return true; }   // a malformed address: refused
  pathPart = pathPart.replace(/\\/g, "/"); query = query.replace(/\\/g, "/");
  // ".." anywhere, the query too: Vite normalises the whole address, query included.
  const dots = /(^|[/?&=#])\.\.([/?&=#]|$)/;
  if (dots.test(pathPart) || dots.test(query)) return true;
  if (/[?#]/.test(pathPart)) return true;   // an encoded ? or # in a path: nothing the app asks for
  const segs = pathPart.toLowerCase().split("/").filter(s => s && s !== ".");
  if (segs.some(s => BAD_SEGMENT.test(s))) return true;
  if (segs[0] === "@id") {
    // Vite's virtual modules (\0 ids, written __x00__): served by Vite's plugins, not from disk.
    // Their ids pass the same segment rules above, so no drive path or short name rides in one.
    if (/^__x00__|^__vite/.test(segs[1] || "")) return false;
    return depth > 3 || blockedPath("/" + segs.slice(1).join("/"), { publicNames }, depth + 1);   // the rest, by the same rules
  }
  const top = segs[0] || "";
  if (!TOP.has(top) && !STAGE_CACHE.test(top) && !publicNames.includes(top)) return true;
  if (top === "api") return false;
  const p = "/" + segs.join("/");
  if (top === "node_modules" && segs[1]?.startsWith(".") && segs[1] !== ".vite") return true;
  return /(^|\/)\.env(\.|$)/.test(p) || /\.local$/.test(p) || /\.(log|ps1|bat|vbs)$/.test(p);
}

export default function guardPlugin() {
  // The names in public/ as the server starts (a file added there later needs a restart).
  let publicNames = PUBLIC_DEFAULT;
  return {
    name: "jersey-guard",
    enforce: "pre",
    configResolved(config) {
      try { publicNames = fs.readdirSync(config.publicDir || path.resolve("public")).map(n => n.toLowerCase()).filter(n => !n.startsWith(".")); } catch { /* no public folder: the defaults */ }
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!blockedPath(req.url || "/", { publicNames })) return next();
        res.statusCode = 404; res.setHeader("Content-Type", "text/plain"); res.setHeader("Cache-Control", "no-store");
        res.end("Not found");
      });
    },
  };
}
