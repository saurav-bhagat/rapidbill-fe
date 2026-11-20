import { create } from 'zustand'
import { AppError } from '@/services/errors'
import { api, tokens, type Session, type SessionUser, type SessionWorkspace } from '@/services/http/client'
import { deleteMirror } from '@/offline/db'
import { attachMirror } from '@/offline/sync'

const INFO_KEY = 'rapidbill:session-info'
const saveInfo = (u: SessionUser, w: SessionWorkspace) => { try { localStorage.setItem(INFO_KEY, JSON.stringify({ user: u, workspace: w })) } catch { /* ignore */ } }
const loadInfo = (): { user: SessionUser; workspace: SessionWorkspace } | null => {
  try { const v = JSON.parse(localStorage.getItem(INFO_KEY) ?? 'null'); return v?.user?.id && v?.workspace?.id ? v : null } catch { return null }
}
const dropInfo = () => { try { localStorage.removeItem(INFO_KEY) } catch { /* ignore */ } }

type Status = 'loading' | 'out' | 'in'

interface AuthState {
  status: Status
  user?: SessionUser
  workspace?: SessionWorkspace
  /** Resume a saved login on page load. */
  init(): Promise<void>
  login(email: string, password: string): Promise<void>
  signup(v: { email: string; password: string; name: string; businessName: string }): Promise<void>
  logout(): Promise<void>
}

export const useAuth = create<AuthState>((set) => {
  const accept = (s: Session) => { tokens.set(s); saveInfo(s.user, s.workspace); set({ status: 'in', user: s.user, workspace: s.workspace }) }
  tokens.onLost(() => set({ status: 'out', user: undefined, workspace: undefined }))
  return {
    status: 'loading',
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
    async login(email, password) { accept(await api<Session>('/auth/login', { method: 'POST', body: { email, password }, auth: false })) },
    async signup(v) { accept(await api<Session>('/auth/signup', { method: 'POST', body: v, auth: false })) },
    async logout() {
      const rt = (() => { try { return localStorage.getItem('rapidbill:refresh-token') } catch { return null } })()
      const ws = useAuth.getState().workspace?.id
      tokens.clear()
      dropInfo()
      attachMirror(null)
      if (ws) await deleteMirror(ws) // the copy of the business data does not stay behind on a shared computer
      set({ status: 'out', user: undefined, workspace: undefined })
      if (rt) await api<void>('/auth/logout', { method: 'POST', body: { refreshToken: rt }, auth: false }).catch(() => undefined)
    },
  }
})
