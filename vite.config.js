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
// printer set, the tickets go to the station's sticker printer.
export function printerEnv(env) {
  const printers = {}, flagPrinters = {}
  for (const [k, v] of Object.entries(env)) {
    let m = /^JERSEY_PRINTER_(.+)$/.exec(k); if (m && v) printers["st-" + m[1].toLowerCase()] = v
    m = /^JERSEY_FLAG_PRINTER_(.+)$/.exec(k); if (m && v) flagPrinters["st-" + m[1].toLowerCase()] = v
  }
  return { printer: env.JERSEY_PRINTER, printers, labelSize: env.JERSEY_LABEL_SIZE, flagPrinter: env.JERSEY_FLAG_PRINTER, flagPrinters, flagLabelSize: env.JERSEY_FLAG_LABEL_SIZE }
}
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")
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
      '/api/anthropic': {
        target: 'https://api.anthropic.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/anthropic/, ''),
        // One line per model call in the server log: status and how long the
        // answer took, so a slow or failed read can be traced after the fact.
        configure: (proxy) => {
          const stamp = () => new Date().toLocaleTimeString('en-CA', { hour12: false });
          proxy.on('proxyReq', (_proxyReq, req) => { req.__t0 = Date.now(); });
          proxy.on('proxyRes', (proxyRes, req) => console.log(`${stamp()} [anthropic] ${proxyRes.statusCode} in ${Date.now() - (req.__t0 || Date.now())} ms from ${req.socket?.remoteAddress || '?'}`));
          proxy.on('error', (err, req) => console.log(`${stamp()} [anthropic] FAILED ${err.code || err.message} after ${Date.now() - (req?.__t0 || Date.now())} ms`));
        },
      }
    }
  }
  }
})
