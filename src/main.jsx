// The browser's entry point (index.html loads it): the typefaces and the page
// styles, then the whole app (App.jsx) mounted on #root. StrictMode runs each
// effect twice on mount under Vite's dev server (which the floor runs too), so
// an effect that does not clean up after itself shows at once.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Typefaces ship with the app (see index.css for why these two).
import '@fontsource/atkinson-hyperlegible/400.css'
import '@fontsource/atkinson-hyperlegible/700.css'
import '@fontsource/barlow-condensed/700.css'
import '@fontsource/barlow-condensed/800.css'
import '@fontsource/barlow-condensed/900.css'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
