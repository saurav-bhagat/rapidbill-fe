import { describe, expect, it } from 'vitest'
import { invoiceFieldsOf } from './invoiceFields'

describe('invoiceFieldsOf', () => {
  it('shows everything for an account that never chose', () => {
    const f = invoiceFieldsOf({})
    expect(Object.values(f).every(Boolean)).toBe(true)
    expect(f.hsn && f.bank && f.signature).toBe(true)
  })
  it('hides only what was turned off; missing keys stay shown', () => {
    const f = invoiceFieldsOf({ invoiceFields: { mrp: false } })
    expect(f.mrp).toBe(false)
    expect(f.hsn).toBe(true)
  })
})
