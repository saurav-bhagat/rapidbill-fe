import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/auth/session'
import { errorText } from '@/lib/errors'
import { downloadBackup, parseBackup, restoreBackup } from '@/offline/backup'
import { useSync } from '@/offline/state'
import { currentMirror, syncNow } from '@/offline/sync'
import { toast } from '@/store/toast'
import { Button } from '../ui/Button'

/** Settings block: bills not yet sent, a backup download and restore, and whether the browser protects this data. */
export function DeviceData() {
  const { t } = useTranslation()
  const ws = useAuth((s) => s.workspace?.id)
  const waiting = useSync((s) => s.pendingIds.length + s.failedIds.length)
  const [persisted, setPersisted] = useState<boolean>()
  const pick = useRef<HTMLInputElement>(null)
  useEffect(() => { void navigator.storage?.persisted?.().then(setPersisted).catch(() => undefined) }, [])
  if (!ws) return null

  const restore = async (file: File) => {
    try {
      const r = await restoreBackup(currentMirror(), ws, parseBackup(await file.text()))
      toast.success(t('device.restored', r))
      void syncNow()
    } catch (e) { toast.error(errorText(t, e)) }
  }

  return (
    <div className="col-span-2 space-y-3">
      <p className="text-sm text-ink-600">{t('device.body')}</p>
      <p className="font-medium">{waiting > 0 ? t('device.waiting', { count: waiting }) : t('device.none')}</p>
      <div className="flex flex-wrap gap-3">
        <Button disabled={waiting === 0} onClick={() => void downloadBackup(currentMirror(), ws)}>{t('device.download')}</Button>
        <Button onClick={() => pick.current?.click()}>{t('device.restore')}</Button>
        <input ref={pick} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void restore(f) }} />
      </div>
      {persisted !== undefined && (
        <p className={`text-sm ${persisted ? 'text-ink-600' : 'text-warn'}`}><span className="font-medium">{t('device.protect')}:</span> {persisted ? t('device.protectOn') : t('device.protectOff')}</p>
      )}
    </div>
  )
}
