import { formatQty } from './format'
import { roundQty } from './qty'
import type { Item, Unit } from '@/services/types'

/** The units a bill line for this item can use: its own first, then the ones it is also sold in. */
export const unitsOf = (it: Pick<Item, 'unit' | 'altUnits'>): Unit[] => [it.unit, ...(it.altUnits ?? []).map((a) => a.unit)]

/** How a line sold in `unit` converts to the item's own unit, or null when the item is not sold in that unit. '' or the item's own unit means "own unit". */
export function sellingUnit(it: Pick<Item, 'unit' | 'altUnits'>, unit?: string): { unit: Unit; per: number } | null {
  if (!unit || unit === it.unit) return { unit: it.unit, per: 1 }
  const a = it.altUnits?.find((x) => x.unit === unit)
  return a ? { unit: a.unit, per: a.per } : null
}

/** Quantity sold in a unit -> quantity of the item's own unit it takes from stock (900 GM of a KG item is 0.9). */
export const stockQtyOf = (qty: number, per: number): number => roundQty(qty / per)

/** What a saved line took from stock. Bills made before alternate units have no stockQty. */
export const lineStockQty = (l: { qty: number; stockQty?: number }): number => l.stockQty ?? l.qty

/** The unit most often sold alongside each unit, so the first "Also sold in" row starts on a sensible choice. */
const COMMON: Partial<Record<Unit, Unit[]>> = { KG: ['GM'], GM: ['KG'], LTR: ['ML'], ML: ['LTR'], MTR: ['FT'], FT: ['MTR'], DOZ: ['PCS'], BOX: ['PCS'], PKT: ['PCS'], BAG: ['KG'], ROLL: ['MTR'], SET: ['PCS'], PAIR: ['PCS'], SHEET: ['PCS'], TON: ['KG'], QTL: ['KG'], STRIP: ['PCS'], SQFT: ['SHEET'] }
export const suggestAlt = (unit: string, taken: string[], all: readonly Unit[]): Unit => [...(COMMON[unit as Unit] ?? []), ...all].find((u) => u !== unit && !taken.includes(u)) ?? 'GM'

/**
 * Stock as people say it: "4 KG 756 GM" instead of "4.756 KG", "900 GM" instead of "0.9 KG".
 * Uses the item's first smaller unit when the leftover comes out in whole numbers; otherwise the plain number and unit.
 */
export function stockText(it: Pick<Item, 'unit' | 'altUnits'>, qty: number): string {
  const plain = `${formatQty(qty)} ${it.unit}`
  const alt = it.altUnits?.find((a) => a.per > 1)
  if (!alt || !(qty > 0) || Number.isInteger(qty)) return plain
  const whole = Math.trunc(qty)
  const rest = Math.round((qty - whole) * alt.per * 1000) / 1000
  if (rest <= 0 || rest >= alt.per || Math.abs(rest - Math.round(rest)) > 0.0005) return plain
  return whole === 0 ? `${formatQty(rest)} ${alt.unit}` : `${formatQty(whole)} ${it.unit} ${formatQty(rest)} ${alt.unit}`
}

/**
 * A unit bigger than the item's own (1 DOZ = 12 PCS) is stored as per = 1/12, and nobody can type 1/12 exactly: 0.0833 or 0.083333
 * would leave stock off by a hair on every sale. A value within half a percent of 1/N snaps to exactly 1/N.
 */
export function snapPer(per: number): number {
  if (!(per > 0) || per >= 1) return per
  const n = 1 / per
  const r = Math.round(n)
  return r >= 2 && Math.abs(n - r) / r < 0.005 ? 1 / r : per
}
