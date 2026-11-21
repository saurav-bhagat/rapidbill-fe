import { useEffect, useMemo, useState } from 'react'
import { create } from 'zustand'
import { AppError } from '@/services/errors'
import { api, apiEnabled, onLicenseBlocked } from '@/services/http/client'

/** What `GET /license` returns. */
export interface LicenseView {
  status: 'TRIAL' | 'ACTIVE' | 'EXPIRED'
  planId?: string
  trialStartedAt: string
  trialEndsAt: string
  licenseEndsAt?: string
  endsAt: string
  daysLeft: number
  canWrite: boolean
  graceUntil?: string
  serverTime: string
}

interface LicenseState {
  license?: LicenseView
  /** Server time minus this device's time when it was read, so a wrong device clock does not move the end date. */
  skewMs: number
  workspaceId?: string
  refresh(): Promise<void>
  /** Show what was saved last time straight away (also offline). */
  hydrate(workspaceId: string): void
  reset(): void
}

const key = (ws: string) => `rapidbill:license:${ws}`
const DAY = 86_400_000

export const useLicenseStore = create<LicenseState>((set, get) => ({
  skewMs: 0,
  async refresh() {
    if (!apiEnabled) return
    try {
      const l = await api<LicenseView>('/license')
      const skewMs = Date.parse(l.serverTime) - Date.now()
      set({ license: l, skewMs })
      const ws = get().workspaceId
      if (ws) { try { localStorage.setItem(key(ws), JSON.stringify({ l, skewMs })) } catch { /* ignore */ } }
    } catch (e) {
      if (!(e instanceof AppError)) throw e // offline or a server fault: keep showing what we last knew
    }
  },
  hydrate(workspaceId) {
    set({ workspaceId })
    try {
      const raw = JSON.parse(localStorage.getItem(key(workspaceId)) ?? 'null') as { l: LicenseView; skewMs: number } | null
      if (raw?.l) set({ license: raw.l, skewMs: raw.skewMs ?? 0 })
    } catch { /* nothing saved yet */ }
  },
  reset() { set({ license: undefined, skewMs: 0, workspaceId: undefined }) },
}))

export interface Effective {
  status: LicenseView['status']
  planId?: string
  daysLeft: number
  endsAt: string
  trialEndsAt: string
  licenseEndsAt?: string
  trialStartedAt: string
  canWrite: boolean
}

/** The license as of right now. Counts down on its own and turns EXPIRED the moment the end passes, even with no connection. */
export function effective(l: LicenseView | undefined, skewMs: number, nowMs = Date.now()): Effective | undefined {
  if (!l) return undefined
  const now = nowMs + skewMs
  const end = Date.parse(l.endsAt)
  const base = { planId: l.planId, endsAt: l.endsAt, trialEndsAt: l.trialEndsAt, licenseEndsAt: l.licenseEndsAt, trialStartedAt: l.trialStartedAt }
  if (l.status !== 'EXPIRED' && now < end) return { ...base, status: l.status, daysLeft: Math.max(1, Math.ceil((end - now) / DAY)), canWrite: true }
  return { ...base, status: 'EXPIRED', daysLeft: 0, canWrite: false }
}

/** For the UI. Re-reads every minute so the day count and the lock change without a reload. */
export function useLicense(): Effective | undefined {
  const license = useLicenseStore((s) => s.license)
  const skew = useLicenseStore((s) => s.skewMs)
  const [tick, setTick] = useState(0)
  useEffect(() => { const id = setInterval(() => setTick((n) => n + 1), 60_000); return () => clearInterval(id) }, [])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => effective(license, skew), [license, skew, tick])
}

/** For services: may bills, items and parties be changed? True when the state is not known (never blocks on a guess) and in browser-only mode. */
export function canWriteNow(): boolean {
  if (!apiEnabled) return true
  const s = useLicenseStore.getState()
  return effective(s.license, s.skewMs)?.canWrite ?? true
}

/** Which message to give when writing is not allowed: the trial or a paid plan that ended. */
export function lockedError(): AppError {
  const s = useLicenseStore.getState()
  return new AppError(s.license?.licenseEndsAt ? 'licenseEnded' : 'trialEnded')
}

/** Keep the license fresh: now, when the tab is shown, when the connection is back, every 15 minutes, and whenever the server says "license". */
export function startLicenseRefresh(): () => void {
  const go = () => { void useLicenseStore.getState().refresh() }
  go()
  const id = setInterval(go, 15 * 60_000)
  const visible = () => { if (document.visibilityState === 'visible') go() }
  document.addEventListener('visibilitychange', visible)
  window.addEventListener('online', go)
  const stopBlocked = onLicenseBlocked(go)
  return () => { clearInterval(id); document.removeEventListener('visibilitychange', visible); window.removeEventListener('online', go); stopBlocked() }
}
