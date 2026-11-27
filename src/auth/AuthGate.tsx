import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { loadLocale } from '@/i18n'
import { openMirror } from '@/offline/db'
import { useSync } from '@/offline/state'
import { startLicenseRefresh, useLicenseStore } from '@/license/store'
import { startNotices } from '@/offline/notices'
import { startBackgroundSender } from '@/offline/bgSender'
import { useDevices } from '@/offline/devices'
import { attachMirror, hasSyncedBefore, startBackgroundSync, syncNow } from '@/offline/sync'
import { Button } from '@/components/ui/Button'
import { SupportLine } from '@/components/SupportLine'
import { apiEnabled } from '@/services/http/client'
import { services } from '@/services'
import { Landing } from '@/landing/Landing'
import { usePath } from '@/landing/nav'
import { AuthScreen } from './AuthScreen'
import { Onboarding } from './Onboarding'
import { useAuth } from './session'
import { TabGuard } from './TabGuard'
import { SwitchingScreen } from '@/businesses/SwitchingScreen'
import { useBusinesses } from '@/businesses/store'
import './switchBusiness'

type Phase = 'opening' | 'downloading' | 'needsInternet' | 'storageBlocked' | 'ready'

/** Without a backend the app is single-user and local, so there is nothing to sign in to. */
/** The gate, plus the transition screen that covers the change while another business opens. */
export function AuthGate({ children }: { children: ReactNode }) {
  return <><GateInner>{children}</GateInner><SwitchingScreen /></>
}

function GateInner({ children }: { children: ReactNode }) {
  const { t } = useTranslation('auth')
  const status = useAuth((s) => s.status)
  const onboarding = useAuth((s) => s.onboarding)
  const workspaceId = useAuth((s) => s.workspace?.id)
  const init = useAuth((s) => s.init)
  const [rawPhase, setPhase] = useState<Phase>('opening')
  // which business the 'ready' phase belongs to: after a switch the new business is not ready until its own copy is open
  const [readyFor, setReadyFor] = useState<string>()
  const phase: Phase = rawPhase === 'ready' && readyFor !== workspaceId ? 'opening' : rawPhase
  const [attempt, setAttempt] = useState(0)

  useEffect(() => { if (apiEnabled) void init() }, [init])

  // Once signed in: open this account's copy on the device, download it the first time, then keep it fresh.
  useEffect(() => {
    if (!apiEnabled) return
    setPhase('opening')
    if (status !== 'in' || !workspaceId) return
    let live = true
    let stop: (() => void) | undefined
    ;(async () => {
      let mirror
      try { mirror = await openMirror(workspaceId) } catch { if (live) setPhase('storageBlocked'); return } // private browsing, or storage switched off
      attachMirror(mirror)
      if (!(await hasSyncedBefore(mirror))) {
        setPhase('downloading')
        await syncNow()
        if (!(await hasSyncedBefore(mirror))) { useBusinesses.setState({ switching: undefined }); if (live) setPhase('needsInternet'); return }
      } else {
        void syncNow() // already have a copy: show it now and refresh in the background
      }
      try { await navigator.storage?.persist?.() } catch { /* ignore */ } // ask the browser not to evict the copy
      const s = await services.settings.get().catch(() => undefined)
      if (s) await loadLocale(s.printLanguage).catch(() => undefined)
      if (!live) return
      useDevices.getState().put(workspaceId, { name: useAuth.getState().workspace?.name ?? '' }) // this business now has a copy on this device
      const stopNotices = startNotices()
      const stopSender = startBackgroundSender()
      const stopSync = startBackgroundSync()
      useLicenseStore.getState().hydrate(workspaceId) // what we knew last time, even with no connection
      const stopLicense = startLicenseRefresh()
      stop = () => { stopSync(); stopNotices(); stopLicense(); stopSender() }
      setReadyFor(workspaceId)
      setPhase('ready')
      useBusinesses.setState({ switching: undefined }) // the new business is open: take the transition screen away
    })()
    return () => { live = false; stop?.() }
  }, [status, workspaceId, attempt])

  const online = useSync((s) => s.online)
  const path = usePath()
  if (!apiEnabled) return <>{children}</>
  if (status === 'out') return path === '/' ? <Landing /> : <AuthScreen initialMode={path === '/signup' ? 'signup' : 'login'} />
  if (status === 'loading' || phase === 'opening') return <div className="p-6 text-ink-400">{t('loading')}</div>
  if (phase === 'downloading') return <div className="p-6 text-ink-600">{t('downloading')}</div>
  if (phase === 'storageBlocked') {
    return (
      <div className="mx-auto mt-24 max-w-md space-y-3 p-6">
        <h1 className="text-lg font-medium">{t('storageBlocked.title')}</h1>
        <p className="text-ink-600">{t('storageBlocked.body')}</p>
        <SupportLine />
      </div>
    )
  }
  if (phase === 'needsInternet') {
    return (
      <div className="mx-auto mt-24 max-w-md space-y-3 p-6">
        <h1 className="text-lg font-medium">{t('needsInternet.title')}</h1>
        <p className="text-ink-600">{online ? t('needsInternet.retryHint') : t('needsInternet.body')}</p>
        <Button variant="primary" onClick={() => { setPhase('opening'); setAttempt((n) => n + 1) }}>{t('needsInternet.retry')}</Button>
        <SupportLine />
      </div>
    )
  }
  if (onboarding) return <Onboarding />
  // keyed by business: every screen, form and draft of the previous business is discarded on a switch
  return <><TabGuard /><Fragment key={workspaceId}>{children}</Fragment></>
}
