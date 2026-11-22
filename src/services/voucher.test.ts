import { describe, expect, it } from 'vitest'
import { createMemoryAdapter } from './storage/memoryAdapter'
import { createBillingService, BillingError, type VoucherInput } from './voucher'
import { createSettingsService } from './settings'
import { writeSeed } from './seed'
import type { Item, Party, StockLedgerEntry, Voucher } from './types'
import type { StorageAdapter } from './storage/localStorageAdapter'

async function setup() {
  const a = createMemoryAdapter()
  await writeSeed(a)
  await createSettingsService(a).save({ overIssue: 'BLOCK' }) // an old saved choice: must no longer stop billing
  const svc = createBillingService(a)
  const items = await a.read<Item>('items')
  const parties = await a.read<Party>('parties')
  return { a, svc, items, parties, para: items.find((i) => i.code === 'ITM-1001')!, surf: items.find((i) => i.code === 'ITM-1009')! }
}
const base = (over: Partial<VoucherInput> = {}): VoucherInput => ({
  date: '2026-11-19', mode: 'TAX_INVOICE', taxApplicable: true, rateBasis: 'SALE', partyId: null, remarks: '',
  lines: [], billDiscount: null, roundOff: false, payment: 'PAID_CASH', ...over,
})

describe('billing.save', () => {
  it('deducts stock, writes ledger, snapshots totals, assigns next number', async () => {
    const { a, svc, para, surf } = await setup()
    const before = para.currentStock
    const v = await svc.save(base({ lines: [{ itemId: para.id, qty: 10, rate: para.issueRate, discPct: 0 }, { itemId: surf.id, qty: 2, rate: surf.issueRate, discPct: 10 }] }))
    expect(v.number).toBe('SI-2026-0004')
    const after = (await a.read<Item>('items')).find((i) => i.id === para.id)!
    expect(after.currentStock).toBe(before - 10)
    const led = (await a.read<StockLedgerEntry>('ledger')).filter((e) => e.voucherId === v.id)
    expect(led.map((e) => [e.type, e.qtyDelta])).toEqual([['ISSUE', -10], ['ISSUE', -2]])
    expect(v.totals.grandTotal).toBe(v.lines.reduce((s, l) => s + l.total, 0) + v.totals.roundOff)
    expect(v.lines[0].name).toBe(para.name)
  })

  it('keeps stock == ledger sum for every item after saving', async () => {
    const { a, svc, para } = await setup()
    await svc.save(base({ lines: [{ itemId: para.id, qty: 5, rate: para.issueRate, discPct: 0 }, { itemId: para.id, qty: 7, rate: para.issueRate, discPct: 0 }] }))
    const items = await a.read<Item>('items'); const led = await a.read<StockLedgerEntry>('ledger')
    for (const it of items) expect(led.filter((e) => e.itemId === it.id).reduce((s, e) => s + e.qtyDelta, 0)).toBe(it.currentStock)
    const mine = led.filter((e) => e.itemId === para.id).slice(-2)
    expect(mine[1].balanceAfter).toBe(para.currentStock - 12)
  })

  it('never blocks over-issue, even with an old BLOCK setting: stock goes negative and the ledger balances', async () => {
    const { a, svc, para } = await setup()
    const half = para.currentStock / 2 + 1
    await svc.save(base({ lines: [{ itemId: para.id, qty: half, rate: 100, discPct: 0 }, { itemId: para.id, qty: half, rate: 100, discPct: 0 }] }))
    expect((await a.read<Item>('items')).find((i) => i.id === para.id)!.currentStock).toBe(para.currentStock - 2 * half)
    expect(await a.read<Voucher>('vouchers')).toHaveLength(4)
  })

  it('allows negative stock when policy says warn', async () => {
    const { a, svc, para } = await setup()
    await createSettingsService(a).save({ overIssue: 'ALLOW_WARN' })
    await svc.save(base({ lines: [{ itemId: para.id, qty: para.currentStock + 5, rate: 100, discPct: 0 }] }))
    expect((await a.read<Item>('items')).find((i) => i.id === para.id)!.currentStock).toBe(-5)
  })

  it('uses IGST for other-state parties and adds credit to party balance', async () => {
    const { a, svc, para, parties } = await setup()
    const mumbai = parties.find((p) => p.stateCode === '27')!
    const v = await svc.save(base({ partyId: mumbai.id, payment: 'CREDIT', lines: [{ itemId: para.id, qty: 10, rate: para.issueRate, discPct: 0 }] }))
    expect(v.totals.igst).toBeGreaterThan(0)
    expect(v.totals.cgst + v.totals.sgst).toBe(0)
    expect((await a.read<Party>('parties')).find((p) => p.id === mumbai.id)!.balance).toBe(mumbai.balance + v.totals.grandTotal)
  })

  it('challan without tax has no GST; tax invoice ignores taxApplicable=false', async () => {
    const { svc, para } = await setup()
    const line = [{ itemId: para.id, qty: 1, rate: 10000, discPct: 0 }]
    const c = await svc.save(base({ mode: 'CHALLAN', taxApplicable: false, lines: line }))
    expect(c.totals.cgst + c.totals.sgst + c.totals.igst).toBe(0)
    const t = await svc.save(base({ mode: 'TAX_INVOICE', taxApplicable: false, lines: line }))
    expect(t.taxApplicable).toBe(true)
    expect(t.totals.cgst).toBeGreaterThan(0)
  })

  it('rejects duplicate typed numbers, empty vouchers and bad lines', async () => {
    const { svc, para } = await setup()
    const line = [{ itemId: para.id, qty: 1, rate: 100, discPct: 0 }]
    await expect(svc.save(base({ number: 'si-2026-0001', lines: line }))).rejects.toMatchObject({ code: 'DUPLICATE_NUMBER' })
    await expect(svc.save(base({ lines: [] }))).rejects.toBeInstanceOf(BillingError)
    await expect(svc.save(base({ lines: [{ ...line[0], qty: 0 }] }))).rejects.toMatchObject({ code: 'VALIDATION' })
    await expect(svc.save(base({ lines: [{ ...line[0], discPct: 101 }] }))).rejects.toMatchObject({ code: 'VALIDATION' })
  })

  it('rolls back every collection if a write fails midway', async () => {
    const { a, para } = await setup()
    const failing: StorageAdapter = { ...a, write: async (c, rows) => { if (c === 'vouchers') throw new Error('disk full'); return a.write(c, rows) } }
    const svc = createBillingService(failing)
    const items0 = JSON.stringify(await a.read('items')); const led0 = (await a.read('ledger')).length
    await expect(svc.save(base({ lines: [{ itemId: para.id, qty: 3, rate: 100, discPct: 0 }] }))).rejects.toMatchObject({ code: 'STORAGE' })
    expect(JSON.stringify(await a.read('items'))).toBe(items0)
    expect(await a.read('ledger')).toHaveLength(led0)
  })

  it('nextNumber follows the series and the date year', async () => {
    const { svc } = await setup()
    expect(await svc.nextNumber('2026-11-19')).toBe('SI-2026-0004')
    expect(await svc.nextNumber('2027-01-02')).toBe('SI-2027-0001')
  })
})

describe('billing.cancel / update', () => {
  const stockLedgerHolds = async (a: ReturnType<typeof createMemoryAdapter>) => {
    const items = await a.read<Item>('items'); const led = await a.read<StockLedgerEntry>('ledger')
    for (const it of items) expect(led.filter((e) => e.itemId === it.id).reduce((s, e) => s + e.qtyDelta, 0)).toBeCloseTo(it.currentStock, 6)
  }

  it('cancel restores stock, logs CANCEL, reverses credit, keeps the record', async () => {
    const { a, svc, para, parties } = await setup()
    const mumbai = parties.find((p) => p.stateCode === '27')!
    const v = await svc.save(base({ partyId: mumbai.id, payment: 'CREDIT', lines: [{ itemId: para.id, qty: 10, rate: 5000, discPct: 0 }] }))
    const c = await svc.cancel(v.id)
    expect(c.status).toBe('CANCELLED')
    expect(c.cancelledAt).toBeTruthy()
    expect((await a.read<Item>('items')).find((i) => i.id === para.id)!.currentStock).toBe(para.currentStock)
    expect((await a.read<Party>('parties')).find((p) => p.id === mumbai.id)!.balance).toBe(mumbai.balance)
    const types = (await a.read<StockLedgerEntry>('ledger')).filter((e) => e.voucherId === v.id).map((e) => e.type)
    expect(types).toEqual(['ISSUE', 'CANCEL'])
    expect(await a.read<Voucher>('vouchers')).toHaveLength(4)
    await stockLedgerHolds(a)
    await expect(svc.cancel(v.id)).rejects.toMatchObject({ code: 'VALIDATION' })
  })

  it('edit nets the stock change, keeps id and number, and adjusts credit', async () => {
    const { a, svc, para, surf, parties } = await setup()
    const mumbai = parties.find((p) => p.stateCode === '27')!
    const v = await svc.save(base({ partyId: mumbai.id, payment: 'CREDIT', lines: [{ itemId: para.id, qty: 10, rate: 5000, discPct: 0 }] }))
    const u = await svc.update(v.id, base({ number: v.number, partyId: mumbai.id, payment: 'CREDIT', lines: [{ itemId: para.id, qty: 4, rate: 5000, discPct: 0 }, { itemId: surf.id, qty: 1, rate: 10000, discPct: 0 }] }))
    expect(u.id).toBe(v.id); expect(u.number).toBe(v.number); expect(u.lines).toHaveLength(2)
    const items = await a.read<Item>('items')
    expect(items.find((i) => i.id === para.id)!.currentStock).toBe(para.currentStock - 4)
    expect(items.find((i) => i.id === surf.id)!.currentStock).toBe(surf.currentStock - 1)
    expect((await a.read<Party>('parties')).find((p) => p.id === mumbai.id)!.balance).toBe(mumbai.balance + u.totals.grandTotal)
    expect((await a.read<Voucher>('vouchers'))).toHaveLength(4)
    await stockLedgerHolds(a)
  })

  it('an edit that needs more than is in stock still saves', async () => {
    const { a, svc, para } = await setup()
    const v = await svc.save(base({ lines: [{ itemId: para.id, qty: para.currentStock, rate: 100, discPct: 0 }] })) // takes everything
    await svc.update(v.id, base({ number: v.number, lines: [{ itemId: para.id, qty: para.currentStock, rate: 100, discPct: 0 }] })) // same qty is fine
    await svc.update(v.id, base({ number: v.number, lines: [{ itemId: para.id, qty: para.currentStock + 1, rate: 100, discPct: 0 }] }))
    expect((await a.read<Item>('items')).find((i) => i.id === para.id)!.currentStock).toBe(-1)
    await stockLedgerHolds(a)
  })

  it('cannot edit a cancelled voucher or reuse another voucher number', async () => {
    const { svc, para } = await setup()
    const line = [{ itemId: para.id, qty: 1, rate: 100, discPct: 0 }]
    const v = await svc.save(base({ lines: line }))
    await expect(svc.update(v.id, base({ number: 'SI-2026-0001', lines: line }))).rejects.toMatchObject({ code: 'DUPLICATE_NUMBER' })
    await svc.cancel(v.id)
    await expect(svc.update(v.id, base({ number: v.number, lines: line }))).rejects.toMatchObject({ code: 'VALIDATION' })
  })

  it('cancel rolls back fully if a write fails', async () => {
    const { a, para } = await setup()
    const v = await createBillingService(a).save(base({ lines: [{ itemId: para.id, qty: 3, rate: 100, discPct: 0 }] }))
    const failing: StorageAdapter = { ...a, write: async (c, rows) => { if (c === 'vouchers') throw new Error('disk full'); return a.write(c, rows) } }
    const items0 = JSON.stringify(await a.read('items')); const led0 = (await a.read('ledger')).length
    await expect(createBillingService(failing).cancel(v.id)).rejects.toMatchObject({ code: 'STORAGE' })
    expect(JSON.stringify(await a.read('items'))).toBe(items0)
    expect(await a.read('ledger')).toHaveLength(led0)
  })
})

describe('hsnSummary', () => {
  it('groups by HSN+rate and ties out to voucher totals', async () => {
    const { svc, items, parties } = await setup()
    const { hsnSummary } = await import('@/lib/invoice')
    const pick = (c: string) => items.find((i) => i.code === c)!
    const mumbai = parties.find((p) => p.stateCode === '27')!
    for (const party of [null, mumbai.id]) {
      const v = await svc.save(base({ partyId: party, lines: [
        { itemId: pick('ITM-1001').id, qty: 3, rate: 2301, discPct: 0 }, { itemId: pick('ITM-1002').id, qty: 2, rate: 2851, discPct: 5 },
        { itemId: pick('ITM-1009').id, qty: 1, rate: 11800, discPct: 0 },
      ] }))
      const rows = hsnSummary(v, '29')
      expect(rows.length).toBe(2) // 30049099@12 (two items merged) and 34022090@18
      const sum = (k: 'cgst' | 'sgst' | 'igst' | 'taxable') => rows.reduce((s, r) => s + r[k], 0)
      expect(sum('cgst')).toBe(v.totals.cgst); expect(sum('sgst')).toBe(v.totals.sgst); expect(sum('igst')).toBe(v.totals.igst)
      expect(sum('taxable')).toBe(v.totals.taxable)
    }
  })
})

describe('non-GST business mode', () => {
  it('charges no tax on any voucher, including Tax Invoice type, on save and on edit', async () => {
    const { a, svc, para, parties } = await setup()
    await createSettingsService(a).save({ gstEnabled: false })
    const mumbai = parties.find((p) => p.stateCode === '27')!
    const v = await svc.save(base({ mode: 'TAX_INVOICE', taxApplicable: true, partyId: mumbai.id, lines: [{ itemId: para.id, qty: 10, rate: 10000, discPct: 0 }] }))
    expect(v.taxApplicable).toBe(false)
    expect(v.totals.cgst + v.totals.sgst + v.totals.igst).toBe(0)
    expect(v.totals.grandTotal).toBe(100000)
    const u = await svc.update(v.id, base({ number: v.number, mode: 'TAX_INVOICE', taxApplicable: true, lines: [{ itemId: para.id, qty: 5, rate: 10000, discPct: 0 }] }))
    expect(u.totals.grandTotal).toBe(50000)
    const { docTitleKey, voucherTypeLabel } = await import('@/lib/invoice')
    const keyOnly = ((k: string) => k) as unknown as import('i18next').TFunction
    expect(docTitleKey(u)).toBe('title.invoice'); expect(voucherTypeLabel(u, keyOnly)).toBe('voucherType.invoice')
  })
  it('older saved settings without the flag still mean GST is on', async () => {
    const a = createMemoryAdapter(); await writeSeed(a)
    const { gstEnabled: _drop, ...legacy } = (await a.read<Record<string, unknown>>('settings'))[0] as Record<string, unknown>
    void _drop
    await a.write('settings', [legacy])
    expect((await createSettingsService(a).get()).gstEnabled).toBe(true)
  })
})

describe('default over-issue policy', () => {
  it('warns but allows selling an item with 0 recorded stock', async () => {
    const a = createMemoryAdapter()
    await writeSeed(a)
    const svc = createBillingService(a)
    const it0 = (await a.read<Item>('items'))[0]
    await a.write('items', (await a.read<Item>('items')).map((i) => (i.id === it0.id ? { ...i, currentStock: 0 } : i)))
    await svc.save(base({ lines: [{ itemId: it0.id, qty: 2, rate: 100, discPct: 0 }] }))
    expect((await a.read<Item>('items')).find((i) => i.id === it0.id)!.currentStock).toBe(-2)
  })
})

describe('selling in another unit', () => {
  async function riceSetup() {
    const s = await setup()
    const rice: Item = { ...s.para, id: 'rice-1', code: 'RICE-1', name: 'Basmati Rice', unit: 'KG', altUnits: [{ unit: 'GM', per: 1000 }], issueRate: 10000, gstPercent: 5, currentStock: 10 }
    await s.a.write('items', [...s.items, rice])
    return { ...s, rice }
  }
  const stock = async (a: StorageAdapter, id: string) => (await a.read<Item>('items')).find((i) => i.id === id)!.currentStock

  it('900 GM of a KG item takes 0.9 KG, bills 900 GM at the KG rate, and the ledger agrees', async () => {
    const { a, svc, rice } = await riceSetup()
    const v = await svc.save(base({ lines: [{ itemId: rice.id, qty: 900, unit: 'GM', rate: 10000, discPct: 0 }] }))
    expect(v.lines[0]).toMatchObject({ unit: 'GM', qty: 900, per: 1000, baseUnit: 'KG', stockQty: 0.9 })
    expect(v.totals.taxable).toBe(9000)
    expect(await stock(a, rice.id)).toBe(9.1)
    const led = (await a.read<StockLedgerEntry>('ledger')).filter((e) => e.voucherId === v.id)
    expect(led.map((e) => [e.qtyDelta, e.balanceAfter])).toEqual([[-0.9, 9.1]])
  })

  it('editing and cancelling put back the stock in the item unit', async () => {
    const { a, svc, rice } = await riceSetup()
    const v = await svc.save(base({ lines: [{ itemId: rice.id, qty: 250, unit: 'GM', rate: 10000, discPct: 0 }, { itemId: rice.id, qty: 1, rate: 10000, discPct: 0 }] }))
    expect(await stock(a, rice.id)).toBe(8.75)
    await svc.update(v.id, base({ number: v.number, lines: [{ itemId: rice.id, qty: 500, unit: 'GM', rate: 10000, discPct: 0 }] }))
    expect(await stock(a, rice.id)).toBe(9.5)
    await svc.cancel(v.id)
    expect(await stock(a, rice.id)).toBe(10)
  })

  it('refuses a unit the item is not sold in', async () => {
    const { svc, rice } = await riceSetup()
    await expect(svc.save(base({ lines: [{ itemId: rice.id, qty: 1, unit: 'LTR', rate: 10000, discPct: 0 }] }))).rejects.toMatchObject({ key: 'lineUnit' })
  })
})
