import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Keyboard, LogOut, Plus } from 'lucide-react'
import { NAV } from '@/lib/nav'
import { useAuth } from '@/auth/session'
import { useSync } from '@/offline/state'
import { downloadBackup } from '@/offline/backup'
import { currentMirror } from '@/offline/sync'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { apiEnabled } from '@/services/http/client'
import { useUI } from '@/store/ui'
import { Button } from '../ui/Button'
import { Keycap } from '../ui/Keycap'
import { LanguageSwitcher } from './LanguageSwitcher'
import { SyncStatus } from './SyncStatus'
import { TextSizeControl } from './TextSizeControl'

export function TopBar() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const current = NAV.find((n) => (n.path === '/' ? pathname === '/' : pathname.startsWith(n.path)))
  const setShortcutsOpen = useUI((s) => s.setShortcutsOpen)
  const { user, workspace, logout } = useAuth()
  const ws = workspace?.id
  const unsent = useSync((x) => x.pendingIds.length + x.failedIds.length)
  const [askLogout, setAskLogout] = useState(false)
  return (
    <header className="no-print flex h-12 shrink-0 items-center justify-between border-b border-line bg-surface px-5">
      <h1 className="text-lg font-semibold">{current ? t(current.titleKey) : 'RapidBill'}</h1>
      <div className="flex items-center gap-2">
        <SyncStatus />
        <TextSizeControl />
        <LanguageSwitcher />
        <button onClick={() => setShortcutsOpen(true)} className="flex h-8 items-center gap-2 rounded px-2 text-ink-600 hover:bg-sunken" aria-label={t('layout.keyboardShortcuts')}>
          <Keyboard size={16} />
          <Keycap combo="shift+/" />
        </button>
        {apiEnabled && user && (
          <button onClick={() => (unsent > 0 ? setAskLogout(true) : void logout())} title={t('signedInAs', { ns: 'auth', name: user.name })} className="flex h-8 items-center gap-2 rounded px-2 text-ink-600 hover:bg-sunken">
            <LogOut size={16} />
            <span className="max-w-[120px] truncate text-sm">{t('logout', { ns: 'auth' })}</span>
          </button>
        )}
        {current?.path !== '/issue/new' && current?.path !== '/' && (
          <Link to="/issue/new">
            <Button variant="primary" icon={<Plus size={16} />} hotkey="alt+k" tabIndex={-1}>{t('nav.newIssue.label')}</Button>
          </Link>
        )}
      </div>
      <ConfirmDialog open={askLogout} danger title={t('logoutWarn.title', { ns: 'auth' })} confirmLabel={t('logoutWarn.confirm', { ns: 'auth' })} onCancel={() => setAskLogout(false)} onConfirm={() => { setAskLogout(false); void logout() }}>
        <p>{t('logoutWarn.body', { ns: 'auth', count: unsent })}</p>
        {ws && <Button className="mt-3" onClick={() => void downloadBackup(currentMirror(), ws)}>{t('device.download', { ns: 'common' })}</Button>}
      </ConfirmDialog>
    </header>
  )
}
