/**
 * The referral code in a link (`https://therapidbill.in/signup?ref=RB-7K4M2Q`). It is read when the site opens and kept for the tab,
 * so it is still there after the person moves from the home page to the sign-up form.
 */
const KEY = 'rapidbill:ref'
/** No 0/O or 1/I/L, same as the server, so a code can be read out over a call. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

/** What a person typed, tidied into `RB-XXXXXX`, or null when it cannot be a code (same rules as the server). */
export function normalizeRef(raw: string): string | null {
  const s = raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const body = s.startsWith('RB') && s.length === 8 ? s.slice(2) : s
  if (body.length !== 6 || [...body].some((c) => !ALPHABET.includes(c))) return null
  return `RB-${body}`
}

/** `?ref=...` from a URL's query string, tidied; null when there is none or it is not a code. */
export function refFromSearch(search: string): string | null {
  const v = new URLSearchParams(search).get('ref')
  return v ? normalizeRef(v) : null
}

/** Call once when the site opens: remember a code that came in the link. */
export function captureRef(): void {
  try {
    const code = refFromSearch(window.location.search)
    if (code) sessionStorage.setItem(KEY, code)
  } catch { /* storage blocked: the person can still type the code */ }
}
export const savedRef = (): string => { try { return sessionStorage.getItem(KEY) ?? '' } catch { return '' } }
export const forgetRef = (): void => { try { sessionStorage.removeItem(KEY) } catch { /* ignore */ } }
