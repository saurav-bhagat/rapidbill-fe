import type { Paise } from './money'

/**
 * Things a GST bill should have, checked before saving. They are warnings, never blocks: the shop knows its customer better than we do,
 * and the rules change. Same file in the web app (src/lib) and the phone app (src/core): keep them identical.
 * (Sources: Rule 46 of the CGST Rules and the HSN digit notification, as summarised by compliance guides. Check with the shop's accountant.)
 */
export type WarningKey = 'noSellerGstin' | 'hsnMissing' | 'hsnShort' | 'hsnHidden' | 'bigSaleNoParty' | 'bigSaleNoAddress'
export interface BillWarning { key: WarningKey; params?: Record<string, string | number> }

export interface WarnInput {
  gstEnabled: boolean
  /** The bill is a tax invoice that charges tax. Challans and non-GST bills are never checked. */
  taxApplicable: boolean
  sellerGstin: string
  /** Is the HSN column switched on for printing? */
  hsnColumnOn: boolean
  party: { name: string; gstin: string; address: string } | null
  lines: { name: string; hsn: string }[]
  grandTotal: Paise
}

/** From this bill value, a sale to an unregistered buyer must carry the buyer's name, address and state. */
export const BIG_SALE: Paise = 50_000_00
/** Fewest HSN digits on a bill to a registered business (4 up to Rs 5 crore turnover; 6 above that). */
export const MIN_HSN_DIGITS = 4

const names = (ls: { name: string }[]) => { const n = ls.slice(0, 3).map((l) => l.name); return n.join(', ') + (ls.length > 3 ? ', …' : '') }

export function billWarnings(i: WarnInput): BillWarning[] {
  if (!i.gstEnabled || !i.taxApplicable) return []
  const out: BillWarning[] = []
  if (!i.sellerGstin.trim()) out.push({ key: 'noSellerGstin' })
  const registered = !!i.party?.gstin.trim()
  if (registered) {
    const digits = (h: string) => h.replace(/\D/g, '')
    const blank = i.lines.filter((l) => digits(l.hsn).length === 0)
    const short = i.lines.filter((l) => digits(l.hsn).length > 0 && digits(l.hsn).length < MIN_HSN_DIGITS)
    if (blank.length) out.push({ key: 'hsnMissing', params: { count: blank.length, names: names(blank) } })
    if (short.length) out.push({ key: 'hsnShort', params: { count: short.length, names: names(short), min: MIN_HSN_DIGITS } })
    if (!i.hsnColumnOn) out.push({ key: 'hsnHidden' })
  } else if (i.grandTotal >= BIG_SALE) {
    if (!i.party) out.push({ key: 'bigSaleNoParty' })
    else if (!i.party.address.trim()) out.push({ key: 'bigSaleNoAddress', params: { name: i.party.name } })
  }
  return out
}
