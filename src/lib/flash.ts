const KEY = 'rapidbill:flash'

/** A message to show after the page reloads (used after "reset" and "delete all data", which reload the app). */
export const setFlash = (msg: 'resetDone' | 'clearDone') => { try { sessionStorage.setItem(KEY, msg) } catch { /* ignore */ } }
export function takeFlash(): string | null {
  try { const v = sessionStorage.getItem(KEY); sessionStorage.removeItem(KEY); return v } catch { return null }
}
