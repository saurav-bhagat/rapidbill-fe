import { SignOutDialog, useUnsentEverywhere } from '@/auth/SignOutDialog'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronDown, CreditCard, LogOut } from 'lucide-react'
import { useAuth } from '@/auth/session'
import { apiEnabled } from '@/services/http/client'

/** Who is signed in, and Sign out, always at the top right where people look for it. */
export function UserMenu() {
  const { t } = useTranslation()
  const { user, workspace, logout } = useAuth()
  const unsent = useUnsentEverywhere()
  const [open, setOpen] = useState(false)
  const [ask, setAsk] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', away); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc) }
  }, [open])

  if (!apiEnabled || !user) return null
  const initials = user.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?'
  const signOut = () => { setOpen(false); if (unsent > 0) setAsk(true); else void logout() }

  return (
    <div ref={box} className="relative">
      <button onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open} className="flex h-9 items-center gap-2 rounded-lg border border-line bg-surface pl-1 pr-2 hover:bg-sunken">
        <span className="grid h-7 w-7 place-items-center rounded-md bg-primary text-xs font-medium text-white">{initials}</span>
        <span className="hidden max-w-[120px] truncate text-sm font-medium md:block">{user.name}</span>
        <ChevronDown size={14} className="text-ink-600" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-11 z-40 w-64 overflow-hidden rounded-xl border border-line bg-surface shadow-float">
          <div className="border-b border-line px-4 py-3">
            <div className="truncate font-medium">{user.name}</div>
            <div className="truncate text-sm text-ink-600">{user.email}</div>
            {workspace && <div className="mt-0.5 truncate text-sm text-ink-600">{workspace.name}</div>}
          </div>
          <Link role="menuitem" to="/license" onClick={() => setOpen(false)} className="flex h-10 items-center gap-2.5 px-4 text-sm hover:bg-sunken"><CreditCard size={16} />{t('title', { ns: 'license' })}</Link>
          <button role="menuitem" onClick={signOut} className="flex h-10 w-full items-center gap-2.5 border-t border-line px-4 text-sm font-medium text-danger hover:bg-danger-soft"><LogOut size={16} />{t('logout', { ns: 'auth' })}</button>
        </div>
      )}
      <SignOutDialog open={ask} onCancel={() => setAsk(false)} onConfirm={() => { setAsk(false); void logout() }} />
    </div>
  )
}
