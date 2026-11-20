import { CloudOff, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { applyUpdate } from '@/offline/register'
import { useSync } from '@/offline/state'
import { apiEnabled } from '@/services/http/client'

/** Top-bar pill: offline, syncing, or a new app version waiting. Nothing is shown while everything is normal. */
export function SyncStatus() {
  const { t } = useTranslation()
  const { online, syncing, lastSyncAt, updateReady } = useSync()
  if (!apiEnabled) return null
  const time = lastSyncAt ? new Date(lastSyncAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
  return (
    <div className="flex items-center gap-2">
      {updateReady && (
        <button onClick={applyUpdate} title={t('sync.updateHint')} className="flex h-8 items-center gap-1 rounded bg-primary px-2 text-sm font-medium text-white hover:bg-primary-hover">
          <RefreshCw size={14} />{t('sync.updateReady')}
        </button>
      )}
      {!online ? (
        <span role="status" title={t('sync.offlineHint')} className="flex h-8 items-center gap-1 rounded border border-line bg-warn-soft px-2 text-sm font-medium text-warn">
          <CloudOff size={14} />{t('sync.offline')}{time && <span className="hidden font-normal xl:inline"> · {t('sync.lastSynced', { time })}</span>}
        </span>
      ) : syncing ? (
        <span role="status" className="flex h-8 items-center gap-1 text-sm text-ink-400"><RefreshCw size={14} className="animate-spin" />{t('sync.syncing')}</span>
      ) : null}
    </div>
  )
}
