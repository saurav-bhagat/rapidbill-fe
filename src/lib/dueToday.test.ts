import { describe, expect, it } from 'vitest'
import { dueToday } from './invoice'

const bill = (over: Record<string, unknown> = {}) => ({ payment: 'CREDIT', status: 'ACTIVE', paidAmount: 5000, totals: { grandTotal: 35400 }, ...over }) as Parameters<typeof dueToday>[0]
const ret = (amount: number, settlement = 'ADJUST', status = 'ACTIVE') => ({ status, settlement, totals: { grandTotal: amount } })

describe('what is due on a bill today (same in the phone app)', () => {
  it('the unpaid part less returns taken off the balance', () => {
    expect(dueToday(bill(), [])).toBe(30400)
    expect(dueToday(bill(), [ret(10000), ret(5000, 'CASH'), ret(3000, 'ADJUST', 'CANCELLED')])).toBe(20400)
  })
  it('never more than the party owes now, never below zero', () => {
    expect(dueToday(bill(), [], 10400)).toBe(10400)
    expect(dueToday(bill(), [], -500)).toBe(0)
    expect(dueToday(bill(), [ret(40000)], 99999)).toBe(0)
  })
  it('nothing on a cancelled or non-credit bill', () => {
    expect(dueToday(bill({ status: 'CANCELLED' }), [], 99999)).toBe(0)
    expect(dueToday(bill({ payment: 'PAID_UPI' }), [], 99999)).toBe(0)
  })
})
