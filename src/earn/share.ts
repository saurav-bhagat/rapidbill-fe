/** The words a person sends to a friend, and the ways to send them. */

/** `https://wa.me/?text=...` opens WhatsApp with the message ready; the person picks who gets it. */
export const whatsappShareUrl = (text: string): string => `https://wa.me/?text=${encodeURIComponent(text)}`

/** What a friend's payment is worth to the referrer: `percent` of the plan fee without GST (prices include 18% GST). Only for the example; the server decides real rewards. */
export const exampleReward = (pricePaise: number, percent: number, gstPercent = 18): number => Math.floor((pricePaise * percent) / (100 + gstPercent))

/** Copy text. Uses the clipboard when the browser allows it, otherwise the old select-and-copy way. Returns whether it worked. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true }
  } catch { /* fall through to the old way */ }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch { return false }
}

/** The phone's own share sheet, where the browser has one. */
export const canNativeShare = (): boolean => typeof navigator !== 'undefined' && typeof navigator.share === 'function'
export async function nativeShare(text: string, title: string): Promise<void> {
  try { await navigator.share({ title, text }) } catch { /* the person closed the sheet */ }
}

const initialsOf = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts.at(-1)![0] ?? '' : '')).toUpperCase()
}
export { initialsOf }
