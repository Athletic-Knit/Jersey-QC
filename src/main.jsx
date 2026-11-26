// The browser's entry point (index.html loads it): the typefaces and the page
// styles, then the whole app (App.jsx) mounted on #root. StrictMode runs each
// effect twice on mount under Vite's dev server (which the floor runs too), so
// an effect that does not clean up after itself shows at once.
import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
// Typefaces ship with the app (see index.css for why these two).
import '@fontsource/atkinson-hyperlegible/400.css'
import '@fontsource/atkinson-hyperlegible/700.css'
import '@fontsource/barlow-condensed/700.css'
import '@fontsource/barlow-condensed/800.css'
import '@fontsource/barlow-condensed/900.css'
import './index.css'
import App from './App.jsx'
import { applyTheme } from './lib/theme.js'

// ?view=admin opens the developers' admin panel instead of the station (admin-plugin.js on
// the server). It is loaded only then, so a station never downloads it. The theme is set
// on <html> before anything draws, so the page never flashes the other one; the station
// keeps its dark colours until it is converted (later phase).
const admin = new URLSearchParams(window.location.search).get('view') === 'admin'
const AdminPanel = admin ? lazy(() => import('./admin/AdminPanel.jsx')) : null
if (admin) applyTheme()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {admin ? <Suspense fallback={null}><AdminPanel /></Suspense> : <App />}
  </StrictMode>,
)
