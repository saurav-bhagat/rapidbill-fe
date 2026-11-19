import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { initI18n } from './i18n'
import { bootstrap, services } from './services'

bootstrap()
  .then(() => services.settings.get())
  .then((s) => initI18n([s.printLanguage]))
  .then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  )
})
