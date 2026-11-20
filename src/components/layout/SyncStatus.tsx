import { useState } from 'react'
import { CloudOff, RefreshCw, TriangleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { applyUpdate } from '@/offline/register'
import { useSync } from '@/offline/state'
import { apiEnabled } from '@/services/http/client'
import { NeedsAttention } from './NeedsAttention'

/** Top-bar status: offline, bills waiting, bills needing attention, syncing, or a new app version. Nothing is shown when all is normal. */
export function SyncStatus() {
  const { t } = useTranslation()
  const { online, syncing, lastSyncAt, updateReady, pendingIds, failedIds } = useSync()
  const [open, setOpen] = useState(false)
  if (!apiEnabled) return null
  const time = lastSyncAt ? new Date(lastSyncAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
  const waiting = pendingIds.length
  return (
    <div className="flex items-center gap-2">
      {updateReady && (
        <button onClick={applyUpdate} title={t('sync.updateHint')} className="flex h-8 items-center gap-1 rounded bg-primary px-2 text-sm font-medium text-white hover:bg-primary-hover">
          <RefreshCw size={14} />{t('sync.updateReady')}
        </button>
      )}
      {failedIds.length > 0 && (
        <button onClick={() => setOpen(true)} className="flex h-8 items-center gap-1 rounded border border-line bg-danger-soft px-2 text-sm font-medium text-danger hover:opacity-90">
          <TriangleAlert size={14} />{t('sync.attention', { count: failedIds.length })}
        </button>
      )}
      {!online ? (
        <span role="status" title={t('sync.offlineHint')} className="flex h-8 items-center gap-1 rounded border border-line bg-warn-soft px-2 text-sm font-medium text-warn">
          <CloudOff size={14} />{t('sync.offline')}
          {waiting > 0 && <span className="font-normal"> · {t('sync.waiting', { count: waiting })}</span>}
          {waiting === 0 && time && <span className="hidden font-normal xl:inline"> · {t('sync.lastSynced', { time })}</span>}
        </span>
      ) : syncing || waiting > 0 ? (
        <span role="status" className="flex h-8 items-center gap-1 text-sm text-ink-400"><RefreshCw size={14} className="animate-spin" />{waiting > 0 ? t('sync.waiting', { count: waiting }) : t('sync.syncing')}</span>
      ) : null}
      <NeedsAttention open={open} onClose={() => setOpen(false)} />
    </div>
  )
}
