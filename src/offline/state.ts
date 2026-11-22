import { create } from 'zustand'

interface SyncState {
  /** Last known reachability of the server (from real requests, not the browser's online flag). */
  online: boolean
  syncing: boolean
  lastSyncAt: string | null
  /** Goes up every time new data was written to the device copy; screens reload when it changes. */
  version: number
  /** A new version of the app is downloaded and waiting. */
  updateReady: boolean
  /** Bills made on this device that the server has not confirmed yet. */
  pendingIds: string[]
  /** Bills the server refused; they need a person to look at them. */
  failedIds: string[]
  /** When the oldest still-waiting bill was made. */
  oldestWaiting: string | null
  /** Server time minus this device's time, in milliseconds (null until the first download). */
  clockSkewMs: number | null
}

export const useSync = create<SyncState>(() => ({
  online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
  syncing: false,
  lastSyncAt: null,
  version: 0,
  updateReady: false,
  pendingIds: [],
  failedIds: [],
  oldestWaiting: null,
  clockSkewMs: null,
}))

/** Forget everything that belongs to the business that was open (bills waiting, last download, clock). Reachability stays (it is about the server), and so does `version`: it only ever goes up, so no screen is told to reload against a copy that is not there. */
export const resetBusinessSync = () => useSync.setState({ syncing: false, lastSyncAt: null, pendingIds: [], failedIds: [], oldestWaiting: null, clockSkewMs: null })

const connectivity = new Set<(online: boolean) => void>()
/** Called when the app first notices it has lost, or got back, the server. */
export const onConnectivity = (fn: (online: boolean) => void) => { connectivity.add(fn); return () => { connectivity.delete(fn) } }

export const setSync = (patch: Partial<SyncState>) => {
  const was = useSync.getState().online
  useSync.setState(patch)
  if (patch.online !== undefined && patch.online !== was) connectivity.forEach((f) => f(patch.online!))
}

/** Other open tabs of the app: told when data or the queue changed, so every tab shows the same thing. */
type Message = 'data' | 'outbox'
const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('rapidbill-sync')
;(channel as unknown as { unref?: () => void } | null)?.unref?.()
export const notifyOthers = (what: Message) => channel?.postMessage(what)
export const onOthers = (fn: (what: Message) => void) => {
  const h = (e: MessageEvent) => fn(e.data as Message)
  channel?.addEventListener('message', h)
  return () => channel?.removeEventListener('message', h)
}

export const bumpVersion = () => { useSync.setState((s) => ({ version: s.version + 1 })); notifyOthers('data') }
