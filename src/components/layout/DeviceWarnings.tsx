import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/auth/session'
import { downloadBackup } from '@/offline/backup'
import { useSync } from '@/offline/state'
import { currentMirror } from '@/offline/sync'
import { apiEnabled } from '@/services/http/client'
import { Button } from '../ui/Button'

const STALE_AFTER_MS = 4 * 60 * 60 * 1000 // bills waiting this long get a backup reminder
const CLOCK_OFF_MS = 10 * 60 * 1000

/** Banners for things that quietly cause trouble: bills waiting a long time, and a device clock that is wrong. */
export function DeviceWarnings() {
  const { t } = useTranslation()
  const { pendingIds, oldestWaiting, clockSkewMs } = useSync()
  const ws = useAuth((s) => s.workspace?.id)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(id) }, [])
  if (!apiEnabled) return null

  const stale = pendingIds.length > 0 && oldestWaiting !== null && now - Date.parse(oldestWaiting) > STALE_AFTER_MS
  const skew = clockSkewMs !== null && Math.abs(clockSkewMs) > CLOCK_OFF_MS ? clockSkewMs : null
  if (!stale && skew === null) return null
  return (
    <div className="no-print mb-3 space-y-2">
      {stale && ws && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded border border-line bg-warn-soft px-3 py-2 text-warn">
          <span>{t('sync.stale', { count: pendingIds.length, time: new Date(oldestWaiting!).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) })}</span>
          <Button onClick={() => void downloadBackup(currentMirror(), ws)}>{t('sync.staleBtn')}</Button>
        </div>
      )}
      {skew !== null && (
        <div role="alert" className="rounded border border-line bg-warn-soft px-3 py-2 text-warn">
          {t('sync.clock', { minutes: Math.round(Math.abs(skew) / 60000), dir: skew < 0 ? t('sync.clockAhead') : t('sync.clockBehind') })}
        </div>
      )}
    </div>
  )
}
