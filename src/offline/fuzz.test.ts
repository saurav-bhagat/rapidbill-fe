import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'
import { createMemoryAdapter } from '@/services/storage/memoryAdapter'
import { createBillingService } from '@/services/voucher'
import { AppError } from '@/services/errors'
import type { Item, Party, Settings, Voucher } from '@/services/types'

/**
 * Many random days in a shop: bills are made, edited and cancelled while the connection comes and goes, requests are lost,
 * and replies are lost after the server has already acted. A stand-in server (the same billing engine, saving a bill by id once)
 * answers. When the connection is finally good, the device and the server must agree exactly, and the stock must add up.
 */
type Opts = { method?: string; body?: Record<string, unknown>; query?: Record<string, string | number | undefined> }
let handler: (path: string, o: Opts) => Promise<unknown>

vi.mock('@/auth/session', () => ({ useAuth: { getState: () => ({ user: { id: 'u1' }, workspace: { id: 'ws' } }) } }))
vi.mock('@/services/http/client', () => {
  const api = vi.fn((path: string, o: Opts = {}) => handler(path, o))
  return { api, apiAll: async (path: string, query: Opts['query']) => { const r = (await api(path, { query })) as unknown; return Array.isArray(r) ? r : (r as { data: unknown[] }).data } }
})

import { openMirror } from './db'
import { attachMirror, syncNow } from './sync'
import { listOutbox } from './outbox'
import { setSync, useSync } from './state'
import { createMirrorServices } from './mirrorServices'

const mulberry = (a: number) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
const today = new Date().toISOString().slice(0, 10)
const owner = { workspaceId: 'ws', userId: 'u1' }
const settings = { id: 's', workspaceId: 'ws', gstEnabled: true, stateCode: '29', invoicePrefix: 'SI', overIssue: 'ALLOW_WARN', roundOffDefault: false, printLanguage: 'en' } as unknown as Settings
const mkItem = (id: string) => ({ id, workspaceId: 'ws', createdBy: 'u1', createdAt: 't', updatedAt: 't', name: id, code: id.toUpperCase(), hsn: '', batchNo: '', expiry: '', unit: 'PCS', mrp: 0, purchaseRate: 0, issueRate: 10000, gstPercent: 12, currentStock: 50, lowStockThreshold: 0, category: '' }) as unknown as Item
const mkParty = (id: string) => ({ id, workspaceId: 'ws', createdBy: 'u1', createdAt: 't', updatedAt: 't', name: id, type: 'CUSTOMER', gstin: '', stateCode: '29', address: '', phone: '', balance: 0 }) as unknown as Party
const ITEMS = ['a', 'b', 'c']

let n = 0
async function oneDay(seed: number) {
  const rng = mulberry(seed)
  const pick = <T,>(xs: T[]) => xs[Math.floor(rng() * xs.length)]!

  const server = createMemoryAdapter()
  await server.write('settings', [settings])
  await server.write('items', ITEMS.map(mkItem))
  await server.write('parties', [mkParty('p1')])
  await server.write('vouchers', [])
  await server.write('ledger', [])
  const srv = createBillingService(server, owner)

  const chaos = { down: false, loseRequest: 0.06, loseReply: 0.06 }
  const net = () => new AppError('networkError')
  const serve = async (path: string, o: Opts): Promise<unknown> => {
    const vouchers = () => server.read<Voucher>('vouchers')
    if (path === '/sync/changes') {
      const vs = await vouchers()
      const numbering: Record<string, number> = {}
      for (const v of vs) { const m = /^(.+-\d{4})-(\d+)$/.exec(v.number); if (m) numbering[m[1]!] = Math.max(numbering[m[1]!] ?? 0, Number(m[2])) }
      return { epoch: 0, serverTime: new Date().toISOString(), cursor: 'c', hasMore: false, items: await server.read('items'), parties: await server.read('parties'), settings, vouchers: vs, deleted: { parties: [] }, numbering }
    }
    if (path === '/vouchers' && o.method === 'POST') {
      const body = o.body as unknown as Parameters<typeof srv.save>[0]
      const have = (await vouchers()).find((v) => v.id === body.id)
      return have ?? srv.save(body)
    }
    if (/^\/vouchers\/[^/]+\/cancel$/.test(path)) return srv.cancel(path.split('/')[2]!)
    if (/^\/vouchers\/[^/]+$/.test(path) && o.method === 'PUT') return srv.update(path.split('/')[2]!, o.body as unknown as Parameters<typeof srv.update>[1])
    if (path === '/items' && o.method === 'POST') {
      const items = await server.read<Item>('items'); const body = o.body as unknown as Item
      const have = items.find((i) => i.id === body.id)
      if (have) return have
      const clash = items.find((i) => i.code.toUpperCase() === body.code.toUpperCase())
      if (clash) throw new AppError('itemCodeUsedBy', { code: body.code, name: clash.name })
      const row = { ...body, workspaceId: 'ws', createdBy: 'u1', createdAt: 't', updatedAt: 't' } as Item
      await server.write('items', [...items, row])
      return row
    }
    if (/^\/items\/[^/]+$/.test(path) && o.method === 'PATCH') {
      const items = await server.read<Item>('items'); const id = path.split('/')[2]!
      const { currentStock: _s, ...fields } = o.body as unknown as Item; void _s
      await server.write('items', items.map((i) => (i.id === id ? { ...i, ...fields } : i)))
      return items.find((i) => i.id === id)
    }
    if (path === '/parties' && o.method === 'POST') {
      const ps = await server.read<Party>('parties'); const body = o.body as unknown as Party
      const have = ps.find((p) => p.id === body.id)
      if (have) return have
      if (ps.some((p) => p.name.toLowerCase() === body.name.toLowerCase())) throw new AppError('partyNameTaken', { name: body.name })
      const row = { ...body, workspaceId: 'ws', createdBy: 'u1', createdAt: 't', updatedAt: 't' } as Party
      await server.write('parties', [...ps, row])
      return row
    }
    if (/^\/parties\/[^/]+$/.test(path) && o.method === 'PATCH') {
      const ps = await server.read<Party>('parties'); const id = path.split('/')[2]!
      await server.write('parties', ps.map((p) => (p.id === id ? { ...p, ...(o.body as object) } : p)))
      return ps.find((p) => p.id === id)
    }
    if (path === '/vouchers/next-number') return { number: await srv.nextNumber(String(o.query?.date)) }
    if (path === '/vouchers') return await vouchers()
    throw new Error(`fake server: unexpected ${o.method ?? 'GET'} ${path}`)
  }
  handler = async (path, o) => {
    if (chaos.down) throw net()
    if (rng() < chaos.loseRequest) throw net()
    const result = await serve(path, o)
    if (rng() < chaos.loseReply) throw net()
    return result
  }

  const mirror = await openMirror(`fuzz-${++n}`)
  attachMirror(mirror)
  useSync.setState({ online: true, pendingIds: [], failedIds: [], oldestWaiting: null, version: 0 })
  await syncNow()
  const billing = createMirrorServices().billing
  const mirrorVouchers = () => mirror.all<Voucher>('vouchers')

  const known = [...ITEMS] // items the shop has, including ones made during the day
  const knownParties = ['p1']
  const opening = new Map(ITEMS.map((id) => [id, 50]))
  let made = 0
  const itemData = (code: string, stock: number) => ({ name: `Item ${code}`, code, category: '', hsn: '', unit: 'PCS', batchNo: '', expiry: '', mrp: 0, purchaseRate: 0, issueRate: 10000, gstPercent: 12, currentStock: stock, lowStockThreshold: 0 }) as Omit<Item, 'id' | 'workspaceId' | 'createdBy' | 'createdAt' | 'updatedAt'>
  const services = createMirrorServices()

  const input = () => {
    const names = [...known].sort(() => rng() - 0.5).slice(0, 1 + Math.floor(rng() * 3))
    const credit = rng() < 0.3
    return {
      date: today, mode: 'TAX_INVOICE' as const, taxApplicable: true, rateBasis: 'SALE' as const, partyId: credit ? pick(knownParties) : null, remarks: '',
      lines: names.map((id) => ({ itemId: id, qty: 1 + Math.floor(rng() * 6), rate: 10000, discPct: 0 })),
      billDiscount: null, roundOff: false, payment: credit ? ('CREDIT' as const) : ('PAID_CASH' as const),
    }
  }

  const log = (...a: unknown[]) => { if (process.env.FUZZ_ONLY) console.log(...a) }
  const origHandler = handler
  handler = async (path, o) => { try { const r = await origHandler(path, o); log('   api', o.method ?? 'GET', path, 'ok'); return r } catch (e) { log('   api', o.method ?? 'GET', path, 'ERR', (e as { key?: string }).key); throw e } }
  for (let step = 0; step < 30; step++) {
    const r = rng()
    log('step', step, r.toFixed(2), chaos.down ? 'DOWN' : 'up')
    try {
      if (r < 0.36) await billing.save(input())
      else if (r < 0.50) { const vs = await mirrorVouchers(); if (vs.length) await billing.update(pick(vs).id, input()) }
      else if (r < 0.58) { const vs = await mirrorVouchers(); if (vs.length) await billing.cancel(pick(vs).id) }
      else if (r < 0.66) { const stock = 5 + Math.floor(rng() * 30); const it = await services.inventory.createItem(itemData(`N${++made}`, stock)); known.push(it.id); opening.set(it.id, stock) }
      else if (r < 0.71) { const p = await services.parties.create({ name: `Party ${++made}`, type: 'CUSTOMER', gstin: '', stateCode: '29', address: '', phone: '', balance: 0 }); knownParties.push(p.id) }
      else if (r < 0.75) { await services.inventory.updateItem(pick(known), { issueRate: 10000 + Math.floor(rng() * 500) }) }
      else if (r < 0.87) { chaos.down = !chaos.down; if (rng() < 0.5) setSync({ online: !chaos.down }) }
      else await syncNow()
    } catch (e) {
      // Refusals a person would see are fine (cancelled bill cannot be edited, no connection for an edit of a sent bill, ...).
      if (!(e instanceof AppError)) throw e
    }
  }

  // The connection is finally good.
  chaos.down = false; chaos.loseRequest = 0; chaos.loseReply = 0
  setSync({ online: true })
  for (let i = 0; i < 6 && (await listOutbox(mirror)).length > 0; i++) await syncNow()
  await syncNow()

  const sItems = await server.read<Item>('items')
  const sVouchers = await server.read<Voucher>('vouchers')
  const sParties = await server.read<Party>('parties')
  const where = `seed ${seed}`

  const left = await listOutbox(mirror)
  expect(left.map((e) => ({ n: e.number, st: e.status, err: e.error, cancel: (e as { cancel?: boolean }).cancel })), `${where}: nothing left waiting`).toEqual([])
  expect(useSync.getState().failedIds, `${where}: nothing refused`).toEqual([])

  // The device and the server hold the same stock, bills and balances.
  const cItems = new Map((await mirror.all<Item>('items')).map((i) => [i.id, i.currentStock]))
  expect(cItems.size, `${where}: device has the same items`).toBe(sItems.length)
  for (const i of sItems) expect(cItems.get(i.id), `${where}: device stock of ${i.id}`).toBe(i.currentStock)
  const cVouchers = new Map((await mirror.all<Voucher>('vouchers')).map((v) => [v.id, `${v.number}|${v.status}|${v.totals.grandTotal}`]))
  expect(cVouchers.size, `${where}: same number of bills`).toBe(sVouchers.length)
  for (const v of sVouchers) expect(cVouchers.get(v.id), `${where}: bill ${v.number}`).toBe(`${v.number}|${v.status}|${v.totals.grandTotal}`)
  for (const p of await mirror.all<Party>('parties')) expect(p.balance, `${where}: device balance of ${p.id}`).toBe(sParties.find((x) => x.id === p.id)!.balance)

  // And the arithmetic is right: stock = what we started with minus every live bill; credit = every live credit bill.
  for (const id of known) {
    const issued = sVouchers.filter((v) => v.status === 'ACTIVE').reduce((s, v) => s + v.lines.filter((l) => l.itemId === id).reduce((q, l) => q + l.qty, 0), 0)
    const row = sItems.find((i) => i.id === id)
    expect(row, `${where}: item ${id} reached the server`).toBeDefined()
    expect(row!.currentStock, `${where}: stock of ${id}`).toBe(opening.get(id)! - issued)
  }
  for (const id of knownParties) {
    const owed = sVouchers.filter((v) => v.status === 'ACTIVE' && v.payment === 'CREDIT' && v.partyId === id).reduce((s, v) => s + v.totals.grandTotal, 0)
    expect(sParties.find((p) => p.id === id)!.balance, `${where}: credit owed by ${id}`).toBe(owed)
  }
  expect(sItems.length, `${where}: no extra or missing items`).toBe(known.length)
  expect(sParties.length, `${where}: no extra or missing parties`).toBe(knownParties.length)
  expect([...(await mirror.all<Party>('parties')).map((p) => p.id)].sort(), `${where}: device has the same parties`).toEqual(sParties.map((p) => p.id).sort())
  expect(new Set(sVouchers.map((v) => v.number)).size, `${where}: bill numbers are unique`).toBe(sVouchers.length)
}

describe('a shop with a bad connection', () => {
  it('ends with the device and the server agreeing, and the stock adding up, over many random days', async () => {
    const days = Number(process.env.FUZZ_DAYS ?? 80) // set FUZZ_DAYS=1000 for a long soak
    if (process.env.FUZZ_ONLY) return void (await oneDay(Number(process.env.FUZZ_ONLY)))
    for (let seed = 1; seed <= days; seed++) await oneDay(seed)
  }, 600_000)
})
