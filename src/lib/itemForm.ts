import type { TFunction } from 'i18next'
import { parseRupees, toRupees } from './money'
import { roundQty } from './qty'
import { snapPer } from './units'
import { GST_SLABS, MAX_ALT_UNITS, UNITS, type AltUnit, type Item, type Meta, type Unit } from '@/services/types'

export type ItemData = Omit<Item, keyof Meta>
export type ItemDraft = Record<'name' | 'code' | 'category' | 'hsn' | 'unit' | 'batchNo' | 'expiry' | 'mrp' | 'purchaseRate' | 'issueRate' | 'gstPercent' | 'currentStock' | 'lowStockThreshold', string> & {
  /** Other units it is also sold in: `per` of them make 1 of `unit` (typed as text while editing). */
  altUnits: { unit: string; per: string }[]
}
/** Translatable message: `key` lives in the `inventory` namespace (or `import` for importer messages). */
export interface Msg { key: string; params?: Record<string, string | number> }
export type ItemErrors = Partial<Record<keyof ItemDraft, Msg>>

export function nextItemCode(codes: string[]): string {
  let max = 1000
  for (const c of codes) {
    const m = /^ITM-(\d+)$/.exec(c)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return `ITM-${max + 1}`
}

/** "0827" -> "08/27" as the user types. */
export function formatExpiryInput(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 4)
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d
}

export const emptyDraft = (code: string): ItemDraft => ({
  name: '', code, category: '', hsn: '', unit: 'PCS', batchNo: '', expiry: '', mrp: '', purchaseRate: '', issueRate: '',
  gstPercent: '12', currentStock: '', lowStockThreshold: '10', altUnits: [],
})

export const draftFromItem = (i: Item): ItemDraft => ({
  name: i.name, code: i.code, category: i.category, hsn: i.hsn, unit: i.unit, batchNo: i.batchNo, expiry: i.expiry,
  mrp: String(toRupees(i.mrp)), purchaseRate: String(toRupees(i.purchaseRate)), issueRate: String(toRupees(i.issueRate)),
  gstPercent: String(i.gstPercent), currentStock: String(i.currentStock), lowStockThreshold: String(i.lowStockThreshold),
  altUnits: (i.altUnits ?? []).map((a) => ({ unit: a.unit, per: String(a.per) })),
})

export interface ItemValidation { errors: ItemErrors; warnings: Msg[]; value?: ItemData }

export function validateItemDraft(d: ItemDraft, takenCodes: string[]): ItemValidation {
  const errors: ItemErrors = {}
  const warnings: Msg[] = []
  const name = d.name.trim()
  const code = d.code.trim().toUpperCase()

  if (!name) errors.name = { key: 'form.err.nameRequired' }
  if (!code) errors.code = { key: 'form.err.codeRequired' }
  else if (takenCodes.some((c) => c.toUpperCase() === code)) errors.code = { key: 'form.err.codeUsed' }
  if (d.hsn && !/^\d{4,8}$/.test(d.hsn)) errors.hsn = { key: 'form.err.hsn' }
  if (d.expiry && !/^(0[1-9]|1[0-2])\/\d{2}$/.test(d.expiry)) errors.expiry = { key: 'form.err.expiry' }

  const money = (key: 'mrp' | 'purchaseRate' | 'issueRate', required: boolean) => {
    if (d[key].trim() === '') { if (required) errors[key] = { key: 'form.err.required' }; return 0 }
    const p = parseRupees(d[key])
    if (p === null || p < 0) { errors[key] = { key: 'form.err.amount' }; return 0 }
    return p
  }
  const mrp = money('mrp', false)
  const purchaseRate = money('purchaseRate', false)
  const issueRate = money('issueRate', true)

  const gst = Number(d.gstPercent)
  if (!(GST_SLABS as readonly number[]).includes(gst)) errors.gstPercent = { key: 'form.err.gst' }

  const stock = d.currentStock.trim() === '' ? 0 : Number(d.currentStock)
  if (!Number.isFinite(stock) || stock < 0) errors.currentStock = { key: 'form.err.zeroOrMore' }
  const low = d.lowStockThreshold.trim() === '' ? 10 : Number(d.lowStockThreshold)
  if (!Number.isFinite(low) || low < 0) errors.lowStockThreshold = { key: 'form.err.zeroOrMore' }

  const altUnits: AltUnit[] = []
  if (d.altUnits.length > MAX_ALT_UNITS) errors.altUnits = { key: 'form.err.altMany', params: { n: MAX_ALT_UNITS } }
  const seen = new Set<string>([d.unit])
  for (const a of d.altUnits) {
    const per = Number(a.per)
    if (!UNITS.includes(a.unit as Unit)) errors.altUnits = { key: 'form.err.altPick' }
    else if (seen.has(a.unit)) errors.altUnits = { key: 'form.err.altSame', params: { unit: a.unit } }
    else if (a.per.trim() === '' || !Number.isFinite(per) || per <= 0 || per > 1_000_000) errors.altUnits = { key: 'form.err.altPer', params: { unit: a.unit } }
    else altUnits.push({ unit: a.unit as Unit, per: snapPer(per) })
    seen.add(a.unit)
  }

  if (mrp && issueRate > mrp) warnings.push({ key: 'form.warn.aboveMrp' })
  if (purchaseRate && issueRate && issueRate < purchaseRate) warnings.push({ key: 'form.warn.loss' })

  if (Object.keys(errors).length) return { errors, warnings }
  return {
    errors, warnings,
    value: {
      name, code, category: d.category.trim(), hsn: d.hsn, unit: (UNITS.includes(d.unit as Unit) ? d.unit : 'PCS') as Unit,
      batchNo: d.batchNo.trim(), expiry: d.expiry, mrp, purchaseRate, issueRate, gstPercent: gst,
      currentStock: roundQty(stock), lowStockThreshold: low, altUnits,
    },
  }
}

/** Render a validation/import message in the user's language. `label` params name a field label key under `lbl.`. */
export function msgText(t: TFunction, m: Msg, ns: 'inventory' | 'import'): string {
  const params: Record<string, string | number> = { ...m.params }
  if (ns === 'import' && typeof params.label === 'string') params.label = t(`lbl.${params.label}`, { ns })
  return t(m.key, { ns, ...params })
}
