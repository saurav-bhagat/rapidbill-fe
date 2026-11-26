import 'fake-indexeddb/auto'
;(globalThis as { document?: unknown }).document ??= { documentElement: {} }
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Item, Party, Settings, Voucher } from '@/services/types'

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

let n = 0
async function setup() {
  vi.resetModules(); sent.length = 0
  handler = () => emptyFeed
  const { openMirror } = await import('./db')
  const sync = await import('./sync')
  const state = await import('./state')
  const outbox = await import('./outbox')
  const receipts = await import('./receipts')
  const returns = await import('./returns')
  const records = await import('./records')
  const backup = await import('./backup')
  const { AppError } = await import('@/services/errors')
  await (await import('@/i18n')).initI18n()
  const m = await openMirror(`ret-${++n}`)
  sync.attachMirror(m)
  await m.putMany('settings', [settings])
  await m.putMany('items', [item('a')])
  await m.putMany('parties', [party('p1', { balance: 10000 }), party('p2')])
  return { m, owner: { workspaceId: 'ws', userId: 'u1' }, AppError, ...sync, ...state, ...outbox, ...receipts, ...returns, ...records, ...backup }
}
beforeEach(() => { sent.length = 0 })

const sold = (over: Partial<Voucher> = {}) => ({
  id: 'b1', workspaceId: 'ws', createdBy: 'u1', createdAt: '', updatedAt: '', number: 'SI-2627-0007', date: '2026-11-20', mode: 'TAX_INVOICE', taxApplicable: true, rateBasis: 'SALE',
  partyId: 'p1', partyName: 'p1', partyGstin: '', partyStateCode: '29', partyAddress: '', remarks: '', billDiscount: null,
  lines: [{ itemId: 'a', name: 'A', code: 'A', hsn: '', batchNo: '', expiry: '', unit: 'PCS', qty: 4, per: 1, baseUnit: 'PCS', stockQty: 4, mrp: 0, rate: 10000, discPct: 0, gstPct: 12, taxable: 40000, tax: 4800, total: 44800 }],
  totals: { itemCount: 1, totalQty: 4, gross: 40000, lineDiscount: 0, billDiscount: 0, taxable: 40000, cgst: 2400, sgst: 2400, igst: 0, roundOff: 0, grandTotal: 44800 },
  payment: 'CREDIT', status: 'ACTIVE', ...over,
}) as Voucher
const back = (over: Record<string, unknown> = {}) => ({ invoiceId: 'b1', date: '2026-11-21', lines: [{ line: 0, qty: 1 }], settlement: 'ADJUST' as const, reason: '', ...over })

describe('goods returned while offline', () => {
  it('puts stock back, lowers the balance and the bill\'s returnable count here at once, and queues the return', async () => {
    const t = await setup()
    await t.m.putMany('vouchers', [sold()])
    const r = await t.createReturnLocally(t.m, t.owner, back(), 'r1')
    expect(r).toMatchObject({ id: 'r1', number: '', waiting: true, invoiceNo: 'SI-2627-0007', totals: { grandTotal: 11200 } })
    expect((await t.m.get<Item>('items', 'a'))!.currentStock).toBe(11)
    expect((await t.m.get<Party>('parties', 'p1'))!.balance).toBe(10000 - 11200)
    expect((await t.m.get<Voucher>('vouchers', 'b1'))!.returned).toEqual([1])
    expect((await t.listOutbox(t.m))[0]).toMatchObject({ kind: 'return', id: 'r1', status: 'pending', payload: { invoiceId: 'b1', settlement: 'ADJUST' } })
    expect(await t.waitingReturns(t.m, 'b1')).toHaveLength(1)
  })
  it('paying it back leaves the balance alone', async () => {
    const t = await setup()
    await t.m.putMany('vouchers', [sold()])
    await t.createReturnLocally(t.m, t.owner, back({ settlement: 'CASH' }), 'r1')
    expect((await t.m.get<Party>('parties', 'p1'))!.balance).toBe(10000)
  })
  it('refuses the same things the server refuses, and queues nothing', async () => {
    const t = await setup()
    await t.m.putMany('vouchers', [sold({ returned: [3] }), sold({ id: 'b2', partyId: null }), sold({ id: 'b3', status: 'CANCELLED' })])
    await expect(t.createReturnLocally(t.m, t.owner, back({ lines: [{ line: 0, qty: 2 }] }))).rejects.toMatchObject({ key: 'returnTooMany', params: { left: 1 } })
    await expect(t.createReturnLocally(t.m, t.owner, back({ date: '2026-11-19' }))).rejects.toMatchObject({ key: 'returnBeforeBill' })
    await expect(t.createReturnLocally(t.m, t.owner, back({ invoiceId: 'b2' }))).rejects.toMatchObject({ key: 'returnNoParty' })
    await expect(t.createReturnLocally(t.m, t.owner, back({ invoiceId: 'b3' }))).rejects.toMatchObject({ key: 'returnBillCancelled' })
    await expect(t.createReturnLocally(t.m, t.owner, back({ invoiceId: 'nope' }))).rejects.toMatchObject({ key: 'voucherNotFound' })
    expect(await t.listOutbox(t.m)).toHaveLength(0)
  })
  it('is sent as a return with the id chosen here', async () => {
    const t = await setup()
    await t.m.putMany('vouchers', [sold()])
    await t.createReturnLocally(t.m, t.owner, back(), 'r1', '2026-11-21T10:00:00.000Z')
    handler = (path) => (path === '/returns' ? { id: 'r1', number: 'CN-2627-0001' } : emptyFeed)
    expect(await t.flushOutbox(t.m)).toMatchObject({ sent: 1 })
    expect(sent.find((s) => s.path === '/returns')!.body).toEqual({ invoiceId: 'b1', date: '2026-11-21', lines: [{ line: 0, qty: 1 }], settlement: 'ADJUST', reason: '', id: 'r1', clientCreatedAt: '2026-11-21T10:00:00.000Z' })
    expect(await t.listOutbox(t.m)).toHaveLength(0)
  })
  it('cancelling or throwing away one that was not sent takes everything back', async () => {
    const t = await setup()
    await t.m.putMany('vouchers', [sold()])
    await t.createReturnLocally(t.m, t.owner, back({ lines: [{ line: 0, qty: 2 }] }), 'r1')
    expect(await t.cancelWaitingReturn(t.m, 'r1')).toMatchObject({ status: 'CANCELLED' })
    expect((await t.m.get<Item>('items', 'a'))!.currentStock).toBe(10)
    expect((await t.m.get<Party>('parties', 'p1'))!.balance).toBe(10000)
    expect((await t.m.get<Voucher>('vouchers', 'b1'))!.returned).toEqual([0])
    await t.createReturnLocally(t.m, t.owner, back(), 'r2')
    await t.discardReturn(t.m, 'r2')
    expect((await t.m.get<Item>('items', 'a'))!.currentStock).toBe(10)
    expect(await t.listOutbox(t.m)).toHaveLength(0)
    expect(await t.cancelWaitingReturn(t.m, 'r2')).toBeUndefined()
  })
  it('a waiting bill with a waiting return cannot be changed, cancelled or thrown away', async () => {
    const t = await setup()
    const v = await t.saveLocally(t.m, t.owner, { id: 'b9', clientCreatedAt: new Date().toISOString(), date: '2026-11-20', mode: 'TAX_INVOICE', taxApplicable: true, rateBasis: 'SALE', partyId: 'p1', remarks: '', lines: [{ itemId: 'a', qty: 2, rate: 10000, discPct: 0 }], billDiscount: null, roundOff: false, payment: 'CREDIT' })
    await t.createReturnLocally(t.m, t.owner, back({ invoiceId: v.id }), 'r9')
    expect((await t.listOutbox(t.m)).map((e) => e.id)).toEqual(['b9', 'r9'])
    await expect(t.editWaiting(t.m, t.owner, v.id, { date: '2026-11-20', mode: 'TAX_INVOICE', taxApplicable: true, rateBasis: 'SALE', partyId: 'p1', remarks: '', lines: [{ itemId: 'a', qty: 5, rate: 10000, discPct: 0 }], billDiscount: null, roundOff: false, payment: 'CREDIT' })).rejects.toMatchObject({ key: 'billHasReturns' })
    await expect(t.cancelWaiting(t.m, t.owner, v.id)).rejects.toMatchObject({ key: 'billHasReturns' })
    await expect(t.discardEntry(t.m, t.owner, v.id)).rejects.toMatchObject({ key: 'billHasReturns' })
  })
  it('is in the backup file and comes back from it', async () => {
    const t = await setup()
    await t.m.putMany('vouchers', [sold()])
    await t.createReturnLocally(t.m, t.owner, back(), 'r1')
    const b = await t.buildBackup(t.m, 'ws')
    expect(t.backupToCsv(b)).toContain('Return')
    expect(t.parseBackup(JSON.stringify(b)).entries).toHaveLength(1)
    await t.m.batch([{ store: 'outbox', remove: ['r1'] }])
    expect((await t.restoreBackup(t.m, 'ws', b)).restored).toBe(1)
  })
})
