import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { NAV } from '@/lib/nav'
import { useUI } from '@/store/ui'
import { Keycap } from '../ui/Keycap'
import { LicenseCard } from '@/license/LicenseCard'
import { AccountBox } from './AccountBox'

export function Sidebar() {
  const { t } = useTranslation()
  const { sidebarCollapsed: c, toggleSidebar } = useUI()
  return (
    <aside className={`no-print flex h-full shrink-0 flex-col overflow-hidden border-r border-line bg-surface transition-[width] duration-150 ${c ? 'w-14' : 'w-52'}`}>
      <div className="flex h-12 items-center gap-2 border-b border-line px-3.5">
        <div className="grid h-7 w-7 shrink-0 place-items-center rounded bg-primary font-mono text-sm font-medium text-white">₹</div>
        {!c && <span className="text-lg font-semibold tracking-tight">RapidBill</span>}
      </div>
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
              `group flex h-9 items-center gap-3 rounded px-2.5 ${isActive ? 'bg-primary-soft font-medium text-primary' : 'text-ink-600 hover:bg-sunken hover:text-ink-900'}`
            }
          >
            <Icon size={18} className="shrink-0" />
            {!c && (
              <>
                <span className="flex-1 truncate">{label}</span>
                <Keycap combo={combo} className="hidden group-hover:inline-flex group-focus-visible:inline-flex" />
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
        className="flex h-10 items-center gap-3 border-t border-line px-4 text-ink-400 hover:bg-sunken hover:text-ink-900"
        aria-label={c ? t('layout.expandSidebar') : t('layout.collapseSidebar')}
      >
        {c ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        {!c && <span className="flex-1 text-left text-sm">{t('layout.collapse')}</span>}
        {!c && <Keycap combo="mod+b" />}
      </button>
    </aside>
  )
}
