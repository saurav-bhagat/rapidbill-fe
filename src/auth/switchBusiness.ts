import { useLicenseStore } from '@/license/store'
import { detachBusiness } from '@/offline/sync'
import { resetBusinessSync } from '@/offline/state'
import { useBusinesses } from '@/businesses/store'
import { hasCopy, useDevices } from '@/offline/devices'
import { AppError } from '@/services/errors'
import { api, tokens, type Session } from '@/services/http/client'
import { useAuth } from './session'

/** Other tabs of this browser share one login, so they are told which business this tab opened. */
const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('rapidbill-session')
;(channel as unknown as { unref?: () => void } | null)?.unref?.()
export interface SwitchMessage { type: 'switched'; workspaceId: string; name: string }
export const tellTabs = (m: SwitchMessage) => channel?.postMessage(m)
export const onTabSwitch = (fn: (m: SwitchMessage) => void) => {
  const h = (e: MessageEvent) => { if ((e.data as SwitchMessage)?.type === 'switched') fn(e.data as SwitchMessage) }
  channel?.addEventListener('message', h)
  return () => channel?.removeEventListener('message', h)
}

/**
 * Open another business of the signed-in person.
 * 1. Ask the server for a session for it (nothing changes here if that fails).
 * 2. Let go of everything of the old business: its device copy, any download in progress, bills-waiting counters, the plan shown.
 * 3. Take the new session. The screen then opens the new business's own device copy and downloads it if it is the first time
 *    (the app shell is keyed by business, so no screen state or draft of the old one survives).
 * Bills still waiting in the old business stay in its own device copy; they are sent when it is opened again.
 */
export async function switchBusiness(businessId: string): Promise<void> {
  if (businessId === tokens.businessId()) return
  let session: Session | null = null
  try {
    session = await api<Session>('/auth/switch', { method: 'POST', body: { businessId, refreshToken: tokens.refreshToken() ?? undefined }, account: true })
  } catch (e) {
    // No connection: a business that was opened on this device before can still be opened from its copy. The server is told at the first chance.
    if (!(e instanceof AppError && e.key === 'networkError')) throw e
    if (!hasCopy(businessId)) throw new AppError('openOnceOnline')
  }
  const row = useBusinesses.getState().list.find((b) => b.id === businessId)
  const name = session?.workspace.name ?? row?.name ?? useDevices.getState().all[businessId]?.name ?? ''
  detachBusiness()
  resetBusinessSync()
  useLicenseStore.getState().reset()
  if (session) useAuth.getState().adopt(session)
  else { tokens.moveLocally(businessId); useAuth.getState().adoptLocal({ id: businessId, name }) }
  tellTabs({ type: 'switched', workspaceId: businessId, name })
}

/** Console helper for trying switches while the screens for it are not built yet (development builds only). */
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as { rb: unknown }).rb = {
    businesses: () => api<{ businesses: { id: string; name: string; current: boolean }[] }>('/me').then((m) => m.businesses),
    switchTo: switchBusiness,
    current: () => tokens.businessId(),
  }
}
