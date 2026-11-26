import { roundQty } from './qty'
import type { Paise } from './money'
import type { ReturnSettlement, SalesReturn, Voucher } from '@/services/types'

/**
 * Sales returns (credit notes), worked out from the bill's own lines: their share of any bill discount and their tax, never today's prices.
 * The part of a line already returned is taken away first, so the last return of a line gets exactly what is left and every return of a bill
 * adds up to the bill to the paisa. Same rules as the server (rapidbill-be/src/domain/returns.ts) and the phone app (src/core/returns.ts).
 */
type Bill = Pick<Voucher, 'lines' | 'totals'> & { returned?: number[] }

export type ReturnProblem =
  | { key: 'returnNothing' }
  | { key: 'returnLineGone'; n: number }
  | { key: 'returnLineTwice'; n: number }
  | { key: 'returnQty'; n: number }
  | { key: 'returnTooMany'; n: number; left: number }

export interface BuiltLine { line: number; qty: number; stockQty: number; taxable: Paise; tax: Paise; total: Paise }
export interface Built { lines: BuiltLine[]; totals: SalesReturn['totals'] }

/** What can still come back on each line of a bill: sold minus already returned (in the unit it was sold in). */
export const returnableLeft = (b: Pick<Bill, 'lines' | 'returned'>): number[] => b.lines.map((l, i) => roundQty(Math.max(0, l.qty - (b.returned?.[i] ?? 0))))

/** Has anything on this bill come back (on a return that is not cancelled)? Such a bill cannot be edited or cancelled. */
export const hasReturns = (b: Pick<Bill, 'returned'>): boolean => (b.returned ?? []).some((q) => q > 0)

/** The bill was split CGST+SGST or IGST; its returns are split the same way. */
export const billInterState = (b: Pick<Voucher, 'totals'>): boolean => b.totals.igst > 0

export function buildReturn(b: Bill, want: { line: number; qty: number }[], interState: boolean): Built | ReturnProblem {
  const asked = want.filter((w) => w.qty !== 0)
  if (asked.length === 0) return { key: 'returnNothing' }
  const seen = new Set<number>()
  const left = returnableLeft(b)
  const out: BuiltLine[] = []
  for (const [n, w] of asked.entries()) {
    const l = b.lines[w.line]
    if (!l) return { key: 'returnLineGone', n: n + 1 }
    if (seen.has(w.line)) return { key: 'returnLineTwice', n: w.line + 1 }
    seen.add(w.line)
    const q = roundQty(w.qty)
    if (!Number.isFinite(w.qty) || !(q > 0)) return { key: 'returnQty', n: w.line + 1 }
    if (q > left[w.line]! + 1e-9) return { key: 'returnTooMany', n: w.line + 1, left: left[w.line]! }
    const before = b.returned?.[w.line] ?? 0
    const share = (x: number) => Math.round((x * roundQty(before + q)) / l.qty) - Math.round((x * before) / l.qty)
    const taxable = share(l.taxable)
    const tax = share(l.tax)
    out.push({ line: w.line, qty: q, stockQty: roundQty(q / (l.per ?? 1)), taxable, tax, total: taxable + tax })
  }
  const taxable = out.reduce((s, l) => s + l.taxable, 0)
  const tax = out.reduce((s, l) => s + l.tax, 0)
  const cgst = interState ? 0 : out.reduce((s, l) => s + Math.floor(l.tax / 2), 0)
  const sgst = interState ? 0 : tax - cgst
  const igst = interState ? tax : 0
  const exact = taxable + tax
  // Round off the way the bill did, but on the running total of everything returned from it: each return is the rounded total after it
  // minus the rounded total before it. So returns never add up to more than the bill, and returning everything gives back exactly its total.
  const before = b.lines.map((_, i) => b.returned?.[i] ?? 0)
  const after = before.slice()
  for (const l of out) after[l.line] = roundQty(after[l.line]! + l.qty)
  const exactOf = (q: number[]) => b.lines.reduce((s, l, i) => s + Math.round((l.taxable * q[i]!) / l.qty) + Math.round((l.tax * q[i]!) / l.qty), 0)
  const all = (q: number[]) => b.lines.every((l, i) => q[i]! >= l.qty - 1e-9)
  const roundedOf = (q: number[]) => (b.totals.roundOff === 0 ? exactOf(q) : all(q) ? b.totals.grandTotal : Math.round(exactOf(q) / 100) * 100)
  const rounded = roundedOf(after) - roundedOf(before)
  return {
    lines: out,
    totals: { itemCount: out.length, totalQty: roundQty(out.reduce((s, l) => s + l.qty, 0)), taxable, cgst, sgst, igst, roundOff: rounded - exact, grandTotal: rounded },
  }
}

/** How the money goes back by default: off the balance for a credit bill with a party, otherwise the way the bill was paid. */
export function defaultSettlement(b: Pick<Voucher, 'payment' | 'partyId'>): ReturnSettlement {
  if (b.payment === 'CREDIT' && b.partyId) return 'ADJUST'
  if (b.payment === 'PAID_UPI') return 'UPI'
  if (b.payment === 'PAID_BANK') return 'BANK'
  return 'CASH'
}

/** The return's own document title: a credit note when the bill carried GST, a plain sales return otherwise. */
export const returnTitleKey = (r: Pick<SalesReturn, 'taxApplicable'>): 'creditNote' | 'salesReturn' => (r.taxApplicable ? 'creditNote' : 'salesReturn')
