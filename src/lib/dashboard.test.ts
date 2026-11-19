import { describe, expect, it } from 'vitest'
import { buildDashboard, changePct } from './dashboard'
import type { Item, Voucher } from '@/services/types'

const item = (o: Partial<Item>): Item => ({ id: 'i', name: 'X', code: 'C', purchaseRate: 1000, currentStock: 10, lowStockThreshold: 5, ...o } as Item)
const vch = (o: Partial<Voucher> & { total: number; qty?: number; lines?: Voucher['lines'] }): Voucher => ({
  id: o.id ?? Math.random().toString(), number: 'N', date: '2026-11-19', status: 'ACTIVE', createdAt: o.createdAt ?? '2026-11-19T10:00:00Z', lines: o.lines ?? [],
  totals: { grandTotal: o.total, totalQty: o.qty ?? 1, cgst: 10, sgst: 10, igst: 0 }, ...o,
} as unknown as Voucher)

describe('buildDashboard', () => {
  it('splits today, yesterday and month; ignores cancelled', () => {
    const d = buildDashboard([
      vch({ total: 10000 }), vch({ total: 5000 }), vch({ total: 7000, date: '2026-11-18' }),
      vch({ total: 99999, status: 'CANCELLED' }), vch({ total: 3000, date: '2026-10-31' }),
    ], [], '2026-11-19')
    expect(d.today).toMatchObject({ bills: 2, amount: 15000, tax: 40 })
    expect(d.yesterday.amount).toBe(7000)
    expect(d.month.amount).toBe(22000)
    expect(d.series).toHaveLength(7)
    expect(d.series.at(-1)).toMatchObject({ date: '2026-11-19', amount: 15000 })
    expect(d.series.find((p) => p.date === '2026-11-13')?.amount).toBe(0)
  })
  it('classifies stock health and values stock at cost without negatives', () => {
    const d = buildDashboard([], [
      item({ id: 'a', currentStock: 0 }), item({ id: 'b', currentStock: -3 }), item({ id: 'c', currentStock: 4 }), item({ id: 'd', currentStock: 50 }),
    ], '2026-11-19')
    expect(d.outOfStock.map((i) => i.id)).toEqual(['a'])
    expect(d.negativeStock.map((i) => i.id)).toEqual(['b'])
    expect(d.lowStock.map((i) => i.id)).toEqual(['c'])
    expect(d.stockValue).toBe((4 + 50) * 1000)
  })
  it('ranks top items by value this month', () => {
    const line = (itemId: string, qty: number, total: number) => ({ itemId, name: itemId, code: itemId, unit: 'PCS', qty, total }) as Voucher['lines'][number]
    const d = buildDashboard([vch({ total: 1, lines: [line('a', 2, 500), line('b', 1, 900)] }), vch({ total: 1, lines: [line('a', 1, 300)] })], [], '2026-11-19')
    expect(d.topItems.map((t) => [t.itemId, t.qty, t.amount])).toEqual([['b', 1, 900], ['a', 3, 800]])
  })
})

describe('changePct', () => {
  it('handles no baseline', () => { expect(changePct(5, 0)).toBeNull(); expect(changePct(150, 100)).toBe(50); expect(changePct(50, 100)).toBe(-50) })
})
