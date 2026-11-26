import type { Paise } from './money'
import type { TFunction } from 'i18next'
import type { PaymentStatus, Voucher } from '@/services/types'

export interface HsnRow { hsn: string; gstPct: number; taxable: Paise; cgst: Paise; sgst: Paise; igst: Paise; tax: Paise }

/** What a bill adds to the party's balance: a credit bill's total minus what was paid when it was made. Any other bill adds nothing. */
export const dueOf = (v: Pick<Voucher, 'payment' | 'totals' | 'paidAmount'>): Paise => (v.payment === 'CREDIT' ? Math.max(0, v.totals.grandTotal - (v.paidAmount ?? 0)) : 0)

/**
 * What is still due on a credit bill today, for a reprint, its UPI QR and the WhatsApp message: the unpaid part less goods returned on it
 * and taken off the balance, never more than the party owes right now (payments are made against the party, not one bill).
 * `partyBalance` undefined = not known, so only returns are taken off. Same in the web app and the phone app.
 */
export function dueToday(
  v: Pick<Voucher, 'payment' | 'totals' | 'paidAmount' | 'status'>,
  returns: { status: string; settlement: string; totals: { grandTotal: Paise } }[],
  partyBalance?: Paise,
): Paise {
  if (v.status === 'CANCELLED') return 0
  const back = returns.filter((r) => r.status === 'ACTIVE' && r.settlement === 'ADJUST').reduce((s, r) => s + r.totals.grandTotal, 0)
  const due = Math.max(0, dueOf(v) - back)
  return partyBalance === undefined ? due : Math.max(0, Math.min(due, partyBalance))
}

/** IGST or CGST+SGST as the bill charged it (the shop's state may have been set or changed since); only a 0% bill falls back to the states. */
export const isInterState = (v: Pick<Voucher, 'partyStateCode'> & { totals?: Pick<Voucher['totals'], 'igst' | 'cgst' | 'sgst'> }, sellerState: string): boolean =>
  v.totals && v.totals.igst > 0 ? true : v.totals && v.totals.cgst + v.totals.sgst > 0 ? false : v.partyStateCode !== null && sellerState !== '' && v.partyStateCode !== sellerState

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
