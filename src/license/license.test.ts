import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LicenseView } from './store'

const DAY = 86_400_000
const at = (ms: number) => new Date(ms).toISOString()
const NOW = Date.UTC(2026, 10, 21, 10, 0, 0)
const view = (over: Partial<LicenseView> = {}): LicenseView => ({
  status: 'TRIAL', trialStartedAt: at(NOW - 5 * DAY), trialEndsAt: at(NOW + 10 * DAY), endsAt: at(NOW + 10 * DAY), daysLeft: 10, canWrite: true, serverTime: at(NOW), ...over,
})

describe('the license as of right now', () => {
  it('counts down on its own, rounding up, and never shows 0 days while it still runs', async () => {
    const { effective } = await import('./store')
    expect(effective(view(), 0, NOW)).toMatchObject({ status: 'TRIAL', daysLeft: 10, canWrite: true })
    expect(effective(view(), 0, NOW + 9.5 * DAY)).toMatchObject({ status: 'TRIAL', daysLeft: 1 })
    expect(effective(view(), 0, NOW + 9.999 * DAY)).toMatchObject({ daysLeft: 1, canWrite: true })
  })

  it('turns to expired the moment the end passes, with no connection needed', async () => {
    const { effective } = await import('./store')
    expect(effective(view(), 0, NOW + 10 * DAY)).toMatchObject({ status: 'EXPIRED', daysLeft: 0, canWrite: false })
    expect(effective(view(), 0, NOW + 30 * DAY)).toMatchObject({ status: 'EXPIRED', canWrite: false })
  })

  it('stays expired when the server said so, even if the device clock is set back', async () => {
    const { effective } = await import('./store')
    const l = view({ status: 'EXPIRED', canWrite: false, endsAt: at(NOW - DAY), daysLeft: 0 })
    expect(effective(l, 0, NOW - 100 * DAY)).toMatchObject({ status: 'EXPIRED', canWrite: false })
  })

  it('a wrong device clock does not move the end date: the server\'s time is the reference', async () => {
    const { effective } = await import('./store')
    const skew = 3 * DAY // the device runs 3 days behind the server
    expect(effective(view(), skew, NOW - 3 * DAY)).toMatchObject({ daysLeft: 10 })
    expect(effective(view(), skew, NOW + 8 * DAY)).toMatchObject({ status: 'EXPIRED' }) // 8 days on this clock = 11 real days
  })

  it('an active plan keeps its plan id and dates', async () => {
    const { effective } = await import('./store')
    const l = view({ status: 'ACTIVE', planId: 'Y1', licenseEndsAt: at(NOW + 365 * DAY), endsAt: at(NOW + 365 * DAY), daysLeft: 365 })
    expect(effective(l, 0, NOW)).toMatchObject({ status: 'ACTIVE', planId: 'Y1', daysLeft: 365, licenseEndsAt: l.licenseEndsAt })
  })

  it('knows nothing until it has been told: undefined', async () => {
    const { effective } = await import('./store')
    expect(effective(undefined, 0, NOW)).toBeUndefined()
  })
})

describe('whether changes are allowed (with an account)', () => {
  beforeEach(() => { vi.resetModules(); vi.stubEnv('VITE_API_URL', 'http://api.test') })
  afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers() })

  it('allowed while it runs, and when nothing is known yet; refused after the end', async () => {
    const { canWriteNow, useLicenseStore } = await import('./store')
    expect(canWriteNow()).toBe(true) // not loaded: never block on a guess
    useLicenseStore.setState({ license: view(), skewMs: 0 })
    vi.useFakeTimers({ now: NOW })
    expect(canWriteNow()).toBe(true)
    vi.setSystemTime(NOW + 11 * DAY)
    expect(canWriteNow()).toBe(false)
  })

  it('the message says "trial" for a trial and "plan" for a paid license that ended', async () => {
    const { lockedError, useLicenseStore } = await import('./store')
    useLicenseStore.setState({ license: view({ status: 'EXPIRED', canWrite: false }) })
    expect(lockedError().key).toBe('trialEnded')
    useLicenseStore.setState({ license: view({ status: 'EXPIRED', canWrite: false, licenseEndsAt: at(NOW - DAY) }) })
    expect(lockedError().key).toBe('licenseEnded')
  })

  it('remembers the last license for next time, per business, so it also shows with no connection', async () => {
    const mem = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) })
    const { useLicenseStore } = await import('./store')
    useLicenseStore.getState().hydrate('ws1')
    expect(useLicenseStore.getState().license).toBeUndefined()
    mem.set('rapidbill:license:ws1', JSON.stringify({ l: view(), skewMs: 1234 }))
    useLicenseStore.getState().hydrate('ws1')
    expect(useLicenseStore.getState().license?.status).toBe('TRIAL')
    expect(useLicenseStore.getState().skewMs).toBe(1234)
    useLicenseStore.getState().reset()
    expect(useLicenseStore.getState().license).toBeUndefined()
    vi.unstubAllGlobals()
  })
})

describe('in browser-only mode', () => {
  it('nothing is ever blocked', async () => {
    vi.resetModules()
    const { canWriteNow, useLicenseStore } = await import('./store')
    useLicenseStore.setState({ license: view({ status: 'EXPIRED', canWrite: false }) })
    expect(canWriteNow()).toBe(true)
  })
})
