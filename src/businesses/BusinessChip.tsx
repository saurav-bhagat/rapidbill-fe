import { useTranslation } from 'react-i18next'
import { useAuth } from '@/auth/session'
import { apiEnabled } from '@/services/http/client'
import { colorOf, useBusinesses } from './store'

/** The business you are in, in the top bar of every screen, in its own colour. */
export function BusinessChip() {
  const { t } = useTranslation('business')
  const ws = useAuth((s) => s.workspace)
  const color = useBusinesses((s) => s.list.find((b) => b.id === ws?.id)?.color ?? null)
  if (!apiEnabled || !ws) return null
  return (
    <span className="inline-flex max-w-[16rem] items-center gap-2 rounded-full border px-2.5 py-0.5 text-sm font-medium" style={{ borderColor: colorOf(color), color: colorOf(color) }} title={t('chip', { name: ws.name })}>
      <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: colorOf(color) }} />
      <span className="truncate">{ws.name}</span>
    </span>
  )
}
