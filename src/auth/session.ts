import { create } from 'zustand'
import { AppError } from '@/services/errors'
import { api, tokens, type Session, type SessionUser, type SessionWorkspace } from '@/services/http/client'
import i18n from '@/i18n'
import { useLicenseStore } from '@/license/store'
import { toast } from '@/store/toast'
import { deleteMirror } from '@/offline/db'
import { attachMirror } from '@/offline/sync'
import { useDevices } from '@/offline/devices'

const INFO_KEY = 'rapidbill:session-info'
const saveInfo = (u: SessionUser, w: SessionWorkspace) => { try { localStorage.setItem(INFO_KEY, JSON.stringify({ user: u, workspace: w })) } catch { /* ignore */ } }
const loadInfo = (): { user: SessionUser; workspace: SessionWorkspace } | null => {
  try { const v = JSON.parse(localStorage.getItem(INFO_KEY) ?? 'null'); return v?.user?.id && v?.workspace?.id ? v : null } catch { return null }
}
const dropInfo = () => { try { localStorage.removeItem(INFO_KEY) } catch { /* ignore */ } }

/** Sign out of this device: the login, the plan shown, and every copy of business data kept here (not only the open one), so nothing stays behind on a shared computer. */
async function forgetEverythingHere() {
  const ws = useAuth.getState().workspace?.id
  tokens.clear()
  dropInfo()
  useLicenseStore.getState().reset()
  attachMirror(null)
  const copies = new Set([...Object.keys(useDevices.getState().all), ...(ws ? [ws] : [])])
  useDevices.getState().clear()
  for (const id of copies) await deleteMirror(id)
}

type Status = 'loading' | 'out' | 'in'

interface AuthState {
  status: Status
  /** Why the person is looking at the sign-in screen when they did not ask to sign out. */
  notice?: 'expired'
  /** Just created an account: ask for the business details once (can be skipped). */
  onboarding: boolean
  finishOnboarding(): void
  user?: SessionUser
  workspace?: SessionWorkspace
  /** Resume a saved login on page load. */
  init(): Promise<void>
  login(email: string, password: string): Promise<void>
  /** Take a session for another business of the same person (after a switch). */
  adopt(s: Session): void
  /** Offline switch to a business that has a copy on this device (the server is told later). */
  adoptLocal(w: SessionWorkspace): void
  signup(v: { email: string; password: string; name: string; businessName: string; referralCode?: string }): Promise<void>
  logout(): Promise<void>
  /** Delete the account for good (the server checks the password), then forget everything on this device. */
  deleteAccount(password: string): Promise<void>
}

export const useAuth = create<AuthState>((set) => {
  const accept = (s: Session) => { tokens.set(s); saveInfo(s.user, s.workspace); set({ status: 'in', user: s.user, workspace: s.workspace, notice: undefined }) }
  tokens.onLost(() => set({ status: 'out', user: undefined, workspace: undefined, notice: 'expired' }))
  return {
    status: 'loading',
    onboarding: false,
    finishOnboarding: () => set({ onboarding: false }),
    async init() {
      if (!tokens.hasRefresh()) { set({ status: 'out' }); return }
      try {
        const me = await api<{ user: SessionUser; workspace: SessionWorkspace }>('/me')
        saveInfo(me.user, me.workspace)
        set({ status: 'in', user: me.user, workspace: me.workspace })
      } catch (e) {
        // No connection: stay signed in with the saved details, so the app opens and works from this device's copy.
        const info = loadInfo()
        if (e instanceof AppError && e.key === 'networkError' && info && tokens.hasRefresh()) set({ status: 'in', ...info })
        else set({ status: 'out' })
      }
    },
    adopt: (s) => accept(s),
    adoptLocal: (w) => { const u = useAuth.getState().user; if (u) saveInfo(u, w); set({ workspace: w }) },
    async login(email, password) { accept(await api<Session>('/auth/login', { method: 'POST', body: { email, password }, auth: false })) },
    async signup(v) { accept(await api<Session>('/auth/signup', { method: 'POST', body: v, auth: false })); set({ onboarding: true }) },
    async logout() {
      const rt = (() => { try { return localStorage.getItem('rapidbill:refresh-token') } catch { return null } })()
      await forgetEverythingHere()
      set({ status: 'out', user: undefined, workspace: undefined, notice: undefined })
      toast.info(i18n.t('signedOut', { ns: 'auth' }))
      if (rt) await api<void>('/auth/logout', { method: 'POST', body: { refreshToken: rt }, auth: false }).catch(() => undefined)
    },
    async deleteAccount(password) {
      // the server first: if it refuses (wrong password, offline) nothing on this device changes
      await api('/me', { method: 'DELETE', body: { confirm: 'DELETE', password }, account: true, timeoutMs: 60_000 })
      await forgetEverythingHere()
      set({ status: 'out', user: undefined, workspace: undefined, notice: undefined, onboarding: false })
      toast.info(i18n.t('accountDeleted', { ns: 'auth' }))
    },
  }
})
