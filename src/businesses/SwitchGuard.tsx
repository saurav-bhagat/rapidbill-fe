import { useTranslation } from 'react-i18next'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { openBusiness } from './BusinessSwitcher'
import { useBusinesses } from './store'

/** "You have unsaved work": shown instead of switching, when a bill or the settings have changes that are not saved. */
export function SwitchGuard() {
  const { t } = useTranslation('business')
  const { t: tr } = useTranslation()
  const b = useBusinesses((s) => s.confirmSwitch)
  const close = () => useBusinesses.setState({ confirmSwitch: undefined })
  return (
    <ConfirmDialog open={!!b} danger title={t('unsaved.title')} confirmLabel={t('unsaved.confirm', { name: b?.name ?? '' })} onCancel={close} onConfirm={() => { const x = b; close(); if (x) void openBusiness(x, tr, true) }}>
      {t('unsaved.body', { name: b?.name ?? '' })}
    </ConfirmDialog>
  )
}
