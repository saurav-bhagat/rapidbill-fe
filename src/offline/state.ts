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
}

export const useSync = create<SyncState>(() => ({
  online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
  syncing: false,
  lastSyncAt: null,
  version: 0,
  updateReady: false,
  pendingIds: [],
  failedIds: [],
}))

export const setSync = (patch: Partial<SyncState>) => useSync.setState(patch)
export const bumpVersion = () => useSync.setState((s) => ({ version: s.version + 1 }))
