import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { AuthGate } from './auth/AuthGate'
import { ErrorBoundary } from './components/ErrorBoundary'
import { initI18n } from './i18n'
import { bootstrap, services } from './services'
import { apiEnabled } from './services/http/client'

bootstrap()
  // With an account, the print language is read after sign-in (AuthGate); locally it is known now.
  .then(() => (apiEnabled ? Promise.resolve([] as ('en' | 'hi')[]) : services.settings.get().then((s) => [s.printLanguage])))
  .then((extra) => initI18n(extra))
  .then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <AuthGate>
          <App />
        </AuthGate>
      </ErrorBoundary>
    </StrictMode>,
  )
})
