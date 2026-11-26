import { describe, expect, it } from 'vitest'
import type { Voucher } from '@/services/types'
import { billInterState, buildReturn, defaultSettlement, hasReturns, returnableLeft, type Built } from './returns'

const line = (qty: number, taxable: number, tax: number, per = 1) => ({ qty, taxable, tax, total: taxable + tax, per }) as Voucher['lines'][number]
const bill = (lines: Voucher['lines'], over: Partial<Voucher> = {}) => ({ lines, totals: { roundOff: 0, igst: 0 } as Voucher['totals'], ...over }) as Voucher
const ok = (r: ReturnType<typeof buildReturn>) => { if ('key' in r) throw new Error(r.key); return r as Built }

describe('sales return maths (same rules as the server)', () => {
  it('a full return gives back exactly the bill line', () => {
    const b = bill([line(3, 9300, 1116)])
    expect(ok(buildReturn(b, [{ line: 0, qty: 3 }], false)).totals).toMatchObject({ taxable: 9300, cgst: 558, sgst: 558, igst: 0, grandTotal: 10416 })
  })
  it('partial returns always add up to the bill line, whatever the order', () => {
    const b = bill([line(3, 10000, 1201)])
    const first = ok(buildReturn(b, [{ line: 0, qty: 1 }], false))
    const second = ok(buildReturn({ ...b, returned: [1] }, [{ line: 0, qty: 2 }], false))
    expect(first.lines[0]!.taxable + second.lines[0]!.taxable).toBe(10000)
    expect(first.lines[0]!.tax + second.lines[0]!.tax).toBe(1201)
  })
  it('splits tax like the bill: IGST across states, CGST gets the lower half of each line', () => {
    const b = bill([line(1, 1000, 121)])
    expect(ok(buildReturn(b, [{ line: 0, qty: 1 }], true)).totals).toMatchObject({ cgst: 0, sgst: 0, igst: 121 })
    expect(ok(buildReturn(b, [{ line: 0, qty: 1 }], false)).totals).toMatchObject({ cgst: 60, sgst: 61 })
  })
  it('rounds to the rupee only when the bill was rounded', () => {
    expect(ok(buildReturn(bill([line(1, 2301, 276)], { totals: { roundOff: 23, igst: 0, grandTotal: 2600 } as Voucher['totals'] }), [{ line: 0, qty: 1 }], false)).totals).toMatchObject({ roundOff: 23, grandTotal: 2600 })
    expect(ok(buildReturn(bill([line(1, 2301, 276)]), [{ line: 0, qty: 1 }], false)).totals).toMatchObject({ roundOff: 0, grandTotal: 2577 })
  })
  it('works out the stock from the unit it was sold in', () => {
    expect(ok(buildReturn(bill([line(900, 3600, 180, 1000)]), [{ line: 0, qty: 300 }], false)).lines[0]).toMatchObject({ qty: 300, stockQty: 0.3, taxable: 1200, tax: 60 })
  })
  it('names the bill\'s own line in a problem, not its place in the request', () => {
    const b = bill([line(2, 2000, 0), line(4, 4000, 0)])
    expect(buildReturn(b, [{ line: 1, qty: 5 }], false)).toEqual({ key: 'returnTooMany', n: 2, left: 4 })
  })
  it('returns of a rounded bill, one line at a time, add up to the bill and never more', () => {
    const b = bill([line(1, 5050, 0), line(1, 5060, 0)], { totals: { roundOff: -10, igst: 0, grandTotal: 10100 } as Voucher['totals'] })
    const a = ok(buildReturn(b, [{ line: 0, qty: 1 }], false))
    const c = ok(buildReturn({ ...b, returned: [1, 0] }, [{ line: 1, qty: 1 }], false))
    expect(a.totals.grandTotal + c.totals.grandTotal).toBe(10100)
    expect(ok(buildReturn(b, [{ line: 0, qty: 1 }, { line: 1, qty: 1 }], false)).totals.grandTotal).toBe(10100)
  })
  it('refuses what the server refuses', () => {
    const b = bill([line(2, 2000, 0)], { returned: [1] })
    expect(buildReturn(b, [], false)).toEqual({ key: 'returnNothing' })
    expect(buildReturn(b, [{ line: 0, qty: 0 }], false)).toEqual({ key: 'returnNothing' })
    expect(buildReturn(b, [{ line: 4, qty: 1 }], false)).toEqual({ key: 'returnLineGone', n: 1 })
    expect(buildReturn(b, [{ line: 0, qty: 1 }, { line: 0, qty: 1 }], false)).toEqual({ key: 'returnLineTwice', n: 1 })
    expect(buildReturn(b, [{ line: 0, qty: -1 }], false)).toEqual({ key: 'returnQty', n: 1 })
    expect(buildReturn(b, [{ line: 0, qty: 2 }], false)).toEqual({ key: 'returnTooMany', n: 1, left: 1 })
  })
  it('knows what is left, whether anything came back, and the IGST split of a bill', () => {
    expect(returnableLeft(bill([line(5, 1, 0), line(2, 1, 0)], { returned: [2] }))).toEqual([3, 2])
    expect(hasReturns(bill([], { returned: [0, 0] }))).toBe(false)
    expect(hasReturns(bill([], { returned: [0, 1] }))).toBe(true)
    expect(billInterState(bill([], { totals: { igst: 5 } as Voucher['totals'] }))).toBe(true)
  })
  it('settles a credit bill off the balance, and anything else the way it was paid', () => {
    expect(defaultSettlement({ payment: 'CREDIT', partyId: 'p' })).toBe('ADJUST')
    expect(defaultSettlement({ payment: 'CREDIT', partyId: null })).toBe('CASH')
    expect(defaultSettlement({ payment: 'PAID_UPI', partyId: 'p' })).toBe('UPI')
    expect(defaultSettlement({ payment: 'PAID_BANK', partyId: null })).toBe('BANK')
    expect(defaultSettlement({ payment: 'PAID_CASH', partyId: 'p' })).toBe('CASH')
  })
})
