import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'
import type { Item, Settings } from '@/services/types'

type Opts = { method?: string; body?: Record<string, unknown> }
let handler: (path: string, o: Opts) => unknown
const sent: { path: string; body?: Record<string, unknown> }[] = []
vi.mock('@/auth/session', () => ({ useAuth: { getState: () => ({ user: { id: 'u1' }, workspace: { id: 'ws' } }) } }))
vi.mock('@/services/http/client', () => ({
  api: vi.fn(async (path: string, o: Opts = {}) => { sent.push({ path, body: o.body }); const r = handler(path, o); if (r instanceof Error) throw r; return r }),
  apiAll: async () => [],
}))

const day = '2026-11-20'
const settings = { id: 's', gstEnabled: true, stateCode: '29', invoicePrefix: 'SI', overIssue: 'ALLOW_WARN', roundOffDefault: false } as unknown as Settings
const item = (id: string, name = id) => ({ id, name, code: id.toUpperCase(), hsn: '', batchNo: '', expiry: '', unit: 'PCS', mrp: 0, purchaseRate: 0, issueRate: 10000, gstPercent: 12, currentStock: 10, lowStockThreshold: 0 }) as Item
const bill = (itemId: string, qty: number) => ({ id: crypto.randomUUID(), clientCreatedAt: new Date().toISOString(), date: day, mode: 'TAX_INVOICE' as const, taxApplicable: true, rateBasis: 'SALE' as const, partyId: null, remarks: '', lines: [{ itemId, qty, rate: 10000, discPct: 0 }], billDiscount: null, roundOff: false, payment: 'PAID_CASH' as const })

let n = 0
async function setup(ws = 'ws') {
  vi.resetModules(); sent.length = 0
  handler = () => ({})
  const { openMirror } = await import('./db')
  const sync = await import('./sync')
  const outbox = await import('./outbox')
  const backup = await import('./backup')
  const state = await import('./state')
  const m = await openMirror(`bk-${++n}`)
  sync.attachMirror(m)
  await m.putMany('settings', [settings])
  await m.putMany('items', [item('a', 'Pen, blue "fine"')])
  return { m, ws, owner: { workspaceId: ws, userId: 'u1' }, ...outbox, ...backup, ...state, ...sync }
}

describe('backup of bills not yet sent', () => {
  it('holds every waiting bill with its details, and a spreadsheet version a person can read', async () => {
    const t = await setup()
    const v = await t.saveLocally(t.m, t.owner, bill('a', 3))
    const b = await t.buildBackup(t.m, 'ws')
    expect(b).toMatchObject({ app: 'rapidbill', version: 1, workspaceId: 'ws' })
    expect(b.entries).toHaveLength(1)
    expect(b.entries[0]!.entry.id).toBe(v.id)
    expect((b.entries[0]!.record as { number: string }).number).toBe(v.number)
    const csv = t.backupToCsv(b).split('\n')
    expect(csv[0]).toBe('Type,Number / code,Date,Party / name,Payment,Items,Total (Rs),Status')
    expect(csv[1]).toContain(`Bill,${v.number}`)
    expect(csv[1]).toContain('"Pen, blue ""fine"" x 3"') // commas and quotes in names do not break the columns
    expect(csv[1]).toContain('Waiting to sync')
  })

  it('refuses files that are not one of ours', async () => {
    const t = await setup()
    for (const bad of ['not json', '{}', JSON.stringify({ app: 'other', version: 1, entries: [] }), JSON.stringify({ app: 'rapidbill', version: 2, entries: [] }),
      JSON.stringify({ app: 'rapidbill', version: 1, entries: [{ entry: { id: 'x' } }] }),
      JSON.stringify({ app: 'rapidbill', version: 1, entries: [{ entry: { id: 'x', number: 'N', payload: { id: 'y', lines: [], date: day } } }] })]) {
      expect(() => t.parseBackup(bad), bad.slice(0, 40)).toThrowError()
    }
    const good = JSON.stringify(await t.buildBackup(t.m, 'ws'))
    expect(() => t.parseBackup(good)).not.toThrow()
  })

  it('after the browser data is cleared, the bills come back from the file and reach the server once', async () => {
    const before = await setup()
    const v1 = await before.saveLocally(before.m, before.owner, bill('a', 2))
    const v2 = await before.saveLocally(before.m, before.owner, bill('a', 1))
    const file = JSON.stringify(await before.buildBackup(before.m, 'ws'))

    // A different, empty device copy: as if the browser had been cleared.
    const after = await setup()
    expect(await after.listOutbox(after.m)).toHaveLength(0)
    expect(await after.restoreBackup(after.m, 'ws', after.parseBackup(file))).toEqual({ restored: 2, skipped: 0 })
    expect((await after.listOutbox(after.m)).map((e) => e.number)).toEqual([v1.number, v2.number])
    expect(after.useSync.getState().pendingIds).toHaveLength(2)
    expect((await after.m.get('vouchers', v1.id))).toBeDefined() // shows in the register again

    // restoring the same file again adds nothing
    expect(await after.restoreBackup(after.m, 'ws', after.parseBackup(file))).toEqual({ restored: 0, skipped: 2 })

    // and they go up with the numbers and ids they had
    handler = () => ({})
    await after.flushOutbox(after.m)
    expect(sent.map((s) => s.body!.id)).toEqual([v1.id, v2.id])
    expect(sent.map((s) => s.body!.number)).toEqual([v1.number, v2.number])
    expect(await after.listOutbox(after.m)).toHaveLength(0)
  })

  it('a backup from another account is refused', async () => {
    const t = await setup()
    await t.saveLocally(t.m, t.owner, bill('a', 1))
    const other = await t.buildBackup(t.m, 'someone-else')
    await expect(t.restoreBackup(t.m, 'ws', other)).rejects.toMatchObject({ key: 'backupOtherAccount' })
  })
})

describe('warnings', () => {
  it('remembers how far the device clock is from the server, and when the oldest bill started waiting', async () => {
    const t = await setup()
    handler = () => ({ epoch: 0, cursor: 'c', hasMore: false, items: [], parties: [], settings: null, vouchers: [], deleted: { parties: [] }, serverTime: new Date(Date.now() + 20 * 60_000).toISOString() })
    await t.pull(t.m)
    expect(Math.round(t.useSync.getState().clockSkewMs! / 60_000)).toBe(20)

    const a = await t.saveLocally(t.m, t.owner, bill('a', 1))
    await new Promise((r) => setTimeout(r, 5))
    await t.saveLocally(t.m, t.owner, bill('a', 1))
    const entries = await t.listOutbox(t.m)
    expect(t.useSync.getState().oldestWaiting).toBe(entries.find((e) => e.id === a.id)!.createdAt)
  })

  it('a full disk is reported in plain words and leaves nothing half saved', async () => {
    const t = await setup()
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError') })
    await expect(t.saveLocally(t.m, t.owner, bill('a', 1))).rejects.toMatchObject({ key: 'deviceStorageFull' })
    spy.mockRestore()
    expect(await t.listOutbox(t.m)).toHaveLength(0)
    expect((await t.m.get<Item>('items', 'a'))!.currentStock).toBe(10)
  })
})
