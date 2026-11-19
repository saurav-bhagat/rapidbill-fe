import type { Paise } from './money'
import type { TFunction } from 'i18next'
import type { PaymentStatus, Voucher } from '@/services/types'

export interface HsnRow { hsn: string; gstPct: number; taxable: Paise; cgst: Paise; sgst: Paise; igst: Paise; tax: Paise }

export const isInterState = (v: Voucher, sellerState: string): boolean => v.partyStateCode !== null && v.partyStateCode !== sellerState

/** Key (in the `invoice` catalogue) of what the document is called. An invoice that carries no tax (non-GST business) is just an INVOICE. */
export const docTitleKey = (v: Voucher): 'title.challan' | 'title.taxInvoice' | 'title.invoice' =>
  v.mode === 'CHALLAN' ? 'title.challan' : v.taxApplicable ? 'title.taxInvoice' : 'title.invoice'

/** Short label for lists and dialogs. */
export const voucherTypeLabel = (v: Voucher, t: TFunction): string =>
  t(v.mode === 'CHALLAN' ? 'voucherType.challan' : v.taxApplicable ? 'voucherType.taxInvoice' : 'voucherType.invoice', { ns: 'common' })

/** Payment status for lists and the billing footer. Keys: common:payment.<PaymentStatus>. */
export const paymentLabel = (p: PaymentStatus, t: TFunction): string => t(`payment.${p}`, { ns: 'common' })

/** HSN-wise tax summary. Per-line CGST/SGST split matches calcVoucher, so the sums tie to the voucher totals. */
export function hsnSummary(v: Voucher, sellerState: string): HsnRow[] {
  const inter = isInterState(v, sellerState)
  const map = new Map<string, HsnRow>()
  for (const l of v.lines) {
    const key = `${l.hsn || '-'}|${l.gstPct}`
    const row = map.get(key) ?? { hsn: l.hsn || '-', gstPct: l.gstPct, taxable: 0, cgst: 0, sgst: 0, igst: 0, tax: 0 }
    const cgst = inter ? 0 : Math.floor(l.tax / 2)
    row.taxable += l.taxable
    row.tax += l.tax
    row.cgst += cgst
    row.sgst += inter ? 0 : l.tax - cgst
    row.igst += inter ? l.tax : 0
    map.set(key, row)
  }
  return [...map.values()].sort((a, b) => a.hsn.localeCompare(b.hsn) || a.gstPct - b.gstPct)
}
