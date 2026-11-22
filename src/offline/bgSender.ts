import { tokens, api } from '@/services/http/client'
import { openMirror } from './db'
import { useDevices } from './devices'
import { flushOutbox } from './outbox'

let running = false

/**
 * Send the waiting bills of every business that is NOT open, each with its own short-lived token (asking for it does not change which
 * business is "last opened"). Bills made offline in a business you then switched away from must still reach the server within the
 * offline grace period, so this runs in the background all the time.
 * Returns how many entries were sent.
 */
export async function sendOtherBusinesses(): Promise<number> {
  if (running) return 0
  running = true
  let sent = 0
  try {
    const open = tokens.businessId()
    for (const [id, rec] of Object.entries(useDevices.getState().all)) {
      if (id === open || rec.pending === 0) continue
      let token: string
      try { token = (await api<{ accessToken: string }>('/auth/token', { method: 'POST', body: { businessId: id }, account: true, timeoutMs: 15_000 })).accessToken } catch { continue } // offline, or no longer a member: try again later
      let m
      try { m = await openMirror(id); m.background = true } catch { continue }
      try {
        const r = await flushOutbox(m, { id, token })
        sent += r.sent
      } finally { m.close() }
    }
  } finally { running = false }
  return sent
}

/** Keep sending the other businesses' bills: now, when the connection returns, when the tab is shown, and every minute. */
export function startBackgroundSender(): () => void {
  const tick = () => { if (document.visibilityState === 'visible' && navigator.onLine !== false) void sendOtherBusinesses() }
  window.addEventListener('online', tick)
  document.addEventListener('visibilitychange', tick)
  const id = window.setInterval(tick, 60_000)
  const first = window.setTimeout(tick, 3_000)
  return () => { window.removeEventListener('online', tick); document.removeEventListener('visibilitychange', tick); window.clearInterval(id); window.clearTimeout(first) }
}
