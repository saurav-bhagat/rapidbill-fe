import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Keyboard, LogOut, Plus } from 'lucide-react'
import { NAV } from '@/lib/nav'
import { useAuth } from '@/auth/session'
import { apiEnabled } from '@/services/http/client'
import { useUI } from '@/store/ui'
import { Button } from '../ui/Button'
import { Keycap } from '../ui/Keycap'
import { LanguageSwitcher } from './LanguageSwitcher'
import { TextSizeControl } from './TextSizeControl'

export function TopBar() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const current = NAV.find((n) => (n.path === '/' ? pathname === '/' : pathname.startsWith(n.path)))
  const setShortcutsOpen = useUI((s) => s.setShortcutsOpen)
  const { user, logout } = useAuth()
  return (
    <header className="no-print flex h-12 shrink-0 items-center justify-between border-b border-line bg-surface px-5">
      <h1 className="text-lg font-semibold">{current ? t(current.titleKey) : 'RapidBill'}</h1>
      <div className="flex items-center gap-2">
        <TextSizeControl />
        <LanguageSwitcher />
        <button onClick={() => setShortcutsOpen(true)} className="flex h-8 items-center gap-2 rounded px-2 text-ink-600 hover:bg-sunken" aria-label={t('layout.keyboardShortcuts')}>
          <Keyboard size={16} />
          <Keycap combo="shift+/" />
        </button>
        {apiEnabled && user && (
          <button onClick={() => void logout()} title={t('signedInAs', { ns: 'auth', name: user.name })} className="flex h-8 items-center gap-2 rounded px-2 text-ink-600 hover:bg-sunken">
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
    </header>
  )
}
