import { newId } from './id'
import { parseRupees, type Paise } from './money'
import { roundQty } from './qty'
import type { Item } from '@/services/types'
import { sellingUnit, stockQtyOf } from './units'

/** One line in the billing grid. Inputs stay as strings while the user types. */
export interface Row {
  key: string
  item?: Item
  /** Text typed into the item cell while searching. */
  query: string
  qty: string
  rate: string
  disc: string
  /** The unit chosen for this line: '' means the item's own unit, otherwise one of its alternate units. */
  unit: string
  /** True once the user typed a rate, so switching Sale/Cost never overwrites it. */
  rateTouched: boolean
}

export const blankRow = (): Row => ({ key: newId(), query: '', qty: '', rate: '', disc: '', unit: '', rateTouched: false })

export const defaultRate = (item: Item, basis: 'SALE' | 'COST'): Paise => (basis === 'COST' ? item.purchaseRate : item.issueRate)

export const rupeesText = (p: Paise): string => (p / 100).toFixed(2)

/** How much of the item's own unit this row takes from stock (900 GM of a KG item is 0.9). null when the quantity is not valid. */
export function rowStockQty(r: Row): number | null {
  const q = r.item ? parseQty(r.qty) : null
  if (q === null || !r.item) return null
  return stockQtyOf(q, sellingUnit(r.item, r.unit)?.per ?? 1)
}

export function parseQty(s: string): number | null {
  if (s.trim() === '') return null
  const n = Number(s)
  return Number.isFinite(n) && n > 0 ? roundQty(n) : null
}

/** Empty means 0%. Returns null when invalid. */
export function parseDisc(s: string): number | null {
  if (s.trim() === '') return 0
  const n = Number(s)
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null
}

export const parseRate = (s: string): Paise | null => {
  const p = parseRupees(s)
  return p !== null && p >= 0 ? p : null
}

/** "5%" -> percent, "250" -> ₹250. Empty -> none. null -> invalid. */
export function parseBillDiscount(s: string): { type: 'PCT' | 'AMT'; value: number } | null | 'invalid' {
  const t = s.trim()
  if (!t) return null
  if (t.endsWith('%')) {
    const n = Number(t.slice(0, -1))
    return Number.isFinite(n) && n >= 0 && n <= 100 ? { type: 'PCT', value: n } : 'invalid'
  }
  const p = parseRupees(t)
  return p !== null && p >= 0 ? { type: 'AMT', value: p } : 'invalid'
}

export const isFilled = (r: Row): r is Row & { item: Item } => !!r.item

/** Total requested qty per item across all rows (the same item may appear twice). */
export function usageByItem(rows: Row[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of rows) {
    const q = rowStockQty(r)
    if (r.item && q) m.set(r.item.id, roundQty((m.get(r.item.id) ?? 0) + q))
  }
  return m
}

export interface RowStatus { shortBy?: { available: number; requested: number }; qtyInvalid: boolean; rateInvalid: boolean; discInvalid: boolean }

export function rowStatus(r: Row, usage: Map<string, number>): RowStatus {
  const requested = r.item ? usage.get(r.item.id) ?? 0 : 0
  const avail = r.item?.currentStock ?? 0
  return {
    shortBy: r.item && requested > avail ? { available: avail, requested } : undefined,
    qtyInvalid: !!r.item && r.qty.trim() !== '' && parseQty(r.qty) === null,
    rateInvalid: !!r.item && parseRate(r.rate) === null,
    discInvalid: !!r.item && parseDisc(r.disc) === null,
  }
}

/** Lines that count toward totals: item chosen, qty valid. Missing/invalid rate or discount fall back to 0. */
export function billableRows(rows: Row[]): (Row & { item: Item })[] {
  return rows.filter(isFilled).filter((r) => parseQty(r.qty) !== null)
}

/** Re-price rows after the Sale/Cost basis changes, leaving hand-edited rates alone. */
export function repriceRows(rows: Row[], basis: 'SALE' | 'COST'): Row[] {
  return rows.map((r) => (r.item && !r.rateTouched ? { ...r, rate: rupeesText(defaultRate(r.item, basis)) } : r))
}

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
/** A token that is plain letters/digits has to start a word ("w" finds "Wire"); anything with punctuation (0.75", 1/2) is matched as written. */
const startsAWord = (ws: string[], hay: string, tok: string) => (/^[a-z0-9]+$/.test(tok) ? ws.some((w) => w.startsWith(tok)) : hay.includes(tok))
/** Each token starts a later word than the one before: "a w" finds "Anchor Wire" but not "Wire Anchor". */
function inOrder(ws: string[], toks: string[]): boolean {
  let at = 0
  for (const t of toks) {
    while (at < ws.length && !ws[at]!.startsWith(t)) at++
    if (at === ws.length) return false
    at++
  }
  return true
}

/**
 * Rank picker results. Typing initials works: "a w" finds Anchor Wire. Best first: exact code, name starts with the text,
 * the words of the name start with each typed piece in order, code prefix, every piece starts some word, anything that merely contains it.
 */
export function rankItems(items: Item[], query: string, matches: (q: string, fields: string[]) => boolean, limit = 50): Item[] {
  const q = query.trim().toLowerCase()
  const toks = q.split(/\s+/).filter(Boolean)
  const fieldsOf = (i: Item) => [i.name, i.code, i.category, i.batchNo, i.hsn]
  const word = (i: Item) => { const f = fieldsOf(i).join(' '); return toks.length > 1 && toks.every((t) => startsAWord(words(f), f.toLowerCase(), t)) }
  let hits = items.filter((i) => matches(query, fieldsOf(i)))
  // with several pieces, the word-start matches are what was meant; drop the "contains the letters somewhere" noise when there are any
  if (toks.length > 1) { const strict = hits.filter(word); if (strict.length) hits = strict }
  const score = (i: Item) => {
    const name = i.name.toLowerCase()
    if (i.code.toLowerCase() === q) return 0
    if (name.startsWith(q)) return 1
    if (toks.length > 1 && inOrder(words(i.name), toks)) return 2
    if (i.code.toLowerCase().startsWith(q)) return 3
    return word(i) ? 4 : 5
  }
  return hits.sort((a, b) => score(a) - score(b) || a.name.localeCompare(b.name)).slice(0, limit)
}
