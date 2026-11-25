// ── The floor's server (PRODUCTION, port 5173) ───────────────────────────────
// `npm run dev` with this file is what the stations and the supervisor board
// talk to: Vite serves the app over HTTPS to the network, the hub (hub-plugin.js)
// runs inside it under /api/hub with data/hub.json, and /api/anthropic is a
// proxy that adds the API key to each read. The development and testing
// servers use vite.config.stage.js instead, which reuses printerEnv and
// anthropicProxy from here; replay is never on here.
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import hubPlugin from './hub-plugin.js'
import basicSsl from '@vitejs/plugin-basic-ssl'
import process from 'node:process'

// Label printing (.env.local): JERSEY_PRINTER_STATION1 … a print queue on this PC
// for each station's stickers (a printer shared from the station PC works:
// \\AK-NB-164\ZDesigner ZD411-203dpi ZPL), JERSEY_PRINTER the queue for any
// station without one (default: the first Zebra queue on this PC), and
// JERSEY_LABEL_SIZE the roll ("1x0.5", inches, width x height). The flag
// tickets are on a 2 x 1 in roll: JERSEY_FLAG_PRINTER_STATION1 …,
// JERSEY_FLAG_PRINTER and JERSEY_FLAG_LABEL_SIZE the same way; with no flag
// printer set, the tickets go to the station's sticker printer. Each station's
// ticket roll may differ while the floor moves to the 2 x 4 in roll:
// JERSEY_FLAG_LABEL_SIZE_STATION1 … (else JERSEY_FLAG_LABEL_SIZE). A Zebra plugged
// into the server's own PC beats a JERSEY_PRINTER / JERSEY_FLAG_PRINTER shared
// from another PC (the owner, 20 Nov 2026; hubPrinter in hub-plugin.js).
// → the options hubPlugin takes.
export function printerEnv(env) {
  const printers = {}, flagPrinters = {}, flagLabelSizes = {}
  for (const [k, v] of Object.entries(env)) {
    let m = /^JERSEY_PRINTER_(.+)$/.exec(k); if (m && v) printers["st-" + m[1].toLowerCase()] = v
    m = /^JERSEY_FLAG_PRINTER_(.+)$/.exec(k); if (m && v) flagPrinters["st-" + m[1].toLowerCase()] = v
    m = /^JERSEY_FLAG_LABEL_SIZE_(.+)$/.exec(k); if (m && v) flagLabelSizes["st-" + m[1].toLowerCase()] = v
  }
  return { printer: env.JERSEY_PRINTER, printers, labelSize: env.JERSEY_LABEL_SIZE, flagPrinter: env.JERSEY_FLAG_PRINTER, flagPrinters, flagLabelSize: env.JERSEY_FLAG_LABEL_SIZE, flagLabelSizes }
}
// The read goes browser → this server → Anthropic. The API key stays HERE: the
// proxy adds it to each request, so the station's page never holds it
// (.env.local: CLAUDE_API_KEY=sk-ant-…). The old name VITE_CLAUDE_API_KEY is
// still read, so nothing breaks on a PC that has not renamed it, but a
// VITE_-named variable is also handed to every browser that opens the page:
// rename it to take the key off the page. A request that brings its own key
// (the test tools do) keeps it.
export function anthropicKey(env) { return env.CLAUDE_API_KEY || env.VITE_CLAUDE_API_KEY || "" }
// The proxy's settings for /api/anthropic; `log` writes one line per call.
export function anthropicProxy(env, { log = false } = {}) {
  const key = anthropicKey(env)
  const stamp = () => new Date().toLocaleTimeString('en-CA', { hour12: false })
  if (!key) console.log(`${stamp()} [anthropic] no API key in .env.local (CLAUDE_API_KEY): the stations cannot read jerseys`)
  return {
    target: 'https://api.anthropic.com',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api\/anthropic/, ''),
    configure: (proxy) => {
      proxy.on('proxyReq', (proxyReq, req) => { req.__t0 = Date.now(); if (key && !req.headers['x-api-key']) proxyReq.setHeader('x-api-key', key) })
      if (!log) return
      // One line per model call in the server log: status and how long the
      // answer took, so a slow or failed read can be traced after the fact.
      proxy.on('proxyRes', (proxyRes, req) => console.log(`${stamp()} [anthropic] ${proxyRes.statusCode} in ${Date.now() - (req.__t0 || Date.now())} ms from ${req.socket?.remoteAddress || '?'}`))
      proxy.on('error', (err, req) => console.log(`${stamp()} [anthropic] FAILED ${err.code || err.message} after ${Date.now() - (req?.__t0 || Date.now())} ms`))
    },
  }
}
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")   // every variable of .env.local, not only VITE_ ones (the printers, the key)
  return {
  // basicSsl serves over HTTPS with a self-signed cert.
  // Required: browsers only allow getUserMedia (the camera) on a secure
  // origin, so scanning stations on the LAN cannot use http://<ip>:5173.
  plugins: [react(), basicSsl(), hubPlugin(printerEnv(env))],
  server: {
    host: true,          // bind all interfaces so other PCs on the network can reach it
    port: 5173,
    strictPort: true,    // fail loudly rather than drifting to 5174
    proxy: {
      '/api/anthropic': anthropicProxy(env, { log: true }),
    }
  }
  }
})
