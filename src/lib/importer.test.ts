import { describe, expect, it } from 'vitest'
import { autoMap, buildPreview, detectHeaderRow, parseExpiry, parseNumber, parseUnit, SAMPLE_CSV, type Cell, type ImportOptions, type ItemData } from './importer'
import { createMemoryAdapter } from '@/services/storage/memoryAdapter'
import { createInventoryService, type ImportOp } from '@/services/inventory'
import { writeSeed, buildSeed } from '@/services/seed'
import type { Item, StockLedgerEntry } from '@/services/types'

const csv = (s: string): Cell[][] => s.split('\n').map((l) => l.split(','))
const sample = csv(SAMPLE_CSV)
const UP: ImportOptions = { mode: 'UPSERT', stockMode: 'REPLACE' }
const seed = buildSeed().items

describe('headers', () => {
  it('finds the header row below Marg title lines', () => expect(detectHeaderRow(sample)).toBe(2))
  it('maps Marg-style headers', () => {
    const m = autoMap(sample[2])
    expect(sample[2][m.name]).toBe('Item Name'); expect(sample[2][m.category]).toBe('Company'); expect(sample[2][m.batchNo]).toBe('Batch')
    expect(sample[2][m.expiry]).toBe('Exp'); expect(sample[2][m.purchaseRate]).toBe('P.Rate'); expect(sample[2][m.issueRate]).toBe('S.Rate')
    expect(sample[2][m.gstPercent]).toBe('GST%'); expect(sample[2][m.currentStock]).toBe('Cl.Stock'); expect(sample[2][m.mrp]).toBe('MRP')
    expect(m.unit).toBe(-1) // "Pack" is a pack size, not a unit: left for the user
  })
  it('maps other vendors’ words', () => {
    const m = autoMap(['Particulars', 'Closing Qty', 'Selling Price', 'Product Code', 'Cost Price', 'HSN/SAC'])
    expect([m.name, m.currentStock, m.issueRate, m.code, m.purchaseRate, m.hsn]).toEqual([0, 1, 2, 3, 4, 5])
  })
})

describe('cell parsers', () => {
  it('numbers', () => { expect(parseNumber('₹1,250.50')).toBe(1250.5); expect(parseNumber('(5)')).toBe(-5); expect(parseNumber('')).toBeUndefined(); expect(parseNumber('abc')).toBe('bad') })
  it('units', () => { expect(parseUnit('Tablet')).toBe('STRIP'); expect(parseUnit('Kgs')).toBe('KG'); expect(parseUnit('10x10')).toBeUndefined() })
  it('expiry formats', () => {
    expect(parseExpiry('08/27')).toBe('08/27'); expect(parseExpiry('8/2027')).toBe('08/27'); expect(parseExpiry('Aug-27')).toBe('08/27')
    expect(parseExpiry('2027-08-31')).toBe('08/27'); expect(parseExpiry(new Date(Date.UTC(2027, 7, 15)))).toBe('08/27') ; expect(parseExpiry('')).toBe('')
    expect(parseExpiry('soon')).toBeNull(); expect(parseExpiry('13/27')).toBeNull()
    expect(parseExpiry(46630)).toBe('08/27') // Excel serial for 2027-08-xx
  })
})

describe('buildPreview', () => {
  const map = autoMap(sample[2])
  it('matches existing items by name+batch, creates the rest, skips the totals row', () => {
    const p = buildPreview(sample, 2, map, seed, UP)
    const by = (n: string) => p.find((r) => r.name.startsWith(n))!
    expect(by('Paracetamol').action).toBe('update')
    expect(by('Paracetamol').matchId).toBe(seed.find((i) => i.name.startsWith('Paracetamol'))!.id)
    expect(p.find((r) => r.name === 'Total')!.action).toBe('skip')
  })
  it('replace sets stock to the file value; add increases it', () => {
    const para = seed.find((i) => i.name.startsWith('Paracetamol'))!
    const rep = buildPreview(sample, 2, map, seed, UP).find((r) => r.name.startsWith('Paracetamol'))!
    expect(rep.stockDelta).toBe(240 - para.currentStock)
    const add = buildPreview(sample, 2, map, seed, { mode: 'UPSERT', stockMode: 'ADD' }).find((r) => r.name.startsWith('Paracetamol'))!
    expect(add.stockDelta).toBe(240)
  })
  it('skip mode leaves existing alone', () => {
    const p = buildPreview(sample, 2, map, seed, { mode: 'SKIP', stockMode: 'REPLACE' })
    expect(p.find((r) => r.name.startsWith('Paracetamol'))!.action).toBe('skip')
    expect(p.filter((r) => r.action === 'create')).toHaveLength(0) // every sample row exists in the seed
  })
  it('creates new items with generated codes and flags problems', () => {
    const rows = csv('Item Name,MRP,Cl.Stock,GST%,Exp\nNew Soap,50,-3,7,soon\nNew Soap,50,4,,\n,10,1,12,\nTotal,,9,,')
    const m = autoMap(rows[0])
    const p = buildPreview(rows, 0, m, seed, UP)
    expect(p).toHaveLength(4)
    const [a, dup, empty, total] = p
    expect(a.action).toBe('create'); expect(a.code).toBe('ITM-1019'); expect(a.data.issueRate).toBe(5000); expect(a.data.gstPercent).toBe(12)
    const wk = a.warnings.map((w) => w.key); expect(wk).toContain('warn.stockNegative'); expect(wk).toContain('warn.gstSlab'); expect(wk).toContain('warn.expiry'); expect(wk).toContain('warn.rateFromMrp')
    expect(dup.action).toBe('skip'); expect(dup.note).toEqual({ key: 'note.mergedInto', params: { row: 2 } }); expect(a.stock).toBe(4)
    expect(empty.action).toBe('error'); expect(total.action).toBe('skip')
  })
  it('does not overwrite with blanks and handles GST fractions', () => {
    const rows = csv('Item Name,Batch,S.Rate,GST\nParacetamol 500mg Tab,PCM2411,,0.12')
    const [u] = buildPreview(rows, 0, autoMap(rows[0]), seed, UP)
    expect(u.action).toBe('update'); expect(u.data.issueRate).toBeUndefined(); expect(u.data.gstPercent).toBe(12)
  })
})

describe('importItems service', () => {
  it('applies ops, writes IMPORT ledger entries, keeps stock == ledger', async () => {
    const a = createMemoryAdapter(); await writeSeed(a)
    const inv = createInventoryService(a)
    const items = await a.read<Item>('items')
    const map = autoMap(sample[2])
    const rows = csv(SAMPLE_CSV + '\nBrand New Item,1,Acme,,,,10,5,8,18,7')
    const p = buildPreview(rows, 2, map, items, UP)
    const ops: ImportOp[] = p.flatMap((r): ImportOp[] => r.action === 'create' ? [{ kind: 'create', data: { ...(r.data as ItemData), currentStock: r.stock ?? 0 } }] : r.action === 'update' ? [{ kind: 'update', id: r.matchId!, patch: r.data as Omit<ItemData, 'currentStock'>, stockDelta: r.stockDelta }] : [])
    const res = await inv.importItems(ops, 'test.csv')
    expect(res.created).toBe(1); expect(res.updated).toBe(5)
    const after = await a.read<Item>('items'); const led = await a.read<StockLedgerEntry>('ledger')
    expect(after.find((i) => i.name === 'Brand New Item')!.currentStock).toBe(7)
    expect(after.find((i) => i.name.startsWith('Paracetamol'))!.currentStock).toBe(240)
    for (const it of after) expect(led.filter((e) => e.itemId === it.id).reduce((s, e) => s + e.qtyDelta, 0)).toBeCloseTo(it.currentStock, 6)
    expect(led.some((e) => e.type === 'IMPORT')).toBe(true)
  })
  it('rolls back when a write fails', async () => {
    const a = createMemoryAdapter(); await writeSeed(a)
    const failing = { ...a, write: async (c: string, rows: unknown[]) => { if (c === 'ledger') throw new Error('disk full'); return a.write(c, rows) } }
    const before = JSON.stringify(await a.read('items'))
    await expect(createInventoryService(failing as never).importItems([{ kind: 'create', data: { ...(seed[0] as unknown as ItemData), code: 'ZZ-1', currentStock: 5 } }], 'x')).rejects.toThrow(/rolled back/)
    expect(JSON.stringify(await a.read('items'))).toBe(before)
  })
})

describe('non-GST business import', () => {
  it('defaults new items to 0% GST without warning', () => {
    const rows = csv('Item Name,MRP\nPlain Item,20')
    const [r] = buildPreview(rows, 0, autoMap(rows[0]), seed, { mode: 'UPSERT', stockMode: 'REPLACE', gstEnabled: false })
    expect(r.data.gstPercent).toBe(0)
    expect(r.warnings.map((w) => w.key)).not.toContain('warn.gstMissing')
  })
})
