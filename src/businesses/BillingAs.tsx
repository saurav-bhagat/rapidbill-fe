import { useTranslation } from 'react-i18next'
import { useAuth } from '@/auth/session'
import { stateName } from '@/lib/gst'
import { apiEnabled } from '@/services/http/client'
import { BusinessAvatar } from './BusinessAvatar'
import { colorOf, useBusinesses } from './store'

/** Above the bill: which business this bill will be made in, with its colour as a bar, so the wrong shop is never billed by mistake. */
export function BillingAs() {
  const { t } = useTranslation('business')
  const ws = useAuth((s) => s.workspace)
  const cur = useBusinesses((s) => s.list.find((b) => b.id === ws?.id))
  if (!apiEnabled || !ws) return null
  return (
    <div className="flex shrink-0 items-center gap-2.5 rounded-md border border-line bg-surface px-3 py-1.5" style={{ borderTop: `3px solid ${colorOf(cur?.color)}` }}>
      <BusinessAvatar name={ws.name} color={cur?.color ?? null} size={24} />
      <p className="min-w-0 truncate text-sm text-ink-600">{t('billingAs')} <strong className="font-medium text-ink">{ws.name}</strong>{cur?.stateCode ? <> · {stateName(cur.stateCode)}</> : null}</p>
    </div>
  )
}
