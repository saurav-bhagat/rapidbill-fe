import { SignOutDialog, useUnsentEverywhere } from '@/auth/SignOutDialog'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LogOut } from 'lucide-react'
import { useAuth } from '@/auth/session'
import { apiEnabled } from '@/services/http/client'

/**
 * The bottom of the sidebar, on every screen: who is signed in and sign out (support lives in the top bar).
 * Signing out with bills not yet sent asks first and offers a backup.
 */
export function AccountBox({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation()
  const { user, workspace, logout } = useAuth()
  const unsent = useUnsentEverywhere()
  const [ask, setAsk] = useState(false)
  const signedIn = apiEnabled && !!user
  const link = 'flex h-9 items-center gap-2 rounded-md px-2.5 text-white/80 hover:bg-nav-hover hover:text-white'

  return (
    <div className="shrink-0 space-y-1 border-t border-white/10 p-2">
      {signedIn && !collapsed && (
        <div className="px-2.5 pb-1">
          <div className="truncate text-sm font-semibold text-white" title={user.email}>{user.name}</div>
          <div className="truncate text-xs text-white/60">{workspace?.name}</div>
        </div>
      )}

      {signedIn && (
        <button onClick={() => (unsent > 0 ? setAsk(true) : void logout())} title={collapsed ? t('logout', { ns: 'auth' }) : undefined} aria-label={t('logout', { ns: 'auth' })} className={`${link} w-full`}>
          <LogOut size={16} className="shrink-0" />
          {!collapsed && <span className="truncate text-sm">{t('logout', { ns: 'auth' })}</span>}
        </button>
      )}

      <SignOutDialog open={ask} onCancel={() => setAsk(false)} onConfirm={() => { setAsk(false); void logout() }} />
    </div>
  )
}
