import 'fake-indexeddb/auto'
;(globalThis as { document?: unknown }).document ??= { documentElement: {} }
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Item, Settings, Voucher } from '@/services/types'

type Opts = { method?: string; body?: Record<string, unknown>; as?: { id: string; token: string }; account?: boolean }
const calls: { path: string; body?: Record<string, unknown>; as?: { id: string; token: string } }[] = []
let handler: (path: string, o: Opts) => unknown
let openId = 'A'
let S = 0
let A = '', B = '', GONE = '', GW = ''
const store = new Map<string, string>()
vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v) }, removeItem: (k: string) => { store.delete(k) }, clear: () => store.clear() })

vi.mock('@/auth/session', () => ({ useAuth: { getState: () => ({ user: { id: 'u1' }, workspace: { id: openId } }) } }))
vi.mock('@/services/http/client', () => {
  const api = vi.fn(async (path: string, o: Opts = {}) => {
    calls.push({ path, body: o.body, as: o.as })
    const r = handler(path, o)
    if (r instanceof Error) throw r
    return r
  })
  return { api, apiEnabled: true, onLicenseBlocked: () => () => undefined, tokens: { businessId: () => openId } }
})

const day = '2026-11-20'
const settings = { id: 's', gstEnabled: true, stateCode: '29', invoicePrefix: 'SI', overIssue: 'ALLOW_WARN', roundOffDefault: false } as unknown as Settings
const item = (id: string) => ({ id, name: id, code: id, hsn: '', batchNo: '', expiry: '', unit: 'PCS', mrp: 0, purchaseRate: 0, issueRate: 10000, gstPercent: 12, currentStock: 10, lowStockThreshold: 0 }) as Item
const bill = (itemId: string) => ({
  id: crypto.randomUUID(), clientCreatedAt: new Date().toISOString(), date: day, mode: 'TAX_INVOICE' as const, taxApplicable: true, rateBasis: 'SALE' as const,
  partyId: null, remarks: '', lines: [{ itemId, qty: 1, rate: 10000, discPct: 0 }], billDiscount: null, roundOff: false, payment: 'PAID_CASH' as const,
})

async function world() {
  vi.resetModules(); calls.length = 0; store.clear(); S++; A = `A${S}`; B = `B${S}`; GONE = `G${S}`; GW = `W${S}`; openId = A
  handler = () => ({})
  const { openMirror } = await import('./db')
  const sync = await import('./sync')
  const outbox = await import('./outbox')
  const devices = await import('./devices')
  const state = await import('./state')
  const bg = await import('./bgSender')
  const { AppError } = await import('@/services/errors')
  await (await import('@/i18n')).initI18n()
  const make = async (id: string) => { const m = await openMirror(id); await m.putMany('settings', [settings]); await m.putMany('items', [item('x')]); return m }
  const owner = (id: string) => ({ workspaceId: id, userId: 'u1' })
  return { openMirror, make, owner, AppError, ...sync, ...outbox, ...devices, ...state, ...bg }
}
let t: Awaited<ReturnType<typeof world>>
beforeEach(async () => { t = await world() })

describe('a business that is not open', () => {
  it('its waiting bills are sent with its own token and business id, not the open one\'s', async () => {
    const b = await t.make(B)
    await t.saveLocally(b, t.owner(B), bill('x'))
    await t.saveLocally(b, t.owner(B), bill('x'))
    const r = await t.flushOutbox(b, { id: B, token: 'tok-B' })
    expect(r.sent).toBe(2)
    const posts = calls.filter((c) => c.path === '/vouchers')
    expect(posts).toHaveLength(2)
    expect(posts.every((c) => c.as?.id === B && c.as.token === 'tok-B')).toBe(true)
  })

  it('counts are kept per business on the device, and a background copy never changes what the open business shows', async () => {
    const a = await t.make(A); t.attachMirror(a)
    const b = await t.make(B); b.background = true
    await t.saveLocally(a, t.owner(A), bill('x'))
    await t.saveLocally(b, t.owner(B), bill('x'))
    await t.saveLocally(b, t.owner(B), bill('x'))
    expect(t.useSync.getState().pendingIds).toHaveLength(1) // only A's, the open one
    expect(t.useDevices.getState().all).toMatchObject({ [A]: { pending: 1 }, [B]: { pending: 2 } })
    expect(t.unsentTotal(t.useDevices.getState().all)).toBe(3)
  })

  it('the background sender sends B while A is open, leaves A\'s own queue alone, and clears B\'s count', async () => {
    const a = await t.make(A); t.attachMirror(a)
    const b = await t.make(B); b.background = true
    await t.saveLocally(a, t.owner(A), bill('x'))
    await t.saveLocally(b, t.owner(B), bill('x'))
    b.close()
    handler = (path) => (path === '/auth/token' ? { accessToken: 'tok-B' } : {})
    expect(await t.sendOtherBusinesses()).toBe(1)
    expect(calls.find((c) => c.path === '/auth/token')?.body).toEqual({ businessId: B })
    const vouchers = calls.filter((c) => c.path === '/vouchers')
    expect(vouchers).toHaveLength(1)
    expect(vouchers[0]!.as).toEqual({ id: B, token: 'tok-B' }) // never A's bill, never as A
    expect(t.useDevices.getState().all[B]).toMatchObject({ pending: 0 })
    expect(t.useDevices.getState().all[A]).toMatchObject({ pending: 1 }) // A is sent by its own sync, not here
    expect(t.useSync.getState().pendingIds).toHaveLength(1)
  })

  it('no token (offline, or no longer a member): nothing is lost and nothing is sent', async () => {
    const b = await t.make(B); b.background = true
    await t.saveLocally(b, t.owner(B), bill('x'))
    b.close()
    handler = (path) => (path === '/auth/token' ? new t.AppError('networkError') : {})
    expect(await t.sendOtherBusinesses()).toBe(0)
    expect(calls.some((c) => c.path === '/vouchers')).toBe(false)
    const again = await t.openMirror(B)
    expect(await t.listOutbox(again)).toHaveLength(1)
    expect(t.useDevices.getState().all[B]).toMatchObject({ pending: 1 })
  })

  it('a bill the server refuses for that business (for example it was removed) is parked with the reason, not dropped', async () => {
    const b = await t.make(B); b.background = true
    const v = await t.saveLocally(b, t.owner(B), bill('x'))
    b.close()
    handler = (path) => (path === '/auth/token' ? { accessToken: 'tok-B' } : new t.AppError('notAMember'))
    await t.sendOtherBusinesses()
    const again = await t.openMirror(B)
    const q = await t.listOutbox(again)
    expect(q).toHaveLength(1)
    expect(q[0]).toMatchObject({ id: v.id, status: 'failed', error: { key: 'notAMember' } })
    expect(t.useDevices.getState().all[B]).toMatchObject({ pending: 0, failed: 1 })
  })

  it('bills made in A and in B each reach their own business, whatever order they are sent in', async () => {
    const a = await t.make(A); t.attachMirror(a)
    const b = await t.make(B); b.background = true
    const va = await t.saveLocally(a, t.owner(A), bill('x'))
    const vb = await t.saveLocally(b, t.owner(B), bill('x'))
    b.close()
    handler = (path) => (path === '/auth/token' ? { accessToken: 'tok-B' } : {})
    await t.sendOtherBusinesses()
    await t.flushOutbox(a) // A as the open business: no override, the session's own token
    const byBill = Object.fromEntries(calls.filter((c) => c.path === '/vouchers').map((c) => [c.body!.id as string, c.as?.id ?? 'open']))
    expect(byBill).toEqual({ [va.id]: 'open', [vb.id]: B })
  })
})

describe('what the device remembers', () => {
  it('a business that is gone is forgotten and its copy removed, unless bills are still waiting in it', async () => {
    const { pruneCopies } = await import('@/businesses/store')
    for (const x of [A, GONE, GW]) (await t.make(x)).close()
    t.useDevices.getState().put(A, { name: A }); t.useDevices.getState().put(GONE, { name: 'G' }); t.useDevices.getState().put(GW, { name: 'W', pending: 2 })
    await pruneCopies([A])
    expect(Object.keys(t.useDevices.getState().all).sort()).toEqual([A, GW].sort())
  })

  it('clear forgets everything (sign out)', () => {
    t.useDevices.getState().put(A, { name: A, pending: 1 })
    t.useDevices.getState().clear()
    expect(t.useDevices.getState().all).toEqual({})
    expect(t.hasCopy(A)).toBe(false)
  })
})
void ({} as Voucher)
