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
  return { api, apiAll: async (path: string, query: Opts['query']) => { const r = (await api(path, { query })) as unknown; return Array.isArray(r) ? r : (r as { data: unknown[] }).data } }
})

const day = '2026-11-20'
const settings = { id: 's', gstEnabled: true, stateCode: '29', invoicePrefix: 'SI', overIssue: 'ALLOW_WARN', roundOffDefault: false } as unknown as Settings
const item = (id: string, over: Partial<Item> = {}) => ({ id, name: id.toUpperCase(), code: id.toUpperCase(), hsn: '', batchNo: '', expiry: '', unit: 'PCS', mrp: 0, purchaseRate: 0, issueRate: 10000, gstPercent: 12, currentStock: 10, lowStockThreshold: 0, ...over }) as Item
const party = (id: string, over: Partial<Party> = {}) => ({ id, name: id, type: 'CUSTOMER', gstin: '', stateCode: '29', address: '', phone: '', balance: 0, ...over }) as Party
const bill = (lines: [string, number][], over: Record<string, unknown> = {}) => ({
  id: crypto.randomUUID(), clientCreatedAt: new Date().toISOString(), date: day, mode: 'TAX_INVOICE' as const, taxApplicable: true, rateBasis: 'SALE' as const,
  partyId: null, remarks: '', lines: lines.map(([itemId, qty]) => ({ itemId, qty, rate: 10000, discPct: 0 })), billDiscount: null, roundOff: false, payment: 'PAID_CASH' as const, ...over,
})
const emptyFeed = { epoch: 0, cursor: 'c', hasMore: false, items: [], parties: [], settings: null, vouchers: [], deleted: { parties: [] }, numbering: {} }

let n = 0
async function setup(opts: { numbering?: Record<string, number> } = {}) {
  vi.resetModules(); sent.length = 0
  handler = () => emptyFeed
  const { openMirror } = await import('./db')
  const sync = await import('./sync')
  const state = await import('./state')
  const outbox = await import('./outbox')
  const { AppError } = await import('@/services/errors')
  await (await import('@/i18n')).initI18n()
  const m = await openMirror(`b-${++n}`)
  sync.attachMirror(m)
  await m.putMany('settings', [settings])
  await m.putMany('items', [item('a'), item('b', { currentStock: 0 })])
  await m.putMany('parties', [party('p1'), party('p2', { stateCode: '27' })])
  if (opts.numbering) await m.setMeta('numbering', opts.numbering)
  const owner = { workspaceId: 'ws', userId: 'u1' }
  const net = () => new AppError('networkError')
  return { m, owner, net, AppError, ...sync, ...state, ...outbox }
}

describe('saving a bill on this device', () => {
  it('takes the number on from the highest the server told us about, even with no recent bills', async () => {
    const t = await setup({ numbering: { 'SI-2026': 41 } })
    const v = await t.saveLocally(t.m, t.owner, bill([['a', 2]]))
    expect(v.number).toBe('SI-2026-0042')
    const v2 = await t.saveLocally(t.m, t.owner, bill([['a', 1]]))
    expect(v2.number).toBe('SI-2026-0043')
    expect(await t.localNextNumber(t.m, t.owner, day)).toBe('SI-2026-0044')
  })

  it('saves the bill, its stock change, the party credit and its queue entry together', async () => {
    const t = await setup()
    const v = await t.saveLocally(t.m, t.owner, bill([['a', 3]], { partyId: 'p1', payment: 'CREDIT' }))
    expect(v.totals.grandTotal).toBeGreaterThan(0)
    expect((await t.m.get<Item>('items', 'a'))!.currentStock).toBe(7)
    expect((await t.m.get<Party>('parties', 'p1'))!.balance).toBe(v.totals.grandTotal)
    expect((await t.m.get<Voucher>('vouchers', v.id))!.number).toBe(v.number)
    const q = await t.listOutbox(t.m)
    expect(q).toHaveLength(1)
    expect(q[0]).toMatchObject({ id: v.id, status: 'pending', number: v.number, payload: { id: v.id, number: v.number } })
    expect(t.useSync.getState().pendingIds).toEqual([v.id])
  })

  it('lets an item with no stock be billed (stock goes negative)', async () => {
    const t = await setup()
    await t.saveLocally(t.m, t.owner, bill([['b', 4]]))
    expect((await t.m.get<Item>('items', 'b'))!.currentStock).toBe(-4)
  })

  it('a refused bill leaves nothing behind: no stock change, no queue entry', async () => {
    const t = await setup()
    await expect(t.saveLocally(t.m, t.owner, bill([]))).rejects.toMatchObject({ key: 'noItems' })
    await expect(t.saveLocally(t.m, t.owner, bill([['a', 1]], { partyId: 'ghost' }))).rejects.toMatchObject({ key: 'partyGone' })
    expect((await t.m.get<Item>('items', 'a'))!.currentStock).toBe(10)
    expect(await t.listOutbox(t.m)).toHaveLength(0)
  })

  it('a typed number that is already used is refused', async () => {
    const t = await setup()
    const first = await t.saveLocally(t.m, t.owner, bill([['a', 1]]))
    await expect(t.saveLocally(t.m, t.owner, bill([['a', 1]], { number: first.number }))).rejects.toMatchObject({ key: 'duplicateNumber' })
    expect(await t.listOutbox(t.m)).toHaveLength(1)
  })
})

describe('sending waiting bills', () => {
  it('sends them oldest first with the id, number and time chosen here, and clears each once the server has it', async () => {
    const t = await setup({ numbering: { 'SI-2026': 9 } })
    const v1 = await t.saveLocally(t.m, t.owner, bill([['a', 1]]))
    const v2 = await t.saveLocally(t.m, t.owner, bill([['a', 1]]))
    handler = () => ({})
    expect(await t.flushOutbox(t.m)).toEqual({ sent: 2, unreachable: false })
    expect(sent.filter((s) => s.path === '/vouchers').map((s) => s.body!.number)).toEqual([v1.number, v2.number])
    expect(sent[0]!.body).toMatchObject({ id: v1.id, clientCreatedAt: expect.any(String) })
    expect(await t.listOutbox(t.m)).toHaveLength(0)
    expect(t.useSync.getState().pendingIds).toEqual([])
  })

  it('no connection: stops, keeps everything, and does not call a bill refused', async () => {
    const t = await setup()
    await t.saveLocally(t.m, t.owner, bill([['a', 1]]))
    await t.saveLocally(t.m, t.owner, bill([['a', 1]]))
    handler = () => t.net()
    expect(await t.flushOutbox(t.m)).toMatchObject({ sent: 0, unreachable: true, why: 'networkError' })
    expect((await t.listOutbox(t.m)).map((e) => e.status)).toEqual(['pending', 'pending'])
  })

  it('a server error or rate limit is temporary: bills stay waiting', async () => {
    const t = await setup()
    await t.saveLocally(t.m, t.owner, bill([['a', 1]]))
    handler = () => new t.AppError('serverError')
    await t.flushOutbox(t.m)
    handler = () => new t.AppError('rateLimited')
    await t.flushOutbox(t.m)
    expect((await t.listOutbox(t.m))[0]!.status).toBe('pending')
  })

  it('a bill the server refuses is parked with its reason, and the ones after it still go', async () => {
    const t = await setup()
    const v1 = await t.saveLocally(t.m, t.owner, bill([['a', 1]]))
    const v2 = await t.saveLocally(t.m, t.owner, bill([['a', 1]]))
    handler = (_p, o) => (o.body?.id === v1.id ? new t.AppError('duplicateNumber', { number: v1.number }) : {})
    expect(await t.flushOutbox(t.m)).toEqual({ sent: 1, unreachable: false })
    const q = await t.listOutbox(t.m)
    expect(q.map((e) => [e.id, e.status])).toEqual([[v1.id, 'failed']])
    expect(q[0]!.error).toMatchObject({ key: 'duplicateNumber' })
    expect(v2.id).not.toBe(v1.id)
    expect(t.useSync.getState().failedIds).toEqual([v1.id])
  })

  it('a parked bill can be sent again, renumbered, or discarded (stock and credit given back)', async () => {
    const t = await setup({ numbering: { 'SI-2026': 5 } })
    const v = await t.saveLocally(t.m, t.owner, bill([['a', 4]], { partyId: 'p1', payment: 'CREDIT' }))
    handler = () => new t.AppError('duplicateNumber', { number: v.number })
    await t.flushOutbox(t.m)
    await t.retryEntry(t.m, v.id)
    expect((await t.listOutbox(t.m))[0]).toMatchObject({ status: 'pending' })

    await t.flushOutbox(t.m) // refused again
    await t.m.setMeta('numbering', { 'SI-2026': 20 }) // the server's count moved on
    await t.renumberEntry(t.m, t.owner, v.id)
    const e = (await t.listOutbox(t.m))[0]!
    expect(e).toMatchObject({ status: 'pending', number: 'SI-2026-0021', payload: { number: 'SI-2026-0021' } })
    expect((await t.m.get<Voucher>('vouchers', v.id))!.number).toBe('SI-2026-0021')

    await t.discardEntry(t.m, t.owner, v.id)
    expect(await t.listOutbox(t.m)).toHaveLength(0)
    expect(await t.m.get('vouchers', v.id)).toBeUndefined()
    expect((await t.m.get<Item>('items', 'a'))!.currentStock).toBe(10)
    expect((await t.m.get<Party>('parties', 'p1'))!.balance).toBe(0)
  })
})

describe('telling the person what happened', () => {
  const messages = async () => (await import('@/store/toast')).useToasts.getState().toasts.map((x) => `${x.kind}:${x.message}`)
  const clear = async () => (await import('@/store/toast')).useToasts.getState().clear()

  it('says so when waiting bills were sent, once', async () => {
    const t = await setup()
    t.setSync({ online: false })
    await t.saveLocally(t.m, t.owner, bill([['a', 1]]))
    await clear()
    handler = (p) => (p === '/vouchers' ? {} : emptyFeed)
    await t.syncNow()
    expect((await messages()).filter((m) => m === 'success:1 item sent to the server.')).toHaveLength(1)
  })

  it('says so when the server turns something down', async () => {
    const t = await setup()
    await t.saveLocally(t.m, t.owner, bill([['a', 1]]))
    await clear()
    handler = (p) => (p === '/vouchers' ? new t.AppError('duplicateNumber', { number: 'x' }) : emptyFeed)
    await t.syncNow()
    expect((await messages()).some((m) => m.startsWith('error:The server did not accept 1 item'))).toBe(true)
  })

  it('a server fault is reported as trouble, not as being offline, and only once while it lasts', async () => {
    const t = await setup()
    t.setSync({ online: true })
    await t.saveLocally(t.m, t.owner, bill([['a', 1]]))
    await clear()
    handler = (p) => (p === '/vouchers' ? new t.AppError('serverError') : emptyFeed)
    await t.syncNow(); await t.syncNow(); await t.syncNow()
    const m = await messages()
    expect(m.filter((x) => x.includes('The server is having trouble'))).toHaveLength(1)
    expect(m.some((x) => x.includes('You are offline'))).toBe(false)
    expect(t.useSync.getState().online).toBe(true)
  })

  it('says when the connection is lost and when it is back', async () => {
    const t = await setup()
    t.setSync({ online: true })
    const stop = (await import('./notices')).startNotices()
    await clear()
    t.setSync({ online: false })
    t.setSync({ online: true })
    stop()
    expect(await messages()).toEqual([expect.stringMatching(/^warning:You are offline/), 'success:Back online.'])
  })
})

describe('syncing with bills waiting', () => {
  it('does not download while bills are still waiting (it would put back the stock they took), then downloads once they are sent', async () => {
    const t = await setup()
    await t.saveLocally(t.m, t.owner, bill([['a', 1]]))
    handler = (path) => (path === '/vouchers' ? t.net() : emptyFeed)
    await t.syncNow()
    expect(sent.some((s) => s.path === '/sync/changes')).toBe(false)
    expect(t.useSync.getState().online).toBe(false)

    sent.length = 0
    handler = (path) => (path === '/vouchers' ? {} : emptyFeed)
    await t.syncNow()
    expect(sent.map((s) => s.path)).toEqual(['/vouchers', '/sync/changes'])
    expect(t.useSync.getState().pendingIds).toEqual([])
  })

  it('keeps a waiting bill even when it is older than the 30 days kept', async () => {
    const t = await setup()
    const v = await t.saveLocally(t.m, t.owner, bill([['a', 1]], { date: '2026-01-02' }))
    await t.m.batch([{ store: 'outbox', remove: [] }])
    handler = (path) => (path === '/vouchers' ? t.net() : emptyFeed)
    await t.pull(t.m, new Date('2026-11-20'))
    expect(await t.m.get('vouchers', v.id)).toBeDefined()
  })
})

describe('billing service', () => {
  const owner = async () => (await import('./mirrorServices')).createMirrorServices().billing

  it('online with nothing waiting: saves on the server with an id chosen here, and nothing is queued', async () => {
    const t = await setup()
    t.setSync({ online: true })
    handler = (path, o) => (path === '/vouchers' ? { ...o.body, number: 'SI-2026-0001', totals: { grandTotal: 1 } } : emptyFeed)
    const v = await (await owner()).save(bill([['a', 1]]))
    expect(v.number).toBe('SI-2026-0001')
    expect(sent[0]!.body).toMatchObject({ id: expect.any(String), clientCreatedAt: expect.any(String) })
    expect(await t.listOutbox(t.m)).toHaveLength(0)
  })

  it('cannot reach the server: the bill is made on this device with the same id, and sent later (even if the first try actually got through)', async () => {
    const t = await setup({ numbering: { 'SI-2026': 7 } })
    t.setSync({ online: true })
    let call = 0
    handler = (path) => (path === '/vouchers' && call++ === 0 ? t.net() : path === '/vouchers' ? {} : emptyFeed)
    const input = bill([['a', 2]])
    const v = await (await owner()).save(input)
    await t.syncNow() // the background send that follows the save
    expect(v.id).toBe(input.id)
    expect(v.number).toBe('SI-2026-0008')
    expect(sent.filter((s) => s.path === '/vouchers')[0]!.body!.id).toBe(sent.filter((s) => s.path === '/vouchers')[1]!.body!.id) // same id both times: the server saves it once
    expect((await t.m.get<Item>('items', 'a'))!.currentStock).toBe(8)
  })

  it('while bills are waiting, new ones go through the same queue so numbers and order stay right', async () => {
    const t = await setup({ numbering: { 'SI-2026': 0 } })
    t.setSync({ online: false })
    handler = (p) => (p === '/vouchers' ? t.net() : emptyFeed)
    const svc = await owner()
    const a = await svc.save(bill([['a', 1]]))
    t.setSync({ online: true }) // connection flickers back before the queue is sent
    const b = await svc.save(bill([['a', 1]]))
    expect([a.number, b.number]).toEqual(['SI-2026-0001', 'SI-2026-0002'])
    expect(await svc.nextNumber(day)).toBe('SI-2026-0003')
    expect((await t.listOutbox(t.m)).map((e) => e.number)).toEqual(['SI-2026-0001', 'SI-2026-0002'])
  })

  it('a refusal from the server while online is shown to the user, not queued', async () => {
    const t = await setup()
    t.setSync({ online: true })
    handler = (p) => (p === '/vouchers' ? new t.AppError('duplicateNumber', { number: 'SI-2026-0001' }) : emptyFeed)
    await expect((await owner()).save(bill([['a', 1]]))).rejects.toMatchObject({ key: 'duplicateNumber' })
    expect(await t.listOutbox(t.m)).toHaveLength(0)
  })

  it('the register shows bills that are still waiting, even when the server list does not have them yet', async () => {
    const t = await setup()
    t.setSync({ online: false })
    handler = (p) => (p === '/vouchers' ? t.net() : emptyFeed)
    const svc = (await import('./mirrorServices')).createMirrorServices()
    const v = await svc.billing.save(bill([['a', 1]]))
    t.setSync({ online: true })
    handler = (p) => (p === '/vouchers' ? { data: [], total: 0, page: 1, limit: 200 } : emptyFeed)
    expect((await svc.vouchers.list()).map((x) => x.id)).toEqual([v.id])
  })
})

describe('changing a bill that has not been sent yet', () => {
  const svc = async () => (await import('./mirrorServices')).createMirrorServices().billing
  const offline = (t: Awaited<ReturnType<typeof setup>>) => { t.setSync({ online: false }); handler = (p) => (p === '/vouchers' ? t.net() : emptyFeed) }

  it('editing redoes stock and credit and replaces the queued copy, keeping its number and id', async () => {
    const t = await setup({ numbering: { 'SI-2026': 11 } })
    offline(t)
    const b = await svc()
    const v = await b.save(bill([['a', 3]], { partyId: 'p1', payment: 'CREDIT' }))
    expect((await t.m.get<Item>('items', 'a'))!.currentStock).toBe(7)
    const edited = await b.update(v.id, bill([['a', 5], ['b', 1]], { partyId: 'p1', payment: 'CREDIT', remarks: 'fixed' }))
    expect(edited).toMatchObject({ id: v.id, number: 'SI-2026-0012', remarks: 'fixed' })
    expect((await t.m.get<Item>('items', 'a'))!.currentStock).toBe(5)
    expect((await t.m.get<Item>('items', 'b'))!.currentStock).toBe(-1)
    expect((await t.m.get<Party>('parties', 'p1'))!.balance).toBe(edited.totals.grandTotal)
    const q = await t.listOutbox(t.m)
    expect(q).toHaveLength(1)
    expect(q[0]!.payload).toMatchObject({ id: v.id, number: 'SI-2026-0012', remarks: 'fixed' })
    const pay = q[0]!.payload as { lines: unknown[]; clientCreatedAt: string }
    expect(pay.lines).toHaveLength(2)
    expect(pay.clientCreatedAt).toBe(v.clientCreatedAt)
  })

  it('the server then receives only the final version, once', async () => {
    const t = await setup()
    offline(t)
    const b = await svc()
    const v = await b.save(bill([['a', 1]]))
    await b.update(v.id, bill([['a', 2]]))
    await b.update(v.id, bill([['a', 4]]))
    await t.syncNow() // let the background send attempts from each save finish
    sent.length = 0
    handler = () => ({})
    await t.flushOutbox(t.m)
    const posts = sent.filter((s) => s.path === '/vouchers')
    expect(posts).toHaveLength(1)
    expect((posts[0]!.body!.lines as { qty: number }[])[0]!.qty).toBe(4)
  })

  it('cancelling puts stock and credit back, keeps the number, and the server gets the bill and then its cancellation', async () => {
    const t = await setup({ numbering: { 'SI-2026': 20 } })
    offline(t)
    const b = await svc()
    const v = await b.save(bill([['a', 3]], { partyId: 'p1', payment: 'CREDIT' }))
    const c = await b.cancel(v.id)
    expect(c).toMatchObject({ status: 'CANCELLED', number: 'SI-2026-0021' })
    expect((await t.m.get<Item>('items', 'a'))!.currentStock).toBe(10)
    expect((await t.m.get<Party>('parties', 'p1'))!.balance).toBe(0)
    expect(await b.nextNumber(day)).toBe('SI-2026-0022') // the cancelled number is never reused
    sent.length = 0
    handler = () => ({})
    await t.flushOutbox(t.m)
    expect(sent.map((s) => s.path)).toEqual(['/vouchers', `/vouchers/${v.id}/cancel`])
    expect(await t.listOutbox(t.m)).toHaveLength(0)
  })

  it('a cancellation that cannot be sent yet keeps the bill queued, and an already-cancelled reply counts as done', async () => {
    const t = await setup()
    offline(t)
    const b = await svc()
    const v = await b.save(bill([['a', 1]]))
    await b.cancel(v.id)
    handler = (p) => (p.endsWith('/cancel') ? t.net() : {})
    await t.flushOutbox(t.m)
    expect(await t.listOutbox(t.m)).toHaveLength(1)
    handler = (p) => (p.endsWith('/cancel') ? new t.AppError('alreadyCancelled') : {})
    await t.flushOutbox(t.m)
    expect(await t.listOutbox(t.m)).toHaveLength(0)
  })

  it('cannot edit a bill that was cancelled here; a refused bill is edited to fix it, but cancelled only by discarding', async () => {
    const t = await setup()
    offline(t)
    const b = await svc()
    const v = await b.save(bill([['a', 1]]))
    await b.cancel(v.id)
    await expect(b.update(v.id, bill([['a', 2]]))).rejects.toMatchObject({ key: 'cancelledNoEdit' })

    const w = await b.save(bill([['a', 1]]))
    await t.syncNow()
    handler = (p, o) => (p === '/vouchers' && o.body?.id === w.id ? new t.AppError('duplicateNumber', { number: w.number }) : {})
    await t.flushOutbox(t.m)
    expect((await t.listOutbox(t.m)).find((e) => e.id === w.id)!.status).toBe('failed')
    await expect(b.cancel(w.id)).rejects.toMatchObject({ key: 'billNeedsAttention' })
    await b.update(w.id, bill([['a', 2]]), )
    const e = (await t.listOutbox(t.m)).find((x) => x.id === w.id)!
    expect(e.status).toBe('pending')
    expect(e.error).toBeUndefined()
  })

  it('a bill that is already on the server is changed on the server, not on this device', async () => {
    const t = await setup()
    t.setSync({ online: true })
    handler = (p, o) => (p === '/vouchers' ? { ...o.body, number: 'SI-2026-0001', totals: { grandTotal: 1 } } : { id: 'on-server', number: 'SI-2026-0001' })
    const b = await svc()
    const v = await b.save(bill([['a', 1]])) // went straight to the server: nothing queued
    sent.length = 0
    await b.update(v.id, bill([['a', 2]]))
    await b.cancel(v.id)
    expect(sent.map((s) => `${s.path}`).filter((p) => p.startsWith('/vouchers'))).toEqual([`/vouchers/${v.id}`, `/vouchers/${v.id}/cancel`])
  })

  it('an edit that arrives while the bill is being sent waits for the send, then goes to the server', async () => {
    const t = await setup()
    offline(t)
    const b = await svc()
    const v = await b.save(bill([['a', 1]]))
    await t.syncNow() // background attempt from the save (fails: offline)
    let release!: () => void
    const gate = new Promise<void>((r) => { release = r })
    const order: string[] = []
    handler = (p, o) => {
      order.push(`${o.method ?? 'GET'} ${p}`)
      if (p === '/vouchers' && o.method === 'POST') return gate.then(() => ({}))
      if (p.startsWith('/vouchers/')) return {}
      return emptyFeed
    }
    const sending = t.flushOutbox(t.m)
    await new Promise((r) => setTimeout(r, 30))
    const editing = b.update(v.id, bill([['a', 9]]))
    await new Promise((r) => setTimeout(r, 30))
    expect(order).toEqual(['POST /vouchers']) // the edit has not run ahead of the send
    release()
    await sending
    await editing
    expect(order[0]).toBe('POST /vouchers')
    expect(order.slice(1)).toContain(`PUT /vouchers/${v.id}`) // the bill was already on the server, so the edit went there
    expect(order.filter((x) => x === 'POST /vouchers')).toHaveLength(1)
  })
})

describe('Home and the recent window', () => {
  it('recent() is the device copy only and works with no connection', async () => {
    const t = await setup()
    t.setSync({ online: false })
    handler = () => t.net()
    await t.m.putMany('vouchers', [{ id: 'v1', number: 'SI-2026-0001', date: day }, { id: 'v2', number: 'SI-2026-0002', date: day }])
    const s = (await import('./mirrorServices')).createMirrorServices()
    expect((await s.vouchers.recent!()).map((v) => v.number)).toEqual(['SI-2026-0002', 'SI-2026-0001'])
    expect(sent).toHaveLength(0)
  })

  it('the kept window always covers the whole current month', async () => {
    const t = await setup()
    expect(t.historyFrom(new Date('2026-12-31T10:00:00'))).toBe('2026-12-01')
    expect(t.historyFrom(new Date('2026-03-05T10:00:00'))).toBe('2026-02-03')
  })
})

beforeEach(() => { sent.length = 0 })
