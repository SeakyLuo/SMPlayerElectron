import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import './index.css'
import App from './App'
import { AppRouter } from './AppRouter'
import { DesktopLyricsApp } from './DesktopLyricsApp'

const isDesktopLyricsWindow =
  new URLSearchParams(window.location.search).get('desktopLyrics') === '1'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isDesktopLyricsWindow ? (
      <DesktopLyricsApp />
    ) : (
      <AppRouter>
        <App />
      </AppRouter>
    )}
  </StrictMode>,
)
