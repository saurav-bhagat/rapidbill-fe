import { useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { NAV } from '@/lib/nav'
import { useUI } from '@/store/ui'
import { Keycap } from '../ui/Keycap'
import { LicenseCard } from '@/license/LicenseCard'
import { AccountBox } from './AccountBox'
import { BusinessSwitcher } from '@/businesses/BusinessSwitcher'
import { useBusinesses } from '@/businesses/store'
import { apiEnabled } from '@/services/http/client'
import { useAuth } from '@/auth/session'
import { hasNewReward, useEarn } from '@/earn/store'

export function Sidebar() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const { sidebarCollapsed: c, toggleSidebar } = useUI()
  const isOwner = useBusinesses((s) => s.list.find((b) => b.current)?.role === 'OWNER')
  const userId = useAuth((s) => s.user?.id)
  const earned = useEarn((s) => s.earned)
  const seen = useEarn((s) => s.seen)
  const showEarn = apiEnabled && isOwner
  // look for new earnings now, when the tab is shown again, and every 10 minutes (quietly)
  useEffect(() => {
    if (!showEarn || !userId) return
    const go = () => { void useEarn.getState().load(userId) }
    go()
    const id = setInterval(go, 10 * 60_000)
    const visible = () => { if (document.visibilityState === 'visible') go() }
    document.addEventListener('visibilitychange', visible)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', visible) }
  }, [showEarn, userId])
  const items = NAV.filter((n) => (!n.ownerOnly || (apiEnabled && isOwner)) && (!n.accountOnly || apiEnabled))
  return (
    <aside className={`no-print flex h-full shrink-0 flex-col overflow-hidden border-r border-nav-active bg-nav text-heading transition-[width] duration-150 ${c ? 'w-16' : 'w-60'}`}>
      <div className="flex h-14 items-center gap-3 border-b border-nav-active px-3.5">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-white font-mono text-lg font-medium text-primary">₹</div>
        {!c && <span className="text-xl font-medium tracking-tight">RapidBill</span>}
      </div>
      <BusinessSwitcher collapsed={c} />
      <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2" aria-label={t('layout.primaryNav')}>
        {items.map(({ path, labelKey, combo, icon: Icon }) => {
          const label = t(labelKey)
          return (
          <NavLink
            key={path}
            to={path}
            end={path === '/'}
            title={c ? label : undefined}
            className={({ isActive }) =>
              `group flex h-10 items-center gap-3 rounded-md px-3 ${isActive ? 'bg-nav-active font-medium text-heading shadow-[inset_3px_0_0_0_rgb(var(--primary))]' : 'text-ink-600 hover:bg-nav-hover hover:text-heading'}`
            }
          >
            <span className="relative shrink-0">
              <Icon size={20} />
              {path === '/earn' && pathname !== '/earn' && hasNewReward(earned, seen) && <span role="img" aria-label={t('navDot', { ns: 'earn' })} className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-offer ring-2 ring-nav" />}
            </span>
            {!c && (
              <>
                <span className="flex-1 truncate">{label}</span>
                <Keycap combo={combo} className="hidden group-hover:inline-flex group-focus-visible:inline-flex [&_kbd]:border-nav-active [&_kbd]:bg-surface/60 [&_kbd]:text-ink-600" />
              </>
            )}
          </NavLink>
          )
        })}
      </nav>
      <LicenseCard collapsed={c} />
      <AccountBox collapsed={c} />
      <button
        onClick={toggleSidebar}
        className="flex h-10 items-center gap-3 border-t border-nav-active px-5 text-ink-600 hover:bg-nav-hover hover:text-heading"
        aria-label={c ? t('layout.expandSidebar') : t('layout.collapseSidebar')}
      >
        {c ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
        {!c && <span className="flex-1 text-left text-sm">{t('layout.collapse')}</span>}
        {!c && <Keycap combo="mod+b" className="[&_kbd]:border-nav-active [&_kbd]:bg-surface/60 [&_kbd]:text-ink-600" />}
      </button>
    </aside>
  )
}
