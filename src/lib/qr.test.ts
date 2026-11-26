import jsQR from 'jsqr'
import { describe, expect, it } from 'vitest'
import { billQrAmount, counterQrAmount, isUpiId, qrMatrix, qrSvg, upiLink } from './qr'

/** Draw the matrix as pixels, like a camera would see it, and read it back with a real QR decoder. */
function decode(text: string): string | undefined {
  const m = qrMatrix(text)
  const scale = 6, quiet = 4, n = (m.length + quiet * 2) * scale
  const px = new Uint8ClampedArray(n * n * 4).fill(255)
  m.forEach((row, r) => row.forEach((dark, c) => {
    if (!dark) return
    for (let y = 0; y < scale; y++) for (let x = 0; x < scale; x++) {
      const i = (((r + quiet) * scale + y) * n + (c + quiet) * scale + x) * 4
      px[i] = px[i + 1] = px[i + 2] = 0
    }
  }))
  return jsQR(px, n, n)?.data
}

describe('UPI link', () => {
  it('has the payee, name, amount in rupees, currency and note', () => {
    expect(upiLink({ pa: 'shop@upi', pn: 'Sharma Medical', am: 123450, tn: 'Bill SI-2627-0001' }))
      .toBe('upi://pay?pa=shop%40upi&pn=Sharma%20Medical&am=1234.50&cu=INR&tn=Bill%20SI-2627-0001')
  })
  it('leaves the amount out when there is none, so the payer types it', () => {
    expect(upiLink({ pa: 'shop@upi', pn: 'Shop' })).toBe('upi://pay?pa=shop%40upi&pn=Shop&cu=INR')
    expect(upiLink({ pa: 'shop@upi', pn: 'Shop', am: 0 })).not.toContain('am=')
  })
  it('keeps odd characters in the name safe', () => {
    expect(upiLink({ pa: 'a@b', pn: 'A & B / Co' })).toContain('pn=A%20%26%20B%20%2F%20Co')
  })
})

describe('UPI id check', () => {
  it('accepts name@bank and refuses anything else', () => {
    for (const ok of ['shop@upi', 'sharma.medical-1@okhdfcbank', '9876543210@paytm']) expect(isUpiId(ok), ok).toBe(true)
    for (const bad of ['', 'shop', 'shop@', '@upi', 'shop @upi', 'a@b']) expect(isUpiId(bad), bad).toBe(false)
  })
})

describe('QR code', () => {
  it('reads back exactly what was put in, with a real decoder', () => {
    const link = upiLink({ pa: 'sharma.medical@okhdfcbank', pn: 'Sharma Medical & Co', am: 2099900, tn: 'Bill SI-2627-0042' })
    expect(decode(link)).toBe(link)
    expect(decode('upi://pay?pa=a%40b&pn=X&cu=INR')).toBe('upi://pay?pa=a%40b&pn=X&cu=INR')
  })
  it('draws an SVG with a quiet border', () => {
    const svg = qrSvg('upi://pay?pa=a%40bb&pn=X&cu=INR', 100)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('width="100"')
    expect(svg).toContain('fill="#fff"')
  })
})

describe('how much the QR asks for', () => {
  const bill = (payment: string, status = 'ACTIVE') => ({ payment, status, totals: { grandTotal: 50000 } })
  it('printed bill: the balance on a credit bill, the whole bill paid by UPI, nothing for cash, bank or cancelled', () => {
    expect(billQrAmount(bill('CREDIT'), 30000)).toBe(30000)
    expect(billQrAmount(bill('CREDIT'), 0)).toBe(0)
    expect(billQrAmount(bill('PAID_UPI'), 0)).toBe(50000)
    expect(billQrAmount(bill('PAID_CASH'), 0)).toBe(0)
    expect(billQrAmount(bill('PAID_BANK'), 0)).toBe(0)
    expect(billQrAmount(bill('PAID_UPI', 'CANCELLED'), 0)).toBe(0)
  })
  it('at the counter: the whole bill paid by UPI, or the part of a credit bill paid by UPI now', () => {
    expect(counterQrAmount('PAID_UPI', 50000, 0, 'CASH')).toBe(50000)
    expect(counterQrAmount('CREDIT', 50000, 20000, 'UPI')).toBe(20000)
    expect(counterQrAmount('CREDIT', 50000, 20000, 'CASH')).toBe(0)
    expect(counterQrAmount('CREDIT', 50000, 0, 'UPI')).toBe(0)
    expect(counterQrAmount('PAID_CASH', 50000, 0, 'UPI')).toBe(0)
  })
})
