import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useHotkey, useModalScope } from '@/lib/hotkeys'
import { Keycap } from './Keycap'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  variant?: 'modal' | 'drawer'
  width?: string
}

/** Shared base for Modal and Drawer: scope capture, Esc to close, focus restore. */
export function Overlay({ open, onClose, title, children, footer, variant = 'modal', width }: Props) {
  const { t } = useTranslation()
  useModalScope(open)
  useHotkey('escape', () => onClose(), { scope: 'modal', enabled: open })
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    // Respect autoFocus inside the panel; otherwise focus the panel itself.
    if (!panel.current?.contains(document.activeElement)) panel.current?.focus()
    return () => prev?.focus?.()
  }, [open])

  if (!open) return null
  const isDrawer = variant === 'drawer'
  return (
    <div className="no-print fixed inset-0 z-40 flex" role="presentation">
      <div className="absolute inset-0 bg-ink-900/30" onMouseDown={onClose} />
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ width: width ?? (isDrawer ? '440px' : '560px') }}
        className={`relative flex max-h-full flex-col bg-surface shadow-float outline-none ${
          isDrawer ? 'ml-auto h-full border-l border-line' : 'm-auto max-h-[85vh] rounded-lg border border-line'
        }`}
      >
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-line px-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="flex items-center gap-2 rounded p-1 text-ink-400 hover:bg-sunken hover:text-ink-900" aria-label={t('actions.close')}>
            <Keycap combo="escape" />
            <X size={16} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-auto p-4">{children}</div>
        {footer && <footer className="flex shrink-0 justify-end gap-2 border-t border-line px-4 py-3">{footer}</footer>}
      </div>
    </div>
  )
}
