import { useEffect } from 'react'
import { create } from 'zustand'

/**
 * Screens with work that is not saved yet (a bill being made, settings being edited) say so here, so that opening
 * another business can ask first instead of throwing that work away. (The web keeps no saved drafts.)
 */
interface State { keys: string[]; set(key: string, dirty: boolean): void }
export const useUnsaved = create<State>((set) => ({
  keys: [],
  set: (key, dirty) => set((s) => (dirty === s.keys.includes(key) ? s : { keys: dirty ? [...s.keys, key] : s.keys.filter((k) => k !== key) })),
}))
export const hasUnsaved = () => useUnsaved.getState().keys.length > 0

/** Call from a screen: while `dirty` is true, switching business asks first. Cleared when the screen goes away. */
export function useReportUnsaved(key: string, dirty: boolean) {
  useEffect(() => {
    useUnsaved.getState().set(key, dirty)
    return () => useUnsaved.getState().set(key, false)
  }, [key, dirty])
}
