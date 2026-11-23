import { create } from 'zustand'
import { fetchOverview } from './api'

const key = (userId: string) => `rapidbill:earn-seen:${userId}`
/** What the person has already looked at (total earned, paise). 0 when they never opened the page. */
export const readSeen = (userId: string): number => { try { return Number(localStorage.getItem(key(userId))) || 0 } catch { return 0 } }
export const writeSeen = (userId: string, earned: number): void => { try { localStorage.setItem(key(userId), String(earned)) } catch { /* ignore */ } }

interface EarnState {
  /** Total earned as of the last look at the server (null until known). */
  earned: number | null
  seen: number
  /** Read the total from the server (quietly: a failure leaves things as they were). */
  load(userId: string): Promise<void>
  markSeen(userId: string, earned: number): void
}

/** Lets the sidebar show a small dot when the person has earned something they have not looked at yet. */
export const useEarn = create<EarnState>((set) => ({
  earned: null,
  seen: 0,
  async load(userId) {
    try {
      const ov = await fetchOverview()
      set({ earned: ov.totals.earned, seen: readSeen(userId) })
    } catch { /* offline or not allowed: no dot */ }
  },
  markSeen(userId, earned) { writeSeen(userId, earned); set({ earned, seen: earned }) },
}))

export const hasNewReward = (earned: number | null, seen: number): boolean => earned !== null && earned > seen
