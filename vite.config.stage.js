// The DEVELOPMENT and TESTING servers (the owner, 20 Nov 2026: one double-click
// each, "Development server.bat" and "Testing server.bat", see tools\stage.ps1).
// Production keeps vite.config.js (port 5173, started by the "Jersey QC server"
// task). Each stage runs from its own folder with its own data file, so trying
// something on one can never touch the floor's orders:
//   development  port 5174  data\hub-test.json   (the development folder)
//   testing      port 5175  data\hub.json        (C:\JerseyQC-testing)
// Both are HTTPS and open to the network like production, so a station PC can
// try them (the camera needs HTTPS off this PC). JQC_STAGE picks the stage.
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import hubPlugin from './hub-plugin.js'
import replayPlugin from './replay-plugin.js'
import adminPlugin from './admin-plugin.js'
import guardPlugin from './guard-plugin.js'
import aiProxyPlugin from './ai-proxy.js'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { printerEnv } from './vite.config.js'   // printerEnv: the printers and rolls, per station too (JERSEY_FLAG_LABEL_SIZE_STATION1 …)

export const STAGES = {
  development: { port: 5174, data: 'hub-test.json' },
  testing:     { port: 5175, data: 'hub.json' },
}
const here = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ mode }) => {
  const name = String(process.env.JQC_STAGE || '').toLowerCase()
  const stage = STAGES[name]
  if (!stage) throw new Error(`JQC_STAGE must be ${Object.keys(STAGES).join(' or ')} (it is "${name}")`)
  const env = loadEnv(mode, here, '')
  // The replay is on for development and testing, never on the floor (the owner,
  // 20 Nov 2026: on the testing server without a special link). It reads floor
  // orders from the floor's data file, read only: C:\JerseyQC\data\hub.json, or
  // the files named in JQC_REPLAY_FROM (;-separated) in .env.local.
  process.env.VITE_REPLAY = '1'
  const dataFile = path.join(here, 'data', stage.data)
  const floor = String(env.JQC_REPLAY_FROM || 'C:\\JerseyQC\\data\\hub.json').split(';').map(s => s.trim()).filter(Boolean)
  const replayFiles = [...floor.map(file => ({ label: 'floor', file })), { label: `this ${name} server`, file: dataFile }]
  // No printing on development or testing unless asked for (code review, 23 Nov
  // 2026): their .env.local is copied from production, so JERSEY_PRINTER names
  // the floor's Zebra, and a test order printed real labels on it. With
  // JQC_STAGE_PRINT=1 in .env.local they print as production does; otherwise
  // every print is refused and the station shows why.
  const printOn = String(env.JQC_STAGE_PRINT || '').trim() === '1'
  const noPrint = async () => { throw new Error(`Printing is off on the ${name} server (JQC_STAGE_PRINT=1 in .env.local turns it on)`) }
  return {
    root: here,
    cacheDir: path.join(here, `.vite-${name}`),
    plugins: [guardPlugin(), react(), basicSsl(), hubPlugin({ file: dataFile, ...printerEnv(env), ...(printOn ? {} : { print: noPrint }) }), replayPlugin({ files: replayFiles }), adminPlugin({ dataFile, stage: name, port: stage.port, env, root: here }), aiProxyPlugin({ env, dataFile })],
    server: {
      host: true, port: stage.port, strictPort: true,
    },
  }
})
