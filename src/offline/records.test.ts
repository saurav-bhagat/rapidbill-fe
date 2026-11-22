import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'
import type { Item, Party, Settings, Voucher } from '@/services/types'

type Opts = { method?: string; body?: Record<string, unknown>; query?: Record<string, string | number | undefined> }
let handler: (path: string, o: Opts) => unknown
const sent: { path: string; method?: string; body?: Record<string, unknown> }[] = []
vi.mock('@/auth/session', () => ({ useAuth: { getState: () => ({ user: { id: 'u1' }, workspace: { id: 'ws' } }) } }))
vi.mock('@/services/http/client', () => {
  const api = vi.fn(async (path: string, o: Opts = {}) => { sent.push({ path, method: o.method, body: o.body }); const r = handler(path, o); if (r instanceof Error) throw r; return r })
  return { api, apiAll: async () => [], apiEnabled: true, onLicenseBlocked: () => () => undefined }
})

const day = '2026-11-20'
const settings = { id: 's', gstEnabled: true, stateCode: '29', invoicePrefix: 'SI', overIssue: 'ALLOW_WARN', roundOffDefault: false } as unknown as Settings
const itemData = (code: string, over: Record<string, unknown> = {}) => ({ name: `Item ${code}`, code, category: '', hsn: '', unit: 'PCS', batchNo: '', expiry: '', mrp: 0, purchaseRate: 0, issueRate: 10000, gstPercent: 12, currentStock: 10, lowStockThreshold: 5, ...over }) as Omit<Item, 'id' | 'workspaceId' | 'createdBy' | 'createdAt' | 'updatedAt'>
const partyData = (name: string, over: Record<string, unknown> = {}) => ({ name, type: 'CUSTOMER', gstin: '', stateCode: '29', address: '', phone: '', balance: 0, ...over }) as Omit<Party, 'id' | 'workspaceId' | 'createdBy' | 'createdAt' | 'updatedAt'>
const bill = (itemId: string, qty = 1, over: Record<string, unknown> = {}) => ({ id: crypto.randomUUID(), clientCreatedAt: new Date().toISOString(), date: day, mode: 'TAX_INVOICE' as const, taxApplicable: true, rateBasis: 'SALE' as const, partyId: null, remarks: '', lines: [{ itemId, qty, rate: 10000, discPct: 0 }], billDiscount: null, roundOff: false, payment: 'PAID_CASH' as const, ...over })
const emptyFeed = { epoch: 0, cursor: 'c', hasMore: false, items: [], parties: [], settings: null, vouchers: [], deleted: { parties: [] }, numbering: {} }

let n = 0
async function setup() {
  vi.resetModules(); sent.length = 0
  handler = () => emptyFeed
  const { openMirror } = await import('./db')
  const sync = await import('./sync')
  const state = await import('./state')
  const outbox = await import('./outbox')
  const rec = await import('./records')
  const backup = await import('./backup')
  const { AppError } = await import('@/services/errors')
  const m = await openMirror(`rec-${++n}`)
  sync.attachMirror(m)
  await m.putMany('settings', [settings])
  const owner = { workspaceId: 'ws', userId: 'u1' }
  const net = () => new AppError('networkError')
  const services = async () => (await import('./mirrorServices')).createMirrorServices()
  return { m, owner, net, AppError, services, ...sync, ...state, ...outbox, ...rec, ...backup }
}
type T = Awaited<ReturnType<typeof setup>>
const offline = (t: T) => { t.setSync({ online: false }); handler = () => t.net() }

describe('making items and parties on this device', () => {
  it('an item is saved here and queued together, with its code in capitals and its opening stock', async () => {
    const t = await setup()
    const it = await t.createItemLocally(t.m, t.owner, itemData('abc-1', { currentStock: 12.3456789 }))
    expect(it).toMatchObject({ code: 'ABC-1', currentStock: 12.345679, workspaceId: 'ws' })
    expect(await t.m.get('items', it.id)).toBeDefined()
    const q = await t.listOutbox(t.m)
    expect(q).toHaveLength(1)
    expect(q[0]).toMatchObject({ kind: 'item', id: it.id, status: 'pending', number: 'ABC-1', payload: { id: it.id, code: 'ABC-1', currentStock: 12.345679 } })
    expect(t.useSync.getState().pendingIds).toEqual([it.id])
  })

  it('a code that is already used is refused at once, and nothing is saved', async () => {
    const t = await setup()
    await t.createItemLocally(t.m, t.owner, itemData('X1'))
    await expect(t.createItemLocally(t.m, t.owner, itemData('x1'))).rejects.toMatchObject({ key: 'itemCodeUsedBy', params: { code: 'X1' } })
    expect(await t.listOutbox(t.m)).toHaveLength(1)
  })

  it('a party is saved and queued; the same name in other letters is refused', async () => {
    const t = await setup()
    const p = await t.createPartyLocally(t.m, t.owner, partyData('  Acme Co '))
    expect(p.name).toBe('Acme Co')
    expect((await t.listOutbox(t.m))[0]).toMatchObject({ kind: 'party', id: p.id, number: 'Acme Co', payload: { id: p.id, name: 'Acme Co' } })
    await expect(t.createPartyLocally(t.m, t.owner, partyData('ACME co'))).rejects.toMatchObject({ key: 'partyNameTaken' })
  })

  it('a bill that uses a new item and a new party goes after them, with the ids made here', async () => {
    const t = await setup()
    offline(t)
    const s = await t.services()
    const it = await s.inventory.createItem(itemData('N1', { currentStock: 20 }))
    const p = await s.parties.create(partyData('New Co'))
    const v = await s.billing.save(bill(it.id, 5, { partyId: p.id, payment: 'CREDIT' }))
    expect((await t.m.get<Item>('items', it.id))!.currentStock).toBe(15)
    expect((await t.listOutbox(t.m)).map((e) => e.kind ?? 'voucher')).toEqual(['item', 'party', 'voucher'])

    handler = () => ({})
    sent.length = 0
    await t.flushOutbox(t.m)
    expect(sent.map((x) => x.path)).toEqual(['/items', '/parties', '/vouchers'])
    expect(sent[0]!.body).toMatchObject({ id: it.id, code: 'N1' })
    expect(sent[2]!.body).toMatchObject({ id: v.id, partyId: p.id })
    expect((sent[2]!.body!.lines as { itemId: string }[])[0]!.itemId).toBe(it.id)
    expect(await t.listOutbox(t.m)).toHaveLength(0)
  })
})

describe('creating through the service', () => {
  it('online with nothing waiting: the server gets it directly, with the id chosen here, and the device remembers it at once', async () => {
    const t = await setup()
    t.setSync({ online: true })
    handler = (p, o) => (p === '/items' ? { ...o.body, workspaceId: 'ws' } : emptyFeed)
    const it = await (await t.services()).inventory.createItem(itemData('D1'))
    expect(sent[0]).toMatchObject({ path: '/items', method: 'POST', body: { id: it.id, code: 'D1' } })
    expect(await t.m.get('items', it.id)).toBeDefined()
    expect(await t.listOutbox(t.m)).toHaveLength(0)
  })

  it('the reply is lost: made here with the same id, and sent again, so the server saves it once', async () => {
    const t = await setup()
    t.setSync({ online: true })
    let call = 0
    handler = (p) => (p === '/items' && call++ === 0 ? t.net() : p === '/items' ? {} : emptyFeed)
    const it = await (await t.services()).inventory.createItem(itemData('L1'))
    await t.syncNow()
    const posts = sent.filter((s) => s.path === '/items')
    expect(posts).toHaveLength(2)
    expect(posts[0]!.body!.id).toBe(posts[1]!.body!.id)
    expect(posts[1]!.body!.id).toBe(it.id)
    expect(await t.listOutbox(t.m)).toHaveLength(0)
  })

  it('while anything is waiting, new items and parties are made here too, so the order is kept', async () => {
    const t = await setup()
    offline(t)
    const s = await t.services()
    await s.parties.create(partyData('First'))
    t.setSync({ online: true })
    handler = (p) => (p === '/parties' || p === '/items' ? t.net() : emptyFeed)
    await s.inventory.createItem(itemData('Z9'))
    expect((await t.listOutbox(t.m)).map((e) => e.kind)).toEqual(['party', 'item'])
  })

  it('a refusal from the server while online goes back to the person, not into the queue', async () => {
    const t = await setup()
    t.setSync({ online: true })
    handler = (p) => (p === '/items' ? new t.AppError('itemCodeUsedBy', { code: 'D1', name: 'Dup' }) : emptyFeed)
    await expect((await t.services()).inventory.createItem(itemData('D1'))).rejects.toMatchObject({ key: 'itemCodeUsedBy' })
    expect(await t.listOutbox(t.m)).toHaveLength(0)
  })
})

describe('changing what has not been sent', () => {
  it('an item waiting to be sent can be edited (stock is not editable), and the server gets the final version', async () => {
    const t = await setup()
    offline(t)
    const s = await t.services()
    const it = await s.inventory.createItem(itemData('E1', { currentStock: 8 }))
    await s.inventory.updateItem(it.id, { name: 'Renamed', code: 'e2', issueRate: 999, currentStock: 500 } as never)
    const row = (await t.m.get<Item>('items', it.id))!
    expect(row).toMatchObject({ name: 'Renamed', code: 'E2', issueRate: 999, currentStock: 8 })
    const e = (await t.listOutbox(t.m))[0]!
    expect(e).toMatchObject({ number: 'E2', status: 'pending', payload: { name: 'Renamed', code: 'E2', currentStock: 8 } })
    await t.syncNow()
    handler = () => ({}); sent.length = 0
    await t.flushOutbox(t.m)
    expect(sent.filter((x) => x.path === '/items')).toHaveLength(1)
  })

  it('editing a waiting item keeps the stock that bills have already taken from it; the opening stock sent stays as typed', async () => {
    const t = await setup()
    offline(t)
    const s = await t.services()
    const it = await s.inventory.createItem(itemData('K1', { currentStock: 8 }))
    await s.billing.save(bill(it.id, 3))
    expect((await t.m.get<Item>('items', it.id))!.currentStock).toBe(5)
    await s.inventory.updateItem(it.id, { name: 'Better name' })
    expect(await t.m.get('items', it.id)).toMatchObject({ name: 'Better name', currentStock: 5 })
    expect((await t.listOutbox(t.m)).find((e) => e.id === it.id)).toMatchObject({ payload: { name: 'Better name', currentStock: 8 } })
  })

  it('editing a waiting party keeps the credit its waiting bills added, and never sends it as the opening balance', async () => {
    const t = await setup()
    offline(t)
    const s = await t.services()
    const it = await s.inventory.createItem(itemData('K2', { currentStock: 20 }))
    const p = await s.parties.create(partyData('Credit Co', { balance: 1000 }))
    const v = await s.billing.save(bill(it.id, 2, { partyId: p.id, payment: 'CREDIT' }))
    const owed = 1000 + v.totals.grandTotal
    expect((await t.m.get<Party>('parties', p.id))!.balance).toBe(owed)
    // the form sends the whole party back with the balance as shown
    await s.parties.update(p.id, { ...partyData('Credit Co', { phone: '123' }), balance: owed })
    expect(await t.m.get('parties', p.id)).toMatchObject({ phone: '123', balance: owed })
    expect((await t.listOutbox(t.m)).find((e) => e.id === p.id)).toMatchObject({ payload: { phone: '123', balance: 1000 } })
    // a real change to the balance is carried over as the difference
    await s.parties.update(p.id, { balance: owed + 500 })
    expect((await t.m.get<Party>('parties', p.id))!.balance).toBe(owed + 500)
    expect((await t.listOutbox(t.m)).find((e) => e.id === p.id)).toMatchObject({ payload: { balance: 1500 } })
  })

  it('an item that is already on the server is edited there', async () => {
    const t = await setup()
    t.setSync({ online: true })
    await t.m.putMany('items', [{ id: 'srv', ...itemData('S1'), workspaceId: 'ws' }])
    handler = (p) => (p.startsWith('/items/') ? {} : emptyFeed)
    await (await t.services()).inventory.updateItem('srv', { name: 'New name' })
    expect(sent.some((x) => x.path === '/items/srv' && x.method === 'PATCH')).toBe(true)
  })

  it('a waiting party can be edited and deleted, unless a waiting bill uses it', async () => {
    const t = await setup()
    offline(t)
    const s = await t.services()
    const a = await s.parties.create(partyData('Alpha'))
    const b = await s.parties.create(partyData('Beta'))
    await s.parties.update(a.id, { phone: '99', name: 'Alpha Two' })
    expect(await t.m.get('parties', a.id)).toMatchObject({ name: 'Alpha Two', phone: '99' })
    expect((await t.listOutbox(t.m)).find((e) => e.id === a.id)).toMatchObject({ number: 'Alpha Two', payload: { phone: '99' } })

    const it = await s.inventory.createItem(itemData('P1'))
    await s.billing.save(bill(it.id, 1, { partyId: b.id, payment: 'CREDIT' }))
    await expect(s.parties.remove(b.id)).rejects.toMatchObject({ key: 'partyInUse', params: { count: 1 } })
    await s.parties.remove(a.id)
    expect(await t.m.get('parties', a.id)).toBeUndefined()
    expect((await t.listOutbox(t.m)).some((e) => e.id === a.id)).toBe(false)
  })

  it('stock changes and imports wait until the items and parties made here have been sent', async () => {
    const t = await setup()
    offline(t)
    const s = await t.services()
    const it = await s.inventory.createItem(itemData('G1'))
    await expect(s.inventory.adjustStock(it.id, 1, 'x')).rejects.toMatchObject({ key: 'syncFirst' })
    await expect(s.inventory.importItems([], 'file.xlsx')).rejects.toMatchObject({ key: 'syncFirst' })
  })

  it('an older copy on the server (the first send got through, its reply was lost) is brought up to date with the edit', async () => {
    const t = await setup()
    offline(t)
    const s = await t.services()
    const it = await s.inventory.createItem(itemData('R1'))
    await s.inventory.updateItem(it.id, { issueRate: 12345 })
    sent.length = 0
    handler = (p) => (p === '/items' ? { ...itemData('R1'), id: it.id } : {}) // server still has the old price
    await t.flushOutbox(t.m)
    expect(sent.map((x) => `${x.method} ${x.path}`)).toEqual(['POST /items', `PATCH /items/${it.id}`])
    expect(sent[1]!.body).toMatchObject({ issueRate: 12345 })
  })
})

describe('when the server says it already has one like it', () => {
  async function clash(t: T, kind: 'item' | 'party') {
    offline(t)
    const s = await t.services()
    const rec = kind === 'item' ? await s.inventory.createItem(itemData('DUP', { name: 'Mine' })) : await s.parties.create(partyData('Dupe Co'))
    const withItem = kind === 'item' ? rec.id : (await s.inventory.createItem(itemData('OK1'))).id
    const v = await s.billing.save(bill(withItem, 2, kind === 'party' ? { partyId: rec.id, payment: 'CREDIT' } : {}))
    handler = (p, o) => (p === '/items' && o.body?.code === 'DUP' ? new t.AppError('itemCodeUsedBy', { code: 'DUP', name: 'Theirs' })
      : p === '/parties' && o.body?.name === 'Dupe Co' ? new t.AppError('partyNameTaken', { name: 'Dupe Co' })
      : p === '/vouchers' && (o.body!.lines as { itemId: string }[]).some((l) => l.itemId === rec.id) && kind === 'item' ? new t.AppError('lineItemGone', { n: 1 })
      : p === '/vouchers' && kind === 'party' && o.body?.partyId === rec.id ? new t.AppError('partyGone')
      : {})
    await t.flushOutbox(t.m)
    return { rec, v }
  }

  it('the item is parked, and the bill that uses it is parked with it', async () => {
    const t = await setup()
    const { rec, v } = await clash(t, 'item')
    const q = await t.listOutbox(t.m)
    expect(q.find((e) => e.id === rec.id)).toMatchObject({ status: 'failed', error: { key: 'itemCodeUsedBy' } })
    expect(q.find((e) => e.id === v.id)).toMatchObject({ status: 'failed', error: { key: 'lineItemGone' } })
  })

  it('"same item": bills now use the one on the server, the new one is dropped, and the bill is sent again', async () => {
    const t = await setup()
    const { rec, v } = await clash(t, 'item')
    handler = (p) => (p === '/items' ? { data: [{ id: 'srv-1', ...itemData('dup', { name: 'Theirs', currentStock: 40 }) }] } : {})
    await t.useExisting(t.m, rec.id)
    expect(await t.m.get('items', rec.id)).toBeUndefined()
    expect(await t.m.get<Item>('items', 'srv-1')).toMatchObject({ name: 'Theirs' })
    const q = await t.listOutbox(t.m)
    expect(q.some((e) => e.id === rec.id)).toBe(false)
    const bq = q.find((e) => e.id === v.id)!
    expect(bq.status).toBe('pending')
    expect((bq.payload as { lines: { itemId: string }[] }).lines[0]!.itemId).toBe('srv-1')
    expect((await t.m.get<Voucher>('vouchers', v.id))!.lines[0]!.itemId).toBe('srv-1')

    handler = () => ({}); sent.length = 0
    await t.flushOutbox(t.m)
    expect(sent.find((x) => x.path === '/vouchers')!.body!.lines).toMatchObject([{ itemId: 'srv-1' }])
    expect(await t.listOutbox(t.m)).toHaveLength(0)
  })

  it('"different item": a new code is tried, and the bill is sent again after it', async () => {
    const t = await setup()
    const { rec, v } = await clash(t, 'item')
    await t.createItemLocally(t.m, t.owner, itemData('OK1'))
    await expect(t.renameRecord(t.m, rec.id, 'ok1')).rejects.toMatchObject({ key: 'itemCodeUsedBy' }) // clashes with another one made here
    await t.renameRecord(t.m, rec.id, 'dup-new')
    expect(await t.m.get('items', rec.id)).toMatchObject({ code: 'DUP-NEW' })
    const q = await t.listOutbox(t.m)
    expect(q.find((e) => e.id === rec.id)).toMatchObject({ status: 'pending', number: 'DUP-NEW', payload: { code: 'DUP-NEW' } })
    expect(q.find((e) => e.id === v.id)!.status).toBe('pending')
  })

  it('"same party": the same, for a party and the credit bill that used it', async () => {
    const t = await setup()
    const { rec, v } = await clash(t, 'party')
    handler = (p) => (p === '/parties' ? { data: [{ id: 'srv-p', ...partyData('dupe co') }] } : {})
    await t.useExisting(t.m, rec.id)
    expect(await t.m.get('parties', rec.id)).toBeUndefined()
    expect(await t.m.get('parties', 'srv-p')).toBeDefined()
    expect((await t.listOutbox(t.m)).find((e) => e.id === v.id)).toMatchObject({ status: 'pending', payload: { partyId: 'srv-p' } })
    expect((await t.m.get<Voucher>('vouchers', v.id))!.partyId).toBe('srv-p')
  })

  it('"same one" when the server cannot find it says so and changes nothing', async () => {
    const t = await setup()
    const { rec } = await clash(t, 'item')
    handler = () => ({ data: [] })
    await expect(t.useExisting(t.m, rec.id)).rejects.toMatchObject({ key: 'mergeNotFound' })
    expect((await t.listOutbox(t.m)).find((e) => e.id === rec.id)!.status).toBe('failed')
  })

  it('discarding is refused while bills still use it, and allowed when none do', async () => {
    const t = await setup()
    const { rec } = await clash(t, 'item')
    await expect(t.discardRecord(t.m, rec.id)).rejects.toMatchObject({ key: 'recordInUse', params: { count: 1 } })
    const t2 = await setup()
    offline(t2)
    const lone = await (await t2.services()).parties.create(partyData('Lonely'))
    handler = () => new t2.AppError('partyNameTaken', { name: 'Lonely' })
    await t2.flushOutbox(t2.m)
    await t2.discardRecord(t2.m, lone.id)
    expect(await t2.m.get('parties', lone.id)).toBeUndefined()
    expect(await t2.listOutbox(t2.m)).toHaveLength(0)
  })
})

describe('backup with items and parties', () => {
  it('keeps them in the file, in order, and brings them back with the bill that needs them', async () => {
    const t = await setup()
    offline(t)
    const s = await t.services()
    const it = await s.inventory.createItem(itemData('B1', { name: 'Boxed, "special"' }))
    const p = await s.parties.create(partyData('Backup Co'))
    await s.billing.save(bill(it.id, 1, { partyId: p.id, payment: 'CREDIT' }))
    const b = await t.buildBackup(t.m, 'ws')
    const csv = t.backupToCsv(b).split('\n')
    expect(csv[1]).toContain('Item,B1,')
    expect(csv[1]).toContain('"Boxed, ""special"""')
    expect(csv[2]).toContain('Party,')
    expect(csv[3]).toMatch(/^Bill,SI-/)
    const file = JSON.stringify(b)

    const fresh = await setup()
    expect(await fresh.restoreBackup(fresh.m, 'ws', fresh.parseBackup(file))).toEqual({ restored: 3, skipped: 0 })
    expect((await fresh.listOutbox(fresh.m)).map((e) => e.kind ?? 'voucher')).toEqual(['item', 'party', 'voucher'])
    expect(await fresh.m.get('items', it.id)).toBeDefined()
    expect(await fresh.m.get('parties', p.id)).toBeDefined()
    handler = () => ({}); sent.length = 0
    await fresh.flushOutbox(fresh.m)
    expect(sent.map((x) => x.path)).toEqual(['/items', '/parties', '/vouchers'])
  })
})
