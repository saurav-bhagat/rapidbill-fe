import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { loadLocale } from '@/i18n'
import { openMirror } from '@/offline/db'
import { useSync } from '@/offline/state'
import { startNotices } from '@/offline/notices'
import { attachMirror, hasSyncedBefore, startBackgroundSync, syncNow } from '@/offline/sync'
import { Button } from '@/components/ui/Button'
import { apiEnabled } from '@/services/http/client'
import { services } from '@/services'
import { AuthScreen } from './AuthScreen'
import { useAuth } from './session'

type Phase = 'opening' | 'downloading' | 'needsInternet' | 'storageBlocked' | 'ready'

/** Without a backend the app is single-user and local, so there is nothing to sign in to. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation('auth')
  const status = useAuth((s) => s.status)
  const workspaceId = useAuth((s) => s.workspace?.id)
  const init = useAuth((s) => s.init)
  const [phase, setPhase] = useState<Phase>('opening')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => { if (apiEnabled) void init() }, [init])

  // Once signed in: open this account's copy on the device, download it the first time, then keep it fresh.
  useEffect(() => {
    if (!apiEnabled) return
    if (status !== 'in' || !workspaceId) { setPhase('opening'); return }
    let live = true
    let stop: (() => void) | undefined
    ;(async () => {
      let mirror
      try { mirror = await openMirror(workspaceId) } catch { if (live) setPhase('storageBlocked'); return } // private browsing, or storage switched off
      attachMirror(mirror)
      if (!(await hasSyncedBefore(mirror))) {
        setPhase('downloading')
        await syncNow()
        if (!(await hasSyncedBefore(mirror))) { if (live) setPhase('needsInternet'); return }
      } else {
        void syncNow() // already have a copy: show it now and refresh in the background
      }
      try { await navigator.storage?.persist?.() } catch { /* ignore */ } // ask the browser not to evict the copy
      const s = await services.settings.get().catch(() => undefined)
      if (s) await loadLocale(s.printLanguage).catch(() => undefined)
      if (!live) return
      const stopNotices = startNotices()
      const stopSync = startBackgroundSync()
      stop = () => { stopSync(); stopNotices() }
      setPhase('ready')
    })()
    return () => { live = false; stop?.() }
  }, [status, workspaceId, attempt])

  const online = useSync((s) => s.online)
  if (!apiEnabled) return <>{children}</>
  if (status === 'out') return <AuthScreen />
  if (status === 'loading' || phase === 'opening') return <div className="p-6 text-ink-400">{t('loading')}</div>
  if (phase === 'downloading') return <div className="p-6 text-ink-600">{t('downloading')}</div>
  if (phase === 'storageBlocked') {
    return (
      <div className="mx-auto mt-24 max-w-md space-y-3 p-6">
        <h1 className="text-lg font-semibold">{t('storageBlocked.title')}</h1>
        <p className="text-ink-600">{t('storageBlocked.body')}</p>
      </div>
    )
  }
  if (phase === 'needsInternet') {
    return (
      <div className="mx-auto mt-24 max-w-md space-y-3 p-6">
        <h1 className="text-lg font-semibold">{t('needsInternet.title')}</h1>
        <p className="text-ink-600">{online ? t('needsInternet.retryHint') : t('needsInternet.body')}</p>
        <Button variant="primary" onClick={() => { setPhase('opening'); setAttempt((n) => n + 1) }}>{t('needsInternet.retry')}</Button>
      </div>
    )
  }
  return <>{children}</>
}
