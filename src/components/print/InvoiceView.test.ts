import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import i18n from '@/i18n'
import invoiceEn from '@/i18n/locales/en/invoice.json'
import type { Settings, Voucher } from '@/services'
import { InvoiceView } from './InvoiceView'
import { formatAmount } from '@/lib/format'

const settings = { gstEnabled: true, printLanguage: 'en', companyName: 'Sharma Medical', address: '12 MG Road', phone: '', gstin: '29ABCDE1234F1Z5', stateCode: '29' } as Settings
const voucher = (over: Partial<Voucher> = {}): Voucher => ({
  id: 'v1', number: 'SI-2627-0001', date: '2026-11-21', mode: 'TAX_INVOICE', taxApplicable: true, rateBasis: 'SALE',
  partyId: 'p1', partyName: 'Gupta Medical', partyGstin: '', partyStateCode: '29', partyAddress: '', remarks: '', billDiscount: null,
  lines: [
    { itemId: 'i1', name: 'Paracetamol', code: 'P1', hsn: '3004', batchNo: '', expiry: '', unit: 'STRIP', qty: 12, mrp: 300, rate: 250, discPct: 0, gstPct: 12, taxable: 3000, tax: 360, total: 3360 },
    { itemId: 'i2', name: 'Dettol', code: 'D1', hsn: '3808', batchNo: '', expiry: '', unit: 'PCS', qty: 1, mrp: 21000, rate: 21000, discPct: 0, gstPct: 18, taxable: 21000, tax: 3780, total: 24780 },
  ],
  totals: { itemCount: 2, totalQty: 13, gross: 24000, lineDiscount: 0, billDiscount: 0, taxable: 24000, cgst: 2070, sgst: 2070, igst: 0, roundOff: 0, grandTotal: 28140 },
  payment: 'PAID_CASH', status: 'ACTIVE', ...over,
} as unknown as Voucher)
const render = (v: Voucher, s: Partial<Settings> = {}) => renderToStaticMarkup(createElement(InvoiceView, { voucher: v, settings: { ...settings, ...s }, paper: 'A4' }))

describe('InvoiceView HSN-wise tax summary', () => {
  beforeAll(async () => { await i18n.init({ lng: 'en', fallbackLng: 'en', ns: ['invoice'], resources: { en: { invoice: invoiceEn } }, interpolation: { escapeValue: false } }) })
  it('is not printed unless the business turns it on', () => {
    expect(render(voucher())).not.toContain('Total tax')
    expect(render(voucher(), { invoiceFields: { hsnSummary: false } as Settings['invoiceFields'] })).not.toContain('Total tax')
  })
  it('lists each HSN with CGST and SGST in the same state', () => {
    const html = render(voucher(), { invoiceFields: { hsnSummary: true } as Settings['invoiceFields'] })
    expect(html).toContain('Total tax')
    expect(html).toContain('3004')
    expect(html).toContain('3808')
    expect(html).toContain('6%')
    expect(html).toContain('9%')
    expect(html).toContain('>CGST<')
    expect(html).toContain('>SGST<')
  })
  it('shows IGST only for another state', () => {
    const inter = voucher({ partyStateCode: '27' })
    const html = render({ ...inter, totals: { ...inter.totals, cgst: 0, sgst: 0, igst: 4140 } }, { invoiceFields: { hsnSummary: true } as Settings['invoiceFields'] })
    expect(html).toContain('Total tax')
    expect(html).toContain('12%')
    expect(html).not.toContain('>CGST<')
  })
  it('is not printed on a bill that carries no tax', () => {
    expect(render(voucher({ taxApplicable: false }), { invoiceFields: { hsnSummary: true } as Settings['invoiceFields'] })).not.toContain('Total tax')
  })
})

describe('InvoiceView paid and balance due', () => {
  const credit = (over: Partial<Voucher> = {}) => voucher({ payment: 'CREDIT', paidAmount: 5000, paidMode: 'UPI', ...over } as Partial<Voucher>)
  const on = { invoiceFields: { paymentDetails: true } as Settings['invoiceFields'] }
  it('prints nothing about what was paid unless the business turned it on', () => {
    const html = render(credit())
    expect(html).not.toContain('Balance due')
    expect(html).not.toContain('Received now')
  })
  it('prints what was received and what is still due on a part paid credit bill', () => {
    const html = render(credit(), on)
    expect(html).toContain('Received now')
    expect(html).toContain('50.00')
    expect(html).toContain('Balance due')
    expect(html).toContain('₹231.40') // 28140 - 5000 paise
  })
  it('prints only the balance when nothing was paid, and nothing on a bill that is not credit', () => {
    const html = render(credit({ paidAmount: undefined, paidMode: undefined }), on)
    expect(html).toContain('Balance due')
    expect(html).not.toContain('Received now')
    expect(render(voucher({ payment: 'PAID_CASH' }), on)).not.toContain('Balance due')
  })
})

describe('InvoiceView UPI QR code', () => {
  const credit = (over: Partial<Voucher> = {}) => voucher({ payment: 'CREDIT', paidAmount: 5000, paidMode: 'UPI', ...over } as Partial<Voucher>)
  const on = { upiId: 'sharma@okhdfcbank', invoiceFields: { upiQr: true } as Settings['invoiceFields'] }
  it('is not printed unless the business turned it on', () => {
    expect(render(credit(), { upiId: 'sharma@okhdfcbank' })).not.toContain('Scan to pay')
  })
  it('is printed on a credit bill with something due, for exactly what is due', () => {
    const html = render(credit(), on)
    expect(html).toContain('Scan to pay ₹231.40')
    expect(html).toContain('viewBox')
  })
  it('asks for the whole bill on a bill paid by UPI, so the customer can scan the printout at the counter', () => {
    const v = voucher({ payment: 'PAID_UPI' })
    expect(render(v, on)).toContain(`Scan to pay ₹${formatAmount(v.totals.grandTotal)}`)
  })
  it('is not printed on a cash bill, a cancelled bill, or when the UPI ID is missing or not real', () => {
    expect(render(voucher({ payment: 'PAID_CASH' }), on)).not.toContain('Scan to pay')
    expect(render(credit({ status: 'CANCELLED' }), on)).not.toContain('Scan to pay')
    expect(render(credit(), { ...on, upiId: '' })).not.toContain('Scan to pay')
    expect(render(credit(), { ...on, upiId: 'not a upi id' })).not.toContain('Scan to pay')
  })
})


describe('a reprint shows what is due today', () => {
  const credit = voucher({ payment: 'CREDIT', paidAmount: 5000, paidMode: 'UPI' } as Partial<Voucher>)
  const on = { upiId: 'sharma@okhdfcbank', invoiceFields: { upiQr: true, paymentDetails: true } as Settings['invoiceFields'] }
  const reprint = (dueNow: number) => renderToStaticMarkup(createElement(InvoiceView, { voucher: credit, settings: { ...settings, ...on }, paper: 'A4', dueNow }))
  it('adds a Due today row and the QR asks for that amount', () => {
    const html = reprint(10000)
    expect(html).toContain('Due today')
    expect(html).toContain('Scan to pay ₹100.00')
  })
  it('no QR once nothing is due; no extra row when nothing changed', () => {
    expect(reprint(0)).not.toContain('Scan to pay')
    expect(renderToStaticMarkup(createElement(InvoiceView, { voucher: credit, settings: { ...settings, ...on }, paper: 'A4' }))).not.toContain('Due today')
  })
})
