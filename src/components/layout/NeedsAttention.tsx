import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/auth/session'
import { errorText } from '@/lib/errors'
import { formatINR } from '@/lib/format'
import { discardEntry, listOutbox, renumberEntry, retryEntry, type OutboxEntry } from '@/offline/outbox'
import { useSync } from '@/offline/state'
import { currentMirror, syncNow } from '@/offline/sync'
import { AppError } from '@/services/errors'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { Modal } from '../ui/Modal'

/** Bills the server refused while syncing. Each one can be sent again, given a new number, or discarded. */
export function NeedsAttention({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const failedIds = useSync((s) => s.failedIds)
  const [rows, setRows] = useState<OutboxEntry[]>([])
  const [discarding, setDiscarding] = useState<OutboxEntry>()
  const [busy, setBusy] = useState(false)

  useEffect(() => { if (open) void listOutbox(currentMirror()).then((all) => setRows(all.filter((e) => e.status === 'failed'))) }, [open, failedIds])
  useEffect(() => { if (open && failedIds.length === 0) onClose() }, [open, failedIds, onClose])

  const owner = () => { const { user, workspace } = useAuth.getState(); return { workspaceId: workspace!.id, userId: user!.id } }
  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); await syncNow() } finally { setBusy(false) } }

  return (
    <>
      <Modal open={open} onClose={onClose} title={t('sync.dlg.title')} width="640px" footer={<Button onClick={onClose}>{t('actions.close')}</Button>}>
        <p className="mb-3 text-ink-600">{t('sync.dlg.intro')}</p>
        {rows.length === 0 && <p className="text-ink-400">{t('sync.dlg.empty')}</p>}
        <ul className="space-y-3">
          {rows.map((e) => (
            <li key={e.id} className="rounded border border-line p-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-mono font-medium">{e.number}</span>
                <span className="text-ink-600">{e.partyName} · {formatINR(e.total)}</span>
              </div>
              {e.error && <p className="mt-1 text-sm text-danger">{t('sync.dlg.reason')}: {errorText(t, new AppError(e.error.key, e.error.params))}</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                <Button disabled={busy} onClick={() => run(() => retryEntry(currentMirror(), e.id))}>{t('sync.dlg.retry')}</Button>
                {e.error?.key === 'duplicateNumber' && <Button disabled={busy} onClick={() => run(() => renumberEntry(currentMirror(), owner(), e.id))}>{t('sync.dlg.renumber')}</Button>}
                <Button variant="danger" disabled={busy} onClick={() => setDiscarding(e)}>{t('sync.dlg.discard')}</Button>
              </div>
              {e.error?.key === 'duplicateNumber' && <p className="mt-1 text-sm text-ink-400">{t('sync.dlg.renumberHint')}</p>}
            </li>
          ))}
        </ul>
      </Modal>
      <ConfirmDialog open={!!discarding} danger title={t('sync.dlg.discard')} confirmLabel={t('sync.dlg.discard')} onCancel={() => setDiscarding(undefined)}
        onConfirm={() => { const e = discarding; setDiscarding(undefined); if (e) void run(() => discardEntry(currentMirror(), owner(), e.id)) }}>
        {t('sync.dlg.discardConfirm')}
      </ConfirmDialog>
    </>
  )
}
