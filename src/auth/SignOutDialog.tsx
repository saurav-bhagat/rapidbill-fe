import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { downloadBackup } from '@/offline/backup'
import { openMirror } from '@/offline/db'
import { unsentTotal, useDevices } from '@/offline/devices'
import { currentMirror } from '@/offline/sync'
import { useAuth } from './session'

/** Bills not yet sent in every business of this device, per business, and signing out anyway. */
export const useUnsentEverywhere = () => useDevices((s) => unsentTotal(s.all))

export function SignOutDialog({ open, onCancel, onConfirm }: { open: boolean; onCancel: () => void; onConfirm: () => void }) {
  const { t } = useTranslation('auth')
  const { t: tc } = useTranslation('common')
  const all = useDevices((s) => s.all)
  const open_ = useAuth((s) => s.workspace?.id)
  const rows = Object.entries(all).filter(([, b]) => b.pending + b.failed > 0)
  const total = unsentTotal(all)
  const backup = async (id: string) => {
    if (id === open_) { await downloadBackup(currentMirror(), id); return }
    const m = await openMirror(id)
    try { await downloadBackup(m, id) } finally { m.close() }
  }
  return (
    <ConfirmDialog open={open} danger title={t('logoutWarn.title')} confirmLabel={t('logoutWarn.confirm')} onCancel={onCancel} onConfirm={onConfirm}>
      <p>{t('logoutWarn.body', { count: total })}</p>
      <ul className="mt-3 space-y-2">
        {rows.map(([id, b]) => (
          <li key={id} className="flex items-center justify-between gap-3 rounded-md border border-line p-2">
            <span className="min-w-0"><span className="block truncate font-medium">{b.name || id}</span><span className="text-sm text-ink-600">{t('logoutWarn.perBusiness', { count: b.pending + b.failed })}</span></span>
            <Button onClick={() => void backup(id)} aria-label={`${tc('device.download')}: ${b.name}`}>{tc('device.download')}</Button>
          </li>
        ))}
      </ul>
    </ConfirmDialog>
  )
}
