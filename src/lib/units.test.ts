import { describe, expect, it } from 'vitest'
import { blankRow, rowStockQty, rowStatus, usageByItem } from './billing'
import { emptyDraft, validateItemDraft } from './itemForm'
import { lineStockQty, sellingUnit, snapPer, stockQtyOf, stockText, unitsOf } from './units'
import type { Item } from '@/services'

const rice = { id: 'r', unit: 'KG', altUnits: [{ unit: 'GM', per: 1000 }], currentStock: 10 } as unknown as Item

describe('units', () => {
  it('lists the own unit first, then the alternates', () => { expect(unitsOf(rice)).toEqual(['KG', 'GM']) })
  it('converts to the item unit', () => {
    expect(sellingUnit(rice, 'GM')).toEqual({ unit: 'GM', per: 1000 })
    expect(sellingUnit(rice, '')).toEqual({ unit: 'KG', per: 1 })
    expect(sellingUnit(rice, 'KG')).toEqual({ unit: 'KG', per: 1 })
    expect(sellingUnit(rice, 'LTR')).toBeNull()
    expect(stockQtyOf(900, 1000)).toBe(0.9)
    expect(stockQtyOf(5, 12)).toBe(0.416667)
  })
  it('older lines took their qty from stock', () => { expect(lineStockQty({ qty: 3 })).toBe(3); expect(lineStockQty({ qty: 900, stockQty: 0.9 })).toBe(0.9) })
  it('a row sold in GM uses stock in KG, and the stock check follows', () => {
    const r = { ...blankRow(), item: rice, qty: '900', unit: 'GM' }
    expect(rowStockQty(r)).toBe(0.9)
    const big = { ...blankRow(), item: rice, qty: '12000', unit: 'GM' }
    expect(rowStatus(big, usageByItem([big])).shortBy).toEqual({ available: 10, requested: 12 })
    expect(rowStatus(r, usageByItem([r, r])).shortBy).toBeUndefined()
  })
})

describe('item form: also sold in', () => {
  const ok = { ...emptyDraft('ITM-1'), name: 'Rice', issueRate: '100', unit: 'KG' }
  it('accepts a valid conversion', () => {
    const v = validateItemDraft({ ...ok, altUnits: [{ unit: 'GM', per: '1000' }] }, [])
    expect(v.value?.altUnits).toEqual([{ unit: 'GM', per: 1000 }])
  })
  it('refuses the item unit again, a repeat, or a missing number', () => {
    expect(validateItemDraft({ ...ok, altUnits: [{ unit: 'KG', per: '2' }] }, []).errors.altUnits?.key).toBe('form.err.altSame')
    expect(validateItemDraft({ ...ok, altUnits: [{ unit: 'GM', per: '1000' }, { unit: 'GM', per: '500' }] }, []).errors.altUnits?.key).toBe('form.err.altSame')
    expect(validateItemDraft({ ...ok, altUnits: [{ unit: 'GM', per: '' }] }, []).errors.altUnits?.key).toBe('form.err.altPer')
    expect(validateItemDraft({ ...ok, altUnits: [{ unit: 'GM', per: '0' }] }, []).errors.altUnits?.key).toBe('form.err.altPer')
  })
})

describe('stock as people say it', () => {
  const kg = { unit: 'KG', altUnits: [{ unit: 'GM', per: 1000 }] } as unknown as Item
  it('splits into the item unit and the smaller unit', () => {
    expect(stockText(kg, 4.756)).toBe('4 KG 756 GM')
    expect(stockText(kg, 0.9)).toBe('900 GM')
    expect(stockText(kg, 500)).toBe('500 KG')
    expect(stockText({ unit: 'PCS' } as unknown as Item, 12.5)).toBe('12.5 PCS')
    expect(stockText({ unit: 'DOZ', altUnits: [{ unit: 'PCS', per: 12 }] } as unknown as Item, 9.583333)).toBe('9 DOZ 7 PCS')
  })
  it('keeps the plain number when the rest is not whole', () => {
    expect(stockText({ unit: 'KG', altUnits: [{ unit: 'GM', per: 3 }] } as unknown as Item, 1.1)).toBe('1.1 KG')
  })
})

describe('snapPer', () => {
  it('turns what people type for a bigger unit into an exact 1/N', () => {
    expect(snapPer(0.083333)).toBe(1 / 12)
    expect(snapPer(0.0833)).toBe(1 / 12)
    expect(snapPer(0.5)).toBe(0.5)
    expect(snapPer(0.3)).toBe(0.3) // 1/0.3 = 3.33, not a whole number
    expect(snapPer(1000)).toBe(1000)
    expect(snapPer(3.28084)).toBe(3.28084)
  })
})
