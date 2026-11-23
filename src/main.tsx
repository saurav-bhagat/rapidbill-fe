import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { AuthGate } from './auth/AuthGate'
import { ErrorBoundary } from './components/ErrorBoundary'
import i18n, { initI18n } from './i18n'
import { takeFlash } from './lib/flash'
import { toast } from './store/toast'
import { registerServiceWorker } from './offline/register'
import { Toasts } from './components/ui/Toasts'
import { installGlobalErrorHandlers } from './lib/notify'
import { captureRef } from './earn/refLink'
import { initTextScale } from './lib/textScale'
import { bootstrap, services } from './services'
import { apiEnabled } from './services/http/client'

initTextScale()
captureRef() // a referral code in the link is kept until the person signs up
installGlobalErrorHandlers()
registerServiceWorker()
bootstrap()
  // With an account, the print language is read after sign-in (AuthGate); locally it is known now.
  .then(() => (apiEnabled ? Promise.resolve([] as ('en' | 'hi')[]) : services.settings.get().then((s) => [s.printLanguage])))
  .then((extra) => initI18n(extra))
  .then(() => { const f = takeFlash(); if (f) toast.success(i18n.t(`data.${f}`, { ns: 'settings' })) })
  .then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <AuthGate>
          <App />
        </AuthGate>
        <Toasts />
      </ErrorBoundary>
    </StrictMode>,
  )
})
