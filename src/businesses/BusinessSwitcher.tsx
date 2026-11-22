import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { TFunction } from 'i18next'
import { Check, ChevronsUpDown, Lock, Plus, Settings2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/session'
import { switchBusiness } from '@/auth/switchBusiness'
import { useHotkey, useModalScope } from '@/lib/hotkeys'
import { stateName } from '@/lib/gst'
import { toast } from '@/store/toast'
import { errorText } from '@/lib/errors'
import { apiEnabled } from '@/services/http/client'
import { useLicense } from '@/license/store'
import { useSync } from '@/offline/state'
import { useDevices } from '@/offline/devices'
import { Keycap } from '@/components/ui/Keycap'
import { BusinessAvatar } from './BusinessAvatar'
import { hasUnsaved } from './unsaved'
import { useBusinesses, type BusinessRow } from './store'

/** Open the menu from anywhere (Alt+B) and jump to the nth business (Alt+1 to Alt+5). */
export const useSwitcherUI = (() => {
  let open = false
  const subs = new Set<() => void>()
  return {
    get: () => open,
    set: (v: boolean) => { open = v; subs.forEach((f) => f()) },
    subscribe: (f: () => void) => { subs.add(f); return () => { subs.delete(f) } },
  }
})()

export async function openBusiness(b: BusinessRow, t: TFunction, force = false) {
  // work that is not saved would be lost: ask first (the dialog calls this again with force)
  if (!force && !b.current && hasUnsaved()) { useBusinesses.setState({ confirmSwitch: b }); return }
  useBusinesses.setState({ switching: { id: b.id, name: b.name, color: b.color } })
  try {
    await switchBusiness(b.id)
    void useBusinesses.getState().load()
  } catch (e) {
    useBusinesses.setState({ switching: undefined })
    toast.error(errorText(t, e))
  }
}

export function BusinessSwitcher({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation('business')
  const { t: tr } = useTranslation()
  const ws = useAuth((s) => s.workspace)
  const { list, load } = useBusinesses()
  const lic = useLicense()
  const unsent = useSync((s) => s.pendingIds.length + s.failedIds.length)
  const device = useDevices((s) => s.all)
  const waiting = (b: BusinessRow) => (b.current ? unsent : (device[b.id]?.pending ?? 0) + (device[b.id]?.failed ?? 0))
  const [open, setOpenState] = useState(useSwitcherUI.get())
  const [active, setActive] = useState(0)
  const navigate = useNavigate()
  const btn = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const [pos, setPos] = useState({ left: 0, top: 0 })

  useEffect(() => useSwitcherUI.subscribe(() => setOpenState(useSwitcherUI.get())), [])
  useEffect(() => { void load() }, [load, ws?.id])
  useModalScope(open)
  useHotkey('alt+b', () => useSwitcherUI.set(!useSwitcherUI.get()))
  for (const n of [1, 2, 3, 4, 5]) useHotkey(`alt+${n}`, () => { const b = useBusinesses.getState().list[n - 1]; if (b && !b.current) void openBusiness(b, tr) })

  useEffect(() => {
    if (!open) return
    void load()
    const r = btn.current?.getBoundingClientRect()
    if (r) setPos({ left: r.left, top: r.bottom + 6 })
    setActive(Math.max(0, useBusinesses.getState().list.findIndex((b) => b.current)))
    setTimeout(() => listRef.current?.focus(), 0)
  }, [open, load])

  if (!apiEnabled || !ws) return null
  const cur = list.find((b) => b.id === ws.id)
  const name = cur?.name ?? ws.name
  const rows = list.length ? list : [{ id: ws.id, name: ws.name, role: 'OWNER', color: null, stateCode: '', current: true } as BusinessRow]
  const close = () => { useSwitcherUI.set(false); btn.current?.focus() }
  const choose = (b: BusinessRow) => { useSwitcherUI.set(false); if (!b.current) void openBusiness(b, tr) }
  // the two actions at the end of the list are part of the same keyboard list
  const total = rows.length + 2
  const act = (i: number) => {
    if (i < rows.length) { const b = rows[i]; if (b) choose(b) }
    else if (i === rows.length) { useSwitcherUI.set(false); navigate('/businesses') }
    else { useSwitcherUI.set(false); useBusinesses.getState().setAddOpen(true) }
  }
  const roleText = (r: string) => t(`role.${r}`)
  const rowLabel = (b: BusinessRow) => `${b.name}${b.current ? `, ${t('current')}` : ''}, ${roleText(b.role)}${waiting(b) ? `, ${t('unsent', { count: waiting(b) })}` : ''}`

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); close() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(total - 1, a + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)) }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0) }
    else if (e.key === 'End') { e.preventDefault(); setActive(total - 1) }
    else if (e.key === 'Enter') { e.preventDefault(); act(active) }
    else if (e.key === 'Tab') { close() }
    else if (/^[1-5]$/.test(e.key)) { const b = rows[Number(e.key) - 1]; if (b) choose(b) }
  }

  const planLine = (() => {
    if (!lic || lic.isOwner === false) return null
    const { account } = useBusinesses.getState()
    if (lic.status === 'ACTIVE') return t('plan.paid', { plan: tr(`planName.${lic.planId}`, { ns: 'license', defaultValue: '' }), max: account?.maxBusinesses ?? 10, days: lic.daysLeft })
    if (lic.status === 'TRIAL') return t('plan.trial', { days: lic.daysLeft, count: account?.ownedBusinesses ?? rows.length, max: account?.maxBusinesses ?? 2 })
    return t('plan.ended')
  })()

  return (
    <div className="shrink-0 border-b border-white/10 p-2">
      <button ref={btn} type="button" aria-haspopup="listbox" aria-expanded={open} aria-label={t('switcherLabel', { name })}
        title={collapsed ? name : undefined}
        onClick={() => useSwitcherUI.set(!open)}
        className="flex w-full items-center gap-2.5 rounded-md p-1.5 text-left text-white hover:bg-nav-hover">
        <BusinessAvatar name={name} color={cur?.color ?? null} size={collapsed ? 36 : 32} />
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{name}</span>
              <span className="block truncate text-xs text-white/60">{[cur?.stateCode ? stateName(cur.stateCode) : '', cur ? roleText(cur.role) : ''].filter(Boolean).join(' · ')}</span>
            </span>
            {unsent > 0 && <span className="rounded bg-warn px-1.5 text-xs font-medium text-white" title={t('unsent', { count: unsent })}>{unsent}</span>}
            <ChevronsUpDown size={16} className="shrink-0 text-white/60" />
          </>
        )}
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-[80]" onMouseDown={close}>
          <div role="presentation" onMouseDown={(e) => e.stopPropagation()} className="absolute w-72 rounded-lg border border-line bg-surface p-1.5 text-ink shadow-float" style={{ left: Math.min(pos.left, window.innerWidth - 296), top: pos.top }}>
            {planLine && (
              <Link to="/license" onClick={close} className="mb-1 block rounded-md bg-primary-soft px-2.5 py-1.5 text-xs font-medium text-primary hover:underline">{planLine}</Link>
            )}
            <div className="flex items-center justify-between px-2.5 py-1 text-xs font-medium uppercase tracking-wide text-ink-600">
              <span id="biz-menu-title">{t('yours')}</span>
              <Keycap combo="alt+b" />
            </div>
            <ul ref={listRef} role="listbox" tabIndex={0} aria-labelledby="biz-menu-title" aria-activedescendant={active < rows.length ? `biz-opt-${rows[active]?.id}` : `biz-act-${active - rows.length}`} onKeyDown={onKey} className="max-h-80 overflow-y-auto outline-none">
              {rows.map((b, i) => {
                const readOnly = b.current && lic?.canWrite === false
                return (
                  <li key={b.id} id={`biz-opt-${b.id}`} role="option" aria-selected={b.current} aria-label={rowLabel(b)}
                    onMouseEnter={() => setActive(i)} onClick={() => choose(b)}
                    className={`flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 ${i === active ? 'bg-sunken' : ''}`}>
                    <BusinessAvatar name={b.name} color={b.color} size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{b.name}</span>
                      <span className="block truncate text-xs text-ink-600">{[b.stateCode ? stateName(b.stateCode) : '', roleText(b.role)].filter(Boolean).join(' · ')}</span>
                    </span>
                    {waiting(b) > 0 && <span className="shrink-0 rounded bg-warn-soft px-1.5 text-xs font-medium text-warn" title={t('unsent', { count: waiting(b) })}>⏳ {waiting(b)}</span>}
                    {readOnly && <Lock size={14} className="shrink-0 text-ink-600" aria-label={t('readOnly')} />}
                    {b.current && <Check size={16} className="shrink-0 text-primary" aria-hidden />}
                    {i < 5 && !b.current && <Keycap combo={`alt+${i + 1}`} />}
                  </li>
                )
              })}
              {(['manage', 'add'] as const).map((k, j) => {
                const i = rows.length + j
                const Icon = k === 'manage' ? Settings2 : Plus
                return (
                  <li key={k} id={`biz-act-${j}`} role="option" aria-selected={false} onMouseEnter={() => setActive(i)} onClick={() => act(i)}
                    className={`flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-sm font-medium ${j === 0 ? 'mt-1 border-t border-line pt-3' : ''} ${i === active ? 'bg-sunken' : ''}`}>
                    <span className="grid h-8 w-8 place-items-center rounded-md bg-sunken text-ink-600"><Icon size={16} /></span>
                    <span className="flex-1">{t(`menu.${k}`)}</span>
                    {k === 'manage' && <Keycap combo="alt+shift+b" />}
                  </li>
                )
              })}
            </ul>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
