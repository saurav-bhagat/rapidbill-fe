import { useState } from 'react'
import { TriangleAlert, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router-dom'
import { todayISO } from '@/lib/format'
import { apiEnabled, tokens } from '@/services/http/client'
import { useLicense } from './store'

const KEY = 'rapidbill:license-banner-hidden'
/** Per business: dismissing the notice in one shop must not hide it in another. */
const keyFor = () => `${KEY}:${tokens.businessId() ?? ''}`
const hiddenToday = () => { try { return localStorage.getItem(keyFor()) === todayISO() } catch { return false } }

/**
 * A reminder above the page: the trial or plan is about to end, or has ended and billing is paused.
 * "Ended" cannot be hidden. The earlier reminders can, for the day.
 */
export function LicenseBanner() {
  const { t } = useTranslation('license')
  const lic = useLicense()
  const { pathname } = useLocation()
  const [hidden, setHidden] = useState(hiddenToday)
  if (!apiEnabled || !lic || pathname.startsWith('/license')) return null

  // the plan is for the phone app only: this screen is for looking, not changing
  if (lic.platformBlocked) {
    return (
      <div role="alert" className="no-print mb-3 flex flex-wrap items-center gap-3 rounded border border-warn/40 bg-warn-soft px-3 py-2 text-warn">
        <TriangleAlert size={16} className="shrink-0" />
        <span className="min-w-0 flex-1">{t('banner.platformWeb')}</span>
        <Link to="/license" className="rounded bg-primary px-3 py-1 text-sm font-medium text-white hover:bg-primary-hover">{t('banner.upgrade')}</Link>
      </div>
    )
  }
  const ended = lic.status === 'EXPIRED'
  const soon = !ended && lic.daysLeft <= (lic.status === 'TRIAL' ? 5 : 15)
  if (!ended && (!soon || hidden)) return null

  const message = ended ? (lic.licenseEndsAt ? t('banner.planEnded') : t('banner.trialEnded'))
    : lic.status === 'TRIAL' ? t('banner.trialSoon', { count: lic.daysLeft }) : t('banner.planSoon', { count: lic.daysLeft })
  const urgent = ended || lic.daysLeft <= 3
  return (
    <div role={ended ? 'alert' : 'status'} className={`no-print mb-3 flex flex-wrap items-center gap-3 rounded border px-3 py-2 ${urgent ? 'border-danger/40 bg-danger-soft text-danger' : 'border-warn/40 bg-warn-soft text-warn'}`}>
      <TriangleAlert size={16} className="shrink-0" />
      <span className="min-w-0 flex-1">{message}</span>
      <Link to="/license" className="rounded bg-primary px-3 py-1 text-sm font-medium text-white hover:bg-primary-hover">{lic.status === 'ACTIVE' || lic.licenseEndsAt ? t('banner.renew') : t('banner.choose')}</Link>
      {!ended && (
        <button onClick={() => { try { localStorage.setItem(keyFor(), todayISO()) } catch { /* ignore */ } setHidden(true) }} aria-label={t('banner.dismiss')} title={t('banner.dismiss')} className="rounded p-1 hover:bg-black/5"><X size={14} /></button>
      )}
    </div>
  )
}
