import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map<string, string>()
vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v) }, removeItem: (k: string) => { store.delete(k) }, clear: () => store.clear(), get length() { return store.size }, key: (i: number) => [...store.keys()][i] ?? null })

const calls: { path: string; body?: unknown }[] = []
let fail = false
let network = false
vi.mock('@/services/http/client', async (orig) => {
  const real = await orig<typeof import('@/services/http/client')>()
  return {
    ...real,
    apiEnabled: true,
    api: vi.fn(async (path: string, o?: { body?: { businessId: string } }) => {
      calls.push({ path, body: o?.body })
      if (network) { const { AppError } = await import('@/services/errors'); throw new AppError('networkError') }
      if (fail) throw new Error('down')
      return { user: { id: 'u1', email: 'a@b.c', name: 'A' }, workspace: { id: o!.body!.businessId, name: `Shop ${o!.body!.businessId}` }, role: 'OWNER', accessToken: 'tok-' + o!.body!.businessId, accessTokenExpiresAt: new Date(Date.now() + 600_000).toISOString(), refreshToken: 'r'.repeat(30) + o!.body!.businessId }
    }),
  }
})

import { useLicenseStore } from '@/license/store'
import { useDevices } from '@/offline/devices'
import { useSync } from '@/offline/state'
import { attachMirror, hasMirror } from '@/offline/sync'
import { tokens } from '@/services/http/client'
import { onTabSwitch, switchBusiness, tellTabs } from './switchBusiness'
import { useAuth } from './session'

const mirror = () => ({ close: vi.fn(), getMeta: vi.fn(), all: vi.fn(async () => []) }) as never

beforeEach(() => {
  calls.length = 0; fail = false; network = false; useDevices.getState().clear()
  localStorage.clear()
  tokens.set({ user: { id: 'u1', email: 'a@b.c', name: 'A' }, workspace: { id: 'A', name: 'Shop A' }, role: 'OWNER', accessToken: 't', accessTokenExpiresAt: new Date(Date.now() + 600_000).toISOString(), refreshToken: 'x'.repeat(30) } as never)
  useAuth.setState({ status: 'in', workspace: { id: 'A', name: 'Shop A' } })
})

describe('switching business', () => {
  it('asks the server with the current login, then the whole session points at the new business', async () => {
    await switchBusiness('B')
    expect(calls).toEqual([{ path: '/auth/switch', body: { businessId: 'B', refreshToken: 'x'.repeat(30) } }])
    expect(tokens.businessId()).toBe('B')
    expect(useAuth.getState().workspace).toEqual({ id: 'B', name: 'Shop B' })
    expect(tokens.refreshToken()).toBe('r'.repeat(30) + 'B') // the shared login moved to B
  })

  it('leaves no trace of the old business: device copy, queue counters, plan, download state', async () => {
    const m = mirror()
    attachMirror(m)
    useSync.setState({ pendingIds: ['bill-a1'], failedIds: ['bill-a2'], oldestWaiting: '2026-11-01', lastSyncAt: '2026-11-20', version: 9, clockSkewMs: 500 })
    useLicenseStore.setState({ license: { status: 'ACTIVE', planId: 'A-PLAN' } as never, workspaceId: 'A' })
    await switchBusiness('B')
    expect((m as unknown as { close: ReturnType<typeof vi.fn> }).close).toHaveBeenCalledTimes(1)
    expect(hasMirror()).toBe(false)
    expect(useSync.getState()).toMatchObject({ pendingIds: [], failedIds: [], oldestWaiting: null, lastSyncAt: null, version: 9, clockSkewMs: null, syncing: false })
    expect(useLicenseStore.getState().license).toBeUndefined()
    expect(useLicenseStore.getState().workspaceId).toBeUndefined()
  })

  it('does nothing when asked for the business that is already open', async () => {
    await switchBusiness('A')
    expect(calls).toEqual([])
  })

  it('if the server refuses, the old business stays exactly as it was', async () => {
    const m = mirror()
    attachMirror(m)
    await new Promise((r) => setTimeout(r, 5)) // attaching reads the queue in the background
    useSync.setState({ pendingIds: ['bill-a1'] })
    fail = true
    await expect(switchBusiness('B')).rejects.toThrow()
    expect(tokens.businessId()).toBe('A')
    expect(hasMirror()).toBe(true)
    expect(useSync.getState().pendingIds).toEqual(['bill-a1'])
    expect(useAuth.getState().workspace?.id).toBe('A')
  })

  it('20 switches back and forth end on the right business with nothing carried over', async () => {
    for (let i = 0; i < 20; i++) {
      attachMirror(mirror())
      useSync.setState({ pendingIds: [`bill-${i}`] })
      await switchBusiness(i % 2 === 0 ? 'B' : 'A')
      expect(useSync.getState().pendingIds).toEqual([])
      expect(hasMirror()).toBe(false)
    }
    expect(tokens.businessId()).toBe('A')
    expect(useAuth.getState().workspace?.id).toBe('A')
  })
})

describe('telling the other tabs', () => {
  it('another tab hears which business was opened (and this tab does not hear itself)', async () => {
    const heard: string[] = []
    const stop = onTabSwitch((m) => heard.push(m.workspaceId))
    const other = new BroadcastChannel('rapidbill-session') // a second tab
    const mine = new Promise<void>((r) => { other.onmessage = () => r() })
    tellTabs({ type: 'switched', workspaceId: 'B', name: 'Shop B' })
    await mine
    expect(heard).toEqual([]) // a channel never delivers to its own sender
    const gotIt = new Promise<void>((r) => { const s2 = onTabSwitch(() => { s2(); r() }) })
    other.postMessage({ type: 'switched', workspaceId: 'C', name: 'Shop C' })
    await gotIt
    expect(heard).toEqual(['C'])
    stop(); other.close()
  })
})

describe('switching with no connection', () => {
  it('a business that was opened on this device before opens from its copy; the server is told at the first chance', async () => {
    useDevices.getState().put('B', { name: 'Shop B' })
    network = true
    await switchBusiness('B')
    expect(tokens.businessId()).toBe('B')
    expect(useAuth.getState().workspace).toEqual({ id: 'B', name: 'Shop B' })
    expect(hasMirror()).toBe(false) // the old copy is closed, the screen opens B's own
  })

  it('a business never opened on this device cannot be opened offline, and nothing changes', async () => {
    network = true
    await expect(switchBusiness('C')).rejects.toMatchObject({ key: 'openOnceOnline' })
    expect(tokens.businessId()).toBe('A')
    expect(useAuth.getState().workspace?.id).toBe('A')
  })
})
