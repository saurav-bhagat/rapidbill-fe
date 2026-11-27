import { describe, expect, it } from 'vitest'
import { createMemoryAdapter } from './storage/memoryAdapter'
import { createInventoryService } from './inventory'
import { createRepo } from './repo'
import { buildSeed } from './seed'
import type { Item } from './types'
import { checkGstin, gstinCheckDigit } from '@/lib/gst'
import { draftFromItem, emptyDraft, nextItemCode, validateItemDraft, formatExpiryInput } from '@/lib/itemForm'
import { matchesQuery } from '@/lib/search'
import { itemsToRows } from '@/lib/exportItems'

const base = { name: 'Test', code: 'ITM-9001', category: 'X', hsn: '', unit: 'KG' as const, batchNo: '', expiry: '', mrp: 0, purchaseRate: 0, issueRate: 100, gstPercent: 5, currentStock: 2.5, lowStockThreshold: 1 }

describe('inventory service', () => {
  it('keeps stock equal to the ledger sum, including decimals', async () => {
    const a = createMemoryAdapter()
    const inv = createInventoryService(a)
    const item = await inv.createItem(base)
    await inv.adjustStock(item.id, 0.1, 'found')
    await inv.adjustStock(item.id, 0.2, 'found')
    await inv.adjustStock(item.id, -1, 'damaged')
    const stock = (await createRepo<Item>(a, 'items').get(item.id))!.currentStock
    const ledger = await inv.ledgerFor(item.id)
    expect(stock).toBe(1.8)
    expect(ledger.reduce((s, e) => s + e.qtyDelta, 0)).toBeCloseTo(stock, 6)
    expect(ledger.at(-1)!.balanceAfter).toBe(stock)
    expect(ledger[0].type).toBe('OPENING')
  })
  it('rejects duplicate codes and does not let update touch stock', async () => {
    const inv = createInventoryService(createMemoryAdapter())
    const a = await inv.createItem(base)
    await expect(inv.createItem({ ...base, name: 'Other' })).rejects.toThrow(/already used/)
    const b = await inv.createItem({ ...base, code: 'ITM-9002' })
    await expect(inv.updateItem(b.id, { code: a.code })).rejects.toThrow()
    const u = await inv.updateItem(a.id, { name: 'Renamed', ...({ currentStock: 999 } as object) })
    expect(u.name).toBe('Renamed')
    expect(u.currentStock).toBe(2.5)
  })
  it('zero-stock create writes no opening entry', async () => {
    const inv = createInventoryService(createMemoryAdapter())
    const i = await inv.createItem({ ...base, currentStock: 0 })
    expect(await inv.ledgerFor(i.id)).toHaveLength(0)
  })
})

describe('seed integrity', () => {
  it('every item stock equals its ledger sum', () => {
    const s = buildSeed()
    for (const it of s.items) {
      const sum = s.ledger.filter((e) => e.itemId === it.id).reduce((t, e) => t + e.qtyDelta, 0)
      expect(sum).toBe(it.currentStock)
    }
  })
})

describe('gstin', () => {
  it('validates shape, state and check digit', () => {
    const body = '29ABCDE1234F1Z'
    const good = body + gstinCheckDigit(body)
    expect(checkGstin(good)).toEqual({ stateCode: '29' })
    expect(checkGstin(body + (good.endsWith('A') ? 'B' : 'A')).warning).toBeTruthy()
    expect(checkGstin('123').error).toBeTruthy()
    expect(checkGstin('99ABCDE1234F1Z5').error).toMatch(/state/i)
    expect(checkGstin('')).toEqual({})
  })
})

describe('item form', () => {
  it('generates the next code', () => {
    expect(nextItemCode([])).toBe('ITM-1001')
    expect(nextItemCode(['ITM-1018', 'ITM-1003', 'X'])).toBe('ITM-1019')
  })
  it('formats expiry as typed', () => {
    expect(formatExpiryInput('0827')).toBe('08/27')
    expect(formatExpiryInput('08')).toBe('08')
  })
  it('validates required fields, codes and ranges', () => {
    const bad = validateItemDraft({ ...emptyDraft('ITM-1001'), hsn: '12', expiry: '13/27' }, ['ITM-1001'])
    expect(Object.keys(bad.errors).sort()).toEqual(['code', 'expiry', 'hsn', 'issueRate', 'name'])
    const ok = validateItemDraft({ ...emptyDraft('ITM-1002'), name: ' Soap ', issueRate: '1,250.50', mrp: '1000' }, [])
    expect(ok.value?.issueRate).toBe(125050)
    expect(ok.value?.name).toBe('Soap')
    expect(ok.warnings[0].key).toBe('form.warn.aboveMrp')
  })
  it('round-trips a seeded item through a draft', () => {
    const it = buildSeed().items[0]
    const { value, errors } = validateItemDraft(draftFromItem(it), [])
    expect(errors).toEqual({})
    expect(value?.mrp).toBe(it.mrp)
    expect(value?.currentStock).toBe(it.currentStock)
  })
})

describe('search & export', () => {
  it('matches all tokens across fields', () => {
    expect(matchesQuery('para cipla', ['Paracetamol 500', 'Cipla', 'ITM-1001'])).toBe(true)
    expect(matchesQuery('para zydus', ['Paracetamol 500', 'Cipla'])).toBe(false)
    expect(matchesQuery('', ['x'])).toBe(true)
  })
  it('exports rupees, not paise', () => {
    const row = itemsToRows(buildSeed().items.slice(0, 1))[0]
    expect(row['MRP']).toBe(28.5)
    expect(Object.keys(row)).toContain('Item Code')
  })
})

describe('demo data', () => {
  it('uses GSTINs with valid check digits', async () => {
    const { demoSettings } = await import('./settings')
    const seed = buildSeed()
    for (const g of [demoSettings().gstin, ...seed.parties.map((p) => p.gstin).filter(Boolean)]) expect(checkGstin(g), g).toEqual({ stateCode: g.slice(0, 2) })
  })
})
