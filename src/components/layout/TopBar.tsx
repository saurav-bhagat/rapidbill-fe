import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Headset, Keyboard, MessageCircle, Plus } from 'lucide-react'
import { SUPPORT_PHONE_DISPLAY, supportTel, supportWhatsApp } from '@/lib/support'
import { NAV } from '@/lib/nav'
import { useUI } from '@/store/ui'
import { Button } from '../ui/Button'
import { Keycap } from '../ui/Keycap'
import { LanguageSwitcher } from './LanguageSwitcher'
import { SyncStatus } from './SyncStatus'
import { TextSizeControl } from './TextSizeControl'
import { UserMenu } from './UserMenu'
import { BusinessChip } from '@/businesses/BusinessChip'

export function TopBar() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const current = NAV.find((n) => (n.path === '/' ? pathname === '/' : pathname.startsWith(n.path)))
  const setShortcutsOpen = useUI((s) => s.setShortcutsOpen)
  return (
    <header className="no-print flex h-14 shrink-0 items-center justify-between border-b border-line bg-surface px-5">
      <div className="flex min-w-0 items-center gap-3">
        <h1 className="text-lg font-semibold">{current ? t(current.titleKey) : pathname.startsWith('/license') ? t('title', { ns: 'license' }) : pathname.startsWith('/businesses') ? t('manage.title', { ns: 'business' }) : 'RapidBill'}</h1>
        <BusinessChip />
      </div>
      <div className="flex items-center gap-2">
        <div className="mr-1 flex items-center gap-1 rounded-lg bg-sunken px-1 text-sm text-ink-600">
          <a href={supportTel} className="flex h-8 items-center gap-1.5 rounded-md px-2 hover:bg-white hover:text-primary" title={`${t('account.callSupport')} ${SUPPORT_PHONE_DISPLAY}`} aria-label={`${t('account.callSupport')} ${SUPPORT_PHONE_DISPLAY}`}>
            <Headset size={16} /><span className="hidden font-medium xl:inline">{SUPPORT_PHONE_DISPLAY}</span>
          </a>
          <a href={supportWhatsApp} target="_blank" rel="noopener noreferrer" className="grid h-8 w-8 place-items-center rounded-md hover:bg-white hover:text-ok" title={t('account.whatsapp')} aria-label={t('account.whatsapp')}>
            <MessageCircle size={16} />
          </a>
        </div>
        <SyncStatus />
        <TextSizeControl />
        <LanguageSwitcher />
        <button onClick={() => setShortcutsOpen(true)} className="flex h-9 items-center gap-2 rounded px-2 text-ink-600 hover:bg-sunken" aria-label={t('layout.keyboardShortcuts')}>
          <Keyboard size={16} />
          <Keycap combo="shift+/" />
        </button>
        <UserMenu />
        {current?.path !== '/issue/new' && current?.path !== '/' && (
          <Link to="/issue/new">
            <Button variant="primary" icon={<Plus size={16} />} hotkey="alt+k" tabIndex={-1}>{t('nav.newIssue.label')}</Button>
          </Link>
        )}
      </div>
    </header>
  )
}
