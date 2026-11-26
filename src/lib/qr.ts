import qrcode from 'qrcode-generator'
import type { Paise } from './money'

/**
 * A UPI payment link (the text inside a UPI QR code). Any UPI app that scans it opens a payment to `pa` for `am`.
 * Same file in the web app (src/lib) and the phone app (src/core): keep them identical.
 */
export function upiLink(p: { pa: string; pn: string; am?: Paise; tn?: string }): string {
  const e = (s: string) => encodeURIComponent(s.trim())
  const parts = [`pa=${e(p.pa)}`, `pn=${e(p.pn)}`]
  if (p.am && p.am > 0) parts.push(`am=${(p.am / 100).toFixed(2)}`)
  parts.push('cu=INR')
  if (p.tn?.trim()) parts.push(`tn=${e(p.tn)}`)
  return `upi://pay?${parts.join('&')}`
}

/** A UPI ID looks like name@bank. Anything else would make a QR code that no app can pay. */
export const isUpiId = (s: string): boolean => /^[\w.-]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$/.test(s.trim())

/** The code as rows of dark (true) and light (false) squares, without the quiet border. */
export function qrMatrix(text: string): boolean[][] {
  const qr = qrcode(0, 'M') // type 0 = pick the smallest size that fits; M = medium error correction
  qr.addData(text, 'Byte')
  qr.make()
  const n = qr.getModuleCount()
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)))
}

/** The code as a small SVG picture (black on white, with the quiet border scanners need). `px` is its size on paper or screen. */
export function qrSvg(text: string, px = 110): string {
  const m = qrMatrix(text)
  const q = 3
  const size = m.length + q * 2
  let d = ''
  m.forEach((row, r) => row.forEach((dark, c) => { if (dark) d += `M${c + q} ${r + q}h1v1h-1z` }))
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${px}" height="${px}" shape-rendering="crispEdges" role="img"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`
}

/**
 * What a printed bill's UPI QR asks for: the balance on a credit bill, the whole bill when it is marked paid by UPI (the customer
 * scans the printout at the counter). 0 means no QR: cash and bank bills, cancelled bills, nothing due. `due` is the bill's balance due.
 */
export function billQrAmount(v: { status: string; payment: string; totals: { grandTotal: Paise } }, due: Paise): Paise {
  if (v.status === 'CANCELLED') return 0
  if (v.payment === 'CREDIT') return Math.max(0, due)
  return v.payment === 'PAID_UPI' ? v.totals.grandTotal : 0
}

/** What to ask for on the screen at the counter, before saving: the whole bill paid by UPI, or the part of a credit bill paid by UPI now. */
export function counterQrAmount(payment: string, total: Paise, paidNow: Paise, paidMode: string): Paise {
  if (payment === 'PAID_UPI') return Math.max(0, total)
  return payment === 'CREDIT' && paidMode === 'UPI' && paidNow > 0 ? paidNow : 0
}
