import { describe, expect, it } from 'vitest'
import parties from '@/i18n/locales/en/parties.json'
import { reminderText, statementQr } from './statement'

const tm = (k: string, opts: Record<string, unknown> = {}): string => {
  const v = (parties.statement as Record<string, unknown>)[k]
  return typeof v === 'string' ? v.replace(/\{\{(\w+)\}\}/g, (_, x: string) => String(opts[x] ?? '')) : k
}

describe('WhatsApp payment reminder (same words as the phone app)', () => {
  it('says who, how much, from which shop and how to pay', () => {
    expect(reminderText({ name: 'Gupta', balance: 36000 }, 'Sharma Medical', ' sharma@okhdfcbank ', '2026-11-26', tm))
      .toBe('Hello Gupta, this is a reminder from Sharma Medical: ₹360.00 is due on your account as on 26-11-2026. You can pay on UPI: sharma@okhdfcbank. Thank you!')
  })
  it('is empty when nothing is owed', () => {
    expect(reminderText({ name: 'Gupta', balance: 0 }, 'S', undefined, '2026-11-26', tm)).toBe('')
  })
})

describe('statement UPI QR', () => {
  const s = { upiId: 'sharma@okhdfcbank', companyName: 'Sharma' }
  it('only for a balance due, with the switch on and a valid UPI ID', () => {
    expect(statementQr({ closing: 100 }, s, true, 100)).toContain('<svg')
    expect(statementQr({ closing: 100 }, s, false, 100)).toBe('')
    expect(statementQr({ closing: 0 }, s, true, 100)).toBe('')
    expect(statementQr({ closing: 100 }, { ...s, upiId: 'nope' }, true, 100)).toBe('')
  })
})
