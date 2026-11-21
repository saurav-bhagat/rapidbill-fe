import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/auth/session'
import { errorText } from '@/lib/errors'
import { formatINR } from '@/lib/format'
import { discardEntry, isVoucherEntry, listOutbox, renumberEntry, retryEntry, type OutboxEntry } from '@/offline/outbox'
import { discardRecord, renameRecord, useExisting } from '@/offline/records'
import { useSync } from '@/offline/state'
import { currentMirror, syncNow } from '@/offline/sync'
import { AppError } from '@/services/errors'
import { toast } from '@/store/toast'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { Input } from '../ui/Field'
import { Modal } from '../ui/Modal'

const CLASH = ['itemCodeUsedBy', 'itemCodeUsed', 'partyNameTaken']

/** Things the server refused while syncing: bills, and items or parties made here. Each can be sent again, fixed, or discarded. */
export function NeedsAttention({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const failedIds = useSync((s) => s.failedIds)
  const [rows, setRows] = useState<OutboxEntry[]>([])
  const [discarding, setDiscarding] = useState<OutboxEntry>()
  const [renaming, setRenaming] = useState<{ id: string; value: string }>()
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')

  useEffect(() => { if (open) void listOutbox(currentMirror()).then((all) => setRows(all.filter((e) => e.status === 'failed'))) }, [open, failedIds])
  useEffect(() => { if (open && failedIds.length === 0) onClose() }, [open, failedIds, onClose])

  const owner = () => { const { user, workspace } = useAuth.getState(); return { workspaceId: workspace!.id, userId: user!.id } }
  const run = async (fn: () => Promise<void>, done: string) => {
    setBusy(true); setProblem('')
    try { await fn(); toast.success(t(done)); await syncNow() } catch (e) { const m = errorText(t, e); setProblem(m); toast.error(m) } finally { setBusy(false) }
  }
  const label = (e: OutboxEntry) => (e.kind === 'item' ? t('sync.dlg.itemLabel') : e.kind === 'party' ? t('sync.dlg.partyLabel') : t('sync.dlg.billLabel'))

  return (
    <>
      <Modal open={open} onClose={onClose} title={t('sync.dlg.title')} width="640px" footer={<Button onClick={onClose}>{t('actions.close')}</Button>}>
        <p className="mb-3 text-ink-600">{t('sync.dlg.intro')}</p>
        {problem && <p role="alert" className="mb-3 text-sm text-danger">{problem}</p>}
        {rows.length === 0 && <p className="text-ink-400">{t('sync.dlg.empty')}</p>}
        <ul className="space-y-3">
          {rows.map((e) => (
            <li key={e.id} className="rounded border border-line p-3">
              <div className="flex items-baseline justify-between gap-3">
                <span><span className="mr-2 text-xs uppercase text-ink-400">{label(e)}</span><span className="font-mono font-medium">{e.number}</span></span>
                <span className="text-ink-600">{isVoucherEntry(e) ? `${e.partyName} · ${formatINR(e.total)}` : e.partyName}</span>
              </div>
              {e.error && <p className="mt-1 text-sm text-danger">{t('sync.dlg.reason')}: {errorText(t, new AppError(e.error.key, e.error.params))}</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                <Button disabled={busy} onClick={() => run(() => retryEntry(currentMirror(), e.id), 'sync.done.retry')}>{t('sync.dlg.retry')}</Button>
                {isVoucherEntry(e) && e.error?.key === 'duplicateNumber' && <Button disabled={busy} onClick={() => run(() => renumberEntry(currentMirror(), owner(), e.id), 'sync.done.renumber')}>{t('sync.dlg.renumber')}</Button>}
                {!isVoucherEntry(e) && e.error && CLASH.includes(e.error.key) && (
                  <>
                    <Button disabled={busy} onClick={() => run(() => useExisting(currentMirror(), e.id), 'sync.done.useExisting')}>{t('sync.dlg.useExisting')}</Button>
                    <Button disabled={busy} onClick={() => setRenaming({ id: e.id, value: e.number })}>{t('sync.dlg.rename')}</Button>
                  </>
                )}
                <Button variant="danger" disabled={busy} onClick={() => setDiscarding(e)}>{t('sync.dlg.discard')}</Button>
              </div>
              {renaming?.id === e.id && (
                <form className="mt-2 flex gap-2" onSubmit={(ev) => { ev.preventDefault(); const r = renaming; setRenaming(undefined); void run(() => renameRecord(currentMirror(), r.id, r.value), 'sync.done.rename') }}>
                  <Input autoFocus aria-label={t('sync.dlg.newValue')} value={renaming.value} onChange={(ev) => setRenaming({ id: e.id, value: ev.target.value })} />
                  <Button type="submit" variant="primary" disabled={busy || !renaming.value.trim()}>{t('sync.dlg.renameSend')}</Button>
                </form>
              )}
              {isVoucherEntry(e) && e.error?.key === 'duplicateNumber' && <p className="mt-1 text-sm text-ink-400">{t('sync.dlg.renumberHint')}</p>}
              {!isVoucherEntry(e) && e.error && CLASH.includes(e.error.key) && <p className="mt-1 text-sm text-ink-400">{t('sync.dlg.useExistingHint')}</p>}
            </li>
          ))}
        </ul>
      </Modal>
      <ConfirmDialog open={!!discarding} danger title={t('sync.dlg.discard')} confirmLabel={t('sync.dlg.discard')} onCancel={() => setDiscarding(undefined)}
        onConfirm={() => {
          const e = discarding; setDiscarding(undefined)
          if (e) void run(() => (isVoucherEntry(e) ? discardEntry(currentMirror(), owner(), e.id) : discardRecord(currentMirror(), e.id)), 'sync.done.discard')
        }}>
        {discarding && isVoucherEntry(discarding) ? t('sync.dlg.discardConfirm') : t('sync.dlg.discardRecordConfirm')}
      </ConfirmDialog>
    </>
  )
}
