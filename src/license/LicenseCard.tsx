import { BadgeCheck, Crown, TriangleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { apiEnabled } from '@/services/http/client'
import { longDate } from './format'
import { useLicense } from './store'

/**
 * The license, at the bottom of the sidebar on every screen: days left on the trial, the plan that is running, or a way to choose one.
 * The whole card opens the Plans & License page.
 */
export function LicenseCard({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation('license')
  const lic = useLicense()
  if (!apiEnabled || !lic) return null

  const total = Math.max(1, Math.round((Date.parse(lic.trialEndsAt) - Date.parse(lic.trialStartedAt)) / 86_400_000))
  const urgent = lic.status === 'TRIAL' && lic.daysLeft <= 5
  const tone = lic.status === 'EXPIRED' ? 'danger' : urgent ? 'warn' : lic.status === 'ACTIVE' ? 'ok' : 'primary'
  const box = { danger: 'border-danger/40 bg-danger-soft', warn: 'border-warn/40 bg-warn-soft', ok: 'border-ok/30 bg-ok-soft', primary: 'border-primary/30 bg-primary-soft' }[tone]
  const text = { danger: 'text-danger', warn: 'text-warn', ok: 'text-ok', primary: 'text-primary' }[tone]
  const Icon = lic.status === 'EXPIRED' ? TriangleAlert : lic.status === 'ACTIVE' ? BadgeCheck : Crown
  const title = lic.status === 'ACTIVE' ? t(`planName.${lic.planId}`, { defaultValue: t('card.active') }) : lic.status === 'TRIAL' ? t('card.trial') : lic.licenseEndsAt ? t('card.planEnded') : t('card.trialEnded')
  const detail = lic.status === 'EXPIRED' ? t('card.readOnly') : t('card.daysLeft', { count: lic.daysLeft })

  if (collapsed) {
    return (
      <div className="border-t border-line p-2">
        <Link to="/license" title={`${title}: ${detail}`} aria-label={`${title}: ${detail}`} className={`relative flex h-9 items-center justify-center rounded border ${box} ${text}`}>
          <Icon size={18} />
          {(lic.status === 'EXPIRED' || urgent) && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-current" />}
        </Link>
      </div>
    )
  }

  return (
    <div className="shrink-0 border-t border-line p-2">
      <Link to="/license" className={`block rounded border p-2.5 hover:shadow-sm ${box}`} aria-label={`${title}. ${detail}. ${t('card.viewPlans')}`}>
        <div className={`flex items-center gap-2 text-sm font-semibold ${text}`}>
          <Icon size={16} className="shrink-0" />
          <span className="truncate">{title}</span>
        </div>
        {lic.status === 'TRIAL' && (
          <div className="mt-2" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={Math.max(0, total - lic.daysLeft)} aria-label={t('card.trial')}>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface"><div className="h-full rounded-full bg-current" style={{ width: `${Math.min(100, Math.max(4, ((total - lic.daysLeft) / total) * 100))}%` }} /></div>
          </div>
        )}
        <div className="mt-1.5 text-xs text-ink-600">{lic.status === 'ACTIVE' ? t('card.activeUntil', { date: longDate(lic.endsAt) }) : detail}</div>
        {lic.status === 'ACTIVE' && <div className="text-xs text-ink-600">{t('card.daysLeft', { count: lic.daysLeft })}</div>}
        <div className={`mt-2 rounded px-2 py-1 text-center text-sm font-medium ${lic.status === 'ACTIVE' ? 'bg-surface text-ink-900' : 'bg-primary text-white'}`}>
          {lic.status === 'ACTIVE' ? t('card.renew') : t('card.choose')}
        </div>
      </Link>
    </div>
  )
}
