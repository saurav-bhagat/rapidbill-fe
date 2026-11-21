import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Headset, LogOut, MessageCircle } from 'lucide-react'
import { useAuth } from '@/auth/session'
import { SUPPORT_PHONE_DISPLAY, supportTel, supportWhatsApp } from '@/lib/support'
import { downloadBackup } from '@/offline/backup'
import { useSync } from '@/offline/state'
import { currentMirror } from '@/offline/sync'
import { apiEnabled } from '@/services/http/client'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/ConfirmDialog'

/**
 * The bottom of the sidebar, on every screen: who is signed in, sign out, and how to reach customer support.
 * Signing out with bills not yet sent asks first and offers a backup.
 */
export function AccountBox({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation()
  const { user, workspace, logout } = useAuth()
  const unsent = useSync((x) => x.pendingIds.length + x.failedIds.length)
  const [ask, setAsk] = useState(false)
  const signedIn = apiEnabled && !!user
  const link = 'flex h-8 items-center gap-2 rounded px-2.5 text-ink-600 hover:bg-sunken hover:text-ink-900'

  return (
    <div className="shrink-0 space-y-1 border-t border-line p-2">
      {signedIn && !collapsed && (
        <div className="px-2.5 pb-1">
          <div className="truncate text-sm font-medium" title={user.email}>{user.name}</div>
          <div className="truncate text-xs text-ink-400">{workspace?.name}</div>
        </div>
      )}

      {signedIn && (
        <button onClick={() => (unsent > 0 ? setAsk(true) : void logout())} title={collapsed ? t('logout', { ns: 'auth' }) : undefined} aria-label={t('logout', { ns: 'auth' })} className={`${link} w-full`}>
          <LogOut size={16} className="shrink-0" />
          {!collapsed && <span className="truncate text-sm">{t('logout', { ns: 'auth' })}</span>}
        </button>
      )}

      <div className={collapsed ? 'space-y-1' : 'rounded border border-line bg-paper p-1.5'}>
        {!collapsed && <div className="px-1 pb-0.5 text-xs font-medium uppercase tracking-wide text-ink-400">{t('account.support')}</div>}
        <a href={supportTel} className={link} title={`${t('account.callSupport')} ${SUPPORT_PHONE_DISPLAY}`} aria-label={`${t('account.callSupport')} ${SUPPORT_PHONE_DISPLAY}`}>
          <Headset size={16} className="shrink-0" />
          {!collapsed && <span className="truncate font-mono text-sm">{SUPPORT_PHONE_DISPLAY}</span>}
        </a>
        <a href={supportWhatsApp} target="_blank" rel="noopener noreferrer" className={link} title={t('account.whatsapp')} aria-label={t('account.whatsapp')}>
          <MessageCircle size={16} className="shrink-0" />
          {!collapsed && <span className="truncate text-sm">{t('account.whatsapp')}</span>}
        </a>
      </div>

      <ConfirmDialog open={ask} danger title={t('logoutWarn.title', { ns: 'auth' })} confirmLabel={t('logoutWarn.confirm', { ns: 'auth' })} onCancel={() => setAsk(false)} onConfirm={() => { setAsk(false); void logout() }}>
        <p>{t('logoutWarn.body', { ns: 'auth', count: unsent })}</p>
        {workspace && <Button className="mt-3" onClick={() => void downloadBackup(currentMirror(), workspace.id)}>{t('device.download', { ns: 'common' })}</Button>}
      </ConfirmDialog>
    </div>
  )
}
