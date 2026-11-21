import { useSync } from '@/offline/state'

/** True while a bill, item or party exists only on this device (made or changed with no connection) and has not reached the server. */
export const isWaiting = (id: string): boolean => useSync.getState().pendingIds.includes(id)
