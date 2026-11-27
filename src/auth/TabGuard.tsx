import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { tokens } from '@/services/http/client'
import { onTabSwitch } from './switchBusiness'

/**
 * All tabs share one login, so opening another business in one tab moves the login to it. A tab still showing the old business
 * would then send its requests with the wrong business and be refused. So it stops and asks the person to follow.
 */
export function TabGuard() {
  const { t } = useTranslation('auth')
  const [other, setOther] = useState<string>()
  useEffect(() => onTabSwitch((m) => { if (m.workspaceId !== tokens.businessId()) setOther(m.name) }), [])
  if (!other) return null
  return (
    <div role="alertdialog" aria-modal="true" aria-labelledby="tab-switched-title" className="fixed inset-0 z-[100] grid place-items-center bg-black/50 p-4">
      <div className="w-full max-w-md space-y-3 rounded-xl bg-surface p-6 shadow-float">
        <h2 id="tab-switched-title" className="text-lg font-medium">{t('tabSwitched.title', { name: other })}</h2>
        <p className="text-ink-600">{t('tabSwitched.body', { name: other })}</p>
        <Button variant="primary" autoFocus onClick={() => window.location.reload()}>{t('tabSwitched.action', { name: other })}</Button>
      </div>
    </div>
  )
}
