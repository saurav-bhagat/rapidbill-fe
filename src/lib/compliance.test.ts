import { describe, expect, it } from 'vitest'
import { BIG_SALE, billWarnings, type WarnInput } from './compliance'

const base: WarnInput = {
  gstEnabled: true, taxApplicable: true, sellerGstin: '29AAKFS4821M1ZM', hsnColumnOn: true,
  party: { name: 'Gupta Medical', gstin: '27AAFFM7743K1ZU', address: 'Mumbai' },
  lines: [{ name: 'Paracetamol', hsn: '30049099' }], grandTotal: 10000,
}
const keys = (o: Partial<WarnInput>) => billWarnings({ ...base, ...o }).map((w) => w.key)

describe('bill warnings', () => {
  it('has nothing to say about a good bill', () => {
    expect(keys({})).toEqual([])
  })
  it('never checks challans, non-GST shops or tax-free bills', () => {
    const bad = { sellerGstin: '', lines: [{ name: 'X', hsn: '' }], hsnColumnOn: false }
    expect(keys({ ...bad, taxApplicable: false })).toEqual([])
    expect(keys({ ...bad, gstEnabled: false })).toEqual([])
  })
  it('asks for the shop\'s own GSTIN', () => {
    expect(keys({ sellerGstin: '  ' })).toEqual(['noSellerGstin'])
  })
  it('wants an HSN of at least 4 digits on a bill to a GST-registered business', () => {
    expect(billWarnings({ ...base, lines: [{ name: 'A', hsn: '' }, { name: 'B', hsn: '3004' }, { name: 'C', hsn: '30' }] })).toEqual([
      { key: 'hsnMissing', params: { count: 1, names: 'A' } },
      { key: 'hsnShort', params: { count: 1, names: 'C', min: 4 } },
    ])
    expect(keys({ lines: [{ name: 'A', hsn: '3004 90 99' }] })).toEqual([]) // spaces and dots do not count against it
  })
  it('names at most three items', () => {
    const lines = ['A', 'B', 'C', 'D'].map((name) => ({ name, hsn: '' }))
    expect(billWarnings({ ...base, lines })[0]!.params).toEqual({ count: 4, names: 'A, B, C, …' })
  })
  it('says so when the HSN column is switched off for a bill to a registered business', () => {
    expect(keys({ hsnColumnOn: false })).toEqual(['hsnHidden'])
  })
  it('does not ask for HSN on a sale to an unregistered buyer', () => {
    expect(keys({ party: null, lines: [{ name: 'A', hsn: '' }], hsnColumnOn: false })).toEqual([])
    expect(keys({ party: { name: 'Walk-in Co', gstin: '', address: '' }, lines: [{ name: 'A', hsn: '' }] })).toEqual([])
  })
  it('wants the buyer\'s name and address on an unregistered sale of Rs 50,000 or more', () => {
    expect(keys({ party: null, grandTotal: BIG_SALE })).toEqual(['bigSaleNoParty'])
    expect(keys({ party: null, grandTotal: BIG_SALE - 1 })).toEqual([])
    expect(billWarnings({ ...base, party: { name: 'Walk-in Co', gstin: '', address: ' ' }, grandTotal: BIG_SALE })).toEqual([{ key: 'bigSaleNoAddress', params: { name: 'Walk-in Co' } }])
    expect(keys({ party: { name: 'Walk-in Co', gstin: '', address: 'Pune' }, grandTotal: BIG_SALE * 3 })).toEqual([])
  })
})
