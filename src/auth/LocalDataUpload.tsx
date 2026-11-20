import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { errorText } from '@/lib/errors'
import { toast } from '@/store/toast'
import { Button } from '@/components/ui/Button'
import { useAuth } from './session'
import { localCounts, uploadedFlag, uploadLocalData, type LocalCounts } from './migrate'

/** Offers a one-time copy of this browser's pre-account data into the signed-in account. */
export function LocalDataUpload({ variant }: { variant: 'banner' | 'settings' }) {
  const { t } = useTranslation('auth')
  const ws = useAuth((s) => s.workspace?.id)
  const [counts, setCounts] = useState<LocalCounts>()
  const [flag, setFlag] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { void localCounts().then(setCounts); if (ws) setFlag(uploadedFlag.get(ws)) }, [ws])
  if (!ws || !counts) return null
  const empty = counts.items + counts.parties + counts.vouchers === 0
  if (variant === 'banner' && (empty || flag)) return null
  if (variant === 'settings' && empty) return <p className="col-span-2 text-sm text-ink-600">{t('migrate.settingsNone')}</p>

  const run = async () => {
    setBusy(true); setError('')
    try {
      const r = await uploadLocalData()
      uploadedFlag.set(ws, 'done'); setFlag('done')
      toast.success(`${t('migrate.done', { ...r })} ${t('migrate.keepNote')}`)
      setTimeout(() => window.location.reload(), 1200)
    } catch (e) {
      setError(t('migrate.failed', { reason: errorText(t, e) }))
      setBusy(false)
    }
  }

  const body = (
    <>
      <p className="text-sm text-ink-600">{variant === 'banner' ? t('migrate.body', { ...counts }) : t('migrate.settingsBody')}</p>
      {variant === 'settings' && <p className="mt-1 text-sm text-ink-400">{t('migrate.body', { ...counts })} {t('migrate.settingsAgain')}</p>}
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
      <div className="mt-2 flex gap-2">
        <Button variant="primary" disabled={busy} onClick={run}>{busy ? t('migrate.uploading') : t('migrate.upload')}</Button>
        {variant === 'banner' && <Button disabled={busy} onClick={() => { uploadedFlag.set(ws, 'later'); setFlag('later') }}>{t('migrate.later')}</Button>}
      </div>
    </>
  )
  return variant === 'banner'
    ? <div className="no-print mb-4 rounded border border-line bg-surface p-4"><h2 className="font-semibold">{t('migrate.title')}</h2>{body}</div>
    : <div className="col-span-2">{body}</div>
}
