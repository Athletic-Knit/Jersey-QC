// ── Files the server must never hand out (Fable's review of the admin panel, 26 Nov 2026) ──
// Vite serves every file under the project folder to anyone who asks. On the development and
// testing servers `fs: { strict: false }` also let /.env.local (the API key, the admin
// password) and any file on the PC through /@fs/; on every stage, production included,
// /data/hub.json (every order, with its photos), the admin change log and the server log were
// one address away. This plugin answers 404 for those before Vite looks, and it is the FIRST
// plugin in vite.config.js and vite.config.stage.js so nothing is served ahead of it.
//   /data/…        the hub's data file, unfinished orders, the admin file, backups, logs
//   /.env…, *.local  the API key and the passwords
//   /@fs/…         any file on the PC outside the project (nothing the app needs)
//   /.git/…, /.claude/…, /tools/…   the repository, session files, the server-PC scripts
// The hub's own routes (/api/hub/*, /api/admin/*) are not files and are not touched.
// The address is read as Vite's file server reads it: the raw path before ? or #, decoded, every
// backslash a slash and doubled slashes made one. Reading it through new URL() first let
// "/\data/hub.json" and "//data/hub.json" through: the URL parser took "data" for a host name,
// while Vite joined the raw path to the project folder and Windows found data\hub.json (Fable's
// final review, 26 Nov 2026).
export function blockedPath(url) {
  let raw = String(url || "/");
  const cut = raw.search(/[?#]/); if (cut >= 0) raw = raw.slice(0, cut);
  let p;
  try { p = decodeURIComponent(raw); } catch { return true; }   // a malformed address: refused
  p = ("/" + p).replace(/\\/g, "/").replace(/\/{2,}/g, "/").toLowerCase();
  if (p.startsWith("/api/")) return false;
  if (p.includes("/../") || p.endsWith("/..")) return true;
  // /@id/<anything>: Vite loads the module named there, a file on the PC too
  // ("/@id/C:/JerseyQC/data/hub.json"). A path on a drive is refused, and the rest is checked
  // like any address ("/@id/data/hub.json", "/@id/@fs/…").
  if (p.startsWith("/@id/")) { const rest = p.slice(4); if (/^\/[a-z]:/.test(rest)) return true; return blockedPath(rest); }
  return p.startsWith("/data/") || p === "/data"
    || p.startsWith("/@fs/")
    || p.startsWith("/.git") || p.startsWith("/.claude") || p.startsWith("/tools/")
    || /(^|\/)\.env(\.|$)/.test(p) || /\.local$/.test(p)
    || /\.(log|ps1|bat|vbs)$/.test(p);
}

export default function guardPlugin() {
  return {
    name: "jersey-guard",
    enforce: "pre",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!blockedPath(req.url || "/")) return next();
        res.statusCode = 404; res.setHeader("Content-Type", "text/plain"); res.setHeader("Cache-Control", "no-store");
        res.end("Not found");
      });
    },
  };
}
