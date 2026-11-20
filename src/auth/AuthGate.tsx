import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { loadLocale } from '@/i18n'
import { apiEnabled } from '@/services/http/client'
import { services } from '@/services'
import { AuthScreen } from './AuthScreen'
import { useAuth } from './session'

/** Without a backend the app is single-user and local, so there is nothing to sign in to. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation('auth')
  const status = useAuth((s) => s.status)
  const init = useAuth((s) => s.init)
  const [ready, setReady] = useState(false)

  useEffect(() => { if (apiEnabled) void init() }, [init])
  // Once signed in, make sure the invoice print language is loaded before any screen needs it.
  useEffect(() => {
    if (!apiEnabled) return
    if (status !== 'in') { setReady(false); return }
    let live = true
    services.settings.get().then((s) => loadLocale(s.printLanguage)).catch(() => undefined).finally(() => { if (live) setReady(true) })
    return () => { live = false }
  }, [status])

  if (!apiEnabled) return <>{children}</>
  if (status === 'out') return <AuthScreen />
  if (status === 'loading' || !ready) return <div className="p-6 text-ink-400">{t('loading')}</div>
  return <>{children}</>
}
