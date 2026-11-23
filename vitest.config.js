// The test runner's own configuration (vitest reads this file instead of
// vite.config.js). Kept apart from the servers' configuration on purpose:
//   - JSX is compiled the modern way (no `import React` needed), as the
//     server's React plugin does, so the station screen (App.jsx) can be
//     rendered in tests (src/__tests__/app-smoke.test.jsx);
//   - no server plugins are loaded: vite.config.js builds the hub plugin, which
//     opened data/hub.json every time the tests ran.
// Each test file runs in Node unless it asks for a browser itself
// (`// @vitest-environment jsdom` on its first line).
import { defineConfig } from 'vitest/config'

// JSX is set for both compilers: which one the test runner uses depends on the
// Vite version it runs on (esbuild before Vite 8, oxc from Vite 8); the other line is ignored.
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  oxc: { jsx: { runtime: 'automatic' } },
})
