import { create } from 'zustand'
import { api, tokens, type Session, type SessionUser, type SessionWorkspace } from '@/services/http/client'

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
  const accept = (s: Session) => { tokens.set(s); set({ status: 'in', user: s.user, workspace: s.workspace }) }
  tokens.onLost(() => set({ status: 'out', user: undefined, workspace: undefined }))
  return {
    status: 'loading',
    async init() {
      if (!tokens.hasRefresh()) { set({ status: 'out' }); return }
      try {
        const me = await api<{ user: SessionUser; workspace: SessionWorkspace }>('/me')
        set({ status: 'in', user: me.user, workspace: me.workspace })
      } catch {
        // Offline or server down: the saved token is kept, so a reload once the network is back signs in again.
        set({ status: 'out' })
      }
    },
    async login(email, password) { accept(await api<Session>('/auth/login', { method: 'POST', body: { email, password }, auth: false })) },
    async signup(v) { accept(await api<Session>('/auth/signup', { method: 'POST', body: v, auth: false })) },
    async logout() {
      const rt = (() => { try { return localStorage.getItem('rapidbill:refresh-token') } catch { return null } })()
      tokens.clear()
      set({ status: 'out', user: undefined, workspace: undefined })
      if (rt) await api<void>('/auth/logout', { method: 'POST', body: { refreshToken: rt }, auth: false }).catch(() => undefined)
    },
  }
})
