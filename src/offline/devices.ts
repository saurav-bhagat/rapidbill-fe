import { create } from 'zustand'

/**
 * What this device knows about each business it has a copy of: its name, and how many bills are still waiting to be sent or were refused.
 * Kept in the browser's storage so the switcher can show it (and the sign-out warning can count it) without opening every copy.
 */
export interface DeviceBusiness { name: string; pending: number; failed: number }
const KEY = 'rapidbill:device-businesses'

const read = (): Record<string, DeviceBusiness> => {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? '{}'); return v && typeof v === 'object' ? v : {} } catch { return {} }
}
const write = (v: Record<string, DeviceBusiness>) => { try { localStorage.setItem(KEY, JSON.stringify(v)) } catch { /* storage blocked */ } }

interface State {
  all: Record<string, DeviceBusiness>
  /** Remember (or update) a business that has a copy on this device. */
  put(id: string, patch: Partial<DeviceBusiness>): void
  forget(id: string): void
  clear(): void
  refresh(): void
}

export const useDevices = create<State>((set, get) => ({
  all: read(),
  put(id, patch) {
    const cur = read()
    const all = { ...cur, [id]: { ...({ name: '', pending: 0, failed: 0 } as DeviceBusiness), ...cur[id], ...patch } }
    write(all); set({ all })
  },
  forget(id) { const all = read(); delete all[id]; write(all); set({ all }) },
  clear() { write({}); set({ all: {} }) },
  refresh() { if (JSON.stringify(read()) !== JSON.stringify(get().all)) set({ all: read() }) },
}))

export const unsentTotal = (all: Record<string, DeviceBusiness>) => Object.values(all).reduce((n, b) => n + b.pending + b.failed, 0)
/** Has this business been opened on this device (so it can be opened again with no connection)? */
export const hasCopy = (id: string) => id in useDevices.getState().all
