import { describe, expect, it } from 'vitest'
import { billableRows, blankRow, parseBillDiscount, parseDisc, parseQty, rankItems, repriceRows, rowStatus, usageByItem } from './billing'
import { matchesQuery } from './search'
import { buildSeed } from '@/services/seed'

const items = buildSeed().items

describe('parsers', () => {
  it('qty', () => { expect(parseQty('2.5')).toBe(2.5); expect(parseQty('0')).toBeNull(); expect(parseQty('x')).toBeNull(); expect(parseQty('')).toBeNull() })
  it('disc', () => { expect(parseDisc('')).toBe(0); expect(parseDisc('12.5')).toBe(12.5); expect(parseDisc('101')).toBeNull(); expect(parseDisc('-1')).toBeNull() })
  it('bill discount', () => {
    expect(parseBillDiscount('')).toBeNull()
    expect(parseBillDiscount('5%')).toEqual({ type: 'PCT', value: 5 })
    expect(parseBillDiscount('250')).toEqual({ type: 'AMT', value: 25000 })
    expect(parseBillDiscount('abc')).toBe('invalid')
    expect(parseBillDiscount('150%')).toBe('invalid')
  })
})

describe('rows', () => {
  const it0 = items[0]
  it('aggregates usage and flags shortage across duplicate lines', () => {
    const rows = [{ ...blankRow(), item: it0, qty: '150' }, { ...blankRow(), item: it0, qty: '100' }]
    const usage = usageByItem(rows)
    expect(usage.get(it0.id)).toBe(250)
    expect(rowStatus(rows[0], usage).shortBy).toEqual({ available: it0.currentStock, requested: 250 })
    expect(rowStatus({ ...rows[0], qty: '1' }, new Map([[it0.id, 1]])).shortBy).toBeUndefined()
  })
  it('billable rows need an item and valid qty', () => {
    const rows = [{ ...blankRow(), item: it0, qty: '2' }, { ...blankRow(), item: it0, qty: '' }, blankRow()]
    expect(billableRows(rows)).toHaveLength(1)
  })
  it('reprice keeps hand-edited rates', () => {
    const rows = [{ ...blankRow(), item: it0, rate: '1.00', rateTouched: true }, { ...blankRow(), item: it0, rate: '9.99' }]
    const out = repriceRows(rows, 'COST')
    expect(out[0].rate).toBe('1.00')
    expect(out[1].rate).toBe((it0.purchaseRate / 100).toFixed(2))
  })
  it('ranks code match, then name prefix, then contains', () => {
    const r = rankItems(items, 'para', matchesQuery)
    expect(r[0].name.toLowerCase().startsWith('para')).toBe(true)
    expect(rankItems(items, 'itm-1009', matchesQuery)[0].code).toBe('ITM-1009')
    expect(rankItems(items, '', matchesQuery).length).toBe(items.length)
  })
})
