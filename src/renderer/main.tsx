import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { OfflineBanner } from './components/OfflineBanner'
import { LanguageProvider } from './i18n/LanguageProvider'
import { registerServiceWorker } from './pwa/register'
import { ThemeProvider } from './theme/ThemeProvider'
import './theme/tokens.css'
import './index.css'

const container = document.getElementById('root')
if (!container) {
  throw new Error('Root element #root not found')
}

registerServiceWorker()

createRoot(container).render(
  <StrictMode>
    <LanguageProvider>
      <ThemeProvider>
        <OfflineBanner />
        <App />
      </ThemeProvider>
    </LanguageProvider>
  </StrictMode>
)
