import { useTranslation } from 'react-i18next'
import { BusinessAvatar } from './BusinessAvatar'
import { useBusinesses } from './store'

/** A short full-screen moment while another business opens: its avatar and name, so it is clear where you are going. */
export function SwitchingScreen() {
  const { t } = useTranslation('business')
  const s = useBusinesses((x) => x.switching)
  if (!s) return null
  return (
    <div role="status" aria-live="polite" className="fixed inset-0 z-[90] grid place-items-center bg-surface">
      <div className="flex flex-col items-center gap-4">
        <BusinessAvatar name={s.name} color={s.color} size={72} />
        <p className="text-lg font-semibold">{t('opening', { name: s.name })}</p>
        <div className="h-1 w-40 overflow-hidden rounded bg-sunken"><div className="h-full w-1/2 animate-pulse rounded bg-primary" /></div>
      </div>
    </div>
  )
}
