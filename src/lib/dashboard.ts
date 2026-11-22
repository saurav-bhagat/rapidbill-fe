import { addDays, format, parseISO } from 'date-fns'
import type { Item, Voucher } from '@/services/types'
import type { Paise } from './money'
import { roundQty } from './qty'

export interface Period { bills: number; amount: Paise; qty: number; tax: Paise }
export interface DayPoint { date: string; amount: Paise; bills: number }
export interface TopItem { itemId: string; name: string; code: string; unit: string; qty: number; amount: Paise }

export interface Dashboard {
  today: Period
  yesterday: Period
  month: Period
  series: DayPoint[]
  lowStock: Item[]
  outOfStock: Item[]
  negativeStock: Item[]
  stockValue: Paise
  itemCount: number
  topItems: TopItem[]
  recent: Voucher[]
}

const empty = (): Period => ({ bills: 0, amount: 0, qty: 0, tax: 0 })
const iso = (d: Date) => format(d, 'yyyy-MM-dd')

function add(p: Period, v: Voucher) {
  p.bills += 1
  p.amount += v.totals.grandTotal
  p.qty = roundQty(p.qty + v.totals.totalQty)
  p.tax += v.totals.cgst + v.totals.sgst + v.totals.igst
}

/**
 * Everything the Home page shows, computed from raw records in one pass. Cancelled vouchers are ignored.
 * `today` is passed in (yyyy-MM-dd) so the result is deterministic in tests.
 */
export function buildDashboard(vouchers: Voucher[], items: Item[], today: string, days = 7): Dashboard {
  const yesterday = iso(addDays(parseISO(today), -1))
  const monthStart = `${today.slice(0, 7)}-01`
  const first = iso(addDays(parseISO(today), -(days - 1)))

  const t = empty(), y = empty(), m = empty()
  const byDay = new Map<string, DayPoint>()
  for (let i = 0; i < days; i++) {
    const d = iso(addDays(parseISO(first), i))
    byDay.set(d, { date: d, amount: 0, bills: 0 })
  }
  const top = new Map<string, TopItem>()
  const active = vouchers.filter((v) => v.status === 'ACTIVE')

  for (const v of active) {
    if (v.date === today) add(t, v)
    if (v.date === yesterday) add(y, v)
    const day = byDay.get(v.date)
    if (day) { day.amount += v.totals.grandTotal; day.bills += 1 }
    if (v.date >= monthStart && v.date <= today) {
      add(m, v)
      for (const l of v.lines) {
        const cur = top.get(l.itemId) ?? { itemId: l.itemId, name: l.name, code: l.code, unit: l.baseUnit ?? l.unit, qty: 0, amount: 0 }
        cur.qty = roundQty(cur.qty + (l.stockQty ?? l.qty))
        cur.amount += l.total
        top.set(l.itemId, cur)
      }
    }
  }

  const byName = (a: Item, b: Item) => a.name.localeCompare(b.name)
  return {
    today: t, yesterday: y, month: m,
    series: [...byDay.values()],
    negativeStock: items.filter((i) => i.currentStock < 0).sort((a, b) => a.currentStock - b.currentStock),
    outOfStock: items.filter((i) => i.currentStock === 0).sort(byName),
    lowStock: items.filter((i) => i.currentStock > 0 && i.currentStock <= i.lowStockThreshold).sort((a, b) => a.currentStock - b.currentStock),
    stockValue: items.reduce((s, i) => s + Math.round(Math.max(0, i.currentStock) * i.purchaseRate), 0),
    itemCount: items.length,
    topItems: [...top.values()].sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name)).slice(0, 5),
    recent: [...active].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8),
  }
}

/** % change vs a previous value. null when there is nothing to compare against. */
export function changePct(now: number, before: number): number | null {
  if (before <= 0) return null
  return Math.round(((now - before) / before) * 100)
}
