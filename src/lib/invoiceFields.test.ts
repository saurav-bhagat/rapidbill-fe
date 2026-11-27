import { describe, expect, it } from 'vitest'
import { INVOICE_FIELD_KEYS, INVOICE_FIELDS_OFF_BY_DEFAULT } from '@/services/types'
import { invoiceFieldsOf } from './invoiceFields'

describe('invoiceFieldsOf', () => {
  it('for an account that never chose: HSN, batch / expiry, unit, taxable, the HSN summary, the payment details, the UPI QR and the reverse charge line start off; everything else shows', () => {
    const f = invoiceFieldsOf({})
    expect(INVOICE_FIELDS_OFF_BY_DEFAULT).toEqual(['hsn', 'batchExpiry', 'unit', 'taxable', 'hsnSummary', 'paymentDetails', 'upiQr', 'reverseCharge'])
    for (const k of INVOICE_FIELD_KEYS) expect(f[k]).toBe(!INVOICE_FIELDS_OFF_BY_DEFAULT.includes(k))
    expect(f.bank && f.signature && f.mrp && f.discount).toBe(true)
  })
  it('hides only what was turned off; other missing keys stay shown', () => {
    const f = invoiceFieldsOf({ invoiceFields: { mrp: false } })
    expect(f.mrp).toBe(false)
    expect(f.bank).toBe(true)
  })
  it('a column that starts off shows once it is turned on', () => {
    const f = invoiceFieldsOf({ invoiceFields: { hsn: true, taxable: true } })
    expect(f.hsn && f.taxable).toBe(true)
    expect(f.unit).toBe(false)
  })
})
