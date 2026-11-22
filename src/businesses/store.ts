import { create } from 'zustand'
import { deleteMirror } from '@/offline/db'
import { useDevices } from '@/offline/devices'
import { api, apiEnabled } from '@/services/http/client'

export type Role = 'OWNER' | 'MANAGER' | 'STAFF'
export interface BusinessRow { id: string; name: string; role: Role; color: string | null; stateCode: string; lastOpenedAt?: string | null; createdAt?: string; current: boolean }
export interface MeAccount { status: 'TRIAL' | 'ACTIVE' | 'EXPIRED'; maxBusinesses: number; ownedBusinesses: number; canAddBusiness: boolean }
interface State {
  list: BusinessRow[]
  account: MeAccount | null
  /** Set while another business is being opened, so a transition screen covers the change. */
  /** The Add business dialog and the Manage page's colour/rename dialogs are opened from several places (menu, page, shortcut). */
  addOpen: boolean
  setAddOpen(v: boolean): void
  /** A switch waiting for the person to say it is fine to lose unsaved work. */
  confirmSwitch?: BusinessRow
  switching?: { id: string; name: string; color: string | null }
  load(): Promise<void>
  reset(): void
}

/**
 * The device keeps a copy of every business that was opened on it. When the person no longer belongs to one (it was deleted, or they were
 * removed), its copy goes too, unless bills made in it are still waiting: those stay until they are sent or downloaded.
 */
export async function pruneCopies(memberOf: string[]) {
  const dev = useDevices.getState()
  for (const [id, b] of Object.entries(dev.all)) {
    if (memberOf.includes(id) || b.pending + b.failed > 0) continue
    await deleteMirror(id)
    dev.forget(id)
  }
}

export const useBusinesses = create<State>((set) => ({
  list: [],
  account: null,
  addOpen: false,
  setAddOpen: (v) => set({ addOpen: v }),
  async load() {
    if (!apiEnabled) return
    try {
      const me = await api<{ businesses: BusinessRow[]; account: MeAccount | null }>('/me')
      // a fixed order (oldest first, owned before joined), so Alt+1 always means the same business
      set({ list: sortBusinesses(me.businesses), account: me.account })
      void pruneCopies(me.businesses.map((b) => b.id))
    } catch { /* offline: keep what we knew */ }
  },
  reset: () => set({ list: [], account: null, switching: undefined, confirmSwitch: undefined, addOpen: false }),
}))

/** The colours a business can have, picked so white text on them is readable (contrast 4.5 or more). */
export const BUSINESS_COLOR: Record<string, string> = {
  amber: '#B45309', blue: '#1D4ED8', green: '#15803D', red: '#B91C1C', purple: '#7E22CE', teal: '#0F766E', coral: '#C2410C', pink: '#BE185D',
}
export const sortBusinesses = (l: BusinessRow[]): BusinessRow[] =>
  [...l].sort((a, b) => Number(b.role === 'OWNER') - Number(a.role === 'OWNER') || (a.createdAt ?? '').localeCompare(b.createdAt ?? '') || a.name.localeCompare(b.name))

/** What a new business is made from: the answers of the three steps. Empty fields are left out so the server's defaults apply. */
export interface WizardAnswers { name: string; businessType: string; stateCode: string; gstin: string; address: string; start: 'EMPTY' | 'ITEMS' | 'ITEMS_PARTIES'; copySettings: boolean; sourceId: string }
export function buildCreateBody(id: string, a: WizardAnswers) {
  const copy = a.start !== 'EMPTY' || a.copySettings
  return {
    id, name: a.name.trim(),
    ...(a.businessType ? { businessType: a.businessType } : {}),
    ...(a.stateCode ? { stateCode: a.stateCode } : {}),
    ...(a.gstin.trim() ? { gstin: a.gstin.trim().toUpperCase() } : {}),
    ...(a.address.trim() ? { address: a.address.trim() } : {}),
    ...(copy && a.sourceId ? { copyFrom: { businessId: a.sourceId, items: a.start !== 'EMPTY', parties: a.start === 'ITEMS_PARTIES', settings: a.copySettings } } : {}),
  }
}

export const colorOf = (key: string | null | undefined) => BUSINESS_COLOR[key ?? ''] ?? '#475569'

/** Up to two initials: "Shree Furniture Mart" -> "SF". */
export const initials = (name: string): string => {
  const w = name.trim().split(/\s+/).filter(Boolean)
  return ((w[0]?.[0] ?? '?') + (w.length > 1 ? w[1]![0]! : '')).toUpperCase()
}
