import { CheckCircle2, Info, XCircle } from 'lucide-react'
import { useToasts } from '@/store/toast'

const icon = { success: <CheckCircle2 size={16} className="text-ok" />, error: <XCircle size={16} className="text-danger" />, info: <Info size={16} className="text-primary" /> }

export function Toasts() {
  const toasts = useToasts((s) => s.toasts)
  return (
    <div className="no-print pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto flex items-center gap-2 rounded-md border border-line bg-surface px-3 py-2 text-base shadow-float">
          {icon[t.kind]}
          {t.message}
        </div>
      ))}
    </div>
  )
}
