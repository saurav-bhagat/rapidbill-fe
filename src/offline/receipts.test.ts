import 'fake-indexeddb/auto'
;(globalThis as { document?: unknown }).document ??= { documentElement: {} }
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Item, Party, Settings } from '@/services/types'

type Opts = { method?: string; body?: Record<string, unknown>; query?: Record<string, string | number | undefined> }
let handler: (path: string, o: Opts) => unknown
const sent: { path: string; body?: Record<string, unknown> }[] = []

vi.mock('@/auth/session', () => ({ useAuth: { getState: () => ({ user: { id: 'u1' }, workspace: { id: 'ws' } }) } }))
vi.mock('@/services/http/client', () => {
  const api = vi.fn(async (path: string, o: Opts = {}) => {
    sent.push({ path, body: o.body })
    const r = handler(path, o)
    if (r instanceof Error) throw r
    return r
  })
  return { api, apiAll: async (path: string, query: Opts['query']) => { const r = (await api(path, { query })) as unknown; return Array.isArray(r) ? r : (r as { data: unknown[] }).data }, apiEnabled: true, onLicenseBlocked: () => () => undefined }
})

const settings = { id: 's', gstEnabled: true, stateCode: '29', invoicePrefix: 'SI', overIssue: 'ALLOW_WARN', roundOffDefault: false } as unknown as Settings
const party = (id: string, over: Partial<Party> = {}) => ({ id, name: id, type: 'CUSTOMER', gstin: '', stateCode: '29', address: '', phone: '', balance: 0, ...over }) as Party
const item = (id: string) => ({ id, name: id, code: id, hsn: '', batchNo: '', expiry: '', unit: 'PCS', mrp: 0, purchaseRate: 0, issueRate: 10000, gstPercent: 12, currentStock: 10, lowStockThreshold: 0 }) as Item
const emptyFeed = { epoch: 0, cursor: 'c', hasMore: false, items: [], parties: [], settings: null, vouchers: [], deleted: { parties: [] }, numbering: {} }
const input = (over: Record<string, unknown> = {}) => ({ partyId: 'p1', date: '2026-11-20', amount: 4000, mode: 'CASH' as const, note: '', ...over })

let n = 0
async function setup() {
  vi.resetModules(); sent.length = 0
  handler = () => emptyFeed
  const { openMirror } = await import('./db')
  const sync = await import('./sync')
  const state = await import('./state')
  const outbox = await import('./outbox')
  const receipts = await import('./receipts')
  const records = await import('./records')
  const backup = await import('./backup')
  const { AppError } = await import('@/services/errors')
  await (await import('@/i18n')).initI18n()
  const m = await openMirror(`r-${++n}`)
  sync.attachMirror(m)
  await m.putMany('settings', [settings])
  await m.putMany('items', [item('a')])
  await m.putMany('parties', [party('p1', { balance: 10000 }), party('p2')])
  return { m, owner: { workspaceId: 'ws', userId: 'u1' }, AppError, ...sync, ...state, ...outbox, ...receipts, ...records, ...backup }
}
beforeEach(() => { sent.length = 0 })

describe('money received while offline', () => {
  it('lowers the balance here at once and queues the receipt, with no number yet', async () => {
    const t = await setup()
    const r = await t.createReceiptLocally(t.m, t.owner, input(), 'r1')
    expect(r).toMatchObject({ id: 'r1', number: '', amount: 4000, status: 'ACTIVE', waiting: true, partyName: 'p1' })
    expect((await t.m.get<Party>('parties', 'p1'))!.balance).toBe(6000)
    const q = await t.listOutbox(t.m)
    expect(q).toHaveLength(1)
    expect(q[0]).toMatchObject({ kind: 'receipt', id: 'r1', status: 'pending', payload: { id: 'r1', partyId: 'p1', amount: 4000, mode: 'CASH' } })
    expect(t.useSync.getState().pendingIds).toEqual(['r1'])
    expect(await t.waitingReceipts(t.m, 'p1')).toHaveLength(1)
    expect(await t.waitingReceipts(t.m, 'p2')).toHaveLength(0)
  })

  it('a party that is not on this device is refused and nothing is queued', async () => {
    const t = await setup()
    await expect(t.createReceiptLocally(t.m, t.owner, input({ partyId: 'nobody' }))).rejects.toMatchObject({ key: 'partyNotFound' })
    expect(await t.listOutbox(t.m)).toHaveLength(0)
  })

  it('is sent as a receipt with the id chosen here, then leaves the queue', async () => {
    const t = await setup()
    await t.createReceiptLocally(t.m, t.owner, input(), 'r1', '2026-11-20T10:00:00.000Z')
    handler = (path) => (path === '/receipts' ? { id: 'r1', number: 'RC-2627-0001' } : emptyFeed)
    const out = await t.flushOutbox(t.m)
    expect(out).toMatchObject({ sent: 1, unreachable: false })
    expect(sent.find((s) => s.path === '/receipts')!.body).toEqual({ partyId: 'p1', date: '2026-11-20', amount: 4000, mode: 'CASH', note: '', id: 'r1', clientCreatedAt: '2026-11-20T10:00:00.000Z' })
    expect(await t.listOutbox(t.m)).toHaveLength(0)
  })

  it('stays queued when the server cannot be reached, and is parked when the server refuses it', async () => {
    const t = await setup()
    await t.createReceiptLocally(t.m, t.owner, input(), 'r1')
    handler = () => new t.AppError('networkError')
    expect(await t.flushOutbox(t.m)).toMatchObject({ sent: 0, unreachable: true })
    expect((await t.listOutbox(t.m))[0]).toMatchObject({ status: 'pending' })
    handler = () => new t.AppError('partyNotFound')
    await t.flushOutbox(t.m)
    expect((await t.listOutbox(t.m))[0]).toMatchObject({ status: 'failed', error: { key: 'partyNotFound' } })
  })

  it('cancelling one that has not been sent puts the money back and drops it from the queue', async () => {
    const t = await setup()
    await t.createReceiptLocally(t.m, t.owner, input(), 'r1')
    const c = await t.cancelWaitingReceipt(t.m, 'r1')
    expect(c).toMatchObject({ id: 'r1', status: 'CANCELLED' })
    expect((await t.m.get<Party>('parties', 'p1'))!.balance).toBe(10000)
    expect(await t.listOutbox(t.m)).toHaveLength(0)
    expect(await t.cancelWaitingReceipt(t.m, 'r1')).toBeUndefined() // not waiting any more: it would be cancelled on the server
  })

  it('throwing away a refused one puts the money back too', async () => {
    const t = await setup()
    await t.createReceiptLocally(t.m, t.owner, input({ amount: 2500 }), 'r1')
    await t.discardReceipt(t.m, 'r1')
    expect((await t.m.get<Party>('parties', 'p1'))!.balance).toBe(10000)
    expect(await t.listOutbox(t.m)).toHaveLength(0)
  })

  it('goes after the party it was made for, and that party cannot be thrown away while money waits for it', async () => {
    const t = await setup()
    await t.createPartyLocally(t.m, t.owner, { name: 'New Co', type: 'CUSTOMER', gstin: '', stateCode: '29', address: '', phone: '', balance: 0 }, 'np')
    await t.createReceiptLocally(t.m, t.owner, input({ partyId: 'np' }), 'r2')
    const q = await t.listOutbox(t.m)
    expect(q.map((e) => e.id)).toEqual(['np', 'r2'])
    await expect(t.removeWaitingParty(t.m, 'np')).rejects.toMatchObject({ key: 'partyInUse' })
    await t.discardReceipt(t.m, 'r2')
    expect(await t.removeWaitingParty(t.m, 'np')).toBe(true)
  })

  it('is in the backup file and comes back from it', async () => {
    const t = await setup()
    await t.createReceiptLocally(t.m, t.owner, input(), 'r1')
    const b = await t.buildBackup(t.m, 'ws')
    expect(b.entries).toHaveLength(1)
    expect(t.backupToCsv(b)).toContain('Receipt')
    expect(t.parseBackup(JSON.stringify(b)).entries).toHaveLength(1)
    await t.m.batch([{ store: 'outbox', remove: ['r1'] }])
    const back = await t.restoreBackup(t.m, 'ws', b)
    expect(back.restored).toBe(1)
    expect((await t.listOutbox(t.m))[0]).toMatchObject({ kind: 'receipt', id: 'r1', status: 'pending' })
  })
})
