import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import hubPlugin from './hub-plugin.js'
import basicSsl from '@vitejs/plugin-basic-ssl'

export default defineConfig({
  // basicSsl serves over HTTPS with a self-signed cert.
  // Required: browsers only allow getUserMedia (the camera) on a secure
  // origin, so scanning stations on the LAN cannot use http://<ip>:5173.
  plugins: [react(), basicSsl(), hubPlugin()],
  server: {
    host: true,          // bind all interfaces so other PCs on the network can reach it
    port: 5173,
    strictPort: true,    // fail loudly rather than drifting to 5174
    proxy: {
      '/api/anthropic': {
        target: 'https://api.anthropic.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/anthropic/, ''),
      }
    }
  }
})
