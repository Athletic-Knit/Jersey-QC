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
