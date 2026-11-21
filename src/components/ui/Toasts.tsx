import type { ReactElement } from 'react'
import { CheckCircle2, Info, TriangleAlert, X, XCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useToasts, type Toast, type ToastKind } from '@/store/toast'

const icon: Record<ToastKind, ReactElement> = {
  success: <CheckCircle2 size={16} className="shrink-0 text-ok" />,
  error: <XCircle size={16} className="shrink-0 text-danger" />,
  warning: <TriangleAlert size={16} className="shrink-0 text-warn" />,
  info: <Info size={16} className="shrink-0 text-primary" />,
}
const edge: Record<ToastKind, string> = { success: 'border-l-ok', error: 'border-l-danger', warning: 'border-l-warn', info: 'border-l-primary' }

function Item({ t }: { t: Toast }) {
  const { t: tr } = useTranslation()
  const { dismiss, hold, release } = useToasts()
  return (
    <div
      onMouseEnter={() => hold(t.id)} onMouseLeave={() => release(t.id)} onFocus={() => hold(t.id)} onBlur={() => release(t.id)}
      className={`pointer-events-auto flex max-w-sm items-start gap-2 rounded-md border border-l-4 border-line ${edge[t.kind]} bg-surface px-3 py-2 text-base shadow-float`}
    >
      <span className="mt-0.5">{icon[t.kind]}</span>
      <span className="min-w-0 flex-1 break-words">{t.message}{t.count > 1 && <span className="ml-1 rounded bg-sunken px-1 text-xs text-ink-600">×{t.count}</span>}</span>
      <button onClick={() => dismiss(t.id)} aria-label={tr('actions.close')} className="-mr-1 rounded p-0.5 text-ink-400 hover:bg-sunken hover:text-ink-900"><X size={14} /></button>
    </div>
  )
}

/**
 * Two live regions so screen readers treat them right: problems are announced at once, everything else politely.
 * Hovering or focusing a message keeps it on screen.
 */
export function Toasts() {
  const toasts = useToasts((s) => s.toasts)
  return (
    <div className="no-print pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col items-end gap-2">
      <div role="alert" aria-live="assertive" className="flex flex-col items-end gap-2">
        {toasts.filter((t) => t.kind === 'error').map((t) => <Item key={t.id} t={t} />)}
      </div>
      <div role="status" aria-live="polite" className="flex flex-col items-end gap-2">
        {toasts.filter((t) => t.kind !== 'error').map((t) => <Item key={t.id} t={t} />)}
      </div>
    </div>
  )
}
