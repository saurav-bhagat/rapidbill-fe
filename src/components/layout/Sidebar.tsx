import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { NAV } from '@/lib/nav'
import { useUI } from '@/store/ui'
import { Keycap } from '../ui/Keycap'
import { LicenseCard } from '@/license/LicenseCard'
import { AccountBox } from './AccountBox'
import { BusinessSwitcher } from '@/businesses/BusinessSwitcher'

export function Sidebar() {
  const { t } = useTranslation()
  const { sidebarCollapsed: c, toggleSidebar } = useUI()
  return (
    <aside className={`no-print flex h-full shrink-0 flex-col overflow-hidden border-r border-black/10 bg-nav text-white transition-[width] duration-150 ${c ? 'w-16' : 'w-60'}`}>
      <div className="flex h-14 items-center gap-3 border-b border-white/10 px-3.5">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-white font-mono text-lg font-semibold text-primary">₹</div>
        {!c && <span className="text-xl font-semibold tracking-tight">RapidBill</span>}
      </div>
      <BusinessSwitcher collapsed={c} />
      <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2" aria-label={t('layout.primaryNav')}>
        {NAV.map(({ path, labelKey, combo, icon: Icon }) => {
          const label = t(labelKey)
          return (
          <NavLink
            key={path}
            to={path}
            end={path === '/'}
            title={c ? label : undefined}
            className={({ isActive }) =>
              `group flex h-10 items-center gap-3 rounded-md px-3 ${isActive ? 'bg-white/15 font-semibold text-white shadow-[inset_3px_0_0_0_#fff]' : 'text-white/75 hover:bg-nav-hover hover:text-white'}`
            }
          >
            <Icon size={20} className="shrink-0" />
            {!c && (
              <>
                <span className="flex-1 truncate">{label}</span>
                <Keycap combo={combo} className="hidden group-hover:inline-flex group-focus-visible:inline-flex [&_kbd]:border-white/20 [&_kbd]:bg-white/10 [&_kbd]:text-white/80" />
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
        className="flex h-10 items-center gap-3 border-t border-white/10 px-5 text-white/60 hover:bg-nav-hover hover:text-white"
        aria-label={c ? t('layout.expandSidebar') : t('layout.collapseSidebar')}
      >
        {c ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
        {!c && <span className="flex-1 text-left text-sm">{t('layout.collapse')}</span>}
        {!c && <Keycap combo="mod+b" className="[&_kbd]:border-white/20 [&_kbd]:bg-white/10 [&_kbd]:text-white/80" />}
      </button>
    </aside>
  )
}
