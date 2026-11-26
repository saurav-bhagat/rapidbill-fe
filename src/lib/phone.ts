/** Digits for wa.me / tel: links. Indian numbers: 10 digits (or 0 + 10) get +91. Returns null if it does not look like a phone number. */
export function phoneDigits(raw: string): string | null {
  let d = raw.replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1)
  if (d.length === 10) d = `91${d}`
  return d.length >= 11 && d.length <= 15 ? d : null
}
export const telUrl = (raw: string): string | null => { const d = phoneDigits(raw); return d ? `tel:+${d}` : null }
export const whatsappUrl = (raw: string, text?: string): string | null => {
  const d = phoneDigits(raw)
  return d ? `https://wa.me/${d}${text ? `?text=${encodeURIComponent(text)}` : ''}` : null
}
