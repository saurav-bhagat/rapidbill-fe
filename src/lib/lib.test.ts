import { describe, expect, it } from 'vitest'
import { amountInWords, numberToWordsHI, numberToWordsIN } from './words'
import { formatAmount, formatINR } from './format'
import { parseRupees, toPaise } from './money'
import { nextVoucherNo } from './voucherNo'
import { calcVoucher } from './calc'

describe('money', () => {
  it('converts without float drift', () => {
    expect(toPaise(19.99)).toBe(1999)
    expect(toPaise(0.1 + 0.2)).toBe(30)
  })
  it('parses user input', () => {
    expect(parseRupees('₹ 1,250.50')).toBe(125050)
    expect(parseRupees('abc')).toBeNull()
    expect(parseRupees('')).toBeNull()
  })
})

describe('format', () => {
  it('uses Indian grouping', () => {
    expect(formatAmount(12345600)).toBe('1,23,456.00')
    expect(formatINR(1000000000)).toBe('₹1,00,00,000.00')
    expect(formatINR(-5000)).toBe('-₹50.00')
  })
})

describe('amount in words', () => {
  it('handles lakh and crore', () => {
    expect(numberToWordsIN(123456)).toBe('One Lakh Twenty Three Thousand Four Hundred Fifty Six')
    expect(numberToWordsIN(10000000)).toBe('One Crore')
    expect(numberToWordsIN(0)).toBe('Zero')
  })
  it('includes paise', () => {
    expect(amountInWords(10050)).toBe('Rupees One Hundred and Fifty Paise Only')
    expect(amountInWords(50000)).toBe('Rupees Five Hundred Only')
    expect(amountInWords(12345650, 'hi')).toBe('एक लाख तेईस हज़ार चार सौ छप्पन रुपये और पचास पैसे मात्र')
    expect(amountInWords(50000, 'hi')).toBe('पाँच सौ रुपये मात्र')
    expect(numberToWordsHI(10000000)).toBe('एक करोड़')
    expect(numberToWordsHI(99)).toBe('निन्यानवे')
    expect(numberToWordsHI(0)).toBe('शून्य')
  })
})

describe('voucher number', () => {
  it('increments within the year series', () => {
    expect(nextVoucherNo([], 'SI', 2026)).toBe('SI-2026-0001')
    expect(nextVoucherNo(['SI-2026-0001', 'SI-2026-0009', 'SI-2025-0400'], 'SI', 2026)).toBe('SI-2026-0010')
  })
})

describe('calcVoucher', () => {
  const line = { qty: 10, rate: 10000, discPct: 10, gstPct: 12 } // 10 x ₹100
  it('intra-state splits CGST/SGST', () => {
    const r = calcVoucher({ lines: [line], taxApplicable: true, sellerState: '29', partyState: '29', roundOff: false })
    expect(r.lines[0].gross).toBe(100000)
    expect(r.lines[0].discount).toBe(10000)
    expect(r.taxable).toBe(90000)
    expect(r.tax).toBe(10800)
    expect(r.cgst).toBe(5400)
    expect(r.sgst).toBe(5400)
    expect(r.igst).toBe(0)
    expect(r.grandTotal).toBe(100800)
  })
  it('inter-state uses IGST', () => {
    const r = calcVoucher({ lines: [line], taxApplicable: true, sellerState: '29', partyState: '27', roundOff: false })
    expect(r.igst).toBe(10800)
    expect(r.cgst + r.sgst).toBe(0)
  })
  it('no tax mode', () => {
    const r = calcVoucher({ lines: [line], taxApplicable: false, sellerState: '29', partyState: '27', roundOff: false })
    expect(r.tax).toBe(0)
    expect(r.grandTotal).toBe(90000)
  })
  it('odd tax paisa lands on SGST, totals stay consistent', () => {
    const r = calcVoucher({ lines: [{ qty: 1, rate: 101, discPct: 0, gstPct: 5 }], taxApplicable: true, sellerState: '29', partyState: '29', roundOff: false })
    expect(r.tax).toBe(5)
    expect(r.cgst + r.sgst).toBe(r.tax)
  })
  it('round-off to nearest rupee', () => {
    const r = calcVoucher({ lines: [{ qty: 1, rate: 10049, discPct: 0, gstPct: 0 }], taxApplicable: true, sellerState: '29', partyState: null, roundOff: true })
    expect(r.grandTotal).toBe(10000)
    expect(r.roundOff).toBe(-49)
  })
  it('allocates bill discount fully across lines', () => {
    const r = calcVoucher({
      lines: [
        { qty: 1, rate: 10000, discPct: 0, gstPct: 18 },
        { qty: 1, rate: 20000, discPct: 0, gstPct: 5 },
        { qty: 1, rate: 3333, discPct: 0, gstPct: 12 },
      ],
      taxApplicable: true, sellerState: '29', partyState: '29',
      billDiscount: { type: 'AMT', value: 1001 }, roundOff: false,
    })
    expect(r.billDiscount).toBe(1001)
    expect(r.taxable).toBe(33333 - 1001)
  })
})
