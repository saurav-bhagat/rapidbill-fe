import { useTranslation } from 'react-i18next'
import { SUPPORT_PHONE_DISPLAY, supportTel } from '@/lib/support'

/** A short "need help?" line for screens that have no sidebar (sign-in, loading problems, crashes). */
export function SupportLine({ className = '' }: { className?: string }) {
  const { t } = useTranslation()
  return (
    <p className={`text-sm text-ink-600 ${className}`}>
      {t('account.needHelp')} <a href={supportTel} className="font-mono font-medium text-primary underline">{SUPPORT_PHONE_DISPLAY}</a>
    </p>
  )
}
