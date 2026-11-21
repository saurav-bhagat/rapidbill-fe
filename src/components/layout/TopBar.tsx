import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Keyboard, Plus } from 'lucide-react'
import { NAV } from '@/lib/nav'
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
  return (
    <header className="no-print flex h-12 shrink-0 items-center justify-between border-b border-line bg-surface px-5">
      <h1 className="text-lg font-semibold">{current ? t(current.titleKey) : pathname.startsWith('/license') ? t('title', { ns: 'license' }) : 'RapidBill'}</h1>
      <div className="flex items-center gap-2">
        <SyncStatus />
        <TextSizeControl />
        <LanguageSwitcher />
        <button onClick={() => setShortcutsOpen(true)} className="flex h-8 items-center gap-2 rounded px-2 text-ink-600 hover:bg-sunken" aria-label={t('layout.keyboardShortcuts')}>
          <Keyboard size={16} />
          <Keycap combo="shift+/" />
        </button>
        {current?.path !== '/issue/new' && current?.path !== '/' && (
          <Link to="/issue/new">
            <Button variant="primary" icon={<Plus size={16} />} hotkey="alt+k" tabIndex={-1}>{t('nav.newIssue.label')}</Button>
          </Link>
        )}
      </div>
    </header>
  )
}
