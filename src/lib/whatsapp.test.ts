import { describe, expect, it } from 'vitest'
import type { Voucher } from '@/services/types'
import { billWhatsAppLink, billWhatsAppText } from './whatsapp'

const t = (key: string, o: Record<string, unknown> = {}) => ({
  'print.waText': `Hello ${o.name}, your bill ${o.number} of ${o.amount} from ${o.shop} is ready. Thank you!`,
  'print.waDue': `Balance due ${o.due}.`,
  'print.waPay': `Pay on UPI: ${o.upi}`,
}[key] ?? key)
const bill = (over: Partial<Voucher> = {}) => ({ number: 'SI-2627-0001', partyName: 'Gupta', payment: 'PAID_CASH', totals: { grandTotal: 33600 }, ...over }) as Voucher

describe('WhatsApp message for a bill', () => {
  it('says who, which bill and how much', () => {
    expect(billWhatsAppText(bill(), 'Sharma Medical', 'x@upi', t)).toBe('Hello Gupta, your bill SI-2627-0001 of ₹336.00 from Sharma Medical is ready. Thank you!')
  })
  it('adds what is due and how to pay it on a credit bill', () => {
    const m = billWhatsAppText(bill({ payment: 'CREDIT', paidAmount: 10000 }), 'Sharma Medical', 'x@upi', t)
    expect(m).toContain('Balance due ₹236.00.')
    expect(m).toContain('Pay on UPI: x@upi')
  })
  it('leaves the UPI line out when the shop has no UPI ID', () => {
    expect(billWhatsAppText(bill({ payment: 'CREDIT' }), 'Shop', '', t)).not.toContain('Pay on UPI')
  })
  it('opens the party chat when the number is known, and the contact picker when it is not', () => {
    expect(billWhatsAppLink('98765 43210', 'hi there')).toBe('https://wa.me/919876543210?text=hi%20there')
    expect(billWhatsAppLink('', 'hi')).toBe('https://wa.me/?text=hi')
  })
})
